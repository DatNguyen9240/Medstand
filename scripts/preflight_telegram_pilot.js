'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const checks = [];

function pass(name, detail = '') {
  checks.push({ name, status: 'PASS', detail });
}

function fail(name, detail) {
  checks.push({ name, status: 'FAIL', detail });
}

function assert(name, condition, detail) {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function compileCodeNodes(workflow, label) {
  for (const node of workflow.nodes.filter((candidate) => candidate.type === 'n8n-nodes-base.code')) {
    try {
      // Async wrapper accepts the top-level await/return syntax used by n8n Code nodes.
      new Function(`return async function () {\n${node.parameters.jsCode}\n}`); // eslint-disable-line no-new-func
      pass(`${label}: code syntax: ${node.name}`);
    } catch (error) {
      fail(`${label}: code syntax: ${node.name}`, error.message);
    }
  }
}

function executeFormatter(code, source, raw) {
  const select = () => ({ first: () => ({ json: source }) });
  return new Function('$', '$json', code)(select, raw)?.[0]?.json?.telegramText || ''; // eslint-disable-line no-new-func
}

function executeNormalizer(code, update) {
  return new Function('$json', code)({ body: update })?.[0]?.json || {}; // eslint-disable-line no-new-func
}

function main() {
  const manifest = readJson('n8n/workflow-manifest.json');
  const auth = readJson('n8n/Telegram/TG_Auth_Verify.json');
  const chat = readJson('n8n/Telegram/TG_ChatBot_Demo.json');
  const notificationDispatch = readJson('n8n/Telegram/TG_Notification_Dispatch.json');
  const linkCodeIssue = readJson('n8n/Telegram/TG_Link_Code_Issue.json');
  const systemAnnouncement = readJson('n8n/Telegram/TG_System_Announcement.json');
  const mainWorkflow = readJson('n8n/AI_Core/MAIN_ChatBot_V5.json');
  const sharedAuth = readJson('n8n/Shared/Shared_Auth_Guard.json');
  const apiExecute = readJson('n8n/API_Services/API_Execute.json');
  const sql = read('sql/Migrate_Telegram_Pilot_Auth_AI.sql');
  const draftSql = read('sql/Migrate_Telegram_Order_Draft_AI.sql');
  const notificationSql = read('sql/Migrate_Telegram_Notification_Dispatch_AI.sql');
  const selfLinkSql = read('sql/Migrate_Telegram_Self_Link_AI.sql');
  const accountTemplate = read('src/templates/account.html');
  const accountPage = read('src/js/pages/account.js');
  const envExample = read('.env.example');
  const poller = read('scripts/telegram_polling_bridge.js');
  const n8nRuntime = read('n8n-system/run_n8n.js');
  const mappingExample = readJson('config/telegram/uat-links.example.json');

  const workflowEntries = new Map(manifest.workflows.map((entry) => [entry.file, entry]));
  assert(
    'Manifest contains Telegram auth verifier',
    workflowEntries.get('Telegram/TG_Auth_Verify.json')?.id === auth.id
      && workflowEntries.get('Telegram/TG_Auth_Verify.json')?.publish === true,
    'Auth verifier must be published before MAIN accepts tickets.',
  );
  assert(
    'Manifest publishes local polling ingest',
    workflowEntries.get('Telegram/TG_ChatBot_Demo.json')?.id === chat.id
      && workflowEntries.get('Telegram/TG_ChatBot_Demo.json')?.publish === true,
    'The local-only ingest must be active for the polling bridge.',
  );
  assert(
    'Manifest publishes Telegram notification dispatcher',
    workflowEntries.get('Telegram/TG_Notification_Dispatch.json')?.id === notificationDispatch.id
      && workflowEntries.get('Telegram/TG_Notification_Dispatch.json')?.publish === true,
    'Approved Medstand notifications must be dispatched by the dedicated scheduled workflow.',
  );
  assert(
    'Manifest publishes authenticated Telegram link-code issuer',
    workflowEntries.get('Telegram/TG_Link_Code_Issue.json')?.id === linkCodeIssue.id
      && workflowEntries.get('Telegram/TG_Link_Code_Issue.json')?.publish === true,
    'The web session must obtain one-time codes through the shared authentication guard.',
  );
  assert(
    'Manifest publishes authenticated system announcement channel',
    workflowEntries.get('Telegram/TG_System_Announcement.json')?.id === systemAnnouncement.id
      && workflowEntries.get('Telegram/TG_System_Announcement.json')?.publish === true,
    'Internal incident and maintenance notices must use the dedicated channel workflow.',
  );

  const telegramCredential = manifest.credentials.find((credential) => credential.type === 'telegramApi');
  assert(
    'Dedicated Telegram chatbot credential',
    telegramCredential?.id === 'medstandTelegramChatbotDemo'
      && telegramCredential?.requiredEnv?.includes('TELEGRAM_CHATBOT_BOT_TOKEN'),
    'The report bot token must not be reused.',
  );
  assert(
    'Environment template contains dedicated bot token',
    envExample.includes('TELEGRAM_CHATBOT_BOT_TOKEN=')
      && envExample.includes('TELEGRAM_CHATBOT_API_BASE=https://api.telegram.org')
      && envExample.includes('TELEGRAM_POLL_N8N_URL=http://127.0.0.1:5678/webhook/telegram-poll-ingest')
      && envExample.includes('TELEGRAM_ANNOUNCEMENT_CHAT_ID=')
      && envExample.includes('TELEGRAM_ANNOUNCEMENT_N8N_URL=http://127.0.0.1:5678/webhook/telegram-system-announcement'),
    '.env.example must contain non-secret placeholders only.',
  );

  const telegramTriggers = chat.nodes.filter((node) => node.type === 'n8n-nodes-base.telegramTrigger');
  const pollIngest = chat.nodes.find((node) => node.name === 'Local Poller Ingest');
  assert('No public Telegram webhook trigger', telegramTriggers.length === 0, `Found ${telegramTriggers.length}.`);
  assert(
    'Local polling ingest is header-authenticated',
    pollIngest?.type === 'n8n-nodes-base.webhook'
      && pollIngest?.parameters?.path === 'telegram-poll-ingest'
      && pollIngest?.parameters?.authentication === 'headerAuth'
      && pollIngest?.credentials?.httpHeaderAuth?.id === 'medstandTelegramPollerHeader',
    'Only the loopback polling bridge may submit Telegram updates.',
  );

  const pollerCredential = manifest.credentials.find((credential) => credential.id === 'medstandTelegramPollerHeader');
  assert(
    'Poller credential stores only a token hash',
    pollerCredential?.type === 'httpHeaderAuth'
      && pollerCredential?.data?.value?.transform === 'sha256',
    'The raw bot token must not be copied into the ingest workflow.',
  );
  assert(
    'Polling bridge is loopback-only and disables Telegram webhook',
    poller.includes("['127.0.0.1', 'localhost', '::1']")
      && poller.includes("telegram('deleteWebhook'")
      && poller.includes("allowed_updates: ['message', 'callback_query']"),
    'Polling must call out to Telegram and forward only to local n8n.',
  );
  const normalizeTelegram = chat.nodes.find((node) => node.name === 'Normalize Telegram Update');
  const normalizeTelegramCode = String(normalizeTelegram?.parameters?.jsCode || '');
  const callbackIf = chat.nodes.find((node) => node.name === 'Is Callback Query?');
  const callbackAck = chat.nodes.find((node) => node.name === 'Acknowledge Callback');
  const releaseSlot = chat.nodes.find((node) => node.name === 'Release Processing Slot');
  const splitReply = chat.nodes.find((node) => node.name === 'Split Telegram Message');
  const sendReply = chat.nodes.find((node) => node.name === 'Send Telegram Reply');
  const formatReply = chat.nodes.find((node) => node.name === 'Format Chatbot Reply');
  const formatReplyCode = String(formatReply?.parameters?.jsCode || '');
  assert(
    'Telegram replies escape entities before HTML parsing',
    String(splitReply?.parameters?.jsCode || '').includes(".replace(/&/g, '&amp;')")
      && sendReply?.parameters?.additionalFields?.parse_mode === 'HTML',
    'Business data may contain underscores or markup characters.',
  );
  assert(
    'Telegram send failures are retried and not swallowed',
    sendReply?.retryOnFail === true
      && Number(sendReply?.maxTries) >= 2
      && sendReply?.continueOnFail !== true,
    'A failed Telegram send must fail visibly after retries.',
  );
  assert(
    'Telegram inline menu is attached to every reply',
    sendReply?.parameters?.replyMarkup === 'inlineKeyboard'
      && Array.isArray(sendReply?.parameters?.inlineKeyboard?.rows)
      && sendReply.parameters.inlineKeyboard.rows.length >= 3
      && JSON.stringify(sendReply.parameters.inlineKeyboard).includes('menu:sales_today')
      && JSON.stringify(sendReply.parameters.inlineKeyboard).includes('menu:whoami'),
    'The first UI must expose safe read-only shortcuts.',
  );
  assert(
    'Telegram callback queries are acknowledged and processed',
    callbackIf?.type === 'n8n-nodes-base.if'
      && callbackAck?.parameters?.resource === 'callback'
      && callbackAck?.parameters?.operation === 'answerQuery'
      && chat.connections?.['Normalize Telegram Update']?.main?.[0]?.some((edge) => edge.node === 'Is Callback Query?')
      && chat.connections?.['Is Callback Query?']?.main?.[0]?.some((edge) => edge.node === 'Acknowledge Callback'),
    'Button presses must clear the Telegram spinner and continue through authentication.',
  );
  assert(
    'Telegram acknowledges callbacks before starting the business query',
    chat.connections?.['Normalize Telegram Update']?.main?.[0]?.[0]?.node === 'Is Callback Query?'
      && callbackAck?.parameters?.additionalFields?.text,
    'Button presses must receive immediate progress feedback before SQL and MAIN run.',
  );
  assert(
    'Telegram serializes work per user and releases the slot after replying',
    normalizeTelegramCode.includes('__MEDSTAND_TELEGRAM_USER_LOCKS__')
      && normalizeTelegramCode.includes('canProcess')
      && chat.connections?.['Private Text Message?']?.main?.[0]?.[0]?.node === 'Is Login Command?'
      && chat.connections?.['Is Login Command?']?.main?.[1]?.[0]?.node === 'Issue Read-only Ticket'
      && chat.connections?.['Send Telegram Reply']?.main?.[0]?.[0]?.node === 'Release Processing Slot'
      && String(releaseSlot?.parameters?.jsCode || '').includes('ownerUpdateId === updateId'),
    'Concurrent requests from one Telegram account must not overload the DB.',
  );
  const callbackNormalized = executeNormalizer(normalizeTelegramCode, {
    update_id: 123456,
    callback_query: {
      id: 'callback-1',
      from: { id: 8768960447 },
      message: { chat: { id: 8768960447, type: 'private' }, text: 'Old bot message' },
      data: 'menu:sales_today',
    },
  });
  assert(
    'Telegram callback allowlist maps buttons to natural-language requests',
    callbackNormalized.canIssueTicket === true
      && callbackNormalized.isCallback === true
      && callbackNormalized.text === 'Hôm nay doanh số của tôi bao nhiêu?'
      && callbackNormalized.userId === '8768960447',
    JSON.stringify(callbackNormalized),
  );
  const aliasCases = [
    ['Hôm nay tôi nên ghé khách hàng nào?', 'Hôm nay tôi nên ghé khách nào?'],
    ['Lịch trình khách hàng hôm nay của tôi', 'Hôm nay tôi nên ghé khách nào?'],
    ['Hôm nay mình cần đi thăm nhà thuốc nào?', 'Hôm nay tôi nên ghé khách nào?'],
    ['Hôm nay tôi bán được bao nhiêu?', 'Hôm nay doanh số của tôi bao nhiêu?'],
    ['Cho tôi xem tin mới chưa đọc', 'Thông báo chưa đọc của tôi'],
    ['A003 còn bao nhiêu hàng trong kho?', 'Tồn kho sản phẩm A003'],
    ['NDB001 còn nợ bao nhiêu?', 'Cho tôi xem công nợ khách hàng NDB001'],
  ];
  const normalizedAliases = aliasCases.map(([input, expected], index) => {
    const userId = 8768960500 + index;
    const normalized = executeNormalizer(normalizeTelegramCode, {
      update_id: 123500 + index,
      message: {
        from: { id: userId },
        chat: { id: userId, type: 'private' },
        text: input,
      },
    });
    return { input, expected, actual: normalized.text };
  });
  assert(
    'Telegram normalizes equivalent business phrasing before MAIN',
    normalizedAliases.every((entry) => entry.actual === entry.expected),
    JSON.stringify(normalizedAliases),
  );
  const draftCallbackNormalized = executeNormalizer(normalizeTelegramCode, {
    update_id: 123457,
    callback_query: {
      id: 'callback-draft-1',
      from: { id: 8768960447 },
      message: { chat: { id: 8768960447, type: 'private' }, text: 'Draft preview' },
      data: 'draft:save:0123456789abcdef0123456789abcdef',
    },
  });
  const draftSqlNode = chat.nodes.find((node) => node.name === 'Execute Draft Order Action');
  const draftPreviewNode = chat.nodes.find((node) => node.name === 'Send Draft Order Preview');
  assert(
    'Telegram draft callbacks are strict and routed to the owner-bound SQL flow',
    draftCallbackNormalized.canIssueTicket === true
      && draftCallbackNormalized.text === '/draft-save 0123456789abcdef0123456789abcdef'
      && draftSqlNode?.type === 'n8n-nodes-base.microsoftSql'
      && JSON.stringify(draftPreviewNode?.parameters?.inlineKeyboard || {}).includes('draft:save:')
      && JSON.stringify(draftPreviewNode?.parameters?.inlineKeyboard || {}).includes('draft:cancel:'),
    'Draft callbacks must use a 32-hex expiring token and never pass through natural-language MAIN.',
  );
  const loginNormalized = executeNormalizer(normalizeTelegramCode, {
    update_id: 123458,
    message: {
      from: { id: 8768960450 },
      chat: { id: 8768960450, type: 'private' },
      text: '/login 123456',
    },
  });
  const loginSqlNode = chat.nodes.find((node) => node.name === 'Consume One-time Link Code');
  assert(
    'Unlinked Telegram users can consume a strict one-time login code',
    loginNormalized.isLoginCommand === true
      && loginNormalized.canProcess === true
      && loginSqlNode?.type === 'n8n-nodes-base.microsoftSql'
      && chat.connections?.['Is Login Command?']?.main?.[0]?.[0]?.node === 'Build Telegram Login SQL'
      && chat.connections?.['Format Telegram Login Reply']?.main?.[0]?.[0]?.node === 'Split Telegram Message',
    'The /login command must bypass ticket issuance only for the owner-bound link-code procedure.',
  );
  assert(
    'Telegram revenue reply keeps the business totals',
    formatReplyCode.includes("apiCode === '@doanh_so'")
      && formatReplyCode.includes("sumField('Doanh Số')")
      && formatReplyCode.includes("sumField('Doanh Thu Đã Thu')"),
    'Revenue replies must show totals instead of truncating the metric columns.',
  );
  const profileApiCodes = [
    '@hoa_don', '@hoa_don_chi_tiet', '@don_hang', '@cham_diem_kh',
    '@cong_no_khach_hang', '@cong_no_chi_tiet', '@tich_luy', '@tuyen_ban_hang',
    '@goi_ydon_hang', '@upsell_goi_y', '@goi_ydon_thuoc', '@danh_sach_tonkho',
    '@tra_cuu_san_pham', '@ctbh_san_pham', '@san_pham_trong_tam', '@de_xuat_khuyen_mai', '@danh_muc',
    '@khao_sat360', '@danh_sach_cau_hoi_khao_sat', '@kiem_tra_khao_sat',
    '@kiem_tra_khao_sat_ngay', '@lich_su_khao_sat', '@thong_bao',
    '@tim_san_pham_theo_trieu_chung',
  ];
  const missingProfiles = profileApiCodes.filter((apiCode) => !formatReplyCode.includes(`'${apiCode}':`));
  assert(
    'Telegram formatter covers all 25 approved read-only APIs',
    missingProfiles.length === 0 && formatReplyCode.includes("apiCode === '@doanh_so'"),
    missingProfiles.length ? `Missing: ${missingProfiles.join(', ')}` : '25/25 API routes covered.',
  );
  const promotionDataText = executeFormatter(
    formatReplyCode,
    { text: 'CTBH sản phẩm A003', medstandUserName: 'QLBH013.MED' },
    {
      success: true,
      status: 'SUCCESS',
      ApiCode: '@ctbh_san_pham',
      data: [{
        ItemID: 'A003', ItemName: 'Antrinano Plus', ActivePromotionCount: 1,
        PromotionSummary: 'Mua 10 tặng 1', GhiChu: 'Áp dụng trong tháng 9',
        ContractVersion: 'PROMOTION_BENEFIT_V3'
      }]
    },
  );
  assert(
    'Telegram CTBH reply shows product and promotion benefit without internal metadata',
    promotionDataText.includes('A003')
      && promotionDataText.includes('Mua 10 tặng 1')
      && promotionDataText.includes('Áp dụng trong tháng 9')
      && !promotionDataText.includes('ContractVersion'),
    promotionDataText,
  );
  const inventoryNoDataText = executeFormatter(
    formatReplyCode,
    { text: 'Tồn kho sản phẩm A003', medstandUserName: 'QLBH013.MED' },
    { success: true, status: 'NO_DATA', ApiCode: '@danh_sach_tonkho', data: [] },
  );
  assert(
    'Telegram inventory no-data reply names the requested product',
    inventoryNoDataText.includes('A003') && inventoryNoDataText.includes('tồn kho'),
    inventoryNoDataText,
  );
  const inventoryDataText = executeFormatter(
    formatReplyCode,
    { text: 'Tồn kho sản phẩm A003', medstandUserName: 'QLBH013.MED' },
    {
      success: true,
      status: 'SUCCESS',
      ApiCode: '@danh_sach_tonkho',
      data: [{ ItemID: 'A003', ItemName: 'Antrinano Plus', QuantityInStock: -2, RuleVersion: 'INTERNAL' }],
    },
  );
  assert(
    'Telegram inventory reply preserves negative stock and hides rule metadata',
    inventoryDataText.includes('A003')
      && inventoryDataText.includes('⚠️ -2')
      && inventoryDataText.includes('Mã sản phẩm')
      && inventoryDataText.includes('Tồn kho')
      && !inventoryDataText.includes('ItemID:')
      && !inventoryDataText.includes('QuantityInStock:')
      && !inventoryDataText.includes('RuleVersion')
      && !inventoryDataText.includes('INTERNAL'),
    inventoryDataText,
  );
  const medicalDataText = executeFormatter(
    formatReplyCode,
    { text: 'Tìm sản phẩm theo triệu chứng ho', medstandUserName: 'QLBH013.MED' },
    {
      success: true,
      status: 'SUCCESS',
      ApiCode: '@tim_san_pham_theo_trieu_chung',
      data: [{
        ItemID: 'A003',
        ItemName: 'Antrinano Plus',
        AvailableStock: 4,
        MedicalDisclaimer: 'Thông tin chỉ để tham khảo.',
        RuleSource: 'INTERNAL',
      }],
    },
  );
  assert(
    'Telegram medical lookup keeps disclaimer and hides internal rules',
    medicalDataText.includes('Thông tin chỉ để tham khảo.')
      && medicalDataText.includes('Tồn có thể bán: 4')
      && !medicalDataText.includes('RuleSource')
      && !medicalDataText.includes('INTERNAL'),
    medicalDataText,
  );
  const debtDataText = executeFormatter(
    formatReplyCode,
    { text: 'Cho tôi xem công nợ khách hàng NDB001', medstandUserName: 'QLBH013.MED' },
    {
      success: true,
      status: 'SUCCESS',
      ApiCode: '@cong_no_chi_tiet',
      data: [
        {
          ObjectType: 'CUSTOMER', CustomerID: 'NDB001', CustomerName: 'Nhà thuốc Demo',
          MaChungTu: null, NgayKhoanCongNo: '2026-08-28T23:59:59.000Z',
          LoaiKhoanCongNo: 'OTHER_RECEIVABLE', GiaTriBanDau: 3945000,
          DaThanhToanTra: 0, RemainingAmount: 3945000, NotificationID: 12,
        },
        {
          ObjectType: 'CUSTOMER', CustomerID: 'NDB001', CustomerName: 'Nhà thuốc Demo',
          MaChungTu: null, NgayKhoanCongNo: '2026-08-28T23:59:59.000Z',
          LoaiKhoanCongNo: 'OTHER_RECEIVABLE', GiaTriBanDau: 3945000,
          DaThanhToanTra: 0, RemainingAmount: 3945000, NotificationID: 12,
        },
        {
          ObjectType: 'CUSTOMER', CustomerID: 'NDB001', CustomerName: 'Nhà thuốc Demo',
          MaChungTu: 'OPEN-001', NgayKhoanCongNo: '2016-01-01T00:00:00.000Z',
          LoaiKhoanCongNo: 'OPENING_BALANCE', GiaTriBanDau: 2500000,
          DaThanhToanTra: 0, RemainingAmount: 2500000, NotificationID: 13,
        },
      ],
    },
  );
  assert(
    'Telegram debt reply deduplicates exact rows and distinguishes real debt items',
    debtDataText.includes('Chi tiết công nợ (2)')
      && debtDataText.includes('Mã khách hàng: NDB001')
      && debtDataText.includes('Tên khách hàng: Nhà thuốc Demo')
      && debtDataText.includes('Số chứng từ: OPEN-001')
      && debtDataText.includes('Ngày công nợ: 28/08/2026')
      && debtDataText.includes('Ngày công nợ: 01/01/2016')
      && debtDataText.includes('Loại khoản: Khoản phải thu khác')
      && debtDataText.includes('Loại khoản: Số dư đầu kỳ')
      && debtDataText.includes('Giá trị ban đầu: 3.945.000 đ')
      && debtDataText.includes('Còn nợ: 3.945.000 đ')
      && debtDataText.includes('Còn nợ: 2.500.000 đ')
      && !debtDataText.includes('CustomerID:')
      && !debtDataText.includes('CustomerName:')
      && !debtDataText.includes('ObjectType')
      && !debtDataText.includes('NotificationID'),
    debtDataText,
  );
  const routeDataText = executeFormatter(
    formatReplyCode,
    { text: 'Hôm nay tôi nên ghé khách nào?', medstandUserName: 'QLBH013.MED' },
    {
      success: true,
      status: 'SUCCESS',
      ApiCode: '@tuyen_ban_hang',
      data: [{
        ObjectID: 'HPC026', TenCuaHang: 'Quầy thuốc Demo', Phone: '0900000000',
        Address: 'Hải Phòng', LichGhe: 'Thứ 6', LanMuaCuoiDate: '2025-01-11T00:00:00.000Z',
      }],
    },
  );
  assert(
    'Telegram route reply uses Vietnamese labels and dates',
    routeDataText.includes('Tên khách hàng: Quầy thuốc Demo')
      && routeDataText.includes('Điện thoại: 0900000000')
      && routeDataText.includes('Địa chỉ: Hải Phòng')
      && routeDataText.includes('Lần mua cuối: 11/01/2025')
      && !routeDataText.includes('TenCuaHang:')
      && !routeDataText.includes('LanMuaCuoiDate:'),
    routeDataText,
  );
  const transportErrorText = executeFormatter(
    formatReplyCode,
    { text: 'Hôm nay doanh số của tôi bao nhiêu?', medstandUserName: 'QLBH013.MED' },
    { error: { code: 'ERR_INVALID_CHAR' } },
  );
  assert(
    'Telegram formatter never exposes object-shaped transport errors',
    transportErrorText.includes('Vui lòng thử lại') && !transportErrorText.includes('[object Object]'),
    transportErrorText,
  );

  const mainResolver = mainWorkflow.nodes.find((node) => node.name === 'Resolve UUID V5')?.parameters?.jsCode || '';
  assert(
    'MAIN accepts ticket-issuance identity only from the authenticated Telegram bridge',
    mainResolver.includes("/^telegram_[0-9a-f]{64}$/")
      && mainResolver.includes("toLowerCase() === 'telegram-demo'")
      && mainResolver.includes('$env.TELEGRAM_INTERNAL_BRIDGE_KEY')
      && mainResolver.includes("headers['x-medstand-bridge-key']")
      && mainResolver.includes("headers['x-medstand-tg-user']")
      && mainResolver.includes('/webhook/telegram-auth-verify'),
    'Untrusted callers must fall back to ticket verification; only the secret-bearing local bridge may skip the duplicate parsing lookup.',
  );
  const callMain = chat.nodes.find((node) => node.name === 'Call MAIN ChatBot');
  const callMainHeaders = JSON.stringify(callMain?.parameters?.headerParameters || {});
  assert(
    'Telegram bridge forwards only server-owned identity metadata to MAIN',
    callMainHeaders.includes('X-Medstand-TG-User')
      && callMainHeaders.includes('X-Medstand-TG-Session')
      && callMainHeaders.includes('TELEGRAM_INTERNAL_BRIDGE_KEY')
      && String(chat.nodes.find((node) => node.name === 'Prepare Authorized Action')?.parameters?.jsCode || '').includes('medstandServerSessionId'),
    'The values must come from the SQL ticket-issuance result, not Telegram message content.',
  );
  assert(
    'Telegram bridge safely transports Unicode identity and derives a local-only key',
    callMainHeaders.includes('encodeURIComponent($json.medstandDisplayName')
      && mainResolver.includes('decodeURIComponent')
      && n8nRuntime.includes('medstand-telegram-main-bridge\\0')
      && n8nRuntime.includes('TELEGRAM_INTERNAL_BRIDGE_KEY'),
    'Unicode header values must be encoded, and the bridge key must be derived without exposing the bot token.',
  );
  const parser = mainWorkflow.nodes.find((node) => node.name === 'Parse User Info V5')?.parameters?.jsCode || '';
  assert(
    'MAIN uses stable server-owned Telegram session ID',
    parser.includes('ServerSessionID') && parser.includes('TELEGRAM_TICKET_VERIFIED'),
    'Conversation context must not use the rotating ticket as its identity.',
  );
  const normalizeInput = mainWorkflow.nodes.find((node) => node.name === 'LIB NormalizeInput')?.parameters?.jsCode || '';
  assert(
    'MAIN resolves today as a single-day revenue range',
    normalizeInput.includes("period === 'TODAY'")
      && normalizeInput.includes("resolveRelativeDateRange('TODAY', options.now)"),
    'The phrase "hom nay" must set both fromDate and toDate to today.',
  );

  const sharedVerify = sharedAuth.nodes.find((node) => node.name === 'Verify Token with API UserInfo');
  assert(
    'Shared Auth Guard recognizes Telegram ticket',
    String(sharedVerify?.parameters?.url || '').includes('/webhook/telegram-auth-verify')
      && String(sharedVerify?.parameters?.jsonBody || '').includes('ticket'),
    'API_Execute must revalidate the same short-lived ticket.',
  );
  assert(
    'Telegram auth verifier stays stateless and authoritative',
    !auth.nodes.some((node) => /Cached Auth|Cache Successful Auth|Ticket Cached/.test(node.name))
      && auth.connections?.['Ticket Shape Valid?']?.main?.[0]?.[0]?.node === 'Verify Ticket in SQL',
    'Expiry and revocation must be checked in SQL on the API authorization boundary.',
  );

  const successEdges = apiExecute.connections?.['Format Execute Response']?.main?.[0] || [];
  const successAudit = apiExecute.nodes.find((node) => node.name === 'Write Audit - Execute Success');
  assert(
    'API Execute responds before best-effort audit',
    successEdges?.[0]?.node === 'Respond Execute'
      && successEdges.length === 1
      && apiExecute.connections?.['Respond Execute']?.main?.[0]?.[0]?.node === 'Prepare Audit - Execute Success'
      && (apiExecute.connections?.['Write Audit - Execute Success']?.main?.[0] || []).length === 0
      && successAudit?.onError === 'continueRegularOutput',
    'Audit latency or failure must not block the HTTP response.',
  );
  assert(
    'API Execute audit queries return a recordset',
    apiExecute.nodes
      .filter((node) => node.name.startsWith('Prepare Audit - Execute '))
      .every((node) => String(node.parameters?.jsCode || '').includes('SELECT AuditWritten = 1;')),
    'The MSSQL node must not enter its undefined-error path on an empty result.',
  );

  const allowedRows = [...sql.matchAll(/\('([^']+)',\s+'(?:MANAGER|SALE)',\s+'(?:MB|MT|MN)'\)/g)];
  assert('SQL allowlist contains 13 accounts', allowedRows.length === 13, `Found ${allowedRows.length}.`);
  assert(
    'SQL ticket is short-lived and grants only read plus draft-order write',
    sql.includes('DATEADD(SECOND, 90, @Now)')
      && sql.includes("Capabilities = 'api.read,orders.draft.write'"),
    'Expected 90-second tickets with api.read and orders.draft.write only.',
  );
  assert(
    'Telegram draft SQL always forces draft status through the canonical order API',
    draftSql.includes('API_TelegramOrderDraft_Save_AI')
      && draftSql.includes('EXEC dbo.API_DonHangChiTiet_Insert_AI')
      && draftSql.includes('@SaveAsDraft=1')
      && !draftSql.includes('@SaveAsDraft=@'),
    'Telegram must never accept a client-controlled submission status.',
  );
  assert(
    'Telegram draft confirmation is owner-bound, expiring and idempotent',
    draftSql.includes('TelegramUserID=@TelegramUserID')
      && draftSql.includes('ExpiresAtUtc>SYSUTCDATETIME()')
      && draftSql.includes("DECLARE @IdempotencyKey VARCHAR(128)='tg-draft-' + @DraftToken")
      && draftSql.includes('@IdempotencyKey=@IdempotencyKey'),
    'A callback token cannot be reused across Telegram users or create duplicate drafts.',
  );
  const dispatchSend = notificationDispatch.nodes.find((node) => node.name === 'Send Telegram Notification');
  assert(
    'Telegram notification dispatch is scoped, unread-only and version-idempotent',
    notificationSql.includes('AI_ActiveNotificationByUserFnc(L.UserName,@Now)')
      && notificationSql.includes('AND N.IsView=0')
      && notificationSql.includes('PRIMARY KEY (NotificationID,TelegramUserID,ContentVersion)')
      && notificationSql.includes("Status IN ('PENDING','PROCESSING','SENT','FAILED')"),
    'Only approved active notifications in the linked user scope may be queued once per content version.',
  );
  assert(
    'Telegram notification sender uses credential isolation and records both outcomes',
    dispatchSend?.credentials?.telegramApi?.id === 'medstandTelegramChatbotDemo'
      && dispatchSend?.onError === 'continueErrorOutput'
      && notificationDispatch.connections?.['Send Telegram Notification']?.main?.length === 2
      && notificationDispatch.connections?.['Prepare Delivery Success']
      && notificationDispatch.connections?.['Prepare Delivery Failure'],
    'Successful and failed sends must both complete the durable delivery record.',
  );
  const completionBuilder = notificationDispatch.nodes.find((node) => node.name === 'Build Delivery Completion SQL');
  let completionQuery = '';
  try {
    completionQuery = new Function('$json', completionBuilder.parameters.jsCode)({ // eslint-disable-line no-new-func
      NotificationID: '123', TelegramUserID: '8768960447', ContentVersion: 2,
      deliverySucceeded: true, telegramMessageId: '456', deliveryError: '',
    })?.[0]?.json?.query || '';
  } catch (_) {}
  assert(
    'Telegram delivery completion preserves numeric Telegram identity',
    completionQuery.includes("@TelegramUserID='8768960447'")
      && completionQuery.includes('@NotificationID=123')
      && completionQuery.includes('@Succeeded=1'),
    'The Telegram node response must not lose the durable delivery key.',
  );
  const linkWebhook = linkCodeIssue.nodes.find((node) => node.name === 'Issue Link Code Webhook');
  const linkAuth = linkCodeIssue.nodes.find((node) => node.name === 'Verify Web Login');
  assert(
    'Web link-code issuance requires the canonical authenticated identity',
    linkWebhook?.parameters?.path === 'telegram-link-code-issue'
      && linkAuth?.type === 'n8n-nodes-base.executeWorkflow'
      && linkAuth?.parameters?.workflowId?.value === '9UxECqxRaPGMF8EM'
      && linkCodeIssue.connections?.['Web Login Valid?']?.main?.[1]?.[0]?.node === 'Respond Web Login Error',
    'A browser-supplied username must never select the Medstand account to link.',
  );
  assert(
    'Self-link codes are hashed, short-lived, single-use and rate-limited',
    selfLinkSql.includes('CodeSalt         VARBINARY(16)')
      && selfLinkSql.includes('CodeHash         VARBINARY(32)')
      && !selfLinkSql.includes('LinkCode         CHAR(6)')
      && selfLinkSql.includes('DATEADD(MINUTE,5,@Now)')
      && selfLinkSql.includes("LinkStatus='RATE_LIMITED'")
      && selfLinkSql.includes('FailedAttempts>=5')
      && selfLinkSql.includes('ConsumedAtUtc=@Now')
      && selfLinkSql.includes('TelegramUserID=@TelegramUserID OR UserName=@UserName'),
    'Codes must not be reusable or brute-forceable through an unlimited Telegram endpoint.',
  );
  assert(
    'Account page exposes the one-time Telegram linking flow',
    accountTemplate.includes('id="btn-telegram-link"')
      && accountTemplate.includes('id="telegram-link-code"')
      && accountPage.includes("Http.post('/webhook/telegram-link-code-issue', {})")
      && accountPage.includes("'/login ' + code")
      && accountPage.includes('startTelegramCountdown'),
    'Authenticated users need a visible code generator and expiry countdown.',
  );
  const announcementWebhook = systemAnnouncement.nodes.find((node) => node.name === 'Local Announcement Webhook');
  const announcementFormatter = systemAnnouncement.nodes.find((node) => node.name === 'Validate and Format Announcement');
  const announcementSender = systemAnnouncement.nodes.find((node) => node.name === 'Publish Channel Announcement');
  assert(
    'System announcement publishing is authenticated and channel-scoped',
    announcementWebhook?.parameters?.path === 'telegram-system-announcement'
      && announcementWebhook?.parameters?.authentication === 'headerAuth'
      && announcementWebhook?.credentials?.httpHeaderAuth?.id === 'medstandTelegramPollerHeader'
      && String(announcementFormatter?.parameters?.jsCode || '').includes('TELEGRAM_ANNOUNCEMENT_CHAT_ID')
      && String(announcementFormatter?.parameters?.jsCode || '').includes("replace(/&/g, '&amp;')")
      && announcementSender?.parameters?.chatId === '={{ $json.channelChatId }}'
      && announcementSender?.retryOnFail === true
      && Number(announcementSender?.maxTries) >= 3,
    'Only authenticated local callers may publish escaped, bounded notices to the configured channel.',
  );
  assert(
    'SQL stores ticket hash instead of plaintext',
    sql.includes("HASHBYTES('SHA2_256', @Ticket)")
      && !/CREATE TABLE[\s\S]{0,1000}\bAuthTicket\s+VARCHAR/i.test(sql),
    'Only TicketHash may be persisted.',
  );
  assert(
    'SQL enforces private chat identity',
    sql.includes('TelegramUserID = TelegramChatID')
      && sql.includes('@TelegramChatID <> @TelegramUserID'),
    'Group chats must not receive account-scoped data.',
  );

  assert(
    'Mapping template covers the same 13 unique accounts',
    mappingExample.links.length === 13
      && new Set(mappingExample.links.map((entry) => entry.userName)).size === 13
      && mappingExample.links.every((entry) => entry.telegramUserId === ''),
    'Real Telegram IDs must stay in the ignored local file.',
  );

  compileCodeNodes(auth, 'TG Auth');
  compileCodeNodes(chat, 'TG Chat');
  compileCodeNodes(notificationDispatch, 'TG Notification');
  compileCodeNodes(linkCodeIssue, 'TG Link Code');
  compileCodeNodes(systemAnnouncement, 'TG System Announcement');

  const failed = checks.filter((check) => check.status === 'FAIL');
  console.log(JSON.stringify({
    task: 'TELEGRAM-PILOT-001',
    status: failed.length ? 'FAIL' : 'PASS',
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    task: 'TELEGRAM-PILOT-001',
    status: 'ERROR',
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
}
