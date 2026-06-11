@echo off
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
echo         GOOGLE SHEETS SYNC PROXY SERVER START          
echo =======================================================

:: 1. Xác định bộ chạy Node.js
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "RUN_NODE=node"
    echo [INFO] Phat hien Node.js he thong (Global)
    goto START_PROCESS
)

echo.
echo [ERROR] Khong tim thay Node.js!
echo Vui long tai va cai dat Node.js tai: https://nodejs.org/
echo.
pause
exit /b 1

:START_PROCESS
:: 2. Tự động cài đặt dependencies nếu chưa có
if not exist "%BASE_DIR%\node_modules" (
    echo.
    echo [1/3] Dang tu dong tai va cai dat cac thu vien phu thuoc (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Cai dat thu vien that bai! Vui long kiem tra ket noi mang.
        pause
        exit /b 1
    )
)

:: 3. Tự động dọn dẹp tiến trình cũ trên cổng 3000
echo.
echo [2/3] Dang kiem tra va giai phong cong 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [INFO] Phat hien Express Server cu voi PID %%a dang chiem cong 3000. Dang dong...
    taskkill /f /pid %%a >nul 2>&1
)
echo [OK] Cong 3000 da san sang.

:: 4. Khởi chạy Express Server bảo mật
echo.
echo [3/3] Dang khoi chay Express Server moi...
echo =======================================================
echo.
"%RUN_NODE%" "%BASE_DIR%\server.js"
