@echo off
setlocal EnableDelayedExpansion

:: 1. Xác định đường dẫn gốc tuyệt đối an toàn cho Portable, bỏ dấu \ ở cuối
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
echo          MEDSTAND N8N PORTABLE BOOTSTRAPPER            
echo =======================================================

:: ============================================================
:: 2. CẤU HÌNH NODE.JS PORTABLE (TẢI + GIẢI NÉN BẰNG TAR CHỐNG PATH DÀI)
:: ============================================================
set "NODE_VERSION=22.14.0"
set "NODE_DIR=%BASE_DIR%\node-v%NODE_VERSION%-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "npm_cmd=%NODE_DIR%\npm.cmd"
set "npx_cmd=%NODE_DIR%\npx.cmd"
set "NODE_ZIP=%BASE_DIR%\node-v%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"

if exist "%NODE_EXE%" goto SKIP_NODE_SETUP
echo.
echo [SETUP] Phat hien thieu Node.js hoac bi an mon.
echo [SETUP] Tai han ban Portable moi de tiep tuc setup...

if exist "%NODE_ZIP%" goto SKIP_NODE_DOWNLOAD
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing"

:SKIP_NODE_DOWNLOAD
if not exist "%NODE_ZIP%" (
    echo [ERROR] Tai Node.js that bai! Vui long kiem tra lai ket noi mang.
    pause
    exit /b 1
)

echo [SETUP] Giai nen sieu toc (tar.exe)...
tar -xf "%NODE_ZIP%" -C "%BASE_DIR%"
del /f /q "%NODE_ZIP%" 2>nul

:SKIP_NODE_SETUP
:: Ep Node.js vao duong dan chay cua Terminal hien tai
set "PATH=%NODE_DIR%;%PATH%"

:: ============================================================
:: 3. ÉP CHẾ ĐỘ PORTABLE 100% CHO NPM + N8N 
:: ============================================================
set "N8N_USER_FOLDER=%BASE_DIR%\n8n_data"
set "NPM_GLOBAL_DIR=%N8N_USER_FOLDER%\npm_global"
set "NPM_CACHE_DIR=%N8N_USER_FOLDER%\npm_cache"

if not exist "%NPM_GLOBAL_DIR%" mkdir "%NPM_GLOBAL_DIR%"
if not exist "%NPM_CACHE_DIR%" mkdir "%NPM_CACHE_DIR%"

set "npm_config_prefix=%NPM_GLOBAL_DIR%"
set "npm_config_cache=%NPM_CACHE_DIR%"
set "PATH=%NPM_GLOBAL_DIR%;%PATH%"

:: Sua loi registry cho thu vien SheetJS
call "%npm_cmd%" config set @sheetjs:registry https://cdn.sheetjs.com/ > nul 2>&1

:: CAI N8N GLOBAL MOT LAN VA MAI MAI (THU MUC PORTABLE)
if exist "%NPM_GLOBAL_DIR%\n8n.cmd" goto SKIP_N8N_INSTALL
echo.
echo [SETUP] Chua co base n8n. Dang khoi tao cai dat (30s - 1 Phut)...
call "%npm_cmd%" install -g n8n

:SKIP_N8N_INSTALL
:: ============================================================
:: 4. CẤU HÌNH BIẾN MÔI TRƯỜNG N8N 
:: ============================================================
set "N8N_PORT=5678"
set "N8N_HOST=0.0.0.0"
set "N8N_LISTEN_ADDRESS=0.0.0.0"
set "N8N_PROTOCOL=http"
set "N8N_CORS_ALLOWED_ORIGINS=*"
set "N8N_CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,HEAD"
set "EXECUTIONS_DATA_MAX_AGE=168"
set "EXECUTIONS_DATA_PRUNE=true"
set "GENERIC_TIMEZONE=Asia/Ho_Chi_Minh"
set "N8N_LOG_LEVEL=info"
set "N8N_LOG_OUTPUT=console"
set "N8N_VERSION_NOTIFICATIONS_ENABLED=false"
set "N8N_DIAGNOSTICS_ENABLED=false"
set "N8N_HIRING_BANNER_ENABLED=false"
set "N8N_BASIC_AUTH_ACTIVE=false"
set "N8N_SKIP_WEBHOOK_DEREGISTRATION_SHUTDOWN=true"
set "N8N_BLOCK_ENV_ACCESS_IN_NODE=false"

:: Don sach tien trinh cu neu mang hoac port bi ket
taskkill /f /im node.exe /t > nul 2>&1
taskkill /f /im cloudflared.exe /t > nul 2>&1

:: ============================================================
:: 5. KIỂM TRA && KHỞI ĐỘNG DỊCH VỤ PHỤ Trợ 
:: ============================================================
echo.
echo [INFO] Quet dich vu phu...
if exist "%BASE_DIR%\redis\redis-server.exe" (
    start /min "" "%BASE_DIR%\redis\redis-server.exe" "%BASE_DIR%\redis\medstand.conf"
    echo   - Redis Engine: OK
)
if exist "%BASE_DIR%\redis\redis-proxy.js" (
    start /min "" "%NODE_EXE%" "%BASE_DIR%\redis\redis-proxy.js"
    echo   - Redis Proxy: OK
)
if exist "%BASE_DIR%\qdrant\qdrant.exe" (
    start /min "" "%BASE_DIR%\qdrant\qdrant.exe"
    echo   - Qdrant Vector: OK
)

:: ============================================================
:: 6. TẢI VÀ CHUYỂN TIẾP MẠNG QUA CLOUDFLARE (TỰ ĐỘNG)
:: ============================================================
echo.
set "CF_EXE=%BASE_DIR%\cloudflared.exe"
set "CF_LOG=%BASE_DIR%\cf_tunnel.log"
set "CF_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

if exist "%CF_EXE%" goto SKIP_CF_DOWNLOAD
echo [SETUP] Dang tai module Tunnel Cloudflare tu dong...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CF_URL%' -OutFile '%CF_EXE%' -UseBasicParsing"

:SKIP_CF_DOWNLOAD
if not exist "%CF_EXE%" (
    echo [WARN] Thieu file cloudflared.exe, web se khong chay duoc ngoai internet nhe!
    goto SKIP_CF_TUNNEL
)

if exist "%CF_LOG%" del /f /q "%CF_LOG%"
echo [INFO] Dang xin cho ten mien dong Public (Cho 5s)...
start "Cloudflare Tunnel" /B cmd /c ^"^"%CF_EXE%^" tunnel --url http://localhost:%N8N_PORT% ^> ^"%CF_LOG%^" 2^>^&1^"

set "NGROK_URL="
for /L %%i in (1,1,25) do (
    if "!NGROK_URL!"=="" (
        if exist "%CF_LOG%" (
            for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "Get-Content '%CF_LOG%' | Select-String -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | ForEach-Object { $_.Matches.Value } | Select-Object -First 1" 2^>nul`) do (
                set "NGROK_URL=%%a"
            )
        )
        if "!NGROK_URL!"=="" timeout /t 1 /nobreak > nul
    )
)

if "!NGROK_URL!"=="" (
    echo [WARN] Time out mang yeu, khong the xin link Cloudflare moi duoc nha.
    goto SKIP_CF_TUNNEL
)

echo [OK] Internet Link: !NGROK_URL!
set "WEBHOOK_URL=!NGROK_URL!/"
set "N8N_WEBHOOK_TUNNEL_URL=!NGROK_URL!"

:: Chi replace file neu tim thay de tranh bao loi bat thinh linh
if not exist "%BASE_DIR%\..\env.js" goto SKIP_CF_TUNNEL
powershell -NoProfile -Command "$f='%BASE_DIR%\..\env.js'; (Get-Content -Path $f -Encoding UTF8) -replace 'https://[a-zA-Z0-9-]+\.trycloudflare\.com', '!NGROK_URL!' | Set-Content -Path $f -Encoding UTF8"
echo [OK] Da cap nhat tu dong link vao env.js.

:SKIP_CF_TUNNEL

:: Mo proxy phia ngoai
set "PROXY_JS=%BASE_DIR%\..\proxy.js"
if exist "%PROXY_JS%" (
    start "CORS Proxy" cmd /k ^"^"%NODE_EXE%^" ^"%PROXY_JS%^"^"
)

:: ============================================================
:: 7. EXECUTOR: GỌI N8N 
:: ============================================================
echo.
echo =======================================================
echo          [ HOAN TAT ] N8N DANG KHOI DONG...
echo =======================================================
echo   - WEBHOOK_URL : %WEBHOOK_URL%
echo   - HOST PORT   : Localhost:%N8N_PORT%
echo =======================================================
call "%NPM_GLOBAL_DIR%\n8n.cmd" start

pause
