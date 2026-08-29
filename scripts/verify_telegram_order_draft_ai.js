'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const env = { ...loadEnv('.env'), ...loadEnv('.env.uat.local'), ...process.env };
  expect(env.TEST_DB_DATABASE === 'medtest', 'Rollback UAT is restricted to medtest.');
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

  let documentId = '';
  const checks = [];
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    const linkConfigPath = path.join(ROOT, 'config', 'telegram', 'uat-links.local.json');
    expect(fs.existsSync(linkConfigPath), 'Local Telegram UAT mapping is unavailable.');
    const configuredLinks = JSON.parse(fs.readFileSync(linkConfigPath, 'utf8')).links || [];
    const configured = configuredLinks.find((entry) => entry.userName === 'QLBH013.MED' && /^\d{1,20}$/.test(String(entry.telegramUserId || '')))
      || configuredLinks.find((entry) => /^\d{1,20}$/.test(String(entry.telegramUserId || '')));
    expect(configured, 'No Telegram ID is configured for rollback UAT.');
    const issued = await new sql.Request(transaction)
      .input('TelegramUserID', sql.VarChar(20), configured.telegramUserId)
      .input('TelegramChatID', sql.VarChar(20), configured.telegramUserId)
      .input('TelegramUpdateID', sql.BigInt, Date.now())
      .execute('dbo.API_TelegramAuthTicket_Issue_AI');
    const identity = issued.recordset[0];
    expect(identity?.AuthStatus === 'AUTHORIZED', 'Configured Telegram mapping is not currently active.');
    const owner = { TelegramUserID: String(configured.telegramUserId), UserName: String(identity.UserName) };
    checks.push('OWNER_LINK_ACTIVE');

    const customers = (await new sql.Request(transaction)
      .input('Username', sql.VarChar(50), owner.UserName)
      .query(`SELECT TOP (20) O.ObjectID
              FROM dbo.AR_GetObjectByUserFnc(@Username) S
              JOIN dbo.CF_ObjectTbl O ON O.ObjectID=S.ObjectID
              WHERE COALESCE(O.Phone,'')<>'' ORDER BY O.ObjectID;`)).recordset;
    expect(customers.length > 0, 'No in-scope customer with phone is available.');

    let selected = null;
    for (const customer of customers) {
      const catalog = await new sql.Request(transaction)
        .input('Username', sql.VarChar(50), owner.UserName)
        .input('ObjectID', sql.VarChar(50), customer.ObjectID)
        .execute('dbo.API_HangHoaList_AI');
      const product = (catalog.recordset || []).find((row) => row.ItemID && Number(row.UnitPrice) > 0 && Number(row.AvailableStock) >= 1);
      if (product) {
        selected = { customerId: customer.ObjectID, itemId: product.ItemID };
        break;
      }
    }
    expect(selected, 'No orderable customer/product pair was found in the linked account scope.');
    checks.push('ORDERABLE_PAIR_RESOLVED');

    const preview = await new sql.Request(transaction)
      .input('TelegramUserID', sql.VarChar(20), owner.TelegramUserID)
      .input('Username', sql.VarChar(50), owner.UserName)
      .input('ObjectID', sql.VarChar(50), selected.customerId)
      .input('RequestedItemsJson', sql.NVarChar(sql.MAX), JSON.stringify([{ ItemID: selected.itemId, Quantity: 1 }]))
      .execute('dbo.API_TelegramOrderDraft_Preview_AI');
    const previewRows = preview.recordset || [];
    const previewRow = previewRows[0];
    expect(previewRow && previewRow.Code === 'PREVIEW_READY' && /^[0-9a-f]{32}$/.test(previewRow.DraftToken), 'Draft preview failed.');
    expect(previewRows.every((row) => row.ObjectID === selected.customerId && Number(row.Quantity) === 1), 'Preview scope or quantity mismatch.');
    checks.push('PREVIEW_OWNER_PRICE_STOCK_PROMOTION_VALIDATED');

    const requestId = `req-tg-uat-${Date.now()}`;
    const saved = await new sql.Request(transaction)
      .input('TelegramUserID', sql.VarChar(20), owner.TelegramUserID)
      .input('Username', sql.VarChar(50), owner.UserName)
      .input('DraftToken', sql.Char(32), previewRow.DraftToken)
      .input('RequestID', sql.VarChar(100), requestId)
      .execute('dbo.API_TelegramOrderDraft_Save_AI');
    const savedRow = saved.recordset[0];
    expect(savedRow && Number(savedRow.MsgType) === 5 && savedRow.DocumentID, `Draft save failed: ${savedRow && savedRow.Msg || 'empty response'}`);
    documentId = String(savedRow.DocumentID);

    const persisted = await new sql.Request(transaction)
      .input('DocumentID', sql.VarChar(50), documentId)
      .query('SELECT DocumentID,StatusID FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;');
    expect(persisted.recordset.length === 1 && Number(persisted.recordset[0].StatusID) === -1, 'Telegram order was not forced to StatusID=-1.');
    checks.push('SAVE_FORCED_STATUS_MINUS_ONE');

    const replayed = await new sql.Request(transaction)
      .input('TelegramUserID', sql.VarChar(20), owner.TelegramUserID)
      .input('Username', sql.VarChar(50), owner.UserName)
      .input('DraftToken', sql.Char(32), previewRow.DraftToken)
      .input('RequestID', sql.VarChar(100), `${requestId}-retry`)
      .execute('dbo.API_TelegramOrderDraft_Save_AI');
    const replayRow = replayed.recordset[0];
    expect(replayRow && replayRow.DocumentID === documentId && Boolean(replayRow.IsReplay), 'Repeated confirmation did not replay the same draft.');
    checks.push('DOUBLE_CLICK_IDEMPOTENT');

    const cancelled = await new sql.Request(transaction)
      .input('TelegramUserID', sql.VarChar(20), owner.TelegramUserID)
      .input('Username', sql.VarChar(50), owner.UserName)
      .input('DraftToken', sql.Char(32), previewRow.DraftToken)
      .execute('dbo.API_TelegramOrderDraft_Cancel_AI');
    expect(cancelled.recordset[0]?.Code === 'ALREADY_SAVED' && cancelled.recordset[0]?.DocumentID === documentId, 'Cancel-after-save must report the already saved draft.');
    checks.push('CANCEL_AFTER_SAVE_SAFE');

    await transaction.rollback();

    const absent = await pool.request()
      .input('DocumentID', sql.VarChar(50), documentId)
      .query('SELECT COUNT_BIG(*) AS Total FROM dbo.AR_OrderTbl WHERE DocumentID=@DocumentID;');
    expect(Number(absent.recordset[0].Total) === 0, 'Rollback UAT left a test order behind.');
    checks.push('ROLLBACK_LEFT_NO_ORDER');

    console.log(JSON.stringify({
      task: 'TELEGRAM-ORDER-DRAFT-001',
      mode: 'UAT_TRANSACTION_ROLLBACK',
      database: env.TEST_DB_DATABASE,
      ownerHash: crypto.createHash('sha256').update(owner.UserName).digest('hex').slice(0, 12),
      checks,
      status: 'PASS',
    }, null, 2));
  } catch (error) {
    try { await transaction.rollback(); } catch (_) {}
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'TELEGRAM-ORDER-DRAFT-001', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
