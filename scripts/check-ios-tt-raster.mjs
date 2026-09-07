import { chromium, webkit } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

// V20260906 is the repair target; also cover one frozen V20260831 shell for compatibility.
// --baseline <pre-fix-rev> checks test sensitivity with old HUD modules (TT guards must fail).
// WebKit on Windows checks engine behavior, not the iPhone GPU process/memory limit.
const baselineIndex = process.argv.indexOf('--baseline');
const baseline = baselineIndex >= 0;
const direct = process.argv.includes('--direct');
const blob = process.argv.includes('--blob');
if (baseline && direct) throw new Error('--baseline and --direct are mutually exclusive');
const baselineRev = baseline ? (process.argv[baselineIndex + 1] || 'HEAD') : null;
const imageSize = process.env.PORTRAIT_SIZE || '96x128';
if (!/^\d+x\d+$/.test(imageSize)) throw new Error('PORTRAIT_SIZE must be WIDTHxHEIGHT');
const [imageW, imageH] = imageSize.split('x').map(Number);
if ([imageW, imageH].some(n => n < 2 || n > 4096)) throw new Error('PORTRAIT_SIZE dimensions must be 2..4096');
const out = `artifacts/ios-tt-raster${baseline ? '-baseline' : direct ? '-direct' : ''}${blob ? '-blob' : ''}${process.env.PORTRAIT_SIZE ? '-' + imageSize : ''}`;
mkdirSync(out, { recursive: true });
const deploy = '\u5916\u90e8\u90e8\u7f72';
const flow = '\u72b6\u6001\u680f-\u6d4b\u8bd5\u7248-\u6d41\u5185\u5d4c\u5165.html';
const legacyShell = readFileSync(`${deploy}/V20260831/${flow}`, 'utf8');
const currentShell = readFileSync(`${deploy}/V20260906/${flow}`, 'utf8');
const directShell = direct ? readFileSync(`${deploy}/V20260906/${flow.replace('.html', '-TT-iOS\u76f4\u6d4b.html')}`, 'utf8') : '';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const rosterSource = readFileSync('src/data.js', 'utf8').split('const roster = [')[1].split('];')[0];
const rosterNames = [...rosterSource.matchAll(/name: '([^']+)'/g)].map(match => match[1]);
const cases = [
  { id: 'tt-iphone-legacy', tt: true, flat: true, legacy: true },
  { id: 'tt-iphone-saved-auto', tt: true, flat: true, pref: 'auto' },
  { id: 'tt-iphone-0906', tt: true, flat: true },
  { id: 'tt-ipad-desktop-ua', tt: true, flat: true, ua: ipad, w: 820, h: 1180, platform: 'MacIntel' },
  { id: 'native-iphone-default' },
  { id: 'native-iphone-saved-auto', pref: 'auto' },
  { id: 'tt-android-saved-auto', tt: true, ua: android, pref: 'auto' },
];
if (process.env.CASE && !cases.some(spec => spec.id === process.env.CASE)) throw new Error(`unknown CASE: ${process.env.CASE}`);
if (process.env.ENGINE && !['chromium', 'webkit'].includes(process.env.ENGINE)) throw new Error(`unknown ENGINE: ${process.env.ENGINE}`);
const failures = [];
const results = [];
function check(ok, label, details = '') {
  console.log(`  ${ok ? 'ok' : 'FAIL'} ${label} ${details}`);
  if (!ok) failures.push(`${label}: ${details}`);
}
stageRealSources();
const server = await startFixtureServer({ port: 5241 });
const hudServer = await startFixtureServer({ port: 5242 });
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    if (process.env.ENGINE && process.env.ENGINE !== engine) continue;
    const browser = await type.launch();
    try {
      for (const spec of cases) {
        if (process.env.CASE && process.env.CASE !== spec.id) continue;
        const id = `${engine}-${spec.id}`;
        console.log(`\n=== ${id} ===`);
        const page = await browser.newPage({ viewport: { width: spec.w || 390, height: spec.h || 844 },
          deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: spec.ua || iphone });
        const errors = [];
        const packedCase = direct && !spec.legacy;
        const embedded = packedCase && !!spec.flat;
        const entryRequests = [];
        if (direct) page.on('request', req => {
          const url = new URL(req.url());
          if (url.port === '5242' && (url.pathname === '/' || ['script', 'stylesheet'].includes(req.resourceType()))) entryRequests.push(req.url());
        });
        page.on('pageerror', e => errors.push(e.message));
        page.on('crash', () => errors.push('page crashed'));
        try {
          await page.addInitScript(({ pref, platform }) => {
            if (platform) Object.defineProperty(navigator, 'platform', { get: () => platform });
            Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
            if (pref) localStorage.setItem('glass-hud-prefs', JSON.stringify({ performanceMode: pref }));
          }, { pref: spec.pref, platform: spec.platform });
          await stubExternalRequests(page);
          // Visible deterministic portrait pixels, rather than transparent external-image stubs.
          const png = new PNG({ width: imageW, height: imageH });
          for (let y = 0; y < imageH; y++) for (let x = 0; x < imageW; x++) {
            const i = (y * imageW + x) * 4;
            png.data.set([80 + x % 128, 70 + y % 128, 160, 255], i);
          }
          const image = PNG.sync.write(png);
          await page.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname)
            && /\.(webp|png|jpe?g)(?:$|\?)/i.test(url.pathname), route =>
            route.fulfill({ contentType: 'image/png', body: image }));
          await page.route(url => decodeURIComponent(url.pathname).endsWith(`/${flow}`), route =>
            route.fulfill({ contentType: 'text/html; charset=utf-8', body: spec.legacy ? legacyShell : packedCase ? directShell : currentShell }));
          if (embedded) {
            // No current Pages entry or code is available: only the pasted payload can boot.
            await page.route(url => url.port === '5242' && (url.pathname === '/' || /\.(?:js|css)$/.test(url.pathname)), route => route.abort());
          }
          if (baseline) {
            for (const file of ['src/main.js', 'src/portrait/stage.js', 'src/portrait/glass.js', 'src/styles/perf.css']) {
              const original = execFileSync('git', ['show', `${baselineRev}:${file}`], { encoding: 'utf8' });
              await page.route(url => url.pathname === `/${file}`, async route => {
                // Vite serves CSS imports as JS, so replace only the serialized CSS payload.
                if (file.endsWith('.css')) {
                  const response = await route.fetch();
                  let body = await response.text();
                  body = body.replace(/const __vite__css = .*\n/, `const __vite__css = ${JSON.stringify(original)}\n`);
                  await route.fulfill({ response, body });
                } else {
                  // Preserve Vite's JSON-as-module import convention for raw git sources.
                  const body = original.replace(/(from\s*['"][^'"]+\.json)(['"])/g, '$1?import$2');
                  await route.fulfill({ contentType: 'application/javascript', body });
                }
              });
            }
          }
          const query = new URLSearchParams({ chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0',
            floors: '20', rendered: '0', statusFloors: '3', shell: 'flow', hud: 'http://127.0.0.1:5242/',
            ...(blob ? { useBlobUrl: '1' } : {}),
            ...(spec.tt ? { host: 'tauritavern' } : {}) });
          await page.goto(`http://127.0.0.1:5241/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => !!window.__linjiangTavernLive?.statusFrame, { timeout: 45000 });
          // WebKit honors Tavern Helper's loading=lazy for offscreen srcdoc floors.
          await page.evaluate(() => window.__linjiangTavernLive.statusFrame.scrollIntoView());
          await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));
          await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted(60000));
          await page.waitForTimeout(600);
          const frameElement = await page.evaluateHandle(() => window.__linjiangTavernLive.statusFrame);
          const hud = await frameElement.asElement().contentFrame();
          await hud.waitForSelector('.prail > .pcard');
          check((new URL(hud.url()).protocol === 'blob:') === blob, `${id} actual document transport`, hud.url());
          await page.waitForFunction(() => window.__linjiangTavernLive.measure().hudMoney.includes('512,300'));
          await hud.evaluate(async () => {
            await document.fonts.ready;
            // Do not await decode() on offscreen loading=lazy images: WebKit defers them.
            await Promise.all([...document.images].filter(img => img.complete && img.naturalWidth).map(img => img.decode().catch(() => {})));
          });
          await page.evaluate(names => {
            const data = window.Mvu.getMvuData();
            const key = Object.keys(data.stat_data)[2];
            const person = Object.values(data.stat_data[key])[0];
            data.stat_data[key] = Object.fromEntries(names.map(name => [name, structuredClone(person)]));
            window.Mvu.replaceMvuData(data);
          }, rosterNames);
          await hud.waitForFunction(count => document.querySelectorAll('.prail > .pcard').length === count, rosterNames.length);
          await page.waitForTimeout(500);
          const sample = () => hud.evaluate(() => {
            const root = document.documentElement;
            const risky = { filter: 0, backdrop: 0, blend: 0 };
            for (const el of document.querySelectorAll('.pstage, .pstage *')) {
              for (const pseudo of [null, '::before', '::after']) {
                const cs = getComputedStyle(el, pseudo);
                if (cs.display === 'none' || (pseudo && ['none', 'normal'].includes(cs.content))) continue;
                if (cs.filter && cs.filter !== 'none') risky.filter++;
                if ((cs.backdropFilter || cs.webkitBackdropFilter || 'none') !== 'none') risky.backdrop++;
                if (cs.mixBlendMode !== 'normal') risky.blend++;
              }
            }
            return { flat: root.dataset.hudIosTtFlat || '', performance: root.dataset.hudPerformance,
              risky, paths: document.querySelectorAll('.pg-flat > path').length,
              fullLayers: document.querySelectorAll('.pg').length,
              svgFilters: document.querySelectorAll('.prim [filter]').length,
              cards: document.querySelectorAll('.prail > .pcard').length,
              height: document.getElementById('pstage').getBoundingClientRect().height,
              width: document.getElementById('pstage').getBoundingClientRect().width,
              contentH: document.querySelector('.pcontent').offsetHeight,
              k: getComputedStyle(document.querySelector('.pscale')).getPropertyValue('--k'),
              artCount: document.querySelectorAll('.pcard .card-art').length,
              firstArt: (() => {
                const img = document.querySelector('.pcard .card-art');
                return img ? { source: img.currentSrc || img.src, decodedWidth: img.naturalWidth,
                  width: img.getBoundingClientRect().width, laid: img.dataset.laid || '' } : null;
              })(),
              artVisible: [...document.querySelectorAll('.pcard img')].every(el =>
                getComputedStyle(el).visibility === 'visible'),
              native: !!window.__linjiangNativeFlow,
              scrolling: root.classList.contains('host-scroll-active') };
          });
          const before = await sample();
          if (direct) {
            const delivery = await hud.evaluate(() => ({
              marker: window.__linjiangDirectTest || null,
              badge: document.getElementById('linjiang-ios-direct-version')?.textContent || '',
              styles: document.querySelectorAll('#linjiang-ios-direct-css').length,
            }));
            check(embedded ? delivery.marker?.state === 'flat-ready' && delivery.styles === 1 && delivery.badge.includes(delivery.marker.version)
              : !delivery.marker && delivery.styles === 0, `${id} embedded delivery and host isolation`, JSON.stringify(delivery));
          }
          console.log(JSON.stringify(before));
          check(before.artCount === rosterNames.length, `${id} each character retains its portrait element`);
          check(before.native && (before.flat === '1') === !!spec.flat, `${id} host detection`);
          check(before.performance === (spec.flat || !spec.pref ? 'low' : spec.pref), `${id} preference isolation`);
          if (spec.flat) {
            check(Object.values(before.risky).every(n => n === 0), `${id} no filter/blend intermediates`, JSON.stringify(before.risky));
            check(before.paths >= 2 && before.fullLayers === 0 && before.svgFilters === 0, `${id} direct panel paths, no full-canvas masks`);
          } else check(before.fullLayers >= 4 && before.svgFilters > 0, `${id} native/Android glass preserved`);
          // Start above the floor, then expose most of the girls section in one frame.
          // This exercises host scrolling without dispatching any touch event to the HUD.
          const scrolls = await page.evaluate(async () => {
            const chat = document.getElementById('chat');
            const floor = window.__linjiangTavernLive.statusFrame;
            const girls = floor.contentDocument.querySelector('[data-panel="girls"]');
            const next = () => new Promise(resolve => requestAnimationFrame(resolve));
            const positions = [];
            for (let n = 0; n < 12; n++) {
              chat.scrollTop += floor.getBoundingClientRect().top - chat.getBoundingClientRect().top - innerHeight * 1.2;
              await next();
              const from = chat.scrollTop;
              chat.scrollTop += floor.getBoundingClientRect().top + girls.getBoundingClientRect().top
                - chat.getBoundingClientRect().top - 120;
              await next();
              positions.push(Math.abs(chat.scrollTop - from));
            }
            return positions;
          });
          // Native lazy loading may finish after the fling. Require a decoded, laid-out
          // visible portrait, not just visibility:visible on an empty/broken image.
          await hud.waitForFunction(() => {
            const img = document.querySelector('.pcard .card-art');
            const rect = img?.getBoundingClientRect();
            return img?.complete && img.naturalWidth > 1 && rect.width > 0 && rect.height > 0;
          }, null, { timeout: 10000 });
          const art = await hud.locator('.pcard .card-art').first().evaluate(img => ({
            source: img.currentSrc, decodedWidth: img.naturalWidth,
            width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
          }));
          check(art.decodedWidth > 1 && art.width > 0 && art.height > 0, `${id} portrait decoded and laid out`, JSON.stringify(art));
          const after = await sample();
          check(Math.max(...scrolls) > 400, `${id} large host-scroll jumps`, String(Math.round(Math.max(...scrolls))));
          check(before.cards === after.cards && after.artVisible && before.height === after.height,
            `${id} cards/images/layout survive rapid re-entry`, JSON.stringify({ before, after }));
          if (spec.flat) check(!after.scrolling && Object.values(after.risky).every(n => n === 0),
            `${id} no gesture-time raster topology switch`);
          const shot = await hud.locator('[data-panel="girls"]').screenshot({ path: `${out}/${id}.png`, animations: 'disabled' });
          const pixels = PNG.sync.read(shot);
          let nonblack = 0;
          for (let i = 0; i < pixels.data.length; i += 4) if (Math.max(...pixels.data.subarray(i, i + 3)) > 40) nonblack++;
          check(nonblack / (pixels.width * pixels.height) > .35, `${id} girls pixels painted`);
          await hud.locator('.prail > .pcard').first().click();
          await hud.waitForSelector('[data-character-full]');
          check(await hud.locator('.ppreview').count() > 0 || await hud.locator('[data-character-full]').count() > 0,
            `${id} character preview opens`);
          await hud.locator('[data-character-full]').click();
          await hud.waitForSelector('.parc-id');
          await hud.locator('[data-page-close]').first().click();
          await hud.waitForSelector('[data-preview-close]');
          await hud.locator('[data-preview-close]').click();
          await hud.waitForSelector('.prail > .pcard');
          await page.waitForTimeout(200);
          check(true, `${id} archive opens and closes`);
          // New panel geometry after preview/page transitions still uses the right renderer.
          const final = await sample();
          check((final.paths > 0) === !!spec.flat, `${id} renderer survives page transitions`);
          // The original pasted shell also decides readiness by a >40-node heuristic.
          // Check its shortest restored page, not only the much larger character archive.
          await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
          await hud.waitForSelector('.pschedule-page');
          await page.waitForTimeout(200);
          await page.evaluate(() => {
            const live = window.__linjiangTavernLive;
            return live.rerenderStatusFloor(live.statusFrames.indexOf(live.statusFrame));
          });
          await hud.waitForSelector('.pschedule-page');
          await page.waitForTimeout(4500);
          const restored = await hud.evaluate(() => ({
            page: !!document.querySelector('.pschedule-page'),
            contentReady: !!document.querySelector('.pstage:not([hidden]) .pcontent > .ppanel'),
            flat: document.documentElement.dataset.hudIosTtFlat || '',
            nodes: document.getElementById('linjiang-mobile-native-root').querySelectorAll('*').length,
            hint: document.getElementById('hint').textContent,
            open: document.documentElement.classList.contains('is-page-open'),
          }));
          check(restored.page && restored.open && !restored.hint && restored.contentReady
            && (!spec.legacy || restored.nodes > 40),
            `${id} short page restores without loading retry (including frozen shell)`, JSON.stringify(restored));
          // Exercise the real controls, including the bundled prefs instance in --direct.
          await hud.locator('[data-page-close]').first().click();
          await hud.locator('.pdest-btn[data-page="settings"]').first().click();
          await hud.waitForSelector('.psettings-page');
          for (const choice of ['low', 'auto']) {
            await hud.locator(`[data-pref-set="performanceMode"][data-pref-value="${choice}"]`).click();
            const mode = await hud.evaluate(() => ({ effective: document.documentElement.dataset.hudPerformance,
              stored: JSON.parse(localStorage.getItem('glass-hud-prefs')).performanceMode }));
            check(mode.effective === (spec.flat ? 'low' : choice) && mode.stored === choice,
              `${id} live preference ${choice} respects host guard without rewriting user choice`);
          }

          if (direct) {
            check(embedded ? entryRequests.length === 0 : entryRequests.length > 0, `${id} embedded bypasses blocked HUD entry; other hosts retain normal loading`, JSON.stringify({ count: entryRequests.length, sample: entryRequests.slice(0, 3) }));
            if (embedded) {
              const version = await hud.evaluate(() => window.__linjiangDirectTest);
              check(version?.state === 'flat-ready' && (await hud.locator('.set-version').textContent()).includes(version.version), `${id} reloaded payload matches visible settings build`);
            }
          }
          check(errors.length === 0, `${id} no script errors`, errors.join(' | '));
          results.push({ id, before, after, final, art, maxJump: Math.max(...scrolls), nonblack: nonblack / (pixels.width * pixels.height) });
        } catch (e) { check(false, `${id} execution`, `${e.stack}\nPage errors: ${errors.join(' | ')}`); }
        finally { await page.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await server.close();
  await hudServer.close();
  writeFileSync(`${out}/results.json`, JSON.stringify({ baseline, baselineRev, direct, blob, imageSize, results, failures }, null, 2));
}
if (failures.length) process.exitCode = 1;
console.log(`\n${results.length} cases completed; ${failures.length} failures`);
