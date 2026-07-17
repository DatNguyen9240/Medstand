# Cấu trúc thư mục triển khai Business Rule v1 với 2 Agent

**Áp dụng cùng:** `KE_HOACH_TRIEN_KHAI_BUSINESS_RULE_V1_2_AGENT.md`  
**Mục tiêu:** Khóa rõ vị trí làm việc, file ownership, test, contract, fixture và báo cáo để hai Agent chạy song song không ghi đè nhau.

## 1. Cấu trúc worktree bên ngoài repository

```text
C:\Users\Legion\Desktop\AI Nhà Thuốc\
│
├─ Medstand\                         # Coordinator / nhánh tích hợp
│  └─ branch: <current-integration-branch>
│
├─ Medstand-agent-a\                 # Agent A — Backend/Data/n8n
│  └─ branch: agent-a/business-rule-backend
│
└─ Medstand-agent-b\                 # Agent B — Frontend/UX/E2E
   └─ branch: agent-b/business-rule-frontend
```

Quy định:

- Ba worktree cùng xuất phát từ một `BASE_COMMIT`.
- Agent A và B không thao tác trong worktree Coordinator.
- Không tự merge/rebase/pull giữa lúc thực hiện.
- Coordinator merge và xử lý conflict.
- Không force-push.

## 2. Cấu trúc điều phối trong repository

```text
Medstand/
├─ docs/
│  ├─ BUSINESS_RULE_BASELINE_V1.md
│  ├─ PHAN_TICH_BAO_CAO_CURRENT_STATE_2026-07-17.md
│  ├─ BAO_CAO_DANH_GIA_HE_THONG_VS_YEU_CAU_KHACH_HANG_2026-07-17.md
│  ├─ KE_HOACH_TRIEN_KHAI_BUSINESS_RULE_V1_2_AGENT.md
│  └─ CAU_TRUC_THU_MUC_2_AGENT_BUSINESS_RULE_V1.md
│
├─ tasks/
│  └─ business-rule-v1/                         # Tạo mới khi bắt đầu
│     ├─ BASE_COMMIT.txt                         # Coordinator
│     ├─ OWNERSHIP.md                            # Coordinator
│     ├─ AGENT_A_ASSIGNMENT.md                   # Prompt/phạm vi Agent A
│     ├─ AGENT_B_ASSIGNMENT.md                   # Prompt/phạm vi Agent B
│     ├─ CONTRACT_CHANGE_REQUEST.md              # Mẫu đề nghị đổi contract
│     ├─ DECISION_LOG.md                         # Quyết định Coordinator
│     └─ MERGE_CHECKLIST.md                      # Checklist tích hợp
│
└─ reports/
   └─ business-rule-v1/                          # Artifact mới, không chứa secret
      ├─ contracts/
      ├─ fixtures/
      ├─ agent-a/
      ├─ agent-b/
      ├─ integration/
      └─ uat/
```

## 3. Contract và fixture do Coordinator sở hữu

```text
reports/business-rule-v1/
├─ contracts/
│  ├─ contract-pack-v1.draft.json
│  ├─ api-catalog-v1.draft.json
│  ├─ contract-pack-v1.final.json
│  ├─ api-catalog-v1.final.json
│  ├─ contract-checksum.txt
│  └─ contract-changelog.md
│
├─ fixtures/
│  ├─ manager.json
│  ├─ tdv.json
│  ├─ guest.json
│  ├─ dashboard-kpi.json
│  ├─ recommendation-customer-history.json
│  ├─ recommendation-new-customer.json
│  ├─ stock-available.json
│  ├─ route-priority.json
│  ├─ customer-tier-risk.json
│  ├─ loyalty-active-program.json
│  ├─ promotion-expired.json
│  ├─ empty-states.json
│  └─ error-states.json
│
└─ integration/
   ├─ compatibility-report.json
   ├─ compatibility-report.md
   ├─ api-runtime-evidence.json
   └─ ui-api-evidence.json
```

### Quy tắc contract

- Agent không sửa trực tiếp file trong `contracts/` và `fixtures/`.
- Phát hiện sai thì ghi yêu cầu vào `tasks/business-rule-v1/CONTRACT_CHANGE_REQUEST.md`.
- Draft: `1.0.0-draft`, `FROZEN_FOR_IMPLEMENTATION`.
- Final: `1.0.0`, `APPROVED`, có SHA-256 checksum.
- Fixture không chứa token, mật khẩu, số điện thoại đầy đủ hoặc dữ liệu khách thật.

## 4. Cấu trúc Agent A — Backend, Data và n8n

### 4.1. SQL được phép sửa

```text
sql/
├─ Module 1 - API_GoiYDonHang_AI.sql
├─ Module 3 - API_ChamDiemKH_AI.sql
├─ Module 4 - API_TichLuy_AI.sql
├─ Module 5 - API_UpsellGoiY_AI.sql
├─ Module 6 - API_DeXuatKhuyenMai_AI.sql
├─ Module common - API_DoanhSo_AI.sql
├─ Module common - API_DanhsachTonKho_AI.sql
├─ Migrate_API_Capability_Metadata_AI.sql         # Chỉ khi contract/scope cần
├─ Migrate_API_Metadata_Contract_V1_AI.sql        # Chỉ migration mới, không sửa lịch sử đã chạy
├─ Migrate_API_Request_Audit_AI.sql               # Chỉ khi audit contract cần
└─ business-rules/                                # Tạo mới cho migration/config v1
   ├─ 001_Create_BusinessRuleConfig_V1.sql
   ├─ 002_Create_WarehouseScope_V1.sql
   ├─ 003_Create_ProgramStatus_V1.sql
   ├─ 004_Create_TierRiskConfig_V1.sql
   └─ 005_Verify_BusinessRule_V1.sql
```

### 4.2. Tuyến bán hàng đã được thống nhất bản canonical

Sử dụng phiên bản nâng cấp có tọa độ và đổi tên đồng nhất:

```text
sql/Module 2 - API_TuyenBanHang_AI.sql
```

Phiên bản cũ đã được dọn dẹp để tránh xung đột.

### 4.3. SQL không được sửa

```text
sql/Add_UAT_*.sql
sql/Insert_Mock_*.sql
sql/Cleanup_All_Tables_AI.sql
sql/Module common - Khao sat - Full_API_AI.sql
sql/Module common - API_KhachHang_Insert_AI.sql
sql/Module common - API_DonHangChiTiet_Insert_AI.sql
sql/Module 10 - API_SanPhamTrongTam_Import_AI.sql
```

Không sửa seed/mock/mutation/khảo sát nếu không có task riêng được duyệt.

### 4.4. n8n Agent A sở hữu

```text
n8n/
├─ AI_Core/
│  ├─ MAIN_ChatBot_V5.json
│  ├─ AI_Intent_Parser.json            # Chỉ khi thực sự được runtime gọi
│  └─ AI_RAG_Query.json                # Chỉ nếu contract sản phẩm yêu cầu
│
├─ API_Services/
│  ├─ API_Execute.json
│  ├─ API_GetConfig.json
│  ├─ API_ListActive.json
│  ├─ API_DataSource.json
│  └─ API_SystemMeta.json
│
└─ Shared/
   ├─ Shared_Auth_Guard.json
   └─ <migration/verification workflow mới của Business Rule v1>
```

Agent B không sửa bất kỳ file nào dưới `n8n/`.

### 4.5. Test Agent A

```text
tests/
├─ api/
│  ├─ revenue-net.contract.test.js
│  ├─ available-stock.contract.test.js
│  ├─ recommendation.contract.test.js
│  ├─ route-priority.contract.test.js
│  ├─ tier-risk.contract.test.js
│  └─ loyalty-program.contract.test.js
│
├─ contracts/
│  ├─ api-catalog.test.js
│  ├─ response-envelope.test.js
│  ├─ error-taxonomy.test.js
│  └─ contract-checksum.test.js
│
└─ security/
   ├─ guest-denied.test.js
   ├─ manager-scope.test.js
   ├─ tdv-scope.test.js
   ├─ mutation-denied.test.js
   └─ audit-redaction.test.js
```

Nếu tái sử dụng test hiện có dưới `scripts/`, Agent A chỉ sửa các file test API/security được Coordinator liệt kê trong `OWNERSHIP.md`; không nhận toàn bộ `scripts/**`.

### 4.6. Báo cáo Agent A

```text
reports/business-rule-v1/agent-a/
├─ backend-rule-summary.md
├─ backend-rule-test.json
├─ sql-test-evidence.json
├─ api-contract-evidence.json
├─ security-scope-evidence.json
├─ audit-evidence.json
├─ changed-files.txt
├─ known-gaps.md
└─ handoff-to-agent-b.md
```

## 5. Cấu trúc Agent B — Frontend, UX và E2E

### 5.1. Chatbot source được phép sửa

```text
chatbot-widget/
├─ js/
│  ├─ chatbot.js
│  ├─ chatbot-api-engine.js
│  ├─ chatbot-renderers-medstand.js
│  └─ chatbot-suggestions.js             # Chỉ khi có task label/suggestion
│
├─ template/
│  └─ chatbot.html
│
└─ css/
   ├─ chatbot.css
   └─ chatbot-api-engine.css
```

### 5.2. Dashboard/page source được phép sửa

```text
src/
├─ templates/
│  ├─ home.html
│  ├─ revenue.html
│  ├─ routes.html
│  ├─ notifications.html
│  └─ customer-management.html
│
├─ js/
│  ├─ pages/
│  │  ├─ home.js
│  │  ├─ revenue.js
│  │  ├─ routes.js
│  │  ├─ notifications.js
│  │  └─ customer-management.js
│  ├─ schemas/
│  │  └─ dashboard.schema.js
│  └─ services/
│     ├─ dashboard.service.js            # Chỉ mapping contract, không tự phân quyền
│     ├─ sales.service.js
│     └─ other.service.js
│
└─ css/
   └─ pages/
      ├─ home.css
      ├─ revenue.css
      ├─ routes.css
      ├─ notifications.css
      └─ customer-management.css
```

Agent B không mặc định sở hữu toàn bộ `src/**`; chỉ các file có trong ownership manifest.

### 5.3. File generated không được sửa trực tiếp

```text
chatbot-widget/js/*.bundle.min.js
chatbot-widget/css/dist/**
src/js/dist/**
src/css/dist/**
```

Agent B sửa source. Coordinator chạy build cuối và kiểm tra bundle diff.

### 5.4. Test Agent B

```text
tests/
├─ ui/
│  ├─ dashboard-kpi.spec.ts
│  ├─ dashboard-empty-error.spec.ts
│  ├─ chatbot-product-symptom.spec.ts
│  ├─ chatbot-recommendation.spec.ts
│  ├─ chatbot-tier-risk.spec.ts
│  ├─ chatbot-loyalty.spec.ts
│  ├─ chatbot-theme.spec.ts
│  └─ chatbot-double-submit.spec.ts
│
└─ e2e/
   ├─ guest.spec.ts                      # Có sẵn, chỉ mở rộng theo ownership
   ├─ role-scope.spec.ts                 # UI visibility, không thay API security test
   ├─ read-command-matrix.spec.ts
   ├─ catalog-matrix.spec.ts
   ├─ business-rule-manager.spec.ts
   ├─ business-rule-tdv.spec.ts
   └─ helpers.ts
```

### 5.5. Mock adapter Agent B

Không hardcode fixture trong source production. Mock chỉ nằm trong test:

```text
tests/
└─ mocks/
   └─ business-rule-v1/
      ├─ contract-loader.ts
      ├─ api-routes.ts
      └─ fixture-loader.ts
```

`fixture-loader.ts` chỉ đọc `reports/business-rule-v1/fixtures/*.json`.

### 5.6. Báo cáo Agent B

```text
reports/business-rule-v1/agent-b/
├─ frontend-rule-summary.md
├─ frontend-rule-test.json
├─ mock-playwright-report.json
├─ integration-playwright-report.json
├─ screenshots/
├─ traces/
├─ console-errors.json
├─ changed-files.txt
├─ known-gaps.md
└─ handoff-to-agent-a.md
```

## 6. Package/build do Coordinator sở hữu

```text
package.json
package-lock.json
scripts/build.js
playwright.config.*
tests/global-setup.ts
```

Trước khi giao Agent, Coordinator chuẩn bị sẵn:

```text
npm.cmd run build
npm.cmd run test:guest
npm.cmd run test:manager
npm.cmd run test:tdv
npm.cmd run test:all
```

Nếu Agent B cần đổi package/script, tạo:

```text
reports/business-rule-v1/agent-b/package-change-request.patch
reports/business-rule-v1/agent-b/package-change-request.md
```

Coordinator review và áp dụng; Agent B không sửa package/lockfile trực tiếp.

## 7. Cấu trúc UAT của người dùng

```text
reports/business-rule-v1/uat/
├─ UAT_ROUND_1_FOUNDATION.md
├─ UAT_ROUND_1_RESULTS.json
├─ UAT_ROUND_2_RECOMMENDATION.md
├─ UAT_ROUND_2_RESULTS.json
├─ manager/
│  ├─ screenshots/
│  └─ notes.md
├─ tdv/
│  ├─ screenshots/
│  └─ notes.md
└─ UAT_BUSINESS_RULE_V1_USER_SIGNOFF.md
```

Vòng 1 kiểm tra doanh số, tồn, scope, Tier/Risk, empty/error và mapping chatbot. Vòng 2 kiểm tra gợi ý đơn hàng, tuyến, tích lũy, số lượng, giỏ nháp và chương trình.

## 8. Ownership manifest mẫu

`tasks/business-rule-v1/OWNERSHIP.md` phải có bảng:

| Path | Owner | Read | Write | Generated | Ghi chú |
|---|---|---:|---:|---:|---|
| `sql/Module 1 - API_GoiYDonHang_AI.sql` | Agent A | Có | Có | Không | Rule gợi ý |
| `n8n/AI_Core/MAIN_ChatBot_V5.json` | Agent A | Có | Có | Không | Intent/context/normalization |
| `chatbot-widget/js/chatbot.js` | Agent B | Có | Có | Không | UI flow |
| `src/js/pages/home.js` | Agent B | Có | Có | Không | Dashboard |
| `reports/business-rule-v1/contracts/**` | Coordinator | Có | Không | Không | Frozen contract |
| `package.json` | Coordinator | Có | Không | Không | Agent gửi change request |
| `src/js/dist/**` | Coordinator/build | Có | Không | Có | Không sửa tay |

Mọi path không có trong manifest mặc định là **read-only** đối với cả hai Agent.

## 9. Thứ tự merge theo thư mục

1. Coordinator kiểm tra `changed-files.txt` của Agent A.
2. Merge SQL/n8n/test API/report Agent A.
3. Chạy Contract Final/checksum.
4. Cập nhật có kiểm soát worktree Agent B.
5. Agent B chạy integration, chỉ sửa frontend/test UI.
6. Merge frontend/test UI/report Agent B.
7. Coordinator build generated assets.
8. Chạy regression tổng và UAT.

## 10. Cấu trúc cuối cùng sau khi hoàn tất

```text
Medstand/
├─ docs/                                      # Baseline, plan, current state, gap analysis
├─ tasks/business-rule-v1/                    # Ownership, assignment, decisions, merge checklist
├─ sql/                                       # Canonical SP + migration v1
├─ n8n/                                       # Workflow backend/intent/contract
├─ chatbot-widget/                            # Chatbot source
├─ src/                                       # Dashboard/page source
├─ tests/
│  ├─ api/
│  ├─ contracts/
│  ├─ security/
│  ├─ mocks/
│  ├─ ui/
│  └─ e2e/
└─ reports/business-rule-v1/
   ├─ contracts/
   ├─ fixtures/
   ├─ agent-a/
   ├─ agent-b/
   ├─ integration/
   └─ uat/
```

Đây là cấu trúc mục tiêu. Những thư mục mới chỉ được tạo khi bắt đầu triển khai; tài liệu này chưa tự động di chuyển file hiện hữu hoặc thay đổi build/runtime.
