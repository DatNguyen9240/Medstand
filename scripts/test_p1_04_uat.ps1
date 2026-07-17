param([string]$EnvFile = '.env.uat.local')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$values = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $workspace $EnvFile) -Encoding utf8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
}
$token = $values.UAT_MANAGER_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Missing UAT_MANAGER_TOKEN.' }
$base = 'http://localhost:5678/webhook'
$cases = @(
    @{name='execute-guest'; path='api-execute'; token=''; body=@{ApiCode='@tuyen_ban_hang';params=@{}}; status=401; code='AUTH_TOKEN_MISSING'; operation='UNKNOWN'; tx='NOT_STARTED'},
    @{name='execute-validation'; path='api-execute'; token=$token; body=@{ApiCode='@cong_no_chi_tiet';params=@{}}; status=422; code='VALIDATION_ERROR'; operation='READ'; tx='NOT_APPLICABLE'},
    @{name='execute-success'; path='api-execute'; token=$token; body=@{ApiCode='@tuyen_ban_hang';params=@{}}; status=200; code='OK'; operation='READ'; tx='NOT_APPLICABLE'},
    @{name='execute-mutation-denied'; path='api-execute'; token=$token; idempotency='p104-cart-sandbox-001'; body=@{ApiCode='@lap_don_hang';params=@{}}; status=403; code='CAPABILITY_REQUIRED'; operation='MUTATION'; tx='NOT_STARTED'},
    @{name='list-success'; path='api-list-active'; token=$token; body=@{}; status=200; operation='CATALOG'; tx='NOT_APPLICABLE'},
    @{name='config-success'; path='api-get-config'; token=$token; body=@{ApiCode='@doanh_so'}; status=200; operation='CATALOG'; tx='NOT_APPLICABLE'}
)
$results = @()
foreach ($case in $cases) {
    $headers = @{Origin='https://medtest.bms79.com';'X-Correlation-ID'=('p104-correlation-' + $case.name)}
    if ($case.token) { $headers.Authorization = 'Bearer ' + $case.token }
    if ($case.idempotency) { $headers['Idempotency-Key'] = $case.idempotency }
    $status = 0; $body = $null; $responseHeaders = $null
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ($base + '/' + $case.path) -Method Post -Headers $headers -ContentType 'application/json' -Body ($case.body | ConvertTo-Json -Depth 8) -TimeoutSec 45
        $status = [int]$response.StatusCode; $responseHeaders = $response.Headers
        if ($response.Content) { $body = $response.Content | ConvertFrom-Json }
    } catch {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $responseHeaders = $_.Exception.Response.Headers
        }
        if ($_.ErrorDetails.Message) { try { $body = $_.ErrorDetails.Message | ConvertFrom-Json } catch {} }
    }
    $requestId = if ($body.requestId) { [string]$body.requestId } elseif ($responseHeaders) { [string]$responseHeaders['X-Request-ID'] } else { '' }
    $headerRequestId = if ($responseHeaders) { [string]$responseHeaders['X-Request-ID'] } else { '' }
    $codeOk = if ($case.code) { $body.code -eq $case.code } else { $true }
    $pass = $status -eq $case.status -and $codeOk -and $requestId -match '^req-' -and $headerRequestId -eq $requestId
    $results += [pscustomobject]@{name=$case.name;status=$status;code=$body.code;requestId=$requestId;operation=$case.operation;transactionOutcome=$case.tx;expectIdempotency=[bool]$case.idempotency;result=if($pass){'PASS'}else{'FAIL'}}
}
$report = Join-Path $workspace 'reports/p1-04-uat-result.json'
$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $report -Encoding utf8
$results | Select-Object name,status,code,requestId,result | Format-Table -AutoSize
if (@($results | Where-Object result -eq 'FAIL').Count) { exit 1 }
