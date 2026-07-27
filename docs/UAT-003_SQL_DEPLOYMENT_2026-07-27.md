# UAT-003 — Triển khai và xác minh bộ SQL bắt buộc

**Ngày chuẩn bị:** 27/07/2026  
**Release:** `MEDSTAND-UAT-20260727-11.110-RC2`  
**Trạng thái:** `READY_FOR_APPLY`  
**Môi trường đích bắt buộc:** database `medtest`

**Cập nhật thủ công:** người triển khai xác nhận đã import `API_DonHang_AI.sql` và `API_HoaDon_AI.sql` bản RC2. Trạng thái hiện là `USER_REPORTED_VERIFICATION_PENDING`; chưa có output DB để nâng thành `RUNTIME_PASS`.

## 1. Kết quả chuẩn bị

Đã tạo script triển khai có kiểm soát:

`scripts/deploy_uat_sql.ps1`

Script thực hiện:

1. Kiểm tra `sqlcmd` có sẵn.
2. Kiểm tra đủ 16/16 file SQL.
3. So sánh SHA-256 của từng file với release manifest.
4. Chặn chạy nếu database đích không phải `medtest`.
5. Chạy pre-deploy verification chỉ đọc.
6. Xuất definition hiện tại của 15 procedure làm bằng chứng rollback.
7. Import 15 procedure và bootstrap metadata đúng thứ tự.
8. Dừng ngay khi `sqlcmd` trả lỗi.
9. Chạy post-deploy verification.
10. Kiểm tra object tồn tại, `modify_date`, definition hash và API metadata bắt buộc.
11. Lưu toàn bộ evidence vào `reports/uat-sql-deploy/<timestamp>/`.

## 2. Cách chạy an toàn

### Chỉ kiểm tra local, không kết nối DB

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy_uat_sql.ps1
```

Kết quả mong đợi:

```text
DRY_RUN_OK: MEDSTAND-UAT-20260727-11.110-RC2
Local file existence and SHA-256 checks passed for 16/16 release SQL files.
```

### Chạy bằng Windows authentication

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy_uat_sql.ps1 `
  -Apply `
  -Server "TEN_SQL_SERVER" `
  -Database "medtest" `
  -IntegratedSecurity
```

### Chạy bằng SQL authentication

Không ghi mật khẩu trực tiếp vào tài liệu hoặc commit. Nhập bằng prompt bảo mật:

```powershell
$uatSqlPassword = Read-Host "SQL password" -AsSecureString
powershell -ExecutionPolicy Bypass -File scripts/deploy_uat_sql.ps1 `
  -Apply `
  -Server "TEN_SQL_SERVER" `
  -Database "medtest" `
  -Username "TEN_DANG_NHAP" `
  -Password $uatSqlPassword
```

## 3. Vì sao chưa tự import ở lần chuẩn bị này

Workspace hiện có `sqlcmd`, nhưng không có thông tin kết nối SQL Server trong biến môi trường hoặc `.env.uat.local`. File môi trường hiện chỉ chứa URL/token API kiểm thử, không chứa server/database credential.

Import SQL là thao tác thay đổi database. Không được đoán server hoặc credential vì có nguy cơ chạy nhầm DB. Vì vậy trạng thái đúng là `READY_FOR_APPLY`, chưa phải `DONE`.

## 4. Các lỗi source phát hiện trong lúc chuẩn bị

### SQL-DEPLOY-01 — Hai procedure từng dùng DROP + CREATE — ĐÃ SỬA

**File ảnh hưởng:**

- `sql/Module common - API_DonHang_AI.sql`
- `sql/Module common - API_HoaDon_AI.sql`

**Nguyên nhân cũ:** hai file chưa dùng `CREATE OR ALTER`; script sẽ drop procedure trước khi tạo lại.

**Ảnh hưởng:** nếu lỗi xảy ra sau lệnh DROP và trước CREATE, procedure có thể tạm thời không tồn tại.

**Cách khắc phục đã áp dụng:**

- Bỏ câu `DROP PROCEDURE`.
- Đổi sang `CREATE OR ALTER PROCEDURE` cho cả hai file.
- Cập nhật SHA-256 trong release manifest và script deploy.
- Nâng source candidate từ RC1 lên RC2.
- Vẫn giữ bước backup definition và `sqlcmd -b` để phục vụ rollback nếu lỗi khác xảy ra.

**Kết quả mong đợi:** nếu definition mới bị lỗi compile, batch `CREATE OR ALTER` thất bại và procedure cũ vẫn tồn tại. Cần xác minh hành vi này trên DB UAT trong lần apply thật.

### SQL-DEPLOY-02 — Một số file khóa cứng `USE medtest`

**File ảnh hưởng:**

- `sql/Module 1 - API_GoiYDonHang_AI.sql`
- `sql/Module 2 - API_TuyenBanHang_AI.sql`
- `sql/Module 3 - API_ChamDiemKH_AI.sql`
- `sql/Module common - API_DoanhSo_AI.sql`
- `sql/Module common - API_HoaDon_AI.sql`
- Hai script diagnostics pre/post deploy.

**Nguyên nhân:** database được ghi trực tiếp trong source SQL.

**Ảnh hưởng:** release này chỉ dùng cho database `medtest`.

**Quyết định:** giữ nguyên `USE medtest`. Script cố ý khóa `-Database medtest` và kiểm tra `DB_NAME()` trước khi import. Chủ dự án đã xác nhận đây là hành vi đúng cho UAT hiện tại; mục này không còn được xem là lỗi của release.

**Không cần xử lý trong kế hoạch hiện tại.** Chỉ xem xét tham số hóa database khi có yêu cầu triển khai sang môi trường khác.

### SQL-DEPLOY-03 — Không thể đối chiếu SHA file trực tiếp với definition DB

**Nguyên nhân:** SHA-256 của file SQL và SHA-256 của `OBJECT_DEFINITION` là hai dạng dữ liệu khác nhau. File có `USE`, `GO`, comment và bootstrap nên không thể kỳ vọng hai hash bằng nhau.

**Biện pháp:** evidence ghi đồng thời:

- SHA-256 source file đã khóa trong manifest.
- `modify_date` của object.
- SHA-256 của `OBJECT_DEFINITION` sau import.
- Trạng thái object và API metadata.

**Đề xuất lâu dài:** thêm bảng release ledger lưu `ReleaseId`, `SourceFileSha256`, `AppliedAt`, `AppliedBy`, `ObjectName` sau mỗi deploy. Chưa thêm vào RC2 để tránh mở rộng schema ngoài manifest.

## 5. Kế hoạch xử lý phần còn lại

### Bước A — Khóa source RC2

- Commit hai file SQL đã đổi sang `CREATE OR ALTER` cùng manifest và script deploy.
- Điền full commit SHA mới vào manifest.
- Chạy lại dry-run và kiểm tra 16/16 hash.
- Không deploy từ worktree chưa commit.

### Bước B — Chuẩn bị kết nối và quyền

- Xác định chính xác tên SQL Server chứa DB `medtest`.
- Dùng tài khoản chỉ có quyền cần thiết để alter procedure, chạy bootstrap metadata và đọc system catalog.
- Không ghi password vào Git, Markdown hoặc lệnh lưu trong lịch sử; nhập bằng secure prompt.
- Kiểm tra kết nối read-only trước khi dùng `-Apply`.

### Bước C — Pre-deploy và rollback evidence

- Chạy target check, xác nhận `DB_NAME() = medtest`.
- Chạy `Business_Rule_V1_PreDeploy_Verification.sql`.
- Xuất đầy đủ definition hiện hành của 15 procedure.
- Lưu người chạy, thời gian và thư mục evidence.
- Dừng nếu pre-deploy có `BLOCKED` chưa được đánh giá.

### Bước D — Apply SQL theo manifest

- Chạy `scripts/deploy_uat_sql.ps1 -Apply`.
- Import lần lượt 15 procedure.
- Chạy `Bootstrap_API_Metadata_Auto_AI.sql` cuối.
- Dừng ngay ở file đầu tiên lỗi; không tiếp tục các file sau.

### Bước E — Xác minh sau import

- Chạy post-deploy verification.
- Xác nhận 15/15 procedure còn tồn tại và có definition.
- Đối chiếu `modify_date`, database definition hash và source-file hash trong evidence.
- Xác nhận các API bắt buộc tồn tại, active và trỏ tới procedure có thật.
- Kiểm tra riêng `API_DonHang_AI` và `API_HoaDon_AI` sau thay đổi `CREATE OR ALTER`.

### Bước F — Runtime smoke test và đóng task

- Test một câu doanh số, gợi ý đơn, tuyến, tồn kho, đơn hàng và hóa đơn.
- Xác minh không phát sinh HTTP 500 do SQL definition/metadata.
- Gắn đường dẫn evidence vào backlog.
- Chỉ chuyển `UAT-003` sang `DONE` khi toàn bộ điều kiện mục 7 đạt.

## 5. File bị ảnh hưởng

### File triển khai mới

- `scripts/deploy_uat_sql.ps1`
- `docs/UAT-003_SQL_DEPLOYMENT_2026-07-27.md`

### File SQL được import

Danh sách 16 file và SHA-256 nằm tại:

`release/UAT_MANIFEST_2026-07-27_11.110.md`

### Evidence sinh ra sau khi chạy thật

- `00-target-check.txt`
- `01-predeploy.txt`
- `02-before-object-definitions.txt`
- Log riêng cho từng file SQL.
- `30-postdeploy-business-rule.txt`
- `31-release-verification.sql`
- `32-release-verification.txt`
- `deploy-summary.json`

## 6. Điều kiện chuyển UAT-003 sang DONE

- Script chạy thật trên `medtest` không có lỗi.
- Có evidence directory của lần chạy.
- Target check xác nhận đúng database và tài khoản thực thi.
- 15/15 procedure có definition sau import.
- Bootstrap metadata chạy thành công.
- Danh sách API bắt buộc không thiếu, không inactive và không trỏ tới procedure không tồn tại.
- Post-deploy verification không có trạng thái `FAIL` chưa được xử lý.
- Smoke test API sau import không có lỗi 500 do SQL definition.

## 7. Thông tin còn thiếu để chạy

Cần cung cấp một trong hai:

- Tên SQL Server và quyền Windows authentication truy cập `medtest`; hoặc
- Tên SQL Server, SQL username và password nhập qua secure prompt.

Không gửi hoặc lưu mật khẩu vào file Markdown, Git hoặc nội dung chat nếu có thể tránh được.

## 8. Kiểm tra riêng hai file vừa import

Chạy file read-only:

```text
sql/diagnostics/UAT_RC2_DonHang_HoaDon_Verification.sql
```

Kết quả đạt yêu cầu khi:

- `DATABASE_TARGET = PASS`.
- Hai dòng `DefinitionStatus = PASS`.
- Tất cả tham số bắt buộc có `Status = PASS`.
- `BRACKET_SUBSTRING_GUARD = PASS`.
- `TEMP_TABLE_GUARD = PASS`.
- Hai dòng `API_METADATA = PASS`.
- `VERIFICATION_SUMMARY = PASS_SOURCE_MARKERS`.

Hai procedure không đổi chữ ký API, nên nếu `API_METADATA` đã `PASS` thì không cần chạy lại bootstrap chỉ vì đổi `DROP + CREATE` thành `CREATE OR ALTER`.

## 9. Kiểm tra toàn bộ 16 file bằng một lệnh SQL

Chạy file read-only:

```text
sql/diagnostics/UAT_RC2_All_16_SQL_Verification.sql
```

Script kiểm tra:

- Đúng database `medtest`.
- 15/15 procedure tồn tại.
- Definition chứa marker sửa lỗi RC2 tương ứng.
- `modify_date` và definition hash của từng procedure.
- 15 API metadata tồn tại, active và trỏ đúng procedure.
- Bảy thành phần bootstrap/metadata bắt buộc tồn tại.
- Bootstrap có marker guard `#AI_META` của bản mới.

Ngoại lệ thiết kế hợp lệ: file `API_DanhMuc_AI.sql` tạo procedure lõi `API_DanhMuc_Core_AI`, trong khi metadata `@danh_muc` phải trỏ tới proxy `API_DanhMuc_AI` do bootstrap sinh. Script đã tách hai tên này để không báo nhầm `FAIL_WRONG_PROCEDURE`.

Kết quả cuối đạt yêu cầu khi:

```text
Status = PASS_ALL_16_SOURCE_AND_METADATA_CHECKS
ProcedureFailures = 0
MetadataFailures = 0
BootstrapFailures = 0
```

Lưu ý: đây là kiểm tra definition/source marker và metadata. Vẫn cần smoke test runtime để chứng minh kết quả nghiệp vụ chạy đúng.
