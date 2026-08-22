# ORDER-APPROVAL-005/006 — UI evidence status

Status: `EDIT_PERMISSION_FIXED_BLOCKED_BY_NOTIFICATION_RUNTIME_DEFECT`

## Confirmed result

- All three authorized UAT accounts authenticated before the first mutation:
  `NAMDINHB.MED`, `QLBH013.MED`, and `BACNINHA.MED`.
- Sale created the real draft order `DMB0826/11` on `medtest`.
- The order remains `StatusID = -1`, branch `MB`, owner `NAMDINHB.MED`, with one detail row.
- The edit-permission normalization defect was fixed locally and its regression verifier passes 9/9.
- The owner can now open the draft edit form. The next action is blocked by an unrelated global notification error modal.

## Fixed defect

The gateway response for `API_DonHang_EditContext_AI` is HTTP 200 and contains:

```json
{
  "StatusID": "-1",
  "CanEdit": "1",
  "BlockCode": "",
  "BlockMsg": ""
}
```

The edit page previously evaluated permission with:

```js
editCtx.CanEdit === true || editCtx.CanEdit === 1
```

It did not accept the real API value `"1"`. The page now uses the shared fail-closed
`MedstandOrderPermission.isGranted()` normalizer, which accepts only `true`, `1`, and `"1"`.
All denied and unknown representations remain denied. The production bundle was rebuilt successfully.

## New blocker outside the order-edit change

After the form opens, the router's background request to `API_ThongBao_UnreadCount_AI`
returns HTTP 200 with an application error:

```json
{
  "code": 1,
  "msg": "Missing para or Object not support"
}
```

The shared HTTP layer renders this as a global error modal. It covers the edit form and prevents
the E2E click from reaching `CẬP NHẬT ĐƠN`. Per the fail-fast rule, the harness did not dismiss
this real runtime error as test noise and no notification/server code was changed.

## Request evidence

- `req-ui-20260822012751-SALE_OWNER-41`: order detail, HTTP 200.
- `req-ui-20260822012751-SALE_OWNER-42`: edit context, HTTP 200.
- `req-ui-edit-probe-context`: isolated read-only gateway probe, HTTP 200.
- `req-ui-20260822022257-SALE_OWNER-44`: post-fix edit context, HTTP 200; the form opened.
- `req-ui-20260822022257-SALE_OWNER-45`: background unread-count request that produced the modal.
- `req-ui-edit-probe-unread-count`: isolated read-only confirmation of the unread-count application error.
- The complete UI timeline and rendered error state are in `ORDER-APPROVAL-005-006_UI_EVIDENCE.json`.
- The sanitized gateway payload is in `EDIT_CONTEXT_GATEWAY_PROBE.json`.
- `SUBMIT_03_OWNER_CAN_EDIT_DRAFT.png` shows the unlocked edit form behind the unrelated notification modal.

## Mutation boundary and cleanup plan

No owner edit, submit, cancel, manager edit, or second-order creation ran after the new blocker appeared.
Keep `DMB0826/11` temporarily for defect reproduction and audit. After sign-off, DBA/PMKT may archive it by exact `DocumentID`; do not delete it ad hoc.

The remaining UI cases require the notification runtime defect to be handled by its owning workstream,
then a rerun from this existing draft. Do not create the first fixture again.
