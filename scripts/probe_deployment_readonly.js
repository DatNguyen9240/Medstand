'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://medtest.bms7.net';
const OUT = path.join(ROOT, 'reports', 'deployment-readonly-2026-08-10');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FILES = [
  ['app.bundle.min.js', '/src/js/dist/app.bundle.min.js'],
  ['chatbot-core.bundle.min.js', '/chatbot-widget/js/chatbot-core.bundle.min.js'],
  ['chatbot.bundle.min.js', '/chatbot-widget/js/chatbot.bundle.min.js'],
];

const sha256 = (body) => crypto.createHash('sha256').update(body).digest('hex');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result || {});
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const indexResponse = await fetch(`${BASE}/?probe=${Date.now()}`, { headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } });
  const html = await indexResponse.text();
  const artifacts = [];
  for (const [name, urlPath] of FILES) {
    const version = (html.match(new RegExp(`${name.replaceAll('.', '\\.')}(?:\\?v=)([\\d.]+)`)) || [])[1] || null;
    const url = `${BASE}${urlPath}${version ? `?v=${version}` : ''}`;
    const response = await fetch(url, { headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } });
    const body = Buffer.from(await response.arrayBuffer());
    artifacts.push({ name, version, url, httpStatus: response.status, bytes: body.length, sha256: sha256(body) });
  }

  const port = await freePort();
  const profile = path.join(OUT, `chrome-profile-${Date.now()}`);
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--ignore-certificate-errors', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let cdp;
  try {
    let target;
    for (let i = 0; i < 60 && !target; i += 1) {
      await delay(250);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = targets.find((item) => item.type === 'page');
      } catch (_) {}
    }
    if (!target) throw new Error('Chrome CDP did not start');
    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `${BASE}/index.html` });
    await delay(3000);
    await evaluate(cdp, `document.cookie='auth_token=readonly-ui-probe;path=/;SameSite=Strict;Secure'; localStorage.setItem('auth_user', JSON.stringify({UserName:'READONLY.PROBE',DisplayName:'Read-only probe'})); true`);
    await cdp.send('Page.navigate', { url: `${BASE}/#/chatbot` });
    await delay(10000);
    const browser = await evaluate(cdp, `({
      url: location.href,
      title: document.title,
      apiEngine: typeof window.ApiEngine,
      orderDraft: typeof window.MedstandOrderDraft,
      tierFilter: Boolean(document.querySelector('[data-tier-filter="tier"]')),
      chatbotInput: Boolean(document.querySelector('#chat-input')),
      scripts: Array.from(document.scripts).map(s => s.src).filter(Boolean),
      bodyText: document.body.innerText.slice(0, 600)
    })`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(OUT, 'chatbot-readonly.png'), Buffer.from(shot.data, 'base64'));
    const result = { checkedAt: new Date().toISOString(), baseUrl: BASE, mutationRequestsSent: 0, artifacts, browser, screenshot: path.join(OUT, 'chatbot-readonly.png') };
    fs.writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (cdp?.ws) cdp.ws.close();
    chrome.kill();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
