'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const STATE_PATH = path.join(ROOT, 'n8n-system', 'storage', 'telegram-poll-offset.json');

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

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

function assertLoopbackUrl(raw) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('TELEGRAM_POLL_N8N_URL must use HTTP on localhost only.');
  }
  return url.toString();
}

function readOffset() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const offset = Number(state.offset);
    return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  } catch (_) {
    return 0;
  }
}

function saveOffset(offset) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const tempPath = `${STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({ offset, updatedAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tempPath, STATE_PATH);
}

async function requestJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  loadEnv(ENV_PATH);
  const token = required('TELEGRAM_CHATBOT_BOT_TOKEN');
  const apiBase = String(process.env.TELEGRAM_CHATBOT_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
  const ingestUrl = assertLoopbackUrl(
    process.env.TELEGRAM_POLL_N8N_URL || 'http://127.0.0.1:5678/webhook/telegram-poll-ingest',
  );
  const pollTimeout = Math.min(50, Math.max(5, Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25)));
  const localKey = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const botApi = (method) => `${apiBase}/bot${token}/${method}`;
  let offset = readOffset();
  let stopping = false;
  let failureCount = 0;

  const stop = () => { stopping = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  const telegram = async (method, body, timeoutMs = 15000) => {
    const payload = await requestJson(botApi(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }, timeoutMs);
    if (!payload || payload.ok !== true) throw new Error(`Telegram ${method} rejected the request.`);
    return payload.result;
  };

  const forward = async (update) => {
    await requestJson(ingestUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-medstand-telegram-poller-key': localKey,
      },
      body: JSON.stringify(update),
    }, 15000);
  };

  const me = await telegram('getMe');
  await telegram('deleteWebhook', { drop_pending_updates: false });
  console.log(`[telegram-poller] Ready as @${me.username || 'bot'}; local ingest only.`);

  while (!stopping) {
    try {
      const updates = await telegram('getUpdates', {
        offset,
        timeout: pollTimeout,
        limit: 50,
        allowed_updates: ['message', 'callback_query'],
      }, (pollTimeout + 10) * 1000);

      for (const update of Array.isArray(updates) ? updates : []) {
        if (!Number.isSafeInteger(update.update_id) || update.update_id < offset) continue;
        await forward(update);
        offset = update.update_id + 1;
        saveOffset(offset);
      }
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      const delayMs = Math.min(30000, 1000 * (2 ** Math.min(failureCount - 1, 5)));
      console.error(`[telegram-poller] Retry in ${Math.round(delayMs / 1000)}s: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log('[telegram-poller] Stopped.');
}

main().catch((error) => {
  console.error(`[telegram-poller] Fatal: ${error.message}`);
  process.exitCode = 1;
});
