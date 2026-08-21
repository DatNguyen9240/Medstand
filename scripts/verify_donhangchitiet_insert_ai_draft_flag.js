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
  try {
    // ── Dữ liệu test thật: 1 user có đủ EmployeeID/BranchID, 1 khách trong phạm vi, 1 sản phẩm có giá ──
    const user = (await new sql.Request(tx).query(`
      SELECT TOP (1) U.UserName, U.BranchID
      FROM dbo.SY_User U
      WHERE COALESCE(U.Disable,0)=0 AND COALESCE(U.BranchID,'')<>'' AND COALESCE(U.EmployeeID,'')<>''
        AND EXISTS (SELECT 1 FROM dbo.AI_WarehouseByUserFnc(U.UserName, SYSUTCDATETIME()))
      ORDER BY U.UserName;
    `)).recordset[0];
    assert(user, 'Cần 1 tài khoản có đủ BranchID/EmployeeID VÀ phạm vi kho (AI_WarehouseByUserFnc) trong medtest.');

    const scopeRow = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), user.UserName)
      .query(`SELECT TOP (1) ObjectID FROM dbo.AR_GetObjectByUserFnc(@UserName) ORDER BY ObjectID;`)
    ).recordset[0];
    assert(scopeRow, 'Cần tìm được ít nhất 1 khách trong phạm vi của tài khoản test qua AR_GetObjectByUserFnc.');

    const custPhone = (await new sql.Request(tx)
      .input('ObjectID', sql.VarChar(50), scopeRow.ObjectID)
      .query(`SELECT COALESCE(Phone,'') AS Phone FROM dbo.CF_ObjectTbl WHERE ObjectID=@ObjectID;`)
    ).recordset[0];
    assert(custPhone && custPhone.Phone, 'Khách test cần có số điện thoại (proc bắt buộc).');

    const stockRow = (await new sql.Request(tx)
      .input('UserName', sql.VarChar(50), user.UserName)
      .query(`
        SELECT TOP (1) T.ItemID, T.StoreHouseID, P.UnitPrice
        FROM dbo.IV_StockTransactionTbl T
        JOIN dbo.AI_WarehouseByUserFnc(@UserName, SYSUTCDATETIME()) W ON W.StoreHouseID = T.StoreHouseID
        JOIN dbo.CF_ItemTbl I ON I.ItemID = T.ItemID AND COALESCE(I.IsDisable,0)=0
        OUTER APPLY (SELECT TOP (1) UnitPrice FROM dbo.AR_LayGiaSanPhamFnc(CAST(GETDATE() AS DATE), '${scopeRow.ObjectID.replace(/'/g, "''")}', T.ItemID)) P
        GROUP BY T.ItemID, T.StoreHouseID, P.UnitPrice
        HAVING SUM(T.Quantity) > 5 AND P.UnitPrice > 0
        ORDER BY T.ItemID;
      `)
    ).recordset[0];
    assert(stockRow, 'Cần 1 sản phẩm có tồn kho > 5 và có giá hợp lệ cho khách test trong medtest.');

    const items = [{ ItemID: stockRow.ItemID, Quantity: 1, SoLuongTang: 0, UnitPrice: stockRow.UnitPrice, DiscountPercent: 0 }];

    // ── Ca 1: SaveAsDraft=1 -> StatusID phải là -1 ──────────────────────────────────
    const r1 = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, saveAsDraft: true, requestId: newKey('req-draft') });
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

    // ── Ca 5: cùng DocumentID (đã có, StatusID=-1) nhưng gửi SaveAsDraft=0 -> DOCUMENT_ID_CONFLICT ──
    const explicitDocId = r1.DocumentID;
    const r5 = await callInsert(tx, { username: user.UserName, objectId: scopeRow.ObjectID, items, documentId: explicitDocId, saveAsDraft: false, requestId: newKey('req-5') });
    assert(r5.Code === 'DOCUMENT_ID_CONFLICT', 'Cùng DocumentID nhưng lệch SaveAsDraft (khác StatusID hiện có) phải bị DOCUMENT_ID_CONFLICT, thực tế: ' + JSON.stringify(r5));
    results.push(['DOCUMENT_ID_CONFLICT_ON_DRAFT_FLAG_MISMATCH', true]);

    console.log(JSON.stringify({ Task: 'VERIFY-DONHANGCHITIET-INSERT-AI-DRAFT-FLAG', Status: 'PASS', Results: results }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không tạo đơn hàng/dữ liệu thật nào)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-DONHANGCHITIET-INSERT-AI-DRAFT-FLAG', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
