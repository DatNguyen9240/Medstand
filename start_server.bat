@echo off
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
echo          MEDSTAND AUTOMATIC BUILD AND START            
echo =======================================================

set "NODE_EXE=%BASE_DIR%\n8n-system\.bin\node-v22.14.0-win-x64\node.exe"

:: 1. Xác định bộ chạy Node.js
if exist "%NODE_EXE%" (
    set "RUN_NODE=%NODE_EXE%"
    echo [INFO] Phat hien Node.js Portable tu start_n8n.bat
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "RUN_NODE=node"
        echo [INFO] Su dung Node.js he thong (Global)
    ) else (
        echo.
        echo [ERROR] Khong tim thay Node.js!
        echo Vui long chay file n8n-system\start_n8n.bat truoc de tai Node.js ve local.
        echo.
        pause
        exit /b 1
    )
)

:: 2. Tự động đóng gói tài nguyên mới nhất (Rebuild JS/CSS Bundle)
echo.
echo [1/3] Dang tu dong dong goi va toi uu hoa hieu nang...
"%RUN_NODE%" "%BASE_DIR%\scripts\build.js"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Dong goi that bai! Vui long kiem tra lai code.
    echo.
    pause
    exit /b 1
)
echo [OK] Dong goi tai nguyen thanh cong.

:: 3. Tự động dọn dẹp tiến trình cũ trên cổng 3000 (Tránh lỗi trùng cổng)
echo.
echo [2/3] Dang kiem tra va giai phong cong 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo [INFO] Phat hien Express Server cu (PID %%a) dang chiem cong 3000. Dang dong...
    taskkill /f /pid %%a >nul 2>&1
)
echo [OK] Cong 3000 da san sang.

:: 4. Khởi chạy Express Server bảo mật
echo.
echo [3/3] Dang khoi chay Express Server moi...
echo =======================================================
echo.
"%RUN_NODE%" "%BASE_DIR%\server.js"
