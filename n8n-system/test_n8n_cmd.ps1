$env:N8N_USER_FOLDER = "c:\Git cua tui\Medstand\n8n-system\n8n_data"
$env:PATH = "c:\Git cua tui\Medstand\n8n-system\n8n_data\npm_global;" + $env:PATH

Write-Host "--- IMPORTING WORKFLOWS ---"
n8n import:workflow --input="c:\Git cua tui\Medstand\n8n\API_Services\API_Execute.json"
n8n import:workflow --input="c:\Git cua tui\Medstand\n8n\AI_Core\AI_Intent_Parser.json"

Write-Host "--- ACTIVATING WORKFLOWS ---"
n8n update:workflow --id=fCJwiyAT9r6eh1ys --active=true
n8n update:workflow --id=Gn7nDjDgGUFOWni5 --active=true
n8n update:workflow --id=LYMNWZxdfLbGFMWi --active=true

Write-Host "--- LISTING WORKFLOWS ---"
n8n list:workflow
