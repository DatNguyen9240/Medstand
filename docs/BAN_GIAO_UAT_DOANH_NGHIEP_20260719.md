# Bàn giao UAT doanh nghiệp Medstand AI — 19/07/2026

**Mục tiêu:** cho Sale/TDV và Manager kiểm tra nghiệp vụ trong một ngày.  
**Môi trường hiện tại:** frontend local + n8n local + API/SQL `medtest`.  
**Chế độ:** Pilot read-only; không ghi chứng từ ERP thật.  
**Trạng thái kỹ thuật:** `READY_FOR_BUSINESS_UAT_LOCAL_MEDTEST` — 13 tài khoản đạt 104/104 kiểm tra cốt lõi; ma trận đủ 24 API cũng đạt 13/13 tài khoản.

## 0. Bằng chứng kỹ thuật trước khi giao UAT

- Regression source, bảo mật, response contract và build frontend: `PASS`.
- Audit 22 workflow đang active và toàn bộ source `n8n/AI_Core`: credential reference `PASS`, không còn tham chiếu ID thiếu trên runtime.
- Natural-language Shadow: `PASS` 8/8 bằng một Manager và một Sale; hội thoại xã giao không gọi API nghiệp vụ.
- Bộ nghiệp vụ cốt lõi 13 tài khoản: `PASS` 104/104, gồm catalog 24 API, gợi ý đơn, upsell, sản phẩm mua cùng, tuyến, chặn khách ngoài scope và giỏ hàng preview-only.
- Ma trận read-only đầy đủ: `PASS` 13/13 tài khoản × 24 API; các ca thiếu tham số được trả `422` đúng contract, không bị coi là lỗi hệ thống.
- Visual click-through trên trình duyệt: `PENDING_BUSINESS_BROWSER_UAT`; máy chạy kiểm thử tự động hiện không có phiên browser được kết nối.
- Câu tự nhiên vẫn ở `SHADOW`; chưa được nghiệm thu để tự động gọi API.

## 1. Điều người kiểm thử cần biết

1. Đăng nhập đúng tài khoản được cấp rồi nhấn `Ctrl+F5`.
2. Vào **Trợ lý AI**.
3. Dùng menu hoặc lệnh `@` để lấy dữ liệu nghiệp vụ thật trong UAT.
4. Câu tiếng Việt tự nhiên đang chạy `SHADOW`: hệ thống chỉ nhận diện chức năng dự kiến, chưa tự gọi API. Đây là hành vi đúng, không phải lỗi.
5. Tạo đơn và các thao tác ghi dữ liệu chỉ được xem trước; chatbot không được phát sinh chứng từ ERP.
6. Không gửi mật khẩu, token hoặc dữ liệu bệnh án khi báo lỗi.
7. Một số truy vấn tổng hợp trên `medtest` hiện có thể mất khoảng 16–20 giây. Chỉ bấm gửi một lần và chờ kết quả; nếu quá 30 giây mới ghi nhận lỗi hiệu năng.

## 2. Tài khoản và dữ liệu thử đúng phạm vi

| Vai trò | Tài khoản | Khách dùng để test | Sản phẩm gốc |
|---|---|---|---|
| Manager | `QLBH013.MED` | `NDB001` | `B015` |
| Sale | `NAMDINHB.MED` | `NDB001` | `B015` |
| Manager | `QLBH016.MED` | `BNA051` | `B015` |
| Sale | `BACNINHA.MED` | `BNA051` | `B015` |
| Manager | `QLBH005.MED` | `HUEA043` | `Q002` |
| Sale | `HUEB.MED` | `HUEA043` | `Q002` |
| Manager | `QLBH010.MED` | `QANA002` | `Q002` |
| Sale | `DANANGA.MED` | `QANA002` | `Q002` |
| Manager | `QLMN2` | `DL012` | `Q002` |
| Sale | `CanThoA` | `DL012` | `Q002` |
| Manager | `QLMD1` | `SGNB0001` | `Q002` |
| Sale | `BinhPhuocA` | `SGNB0001` | `Q002` |
| Manager | `QLBH024.MED` | `AG0020` | `Q002` |

Chỉ dùng khách nằm trên cùng dòng tài khoản. Không lấy mã của miền khác làm dữ liệu test thông thường.

## 3. Bộ kiểm tra nhanh — copy/paste

### A. Kiểm tra Shadow

```text
Hôm nay em nên làm gì?
```

PASS khi chatbot thông báo câu tự nhiên đang chạy thử an toàn và nhận diện chức năng tuyến bán hàng; không tự trả danh sách khách.

### B. Kiểm tra nghiệp vụ chính

Copy từng lệnh. Khi form mở, điền khách/sản phẩm ở bảng mục 2.

```text
@tuyen_ban_hang
@goi_ydon_hang
@upsell_goi_y
@goi_ydon_thuoc
@cong_no_khach_hang
@cong_no_chi_tiet
@cham_diem_kh
@danh_sach_tonkho
```

Kết quả mong đợi:

- Tuyến: tối đa 8 khách, đúng phạm vi tài khoản và có lý do ưu tiên.
- Gợi ý đơn: có dữ liệu lịch sử; khách dưới 3 hóa đơn không bị đoán chu kỳ 30 ngày.
- Upsell: bắt buộc chọn khách; không trả danh sách chung khi thiếu khách.
- Sản phẩm mua cùng: không trả lại chính sản phẩm gốc.
- Công nợ: đúng khách; khoản trả một phần hiển thị `Thanh toán một phần`; thiếu hạn không tự coi là quá hạn.
- Tier/Risk: Tier A/B/C tách khỏi Risk; Manager/Sale chỉ thấy khách đúng phạm vi.
- Tồn kho: số bán tham khảo theo kho được cấp; không dùng để cam kết giao nếu chưa đối chiếu ERP lúc chốt đơn.

### C. Kiểm tra riêng theo vai trò

Manager/Admin:

```text
@de_xuat_khuyen_mai
```

PASS khi chỉ hiện danh sách cần xem xét và lý do; không tự tạo mức giảm giá hoặc phê duyệt chương trình.

Sale:

- Chỉ được thấy chương trình công ty đã duyệt và còn hiệu lực.
- Nếu ERP chưa có nguồn chứng minh phê duyệt, `Không có dữ liệu` là kết quả an toàn; không được hiện đề xuất nội bộ của Manager.

### D. Kiểm tra bảo mật bắt buộc

1. Chạy `@upsell_goi_y` nhưng không chọn khách: phải yêu cầu bổ sung khách, không có danh sách sản phẩm.
2. Dùng một khách ngoài dòng tài khoản: phải từ chối/không có dữ liệu và không lộ tên, doanh số hay công nợ.
3. Riêng `AG0020` chỉ dùng bình thường với `QLBH024.MED` trong bộ test này.
4. Thử tạo đơn: chỉ được mở giỏ xem trước, không tăng số chứng từ ERP.

## 4. Những mục không được nghiệm thu như chức năng production

- Câu tự nhiên tự động gọi API: đang Shadow, chưa bật.
- Chẩn đoán, kê đơn, thay thuốc, liều dùng và nội dung trẻ em/thai kỳ/dị ứng: chờ Medical Owner.
- Doanh thu đã thu, VAT và công thức kế toán cuối cùng: chờ Finance.
- Reservation/blocked stock và tồn khả dụng cuối cùng: chờ ERP Warehouse.
- Trạng thái chương trình `Approved/Active/Stackable`: chờ ERP owner xác nhận nguồn.
- OCR đơn thuốc: chưa thuộc bản UAT này.

Không ghi các mục trên là lỗi phần mềm nếu hệ thống đang chặn hoặc ghi rõ “tham khảo/chưa xác định”.

## 5. Cách ghi nhận kết quả

Mỗi lỗi gửi theo mẫu:

```text
Tài khoản/vai trò:
Thời gian:
Lệnh đã dùng:
Khách/sản phẩm:
Kết quả thực tế:
Kết quả mong đợi:
PASS / FAIL / BLOCKED:
Request ID (nếu có):
Ảnh toàn màn hình:
```

Quy ước:

- `PASS`: đúng dữ liệu, đúng quyền và dễ hiểu.
- `FAIL`: sai dữ liệu, sai quyền, lỗi kỹ thuật hoặc UI gây hiểu sai nghiêm trọng.
- `BLOCKED`: thiếu xác nhận/dữ liệu từ Finance, ERP Warehouse, ERP owner hoặc Medical Owner.

Nếu có dấu hiệu lộ dữ liệu ngoài phạm vi, dừng ngay ca test liên quan và báo đội kỹ thuật.

## 6. Tiêu chí kết thúc ngày UAT

- Không có lỗi đăng nhập hoặc lộ dữ liệu ngoài phạm vi.
- Tám luồng ở mục 3B chạy được cho tài khoản được chọn.
- Mutation vẫn preview-only.
- Lỗi phát hiện có tài khoản, thời gian, lệnh và ảnh đầy đủ.
- Các vấn đề nghiệp vụ chưa chốt được ghi `BLOCKED`, không tự sửa rule theo phỏng đoán.
