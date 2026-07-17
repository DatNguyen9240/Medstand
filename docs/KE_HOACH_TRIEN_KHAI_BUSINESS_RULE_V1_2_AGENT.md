# Kế hoạch triển khai Business Rule Baseline v1 — 2 Agent không chồng lấn

**Ngày lập:** 17/07/2026  
**Mục tiêu:** Đưa các quyết định trong `BUSINESS_RULE_BASELINE_V1.md` vào hệ thống theo hai luồng độc lập, có báo cáo, tự kiểm thử và UAT người dùng.  
**Nguyên tắc:** Không hai Agent cùng sửa một file; không sửa production/mutation thật trong giai đoạn đầu; mọi thay đổi phải có bằng chứng test.

**Cấu trúc thư mục và ownership chi tiết:** [`CAU_TRUC_THU_MUC_2_AGENT_BUSINESS_RULE_V1.md`](CAU_TRUC_THU_MUC_2_AGENT_BUSINESS_RULE_V1.md)

## 1. Phân chia tổng thể

```text
Coordinator khóa Draft Contract + fixture + base commit
          │
          ├── Agent A: Backend/Data/n8n chạy theo Draft Contract
          │
          └── Agent B: Dashboard/Chatbot/UX chạy mock theo Draft Contract
                                      │
                                      ▼
                         Contract Final + Integration thật
```

### Agent A — Business Rule/Data/Backend

Chịu trách nhiệm biến Rule v1 thành dữ liệu và contract có thể thực thi:

- Doanh số hóa đơn hợp lệ, trả hàng, hủy, VAT.
- Chu kỳ mua khách–sản phẩm và fallback.
- Tồn khả dụng, warehouse scope, độ mới dữ liệu.
- Lâu chưa ghé/lâu chưa mua và ranking tuyến.
- `CustomerTier` tách khỏi `RiskLevel`.
- Chương trình `APPROVED + ACTIVE`, version/effective date.
- Empty/error/permission response contract.
- Capability, validation trước SQL, request ID và audit.

### Agent B — Dashboard/Chatbot/UX

Chịu trách nhiệm đưa contract đã khóa lên trải nghiệm người dùng:

- KPI dashboard và nhãn nguồn dữ liệu.
- Card/empty/error/loading state.
- Chatbot command/menu, context và placeholder.
- Hiển thị lý do, thời gian dữ liệu, rule version.
- Gợi ý đơn hàng, tuyến, tích lũy và phân loại/risk ở UI.
- Tách rõ tra cứu sản phẩm và tìm theo triệu chứng.
- Không tạo mutation thật; chỉ chuẩn bị giỏ nháp sau xác nhận nếu contract cho phép.

## 2. Quy tắc không chồng lấn file

### Vùng sở hữu Agent A

- Các stored procedure/migration được liệt kê trong ownership manifest, không giao toàn bộ `sql/**`.
- `sql/Module 1 - API_GoiYDonHang_AI.sql`.
- SQL doanh số, tồn kho, tuyến, chấm điểm, tích lũy và chương trình được chỉ định cụ thể trước khi chạy.
- `n8n/API_Services/**`.
- `n8n/Shared/**`.
- `n8n/AI_Core/MAIN_ChatBot_V5.json` toàn bộ phần intent, context, validation và response normalization.
- `docs/BUSINESS_RULE_BASELINE_V1.md` chỉ cập nhật khi có quyết định nghiệp vụ mới được duyệt.
- `tests/api/**`, `tests/contracts/**`, `tests/security/**`.
- `reports/backend-rule-*.json`, `reports/backend-rule-*.md`

### Vùng sở hữu Agent B

- `chatbot-widget/js/chatbot-api-engine.js`
- `chatbot-widget/js/chatbot.js`
- `chatbot-widget/js/chatbot-renderers-medstand.js`
- `chatbot-widget/template/chatbot.html`
- Các file CSS chatbot được chỉ định cụ thể trong ownership manifest.
- `src/templates/home.html`
- `src/js/pages/home.js`
- `src/js/pages/revenue.js`
- `src/js/pages/routes.js`
- `src/js/pages/notifications.js`
- `src/js/pages/customer-management.js`
- `src/js/pages/order-report.js`
- Các file CSS dashboard được chỉ định cụ thể.
- `tests/ui/**`, `tests/e2e/**`.
- `reports/frontend-rule-*.json`, `reports/frontend-rule-*.md`

### Vùng chỉ Coordinator được sửa

- `docs/PHAN_TICH_BAO_CAO_CURRENT_STATE_2026-07-17.md`
- `docs/BAO_CAO_DANH_GIA_HE_THONG_VS_YEU_CAU_KHACH_HANG_2026-07-17.md`
- `docs/remediation/**`
- `package.json`, lockfile, build config.
- Bundle/minified/generated assets; Agent B chỉ sửa source, Coordinator chạy build cuối.
- API catalog snapshot hợp nhất.
- Contract Pack sau khi Agent A bàn giao.

Nếu Agent phát hiện cần sửa file ngoài vùng sở hữu, phải ghi vào báo cáo và chờ Coordinator; không tự sửa chéo.

## 3. Contract Pack dùng chung

Coordinator tạo **Draft Contract trước khi hai Agent bắt đầu**:

```text
reports/contract-pack-business-rule-v1.draft.json
reports/api-catalog-business-rule-v1.draft.json
reports/rule-fixtures-business-rule-v1.json
```

Draft Contract có:

```text
contractVersion: 1.0.0-draft
status: FROZEN_FOR_IMPLEMENTATION
```

Contract Pack tối thiểu có:

- Rule ID, input, output, enum, validation và error code.
- ApiCode chính thức, `Active`, `Visible`, `Read/Mutation`, `Legacy`.
- Field `CustomerTier`, `RiskLevel`, `AvailableStock`, `StockUpdatedAt`.
- `ProgramStatus`, `EffectiveFrom`, `EffectiveTo`, `RuleVersion`.
- Empty state: `NO_DATA`, `OUT_OF_SCOPE`, `VALIDATION_ERROR`, `SYSTEM_ERROR`.
- Fixture không chứa token, mật khẩu, số điện thoại đầy đủ hoặc dữ liệu thật nhạy cảm.

Agent B chỉ tích hợp theo Contract Pack, không tự suy đoán tên field hay công thức.

Trong lúc triển khai, không Agent nào được tự đổi field/API/error code. Nếu phát hiện sai, tạo:

```text
reports/contract-change-request.md
```

Chỉ Coordinator được duyệt thay đổi. Sau khi hai Agent hoàn tất:

```text
contractVersion: 1.0.0
status: APPROVED
checksum: <sha256>
```

## 3.1. Git/worktree bắt buộc

Hai Agent bắt đầu từ cùng một base commit:

```text
base commit: <SHA>
worktree-agent-a/  branch: agent-a/business-rule-backend
worktree-agent-b/  branch: agent-b/business-rule-frontend
```

- Không tự `pull`, `merge`, `rebase` hoặc force-push.
- Commit nhỏ theo nhóm rule.
- Agent không sửa file ngoài ownership.
- Coordinator merge Agent A trước, sau đó cập nhật có kiểm soát cho Agent B integration.
- Conflict chỉ Coordinator xử lý.

## 4. Kế hoạch theo giai đoạn

### Giai đoạn 0 — Coordinator chuẩn bị (không giao trùng)

1. Đóng băng baseline nghiệp vụ hiện tại.
2. Chụp trạng thái git/build/workflow/SQL trước khi sửa.
3. Tạo danh sách file ownership ở mục 2.
4. Chuẩn bị fixture Manager/TDV/guest và dữ liệu không nhạy cảm.
5. Tạo Draft Contract, API catalog draft và fixture trước khi giao việc.
6. Chuẩn bị sẵn script `npm.cmd run build`, `npm.cmd run test:guest`, `npm.cmd run test:manager`, `npm.cmd run test:tdv`, `npm.cmd run test:all`.
7. Chốt cách chạy test Windows: dùng `npm.cmd`, không dùng `npm.ps1` nếu bị policy.

**Gate 0:** Hai Agent xác nhận phạm vi file không giao nhau.

### Giai đoạn 1A — Agent A xây backend rule contract (chạy song song với 1B)

#### A1. Chuẩn hóa doanh số

- Tách hóa đơn hợp lệ, trả hàng, hủy, điều chỉnh giảm.
- Gắn quy tắc chưa VAT cho KPI/chấm điểm/tích lũy.
- Không dùng đơn hàng chưa giao làm doanh số chính thức.

#### A2. Chuẩn hóa tồn kho và scope

- Xác định kho chính/`DL02`/`DL03`.
- Tính tồn khả dụng, reservation, blocked, expired.
- Trả `StockUpdatedAt` và warehouse scope.
- Fail-closed nếu identity/scope thiếu.

#### A3. Chuẩn hóa gợi ý và tuyến

- Chu kỳ theo khách–sản phẩm, fallback và confidence.
- Tách `LastVisitAt` khỏi `LastPurchaseAt`.
- Xếp hạng 5–8 khách, không sửa tuyến chính.

#### A4. Chuẩn hóa tier/risk và chương trình

- Tách `CustomerTier`/`RiskLevel`.
- Đưa threshold ra config có version/effective date.
- Chỉ dùng chương trình `APPROVED + ACTIVE`.
- Xử lý hết hạn/chồng lấn/stackable.

#### A5. Contract, authorization và audit

- Validation trước SQL, HTTP 422.
- Error taxonomy thống nhất.
- Request ID/correlation/audit.
- Mutation không chạy nếu thiếu capability/idempotency.

Khi rule thiếu hoặc mâu thuẫn, Agent A phải ghi `BUSINESS_DECISION_REQUIRED`, không tự chọn công thức và không hardcode.

**Đầu ra Agent A:**

- SQL/n8n patch trong đúng vùng sở hữu.
- `reports/backend-rule-summary.md`.
- `reports/backend-rule-test.json`.
- Contract Pack draft.
- Danh sách known gaps/blockers.

### Giai đoạn 1B — Agent B xây UI theo mock fixture (chạy song song với 1A)

Agent B không chờ API thật. Dùng `reports/rule-fixtures-business-rule-v1.json` để triển khai:

- Dashboard KPI và nhãn nguồn/thời điểm dữ liệu.
- Chatbot menu/placeholder/mapping theo Draft Contract.
- Gợi ý đơn hàng, tuyến, tích lũy, Tier/Risk và chương trình.
- Empty/error/loading và accessibility.
- Không tự sửa công thức hoặc API field khi response mock thiếu.
- Nếu phát hiện contract sai, tạo `reports/contract-change-request.md`.

**Đầu ra Agent B:**

- Frontend patch đúng vùng sở hữu.
- `reports/frontend-rule-summary.md`.
- `reports/frontend-rule-test.json`.
- Screenshot/trace/console từ mock đã che dữ liệu nhạy cảm.

### Giai đoạn 2A — Agent A tự kiểm thử

Agent A phải chạy:

- SQL static/lint và `git diff --check`.
- Contract test cho valid/invalid/empty/date range/TopN.
- Scope test Manager/TDV/guest.
- Test `NO_DATA` không biến thành lỗi hệ thống.
- Test dữ liệu ngoài scope không xuất hiện.
- Test mutation bị chặn và không ghi DB.
- Test request ID/audit có mặt nhưng không log bí mật.
- Procedure test với fixture sandbox, không dùng dữ liệu thật.

**Gate A:** Không có lỗi P0/P1; Contract Pack có checksum/version; report chỉ rõ test nào PASS/FAIL/BLOCKED.

### Giai đoạn 2B — Agent B tự kiểm thử mock

#### B1. Dashboard

- Hiển thị KPI theo rule version và khoảng dữ liệu.
- Gắn nguồn/thời điểm cập nhật cho doanh số, tồn kho, chỉ tiêu.
- Tách `NO_DATA`, `OUT_OF_SCOPE`, `SYSTEM_ERROR`.
- Widget tuyến hiển thị “đề xuất ưu tiên”, không gọi là tối ưu đường đi.
- Widget tier/risk hiển thị hai trường độc lập.

#### B2. Chatbot

- Menu/intent/API code đúng Contract Pack.
- `Tra cứu sản phẩm` khác `Tìm thuốc theo triệu chứng`.
- Gợi ý đơn hàng hiển thị customer, sản phẩm, tồn khả dụng, lý do, confidence.
- Tích lũy hiển thị đạt/còn thiếu/chương trình/version.
- Chương trình hết hạn không hiển thị như đang áp dụng.
- Không tự tạo đơn; giỏ nháp chỉ sau confirm.
- Cảnh báo y tế đúng ngữ cảnh.

#### B3. Accessibility và responsive

- Keyboard: Tab, Arrow, Enter, Escape.
- Loading/empty/error/success không chồng nhau.
- Light/Dark.
- Desktop/mobile.
- Không lộ field kỹ thuật, token hoặc scope nội bộ.

- Build bằng `npm.cmd run build`.
- `git diff --check`.
- Playwright guest/Manager/TDV.
- UI regression dashboard KPI, chatbot menu, gợi ý, tuyến, tích lũy, tier/risk.
- Double-submit và theme.
- Product/symptom mapping.
- Empty/error/loading state.
- Không gọi mutation khi chỉ xem/gợi ý.

**Đầu ra Agent B:**

- Frontend patch đúng vùng sở hữu.
- `reports/frontend-rule-summary.md`.
- `reports/frontend-rule-test.json`.
- Screenshot/trace/console đã che dữ liệu nhạy cảm.
- Danh sách mismatch contract nếu có.

**Gate B:** Build pass, Playwright pass hoặc có blocker ghi rõ; không có lỗi P0/P1 UI; mọi screenshot gắn test case.

### Giai đoạn 3 — Coordinator khóa Contract Final và integration

1. So sánh Agent A với Draft Contract.
2. So sánh UI mock Agent B với API thật.
3. Duyệt hoặc từ chối mọi contract-change-request.
4. Khóa Contract Final/version/checksum.
5. Agent B bỏ mock, chạy integration với API thật.
6. Nếu response lệch contract, trả lỗi về Agent A; không sửa UI để che contract drift.

### Giai đoạn 4 — Coordinator kiểm thử chéo

Coordinator không sửa code ngay; kiểm tra:

1. Agent A có sửa ngoài vùng không.
2. Agent B có dùng field/công thức ngoài Contract Pack không.
3. Contract checksum frontend/backend có khớp không.
4. API catalog và 24 lệnh UAT có cùng một nguồn không.
5. Rule version hiển thị đúng.
6. Runtime auth/capability/audit có evidence trên đúng build không.

Nếu mismatch, trả về đúng Agent sở hữu; không tự phân tán patch sang Agent còn lại.

## 5. Báo cáo bắt buộc của mỗi Agent

Mỗi report phải có:

```text
1. Scope và file đã sửa
2. Rule ID đã triển khai
3. File/hàm/node/SP liên quan
4. Test đã chạy và lệnh chạy
5. PASS/FAIL/BLOCKED cho từng test
6. Evidence path
7. Security/scope impact
8. Data migration impact
9. Known gaps và giả định
10. Handoff request cho Agent kia
```

Không ghi “hoàn tất” nếu chỉ build pass mà chưa test contract/role/business.

## 6. Phần người dùng nghiệm thu

Người dùng kiểm thử trên UAT bằng tài khoản Manager và TDV riêng, không dùng dữ liệu thật. Chia thành hai vòng để lỗi nền tảng không block toàn bộ đề xuất.

### Vòng 1 — Nền tảng nghiệp vụ

- Doanh số và KPI.
- Tồn kho và scope.
- Tier/Risk.
- Empty/error/validation.
- Mapping chatbot sản phẩm/triệu chứng.

### Vòng 2 — Đề xuất

- Gợi ý đơn hàng.
- Tuyến ưu tiên.
- Tích lũy.
- Số lượng tham khảo.
- Giỏ nháp.
- Chương trình và khuyến mại.

### UAT-01 — Dashboard

- Kiểm tra KPI đơn hàng, khách giao dịch, độ phủ, doanh số.
- Đổi kỳ ngày; kiểm tra chart ngày/tuần/tháng/quý.
- Xác nhận doanh số là hóa đơn net chưa VAT theo rule v1.
- Kiểm tra khách cần ghé: phân biệt “lâu chưa ghé” và “lâu chưa mua”.
- Kiểm tra Tier và Risk hiển thị độc lập.
- Kiểm tra thời điểm cập nhật và empty state.

### UAT-02 — Gợi ý đơn hàng

- Chọn một khách có ít nhất 3 lần mua cùng sản phẩm.
- Xác nhận sản phẩm, tồn khả dụng, chu kỳ, lý do và confidence.
- Kiểm tra khách mới không bị đánh nguy cơ.
- Kiểm tra không tạo đơn tự động.

### UAT-03 — Tuyến

- Xác nhận 5–8 khách ưu tiên trong tuyến được giao.
- Kiểm tra khách ngoài tuyến chỉ xuất hiện nếu có lý do và cùng scope.
- Xác nhận hệ thống không tự sửa tuyến chính.

### UAT-04 — Tích lũy/chương trình

- Kiểm tra đạt, còn thiếu, mốc thưởng và ngày hết hạn.
- Dùng chương trình `APPROVED + ACTIVE`.
- Xác nhận chương trình hết hạn không được dùng trong gợi ý.
- Kiểm tra chương trình chồng lấn theo rule.

### UAT-05 — Phân quyền

- TDV không xem khách/kho/nhân viên ngoài scope.
- Manager chỉ xem nhóm/chi nhánh được giao.
- Sửa request thủ công không mở rộng dữ liệu.
- Guest không gọi API nội bộ.

### UAT-06 — Chatbot và an toàn

- `Tra cứu sản phẩm` yêu cầu mã/tên sản phẩm.
- `Tìm thuốc theo triệu chứng` yêu cầu triệu chứng và có cảnh báo.
- Gợi ý số lượng chỉ là tham khảo.
- Giỏ nháp cần xác nhận.
- Không tự áp dụng chiết khấu, không tạo đơn thật.

Người dùng ghi kết quả theo mẫu:

| Case | Tài khoản/vai trò | Kết quả mong đợi | Kết quả thực tế | PASS/FAIL | Ảnh/evidence |
|---|---|---|---|---|---|

## 7. Definition of Done

- [ ] Agent A hoàn tất backend rule và Contract Pack có version/checksum.
- [ ] Agent A có report và test evidence.
- [ ] Agent B tích hợp đúng Contract Pack, không sửa backend.
- [ ] Agent B có report và Playwright evidence.
- [ ] Coordinator kiểm tra không chồng lấn file và contract checksum.
- [ ] Technical PASS, Permission PASS và Business PASS được tách riêng.
- [ ] UAT Manager/TDV của người dùng PASS các case bắt buộc.
- [ ] Không mutation thật/sandbox violation.
- [ ] Bốn nhóm cần ký đã được đánh dấu: doanh số/VAT, kho/scope, chiết khấu, y tế.

## 8. Quy tắc báo cáo và handoff

Mỗi Agent phải báo cáo:

```text
Scope/file đã sửa
Rule ID
Test command và kết quả
Evidence path
Security/scope impact
Data migration impact
Known gaps/assumptions
Handoff request cho Agent còn lại
```

Không ghi “hoàn tất” nếu chỉ build pass mà chưa có contract, role và business evidence.

## 9. Thứ tự báo cáo cuối

1. `reports/backend-rule-summary.md` — Agent A.
2. `reports/frontend-rule-summary.md` — Agent B.
3. `reports/contract-pack-business-rule-v1.json` — Coordinator.
4. `reports/UAT_BUSINESS_RULE_V1_USER_SIGNOFF.md` — người dùng.
5. `docs/MEDSTAND_BUSINESS_GAP_ANALYSIS.md` — gap analysis sau khi UAT.

**Kết quả cuối chỉ được gọi là “đạt nghiệp vụ” khi cả Technical PASS, Permission PASS và Business PASS đều có evidence.**
