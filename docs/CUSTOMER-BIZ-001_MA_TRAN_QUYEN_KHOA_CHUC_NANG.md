# CUSTOMER-BIZ-001 — Ma trận quyền khóa chức năng chờ business sign-off

**Trạng thái:** `AWAITING_BUSINESS_SIGN_OFF`

**Ngày lập:** 23/08/2026

## 1. Phạm vi đề xuất

Áp dụng cho luồng tạo, sửa và duyệt đơn hàng trong Medstand. Không mở rộng sang các chức năng khác nếu chưa có yêu cầu riêng.

Quyết định đã có bằng chứng và phải giữ:

- Kế toán không dùng app Medstand; kế toán thao tác trên PMKT.
- Sale được lưu, sửa, gửi duyệt và hủy đơn nháp của chính mình.
- Sau khi gửi duyệt, Sale không còn sửa đơn.
- Quản lý cùng chi nhánh có thể sửa đơn chờ duyệt theo contract hiện hành.
- Tài khoản khác chi nhánh hoặc Sale khác không được sửa đơn.
- Identity do Gateway lấy từ token; UI không phải lớp bảo vệ duy nhất.

## 2. Ma trận đề xuất chờ ký

| Vai trò | Xem trong scope | Sửa nháp mình | Gửi nháp mình | Hủy nháp mình | Sửa đơn chờ duyệt | Duyệt/Từ chối | Submit/Cancel nháp người khác |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sale | Có | Có | Có | Có | Không | Không | Không |
| Quản lý cùng chi nhánh | Có | Có, nếu là chủ | Có, nếu là chủ | Có, nếu là chủ | Có | **Chờ sign-off** | Khuyến nghị **Không** |
| Quản lý khác chi nhánh | Không | Không | Không | Không | Không | Không | Không |
| Kế toán | Không dùng app | Không | Không | Không | Không | Không | Không |
| Admin | Có | **Chờ sign-off** | **Chờ sign-off** | **Chờ sign-off** | **Chờ sign-off** | **Chờ sign-off** | **Chờ sign-off** |

## 3. Các quyết định business bắt buộc

Business cần xác nhận rõ:

1. “Khóa chức năng” chỉ là khóa theo trạng thái đơn, hay còn là khóa toàn bộ chức năng sau một thời điểm nghiệm thu?
2. Quản lý cùng chi nhánh có được `APPROVE` và `REJECT` không?
3. Người tạo đơn có được tự duyệt đơn của mình không?
4. Quản lý có được `SUBMIT` hoặc `CANCEL` đơn nháp của Sale khác không?
5. Admin có quyền override mutation không?
6. Nếu mở quyền tạm thời: ai mở, lý do bắt buộc, thời hạn, audit và cách rollback là gì?

Giá trị mặc định an toàn được đề xuất:

- Quản lý cùng chi nhánh được `APPROVE/REJECT`.
- Không tự duyệt đơn do chính mình tạo.
- Không `SUBMIT/CANCEL` nháp của người khác.
- Admin không override mutation trực tiếp.
- Mở quyền tạm thời chỉ bằng cấu hình có version, lý do, thời hạn, audit và rollback.

## 4. Gap kỹ thuật đã xác minh

Contract đang sống trên `medtest` vẫn là contract TEST:

- Các role `KTDH`, `KTDH2`, `TN KTDH`, `QL`, `QLMN` và `MANAGER_FLAG=1` đang dùng `ActionCode='*'`.
- Các dòng trên có `ApprovedBy='TEST-ORDER-APPROVAL-003'`, không phải business sign-off.
- `APPROVE` và `REJECT` hiện cũng được duyệt bởi contract TEST.
- Wildcard có thể cho Quản lý/Kế toán thực hiện hành động ngoài ma trận mới, bao gồm `SUBMIT/CANCEL` nháp của người khác.

Các lớp có thể tái sử dụng, không xây lại:

- Identity server-owned.
- Chặn các endpoint ERP cũ.
- Row lock và kiểm scope trong cùng transaction SQL.
- Idempotency ledger và audit.
- Owner guard cho đơn nháp.
- Khóa Sale sau khi gửi duyệt.

## 5. Phạm vi code sau sign-off

Chỉ bắt đầu `CUSTOMER-SEC-001` sau khi mục 3 được ký:

1. Retire role Kế toán khỏi contract app.
2. Thay các dòng contract TEST bằng contract có người duyệt thật.
3. Bỏ `ActionCode='*'`; tách action rõ ràng theo ma trận được ký.
4. Không cấp `SUBMIT/CANCEL` đơn người khác nếu không có quyết định riêng.
5. Đồng bộ wording/menu UI; Gateway và SQL vẫn là lớp bảo vệ bắt buộc.
6. Bổ sung cấu hình version/effective date/audit/rollback nếu có cơ chế mở quyền tạm thời.
7. Chạy QA âm độc lập tại `CUSTOMER-SEC-002`.

## 6. Sign-off

```text
Người xác nhận nghiệp vụ:
Vai trò:
Ngày xác nhận:
Phiên bản ma trận:
Các điểm thay đổi so với đề xuất:
Kết luận: [ ] Chấp thuận  [ ] Yêu cầu chỉnh sửa
```

Không được điền `Đã chốt`, `APPROVED` hoặc `DONE` nếu phần trên chưa có người xác nhận và ngày xác nhận.
