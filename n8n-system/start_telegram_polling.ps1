$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$nodeExe = Join-Path $scriptDir '.bin\node-v22.14.0-win-x64\node.exe'
$pm2Cmd = Join-Path $scriptDir 'n8n_data\npm_global\pm2.cmd'
$ecosystem = Join-Path $scriptDir 'ecosystem.config.js'

foreach ($requiredPath in @($nodeExe, $pm2Cmd, $ecosystem)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Missing runtime dependency: $requiredPath"
    }
}

$env:N8N_USER_FOLDER = Join-Path $scriptDir 'n8n_data'
$env:PM2_HOME = Join-Path $env:N8N_USER_FOLDER '.pm2'
$env:PM2_RPC_PORT = '//./pipe/rpc_n8n_medstand'
$env:PM2_PUB_PORT = '//./pipe/pub_n8n_medstand'
$env:PM2_INTERACT_PORT = '//./pipe/interact_n8n_medstand'
$env:N8N_HOST = '127.0.0.1'
$env:N8N_LISTEN_ADDRESS = '127.0.0.1'
$env:N8N_PORT = '5678'

Push-Location $rootDir
try {
    & $pm2Cmd start $ecosystem --only Medstand_N8N --update-env
    if ($LASTEXITCODE -ne 0) { throw 'Could not start local n8n.' }

    & $pm2Cmd start $ecosystem --only Medstand_TelegramPoller --update-env
    if ($LASTEXITCODE -ne 0) { throw 'Could not start Telegram poller.' }

    & $pm2Cmd save | Out-Null
    Write-Host '[OK] n8n is local-only on http://127.0.0.1:5678'
    Write-Host '[OK] Telegram polling bridge is running without a public tunnel.'
} finally {
    Pop-Location
}
