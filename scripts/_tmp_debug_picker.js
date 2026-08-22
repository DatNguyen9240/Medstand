'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[console]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:3000/pages/login.html', { waitUntil: 'networkidle0' });
  await page.type('#username', 'demo');
  await page.type('#password', '123456');
  await page.click('#btn-login');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluateOnNewDocument(() => {
    window.__attrLog = [];
    const origSetAttr = Element.prototype.setAttribute;
    const origRemoveAttr = Element.prototype.removeAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (this.id === 'global-spinner' && name === 'hidden') {
        window.__attrLog.push({ op: 'set-hidden', stack: new Error().stack.split('\n').slice(1, 5).join(' || ') });
      }
      return origSetAttr.apply(this, arguments);
    };
    Element.prototype.removeAttribute = function (name) {
      if (this.id === 'global-spinner' && name === 'hidden') {
        window.__attrLog.push({ op: 'remove-hidden', stack: new Error().stack.split('\n').slice(1, 5).join(' || ') });
      }
      return origRemoveAttr.apply(this, arguments);
    };
  });
  await page.goto('http://localhost:3000/index.html#/edit-order?id=DMB0826%2F6', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#fs-trigger-customer', { timeout: 20000 });
  const spinnerState = await page.evaluate(() => {
    const el = document.getElementById('global-spinner');
    return { hiddenAttr: el ? el.hasAttribute('hidden') : 'no element', outerHTMLStart: el ? el.outerHTML.slice(0, 200) : null };
  });
  console.log('spinner element state:', JSON.stringify(spinnerState));
  const attrLog = await page.evaluate(() => window.__attrLog);
  console.log('attr log count:', attrLog.length);
  const setCount = attrLog.filter((e) => e.op === 'set-hidden').length;
  const removeCount = attrLog.filter((e) => e.op === 'remove-hidden').length;
  console.log('set-hidden (hide calls that stuck):', setCount, '| remove-hidden (show calls):', removeCount);
  console.log(JSON.stringify(attrLog, null, 2));
  const patchInfo = await page.evaluate(() => {
    if (typeof FormSelect === 'undefined') return 'FormSelect not global';
    const orig = FormSelect.prototype._openPicker;
    window.__openPickerCalls = [];
    FormSelect.prototype._openPicker = function (id) {
      window.__openPickerCalls.push(id);
      return orig.apply(this, arguments);
    };
    return 'patched';
  });
  console.log('patchInfo:', patchInfo);
  const elemAtPoint = await page.evaluate(() => {
    const el = document.querySelector('#fs-trigger-customer');
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      clickedCoord: [cx, cy],
      topElementTag: top ? top.tagName : null,
      topElementId: top ? top.id : null,
      topElementClass: top ? top.className : null,
      isSameOrDescendant: top ? (el === top || el.contains(top)) : null,
    };
  });
  console.log('elementFromPoint check:', JSON.stringify(elemAtPoint));
  const before = await page.evaluate(() => document.querySelector('#fs-trigger-customer').outerHTML);
  console.log('BEFORE CLICK:', before.slice(0, 500));
  const dupCount = await page.evaluate(() => document.querySelectorAll('#fs-trigger-customer').length);
  console.log('duplicate #fs-trigger-customer count:', dupCount);
  const jqEvents = await page.evaluate(() => {
    if (!window.jQuery) return 'no jQuery global';
    const el = document.querySelector('#fs-trigger-customer');
    const data = window.jQuery._data ? window.jQuery._data(el, 'events') : (window.jQuery.hasOwnProperty('cache') ? 'has cache api' : 'unknown jq internals');
    return data ? JSON.stringify(Object.keys(data)) : 'no bound events found via _data';
  });
  console.log('jQuery events on element:', jqEvents);
  await page.evaluate(() => document.querySelector('#fs-trigger-customer').scrollIntoView());
  const box = await page.evaluate(() => {
    const el = document.querySelector('#fs-trigger-customer');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
  });
  console.log('bbox:', JSON.stringify(box));
  await page.evaluate(() => {
    window.__overlayLog = [];
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) if (n.classList && n.classList.contains('picker-overlay')) window.__overlayLog.push('added');
        for (const n of m.removedNodes) if (n.classList && n.classList.contains('picker-overlay')) window.__overlayLog.push('removed');
      }
    });
    mo.observe(document.body, { childList: true });
    window.__jsErrorsDuringClick = [];
    window.addEventListener('error', (e) => window.__jsErrorsDuringClick.push(e.message));
  });
  await page.click('#fs-trigger-customer');
  await new Promise((r) => setTimeout(r, 1000));
  const overlaysAfterNormalClick = await page.evaluate(() => document.querySelectorAll('.picker-overlay').length);
  const mutLog = await page.evaluate(() => window.__overlayLog);
  const jsErrs = await page.evaluate(() => window.__jsErrorsDuringClick);
  const openPickerCalls = await page.evaluate(() => window.__openPickerCalls);
  console.log('mutation log:', JSON.stringify(mutLog));
  console.log('js errors:', JSON.stringify(jsErrs));
  console.log('_openPicker calls:', JSON.stringify(openPickerCalls));
  console.log('overlay after page.click:', overlaysAfterNormalClick);
  if (overlaysAfterNormalClick === 0) {
    await page.evaluate(() => document.querySelector('#fs-trigger-customer').click());
    await new Promise((r) => setTimeout(r, 1000));
    const overlaysAfterDomClick = await page.evaluate(() => document.querySelectorAll('.picker-overlay').length);
    console.log('overlay after DOM .click():', overlaysAfterDomClick);
  }
  const overlays = await page.evaluate(() => document.querySelectorAll('.picker-overlay').length);
  console.log('overlay count after click:', overlays);
  const snippet = await page.evaluate(() => {
    const o = document.querySelector('.picker-overlay');
    return o ? o.outerHTML.slice(0, 800) : 'NO OVERLAY';
  });
  console.log(snippet);
  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
