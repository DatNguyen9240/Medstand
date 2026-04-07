# Hướng dẫn Cấu hình n8n cho Metadata Medstand (Core & Common)

Tài liệu này tập trung vào việc cài đặt n8n để đáp ứng chính xác các API Metadata được khai báo trong hệ thống. Đảm bảo Workflow n8n nhận đúng mã `@ApiCode` để gọi Procedure tương ứng.

---

## 1. Nhóm Module Lõi (`Schema_API_Metadata.sql`)

Đây là các module chuyên sâu (AI Specialized), n8n cần cấu hình để nhận diện **10 module** sau:

| @ApiCode (SQL) | Tên Module | Tham số n8n cần nhận | Logic xử lý chính tại n8n |
| :--- | :--- | :--- | :--- |
| **`@goi_y_don_hang`** | Gợi ý đơn hàng | `@ObjectID`, `@TopN` | Gợi ý SP theo lịch sử mua hàng |
| **`@upsell_goi_y`** | Upsell & Gợi ý | `@ObjectID`, `@SearchKey` | Gợi ý thêm SP tăng giá trị đơn |
| **`@goi_y_don_thuoc`**| Tìm đơn thuốc | `@Keyword` | Tìm thuốc theo triệu chứng |
| **`@tuyen_ban_hang`** | Tuyến bán hàng | `@SoNgayVangMat`, `@TopN` | Lấy lịch trình ghé thăm khách hàng |
| **`@cham_diem_kh`** | Chấm điểm KH | `@NhomFilter` | Phân loại A/B/C dựa trên doanh số |
| **`@tich_luy`** | **Tích lũy CT** | `@ObjectID`, `@ProgramID` | Thay thế cho `@moc_thuong` cũ |
| **`@san_pham_trong_tam`**| SP Trọng tâm | `@ObjectID`, `@TopN` | Xem chương trình SP trọng tâm |
| **`@de_xuat_khuyen_mai`**| Đề xuất AI | `@Username` | Gợi ý xả hàng hoặc chạy combo |
| **`@tra_cuu_san_pham`**| Tìm sản phẩm | `@SearchKey`, `@TopN` | Tra cứu giá và tồn kho thực tế |
| **`@import_trong_tam`** | Import SP | `@JsonItems`, `@JsonRules` | Chỉ dành cho Admin |

---

## 2. Nhóm Module Dùng Chung (`Schema_API_Metadata_Patch.sql`)

Nhóm này xử lý các nghiệp vụ Sale Hub cơ bản, thường hội tụ về một Webhook router (`ai_sale`):

| @ApiCode (SQL) | Tên Module | Tham số n8n cần nhận | Ghi chú cấu hình |
| :--- | :--- | :--- | :--- |
| **`@tao_don_hang`** | Tạo đơn hàng | `@ObjectID`, `@ItemList` | **Action: CART**. Cần xác nhận. |
| **`@them_khach_hang`**| Thêm khách hàng | `@TenKhachHang`, `@SoDienThoai`| **Action: QUERY**. Cần xác nhận. |
| **`@xem_hoa_don`** | Xem hóa đơn | `@FromDate`, `@SearchText` | Tra cứu hóa đơn quá khứ |
| **`@xem_don_hang`** | Xem đơn hàng | `@StatusName`, `@FromDate` | Lọc danh sách đơn theo trạng thái |
| **`@cong_no_kh`** | Công nợ KH | `@ObjectID`, `@ToDate` | Tra cứu số dư nợ hiện tại |
| **`@cong_no_chi_tiet`**| Chi tiết nợ | `@ObjectID` (Bắt buộc) | Liệt kê hóa đơn chưa thanh toán |
| **`@danh_muc`** | Tra danh mục | `@Type`, `@SearchText` | Tìm nhanh KH, SP, Kho, NV |
| **`@ton_kho_list`** | Tồn kho chi tiết | `@ItemID`, `@ItemName` | Xem tồn theo Lô/Hạn dùng |
| **`@xem_doanh_so`** | Báo cáo doanh số| `@FromDate`, `@EmployeeID` | Chỉ Manager trở lên |

---

## 3. Cấu hình Tham số Hệ thống (System Params)

Trong mọi Workflow n8n, bạn phải đảm bảo trích xuất được:
1. **`@Username`**: Tự động inject từ Chatbot session vào SP (không hiện UI).
2. **`isConfirm`**: Nếu bằng `1`, n8n phải bật node xác nhận trước khi thực hiện các lệnh Thay đổi dữ liệu như `@tao_don_hang` hoặc `@them_khach_hang`.

---

## 4. Ánh xạ Webhook n8n (Current)

Dựa trên cấu hình trong `chatbot.js`:
*   **Production URL**: `https://highways-robbie-outdoors-jefferson.trycloudflare.com/webhook/hook-ai-dainao`
*   **Action Code**: Chatbot sẽ gửi kèm `action` và `ApiCode` trong body JSON. n8n cần dùng Switch node để điều hướng.

---
**Lưu ý**: Tất cả các API hiện tại đều đã được chuyển về loại `QUERY` (hoặc `CART`) để đảm bảo luôn hiển thị Form nhập liệu trước khi thực hiện.
