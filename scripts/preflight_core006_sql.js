'use strict';

/*
 * CORE-006/007 compile + behavior preflight.
 * Applies config and procedure inside one outer transaction on medtest, runs
 * the approved canonical cases and scope checks, then always rolls back.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');
const SQL_FILES = [
  'sql/Migrate_CORE006_Tier_Rule_V2_AI.sql',
  'sql/Module 3 - API_ChamDiemKH_AI.sql',
];

function readEnv() {
  const values = {};
  const envPath = path.join(ROOT, '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function batches(source) {
  return source.split(/^\s*GO\s*(?:--.*)?$/gim).map((part) => part.trim()).filter(Boolean);
}

function expectedTier(config, row) {
  if (row.invoiceCount12M === 0) return config.NoHistorySegment;
  if (row.netRevenue12M >= config.TierAMinNetRevenue && row.frequency6M >= config.TierAMinFrequency) return 'A';
  if (row.netRevenue12M >= config.TierBMinNetRevenue && row.frequency6M >= config.TierBMinFrequency) return 'B';
  return 'C';
}

async function executeTier(transaction, username, customerId, tier) {
  const request = new sql.Request(transaction)
    .input('Username', sql.VarChar(50), username)
    .input('MaKhachHang', sql.NVarChar(100), customerId || '')
    .input('NhomFilter', sql.VarChar(50), tier || '')
    .input('Page', sql.Int, 1)
    .input('PageSize', sql.Int, 1)
    .input('AsOfDate', sql.Date, new Date('2026-08-03T00:00:00Z'));
  const response = await request.execute('dbo.API_ChamDiemKH_AI');
  return (response.recordset || [])[0] || null;
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') {
    throw new Error(`Preflight chỉ được chạy trên medtest; hiện tại là ${env.TEST_DB_DATABASE || '(empty)'}`);
  }

  const procedureSource = fs.readFileSync(path.join(ROOT, SQL_FILES[1]), 'utf8');
  const staticChecks = {
    readsApprovedConfig: procedureSource.includes('AI_BusinessRuleConfigTbl') && procedureSource.includes("Status = 'APPROVED'"),
    noThresholdLiteral25M: !procedureSource.includes('25000000'),
    noThresholdLiteral5M: !procedureSource.includes('5000000'),
    noViewerPercentileTier: !procedureSource.includes('PERCENTILE_CONT'),
    noDraftRuleLabel: !procedureSource.includes('BR-TIER-V1-DRAFT'),
  };
  if (Object.values(staticChecks).some((value) => !value)) {
    throw new Error(`Static no-hardcode check failed: ${JSON.stringify(staticChecks)}`);
  }

  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 180000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  const transaction = new sql.Transaction(pool);
  let began = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    began = true;

    const compiled = [];
    for (const relativePath of SQL_FILES) {
      let count = 0;
      for (const batch of batches(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'))) {
        count += 1;
        await new sql.Request(transaction).batch(batch);
      }
      compiled.push({ file: relativePath, batches: count });
    }

    const configRows = (await new sql.Request(transaction).query(`
SELECT ConfigKey, ConfigValue
FROM dbo.AI_BusinessRuleConfigTbl
WHERE RuleCode = 'BR-TIER-005'
  AND RuleVersion = '2.0.0'
  AND Status = 'APPROVED'
  AND EffectiveFrom <= SYSUTCDATETIME()
  AND (EffectiveTo IS NULL OR EffectiveTo > SYSUTCDATETIME());`)).recordset;
    const rawConfig = Object.fromEntries(configRows.map((row) => [row.ConfigKey, row.ConfigValue]));
    const config = {
      NoHistorySegment: rawConfig.NoHistorySegment,
      TierAMinNetRevenue: Number(rawConfig.TierAMinNetRevenue),
      TierAMinFrequency: Number(rawConfig.TierAMinFrequency),
      TierBMinNetRevenue: Number(rawConfig.TierBMinNetRevenue),
      TierBMinFrequency: Number(rawConfig.TierBMinFrequency),
    };

    const canonical = [
      { id: 'ABC-01', invoiceCount12M: 0, frequency6M: 0, netRevenue12M: 0, expected: 'UNRATED' },
      { id: 'ABC-02', invoiceCount12M: 6, frequency6M: 6, netRevenue12M: 25000000, expected: 'A' },
      { id: 'ABC-03', invoiceCount12M: 7, frequency6M: 5, netRevenue12M: 40000000, expected: 'B' },
      { id: 'ABC-04', invoiceCount12M: 2, frequency6M: 2, netRevenue12M: 5000000, expected: 'B' },
      { id: 'ABC-05', invoiceCount12M: 1, frequency6M: 1, netRevenue12M: 100000000, expected: 'C' },
      { id: 'ABC-06', invoiceCount12M: 20, frequency6M: 20, netRevenue12M: 4999999, expected: 'C' },
      { id: 'ABC-07', invoiceCount12M: 7, frequency6M: 7, netRevenue12M: 24000000, expected: 'B' },
      { id: 'ABC-08', invoiceCount12M: 2, frequency6M: 2, netRevenue12M: -500000, expected: 'C' },
      { id: 'ABC-09', invoiceCount12M: 1, frequency6M: 1, netRevenue12M: 210000, expected: 'C' },
    ].map((row) => ({ ...row, actual: expectedTier(config, row) }));
    const canonicalFailures = canonical.filter((row) => row.actual !== row.expected);
    if (canonicalFailures.length) throw new Error(`Canonical cases failed: ${JSON.stringify(canonicalFailures)}`);

    const pairs = [
      ['NDB001', 'QLBH013.MED', 'NAMDINHB.MED'],
      ['HUEA043', 'QLBH005.MED', 'HUEB.MED'],
      ['DL012', 'QLMN2', 'CanThoA'],
    ];
    const scopeChecks = [];
    for (const [customerId, manager, sale] of pairs) {
      const managerRow = await executeTier(transaction, manager, customerId, '');
      const saleRow = await executeTier(transaction, sale, customerId, '');
      const pass = Boolean(managerRow && saleRow
        && managerRow.Nhom === saleRow.Nhom
        && Number(managerRow.DiemTongHop) === Number(saleRow.DiemTongHop)
        && managerRow.RuleVersion === 'BR-TIER-005/2.0.0'
        && saleRow.RuleVersion === 'BR-TIER-005/2.0.0');
      scopeChecks.push({
        customerId, manager, sale,
        managerObjectId: managerRow?.ObjectID || null,
        saleObjectId: saleRow?.ObjectID || null,
        managerTier: managerRow?.Nhom || null,
        saleTier: saleRow?.Nhom || null,
        managerScore: managerRow?.DiemTongHop ?? null,
        saleScore: saleRow?.DiemTongHop ?? null,
        managerNetRevenue12M: managerRow?.DoanhSo12Thang ?? null,
        saleNetRevenue12M: saleRow?.DoanhSo12Thang ?? null,
        managerFrequency6M: managerRow?.SoLanMua6Thang ?? null,
        saleFrequency6M: saleRow?.SoLanMua6Thang ?? null,
        managerInvoiceCount12M: managerRow?.SoHoaDon12Thang ?? null,
        saleInvoiceCount12M: saleRow?.SoHoaDon12Thang ?? null,
        pass,
      });
    }
    if (scopeChecks.some((row) => !row.pass)) {
      throw new Error(`Cross-viewer consistency failed: ${JSON.stringify(scopeChecks)}`);
    }

    const unrated = await executeTier(transaction, 'NAMDINHB.MED', '', 'UNRATED');
    if (!unrated
      || unrated.Nhom !== 'UNRATED'
      || unrated.RiskLevel !== 'UNKNOWN'
      || unrated.DiemTongHop !== null
      || String(unrated.XuHuong || '').includes('NEW_CUSTOMER')) {
      throw new Error(`UNRATED runtime case failed: ${JSON.stringify(unrated)}`);
    }

    const detailByName = await executeTier(transaction, 'QLBH013.MED', 'Quầy thuốc Thanh Hải', '');
    if (!detailByName || detailByName.ObjectID !== 'TBA112' || Number(detailByName.TotalRows) !== 1) {
      throw new Error(`Customer-name detail failed: ${JSON.stringify(detailByName)}`);
    }

    const unknownCustomer = await executeTier(transaction, 'QLBH013.MED', 'CORE007_KHONG_TON_TAI', '');
    if (!unknownCustomer || unknownCustomer.Code !== 'NO_DATA' || unknownCustomer.TotalRows !== undefined) {
      throw new Error(`Customer-name fail-closed failed: ${JSON.stringify(unknownCustomer)}`);
    }

    const procedureDefinition = (await new sql.Request(transaction).query(`
SELECT OBJECT_DEFINITION(OBJECT_ID(N'dbo.API_ChamDiemKH_AI')) AS Definition;`)).recordset[0].Definition;
    if (!procedureDefinition || !procedureDefinition.includes('AI_BusinessRuleConfigTbl')) {
      throw new Error('Deployed procedure definition does not read business config.');
    }

    await transaction.rollback();
    began = false;
    console.log(JSON.stringify({
      Status: 'PASS',
      Database: env.TEST_DB_DATABASE,
      Mode: 'TRANSACTION_ROLLBACK',
      PersistedChanges: false,
      StaticChecks: staticChecks,
      Compiled: compiled,
      ApprovedConfigCount: configRows.length,
      CanonicalCases: canonical,
      CrossViewerChecks: scopeChecks,
      UnratedCase: {
        ObjectID: unrated.ObjectID,
        Tier: unrated.Nhom,
        RiskLevel: unrated.RiskLevel,
        CompositeScore: unrated.DiemTongHop,
        Trend: unrated.XuHuong,
        RuleVersion: unrated.RuleVersion,
      },
      CustomerDetailCase: {
        Query: 'Quầy thuốc Thanh Hải',
        ObjectID: detailByName.ObjectID,
        TotalRows: detailByName.TotalRows,
      },
      CustomerNotFoundCase: {
        Code: unknownCustomer.Code,
        Message: unknownCustomer.Msg,
      },
    }, null, 2));
  } finally {
    if (began) {
      try { await transaction.rollback(); } catch (_) { /* connection can already be aborted */ }
    }
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'FAIL', PersistedChanges: false, Error: error.message }, null, 2));
  process.exitCode = 1;
});
