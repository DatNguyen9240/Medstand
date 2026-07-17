# Medstand documentation

## Tài liệu đang dùng

- [`BAO_CAO_CURRENT_STATE_BASELINE_2026-07-17.md`](BAO_CAO_CURRENT_STATE_BASELINE_2026-07-17.md): báo cáo đánh giá hiện trạng và baseline định hướng hệ thống.
- [`BUSINESS_RULE_BASELINE_V1.md`](BUSINESS_RULE_BASELINE_V1.md): cơ sở nghiệp vụ và danh sách quy tắc bán hàng (Business Rules).
- [`remediation/CHATBOT_API_REMEDIATION_EXECUTION_TRACKER.md`](remediation/CHATBOT_API_REMEDIATION_EXECUTION_TRACKER.md): tracker sửa lỗi Chatbot API, hiện đạt 14/14.
- [`remediation/KE_HOACH_FIX_CHATBOT_API_2026-07-15.md`](remediation/KE_HOACH_FIX_CHATBOT_API_2026-07-15.md): kế hoạch sửa lỗi chatbot kỹ thuật và dependencies.
- [`remediation/BAO_CAO_7_LOI_CHATBOT_ANALYSIS_2026-07-17.md`](remediation/BAO_CAO_7_LOI_CHATBOT_ANALYSIS_2026-07-17.md): báo cáo chi tiết nguyên nhân gốc và kế hoạch kiểm thử 7 lỗi chatbot.
- [`KICH_BAN_TEST_CHATBOT_TOAN_BO_API.md`](KICH_BAN_TEST_CHATBOT_TOAN_BO_API.md): kịch bản test toàn bộ API chatbot.
- [`UAT_TEST_ACCOUNTS.md`](UAT_TEST_ACCOUNTS.md): danh sách tài khoản phục vụ chạy UAT.
- [`uat/scenarios/KICH_BAN_UAT_29_CASE_24_MENU_CHATBOT.md`](uat/scenarios/KICH_BAN_UAT_29_CASE_24_MENU_CHATBOT.md): 29 kịch bản chi tiết cho 24 mục menu hiện hành.

## Phân loại thư mục

- `remediation/`: kế hoạch, tracker và phân tích lỗi chatbot (chứa thư mục con `archive/` cho tài liệu cũ).
- `uat/scenarios/`: các kịch bản và bộ lệnh kiểm thử nghiệm thu (UAT Playbooks).
- `uat/archive/`: các báo cáo kết quả UAT lịch sử cũ.
- `manual/`: tài liệu hướng dẫn sử dụng và nguồn mã LaTeX.
- `../reports/`: chứa các bằng chứng kiểm thử (evidence), contract json và kết quả test máy đọc (đã phân loại).
- `../tasks/chatbot-remediation/`: danh sách lỗi & tiêu chí nghiệm thu chi tiết của từng task sửa chữa.

Không đặt log, token, mật khẩu hoặc output test tạm trong thư mục tài liệu.
