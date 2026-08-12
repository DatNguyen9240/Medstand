'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const sql = require('mssql');

const root = path.resolve(__dirname, '..');
const marker = 'RAG001_LIVE_CLEANUP_ONLY';
const fileName = 'rag001-live-safe.pdf';
const filePath = path.join(root, '.tmp', fileName);

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

function upload(env) {
  return new Promise((resolve, reject) => {
    const boundary = `----RAG001${Date.now()}`;
    const fields = {
      title: 'RAG-001 live UAT',
      sourceType: 'POLICY',
      sourceReference: marker,
      sourceChannel: 'RAG_ADMIN',
      expiryDate: 'never',
      username: 'RAG001_LIVE_UAT',
    };
    const chunks = [];
    const addField = (name, value) => {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };
    Object.entries(fields).forEach(([name, value]) => addField(name, value));
    const file = fs.readFileSync(filePath);
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`));
    chunks.push(file);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);
    const request = http.request({
      host: '127.0.0.1', port: 5678, path: '/webhook/admin-upload', method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'x-admin-key': env.ADMIN_UPLOAD_KEY,
      },
    }, (response) => {
      const output = [];
      response.on('data', (chunk) => output.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(output).toString('utf8');
        let payload;
        try { payload = JSON.parse(raw); } catch (_) { payload = { raw }; }
        resolve({ statusCode: response.statusCode, payload });
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function main() {
  const env = { ...readEnv('.env'), ...readEnv('.env.uat.local'), ...process.env };
  if (!env.ADMIN_UPLOAD_KEY) throw new Error('Thiếu ADMIN_UPLOAD_KEY.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from('%PDF-1.7\nRAG001 LIVE UAT\n'));

  let pool;
  const quarantineFiles = new Set();
  try {
    const response = await upload(env);
    pool = await sql.connect({
      server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433), database: env.TEST_DB_DATABASE,
      user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
      options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 15000, requestTimeout: 45000,
    });
    const rows = (await pool.request().input('Marker', sql.NVarChar(500), marker).query(`
      SELECT DocumentID,SafeFileName,MalwareScanStatus,ReviewStatus,SourceReference
      FROM dbo.AI_RagDocumentTbl WHERE SourceReference=@Marker;
    `)).recordset;
    rows.forEach((row) => quarantineFiles.add(row.SafeFileName));
    const pass = response.statusCode === 200 && response.payload.status === 'success'
      && rows.length === 1 && rows[0].MalwareScanStatus === 'CLEAN' && rows[0].ReviewStatus === 'PENDING_REVIEW';
    console.log(JSON.stringify({ task: 'RAG-001-LIVE-CLEANUP', status: pass ? 'PASS' : 'FAIL', response, rows }, null, 2));
    if (!pass) process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.request().input('Marker', sql.NVarChar(500), marker).query('DELETE FROM dbo.AI_RagDocumentTbl WHERE SourceReference=@Marker;');
      await pool.close();
    }
    const quarantineDir = path.join(root, 'n8n-system', 'n8n_data', 'rag-quarantine');
    for (const entry of quarantineFiles) {
      const target = path.resolve(quarantineDir, entry);
      if (path.dirname(target) === path.resolve(quarantineDir)) fs.rmSync(target, { force: true });
    }
    fs.rmSync(filePath, { force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-001-LIVE-CLEANUP', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
