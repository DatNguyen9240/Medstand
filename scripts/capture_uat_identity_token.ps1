param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("manager", "tdv", "unmapped", "no-scope")]
    [string]$Identity,
    [string]$Username = "",
    [string]$EnvFile = ".env.uat.local",
    [string]$PasswordEnvName = "",
    [string]$GatewayBaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$envPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $EnvFile))
$workspacePrefix = [System.IO.Path]::GetFullPath($workspace).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $envPath.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "EnvFile phai nam trong workspace."
}
if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Khong tim thay $envPath."
}

$defaultUsers = @{
    manager = "QLBH013.MED"
    tdv = "NAMDINHB.MED"
}
if ([string]::IsNullOrWhiteSpace($Username) -and $defaultUsers.ContainsKey($Identity)) {
    $Username = $defaultUsers[$Identity]
}
if ([string]::IsNullOrWhiteSpace($Username)) {
    $Username = Read-Host "Username UAT cho identity $Identity"
}
if ([string]::IsNullOrWhiteSpace($Username)) { throw "Username khong duoc rong." }

function Protect-GatewayPayload([hashtable]$Payload) {
    $json = $Payload | ConvertTo-Json -Depth 10 -Compress
    $plainBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($plainBase64)
    $cipherBytes = New-Object byte[] $plainBytes.Length
    for ($i = 0; $i -lt $plainBytes.Length; $i++) {
        $cipherBytes[$i] = $plainBytes[$i] -bxor 107
    }
    return [Convert]::ToBase64String($cipherBytes)
}

function Unprotect-GatewayPayload([string]$CipherText) {
    $cipherBytes = [Convert]::FromBase64String($CipherText)
    $plainBytes = New-Object byte[] $cipherBytes.Length
    for ($i = 0; $i -lt $cipherBytes.Length; $i++) {
        $plainBytes[$i] = $cipherBytes[$i] -bxor 107
    }
    $plainBase64 = [Text.Encoding]::UTF8.GetString($plainBytes)
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($plainBase64))
}

function Invoke-Gateway([string]$Endpoint, [hashtable]$Body, [string]$Token = "") {
    $payload = Protect-GatewayPayload @{ method = "POST"; endpoint = $Endpoint; body = $Body }
    $headers = @{ "Content-Type" = "application/json" }
    if (-not [string]::IsNullOrWhiteSpace($Token)) { $headers.Authorization = "Bearer $Token" }
    $response = Invoke-RestMethod -Method Post -Uri "$($GatewayBaseUrl.TrimEnd('/'))/api/gateway" `
        -Headers $headers -Body (@{ data = $payload } | ConvertTo-Json -Compress) -TimeoutSec 30
    if (-not $response.data) { throw "Gateway response khong hop le." }
    return (Unprotect-GatewayPayload $response.data) | ConvertFrom-Json
}

$plainPassword = ""
$passwordPointer = [IntPtr]::Zero
try {
    if (-not [string]::IsNullOrWhiteSpace($PasswordEnvName)) {
        $plainPassword = [Environment]::GetEnvironmentVariable($PasswordEnvName, "Process")
        if ([string]::IsNullOrWhiteSpace($plainPassword)) {
            throw "Bien moi truong $PasswordEnvName dang rong."
        }
    } else {
        $securePassword = Read-Host "Password UAT cho $Username" -AsSecureString
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    }
    $login = Invoke-Gateway "/api/login" @{ username = $Username; password = $plainPassword }
    if ($login.code -ne 0 -or [string]::IsNullOrWhiteSpace($login.access_token)) {
        throw ($login.msg | ForEach-Object { if ($_ ) { $_ } else { "Dang nhap that bai." } })
    }
    $token = [string]$login.access_token
    $profile = Invoke-Gateway "/api/API_UserInfo" @{} $token
    $record = if ($profile.records -and $profile.records.Count -gt 0) { $profile.records[0] } else { $null }
    if (-not $record -and $Identity -ne "unmapped") {
        throw "Token hop le nhung API_UserInfo khong tra identity mapping."
    }
    if ($record -and $Identity -eq "unmapped") {
        throw "Tai khoan unmapped lai co identity mapping; khong luu token sai loai."
    }

    $capabilityValue = if ($record) { $record.capabilities } else { $null }
    if (-not $capabilityValue -and $record) { $capabilityValue = $record.Capabilities }
    if (-not $capabilityValue -and $record) { $capabilityValue = $record.permissions }
    $capabilities = if ($capabilityValue -is [array]) {
        @($capabilityValue)
    } elseif ([string]::IsNullOrWhiteSpace([string]$capabilityValue)) {
        @()
    } else {
        @(([string]$capabilityValue).Split(',') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }

    $managerMarker = if ($null -ne $record.Manager) { $record.Manager } elseif ($null -ne $record.IsManager) { $record.IsManager } else { $null }
    $hasBusinessRoleMarker = $managerMarker -in @(0, 1, "0", "1", $false, $true)
    if ($capabilities.Count -eq 0 -and $hasBusinessRoleMarker) {
        $capabilities = @("api.read")
    }

    if ($Identity -in @("manager", "tdv") -and $capabilities.Count -eq 0) {
        $roleCode = if ($record.roleCode) { $record.roleCode } elseif ($record.RoleCode) { $record.RoleCode } else { "missing" }
        $userGroup = if ($record.UserGroupID) { $record.UserGroupID } elseif ($record.UserGroup) { $record.UserGroup } else { "missing" }
        $managerFlag = if ($null -ne $record.Manager) { $record.Manager } elseif ($null -ne $record.IsManager) { $record.IsManager } else { "missing" }
        throw "API_UserInfo khong tra capability cho identity $Identity (roleCode=$roleCode, userGroup=$userGroup, manager=$managerFlag); khong luu token chua dat Security Gate."
    }
    if ($Identity -eq "no-scope" -and $capabilities.Count -ne 0) {
        throw "Tai khoan no-scope dang co capability; khong luu token sai loai."
    }

    $envNames = @{
        manager = "UAT_MANAGER_TOKEN"
        tdv = "UAT_TDV_TOKEN"
        unmapped = "UAT_UNMAPPED_TOKEN"
        "no-scope" = "UAT_NO_SCOPE_TOKEN"
    }
    $targetName = $envNames[$Identity]
    $lines = @(Get-Content -LiteralPath $envPath -Encoding utf8)
    $replaced = $false
    $lines = @($lines | ForEach-Object {
        if ($_ -match "^$([regex]::Escape($targetName))=") {
            $replaced = $true
            "$targetName=$token"
        } else { $_ }
    })
    if (-not $replaced) { $lines += "$targetName=$token" }
    Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8

    $mappedUser = if ($record) { $record.username } else { "unmapped" }
    if (-not $mappedUser -and $record) { $mappedUser = $record.UserName }
    Write-Output "Da luu token $Identity cho user $mappedUser; capability count: $($capabilities.Count)."
} finally {
    $plainPassword = $null
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
}
