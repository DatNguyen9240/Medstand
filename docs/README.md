# Bộ tài liệu Pilot Medstand AI

## Trạng thái hiện hành

**Cập nhật 26/07/2026.** Đọc theo thứ tự dưới đây; các báo cáo cũ chỉ giữ làm lịch sử, không dùng làm căn cứ.

| Lớp | Trạng thái | Nguồn |
|---|---|---|
| Source | `PASS` — 159/159 hội thoại, build khớp commit | [Danh sách lỗi 26/07](../reports/DANH_SACH_LOI_TONG_HOP_2026-07-26.md) |
| Frontend runtime | `PASS` — `11.105` = `origin/develop@04d1056` | như trên |
| n8n runtime | `DRIFTED` — chưa import bản mới, còn 2 parser trùng | như trên |
| Bảo mật | `P0 MỞ` — lộ file tĩnh ra internet | như trên |
| Business | `SIGN_OFF_PENDING` — toàn bộ rule ở `DRAFT` | như trên |

- **Danh sách lỗi đầy đủ:** [`../reports/DANH_SACH_LOI_TONG_HOP_2026-07-26.md`](../reports/DANH_SACH_LOI_TONG_HOP_2026-07-26.md)
- **Kế hoạch khắc phục:** [`../reports/KE_HOACH_KHAC_PHUC_2026-07-26.md`](../reports/KE_HOACH_KHAC_PHUC_2026-07-26.md)

<details>
<summary>Lịch sử trạng thái trước đó</summary>

- 24/07/2026 — [`CONG_BO_TRANG_THAI_MEDSTAND_AI_2026-07-24.md`](CONG_BO_TRANG_THAI_MEDSTAND_AI_2026-07-24.md): `SOURCE_AND_BUILD_READY_RUNTIME_RETEST_REQUIRED`
- 22/07/2026 — [`BAO_CAO_SAU_KHAC_PHUC_CUSTOMER_PILOT_2026-07-21.md`](BAO_CAO_SAU_KHAC_PHUC_CUSTOMER_PILOT_2026-07-21.md): `N8N_IMPORTED_RUNTIME_RETEST_PENDING`
- 21/07/2026 — [`BAO_CAO_AUDIT_CUSTOMER_PILOT_TEST_READY_2026-07-21.md`](BAO_CAO_AUDIT_CUSTOMER_PILOT_TEST_READY_2026-07-21.md): `NO-GO`, giữ làm baseline trước khắc phục

</details>

## Tài liệu dành cho doanh nghiệp

1. [`LO_TRINH_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md`](LO_TRINH_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md)
   Lộ trình phát triển được lưu riêng ngoài gói UAT khách hàng.

2. [`BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md`](BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md)
   Danh sách task nội bộ được tách từ roadmap, có mã task, mức ưu tiên, phụ thuộc và điều kiện nghiệm thu.

   Manifest release candidate hiện hành: [`../release/UAT_MANIFEST_2026-07-27_11.110.md`](../release/UAT_MANIFEST_2026-07-27_11.110.md).

3. [`HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md`](HUONG_DAN_SU_DUNG_MEDSTAND_AI_DOANH_NGHIEP.md)
   Tài liệu nguồn rút gọn. Bản Word và HTML để gửi người dùng nằm trong `GOI_UAT_KHACH_HANG`.

4. [`KE_HOACH_TEST_13_TAI_KHOAN.md`](KE_HOACH_TEST_13_TAI_KHOAN.md)
   Kế hoạch UAT cho 13 tài khoản thuộc ba miền, gồm câu hỏi copy-paste, kết quả chuẩn, 24 API, test phân quyền và mẫu ký nghiệm thu.

5. [`GOI_UAT_KHACH_HANG/`](GOI_UAT_KHACH_HANG/)
   Gói gửi trực tiếp cho người dùng Pilot, gồm hướng dẫn sử dụng và bộ kiểm thử riêng; không kèm hình hoặc lộ trình phát triển:

   | File | Nội dung |
   |---|---|
   | `01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.docx` | Hướng dẫn sử dụng Medstand AI |
   | `01_HUONG_DAN_SU_DUNG_MEDSTAND_AI.html` | Bản mở nhanh trên trình duyệt |
   | `02_HUONG_DAN_TEST_13_TAI_KHOAN.docx` | Hướng dẫn kiểm thử 13 tài khoản |
   | `02_HUONG_DAN_TEST_13_TAI_KHOAN.html` | Bản HTML kiểm thử 13 tài khoản |
   | `03_PHIEU_KIEM_THU_NHAN_VIEN_QUAN_LY.docx` | Phiếu ghi kết quả theo vai trò |
   | `04_MAU_GHI_NHAN_LOI_VA_GOP_Y.docx` | Mẫu báo lỗi và góp ý |
   | `05_KICH_BAN_KIEM_THU_13_TAI_KHOAN.docx` | Kịch bản copy-paste đầy đủ: 13 tài khoản, 24 chức năng, ca biên và luồng dữ liệu UAT |

## Tài liệu kỹ thuật liên quan

- [`../sql/AI_Scenarios_Guide.md`](../sql/AI_Scenarios_Guide.md): mapping câu hỏi/API dành cho đội kỹ thuật.
- [`../config/natural-language/intent-map.v1.json`](../config/natural-language/intent-map.v1.json): danh sách 24 intent/API được phép dùng cho hội thoại tự nhiên.
- [`../sql/Add_UAT_Data_Completion_AI.sql`](../sql/Add_UAT_Data_Completion_AI.sql): fixture UAT có thể chạy lặp và dọn theo tiền tố.

## Thứ tự sử dụng

1. Điều phối viên đọc kế hoạch kiểm thử và chuẩn bị môi trường.
2. Người dùng doanh nghiệp đọc hướng dẫn sử dụng theo vai trò.
3. Chạy 13 tài khoản theo bảng phân công.
4. Ghi PASS/FAIL/BLOCKED và lưu ảnh theo quy ước.
5. Chỉ ký Business PASS khi các lỗi P0/P1 đã đóng hoặc được chấp nhận bằng văn bản.

## Trạng thái tài liệu

- Hai workflow n8n mới đã được người triển khai xác nhận import; còn chờ xác nhận Published/Active và runtime retest.
- Dùng để điều phối vòng test kỹ thuật trên `medtest` với dữ liệu chuẩn đã đối soát đến 20/07/2026.
- Chưa phải hướng dẫn vận hành production-final.
- Khi URL, tài khoản, business rule hoặc workflow thay đổi sau deploy, phải cập nhật tài liệu và chạy regression lại.

## Tài liệu vận hành kỹ thuật

- [Cập nhật ngầm công nợ](VAN_HANH_CAP_NHAT_NGAM_CONG_NO.md): polling gần realtime cho card công nợ hiện tại, điều kiện dừng và cấu hình tải.
