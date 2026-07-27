# UAT-001 — Báo cáo thiếu release manifest UAT

**Ngày kiểm tra:** 27/07/2026  
**Task liên quan:** `UAT-001 — Lập manifest release candidate UAT`  
**Runtime mode:** `REVIEW`  
**Kết luận sau khắc phục:** `SOURCE_MANIFEST_DONE_RUNTIME_PENDING` — đã tạo manifest chính thức; chưa có bằng chứng môi trường UAT đang chạy đúng release candidate.

## 1. Hiện tượng

Không tìm thấy file manifest dành riêng cho release UAT trong workspace. Thông tin nhận diện phiên bản hiện bị phân tán ở Git, script build, service worker, tài liệu SQL và các workflow n8n.

Vì vậy hiện chưa thể trả lời chắc chắn bằng một tài liệu duy nhất các câu hỏi:

- UAT đang chạy commit nào?
- Frontend đang chạy version/cache nào?
- DB đã import chính xác file SQL nào, theo thứ tự nào?
- Workflow n8n nào đã được import, Published/Active ở ID nào?
- Có thể rollback về tập artifact nào nếu deploy gặp lỗi?

## 2. Nguyên nhân

### Nguyên nhân chính

Chưa có bước khóa release candidate thành một artifact manifest trước khi deploy. Repository có source và một số deployment map rời rạc, nhưng không có file tổng hợp commit, version, checksum, SQL và n8n cho cùng một release.

### Nguyên nhân phụ

1. Version frontend được ghi ở nhiều nơi:
   - `scripts/build.js`
   - `sw.js`
   - `index.html`
   - `index.prod.html`

2. `sql/README.md` hiện chỉ mô tả gói mutation gồm bốn file, chưa phải danh sách SQL đầy đủ cho toàn bộ release UAT.

3. Workflow n8n có workflow ID trong JSON, nhưng trạng thái Published/Active là trạng thái runtime nên không thể xác nhận chỉ bằng source.

4. Source candidate có thể tiếp tục thay đổi nếu không khóa commit/tag trước khi deploy.

## 3. Bằng chứng đã xác định được

| Thành phần | Giá trị source candidate | Trạng thái bằng chứng |
|---|---|---|
| Branch | `hoangdang` | `SOURCE_CONFIRMED` |
| Commit | `bfbaf7e092a10d4839f434427527e4c862b61796` | `SOURCE_CONFIRMED` |
| Remote branch | `origin/hoangdang` cùng commit tại thời điểm kiểm tra | `SOURCE_CONFIRMED` |
| Frontend version | `11.110` | `SOURCE_CONFIRMED` |
| Service Worker cache | `medstand-11.110` | `SOURCE_CONFIRMED` |
| Intent parser ID | `Gn7nDjDgGUFOWni5` | `SOURCE_CONFIRMED` |
| Main chatbot ID | `mQ2X8ubexBpqD3Ru` | `SOURCE_CONFIRMED` |
| Main chatbot webhook | `hook-ai-dainao` | `SOURCE_CONFIRMED` |
| Shared Auth Guard runtime reference | `9UxECqxRaPGMF8EM` trong ba API service | `SOURCE_CONFIRMED` |
| Frontend đang chạy trên UAT | Chưa kiểm tra runtime | `RUNTIME_PENDING` |
| SQL đang tồn tại trên DB UAT | Chưa đối chiếu definition/hash | `RUNTIME_PENDING` |
| n8n đang Published/Active đúng bản | Chưa đối chiếu runtime | `RUNTIME_PENDING` |

## 4. File bị ảnh hưởng

### Nhóm nhận diện frontend

| File | Vai trò | Rủi ro nếu lệch manifest |
|---|---|---|
| `scripts/build.js` | Nguồn `APP_VERSION` và build artifact | Build mới có thể mang version không đúng hoặc không được ghi nhận |
| `sw.js` | Cache version của Service Worker | Trình duyệt có thể tiếp tục dùng asset cũ |
| `index.html` | Entry point và cơ chế đổi version/cache | UAT có thể hiển thị bundle không cùng release |
| `index.prod.html` | Entry point production-style | Có thể lệch với `index.html` hoặc build source |
| `src/js/dist/app.bundle.min.js` | Bundle ứng dụng | Không biết bundle được tạo từ commit nào nếu thiếu checksum |
| `chatbot-widget/js/chatbot.bundle.min.js` | Bundle chatbot | Có thể lệch source chatbot hoặc intent config |

### Nhóm SQL

| File/nhóm file | Vai trò | Rủi ro nếu thiếu khỏi manifest |
|---|---|---|
| `sql/README.md` | Deployment map hiện có | Mới mô tả gói mutation, không đại diện toàn bộ release |
| `sql/Module *.sql` | Procedure nghiệp vụ AI | DB có thể chạy procedure cũ dù frontend/n8n đã mới |
| `sql/Module common *.sql` | API dùng chung | Lỗi contract hoặc thiếu API khi runtime gọi |
| `sql/Migrate_*.sql` | Schema, metadata, audit và idempotency | Import sai thứ tự có thể làm API thiếu capability hoặc schema |
| `sql/Bootstrap_API_Metadata_Auto_AI.sql` | Bootstrap metadata API | Có nguy cơ ghi đè contract nếu chạy không đúng thứ tự release |

### Nhóm n8n

| File | Vai trò | Rủi ro nếu lệch manifest |
|---|---|---|
| `n8n/AI_Core/AI_Intent_Parser.json` | Phân loại intent và tham số | Câu tự nhiên dùng logic cũ hoặc sai route |
| `n8n/AI_Core/MAIN_ChatBot_V5.json` | Điều phối chatbot chính | Runtime có thể gọi parser/workflow không đúng bản |
| `n8n/API_Services/API_Execute.json` | Thực thi API và response envelope | Contract/mutation có thể khác với frontend |
| `n8n/API_Services/API_GetConfig.json` | Cấu hình API | Capability/metadata có thể lệch |
| `n8n/API_Services/API_ListActive.json` | Danh sách API active | UI có thể thấy thiếu hoặc thừa API |
| `n8n/Shared/Shared_Auth_Guard.json` | Xác thực dùng chung | Sai workflow reference có thể chặn hoặc mở sai quyền |

### Nhóm tài liệu và release

| File | Vai trò | Rủi ro nếu không cập nhật |
|---|---|---|
| `docs/BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md` | Theo dõi trạng thái task | Có thể đánh dấu nhầm `DONE` khi mới chỉ xác nhận source |
| File manifest cần tạo | Nguồn sự thật của release | Hiện chưa tồn tại |

## 5. Mức độ ảnh hưởng

**Mức độ:** `P0 — Release traceability gap`.

Đây không phải lỗi làm ứng dụng hỏng ngay lập tức. Tuy nhiên, nếu tiếp tục deploy khi chưa có manifest:

- Không chứng minh được UAT đang chạy đúng source vừa sửa.
- Kết quả test có thể thuộc một frontend, SQL hoặc workflow cũ.
- Khó xác định file cần import lại khi có lỗi.
- Rollback dễ thiếu artifact hoặc rollback không đồng bộ.
- Có thể kết luận sai rằng lỗi đã sửa nhưng runtime vẫn dùng bản cũ.

## 6. Đề xuất giải quyết

### Bước 1 — Khóa release candidate

- Chọn một commit sạch làm release candidate.
- Không dùng worktree có thay đổi source chưa commit để phát hành.
- Ghi branch, full commit SHA, thời gian tạo và người lập manifest.

### Bước 2 — Tạo một manifest duy nhất

Đề xuất file:

`release/UAT_MANIFEST_2026-07-27_11.110.md`

Manifest tối thiểu phải có:

- Release ID và môi trường đích.
- Git branch, commit SHA và frontend version.
- SHA-256 của bundle frontend quan trọng.
- Danh sách SQL chính xác theo thứ tự chạy, kèm SHA-256.
- Danh sách workflow n8n, source ID, runtime target ID, webhook và SHA-256.
- Danh sách pre-deploy check, post-deploy smoke test và rollback artifact.

### Bước 3 — Chốt danh sách SQL theo phạm vi release

Không lấy toàn bộ thư mục `sql/` để import hàng loạt. Người triển khai cần:

1. Xác định chức năng nào nằm trong release `11.110`.
2. Liệt kê migration/schema trước.
3. Liệt kê procedure nghiệp vụ sau.
4. Chạy metadata/bootstrap đúng thứ tự cuối cùng nếu release yêu cầu.
5. Ghi hash của từng file vào manifest.

### Bước 4 — Chốt workflow n8n

Với mỗi workflow cần ghi:

- Đường dẫn file source.
- Workflow ID trong source.
- Workflow ID đích trên UAT.
- Webhook path nếu có.
- Trạng thái Published/Active mong đợi.
- SHA-256 file được import.

Sau import phải kiểm tra lại liên kết `Shared Auth Guard`, không chỉ dựa vào cached ID trong JSON.

### Bước 5 — Tách source manifest và runtime verification

- `UAT-001`: hoàn thành khi manifest release candidate được khóa.
- `UAT-002`: chứng minh frontend UAT chạy đúng version/hash.
- `UAT-003`: chứng minh DB UAT có đúng SQL definition/hash.
- `UAT-004`: chứng minh n8n UAT dùng đúng workflow Published/Active.

Không gộp cả bốn bằng một trạng thái `PASS`.

## 7. Điều kiện nghiệm thu đề xuất cho UAT-001

Task chỉ được chuyển sang `DONE` khi:

- Có file manifest release candidate trong repository.
- Manifest không dùng từ “bản mới nhất” để nhận diện artifact.
- Commit SHA là đầy đủ và source dùng để phát hành không còn thay đổi chưa khóa.
- Mỗi artifact quan trọng có đường dẫn, version/hash và thứ tự triển khai.
- Có workflow ID đích và webhook cần kiểm tra.
- Có danh sách rollback artifact.
- Manifest được review trước khi bắt đầu `UAT-002`, `UAT-003`, `UAT-004`.

## 8. Trạng thái sau khắc phục

`UAT-001 = DONE`

Đã thực hiện:

- Tạo `release/UAT_MANIFEST_2026-07-27_11.110.md`.
- Khóa branch, full commit SHA, frontend version và Service Worker cache.
- Liệt kê artifact frontend, SQL và n8n kèm SHA-256.
- Ghi rõ thứ tự deploy/import, cảnh báo workflow reference, smoke test và rollback set.
- Tách bằng chứng source manifest khỏi bằng chứng runtime.

Còn chờ ở các task kế tiếp:

- `UAT-002`: xác minh frontend UAT chạy đúng `11.110`.
- `UAT-003`: xác minh DB UAT có đúng 16 SQL definition.
- `UAT-004`: xác minh n8n UAT có đúng workflow ID/hash/webhook/Active state.
