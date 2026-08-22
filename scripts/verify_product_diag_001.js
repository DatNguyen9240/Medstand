'use strict';

/* PRODUCT-DIAG-001 — kiểm chứng hợp đồng chẩn đoán của API_HangHoaList_AI.
 *
 *   node scripts/verify_product_diag_001.js
 *
 * Nguyên tắc: API và scripts/uat_data_readiness.js là hai đường đi độc lập tới cùng một câu
 * trả lời. Chúng phải kết luận GIỐNG NHAU trên cùng bộ dữ liệu. Lệch nhau nghĩa là một trong
 * hai đang nói dối, và đó chính là loại lỗi task này sinh ra để diệt.
 *
 * KHÔNG seed dữ liệu. Ca nào mất tiền đề thì SKIPPED kèm lý do, không báo PASS giả.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const READINESS_TOOL = path.join(root, 'scripts', 'uat_data_readiness.js');
const orderability = require(path.join(root, 'src', 'js', 'utils', 'product-orderability.js'));

/* Mã do procedure phát ra. Phải khớp bảng trong sql/Module common - API_HangHoaList_AI.sql. */
const CONTRACT_CODES = [
  'INVALID_USER', 'CUSTOMER_OUT_OF_SCOPE',
  'ITEM_NOT_FOUND', 'ITEM_DISABLED_AT_BRANCH',
  'SELLABLE_RULE_UNAVAILABLE', 'ITEM_GROUP_NOT_SELLABLE',
  'WAREHOUSE_SCOPE_REQUIRED', 'STOCK_BLOCKED_BY_WAREHOUSE_SCOPE',
  'STOCK_NO_ROW', 'STOCK_ZERO_AVAILABLE',
  'PRICE_NOT_FOUND', 'PRICE_EXPIRED_OR_DISABLED',
  'PRODUCT_DIAGNOSTIC_INCONSISTENT',
];

/* Chỉ những mã hai bên CÙNG chịu trách nhiệm mới đem ra so.
   - CATALOG_HIDDEN/CATALOG_BLOCKED là kết luận nội bộ của công cụ, không phải mã hợp đồng.
   - Các mã lớp tài khoản (ACCOUNT_..., USER_SCOPE_INCOMPLETE) thì API danh mục không xét. */
const COMPARABLE = new Set([
  'ITEM_NOT_FOUND', 'ITEM_DISABLED_AT_BRANCH', 'ITEM_GROUP_NOT_SELLABLE', 'SELLABLE_RULE_UNAVAILABLE',
  'WAREHOUSE_SCOPE_REQUIRED', 'STOCK_BLOCKED_BY_WAREHOUSE_SCOPE', 'STOCK_NO_ROW', 'STOCK_ZERO_AVAILABLE',
  'PRICE_NOT_FOUND', 'PRICE_EXPIRED_OR_DISABLED', 'CUSTOMER_OUT_OF_SCOPE',
]);

/* Khác biệt CÓ CHỦ Ý, không phải lỗi: công cụ chẩn đoán chạy bằng quyền DBA nên phân biệt được
   "khách không tồn tại" với "khách ngoài phạm vi". API thì KHÔNG được phép tiết lộ điều đó —
   nói "không tồn tại" là xác nhận cho người hỏi biết một ObjectID nào đó có thật hay không. */
const TOOL_TO_API = { CUSTOMER_NOT_FOUND: 'CUSTOMER_OUT_OF_SCOPE' };

function readEnv(relativeEnvPath) {
  const values = {};
  const filePath = path.join(root, relativeEnvPath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function runReadiness(user, customer, item) {
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath,
      [READINESS_TOOL, `--user=${user}`, `--customer=${customer}`, `--item=${item}`],
      { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    if (error.stdout === undefined) throw error;
    stdout = error.stdout;
  }
  return JSON.parse(stdout);
}

function encryptGatewayPayload(value, key = 107) {
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  let xor = '';
  for (let i = 0; i < b64.length; i += 1) xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
  return Buffer.from(xor, 'binary').toString('base64');
}

async function runHttpGatewayEnvelopeTest(gatewayEnvelope) {
  const storage = new Map();
  const context = {
    window: null,
    document: { cookie: 'auth_token=test-token' },
    location: { href: '' },
    localStorage: { removeItem() {} },
    sessionStorage: {
      get length() { return storage.size; },
      key(index) { return [...storage.keys()][index] || null; },
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    API_CONFIG: { BASE_URL: 'https://business.invalid', GATEWAY_URL: 'https://gateway.invalid/api/gateway' },
    MedstandProductOrderability: orderability,
    fetch: async () => new Response(JSON.stringify({
      data: encryptGatewayPayload(JSON.stringify(gatewayEnvelope)),
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    Response,
    FormData,
    Blob,
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    decodeURIComponent,
    escape,
    unescape,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    showGlobalSpinner() {},
    hideGlobalSpinner() {},
    console: { log() {}, warn() {}, error() {} },
  };
  context.window = context;
  vm.createContext(context);
  const httpSource = fs.readFileSync(path.join(root, 'src', 'js', 'services', 'http.js'), 'utf8');
  vm.runInContext(`${httpSource}\n;globalThis.__HttpForProductDiagTest = Http;`, context);
  return context.__HttpForProductDiagTest.get('/api/API_HangHoaList_AI', { q: '{}' }, { cache: false });
}

const results = [];
const record = (name, status, detail) => results.push({ Case: name, Status: status, Detail: detail });
const check = (name, condition, detail) => record(name, condition ? 'PASS' : 'FAIL', detail);

async function callApi(pool, user, customer, item) {
  const r = await pool.request()
    .input('Username', sql.VarChar(50), user)
    .input('ObjectID', sql.VarChar(50), customer)
    .input('ItemID', sql.VarChar(50), item)
    .input('SearchText', sql.NVarChar(50), '')
    .execute('dbo.API_HangHoaList_AI');
  return r.recordset || [];
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS D;')).recordset[0].D;
    if (dbName !== 'medtest') throw new Error(`Chỉ chạy trên medtest; hiện tại ${dbName}.`);

    /* ============ 1. KHÔNG REGRESSION: sản phẩm hợp lệ vẫn trả nguyên dữ liệu ============ */
    const okRows = await callApi(pool, 'demo', 'DL011', 'A008');
    const okRow = okRows[0] || {};
    check('NO_REGRESSION_ON_ORDERABLE_ITEM',
      okRows.length === 1 && okRow.ItemID === 'A008'
      && Number(okRow.UnitPrice) > 0 && Number(okRow.AvailableStock) > 0
      && Boolean(okRow.StoreHouseID) && okRow.Code === undefined,
      { Rows: okRows.length, UnitPrice: okRow.UnitPrice, AvailableStock: okRow.AvailableStock,
        StoreHouseID: okRow.StoreHouseID, HasDiagnosticColumns: okRow.Code !== undefined,
        Note: 'Ca hợp lệ phải giữ nguyên schema cũ, không kèm cột chẩn đoán.' });

    /* ============ 2. Tìm kiếm rộng giữ nguyên hành vi cũ ============ */
    const broad = await callApi(pool, 'demo', 'DL011', '');
    check('BROAD_SEARCH_UNCHANGED',
      broad.length > 0 && broad[0].Code === undefined,
      { Rows: broad.length, Note: '@ItemID rỗng vẫn là danh sách như cũ, không phải chẩn đoán.' });

    /* ============ 3. Đối chiếu API với công cụ chẩn đoán ============ */
    /* Ca WAREHOUSE_SCOPE_REQUIRED cần tài khoản thiếu quyền kho MÀ có khách trong phạm vi. */
    let noWarehouseCase = null;
    const noWarehouseUsers = (await pool.request().query(`
      SELECT TOP (5) U.UserName FROM dbo.SY_User U
      WHERE COALESCE(U.Disable, 0) = 0 AND COALESCE(U.BranchID, '') <> '' AND COALESCE(U.EmployeeID, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()))
      ORDER BY U.UserName;`)).recordset;
    for (const u of noWarehouseUsers) {
      const obj = (await pool.request().input('U', sql.VarChar(50), u.UserName)
        .query('SELECT TOP (1) ObjectID FROM dbo.AR_GetObjectByUserFnc(@U);')).recordset[0];
      if (obj) { noWarehouseCase = { user: u.UserName, customer: obj.ObjectID, item: 'A008' }; break; }
    }

    const triples = [
      { name: 'AGREE_PRICE_AND_STOCK_MISSING', user: 'demo', customer: 'DL011', item: 'B043' },
      { name: 'AGREE_MULTI_CAUSE', user: 'demo', customer: 'DL011', item: 'A003' },
      { name: 'AGREE_ITEM_NOT_FOUND', user: 'demo', customer: 'DL011', item: 'ZZZ999' },
      { name: 'AGREE_CUSTOMER_HIDDEN', user: 'demo', customer: 'KHONGCO999', item: 'A008' },
    ];
    if (noWarehouseCase) {
      triples.push(Object.assign({ name: 'AGREE_WAREHOUSE_SCOPE' }, noWarehouseCase));
    } else {
      record('AGREE_WAREHOUSE_SCOPE', 'SKIPPED',
        'Không tìm được tài khoản vừa thiếu quyền kho vừa có khách trong phạm vi.');
    }

    for (const t of triples) {
      const rows = await callApi(pool, t.user, t.customer, t.item);
      const head = rows[0] || {};
      const apiCodes = orderability.parseReasonCodes(head.ReasonCodesJson)
        .filter((c) => COMPARABLE.has(c)).sort();

      const manifest = runReadiness(t.user, t.customer, t.item);
      const toolCodes = [...new Set(manifest.BlockingCodes
        .map((c) => TOOL_TO_API[c] || c)
        .filter((c) => COMPARABLE.has(c)))].sort();

      check(t.name, JSON.stringify(apiCodes) === JSON.stringify(toolCodes),
        { Input: t, ApiPrimaryCode: head.Code, ApiCodes: apiCodes, ToolCodes: toolCodes,
          ToolRaw: manifest.BlockingCodes });
    }

    /* ============ 4. Nhiều nguyên nhân: mã chính và danh sách phải ỔN ĐỊNH ============ */
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      const rows = await callApi(pool, 'demo', 'DL011', 'A003');
      runs.push({ Code: (rows[0] || {}).Code, Reasons: (rows[0] || {}).ReasonCodesJson });
    }
    const first = JSON.stringify(runs[0]);
    check('MULTI_CAUSE_IS_DETERMINISTIC',
      runs.every((r) => JSON.stringify(r) === first) && orderability.parseReasonCodes(runs[0].Reasons).length > 1,
      { Runs: runs, Note: 'Ba lần gọi phải ra cùng mã chính và cùng danh sách nguyên nhân.' });

    /* ============ 5. Không lộ dữ liệu ngoài phạm vi ============ */
    const leakRows = noWarehouseCase
      ? await callApi(pool, noWarehouseCase.user, noWarehouseCase.customer, noWarehouseCase.item)
      : await callApi(pool, 'demo', 'DL011', 'A003');
    const leakHead = leakRows[0] || {};
    const allowedKeys = ['Msg', 'MsgType', 'Code', 'DiagnosticContractVersion',
      'IsOrderable', 'ReasonCodesJson', 'EvaluatedAtUtc'].sort();
    check('NO_OUT_OF_SCOPE_LEAK',
      JSON.stringify(Object.keys(leakHead).sort()) === JSON.stringify(allowedKeys)
      && !/\d/.test(String(leakHead.Msg || '')),
      { Keys: Object.keys(leakHead).sort(), Msg: leakHead.Msg,
        Note: 'Response chẩn đoán không được kèm mã kho, tên kho hay số lượng tồn.' });

    /* ============ 6. Helper frontend ============ */
    const missingMessages = CONTRACT_CODES.filter((c) => !orderability.messageFor(c));
    check('HELPER_COVERS_EVERY_CONTRACT_CODE', missingMessages.length === 0,
      { Missing: missingMessages, Note: 'Mỗi mã của procedure phải có đúng một câu tiếng Việt.' });

    const unknownCode = orderability.resolve({
      records: [{ Code: 'SOMETHING_NEW', DiagnosticContractVersion: orderability.CONTRACT_VERSION,
        ReasonCodesJson: '["SOMETHING_NEW"]', Msg: 'câu server' }],
    }, 'A008');
    check('HELPER_FAILS_CLOSED_ON_UNKNOWN_CODE',
      unknownCode.orderable === false && unknownCode.recognized === false
      && unknownCode.message === orderability.UNKNOWN_MESSAGE,
      unknownCode);

    const unknownVersion = orderability.resolve({
      records: [{ Code: 'STOCK_ZERO_AVAILABLE', DiagnosticContractVersion: 'PRODUCT_ORDERABILITY_V9',
        ReasonCodesJson: '["STOCK_ZERO_AVAILABLE"]' }],
    }, 'A008');
    check('HELPER_FAILS_CLOSED_ON_UNKNOWN_VERSION',
      unknownVersion.orderable === false && unknownVersion.recognized === false
      && unknownVersion.message === orderability.UNKNOWN_MESSAGE,
      { Result: unknownVersion, Note: 'Version lạ có thể đã đổi nghĩa mã; không được tự diễn giải.' });

    const legacy = orderability.resolve({ records: [] }, 'A008');
    check('HELPER_SUPPORTS_LEGACY_RESPONSE',
      legacy.orderable === false && legacy.message === orderability.LEGACY_MESSAGE,
      { Result: legacy, Note: 'Server chưa deploy bản mới vẫn phải chạy được.' });

    const objectForm = orderability.parseReasonCodes('[{"Code":"A"},{"Code":"B"}]');
    const arrayForm = orderability.parseReasonCodes('["A","B"]');
    check('HELPER_PARSES_BOTH_JSON_SHAPES',
      JSON.stringify(objectForm) === '["A","B"]' && JSON.stringify(arrayForm) === '["A","B"]',
      { ObjectForm: objectForm, ArrayForm: arrayForm });

    /* Response thật qua API trung gian: Msg/MsgType/Code bị đưa lên envelope, records chỉ
       còn version/isOrderable/reasons. Helper vẫn phải khôi phục mã chính từ reasons[0]. */
    const gatewayEnvelope = {
      code: 1,
      msg: 'câu từ server không dùng để quyết định',
      records: [{
        DiagnosticContractVersion: orderability.CONTRACT_VERSION,
        IsOrderable: false,
        ReasonCodesJson: '["STOCK_NO_ROW","PRICE_NOT_FOUND"]',
      }],
    };
    const gatewayVerdict = orderability.resolve(gatewayEnvelope, 'B043');
    check('HELPER_ACCEPTS_REAL_GATEWAY_ENVELOPE',
      orderability.isDiagnosticEnvelope(gatewayEnvelope)
      && gatewayVerdict.orderable === false
      && gatewayVerdict.code === 'STOCK_NO_ROW'
      && gatewayVerdict.recognized === true
      && gatewayVerdict.message === orderability.messageFor('STOCK_NO_ROW'),
      { Result: gatewayVerdict, Note: 'Bao phủ đúng shape runtime, không chỉ shape gọi SQL trực tiếp.' });

    const httpResult = await runHttpGatewayEnvelopeTest(gatewayEnvelope);
    const httpVerdict = orderability.resolve(httpResult, 'B043');
    check('HTTP_PASSES_GATEWAY_DIAGNOSTIC_TO_HELPER',
      httpResult.code === 1
      && httpVerdict.code === 'STOCK_NO_ROW'
      && httpVerdict.recognized === true,
      { Result: httpVerdict, Note: 'Http không được ném sớm ở envelope code=1 của contract sản phẩm.' });

    const orderable = orderability.resolve({ records: [{ ItemID: 'A008', UnitPrice: 75000 }] }, 'a008');
    check('HELPER_ACCEPTS_ORDERABLE_ITEM',
      orderable.orderable === true && orderable.detail.UnitPrice === 75000,
      orderable);

    const failed = results.filter((r) => r.Status === 'FAIL');
    const skipped = results.filter((r) => r.Status === 'SKIPPED');
    console.log(JSON.stringify({
      Task: 'PRODUCT-DIAG-001-VERIFY',
      Status: failed.length ? 'FAIL' : 'PASS',
      Summary: `${results.filter((r) => r.Status === 'PASS').length} PASS / ${failed.length} FAIL / ${skipped.length} SKIPPED`,
      ContractVersion: orderability.CONTRACT_VERSION,
      Cases: results,
      NotCoveredHere: [
        'Ảnh UI của ba luồng (tạo đơn, sửa đơn, panel chatbot) — phải chụp tay.',
        'Giả Username qua DevTools trên server đang chạy — lớp hàm đã có test tại scripts/verify_order_status_guard.js.',
      ],
    }, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'PRODUCT-DIAG-001-VERIFY', Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 2;
});
