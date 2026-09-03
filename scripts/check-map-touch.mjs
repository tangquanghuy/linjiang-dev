/* Mobile map touch regression.
   Exercises the real Tavern native-flow portal so map gestures are measured with
   the same iframe geometry, status-bar inset, and touch input used on phones. */
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

stageRealSources();
const server = await startFixtureServer({ port: 5290 });
const hudServer = await startFixtureServer({ port: 5291 });
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};

let page;
try {
  page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  const session = await page.context().newCDPSession(page);
  await stubExternalRequests(page, new Set());
  const query = new URLSearchParams({
    chrome: '0', preset: 'phone-iphone', theme: 'Dark V 1.0', floors: '20', rendered: '0',
    statusFloors: '3', shell: 'inline', hud: hudServer.url, host: 'tauritavern',
  });
  await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__linjiangTavernLive);
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted(60000));
  const frameSelector = await page.evaluate(() => `#${CSS.escape(window.__linjiangTavernLive.statusFrame.id)}`);
  await page.frameLocator(frameSelector).locator('.ptool[data-page="map"]').click();
  await page.waitForTimeout(900);
  const map = page.frames().find((frame) => /\/city\/plate_map\.html/.test(frame.url()));
  if (!map) throw new Error('map iframe did not open');
  await map.waitForFunction(() => !!window.PLATE_MAP);
  await map.waitForFunction(() => [...document.querySelectorAll('.pin-nm')]
    .some((node) => node.textContent === '\u4e1c\u96ea\u83b2'));

  const initialRuntime = await map.evaluate(() => ({
    here: document.querySelector('.np[data-here="1"]')?.dataset.k || '',
    actors: [...document.querySelectorAll('.pin-nm')].map((node) => node.textContent),
  }));
  const initialTrip = await map.evaluate(() => {
    const result = PLATE_MAP.plan('mh_hospital');
    const enabled = !document.getElementById('trip').hidden && !document.getElementById('trip-go').disabled;
    PLATE_MAP.clearTrip();
    return { result: !!result, enabled };
  });
  check(initialRuntime.here === 'D:guling' && initialRuntime.actors.includes('\u4e1c\u96ea\u83b2')
      && initialTrip.result && initialTrip.enabled,
    'cross-origin map receives the initial MVU player and actor locations',
    JSON.stringify({ ...initialRuntime, trip: initialTrip }));

  const frameRect = async () => page.locator('#linjiang-native-overlay-portal').evaluate((host) => {
    const rect = host.shadowRoot.querySelector('.map-frame').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  let pointerId = 1;
  const touchDrag = async ({ x, y, dx, dy, steps = 10, hold = 20 }) => {
    const id = pointerId++;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 4, radiusY: 4, force: 1 }],
    });
    for (let i = 1; i <= steps; i += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: Math.round(x + dx * i / steps), y: Math.round(y + dy * i / steps),
          id, radiusX: 4, radiusY: 4, force: 1,
        }],
      });
      await page.waitForTimeout(hold);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
  };
  const touchTap = async ({ x, y }) => {
    const id = pointerId++;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 4, radiusY: 4, force: 1 }],
    });
    await page.waitForTimeout(55);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(120);
  };
  const setView = async (z) => {
    await map.evaluate((nextZ) => window.__setView(.5, .5, nextZ), z);
    await page.waitForTimeout(100);
  };

  const viewport = await frameRect();
  const center = {
    x: Math.round(viewport.x + viewport.width / 2),
    y: Math.round(viewport.y + viewport.height / 2),
  };

  /* At portrait overview the world already fills the complete vertical range.
     Vertical movement therefore cannot change cy. It must not leak normal finger
     wobble into the still-pannable horizontal axis. */
  await setView(1);
  await touchDrag({ ...center, dx: 12, dy: -220 });
  const overview = await map.evaluate(() => PLATE_MAP.view());
  check(Math.abs(overview.cx - .5) < .0005 && Math.abs(overview.cy - .5) < .0005,
    'overview vertical drag does not wobble sideways', JSON.stringify(overview));

  await setView(2);
  await touchDrag({ ...center, dx: 12, dy: -220 });
  const vertical = await map.evaluate(() => PLATE_MAP.view());
  check(Math.abs(vertical.cx - .5) < .0005 && vertical.cy > .6,
    'zoomed vertical drag follows only the vertical axis', JSON.stringify(vertical));

  const clickableNode = async () => map.evaluate(() => {
    const node = [...document.querySelectorAll('.np.on')].find((element) => {
      const rect = element.getBoundingClientRect();
      return /^N:/.test(element.dataset.k || '') && typeof element.onclick === 'function'
        && rect.width > 0 && rect.height > 0 && rect.left > 24 && rect.right < innerWidth - 24
        && rect.top > 80 && rect.bottom < innerHeight - 50;
    });
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { key: node.dataset.k, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });

  await setView(2);
  const localNode = await clickableNode();
  if (!localNode) throw new Error('no visible clickable map node found');
  const outer = await frameRect();
  const nodePoint = { x: Math.round(outer.x + localNode.x), y: Math.round(outer.y + localNode.y) };
  const beforeNodeDrag = await map.evaluate(() => PLATE_MAP.view());
  await touchDrag({ ...nodePoint, dx: 10, dy: -120 });
  const nodeDrag = await map.evaluate(() => ({ view: PLATE_MAP.view(), spot: !document.getElementById('spot').hidden }));
  check(Math.abs(nodeDrag.view.cx - beforeNodeDrag.cx) < .0005
      && nodeDrag.view.cy > beforeNodeDrag.cy + .05 && !nodeDrag.spot,
    'drag beginning on a location pans without opening detail', `${localNode.key} ${JSON.stringify(nodeDrag)}`);

  /* A new pointerdown clears only the stale compatibility-click guard. This tap is
     intentionally immediate so a real selection after panning is never swallowed. */
  await setView(2);
  const freshNode = await clickableNode();
  const freshOuter = await frameRect();
  await touchTap({ x: Math.round(freshOuter.x + freshNode.x), y: Math.round(freshOuter.y + freshNode.y) });
  const tapped = await map.evaluate(() => !document.getElementById('spot').hidden);
  check(tapped, 'stationary node tap still opens detail immediately after a drag', freshNode.key);

  await map.evaluate(() => PLATE_MAP.close());
  await setView(1.5);
  const pinchRect = await frameRect();
  const pinchCenter = {
    x: Math.round(pinchRect.x + pinchRect.width / 2),
    y: Math.round(pinchRect.y + pinchRect.height / 2),
  };
  const leftId = pointerId++;
  const rightId = pointerId++;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [
      { x: pinchCenter.x - 35, y: pinchCenter.y, id: leftId, radiusX: 4, radiusY: 4, force: 1 },
      { x: pinchCenter.x + 35, y: pinchCenter.y, id: rightId, radiusX: 4, radiusY: 4, force: 1 },
    ],
  });
  for (let i = 1; i <= 8; i += 1) {
    const distance = 35 + i * 8;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [
        { x: pinchCenter.x - distance, y: pinchCenter.y, id: leftId, radiusX: 4, radiusY: 4, force: 1 },
        { x: pinchCenter.x + distance, y: pinchCenter.y, id: rightId, radiusX: 4, radiusY: 4, force: 1 },
      ],
    });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  const pinch = await map.evaluate(() => PLATE_MAP.view());
  check(pinch.z > 2.5, 'two-finger pinch zoom remains functional', JSON.stringify(pinch));

  /* Push a second authoritative MVU snapshot while the cross-origin map remains open.
     The player marker and the actor portrait must both move without reopening it. */
  await page.evaluate(() => {
    const next = Mvu.getMvuData();
    next.stat_data['\u4e16\u754c\u4fe1\u606f']['\u4f4d\u7f6e'] = {
      '\u533a\u57df': '\u660e\u6e56\u533a \u00b7 \u660e\u6e56\u6f9c\u5ead',
      '\u573a\u6240': '\u5ba2\u5385',
      '\u79c1\u5bc6\u5ea6': 4,
    };
    next.stat_data['\u5bf9\u8c61\u4fe1\u606f']['\u4e1c\u96ea\u83b2']['\u4f4d\u7f6e'] = {
      '\u533a\u57df': '\u897f\u6d32\u533a \u00b7 \u897f\u6d32\u6c5f\u6e7e\u516c\u5bd3',
      '\u573a\u6240': '\u5367\u5ba4',
      '\u79c1\u5bc6\u5ea6': 5,
    };
    Mvu.replaceMvuData(next);
    eventSource.emit('mvu_data_updated');
  });
  await map.waitForFunction(() => document.querySelector('.np[data-here="1"]')?.dataset.k === 'D:minghu');
  await map.evaluate(() => PLATE_MAP.goto('xz_jiangwan'));
  await map.waitForFunction(() => {
    const target = document.querySelector('.np[data-k="N:xz_jiangwan"]');
    const actor = [...document.querySelectorAll('.pin-nm')]
      .find((node) => node.textContent === '\u4e1c\u96ea\u83b2')?.closest('.pin');
    return target?.classList.contains('on') && actor?.classList.contains('on');
  });
  const movedRuntime = await map.evaluate(() => {
    const target = document.querySelector('.np[data-k="N:xz_jiangwan"]');
    const actorName = [...document.querySelectorAll('.pin-nm')]
      .find((node) => node.textContent === '\u4e1c\u96ea\u83b2');
    const pin = actorName?.closest('.pin');
    return {
      here: document.querySelector('.np[data-here="1"]')?.dataset.k || '',
      actor: actorName?.textContent || '',
      dx: target && pin ? Math.abs(parseFloat(target.style.left) - parseFloat(pin.style.left)) : 999,
      dy: target && pin ? Math.abs(parseFloat(target.style.top) - parseFloat(pin.style.top)) : 999,
    };
  });
  check(movedRuntime.here === 'D:minghu' && movedRuntime.actor === '\u4e1c\u96ea\u83b2'
      && movedRuntime.dx < 1 && Math.abs(movedRuntime.dy - 18) < 1,
    'live MVU update moves player and actor markers on the open map', JSON.stringify(movedRuntime));

  const planned = await map.evaluate(() => ({
    result: !!PLATE_MAP.plan('mh_hospital'),
    hidden: document.getElementById('trip').hidden,
    disabled: document.getElementById('trip-go').disabled,
    od: document.getElementById('trip-od').textContent.trim(),
  }));
  check(planned.result && !planned.hidden && !planned.disabled,
    'MVU player position provides a valid trip origin and enables departure', JSON.stringify(planned));
  await map.locator('#trip-go').click();
  await page.waitForFunction(() => !document.getElementById('linjiang-native-overlay-portal'));
  const sentTravel = await page.locator('#send_textarea').inputValue();
  check(sentTravel.includes('\u5e02\u7b2c\u4e00\u4eba\u6c11\u533b\u9662'),
    'departure crosses the map bridge and sends the travel message', sentTravel.slice(0, 90));
} finally {
  await page?.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  await hudServer.close().catch(() => {});
}

if (failures.length) throw new Error(`map touch regression failed:\n- ${failures.join('\n- ')}`);
console.log('\nMap touch regression passed.');
