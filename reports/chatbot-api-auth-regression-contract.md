# Chatbot API auth regression

- Generated: 2026-07-17T04:59:53.178Z
- Mode: contract-only
- Security Gate: **BLOCKED**
- Passed: 40/44
- Blocked: 4
- Failed: 0
- Read ApiCode policies checked: 26

Contract cases prove missing/invalid/expired/unmapped identities and no-scope requests are rejected before SQL. Full UAT also requires live valid-unmapped and valid-no-scope identities.
