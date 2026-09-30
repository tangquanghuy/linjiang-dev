import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

// Run after npm run build: exercise the shipped lobby rather than the source tree.
const version = '20260930-auction-pace1';
const root = resolve('dist');
const read = file => readFileSync(file, 'utf8');
assert.ok(read('外部部署/V20260930/状态栏.html').includes(`/?v=${version}`));
assert.ok(read('外部部署/V20260930/状态栏-测试版-流内嵌入.html').includes(`/?v=${version}`));
assert.ok(read('外部部署/V20260930/状态栏-测试版-流内嵌入.html').includes('window.__linjiangInlineDock = true;'));
assert.ok(read('src/arcade.js').includes(`arcade/index.html?v=${version}`));
assert.ok(read(resolve(root, 'arcade/index.html')).includes(`auction.html?v=${version}`));
const html = read(resolve(root, 'arcade/auction.html'));
const refs = [...html.matchAll(/(?:src|href)="(auction[^"?]*\.(?:js|css))\?v=([^"]+)"/g)];
assert.ok(refs.length === 12);
for (const [, file, revision] of refs) {
  assert.equal(revision, version, file);
  assert.ok(statSync(resolve(root, 'arcade', file)).isFile(), file);
}
for (const [dir, suffix, count] of [['items', '.webp', 96], ['hosts', '.webp', 22], ['audio', '.mp3', 2]]) {
  assert.equal(readdirSync(resolve(root, 'arcade/assets/auction', dir)).filter(f => f.endsWith(suffix)).length, count, dir);
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
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
  for (const [name, width, height] of [['desktop', 1280, 720], ['phone-portrait', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: name !== 'desktop' });
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) failed.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/index.html?v=${version}`);
    assert.equal(await page.locator('[role="tab"]').count(), 5);
    assert.equal(await page.locator('#tab-auction').getAttribute('aria-label'), '临江拍卖行');
    await page.locator('#tab-auction').click();
    await page.waitForFunction(() => document.querySelector('#tab-auction').getAttribute('aria-selected') === 'true');
    const game = page.frameLocator('iframe').first();
    await game.locator('#btnStart').waitFor();
    assert.ok((await game.locator('.brand').innerText()).includes('临江拍卖行'));
    assert.equal(await game.locator('#btnSound').getAttribute('aria-pressed'), 'true');
    assert.equal(await game.locator('.host-button').count(), 11);
    assert.ok(page.frames().some(f => f.url().includes(`auction.html?v=${version}`)));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-force-landscape')), height > width);
    const bounds = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }));
    assert.ok(bounds.sw <= bounds.w + 1 && bounds.sh <= bounds.h + 1, JSON.stringify(bounds));
    await game.locator('#btnStart').click();
    await game.locator('#admission:not([hidden])').waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(`${name}: five lobby tabs, auction entry, admission, orientation and resources passed`);
    await page.close();
  }
  console.log(`Release cache chain ${version}, ${refs.length} JS/CSS refs, 96 items, 22 portraits and 2 music tracks passed`);
} finally { await browser.close(); server.close(); }
