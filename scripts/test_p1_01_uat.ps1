param([string]$EnvFile = ".env.uat.local")

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $workspace $EnvFile
if (-not (Test-Path -LiteralPath $envPath)) { throw "Khong tim thay $envPath" }

$values = @{}
foreach ($line in Get-Content -LiteralPath $envPath -Encoding utf8) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

$url = $values['UAT_API_EXECUTE_URL']
$token = $values['UAT_MANAGER_TOKEN']
if (-not $url -or -not $token) { throw 'Thieu UAT_API_EXECUTE_URL hoac UAT_MANAGER_TOKEN' }
$uri = [Uri]$url
if ($uri.Host -notin @('localhost', '127.0.0.1') -or -not $uri.AbsolutePath.StartsWith('/webhook/uat-p005-')) {
    throw 'Runner P1-01 chi duoc goi webhook UAT tren localhost.'
}

$cases = @(
    @{ apiCode = '@cham_diem_kh'; expectation = 'legacy-empty' },
    @{ apiCode = '@doanh_so'; expectation = 'legacy-empty' },
    @{ apiCode = '@goi_ydon_hang'; expectation = 'legacy-empty' },
    @{ apiCode = '@hoa_don'; expectation = 'legacy-empty' },
    @{ apiCode = '@tich_luy'; expectation = 'legacy-empty' },
    @{ apiCode = '@tuyen_ban_hang'; expectation = 'legacy-empty' },
    @{ apiCode = '@cong_no_chi_tiet'; expectation = 'validation' },
    @{ apiCode = '@hoa_don_chi_tiet'; expectation = 'validation' },
    @{ apiCode = '@khao_sat360'; expectation = 'validation' }
)
$results = @()
foreach ($case in $cases) {
    $apiCode = $case.apiCode
    $status = 0
    $body = $null
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -Headers @{
            Authorization = "Bearer $token"
            Origin = 'https://medtest.bms79.com'
        } -ContentType 'application/json' -Body (@{ ApiCode = $apiCode; params = @{} } | ConvertTo-Json -Depth 5) -TimeoutSec 30
        $status = [int]$response.StatusCode
        $body = $response.Content | ConvertFrom-Json
    } catch {
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($_.ErrorDetails.Message) {
            try { $body = $_.ErrorDetails.Message | ConvertFrom-Json } catch { $body = $null }
        }
    }

    $fields = @('success', 'code', 'message', 'data', 'count', 'requestId')
    $hasEnvelope = $body -and (($fields | Where-Object { $body.PSObject.Properties.Name -notcontains $_ }).Count -eq 0)
    $dataCount = if ($body -and $null -ne $body.data) { @($body.data).Count } else { -1 }
    if ($case.expectation -eq 'validation') {
        $pass = $hasEnvelope -and $body.success -eq $false -and $body.count -eq 0 -and $dataCount -eq 0 -and $body.code -eq 'VALIDATION_ERROR'
    } else {
        $validSuccess = $body.success -eq $true -and $body.code -in @('OK', 'NO_DATA', 'INFO') -and $body.count -eq $dataCount
        $validFailure = $body.success -eq $false -and $body.count -eq 0 -and $dataCount -eq 0
        $pass = $hasEnvelope -and ($validSuccess -or $validFailure)
    }
    $results += [pscustomobject]@{
        apiCode = $apiCode
        expectation = $case.expectation
        status = $status
        code = if ($body) { $body.code } else { $null }
        count = if ($body) { $body.count } else { $null }
        dataCount = $dataCount
        envelope = [bool]$hasEnvelope
        result = if ($pass) { 'PASS' } else { 'FAIL' }
    }
}

$reportPath = Join-Path $workspace 'reports/p1-01-uat-result.json'
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8
$results | Format-Table -AutoSize
$failed = @($results | Where-Object result -eq 'FAIL').Count
Write-Output "summary=$($results.Count - $failed)/$($results.Count) pass"
if ($failed -gt 0) { exit 1 }
