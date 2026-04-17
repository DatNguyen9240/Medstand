@echo off
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "NODE_VERSION=22.14.0"
set "NODE_DIR=%BASE_DIR%\.bin\node-v%NODE_VERSION%-win-x64"
set "npm_cmd=%NODE_DIR%\npm.cmd"

set "N8N_USER_FOLDER=%BASE_DIR%\n8n_data"
set "NPM_GLOBAL_DIR=%N8N_USER_FOLDER%\npm_global"
set "NPM_CACHE_DIR=%N8N_USER_FOLDER%\npm_cache"

if not exist "%NPM_GLOBAL_DIR%" mkdir "%NPM_GLOBAL_DIR%"
if not exist "%NPM_CACHE_DIR%" mkdir "%NPM_CACHE_DIR%"

set "npm_config_prefix=%NPM_GLOBAL_DIR%"
set "npm_config_cache=%NPM_CACHE_DIR%"
set "PATH=%NPM_GLOBAL_DIR%;%NODE_DIR%;%PATH%"

echo Running npm install...
call "%npm_cmd%" install -g n8n
echo Done!
