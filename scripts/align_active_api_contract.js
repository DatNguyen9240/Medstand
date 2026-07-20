'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowFiles = [
  'n8n/API_Services/API_Execute.json',
  'n8n/API_Services/API_GetConfig.json',
  'n8n/API_Services/API_ListActive.json',
  'n8n/Shared/P0_02_UAT_Apply_Audit.json',
  'n8n/AI_Core/MAIN_ChatBot_V5.json',
];
const inactiveReadApis = ['@khach_hang_list', '@dashboard_sinh_nhat'];

function load(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function save(relativePath, value) {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function removeInactiveApiLiterals(source) {
  let result = String(source || '');
  for (const apiCode of inactiveReadApis) {
    const escaped = apiCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result
      .replace(new RegExp(`,\\s*''${escaped}''`, 'g'), '')
      .replace(new RegExp(`''${escaped}''\\s*,\\s*`, 'g'), '')
      .replace(new RegExp(`,\\s*'${escaped}'`, 'g'), '')
      .replace(new RegExp(`'${escaped}'\\s*,\\s*`, 'g'), '')
      .replace(new RegExp(`,\\s*"${escaped}"`, 'g'), '')
      .replace(new RegExp(`"${escaped}"\\s*,\\s*`, 'g'), '');
  }
  return result;
}

for (const relativePath of workflowFiles.slice(0, 4)) {
  const workflow = load(relativePath);
  for (const node of workflow.nodes || []) {
    for (const parameterName of ['jsCode', 'query']) {
      if (typeof node.parameters?.[parameterName] === 'string') {
        node.parameters[parameterName] = removeInactiveApiLiterals(node.parameters[parameterName]);
      }
    }
  }
  if (relativePath.endsWith('API_Execute.json')) {
    const identityNode = (workflow.nodes || []).find((item) => item.name === 'Apply Verified Identity');
    if (!identityNode || typeof identityNode.parameters?.jsCode !== 'string') {
      throw new Error('Apply Verified Identity code is missing.');
    }
    const keywordMapping = `const requestedApiCode = String(request.body?.ApiCode || '').toLowerCase();
if (requestedApiCode === '@tim_san_pham_theo_trieu_chung') {
  const keywordKey = Object.keys(params).find((key) => ['@keyword', '@timkiem'].includes(String(key).toLowerCase()));
  if (keywordKey && String(params[keywordKey] ?? '').trim()) {
    params['@timkiem'] = params[keywordKey];
    if (keywordKey !== '@timkiem') delete params[keywordKey];
  }
}

`;
    if (!identityNode.parameters.jsCode.includes("requestedApiCode === '@tim_san_pham_theo_trieu_chung'")) {
      const identityAnchor = "params['@Username'] = String(verifiedIdentity.internalUserId);";
      if (!identityNode.parameters.jsCode.includes(identityAnchor)) throw new Error('Identity parameter anchor changed.');
      identityNode.parameters.jsCode = identityNode.parameters.jsCode.replace(identityAnchor, keywordMapping + identityAnchor);
    }
  }
  save(relativePath, workflow);
}

const mainPath = workflowFiles[4];
const main = load(mainPath);
const normalizeInput = (main.nodes || []).find((item) => item.name === 'LIB NormalizeInput');
if (!normalizeInput || typeof normalizeInput.parameters?.jsCode !== 'string') {
  throw new Error('LIB NormalizeInput code is missing.');
}
const symptomRegistryAnchor = '  "@tra_cuu_san_pham": {';
const symptomRegistryEntry = `  "@tim_san_pham_theo_trieu_chung": {
    intent: "@tim_san_pham_theo_trieu_chung",
    workflow: "WF_SymptomProductSearch",
    permission: ["PRODUCT:READ:ALL"],
    requiresContext: false,
    cache: false,
    timeout: 10,
    fallback: "casual_chat",
    patterns: ['tim thuoc theo trieu chung', 'tìm thuốc theo triệu chứng', '@tim_san_pham_theo_trieu_chung']
  },
`;
if (!normalizeInput.parameters.jsCode.includes('"@tim_san_pham_theo_trieu_chung": {')) {
  if (!normalizeInput.parameters.jsCode.includes(symptomRegistryAnchor)) {
    throw new Error('Symptom registry anchor changed.');
  }
  normalizeInput.parameters.jsCode = normalizeInput.parameters.jsCode.replace(
    symptomRegistryAnchor,
    symptomRegistryEntry + symptomRegistryAnchor,
  );
}
normalizeInput.parameters.jsCode = normalizeInput.parameters.jsCode.replace(
  /(\"@tim_san_pham_theo_trieu_chung\":\s*\{[\s\S]*?permission:\s*)\[[^\]]*\]/,
  '$1[]',
);
const dynamicSymptomParams = `if (quickIntent?.intent === '@tim_san_pham_theo_trieu_chung') {
  quickIntent.params = { '@Keyword': rawMessage };
}

`;
if (!normalizeInput.parameters.jsCode.includes("quickIntent.params = { '@Keyword': rawMessage }")) {
  const cacheAnchor = 'const staticData = $getWorkflowStaticData(\'global\');';
  if (!normalizeInput.parameters.jsCode.includes(cacheAnchor)) throw new Error('Quick-intent cache anchor changed.');
  normalizeInput.parameters.jsCode = normalizeInput.parameters.jsCode.replace(cacheAnchor, dynamicSymptomParams + cacheAnchor);
}
const route = main.connections?.['Route Strategy']?.main;
const generated = main.connections?.['Generate Symptom Response']?.main;
if (!Array.isArray(route) || !Array.isArray(route[0])) {
  throw new Error('Route Strategy symptom connection is missing.');
}
if (!Array.isArray(generated) || !Array.isArray(generated[0])) {
  throw new Error('Generate Symptom Response connection is missing.');
}

// Redis, embeddings and vector search are optional optimizations. The canonical
// symptom command is an active, scoped SQL API and must work without them.
route[0] = [{ node: 'LIB ValidateParams', type: 'main', index: 0 }];
route[1] = [{ node: 'LIB ValidateParams', type: 'main', index: 0 }];
generated[0] = [{ node: 'Respond Fast', type: 'main', index: 0 }];
main.connections['Call API Execute'].main = [
  [{ node: 'Format Response', type: 'main', index: 0 }],
  [{ node: 'Handle SQL Error', type: 'main', index: 0 }],
];
save(mainPath, main);

console.log(JSON.stringify({
  status: 'ACTIVE_API_AND_SYMPTOM_CONTRACT_ALIGNED',
  removedInactiveReadApis: inactiveReadApis,
  symptomMode: 'CANONICAL_ACTIVE_SQL_API',
}, null, 2));
