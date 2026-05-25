# 0. Determine dynamic paths relative to this script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($scriptDir)) { $scriptDir = $PSScriptRoot }

$env:N8N_USER_FOLDER = "$scriptDir\n8n_data"
$env:PATH = "$scriptDir\n8n_data\npm_global;" + $env:PATH
$env:PM2_HOME = "$scriptDir\n8n_data\.pm2"

Write-Host "--- RESTARTING N8N SERVICES VIA PM2 ---"
pm2 restart all
pm2 show n8n
