# n8n Workflows Summary

Error reading AI_ChatCasual.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

## AI_Intent_Parser.json
**Path**: `AI_Core\AI_Intent_Parser.json`

- **Webhook Intent Parser** (`n8n-nodes-base.webhook`)
- **Detect Category & Load FewShots** (`n8n-nodes-base.code`)
  - *Code summary*: 48 lines of JS.
- **Intent LLM Model** (`@n8n/n8n-nodes-langchain.lmChatOpenAi`)
- **Extract Intent Chain** (`@n8n/n8n-nodes-langchain.chainLlm`)
- **Parse & Resolve Placeholders** (`n8n-nodes-base.code`)
  - *Code summary*: 112 lines of JS.
- **Respond Intent JSON** (`n8n-nodes-base.respondToWebhook`)

## AI_RAG_Query.json
**Path**: `AI_Core\AI_RAG_Query.json`

- **Webhook RAG Search** (`n8n-nodes-base.webhook`)
- **Check JWT Security** (`n8n-nodes-base.code`)
  - *Code summary*: 3 lines of JS.
- **If Valid JWT** (`n8n-nodes-base.if`)
- **Prep Embedding Body** (`n8n-nodes-base.code`)
  - *Code summary*: 4 lines of JS.
- **OpenAI: Get Vector** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ $env.LLM_API_BASE ? $env.LLM_API_BASE : 'https://openrouter.ai/api/v1' }}/embeddings
- **Prep Qdrant Body** (`n8n-nodes-base.code`)
  - *Code summary*: 2 lines of JS.
- **Qdrant: Find Docs** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ $env.QDRANT_URL ? $env.QDRANT_URL : 'http://127.0.0.1:6333' }}/collections/medstand-policies/points/search
- **Prep OpenAI Chat Body** (`n8n-nodes-base.code`)
  - *Code summary*: 20 lines of JS.
- **OpenAI: Chat RAG** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ $env.LLM_API_BASE ? $env.LLM_API_BASE : 'https://openrouter.ai/api/v1' }}/chat/completions
- **Format Response** (`n8n-nodes-base.code`)
  - *Code summary*: 2 lines of JS.

Error reading AI_Reviewer.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

## AI_Tool_Wrapper_RAG.json
**Path**: `AI_Core\AI_Tool_Wrapper_RAG.json`

- **Execute Workflow Trigger** (`n8n-nodes-base.executeWorkflowTrigger`)
- **Call RAG Query** (`n8n-nodes-base.httpRequest`)
  - *URL*: http://127.0.0.1:5678/webhook/hook-ai-rag
- **Format Output** (`n8n-nodes-base.code`)
  - *Code summary*: 2 lines of JS.

## AI_Tool_Wrapper_SQL.json
**Path**: `AI_Core\AI_Tool_Wrapper_SQL.json`

- **Execute Workflow Trigger** (`n8n-nodes-base.executeWorkflowTrigger`)
- **Call Intent Parser** (`n8n-nodes-base.httpRequest`)
  - *URL*: http://127.0.0.1:5678/webhook/intent-parser
- **Clean Params** (`n8n-nodes-base.code`)
  - *Code summary*: 22 lines of JS.
- **Call API Execute** (`n8n-nodes-base.httpRequest`)
  - *URL*: http://127.0.0.1:5678/webhook/api-execute
- **Format Output** (`n8n-nodes-base.code`)
  - *Code summary*: 7 lines of JS.

## AI_Upload_Reader.json
**Path**: `AI_Core\AI_Upload_Reader.json`

- **Webhook Admin Upload** (`n8n-nodes-base.webhook`)
- **Check Auth & Format** (`n8n-nodes-base.code`)
  - *Code summary*: 33 lines of JS.
- **If Admin & Has File** (`n8n-nodes-base.if`)
- **Respond Error** (`n8n-nodes-base.code`)
  - *Code summary*: 1 lines of JS.
- **Route by File Type** (`n8n-nodes-base.if`)
- **Spreadsheet Reader** (`n8n-nodes-base.spreadsheetFile`)
- **Flatten ALL to Text** (`n8n-nodes-base.code`)
  - *Code summary*: 15 lines of JS.
- **If Image Type** (`n8n-nodes-base.if`)
- **Pass PDF/Word to Langchain** (`n8n-nodes-base.code`)
  - *Code summary*: 8 lines of JS.
- **Prep Vision Body** (`n8n-nodes-base.code`)
  - *Code summary*: 19 lines of JS.
- **Wait (Anti-RateLimit)** (`n8n-nodes-base.wait`)
- **OpenAI Vision OCR** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ $env.LLM_API_BASE ? $env.LLM_API_BASE : 'https://openrouter.ai/api/v1' }}/chat/completions
- **Parse OCR & Inject** (`n8n-nodes-base.code`)
  - *Code summary*: 18 lines of JS.
- **Qdrant Vector Store** (`@n8n/n8n-nodes-langchain.vectorStoreQdrant`)
- **Default Data Loader** (`@n8n/n8n-nodes-langchain.documentDefaultDataLoader`)
- **OpenAI Embeddings** (`@n8n/n8n-nodes-langchain.embeddingsOpenAi`)
- **Text Splitter** (`@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter`)
- **Respond Success** (`n8n-nodes-base.code`)
  - *Code summary*: 1 lines of JS.

## MAIN_ChatBot_V5.json
**Path**: `AI_Core\MAIN_ChatBot_V5.json`

- **Webhook AI Chat** (`n8n-nodes-base.webhook`)
- **LIB NormalizeInput** (`n8n-nodes-base.code`)
  - *Code summary*: 150 lines of JS.
- **Skip LLM?** (`n8n-nodes-base.if`)
- **Quick Intent Pass-through** (`n8n-nodes-base.code`)
  - *Code summary*: 32 lines of JS.
- **Call AI Intent Parser** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ 'http://127.0.0.1:5678/' + 'webhook/intent-parser' }}
- **LIB ConfidenceDecision** (`n8n-nodes-base.code`)
  - *Code summary*: 209 lines of JS.
- **Is Valid?** (`n8n-nodes-base.if`)
- **LIB ValidateParams** (`n8n-nodes-base.code`)
  - *Code summary*: 96 lines of JS.
- **Validate OK?** (`n8n-nodes-base.if`)
- **Call API Execute** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ 'http://127.0.0.1:5678/' + 'webhook/api-execute' }}
- **Handle SQL Error** (`n8n-nodes-base.code`)
  - *Code summary*: 4 lines of JS.
- **Format Response** (`n8n-nodes-base.code`)
  - *Code summary*: 21 lines of JS.
- **Need RAG?** (`n8n-nodes-base.if`)
- **Call RAG Fallback** (`n8n-nodes-base.httpRequest`)
  - *URL*: ={{ 'http://127.0.0.1:5678/webhook/chat-v6' }}
- **Format RAG Response** (`n8n-nodes-base.code`)
  - *Code summary*: 8 lines of JS.
- **LIB SaveContext** (`n8n-nodes-base.code`)
  - *Code summary*: 36 lines of JS.
- **Respond Fast** (`n8n-nodes-base.respondToWebhook`)
- **Respond ASK** (`n8n-nodes-base.respondToWebhook`)
- **Respond Validation Error** (`n8n-nodes-base.respondToWebhook`)

## MAIN_ChatBot_V6_Agentic.json
**Path**: `AI_Core\MAIN_ChatBot_V6_Agentic.json`

- **Webhook V6** (`n8n-nodes-base.webhook`)
- **Save Context** (`n8n-nodes-base.code`)
  - *Code summary*: 17 lines of JS.
- **AI Agent Brain** (`@n8n/n8n-nodes-langchain.agent`)
- **OpenAI Chat Model** (`@n8n/n8n-nodes-langchain.lmChatOpenAi`)
- **Redis Chat Memory** (`@n8n/n8n-nodes-langchain.memoryRedisChat`)
- **Tra cứu Số liệu (SQL)** (`@n8n/n8n-nodes-langchain.toolWorkflow`)
- **Tra cứu Tài liệu (RAG)** (`@n8n/n8n-nodes-langchain.toolWorkflow`)
- **Response Assembler** (`n8n-nodes-base.code`)
  - *Code summary*: 61 lines of JS.
- **Respond to Webhook** (`n8n-nodes-base.respondToWebhook`)

## API_DataSource.json
**Path**: `API_Services\API_DataSource.json`

- **Webhook DataSource** (`n8n-nodes-base.webhook`)
- **Check Method DataSource** (`n8n-nodes-base.code`)
  - *Code summary*: 16 lines of JS.
- **Is OPTIONS? (DataSource)** (`n8n-nodes-base.if`)
- **CORS OK (DataSource)** (`n8n-nodes-base.respondToWebhook`)
- **Build DataSource SQL** (`n8n-nodes-base.code`)
  - *Code summary*: 95 lines of JS.
- **MS SQL DataSource** (`n8n-nodes-base.microsoftSql`)
- **Respond DataSource** (`n8n-nodes-base.respondToWebhook`)

## API_Execute.json
**Path**: `API_Services\API_Execute.json`

- **Webhook Execute** (`n8n-nodes-base.webhook`)
- **Check Method Execute** (`n8n-nodes-base.code`)
  - *Code summary*: 97 lines of JS.
- **Is OPTIONS? (Execute)** (`n8n-nodes-base.if`)
- **CORS OK (Execute)** (`n8n-nodes-base.respondToWebhook`)
- **Build Execute SQL** (`n8n-nodes-base.code`)
  - *Code summary*: 80 lines of JS.
- **MS SQL Execute** (`n8n-nodes-base.microsoftSql`)
- **Format Execute Response** (`n8n-nodes-base.code`)
  - *Code summary*: 131 lines of JS.
- **Respond Execute** (`n8n-nodes-base.respondToWebhook`)
- **Execute Workflow Trigger** (`n8n-nodes-base.executeWorkflowTrigger`)
- **Is UUID Token?** (`n8n-nodes-base.if`)
- **Resolve UUID** (`n8n-nodes-base.httpRequest`)
  - *URL*: https://medtest.bms79.com/api/API_UserInfo

Error reading API_GetConfig.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

Error reading API_ListActive.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

Error reading API_SystemMeta.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

Error reading CRON_CleanupRAG.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

Error reading CRON_DailyReport.json: Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)

## LIB_FewShots_Customer.json
**Path**: `Libraries\LIB_FewShots_Customer.json`


## LIB_FewShots_Product.json
**Path**: `Libraries\LIB_FewShots_Product.json`


## LIB_FewShots_Sales.json
**Path**: `Libraries\LIB_FewShots_Sales.json`


