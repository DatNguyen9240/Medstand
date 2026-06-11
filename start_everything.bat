@echo off
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
2: echo          MEDSTAND ONE-CLICK SYSTEM STARTER            
echo =======================================================
echo.
echo [SYSTEM] Dang khoi dong toan bo he thong Medstand...
echo (N8N, Redis, Qdrant, Cloudflare Tunnel, Express Gateway)
echo.

cd /d "%BASE_DIR%\n8n-system"
call start_n8n.bat
