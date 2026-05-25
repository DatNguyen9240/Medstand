$env:N8N_USER_FOLDER = "c:\Git cua tui\Medstand\n8n-system\n8n_data"
$env:PATH = "c:\Git cua tui\Medstand\n8n-system\n8n_data\npm_global;" + $env:PATH
$env:PM2_HOME = "c:\Git cua tui\Medstand\n8n-system\n8n_data\.pm2"

pm2 logs Medstand_N8N --lines 50
