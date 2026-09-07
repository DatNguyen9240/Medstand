'use strict';

/* Đăng ký @customer_search / @product_search vào n8n/API_Services/API_Execute.json:
   thêm vào readApis (node "Enforce API Capability") và thêm rule bắt buộc
   @SearchText (node "Validate API Request"). Sửa tại chỗ, giữ nguyên định dạng
   JSON.stringify(obj, null, 2) + newline cuối file như bản gốc. */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'n8n', 'API_Services', 'API_Execute.json');
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function patchNode(name, mutate) {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Node not found: ${name}`);
  const before = node.parameters.jsCode;
  const after = mutate(before);
  if (after === before) throw new Error(`No change applied to node: ${name} (pattern not found?)`);
  node.parameters.jsCode = after;
}

patchNode('Enforce API Capability', (code) => {
  const marker = "'@tim_san_pham_theo_trieu_chung'\n]);";
  if (!code.includes(marker)) throw new Error('readApis marker not found');
  return code.replace(
    marker,
    "'@tim_san_pham_theo_trieu_chung',\n  '@customer_search', '@product_search'\n]);"
  );
});

patchNode('Validate API Request', (code) => {
  const marker = "if (apiCode === '@goi_ydon_thuoc') requireOne(['@timkiem', '@itemid'], '@timkiem');\n";
  if (!code.includes(marker)) throw new Error('requireOne insertion point not found');
  return code.replace(
    marker,
    marker + "if (['@customer_search', '@product_search'].includes(apiCode)) requireOne(['@searchtext'], '@SearchText');\n"
  );
});

fs.writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('Patched', FILE);
