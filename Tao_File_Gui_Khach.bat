@echo off
chcp 65001 >nul
echo ========================================================
echo SCRIPT TẠO FILE NÉN NHẸ KHI GIAO MÁY KHÁCH
echo ========================================================
echo.
echo Cảnh báo: Tự động bỏ qua các thư mục cực nặng không cần thiết:
echo - .git (Lịch sử code: 123MB)
echo - npm_global / .cache (Rác và module nặng trong n8n_data)
echo - .bin / node_modules (Thư viện tải lại được: 154MB)
echo - qdrant_storage (Data vector tìm kiếm cục bộ: 65MB)
echo.

set "SRC=%cd%"
set "TMP_DIR=%cd%\..\Medstand_TuyetDoiNhe_Tam"
set "ZIP_FILE=%cd%\..\Medstand_BanGiao_Khach.zip"

if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
if exist "%ZIP_FILE%" del /q "%ZIP_FILE%"

echo [1/3] Đang lọc file dọn rác ra thư mục tạm...
robocopy "%SRC%" "%TMP_DIR%" /MIR /XD .git .cursor npm_global npm_cache .cache .bin qdrant_storage node_modules __pycache__ /XF *.zip Tao_File_Gui_Khach.bat /NJH /NJS /NDL /NC /NS /NP >nul

echo [2/3] Đang nén file (Quá trình này cực kỳ nhanh vì chỉ còn Code)...
powershell -Command "Compress-Archive -Path '%TMP_DIR%\*' -DestinationPath '%ZIP_FILE%'"

echo [3/3] Đang dọn dẹp thư mục tạm...
rmdir /s /q "%TMP_DIR%"

echo.
echo ========================================================
echo HOÀN THÀNH !!!
echo File nén siêu nhỏ cho khách (chỉ vài MB) được tạo tại:
echo %ZIP_FILE%
echo ========================================================
pause
