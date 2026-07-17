param(
    [string]$EnvFile = ".env.uat.local",
    [switch]$FullNegativeIdentityGate
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile
} else {
    Join-Path $workspace $EnvFile
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Khong tim thay $envPath. Sao chep .env.uat.example thanh .env.uat.local va dien token UAT."
}

$required = @(
    "UAT_API_EXECUTE_URL",
    "UAT_API_LIST_URL",
    "UAT_API_CONFIG_URL",
    "UAT_MANAGER_TOKEN",
    "UAT_TDV_TOKEN"
)
if ($FullNegativeIdentityGate) {
    $required += @("UAT_UNMAPPED_TOKEN", "UAT_NO_SCOPE_TOKEN")
}
$loaded = @{}

foreach ($line in Get-Content -LiteralPath $envPath -Encoding utf8) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $name = $matches[1]
    $value = $matches[2].Trim().Trim('"').Trim("'")
    if ($required -contains $name) { $loaded[$name] = $value }
}

$missing = $required | Where-Object { -not $loaded.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($loaded[$_]) }
if ($missing.Count -gt 0) {
    throw "Thieu bien UAT: $($missing -join ', ')"
}

foreach ($urlName in @("UAT_API_EXECUTE_URL", "UAT_API_LIST_URL", "UAT_API_CONFIG_URL")) {
    $uri = [System.Uri]$loaded[$urlName]
    $isLocal = $uri.Host -in @("localhost", "127.0.0.1")
    $isDedicatedUatWebhook = $uri.AbsolutePath.StartsWith("/webhook/uat-p005-", [System.StringComparison]::OrdinalIgnoreCase) -or
        $uri.AbsolutePath.StartsWith("/webhook-test/uat-p005-", [System.StringComparison]::OrdinalIgnoreCase)
    if (-not ($isLocal -and $isDedicatedUatWebhook)) {
        throw "$urlName phai la webhook UAT p005 tren localhost; runner khong duoc phep goi production."
    }
}

try {
    foreach ($name in $required) {
        Set-Item -Path "Env:$name" -Value $loaded[$name]
    }
    Push-Location $workspace
    if ($FullNegativeIdentityGate) {
        npm.cmd run test:chatbot-auth-regression
    } else {
        npm.cmd run test:chatbot-auth-regression -- --role-only
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location -ErrorAction SilentlyContinue
    foreach ($name in $required) {
        Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    }
}
