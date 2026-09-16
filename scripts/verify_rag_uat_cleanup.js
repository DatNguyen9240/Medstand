'use strict';

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const markers = [
  'RAG001_LIVE_CLEANUP_ONLY',
  'RAG002_RAG003_LIVE_CLEANUP_ONLY',
  'RAG001_UAT_ROLLBACK_ONLY',
  'RAG002_UAT_ROLLBACK_ONLY',
  'RAG002_WORKFLOW_UAT_ROLLBACK_ONLY',
  'RAG003_UAT_ROLLBACK_ONLY',
];

function readEnv(relativePath) {
  const values = {};
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
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
  });
  try {
    const result = await pool.request().input('Markers', sql.NVarChar(sql.MAX), markers.join(',')).query(`
      SELECT COUNT(*) AS Remaining
      FROM dbo.AI_RagDocumentTbl
      WHERE SourceReference IN (SELECT value FROM STRING_SPLIT(@Markers, ','));
    `);
    const remaining = Number(result.recordset[0].Remaining);
    console.log(JSON.stringify({ task: 'RAG-UAT-CLEANUP-CHECK', database: env.TEST_DB_DATABASE, remaining, status: remaining === 0 ? 'PASS' : 'FAIL' }, null, 2));
    if (remaining !== 0) process.exitCode = 1;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-UAT-CLEANUP-CHECK', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
