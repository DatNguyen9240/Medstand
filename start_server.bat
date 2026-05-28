@echo off
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo =======================================================
echo          MEDSTAND EXPRESS SERVER BOOTSTRAPPER            
echo =======================================================

set "NODE_EXE=%BASE_DIR%\n8n-system\.bin\node-v22.14.0-win-x64\node.exe"

if exist "%NODE_EXE%" (
    echo [INFO] Phat hien Node.js Portable tu start_n8n.bat
    echo [INFO] Dang khoi chay Express Server qua Node.js Portable...
    echo.
    "%NODE_EXE%" "%BASE_DIR%\server.js"
) else (
    echo [INFO] Khong tim thay Node.js Portable. Thu chay bang Node.js toan cuc...
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        node "%BASE_DIR%\server.js"
    ) else (
        echo.
        echo [ERROR] Khong tim thay Node.js trong he thong!
        echo Vui long chay file n8n-system\start_n8n.bat truoc de tai Node.js ve local.
        echo.
        pause
    )
)
