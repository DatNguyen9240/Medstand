@echo off
set "PATH=c:\Git cua tui\Medstand\n8n-system\node-v22.14.0-win-x64;c:\Git cua tui\Medstand\n8n-system\n8n_data\npm_global;%PATH%"
set "N8N_USER_FOLDER=c:\Git cua tui\Medstand\n8n-system\n8n_data"
"c:\Git cua tui\Medstand\n8n-system\node-v22.14.0-win-x64\node.exe" "c:\Git cua tui\Medstand\n8n-system\n8n_data\npm_global\node_modules\n8n\bin\n8n" import:workflow --input="c:\Git cua tui\Medstand\n8n-system\n8n\K0_MetaAPI.json"
