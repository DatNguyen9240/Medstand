@echo off
setlocal

:: Lấy đường dẫn thư mục hiện tại của file .bat (đã bỏ dấu \ ở cuối)
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

:: Đảm bảo tắt các tiến trình n8n cũ để nạp cấu hình mới
taskkill /f /im node.exe /t > nul 2>&1

echo =======================================================
echo          KIEM TRA DIEU KIEN MOI TRUONG
echo =======================================================

:: 1. Kiem tra Redis
if exist "%BASE_DIR%\redis\redis-server.exe" (
    echo [OK] Dang chay Redis...
    start /min "" "%BASE_DIR%\redis\redis-server.exe" "%BASE_DIR%\redis\medstand.conf"
    timeout /t 2 /nobreak > nul
) else (
    echo [WARN] Redis khong tim thay tai %BASE_DIR%\redis. Bo qua...
)

:: 2. Kiem tra Redis Proxy (Node)
:: Neu khong co node portable, dung node he thong
set "NODE_EXEC=node"
if exist "%BASE_DIR%\nodejs\node-v20.12.2-win-x64\node.exe" (
    set "NODE_EXEC=%BASE_DIR%\nodejs\node-v20.12.2-win-x64\node.exe"
)

if exist "%BASE_DIR%\redis\redis-proxy.js" (
    echo [OK] Dang chay Redis HTTP Proxy...
    start /min "" "%NODE_EXEC%" "%BASE_DIR%\redis\redis-proxy.js"
    timeout /t 2 /nobreak > nul
)

:: 3. Kiem tra Qdrant
if exist "%BASE_DIR%\qdrant\qdrant.exe" (
    echo [OK] Dang chay Qdrant Vector DB...
    start /min "" "%BASE_DIR%\qdrant\qdrant.exe"
    timeout /t 3 /nobreak > nul
) else (
    echo [WARN] Qdrant khong tim thay. Bo qua...
)

:: 4. Kiem tra Cloudflare
if exist "%BASE_DIR%\cloudflared.exe" (
    echo [OK] Dang chay Cloudflare Tunnel...
    start "Cloudflare Tunnel" cmd /k "%BASE_DIR%\cloudflared.exe tunnel --url http://localhost:5678"
    timeout /t 2 /nobreak > nul
) else (
    echo [WARN] cloudflared.exe khong tim thay. n8n se chi chay localhost.
)

:: ───────── CAU HINH N8N ─────────
set "N8N_CORS_ALLOWED_ORIGINS=*"
set "N8N_CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,HEAD"
set "N8N_PROTOCOL=http"
set "N8N_WEBHOOK_TUNNEL_URL=http://127.0.0.1:5678"
set "N8N_LISTEN_ADDRESS=0.0.0.0"

:: Sửa lỗi dependency xlsx@0.20.2 (SheetJS)
echo [FIX] Dang cau hinh registry cho SheetJS...
call npm config set @sheetjs:registry https://cdn.sheetjs.com/

echo =======================================================
echo          KHOI DONG HE THONG N8N (LOCAL HOST)
echo =======================================================
echo Dang cai dat/cap nhat n8n (Vui long cho trong giay lat)...

:: Chay Proxy CORS o cua so moi
echo [OK] Dang chay CORS Proxy tai cong 8080...
start "CORS Proxy" cmd /k "node %BASE_DIR%\..\proxy.js"

:: Dung npx voi phien ban on dinh va don dep cache truoc
call npm cache clean --force > nul 2>&1
call npx -y n8n@1.62.1 start

pause
