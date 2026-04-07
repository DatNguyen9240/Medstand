# Hướng dẫn Cấu hình n8n cho Metadata Medstand (Core & Common)

Tài liệu này tập trung vào việc cài đặt n8n để đáp ứng chính xác các API Metadata được khai báo trong 2 file SQL chính.

---

## 1. Nhóm Module Lõi (`Schema_API_Metadata.sql`)

Đây là các module chuyên sâu, n8n cần cấu hình các Webhook/Sub-workflow để nhận diện các `@ApiCode` sau:

| @ApiCode (SQL) | Tên Module | Tham số n8n cần nhận | Logic xử lý chính tại n8n |
| :--- | :--- | :--- | :--- |
| `@tra_cuu_san_pham` | Tìm sản phẩm | `@SearchKey`, `@TopN` | Gọi SQL `API_TraCuuSanPham_AI` |
| `@goi_y_don_hang` | Gợi ý đơn | `@ObjectID` (KH), `@TopN` | Phân tích hành vi mua hàng qua SQL |
| `@tuyen_ban_hang` | Tuyến bán hàng | `@SoNgayVangMat` | Lấy lịch trình đi tuyến từ CSDL |
| `@cham_diem_kh` | Chấm điểm KH | `@NhomFilter` | Phân loại A/B/C/D dựa trên doanh số |
| `@moc_thuong` | Mốc thưởng | `@ObjectID` | Tính toán % tích lũy doanh số |
| `@import_trong_tam` | Import SP | `@JsonItems`, `@JsonRules` | Xử lý File/JSON nạp vào CSDL |
| `@de_xuat_khuyen_mai`| Đề xuất CEO | `@Username` | Phân tích tồn đọng, cận date |

---

## 2. Nhóm Module Dùng Chung (`Schema_API_Metadata_Patch.sql`)

Nhóm này thường được tích hợp vào một luồng xử lý nghiệp vụ Sale Hub (`ai_sale`):

| @ApiCode (SQL) | Tên Module | Tham số n8n cần nhận | Ghi chú cấu hình |
| :--- | :--- | :--- | :--- |
| `@tao_don_hang` | **Tạo đơn hàng** | `@ObjectID`, `@ItemList` | **Cần Xác nhận**: Đợi `@confirm` trước khi gọi SQL |
| `@xem_don_hang` | Xem đơn hàng | `@StatusName`, `@FromDate` | Lọc danh sách đơn từ bảng `AR_OrderTbl` |
| `@cong_no_kh` | Công nợ KH | `@ObjectID` | Tra cứu số dư nợ hiện tại |
| `@cong_no_chi_tiet` | Chi tiết nợ | `@ObjectID` (Bắt buộc) | Liệt kê các hóa đơn chưa thanh toán |
| `@danh_muc` | Tra danh mục | `@Type`, `@SearchText` | Tìm nhanh KH, SP, Kho, Nhân viên |
| `@ton_kho_list` | Tồn kho chi tiết | `@ItemID` | Xem tồn theo Lô/Hạn dùng thực tế |

---

## 3. Cấu hình Tham số Hệ thống (System Params)

Trong mọi Workflow n8n, bạn phải đảm bảo trích xuất được 2 tham số sau từ Header/Body gửi từ Chatbot Engine:
1. **`@Username`**: Dùng để phân quyền và lọc dữ liệu theo người dùng.
2. **`Token`**: Dùng để xác thực (Auth) khi n8n gọi các Stored Procedure trong SQL.

---

## 4. Ánh xạ Webhook n8n

| Loại API | Path Webhook n8n | Logic Action Code |
| :--- | :--- | :--- |
| **Giao diện Tổng** | `api-nha-thuoc` | Router phân loại intent người dùng |
| **Nghiệp vụ Sale** | `ai-sale-webhook` | Xử lý các module Common & Tra cứu SP |
| **Ghi dữ liệu** | `ai-sale-webhook` | Phải có node `Confirm` cho các lệnh Tạo/Sửa |

---
**Lưu ý**: Khi n8n trả kết quả về, hãy đảm bảo định dạng JSON có trường `message` (nội dung text) và `action` (để chatbot hiển thị đúng UI: chat/cart/table).
