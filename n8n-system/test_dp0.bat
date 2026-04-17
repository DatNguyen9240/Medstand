@echo off
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
set "NODE_EXE=%BASE_DIR%\.bin\node-v22.14.0-win-x64\node.exe"
echo Running: "%NODE_EXE%" -v
"%NODE_EXE%" -v
