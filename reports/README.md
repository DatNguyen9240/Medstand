# Test evidence

Thư mục này lưu bằng chứng kiểm thử không chứa credential hoặc dữ liệu nghiệp vụ chi tiết:

- `prepublish-*`, `postpublish-*`: snapshot workflow phục vụ rollback/đối chiếu.
- `p1-*`, `p2-*`: kết quả UAT theo task.
- `*-regression*`: kết quả regression sinh từ scripts.
- `P2_UAT_SUMMARY_2026-07-16.md`: báo cáo P2 tổng hợp.

Log runtime, Playwright HTML report và video/trace tạm đã được ignore; có thể sinh lại bằng các npm gate.
