'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const config = testDbConfig(root);
const reportDir = path.join(root, 'reports', 'business-rule-v1');
const jsonPath = path.join(reportDir, 'active-api-scope-audit.json');
const markdownPath = path.join(reportDir, 'ACTIVE_API_SCOPE_AUDIT.md');

function has(source, pattern) {
  return pattern.test(String(source || ''));
}

function scopeStatus(row) {
  if (!row.objectId || !row.hasDefinition) return 'MISSING_PROCEDURE';
  if (!row.hasUsernameParameter) return 'NO_VERIFIED_USERNAME_PARAMETER';
  if (row.hasCustomerScopeFunction && row.hasBranchGuard) return 'CUSTOMER_AND_BRANCH_SCOPE_SIGNALS';
  if (row.hasWarehouseScope && row.hasBranchGuard) return 'WAREHOUSE_AND_BRANCH_SCOPE_SIGNALS';
  if (row.hasCustomerScopeFunction) return 'CUSTOMER_SCOPE_WITHOUT_EXPLICIT_BRANCH_SIGNAL';
  if (row.hasWarehouseScope) return 'WAREHOUSE_SCOPE_SIGNAL';
  if (row.hasBranchGuard) return 'BRANCH_SCOPE_SIGNAL';
  return 'USERNAME_ONLY_REVIEW_REQUIRED';
}

function markdown(report) {
  const lines = [
    '# Audit tín hiệu scope của API active trên medtest',
    '',
    `**Thời điểm:** ${report.auditedAt}`,
    '',
    `**Kết quả:** ${report.status} — ${report.apiCount} API READ active.`,
    '',
    '> Đây là audit tĩnh trên definition đang chạy, không phải bằng chứng đầy đủ rằng dữ liệu đúng phạm vi. Tín hiệu có mặt chỉ chứng minh code có marker; reviewer vẫn phải chạy cross-user/cross-branch/cross-store.',
    '',
    '| API | Procedure | Scope status | Username | Branch | Customer function | Warehouse | Dynamic SQL |',
    '|---|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.apis) {
    lines.push(`| \`${row.apiCode}\` | \`${row.storedProcedure}\` | \`${row.scopeStatus}\` | ${row.hasUsernameParameter ? 'Y' : 'N'} | ${row.hasBranchGuard ? 'Y' : 'N'} | ${row.hasCustomerScopeFunction ? 'Y' : 'N'} | ${row.hasWarehouseScope ? 'Y' : 'N'} | ${row.hasDynamicSql ? 'Y' : 'N'} |`);
  }
  lines.push(
    '',
    '## Mục phải review thủ công',
    '',
    ...report.manualReview.map((row) => `- \`${row.apiCode}\` / \`${row.storedProcedure}\`: \`${row.scopeStatus}\`.`),
    '',
    '## Quy tắc sử dụng báo cáo',
    '',
    '- Không nâng `*_SCOPE_SIGNALS` thành Security PASS chỉ dựa vào regex.',
    '- API customer-bound phải test một khách đúng scope và một khách khác branch.',
    '- API warehouse-bound phải test kho của Sale, kho nhân viên thuộc Manager và kho ngoài scope.',
    '- API có dynamic SQL phải chứng minh procedure/parameter không thể bị caller điều khiển ngoài metadata allowlist.',
    '- Nếu procedure không có `@Username`, owner phải tuyên bố rõ đó là catalog global an toàn hoặc bổ sung verified identity.',
    ''
  );
  return lines.join('\n');
}

async function main() {
  if (!/medtest/i.test(config.database)) throw new Error(`Refusing scope audit outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const result = await pool.request().query(`
      SELECT
        d.ApiCode,
        d.StoredProcedure,
        d.OperationType,
        d.ScopeResolver,
        d.OwnershipRule,
        OBJECT_ID('dbo.' + d.StoredProcedure, 'P') AS ObjectID,
        OBJECT_DEFINITION(OBJECT_ID('dbo.' + d.StoredProcedure, 'P')) AS Definition
      FROM dbo.API_Definition d WITH (NOLOCK)
      WHERE d.IsActive = 1
        AND d.OperationType = 'READ'
      ORDER BY d.ApiCode;
    `);

    const apis = result.recordset.map((item) => {
      const definition = String(item.Definition || '');
      const row = {
        apiCode: item.ApiCode,
        storedProcedure: item.StoredProcedure,
        operationType: item.OperationType,
        metadataScopeResolver: item.ScopeResolver || null,
        metadataOwnershipRule: item.OwnershipRule || null,
        objectId: item.ObjectID || null,
        hasDefinition: Boolean(definition),
        hasUsernameParameter: has(definition, /@Username\b/i),
        hasVerifiedUserLookup: has(definition, /\bSY_User\b/i),
        hasBranchGuard: has(definition, /\bBranchID\b|@SYS_?BranchID\b/i),
        hasCustomerScopeFunction: has(definition, /AR_GetObjectByUserFnc/i),
        hasWarehouseScope: has(definition, /SY_UserStoreHouseTbl|@AllowedStores|StoreHouseID/i),
        hasManagerHierarchy: has(definition, /ManagerID|@IsManager/i),
        hasGlobalBypass: has(definition, /@IsGlobal|\bADMIN\b|\bSADM\b|\bBGD\b/i),
        hasOutOfScopeContract: has(definition, /OUT_OF_SCOPE|không có quyền|khong co quyen/i),
        hasDynamicSql: has(definition, /sp_executesql|EXEC(?:UTE)?\s*\(\s*@/i),
        definitionSha256: definition
          ? crypto.createHash('sha256').update(definition).digest('hex').toUpperCase()
          : null,
      };
      row.scopeStatus = scopeStatus(row);
      return row;
    });

    const manualReview = apis.filter((row) => ![
      'CUSTOMER_AND_BRANCH_SCOPE_SIGNALS',
      'WAREHOUSE_AND_BRANCH_SCOPE_SIGNALS',
    ].includes(row.scopeStatus) || row.hasDynamicSql);

    const report = {
      status: 'STATIC_SCOPE_SIGNAL_AUDIT_COMPLETE',
      auditedAt: new Date().toISOString(),
      environment: 'medtest',
      apiCount: apis.length,
      strongSignalCount: apis.length - manualReview.length,
      manualReviewCount: manualReview.length,
      limitations: [
        'Regex markers do not prove row-level correctness.',
        'Global catalog APIs may intentionally omit user scope but require owner declaration.',
        'Runtime cross-scope tests remain mandatory.',
      ],
      apis,
      manualReview: manualReview.map(({ apiCode, storedProcedure, scopeStatus, hasDynamicSql }) => ({ apiCode, storedProcedure, scopeStatus, hasDynamicSql })),
    };

    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(markdownPath, markdown(report), 'utf8');
    console.log(JSON.stringify({
      status: report.status,
      apiCount: report.apiCount,
      strongSignalCount: report.strongSignalCount,
      manualReviewCount: report.manualReviewCount,
      jsonPath,
      markdownPath,
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
