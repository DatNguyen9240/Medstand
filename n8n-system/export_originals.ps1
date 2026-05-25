$env:N8N_USER_FOLDER = "c:\Git cua tui\Medstand\n8n-system\n8n_data"
$env:PATH = "c:\Git cua tui\Medstand\n8n-system\n8n_data\npm_global;" + $env:PATH

n8n export:workflow --id=fCJwiyAT9r6eh1ys --output="c:\Git cua tui\Medstand\n8n-system\original_execute.json"
n8n export:workflow --id=Gn7nDjDgGUFOWni5 --output="c:\Git cua tui\Medstand\n8n-system\original_parser.json"
