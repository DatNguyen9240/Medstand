# 🧪 MEDSTAND AI COMPREHENSIVE TEST REPORT
> This document outlines all the scenarios and use cases the Medstand AI ecosystem is capable of handling. Developers can use these test prompts in the Chatbot UI or Postman to thoroughly verify functionality.

---

## 1. 🤖 MODULE: NATURAL LANGUAGE PROCESSING (NLP) & AUTOMATED SALES
*(Evaluating the context comprehension capabilities of GPT-4o-mini & K_SieuLuong_V2 architectures)*

### 1.1. Order Analytics & Recommendations (Module 1)
- [ ] **Test Prompt:** `What should we sell to Phuc Khang Pharmacy today?` or `Recommend products for customer HB106.`
- [ ] **Expected AI Routing:** Triggers `@goi_y_don_hang` with the client's `ObjectID`. Returns a curated datagrid of suitable products.
- [ ] **Empty State Prompt:** `What are the top focus products to push today?`
- [ ] **Expected Output:** Triggers `@goi_y_don_hang` (NULL ObjectID) -> Returns top-selling items across the entire branch.

### 1.2. Upselling & Symptom Mining (Modules 5 & 7)
- [ ] **Test Prompt:** `What medication is recommended for a dry cough and runny nose?`
- [ ] **Expected Routing:** AI extracts keywords `dry cough, runny nose` -> Triggers `@upsell_goi_y` with `@SearchKey` -> Renders a list of condition-specific products.
- [ ] **Test Prompt:** `This prescription has Amoxicillin and Paracetamol. Are there any alternatives?`
- [ ] **Expected Routing:** Triggers `@goi_y_don_thuoc` with the string `Amoxicillin, Paracetamol` -> Identifies replacement inventory + Evaluates cross-selling logic (e.g., Probiotics recommendation).

### 1.3. Route Management & Sales Reminders (Module 2)
- [ ] **Test Prompt:** `Which customers haven't purchased in a while?` or `What does my visitation route look like today?`
- [ ] **Expected Routing:** Triggers `@tuyen_ban_hang` -> Analyzes absence thresholds and renders two analytical tables: High Priority Visits & Churn Risk Warning.

### 1.4. Customer Scoring & Loyalty Programs (Modules 3 & 4)
- [ ] **Test Prompt:** `Show me the VIP customer list` or `Who is about to stop buying?`
- [ ] **Expected Routing:** AI maps A/B/C tier grouping and triggers `@cham_diem_kh`.
- [ ] **Test Prompt:** `Check the reward accumulation progress for Minh Chau Pharmacy.`
- [ ] **Expected Routing:** Triggers `@tich_luy` -> Computes milestone progress and visualizes the data via Bar Chart or Gauge Components on the front end.

---

## 2. 📊 MODULE: EXECUTIVE DASHBOARDS (REPORTING)
*(High-speed data retrieval workflows where the AI primarily routes intents to Smart Metrics Data endpoints)*

### 2.1. Sales Revenue & Milestones (DoanhSo_AI)
- [ ] **Test Prompt:** `Show me the sales report for this month.`
- [ ] **Expected Output:** Triggers `@doanh_so` -> Renders a Bar Chart Component alongside Overview KPI Cards (Total Revenue/Income).
- [ ] **Filter Check:** Interact with the "From Date - To Date" filter on the UI and click `Search` to observe real-time data rebinding.

### 2.2. Inventory Control (DanhMuc / TonKho_AI)
- [ ] **Test Prompt:** `Display the current inventory logistics.`
- [ ] **Expected Output:** Triggers `@danh_sach_ton_kho` -> Maps active stock data to the DataGrid.
- [ ] **Test Prompt:** `Which items are nearing expiration and need urgent clearance?` or `Provide the CEO with promotional suggestions.`
- [ ] **Expected Output:** Triggers `@de_xuat_khuyen_mai` -> Categorizes findings into Near-Expiration (Red Alert) and Stagnant Stock (Orange Alert).

---

## 3. 📝 MODULE: SMART FORM ENGINE (DATA ENTRY / MUTATION)
*(Testing the auto-generated Form Rendering Infrastructure and JSON injection into the SQL Database)*

### 3.1. Customer Onboarding
- [ ] **Test Prompt:** `Create a new customer` or `Add customer`
- [ ] **Expected Output:** The AI renders the `[ Add Customer ]` UI Smart Form. Input fields (Text, Tel, Address) are dynamically mapped via `API_KhachHang_Insert_AI`.
- [ ] **Execution Test:** Input mock data and hit `Submit`. Verify that the N8N engine successfully persists the record via the backend API.

### 3.2. Order Creation & Datagrid Mutability (Orders/Details)
- [ ] **Test Prompt:** `I want to place a new order` or `Add new order`
- [ ] **Expected Output:** Renders the `[ Smart Shopping Cart ]` form linked sequentially to `API_DonHangChiTiet_Insert_AI` utilizing JSON Datagrid arrays.
- [ ] **Execution Test:** Insert line items (add medication, specify quantity). Trigger "Save" -> Monitor the JSON array packet sent during Datagrid injection.

### 3.3. Core Item Upload (SanPhamTrongTam)
- [ ] **Test Prompt:** `Configure focus products` or `View core merchandise`
- [ ] **Expected Output:** Queries and returns a data list from `API_SanPhamTrongTam_AI`. Utilizing the "Bulk Upload" functionality will reroute handling to `API_SanPhamTrongTam_Import_AI`.

---

## 4. 🗂 MODULE: COMMON CATALOG & FINANCIALS
*(Essential Operations for Sales Admins & Distribution Logistics)*

### 4.1. Account Receivables (CongNoKhachHang / CongNoChiTiet)
- [ ] **Test Prompt:** `Give me the consolidated customer debt report.`
- [ ] **Expected Output:** Presents a master summary table (`API_CongNoKhachHang_AI`). Drilling down (clicking details) will dynamically drill into `API_CongNoChiTiet_AI`.

### 4.2. Invoices & Order Ledger
- [ ] **Test Prompt:** `Look up purchase orders` / `List warehouse exit invoices`
- [ ] **Expected Output:** Executes `API_DonHang_AI` and `API_HoaDon_AI` independently to populate structural tables (Validate the dynamic @TuNgay Date Filters during the process).

---

## 💡 FINAL VERIFICATION GUIDE FOR DEVELOPERS
To conduct a reliable and exhaustive Quality Assurance cycle:
1. **Manual Endpoint Sanity:** Manually execute specific API invocations using the `@` API Picker tool (type `@` in the chatbox) to benchmark raw SQL execution limits.
2. **Intent Routing Verification:** Once static configurations prove robust, clear the form menu and conduct 100% natural conversational querying utilizing the exact "Test Prompts" documented above. This forces the N8N NLP Engine to analyze context, route the correct Intent, and forge its payload autonomously without user supervision.
3. If all checkboxes turn Green ( ☑️ ), the Core Backend architecture is comprehensively stable and clear for Production Release.
