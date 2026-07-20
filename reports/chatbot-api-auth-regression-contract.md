# Chatbot API auth regression

- Generated: 2026-07-19T16:32:16.429Z
- Mode: contract-only
- Security Gate: **BLOCKED**
- Passed: 38/42
- Blocked: 4
- Failed: 0
- Read ApiCode policies checked: 24

Contract cases prove missing/invalid/expired/unmapped identities and no-scope requests are rejected before SQL. Full UAT also requires live valid-unmapped and valid-no-scope identities.
