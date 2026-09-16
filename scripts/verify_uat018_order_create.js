'use strict';

/* UAT-018 — kiểm tra read-only contract và bằng chứng của một đơn UAT đã tạo. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const values = {};
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function check(name, pass, detail) {
  return { Check: name, Status: pass ? 'PASS' : 'FAIL', Detail: detail };
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  const documentId = String(process.argv[2] || '').trim();
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS DbName')).recordset[0].DbName;
    if (dbName !== 'medtest') throw new Error(`UAT-018 chỉ được chạy trên DB medtest; hiện tại là ${dbName}`);

    const procRows = (await pool.request().query(`
SELECT o.name AS ProcName, OBJECT_DEFINITION(o.object_id) AS Definition
FROM sys.objects o
WHERE o.type IN ('P', 'PC')
  AND o.name IN ('API_DonHangChiTiet_Insert_AI', 'API_HangHoaList_AI');`)).recordset;
    const aiProc = procRows.find((row) => row.ProcName === 'API_DonHangChiTiet_Insert_AI')?.Definition || '';
    const productProc = procRows.find((row) => row.ProcName === 'API_HangHoaList_AI')?.Definition || '';

    const parameters = (await pool.request().query(`
SELECT OBJECT_NAME(p.object_id) AS ProcName, p.name AS ParameterName,
       TYPE_NAME(p.user_type_id) AS DataType, p.max_length AS MaxLength, p.is_output AS IsOutput
FROM sys.parameters p
WHERE OBJECT_NAME(p.object_id) IN ('API_DonHangChiTiet_Insert_AI', 'API_HangHoaList_AI')
ORDER BY ProcName, p.parameter_id;`)).recordset;

    let evidence = null;
    if (documentId) {
      const request = pool.request();
      request.input('DocumentID', sql.VarChar(50), documentId);
      evidence = (await request.query(`
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.AR_OrderTbl H WITH (NOLOCK) WHERE H.DocumentID = @DocumentID) AS HeaderCount,
  (SELECT COUNT_BIG(*) FROM dbo.AR_OrderDetailTbl D WITH (NOLOCK) WHERE D.DocumentID = @DocumentID) AS DetailCount,
  (SELECT COUNT_BIG(*) FROM (
     SELECT D.ItemID, D.UnitPrice, D.Quantity, D.DiscountPercent, COUNT_BIG(*) AS Cnt
     FROM dbo.AR_OrderDetailTbl D WITH (NOLOCK)
     WHERE D.DocumentID = @DocumentID
     GROUP BY D.ItemID, D.UnitPrice, D.Quantity, D.DiscountPercent
     HAVING COUNT_BIG(*) > 1
   ) X) AS DuplicateDetailGroups,
  (SELECT CAST(COALESCE(SUM(D.TotalAmount), 0) AS DECIMAL(18,2))
   FROM dbo.AR_OrderDetailTbl D WITH (NOLOCK) WHERE D.DocumentID = @DocumentID) AS DetailTotal,
  (SELECT TOP 1 CAST(COALESCE(H.BaseTotal, 0) AS DECIMAL(18,2))
   FROM dbo.AR_OrderTbl H WITH (NOLOCK) WHERE H.DocumentID = @DocumentID) AS HeaderTotal;`)).recordset[0];
    }

    const source = fs.readFileSync(path.join(ROOT, 'src', 'js', 'pages', 'create-order.js'), 'utf8');
    const http = fs.readFileSync(path.join(ROOT, 'src', 'js', 'services', 'http.js'), 'utf8');
    const envSource = fs.readFileSync(path.join(ROOT, 'env.js'), 'utf8');
    const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const chatSource = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');
    const editSource = fs.readFileSync(path.join(ROOT, 'src', 'js', 'pages', 'edit-order.js'), 'utf8');
    const orderParameters = parameters.filter((row) => row.ProcName === 'API_DonHangChiTiet_Insert_AI')
      .map((row) => row.ParameterName);
    const checks = [
      check('DB_IS_MEDTEST', dbName === 'medtest', dbName),
      check('AI_ORDER_PROC_EXISTS', Boolean(aiProc), 'dbo.API_DonHangChiTiet_Insert_AI'),
      check('AI_PRODUCT_PROC_EXISTS', Boolean(productProc), 'dbo.API_HangHoaList_AI'),
      check('FRONTEND_ORDER_ENDPOINT', /CREATE:\s*['"]\/api\/API_DonHangChiTiet_Insert_AI['"]/.test(envSource), '/api/API_DonHangChiTiet_Insert_AI'),
      check('FRONTEND_PRODUCT_ENDPOINT', /PRODUCTS:\s*['"]\/api\/API_HangHoaList_AI['"]/.test(envSource), '/api/API_HangHoaList_AI'),
      check('FRONTEND_QUANTITY_POSITIVE_INTEGER', source.includes('Number.isInteger(qty)') && source.includes('qty <= 0'), 'SL nguyên > 0'),
      // [Sửa 31/07/2026] Phép kiểm cũ dò chuỗi 'qty > stock' — chuỗi đó KHÔNG còn
      // tồn tại trong mã (kiểm cả bản HEAD: 0 lần xuất hiện), nên nó luôn báo FAIL
      // dù chức năng vẫn đúng. Mã thật còn chặt hơn: 'qty + giftQty > stock', tức
      // cộng cả hàng tặng vào khi đối chiếu tồn, vì hàng tặng cũng trừ kho.
      check('FRONTEND_STOCK_GUARD', /qty\s*\+\s*giftQty\s*>\s*stock/.test(source) && source.includes('vượt tồn'), 'không cho tổng bán + tặng vượt tồn hiển thị'),
      check('FRONTEND_PRICE_READONLY', /id:\s*'price_'[^\n]+readonly:\s*true/.test(source), 'giá readonly'),
      check('FRONTEND_IDEMPOTENCY_HEADER', source.includes('getOrderSubmitKey(data.payload)') && http.includes("'Idempotency-Key'"), 'key ổn định khi retry cùng payload'),
      check('FRONTEND_SQL_GENERATED_DOCUMENT_ID', /var\s+docId\s*=\s*v\.orderId\s*\|\|\s*['"]AUTO_GEN['"]/.test(source), 'mã trống được giao cho SQL sinh'),
      check('FRONTEND_NO_BUSINESS_ID_GENERATOR', !source.includes('UATORD-') && !source.includes('function genUUID()'), 'frontend không tự sinh mã đơn'),
      check('FRONTEND_GIFT_IN_SO_LUONG_TANG', source.includes('SoLuongTang: p.giftQty || 0') && chatSource.includes('SoLuongTang: promotion.giftQuantity'), 'hàng tặng nằm trên dòng bán'),
      check('CHAT_NO_ZERO_PRICE_GIFT_LINE', !/LineType:\s*['"]promotion['"]/.test(chatSource), 'chat không tạo dòng tặng giá 0 riêng'),
      check('GATEWAY_VERIFIES_ORDER_IDENTITY', serverSource.includes('resolveVerifiedGatewayIdentity(authorization)') && serverSource.includes("'/api/API_DonHangChiTiet_Insert_AI'") && serverSource.includes("identityField: 'Username'") && serverSource.includes('body[mutationPolicy.identityField] = verifiedIdentity.username'), 'ORDER_MUTATION_AUTHORIZATION_V1: identity đã xác minh được ghi đè vào Username'),
      check('ORDER_SQL_ENFORCES_EXISTING_SCOPE', /AR_GetObjectByUserFnc/i.test(aiProc) && /AI_WarehouseByUserFnc/i.test(aiProc) && /BranchID/i.test(aiProc), 'SQL kiểm tra phạm vi khách, chi nhánh và kho hiện hữu'),
      check('PRODUCT_LOOKUP_USES_METADATA_CATALOG', source.includes('searchProductCatalog(keyword)') && source.includes('API_CONFIG.ENDPOINTS.AI.CATALOG') && source.includes("Type: 'sanpham'") && chatSource.includes('searchProducts(keyword)') && editSource.includes('searchProducts(keyword)'), 'ba picker lập/sửa đơn và chat tìm mã/tên qua metadata; không tải catalog giá/tồn'),
      check('PRODUCT_CONTEXT_LOADS_SELECTED_ITEM_ONLY', source.includes('loadProductDetail(itemId)') && source.includes('ItemID: itemId') && chatSource.includes('loadProductDetail(itemId)') && editSource.includes('loadProductDetail(itemId)'), 'ba picker chỉ tải giá/tồn/kho/CTBH theo ItemID đã chọn'),
      check('SERVER_MUTATION_CONTEXT_PARAMETERS', ['@DocumentDate', '@BranchID', '@IdempotencyKey', '@RequestID'].every((name) => orderParameters.includes(name)), orderParameters.join(', ')),
      check('SERVER_TRANSACTION_EVIDENCE', /BEGIN\s+TRAN/i.test(aiProc), 'transaction trong AI order procedure'),
      check('SERVER_DUPLICATE_GUARD_EVIDENCE', /AI_API_MutationIdempotency/i.test(aiProc) && /RequestFingerprintHash/i.test(aiProc) && /UPDLOCK|HOLDLOCK/i.test(aiProc), 'idempotency key + fingerprint khóa trong transaction'),
      check('SERVER_RESULT_CACHE_EVIDENCE', /ResultEntityID/i.test(aiProc) && /IsReplay/i.test(aiProc), 'retry trả mã đơn đã cache'),
      check('SERVER_MANDATORY_AUDIT', /AUDIT_UNAVAILABLE/i.test(aiProc) && /CREATE_DONHANG/i.test(aiProc) && /REPLAY_DONHANG/i.test(aiProc) && !/IF\s+OBJECT_ID\('dbo\.AI_WriteAuditLog',[\s\S]{0,80}EXEC\s+dbo\.AI_WriteAuditLog/i.test(aiProc), 'audit create/replay fail-closed'),
      check('SERVER_STOCK_GUARD_EVIDENCE', /IV_StockTransactionTbl/i.test(aiProc) && /ReservedQuantity/i.test(aiProc) && /StoreHouseID/i.test(aiProc), 'tồn khả dụng và kho cụ thể phía server'),
      check('SERVER_PRICE_GUARD_EVIDENCE', /AR_LayGiaSanPhamFnc/i.test(aiProc) && /UnitPrice/i.test(aiProc), 'đối chiếu giá nguồn ERP phía server'),
      check('SERVER_PROMOTION_GUARD_EVIDENCE', /ExpectedGiftQuantity/i.test(aiProc) && /ExpectedDiscountPercent/i.test(aiProc), 'đối chiếu SoLuongTang/chiết khấu phía server'),
      check('PRODUCT_SELECTED_STORE_EVIDENCE', /AI_StockAvailableByUserFnc/i.test(productProc) && /AvailableStock/i.test(productProc) && /StoreHouseID/i.test(productProc), 'catalog dùng contract STOCK-001: AvailableStock tại một kho được cấp quyền'),
      check('LEGACY_PROCS_UNTOUCHED_BY_AI_SOURCES', !/CREATE\s+OR\s+ALTER\s+PROCEDURE\s+dbo\.API_DonHang_Insert\b/i.test(aiProc + productProc) && !/CREATE\s+OR\s+ALTER\s+PROCEDURE\s+dbo\.API_HangHoaList\b/i.test(aiProc + productProc), 'không sửa procedure gốc'),
    ];

    if (documentId) {
      checks.push(check('EVIDENCE_ONE_HEADER', Number(evidence.HeaderCount) === 1, `DocumentID=${documentId}; count=${evidence.HeaderCount}`));
      checks.push(check('EVIDENCE_HAS_DETAILS', Number(evidence.DetailCount) > 0, `detail=${evidence.DetailCount}`));
      checks.push(check('EVIDENCE_NO_DUPLICATE_DETAILS', Number(evidence.DuplicateDetailGroups) === 0, `duplicateGroups=${evidence.DuplicateDetailGroups}`));
      checks.push(check('EVIDENCE_TOTAL_MATCH', Number(evidence.HeaderTotal) === Number(evidence.DetailTotal), `header=${evidence.HeaderTotal}; detail=${evidence.DetailTotal}`));
    }

    const contractChecks = checks.filter((item) => !item.Check.startsWith('EVIDENCE_'));
    const evidenceChecks = checks.filter((item) => item.Check.startsWith('EVIDENCE_'));
    const result = {
      GeneratedAt: new Date().toISOString(),
      Mode: 'READ_ONLY',
      Database: dbName,
      DocumentID: documentId || null,
      Status: contractChecks.every((item) => item.Status === 'PASS')
        ? (documentId && evidenceChecks.every((item) => item.Status === 'PASS') ? 'PASS' : 'READY_FOR_CONTROLLED_MUTATION')
        : 'BLOCKED_CONTRACT_REVIEW',
      Checks: checks,
      ProcedureParameters: parameters,
      Evidence: evidence,
      MutationExecuted: false,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.Status !== 'PASS' && result.Status !== 'READY_FOR_CONTROLLED_MUTATION') process.exitCode = 2;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'ERROR', Error: error.message, MutationExecuted: false }, null, 2));
  process.exitCode = 1;
});
