# File Ownership — Business Rule v1

**Status:** `GATE_0_DRAFT_FOR_COORDINATOR_REVIEW`  
**Ngày:** 17/07/2026  
**Source baseline:** `8e4b5da7a0d3f820374692c65d39c8d8350d374d`  
**Rule:** Path không có trong bảng mặc định là read-only với Agent A và Agent B.

## Agent B — được sửa

| Path | Quyền | Ghi chú |
|---|---|---|
| `chatbot-widget/js/chatbot.js` | Write | UI flow/renderer mapping hiện có |
| `chatbot-widget/js/chatbot-api-engine.js` | Write | Contract mapping/state; không sửa API backend |
| `chatbot-widget/js/chatbot-renderers-medstand.js` | Write | Business cards và state |
| `chatbot-widget/template/chatbot.html` | Write | Markup hiện có |
| `chatbot-widget/css/chatbot.css` | Write | Style hiện có |
| `chatbot-widget/css/chatbot-api-engine.css` | Write | Style panel hiện có |
| `chatbot-widget/js/chatbot-suggestions.js` | Write by assignment | Chỉ khi Coordinator giao task menu |
| `src/templates/home.html` | Write | Dashboard hiện có |
| `src/templates/revenue.html` | Write | Màn hình hiện có |
| `src/templates/routes.html` | Write | Màn hình hiện có |
| `src/templates/notifications.html` | Write | Màn hình hiện có |
| `src/templates/customer-management.html` | Write | Màn hình hiện có |
| `src/js/pages/home.js` | Write | Dashboard mapping/state |
| `src/js/pages/revenue.js` | Write | Dashboard mapping/state |
| `src/js/pages/routes.js` | Write | Priority/visit display |
| `src/js/pages/notifications.js` | Write | State/label nếu bị ảnh hưởng |
| `src/js/pages/customer-management.js` | Write | Field/state nếu bị ảnh hưởng |
| `src/js/pages/order-report.js` | Write | Chỉ khi assignment giao |
| `src/js/schemas/dashboard.schema.js` | Write by assignment | Mapping schema, không tự phân quyền |
| `tests/e2e/**` | Write | Chỉ test trên luồng hiện có |
| `reports/business-rule-v1/agent-b/**` | Write | Summary/evidence/hand-off |

## Agent B — chỉ đọc

| Path | Lý do |
|---|---|
| `reports/contracts/**` | Coordinator sở hữu Contract Pack frozen |
| `tests/fixtures/business-rule-v1/**` | Coordinator sở hữu fixture; Agent B chỉ đọc/intercept |
| `docs/FILE_OWNERSHIP_BUSINESS_RULE_V1.md` | Coordinator sở hữu manifest |
| `docs/FIELD_COMPATIBILITY_MAP_V1.md` | Coordinator khóa compatibility map |
| `package.json`, `package-lock.json` | Coordinator sở hữu test/build scripts |
| `scripts/build.js`, `playwright.config.*` | Coordinator sở hữu build config |
| `src/js/dist/**`, `src/css/dist/**` | Generated output |
| `chatbot-widget/js/*.bundle.min.js` | Generated output |
| `chatbot-widget/css/dist/**` | Generated output |
| `index.html`, `index.prod.html` | Generated/Coordinator-controlled |
| `sql/**` | Agent A/backend |
| `n8n/**` | Agent A/backend |
| `tests/api/**`, `tests/contracts/**`, `tests/security/**` | Agent A/backend/security |

## Agent A — backend/data

- `sql/**` theo ownership cụ thể của Agent A.
- `n8n/**` theo ownership cụ thể của Agent A.
- `tests/api/**`, `tests/contracts/**`, `tests/security/**`.
- Backend reports và source field evidence.

## Coordinator-only

- Contract Draft/Final và checksum.
- API catalog snapshot.
- Ownership/compatibility manifest.
- `package.json`, lockfile, build config.
- Merge/cherry-pick/worktree, generated assets và conflict resolution.

## Quy tắc thay đổi

- Không Agent nào tự sửa path ngoài quyền.
- Contract/field/API mismatch ghi `CONTRACT_DRIFT` hoặc contract change request.
- Không tự tạo `tests/ui/**`, `tests/mocks/**` hoặc app/frontend mới nếu chưa được
  Coordinator bổ sung vào manifest.
- Không commit `playwright-report/`, `test-results/`, video hoặc trace lớn.
