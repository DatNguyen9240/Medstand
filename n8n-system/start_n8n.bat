@echo off
setlocal EnableDelayedExpansion

:: 1. Xác định đường dẫn gốc tuyệt đối an toàn cho Portable, bỏ dấu \ ở cuối
set "BASE_DIR=%~sdp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
echo          MEDSTAND N8N PORTABLE BOOTSTRAPPER            
echo =======================================================

:: ============================================================
:: 2. CẤU HÌNH NODE.JS PORTABLE (TẢI + GIẢI NÉN BẰNG TAR CHỐNG PATH DÀI)
:: ============================================================
set "NODE_VERSION=22.14.0"
set "NODE_DIR=%BASE_DIR%\.bin\node-v%NODE_VERSION%-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "npm_cmd=%NODE_DIR%\npm.cmd"
set "npx_cmd=%NODE_DIR%\npx.cmd"
set "NODE_ZIP=%BASE_DIR%\.bin\node-v%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"

if exist "%NODE_EXE%" goto SKIP_NODE_SETUP
echo.
echo [SETUP] Phat hien thieu Node.js hoac bi an mon.
echo [SETUP] Tai han ban Portable moi de tiep tuc setup...

if exist "%NODE_ZIP%" goto SKIP_NODE_DOWNLOAD
if not exist "%BASE_DIR%\.bin" mkdir "%BASE_DIR%\.bin"
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing"

:SKIP_NODE_DOWNLOAD
if not exist "%NODE_ZIP%" (
    echo [ERROR] Tai Node.js that bai! Vui long kiem tra lai ket noi mang.
    pause
    exit /b 1
)

echo [SETUP] Giai nen sieu toc (PowerShell)...
if not exist "%BASE_DIR%\.bin" mkdir "%BASE_DIR%\.bin"
powershell -Command "Expand-Archive -Force -Path '%NODE_ZIP%' -DestinationPath '%BASE_DIR%\.bin'"
del /f /q "%NODE_ZIP%" 2>nul

:SKIP_NODE_SETUP
:: Ep Node.js vao duong dan chay cua Terminal hien tai
set "PATH=%NODE_DIR%;%PATH%"

:: ============================================================
:: 3. ÉP CHẾ ĐỘ PORTABLE 100% CHO NPM + N8N 
:: ============================================================
set "N8N_USER_FOLDER=%BASE_DIR%\n8n_data"
set "PM2_HOME=%N8N_USER_FOLDER%\.pm2"
set "PM2_RPC_PORT=//./pipe/rpc_n8n_medstand"
set "PM2_PUB_PORT=//./pipe/pub_n8n_medstand"
set "PM2_INTERACT_PORT=//./pipe/interact_n8n_medstand"
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

if not exist "%NPM_GLOBAL_DIR%\pm2.cmd" (
    echo [SETUP] Tich hop Quan Gia PM2 Portable vao he thong...
    call "%npm_cmd%" install -g pm2
)
:: ============================================================
:: 4. CẤU HÌNH BIẾN MÔI TRƯỜNG N8N 
:: ============================================================
set "N8N_PORT=5678"
set "N8N_HOST=0.0.0.0"
set "N8N_LISTEN_ADDRESS=0.0.0.0"
set "N8N_PROTOCOL=http"
set "N8N_CORS_ALLOWED_ORIGINS=*"
set "N8N_CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,HEAD"
set "N8N_CORS_ALLOWED_HEADERS=Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key"
set "EXECUTIONS_DATA_MAX_AGE=72"
set "EXECUTIONS_DATA_PRUNE=true"
set "GENERIC_TIMEZONE=Asia/Ho_Chi_Minh"
set "N8N_LOG_LEVEL=warn"
set "N8N_LOG_OUTPUT=console"
set "N8N_VERSION_NOTIFICATIONS_ENABLED=false"
set "N8N_DIAGNOSTICS_ENABLED=false"
set "N8N_HIRING_BANNER_ENABLED=false"
set "N8N_BASIC_AUTH_ACTIVE=false"
set "N8N_BLOCK_ENV_ACCESS_IN_NODE=false"

:: Don sach tien trinh cu neu mang hoac port bi ket
call "%NPM_GLOBAL_DIR%\pm2.cmd" kill > nul 2>&1
taskkill /f /im node.exe /t > nul 2>&1
taskkill /f /im qdrant.exe /t > nul 2>&1
taskkill /f /im cloudflared.exe /t > nul 2>&1

:: ============================================================
:: 5. KIỂM TRA VÀ CÀI ĐẶT VISUAL C++ (DÀNH CHO QDRANT)
:: ============================================================
echo.
if not exist "C:\Windows\System32\vcruntime140.dll" (
    echo [SETUP] Phat hien he thong thieu Microsoft Visual C++ Redistributable.
    echo [SETUP] Dang tai va cai dat tu dong cho Qdrant AI...
    set "VCREDIST_URL=https://aka.ms/vs/17/release/vc_redist.x64.exe"
    set "VCREDIST_EXE=%BASE_DIR%\.bin\vc_redist.x64.exe"
    if not exist "%BASE_DIR%\.bin" mkdir "%BASE_DIR%\.bin"
    
    if not exist "!VCREDIST_EXE!" (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!VCREDIST_URL!' -OutFile '!VCREDIST_EXE!' -UseBasicParsing"
    )
    if exist "!VCREDIST_EXE!" (
        start /wait "" "!VCREDIST_EXE!" /install /quiet /norestart
        echo [OK] Cai dat Visual C++ hoan tat.
    ) else (
        echo [WARN] Khong the tai Visual C++. Qdrant co the se khong chay duoc.
    )
) else (
    echo [INFO] Kiem tra loi C++: OK. Da co san.
)

:: ============================================================
:: 6. HỆ THỐNG PHỤ TRỢ (PM2 SẼ ĐẢM NHẬN NHƯNG KIỂM TRA TRƯỚC)
:: ============================================================
echo.
echo [INFO] Cac dich vu phu se do PM2 dam nhan (Redis, Qdrant)...

:: ============================================================
:: 7. TẢI VÀ CHUYỂN TIẾP MẠNG QUA CLOUDFLARE (TỰ ĐỘNG)
:: ============================================================
echo.
set "CF_EXE=%BASE_DIR%\.bin\cloudflared.exe"
set "CF_LOG=%BASE_DIR%\.logs\cf_tunnel.log"
if not exist "%BASE_DIR%\.logs" mkdir "%BASE_DIR%\.logs"
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
        if "!NGROK_URL!"=="" ping -n 2 127.0.0.1 > nul
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
powershell -NoProfile -Command "$f='%BASE_DIR%\..\env.js'; (Get-Content -Path $f -Encoding UTF8) -replace \"N8N_BASE: '.*?'\", \"N8N_BASE: '!NGROK_URL!'\" | Set-Content -Path $f -Encoding UTF8"
echo [OK] Da cap nhat tu dong link vao env.js.

:SKIP_CF_TUNNEL

:: PM2 Se Dam Nhan Viec Chay Proxy.js (CORS)

:: ============================================================
:: 8. DỌN DẸP RÁC TỰ ĐỘNG MỖI LẦN KHỞI ĐỘNG
:: ============================================================
echo.
echo [INFO] Dang tu dong don dep log va cache rac...
if exist "%N8N_USER_FOLDER%\npm_cache" rmdir /s /q "%N8N_USER_FOLDER%\npm_cache" > nul 2>&1
if exist "%N8N_USER_FOLDER%\.n8n\n8nEventLog*.log" del /q /f "%N8N_USER_FOLDER%\.n8n\n8nEventLog*.log" > nul 2>&1
if exist "%N8N_USER_FOLDER%\.cache" rmdir /s /q "%N8N_USER_FOLDER%\.cache" > nul 2>&1

:: ============================================================
:: 9. EXECUTOR: GỌI HỆ SINH THÁI PM2
:: ============================================================
echo.
echo [INFO] Dang ban giao toan bo quyen luc cho Quan Gia PM2...
call "%NPM_GLOBAL_DIR%\pm2.cmd" start "%BASE_DIR%\ecosystem.config.js" --update-env

:: Save config
call "%NPM_GLOBAL_DIR%\pm2.cmd" save > nul 2>&1

echo.
echo =======================================================
echo     [ HOAN TAT ] HE THONG N8N PORTABLE DA LEN MANG
echo =======================================================
echo   - N8N Admin   : http://localhost:%N8N_PORT%
echo   - Cong Public : %WEBHOOK_URL%
echo =======================================================
echo.
echo [!] He thong dang duoc chay ngam an toan (Bang PM2 Portable).
echo De xem cac luong chay an, hay chay lenh:
echo   %NPM_GLOBAL_DIR%\pm2.cmd logs
echo.
echo Sep co the tat cua so chong chong nay di thoai mai.
pause >nul
