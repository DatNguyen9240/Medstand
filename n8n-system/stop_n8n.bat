@echo off
setlocal EnableDelayedExpansion

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "N8N_USER_FOLDER=%BASE_DIR%\n8n_data"
set "NPM_GLOBAL_DIR=%N8N_USER_FOLDER%\npm_global"

color 0C
echo ====================================================================
echo        MEDSTAND N8N PORTABLE - EMERGENCY KILL SWITCH (NUT DUC)
echo ====================================================================
echo.
echo [1] Dang huy bo toan bo phan vung Cua Quan Gia PM2...
if exist "%NPM_GLOBAL_DIR%\pm2.cmd" (
    call "%NPM_GLOBAL_DIR%\pm2.cmd" kill >nul 2>&1
)

echo.
echo [2] Dang Don dep cac bong ma Node.js hoat dong ngam...
taskkill /F /IM node.exe >nul 2>&1

echo.
echo [3] Dang thanh trung he thong kho Qdrant va Cloudflare...
taskkill /F /IM qdrant.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /IM redis-server.exe >nul 2>&1

echo.
echo ====================================================================
echo [V] HOAN TAT! TOAN BO SERVER DA DUOC DON DEO SACH SE!
echo ====================================================================
echo Sếp có thể chạy lại lệnh start_n8n.bat để kích hoạt lại trạm nghen!
echo ====================================================================
pause
