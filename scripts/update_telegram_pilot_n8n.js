'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN_PATH = path.join(ROOT, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json');
const AUTH_GUARD_PATH = path.join(ROOT, 'n8n', 'Shared', 'Shared_Auth_Guard.json');
const API_EXECUTE_PATH = path.join(ROOT, 'n8n', 'API_Services', 'API_Execute.json');
const TELEGRAM_DIR = path.join(ROOT, 'n8n', 'Telegram');
const TELEGRAM_AUTH_PATH = path.join(TELEGRAM_DIR, 'TG_Auth_Verify.json');
const TELEGRAM_CHAT_PATH = path.join(TELEGRAM_DIR, 'TG_ChatBot_Demo.json');
const TELEGRAM_NOTIFICATION_PATH = path.join(TELEGRAM_DIR, 'TG_Notification_Dispatch.json');
const TELEGRAM_LINK_CODE_PATH = path.join(TELEGRAM_DIR, 'TG_Link_Code_Issue.json');
const TELEGRAM_SYSTEM_ANNOUNCEMENT_PATH = path.join(TELEGRAM_DIR, 'TG_System_Announcement.json');

const SQL_CREDENTIAL = {
  id: '5ixwpwlPHaQhoThr',
  name: 'Microsoft SQL account',
};

const TELEGRAM_CREDENTIAL = {
  id: 'medstandTelegramChatbotDemo',
  name: 'Telegram Chatbot Demo',
};

const POLLER_HEADER_CREDENTIAL = {
  id: 'medstandTelegramPollerHeader',
  name: 'Telegram Poller Local Auth',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function nodeByName(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Missing node "${name}" in ${workflow.name}`);
  return node;
}

function updateMainWorkflow() {
  const workflow = readJson(MAIN_PATH);
  const resolver = nodeByName(workflow, 'Resolve UUID V5');
  resolver.parameters.jsCode = `const authHeader = $('Webhook AI Chat').first().json.headers?.authorization || $('Webhook AI Chat').first().json.headers?.Authorization || 'Bearer empty';
const bearer = String(authHeader).match(/^Bearer\\s+(.+)$/i);
const token = bearer ? bearer[1].trim() : '';
const isTelegramTicket = /^telegram_[0-9a-f]{64}$/.test(token);
const headers = $('Webhook AI Chat').first().json.headers || {};
const internalTelegram = isTelegramTicket
  && String(headers['x-medstand-channel'] || '').toLowerCase() === 'telegram-demo'
  && String($env.TELEGRAM_INTERNAL_BRIDGE_KEY || '').length === 64
  && String(headers['x-medstand-bridge-key'] || '') === String($env.TELEGRAM_INTERNAL_BRIDGE_KEY || '');
if (internalTelegram) {
  const username = String(headers['x-medstand-tg-user'] || '').trim();
  const telegramUserId = String(headers['x-medstand-tg-user-id'] || '').trim();
  const serverSessionId = String(headers['x-medstand-tg-session'] || '').trim();
  let displayName = '';
  try {
    displayName = decodeURIComponent(String(headers['x-medstand-tg-display-name'] || ''));
  } catch (_) {
    displayName = '';
  }
  if (/^[A-Za-z0-9._-]{2,50}$/.test(username)
      && /^\\d{1,20}$/.test(telegramUserId)
      && /^tg-[a-f0-9]{40}$/.test(serverSessionId)) {
    return [{ json: {
      AuthStatus: 'PREVERIFIED_FOR_PARSING', StatusCode: 200,
      username, UserName: username,
      DisplayName: displayName.slice(0, 160),
      UserGroupID: String(headers['x-medstand-tg-role'] || '').slice(0, 30),
      BranchID: String(headers['x-medstand-tg-branch'] || '').slice(0, 50),
      EmployeeID: String(headers['x-medstand-tg-employee'] || '').slice(0, 50),
      Manager: /^(?:1|true)$/i.test(String(headers['x-medstand-tg-manager'] || '')),
      Capabilities: 'api.read', Channel: 'telegram', ServerSessionID: serverSessionId
    } }];
  }
}
try {
  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: isTelegramTicket
      ? 'http://127.0.0.1:5678/webhook/telegram-auth-verify'
      : 'https://medtest.bms79.com/api/API_UserInfo',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: isTelegramTicket ? { ticket: token } : {},
    json: true,
    timeout: 10000
  });
  return [{ json: response || {} }];
} catch (error) {
  return [{ json: { error: error.message, status: error.status || 401, authenticated: false } }];
}`;

  const parser = nodeByName(workflow, 'Parse User Info V5');
  const oldSession = "const tokenFingerprint = sha256Text(bearer[1].trim());\nconst userProfile = {";
  const newSession = "const tokenFingerprint = sha256Text(bearer[1].trim());\nconst providedSessionId = String(data.ServerSessionID || data.serverSessionId || '').trim();\nconst serverSessionId = /^(?:ss|tg)-[a-f0-9]{40}$/i.test(providedSessionId)\n  ? providedSessionId.toLowerCase()\n  : 'ss-' + tokenFingerprint.slice(0, 40);\nconst userProfile = {";
  if (parser.parameters.jsCode.includes(oldSession)) {
    parser.parameters.jsCode = parser.parameters.jsCode
      .replace(oldSession, newSession)
      .replace("serverSessionId: 'ss-' + tokenFingerprint.slice(0, 40),\n  identitySource: 'API_UserInfo_VERIFIED'", "serverSessionId,\n  identitySource: String(data.Channel || data.channel || '').toLowerCase() === 'telegram'\n    ? 'TELEGRAM_TICKET_VERIFIED'\n    : 'API_UserInfo_VERIFIED'");
  } else if (!parser.parameters.jsCode.includes('const providedSessionId = String(data.ServerSessionID')) {
    throw new Error('MAIN Parse User Info V5 session marker changed; refusing unsafe patch');
  }

  const normalizeInput = nodeByName(workflow, 'LIB NormalizeInput');
  const dateResolverMarker = "  if (period === 'LAST_MONTH') {";
  const todayDateResolver = `  if (period === 'TODAY') {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'LAST_MONTH') {`;
  if (!normalizeInput.parameters.jsCode.includes("period === 'TODAY'")) {
    if (!normalizeInput.parameters.jsCode.includes(dateResolverMarker)) {
      throw new Error('MAIN relative date resolver marker changed; refusing unsafe patch');
    }
    normalizeInput.parameters.jsCode = normalizeInput.parameters.jsCode.replace(
      dateResolverMarker,
      todayDateResolver,
    );
  }

  const previousPeriodMarker = '      } else if (/\\bthang truoc\\b/.test(folded)) {';
  const todayPeriodHandler = `      } else if (/\\b(?:hom nay|ngay hom nay)\\b/.test(folded)) {
        entities = { ...entities, ...resolveRelativeDateRange('TODAY', options.now) };
      } else if (/\\bthang truoc\\b/.test(folded)) {`;
  if (!normalizeInput.parameters.jsCode.includes("resolveRelativeDateRange('TODAY', options.now)")) {
    if (!normalizeInput.parameters.jsCode.includes(previousPeriodMarker)) {
      throw new Error('MAIN sales date marker changed; refusing unsafe patch');
    }
    normalizeInput.parameters.jsCode = normalizeInput.parameters.jsCode.replace(
      previousPeriodMarker,
      todayPeriodHandler,
    );
  }

  const respondNodes = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.respondToWebhook');
  for (const node of respondNodes) {
    const entries = node.parameters?.options?.responseHeaders?.entries;
    if (!Array.isArray(entries)) continue;
    const allowHeaders = entries.find((entry) => entry.name === 'Access-Control-Allow-Headers');
    if (allowHeaders && !allowHeaders.value.includes('X-Medstand-Channel')) {
      allowHeaders.value += ', X-Medstand-Channel';
    }
  }

  writeJson(MAIN_PATH, workflow);
}

function updateSharedAuthGuard() {
  const workflow = readJson(AUTH_GUARD_PATH);
  const verify = nodeByName(workflow, 'Verify Token with API UserInfo');
  verify.parameters.url = "={{ /^telegram_[0-9a-f]{64}$/.test($json._authInternal.token) ? 'http://127.0.0.1:5678/webhook/telegram-auth-verify' : 'https://medtest.bms79.com/api/API_UserInfo' }}";
  verify.parameters.sendBody = true;
  verify.parameters.specifyBody = 'json';
  verify.parameters.jsonBody = "={{ JSON.stringify(/^telegram_[0-9a-f]{64}$/.test($json._authInternal.token) ? { ticket: $json._authInternal.token } : {}) }}";
  verify.typeVersion = 4.2;
  verify.parameters.options = {
    response: { response: { responseFormat: 'json' } },
    timeout: 10000,
  };
  writeJson(AUTH_GUARD_PATH, workflow);
}

function updateApiExecuteLatency() {
  const workflow = readJson(API_EXECUTE_PATH);
  const edge = (node) => ({ node, type: 'main', index: 0 });
  const setOutput = (source, outputIndex, destinations) => {
    const connection = workflow.connections[source] ||= { main: [] };
    connection.main ||= [];
    while (connection.main.length <= outputIndex) connection.main.push([]);
    connection.main[outputIndex] = destinations.map(edge);
  };

  // RespondToWebhook can continue to downstream nodes after the HTTP response
  // has been sent. A strict Respond -> Audit chain guarantees that audit
  // latency cannot delay the caller (branch scheduling order is not relied on).
  setOutput('Format Execute Response', 0, ['Respond Execute']);
  setOutput('Respond Execute', 0, ['Prepare Audit - Execute Success']);
  setOutput('Is Authenticated? (Execute)', 1, ['Respond Auth Error (Execute)']);
  setOutput('Respond Auth Error (Execute)', 0, ['Prepare Audit - Execute Auth Error']);
  setOutput('Is API Authorized? (Execute)', 1, ['Respond Authorization Error (Execute)']);
  setOutput('Respond Authorization Error (Execute)', 0, ['Prepare Audit - Execute Authorization Error']);
  setOutput('Is API Request Valid?', 1, ['Respond Validation Error (Execute)']);
  setOutput('Respond Validation Error (Execute)', 0, ['Prepare Audit - Execute Validation Error']);

  for (const name of [
    'Write Audit - Execute Success',
    'Write Audit - Execute Auth Error',
    'Write Audit - Execute Authorization Error',
    'Write Audit - Execute Validation Error',
  ]) {
    const node = nodeByName(workflow, name);
    node.onError = 'continueRegularOutput';
    workflow.connections[name] = { main: [[]] };
  }

  // n8n's MSSQL node expects a recordset. Returning one also avoids the
  // undefined-error path seen when the audit procedure returns no rows.
  for (const node of workflow.nodes.filter((candidate) => candidate.name.startsWith('Prepare Audit - Execute '))) {
    const code = String(node.parameters?.jsCode || '');
    if (!code.includes('SELECT AuditWritten = 1;')) {
      node.parameters.jsCode = code.replace(
        "  @StartedAt='${esc(startedAt, 30)}';`;",
        "  @StartedAt='${esc(startedAt, 30)}';\nSELECT AuditWritten = 1;`;",
      );
    }
    if (!node.parameters.jsCode.includes('SELECT AuditWritten = 1;')) {
      throw new Error(`Audit query marker changed in "${node.name}"; refusing latency patch`);
    }
  }

  writeJson(API_EXECUTE_PATH, workflow);
}

function createTelegramAuthWorkflow() {
  const workflow = {
    id: 'medstandTelegramAuthVerify',
    name: 'TG-01 · Telegram Auth Verify',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'telegram-auth-verify',
          responseMode: 'responseNode',
          options: {},
        },
        id: 'tg-auth-webhook',
        name: 'Webhook Telegram Auth Verify',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [-720, 0],
        webhookId: 'cb0db2a7-bfc8-4e66-ae61-b74e0fce6b9f',
      },
      {
        parameters: {
          jsCode: `const body = $json.body || $json || {};
const ticket = String(body.ticket || '').trim().toLowerCase();
const now = Date.now();
const sha256Text = (value) => {
  const ascii = unescape(encodeURIComponent(String(value || '')));
  const rightRotate = (word, amount) => (word >>> amount) | (word << (32 - amount));
  const maxWord = Math.pow(2, 32); const words = []; let result = '';
  const bitLength = ascii.length * 8; const hash = []; const constants = []; const composite = {};
  let primeCount = 0;
  for (let candidate = 2; primeCount < 64; candidate++) {
    if (!composite[candidate]) {
      for (let multiple = candidate; multiple < 313; multiple += candidate) composite[multiple] = candidate;
      hash[primeCount] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      constants[primeCount++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  let padded = ascii + '\\x80';
  while (padded.length % 64 !== 56) padded += '\\x00';
  for (let index = 0; index < padded.length; index++) words[index >> 2] |= padded.charCodeAt(index) << ((3 - index) % 4) * 8;
  words[words.length] = (bitLength / maxWord) | 0; words[words.length] = bitLength;
  let state = hash.slice(0, 8);
  for (let offset = 0; offset < words.length;) {
    const schedule = words.slice(offset, offset += 16); const previous = state.slice(0); state = previous.slice(0);
    for (let round = 0; round < 64; round++) {
      const w15 = schedule[round - 15], w2 = schedule[round - 2]; const a = state[0], e = state[4];
      const word = round < 16 ? schedule[round] : schedule[round] = ((rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + schedule[round - 16] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)) + schedule[round - 7]) | 0;
      const temp1 = (state[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & state[5]) ^ (~e & state[6])) + constants[round] + word) | 0;
      const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & state[1]) ^ (a & state[2]) ^ (state[1] & state[2]))) | 0;
      state = [temp1 + temp2 | 0, state[0], state[1], state[2], state[3] + temp1 | 0, state[4], state[5], state[6]];
    }
    for (let index = 0; index < 8; index++) state[index] = state[index] + previous[index] | 0;
  }
  for (let index = 0; index < 8; index++) for (let shift = 3; shift >= 0; shift--) {
    const byte = state[index] >> (shift * 8) & 255; result += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return result;
};
const cacheKey = 'ticket_' + sha256Text(ticket);
const staticData = $getWorkflowStaticData('global');
staticData.telegramAuthCache ||= {};
const cache = staticData.telegramAuthCache;
for (const key of Object.keys(cache)) {
  if (!cache[key] || Number(cache[key].expiresAtMs || 0) <= now) delete cache[key];
}
const cached = cache[cacheKey];
const cacheHit = Boolean(cached && Number(cached.expiresAtMs || 0) > now);
return [{ json: {
  ticket,
  cacheKey,
  valid: /^telegram_[0-9a-f]{64}$/.test(ticket),
  cacheHit,
  cachedAuth: cacheHit ? cached.value : null
} }];`,
        },
        id: 'tg-auth-normalize',
        name: 'Normalize Ticket',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-500, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-is-draft-action-condition',
                leftValue: '={{ $json.actionMode }}',
                rightValue: 'DRAFT_',
                operator: { type: 'string', operation: 'startsWith' },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-chat-if-draft',
        name: 'Is Draft Order Action?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [0, -220],
      },
      {
        parameters: {
          jsCode: `const source = $json || {};
const esc = (value, max) => String(value ?? '').replace(/'/g, "''").slice(0, max);
const userId = esc(source.userId, 20);
const username = esc(source.medstandUserName, 50);
const mode = String(source.actionMode || '');
let query = '';
if (mode === 'DRAFT_PREVIEW') {
  const customerId = esc(source.draftPayload?.customerId, 50);
  const requested = esc(JSON.stringify(source.draftPayload?.items || []), 4000);
  query = "EXEC dbo.API_TelegramOrderDraft_Preview_AI @TelegramUserID='" + userId
    + "', @Username='" + username + "', @ObjectID='" + customerId
    + "', @RequestedItemsJson=N'" + requested + "';";
} else if (mode === 'DRAFT_SAVE') {
  const token = esc(source.draftPayload?.token, 32);
  const requestId = 'req-tg-' + esc(source.updateId, 20);
  query = "EXEC dbo.API_TelegramOrderDraft_Save_AI @TelegramUserID='" + userId
    + "', @Username='" + username + "', @DraftToken='" + token
    + "', @RequestID='" + requestId + "';";
} else if (mode === 'DRAFT_CANCEL') {
  const token = esc(source.draftPayload?.token, 32);
  query = "EXEC dbo.API_TelegramOrderDraft_Cancel_AI @TelegramUserID='" + userId
    + "', @Username='" + username + "', @DraftToken='" + token + "';";
} else {
  throw new Error('DRAFT_ACTION_NOT_SUPPORTED');
}
return [{ json: { ...source, query } }];`,
        },
        id: 'tg-chat-build-draft-sql',
        name: 'Build Draft Order SQL',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [220, -300],
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: '={{ $json.query }}',
        },
        id: 'tg-chat-execute-draft-sql',
        name: 'Execute Draft Order Action',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [440, -300],
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const source = $('Build Draft Order SQL').first().json || {};
const rows = $input.all().map((item) => item.json || {});
const first = rows[0] || {};
const mode = String(source.actionMode || '');
const money = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ';
const errorRow = rows.find((row) => Number(row.MsgType || 0) > 0);
if (errorRow) {
  return [{ json: { ...source, telegramText: String(errorRow.Msg || 'Không thể xử lý đơn nháp.'), showDraftButtons: false } }];
}
if (mode === 'DRAFT_PREVIEW') {
  const token = String(first.DraftToken || '');
  if (!/^[0-9a-f]{32}$/.test(token) || !rows.length) {
    return [{ json: { ...source, telegramText: 'Không thể tạo bản xem trước đơn nháp.', showDraftButtons: false } }];
  }
  const details = rows.map((row, index) => {
    let line = (index + 1) + '. ' + row.ItemID + ' — ' + row.ItemName
      + '\\n   SL: ' + row.Quantity + (row.Unit ? ' ' + row.Unit : '')
      + ' × ' + money(row.UnitPrice) + ' = ' + money(row.LineTotal);
    if (Number(row.GiftQuantity || 0) > 0) line += ' | Tặng: ' + row.GiftQuantity;
    if (Number(row.DiscountPercent || 0) > 0) line += ' | CK: ' + row.DiscountPercent + '%';
    return line;
  });
  const total = rows.reduce((sum, row) => sum + Number(row.LineTotal || 0), 0);
  const text = 'XEM TRƯỚC ĐƠN NHÁP\\nKhách hàng: ' + first.ObjectID + ' — ' + first.ObjectName
    + '\\n\\n' + details.join('\\n')
    + '\\n\\nTạm tính: ' + money(total)
    + '\\nHiệu lực xác nhận: 15 phút.'
    + '\\n\\nBấm “Lưu nháp” để ghi đơn Status -1. Đơn chưa được gửi duyệt.';
  return [{ json: { ...source, telegramText: text, showDraftButtons: true, draftToken: token } }];
}
if (mode === 'DRAFT_SAVE' && Number(first.MsgType || 0) === 5 && first.DocumentID) {
  const replay = Boolean(first.IsReplay);
  const text = (replay ? 'Đơn này đã được lưu nháp trước đó.' : 'Đã lưu đơn nháp thành công.')
    + '\\nMã đơn: ' + first.DocumentID
    + '\\nTrạng thái: Nháp (chưa gửi duyệt)'
    + '\\nBạn có thể mở web Medstand để chỉnh sửa hoặc gửi duyệt.';
  return [{ json: { ...source, telegramText: text, showDraftButtons: false } }];
}
return [{ json: { ...source, telegramText: String(first.Msg || 'Đã xử lý bản xem trước.'), showDraftButtons: false } }];`,
        },
        id: 'tg-chat-format-draft',
        name: 'Format Draft Order Reply',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [660, -300],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-ticket-valid-condition',
                leftValue: '={{ $json.valid }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-auth-if-valid',
        name: 'Ticket Shape Valid?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-280, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-ticket-cache-hit-condition',
                leftValue: '={{ $json.cacheHit }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-auth-if-cache-hit',
        name: 'Verified Ticket Cached?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-40, -100],
      },
      {
        parameters: {
          jsCode: "return [{ json: { ...($json.cachedAuth || {}), AuthCache: 'SERVER_15S' } }];",
        },
        id: 'tg-auth-return-cache',
        name: 'Return Cached Auth',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [200, -200],
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: "={{ \"EXEC dbo.API_TelegramAuthTicket_Verify_AI @Ticket='\" + $json.ticket.replace(/'/g, \"''\") + \"';\" }}",
        },
        id: 'tg-auth-query',
        name: 'Verify Ticket in SQL',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [200, -40],
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const row = $json || {};
const ok = String(row.AuthStatus || '').toUpperCase() === 'AUTHENTICATED'
  && String(row.username || row.UserName || '').trim();
return [{ json: ok ? { ...row, StatusCode: 200 } : {
  AuthStatus: 'AUTH_TOKEN_INVALID',
  StatusCode: 401,
  error: 'Telegram authentication ticket is invalid or expired.'
} }];`,
        },
        id: 'tg-auth-format',
        name: 'Format Auth Result',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [440, -40],
      },
      {
        parameters: {
          jsCode: `const row = $json || {};
const authenticated = String(row.AuthStatus || '').toUpperCase() === 'AUTHENTICATED'
  && Number(row.StatusCode || 0) === 200;
if (authenticated) {
  const now = Date.now();
  const ticketExpiry = Date.parse(String(row.TicketExpiresAtUtc || ''));
  const expiresAtMs = Math.min(Number.isFinite(ticketExpiry) ? ticketExpiry : now + 15000, now + 15000);
  const cacheKey = String($('Normalize Ticket').first().json.cacheKey || '');
  if (/^ticket_[a-f0-9]{64}$/.test(cacheKey) && expiresAtMs > now) {
    const staticData = $getWorkflowStaticData('global');
    staticData.telegramAuthCache ||= {};
    staticData.telegramAuthCache[cacheKey] = { expiresAtMs, value: row };
  }
}
return [{ json: row }];`,
        },
        id: 'tg-auth-cache-success',
        name: 'Cache Successful Auth',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [680, -40],
      },
      {
        parameters: {
          jsCode: "return [{ json: { AuthStatus: 'AUTH_TOKEN_INVALID', StatusCode: 401, error: 'Telegram authentication ticket is invalid.' } }];",
        },
        id: 'tg-auth-invalid',
        name: 'Reject Invalid Ticket',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [200, 140],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify($json) }}',
          options: {
            responseCode: '={{ Number($json.StatusCode || 401) }}',
            responseHeaders: {
              entries: [
                { name: 'Cache-Control', value: 'no-store' },
              ],
            },
          },
        },
        id: 'tg-auth-respond',
        name: 'Respond Auth Result',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [920, 0],
      },
    ],
    connections: {
      'Webhook Telegram Auth Verify': { main: [[{ node: 'Normalize Ticket', type: 'main', index: 0 }]] },
      'Normalize Ticket': { main: [[{ node: 'Ticket Shape Valid?', type: 'main', index: 0 }]] },
      'Ticket Shape Valid?': {
        main: [
          [{ node: 'Verified Ticket Cached?', type: 'main', index: 0 }],
          [{ node: 'Reject Invalid Ticket', type: 'main', index: 0 }],
        ],
      },
      'Verified Ticket Cached?': {
        main: [
          [{ node: 'Return Cached Auth', type: 'main', index: 0 }],
          [{ node: 'Verify Ticket in SQL', type: 'main', index: 0 }],
        ],
      },
      'Return Cached Auth': { main: [[{ node: 'Respond Auth Result', type: 'main', index: 0 }]] },
      'Verify Ticket in SQL': { main: [[{ node: 'Format Auth Result', type: 'main', index: 0 }]] },
      'Format Auth Result': { main: [[{ node: 'Cache Successful Auth', type: 'main', index: 0 }]] },
      'Cache Successful Auth': { main: [[{ node: 'Respond Auth Result', type: 'main', index: 0 }]] },
      'Reject Invalid Ticket': { main: [[{ node: 'Respond Auth Result', type: 'main', index: 0 }]] },
    },
    pinData: {},
    settings: { executionOrder: 'v1' },
    meta: { templateCredsSetupCompleted: true },
  };
  // MAIN receives a server-owned parsing identity from the ticket-issuance
  // result, while API_Execute remains the single authoritative ticket verifier.
  // Keep this verifier stateless so revocation and expiry are always immediate.
  workflow.nodes = workflow.nodes.filter((node) => ![
    'Verified Ticket Cached?', 'Return Cached Auth', 'Cache Successful Auth',
  ].includes(node.name));
  nodeByName(workflow, 'Normalize Ticket').parameters.jsCode = `const body = $json.body || $json || {};
const ticket = String(body.ticket || '').trim().toLowerCase();
return [{ json: {
  ticket,
  valid: /^telegram_[0-9a-f]{64}$/.test(ticket)
} }];`;
  workflow.connections = {
    'Webhook Telegram Auth Verify': { main: [[{ node: 'Normalize Ticket', type: 'main', index: 0 }]] },
    'Normalize Ticket': { main: [[{ node: 'Ticket Shape Valid?', type: 'main', index: 0 }]] },
    'Ticket Shape Valid?': {
      main: [
        [{ node: 'Verify Ticket in SQL', type: 'main', index: 0 }],
        [{ node: 'Reject Invalid Ticket', type: 'main', index: 0 }],
      ],
    },
    'Verify Ticket in SQL': { main: [[{ node: 'Format Auth Result', type: 'main', index: 0 }]] },
    'Format Auth Result': { main: [[{ node: 'Respond Auth Result', type: 'main', index: 0 }]] },
    'Reject Invalid Ticket': { main: [[{ node: 'Respond Auth Result', type: 'main', index: 0 }]] },
  };
  const draftNodeNames = new Set([
    'Is Draft Order Action?', 'Build Draft Order SQL',
    'Execute Draft Order Action', 'Format Draft Order Reply',
  ]);
  const draftOrderNodes = workflow.nodes.filter((node) => draftNodeNames.has(node.name));
  workflow.nodes = workflow.nodes.filter((node) => !draftNodeNames.has(node.name));
  writeJson(TELEGRAM_AUTH_PATH, workflow);
  return draftOrderNodes;
}

function buildTelegramNormalizeCode() {
  return String.raw`const update = $json.body || $json || {};
const callback = update.callback_query || {};
const isCallback = Boolean(String(callback.id || '').trim());
const message = update.message || update.edited_message || callback.message || {};
const chat = message.chat || {};
const from = isCallback ? (callback.from || {}) : (message.from || {});
const chatId = String(chat.id ?? '').trim();
const userId = String(from.id ?? '').trim();
const updateId = String(update.update_id ?? '').trim();
const callbackQueryId = String(callback.id || '').trim();
const callbackData = String(callback.data || '').trim();
const callbackActions = {
  'menu:sales_today': 'Hôm nay doanh số của tôi bao nhiêu?',
  'menu:sales_month': 'Doanh số tháng này của tôi bao nhiêu?',
  'menu:route_today': 'Hôm nay tôi nên ghé khách nào?',
  'menu:notifications': 'Thông báo chưa đọc của tôi',
  'menu:draft_order': '/draft',
  'menu:whoami': '/whoami',
  'menu:help': '/help'
};
const draftCallback = /^draft:(save|cancel):([0-9a-f]{32})$/.exec(callbackData);
if (draftCallback) callbackActions[callbackData] = '/draft-' + draftCallback[1] + ' ' + draftCallback[2];
const messageText = typeof message.text === 'string' ? message.text.replace(/\s+/g, ' ').trim() : '';
const foldIntent = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9._-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const canonicalizeBusinessText = (value) => {
  const folded = foldIntent(value);
  const code = String(value || '').match(/\b[A-Za-z][A-Za-z0-9._-]*\d{2,}[A-Za-z0-9._-]*\b/)?.[0]?.toUpperCase() || '';
  const today = /\b(hom nay|ngay nay|today)\b/.test(folded);
  const routeVerb = /\b(ghe|di|tham|cham soc|gap|tuyen|lich trinh|lich ghe)\b/.test(folded);
  const customerWord = /\b(khach|khach hang|nha thuoc|quay thuoc)\b/.test(folded);
  if ((today && routeVerb && customerWord)
      || /\b(tuyen|lich trinh|lich ghe)\s+(hom nay|ngay nay)\b/.test(folded)
      || /\b(hom nay|ngay nay)\s+(toi|minh|em)?\s*(nen|can|phai)?\s*(di|ghe|tham)\b/.test(folded)) {
    return 'Hôm nay tôi nên ghé khách nào?';
  }
  if (today && /\b(doanh so|doanh thu|ban duoc|dat duoc)\b/.test(folded)) {
    return 'Hôm nay doanh số của tôi bao nhiêu?';
  }
  if (/\b(thang nay|trong thang)\b/.test(folded) && /\b(doanh so|doanh thu|ban duoc|dat duoc)\b/.test(folded)) {
    return 'Doanh số tháng này của tôi bao nhiêu?';
  }
  if (/\b(thong bao|tin moi|canh bao)\b/.test(folded)
      && /\b(xem|co gi|moi|chua doc|cua toi|cho toi)\b/.test(folded)) {
    return 'Thông báo chưa đọc của tôi';
  }
  if (code && /\b(ton kho|con hang|con bao nhieu|kiem tra kho|trong kho)\b/.test(folded)) {
    return 'Tồn kho sản phẩm ' + code;
  }
  if (code && /\b(cong no|con no|no bao nhieu|khoan no|du no)\b/.test(folded)) {
    return 'Cho tôi xem công nợ khách hàng ' + code;
  }
  return value;
};
const text = isCallback
  ? String(callbackActions[callbackData] || '')
  : canonicalizeBusinessText(messageText);
const isLoginCommand = /^\/login(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text);
const numeric = (value) => /^\d{1,20}$/.test(value);
const privateChat = chat.type === 'private' && numeric(chatId) && chatId === userId;
const callbackAllowed = !isCallback || Boolean(callbackActions[callbackData]);
const canIssueTicket = privateChat
  && numeric(userId)
  && /^\d{1,20}$/.test(updateId)
  && callbackAllowed
  && text.length > 0
  && text.length <= 2000;
const now = Date.now();
const lockTtlMs = 60000;
global.__MEDSTAND_TELEGRAM_USER_LOCKS__ ||= Object.create(null);
const locks = global.__MEDSTAND_TELEGRAM_USER_LOCKS__;
for (const key of Object.keys(locks)) {
  if (!locks[key] || Number(locks[key].expiresAtMs || 0) <= now) delete locks[key];
}
const currentLock = locks[userId];
let processingAccepted = true;
let ownsProcessingSlot = false;
if (canIssueTicket) {
  if (currentLock && currentLock.ownerUpdateId !== updateId && currentLock.expiresAtMs > now) {
    processingAccepted = false;
  } else {
    locks[userId] = { ownerUpdateId: updateId, expiresAtMs: now + lockTtlMs };
    ownsProcessingSlot = true;
  }
}
const canProcess = canIssueTicket && processingAccepted;
let rejectionText = '';
if (!privateChat) rejectionText = 'Bot demo Medstand chỉ hỗ trợ chat riêng. Vui lòng mở bot và nhắn trực tiếp.';
else if (isCallback && !callbackAllowed) rejectionText = 'Nút thao tác không hợp lệ hoặc đã hết hạn.';
else if (!text) rejectionText = 'Hiện bot demo chỉ nhận tin nhắn văn bản.';
else if (text.length > 2000) rejectionText = 'Tin nhắn quá dài. Vui lòng rút gọn còn tối đa 2.000 ký tự.';
else if (!processingAccepted) rejectionText = 'Yêu cầu trước đang được xử lý. Vui lòng chờ kết quả rồi thử lại.';
else if (!canIssueTicket) rejectionText = 'Tin nhắn Telegram không hợp lệ.';
return [{ json: {
  chatId, userId, updateId, text, originalText: messageText, privateChat, canIssueTicket, canProcess,
  processingAccepted, ownsProcessingSlot, rejectionText,
  isCallback, callbackQueryId, callbackData, isLoginCommand,
  conversationId: 'tgconv-' + userId
} }];`;
}

function buildTelegramFormatterCode() {
  return String.raw`const source = $('Prepare Authorized Action').first().json;
const raw = $json || {};
const technical = /^(success|status|code|errorcode|apicode|contractversion|requestid|metadata|ruleversion|rulesource|revenuebasis|revenuerecognition|cache_id|notificationid|objecttype|rowid|internalid|stt|r|f|m|c)$/i;
const fold = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value).trim();
  return text.length > 300 ? text.slice(0, 297) + '…' : text;
};
const parseNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value ?? '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const formatNumber = (value) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
const isMoneyKey = (key) => /(?:doanh so|doanh thu|cong no|tong no|du no|so tien|gia ban|gia tri|don gia|thanh tien|amount|revenue|outstanding|debit|credit|remaining|paid|unitprice|price)/.test(fold(key));
const isStockKey = (key) => /(?:ton kho|so luong ton|quantity in stock|quantityinstock|available stock|availablestock)/.test(fold(key));
const compactKey = (key) => fold(key).replace(/\s+/g, '');
const semanticAliases = {
  objectid: 'customerid', customerid: 'customerid', makhachhang: 'customerid',
  objectname: 'customername', customername: 'customername', tencuahang: 'customername', tenkhachhang: 'customername',
  itemid: 'itemid', masanpham: 'itemid', itemname: 'itemname', tensanpham: 'itemname',
  documentid: 'documentid', sochungtu: 'documentid', sohoadon: 'documentid', sodonhang: 'documentid',
  documentdate: 'documentdate', ngaychungtu: 'documentdate', ngayhoadon: 'documentdate', ngaydonhang: 'documentdate',
  machungtu: 'documentid', mahd: 'documentid', invoicenumber: 'documentid', invoiceid: 'documentid',
  ngaykhoancongno: 'debtdate', debtdate: 'debtdate',
  loaikhoancongno: 'debttype', documenttype: 'debttype',
  giatribandau: 'originalamount', debitamount: 'originalamount', sotien: 'originalamount',
  dathanhtoantra: 'paidamount', creditamount: 'paidamount',
  trangthaithanhtoan: 'paymentstatus', collectionstatus: 'paymentstatus',
  trangthaicongno: 'debtstatus', paymentstatus: 'debtstatus',
  songayquahan: 'overduedays', overduedays: 'overduedays',
  phone: 'phone', dienthoai: 'phone', sodienthoai: 'phone',
  address: 'address', diachi: 'address',
  lastpurchasedate: 'lastpurchasedate', lanmuacuoidate: 'lastpurchasedate'
};
const semanticKey = (key) => semanticAliases[compactKey(key)] || compactKey(key);
const isDateKey = (key) => /(?:date|ngay|thoi gian|createdat|updatedat|effectivefrom|effectiveto|asofdate|lastpurchase|expiry)/.test(fold(key));
const formatDate = (key, value) => {
  if (!isDateKey(key)) return '';
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (!match) return '';
  const date = match[3] + '/' + match[2] + '/' + match[1];
  const showTime = /(?:thoi gian|createdat|updatedat)/.test(fold(key)) && match[4];
  return showTime ? date + ' ' + match[4] + ':' + match[5] : date;
};
const friendlyLabels = {
  itemid: 'Mã sản phẩm',
  itemname: 'Tên sản phẩm',
  objectid: 'Mã khách hàng',
  objectname: 'Tên khách hàng',
  customerid: 'Mã khách hàng',
  customername: 'Tên khách hàng',
  tencuahang: 'Tên khách hàng',
  phone: 'Điện thoại',
  address: 'Địa chỉ',
  lichghe: 'Lịch ghé',
  tuyen: 'Tuyến',
  asofdate: 'Tính đến',
  warehouseid: 'Mã kho',
  warehousename: 'Kho',
  unit: 'ĐVT',
  quantityinstock: 'Tồn kho',
  availablestock: 'Tồn có thể bán',
  stockdatastatus: 'Trạng thái tồn',
  documentid: 'Số chứng từ',
  documentdate: 'Ngày chứng từ',
  machungtu: 'Số chứng từ',
  mahd: 'Số chứng từ',
  invoicenumber: 'Số chứng từ',
  invoiceid: 'Số chứng từ',
  ngaykhoancongno: 'Ngày công nợ',
  debtdate: 'Ngày công nợ',
  loaikhoancongno: 'Loại khoản',
  documenttype: 'Loại khoản',
  giatribandau: 'Giá trị ban đầu',
  debitamount: 'Giá trị ban đầu',
  sotien: 'Giá trị ban đầu',
  dathanhtoantra: 'Đã thanh toán',
  creditamount: 'Đã thanh toán',
  trangthaithanhtoan: 'Thanh toán',
  collectionstatus: 'Thanh toán',
  trangthaicongno: 'Trạng thái công nợ',
  paymentstatus: 'Trạng thái công nợ',
  songayquahan: 'Số ngày quá hạn',
  overduedays: 'Số ngày quá hạn',
  totalamount: 'Tổng tiền',
  paidamount: 'Đã thanh toán',
  remainingamount: 'Còn nợ',
  unitprice: 'Đơn giá',
  quantity: 'Số lượng',
  recommendedquantity: 'Số lượng gợi ý',
  risklevel: 'Mức rủi ro',
  lastpurchasedate: 'Lần mua cuối',
  reason: 'Lý do',
  programname: 'Chương trình',
  currentsales: 'Doanh số hiện tại',
  nextmilestone: 'Mốc kế tiếp',
  remainingtonewmilestone: 'Còn thiếu',
  gift: 'Quà tặng',
  expirydate: 'Hạn dùng',
  lotnumber: 'Số lô',
  questionid: 'Mã câu hỏi',
  questiontext: 'Câu hỏi',
  answer: 'Câu trả lời',
  surveydate: 'Ngày khảo sát',
  title: 'Tiêu đề',
  content: 'Nội dung',
  createdat: 'Thời gian',
  updatedat: 'Cập nhật lúc',
  summary: 'Tóm tắt',
  body: 'Nội dung',
  notificationtype: 'Loại thông báo',
  priority: 'Mức ưu tiên',
  effectivefromutc: 'Hiệu lực từ',
  effectivetoutc: 'Hiệu lực đến',
  type: 'Loại',
  name: 'Tên',
  lanmuacuoidate: 'Lần mua cuối',
  medicaldisclaimer: 'Lưu ý chuyên môn'
};
const displayKey = (key) => friendlyLabels[compactKey(key)] || friendlyLabels[semanticKey(key)] || key;
const enumLabels = {
  OTHER_RECEIVABLE: 'Khoản phải thu khác',
  OPENING_BALANCE: 'Số dư đầu kỳ',
  UNPAID: 'Chưa thanh toán',
  PARTIALLY_PAID: 'Thanh toán một phần',
  PAID: 'Đã thanh toán',
  DUE_DATE_UNKNOWN: 'Chưa xác định hạn',
  OVERDUE: 'Quá hạn',
  NOT_DUE: 'Chưa đến hạn'
};
const formatFieldValue = (key, value) => {
  const formattedDate = formatDate(key, value);
  if (formattedDate) return formattedDate;
  const numeric = parseNumber(value);
  const moneySemantic = ['originalamount', 'paidamount', 'remainingamount', 'totalamount'];
  if ((isMoneyKey(key) || moneySemantic.includes(semanticKey(key))) && numeric !== null) return formatNumber(numeric) + ' đ';
  if (isStockKey(key) && numeric !== null && numeric < 0) return '⚠️ ' + formatNumber(numeric);
  if (numeric !== null && typeof value === 'number') return formatNumber(numeric);
  const enumValue = enumLabels[String(value || '').trim().toUpperCase()];
  if (enumValue) return enumValue;
  return displayValue(value);
};
const profiles = {
  '@danh_sach_tonkho': {
    title: 'Kết quả tồn kho',
    noData: 'Không tìm thấy tồn kho phù hợp trong phạm vi tài khoản của bạn.',
    fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','Kho','WarehouseName','ĐVT','Unit','Tồn Kho','Số Lượng Tồn','QuantityInStock','AvailableStock','StockDataStatus','Giá Bán']
  },
  '@tra_cuu_san_pham': {
    title: 'Thông tin sản phẩm',
    noData: 'Không tìm thấy sản phẩm phù hợp.',
    fields: ['Mã Sản Phẩm','ItemID','Mã','Tên Sản Phẩm','ItemName','Tên','ĐVT','Unit','Quy Cách','Nhóm','Giá Bán','Tồn Kho']
  },
  '@cong_no_khach_hang': {
    title: 'Danh sách công nợ',
    noData: 'Không ghi nhận công nợ trong phạm vi tài khoản của bạn.',
    fields: ['Mã Khách Hàng','ObjectID','CustomerID','Mã','Tên Khách Hàng','ObjectName','CustomerName','Tên','Tổng Nợ','Công Nợ','Đã Thanh Toán','Còn Nợ','Hạn Thanh Toán','AsOfDate']
  },
  '@cong_no_chi_tiet': {
    title: 'Chi tiết công nợ',
    noData: 'Khách hàng này không có khoản công nợ phù hợp trong phạm vi của bạn.',
    fields: ['Mã Khách Hàng','ObjectID','CustomerID','Tên Khách Hàng','ObjectName','CustomerName','Số Chứng Từ','DocumentID','MaChungTu','InvoiceNumber','Ngày Công Nợ','NgayKhoanCongNo','DebtDate','Loại Khoản','LoaiKhoanCongNo','DocumentType','Giá Trị Ban Đầu','GiaTriBanDau','DebitAmount','Đã Thanh Toán','DaThanhToanTra','CreditAmount','Còn Nợ','RemainingAmount','Thanh Toán','TrangThaiThanhToan','CollectionStatus','Trạng Thái Công Nợ','TrangThaiCongNo','PaymentStatus','Số Ngày Quá Hạn','SoNgayQuaHan','OverdueDays']
  },
  '@tuyen_ban_hang': {
    title: 'Tuyến bán hàng đề xuất',
    noData: 'Hôm nay chưa có khách hàng đạt điều kiện ưu tiên trong phạm vi của bạn.',
    fields: ['Mã Khách Hàng','ObjectID','CustomerID','Tên Khách Hàng','ObjectName','CustomerName','TenCuaHang','Phone','Địa Chỉ','Address','Tuyến','Tuyen','Lịch Ghé','LichGhe','Số Ngày Chưa Mua','Lần Mua Cuối','LastPurchaseDate','LanMuaCuoiDate','Lý Do','Ưu Tiên','Công Nợ']
  },
  '@goi_ydon_hang': {
    title: 'Gợi ý đơn hàng',
    noData: 'Chưa có đủ dữ liệu để gợi ý đơn hàng cho khách hàng này.',
    fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','ĐVT','Unit','Số Lượng Gợi Ý','Quantity','Giá Bán','Thành Tiền','Lý Do']
  },
  '@upsell_goi_y': {
    title: 'Gợi ý bán kèm',
    noData: 'Chưa có sản phẩm bán kèm phù hợp cho khách hàng này.',
    fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','ĐVT','Unit','Giá Bán','Tồn Kho','Lý Do','Mức Độ Phù Hợp']
  },
  '@hoa_don': {
    title: 'Danh sách hóa đơn',
    noData: 'Không tìm thấy hóa đơn phù hợp trong phạm vi của bạn.',
    fields: ['Số Hóa Đơn','DocumentID','Ngày Hóa Đơn','DocumentDate','Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Tổng Tiền','Đã Thanh Toán','Còn Nợ','Trạng Thái']
  },
  '@hoa_don_chi_tiet': {
    title: 'Chi tiết hóa đơn',
    noData: 'Không tìm thấy chi tiết hóa đơn hoặc hóa đơn nằm ngoài phạm vi của bạn.',
    fields: ['Số Hóa Đơn','DocumentID','Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','ĐVT','Unit','Số Lượng','Đơn Giá','Thành Tiền']
  },
  '@don_hang': {
    title: 'Danh sách đơn hàng',
    noData: 'Không tìm thấy đơn hàng phù hợp trong phạm vi của bạn.',
    fields: ['Số Đơn Hàng','DocumentID','Ngày Đơn Hàng','DocumentDate','Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Tổng Tiền','Trạng Thái']
  },
  '@cham_diem_kh': {
    title: 'Phân loại khách hàng',
    noData: 'Chưa có đủ dữ liệu để phân loại khách hàng trong phạm vi của bạn.',
    fields: ['Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Nhóm','Tier','Mức Rủi Ro','RiskLevel','Doanh Số','Lần Mua Cuối','Lý Do']
  },
  '@tich_luy': {
    title: 'Tiến độ tích lũy',
    noData: 'Chưa có dữ liệu tích lũy phù hợp cho khách hàng này.',
    fields: ['Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Chương Trình','ProgramName','Doanh Số Hiện Tại','CurrentSales','Mốc Kế Tiếp','NextMilestone','Còn Thiếu','Quà Kế Tiếp','Gift']
  },
  '@goi_ydon_thuoc': {
    title: 'Sản phẩm liên quan tham khảo',
    noData: 'Chưa tìm thấy sản phẩm liên quan phù hợp.',
    fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','ĐVT','Unit','Tồn Kho','AvailableStock','Giá Bán','Lý Do','MedicalDisclaimer']
  },
  '@san_pham_trong_tam': {
    title: 'Sản phẩm trọng tâm',
    noData: 'Hiện chưa có chương trình sản phẩm trọng tâm phù hợp.',
    fields: ['Chương Trình','ProgramName','Từ Ngày','Đến Ngày','Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','ĐVT','Unit','Tồn Kho','Giá Bán']
  },
  '@de_xuat_khuyen_mai': {
    title: 'Sản phẩm cần xem xét khuyến mãi',
    noData: 'Chưa có sản phẩm cần xem xét khuyến mãi trong phạm vi của bạn.',
    fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','Số Lô','LotNumber','Hạn Dùng','ExpiryDate','Tồn Kho','Giá Bán','Lý Do','Trạng Thái']
  },
  '@danh_muc': {
    title: 'Kết quả danh mục',
    noData: 'Không tìm thấy dữ liệu danh mục phù hợp.',
    fields: ['Mã','ID','Tên','Name','Loại','Type','Địa Chỉ','Trạng Thái','Chi Nhánh','Kho']
  },
  '@khao_sat360': {
    title: 'Khảo sát 360°',
    noData: 'Chưa có dữ liệu khảo sát 360° cho khách hàng này.',
    fields: ['Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Mã Câu Hỏi','QuestionID','Câu Hỏi','QuestionText','Câu Trả Lời','Answer','Ngày Khảo Sát','SurveyDate']
  },
  '@danh_sach_cau_hoi_khao_sat': {
    title: 'Danh sách câu hỏi khảo sát',
    noData: 'Hiện chưa có câu hỏi khảo sát phù hợp.',
    fields: ['Mã Câu Hỏi','QuestionID','Câu Hỏi','QuestionText','Loại Câu Hỏi','Bắt Buộc','Thứ Tự']
  },
  '@kiem_tra_khao_sat': {
    title: 'Trạng thái khảo sát',
    noData: 'Khách hàng này chưa có trạng thái khảo sát.',
    fields: ['Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Trạng Thái','Tiến Độ','Số Câu Đã Trả Lời','Tổng Số Câu','Ngày Khảo Sát']
  },
  '@kiem_tra_khao_sat_ngay': {
    title: 'Khảo sát trong ngày',
    noData: 'Hôm nay chưa có khảo sát phù hợp trong phạm vi của bạn.',
    fields: ['Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Trạng Thái','Ngày Khảo Sát','SurveyDate','Nhân Viên']
  },
  '@lich_su_khao_sat': {
    title: 'Lịch sử khảo sát',
    noData: 'Chưa có lịch sử khảo sát cho khách hàng này.',
    fields: ['Mã Khách Hàng','ObjectID','Tên Khách Hàng','ObjectName','Ngày Khảo Sát','SurveyDate','Trạng Thái','Điểm','Nhân Viên']
  },
  '@thong_bao': {
    title: 'Thông báo',
    noData: 'Hiện chưa có thông báo mới trong phạm vi của bạn.',
    fields: ['Tiêu Đề','Title','Tóm Tắt','Summary','Nội Dung','Content','Body','Loại','Type','NotificationType','Mức Ưu Tiên','Priority','Thời Gian','CreatedAt','EffectiveFromUtc','Trạng Thái']
  },
  '@tim_san_pham_theo_trieu_chung': {
    title: 'Sản phẩm tham khảo theo từ khóa',
    noData: 'Không tìm thấy sản phẩm còn hàng phù hợp với từ khóa này.',
    fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','ĐVT','Unit','Tồn Có Thể Bán','AvailableStock','Kho','Giá Bán','Lý Do','MedicalDisclaimer']
  }
};
const rawError = raw.error;
const errorText = typeof rawError === 'string'
  ? rawError
  : String(rawError?.message || rawError?.description || '').trim();
let text = String(raw.message || raw.reply || errorText || '').trim();
if (!text && (rawError || Number(raw.statusCode || 0) >= 400)) {
  text = 'Chatbot tạm thời chưa thể xử lý yêu cầu. Vui lòng thử lại.';
}
const rows = Array.isArray(raw.data) ? raw.data : [];
const apiCode = String(raw.ApiCode || raw.apiCode || '').toLowerCase();
const profile = profiles[apiCode] || null;
const account = displayValue(source.medstandUserName);
const question = fold(source.text);
if (apiCode === '@doanh_so' && rows.length) {
  const parseMoney = (value) => parseNumber(value) || 0;
  const formatMoney = (value) => formatNumber(value) + ' đ';
  const groupOf = (row) => fold(row?.['Nhóm'] || row?.Group || '');
  const scopedRows = rows.filter((row) => groupOf(row).includes('nhan vien'));
  const summaryRows = scopedRows.length ? scopedRows : [rows[0]];
  const sumField = (key) => summaryRows.reduce((sum, row) => sum + parseMoney(row?.[key]), 0);
  const first = summaryRows[0] || rows[0] || {};
  const fromDateRaw = displayValue(first['Từ Ngày']);
  const toDateRaw = displayValue(first['Đến Ngày']);
  const fromDate = formatDate('Ngày', fromDateRaw) || fromDateRaw;
  const toDate = formatDate('Ngày', toDateRaw) || toDateRaw;
  const period = fromDate && toDate
    ? (fromDate === toDate ? 'ngày ' + toDate : 'từ ' + fromDate + ' đến ' + toDate)
    : 'trong kỳ đã chọn';
  text = 'Doanh số ' + period + (account ? ' của ' + account : '') + ':'
    + '\n• Tổng doanh số: ' + formatMoney(sumField('Doanh Số'))
    + '\n• Đã xuất/giao: ' + formatMoney(sumField('Doanh Số Đã Xuất/Giao'))
    + '\n• Đã thu: ' + formatMoney(sumField('Doanh Thu Đã Thu'));
} else if (apiCode === '@doanh_so' && !rows.length && raw.success !== false) {
  text = question.includes('hom nay')
    ? 'Hôm nay chưa ghi nhận doanh số trong phạm vi' + (account ? ' của ' + account : ' tài khoản của bạn') + '.'
    : 'Không tìm thấy dữ liệu doanh số trong khoảng thời gian bạn yêu cầu.';
} else if (profile && !rows.length && raw.success !== false) {
  const target = String(source.text || '').match(/\b[A-Za-z][A-Za-z0-9._-]*\d{2,}[A-Za-z0-9._-]*\b/)?.[0] || '';
  text = profile.noData;
  if (apiCode === '@danh_sach_tonkho' && target) {
    text = 'Không tìm thấy tồn kho cho sản phẩm ' + target + ' trong phạm vi tài khoản của bạn.';
  }
} else if (rows.length) {
  const signatureOf = (row) => {
    if (!row || typeof row !== 'object') return 'value:' + displayValue(row);
    return Object.entries(row)
      .filter(([key, value]) => !technical.test(key) && displayValue(value))
      .map(([key, value]) => [semanticKey(key), displayValue(value)])
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => key + '=' + value)
      .join('|');
  };
  const seenRows = new Set();
  const uniqueRows = rows.filter((row) => {
    const signature = signatureOf(row);
    if (seenRows.has(signature)) return false;
    seenRows.add(signature);
    return true;
  });
  const preferred = (profile?.fields || []).map(semanticKey);
  const preferredSet = new Set(preferred);
  const blocks = uniqueRows.slice(0, 8).map((row, index) => {
    if (!row || typeof row !== 'object') return (index + 1) + '. ' + displayValue(row);
    const seenFields = new Set();
    const available = Object.entries(row)
      .filter(([key, value]) => {
        if (technical.test(key) || !displayValue(value)) return false;
        const semantic = semanticKey(key);
        if (seenFields.has(semantic)) return false;
        const knownLabel = Boolean(friendlyLabels[compactKey(key)] || friendlyLabels[semantic]);
        if (profile && !preferredSet.has(semantic) && !knownLabel) return false;
        seenFields.add(semantic);
        return true;
      });
    const ranked = available.sort(([left], [right]) => {
      const leftIndex = preferred.indexOf(semanticKey(left));
      const rightIndex = preferred.indexOf(semanticKey(right));
      const leftRank = leftIndex === -1 ? 999 : leftIndex;
      const rightRank = rightIndex === -1 ? 999 : rightIndex;
      return leftRank - rightRank;
    });
    const fieldLimit = apiCode === '@cong_no_chi_tiet' ? 8 : 6;
    const fields = ranked.slice(0, fieldLimit)
      .map(([key, value]) => displayKey(key) + ': ' + formatFieldValue(key, value));
    if (!fields.length) return '';
    return (index + 1) + '. ' + fields.join('\n   • ');
  }).filter(Boolean);
  text = profile?.title || text || 'Kết quả tra cứu';
  if (blocks.length) text += ' (' + uniqueRows.length + ')' + '\n\n' + blocks.join('\n\n');
  if (uniqueRows.length > 8) text += '\n… và ' + (uniqueRows.length - 8) + ' kết quả khác.';
}
if (!text) text = 'Chatbot chưa trả dữ liệu. Vui lòng thử lại.';
return [{ json: { ...source, telegramText: text } }];`;
}

function createTelegramChatWorkflow(draftOrderNodes) {
  const workflow = {
    id: 'medstandTelegramChatbotDemo',
    name: 'TG-02 · Telegram ChatBot Demo',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'telegram-poll-ingest',
          authentication: 'headerAuth',
          responseMode: 'onReceived',
          options: {},
        },
        id: 'tg-chat-trigger',
        name: 'Local Poller Ingest',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [-1160, 0],
        webhookId: 'a3f8aa75-c7b2-447b-9272-68f38e7fe55d',
        credentials: { httpHeaderAuth: POLLER_HEADER_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const update = $json.body || $json || {};
const message = update.message || update.edited_message || {};
const chat = message.chat || {};
const from = message.from || {};
const chatId = String(chat.id ?? '').trim();
const userId = String(from.id ?? '').trim();
const updateId = String(update.update_id ?? '').trim();
const text = typeof message.text === 'string' ? message.text.replace(/\\s+/g, ' ').trim() : '';
const numeric = (value) => /^\\d{1,20}$/.test(value);
const privateChat = chat.type === 'private' && numeric(chatId) && chatId === userId;
const canIssueTicket = privateChat && numeric(userId) && /^\\d{1,20}$/.test(updateId) && text.length > 0 && text.length <= 2000;
let rejectionText = '';
if (!privateChat) rejectionText = 'Bot demo Medstand chỉ hỗ trợ chat riêng. Vui lòng mở bot và nhắn trực tiếp.';
else if (!text) rejectionText = 'Hiện bot demo chỉ nhận tin nhắn văn bản.';
else if (text.length > 2000) rejectionText = 'Tin nhắn quá dài. Vui lòng rút gọn còn tối đa 2.000 ký tự.';
else if (!canIssueTicket) rejectionText = 'Tin nhắn Telegram không hợp lệ.';
return [{ json: {
  chatId, userId, updateId, text, privateChat, canIssueTicket, rejectionText,
  conversationId: 'tgconv-' + userId
} }];`,
        },
        id: 'tg-chat-normalize',
        name: 'Normalize Telegram Update',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-940, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-is-callback-condition',
                leftValue: '={{ $json.isCallback }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-chat-if-callback',
        name: 'Is Callback Query?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-720, 260],
      },
      {
        parameters: {
          resource: 'callback',
          operation: 'answerQuery',
          queryId: '={{ $json.callbackQueryId }}',
          additionalFields: {
            text: "={{ $json.processingAccepted ? 'Đang xử lý yêu cầu…' : 'Yêu cầu trước vẫn đang được xử lý.' }}",
            cache_time: 0,
          },
        },
        id: 'tg-chat-ack-callback',
        name: 'Acknowledge Callback',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [-480, 260],
        onError: 'continueRegularOutput',
        credentials: { telegramApi: TELEGRAM_CREDENTIAL },
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-can-issue-condition',
                leftValue: '={{ $json.canProcess }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-chat-if-input',
        name: 'Private Text Message?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-720, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [{
              id: 'tg-is-login-command-condition',
              leftValue: '={{ $json.isLoginCommand }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            }],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-chat-if-login',
        name: 'Is Login Command?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-500, 20],
      },
      {
        parameters: {
          jsCode: String.raw`const source = $('Normalize Telegram Update').first().json || {};
const match = /^\/login(?:@[A-Za-z0-9_]+)?\s+(\d{6})$/i.exec(String(source.text || '').trim());
const code = match ? match[1] : '';
const userId = String(source.userId || '');
const chatId = String(source.chatId || '');
if (!/^\d{1,20}$/.test(userId) || chatId !== userId) throw new Error('PRIVATE_TELEGRAM_ID_INVALID');
const query = "EXEC dbo.API_TelegramLinkCode_Consume_AI @TelegramUserID='" + userId
  + "', @TelegramChatID='" + chatId + "', @LinkCode='" + code + "';";
return [{ json: { ...source, query } }];`,
        },
        id: 'tg-chat-build-login-sql',
        name: 'Build Telegram Login SQL',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-280, 80],
      },
      {
        parameters: { operation: 'executeQuery', query: '={{ $json.query }}' },
        id: 'tg-chat-execute-login',
        name: 'Consume One-time Link Code',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [-60, 80],
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: String.raw`const source = $('Normalize Telegram Update').first().json || {};
const row = $json || {};
const status = String(row.LinkStatus || '').toUpperCase();
let telegramText = String(row.Message || '').trim();
if (status === 'LINKED') {
  telegramText = '✅ Liên kết thành công.'
    + '\nTài khoản Medstand: ' + String(row.UserName || '')
    + '\nVai trò: ' + String(row.UserGroupID || 'Chưa khai báo')
    + '\nChi nhánh: ' + String(row.BranchID || 'Theo hệ thống')
    + '\n\nBạn có thể dùng /menu hoặc /whoami ngay bây giờ.';
} else if (status === 'RATE_LIMITED') {
  telegramText = 'Đã nhập sai quá nhiều lần. Vui lòng chờ 15 phút hoặc tạo mã mới trên web.';
} else if (status === 'INVALID_FORMAT') {
  telegramText = 'Cú pháp đúng: /login 123456';
} else if (!telegramText) {
  telegramText = 'Mã không đúng, đã hết hạn hoặc đã được sử dụng. Hãy tạo mã mới trên web Medstand.';
}
return [{ json: { ...source, shouldCallMain: false, telegramText } }];`,
        },
        id: 'tg-chat-format-login',
        name: 'Format Telegram Login Reply',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [160, 80],
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: "={{ \"EXEC dbo.API_TelegramAuthTicket_Issue_AI @TelegramUserID='\" + $json.userId + \"', @TelegramChatID='\" + $json.chatId + \"', @TelegramUpdateID=\" + $json.updateId + \";\" }}",
        },
        id: 'tg-chat-issue-ticket',
        name: 'Issue Read-only Ticket',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [-480, -100],
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const source = $('Normalize Telegram Update').first().json;
const row = $json || {};
const command = source.text.toLowerCase().split(/\\s+/)[0].replace(/@[^\\s]+$/, '');
const authorized = String(row.AuthStatus || '').toUpperCase() === 'AUTHORIZED'
  && /^telegram_[0-9a-f]{64}$/.test(String(row.AuthTicket || ''));
let telegramText = '';
let shouldCallMain = false;
let actionMode = 'STATIC';
let draftPayload = null;
const capabilities = new Set(String(row.Capabilities || '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean));
const canWriteDraft = capabilities.has('orders.draft.write') || capabilities.has('*');
if (!authorized) {
  telegramText = 'Telegram của bạn chưa liên kết với Medstand.'
    + '\\n\\nMở web Medstand → Tài khoản → Liên kết Telegram để lấy mã 6 số.'
    + '\\nSau đó gửi: /login 123456'
    + '\\n\\nMã Telegram của bạn: ' + source.userId;
} else if (command === '/start') {
  telegramText = 'Medstand AI Demo đã sẵn sàng.\\nTài khoản: ' + row.UserName + '\\nPhạm vi: ' + (row.BranchID || 'theo phân quyền hệ thống') + '\\n\\nGõ /help để xem hướng dẫn.';
} else if (command === '/help') {
  telegramText = 'Bạn có thể xem doanh số, công nợ, tồn kho, tuyến bán hàng và lưu đơn nháp.'
    + '\\n\\nLiên kết tài khoản: /login 123456'
    + '\\n\\nVí dụ tra cứu:\\n• Hôm nay doanh số của tôi bao nhiêu?\\n• Tồn kho sản phẩm A003'
    + '\\n\\nLưu đơn nháp:\\n/draft MÃ_KH | MÃ_SP x SỐ_LƯỢNG'
    + '\\nVí dụ: /draft NDB001 | A003x2, A008x1'
    + '\\n\\nĐơn chỉ được lưu nháp; gửi duyệt vẫn thực hiện trên web.';
} else if (command === '/whoami') {
  telegramText = 'Tài khoản Medstand: ' + row.UserName
    + '\\nVai trò: ' + (row.UserGroupID || 'Chưa khai báo')
    + '\\nChi nhánh: ' + (row.BranchID || 'Theo hệ thống');
} else if (command === '/draft') {
  const rest = source.text.includes(' ') ? source.text.slice(source.text.indexOf(' ') + 1).trim() : '';
  if (!rest) {
    telegramText = 'Nhập đơn theo mẫu:\\n/draft MÃ_KH | MÃ_SP x SỐ_LƯỢNG\\n\\nVí dụ:\\n/draft NDB001 | A003x2, A008x1\\n\\nBot sẽ cho xem trước; chỉ khi bấm “Lưu nháp” mới ghi đơn nháp.';
  } else if (!canWriteDraft) {
    telegramText = 'Tài khoản chưa được cấp quyền lưu đơn nháp trên Telegram.';
  } else {
    const parts = rest.split('|');
    const customerId = String(parts[0] || '').trim().toUpperCase();
    const rawItems = String(parts[1] || '').split(',').map((value) => value.trim()).filter(Boolean);
    const parsedItems = [];
    const seen = new Set();
    let valid = parts.length === 2 && /^[A-Z0-9._-]{1,50}$/.test(customerId) && rawItems.length >= 1 && rawItems.length <= 10;
    for (const rawItem of rawItems) {
      const match = /^([A-Za-z0-9._-]{1,50})\\s*[xX*]\\s*(\\d{1,3})$/.exec(rawItem);
      if (!match) { valid = false; break; }
      const itemId = match[1].toUpperCase();
      const quantity = Number(match[2]);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999 || seen.has(itemId)) { valid = false; break; }
      seen.add(itemId);
      parsedItems.push({ ItemID: itemId, Quantity: quantity });
    }
    if (!valid) {
      telegramText = 'Cú pháp chưa đúng. Dùng mẫu:\\n/draft MÃ_KH | A003x2, A008x1\\nMỗi sản phẩm nhập một lần, tối đa 10 sản phẩm.';
    } else {
      actionMode = 'DRAFT_PREVIEW';
      draftPayload = { customerId, items: parsedItems };
    }
  }
} else if ((command === '/draft-save' || command === '/draft-cancel') && source.isCallback) {
  const token = String(source.text.split(/\\s+/)[1] || '').toLowerCase();
  if (!canWriteDraft) {
    telegramText = 'Tài khoản chưa được cấp quyền lưu đơn nháp trên Telegram.';
  } else if (!/^[0-9a-f]{32}$/.test(token)) {
    telegramText = 'Nút xác nhận không hợp lệ hoặc đã hết hạn.';
  } else {
    actionMode = command === '/draft-save' ? 'DRAFT_SAVE' : 'DRAFT_CANCEL';
    draftPayload = { token };
  }
} else if (command.startsWith('/')) {
  telegramText = 'Lệnh chưa được hỗ trợ. Dùng /help để xem hướng dẫn.';
} else {
  shouldCallMain = true;
  actionMode = 'CHAT';
}
return [{ json: {
  ...source,
  authTicket: String(row.AuthTicket || ''),
  medstandUserName: String(row.UserName || ''),
  medstandDisplayName: String(row.DisplayName || ''),
  medstandRole: String(row.UserGroupID || ''),
  medstandBranch: String(row.BranchID || ''),
  medstandEmployee: String(row.EmployeeID || ''),
  medstandManager: Boolean(row.Manager),
  medstandServerSessionId: 'tg-' + String(source.userId || '').padStart(40, '0').slice(-40),
  actionMode,
  draftPayload,
  shouldCallMain,
  telegramText
} }];`,
        },
        id: 'tg-chat-authorized-action',
        name: 'Prepare Authorized Action',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-240, -100],
      },
      {
        parameters: {
          jsCode: `const source = $('Normalize Telegram Update').first().json;
return [{ json: {
  ...source,
  shouldCallMain: false,
  telegramText: source.rejectionText || 'Tin nhắn không được hỗ trợ.'
} }];`,
        },
        id: 'tg-chat-reject-input',
        name: 'Prepare Input Rejection',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-480, 140],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-call-main-condition',
                leftValue: '={{ $json.shouldCallMain }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-chat-if-main',
        name: 'Call Chatbot?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [0, -40],
      },
      {
        parameters: {
          method: 'POST',
          url: 'http://127.0.0.1:5678/webhook/hook-ai-dainao',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Authorization', value: "={{ 'Bearer ' + $json.authTicket }}" },
              { name: 'X-Medstand-Channel', value: 'telegram-demo' },
              { name: 'X-Medstand-Bridge-Key', value: '={{ $env.TELEGRAM_INTERNAL_BRIDGE_KEY }}' },
              { name: 'X-Medstand-TG-User', value: '={{ $json.medstandUserName }}' },
              { name: 'X-Medstand-TG-User-ID', value: '={{ $json.userId }}' },
              { name: 'X-Medstand-TG-Display-Name', value: '={{ encodeURIComponent($json.medstandDisplayName || "") }}' },
              { name: 'X-Medstand-TG-Role', value: '={{ $json.medstandRole }}' },
              { name: 'X-Medstand-TG-Branch', value: '={{ $json.medstandBranch }}' },
              { name: 'X-Medstand-TG-Employee', value: '={{ $json.medstandEmployee }}' },
              { name: 'X-Medstand-TG-Manager', value: '={{ $json.medstandManager ? \"1\" : \"0\" }}' },
              { name: 'X-Medstand-TG-Session', value: '={{ $json.medstandServerSessionId }}' },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody: "={{ JSON.stringify({ message: $json.text, conversationId: $json.conversationId, historyContext: '' }) }}",
          options: {
            response: { response: { responseFormat: 'json' } },
            timeout: 45000,
          },
        },
        id: 'tg-chat-call-main',
        name: 'Call MAIN ChatBot',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [240, -140],
        onError: 'continueRegularOutput',
        retryOnFail: false,
      },
      {
        parameters: {
          jsCode: `const source = $('Prepare Authorized Action').first().json;
const raw = $json || {};
const technical = /^(success|status|code|errorcode|apicode|contractversion|requestid|metadata|ruleversion|rulesource)$/i;
const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
let text = String(raw.message || raw.reply || raw.error || '').trim();
if (!text && raw.statusCode >= 400) text = 'Chatbot tạm thời chưa thể xử lý yêu cầu.';
const rows = Array.isArray(raw.data) ? raw.data : [];
const apiCode = String(raw.ApiCode || raw.apiCode || '').toLowerCase();
if (apiCode === '@doanh_so' && rows.length) {
  const parseMoney = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = String(value ?? '').replace(/[^0-9-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formatMoney = (value) => new Intl.NumberFormat('vi-VN').format(value) + ' đ';
  const groupOf = (row) => String(row?.['Nhóm'] || row?.Group || '').toLowerCase();
  const scopedRows = rows.filter((row) => groupOf(row).includes('nhân viên'));
  const summaryRows = scopedRows.length ? scopedRows : [rows[0]];
  const sumField = (key) => summaryRows.reduce((sum, row) => sum + parseMoney(row?.[key]), 0);
  const first = summaryRows[0] || rows[0] || {};
  const fromDate = displayValue(first['Từ Ngày']);
  const toDate = displayValue(first['Đến Ngày']);
  const period = fromDate && toDate
    ? (fromDate === toDate ? 'ngày ' + toDate : 'từ ' + fromDate + ' đến ' + toDate)
    : 'trong kỳ đã chọn';
  const account = displayValue(source.medstandUserName);
  text = 'Doanh số ' + period + (account ? ' của ' + account : '') + ':'
    + '\\n• Tổng doanh số: ' + formatMoney(sumField('Doanh Số'))
    + '\\n• Đã xuất/giao: ' + formatMoney(sumField('Doanh Số Đã Xuất/Giao'))
    + '\\n• Đã thu: ' + formatMoney(sumField('Doanh Thu Đã Thu'));
} else if (rows.length) {
  const blocks = rows.slice(0, 10).map((row, index) => {
    if (!row || typeof row !== 'object') return (index + 1) + '. ' + displayValue(row);
    const fields = Object.entries(row)
      .filter(([key, value]) => !technical.test(key) && displayValue(value))
      .slice(0, 6)
      .map(([key, value]) => key + ': ' + displayValue(value));
    return (index + 1) + '. ' + fields.join(' | ');
  }).filter(Boolean);
  if (blocks.length) text += (text ? '\\n\\n' : '') + blocks.join('\\n');
  if (rows.length > 10) text += '\\n… và ' + (rows.length - 10) + ' kết quả khác.';
}
if (!text) text = 'Chatbot chưa trả dữ liệu. Vui lòng thử lại.';
return [{ json: { ...source, telegramText: text } }];`,
        },
        id: 'tg-chat-format-main',
        name: 'Format Chatbot Reply',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [480, -140],
      },
      {
        parameters: {
          jsCode: `const chatId = String($json.chatId || '');
const input = String($json.telegramText || 'Không có nội dung phản hồi.').trim();
const limit = 3500;
const chunks = [];
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
let remaining = input;
while (remaining.length > limit) {
  let cut = remaining.lastIndexOf('\\n', limit);
  if (cut < Math.floor(limit * 0.6)) cut = remaining.lastIndexOf(' ', limit);
  if (cut < Math.floor(limit * 0.6)) cut = limit;
  chunks.push(remaining.slice(0, cut).trim());
  remaining = remaining.slice(cut).trim();
}
if (remaining) chunks.push(remaining);
return chunks.map((text, index) => ({ json: {
  chatId,
  text: escapeHtml(text),
  showDraftButtons: Boolean($json.showDraftButtons) && index === chunks.length - 1,
  draftToken: String($json.draftToken || '')
} }));`,
        },
        id: 'tg-chat-split',
        name: 'Split Telegram Message',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [720, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [
              {
                id: 'tg-show-draft-buttons-condition',
                leftValue: '={{ $json.showDraftButtons }}',
                rightValue: true,
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-chat-if-draft-buttons',
        name: 'Show Draft Confirmation?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [940, 0],
      },
      {
        parameters: {
          resource: 'message',
          operation: 'sendMessage',
          chatId: '={{ $json.chatId }}',
          text: '={{ $json.text }}',
          additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
          replyMarkup: 'inlineKeyboard',
          inlineKeyboard: {
            rows: [
              {
                row: {
                  buttons: [
                    { text: '💾 Lưu nháp', additionalFields: { callback_data: "={{ 'draft:save:' + $json.draftToken }}" } },
                    { text: '❌ Hủy', additionalFields: { callback_data: "={{ 'draft:cancel:' + $json.draftToken }}" } },
                  ],
                },
              },
            ],
          },
        },
        id: 'tg-chat-send-draft-preview',
        name: 'Send Draft Order Preview',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [1160, -100],
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 1000,
        credentials: { telegramApi: TELEGRAM_CREDENTIAL },
      },
      {
        parameters: {
          resource: 'message',
          operation: 'sendMessage',
          chatId: '={{ $json.chatId }}',
          text: '={{ $json.text }}',
          additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
          replyMarkup: 'inlineKeyboard',
          inlineKeyboard: {
            rows: [
              {
                row: {
                  buttons: [
                    { text: '📊 Hôm nay', additionalFields: { callback_data: 'menu:sales_today' } },
                    { text: '📅 Tháng này', additionalFields: { callback_data: 'menu:sales_month' } },
                  ],
                },
              },
              {
                row: {
                  buttons: [
                    { text: '🗺 Tuyến hôm nay', additionalFields: { callback_data: 'menu:route_today' } },
                    { text: '📝 Lên đơn nháp', additionalFields: { callback_data: 'menu:draft_order' } },
                  ],
                },
              },
              {
                row: {
                  buttons: [
                    { text: '👤 Tài khoản', additionalFields: { callback_data: 'menu:whoami' } },
                    { text: '🔔 Thông báo', additionalFields: { callback_data: 'menu:notifications' } },
                  ],
                },
              },
              {
                row: {
                  buttons: [
                    { text: '❓ Hướng dẫn', additionalFields: { callback_data: 'menu:help' } },
                  ],
                },
              },
            ],
          },
        },
        id: 'tg-chat-send',
        name: 'Send Telegram Reply',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [1160, 100],
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 1000,
        credentials: { telegramApi: TELEGRAM_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const source = $('Normalize Telegram Update').first().json || {};
const userId = String(source.userId || '');
const updateId = String(source.updateId || '');
const locks = global.__MEDSTAND_TELEGRAM_USER_LOCKS__ || {};
if (source.ownsProcessingSlot && locks[userId]?.ownerUpdateId === updateId) delete locks[userId];
return $input.all();`,
        },
        id: 'tg-chat-release-lock',
        name: 'Release Processing Slot',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1200, 0],
      },
    ],
    connections: {
      'Local Poller Ingest': { main: [[{ node: 'Normalize Telegram Update', type: 'main', index: 0 }]] },
      'Normalize Telegram Update': {
        main: [[
          { node: 'Is Callback Query?', type: 'main', index: 0 },
          { node: 'Private Text Message?', type: 'main', index: 0 },
        ]],
      },
      'Is Callback Query?': {
        main: [[{ node: 'Acknowledge Callback', type: 'main', index: 0 }], []],
      },
      'Private Text Message?': {
        main: [
          [{ node: 'Is Login Command?', type: 'main', index: 0 }],
          [{ node: 'Prepare Input Rejection', type: 'main', index: 0 }],
        ],
      },
      'Is Login Command?': {
        main: [
          [{ node: 'Build Telegram Login SQL', type: 'main', index: 0 }],
          [{ node: 'Issue Read-only Ticket', type: 'main', index: 0 }],
        ],
      },
      'Build Telegram Login SQL': { main: [[{ node: 'Consume One-time Link Code', type: 'main', index: 0 }]] },
      'Consume One-time Link Code': { main: [[{ node: 'Format Telegram Login Reply', type: 'main', index: 0 }]] },
      'Format Telegram Login Reply': { main: [[{ node: 'Split Telegram Message', type: 'main', index: 0 }]] },
      'Issue Read-only Ticket': { main: [[{ node: 'Prepare Authorized Action', type: 'main', index: 0 }]] },
      'Prepare Authorized Action': { main: [[{ node: 'Is Draft Order Action?', type: 'main', index: 0 }]] },
      'Prepare Input Rejection': { main: [[{ node: 'Split Telegram Message', type: 'main', index: 0 }]] },
      'Is Draft Order Action?': {
        main: [
          [{ node: 'Build Draft Order SQL', type: 'main', index: 0 }],
          [{ node: 'Call Chatbot?', type: 'main', index: 0 }],
        ],
      },
      'Build Draft Order SQL': { main: [[{ node: 'Execute Draft Order Action', type: 'main', index: 0 }]] },
      'Execute Draft Order Action': { main: [[{ node: 'Format Draft Order Reply', type: 'main', index: 0 }]] },
      'Format Draft Order Reply': { main: [[{ node: 'Split Telegram Message', type: 'main', index: 0 }]] },
      'Call Chatbot?': {
        main: [
          [{ node: 'Call MAIN ChatBot', type: 'main', index: 0 }],
          [{ node: 'Split Telegram Message', type: 'main', index: 0 }],
        ],
      },
      'Call MAIN ChatBot': { main: [[{ node: 'Format Chatbot Reply', type: 'main', index: 0 }]] },
      'Format Chatbot Reply': { main: [[{ node: 'Split Telegram Message', type: 'main', index: 0 }]] },
      'Split Telegram Message': { main: [[{ node: 'Show Draft Confirmation?', type: 'main', index: 0 }]] },
      'Show Draft Confirmation?': {
        main: [
          [{ node: 'Send Draft Order Preview', type: 'main', index: 0 }],
          [{ node: 'Send Telegram Reply', type: 'main', index: 0 }],
        ],
      },
      'Send Draft Order Preview': { main: [[{ node: 'Release Processing Slot', type: 'main', index: 0 }]] },
      'Send Telegram Reply': { main: [[{ node: 'Release Processing Slot', type: 'main', index: 0 }]] },
    },
    pinData: {},
    settings: { executionOrder: 'v1' },
    meta: { templateCredsSetupCompleted: true },
  };
  workflow.nodes.push(...draftOrderNodes);
  nodeByName(workflow, 'Normalize Telegram Update').parameters.jsCode = buildTelegramNormalizeCode();
  nodeByName(workflow, 'Format Chatbot Reply').parameters.jsCode = buildTelegramFormatterCode();
  writeJson(TELEGRAM_CHAT_PATH, workflow);
}

function createTelegramNotificationWorkflow() {
  const workflow = {
    id: 'medstandTelegramNotificationDispatch',
    name: 'TG-03 · Telegram Notification Dispatch',
    nodes: [
      {
        parameters: {
          rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] },
        },
        id: 'tg-notification-schedule',
        name: 'Every Minute',
        type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1.2,
        position: [-760, 0],
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: 'EXEC dbo.API_TelegramNotification_Claim_AI @BatchSize=20;',
        },
        id: 'tg-notification-claim',
        name: 'Claim Telegram Notifications',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [-540, 0],
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const icons = { URGENT: '🚨', POLICY: '📜', SYSTEM: '⚙️', ANNOUNCEMENT: '📢' };
return $input.all().map((item) => {
  const row = item.json || {};
  const type = String(row.NotificationType || 'ANNOUNCEMENT').toUpperCase();
  const title = String(row.Title || 'Thông báo Medstand').trim().slice(0, 180);
  const content = String(row.Summary || row.Body || '').replace(/\\s+/g, ' ').trim().slice(0, 1200);
  const lines = [
    (icons[type] || '🔔') + ' <b>' + escapeHtml(title) + '</b>',
    content ? escapeHtml(content) : '',
    '',
    'Mở web Medstand → Thông báo để xem chi tiết.'
  ].filter((line, index) => line || index === 2);
  return { json: { ...row, telegramText: lines.join('\\n') } };
});`,
        },
        id: 'tg-notification-format',
        name: 'Format Telegram Notification',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-320, 0],
      },
      {
        parameters: {
          resource: 'message',
          operation: 'sendMessage',
          chatId: '={{ $json.TelegramUserID }}',
          text: '={{ $json.telegramText }}',
          additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
        },
        id: 'tg-notification-send',
        name: 'Send Telegram Notification',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [-100, 0],
        retryOnFail: true,
        maxTries: 2,
        waitBetweenTries: 1000,
        onError: 'continueErrorOutput',
        credentials: { telegramApi: TELEGRAM_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: `const source = $('Format Telegram Notification').item.json || {};
const messageId = $json.message_id ?? $json.result?.message_id ?? '';
return [{ json: { ...source, deliverySucceeded: true, telegramMessageId: String(messageId), deliveryError: '' } }];`,
        },
        id: 'tg-notification-success',
        name: 'Prepare Delivery Success',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [120, -100],
      },
      {
        parameters: {
          jsCode: `const source = $('Format Telegram Notification').item.json || {};
const error = $json.error || $json;
const message = String(error?.message || error?.description || 'Gửi Telegram thất bại.').slice(0, 500);
return [{ json: { ...source, deliverySucceeded: false, telegramMessageId: '', deliveryError: message } }];`,
        },
        id: 'tg-notification-failure',
        name: 'Prepare Delivery Failure',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [120, 100],
      },
      {
        parameters: {
          jsCode: `const esc = (value, max) => String(value ?? '').replace(/'/g, "''").slice(0, max);
const notificationId = Number($json.NotificationID);
const contentVersion = Number($json.ContentVersion);
if (!Number.isSafeInteger(notificationId) || notificationId <= 0) throw new Error('NOTIFICATION_ID_INVALID');
if (!Number.isInteger(contentVersion) || contentVersion <= 0) throw new Error('CONTENT_VERSION_INVALID');
const telegramUserId = esc($json.TelegramUserID, 20);
if (!/^\\d{1,20}$/.test(telegramUserId)) throw new Error('TELEGRAM_USER_ID_INVALID');
const succeeded = $json.deliverySucceeded ? 1 : 0;
const messageId = esc($json.telegramMessageId, 50);
const error = esc($json.deliveryError, 500);
const query = "EXEC dbo.API_TelegramNotification_Complete_AI @NotificationID=" + notificationId
  + ", @TelegramUserID='" + telegramUserId + "', @ContentVersion=" + contentVersion
  + ", @Succeeded=" + succeeded + ", @TelegramMessageID='" + messageId
  + "', @LastError=N'" + error + "';";
return [{ json: { query } }];`,
        },
        id: 'tg-notification-build-complete',
        name: 'Build Delivery Completion SQL',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [340, 0],
      },
      {
        parameters: { operation: 'executeQuery', query: '={{ $json.query }}' },
        id: 'tg-notification-complete',
        name: 'Complete Telegram Delivery',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [560, 0],
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
    ],
    connections: {
      'Every Minute': { main: [[{ node: 'Claim Telegram Notifications', type: 'main', index: 0 }]] },
      'Claim Telegram Notifications': { main: [[{ node: 'Format Telegram Notification', type: 'main', index: 0 }]] },
      'Format Telegram Notification': { main: [[{ node: 'Send Telegram Notification', type: 'main', index: 0 }]] },
      'Send Telegram Notification': {
        main: [
          [{ node: 'Prepare Delivery Success', type: 'main', index: 0 }],
          [{ node: 'Prepare Delivery Failure', type: 'main', index: 0 }],
        ],
      },
      'Prepare Delivery Success': { main: [[{ node: 'Build Delivery Completion SQL', type: 'main', index: 0 }]] },
      'Prepare Delivery Failure': { main: [[{ node: 'Build Delivery Completion SQL', type: 'main', index: 0 }]] },
      'Build Delivery Completion SQL': { main: [[{ node: 'Complete Telegram Delivery', type: 'main', index: 0 }]] },
    },
    pinData: {},
    settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh' },
    meta: { templateCredsSetupCompleted: true },
  };
  writeJson(TELEGRAM_NOTIFICATION_PATH, workflow);
}

function createTelegramLinkCodeWorkflow() {
  const workflow = {
    id: 'medstandTelegramLinkCodeIssue',
    name: 'TG-04 · Telegram Link Code Issue',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'telegram-link-code-issue',
          responseMode: 'responseNode',
          options: {},
        },
        id: 'tg-link-code-webhook',
        name: 'Issue Link Code Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [-780, 0],
        webhookId: '8e62c1ad-c501-46bc-9820-51aaec0d8207',
      },
      {
        parameters: {
          source: 'database',
          workflowId: {
            __rl: true,
            value: '9UxECqxRaPGMF8EM',
            mode: 'list',
            cachedResultName: 'K0-0 · Shared Auth Guard',
            cachedResultUrl: '/workflow/9UxECqxRaPGMF8EM',
          },
          workflowInputs: {
            mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [],
            attemptToConvertTypes: false, convertFieldsToString: true,
          },
          options: {},
        },
        id: 'tg-link-code-auth',
        name: 'Verify Web Login',
        type: 'n8n-nodes-base.executeWorkflow',
        typeVersion: 1.2,
        position: [-560, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [{
              id: 'tg-link-auth-ok-condition',
              leftValue: '={{ $json.auth.ok }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            }],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-link-code-if-auth',
        name: 'Web Login Valid?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-340, 0],
      },
      {
        parameters: {
          jsCode: `const auth = $json || {};
const username = String(auth.verifiedIdentity?.internalUserId || '').trim();
const requestId = String(auth.auth?.requestId || '').trim();
if (!/^[A-Za-z0-9._-]{2,50}$/.test(username)) throw new Error('VERIFIED_USERNAME_INVALID');
const esc = (value, max) => String(value ?? '').replace(/'/g, "''").slice(0, max);
const query = "EXEC dbo.API_TelegramLinkCode_Issue_AI @UserName='" + esc(username, 50)
  + "', @RequestID='" + esc(requestId, 100) + "';";
return [{ json: { query } }];`,
        },
        id: 'tg-link-code-build-sql',
        name: 'Build Link Code SQL',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-100, -100],
      },
      {
        parameters: { operation: 'executeQuery', query: '={{ $json.query }}' },
        id: 'tg-link-code-execute',
        name: 'Issue One-time Link Code',
        type: 'n8n-nodes-base.microsoftSql',
        typeVersion: 1,
        position: [120, -100],
        onError: 'continueRegularOutput',
        credentials: { microsoftSql: SQL_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: String.raw`const row = $json || {};
const linkCode = String(row.LinkCode || '');
const issued = String(row.LinkStatus || '') === 'CODE_ISSUED' && /^\d{6}$/.test(linkCode);
const statusCode = issued ? 200 : Math.max(400, Math.min(599, Number(row.StatusCode || 500)));
return [{ json: {
  httpStatus: statusCode,
  body: {
    success: issued,
    status: issued ? 'CODE_ISSUED' : String(row.LinkStatus || 'SYSTEM_ERROR'),
    linkCode: issued ? linkCode : '',
    expiresInSeconds: issued ? Number(row.ExpiresInSeconds || 300) : 0,
    expiresAtUtc: issued ? String(row.ExpiresAtUtc || '') : '',
    message: String(row.Message || (issued ? 'Mã liên kết đã được tạo.' : 'Không thể tạo mã liên kết.'))
  }
} }];`,
        },
        id: 'tg-link-code-format',
        name: 'Format Link Code Response',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [340, -100],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify($json.body) }}',
          options: { responseCode: '={{ $json.httpStatus }}' },
        },
        id: 'tg-link-code-respond',
        name: 'Respond Link Code',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [560, -100],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ success:false, status:$json.auth?.code || 'AUTHENTICATION_FAILED', message:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }) }}",
          options: { responseCode: '={{ $json.auth?.httpStatus || 401 }}' },
        },
        id: 'tg-link-code-auth-error',
        name: 'Respond Web Login Error',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [-100, 120],
      },
    ],
    connections: {
      'Issue Link Code Webhook': { main: [[{ node: 'Verify Web Login', type: 'main', index: 0 }]] },
      'Verify Web Login': { main: [[{ node: 'Web Login Valid?', type: 'main', index: 0 }]] },
      'Web Login Valid?': {
        main: [
          [{ node: 'Build Link Code SQL', type: 'main', index: 0 }],
          [{ node: 'Respond Web Login Error', type: 'main', index: 0 }],
        ],
      },
      'Build Link Code SQL': { main: [[{ node: 'Issue One-time Link Code', type: 'main', index: 0 }]] },
      'Issue One-time Link Code': { main: [[{ node: 'Format Link Code Response', type: 'main', index: 0 }]] },
      'Format Link Code Response': { main: [[{ node: 'Respond Link Code', type: 'main', index: 0 }]] },
    },
    pinData: {},
    settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh' },
    meta: { templateCredsSetupCompleted: true },
  };
  writeJson(TELEGRAM_LINK_CODE_PATH, workflow);
}

function createTelegramSystemAnnouncementWorkflow() {
  const workflow = {
    id: 'medstandTelegramSystemAnnouncement',
    name: 'TG-05 · Telegram System Announcement',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'telegram-system-announcement',
          authentication: 'headerAuth',
          responseMode: 'responseNode',
          options: {},
        },
        id: 'tg-system-announcement-webhook',
        name: 'Local Announcement Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [-680, 0],
        webhookId: '82a67b35-c21a-4c77-935c-c8eeefb740e9',
        credentials: { httpHeaderAuth: POLLER_HEADER_CREDENTIAL },
      },
      {
        parameters: {
          jsCode: String.raw`const body = $json.body || {};
const icons = { INFO: 'ℹ️', MAINTENANCE: '🛠', INCIDENT: '⚠️', RESOLVED: '✅', RELEASE: '🚀' };
const type = String(body.type || 'INFO').trim().toUpperCase();
const title = String(body.title || '').replace(/\s+/g, ' ').trim();
const message = String(body.message || '').replace(/\r\n/g, '\n').trim();
const channelChatId = String($env.TELEGRAM_ANNOUNCEMENT_CHAT_ID || '').trim();
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const errors = [];
if (!Object.prototype.hasOwnProperty.call(icons, type)) errors.push('TYPE_INVALID');
if (!title || title.length > 120) errors.push('TITLE_INVALID');
if (!message || message.length > 2500) errors.push('MESSAGE_INVALID');
if (!/^-100\d{6,16}$/.test(channelChatId)) errors.push('CHANNEL_NOT_CONFIGURED');
const telegramText = errors.length ? '' : [
  icons[type] + ' <b>' + escapeHtml(title) + '</b>',
  '',
  escapeHtml(message),
  '',
  '<i>Medstand · Thông báo hệ thống</i>'
].join('\n');
return [{ json: {
  valid: errors.length === 0,
  errors,
  type,
  channelChatId,
  telegramText
} }];`,
        },
        id: 'tg-system-announcement-validate',
        name: 'Validate and Format Announcement',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [-460, 0],
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [{ id: 'tg-system-announcement-valid-condition', leftValue: '={{ $json.valid }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
            combinator: 'and',
          },
          options: {},
        },
        id: 'tg-system-announcement-valid',
        name: 'Announcement Valid?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [-240, 0],
      },
      {
        parameters: {
          resource: 'message',
          operation: 'sendMessage',
          chatId: '={{ $json.channelChatId }}',
          text: '={{ $json.telegramText }}',
          additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
        },
        id: 'tg-system-announcement-send',
        name: 'Publish Channel Announcement',
        type: 'n8n-nodes-base.telegram',
        typeVersion: 1.2,
        position: [-20, -100],
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 1000,
        onError: 'continueErrorOutput',
        credentials: { telegramApi: TELEGRAM_CREDENTIAL },
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ success:true, status:'PUBLISHED', messageId:String($json.message_id || $json.result?.message_id || '') }) }}",
          options: { responseCode: 200 },
        },
        id: 'tg-system-announcement-success',
        name: 'Respond Announcement Published',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [220, -160],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ success:false, status:'TELEGRAM_SEND_FAILED', message:String($json.error?.message || $json.message || 'Không thể đăng thông báo lên channel.').slice(0,300) }) }}",
          options: { responseCode: 502 },
        },
        id: 'tg-system-announcement-send-error',
        name: 'Respond Announcement Send Error',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [220, 0],
      },
      {
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ success:false, status:'VALIDATION_ERROR', errors:$json.errors || [] }) }}",
          options: { responseCode: 400 },
        },
        id: 'tg-system-announcement-invalid',
        name: 'Respond Announcement Invalid',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.4,
        position: [-20, 140],
      },
    ],
    connections: {
      'Local Announcement Webhook': { main: [[{ node: 'Validate and Format Announcement', type: 'main', index: 0 }]] },
      'Validate and Format Announcement': { main: [[{ node: 'Announcement Valid?', type: 'main', index: 0 }]] },
      'Announcement Valid?': {
        main: [
          [{ node: 'Publish Channel Announcement', type: 'main', index: 0 }],
          [{ node: 'Respond Announcement Invalid', type: 'main', index: 0 }],
        ],
      },
      'Publish Channel Announcement': {
        main: [
          [{ node: 'Respond Announcement Published', type: 'main', index: 0 }],
          [{ node: 'Respond Announcement Send Error', type: 'main', index: 0 }],
        ],
      },
    },
    pinData: {},
    settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh' },
    meta: { templateCredsSetupCompleted: true },
  };
  writeJson(TELEGRAM_SYSTEM_ANNOUNCEMENT_PATH, workflow);
}

updateMainWorkflow();
updateSharedAuthGuard();
updateApiExecuteLatency();
const draftOrderNodes = createTelegramAuthWorkflow();
createTelegramChatWorkflow(draftOrderNodes);
createTelegramNotificationWorkflow();
createTelegramLinkCodeWorkflow();
createTelegramSystemAnnouncementWorkflow();
console.log('Updated Telegram pilot n8n artifacts.');
