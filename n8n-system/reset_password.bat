@echo off
setlocal EnableDelayedExpansion

:: 1. Xác định đường dẫn gốc
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
echo     CONG CU KHOI PHUC MAT KHAU N8N (MEDSTAND)
echo =======================================================
echo.
echo [INFO] Dang tat n8n hien tai de tranh loi Database bi khoa...

:: 2. Cấu hình Node và N8N môi trường Portable
set "NODE_VERSION=22.14.0"
set "NODE_DIR=%BASE_DIR%\.bin\node-v%NODE_VERSION%-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"

if not exist "%NODE_EXE%" (
    echo [ERROR] Khong tim thay Node.js. Hay chay start_n8n.bat truoc de tai moi truong!
    pause
    exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
set "N8N_USER_FOLDER=%BASE_DIR%\n8n_data"
set "PM2_HOME=%N8N_USER_FOLDER%\.pm2"
set "NPM_GLOBAL_DIR=%N8N_USER_FOLDER%\npm_global"
set "npm_config_prefix=%NPM_GLOBAL_DIR%"
set "PATH=%NPM_GLOBAL_DIR%;%PATH%"

echo [INFO] Dang dung rieng service n8n de tranh loi Database bi khoa...
if exist "%NPM_GLOBAL_DIR%\pm2.cmd" call "%NPM_GLOBAL_DIR%\pm2.cmd" stop Medstand_N8N > nul 2>&1

echo.
echo [INFO] Dang xoa thong tin dang nhap chu yeu tren file SQLite...
call "%NPM_GLOBAL_DIR%\n8n.cmd" user-management:reset

echo.
echo =======================================================
echo [ THANH CONG ] MAT KHAU DA DUOC XOA HOAN TOAN KHOI HE THONG!
echo =======================================================
echo - Bay gio anh hay chay lai file "start_n8n.bat"
echo - Man hinh Web se hien thi: "Set up owner account" (Tao tai khoan moi)
echo - Anh dien ten, email va "AdminD308!" roi Setup la xong.
echo =======================================================
pause
