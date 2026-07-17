param([string]$EnvFile = ".env.uat.local")
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$values = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $workspace $EnvFile) -Encoding utf8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}
$url = $values.UAT_API_CONFIG_URL
$token = $values.UAT_MANAGER_TOKEN
$uri = [Uri]$url
if ($uri.Host -notin @('localhost', '127.0.0.1') -or -not $uri.AbsolutePath.StartsWith('/webhook/uat-p005-')) {
    throw 'P1-02 runner only permits local UAT webhook.'
}

$cases = @(
    @{ apiCode='@cong_no_chi_tiet'; field='@MaKhachHang' },
    @{ apiCode='@hoa_don_chi_tiet'; field='@DocumentID' },
    @{ apiCode='@khao_sat360'; field='@ObjectID' }
)
$results = @()
foreach ($case in $cases) {
    $body = Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization="Bearer $token"; Origin='https://medtest.bms79.com' } -ContentType 'application/json' -Body (@{ApiCode=$case.apiCode}|ConvertTo-Json) -TimeoutSec 30
    $field = @($body.filters | Where-Object FieldCode -eq $case.field)[0]
    $pass = $body.contract.version -eq '2026.07.15.1' -and
        $body.contract.checksum -match '^[A-F0-9]{64}$' -and
        $field.Required -eq $true -and $field.IsRequired -eq 1 -and
        $field.SourceOfTruth -and $field.ValidationRule
    $results += [pscustomobject]@{
        apiCode=$case.apiCode; field=$case.field; version=$body.contract.version
        checksumPresent=[bool]($body.contract.checksum -match '^[A-F0-9]{64}$')
        required=[bool]$field.Required; sourceOfTruth=$field.SourceOfTruth
        validationRule=$field.ValidationRule; result=if($pass){'PASS'}else{'FAIL'}
    }
}
$report = Join-Path $workspace 'reports/p1-02-uat-result.json'
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $report -Encoding utf8
$results | Format-Table -AutoSize
$failed = @($results | Where-Object result -eq 'FAIL').Count
Write-Output "summary=$($results.Count-$failed)/$($results.Count) pass"
if($failed){exit 1}
