# 🚀 HƯỚNG DẪN KHỞI ĐỘNG MEDSTAND V3 - PHASE 2 (DÀNH CHO NGÀY MAI)

Tài liệu này lưu lại các bước sếp cần thao tác bằng tay để gắn các mạch máu thần kinh tui đã tạo sẵn vào N8N!

### Bước 1: Kéo con "Quái thú Vector" (Qdrant) về nhà 📦
Vì hệ thống dùng bản Local siêu nhẹ (không xài Docker) để giữ vững tiêu chí Portable, sếp cần tải tệp khởi chạy của nó:
1. Lên Google gõ: **"Qdrant Github Releases"** (Hoặc vào link kho Qdrant/qdrant mục Releases).
2. Lăn xuống tìm phiên bản cho Windows (Tệp đuôi là `qdrant-x86_64-pc-windows-msvc.zip`). Tải về giải nén.
3. Sếp lấy duy nhất cái file **`qdrant.exe`** nằm trong đó, Cut và Dán thẳng vào thư mục gốc dự án: `c:\Git cua tui\Medstand`.

### Bước 2: Bật Khởi Động Trạm Trưởng 🚀
1. Mở thư mục `c:\Git cua tui\Medstand`, sếp click đúp vào file **`start_server.bat`** mà tui đã tạo sẵn.
2. Sẽ có cửa sổ CMD hiện lên. Kịch bản tui viết sẽ Mở cùng lúc 2 tiến trình ngầm:
   - Hệ N8n chạy nền (Cổng 5678)
   - Hệ Qdrant Database Vector (Cổng 6333)
*(Lưu ý: Cứ để thu nhỏ cửa sổ CMD này xuống dưới thanh công cụ Taskbar, không được tắt).*

### Bước 3: Nạp Vũ Khí Mới vào N8N ⚙️
1. Mở trình duyệt, vào phần mềm N8N: `http://localhost:5678`.
2. Bấm **Add Workflow** -> **Import from File**. 
3. Import lần lượt 2 cái kịch bản đỉnh cao đã được thả sẵn trong tệp `n8n/`:
   - `c:\Git cua tui\Medstand\n8n\K_Admin_Upload.json` (Luồng nhận File Excel chính sách)
   - `c:\Git cua tui\Medstand\n8n\K6_Cron_Cleanup.json` (Sát thủ xóa rác Excel quá hạn lúc nửa đêm)
4. **Việc cấu hình một lần duy nhất:** 
   - Mở giao diện 2 workflow vừa Import.
   - Trỏ lại cái OpenAI API Credentials trong các Node Trí tuệ.
   - Nhấn Lưu và Bật công tắc gạt **Active (ON)** góc trên bên trái cả 2 luồng!
   
---
*P/S: Làm xong 3 bước này Sếp cứ hú tui, tui sẽ trèo lên Frontend gõ cái nút "Upload Ảnh Toa Thuốc" cho con Vision AI thể hiện sức mạnh nha! Chúc sếp ngủ ngon! 🥂*
