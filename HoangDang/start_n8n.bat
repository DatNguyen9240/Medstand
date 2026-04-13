@echo off
setlocal EnableDelayedExpansion

:: Lấy đường dẫn thư mục hiện tại của file .bat (đã bỏ dấu \ ở cuối)
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

:: ============================================================
::              CẤU HÌNH NODE.JS PORTABLE
:: ============================================================
set "NODE_VERSION=22.14.0"
set "NODE_DIR=%BASE_DIR%\node-v%NODE_VERSION%-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPX_CMD=%NODE_DIR%\npx.cmd"
set "NODE_ZIP=%BASE_DIR%\node-v%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"

:: Kiểm tra nếu node chưa có thì tự tải về
if not exist "%NODE_EXE%" (
    echo.
    echo =======================================================
    echo   [SETUP] Node.js chua duoc cai. Dang tai xuong...
    echo   Phien ban : %NODE_VERSION%
    echo   URL       : %NODE_URL%
    echo =======================================================
    echo.

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Write-Host 'Dang tai Node.js...'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing"

    if not exist "%NODE_ZIP%" (
        echo [ERROR] Tai Node.js that bai! Kiem tra ket noi mang.
        pause
        exit /b 1
    )

    echo Dang giai nen Node.js...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%BASE_DIR%' -Force"

    del /f /q "%NODE_ZIP%" 2>nul

    if not exist "%NODE_EXE%" (
        echo [ERROR] Giai nen that bai! Khong tim thay node.exe.
        pause
        exit /b 1
    )

    echo [OK] Node.js da duoc cai dat thanh cong tai: %NODE_DIR%
)

:: Thêm Node.js vào PATH của session này
set "PATH=%NODE_DIR%;%PATH%"

:: Xác nhận node đang hoạt động
echo.
for /f "tokens=*" %%v in ('"%NODE_EXE%" --version 2^>^&1') do echo [INFO] Node.js version: %%v

:: ============================================================
::              CẤU HÌNH BIẾN MÔI TRƯỜNG N8N
:: ============================================================

:: ── Đường dẫn lưu trữ dữ liệu n8n ──
set "N8N_USER_FOLDER=%BASE_DIR%\n8n_data"

:: ── Cổng và host ──
set "N8N_PORT=5678"
set "N8N_HOST=0.0.0.0"
set "N8N_LISTEN_ADDRESS=0.0.0.0"
set "N8N_PROTOCOL=http"

:: ── URL công khai (webhook base URL) ──
:: Nếu dùng Cloudflare Tunnel thì điền domain của tunnel vào đây
:: Ví dụ: set "WEBHOOK_URL=https://your-tunnel.trycloudflare.com/"
set "WEBHOOK_URL=https://inches-ticket-script-algebra.trycloudflare.com/"
set "N8N_WEBHOOK_TUNNEL_URL=https://inches-ticket-script-algebra.trycloudflare.com"

:: ── CORS ──
set "N8N_CORS_ALLOWED_ORIGINS=*"
set "N8N_CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,HEAD"

:: ── Execution ──
set "EXECUTIONS_DATA_MAX_AGE=168"
set "EXECUTIONS_DATA_PRUNE=true"

:: ── Timezone ──
set "GENERIC_TIMEZONE=Asia/Ho_Chi_Minh"

:: ── Log ──
set "N8N_LOG_LEVEL=info"
set "N8N_LOG_OUTPUT=console"

:: ── Tắt thông báo không cần thiết ──
set "N8N_VERSION_NOTIFICATIONS_ENABLED=false"
set "N8N_DIAGNOSTICS_ENABLED=false"
set "N8N_HIRING_BANNER_ENABLED=false"
set "N8N_BASIC_AUTH_ACTIVE=false"
set "N8N_SKIP_WEBHOOK_DEREGISTRATION_SHUTDOWN=true"

:: ============================================================
::                  KHỞI ĐỘNG CÁC DỊCH VỤ PHỤ
:: ============================================================

:: Đảm bảo tắt các tiến trình n8n cũ
taskkill /f /im node.exe /t > nul 2>&1

echo.
echo =======================================================
echo          KIEM TRA DIEU KIEN MOI TRUONG
echo =======================================================

:: 1. Redis
echo Starting Redis...
if exist "%BASE_DIR%\redis\redis-server.exe" (
    echo [OK] Dang chay Redis...
    start /min "" "%BASE_DIR%\redis\redis-server.exe" "%BASE_DIR%\redis\medstand.conf"
    timeout /t 2 /nobreak > nul
) else (
    echo [WARN] Redis not found — skipping.
)

:: 2. Redis Proxy
echo Starting Redis HTTP Proxy...
if exist "%NODE_EXE%" if exist "%BASE_DIR%\redis\redis-proxy.js" (
    echo [OK] Dang chay Redis HTTP Proxy...
    start /min "" "%NODE_EXE%" "%BASE_DIR%\redis\redis-proxy.js"
    timeout /t 2 /nobreak > nul
) else (
    echo [WARN] Redis proxy not found — skipping.
)

:: 3. Qdrant
echo Starting Qdrant Vector DB...
if exist "%BASE_DIR%\qdrant\qdrant.exe" (
    echo [OK] Dang chay Qdrant Vector DB...
    start /min "" "%BASE_DIR%\qdrant\qdrant.exe"
    timeout /t 3 /nobreak > nul
) else (
    echo [WARN] Qdrant not found — skipping.
)

:: 4. Cloudflare Tunnel
echo Starting Cloudflare Tunnel...
set "CF_EXE=%BASE_DIR%\cloudflared.exe"
if exist "%CF_EXE%" (
    echo [OK] Dang chay Cloudflare Tunnel...
    start "Cloudflare Tunnel" cmd /k ^"^"%CF_EXE%^" tunnel --url http://localhost:%N8N_PORT%^"
    timeout /t 2 /nobreak > nul
) else (
    echo [WARN] cloudflared.exe not found — n8n se chi chay localhost.
)

:: 5. CORS Proxy
set "PROXY_JS=%BASE_DIR%\..\proxy.js"
if exist "%PROXY_JS%" (
    echo [OK] Dang chay CORS Proxy tai cong 8080...
    start "CORS Proxy" cmd /k ^"^"%NODE_EXE%^" ^"%PROXY_JS%^"^"
)

:: Sửa lỗi dependency SheetJS
echo [FIX] Dang cau hinh registry cho SheetJS...
call "%NODE_DIR%\npm.cmd" config set @sheetjs:registry https://cdn.sheetjs.com/ > nul 2>&1

:: ============================================================
::                      KHỞI ĐỘNG N8N
:: ============================================================

echo.
echo =======================================================
echo          KHOI DONG HE THONG N8N (LOCAL HOST)
echo =======================================================
echo.
echo   N8N_PORT        : %N8N_PORT%
echo   N8N_HOST        : %N8N_HOST%
echo   WEBHOOK_URL     : %WEBHOOK_URL%
echo   N8N_USER_FOLDER : %N8N_USER_FOLDER%
echo   TIMEZONE        : %GENERIC_TIMEZONE%
echo   NODE_DIR        : %NODE_DIR%
echo.
echo Dang khoi dong n8n (lan dau co the mat vai giay)...
call "%NPX_CMD%" -y n8n start

pause
