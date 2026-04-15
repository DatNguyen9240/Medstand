@echo off
color 0A
echo ====================================================================
echo             MEDSTAND AI SERVER - PORTABLE EDITION
echo ====================================================================
echo.
echo [1] Dang khoi dong Qdrant Local VectorDB...
start "Qdrant Vector Engine" /MIN cmd /c "if exist qdrant.exe (qdrant.exe) else (echo LỖI: Không tìm thấy qdrant.exe. Vui lòng tải cục Binary bỏ vào thư mục này! && pause)"

echo.
echo [2] Dang khoi dong cong dong n8n...
start "n8n Workflow Engine" /MIN cmd /c "n8n start --tunnel"

echo.
echo ====================================================================
echo TÀI NGUYÊN ĐÃ LÊN MẠNG! (Chạy ngầm ở Taskbar)
echo - n8n Admin Panel : http://localhost:5678
echo - Qdrant API      : http://localhost:6333
echo.
echo Giữ Terminal này để theo dõi. Bấm phím bất kỳ để thoát giao diện (Server vẫn chạy ngầm).
echo ====================================================================
pause >nul
