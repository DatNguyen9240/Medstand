# CUSTOMER-BIZ-001 — Ma trận quyền khóa chức năng đã chốt

**Trạng thái:** `DONE`

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
| Quản lý cùng chi nhánh | Có | Có, nếu là chủ | Có, nếu là chủ | Có, nếu là chủ | Có | Có | Không |
| Quản lý khác chi nhánh | Không | Không | Không | Không | Không | Không | Không |
| Kế toán | Không dùng app | Không | Không | Không | Không | Không | Không |
| Admin | Theo scope/vai trò được cấp | Không có quyền mutation đặc biệt chỉ vì là Admin | Không có quyền mutation đặc biệt chỉ vì là Admin | Không có quyền mutation đặc biệt chỉ vì là Admin | Chỉ khi đồng thời có vai trò quản lý hợp lệ | Chỉ khi đồng thời có vai trò quản lý hợp lệ | Không |

## 3. Các quyết định business bắt buộc

Các quyết định business đã chốt trong phiên trao đổi ngày 23/08/2026:

1. Khóa theo trạng thái và ma trận action trong tài liệu này; không khóa toàn bộ ứng dụng theo một mốc thời gian.
2. Quản lý cùng chi nhánh được `APPROVE` và `REJECT`.
3. Không được tự duyệt đơn do chính mình tạo.
4. Quản lý không được `SUBMIT` hoặc `CANCEL` đơn nháp của Sale khác.
5. Admin không có quyền override mutation trực tiếp; nếu tài khoản Admin đồng thời có vai trò quản lý hợp lệ thì chỉ nhận đúng quyền của vai trò đó.
6. Mở quyền tạm thời chỉ bằng cấu hình có version, lý do bắt buộc, thời hạn hiệu lực, audit và phương án rollback fail-closed.

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

Phạm vi triển khai `CUSTOMER-SEC-001` theo sign-off tại mục 3:

1. Retire role Kế toán khỏi contract app.
2. Thay các dòng contract TEST bằng contract có người duyệt thật.
3. Bỏ `ActionCode='*'`; tách action rõ ràng theo ma trận được ký.
4. Không cấp `SUBMIT/CANCEL` đơn người khác nếu không có quyết định riêng.
5. Đồng bộ wording/menu UI; Gateway và SQL vẫn là lớp bảo vệ bắt buộc.
6. Bổ sung cấu hình version/effective date/audit/rollback nếu có cơ chế mở quyền tạm thời.
7. Chạy QA âm độc lập tại `CUSTOMER-SEC-002`.

## 6. Sign-off

```text
Người xác nhận nghiệp vụ: Nguyễn Hoàng Đăng (xác nhận trực tiếp trong phiên chat)
Vai trò: Chủ yêu cầu
Ngày xác nhận: 23/08/2026
Phiên bản ma trận: CUSTOMER-BIZ-001 V1
Các điểm thay đổi so với đề xuất: Không
Kết luận: Chấp thuận và yêu cầu thực thi tới goal
```
