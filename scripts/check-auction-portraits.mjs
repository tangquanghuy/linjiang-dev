import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const out = resolve('artifacts/auction-v32/portraits');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
    if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw Error('missing');
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
try {
  for (const [label, width, height] of [['desktop', 1280, 720], ['phone', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: label === 'phone' });
    const pending = new Map();
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Deterministic slow responses: no timers decide when a portrait becomes available.
    await context.route('**/assets/auction/hosts/*.webp', async route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      if (path.endsWith('-avatar.webp')) return route.continue();
      const name = path.split('/').at(-1).slice(0, -5);
      pending.set(name, route);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/auction.html`, { waitUntil: 'domcontentloaded' });
    if (label === 'phone') await page.waitForSelector('iframe');
    const frame = page.frames().find(f => f.parentFrame()) || page.mainFrame();
    await frame.waitForSelector('#btnStart');
    const hosts = await frame.evaluate(() => AuctionData.hosts.map(({ id, name }) => ({ id, name })));
    async function loading() {
      assert.equal(await frame.locator('#heroPortraitFrame').getAttribute('data-state'), 'loading');
      assert.equal(await frame.locator('#heroPortraitFrame').getAttribute('aria-busy'), 'true');
      assert.equal(await frame.locator('#heroPortrait').isVisible(), false, 'old portrait must be hidden');
      assert.equal(await frame.locator('#heroPortraitLoading').isVisible(), true);
      assert.equal(await frame.locator('.portrait-spinner').evaluate(el => getComputedStyle(el).animationName), 'portrait-spin');
    }
    async function pick(id) {
      await frame.click(`[data-host="${id}"]`);
      await frame.waitForFunction(id => document.querySelector(`[data-host="${id}"]`).classList.contains('active'), id);
      assert.equal(await frame.locator('#heroName').innerText(), hosts[id].name);
    }
    async function respond(id, fail = false) {
      const name = hosts[id].name;
      for (let i = 0; !pending.has(name) && i < 200; i++) await new Promise(r => setTimeout(r, 10));
      assert.ok(pending.has(name), `pending ${name}`);
      const route = pending.get(name); pending.delete(name);
      if (fail) await route.abort('failed');
      else await route.fulfill({ status: 200, contentType: 'image/webp', body: readFileSync(resolve(root, `arcade/assets/auction/hosts/${name}.webp`)) });
    }
    async function ready(id) {
      await frame.waitForFunction(name => {
        const img = document.getElementById('heroPortrait');
        return document.getElementById('heroPortraitFrame').dataset.state === 'ready' && img.alt === name && img.complete && img.naturalWidth > 0 && !img.hidden;
      }, hosts[id].name);
      const src = await frame.locator('#heroPortrait').evaluate(img => decodeURIComponent(img.currentSrc));
      assert.ok(src.endsWith(`/${hosts[id].name}.webp`), src);
      assert.equal(await frame.locator('#heroPortraitLoading').isVisible(), false);
      assert.equal(await frame.locator('#heroPortraitFrame').getAttribute('aria-busy'), 'false');
    }
    await loading(); await respond(0); await ready(0);
    await pick(2); await loading(); await respond(2); await ready(2);
    await pick(8); await loading();
    await page.screenshot({ path: resolve(out, `${label}-loading.png`) });
    // Switch again while the preceding portrait is still in flight.
    await pick(1); await loading(); await respond(1); await ready(1);
    await respond(8);
    await frame.waitForTimeout(150);
    await ready(1); // late image must not replace the latest selection
    await pick(3); await loading(); await respond(3, true);
    await frame.waitForSelector('#heroPortraitRetry:not([hidden])');
    assert.equal(await frame.locator('#heroPortrait').isVisible(), false);
    assert.equal(await frame.locator('#heroPortraitLoading').isVisible(), false);
    assert.equal(await frame.locator('#heroPortraitFrame').getAttribute('aria-busy'), 'false');
    await frame.click('#heroPortraitRetry'); await loading(); await respond(3); await ready(3);
    // Normal responses thereafter, including repeated/cached images.
    await context.unroute('**/assets/auction/hosts/*.webp');
    for (const host of hosts) { await pick(host.id); await ready(host.id); }
    for (const id of [2, 8, 8, 0, 8]) { await pick(id); await ready(id); }
    await page.screenshot({ path: resolve(out, `${label}-ready.png`) });
    // Ready images do not flicker when unrelated preparation UI rerenders.
    const portrait = await frame.locator('#heroPortrait').elementHandle();
    await frame.click('[data-host="8"]');
    await frame.waitForTimeout(100);
    assert.ok(await portrait.evaluate(el => el.isConnected && !el.hidden));
    assert.deepEqual(errors, []);
    console.log(`${label}: initial/slow loading, hidden old image, out-of-order completion, error/retry, all 11 partners and cached selection passed`);
    await context.close();
  }
} finally { await browser.close(); server.close(); }
