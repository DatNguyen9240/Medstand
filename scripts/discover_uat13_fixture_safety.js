'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { testDbConfig } = require('./lib/test-db-config');

const root = path.resolve(__dirname, '..');
const groups = [
  { id: 'MB13', users: ['QLBH013.MED', 'NAMDINHB.MED'] },
  { id: 'MB16', users: ['QLBH016.MED', 'BACNINHA.MED'] },
  { id: 'MT05', users: ['QLBH005.MED', 'HUEB.MED'] },
  { id: 'MT10', users: ['QLBH010.MED', 'DANANGA.MED'] },
  { id: 'MN02', users: ['QLMN2', 'CanThoA'] },
  { id: 'MNMD', users: ['QLMD1', 'BinhPhuocA'] },
  { id: 'MN24', users: ['QLBH024.MED'] },
];

async function rows(pool, query, inputs = {}) {
  const request = pool.request();
  for (const [name, value] of Object.entries(inputs)) request.input(name, sql.VarChar(50), value);
  return (await request.query(query)).recordset;
}

async function main() {
  const config = testDbConfig(root);
  assert(/medtest/i.test(config.database), `Refusing discovery outside medtest: ${config.database}`);
  const pool = await sql.connect(config);
  try {
    const requiredColumns = await rows(pool, `
      SELECT t.name AS TableName, c.name AS ColumnName, ty.name AS DataType,
             c.is_nullable, c.is_identity, dc.definition AS DefaultDefinition
      FROM sys.tables t
      JOIN sys.columns c ON c.object_id = t.object_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      WHERE t.name IN ('AR_InvoiceTbl', 'AR_InvoiceDetailTbl')
        AND c.is_identity = 0 AND c.is_nullable = 0 AND dc.object_id IS NULL
      ORDER BY t.name, c.column_id;
    `);
    const triggers = await rows(pool, `
      SELECT OBJECT_NAME(parent_id) AS TableName, name AS TriggerName, is_disabled,
             OBJECT_DEFINITION(object_id) AS Definition
      FROM sys.triggers
      WHERE parent_id IN (OBJECT_ID('dbo.AR_InvoiceTbl'), OBJECT_ID('dbo.AR_InvoiceDetailTbl'));
    `);
    const foreignKeys = await rows(pool, `
      SELECT OBJECT_NAME(f.parent_object_id) AS TableName, f.name AS ConstraintName,
             COL_NAME(fc.parent_object_id, fc.parent_column_id) AS ColumnName,
             OBJECT_NAME(f.referenced_object_id) AS ReferencedTable,
             COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS ReferencedColumn
      FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = f.object_id
      WHERE f.parent_object_id IN (OBJECT_ID('dbo.AR_InvoiceTbl'), OBJECT_ID('dbo.AR_InvoiceDetailTbl'));
    `);

    const groupResults = [];
    for (const group of groups) {
      const scopeSets = [];
      const userInfo = [];
      for (const username of group.users) {
        const scope = await rows(pool, `
          SELECT O.ObjectID
          FROM dbo.AR_GetObjectByUserFnc(@Username) S
          JOIN dbo.CF_ObjectTbl O WITH (NOLOCK) ON O.ObjectID = S.ObjectID
          WHERE ISNULL(O.isCustomer, 0) = 1 AND ISNULL(O.isDisable, 0) = 0;
        `, { Username: username });
        scopeSets.push(new Set(scope.map((row) => row.ObjectID)));
        const info = await rows(pool, `
          SELECT UserName, EmployeeID, ManagerID, BranchID, Manager, UserGroupID
          FROM dbo.SY_User WITH (NOLOCK) WHERE UserName = @Username;
        `, { Username: username });
        userInfo.push({ ...info[0], scopeCount: scope.length });
      }
      const intersection = [...scopeSets[0]].filter((id) => scopeSets.every((set) => set.has(id))).sort();
      const customerIds = intersection.slice(0, 5);
      const customers = customerIds.length ? await rows(pool, `
        SELECT ObjectID, ObjectName, BranchID
        FROM dbo.CF_ObjectTbl WITH (NOLOCK)
        WHERE ObjectID IN (${customerIds.map((_, index) => `@C${index}`).join(',')})
        ORDER BY ObjectID;
      `, Object.fromEntries(customerIds.map((id, index) => [`C${index}`, id]))) : [];
      groupResults.push({ ...group, userInfo, intersectionCount: intersection.length, customers });
    }

    const output = {
      capturedAt: new Date().toISOString(),
      database: config.database,
      requiredColumns,
      triggers: triggers.map((row) => ({
        tableName: row.TableName,
        triggerName: row.TriggerName,
        isDisabled: row.is_disabled,
        definition: row.Definition,
      })),
      foreignKeys,
      groups: groupResults,
    };
    const reportPath = path.join(root, 'reports', 'business-rule-v1', 'uat13-fixture-safety-discovery.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(output, null, 2), 'utf8');
    process.stdout.write(`${JSON.stringify({
      database: output.database,
      requiredColumns,
      triggerCount: triggers.length,
      foreignKeyCount: foreignKeys.length,
      groups: groupResults,
      reportPath,
    }, null, 2)}\n`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
