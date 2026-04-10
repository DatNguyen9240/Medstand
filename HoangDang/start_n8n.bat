@echo off
setlocal

:: Lấy đường dẫn thư mục hiện tại của file .bat (đã bỏ dấu \ ở cuối)
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo Starting Redis...
start /min "" "%BASE_DIR%\redis\redis-server.exe" "%BASE_DIR%\redis\medstand.conf"
timeout /t 2 /nobreak > nul

echo Starting Redis HTTP Proxy...
start /min "" "%BASE_DIR%\nodejs\node-v20.12.2-win-x64\node.exe" "%BASE_DIR%\redis\redis-proxy.js"
timeout /t 2 /nobreak > nul

echo Starting Qdrant Vector DB...
start /min "" "%BASE_DIR%\qdrant\qdrant.exe"
timeout /t 3 /nobreak > nul

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "%BASE_DIR%\cloudflared.exe tunnel --url http://localhost:5678"
timeout /t 2 /nobreak > nul

:: ── CORS: Cho phép chatbot widget gọi webhook từ mọi origin ──
set "N8N_CORS_ALLOWED_ORIGINS=*"
set "N8N_CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,HEAD"

set "PATH=%BASE_DIR%\nodejs22\node-v22.14.0-win-x64;%PATH%"
echo =======================================================
echo          KHOI DONG HE THONG N8N (LOCAL HOST)
echo =======================================================
echo Dang cai dat/cap nhat n8n (Neu chay lan dau se giong chut thoi gian)...
call npx -y n8n start
pause
