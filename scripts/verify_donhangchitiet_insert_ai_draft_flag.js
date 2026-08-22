'use strict';

/* ORDER-APPROVAL-002 (điểm 1) — kiểm chứng cờ @SaveAsDraft mới thêm vào
   dbo.API_DonHangChiTiet_Insert_AI. Chạy trong 1 transaction luôn rollback — không tạo đơn
   hàng thật nào, không sửa dữ liệu khách/sản phẩm/tồn kho thật. */

const fs = require('fs');
const sql = require('mssql');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) values[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
}

let seq = 0;
function newKey(prefix) { seq += 1; return prefix + '-' + Date.now() + '-' + seq; }

async function callInsert(tx, o) {
  const r = await new sql.Request(tx)
    .input('Username', sql.VarChar(50), o.username)
    .input('DocumentID', sql.VarChar(50), o.documentId || 'AUTO_GEN')
    .input('DocumentDate', sql.DateTime, o.documentDate || new Date())
    .input('BranchID', sql.VarChar(50), o.branchId || '')
    .input('ObjectID', sql.VarChar(50), o.objectId)
    .input('Memo', sql.NVarChar(200), o.memo || '')
    .input('Notes', sql.NVarChar(sql.MAX), o.notes || '')
    .input('XaPhuong', sql.NVarChar(50), o.xaPhuong || '')
    .input('ThuDiTuyen', sql.NVarChar(10), o.thuDiTuyen || '')
    .input('ItemList', sql.NVarChar(sql.MAX), JSON.stringify(o.items))
    .input('IdempotencyKey', sql.VarChar(128), o.idempotencyKey || newKey('idem'))
    .input('RequestID', sql.VarChar(100), o.requestId || newKey('req'))
    .input('SaveAsDraft', sql.Bit, o.saveAsDraft ? 1 : 0)
    .execute('dbo.API_DonHangChiTiet_Insert_AI');
  return r.recordset[0];
}

async function main() {
  const env = readEnv();
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('medtest only');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const results = [];
  let user, scopeRow, items;
  try {
    // ── Dữ liệu test thật: 1 user có đủ EmployeeID/BranchID, 1 khách trong phạm vi, 1 sản phẩm có giá ──
    user = (await new sql.Request(tx).query(`
      SELECT TOP (1) U.UserName, U.BranchID
      FROM dbo.SY_User U
      WHERE COALESCE(U.Disable,0)=0 AND COALESCE(U.BranchID,'')<>'' AND COALESCE(U.EmployeeID,'')<>''
        AND EXISTS (SELECT 1 FROM dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()))
      ORDER BY U.UserName;
    `)).recordset[0];
    assert(user, 'Cần 1 tài khoản có đủ BranchID/EmployeeID VÀ phạm vi kho (AI_WarehouseByUserFnc) trong medtest.');

    scopeRow = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), user.UserName)
      .query(`SELECT TOP (1) ObjectID FROM dbo.AR_GetObjectByUserFnc(@UserName) ORDER BY ObjectID;`)
    ).recordset[0];
    assert(scopeRow, 'Cần tìm được ít nhất 1 khách trong phạm vi của tài khoản test qua AR_GetObjectByUserFnc.');

    const custPhone = (await new sql.Request(tx)
      .input('ObjectID', sql.VarChar(50), scopeRow.ObjectID)
      .query(`SELECT COALESCE(Phone,'') AS Phone FROM dbo.CF_ObjectTbl WHERE ObjectID=@ObjectID;`)
    ).recordset[0];
    assert(custPhone && custPhone.Phone, 'Khách test cần có số điện thoại (proc bắt buộc).');

    const candidates = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), user.UserName)
      .query(`
        SELECT T.ItemID, T.StoreHouseID, P.UnitPrice, SUM(T.Quantity) AS Qty
        FROM dbo.IV_StockTransactionTbl T
        JOIN dbo.AI_WarehouseByUserFnc(@UserName, SYSUTCDATETIME()) W ON W.StoreHouseID = T.StoreHouseID
        JOIN dbo.CF_ItemTbl I ON I.ItemID = T.ItemID AND COALESCE(I.IsDisable,0)=0
        OUTER APPLY (SELECT TOP (1) UnitPrice FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), '${scopeRow.ObjectID.replace(/'/g, "''")}', T.ItemID)) P
        GROUP BY T.ItemID, T.StoreHouseID, P.UnitPrice
        HAVING SUM(T.Quantity) > 5 AND P.UnitPrice > 0
        ORDER BY T.ItemID;
      `)
    ).recordset;
    assert(candidates.length > 0, 'Cần ít nhất 1 sản phẩm có tồn kho > 5 và giá hợp lệ cho khách test trong medtest.');

    // Dữ liệu thật đa dạng — không phải sản phẩm nào cũng "sạch" CTBH (ExpectedGift/Discount=0
    // khi mua số lượng nhỏ). Thử lần lượt tới khi có 1 sản phẩm ổn định 1 để dùng xuyên suốt.
    items = null;
    let r1 = null;
    for (const c of candidates) {
      const candidateItems = [{ ItemID: c.ItemID, Quantity: 1, SoLuongTang: 0, UnitPrice: c.UnitPrice, DiscountPercent: 0 }];
      const attempt = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items: candidateItems, saveAsDraft: true, requestId: newKey('req-probe') });
      if (attempt.MsgType === 5) { items = candidateItems; r1 = attempt; break; }
    }
    assert(items, 'Không tìm được sản phẩm nào trong ' + candidates.length + ' ứng viên cho ra đơn hợp lệ (mua 1, không giảm giá/tặng) — dữ liệu CTBH của medtest quá đặc thù.');

    // ── Ca 1: SaveAsDraft=1 -> StatusID phải là -1 ──────────────────────────────────
    assert(r1.MsgType === 5, 'Lưu nháp phải thành công, thực tế: ' + JSON.stringify(r1));
    assert(r1.StatusID === -1, 'SaveAsDraft=1 phải cho StatusID=-1, thực tế: ' + r1.StatusID);
    const liveStatus1 = (await new sql.Request(tx)
      .input('DocumentID', sql.VarChar(50), r1.DocumentID)
      .query(`SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;`)).recordset[0].StatusID;
    assert(liveStatus1 === -1, 'StatusID thật trong AR_OrderTbl phải là -1, thực tế: ' + liveStatus1);
    results.push(['SAVE_AS_DRAFT_GIVES_STATUS_MINUS_1', true]);

    // ── Ca 2: mặc định (không truyền / =0) vẫn ra StatusID=0 như cũ (regression) ────
    const r2 = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, saveAsDraft: false, requestId: newKey('req-normal') });
    assert(r2.MsgType === 5, 'Tạo đơn thường phải thành công, thực tế: ' + JSON.stringify(r2));
    assert(r2.StatusID === 0, 'Mặc định phải cho StatusID=0 (không đổi hành vi cũ), thực tế: ' + r2.StatusID);
    results.push(['DEFAULT_STILL_STATUS_0', true]);

    // ── Ca 3: fingerprint phải phân biệt draft vs non-draft cho CÙNG payload + CÙNG key ──
    const sameKey = newKey('idem-shared');
    const r3a = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, saveAsDraft: true, idempotencyKey: sameKey, requestId: newKey('req-3a') });
    assert(r3a.MsgType === 5 && r3a.StatusID === -1, 'Lần đầu (draft) phải thành công, thực tế: ' + JSON.stringify(r3a));
    const r3b = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, saveAsDraft: false, idempotencyKey: sameKey, requestId: newKey('req-3b') });
    assert(r3b.Code === 'IDEMPOTENCY_CONFLICT', 'Cùng key nhưng lệch SaveAsDraft phải bị IDEMPOTENCY_CONFLICT (fingerprint phải khác nhau), thực tế: ' + JSON.stringify(r3b));
    results.push(['FINGERPRINT_SEPARATES_DRAFT_VS_NORMAL', true]);

    // ── Ca 4: replay đúng key (draft) phải trả IsReplay=true, không tạo đơn thứ 2 ────
    const replayKey = newKey('idem-replay');
    const r4a = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, saveAsDraft: true, idempotencyKey: replayKey, requestId: newKey('req-4a') });
    assert(r4a.MsgType === 5 && r4a.IsReplay === false, 'Lần gọi đầu phải thành công, không phải replay, thực tế: ' + JSON.stringify(r4a));
    const r4b = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, saveAsDraft: true, idempotencyKey: replayKey, requestId: newKey('req-4b') });
    assert(r4b.IsReplay === true && r4b.DocumentID === r4a.DocumentID, 'Lần gọi 2 (cùng key) phải là replay, cùng DocumentID, thực tế: ' + JSON.stringify(r4b));
    results.push(['REPLAY_WORKS_FOR_DRAFT', true]);

    console.log(JSON.stringify({ Task: 'VERIFY-DONHANGCHITIET-INSERT-AI-DRAFT-FLAG (phần 1/2)', Status: 'PASS', Results: results }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK phần 1 (không tạo đơn hàng/dữ liệu thật nào)');
  }

  // ── Ca 5: proc THROW 51003 (DOCUMENT_ID_CONFLICT) bên trong BEGIN TRANSACTION của chính
  // nó. SQL Server cấm ROLLBACK trong ngữ cảnh INSERT-EXEC, và driver `sql.Transaction` tự
  // theo dõi @@TRANCOUNT nên báo lệch nếu proc tự rollback bên trong request của nó — dùng 1
  // request THƯỜNG (không bọc transaction, không INSERT-EXEC) là cách duy nhất gọi được ca
  // này. Để không cần "mồi" 1 đơn nháp mới, tái dùng 1 đơn StatusID=0 THẬT đã có sẵn (chỉ ĐỌC
  // qua UPDLOCK/HOLDLOCK bên trong proc rồi nhả khi rollback, không ghi gì lên đó): gọi với
  // SaveAsDraft=1 (InitialStatusID=-1) trong khi đơn thật đang StatusID=0 → chắc chắn lệch →
  // đúng nhánh DOCUMENT_ID_CONFLICT cần kiểm chứng, không cần tạo dữ liệu mới.
  const existingOrder = (await pool.request().query(`
    SELECT TOP (1) DocumentID FROM dbo.AR_OrderTbl WHERE StatusID = 0 ORDER BY DocumentID;
  `)).recordset[0];
  assert(existingOrder, 'Cần ít nhất 1 đơn StatusID=0 thật trong medtest để test DOCUMENT_ID_CONFLICT.');

  const r5 = await callInsert(pool, {
    username: user.UserName, objectId: scopeRow.ObjectID, items,
    documentId: existingOrder.DocumentID, saveAsDraft: true, requestId: newKey('req-ca5-conflict'),
  });
  assert(r5.Code === 'DOCUMENT_ID_CONFLICT', 'DocumentID thật đang StatusID=0 nhưng gọi với SaveAsDraft=1 (đòi -1) phải bị DOCUMENT_ID_CONFLICT, thực tế: ' + JSON.stringify(r5));
  const stillZero = (await pool.request()
    .input('DocumentID', sql.VarChar(50), existingOrder.DocumentID)
    .query(`SELECT StatusID FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;`)).recordset[0].StatusID;
  assert(stillZero === 0, 'Đơn thật không được đổi StatusID chỉ vì bị dùng làm ca test xung đột, thực tế: ' + stillZero);
  results.push(['DOCUMENT_ID_CONFLICT_ON_DRAFT_FLAG_MISMATCH', true]);

  console.log(JSON.stringify({ Task: 'VERIFY-DONHANGCHITIET-INSERT-AI-DRAFT-FLAG (phần 2/2)', Status: 'PASS', Results: results }, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-DONHANGCHITIET-INSERT-AI-DRAFT-FLAG', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
