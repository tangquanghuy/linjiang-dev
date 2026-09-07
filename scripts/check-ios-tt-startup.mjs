import { chromium, webkit } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

// Tests startup/blank-frame failures, not physical iOS raster/compositor behavior.
const dir = 'artifacts/ios-tt-startup';
mkdirSync(dir, { recursive: true });
const flow = '状态栏-测试版-流内嵌入.html';
const source = readFileSync(`外部部署/V20260906/状态栏-测试版-流内嵌入-TT-iOS直测.html`, 'utf8');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
function once(body, anchor, replacement) {
  assert.equal(body.split(anchor).length, 2, anchor);
  return body.replace(anchor, () => replacement);
}
function removeScripts(source, all = false) {
  // The fixture rewrites HUD_URL before creating a floor; retain that inert route anchor.
  const anchor = source.match(/const\s+HUD_URL\s*=\s*(['"])[\s\S]*?\1\s*;/)[0];
  return source.replace(all ? /<script>[\s\S]*?<\/script>/g : /<script>\s*\/\* 状态栏壳层[\s\S]*?<\/script>/,
    () => '<!-- ' + anchor + ' -->');
}
const cases = [
  { id: 'srcdoc-ready', ready: true },
  { id: 'blob-ready', blob: true, ready: true },
  { id: 'syntax-error', state: 'script-error', phase: 'probe', modify: s => once(s, '  const SHELL_VERSION =', '  const SHELL_VERSION = ;') },
  { id: 'runtime-error', state: 'script-error', phase: 'shell', modify: s => once(s, "  window.__linjiangDirectBootPhase?.('shell');", "  window.__linjiangDirectBootPhase?.('shell'); throw new Error('PRIVATE_FIXTURE_DO_NOT_DISPLAY');") },
  { id: 'bundle-error', state: 'script-error', phase: 'bundle', modify: s => once(s, 'script.textContent = entry.inlineJs;', `script.textContent = entry.inlineJs + "\\nthrow new Error('PRIVATE_FIXTURE_DO_NOT_DISPLAY')";`) },
  { id: 'frame-guard', state: 'timeout', phase: 'frame-missing', modify: s => once(s, '  if (!window.frameElement) {', '  if (true) {') },
  { id: 'blob-shell-missing', blob: true, state: 'timeout', phase: 'probe', modify: s => removeScripts(s) },
  { id: 'scripts-missing', state: 'html', modify: s => removeScripts(s, true) },
  { id: 'non-tt-entry-stall', tt: false, state: 'timeout', phase: 'mount' },
];
stageRealSources();
const server = await startFixtureServer({ port: 5251 });
const results = [];
let failed = 0;
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch();
    try {
      for (const spec of cases) {
        const id = `${engine}-${spec.id}`;
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true,
          hasTouch: true, deviceScaleFactor: 3, userAgent: iphone });
        const errors = [];
        const requests = [];
        let release;
        const stalled = new Promise(resolve => { release = resolve; });
        page.on('pageerror', e => errors.push(e.name));
        try {
          await stubExternalRequests(page);
          await page.route(url => decodeURIComponent(url.pathname).endsWith('/' + flow), route =>
            route.fulfill({ contentType: 'text/html; charset=utf-8', body: spec.modify ? spec.modify(source) : source }));
          await page.route('http://127.0.0.1:5252/**', async route => {
            const req = route.request();
            if (new URL(req.url()).pathname === '/' || ['script', 'stylesheet'].includes(req.resourceType())) requests.push(req.url());
            if (spec.tt === false) await stalled;
            await route.abort().catch(() => {});
          });
          const query = new URLSearchParams({ chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0',
            floors: '2', rendered: '0', statusFloors: '1', shell: 'flow', hud: 'http://127.0.0.1:5252/',
            ...(spec.tt === false ? {} : { host: 'tauritavern' }), ...(spec.blob ? { useBlobUrl: '1' } : {}) });
          await page.goto(`http://127.0.0.1:5251/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => !!window.__linjiangTavernLive?.statusFrame, { timeout: 45000 });
          const handle = await page.evaluateHandle(() => {
            const frame = window.__linjiangTavernLive.statusFrame;
            frame.scrollIntoView(); return frame;
          });
          const hud = await handle.asElement().contentFrame();
          await hud.waitForFunction(expected => document.getElementById('linjiang-ios-direct-boot')?.dataset.state === expected,
            spec.ready ? 'ready' : spec.state, { timeout: 25000 });
          // Readiness covers the shell/content; roster data arrives asynchronously over the MVU bridge.
          if (spec.ready) await hud.waitForSelector('.prail > .pcard');
          const data = await hud.evaluate(() => {
            const box = document.getElementById('linjiang-ios-direct-boot');
            const rect = box.getBoundingClientRect();
            return { boot: window.__linjiangDirectBoot || null, state: box.dataset.state, text: box.textContent,
              hidden: box.hidden, height: rect.height, top: rect.top, href: location.href,
              flat: document.documentElement.dataset.hudIosTtFlat,
              cards: document.querySelectorAll('.prail > .pcard').length,
              scriptTypes: [...document.scripts].filter(s => s.dataset.linjiangDirectEntry).map(s => s.type),
              hint: document.getElementById('hint')?.textContent };
          });
          assert.equal(data.href.startsWith('blob:'), !!spec.blob);
          assert.ok(!data.text.includes('PRIVATE_FIXTURE'));
          if (spec.ready) {
            assert.equal(data.boot.phase, 'ready'); assert.equal(data.hidden, true);
            assert.equal(data.flat, '1'); assert.ok(data.cards > 0); assert.equal(data.hint, '');
            assert.ok(data.scriptTypes.includes('text/javascript'), 'embedded bundle uses classic IIFE execution');
            assert.equal(errors.length, 0); assert.equal(requests.length, 0);
          } else {
            assert.ok(!data.hidden && data.height >= 18 && data.top >= 0, 'diagnostic has visible first-frame geometry');
            if (spec.phase) assert.equal(data.boot.phase, spec.phase);
            if (spec.state === 'script-error') assert.ok(errors.length > 0);
            if (spec.state === 'html') assert.equal(data.boot, null);
            if (spec.tt === false) { assert.equal(data.boot.facts.tt, false); assert.ok(requests.length > 0); }
            // A deliberately half-executed HUD may still lay out its real content; only
            // empty startup failures must have a stable, content-free frame height.
            if (spec.id !== 'bundle-error') {
              const height = await page.evaluate(() => window.__linjiangTavernLive.statusFrame.getBoundingClientRect().height);
              await page.waitForTimeout(300);
              const nextHeight = await page.evaluate(() => window.__linjiangTavernLive.statusFrame.getBoundingClientRect().height);
              assert.ok(Math.abs(height - nextHeight) < 2, 'startup banner must not cause iframe-height feedback');
            }
            await page.evaluate(() => window.__linjiangTavernLive.statusFrame.scrollIntoView({ block: 'start' }));
            const boxHandle = await page.evaluateHandle(() => window.__linjiangTavernLive.statusFrame);
            await boxHandle.asElement().screenshot({ path: `${dir}/${id}.png` });
          }
          console.log(`PASS ${id}: ${data.state} / ${data.boot?.phase || 'static'}`);
          results.push({ id, ok: true, data, errors, requests });
        } catch (error) {
          failed++; console.error(`FAIL ${id}: ${error.stack}`);
          results.push({ id, ok: false, error: error.stack, errors, requests });
        } finally { release(); await page.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await server.close();
  writeFileSync(`${dir}/results.json`, JSON.stringify({ results, failed }, null, 2));
}
console.log(`${results.length} cases; ${failed} failures`);
if (failed) process.exitCode = 1;
