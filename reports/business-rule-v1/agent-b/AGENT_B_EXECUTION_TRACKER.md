# Agent B — Business Rule v1 Execution Tracker

**Sản phẩm:** Medstand — frontend/chatbot hiện có  
**Ngày:** 17/07/2026  
**Owner:** Agent B — Frontend/UX/E2E  
**Runtime mode:** `IMPLEMENTATION`
**Mục tiêu:** Business alignment và regression safety; không redesign, không xây frontend mới.

## 1. Trạng thái hiện tại

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Agent B Assignment | `READY` | Prompt đã khóa phạm vi không xây mới |
| Agent B Execution | `IN_PROGRESS` | Debt module source + B1 test đã chạy; B2 còn chờ Agent A |
| Gate 0 Preparation | `BLOCKED_BY_WORKTREE_DIRTY` | Artifact đã tạo; chưa có Gate 0 commit/worktree sạch |
| B1 Fixture Compatibility | `PASS_REPORTED_EVIDENCE_REVIEWED` | 4 case IDs × Manager/TDV = 8/8; `debt-module-playwright-output.md`; chưa phải runtime/technical pass |
| B2 Runtime Integration | `WAIT_AGENT_A` | Chờ Agent A runtime PASS và Contract Final |
| Agent B Overall | `PARTIAL` | Chưa thể `DONE` trước Gate 0/B2/UAT |
| Contract Draft | `PRESENT_FROZEN_DRAFT` | `reports/contracts/...draft.json`; chờ Coordinator review/lock |
| Fixtures | `PRESENT` | 15 JSON fixture theo module dưới `tests/fixtures/business-rule-v1/**` |
| Ownership Manifest | `PRESENT_DRAFT` | `docs/FILE_OWNERSHIP_BUSINESS_RULE_V1.md` |
| Field Compatibility Map | `PRESENT_DRAFT` | `docs/FIELD_COMPATIBILITY_MAP_V1.md` |
| Worktree/Branch | `BLOCKED_BY_WORKTREE_DIRTY` | Chưa tự tạo/chuyển worktree |
| sourceBaselineCommit | `RECORDED` | `8e4b5da7a0d3f820374692c65d39c8d8350d374d` |
| gate0ArtifactCommit | `PENDING_COORDINATOR_COMMIT` | Chưa commit artifact do working tree bẩn |
| Package test scripts | `PASS_READ_ONLY_CHECK` | `test:manager`, `test:tdv`, `test:guest`, `test:chatbot` tồn tại |

**Kết luận:** Assignment đã `READY`; artifact Gate 0 đã tạo nhưng Gate 0 vẫn
`BLOCKED_BY_WORKTREE_DIRTY`, B1 `BLOCKED_BY_GATE_0`, B2 `WAIT_AGENT_A`.

## 2. Prompt giao Agent B

```text
Medstand là sản phẩm đã tồn tại và đang hoạt động.

Nhiệm vụ này không xây mới frontend, không tái cấu trúc toàn bộ,
không tạo lại src và không chuyển kiến trúc/framework.

Hãy giữ nguyên cấu trúc HTML, CSS và JavaScript hiện tại.
Chỉ chỉnh sửa những điểm cần thiết để giao diện hiện có tuân thủ
Business Rule Baseline v1 và Contract Pack đã được Coordinator khóa.

Mục tiêu là business alignment và regression safety,
không phải redesign hoặc architecture migration.

Phạm vi Agent B:

1. Chỉ sửa màn hình/dashboard/chatbot đang chạy và các file frontend/test
   được giao trong ownership manifest. Không tạo route, app hoặc frontend mới.

2. Chỉ map field, enum, ApiCode, error code và metadata từ Contract Pack.
   Không tự suy đoán tên field, công thức nghiệp vụ, fallback hoặc quyền.
   Nếu contract sai/thiếu, tạo contract change request; không sửa contract,
   backend hoặc SQL/n8n.

3. Sửa label và state UI: LOADING, SUCCESS, NO_DATA, OUT_OF_SCOPE,
   VALIDATION_ERROR, SYSTEM_ERROR. Không biến lỗi hệ thống thành “0 dữ liệu”.

4. Tách riêng CustomerTier và RiskLevel. Không dùng Tier C thay cho risk.

5. Chỉ hiển thị AvailableStock, StockUpdatedAt và WarehouseScope nếu có
   trong contract. Frontend không tự tính tồn khả dụng. Nếu tồn null,
   stale hoặc chưa xác định, hiển thị “Chưa xác định” và không đề xuất số lượng.

6. Tách rõ “Tra cứu sản phẩm” và “Tìm theo triệu chứng”. Product yêu cầu
   mã/tên sản phẩm; symptom yêu cầu triệu chứng và cảnh báo y tế riêng.

7. Gợi ý phải hiển thị đúng customer, product, tồn khả dụng, chu kỳ/fallback,
   lý do, confidence, RuleVersion và thời điểm cập nhật. Số lượng chỉ tham khảo.
   Không tạo đơn thật; giỏ nháp chỉ sau confirm và đúng contract.

8. Tuyến chỉ hiển thị “Đề xuất ưu tiên”; phân biệt LastVisitAt với
   LastPurchaseAt; không tự sửa tuyến chính hoặc hiển thị ngoài scope.

9. Không sửa n8n/**, sql/**, API catalog/Contract Pack, package.json,
   package-lock.json, bundle/minified/generated assets hoặc file ngoài ownership.

10. Nếu field bắt buộc bị thiếu khỏi response:
    - hiển thị trạng thái an toàn theo Contract Pack;
    - ghi `CONTRACT_DRIFT` kèm ApiCode, field thiếu, contractVersion và requestId;
    - không âm thầm dùng field khác làm fallback, trừ khi fallback được ghi
      trong `FIELD_COMPATIBILITY_MAP_V1.md`.

11. Production source không được import hoặc tham chiếu fixture. Fixture chỉ
    được dùng trong test hoặc Playwright interception.

12. Chỉ hỗ trợ field cũ khi `FIELD_COMPATIBILITY_MAP_V1.md` quy định rõ
    field precedence, null semantics và thời hạn deprecation. Khi normalize
    nullable data, ưu tiên `??` thay vì `||` để không làm mất giá trị `0`,
    `false` hoặc chuỗi rỗng có ý nghĩa nghiệp vụ.

13. Không ghi “hoàn tất” nếu chỉ build pass. Tách Technical PASS,
    Permission PASS và Business PASS.

Nếu API thật lệch Contract Pack, ghi ApiCode, field, response và requestId,
chuyển Agent A/Coordinator; không sửa UI để che contract drift.
```

## 3. Gate 0 — Coordinator phải chuẩn bị

Các artifact tối thiểu:

```text
reports/contracts/contract-pack-business-rule-v1.draft.json
tests/fixtures/business-rule-v1/
docs/FILE_OWNERSHIP_BUSINESS_RULE_V1.md
docs/FIELD_COMPATIBILITY_MAP_V1.md
```

Fixture tối thiểu phải chia theo module/API; mỗi fixture có `ApiCode`,
`contractVersion`, `role`, `scope`, `requestId`, `status/errorCode`, `data`
và `metadata`.

```text
tests/fixtures/business-rule-v1/
├─ dashboard/
│  ├─ success.json
│  ├─ no-data.json
│  └─ system-error.json
├─ stock/
│  ├─ success.json
│  ├─ available-stock-null.json
│  └─ stale.json
├─ customer/
│  ├─ tier-a-risk-high.json
│  └─ new-customer.json
├─ route/
│  ├─ success.json
│  └─ checkin-unavailable.json
├─ recommendation/
│  ├─ success.json
│  └─ low-confidence.json
├─ program/
│  └─ approval-required.json
└─ common/
   ├─ out-of-scope.json
   └─ validation-error.json
```

Worktree bắt buộc:

```text
branch: agent-b/business-rule-frontend
worktree: worktree-agent-b
sourceBaselineCommit: <commit trước khi hai Agent sửa>
gate0ArtifactCommit: <commit chứa Contract Draft, fixture, ownership>
```

Agent B bắt đầu từ `gate0ArtifactCommit`. Agent A và Agent B phải dùng cùng
source baseline, cùng Contract Draft checksum và cùng rule fixture version.
Lịch sử branch không bắt buộc giống hệt; mọi merge/cherry-pick Gate 0 phải
do Coordinator kiểm soát.

Gate 0 chỉ đạt khi Coordinator xác nhận:

- Contract Draft đã frozen, có version/checksum draft.
- Fixture không chứa token, mật khẩu hoặc dữ liệu nhạy cảm thật.
- Ownership không giao chồng file.
- `sourceBaselineCommit` và `gate0ArtifactCommit` được ghi rõ.
- Agent A/B dùng cùng Contract Draft checksum và fixture version.
- Package đã có các script test cần dùng hoặc đã ghi rõ blocker.

## 4. Hai vòng thực thi

### B1 — UI compatibility bằng fixture đã khóa

Agent B được phép intercept API trong Playwright hoặc dùng fixture trong
test để kiểm tra renderer của frontend hiện tại. Không dựng app mock mới,
không hardcode fixture trong production. B1 có thể đạt
`B1_TECHNICAL_PASS` trước khi API thật sẵn sàng.

Phạm vi B1:

- Dashboard KPI và metadata.
- Loading/empty/error/out-of-scope.
- CustomerTier/RiskLevel.
- AvailableStock null/stale.
- Product/symptom mapping.
- Recommendation, loyalty/program và route priority.
- Keyboard, responsive, theme và double-submit.

### B2 — Integration với API test sau khi Agent A runtime PASS

Chỉ bắt đầu sau khi Agent A bàn giao API evidence và Coordinator khóa
Contract Final. Agent B bỏ mock khỏi integration path, chạy trên frontend
hiện tại và không sửa UI để che response drift.

B2 có trạng thái `WAIT_AGENT_A`, `PASS` hoặc `FAIL`.

## 5. Backlog Agent B

| ID | Công việc | File/vùng dự kiến | Trạng thái | Evidence bắt buộc |
|---|---|---|---|---|
| B-00 | Gate 0 và ownership handshake | Coordinator artifacts | `BLOCKED` | Base commit, manifest, contract, fixture |
| B-01 | Fixture/contract loader cho test | `tests/fixtures/business-rule-v1/**` | `PENDING` | Loader report, contract version |
| B-02 | State UI và error taxonomy | Existing dashboard/chatbot source | `PENDING` | UI state tests |
| B-03 | KPI/source/time/rule metadata | `src/templates/home.html`, `src/js/pages/home.js`, CSS được giao | `PENDING` | Dashboard screenshots/trace |
| B-04 | Route priority, LastVisit/LastPurchase, Tier/Risk | Existing home/routes/chatbot source | `PENDING` | Manager/TDV assertions |
| B-05 | Product/symptom intent và renderer | `chatbot-widget/js/**`, template/CSS được giao | `PENDING` | Mapping + validation tests |
| B-06 | Recommendation/stock/loyalty/program labels | Existing chatbot renderer/source | `PENDING` | Fixture matrix |
| B-07 | Accessibility/responsive/theme/double-submit | Existing UI source | `PENDING` | Playwright UI evidence |
| B-08 | Playwright Manager/TDV trên luồng hiện tại | `tests/e2e/**` được giao | `PASS_DEBT_SCOPE` | `debt-module-test.json`, 3/3 mỗi role |
| B-09 | API integration sau Agent A PASS | Existing source only | `WAIT_AGENT_A` | Contract checksum, requestId, response evidence |
| B-10 | Báo cáo và handoff | `reports/business-rule-v1/agent-b/**` | `PASS_DEBT_SCOPE` | `debt-module-summary.md`, drift report, test JSON |

### Debt module execution update (17/07/2026)

| Hạng mục | Trạng thái | Evidence |
|---|---|---|
| Debt renderer/list/detail | `PASS_SOURCE` | `chatbot-widget/js/chatbot-renderers-medstand.js` |
| Debt states/metadata | `PASS_SOURCE` | `chatbot-widget/js/chatbot.js`, `chatbot-widget/js/chatbot-api-engine.js` |
| Debt responsive/accessibility | `PASS_SOURCE` | `chatbot-widget/css/chatbot.css` |
| B1 Fixture Compatibility | `PASS` | `debt-module-test.json` |
| Playwright Manager | `PASS 4/4 B1` | `npm.cmd run test:manager -- --grep "@debt"` |
| Playwright TDV | `PASS 4/4 B1` | `npm.cmd run test:tdv -- --grep "@debt"` |
| B2 Runtime Integration | `BLOCKED_WAIT_AGENT_A` | `debt-contract-drift.md` |
| Build/generated assets | `PASS_COORDINATOR_BUILD` | `npm.cmd run build`; bundle/dist đã refresh |
| Agent B Overall | `PARTIAL` | B1 evidence reviewed; Technical/Permission/Business/B2/UAT chưa đạt |

## 6. Quy tắc test và package

Chỉ chạy các script đã tồn tại trong `package.json`:

```text
npm.cmd run test:manager
npm.cmd run test:tdv
npm.cmd run test:guest
npm.cmd run test:chatbot
```

Nếu thiếu script, ghi `TEST_HARNESS_REQUIRED` và báo Coordinator.
Agent B không tự sửa `package.json`, lockfile hoặc build config.

Kiểm tra source tối thiểu:

```text
git diff --check
npm.cmd run build
```

Build chỉ để xác minh source trong worktree Agent B. Sau build phải chạy:

```text
git status --short
```

và ghi nhận toàn bộ file generated như `src/js/dist/**`, `src/css/dist/**`
hoặc `index.html`. Agent B không commit generated output. Chỉ hoàn nguyên
file đã xác nhận là generated; không dùng `git reset` hoặc `git clean -fd`
hàng loạt vì có thể xóa fixture/report chưa commit. Coordinator chạy build cuối.

## 7. Playwright evidence

Không commit toàn bộ `playwright-report/` hoặc `test-results/`.
Chỉ lưu vào report Agent B:

```text
reports/business-rule-v1/agent-b/
├─ frontend-rule-summary.md
├─ frontend-rule-test.json
├─ mock-playwright-report.json
├─ integration-playwright-report.json
├─ screenshots/          # chỉ screenshot lỗi quan trọng
├─ traces/               # chỉ trace của case FAIL/blocker
├─ console-errors.json   # đã che dữ liệu nhạy cảm
├─ changed-files.txt
├─ known-gaps.md
└─ handoff-to-agent-a.md
```

Mỗi record test phải có case, role, expected, actual, PASS/FAIL/BLOCKED
và evidence path.

Retention Git:

- Git track: `frontend-rule-summary.md`, `frontend-rule-test.json`,
  `changed-files.txt`, `known-gaps.md`, `handoff-to-agent-a.md` và tracker này.
- Không Git track toàn bộ `playwright-report/`, `test-results/`, video hoặc
  trace lớn.
- Screenshot/trace chọn lọc phải che dữ liệu nhạy cảm và có giới hạn dung lượng.

## 8. Definition of Done Agent B

- [ ] Không tạo frontend mới, route mới hoặc kiến trúc mới.
- [ ] Chỉ sửa file đúng ownership.
- [ ] Map field theo Contract Pack, không đoán công thức.
- [ ] Tách NO_DATA, OUT_OF_SCOPE, VALIDATION_ERROR, SYSTEM_ERROR.
- [ ] Tách CustomerTier và RiskLevel.
- [ ] Không tự tính AvailableStock.
- [ ] Product/symptom mapping riêng.
- [ ] Không gọi mutation khi chỉ xem/gợi ý.
- [ ] Playwright Manager/TDV chạy trên luồng hiện tại.
- [ ] B1 có trạng thái riêng (`PENDING`/`B1_TECHNICAL_PASS`/`FAIL`).
- [ ] B2 có trạng thái riêng (`WAIT_AGENT_A`/`PASS`/`FAIL`).
- [ ] Không commit report Playwright nặng hoặc generated bundle.
- [ ] Có Technical/Permission/Business status riêng.
- [ ] Có report, evidence, known gaps và handoff.

**Không đánh dấu Agent B `DONE` khi Gate 0, Contract Final, API runtime hoặc
Business UAT còn thiếu. Agent B có thể ghi `B1_TECHNICAL_PASS`,
`B2_RUNTIME_BLOCKED` và `BUSINESS_PASS_PENDING_UAT` độc lập.**
