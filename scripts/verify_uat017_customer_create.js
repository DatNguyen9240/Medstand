'use strict';

/* UAT-017 — kiểm tra read-only contract tạo khách trực tiếp qua Chatbot AI. */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function check(name, pass, detail) {
  return { Check: name, Status: pass ? 'PASS' : 'FAIL', Detail: detail };
}

async function main() {
  const env = readEnv();
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 10000 },
  });

  try {
    const dbName = (await pool.request().query('SELECT DB_NAME() AS DbName')).recordset[0].DbName;
    if (dbName !== 'medtest') throw new Error(`UAT-017 chỉ được chạy trên DB medtest; hiện tại là ${dbName}`);

    const procRows = (await pool.request().query(`
SELECT o.name AS ProcName, OBJECT_DEFINITION(o.object_id) AS Definition
FROM sys.objects o
WHERE o.type IN ('P', 'PC') AND o.name = 'API_KhachHang_Insert_AI';`)).recordset;
    const procedure = procRows[0]?.Definition || '';

    const metadata = (await pool.request().query(`
SELECT ApiCode, StoredProcedure, IsActive, OperationType, RequiredCapability
FROM dbo.API_Definition
WHERE ApiCode = '@khach_hang_insert_ai'
   OR StoredProcedure = 'API_KhachHang_Insert_AI';`)).recordset;

    const counts = (await pool.request().query(`
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.AR_ObjectNewRequireTbl WITH (NOLOCK)
   WHERE ObjectName LIKE N'UAT[_]%' OR ObjectID LIKE N'UAT[_]%') AS PendingUatRows,
  (SELECT COUNT_BIG(*) FROM dbo.CF_ObjectTbl WITH (NOLOCK)
   WHERE ObjectName LIKE N'UAT[_]%' OR ObjectID LIKE N'UAT[_]%') AS LiveUatRows;`)).recordset[0];

    const renderer = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot-renderer-create-customer.js'), 'utf8');
    const engine = fs.readFileSync(path.join(ROOT, 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');
    const envSource = fs.readFileSync(path.join(ROOT, 'env.js'), 'utf8');
    const execute = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n', 'API_Services', 'API_Execute.json'), 'utf8'));
    const enforcement = execute.nodes.find((node) => node.name === 'Enforce API Capability')?.parameters?.jsCode || '';

    const checks = [
      check('DB_IS_MEDTEST', dbName === 'medtest', dbName),
      check('AI_PROC_EXISTS', Boolean(procedure), 'dbo.API_KhachHang_Insert_AI'),
      check('AI_PROC_DIRECT_LIVE_INSERT', /INSERT\s+INTO\s+dbo\.CF_ObjectTbl/i.test(procedure), 'CF_ObjectTbl'),
      check('AI_PROC_DOES_NOT_CREATE_PENDING_REQUEST', !/INSERT\s+INTO\s+dbo\.AR_ObjectNewRequireTbl/i.test(procedure), 'không INSERT AR_ObjectNewRequireTbl'),
      check('AI_PROC_DUPLICATE_PHONE_COVERS_BOTH_TABLES', /CF_ObjectTbl/i.test(procedure) && /AR_ObjectNewRequireTbl/i.test(procedure) && /Phone/i.test(procedure), 'khách sống + yêu cầu cũ'),
      check('AI_PROC_MANAGER_ASSIGNMENT_GUARD', /@AssignedEmployeeID/i.test(procedure) && /AR_OpListEmployeeTbl/i.test(procedure) && /@SaleEmployeeID/i.test(procedure), 'Manager → Sale server-verified'),
      check('AI_PROC_RETURNS_OBJECT_ID', /AS\s+ObjectID/i.test(procedure), 'ObjectID'),
      check('FRONTEND_ENDPOINT_IS_AI', /CREATE_CUSTOMER:\s*['"]\/api\/API_KhachHang_Insert_AI['"]/.test(envSource), '/api/API_KhachHang_Insert_AI'),
      check('FRONTEND_HAS_PREVIEW_AND_EDIT', renderer.includes('ccf-preview-section') && renderer.includes('btn-edit'), 'preview/sửa lại'),
      check('FRONTEND_NUMERIC_PHONE_TAX', /phone.*tax/s.test(renderer) && /replace\(\/\[\^0-9\]\/g, ''\)/.test(renderer), 'SĐT/MST chỉ số'),
      check('FRONTEND_MANAGER_SENDS_ASSIGNEE', renderer.includes('AssignedEmployeeID') && engine.includes('AssignedEmployeeID'), 'modal + renderer'),
      check('METADATA_IS_AI_CODE', metadata.some((row) => row.ApiCode === '@khach_hang_insert_ai' && row.StoredProcedure === 'API_KhachHang_Insert_AI'), '@khach_hang_insert_ai → API_KhachHang_Insert_AI'),
      check('EXECUTE_POLICY_ONLY_OPENS_AI_CUSTOMER_MUTATION', enforcement.includes("enabledMutationApis = new Set(['@khach_hang_insert_ai'])") && !enforcement.includes("'@san_pham_trong_tam_import': 'products.import'\n};\nconst enabledMutationApis = new Set(['@khach_hang_insert_ai', '@san_pham_trong_tam_import'])"), 'customer mutation only'),
    ];

    const result = {
      GeneratedAt: new Date().toISOString(),
      Mode: 'READ_ONLY_CONTRACT_REVIEW',
      Database: dbName,
      Status: checks.every((item) => item.Status === 'PASS') ? 'PASS_READ_ONLY' : 'BLOCKED_CONTRACT_MISMATCH',
      Checks: checks,
      ApiDefinition: metadata,
      ExistingUatRows: counts,
      MutationExecuted: false,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.Status !== 'PASS_READ_ONLY') process.exitCode = 2;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Status: 'ERROR', Error: error.message }, null, 2));
  process.exitCode = 1;
});
