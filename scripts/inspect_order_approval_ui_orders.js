'use strict';

// Read-only evidence helper for ORDER-APPROVAL-005/006 UI-created UAT orders.
// Usage: node scripts/inspect_order_approval_ui_orders.js DMB0826/11 [more IDs]

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

function readEnv(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

async function main() {
  const ids = process.argv.slice(2).map(String).filter(Boolean);
  if (!ids.length) throw new Error('Provide at least one DocumentID.');

  const worktreeRoot = path.resolve(__dirname, '..');
  const mainRoot = path.resolve(worktreeRoot, '..', '..', '..');
  const envPath = process.env.ORDER_UI_ENV_PATH || path.join(mainRoot, '.env');
  const env = { ...readEnv(envPath), ...process.env };
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
  });
  try {
    const database = (await pool.request().query('SELECT DB_NAME() AS DatabaseName;')).recordset[0].DatabaseName;
    if (String(database).toLowerCase() !== 'medtest') throw new Error(`Read-only inspector only permits medtest; got ${database}.`);

    const request = pool.request();
    const placeholders = ids.map((id, index) => {
      request.input(`id${index}`, sql.VarChar(50), id);
      return `@id${index}`;
    });
    const rows = (await request.query(`
      SELECT O.DocumentID, O.StatusID, O.BranchID, O.UserCreate,
             COALESCE(O.Memo, '') AS Memo,
             (SELECT COUNT(*) FROM dbo.AR_OrderDetailTbl D WHERE D.DocumentID = O.DocumentID) AS DetailCount
      FROM dbo.AR_OrderTbl O
      WHERE O.DocumentID IN (${placeholders.join(', ')})
      ORDER BY O.DocumentID;`)).recordset;

    const users = [
      process.env.ORDER_UI_SALE_USER || 'NAMDINHB.MED',
      process.env.ORDER_UI_MANAGER_USER || 'QLBH013.MED',
      process.env.ORDER_UI_OTHER_SALE_USER || 'BACNINHA.MED'
    ];
    const editContexts = [];
    for (const documentId of ids) {
      for (const username of users) {
        const context = (await pool.request()
          .input('Username', sql.VarChar(50), username)
          .input('DocumentID', sql.VarChar(50), documentId)
          .execute('dbo.API_DonHang_EditContext_AI')).recordset[0];
        editContexts.push({ documentId, username, context });
      }
    }

    const evidence = { database, requested: ids, found: rows.length, orders: rows, editContexts };
    const reportDir = path.resolve(__dirname, '..', 'reports', 'uat', 'ORDER-APPROVAL-005-006');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'ORDER_STATE_INSPECTION.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
  process.exitCode = 1;
});
