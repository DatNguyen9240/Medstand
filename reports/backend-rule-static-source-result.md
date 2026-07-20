# Business Rule v1 — Static Source Result

**Status:** `STATIC_SOURCE_PASS`  
**Runtime SQL:** `MEDTEST_POSTDEPLOY_PASS`  
**n8n published workflow:** `FULL_ROLE_UAT_AND_AUDIT_PASS_SYMPTOM_RUNTIME_BLOCKED`  
**Business approval:** `PENDING`

## 38 checks

1. Canonical route source is Module 2 only.
2. Recommendation requires at least 3 invoices for personal-cycle eligibility.
3. Recommendation excludes draft orders from the bought-today filter.
4. Recommendation exposes `PERSONAL_CYCLE_ELIGIBLE` semantics.
5. Route uses valid invoice source for last purchase.
6. Route does not infer visit from purchase.
7. Tier and risk input are separated.
8. New customer state is explicit.
9. Tier exposes draft rule source and version.
10. Loyalty excludes `AR_OrderTbl`.
11. Upsell excludes `AR_OrderTbl`.
12. Upsell exposes draft rule source and version.
13. Upsell exposes nullable `AvailableStock`.
14. Upsell marks physical-only stock as unverified.
15. Upsell does not rank or filter by physical stock availability.
16. Upsell does not use physical stock as a secondary sort key.
17. Promotion is reference-only until approval.
18. Stock exposes nullable `AvailableStock`.
19. Stock marks physical-only data as unverified.
20. Revenue exposes dual `TotalAmount` basis and explicit status scopes.
21. Migration is versioned.
22. Migration seeds `DRAFT` only.
23. Migration reads `APPROVED` only.
24. n8n JSON parses and required gate nodes exist.
25. Existing API contract source tests pass as `STATIC_CONTRACT_PASS`.
26. Fulfilled invoice filters do not count status `1/2`.
27. Recommendation requires a customer instead of changing intent to branch best-sellers.
28. Recommendation maps invalid and unauthorized customers to the standard error taxonomy.
29. Recommendation does not expose cycle days as `TonKho`.
30. Recommendation exposes nullable `AvailableStock`.
31. Recommendation marks physical stock as not queried.
32. Recommendation exposes reason and data-window metadata.
33. Loyalty enforces customer scope before business queries.
34. Loyalty only deducts valid web-deductible returns.
35. Loyalty exposes `ProgramStatus`.
36. Loyalty exposes effective dates.
37. Loyalty exposes canonical achieved/target/remaining metrics.
38. Loyalty exposes an explicit draft rule version.

The n8n source contract is also `STATIC_CONTRACT_PASS`: envelope metadata/error taxonomy and fail-closed validation are present, and the symptom path no longer reads physical stock as available stock. Active versions match source; full-role UAT passed 13/13 accounts, 312/312 read commands and 52/52 denied-mutation checks; Playwright and audit runtime passed.

Static checks alone do not prove runtime or business correctness. SQL and n8n evidence are recorded separately. Specific-symptom chat E2E remains blocked by a missing Redis credential reference; four live negative-identity cases lack fixture tokens, and business approval remains pending.
