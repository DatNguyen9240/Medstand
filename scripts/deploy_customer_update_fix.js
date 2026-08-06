'use strict';

/* Deploys only the procedure definition. Preflight/verify mutations always roll back. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILE = 'sql/Module common - API_KhachHang_Update_AI.sql';
const TARGET_ID = '4E7E28AF-70A8-4AB8-B594-6DC1E3104E2B';
const USER = 'QLBH013.MED';

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.replace(/^\uFEFF/, '').split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((part) => part.trim()).filter(Boolean);
}

async function deployDefinition(transaction) {
  let count = 0;
  for (const batch of batches(fs.readFileSync(path.join(ROOT, SQL_FILE), 'utf8'))) {
    await new sql.Request(transaction).batch(batch);
    count += 1;
  }
  return count;
}

async function executeUpdate(transaction, payload) {
  return new sql.Request(transaction)
    .input('User', sql.VarChar(50), payload.User)
    .input('OldKeyID', sql.VarChar(50), payload.OldKeyID)
    .input('ObjectName', sql.NVarChar(150), payload.ObjectName)
    .input('Address', sql.NVarChar(250), payload.Address)
    .input('LocationID', sql.NVarChar(50), payload.LocationID)
    .input('QuanHuyen', sql.NVarChar(50), payload.QuanHuyen)
    .input('XaPhuong', sql.NVarChar(50), payload.XaPhuong)
    .input('Phone', sql.VarChar(50), payload.Phone)
    .input('TaxCode', sql.VarChar(50), payload.TaxCode)
    .input('Birthday', sql.DateTime, payload.Birthday)
    .input('LoaiKhachHang', sql.NVarChar(50), payload.LoaiKhachHang)
    .input('KenhBan', sql.VarChar(50), payload.KenhBan)
    .input('ThuDiTuyen', sql.NVarChar(10), payload.ThuDiTuyen)
    .input('Latitude', sql.Float, payload.Latitude)
    .input('Longitude', sql.Float, payload.Longitude)
    .input('IdempotencyKey', sql.VarChar(128), payload.IdempotencyKey)
    .input('RequestID', sql.VarChar(100), payload.RequestID)
    .execute('dbo.API_KhachHang_Update');
}

async function mutationEvidence(transaction) {
  const before = await new sql.Request(transaction)
    .input('ObjectID', sql.VarChar(50), TARGET_ID)
    .query(`SELECT TOP (1) ObjectID, ObjectName, Address, LocationID, QuanHuyen, XaPhuong,
                   Phone, TaxCode, Birthday, LoaiHopDong, PhanLoaiKhach, ThuTrongTuan
            FROM dbo.CF_ObjectTbl WITH (HOLDLOCK) WHERE ObjectID=@ObjectID;`);
  const row = before.recordset[0];
  if (!row) throw new Error('Rollback target not found.');

  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const key = `customer-update-${suffix}`;
  const changedName = `${row.ObjectName} [ROLLBACK]`;
  const base = {
    User: USER, OldKeyID: TARGET_ID, ObjectName: changedName, Address: row.Address,
    LocationID: row.LocationID, QuanHuyen: row.QuanHuyen || '', XaPhuong: row.XaPhuong,
    Phone: row.Phone, TaxCode: row.TaxCode || '', Birthday: row.Birthday || new Date('1900-01-01T00:00:00Z'),
    LoaiKhachHang: row.LoaiHopDong || '', KenhBan: row.PhanLoaiKhach || '',
    ThuDiTuyen: row.ThuTrongTuan || '', Latitude: 0, Longitude: 0,
    IdempotencyKey: key, RequestID: `req-customer-update-a-${suffix}`,
  };

  const first = (await executeUpdate(transaction, base)).recordset[0];
  const replay = (await executeUpdate(transaction, { ...base, RequestID: `req-customer-update-b-${suffix}` })).recordset[0];
  const conflict = (await executeUpdate(transaction, {
    ...base, ObjectName: `${changedName} conflict`, RequestID: `req-customer-update-c-${suffix}`,
  })).recordset[0];

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const changed = await new sql.Request(transaction)
    .input('ObjectID', sql.VarChar(50), TARGET_ID)
    .query('SELECT ObjectName AS CurrentName FROM dbo.CF_ObjectTbl WHERE ObjectID=@ObjectID;');
  const evidence = {
    CurrentName: changed.recordset[0] && changed.recordset[0].CurrentName,
    AuditFailClosedProof: first.Code === 'UPDATED',
  };

  if (Number(first.MsgType) !== 5 || first.Code !== 'UPDATED' || first.ObjectID !== TARGET_ID) throw new Error(`First update failed: ${JSON.stringify(first)}`);
  if (Number(replay.MsgType) !== 5 || replay.Code !== 'IDEMPOTENCY_REPLAY' || !replay.IsReplay) throw new Error(`Replay failed: ${JSON.stringify(replay)}`);
  if (Number(conflict.MsgType) !== 1 || conflict.Code !== 'IDEMPOTENCY_CONFLICT') throw new Error(`Conflict failed: ${JSON.stringify(conflict)}`);
  if (evidence.CurrentName !== changedName || !evidence.AuditFailClosedProof) {
    throw new Error(`Mutation evidence failed: ${JSON.stringify(evidence)}`);
  }

  return { originalName: row.ObjectName, keyHash, first, replay, conflict, state: evidence, probePayload: base };
}

async function main() {
  const preflight = process.argv.includes('--preflight');
  const verify = process.argv.includes('--verify');
  if (preflight && verify) throw new Error('Choose one mode.');
  const mode = preflight ? 'PREFLIGHT_ROLLBACK' : verify ? 'POSTDEPLOY_ROLLBACK_VERIFY' : 'DEPLOY_PROCEDURE_ONLY';
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('Operation is medtest-only.');

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER, port: Number(env.TEST_DB_PORT || 1433), database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER, password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 15000, requestTimeout: 180000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });
  const transaction = new sql.Transaction(pool);
  let began = false;
  let batchCount = 0;
  let evidence = null;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;
    if (!verify) batchCount = await deployDefinition(transaction);

    if (preflight || verify) {
      evidence = await mutationEvidence(transaction);
      await transaction.rollback();
    } else {
      const contract = await new sql.Request(transaction).query(`
        SELECT
          CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.API_KhachHang_Update')) LIKE '%AR_GetObjectByUserFnc(@User)%' THEN 1 ELSE 0 END AS HasScope,
          CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.API_KhachHang_Update')) LIKE '%AI_API_MutationIdempotency%' THEN 1 ELSE 0 END AS HasIdempotency,
          CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.API_KhachHang_Update')) LIKE '%UPDATE_CUSTOMER%' THEN 1 ELSE 0 END AS HasAudit,
          (SELECT COUNT(*) FROM sys.parameters WHERE object_id=OBJECT_ID('dbo.API_KhachHang_Update')) AS ParameterCount;
      `);
      evidence = contract.recordset[0];
      if (evidence.HasScope !== 1 || evidence.HasIdempotency !== 1 || evidence.HasAudit !== 1 || evidence.ParameterCount !== 17) {
        throw new Error(`Unexpected deployed contract: ${JSON.stringify(evidence)}`);
      }
      await transaction.commit();
    }
    began = false;

    if (preflight || verify) {
      const cleanRow = await pool.request()
        .input('ObjectID', sql.VarChar(50), TARGET_ID)
        .query('SELECT ObjectName AS CurrentName FROM dbo.CF_ObjectTbl WHERE ObjectID=@ObjectID;');
      const clean = {
        CurrentName: cleanRow.recordset[0] && cleanRow.recordset[0].CurrentName,
      };
      if (clean.CurrentName !== evidence.originalName) {
        throw new Error(`Rollback left residue: ${JSON.stringify(clean)}`);
      }
      evidence.rollback = clean;

      if (verify) {
        const probeTransaction = new sql.Transaction(pool);
        await probeTransaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        try {
          const probe = (await executeUpdate(probeTransaction, {
            ...evidence.probePayload,
            RequestID: `req-customer-update-probe-${Date.now()}`,
          })).recordset[0];
          if (probe.Code !== 'UPDATED' || Number(probe.MsgType) !== 5 || probe.IsReplay) {
            throw new Error(`Idempotency rollback probe failed: ${JSON.stringify(probe)}`);
          }
          evidence.rollback.IdempotencyProbe = probe.Code;
          await probeTransaction.rollback();
        } catch (error) {
          try { await probeTransaction.rollback(); } catch (_) { /* already aborted */ }
          throw error;
        }
      }
      delete evidence.probePayload;
    }

    console.log(JSON.stringify({
      Task: 'CUSTOMER-UPDATE-FIX', Status: 'PASS', Mode: mode, BatchCount: batchCount,
      BusinessRowsPersisted: 0, Evidence: evidence,
    }, null, 2));
  } finally {
    if (began) { try { await transaction.rollback(); } catch (_) { /* already aborted */ } }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'CUSTOMER-UPDATE-FIX', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
