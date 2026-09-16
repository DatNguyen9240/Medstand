'use strict';

/*
 * CORE-005 controlled mutation test. The candidate order, audit and idempotency
 * rows live inside one outer transaction and are always rolled back.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');
const promotion = require('../src/js/utils/promotion.js');

const ROOT = path.resolve(__dirname, '..');
const USE_DEPLOYED_RUNTIME = process.argv.includes('--runtime');
const USE_DEMO_ACTOR = process.argv.includes('--demo');
const SQL_FILES = [
  'sql/Migrate_API_Mutation_Idempotency_AI.sql',
  'sql/Migrate_Demo_Order_Actor_AI.sql',
  'sql/Module common - API_HangHoaList_AI.sql',
  'sql/Module common - API_DonHangChiTiet_Insert_AI.sql',
];

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

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

function resultRecord(result) {
  const sets = result && result.recordsets || [];
  for (let index = sets.length - 1; index >= 0; index -= 1) {
    if (sets[index] && sets[index][0] && Object.prototype.hasOwnProperty.call(sets[index][0], 'MsgType')) {
      return sets[index][0];
    }
  }
  return null;
}

async function executeOrder(transaction, payload) {
  const request = new sql.Request(transaction);
  request.input('Username', sql.VarChar(50), payload.Username);
  request.input('DocumentID', sql.VarChar(50), payload.DocumentID);
  request.input('DocumentDate', sql.DateTime, payload.DocumentDate);
  request.input('BranchID', sql.VarChar(50), payload.BranchID);
  request.input('ObjectID', sql.VarChar(50), payload.ObjectID);
  request.input('Memo', sql.NVarChar(200), payload.Memo);
  request.input('Notes', sql.NVarChar(sql.MAX), payload.Notes);
  request.input('XaPhuong', sql.NVarChar(50), payload.XaPhuong);
  request.input('ThuDiTuyen', sql.NVarChar(10), payload.ThuDiTuyen);
  request.input('ItemList', sql.NVarChar(sql.MAX), payload.ItemList);
  request.input('IdempotencyKey', sql.VarChar(128), payload.IdempotencyKey);
  request.input('RequestID', sql.VarChar(100), payload.RequestID);
  return resultRecord(await request.execute('dbo.API_DonHangChiTiet_Insert_AI'));
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình: ${missing.join(', ')}`);

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

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS DbName')).recordset[0].DbName;
    if (dbName !== 'medtest') throw new Error(`Test chỉ được chạy trên medtest; hiện tại là ${dbName}`);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    if (!USE_DEPLOYED_RUNTIME) {
      for (const relativePath of SQL_FILES) {
        const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
        for (const batch of batches(source)) await new sql.Request(transaction).batch(batch);
      }
    }

    const userRequest = new sql.Request(transaction);
    userRequest.input('UseDemoActor', sql.Bit, USE_DEMO_ACTOR);
    const users = (await userRequest.query(`
SELECT TOP (40) UserName, BranchID
FROM dbo.SY_User
WHERE COALESCE(Disable, 0) = 0
  AND COALESCE(BranchID, '') <> ''
  AND (COALESCE(EmployeeID, '') <> '' OR (@UseDemoActor = 1 AND LOWER(UserName) = 'demo'))
ORDER BY CASE WHEN @UseDemoActor = 1 AND LOWER(UserName) = 'demo' THEN 0
              WHEN UserName = 'QLBH013.MED' THEN 1 ELSE 2 END,
         UserName;`)).recordset;

    let candidate = null;
    for (const user of users) {
      const customerRequest = new sql.Request(transaction);
      customerRequest.input('Username', sql.VarChar(50), user.UserName);
      const customers = (await customerRequest.query(`
SELECT TOP (5) F.ObjectID, O.XaPhuong
FROM dbo.AR_GetObjectByUserFnc(@Username) F
JOIN dbo.CF_ObjectTbl O ON O.ObjectID = F.ObjectID
WHERE COALESCE(O.Phone, '') <> ''
ORDER BY F.ObjectID;`)).recordset;

      for (const customer of customers) {
        const productRequest = new sql.Request(transaction);
        productRequest.input('Username', sql.VarChar(50), user.UserName);
        productRequest.input('ObjectID', sql.VarChar(50), customer.ObjectID);
        productRequest.input('ItemID', sql.VarChar(50), '');
        productRequest.input('SearchText', sql.NVarChar(50), '');
        productRequest.input('SeachText', sql.NVarChar(50), '');
        productRequest.input('DocumentDate', sql.DateTime, new Date());
        const productResult = await productRequest.execute('dbo.API_HangHoaList_AI');
        const products = productResult.recordset || [];
        const giftCandidate = products.map((row) => {
          const rule = promotion.parse(row.GhiChu || '');
          const tier = rule.buyTiers.slice().sort((a, b) => a.minimumQuantity - b.minimumQuantity)[0];
          if (!tier) return null;
          const promo = promotion.calculate(rule, tier.minimumQuantity);
          return { row, quantity: tier.minimumQuantity, promo };
        }).find((entry) => entry && Number(entry.row.UnitPrice) > 0 && entry.row.StoreHouseID
          && Number(entry.row.QuantityinStock) >= entry.quantity + entry.promo.giftQuantity);
        const fallback = products.find((row) => Number(row.UnitPrice) > 0 && Number(row.QuantityinStock) >= 1 && row.StoreHouseID);
        const item = giftCandidate ? giftCandidate.row : fallback;
        if (item) {
          candidate = {
            user,
            customer,
            item,
            quantity: giftCandidate ? giftCandidate.quantity : 1,
            promo: giftCandidate ? giftCandidate.promo : promotion.calculate(item.GhiChu || '', 1),
          };
          break;
        }
      }
      if (candidate) break;
    }
    if (!candidate) throw new Error('Không tìm thấy bộ user/customer/item có giá và tồn trong quyền để chạy test rollback.');

    const quantity = candidate.quantity;
    const promo = candidate.promo;
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const idempotencyKey = `core005-${suffix}`;
    const documentDate = new Date();
    const itemList = JSON.stringify([{
      ItemID: candidate.item.ItemID,
      Quantity: quantity,
      SoLuongTang: promo.giftQuantity,
      UnitPrice: Number(candidate.item.UnitPrice),
      DiscountPercent: promo.discountPercent,
    }]);
    const basePayload = {
      Username: candidate.user.UserName,
      DocumentID: 'AUTO_GEN',
      DocumentDate: documentDate,
      BranchID: candidate.user.BranchID,
      ObjectID: candidate.customer.ObjectID,
      Memo: `CORE005 rollback ${suffix}`,
      Notes: 'controlled mutation; outer transaction rollback',
      XaPhuong: candidate.customer.XaPhuong || '',
      ThuDiTuyen: '',
      ItemList: itemList,
      IdempotencyKey: idempotencyKey,
      RequestID: `req-core005-a-${suffix}`,
    };

    const first = await executeOrder(transaction, basePayload);
    if (!first || Number(first.MsgType) !== 5 || !first.DocumentID || Number(first.IsReplay) !== 0) {
      throw new Error(`Lần tạo đầu không thành công: ${JSON.stringify(first)}`);
    }

    const replay = await executeOrder(transaction, { ...basePayload, RequestID: `req-core005-b-${suffix}` });
    if (!replay || Number(replay.MsgType) !== 5 || replay.DocumentID !== first.DocumentID || Number(replay.IsReplay) !== 1) {
      throw new Error(`Replay không trả cùng mã đơn: ${JSON.stringify(replay)}`);
    }

    const conflict = await executeOrder(transaction, {
      ...basePayload,
      Memo: `${basePayload.Memo} changed`,
      RequestID: `req-core005-c-${suffix}`,
    });
    if (!conflict || Number(conflict.MsgType) !== 1 || conflict.Code !== 'IDEMPOTENCY_CONFLICT') {
      throw new Error(`Cùng key/payload khác chưa bị từ chối: ${JSON.stringify(conflict)}`);
    }

    const verifyRequest = new sql.Request(transaction);
    verifyRequest.input('DocumentID', sql.VarChar(50), first.DocumentID);
    const evidence = (await verifyRequest.query(`
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID) AS HeaderCount,
  (SELECT COUNT_BIG(*) FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID) AS DetailCount,
  (SELECT TOP (1) SoLuongTang FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID) AS GiftQuantity,
  (SELECT TOP (1) StoreHouseID FROM dbo.AR_OrderDetailTbl WHERE DocumentID = @DocumentID) AS StoreHouseID,
  (SELECT TOP (1) EmployeeID FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID) AS EmployeeID,
  (SELECT TOP (1) UserCreate FROM dbo.AR_OrderTbl WHERE DocumentID = @DocumentID) AS UserCreate;`)).recordset[0];

    if (Number(evidence.HeaderCount) !== 1 || Number(evidence.DetailCount) !== 1
        || Number(evidence.GiftQuantity) !== Number(promo.giftQuantity)
        || !evidence.StoreHouseID) {
      throw new Error(`Bằng chứng DB không đúng: ${JSON.stringify(evidence)}`);
    }
    if (USE_DEMO_ACTOR && (String(candidate.user.UserName).toLowerCase() !== 'demo'
        || evidence.EmployeeID !== 'DEMO' || String(evidence.UserCreate).toLowerCase() !== 'demo')) {
      throw new Error(`Demo actor không được map đúng: ${JSON.stringify(evidence)}`);
    }

    await transaction.rollback();
    began = false;
    process.stdout.write(`${JSON.stringify({
      Status: 'PASS',
      Database: dbName,
      Mode: USE_DEPLOYED_RUNTIME ? 'DEPLOYED_RUNTIME_MUTATION_ROLLBACK' : 'CONTROLLED_MUTATION_ROLLBACK',
      Candidate: {
        Username: candidate.user.UserName,
        ObjectID: candidate.customer.ObjectID,
        ItemID: candidate.item.ItemID,
        StoreHouseID: candidate.item.StoreHouseID,
        Quantity: quantity,
        GiftQuantity: promo.giftQuantity,
        DiscountPercent: promo.discountPercent,
      },
      First: first,
      Replay: replay,
      Conflict: conflict,
      Evidence: evidence,
      PersistedChanges: false,
    }, null, 2)}\n`);
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction may already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', PersistedChanges: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
