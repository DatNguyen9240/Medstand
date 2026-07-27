# UAT-004 — Báo cáo kiểm tra import và publish workflow n8n

**Ngày kiểm tra:** 27/07/2026
**Task liên quan:** `UAT-004 — Import và publish workflow n8n` (phụ thuộc `UAT-001`)
**Runtime mode:** `SOURCE_VERIFIED_RUNTIME_BLOCKED` — kiểm tra đầy đủ phía source; phía runtime **không truy cập được từ môi trường kiểm tra**, phải chạy lại tại nơi có n8n
**Kết luận:** `NOT_DONE` — phía source đã sạch, nhưng có **một vi phạm nghiệm thu xác định**: webhook `intent-parser` có **hai workflow cùng ACTIVE**.

## 1. Hiện tượng

Nghiệm thu `UAT-004` gồm hai vế:

1. Mỗi webhook chỉ có một workflow active đúng.
2. Workflow runtime khớp file nguồn.

Vế 1 hiện **không đạt**: webhook `intent-parser` đang có hai workflow cùng active, trùng cả tên. Khi `MAIN_ChatBot_V5` gọi sang `intent-parser`, n8n không đảm bảo gọi trúng bản nào — đây là nguồn gây kết quả không đồng nhất giữa các lần chat giống hệt nhau.

Vế 2 chưa kết luận được bằng bằng chứng hiện có, vì ảnh chụp runtime duy nhất còn lưu là từ **21/07/2026**, cũ hơn source 6 ngày.

## 2. Nguyên nhân

### Nguyên nhân chính

Import workflow vào n8n mà không có `id` sẽ **tạo bản mới** thay vì ghi đè, dẫn tới nhiều workflow cùng đăng ký một webhook path. Bản cũ không được tắt sau khi import bản mới.

### Nguyên nhân phụ

1. Trước đây một số file nguồn thiếu trường `id`, nên mỗi lần import là một lần sinh workflow trùng. Việc này **đã được khắc phục** ở source (mục 3.1), nhưng các bản trùng đã sinh ra trên runtime vẫn còn.
2. Không có bước đối chiếu runtime với source sau import, nên workflow chạy thật có thể tụt lại so với repo mà không ai biết.

## 3. Bằng chứng đã xác định được

### 3.1 Phía source — ĐẠT

Kiểm kê toàn bộ 18 file trong `n8n/`:

| Kiểm tra | Kết quả |
|---|---|
| Webhook path bị trùng giữa các file | ✅ Không có — mỗi path chỉ ở đúng một file |
| Workflow ID bị trùng | ✅ Không có |
| File có webhook nhưng thiếu `id` (import sẽ tạo bản trùng) | ✅ Không có |
| SHA-256 khớp manifest | ✅ 12/12 sau khi sửa lỗi chép hash (mục 3.2) |

11 webhook path, mỗi path một file, mỗi file một `id` duy nhất. Nguy cơ "import tạo bản trùng" đã được chặn từ gốc.

### 3.2 Lỗi trong manifest — ĐÃ SỬA

Hash của `n8n/API_Services/API_GetConfig.json` trong manifest chỉ có **63 ký tự** thay vì 64:

```
file thật : aa79efc4cc56b31d0239d19c754aaabd9e3e008209ab099d495242ab7e0f81e7   (64)
manifest  : aa79efc4cc56b31d0239d19c754aabd9e3e008209ab099d495242ab7e0f81e7    (63)
                                        ^ thiếu một chữ 'a'
```

Xác minh: bỏ đúng ký tự thứ 29 của hash thật thì ra đúng chuỗi trong manifest — lỗi chép/cắt khi lập manifest, **nội dung file không sai**. Đã sửa lại trong manifest.

Đây là lỗi đáng chú ý vì một hash thiếu ký tự sẽ **luôn báo lệch** khi đối chiếu, dễ khiến người triển khai import lại một file vốn đã đúng.

### 3.3 Phía runtime — VI PHẠM XÁC ĐỊNH

Từ `reports/runtime-workflows.export.json` (ảnh chụp 21/07/2026, 30 workflow):

```
webhook "intent-parser" — 2 workflow, 2 đang ACTIVE   ⚠️ VI PHẠM
    ACTIVE   ZQPz4sbzz9pqSO8W   AI · Intent Parser (V4 Sub-Flow)
    ACTIVE   Gn7nDjDgGUFOWni5   AI · Intent Parser (V4 Sub-Flow)   ← bản đúng theo manifest

webhook "api-execute" — 3 workflow, 1 đang ACTIVE      (không vi phạm, nhưng nên dọn)
    inactive 0xIfgxxondYICsqZ   K0-C · Execute API
    ACTIVE   fCJwiyAT9r6eh1ys   K0-C · Execute API      ← bản đúng theo manifest
    inactive Z7raaV1oe9JkjUXQ   K0-C Â· Execute API     ← tên bị mojibake, dấu vết import hỏng
```

10 webhook còn lại: mỗi cái đúng **một** workflow active, **đúng ID** manifest. `Shared_Auth_Guard` (`9UxECqxRaPGMF8EM`) có mặt trên runtime.

Đây là vấn đề cấu trúc (workflow trùng tồn tại song song), không phải thứ tự tự biến mất, nên gần như chắc chắn vẫn còn cho tới khi có người tắt thủ công.

### 3.4 "Runtime khớp file nguồn" — CHƯA KẾT LUẬN ĐƯỢC

So node/parameters/connections giữa export 21/07 và source hiện tại cho 8 file khác biệt. Nhưng phải tách hai nguyên nhân khác hẳn nhau:

| File | Có commit đổi node sau 21/07? | Diễn giải khác biệt |
|---|---|---|
| `AI_RAG_Query.json` | Có — `fe29253`, `c0ac3bf` (24/07, +189 dòng) | Source tiến lên; runtime cần import |
| `API_Execute.json` | Có — `a1c5cd8`, `df13b62` (24–26/07) | Source tiến lên; runtime cần import |
| `API_GetConfig.json` | Có — `df13b62` (26/07) | Source tiến lên; runtime cần import |
| `API_ListActive.json` | Có — `df13b62` (26/07) | Source tiến lên; runtime cần import |
| `MAIN_ChatBot_V5.json` | Có — `bfbaf7e` (27/07) | Source tiến lên; runtime cần import |
| `AI_Intent_Parser.json` | Có — `bfbaf7e` (27/07) | Source tiến lên; runtime cần import |
| `AI_Upload_Reader.json` | Chỉ `055f51c` sửa 2 dòng credential | Khác biệt (6 node) **nhiều hơn** mức thay đổi source → runtime nhiều khả năng chưa từng khớp repo |
| `AI_Reviewer.json` | **Không** — chỉ commit thêm dòng `id` | Khác biệt 2 node **không giải thích được bằng source** → runtime lệch repo từ trước 21/07 |

Ba file `AI_ChatCasual`, `API_DataSource`, `API_SystemMeta` khớp hoàn toàn — hợp lý vì từ 21/07 tới nay chúng chỉ được thêm dòng `id`, không đụng node nào.

Dù nguyên nhân là gì, hành động cần làm giống nhau: **import lại rồi đối chiếu bằng một bản export mới**. Không thể chốt vế 2 bằng ảnh chụp 6 ngày tuổi.

### 3.5 Vì sao không kiểm tra được runtime từ đây

| Đường thử | Kết quả |
|---|---|
| `GET /webhook/<path>` qua medtest | `404 GATEWAY_REQUIRED` — `server.js:617` chặn toàn bộ `/webhook/*`, chỉ cho đi qua `/api/gateway` (có xác thực) |
| `https://medtest.bms7.net/n8n/…` | Trả về `index.html` của SPA (catch-all Express), không phải n8n |
| `medtest.bms7.net:5678` | Không kết nối được |

Việc chặn này là **đúng thiết kế bảo mật**, không phải lỗi. Hệ quả là phần nghiệm thu runtime của `UAT-004` bắt buộc phải chạy ở nơi truy cập được n8n.

## 4. File bị ảnh hưởng

| File | Vai trò | Rủi ro |
|---|---|---|
| Workflow `ZQPz4sbzz9pqSO8W` trên runtime | Bản intent-parser trùng, đang active | Chat trả kết quả không nhất quán; khó tái hiện lỗi |
| Workflow `0xIfgxxondYICsqZ`, `Z7raaV1oe9JkjUXQ` | Bản `api-execute` cũ, inactive | Chưa gây lỗi; dễ bị bật nhầm khi thao tác tay |
| 8 file trong `n8n/` ở mục 3.4 | Runtime tụt sau source | Đang chạy logic cũ; các bản vá đã commit chưa có hiệu lực |
| `release/UAT_MANIFEST_2026-07-27_11.110.md` | Hash `API_GetConfig` thiếu 1 ký tự | Đã sửa; nếu không sẽ luôn báo lệch giả |

## 5. Mức độ ảnh hưởng

**Mức độ:** `P0 — Vi phạm xác định, đang ảnh hưởng kết quả chat.`

- Hai intent-parser cùng active nghĩa là **cùng một câu hỏi có thể cho hai kết quả khác nhau** tùy n8n định tuyến vào bản nào. Điều này làm hỏng mọi vòng test phía sau: `UAT-011` → `UAT-019` có thể pass/fail ngẫu nhiên, và `UAT-021` (lỗi trùng và kết quả không đồng nhất) gần như chắc chắn sẽ tái hiện đúng triệu chứng này.
- Runtime tụt sau source nghĩa là các bản vá đã commit (`@danh_muc` 422, hai lỗi 502, hardening node) **chưa thực sự có hiệu lực** trên medtest.
- Không nên bắt đầu các vòng test chức năng trước khi đóng `UAT-004`, nếu không sẽ tốn công điều tra những lỗi vốn do lệch phiên bản.

## 6. Đề xuất giải quyết

### Bước 1 — Dọn workflow trùng (bắt buộc, làm trước)

Trên n8n medtest:

1. Mở workflow `ZQPz4sbzz9pqSO8W` → **Deactivate**. Giữ `Gn7nDjDgGUFOWni5` active.
2. Xác nhận webhook `intent-parser` chỉ còn một workflow active.
3. Nên xóa hẳn (hoặc đổi tên thành `[DEPRECATED] …`) hai bản `api-execute` inactive `0xIfgxxondYICsqZ` và `Z7raaV1oe9JkjUXQ` để tránh bật nhầm sau này.

### Bước 2 — Import lại theo manifest

Import đè **đúng workflow ID đích** ghi trong manifest phần 4. Vì mọi file nguồn giờ đều có `id`, import sẽ cập nhật đúng bản thay vì tạo mới.

Sau khi import các file `API_Services`, phải mở lại node `Execute Shared Auth Guard` và chọn lại `9UxECqxRaPGMF8EM` — không tin cached workflow reference trong JSON.

### Bước 3 — Nghiệm thu bằng một bản export mới

Trên máy truy cập được n8n:

```bash
n8n export:workflow --all --output=runtime.json
node scripts/verify_n8n_runtime.js runtime.json
```

Script kiểm tra cả hai vế nghiệm thu:

- Mỗi webhook đúng một workflow active, đúng ID manifest (kèm cảnh báo các bản inactive còn sót).
- Node/parameters/connections của runtime khớp file nguồn (bỏ qua metadata do n8n tự sinh).
- `Shared_Auth_Guard` có mặt.

Thoát mã 0 là đạt, 1 là còn vi phạm.

⚠️ **Bảo mật:** file export chứa `staticData` — trong đó có token phiên đăng nhập thật. Script sẽ cảnh báo nếu phát hiện. **Không commit file này.** Cần lưu thì lọc trước bằng `node scripts/sanitize_n8n_export.js runtime.json -o safe.json`.

## 7. Điều kiện nghiệm thu đề xuất cho UAT-004

Task chỉ được chuyển sang `DONE` khi:

- `node scripts/verify_n8n_runtime.js <export mới>` thoát mã 0.
- Bản export dùng để nghiệm thu được tạo **sau** khi hoàn tất Bước 1 và Bước 2.
- Không còn workflow trùng active trên bất kỳ webhook nào.
- Node `Execute Shared Auth Guard` trong các workflow `API_Services` đã được chọn lại thủ công sau import.
- Webhook của `MAIN_ChatBot_V5` vẫn là `hook-ai-dainao` và workflow ở trạng thái active.

## 8. Trạng thái hiện tại

`UAT-004 = TODO`

| Vế nghiệm thu | Trạng thái | Ghi chú |
|---|---|---|
| Phía source sạch (không trùng path/ID, đủ `id`) | ✅ ĐẠT | 18 file, 11 webhook path, không trùng |
| Hash source khớp manifest | ✅ ĐẠT | 12/12 sau khi sửa lỗi chép hash `API_GetConfig` |
| Mỗi webhook một workflow active | ❌ **VI PHẠM** | `intent-parser` có 2 bản cùng active |
| Runtime khớp file nguồn | ⏳ CHƯA KẾT LUẬN | Cần export mới; ảnh chụp 21/07 đã quá cũ |

Công cụ để lại: `scripts/verify_n8n_runtime.js` — chạy một lệnh là nghiệm thu được cả hai vế.

Việc chỉ người có quyền truy cập n8n mới làm được: Bước 1 (tắt workflow trùng), Bước 2 (import lại), Bước 3 (tạo export mới và chạy script).
