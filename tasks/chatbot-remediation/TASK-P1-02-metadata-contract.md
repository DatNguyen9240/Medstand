# TASK-P1-02 — Metadata contract và version

**Ưu tiên:** P1  
**Phụ thuộc:** TASK-P1-01  
**Tệp:** `sql/Bootstrap_API_Metadata_Auto_AI.sql` và migration override mới

## Mục tiêu

Khai báo đúng required/default/type/validation cho 28 lệnh mà không bật required hàng loạt.

## Contract trường

- ApiCode, FieldCode, Required, DefaultValue, DataType, ValidationRule.
- SourceOfTruth: TOKEN, SERVER_MAPPING, USER_INPUT, DERIVED, STATIC_DEFAULT, DATASOURCE.
- ContractVersion, UpdatedAt, UpdatedBy.

## Việc cần làm

1. Đối chiếu từng field với SP và nghiệp vụ.
2. Khai báo date range, TopN, paging, enum và server limit.
3. Ẩn system params và không nhận chúng từ client.
4. Thêm version/checksum vào metadata response.
5. Invalidate cache FE/n8n sau migration.

## Tiêu chí nghiệm thu

- 28 contract được owner nghiệp vụ và backend duyệt.
- FE hiển thị required/default đúng.
- Metadata cache đổi version sau migration.
- Backend vẫn validate độc lập với FE.

## Kết quả 2026-07-15

- [x] Bổ sung `SourceOfTruth`, `ValidationRule`, `ContractVersion`, checksum và thông tin cập nhật bằng migration idempotent.
- [x] Giữ required mặc định hiện hữu; chỉ bật ba field có bằng chứng nghiệp vụ rõ ràng.
- [x] System params dùng `SERVER_MAPPING`, datasource dùng `DATASOURCE`; date/range, TopN và paging có validation rule.
- [x] GetConfig trả version/checksum và contract field đã sanitize; FE tự invalid cache khi version đổi, TTL tối đa 5 phút.
- [x] UAT và production đạt 3/3 cho `@cong_no_chi_tiet`, `@hoa_don_chi_tiet`, `@khao_sat360`.
- [x] Regression role Manager/TDV vẫn đạt 46/46.

DB hiện có 36 API active, không còn đúng con số 28 trong kế hoạch ban đầu. Toàn bộ 36 metadata contract được version hóa; runtime vẫn chỉ mở API theo allowlist/capability nên việc version hóa không tự mở thêm quyền.
