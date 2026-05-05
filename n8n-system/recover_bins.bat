@echo off
echo =========================================
echo MEDSTAND PM2 DISASTER RECOVERY
echo =========================================

set BASE_DIR=%~dp0
cd /d "%BASE_DIR%"
if not exist "redis" mkdir "redis"
if not exist "qdrant" mkdir "qdrant"

echo [1/2] Dang tai Redis (Vui long cho mang)...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip' -OutFile 'redis.zip'; Expand-Archive -Path 'redis.zip' -DestinationPath 'redis_temp' -Force; Move-Item 'redis_temp\redis-server.exe' -Destination 'redis\redis-server.exe' -Force; Remove-Item 'redis.zip' -Force; Remove-Item 'redis_temp' -Recurse -Force"

echo [2/2] Dang tai Qdrant Vector DB (Vui long cho mang)...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/qdrant/qdrant/releases/download/v1.8.4/qdrant-x86_64-pc-windows-msvc.zip' -OutFile 'qdrant.zip'; Expand-Archive -Path 'qdrant.zip' -DestinationPath 'qdrant_temp' -Force; Move-Item 'qdrant_temp\qdrant.exe' -Destination 'qdrant\qdrant.exe' -Force; Remove-Item 'qdrant.zip' -Force; Remove-Item 'qdrant_temp' -Recurse -Force"

echo =========================================
echo KHOI PHUC XONG, NAP LAI PM2...
echo =========================================
call "%BASE_DIR%n8n_data\npm_global\pm2.cmd" restart all
call "%BASE_DIR%n8n_data\npm_global\pm2.cmd" save
