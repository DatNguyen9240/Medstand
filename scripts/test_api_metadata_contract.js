const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'sql', 'Migrate_API_Metadata_Contract_V1_AI.sql'), 'utf8');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n', 'API_Services', 'API_GetConfig.json'), 'utf8'));
const frontend = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-api-engine.js'), 'utf8');
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
const sanitizer = nodes.get('Sanitize GetConfig Response').parameters.jsCode;

for (const column of ['ContractVersion', 'ContractChecksum', 'ContractUpdatedAt', 'ContractUpdatedBy', 'SourceOfTruth', 'ValidationRule']) {
  assert(sql.includes(column), `Migration missing ${column}`);
}
assert(sql.includes("d.ApiCode = '@cong_no_chi_tiet' AND f.FieldCode = '@MaKhachHang'"));
assert(sql.includes("d.ApiCode = '@hoa_don_chi_tiet' AND f.FieldCode = '@DocumentID'"));
assert(sql.includes("d.ApiCode = '@khao_sat360' AND f.FieldCode = '@ObjectID'"));
assert(!/SET\s+f\.IsRequired\s*=\s*1[\s\S]*FROM\s+dbo\.API_Field\s+f\s*;/i.test(sql), 'Required must not be enabled globally');

const rows = [
  { FieldCode: '@Username', IsSystemParam: 1, ContractVersion: 'v1', ContractChecksum: 'abc' },
  { FieldCode: '@ObjectID', FieldName: 'Khách hàng', IsRequired: 1, DataType: 'VARCHAR',
    ControlType: 'combobox', SourceOfTruth: 'DATASOURCE', ValidationRule: 'REQUIRED;DATASOURCE_ID_IN_SCOPE',
    ContractVersion: 'v1', ContractChecksum: 'abc', UpdatedAt: 'now', UpdatedBy: 'test' }
];
const output = new Function('$input', sanitizer)({ all: () => rows.map((json) => ({ json })) })[0].json;
assert.strictEqual(output.contract.version, 'v1');
assert.strictEqual(output.contract.checksum, 'abc');
assert.strictEqual(output.filters.length, 1);
assert.strictEqual(output.filters[0].Required, true);
assert.strictEqual(output.filters[0].SourceOfTruth, 'DATASOURCE');
assert.strictEqual(output.filters[0].ValidationRule, 'REQUIRED;DATASOURCE_ID_IN_SCOPE');
assert(frontend.includes('item.contract.version !== incomingVersion'));
assert(frontend.includes('Date.now() - Number(cachedConfig.__cachedAt || 0) < 300000'));

console.log('API metadata contract tests passed.');
