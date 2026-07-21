# Shared Auth Guard deployment

## Artifact

- `Shared_Auth_Guard.json`: reusable n8n sub-workflow.
- Trigger duy nhất: `Execute Workflow Trigger`.
- Không có public webhook.
- Xác minh token qua API UserInfo hiện có.

## Input

Sub-workflow nhận item JSON của request cha. Auth token có thể nằm ở:

- `headers.authorization` / `headers.Authorization`;
- `authorization`;
- cookie `auth_token` trong `headers.cookie`, `cookie` hoặc `body.cookie`.

## Output

```json
{
  "auth": {
    "ok": true,
    "httpStatus": 200,
    "code": "AUTHENTICATED",
    "message": "",
    "requestId": "auth-..."
  },
  "verifiedIdentity": {
    "subject": "...",
    "internalUserId": "...",
    "employeeId": "...",
    "branchIds": [],
    "capabilities": [],
    "scopeContext": {},
    "tokenExpiry": null
  }
}
```

Output cuối không chứa token/cookie.

## Cách triển khai an toàn

1. Import workflow vào n8n test và ghi lại workflow ID do n8n cấp.
2. Không hardcode một ID chưa tồn tại trong file export của workflow cha.
3. Ở TASK-P0-01 và TASK-P0-03, thêm node `Execute Sub-workflow` trỏ tới ID thật.
4. Đặt auth guard sau nhánh OPTIONS và trước mọi SQL/business node.
5. Nhánh `auth.ok=false` phải dừng và trả 401/403; nhánh true mới được đi tiếp.
6. Không activate production trước khi TASK-P0-05 pass.

Repo hiện không có n8n CLI/API credential, nên artifact chưa được tự động import hoặc activate trên instance đang chạy.

