const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const node = workflow.nodes.find((entry) => entry.name === 'LIB ConfidenceDecision');

if (!node?.parameters?.jsCode) {
  throw new Error('LIB ConfidenceDecision was not found.');
}

let code = node.parameters.jsCode;

const legacyPermissionBlock = `// --- SECURITY & PERMISSION VALIDATION (Authorization Library) ---
const requiredScopes = llmResult.meta?.permission || [];
let hasAccess = true;
if (requiredScopes.length > 0) {
  const userPerms = userProfile.permissions || [];
  hasAccess = userPerms.includes('*:*:*') || requiredScopes.every(scope => userPerms.includes(scope));
}`;

if (code.includes(legacyPermissionBlock)) {
  code = code.replace(
    legacyPermissionBlock,
    `// Authorization is enforced once, using the server-verified identity, in
// API_Execute / Shared Auth Guard. Do not compare parser metadata with user
// permissions here: OWN, BRANCH and ALL scopes are hierarchical rather than
// exact strings, so this legacy pre-check rejected valid Manager accounts.`,
  );
}

const legacyAuthorizationBranch = `if (!hasAccess) {
  decision = 'ASK_CLARIFICATION';
  askMsg = 'AUTH001: Bạn không có quyền truy cập chức năng này.';
  decisionReasons.push('AUTH_DENIED: Missing scopes ' + requiredScopes.join(', '));
} else {
  try {`;

if (code.includes(legacyAuthorizationBranch)) {
  code = code.replace(legacyAuthorizationBranch, 'try {');
  code = code.replace('\n}\n\nconst decisionReason = decisionReasons.join', '\n\nconst decisionReason = decisionReasons.join');
}

const responseContractBlock = `    schemaVersion:   llmResult.schemaVersion || '1.0.0',
    messageType:      llmResult.messageType || normOut.messageType || 'UNKNOWN',
    responseKey:      llmResult.responseKey || null,
    supported:        Boolean(llmResult.supported),
    requiresClarification: Boolean(llmResult.requiresClarification || ['ASK_CLARIFICATION','ASK_CONFIRM'].includes(decision)),
    originalText:     normOut.originalText || normOut.rawMessage || '',
    normalizedText:   normOut.normalizedText || normOut.normalizedMessage || '',
`;

while (code.includes(responseContractBlock + responseContractBlock)) {
  code = code.replace(responseContractBlock + responseContractBlock, responseContractBlock);
}

if (code.includes('llmResult.meta?.permission') || code.includes('if (!hasAccess)')) {
  throw new Error('Legacy authorization pre-check is still present.');
}

// Compile the n8n Code node before writing the workflow back.
new Function(code);
node.parameters.jsCode = code;
fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

console.log('MAIN_AUTHORIZATION_DELEGATION_PATCH_APPLIED');
