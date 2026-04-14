# 🚀 Critical Deployment Action Checklist (Production Migration)

This exhaustive technical advisory manual dictates the critical parameters and procedures required to successfully transition the Medstand PWA & AI Chatbot Architecture from local development sandboxes (Dev) staging to rigorous live network Production status.

---

## 1. Network Topography & System Addressing (Frontend Constants)

The solitary node demanding reconfiguration on the frontend is the Core Base Config: `env.js`.

> [!CAUTION]
> **STRICT BAN:** Sourcing environments against `localhost` configurations, HTTP domains, or dynamic ephemeral tunnel relays like `trycloudflare.com` is expressly strictly forbidden in Production, as the domain matrix resets organically upon system power loss.

- [ ] **`API_BASE` Assignment**: Override to your permanent registered API SSL Host Server (Example: `https://api.medstand.com`).
- [ ] **`N8N_BASE` Assignment**: Transcribe the operational URI for your Orchestration Worker node (Example: `https://n8n.medstand.com`).
- [ ] **`CHAT_API_KEY` Authentication**: Scrub the placeholder secret (`test123456`) and enforce a hardened secret. This exact Key must inherently align symbiotically with the webhook authentication variables injected inside N8N to prevent hostile network exploitation mapping payload abuses to LLMs.
- [ ] **TLS Configuration Compliance (HTTPS)**: Complete End-To-End ecosystem encryption is an enforced prerequisite. Progressive Web App (PWA) Service Workers mechanically refuse boot operations traversing unencrypted `HTTP` HTTP traffic layers.

---

## 2. Progressive Web Application (PWA) Cache Busting

By architectural design, the PWA client natively streams local bundle loads from device storage silos (disk cache and network caches) rendering sub-millisecond offline loads. Therefore, whenever foundational structural edits occur (HTML scaffolding revisions, CSS bundling, or new JavaScript chunks):

> [!WARNING]
> You are forced to inspect `sw.js` and elevate the `CACHE_VERSION` integers explicitly. A failure to execute this protocol inherently traps clients eternally on degraded or obsolete application releases.

- [ ] **Version Bump Execution (`CACHE_VERSION`)**:
  ```javascript
  // Edit core target within sw.js
  const CACHE_VERSION = 'medstand-v11'; // Augment chronologically to v12, v13...
  ```

Active consumer endpoints simply engage with standard Browser Refresh logic; the master registration script autonomously parses version divergence, incinerates obsolete caches, and fetches new DOM modules. Live Server complications during Development are deliberately bypassed and squashed by native exclusions hardcoded within `pwa-register.js`.

---

## 3. The N8N Backend Processing Powerhouse (AI Workflows)

- [ ] **Scale Migration (Hardware Requirements)**: Desktop execution operations using scripts off Laptops are unacceptable. Migrate whole container sets upward to Linux Virtual Private Servers (VPS) instances. Reinforce stability using standard monitoring agents like `pm2` or `Docker Containers` to secure `24/7` network survivability.
- [ ] **Database Connection Credentials**: Launch the N8N GUI portal Settings interface natively. Migrate target connections to Production Authentication Credentials referencing the active Microsoft SQL Production Node (where true tables remain generated).
- [ ] **Web Resource Control (Rate Limits)**: Without strict NGINX configuration barriers, naked static webhook endpoints incur heavy abuse footprints. Protect the node immediately through stringent API Key validations or HTTP Request Headers injected off `env.js` rules to deflect massive LLM token exhaustion costs.

---

## 4. Microsoft SQL & Master Metadata Configurations

Medstand Chatbot functions unconditionally parallel against the active dynamic MetaData maps built over raw Microsoft SQL Servers leveraging Master-Worker communication.

- [ ] **Execute Bootstrapper SQL Elements**: Launch SQL Server Management Studio mapped to the absolute Production DB target. Run/Execute all discrete SQL query routines housed in the standard `/sql/` workspace. Conclude emphatically by executing `Bootstrap_API_Metadata_Auto.sql`.
- [ ] **Principle of Least Privilege (Authentication Sandbox)**: Design specialized isolated User Database Identities mapping only absolute EXECUTE restrictions purely across `_AI` procedure names. Inputting pure `sa` Admin Master accounts against explicit API webhook runners causes astronomical risks involving SQL Injection injections and payload drops.

---

> [!TIP]
> **Summary Workflow Deploy Rule:**
> 1. Complete raw code logic verification in Dev space natively.
> 2. Open `sw.js` -> Increase active target flag `CACHE_VERSION`.
> 3. Dump master file trees upward mapping into Live Production Hosts natively.
> 4. Broadcast page reloading execution triggers out to client-tier nodes.
