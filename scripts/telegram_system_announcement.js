'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((line) => line.match(/^\s*([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
}

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

async function requestJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_) {}
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function telegram(apiBase, token, method, body) {
  const { response, payload } = await requestJson(`${apiBase}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram ${method} failed: ${payload?.description || `HTTP ${response.status}`}`);
  }
  return payload.result;
}

async function verify(env) {
  const token = String(env.TELEGRAM_CHATBOT_BOT_TOKEN || '').trim();
  const chatId = String(env.TELEGRAM_ANNOUNCEMENT_CHAT_ID || '').trim();
  const apiBase = String(env.TELEGRAM_CHATBOT_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
  if (!token) throw new Error('Missing TELEGRAM_CHATBOT_BOT_TOKEN.');
  if (!/^-100\d{6,16}$/.test(chatId)) throw new Error('TELEGRAM_ANNOUNCEMENT_CHAT_ID must be a private channel ID.');

  const me = await telegram(apiBase, token, 'getMe', {});
  const chat = await telegram(apiBase, token, 'getChat', { chat_id: chatId });
  const membership = await telegram(apiBase, token, 'getChatMember', { chat_id: chatId, user_id: me.id });
  const administrator = ['administrator', 'creator'].includes(String(membership.status || ''));
  const canPost = membership.status === 'creator' || membership.can_post_messages === true;
  const canEdit = membership.status === 'creator' || membership.can_edit_messages === true;
  if (chat.type !== 'channel') throw new Error('Configured Telegram chat is not a channel.');
  if (!administrator || !canPost) throw new Error('Bot must be a channel administrator with Post Messages permission.');

  return {
    task: 'TELEGRAM-SYSTEM-ANNOUNCEMENT',
    mode: 'VERIFY',
    channelTitle: String(chat.title || ''),
    botUsername: String(me.username || ''),
    administrator,
    canPostMessages: canPost,
    canEditMessages: canEdit,
    status: 'PASS',
  };
}

async function publish(env) {
  if (!process.argv.includes('--apply')) throw new Error('Publishing requires explicit --apply.');
  const type = argument('--type', 'INFO').trim().toUpperCase();
  const title = argument('--title').trim();
  const message = argument('--message').trim();
  if (!title || !message) throw new Error('--title and --message are required.');

  const token = String(env.TELEGRAM_CHATBOT_BOT_TOKEN || '').trim();
  const endpoint = new URL(String(env.TELEGRAM_ANNOUNCEMENT_N8N_URL || 'http://127.0.0.1:5678/webhook/telegram-system-announcement'));
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname.toLowerCase())) {
    throw new Error('TELEGRAM_ANNOUNCEMENT_N8N_URL must use HTTP on localhost only.');
  }
  const localKey = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const { response, payload } = await requestJson(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-medstand-telegram-poller-key': localKey,
    },
    body: JSON.stringify({ type, title, message }),
  }, 30000);
  if (!response.ok || payload?.success !== true) {
    throw new Error(`Announcement publish failed: ${payload?.message || payload?.status || `HTTP ${response.status}`}`);
  }
  return {
    task: 'TELEGRAM-SYSTEM-ANNOUNCEMENT',
    mode: 'PUBLISH',
    type,
    status: 'PASS',
  };
}

async function main() {
  const env = { ...loadEnv('.env'), ...loadEnv('.env.uat.local'), ...process.env };
  const result = process.argv.includes('--publish') ? await publish(env) : await verify(env);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'TELEGRAM-SYSTEM-ANNOUNCEMENT', status: 'ERROR', message: error.message }, null, 2));
  process.exitCode = 1;
});
