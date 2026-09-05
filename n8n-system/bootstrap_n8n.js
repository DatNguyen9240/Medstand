'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const systemDir = __dirname;
const rootDir = path.resolve(systemDir, '..');
const workflowDir = path.join(rootDir, 'n8n');
const manifestPath = path.join(workflowDir, 'workflow-manifest.json');
const envPath = path.join(rootDir, '.env');
const userFolder = path.resolve(process.env.N8N_USER_FOLDER || path.join(systemDir, 'n8n_data'));
const portableNode = path.join(systemDir, '.bin', 'node-v22.14.0-win-x64', 'node.exe');
const nodeExe = process.env.NODE_EXE || (fs.existsSync(portableNode) ? portableNode : process.execPath);
const n8nBin = path.join(systemDir, 'n8n_data', 'npm_global', 'node_modules', 'n8n', 'bin', 'n8n');
const markerPath = path.join(userFolder, '.medstand-bootstrap.json');
const dryRun = process.argv.includes('--check');
const supportedN8nVersion = '2.8.4';

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function fail(message) {
  const error = new Error(message);
  error.reported = true;
  console.error(`[bootstrap] ERROR: ${message}`);
  throw error;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`Khong doc duoc JSON ${path.relative(rootDir, filePath)}: ${error.message}`);
  }
}

function resolveInside(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`Duong dan nam ngoai n8n/: ${relativePath}`);
  return resolved;
}

function valueFromEnv(spec) {
  const raw = process.env[spec.env];
  const value = raw === undefined || raw === '' ? spec.default : raw;
  if (spec.transform === 'sha256') {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
  }
  if (spec.type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) fail(`${spec.env} phai la mot so hop le.`);
    return parsed;
  }
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (/^(1|true|yes|on)$/i.test(String(value))) return true;
    if (/^(0|false|no|off)$/i.test(String(value))) return false;
    fail(`${spec.env} phai la true hoac false.`);
  }
  return value === undefined ? '' : String(value);
}

function getChildWorkflowId(node) {
  const reference = node.parameters && node.parameters.workflowId;
  if (typeof reference === 'string') return reference;
  return reference && typeof reference.value === 'string' ? reference.value : '';
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.workflows) || !manifest.workflows.length) {
    fail('workflow-manifest.json khong dung schemaVersion 1.');
  }

  const ids = new Set();
  const webhookPaths = new Map();
  const credentialRefs = new Map();
  const workflows = manifest.workflows.map((entry) => {
    if (!entry.file || !entry.id || typeof entry.publish !== 'boolean') fail('Moi workflow can file, id va publish.');
    if (ids.has(entry.id)) fail(`Workflow ID bi trung trong manifest: ${entry.id}`);

    const filePath = resolveInside(workflowDir, entry.file);
    if (!fs.existsSync(filePath)) fail(`Thieu workflow: ${entry.file}`);
    const workflow = readJson(filePath);
    if (!workflow || !Array.isArray(workflow.nodes) || !workflow.connections) fail(`Workflow khong hop le: ${entry.file}`);
    if (workflow.id && workflow.id !== entry.id) fail(`ID lech o ${entry.file}: JSON=${workflow.id}, manifest=${entry.id}`);

    for (const node of workflow.nodes) {
      if (node.type === 'n8n-nodes-base.executeWorkflow') {
        const childId = getChildWorkflowId(node);
        if (!childId || !ids.has(childId)) {
          fail(`${entry.file} goi workflow con ${childId || '<rong>'} nhung workflow con phai dung truoc no trong manifest.`);
        }
      }
      if (entry.publish && node.type === 'n8n-nodes-base.webhook') {
        const webhookPath = node.parameters && node.parameters.path;
        if (webhookPath && webhookPaths.has(webhookPath)) {
          fail(`Webhook path bi trung: ${webhookPath} (${webhookPaths.get(webhookPath)} va ${entry.file}).`);
        }
        if (webhookPath) webhookPaths.set(webhookPath, entry.file);
      }
      for (const [type, credential] of Object.entries(node.credentials || {})) {
        if (!credential || !credential.id) fail(`Credential ${type} tai node "${node.name}" trong ${entry.file} khong co ID.`);
        credentialRefs.set(`${type}:${credential.id}`, { type, id: credential.id, file: entry.file });
      }
    }
    ids.add(entry.id);
    return { ...entry, filePath, workflow: { ...workflow, id: entry.id, active: false } };
  });

  const credentials = Array.isArray(manifest.credentials) ? manifest.credentials : [];
  const credentialKeys = new Set(credentials.map((credential) => `${credential.type}:${credential.id}`));
  for (const [key, reference] of credentialRefs) {
    if (!credentialKeys.has(key)) fail(`Manifest thieu credential ${reference.type}/${reference.id} cho ${reference.file}.`);
  }
  return { workflows, credentials, webhookPaths };
}

function runN8n(args, options = {}) {
  if (!fs.existsSync(n8nBin)) fail(`Thieu n8n CLI: ${n8nBin}. Hay chay start_n8n.bat de cai n8n.`);
  const result = spawnSync(nodeExe, [n8nBin, ...args], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stdout && !options.quiet) process.stdout.write(result.stdout);
  if (result.stderr && !options.quiet) process.stderr.write(result.stderr);
  if (result.error) fail(`Khong chay duoc n8n ${args[0]}: ${result.error.message}`);
  if (result.status !== 0) fail(`n8n ${args[0]} that bai (exit ${result.status}).`);
  return result;
}

function validateN8nVersion() {
  const packagePath = path.join(path.dirname(n8nBin), '..', 'package.json');
  if (!fs.existsSync(packagePath)) fail(`Thieu n8n package.json: ${packagePath}`);
  const installedVersion = readJson(packagePath).version;
  if (installedVersion !== supportedN8nVersion) {
    fail(`n8n version khong khop: can ${supportedN8nVersion}, hien tai ${installedVersion}.`);
  }
}

async function waitForN8n(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
      }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`n8n khong san sang tai ${url} sau ${Math.round(timeoutMs / 1000)} giay.`);
}

async function ensureOwner() {
  const host = ['0.0.0.0', '::'].includes(process.env.N8N_HOST) ? '127.0.0.1' : (process.env.N8N_HOST || '127.0.0.1');
  const baseUrl = `http://${host}:${process.env.N8N_PORT || '5678'}`;
  const settingsUrl = `${baseUrl}/rest/settings`;
  let child = spawn(nodeExe, [n8nBin, 'start'], {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });

  try {
    console.log('[bootstrap] Khoi tao/kiem tra database n8n...');
    const settings = await waitForN8n(settingsUrl, Number(process.env.N8N_BOOTSTRAP_TIMEOUT_MS || 120000));

    const needsOwner = Boolean(settings && settings.userManagement && settings.userManagement.showSetupOnFirstLoad);
    if (!needsOwner) return;
    const required = ['N8N_OWNER_EMAIL', 'N8N_OWNER_FIRST_NAME', 'N8N_OWNER_LAST_NAME', 'N8N_OWNER_PASSWORD'];
    const missing = required.filter((key) => !String(process.env[key] || '').trim());
    if (missing.length) fail(`n8n moi can tao owner. Thieu trong .env: ${missing.join(', ')}`);

    const response = await fetch(`${baseUrl}/rest/owner/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.N8N_OWNER_EMAIL,
        firstName: process.env.N8N_OWNER_FIRST_NAME,
        lastName: process.env.N8N_OWNER_LAST_NAME,
        password: process.env.N8N_OWNER_PASSWORD,
      }),
    });
    if (!response.ok) fail(`Tao n8n owner that bai (${response.status}): ${await response.text()}`);
    console.log('[bootstrap] Da tao n8n owner tu .env.');
  } finally {
    if (child) {
      child.kill();
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
          resolve();
        }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  }
}

function buildCredentials(definitions) {
  return definitions.map((definition) => {
    const missing = (definition.requiredEnv || []).filter((key) => !String(process.env[key] || '').trim());
    if (missing.length) fail(`Thieu bien moi truong cho credential ${definition.name}: ${missing.join(', ')}`);
    const data = {};
    for (const [key, spec] of Object.entries(definition.data || {})) data[key] = valueFromEnv(spec);
    return { id: definition.id, name: definition.name, type: definition.type, data };
  });
}

function readExistingCredentials(tempDir) {
  const outputPath = path.join(tempDir, 'existing-credentials.json');
  const result = spawnSync(nodeExe, [n8nBin, 'export:credentials', '--all', `--output=${outputPath}`], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) fail(`Khong kiem tra duoc credentials n8n hien co: ${result.error.message}`);
  if (result.status !== 0 || !fs.existsSync(outputPath)) return [];

  const credentials = readJson(outputPath);
  if (!Array.isArray(credentials)) fail('Danh sach credentials n8n hien co khong hop le.');
  return credentials.map(({ id, name, type }) => ({ id, name, type }));
}

function resolveCredentialPlan(definitions, existingCredentials) {
  const importDefinitions = [];
  const idMap = new Map();

  for (const definition of definitions) {
    const key = `${definition.type}:${definition.id}`;
    const missing = (definition.requiredEnv || []).filter((envName) => !String(process.env[envName] || '').trim());
    if (!missing.length) {
      importDefinitions.push(definition);
      idMap.set(key, definition.id);
      continue;
    }

    const exact = existingCredentials.find((credential) => credential.id === definition.id && credential.type === definition.type);
    const sameNameAndType = existingCredentials.filter((credential) => (
      credential.type === definition.type && credential.name === definition.name
    ));
    const preserved = exact || (sameNameAndType.length === 1 ? sameNameAndType[0] : null);
    if (!preserved) {
      fail(`Thieu bien moi truong cho credential ${definition.name}: ${missing.join(', ')}. Khong tim thay credential cu de giu lai.`);
    }

    idMap.set(key, preserved.id);
    console.warn(`[bootstrap] WARN: Giu credential ma hoa cu cho ${definition.name}; thieu ${missing.join(', ')}.`);
  }

  return { importDefinitions, idMap };
}

function remapWorkflowCredentialIds(workflow, idMap) {
  const cloned = JSON.parse(JSON.stringify(workflow));
  for (const node of cloned.nodes || []) {
    for (const [type, credential] of Object.entries(node.credentials || {})) {
      const replacement = credential && idMap.get(`${type}:${credential.id}`);
      if (replacement) credential.id = replacement;
    }
  }
  return cloned;
}

function getManifestHash(manifest, workflows) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(manifest));
  for (const definition of manifest.credentials || []) {
    for (const envName of definition.requiredEnv || []) hash.update(`${envName}=${process.env[envName] || ''}\n`);
    for (const spec of Object.values(definition.data || {})) hash.update(`${spec.env}=${process.env[spec.env] || ''}\n`);
  }
  for (const entry of workflows) hash.update(fs.readFileSync(entry.filePath));
  return hash.digest('hex');
}

function listWorkflowIds() {
  const result = runN8n(['list:workflow'], { quiet: true });
  const output = `${result.stdout}\n${result.stderr}`
    .replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');
  return new Set(output.split(/\r?\n/)
    .map((line) => line.match(/([A-Za-z0-9_-]+)\|/))
    .filter(Boolean)
    .map((match) => match[1]));
}

function getMarker() {
  if (!fs.existsSync(markerPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function findExistingEncryptionKey() {
  for (const relativePath of ['config', path.join('.n8n', 'config')]) {
    const configPath = path.join(userFolder, relativePath);
    if (!fs.existsSync(configPath)) continue;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (typeof config.encryptionKey === 'string' && config.encryptionKey) return config.encryptionKey;
    } catch (_) {}
  }
  return '';
}

async function main() {
  loadEnv(envPath);
  process.env.N8N_USER_FOLDER = userFolder;
  process.env.N8N_HOST ||= '127.0.0.1';
  process.env.N8N_PORT ||= '5678';
  process.env.N8N_PROTOCOL ||= 'http';
  process.env.N8N_BLOCK_ENV_ACCESS_IN_NODE ||= 'false';

  if (!dryRun && process.env.N8N_BOOTSTRAP !== '1') {
    fail('Tu choi chay import truc tiep. Hay dung n8n-system\\start_n8n.bat de bootstrap khi n8n da dung.');
  }

  const manifest = readJson(manifestPath);
  const validated = validateManifest(manifest);
  validateN8nVersion();
  console.log(`[bootstrap] Manifest hop le: ${validated.workflows.length} workflows, ${validated.credentials.length} credentials, ${validated.webhookPaths.size} webhooks.`);
  if (dryRun) return;

  fs.mkdirSync(userFolder, { recursive: true });
  const configuredEncryptionKey = String(process.env.N8N_ENCRYPTION_KEY || '').trim();
  const existingEncryptionKey = findExistingEncryptionKey();
  if (!configuredEncryptionKey && existingEncryptionKey) {
    process.env.N8N_ENCRYPTION_KEY = existingEncryptionKey;
    console.warn('[bootstrap] WARN: Dang dung encryption key cua n8n_data cu. Hay dua key nay vao .env truoc khi chuyen server.');
  } else if (!configuredEncryptionKey) {
    fail('Thieu N8N_ENCRYPTION_KEY trong .env. Khong duoc doi key sau khi da tao credentials.');
  } else if (existingEncryptionKey && configuredEncryptionKey !== existingEncryptionKey) {
    fail('N8N_ENCRYPTION_KEY khong khop n8n_data hien tai. Dung lai de tranh mat credentials.');
  }

  const manifestHash = getManifestHash(manifest, validated.workflows);
  const marker = getMarker();
  if (marker && marker.schemaVersion === 1 && marker.manifestHash === manifestHash) {
    const importedIds = listWorkflowIds();
    if (validated.workflows.every((entry) => importedIds.has(entry.id))) {
      // Importing or publishing one workflow from the CLI can leave other
      // workflows unpublished. Source equality therefore lets us skip the
      // import, but it must never skip publication reconciliation.
      for (const entry of validated.workflows) {
        runN8n([entry.publish ? 'publish:workflow' : 'unpublish:workflow', `--id=${entry.id}`]);
      }
      console.log('[bootstrap] Workflow source khong doi; bo qua import va da dong bo trang thai publish.');
      return;
    }
  }

  await ensureOwner();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medstand-n8n-bootstrap-'));
  try {
    const existingCredentials = readExistingCredentials(tempDir);
    const credentialPlan = resolveCredentialPlan(validated.credentials, existingCredentials);
    const credentialsPath = path.join(tempDir, 'credentials.json');
    if (credentialPlan.importDefinitions.length) {
      fs.writeFileSync(credentialsPath, JSON.stringify(buildCredentials(credentialPlan.importDefinitions)), { encoding: 'utf8', mode: 0o600 });
      console.log('[bootstrap] Import/cap nhat credentials co cau hinh trong .env...');
      runN8n(['import:credentials', `--input=${credentialsPath}`]);
    }

    for (let index = 0; index < validated.workflows.length; index += 1) {
      const entry = validated.workflows[index];
      const importPath = path.join(tempDir, `${String(index).padStart(2, '0')}-${entry.id}.json`);
      const workflow = remapWorkflowCredentialIds(entry.workflow, credentialPlan.idMap);
      fs.writeFileSync(importPath, JSON.stringify(workflow), 'utf8');
      console.log(`[bootstrap] Import ${entry.id}: ${entry.file}`);
      runN8n(['import:workflow', `--input=${importPath}`]);
    }

    const importedIds = listWorkflowIds();
    const missingIds = validated.workflows.map((entry) => entry.id).filter((id) => !importedIds.has(id));
    if (missingIds.length) fail(`Import xong nhung thieu workflow ID: ${missingIds.join(', ')}`);

    for (const entry of validated.workflows) {
      runN8n([entry.publish ? 'publish:workflow' : 'unpublish:workflow', `--id=${entry.id}`]);
    }

    fs.writeFileSync(markerPath, JSON.stringify({
      schemaVersion: 1,
      manifestHash,
      importedAt: new Date().toISOString(),
      workflowIds: validated.workflows.map((entry) => entry.id),
    }, null, 2), 'utf8');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('[bootstrap] Hoan tat: ID workflow con da duoc giu nguyen va workflow production da publish.');
}

main().catch((error) => {
  if (!error.reported) console.error(error.stack || error.message);
  process.exitCode = 1;
});
