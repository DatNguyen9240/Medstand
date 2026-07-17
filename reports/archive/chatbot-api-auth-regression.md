# Chatbot API auth regression

- Generated: 2026-07-15T16:06:04.207Z
- Mode: role-only
- Security Gate: **PASS**
- Passed: 46/46
- Blocked: 0
- Failed: 0
- Read ApiCode policies checked: 26

Contract cases prove missing/invalid/expired/unmapped identities and no-scope requests are rejected before SQL. Role-only UAT sends live requests for the approved Manager and TDV identities.
