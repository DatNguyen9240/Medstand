param([string]$EnvFile = ".env.uat.local")
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$values = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $workspace $EnvFile) -Encoding utf8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
}
$url=$values.UAT_API_EXECUTE_URL; $token=$values.UAT_MANAGER_TOKEN
$uri=[Uri]$url
if($uri.Host -notin @('localhost','127.0.0.1') -or -not $uri.AbsolutePath.StartsWith('/webhook/uat-p005-')){throw 'P1-03 runner only permits local UAT webhook.'}
$cases=@(
    @{name='missing-required'; api='@cong_no_chi_tiet'; params=@{}; status=422; code='VALIDATION_ERROR'; sqlExpected=$false},
    @{name='topn-limit'; api='@doanh_so'; params=@{'@TopN'=201}; status=422; code='VALIDATION_ERROR'; sqlExpected=$false},
    @{name='date-range'; api='@doanh_so'; params=@{'@TuNgay'='2026-07-20';'@DenNgay'='2026-07-01'}; status=422; code='VALIDATION_ERROR'; sqlExpected=$false},
    @{name='valid-read'; api='@tuyen_ban_hang'; params=@{}; status=200; code='OK'; sqlExpected=$true}
)
$results=@()
foreach($case in $cases){
    $status=0;$body=$null
    try{$r=Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -Headers @{Authorization="Bearer $token";Origin='https://medtest.bms79.com'} -ContentType 'application/json' -Body (@{ApiCode=$case.api;params=$case.params}|ConvertTo-Json -Depth 6) -TimeoutSec 30;$status=[int]$r.StatusCode;$body=$r.Content|ConvertFrom-Json}
    catch{if($_.Exception.Response){$status=[int]$_.Exception.Response.StatusCode};try{$body=$_.ErrorDetails.Message|ConvertFrom-Json}catch{}}
    $pass=$status -eq $case.status -and $body.code -eq $case.code -and $body.requestId
    $results += [pscustomobject]@{name=$case.name;status=$status;code=$body.code;requestId=$body.requestId;sqlExpected=$case.sqlExpected;result=if($pass){'PASS'}else{'FAIL'}}
}
$report=Join-Path $workspace 'reports/p1-03-uat-result.json'
$results|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $report -Encoding utf8
$results|Select-Object name,status,code,sqlExpected,result|Format-Table -AutoSize
if(@($results|Where-Object result -eq 'FAIL').Count){exit 1}
