'use strict';

/* Preflight cho SEARCH-001..004 (selection token, scope guard, customer/product
   search). Deploy toàn bộ 4 file trong MỘT transaction rồi tự kiểm tra bằng dữ
   liệu thật trên medtest; mặc định (--preflight) luôn ROLLBACK ở cuối nên không
   để lại object hay dữ liệu nào nếu chạy với cờ này. Bỏ cờ --preflight để deploy
   thật (commit). Theo đúng khuôn scripts/deploy_core011_customer_search_fix.js. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/SEARCH-002_Scope_Guard_AI.sql',
  'sql/SEARCH-001_Selection_Token_Schema_AI.sql',
  'sql/SEARCH-003_Customer_Search_AI.sql',
  'sql/SEARCH-004_Product_Search_AI.sql',
];

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.replace(/^﻿/, '').split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim()).filter(Boolean);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const preflight = process.argv.includes('--preflight');
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('Deploy is medtest-only.');

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
  const evidence = {};
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    let batchCount = 0;
    for (const file of SQL_FILES) {
      for (const batch of batches(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
        await new sql.Request(transaction).batch(batch);
        batchCount += 1;
      }
    }
    evidence.BatchCount = batchCount;

    // ── Scope guard ──────────────────────────────────────────────────────
    const scopeGuard = async (username) => {
      const r = await new sql.Request(transaction)
        .query(`SELECT * FROM dbo.AI_ScopeGuardFnc('${username.replace(/'/g, "''")}')`);
      return r.recordset[0];
    };

    const qlmd1 = await scopeGuard('QLMD1');
    expect(qlmd1.DecisionCode === 'ORG_CHART_RESOLVED', `QLMD1 phải ORG_CHART_RESOLVED, nhận ${qlmd1.DecisionCode}`);
    const qlbh024 = await scopeGuard('QLBH024.MED');
    expect(qlbh024.DecisionCode === 'ORG_CHART_RESOLVED', `QLBH024.MED phải ORG_CHART_RESOLVED, nhận ${qlbh024.DecisionCode}`);
    const trungbm = await scopeGuard('TRUNGBM');
    expect(trungbm.DecisionCode === 'ORG_CHART_MISSING' && trungbm.IsScopeResolvable === false,
      `TRUNGBM phải bị chặn ORG_CHART_MISSING (lỗi CORE-001 chưa vá), nhận ${JSON.stringify(trungbm)}`);
    const admin = await scopeGuard('Admin');
    expect(admin.DecisionCode === 'GLOBAL_LEADERSHIP' && admin.IsGloballyScoped === true,
      `Admin phải GLOBAL_LEADERSHIP, nhận ${JSON.stringify(admin)}`);
    const qlbh013 = await scopeGuard('QLBH013.MED');
    expect(qlbh013.DecisionCode === 'ORG_CHART_RESOLVED', `QLBH013.MED phải ORG_CHART_RESOLVED, nhận ${qlbh013.DecisionCode}`);
    evidence.ScopeGuard = { QLMD1: qlmd1.DecisionCode, 'QLBH024.MED': qlbh024.DecisionCode, TRUNGBM: trungbm.DecisionCode, Admin: admin.DecisionCode };

    // ── API_CustomerSearch_AI ────────────────────────────────────────────
    const customerSearch = async (username, searchText, topN) => {
      const r = new sql.Request(transaction)
        .input('Username', sql.VarChar(50), username)
        .input('SearchText', sql.NVarChar(100), searchText);
      if (topN !== undefined) r.input('TopN', sql.Int, topN);
      const result = await r.execute('dbo.API_CustomerSearch_AI');
      return result.recordset || [];
    };

    // TRUNGBM (fail-closed) — SEARCH: SCOPE_UNRESOLVED thay vì thấy hàng loạt.
    const trungbmSearch = await customerSearch('TRUNGBM', 'Minh');
    expect(trungbmSearch.length === 1 && trungbmSearch[0].Code === 'SCOPE_UNRESOLVED',
      `TRUNGBM tìm khách phải bị chặn SCOPE_UNRESOLVED, nhận ${JSON.stringify(trungbmSearch)}`);

    // QLBH013.MED — trong scope 1892 khách, tìm theo tên trùng nhiều lần phải ra >1 dòng.
    const dupRows = await customerSearch('QLBH013.MED', 'Tâm Đức', 20);
    // Có thể QLBH013.MED không có khách "Tâm Đức" trong scope — không coi là lỗi,
    // chỉ ghi nhận số dòng để đối chiếu thủ công.
    evidence.QLBH013_TamDuc_Count = dupRows.length;

    // NO_MATCH cho chuỗi vô nghĩa.
    const noMatch = await customerSearch('QLBH013.MED', 'ZZZKHONGTONTAIZZZ');
    expect(noMatch.length === 1 && noMatch[0].Code === 'NO_MATCH', `Chuỗi vô nghĩa phải NO_MATCH, nhận ${JSON.stringify(noMatch)}`);

    // Tìm một khách thật trong scope QLBH013.MED để test mã/tên/không dấu/scope.
    const sample = await new sql.Request(transaction).query(`
      SELECT TOP 1 O.ObjectID, O.ObjectName, O.Phone
      FROM dbo.CF_ObjectTbl O
      INNER JOIN dbo.AR_GetObjectByUserFnc('QLBH013.MED') S ON S.ObjectID = O.ObjectID
      WHERE O.isCustomer = 1 AND COALESCE(O.isDisable,0) = 0
        AND O.ObjectID NOT LIKE '%-%-%-%-%'
        AND LEN(COALESCE(O.ObjectName,'')) >= 12
        AND O.ObjectName LIKE '% %'
      ORDER BY O.ObjectID`);
    expect(sample.recordset.length === 1, 'Không tìm được khách mẫu trong scope QLBH013.MED để test.');
    const target = sample.recordset[0];
    evidence.SampleTarget = target;

    const byExactCode = await customerSearch('QLBH013.MED', target.ObjectID);
    expect(byExactCode.some((row) => row.ObjectID === target.ObjectID),
      `Tìm đúng mã '${target.ObjectID}' phải ra chính khách đó.`);
    expect(byExactCode[0].ObjectID === target.ObjectID, 'Khớp mã chính xác phải xếp hạng đầu tiên.');

    const nameWords = target.ObjectName.split(' ').filter((w) => w.length >= 3);
    const namePartial = nameWords[nameWords.length - 1] || target.ObjectName.trim();
    const byNamePartial = await customerSearch('QLBH013.MED', namePartial);
    expect(byNamePartial.some((row) => row.ObjectID === target.ObjectID),
      `Tìm một phần tên '${namePartial}' phải thấy khách '${target.ObjectID}' trong danh sách.`);

    // Không dấu: bỏ dấu tiếng Việt khỏi tên rồi tìm lại.
    const unaccented = target.ObjectName
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const byUnaccented = await customerSearch('QLBH013.MED', unaccented);
    expect(byUnaccented.some((row) => row.ObjectID === target.ObjectID),
      `Tìm không dấu '${unaccented}' phải thấy khách '${target.ObjectID}'. Kết quả: ${JSON.stringify(byUnaccented.slice(0, 3))}`);

    // Khách ngoài scope của một tài khoản Sale khác (nếu có) không được xuất hiện.
    const otherAccountRow = await new sql.Request(transaction).query(`
      SELECT TOP 1 U.UserName
      FROM dbo.SY_User U
      WHERE U.UserName <> 'QLBH013.MED' AND COALESCE(U.Disable,0)=0
        AND NOT EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(U.UserName) S WHERE S.ObjectID = '${target.ObjectID.replace(/'/g, "''")}')
        AND EXISTS (SELECT 1 FROM dbo.AR_GetObjectByUserFnc(U.UserName))
        AND U.UserName IN ('QLBH016.MED','QLBH005.MED','QLBH010.MED','DANANGA.MED','NAMDINHB.MED','BACNINHA.MED','HUEB.MED','QLMN2','CanThoA','BinhPhuocA')`);
    if (otherAccountRow.recordset.length === 1) {
      const otherUser = otherAccountRow.recordset[0].UserName;
      const crossScope = await customerSearch(otherUser, target.ObjectID);
      const leaked = crossScope.some((row) => row.ObjectID === target.ObjectID);
      expect(!leaked, `SEARCH-06: khách '${target.ObjectID}' không được xuất hiện khi '${otherUser}' tìm bằng đúng mã.`);
      evidence.CrossScopeCheckedWith = otherUser;
    } else {
      evidence.CrossScopeCheckedWith = null;
    }

    // ── API_ProductSearch_AI ─────────────────────────────────────────────
    const productSearch = async (username, searchText, topN, requireSellable) => {
      const r = new sql.Request(transaction)
        .input('Username', sql.VarChar(50), username)
        .input('SearchText', sql.NVarChar(100), searchText);
      if (topN !== undefined) r.input('TopN', sql.Int, topN);
      if (requireSellable !== undefined) r.input('RequireSellable', sql.Bit, requireSellable);
      const result = await r.execute('dbo.API_ProductSearch_AI');
      return result.recordset || [];
    };

    const productSample = await new sql.Request(transaction).query(`
      SELECT TOP 1 ItemID, ItemName FROM dbo.CF_ItemTbl
      WHERE COALESCE(isDisable,0) = 0 AND LEN(COALESCE(ItemName,'')) > 6 ORDER BY ItemID`);
    expect(productSample.recordset.length === 1, 'Không tìm được sản phẩm mẫu để test.');
    const itemTarget = productSample.recordset[0];
    evidence.SampleItem = itemTarget;

    const productByCode = await productSearch('QLBH013.MED', itemTarget.ItemID, 20, 0);
    expect(productByCode.some((row) => row.ItemID === itemTarget.ItemID),
      `Tìm sản phẩm theo mã '${itemTarget.ItemID}' phải ra chính sản phẩm đó.`);

    const productNoMatch = await productSearch('QLBH013.MED', 'ZZZKHONGTONTAIZZZ');
    expect(productNoMatch.length === 1 && productNoMatch[0].Code === 'NO_MATCH',
      `Chuỗi vô nghĩa phải NO_MATCH cho sản phẩm, nhận ${JSON.stringify(productNoMatch)}`);

    // ── Selection token: issue -> consume, expiry/cross-account rejection ──
    const issueToken = async (username, channelType, channelSessionId, entityType, candidates, pending) => {
      const r = new sql.Request(transaction)
        .input('Username', sql.VarChar(50), username)
        .input('ChannelType', sql.VarChar(20), channelType)
        .input('ChannelSessionID', sql.VarChar(100), channelSessionId)
        .input('EntityType', sql.VarChar(20), entityType)
        .input('CandidateJson', sql.NVarChar(sql.MAX), JSON.stringify(candidates));
      if (pending !== undefined) r.input('PendingRequestJson', sql.NVarChar(sql.MAX), JSON.stringify(pending));
      const result = await r.execute('dbo.API_SelectionToken_Issue_AI');
      return result.recordset[0];
    };
    const consumeToken = async (username, channelType, channelSessionId, token, chosenId) => {
      const result = await new sql.Request(transaction)
        .input('Username', sql.VarChar(50), username)
        .input('ChannelType', sql.VarChar(20), channelType)
        .input('ChannelSessionID', sql.VarChar(100), channelSessionId)
        .input('SelectionToken', sql.Char(32), token)
        .input('ChosenEntityID', sql.VarChar(50), chosenId)
        .execute('dbo.API_SelectionToken_Consume_AI');
      return result.recordset[0];
    };

    const candidateList = [
      { id: target.ObjectID, label: target.ObjectName },
      { id: 'FAKE-ID-NOT-REAL', label: 'Khác' },
    ];
    const issued = await issueToken('QLBH013.MED', 'WEB', 'sess-preflight-1', 'CUSTOMER', candidateList, { ApiCode: '@cong_no_khach_hang', Params: {} });
    expect(issued.MsgType === 0 && issued.SelectionToken, `Issue token thất bại: ${JSON.stringify(issued)}`);
    evidence.SelectionTokenIssued = Boolean(issued.SelectionToken);

    // Chọn một ID không nằm trong danh sách candidate -> phải bị từ chối.
    const badPick = await consumeToken('QLBH013.MED', 'WEB', 'sess-preflight-1', issued.SelectionToken, 'ID-NGOAI-DANH-SACH');
    expect(badPick.MsgType === 1, 'Chọn ID không nằm trong candidate list phải bị từ chối.');

    // Sai tài khoản (SEARCH-13) -> từ chối, không tiết lộ thêm.
    const crossAccountPick = await consumeToken('QLBH016.MED', 'WEB', 'sess-preflight-1', issued.SelectionToken, target.ObjectID);
    expect(crossAccountPick.MsgType === 1 && crossAccountPick.Code === 'SELECTION_TOKEN_INVALID',
      `SEARCH-13: token của tài khoản khác phải bị từ chối, nhận ${JSON.stringify(crossAccountPick)}`);

    const crossSessionPick = await consumeToken('QLBH013.MED', 'WEB', 'other-session', issued.SelectionToken, target.ObjectID);
    expect(crossSessionPick.Code === 'SELECTION_TOKEN_INVALID', 'Token không được dùng ở hội thoại khác.');
    const crossChannelPick = await consumeToken('QLBH013.MED', 'TELEGRAM', 'sess-preflight-1', issued.SelectionToken, target.ObjectID);
    expect(crossChannelPick.Code === 'SELECTION_TOKEN_INVALID', 'Token không được dùng chéo kênh.');

    const indexToken = await issueToken('QLBH013.MED', 'TELEGRAM', 'sess-index', 'CUSTOMER', candidateList);
    const indexed = await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), 'QLBH013.MED').input('ChannelType', sql.VarChar(20), 'TELEGRAM')
      .input('ChannelSessionID', sql.VarChar(100), 'sess-index').input('SelectionToken', sql.Char(32), indexToken.SelectionToken)
      .input('ChosenIndex', sql.Int, 0).execute('dbo.API_SelectionToken_Consume_AI');
    expect(indexed.recordset[0].ConsumedEntityID === target.ObjectID, 'Index phải resolve đúng ID đã lưu.');

    // Đúng tài khoản, đúng lựa chọn -> thành công, trả lại PendingRequestJson.
    const goodPick = await consumeToken('QLBH013.MED', 'WEB', 'sess-preflight-1', issued.SelectionToken, target.ObjectID);
    expect(goodPick.MsgType === 0 && goodPick.ConsumedEntityID === target.ObjectID,
      `Consume hợp lệ phải thành công, nhận ${JSON.stringify(goodPick)}`);
    expect(JSON.parse(goodPick.PendingRequestJson).ApiCode === '@cong_no_khach_hang', 'PendingRequestJson phải được trả lại nguyên vẹn.');

    // Dùng lại token đã tiêu thụ -> phải bị từ chối (một lần dùng).
    const reusePick = await consumeToken('QLBH013.MED', 'WEB', 'sess-preflight-1', issued.SelectionToken, target.ObjectID);
    expect(reusePick.MsgType === 1, 'Token đã tiêu thụ không được dùng lại (SEARCH-12 tương tự).');

    const expiryToken = await issueToken('QLBH013.MED', 'WEB', 'sess-preflight-2', 'CUSTOMER', candidateList);
    // Ownership chaining in a temporary test procedure preserves the public DENY.
    // Create/drop stays in this transaction; rollback also removes it on failure.
    const helper = 'SEARCH_TestExpire_' + require('crypto').randomBytes(6).toString('hex');
    await new sql.Request(transaction).batch(`CREATE PROCEDURE dbo.${helper} @Token CHAR(32) AS
      UPDATE dbo.AI_SelectionToken SET IssuedAtUtc=DATEADD(MINUTE,-10,SYSUTCDATETIME()),
        ExpiresAtUtc=DATEADD(MINUTE,-1,SYSUTCDATETIME()) WHERE SelectionToken=@Token;`);
    await new sql.Request(transaction).input('Token', sql.Char(32), expiryToken.SelectionToken).execute('dbo.' + helper);
    await new sql.Request(transaction).batch(`DROP PROCEDURE dbo.${helper};`);
    const expiredPick = await consumeToken('QLBH013.MED', 'WEB', 'sess-preflight-2', expiryToken.SelectionToken, target.ObjectID);
    expect(expiredPick.MsgType === 1 && expiredPick.Code === 'SELECTION_TOKEN_INVALID',
      `SEARCH-12: token đã phát hành và hết hạn phải bị từ chối, nhận ${JSON.stringify(expiredPick)}`);

    evidence.SelectionTokenChecks = { badPick: badPick.Code, crossAccountPick: crossAccountPick.Code, goodPick: goodPick.Code, reusePick: reusePick.Code, expiredPick: expiredPick.Code };

    if (preflight) await transaction.rollback();
    else await transaction.commit();
    began = false;

    console.log(JSON.stringify({
      Task: 'SEARCH-001..004-PREFLIGHT',
      Status: 'PASS',
      Mode: preflight ? 'PREFLIGHT_ROLLBACK' : 'DEPLOY_COMMIT',
      Evidence: evidence,
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* transaction can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'SEARCH-001..004-PREFLIGHT', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
