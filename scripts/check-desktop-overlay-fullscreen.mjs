/* Desktop overlay geometry regression.
 * Verifies that map/shop/CG/arcade still cover the full viewport when the HUD
 * itself is docked back inside the Tavern message floor. Mobile native-flow uses
 * the separate body portal and is covered by check-mobile-native-flow.mjs.
 */
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';

stageRealSources({ quiet: true });
const server = await startFixtureServer({ port: 5231 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (/favicon|jsdelivr|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(message.text())) return;
  errors.push(message.text());
});

try {
  const query = new URLSearchParams({
    chrome: '0', preset: 'desktop-work', theme: 'Dark V 1.0',
    floors: '12', rendered: '2', shell: 'inline',
  });
  await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());

  await page.waitForSelector('#linjiang-hud-live', { state: 'attached' });
  const hud = page.frameLocator('#linjiang-hud-live');
  const pages = ['arcade', 'map', 'shop', 'cg'];
  const results = [];
  let scratchMusic = null;

  for (const name of pages) {
    await hud.locator(`button[data-page="${name}"]`).first().evaluate((element) => element.click());
    await page.waitForTimeout(name === 'arcade' ? 1200 : 700);
    const state = await page.evaluate((name) => {
      const floor = window.__linjiangTavernLive.statusFrame;
      const live = document.getElementById('linjiang-hud-live') || floor.contentDocument?.getElementById('linjiang-hud-live');
      const rect = live.getBoundingClientRect();
      const style = getComputedStyle(live);
      const chrome = ['top-bar', 'top-settings-holder', 'form_sheld'].map((id) => {
        const element = document.getElementById(id);
        return element ? getComputedStyle(element).visibility : 'missing';
      });
      let layerRect = null;
      try {
        const doc = live.contentDocument;
        const selector = name === 'map' ? '.map-layer' : `.${name}-layer`;
        const layer = doc.querySelector(selector);
        const box = layer?.getBoundingClientRect();
        if (box) layerRect = { left: box.left, top: box.top, width: box.width, height: box.height };
      } catch (_) {}
      const ownsViewport = [[2, 2], [innerWidth / 2, innerHeight / 2], [innerWidth - 2, innerHeight - 2]]
        .every(([x, y]) => document.elementFromPoint(x, y) === live);
      return {
        position: style.position,
        hud: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight },
        chrome,
        ownsViewport,
        layerRect,
      };
    }, name);
    results.push({ name, ...state });
    if (name === 'arcade') {
      const arcadeFrame = page.frames().find((frame) => /\/arcade\/index\.html(?:[?#]|$)/.test(frame.url()));
      await arcadeFrame.locator('#tab-scratch').click();
      await page.waitForTimeout(1300);
      const scratchFrame = page.frames().find((frame) => /\/arcade\/scratch\.html(?:[?#]|$)/.test(frame.url()));
      scratchMusic = scratchFrame ? await scratchFrame.evaluate(() => {
        const audio = window.__airpBgmAudio;
        return audio ? {
          src: audio.currentSrc || audio.src || '', readyState: audio.readyState,
          paused: audio.paused, currentTime: Number(audio.currentTime || 0), error: audio.error?.code || 0,
        } : null;
      }) : null;
    }
  }

  const failures = [];
  for (const result of results) {
    const floorFull = ['fixed', 'absolute'].includes(result.position)
      && Math.abs(result.hud.left) <= 1 && Math.abs(result.hud.top) <= 1
      && result.hud.width >= result.viewport.width - 2
      && result.hud.height >= result.viewport.height - 2
      && result.ownsViewport;
    const layerFull = result.layerRect
      && Math.abs(result.layerRect.left) <= 1 && Math.abs(result.layerRect.top) <= 1
      && result.layerRect.width >= result.viewport.width - 2
      && result.layerRect.height >= result.viewport.height - 2;
    if (!floorFull || !layerFull) failures.push(JSON.stringify(result));
  }
  const scratchPlaying = scratchMusic
    && /96da335a-8e9b-4529-8000-12b4e1924942\.mp3(?:[?#]|$)/.test(scratchMusic.src)
    && scratchMusic.readyState >= 2 && !scratchMusic.paused && scratchMusic.currentTime > 0
    && scratchMusic.error === 0;
  if (!scratchPlaying) failures.push(`scratch BGM did not auto-start after PC tab click: ${JSON.stringify(scratchMusic)}`);
  console.log(JSON.stringify({ overlays: results, scratchMusic }, null, 2));
  if (errors.length) failures.push(`page errors: ${errors.join(' | ')}`);
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('PASS desktop iframe overlays cover the full viewport.');
} finally {
  await browser.close();
  await server.close();
}

