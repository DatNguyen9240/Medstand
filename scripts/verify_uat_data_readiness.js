'use strict';

/* CUSTOMER-UAT-001 — kiểm chứng chính công cụ chẩn đoán.

     node scripts/verify_uat_data_readiness.js

   Vì sao cần: bốn lỗi dưới đây từng có thật trong uat_data_readiness.js và đều SAI IM LẶNG —
   script vẫn chạy, vẫn in JSON đẹp, chỉ có nội dung là sai:

     1. CTBH note-text bị xếp thành "không có CTBH" (mâu thuẫn với chính lớp CATALOG_API).
     2. Trạng thái "PASS" trần, nuốt mất WARN và mất luôn việc manifest thiếu nguồn gốc.
     3. Giá thiếu tie-break UserAutoID → B037 ra 79.000 trong khi UI và cổng tạo đơn là 105.000.
     4. Tài khoản thiếu quyền kho bị đổ oan là "nhóm hàng không được bán".

   Bộ này chạy công cụ thật trên medtest rồi soi kết quả. Không mock, không seed.

   VỀ FIXTURE: các mã B037/A008/A003/B043 nằm trong script kiểm thử (zone TEST của
   scan_fixture_hardcode.js) nên hợp lệ. Chúng là dữ liệu ERP thật và CÓ THỂ đổi, nên mỗi ca
   đều tự kiểm tiền đề trước; tiền đề mất thì báo SKIPPED kèm lý do, không báo PASS giả. */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const MedstandPromotion = require('../src/js/utils/promotion');

const root = path.resolve(__dirname, '..');
const TOOL = path.join(root, 'scripts', 'uat_data_readiness.js');

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

/* Chạy công cụ, trả cả manifest lẫn exit code. Exit code khác 0 là kết quả hợp lệ
   (1 = READINESS_FAIL, 3 = EVIDENCE_INCOMPLETE), không phải lỗi hạ tầng. */
function runTool(args) {
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync(process.execPath, [TOOL].concat(args), {
      cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    if (error.stdout === undefined) throw error;
    stdout = error.stdout;
    code = typeof error.status === 'number' ? error.status : -1;
  }
  return { manifest: JSON.parse(stdout), exitCode: code };
}

function layerOf(manifest, name) {
  return manifest.Layers.find((l) => l.Layer === name) || null;
}

const results = [];
function record(name, status, detail) {
  results.push({ Case: name, Status: status, Detail: detail });
}
function check(name, condition, detail) {
  record(name, condition ? 'PASS' : 'FAIL', detail);
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

    /* ================= 1. HỒI QUY GIÁ — tie-break UserAutoID ================= */
    /* Tiền đề: phải còn ít nhất một sản phẩm có >= 2 bảng giá chung cùng hiệu lực mà KHÁC GIÁ.
       Không còn thì ca này mất ý nghĩa, báo SKIPPED chứ không báo PASS. */
    const tieItems = (await pool.request().query(`
      WITH Eff AS (
        SELECT Y.ItemID, Y.UnitPrice, Y.UserAutoID
        FROM dbo.AR_PriceTbl X
        JOIN dbo.AR_PriceDetailTbl Y ON Y.DocumentID = X.DocumentID
        WHERE COALESCE(X.isObjectPrice, 0) = 0 AND COALESCE(X.isDisable, 0) = 0
          AND COALESCE(X.FromDate, '20000101') <= CAST(GETDATE() AS DATE)
          AND COALESCE(X.ToDate, '20990101') >= CAST(GETDATE() AS DATE))
      SELECT TOP (1) ItemID FROM Eff
      GROUP BY ItemID HAVING COUNT(DISTINCT UnitPrice) > 1
      ORDER BY ItemID;`)).recordset;

    if (!tieItems.length) {
      record('PRICE_TIEBREAK_MATCHES_CATALOG', 'SKIPPED',
        'medtest không còn sản phẩm nào có 2 bảng giá chung cùng hiệu lực khác giá — mất tiền đề.');
    } else {
      const item = tieItems[0].ItemID;
      const { manifest } = runTool(['--user=demo', '--customer=DL011', `--item=${item}`]);
      const price = layerOf(manifest, 'PRICE');
      const src = price && price.Evidence && price.Evidence.PriceSources;
      check('PRICE_TIEBREAK_MATCHES_CATALOG',
        Boolean(src) && src.DiagnosticTierPick === src.CatalogShown && src.CatalogShown === src.OrderGate,
        { Item: item, PriceCode: price && price.Code, Sources: src,
          Note: 'Giá chẩn đoán phải bằng giá danh mục và bằng giá cổng tạo đơn.' });
    }

    /* ================= 2. CTBH ba nhánh ================= */
    /* Nhánh 1: PROMOTION_NOTE_TEXT_ONLY (A008: có ghi chú ưu đãi và KHÔNG có rule cấu hình đã duyệt). */
    const a008 = (await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.AI_ActivePromotionByUserFnc('demo', 'A008', SYSUTCDATETIME())) AS ConfigRules,
        (SELECT TOP (1) COALESCE(GhiChu, '') FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), 'DL011', 'A008')) AS NoteText;
    `)).recordset[0];

    if (a008.ConfigRules > 0 || !String(a008.NoteText || '').trim()) {
      record('PROMOTION_NOTE_TEXT_DETECTED', 'SKIPPED',
        { Reason: 'A008 không còn là ca "chỉ có CTBH note-text".', ConfigRules: a008.ConfigRules, NoteText: a008.NoteText });
    } else {
      const { manifest } = runTool(['--user=demo', '--customer=DL011', '--item=A008']);
      const promo = layerOf(manifest, 'PROMOTION');
      check('PROMOTION_NOTE_TEXT_DETECTED', Boolean(promo) && promo.Code === 'PROMOTION_NOTE_TEXT_ONLY',
        { Code: promo && promo.Code, NoteText: promo && promo.Evidence && promo.Evidence.NoteText,
          Note: 'Có ghi chú ưu đãi mà báo NO_PROMOTION là tự mâu thuẫn với lớp CATALOG_API.' });

      /* Ghi chú A008 có vế KHHĐ. Parser production phải cắt vế đó, nếu không mốc 30+8
         tràn sang luật chung. Dùng chung parser nên ca này canh luôn cả frontend. */
      const rule = promo && promo.Evidence && promo.Evidence.ParsedRule;
      check('PROMOTION_NOTE_KHHD_SPLIT_APPLIED',
        Boolean(rule) && rule.buyTiers.length === 1 && rule.buyTiers[0].minimumQuantity === 10,
        { ParsedTiers: rule && rule.buyTiers, Note: 'Chỉ vế trước KHHĐ mới áp cho khách thường.' });
    }

    /* Nhánh 2: PROMOTION_CONFIG_AVAILABLE (sản phẩm có CTBH cấu hình đã duyệt trong AI_PromotionProgramTbl). */
    const configItemRow = (await pool.request().query(`
      SELECT TOP (1) I.ItemID
      FROM dbo.AI_PromotionItemRuleTbl I
      JOIN dbo.AI_PromotionProgramTbl P ON P.PromotionProgramID = I.PromotionProgramID
      WHERE P.Status = 'APPROVED'
        AND (P.EffectiveFrom IS NULL OR P.EffectiveFrom <= SYSUTCDATETIME())
        AND (P.EffectiveTo IS NULL OR P.EffectiveTo > SYSUTCDATETIME());
    `)).recordset;

    if (!configItemRow.length) {
      record('PROMOTION_CONFIG_AVAILABLE_DETECTED', 'SKIPPED',
        'medtest chưa có CTBH cấu hình nào đang APPROVED và còn hiệu lực để dựng ca.');
    } else {
      const cfgItem = configItemRow[0].ItemID;
      const { manifest } = runTool(['--user=demo', '--customer=DL011', `--item=${cfgItem}`]);
      const promo = layerOf(manifest, 'PROMOTION');
      check('PROMOTION_CONFIG_AVAILABLE_DETECTED',
        Boolean(promo) && promo.Code === 'PROMOTION_CONFIG_AVAILABLE',
        { Item: cfgItem, Code: promo && promo.Code,
          Note: 'Sản phẩm có CTBH cấu hình đã duyệt phải trả PROMOTION_CONFIG_AVAILABLE.' });
    }

    /* Nhánh 3: NO_PROMOTION (sản phẩm có bảng giá hợp lệ nhưng không có CTBH ở cả hai nguồn). */
    const allPriceItems = (await pool.request().query(`
      SELECT DISTINCT D.ItemID, G.UnitPrice, G.GhiChu
      FROM (SELECT DISTINCT ItemID FROM dbo.AR_PriceDetailTbl WHERE UnitPrice > 0) D
      CROSS APPLY dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), 'DL011', D.ItemID) G
      WHERE G.UnitPrice > 0
        AND NOT EXISTS (SELECT 1 FROM dbo.AI_ActivePromotionByUserFnc('demo', D.ItemID, SYSUTCDATETIME()))
      ORDER BY D.ItemID;
    `)).recordset;

    let npItem = null;
    for (const it of allPriceItems) {
      const text = String(it.GhiChu || '').trim();
      const parsed = text ? MedstandPromotion.parse(text) : null;
      const isPromo = Boolean(parsed && (parsed.buyTiers.length > 0 || parsed.belowMinimumDiscountPercent !== null || parsed.pricingMode === 'full_price'));
      if (!isPromo) {
        npItem = it.ItemID;
        break;
      }
    }

    if (!npItem) {
      record('PROMOTION_NONE_DETECTED', 'SKIPPED',
        'medtest không còn sản phẩm nào có giá hợp lệ mà không có CTBH để dựng ca.');
    } else {
      const { manifest } = runTool(['--user=demo', '--customer=DL011', `--item=${npItem}`]);
      const promo = layerOf(manifest, 'PROMOTION');
      check('PROMOTION_NONE_DETECTED',
        Boolean(promo) && promo.Code === 'NO_PROMOTION',
        { Item: npItem, Code: promo && promo.Code,
          Note: 'Sản phẩm không có CTBH ở cả hai nguồn phải trả NO_PROMOTION (vẫn lập đơn bình thường).' });
    }

    /* ================= 3. Trạng thái PASS/WARN/EVIDENCE ================= */
    const bare = runTool(['--user=demo', '--customer=DL011', '--item=A008']);
    check('STATUS_EVIDENCE_INCOMPLETE_WITHOUT_TESTER_FIELDS',
      bare.manifest.Status === 'EVIDENCE_INCOMPLETE' && bare.exitCode === 3,
      { Status: bare.manifest.Status, ExitCode: bare.exitCode, Missing: bare.manifest.MissingTesterFields });

    /* Khai tester fields không hợp lệ (data-source=ABC, cleanup-plan=XYZ, created-by=x) phải bị chặn. */
    const invalidTester = runTool(['--user=demo', '--customer=DL011', '--item=A008',
      '--created-by=x', '--data-source=ABC', '--cleanup-plan=XYZ']);
    check('STATUS_EVIDENCE_INCOMPLETE_ON_INVALID_TESTER_FIELDS',
      invalidTester.manifest.Status === 'EVIDENCE_INCOMPLETE' && invalidTester.exitCode === 3,
      { Status: invalidTester.manifest.Status, ExitCode: invalidTester.exitCode, Missing: invalidTester.manifest.MissingTesterFields,
        Note: 'Giá trị tester fields không hợp lệ (ABC, XYZ, x) phải bị từ chối với EVIDENCE_INCOMPLETE.' });

    const filled = runTool(['--user=demo', '--customer=DL011', '--item=A008',
      '--created-by=verify-script', '--data-source=BACK_OFFICE', '--cleanup-plan=KEEP']);
    check('STATUS_WARNINGS_NOT_SWALLOWED',
      filled.manifest.Status === 'READINESS_PASS_WITH_WARNINGS'
      && filled.manifest.Warnings.indexOf('ACCOUNT_EMPLOYEE_FROM_CONFIG') !== -1,
      { Status: filled.manifest.Status, Warnings: filled.manifest.Warnings,
        Note: 'demo mượn cấu hình actor, không được lặng lẽ thành PASS.' });

    check('STATUS_NEVER_CLAIMS_E2E_OR_BARE_PASS',
      ['PASS', 'E2E_PASS'].indexOf(bare.manifest.Status) === -1
      && ['PASS', 'E2E_PASS'].indexOf(filled.manifest.Status) === -1,
      { Statuses: [bare.manifest.Status, filled.manifest.Status],
        Note: 'Script không lập đơn nên không được phát ra E2E_PASS.' });

    /* ================= 4. Không đổ oan nguyên nhân ================= */
    /* Tài khoản thiếu quyền kho: lớp PRODUCT phải im lặng, không kết luận nhóm hàng. */
    const noWarehouse = (await pool.request().query(`
      SELECT TOP (1) U.UserName FROM dbo.SY_User U
      WHERE COALESCE(U.Disable, 0) = 0 AND COALESCE(U.BranchID, '') <> '' AND COALESCE(U.EmployeeID, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()))
      ORDER BY U.UserName;`)).recordset;

    if (!noWarehouse.length) {
      record('NO_FALSE_ITEM_GROUP_BLAME', 'SKIPPED', 'Không còn tài khoản nào thiếu quyền kho để dựng ca.');
    } else {
      const user = noWarehouse[0].UserName;
      const { manifest } = runTool([`--user=${user}`, '--customer=DL011', '--item=A008']);
      const product = layerOf(manifest, 'PRODUCT');
      const stock = layerOf(manifest, 'STOCK');
      check('NO_FALSE_ITEM_GROUP_BLAME',
        Boolean(product) && product.Code !== 'ITEM_GROUP_NOT_SELLABLE'
        && manifest.BlockingCodes.indexOf('WAREHOUSE_SCOPE_REQUIRED') !== -1
        && Boolean(stock) && stock.Code === 'STOCK_BLOCKED_BY_WAREHOUSE_SCOPE',
        { User: user, ProductCode: product && product.Code, StockCode: stock && stock.Code,
          Blocking: manifest.BlockingCodes, RuleVersionSource: manifest.StockRuleVersionSource,
          Note: 'Nguyên nhân thật là quyền kho; sản phẩm A008 hoàn toàn bình thường.' });
    }

    /* ================= 5. Các nguyên nhân phải phân biệt được ================= */
    const distinctCases = [
      { name: 'CAUSE_PRICE_NOT_FOUND', args: ['--item=B043'], expect: 'PRICE_NOT_FOUND' },
      { name: 'CAUSE_ITEM_GROUP_NOT_SELLABLE', args: ['--item=A003'], expect: 'ITEM_GROUP_NOT_SELLABLE' },
      { name: 'CAUSE_ITEM_NOT_FOUND', args: ['--item=ZZZ999'], expect: 'ITEM_NOT_FOUND' },
      { name: 'CAUSE_CUSTOMER_NOT_FOUND', args: ['--item=A008'], customer: 'KHONGCO999', expect: 'CUSTOMER_NOT_FOUND' },
    ];
    for (const c of distinctCases) {
      const { manifest } = runTool(['--user=demo', `--customer=${c.customer || 'DL011'}`].concat(c.args));
      check(c.name, manifest.BlockingCodes.indexOf(c.expect) !== -1,
        { Expected: c.expect, Got: manifest.BlockingCodes, Status: manifest.Status });
    }

    /* ================= 6. Actor config phải khớp điều kiện của proc ================= */
    /* Proc chỉ dùng BR-ORDER-ACTOR-001 khi EmployeeID rỗng VÀ Manager = 1 VÀ nhóm global. */
    const actorRows = (await pool.request().query(`
      SELECT C.ConfigKey, COALESCE(U.EmployeeID, '') AS EmployeeID, COALESCE(U.Manager, 0) AS Manager,
             COALESCE(U.UserGroupID, '') AS UserGroupID
      FROM dbo.AI_BusinessRuleConfigTbl C
      LEFT JOIN dbo.SY_User U ON U.UserName = C.ConfigKey
      WHERE C.RuleCode = 'BR-ORDER-ACTOR-001' AND C.Status = 'APPROVED';`)).recordset;
    const unusable = actorRows.filter((r) => r.EmployeeID === ''
      && !(Number(r.Manager) === 1 && ['Admin', 'SADM', 'BGD', 'GD'].indexOf(r.UserGroupID) !== -1));

    if (!unusable.length) {
      record('ACTOR_CONFIG_REQUIRES_MANAGER_AND_GLOBAL', 'SKIPPED',
        { Reason: 'medtest chưa có tài khoản nào vừa có cấu hình actor vừa KHÔNG phải manager global, '
            + 'nên nhánh này chưa dựng được ca thật. Kiểm bằng mắt tại uat_data_readiness.js (nhánh actorUsable).',
          ActorConfigRows: actorRows });
    } else {
      const { manifest } = runTool([`--user=${unusable[0].ConfigKey}`, '--customer=DL011', '--item=A008']);
      check('ACTOR_CONFIG_REQUIRES_MANAGER_AND_GLOBAL',
        manifest.BlockingCodes.indexOf('USER_SCOPE_INCOMPLETE') !== -1,
        { User: unusable[0], Blocking: manifest.BlockingCodes });
    }

    const failed = results.filter((r) => r.Status === 'FAIL');
    const skipped = results.filter((r) => r.Status === 'SKIPPED');
    console.log(JSON.stringify({
      Task: 'CUSTOMER-UAT-001-VERIFY-READINESS-TOOL',
      Status: failed.length ? 'FAIL' : 'PASS',
      Summary: `${results.filter((r) => r.Status === 'PASS').length} PASS / ${failed.length} FAIL / ${skipped.length} SKIPPED`,
      Cases: results,
      Note: skipped.length
        ? 'Có ca SKIPPED vì mất tiền đề dữ liệu — đọc lý do, đừng coi là đã kiểm.'
        : 'Tất cả ca đều chạy được trên dữ liệu thật.',
    }, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-UAT-001-VERIFY-READINESS-TOOL', Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 2;
});
