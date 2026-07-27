# UAT release manifest — Medstand 11.110

**Release ID:** `MEDSTAND-UAT-20260727-11.110-RC1`  
**Môi trường đích:** `medtest` — `https://medtest.bms7.net/#/chatbot`  
**Ngày khóa source candidate:** 27/07/2026  
**Trạng thái manifest:** `SOURCE_LOCKED_RUNTIME_PENDING`  
**Mục đích:** Nguồn đối chiếu duy nhất cho deploy, import, kiểm tra runtime và rollback bản UAT `11.110`.

> Manifest này khóa source candidate. Nó không phải bằng chứng rằng frontend, SQL hoặc n8n trên UAT đã được deploy/import thành công. Bằng chứng runtime phải được cập nhật tại phần 8 sau khi thực hiện `UAT-002`, `UAT-003` và `UAT-004`.

## 1. Source identity

| Trường | Giá trị |
|---|---|
| Repository | `https://github.com/DatNguyen9240/Medstand.git` |
| Branch | `hoangdang` |
| Commit đầy đủ | `bfbaf7e092a10d4839f434427527e4c862b61796` |
| Commit rút gọn | `bfbaf7e092a1` |
| Remote candidate | `origin/hoangdang` tại cùng commit khi lập manifest |
| Frontend version | `11.110` |
| Service Worker cache | `medstand-11.110` |
| SQL baseline thay đổi gần nhất | `0e963adf5a6d6fc5d3a5bc2ef056ee377b82a238` |
| SQL baseline so sánh | `04d10563e935740145c08695c6d522aeea57726c` |

### Quy tắc khóa

- Chỉ artifact ở đúng commit nêu trên và có SHA-256 khớp manifest mới thuộc RC1.
- Không deploy từ worktree có thay đổi source chưa commit.
- Thay đổi tài liệu sau khi lập manifest không làm thay đổi artifact RC1; thay đổi source/runtime phải tạo RC mới và cập nhật hash.
- Không dùng cụm từ “bản mới nhất” để thay cho release ID hoặc commit.

## 2. Frontend deployment artifacts

Deploy các artifact dưới đây cùng một lần. Sau deploy phải kiểm tra HTTP content/hash và cache trên trình duyệt.

| Thứ tự | File | SHA-256 |
|---:|---|---|
| 1 | `index.prod.html` | `3862dcd2a5d483348c55a9112f0ec01320dcbefac6e0af2f09ed971eed17ecdc` |
| 2 | `index.html` | `3862dcd2a5d483348c55a9112f0ec01320dcbefac6e0af2f09ed971eed17ecdc` |
| 3 | `src/js/dist/app.bundle.min.js` | `1f498f060ca113c1f8ffa981a193db92ee3f0fd57ff26d14708364617ba6efb8` |
| 4 | `chatbot-widget/js/chatbot.bundle.min.js` | `cb132a5e90f50aedcc66e37d0eda7a71464372e75b55e04d2d301b84a0db1344` |
| 5 | `pages/login.html` | `7435514c4200906387e38bde7cbfb8b3ba72be80560cf7612e851d91eaa21f5a` |
| 6 | `pages/forgot-password.html` | `2c193126f9ac911ad8245c2d761984929dda194031ce1233198d704d06ccef12` |
| 7 | `sw.js` | `00a9282ad4dd7a1ebfd117407435207fa8f64a3b61dda8bf7ab1ed17ec1a7265` |

### Frontend source/build references

| File | Vai trò | SHA-256 |
|---|---|---|
| `scripts/build.js` | Khai báo `APP_VERSION=11.110` và tạo bundle | `83290ca64c9f442244919e0938e11719e016551075b35209eb551aba56788d00` |
| `chatbot-widget/js/chatbot-api-engine.js` | Source menu/action chatbot | `9b139d231100a458777717fc8c7a9d8f211cd97f64705157668e15eb9f181d08` |
| `config/natural-language/intent-map.v1.json` | Intent/API registry phía source | `00b26be7897eefefb76c3a11f2ca19fbbeee003324fa0f7599f99b62d2b371bc` |
| `scripts/natural_chat_classifier.js` | Source classifier | `da5cc024fc6bdf74a85898b7a86288df557241fe31f87c06d5092ad5030556a9` |
| `scripts/test_natural_chat_classifier.js` | Test classifier | `8091cdd2bc6c1c08aae6d405113a67a040aeb20e11c7535c9e83fb00025d3e22` |

## 3. SQL deployment set

Phạm vi SQL của RC1 là các file thay đổi kể từ baseline `04d1056`, tương ứng commit SQL `0e963ad`. Đây là các bản sửa guard temp table và SUBSTRING trên 16 procedure/bootstrap.

### Thứ tự import

Chạy từng file và dừng ngay khi có lỗi. Không import hàng loạt toàn bộ thư mục `sql/`.

| Thứ tự | File | SHA-256 |
|---:|---|---|
| 1 | `sql/Module 1 - API_GoiYDonHang_AI.sql` | `61b859fd343af3930f63b74c3b582e770f0263bb9a375b9c9598747a8c786c19` |
| 2 | `sql/Module 10 - API_SanPhamTrongTam_AI.sql` | `3d297fb2585fe9befd57f50ebc839b13f1d4105d0eb088ef2c8ee9d3af5f90fa` |
| 3 | `sql/Module 10 - API_TraCuuSanPham_AI.sql` | `4bd9a544c9c9c528538206d5790bcaae320160d345c2ef037a33b32ec05186e6` |
| 4 | `sql/Module 2 - API_TuyenBanHang_AI.sql` | `43221682f047f5a599fe0deeed81e2d71653f751a31f4f0fa7b4ed1f96d2d394` |
| 5 | `sql/Module 3 - API_ChamDiemKH_AI.sql` | `8ca6d2017971a28e0a242f4fd5ba892817ca9975c17c0cd31c5bb23961329157` |
| 6 | `sql/Module 4 - API_TichLuy_AI.sql` | `ade58d5754b513bae92096860dcb1dc627ccb520d58785f119ba35da7c4d6cb8` |
| 7 | `sql/Module 5 - API_UpsellGoiY_AI.sql` | `d671b65c2016d67d87045b99cdafe4125fbeebb3f56b5941c3ffe3bab52dd6e0` |
| 8 | `sql/Module 6 - API_DeXuatKhuyenMai_AI.sql` | `1d8738988c5a1d74ef07c92f743cd3f71eeb83f3c6ba9d224c9210ed9da4688c` |
| 9 | `sql/Module common - API_CongNoChiTiet_AI.sql` | `2c0513471cf5314541e55a362e85e76cdebc323927a7c23bb2c5d24534710009` |
| 10 | `sql/Module common - API_CongNoKhachHang_AI.sql` | `92c4b6211c27704859117eaba114a976c78c08621a2f13d0345f5c92fd8becaa` |
| 11 | `sql/Module common - API_DanhMuc_AI.sql` | `308578daba4c41589a3f69c4b871688d152836756434bc7d370facacc3a35901` |
| 12 | `sql/Module common - API_DoanhSo_AI.sql` | `2ea9566c64b007255507d566b5dfd8c5f8eb2c92690c4f5619fd11d542ef49b8` |
| 13 | `sql/Module common - API_DonHangChiTiet_Insert_AI.sql` | `3513ad8c33f3be5f3e18686591ba7b3e3220721097d2e28aef9ba1f0ae8ffc05` |
| 14 | `sql/Module common - API_DonHang_AI.sql` | `36bf0e4f289b146f29cf5dba06676c9e896976dd01d043bb85ffc4cd204c3102` |
| 15 | `sql/Module common - API_HoaDon_AI.sql` | `44d20bf3f0e1e4c79416d1d4126f26b98c1f6ce44d1a24f99e0cfc57b41b014b` |
| 16 | `sql/Bootstrap_API_Metadata_Auto_AI.sql` | `4ff9cc5d9bebf80ff779f77852db3d457ae596095f16452c507ff7f939ad9194` |

### SQL pre/post checks

- Trước import: chạy `sql/diagnostics/Business_Rule_V1_PreDeploy_Verification.sql` và lưu kết quả.
- Sau import: chạy `sql/diagnostics/Business_Rule_V1_PostDeploy_Verification.sql` và smoke test API liên quan.
- `Bootstrap_API_Metadata_Auto_AI.sql` chạy cuối để đồng bộ metadata với các procedure đã import.
- Không chạy `Cleanup_*`, fixture/mock hoặc `Add_UAT_*` trong release deploy mặc định.
- Không chạy gói mutation trong `sql/README.md` lần nữa nếu DB đã có đúng definition; xác minh trước để tránh thay đổi ngoài phạm vi RC1.

## 4. n8n workflow set

### Bắt buộc import cho thay đổi chức năng 11.110

| Thứ tự | File | Workflow ID đích | Webhook | Active mong đợi | SHA-256 |
|---:|---|---|---|---|---|
| 1 | `n8n/AI_Core/AI_Intent_Parser.json` | `Gn7nDjDgGUFOWni5` | `intent-parser` | Theo cấu hình sub-flow hiện hành | `472b85ccb9b4d1dd8f5e9e833d895c7fe2d939f34df58ef1344039239c67afa0` |
| 2 | `n8n/AI_Core/MAIN_ChatBot_V5.json` | `mQ2X8ubexBpqD3Ru` | `hook-ai-dainao` | `true` | `fee9d63d0325b702bf6e945623c257d52fb5eb63f9eb56508016767e4ca0a3ba` |

### Workflow nền phải đối chiếu, không import mù

Những file dưới đây phải có trong manifest để đối chiếu hệ thống hoàn chỉnh. Chỉ import khi runtime lệch và sau khi xác nhận credential/workflow reference.

| File | Workflow ID đích | Webhook | Active mong đợi | SHA-256 |
|---|---|---|---|---|
| `n8n/AI_Core/AI_ChatCasual.json` | `5wgkVq7UJ2GQJ9BR` | `hook-ai-casual` | Kiểm tra runtime | `f52da8eb8c1cbbc6b95ff324d7401b96c8e66a9a9a17ebd5aa706469b5612b4d` |
| `n8n/AI_Core/AI_RAG_Query.json` | `actVwBhqMGLQ6cSH` | `hook-ai-rag` | Kiểm tra runtime | `91df145fb26d762a32afd1597638bfb49786ab852ce7eb2f92f7300f1cf7b93d` |
| `n8n/AI_Core/AI_Reviewer.json` | `K2fHIkZIyZjfRkSL` | `hook-ai-reviewer` | Kiểm tra runtime | `930763407aba0aed90bec97cb7e5d6e5c9d9c90feb7bd29cc2dc601280adf484` |
| `n8n/AI_Core/AI_Upload_Reader.json` | `HQa6xx7flcNcC1oU` | `admin-upload`, `approve-catalog` | Kiểm tra runtime | `adbab7f61fc5e735cb6f9f03d524a151ed877e613cc068357091424419ff2ca1` |
| `n8n/API_Services/API_DataSource.json` | `qMD8DESZ8pXRqrMR` | `api-datasource` | `true` | `964e68580cfd076a2928c7cfa4a65bafb3d55ab9030120c28296920f58727909` |
| `n8n/API_Services/API_Execute.json` | `fCJwiyAT9r6eh1ys` | `api-execute` | `true` | `893b8878c40de1880b7beecf2c361e5d03435e0ff06690d803654e38f09f9961` |
| `n8n/API_Services/API_GetConfig.json` | `sGPz8LMQQHVp0IiL` | `api-get-config` | `true` | `aa79efc4cc56b31d0239d19c754aabd9e3e008209ab099d495242ab7e0f81e7` |
| `n8n/API_Services/API_ListActive.json` | `FRbuGdI9jz0ZZIvU` | `api-list-active` | `true` | `157682e41c8fc2d893a4eb212b2cfda83adcacfe08d17463e1149120288ba5ad` |
| `n8n/API_Services/API_SystemMeta.json` | `YAiRyFqcyVmMU5c3` | `api-get-system-meta` | `true` | `e2ef67a544b3163f49ad47cbe0658b05ec4d0dfcadc0bd14fcf37b864adcb20b` |
| `n8n/Shared/Shared_Auth_Guard.json` | `9UxECqxRaPGMF8EM` | Sub-workflow | Có thể `false` nhưng phải callable | `e4fb942391c8021bc3c703c93dc114c504a18abc94101c0b91f41bd51ef5bb3f` |

### Cảnh báo import n8n

- Trước import, export bản runtime hiện tại để làm rollback.
- Import đè đúng workflow ID đích; không tạo thêm parser/main chatbot trùng webhook.
- Sau import `MAIN_ChatBot_V5`, kiểm tra webhook vẫn là `hook-ai-dainao`.
- Với các file `API_Services`, sau import phải chọn lại node `Execute Shared Auth Guard` trỏ tới `9UxECqxRaPGMF8EM`; không tin cached workflow reference một cách mù quáng.
- Kiểm tra credential binding trên runtime; file export không phải bằng chứng credential đã được gắn đúng.

## 5. Deploy order

1. Xác nhận checkout đúng commit và hash của artifact khớp manifest.
2. Export/backup frontend hiện tại, SQL definition hiện tại và workflow n8n hiện tại.
3. Chạy SQL pre-deploy verification.
4. Import 15 procedure SQL theo thứ tự tại phần 3.
5. Chạy `Bootstrap_API_Metadata_Auto_AI.sql` cuối cùng.
6. Chạy SQL post-deploy verification và smoke test API.
7. Import `AI_Intent_Parser.json` đúng ID.
8. Import `MAIN_ChatBot_V5.json` đúng ID, xác nhận webhook và Active.
9. Đối chiếu workflow nền; chỉ import file lệch sau khi xử lý reference/credential.
10. Deploy frontend artifact `11.110` và `sw.js` cùng release.
11. Xóa/refresh cache theo version và chạy smoke test trên trình duyệt mới cùng trình duyệt đã từng dùng bản cũ.
12. Ghi bằng chứng runtime vào phần 8.

## 6. Smoke test tối thiểu

- Trang login tải đúng và đăng nhập được một Sale, một Manager.
- DevTools/network cho thấy asset có `v=11.110`; `sw.js` chứa `medstand-11.110`.
- Chatbot gọi đúng `hook-ai-dainao`.
- Một câu doanh số, một câu gợi ý đơn, một câu tuyến và một câu tồn kho không lỗi 500.
- Menu thao tác nhanh có Tạo khách hàng và Lập đơn hàng.
- `@lap_don_hang` ở luồng AI vẫn được xác định đúng là preview nếu chưa có bước xác nhận ghi thật.
- Test âm xác nhận tài khoản không xem được khách/kho ngoài quyền.

## 7. Rollback set

Trước deploy phải lưu vào vị trí vận hành được bảo vệ:

- Bản sao toàn bộ web root/runtime artifact đang chạy trước `11.110`.
- Export definition của 16 SQL object trước khi import.
- Export workflow n8n runtime trước khi ghi đè, kèm workflow ID và trạng thái Active.
- Kết quả pre-deploy verification.

Rollback thực hiện theo thứ tự ngược:

1. Restore frontend và service worker cũ.
2. Restore workflow n8n theo đúng ID, webhook và Active state.
3. Restore SQL definition cũ nếu post-deploy verification chứng minh lỗi do SQL release.
4. Chạy lại smoke test và ghi sự cố; không tiếp tục “fix forward” trên release đang lỗi.

## 8. Runtime verification record

Phần này để người triển khai điền sau deploy. Không đánh dấu task runtime `DONE` khi chưa có bằng chứng.

| Lớp | Kết quả | Thời gian | Người kiểm tra | Bằng chứng |
|---|---|---|---|---|
| Frontend `11.110` | `PENDING` | — | — | — |
| Service Worker `medstand-11.110` | `PENDING` | — | — | — |
| SQL 16/16 đúng definition | `PENDING` | — | — | — |
| Intent Parser đúng ID/hash | `PENDING` | — | — | — |
| Main Chatbot đúng ID/hash/webhook/Active | `PENDING` | — | — | — |
| Shared Auth Guard reference | `PENDING` | — | — | — |
| Smoke test Sale | `PENDING` | — | — | — |
| Smoke test Manager | `PENDING` | — | — | — |

## 9. Manifest sign-off

| Vai trò | Tên | Trạng thái | Ngày |
|---|---|---|---|
| Người lập manifest | Codex/source review | `SOURCE_PREPARED` | 27/07/2026 |
| Người deploy UAT | — | `PENDING` | — |
| Người kiểm thử kỹ thuật | — | `PENDING` | — |
| Business owner | — | `PENDING` | — |

