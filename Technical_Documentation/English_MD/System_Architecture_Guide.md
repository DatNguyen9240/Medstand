# 🏛️ System Architecture Guide
**Project:** Medstand Web App & AI Chatbot
**Core Philosophy:** Zero-Frontend-Code (AI capabilities can scale without modifying Frontend Client Code)

This document is critical Knowledge Transfer material designed for future Developers and DevOps engineers adopting the project. Understanding this architecture allows for rapid horizontal scaling and maintenance.

---

## 1. 🧩 The Operational Paradigm (Master-Worker & Metadata)

The Medstand AI Chatbot system does **NOT** conform to traditional monolithic single-page app designs (where every new capability requires explicit custom JavaScript rendering). Instead, it adopts a decoupled **N8N Master Engine** architecture paired with a **"Puppet" UI Renderer**.

````mermaid
sequenceDiagram
    participant User
    participant Frontend (chatbot.js)
    participant N8N Master (K0)
    participant N8N AI Worker (K_SieuLuong)
    participant SQL Database

    User->>Frontend (chatbot.js): Natural query: "Show me today's sales"
    Frontend (chatbot.js)->>N8N Master (K0): POST /webhook/hook-ai-dainao
    N8N Master (K0)->>N8N AI Worker (K_SieuLuong): Delegates natural language parsing
    N8N AI Worker (K_SieuLuong)-->>N8N Master (K0): Returns extracted Intent: {apiCode: "@doanh_so"}
    N8N Master (K0)->>SQL Database: Lookup API_Definition to locate SPName
    N8N Master (K0)->>SQL Database: EXEC [API_DoanhSo]
    SQL Database-->>N8N Master (K0): Data Rows Output (Title, DoanhSo, TrangThai)
    N8N Master (K0)-->>Frontend (chatbot.js): Agnostic JSON Object Response
    Note over Frontend (chatbot.js): The ApiEngine dynamically sniffs <br>which column holds currency, <br>status, or names...
    Frontend (chatbot.js)-->>User: Maps the data to beautiful interactive Card Components autonomously!
````

---

## 2. 🗂️ Zero-Frontend-Code: Metamorphic UIs Driven By SQL

The heaviest frontend assets reside logically within `chatbot.js` and `chatbot-api-engine.js`. However, Developers are **STRICTLY PROHIBITED** from hardcoding custom visual component designs inside these files to satisfy new system requests.

Why? The `ApiEngine` logic executes a dynamic Semantic Regex Engine that "sniffs" the original Microsoft SQL Column Names to derive its visualization blueprint automatically.

**🔍 Mandatory SQL Naming Conventions within Stored Procedures:**
- Columns named `TenKhachHang`, `ItemName`, `TieuDe` ➔ Automatically tagged as the Primary **TITLE** block.
- Columns named `MaKhachHang`, `ID`, `Code` ➔ Rendered discreetly as Identifiers **ID**.
- Columns mapped as `TrangThai`, `PhanLoai`, `Badge` ➔ Translated into colored visual tags **BADGE** (Green/Red/Gray conditionally based on string content).
- Financial fields like `TongTien`, `DoanhSo`, `Gia` ➔ Automatically coerced to highly formatted currency decimals under **MONEY**.

> [!NOTE]
> Because of these tight behavioral heuristics, ALL arbitrary SQL rows are forcefully converted into stylish, modern "Card Components" automatically. Changing the application logic or visual rendering entirely is as simple as RENAMING THE COLUMN natively inside the Stored Procedure!

---

## 3. 🚀 The Standard Development Playbook: Feature Evolution

### Deploying a Brand New AI Capability

Assuming Management demands: *"Add a feature allowing users to query V2 Advanced Inventory via AI"*.

> [!CAUTION]
> **Do not** touch the Javascript source code. Follow this immutable 3-step pipeline:

- **Step 1 (Backend T-SQL):** Launch the SQL Server Management Studio. Create a Stored Procedure titled `API_TonKhoV2_AI`. Select your data and ensure column names stick to the heuristic rules listed in Section 2.
- **Step 2 (Database Registry):** Execute an insertion script or utilize the management UI to register your query into `API_Definition`, binding a unique ID (e.g., `@tonky_v2`) to your newly minted SP.
- **Step 3 (N8N System Prompt Alignment):** Navigate to the N8N canvas logic `K_SieuLuong_V2`. Locate the LLM orchestration node and append one rule to the System Context: *"If user inquiries about advanced inventory, immediately dictate `apiCode: "@tonky_v2"`."*

DONE! Without configuring any UI buttons, HTML tables, or rebuilding the Frontend application bundles, your system immediately understands the command and deploys the feature locally and globally.

### Maintenance & Refactoring Legacy Functions

- **Logic mutations**: Merely execute `ALTER PROCEDURE` on the host Database. The Reactivity of the UI and AI workflows remains fundamentally stable assuming the signature column heuristics are not destroyed.
- **Universal Environmental States**: The overarching global variables are locked down into `env.js` occupying the absolute web root. During migrations, host rotations, or backend swaps, you ONLY interact with `env.js` to modify active domain paths instead of hunting hardcoded strings down inside thousands of lines of logic.

---

> [!TIP]
> **To the Future Maintainer:** Medstand's infrastructure embraces the philosophies of the "Decoupled Architecture" and "Agent-Centric Routing." Data endpoints generated are consumed equally by automated chat intents and traditional UX/UI reporting dashboard modules without conflicts. Maintain this extreme standard of modularity as you engineer future features. Good luck!
