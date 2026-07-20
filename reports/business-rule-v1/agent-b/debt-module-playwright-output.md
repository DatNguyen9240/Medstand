# Debt module B1 Playwright evidence

## Runtime/config

- Product path: existing `/#/chatbot` screen.
- Playwright config: `playwright.config.ts`.
- Manager project: `tests/.auth/manager.json`.
- TDV project: `tests/.auth/tdv.json`.
- Base URL: `E2E_BASE_URL` or default `http://localhost:3000`.
- Browser: Playwright Chromium.
- Mode: `B1_FIXTURE_COMPATIBILITY`; renderer/CSS source is injected into the existing chatbot page for source verification. No new app/page was created.

## Commands and raw result

```text
npm.cmd run test:manager -- --grep "@debt"
Running 4 tests using 1 worker
4 passed (8.0s)

npm.cmd run test:tdv -- --grep "@debt"
Running 4 tests using 1 worker
4 passed (6.3s)
```

## Case matrix

| Case | Fixture/action | Expected | Result |
|---|---|---|---|
| B1-MGR-01 | Canonical list + SUPPLIER drift, tabs/filter, 7 rows | 5 initial rows, non-customer excluded, drift has requestId, double click calls detail once | PASS |
| B1-MGR-02 | Detail with null Phone/NearestDueDate and backend recommendation | Safe nullable labels, backend status/recommendation, no frontend threshold text, Escape closes/focus path | PASS |
| B1-MGR-03 | 390x844 mobile list | Mobile cards visible, desktop table hidden, no horizontal overflow, no mutation request after bootstrap | PASS |
| B1-TDV-01 | Required field missing, numeric zero, `ObjectType=EMPLOYEE` | Zero accepted; missing/non-customer records fail closed; drift fields/requestIds preserved | PASS |

The four cases run identically under Manager and TDV projects: 8/8 B1 executions passed.

## Network/mutation note

The existing chatbot performs bootstrap `POST /api/gateway` read calls during page setup. The mutation assertion resets after setup and observes the debt interactions only. No POST/PUT/PATCH/DELETE is issued by list render/filter/mobile behavior after the baseline; detail execution is stubbed in the double-submit test and is read-only `@cong_no_chi_tiet`.
