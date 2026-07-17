param(
    [string]$EnvFile = '.env.uat.local',
    [string]$Grep = '',
    [string]$GrepInvert = '',
    [int]$Workers = 1
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'n8n-system\.bin\node-v22.14.0-win-x64\node.exe'
$n8n = Join-Path $root 'n8n-system\.bin\node-v22.14.0-win-x64\node_modules\n8n\bin\n8n'
if (-not (Test-Path $node) -or -not (Test-Path $n8n)) { throw 'Portable n8n runtime is missing.' }
if (-not (Test-Path (Join-Path $root $EnvFile))) { throw "Missing $EnvFile." }

$env:N8N_USER_FOLDER = Join-Path $root 'n8n-system\n8n_data'
$env:NODE_PATH = Join-Path $root 'n8n-system\.bin\node-v22.14.0-win-x64\node_modules'
$env:N8N_PORT = '5678'
$env:N8N_HOST = '127.0.0.1'
$env:N8N_PROTOCOL = 'http'
$env:N8N_SECURE_COOKIE = 'false'
$env:N8N_RUNNERS_ENABLED = 'false'

$n8nProcess = $null
$frontendProcess = $null
$previousPort = $env:PORT
$previousBaseUrl = $env:E2E_BASE_URL

function Test-MedstandFrontend([int]$Port) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>Medstand</title>'
    } catch {
        return $false
    }
}

function Test-TcpPortInUse([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $Port)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Test-N8nReady {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5678/healthz' -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

try {
    if (-not (Test-N8nReady)) {
        $n8nProcess = Start-Process $node -ArgumentList ('"' + $n8n + '" start') -WorkingDirectory $root `
            -RedirectStandardOutput (Join-Path $root 'n8n-system\.logs\p2-n8n.stdout.log') `
            -RedirectStandardError (Join-Path $root 'n8n-system\.logs\p2-n8n.stderr.log') -WindowStyle Hidden -PassThru
    }
    $deadline = (Get-Date).AddSeconds(90)
    do {
        Start-Sleep -Milliseconds 500
        $log = Join-Path $root 'n8n-system\.logs\p2-n8n.stdout.log'
        $n8nReady = (Test-N8nReady) -and (Test-Path $log) -and ((Get-Content $log -Raw -ErrorAction SilentlyContinue) -match 'Activated workflow "K0-C')
    } until ($n8nReady -or (Get-Date) -gt $deadline)
    if (-not $n8nReady) { throw 'Canonical n8n workflows did not activate.' }

    $frontendPort = 3000
    if ((Test-TcpPortInUse $frontendPort) -and -not (Test-MedstandFrontend $frontendPort)) {
        $frontendPort = 3001
        while (Test-TcpPortInUse $frontendPort) {
            $frontendPort++
            if ($frontendPort -gt 3010) { throw 'No free Medstand E2E port between 3001 and 3010.' }
        }
    }

    if (-not (Test-MedstandFrontend $frontendPort)) {
        $env:PORT = [string]$frontendPort
        $frontendProcess = Start-Process (Get-Command node.exe).Source -ArgumentList 'server.js' -WorkingDirectory $root `
            -RedirectStandardOutput (Join-Path $root 'p2-fe.stdout.log') `
            -RedirectStandardError (Join-Path $root 'p2-fe.stderr.log') -WindowStyle Hidden -PassThru
    }
    $deadline = (Get-Date).AddSeconds(20)
    do { Start-Sleep -Milliseconds 300; $frontendReady = Test-MedstandFrontend $frontendPort } `
        until ($frontendReady -or (Get-Date) -gt $deadline)
    if (-not $frontendReady) { throw "Medstand frontend did not become ready on port $frontendPort." }
    $env:E2E_BASE_URL = "http://127.0.0.1:$frontendPort"

    Push-Location $root
    try {
        $playwrightArgs = @('playwright', 'test')
        if ($Grep) { $playwrightArgs += @('--grep', $Grep) }
        if ($GrepInvert) { $playwrightArgs += @('--grep-invert', $GrepInvert) }
        if ($Workers -gt 1) { $playwrightArgs += @('--workers', [string]$Workers) }
        & npx.cmd @playwrightArgs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally { Pop-Location }
}
finally {
    if ($frontendProcess -and -not $frontendProcess.HasExited) { Stop-Process $frontendProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($n8nProcess -and -not $n8nProcess.HasExited) { Stop-Process $n8nProcess.Id -Force -ErrorAction SilentlyContinue }
    $env:PORT = $previousPort
    $env:E2E_BASE_URL = $previousBaseUrl
}
