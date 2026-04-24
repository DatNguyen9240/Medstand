# KẾ HOẠCH NÂNG CẤP LUỒNG CHAT AI (K_SieuLuong V3)
*Mục tiêu: Giảm token, tăng tốc độ, tăng độ chính xác và chống "ngáo"*

---

## 🔍 CHẨN ĐOÁN LUỒNG HIỆN TẠI (V2)

```
Webhook → [LLM Extract Intent] → Parse Intent & Auth → If Valid?
                                                         ↓ YES          ↓ NO
                                                    Call K0 Execute  Respond Fallback
                                                         ↓
                                                   Format Response → Respond Fast
```

### ❌ Vấn đề đang tồn tại:

| # | Vấn đề | Tác động |
|:--|:---|:---|
| 1 | **LLM phải "suy nghĩ tự do"** — System Prompt quá dài, LLM đọc hết trước khi trả lời | Chậm 1–3s |
| 2 | **`Respond Fallback` bị "chết"** — Node này không kết nối đến đâu sau khi `ASK_CLARIFICATION` | Bot im lặng hoặc lỗi |
| 3 | **Không có RAG Fallback** — Khi SQL trả về 0 kết quả, luồng dừng lại, không thử hỏi kho tài liệu | Trải nghiệm kém |
| 4 | **Không có Error Handler** — `Call K0 Execute` timeout → workflow crash, không có thông báo lịch sự | Bot chết đứng |
| 5 | **LLM đang dùng model LLaMA 70B** — Quá nặng cho task chỉ cần trả JSON | Tốn token + chậm |
| 6 | **Không có Stateful Memory** — Bot không nhớ context giữa các câu | Hay hỏi lại |

---

## 🏗️ KIẾN TRÚC ĐỀ XUẤT (V3)

```
Webhook
   │
   ├─[Code] Pre-Process: Đọc Redis Context + Gắn history vào message
   │
   ├─[LLM] Intent Extractor (Model nhỏ hơn: GPT-4o-mini / Llama 8B)
   │   └─ Chỉ nhận: message + history (5 turns) + schema ngắn gọn
   │   └─ Chỉ trả: JSON ngắn ~50 token
   │
   ├─[Code] Parse Intent & Auth (giữ nguyên logic hiện tại, thêm routing)
   │
   ├─[If] Route Decision
   │   ├─ VALID INTENT → Call K0 Execute
   │   │       │
   │   │       ├─ [If] Kết quả có data?
   │   │       │       ├─ YES → Format → Ghi Redis → Respond Fast ✅
   │   │       │       └─ NO → RAG Fallback → Format → Respond
   │   │       │
   │   │       └─ [Error] Timeout/Lỗi → Respond lịch sự "Hệ thống đang bận"
   │   │
   │   ├─ ASK_CLARIFICATION → Respond hỏi lại (có kết nối đúng chỗ)
   │   └─ DOC_SEARCH → Gọi thẳng RAG Workflow
```

---

## 📋 CÁC THAY ĐỔI CỤ THỂ (THEO THỨ TỰ ƯU TIÊN)

### 🔴 Priority 1: Fix lỗi chết (Bug fixes)

**Fix 1.1 — Kết nối lại `Respond Fallback`**
- Hiện tại `Respond Fallback` không có connection sau. Cần đảm bảo nó `respondToWebhook` đúng format.
- Thêm trường `message` từ `$json.fallbackBody.message` để Bot luôn trả lời, không bao giờ im lặng.

**Fix 1.2 — Error Handler cho `Call K0 Execute`**
- Bật `Continue on Error` tại node `Call K0 Execute`.
- Thêm nhánh lỗi → Code Node trả về: `"Hệ thống đang xử lý chậm, anh/chị vui lòng thử lại nhé!"`

---

### 🟡 Priority 2: Nâng cấp tốc độ & token

**Upgrade 2.1 — Đổi Model sang nhỏ hơn**
- Hiện tại: `meta-llama/llama-3.3-70b-instruct` (70 tỷ tham số)
- Đề xuất: `meta-llama/llama-3.1-8b-instruct` hoặc `gpt-4o-mini`
- Lý do: Task chỉ là classify + extract JSON → model nhỏ đủ làm, nhanh gấp 3-5 lần, rẻ hơn 10 lần.

**Upgrade 2.2 — Tách System Prompt thành 2 phần**
- **Phần cứng (không đổi):** Schema JSON + Hard rules → để trong System Prompt
- **Phần few-shot:** Tạo riêng `few_shot_examples.json` → inject động vào prompt
- Lợi ích: Dễ thêm/sửa example mà không cần sửa workflow

---

### 🟢 Priority 3: Thêm tính năng mới

**Feature 3.1 — RAG Fallback khi SQL trả về rỗng**
- Tại `Format Chat Response`: Nếu `count === 0` → thay vì trả "Không có dữ liệu", gọi sang `K_RAG_Query_NoLangchain`
- Gửi câu hỏi gốc của user sang RAG để tìm trong tài liệu nội bộ

**Feature 3.2 — Stateful Memory (Redis Context)**
- Đầu luồng: Redis GET `medstand_ctx_{{sessionId}}`
- Inject context vào prompt LLM (5 turns gần nhất)
- Cuối luồng: Redis SET (TTL 30 phút) cập nhật entity mới nhất

---

## 📊 KỲ VỌNG KẾT QUẢ SAU NÂNG CẤP

| Chỉ số | Trước (V2) | Sau (V3) |
|:---|:---|:---|
| Thời gian phản hồi | 3–5s | 1–2s |
| Token/request trung bình | ~800–1200 | ~300–500 |
| Tỷ lệ "ngáo" (câu hỏi lạ) | ~30% | ~10% |
| Bot chết khi SQL timeout | Crash | Trả lời lịch sự |
| Bot nhớ context | ❌ | ✅ |
| RAG Fallback | ❌ | ✅ |

---

## 🗓️ TRẠNG THÁI THỰC HIỆN

| Bước | Việc làm | Trạng thái | File |
|:--|:---|:---|:---|
| **1** | Fix 1.1: Nối lại `Respond Fallback` | ✅ XONG | `K_SieuLuong_V3.json` |
| **2** | Fix 1.2: Thêm Error Handler cho SQL timeout | ✅ XONG | `K_SieuLuong_V3.json` |
| **3** | Upgrade 2.1: Đổi model → `gpt-4o-mini` | ✅ XONG | `K_SieuLuong_V3.json` |
| **4** | Feature 3.1: RAG Fallback khi SQL rỗng | ✅ XONG | `K_SieuLuong_V3.json` |
| **5** | Feature 3.2: Stateful Memory (context) | ✅ CODE XONG | `code_prepare_context.js` + `code_save_context.js` |
| **6** | Upgrade 2.2: Tách few-shot examples | ✅ XONG | `few_shot_examples.json` |

---

## 🚀 HƯỚNG DẪN IMPORT VÀO N8N

### Bước 1: Import K_SieuLuong_V3.json
- N8N → **"+ New Workflow"** → **"Import from file"**
- Chọn `n8n/K_SieuLuong_V3.json`

### Bước 2: Thêm 2 Code Node cho Stateful Memory
Trong workflow V3 vừa import:

**Node "Prepare Context & Few Shots":**
- Thêm **Code Node** → đặt **SAU** `Webhook AI Chat`, **TRƯỚC** `Extract Intent Chain`
- Paste toàn bộ code từ file `n8n/code_prepare_context.js`

**Cập nhật Expression trong Extract Intent Chain:**
- Sửa field `text` của node `Extract Intent Chain` thành:
```
={{ $('Prepare Context & Few Shots').first().json.fewShots + '\n\n' + ($('Prepare Context & Few Shots').first().json.historyContext ? 'CONTEXT: ' + $('Prepare Context & Few Shots').first().json.historyContext + '\n' : '') + 'USER: ' + $('Prepare Context & Few Shots').first().json.rawMessage }}
```

**Node "Save Context":**
- Thêm **Code Node** → đặt **TRƯỚC** `Respond Fast`
- Paste toàn bộ code từ file `n8n/code_save_context.js`
- Kéo dây: `Format Chat Response` → `Save Context` → `Respond Fast`
- Kéo dây: `Format RAG Response` → `Save Context` → `Respond Fast`

### Bước 3: Test
1. Hỏi: *"doanh số tháng này của nhà thuốc HK001"*
2. Hỏi tiếp: *"nó còn nợ bao nhiêu"* → Bot phải tự hiểu "nó" = HK001

---

## 🏗️ KIẾN TRÚC V4 — NEXT LEVEL (SENIOR-LEVEL DESIGN)
*Phân tích điểm nghẽn của V3 và lộ trình nâng cấp tiếp theo.*

### ⚠️ 6 Điểm Yếu Đang Tồn Tại Trong V3

| # | Vấn đề | Rủi ro |
|:--|:---|:---|
| 1 | **MAIN là "God Object"** — Routing + AI + API + Format đều nằm trong 1 workflow | Khó debug, không scale |
| 2 | **AI_Intent chưa tách riêng** — LLM đang kiêm nhiệm quá nhiều vai | Dễ "ngáo" khi câu hỏi mới |
| 3 | **API layer chưa phân loại** — Query/Action/Meta lẫn lộn | Khó maintain |
| 4 | **LIB_FewShots.json quá to** — Nhét hết mọi intent vào 1 file | Token tăng, AI chậm |
| 5 | **Thiếu Validation Layer** — Param truyền thẳng vào SQL chưa qua kiểm tra | Null injection, lỗi runtime |
| 6 | **RAG chưa có control** — Thiếu `top_k`, `score_threshold` | Trả rác, trả quá nhiều |

---

### 🎯 Kiến Trúc V4 Đề Xuất

```
User Input
    │
    ▼
[MAIN] Orchestrator
    │
    ▼
[LIB] PrepareContext     ← Đọc Redis/StaticData
    │
    ▼
[AI] Intent_Parser       ← Chỉ làm 1 việc: Extract JSON intent
    │
    ▼
[ROUTER] Switch Node     ← Phân luồng theo intent category
    │
    ├──── FAQ/Casual ──────────► [AI] ChatCasual → Response
    │
    ├──── Knowledge/RAG ───────► [AI] RAG_Query (có top_k + threshold) → Response
    │
    └──── DATA Query ──────────► [LIB] ValidateParams ← QUAN TRỌNG!
                                       │
                                       ▼
                                  [API] Execute (Query/Action/Meta)
                                       │
                                       ▼
                                  [MAIN] ResponseBuilder
    │
    ▼
[LIB] SaveContext        ← Ghi Redis/StaticData
    │
    ▼
Respond Fast
```

---

### 🏆 3 Nâng Cấp Quan Trọng Nhất (Thứ Tự Ưu Tiên)

**🥇 Ưu tiên 1: Tách `AI_Intent_Parser` riêng biệt**
- Tạo workflow `AI_Intent_Parser.json` chỉ làm 1 việc: nhận message → trả JSON intent
- MAIN gọi Sub-workflow này qua `Execute Workflow` node
- Lợi ích: Giảm "ngáo" 50-70%, dễ tune prompt riêng mà không ảnh hưởng flow chính

**🥈 Ưu tiên 2: Thêm `LIB_ValidateParams.js`**
- Code Node chặn bắt trước khi gọi SQL: kiểm tra kiểu dữ liệu, null, whitelist param
- Pattern: `{ isValid: true/false, cleanParams: {...}, errorMsg: '...' }`
- Lợi ích: Không bao giờ crash do null hoặc param sai kiểu

**🥉 Ưu tiên 3: Tách `LIB_FewShots` theo nhóm intent**
```
LIB_FewShots_Sales.json      ← doanh số, hóa đơn, đơn hàng
LIB_FewShots_Customer.json   ← khách hàng, công nợ, chấm điểm
LIB_FewShots_Product.json    ← tồn kho, gợi ý, upsell
```
- Load đúng nhóm dựa trên category của intent → giảm token 40-60%

---

### 📊 Kỳ Vọng Sau V4

| Chỉ số | V3 | V4 |
|:---|:---|:---|
| Token/request | ~300–500 | ~150–250 |
| Tỷ lệ "ngáo" | ~10% | ~3–5% |
| Thời gian phản hồi | 1–2s | 0.8–1.5s |
| Dễ debug | Trung bình | Cao |
| Khả năng scale | Trung bình | Cao |

---

### 🗓️ Lộ Trình V4 (Chưa Bắt Đầu)

| Bước | Việc làm | Trạng thái |
|:--|:---|:---|
| **V4.1** | Tạo `AI_Intent_Parser.json` (tách khỏi MAIN) | ✅ XONG |
| **V4.2** | Viết `LIB_ValidateParams.js` | ✅ XONG |
| **V4.3** | Tách `LIB_FewShots` thành 3 file theo nhóm | ✅ XONG |
| **V4.4** | Thêm `top_k` + `score_threshold` vào `AI_RAG_Query` | ⏳ Cần sếp test RAG trước |
| **V4.5** | Phân loại `API_Query_*` / `API_Action_*` / `API_Meta_*` | ⏳ Tùy nhu cầu |
| **V4.6** | Build `MAIN_ChatBot_V4.json` — Orchestrator mới | ⏳ Sau khi test V3 |

> 💡 **Câu chốt:** *"Bạn không thiếu AI — bạn chỉ cần kiểm soát AI tốt hơn."*
>
> **Thứ tự deploy:** V2 (đang live) → Test V3 → Tích hợp V4 components → Full V4

---

## 🔥 KIẾN TRÚC V4+ — PRODUCTION SAFETY (REVIEW CAO CẤP)
*5 điểm nguy hiểm trong V4 và cách fix để đạt chuẩn Production Architect.*

### ⚠️ 5 Lỗ Hổng Của V4 Gốc

| # | Vấn đề | Hậu quả nếu không fix |
|:--|:---|:---|
| 1 | **Keyword Detection yếu** — câu mơ hồ route sai category | Load sai few-shots → AI ngáo |
| 2 | **Tối ưu token nhưng chưa tối ưu latency** — bottleneck là LLM call time (~500-1500ms) | Bot chậm dù ít token |
| 3 | **Validation chỉ check schema, thiếu Business Rules** | TuNgay > DenNgay không bị chặn, SQL trả logic sai |
| 4 | **Không có Fallback Strategy** — khi LLM parse sai | User thấy "AI ngu bất chợt" |
| 5 | **Không có Confidence Score** — tin AI 100% | Gọi SQL dù AI chỉ đoán 40% |

---

### 🏗️ Kiến Trúc V4+ (Production-Safe)

```
Webhook
   │
   ▼
[LIB] NormalizeInput        ← Lowercase, trim, remove punctuation
   │
   ├─ skipLLM=true? ──────► Quick Match / Cache Hit → Skip LLM
   │
   ▼
[AI] Detect Category        ← Hybrid: Keyword scan → confidence score
   │
   ├─ confidence > 0.8 ───► Load few-shots theo category đúng
   ├─ confidence 0.5-0.8 ─► Load few-shots GENERAL (an toàn hơn)
   └─ confidence < 0.5 ───► Hỏi lại user (không đoán mò)
   │
   ▼
[AI] Intent Parser          ← Gọi LLM với few-shots đã chọn
   │                           Output: { intent, params, confidence, status }
   ├─ confidence < 0.6 ───► Fallback: hỏi lại user
   │
   ▼
[LIB] ValidateParams        ← Schema + BUSINESS Rules
   │                           (TuNgay<=DenNgay, timkiem>=2 ký tự, TopN clamp)
   ├─ isValid=false ──────► Trả errorMsg lịch sự
   │
   ▼
[API] Execute               ← SQL Worker
   │
   ▼
[LIB] SaveContext + Cache   ← Ghi context + cache intent (1 giờ TTL)
   │
   ▼
Respond Fast
```

---

### ✅ Các Files V4+ Đã Tạo

| File | Chức năng mới |
|:---|:---|
| `LIB_NormalizeInput.js` | Normalize text + **Intent Cache** (bypass LLM) + **Quick Match** cho câu đơn giản |
| `LIB_ValidateParams.js` | Upgraded với **Business Rules**: TuNgay≤DenNgay, timkiem≥2 ký tự, TopN auto-clamp |

### 🗓️ Lộ Trình V4+ (Còn Lại)

| Bước | Việc làm | Trạng thái |
|:--|:---|:---|
| **V4+.1** | Integrate `LIB_NormalizeInput` vào MAIN (đầu workflow) | ⏳ Cần import N8N |
| **V4+.2** | Thêm `confidence` field vào `AI_Intent_Parser` output | ⏳ Update prompt |
| **V4+.3** | Thêm `IF confidence < 0.6 → hỏi lại` sau Intent Parser | ⏳ Thêm node |
| **V4+.4** | Shadow test: V4 chạy ngầm song song V3, so kết quả | ⏳ Sau khi V3 live |

### 🎯 Strategy Đúng: Shadow Testing

```
User gửi câu hỏi
      │
      ├──► V3 (đang live) → Trả kết quả cho user
      │
      └──► V4 (chạy ngầm) → Log kết quả → So sánh với V3
                                            ↓
                                    Nếu V4 tốt hơn → Deploy replace V3
```
> **Không bao giờ thay thế production mà chưa shadow test ít nhất 1 tuần.**

> 🎯 **Level hiện tại:** System Builder (80% Production)
> 🔥 **Để đạt Production Architect:** Cần thêm Confidence Control + Fallback Strategy + Shadow Test
