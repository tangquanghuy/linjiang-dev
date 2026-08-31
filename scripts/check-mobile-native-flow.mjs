/* Native mobile-flow regression.
   Verifies the browser-host architecture that replaces the lifted cross-origin HUD
   iframe on phones: the HUD bundle runs directly in Tavern Helper's srcdoc, touch
   scrolling is native, and desktop-only geometry controls are absent. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { STAGE_DIR, stageRealSources } from './lib/real-tavern-sources.mjs';
import { stubExternalRequests } from './lib/stub-external.mjs';

const meta = stageRealSources();
const jqueryFixture = readFileSync(join(STAGE_DIR, 'st', 'lib', 'jquery.min.js'));
/* 酒馆和 HUD 必须分处两个源。
   ==================================================================
   生产环境就是这样：酒馆是 TauriTavern 的应用源，HUD 在 GitHub Pages。夹具原来把两者放在
   同一个源上，于是一整类「相对地址解析到了错误的源」的 bug 天生隐形 —— 那个错误地址在同源
   夹具里恰好也能命中文件。

   实测代价：原生流下 HUD 的 DOM 长在楼层 srcdoc 里，srcdoc 的 baseURI 继承酒馆地址，于是
   商店 / CG / 地图 / 街机 的 iframe 全被解析到 `<酒馆域>/shop/index.html` 这种不存在的路径
   → 空白 iframe → 真机整屏黑。而夹具一路全绿，因为 5225 上那个文件是存在的。

   所以第二个服务器不是"额外的严格"，它是**让夹具具备发现这类 bug 的能力**。 */
const server = await startFixtureServer({ port: 5225 });
const hudServer = await startFixtureServer({ port: 5226 });
const HUD_ORIGIN = 'http://127.0.0.1:5226/';
const browser = await chromium.launch();
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `  ${detail}` : ''}`);
};
const allCases = [
  { id: 'android-inline', shell: 'inline', preset: 'phone-android', w: 360, h: 800 },
  { id: 'android-boot', shell: 'boot', preset: 'phone-iphone', w: 390, h: 844 },
  /* TauriTavern。用户真机就是这个宿主，而它跟普通浏览器有一个要紧的差别：
     它提供非零的 --tt-inset-top（刘海 / 状态栏）。整页必须让开那一条，否则页面顶部会被塞进
     状态栏底下、右上角关闭钮点不到 —— 真机上就是这么坏的，而只跑浏览器宿主的用例看不见。 */
  { id: 'tauri-inset', shell: 'flow', preset: 'phone-iphone', w: 393, h: 852, host: 'tauritavern' },
] ;
const cases = process.env.CASE
  ? allCases.filter((kase) => kase.id === process.env.CASE)
  : allCases;
if (!cases.length) throw new Error(`unknown CASE: ${process.env.CASE}`);
const userAgent = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

for (const kase of cases) {
  console.log(`\n=== ${kase.id} ${kase.w}x${kase.h} ===`);
  const page = await browser.newPage({
    viewport: { width: kase.w, height: kase.h }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, userAgent,
  });
  const session = await page.context().newCDPSession(page);
  const errors = [];
  const externalHosts = new Set();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const body = message.text();
    if (/favicon|fontawesome|webfonts|\.woff|\.ttf|img\/|backgrounds\//i.test(body)) return;
    errors.push(body);
  });
  try {
    await stubExternalRequests(page, externalHosts);
    /* CG 独立页依赖 jQuery。外部资源总替身会拦掉脚本，因此用真实 ST 自带版本喂给它；
       这条精确路由后注册，按 Playwright 的逆序匹配优先于兜底。 */
    await page.route(/https:\/\/testingcf\.jsdelivr\.net\/npm\/jquery@3\.7\.1\/dist\/jquery\.min\.js(?:\?.*)?$/, (route) => (
      route.fulfill({ status: 200, contentType: 'application/javascript', body: jqueryFixture })
    ));
    await page.route(/https:\/\/(?:cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/[^/]+|testingcf\.jsdelivr\.net\/npm\/@fortawesome\/fontawesome-free@[^/]+)\/css\/all\.min\.css(?:\?.*)?$/, (route) => (
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    ));
    const query = new URLSearchParams({
      chrome: '0', preset: kase.preset, theme: 'Dark V 1.0', floors: '20', rendered: '0',
      statusFloors: '3', shell: kase.shell,
      /* HUD 换到第二个源，理由见文件顶部那段。 */
      hud: HUD_ORIGIN,
      ...(kase.host ? { host: kase.host } : {}),
    });
    await page.goto(`${server.url}/tools/tavern-live-fixture.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady(60000));
    await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted(60000));
    await page.waitForTimeout(500);

    const shape = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const frame = api.statusFrame;
      const doc = frame.contentDocument;
      const root = doc.getElementById('linjiang-mobile-native-root');
      const box = root.getBoundingClientRect();
      return {
        measure: api.measure(),
        nativeMarker: doc.documentElement.dataset.linjiangMobileNative || '',
        rootNodes: root.querySelectorAll('*').length,
        rootWidth: Math.round(box.width),
        innerHudFrames: doc.querySelectorAll('iframe#hud, iframe#linjiang-hud-live').length,
        stageCount: document.querySelectorAll('#linjiang-hud-stage').length,
        framePosition: getComputedStyle(frame).position,
        dockSetting: !!doc.querySelector('[data-pref-set="dockDefault"]'),
        floors: api.statusFrames.map((item) => {
          const itemDoc = item.contentDocument;
          const itemRoot = itemDoc?.getElementById('linjiang-mobile-native-root');
          const rect = item.getBoundingClientRect();
          return {
            nodes: itemRoot?.querySelectorAll('*').length || 0,
            height: Math.round(rect.height),
            opacity: Number(getComputedStyle(item).opacity),
            active: itemDoc?.documentElement?.dataset?.linjiangNativeActive || '',
            collapsed: item.dataset.linjiangH === '0',
            bridge: !!item.contentWindow?.__linjiangMobileDirectBridge,
          };
        }),
        managerPresent: !!window.__linjiangHudManagerV2,
        managerCandidates: window.__linjiangHudManagerV2?.candidates?.size ?? 0,
      };
    });
    check(shape.nativeMarker === '1' && shape.measure.nativeFlow, 'native-flow selected', JSON.stringify(shape.measure));
    check(!shape.measure.lifted && shape.innerHudFrames === 0, 'no inner/lifted HUD iframe', String(shape.innerHudFrames));
    check(shape.stageCount === 0, 'no desktop clip stage', String(shape.stageCount));
    check(shape.framePosition === 'static', 'Tavern Helper iframe remains in normal flow', shape.framePosition);
    check(shape.rootNodes > 150 && shape.measure.hudMoney.includes('512,300'), 'HUD rendered with MVU snapshot', `${shape.rootNodes} nodes ${shape.measure.hudMoney}`);
    check(shape.rootWidth > 180 && shape.rootWidth <= shape.measure.slotW, 'HUD uses reading-column width', `${shape.rootWidth}/${shape.measure.slotW}`);
    check(shape.floors.length === 3 && shape.floors.every((floor) => floor.nodes > 150
      && floor.height > 80 && floor.opacity > 0.9 && floor.active === '1'
      && !floor.collapsed && floor.bridge),
      'every mobile floor mounts immediately and remains visible', JSON.stringify(shape.floors));
    check(!shape.managerPresent && shape.managerCandidates === 0,
      'mobile floors leave no persistent top-window manager or owner registry',
      JSON.stringify({ present: shape.managerPresent, candidates: shape.managerCandidates }));

    /* 复现用户现场：旧 manager 曾把同一个楼层 iframe 写成 0 高/透明，TT 的“刷新渲染”只换
       srcdoc 文档、复用 iframe 元素，所以这些 inline style 会跨刷新留下。新文档必须在启动的
       第一段同步清掉它们，不能靠切换状态栏模板换一个全新 iframe 才恢复。 */
    await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      frame.style.setProperty('height', '0px', 'important');
      frame.style.setProperty('min-height', '0px', 'important');
      frame.style.setProperty('opacity', '0', 'important');
      frame.style.setProperty('pointer-events', 'none', 'important');
      frame.dataset.linjiangH = '0';
      frame.srcdoc = frame.srcdoc;
    });
    await page.waitForFunction(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const root = frame.contentDocument?.getElementById('linjiang-mobile-native-root');
      return (root?.querySelectorAll('*').length || 0) > 150
        && frame.getBoundingClientRect().height > 80
        && Number(getComputedStyle(frame).opacity) > 0.9
        && frame.dataset.linjiangH !== '0';
    }, { timeout: 15000 });
    const reusedAnchor = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        height: Math.round(frame.getBoundingClientRect().height),
        opacity: Number(getComputedStyle(frame).opacity),
        collapsed: frame.dataset.linjiangH === '0',
        nodes: frame.contentDocument?.getElementById('linjiang-mobile-native-root')?.querySelectorAll('*').length || 0,
      };
    });
    check(reusedAnchor.height > 80 && reusedAnchor.opacity > 0.9
      && !reusedAnchor.collapsed && reusedAnchor.nodes > 150,
      'rerendering a reused collapsed iframe restores the flow HUD immediately', JSON.stringify(reusedAnchor));

    const point = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const chat = document.getElementById('chat');
      const frame = api.statusFrame;
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + frame.getBoundingClientRect().top - pane.top - 20);
      const frameBox = frame.getBoundingClientRect();
      const rootBox = frame.contentDocument.getElementById('linjiang-mobile-native-root').getBoundingClientRect();
      const bridge = frame.contentWindow.__linjiangMobileDirectBridge;
      frame.contentWindow.__nativeFlowEvents = [];
      const original = bridge.event.bind(bridge);
      bridge.event = (type, ...args) => {
        frame.contentWindow.__nativeFlowEvents.push(type);
        return original(type, ...args);
      };
      return {
        x: Math.round(frameBox.left + rootBox.left + rootBox.width / 2),
        y: Math.round(Math.max(pane.top + 120, frameBox.top + 160)),
        before: chat.scrollTop,
      };
    });
    await page.waitForTimeout(250);
    const traceEvents = [];
    const onTrace = (payload) => traceEvents.push(...(payload.value || []));
    session.on('Tracing.dataCollected', onTrace);
    const traceDone = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', {
      categories: ['-*', 'toplevel', 'viz', 'cc', 'blink', 'devtools.timeline',
        'disabled-by-default-devtools.timeline'].join(','),
      transferMode: 'ReportEvents',
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let i = 1; i <= 40; i += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - i * 6, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    await session.send('Tracing.end');
    await traceDone;
    session.off('Tracing.dataCollected', onTrace);
    const rasterEvents = traceEvents.filter((event) => event.ph === 'X'
      && (event.name === 'RasterTask' || event.name === 'Rasterize'));
    const raster = {
      count: rasterEvents.length,
      ms: +(rasterEvents.reduce((sum, event) => sum + (Number(event.dur) || 0), 0) / 1000).toFixed(1),
    };
    const touch = await page.evaluate((before) => {
      const api = window.__linjiangTavernLive;
      const frame = api.statusFrame;
      const chat = document.getElementById('chat');
      return {
        delta: Math.round(chat.scrollTop - before),
        events: frame.contentWindow.__nativeFlowEvents || [],
        framePosition: getComputedStyle(frame).position,
      };
    }, point.before);
    check(touch.delta > 30, 'dragging HUD natively scrolls #chat', `${touch.delta}px`);
    check(!touch.events.includes('touchScroll') && !touch.events.includes('wheel'), 'no synthetic scroll forwarding', JSON.stringify(touch.events));
    check(touch.framePosition === 'static', 'scroll does not change iframe positioning', touch.framePosition);
    check(raster.count <= 30 && raster.ms <= 40, 'native scroll avoids lifted-HUD raster churn', `${raster.count} tasks / ${raster.ms}ms`);

    /* Chrome device toolbar can keep pointerType=mouse. A mouse drag is not a
       native scroll gesture, so direct native-flow installs a mouse-only adapter. */
    const mousePoint = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const chat = document.getElementById('chat');
      const frame = api.statusFrame;
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + frame.getBoundingClientRect().top - pane.top - 20);
      const fr = frame.getBoundingClientRect();
      return {
        x: Math.round(fr.left + fr.width * .5),
        y: Math.round(fr.top + Math.min(260, fr.height * .35)),
        before: chat.scrollTop,
      };
    });
    await page.mouse.move(mousePoint.x, mousePoint.y);
    await page.mouse.down();
    await page.mouse.move(mousePoint.x, mousePoint.y - 150, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    const mouseDrag = await page.evaluate((before) => ({
      delta: Math.round(document.getElementById('chat').scrollTop - before),
      pageOpen: window.__linjiangTavernLive.statusFrame.contentDocument.documentElement.classList.contains('is-page-open'),
    }), mousePoint.before);
    check(mouseDrag.delta > 30 && !mouseDrag.pageOpen,
      'mouse drag anywhere on HUD scrolls #chat in browser mobile emulation', JSON.stringify(mouseDrag));

    /* A stationary mouse click remains a normal click; the adapter suppresses only
       the click generated after a completed drag. */
    const mouseClick = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const frame = window.__linjiangTavernLive.statusFrame;
      const pane = chat.getBoundingClientRect();
      chat.scrollTop = Math.max(0, chat.scrollTop + frame.getBoundingClientRect().top - pane.top - 20);
      const fr = frame.getBoundingClientRect();
      const btn = frame.contentDocument.querySelector('.ptool[data-page="events"]');
      const br = btn.getBoundingClientRect();
      return { x: Math.round(fr.left + br.left + br.width / 2), y: Math.round(fr.top + br.top + br.height / 2) };
    });
    await page.mouse.click(mouseClick.x, mouseClick.y);
    await page.waitForTimeout(350);
    check(await page.evaluate(() => window.__linjiangTavernLive.statusFrame.contentDocument.documentElement.classList.contains('is-page-open')),
      'stationary mouse click still opens a HUD page in browser mobile emulation');
    await page.evaluate(() => window.__linjiangTavernLive.statusFrame.contentDocument.querySelector('[data-page-close]')?.click());
    await page.waitForTimeout(250);

    const frameSelector = await page.evaluate(() => `#${CSS.escape(window.__linjiangTavernLive.statusFrame.id)}`);
    const hud = page.frameLocator(frameSelector);
    await hud.locator('.pdest-btn[data-page="settings"]').first().click();
    await page.waitForTimeout(200);
    const settings = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      return {
        open: doc.documentElement.classList.contains('is-page-open'),
        dockSetting: !!doc.querySelector('[data-pref-set="dockDefault"]'),
      };
    });
    check(settings.open && !settings.dockSetting, 'mobile settings hide desktop docking control', JSON.stringify(settings));
    await hud.locator('.pclose').click();
    await page.waitForTimeout(250);

    /* 整页 / 覆盖层的契约（这一段整体改过一次，原因值得留着）。
       ==================================================================
       原来这里断言的是「次级页面和商店都留在常规流的楼层里、`position:static`、宿主 chrome
       保持 visible」。那描述的是实现，不是需求，而且恰好把一个真实的 bug 锁在了错的一侧：

         · 覆盖层的 position:fixed 在楼层 srcdoc 文档里锚的是**那一楼**（宽=阅读栏、
           高=酒馆助手量出来的内容高），不是手机屏。所以商店根本没全屏，甚至在带模糊的主题上
           整层消失。
         · 次级整页是流内的高元素，body.scrollHeight 跟着涨、被写进楼层高度，于是 #chat 里
           多出一大片空区、工具栏被挤到重叠 —— 也就是「破坏了酒馆本身的布局」。

       现在的契约跟抬升架构一致（见 check-tavern-live.mjs 里那条「整页锚在视口原点」）：
       整页期间楼层自己铺满视口、盖住宿主 chrome；关掉之后一切按原样还回去。所以这里改成
       断言「进去铺满、出来复原」这一对，而不是断言楼层从不动。 */
    /* 顶部安全区必须让开。
       ==================================================================
       真机上「次级页面和商店顶部被遮挡、关闭钮要很用力往上滑才点得到」就是漏了这一条。
       诊断条给出的数字排除了我最初的猜测（以为是 TT 顶部导航栏压在上面）：

           楼层框    430x932 @0,0            ← 全屏本身是对的
           #top-bar  hidden fixed 430x35@0,59 ← 导航栏是隐藏的，没在挡

       占着顶上那一条的是 iOS 安全区（@0,59 里的 59）。TT 自己所有的面都靠 --tt-inset-top
       避开它，我们这条全屏路径也必须避。夹具里这个变量是 47px，所以下面按它来断言。 */
    const viewport = await page.evaluate(() => ({
      w: Math.round(window.visualViewport?.width || innerWidth),
      h: Math.round(window.visualViewport?.height || innerHeight),
      insetTop: Math.round(parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--tt-inset-top'),
      ) || 0),
    }));
    /* 普通浏览器宿主没有这个变量（值为 0），断言退化成「从 0 开始铺满」——跟以前一样。
       真正验「让开安全区」的是下面 host=tauritavern 那个用例，TT 会提供非零的 --tt-inset-top。
       所以这里只报数，不当失败：否则非 TT 用例会因为一个它压根没有的东西而红。 */
    if (kase.host === 'tauritavern') {
      check(viewport.insetTop > 0,
        '前提：TT 提供了非零顶部安全区（否则下面那条等于空转）', `--tt-inset-top=${viewport.insetTop}px`);
    } else {
      console.log(`  note  这个宿主没有顶部安全区，按 0 断言  --tt-inset-top=${viewport.insetTop}px`);
    }
    const restFloor = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        height: Math.round(frame.getBoundingClientRect().height),
        chatScroll: Math.round(chat.scrollHeight),
        /* 中和 fixed 包含块要动 #chat 的 backdrop-filter。它是主题的一部分，漏还原的后果是
           整个阅读区永久失去模糊 —— 这条断言就是为了让那种泄漏当场变红。 */
        backdrop: getComputedStyle(chat).backdropFilter,
      };
    });

    const readPageState = () => page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const box = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      return {
        open: doc.documentElement.classList.contains('is-page-open'),
        marker: doc.documentElement.dataset.linjiangNativePage || '',
        position: style.position,
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
        /* 整页期间滚动条归根节点，document 必须严格等于视口 —— 否则酒馆助手会照着
           body.scrollHeight 把楼层高度覆盖回内容高度。 */
        docOverflow: getComputedStyle(doc.documentElement).overflowY,
        rootOverflow: getComputedStyle(doc.getElementById('linjiang-mobile-native-root')).overflowY,
        bodyScroll: Math.round(doc.body.scrollHeight),
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
      };
    });
  /* 铺满「安全区以下的整个视口」，而不是从 0 开始铺满 —— 从 0 开始就会把顶部塞进状态栏底下，
     那正是真机上关闭钮点不到的成因。 */
    const covers = (state) => state.position === 'fixed' && state.left === 0
      && state.top === viewport.insetTop
      && Math.abs(state.width - viewport.w) <= 2
      && Math.abs(state.height - (viewport.h - viewport.insetTop)) <= 2;

    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
    await page.waitForTimeout(300);
    const pageState = await readPageState();
    check(pageState.open && pageState.marker === '1' && covers(pageState),
      'detail page pins the floor to the visual viewport', JSON.stringify(pageState));
    check(pageState.docOverflow === 'hidden' && pageState.rootOverflow === 'auto'
      && Math.abs(pageState.bodyScroll - (viewport.h - viewport.insetTop)) <= 2,
      'detail page keeps body height equal to the viewport (no height tug-of-war)', JSON.stringify(pageState));
    /* 打开就该停在顶部。整页模式下滚动容器是 #linjiang-mobile-native-root 而不是 window，
       HUD 原来调的 window.scrollTo 在那儿是空操作 —— 真机症状是页面不在顶部、右上角关闭钮
       在视野之外，要很用力往上滑才拽得出来。 */
    const atTop = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      const root = doc.getElementById('linjiang-mobile-native-root');
      return {
        rootScrollTop: Math.round(root?.scrollTop ?? -1),
        scrollable: !!root && root.scrollHeight > root.clientHeight + 1,
      };
    });
    check(atTop.rootScrollTop === 0,
      '次级页面打开时停在顶部（关闭钮在视野内）', JSON.stringify(atTop));
    check(pageState.topbar === 'hidden' && pageState.form === 'hidden',
      'detail page hides the tavern chrome it cannot out-stack', JSON.stringify(pageState));
    await hud.locator('.pclose').click();
    await page.waitForTimeout(300);
    const closed = await readPageState();
    check(!closed.open && !closed.marker && closed.position === 'static',
      'detail page closes back to native flow', JSON.stringify(closed));
    check(closed.topbar === 'visible' && closed.form === 'visible',
      'closing restores the tavern chrome', JSON.stringify(closed));
    const restored = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        height: Math.round(frame.getBoundingClientRect().height),
        chatScroll: Math.round(document.getElementById('chat').scrollHeight),
        backdrop: getComputedStyle(document.getElementById('chat')).backdropFilter,
      };
    });
    check(Math.abs(restored.height - restFloor.height) <= 4
      && Math.abs(restored.chatScroll - restFloor.chatScroll) <= 8,
      'closing gives the floor height back without inflating #chat',
      `${restored.height}/${restFloor.height}px floor, ${restored.chatScroll}/${restFloor.chatScroll}px chat`);
    check(restored.backdrop === restFloor.backdrop,
      'closing restores #chat backdrop-filter', `${restored.backdrop} vs ${restFloor.backdrop}`);

    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(400);
    const shop = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const floorDoc = frame.contentDocument;
      const host = document.getElementById('linjiang-native-overlay-portal');
      const shadow = host?.shadowRoot;
      const layer = shadow?.querySelector('.shop-layer');
      const iframe = layer?.querySelector('iframe');
      const hostBox = host?.getBoundingClientRect();
      const floorBox = frame.getBoundingClientRect();
      const vv = visualViewport;
      return {
        layer: !!layer,
        innerFrames: shadow?.querySelectorAll('.shop-layer iframe').length || 0,
        iframeSrc: iframe?.src || '',
        portalParent: host?.parentElement?.tagName?.toLowerCase() || '',
        portalOwner: host?.dataset.linjiangOwner || '',
        insetTop: Number(host?.dataset.linjiangInsetTop || 0),
        portalLeft: Math.round(hostBox?.left || 0),
        portalTop: Math.round(hostBox?.top || 0),
        portalW: Math.round(hostBox?.width || 0),
        portalH: Math.round(hostBox?.height || 0),
        visualLeft: Math.round(vv?.offsetLeft || 0),
        visualTop: Math.round(vv?.offsetTop || 0),
        visualW: Math.round(vv?.width || innerWidth),
        visualH: Math.round(vv?.height || innerHeight),
        floorPosition: getComputedStyle(frame).position,
        floorW: Math.round(floorBox.width),
        floorH: Math.round(floorBox.height),
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
        floorLayer: !!floorDoc.querySelector('.shop-layer'),
      };
    });

    const originCheck = await page.evaluate((hudOrigin) => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const floorDoc = frame.contentDocument;
      const host = document.getElementById('linjiang-native-overlay-portal');
      const iframe = host?.shadowRoot?.querySelector('.shop-layer iframe');
      return {
        hudBase: frame.contentWindow.__linjiangHudBase || '',
        floorBaseURI: floorDoc.baseURI,
        tavernOrigin: location.origin,
        shopResolved: iframe?.src || '',
        onHudOrigin: !!iframe && iframe.src.startsWith(hudOrigin),
        onTavernOrigin: !!iframe && iframe.src.startsWith(`${location.origin}/`),
      };
    }, HUD_ORIGIN);
    check(originCheck.hudBase.startsWith(HUD_ORIGIN),
      'shell publishes the HUD base to native-flow', originCheck.hudBase || '(empty)');
    check(originCheck.floorBaseURI.startsWith(originCheck.tavernOrigin),
      'fixture premise: floor srcdoc baseURI belongs to Tavern', originCheck.floorBaseURI.slice(0, 60));
    check(originCheck.onHudOrigin && !originCheck.onTavernOrigin,
      'shop iframe in host portal resolves on the HUD origin', originCheck.shopResolved);

    check(shop.layer && shop.innerFrames === 1 && shop.portalParent === 'body',
      'shop mounts in a Tavern-body portal with one page iframe',
      JSON.stringify({ layer: shop.layer, frames: shop.innerFrames, parent: shop.portalParent }));
    check(!shop.floorLayer && shop.floorPosition === 'static',
      'message floor stays in normal flow and no longer contains the overlay',
      JSON.stringify({ floorLayer: shop.floorLayer, position: shop.floorPosition }));
    check(shop.topbar === 'visible' && shop.form === 'visible',
      'portal out-stacks Tavern chrome without changing its visibility',
      JSON.stringify({ topbar: shop.topbar, form: shop.form }));
    const untouched = await page.evaluate(() => {
      const chat = document.getElementById('chat');
      return {
        chatBackdrop: getComputedStyle(chat).backdropFilter,
        chatStyleAttr: chat.getAttribute('style') || '',
        markers: document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length,
      };
    });
    check(untouched.chatBackdrop === restFloor.backdrop && untouched.chatStyleAttr === ''
      && untouched.markers === 0,
      '#chat backdrop and host geometry markers stay untouched', JSON.stringify(untouched));
    check(Math.abs(shop.portalLeft - shop.visualLeft) <= 2
      && Math.abs(shop.portalTop - (shop.visualTop + shop.insetTop)) <= 2
      && Math.abs(shop.portalW - shop.visualW) <= 2
      && Math.abs(shop.portalH - (shop.visualH - shop.insetTop)) <= 2,
      'portal fills the app viewport below the phone status-bar inset',
      `portal ${shop.portalW}x${shop.portalH}@${shop.portalLeft},${shop.portalTop}`
      + ` / visual ${shop.visualW}x${shop.visualH}@${shop.visualLeft},${shop.visualTop}`
      + ` insetTop=${shop.insetTop}`);

    /* 商店 iframe 现在住在 Tavern body portal；购买消息先到 Tavern window，再回调楼层里的
       direct bridge 写 MVU。走一次真实 UI 兑换，验证 request / MVU / result 三段没有因换父窗口断掉。 */
    let shopFrame = null;
    for (let attempt = 0; attempt < 30 && !shopFrame; attempt += 1) {
      shopFrame = page.frames().find((frame) => /\/shop\/index\.html(?:[?#]|$)/.test(frame.url())) || null;
      if (!shopFrame) await page.waitForTimeout(100);
    }
    let shopPurchase = null;
    if (shopFrame) {
      try {
        await shopFrame.evaluate(() => {
          localStorage.setItem('airp_arcade_tokens_v1', JSON.stringify({ balance: 1000, updatedAt: Date.now() }));
          localStorage.setItem('airp_arcade_token_progress_v1', JSON.stringify({
            unlocks: { fishing: true, scratch: true, slots: true },
            advanced: { fishing: true, scratch: true, slots: true },
            collections: {},
          }));
        });
        await shopFrame.goto(shopFrame.url(), { waitUntil: 'domcontentloaded' });
        await shopFrame.waitForSelector('.card[data-open]', { timeout: 10000 });
        const card = shopFrame.locator('.card[data-open]').first();
        const chosen = await card.evaluate((element) => ({
          name: element.querySelector('h2')?.textContent?.trim() || '',
          price: Number((element.querySelector('.price')?.textContent || '').match(/\d+/)?.[0] || 0),
        }));
        await card.click();
        const buy = shopFrame.locator('[data-detail-buy]');
        await buy.waitFor({ state: 'visible', timeout: 5000 });
        const enabled = await buy.isEnabled();
        if (enabled) await buy.click();
        await page.waitForFunction((name) => {
          const stat = window.Mvu?.getMvuData?.({ type: 'message', message_id: 'latest' })?.stat_data;
          const bag = stat?.玩家信息?.背包 || {};
          return !!(bag.用品?.[name] || bag.消耗品?.[name]);
        }, chosen.name, { timeout: 5000 });
        const mvuItem = await page.evaluate((name) => {
          const stat = window.Mvu.getMvuData({ type: 'message', message_id: 'latest' }).stat_data;
          const bag = stat?.玩家信息?.背包 || {};
          return bag.用品?.[name] || bag.消耗品?.[name] || null;
        }, chosen.name);
        const shopUi = await shopFrame.evaluate(() => ({
          wallet: JSON.parse(localStorage.getItem('airp_arcade_tokens_v1') || '{}').balance,
          detailClosed: document.getElementById('shade')?.hidden === true,
        }));
        shopPurchase = { ...chosen, item: mvuItem, ...shopUi };
      } catch (error) {
        shopPurchase = { error: error.message.split('\n')[0] };
      }
    }
    check(!!shopFrame && !!shopPurchase?.item && Number(shopPurchase.item.数量) === 1
      && shopPurchase.wallet === 1000 - shopPurchase.price && shopPurchase.detailClosed,
      'shop purchase crosses the portal bridge, writes MVU, and returns success', JSON.stringify(shopPurchase));

    await page.locator('#linjiang-native-overlay-portal [data-shop-close]').click();
    await page.waitForTimeout(300);
    const shopClosed = await readPageState();
    check(!shopClosed.open && !shopClosed.marker && shopClosed.position === 'static'
      && shopClosed.topbar === 'visible' && shopClosed.form === 'visible',
      'shop closes back to native flow without remounting the main HUD', JSON.stringify(shopClosed));
    const heightBack = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return Math.round(frame.getBoundingClientRect().height);
    });
    check(Math.abs(heightBack - restFloor.height) <= 6,
      'closing leaves floor height content-driven', `${heightBack}px vs ${restFloor.height}px`);
    check(await page.evaluate(() => !document.getElementById('linjiang-native-overlay-portal')),
      'closing removes the host portal');

    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(400);
    const reopened = await page.evaluate(() => {
      const host = document.getElementById('linjiang-native-overlay-portal');
      const iframe = host?.shadowRoot?.querySelector('.shop-layer iframe');
      return {
        host: !!host,
        frame: !!iframe,
        src: iframe?.src || '',
        width: Math.round(host?.getBoundingClientRect().width || 0),
        height: Math.round(host?.getBoundingClientRect().height || 0),
      };
    });
    check(reopened.host && reopened.frame && reopened.src.startsWith(HUD_ORIGIN)
      && reopened.width > 0 && reopened.height > 0,
      'second open creates a fresh visible portal and iframe', JSON.stringify(reopened));
    await page.locator('#linjiang-native-overlay-portal [data-shop-close]').click();
    await page.waitForTimeout(250);
    check(await page.evaluate(() => !document.getElementById('linjiang-native-overlay-portal')),
      'second close also leaves no black portal');

    /* CG 解锁常常发生在正文页、画廊尚未打开的时候。portal 架构下 HUD srcdoc 与 Pages
       CG iframe 不同 origin，先记录、后开页也必须把持久快照同步过去。 */
    const cgStoredBeforeOpen = await page.evaluate(async () => {
      const frame = window.__linjiangTavernLive.statusFrame;
      frame.contentWindow.localStorage.removeItem('unlocked_cg');
      window.postMessage({
        channel: 'linjiang-cg-unlock', type: 'record', id: 'fixture-cg-closed',
        category: 'SFW', character: '东雪莲', scene: '通用', count: 2,
      }, '*');
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const saved = JSON.parse(frame.contentWindow.localStorage.getItem('unlocked_cg') || '{}');
        if (saved?.东雪莲?.通用 === 2) return saved.东雪莲.通用;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return 0;
    });
    check(cgStoredBeforeOpen === 2, 'CG record persists in the native HUD while the gallery is closed', cgStoredBeforeOpen);

    /* CG 的一级卡片点击必须真的进入人物详情。这里刻意让 HUD 先喂对象信息：独立打开 CG 页时
       没数据会走 0 好感的短路，曾把外壳漏掉 getContactAffection 的错误藏住。 */
    await hud.locator('.pdest-btn[data-page="cg"]').first().click();
    await page.waitForFunction(() => !!document.getElementById('linjiang-native-overlay-portal')
      ?.shadowRoot?.querySelector('.cg-layer iframe'), { timeout: 10000 });
    let cgFrame = null;
    for (let attempt = 0; attempt < 30 && !cgFrame; attempt += 1) {
      cgFrame = page.frames().find((frame) => /\/cg\/index\.html(?:[?#]|$)/.test(frame.url())) || null;
      if (!cgFrame) await page.waitForTimeout(100);
    }
    let cgDetail = null;
    if (cgFrame) {
      try {
        await cgFrame.waitForSelector('.cg-character-card', { timeout: 10000 });
        await cgFrame.waitForFunction(() => {
          const saved = JSON.parse(localStorage.getItem('unlocked_cg') || '{}');
          return saved?.东雪莲?.通用 === 2;
        }, null, { timeout: 5000 });
        const synced = await cgFrame.evaluate(() => JSON.parse(localStorage.getItem('unlocked_cg') || '{}')?.东雪莲?.通用 || 0);
        check(synced === 2, 'opening CG syncs unlocks recorded while its iframe was absent', synced);

        const cgPageOne = await cgFrame.evaluate(() => ({
          page: document.querySelector('.cg-pagination span')?.textContent?.trim() || '',
          names: [...document.querySelectorAll('.cg-character-name')].map((element) => element.textContent.trim()),
          nextDisabled: document.querySelector('.cg-page-btn[data-direction="next"]')?.disabled ?? true,
        }));
        if (!cgPageOne.nextDisabled) {
          await cgFrame.locator('.cg-page-btn[data-direction="next"]').click();
          await cgFrame.waitForFunction((firstPage) => {
            const names = [...document.querySelectorAll('.cg-character-name')].map((element) => element.textContent.trim());
            return names.join('\u0000') !== firstPage.join('\u0000');
          }, cgPageOne.names, { timeout: 5000 });
          const cgPageTwo = await cgFrame.evaluate(() => ({
            page: document.querySelector('.cg-pagination span')?.textContent?.trim() || '',
            names: [...document.querySelectorAll('.cg-character-name')].map((element) => element.textContent.trim()),
            prevDisabled: document.querySelector('.cg-page-btn[data-direction="prev"]')?.disabled ?? true,
          }));
          check(cgPageTwo.page !== cgPageOne.page && cgPageTwo.names.join('\u0000') !== cgPageOne.names.join('\u0000')
            && !cgPageTwo.prevDisabled,
            'CG next-page button changes the character page inside the portal',
            JSON.stringify({ first: cgPageOne, second: cgPageTwo }));
          await cgFrame.locator('.cg-page-btn[data-direction="prev"]').click();
          await cgFrame.waitForFunction((firstPage) => {
            const names = [...document.querySelectorAll('.cg-character-name')].map((element) => element.textContent.trim());
            return names.join('\u0000') === firstPage.join('\u0000');
          }, cgPageOne.names, { timeout: 5000 });
          const cgPageBack = await cgFrame.evaluate(() => ({
            page: document.querySelector('.cg-pagination span')?.textContent?.trim() || '',
            names: [...document.querySelectorAll('.cg-character-name')].map((element) => element.textContent.trim()),
          }));
          check(cgPageBack.page === cgPageOne.page
            && cgPageBack.names.join('\u0000') === cgPageOne.names.join('\u0000'),
            'CG previous-page button restores the first character page', JSON.stringify(cgPageBack));
        } else {
          check(false, 'CG fixture exposes more than one character page', JSON.stringify(cgPageOne));
        }

        await cgFrame.locator('.cg-character-cover').first().click();
        await cgFrame.waitForSelector('.cg-character-detail-container', { timeout: 5000 });
        cgDetail = await cgFrame.evaluate(() => ({
          title: document.getElementById('phone-app-title')?.textContent?.trim() || '',
          detail: !!document.querySelector('.cg-character-detail-container'),
          backVisible: !document.getElementById('cg-back-btn')?.hidden,
          scenes: document.querySelectorAll('.cg-character-detail-container .cg-item').length,
        }));
      } catch (error) {
        cgDetail = { error: error.message.split('\n')[0] };
      }
    }
    check(!!cgFrame && cgDetail?.detail && cgDetail.backVisible && cgDetail.scenes > 0,
      'CG character cover opens its own detail page inside the portal', JSON.stringify(cgDetail));
    if (cgFrame && cgDetail?.detail) {
      await cgFrame.locator('#cg-back-btn').click();
      await cgFrame.waitForSelector('.cg-character-card');
      const cgBack = await cgFrame.evaluate(() => ({
        title: document.getElementById('phone-app-title')?.textContent?.trim() || '',
        cards: document.querySelectorAll('.cg-character-card').length,
        backHidden: document.getElementById('cg-back-btn')?.hidden,
      }));
      check(cgBack.title === 'CG收集' && cgBack.cards > 0 && cgBack.backHidden,
        'CG detail returns to the character list', JSON.stringify(cgBack));
      await page.evaluate(() => window.postMessage({
        channel: 'linjiang-cg-unlock', type: 'record', id: 'fixture-cg-open',
        category: 'NSFW', character: '东雪莲', scene: '乳交', count: 2,
      }, '*'));
      await cgFrame.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem('unlocked_cg') || '{}');
        return saved?.东雪莲?.乳交 === 2;
      }, null, { timeout: 5000 });
      const liveUnlock = await cgFrame.evaluate(() => JSON.parse(localStorage.getItem('unlocked_cg') || '{}')?.东雪莲?.乳交 || 0);
      check(liveUnlock === 2, 'an open CG portal receives unlock records immediately', liveUnlock);
    }
    await page.locator('#linjiang-native-overlay-portal [data-cg-close]').click();
    await page.waitForTimeout(250);
    check(await page.evaluate(() => !document.getElementById('linjiang-native-overlay-portal')),
      'closing CG removes its host portal');

    /* Arcade is the reported landscape case. Its outer iframe must receive the whole
       phone viewport; the arcade page can then rotate its own landscape scene against
       real screen dimensions instead of the shorter #chat box. */
    await hud.locator('.pdest-btn[data-page="arcade"]').first().click();
    await page.waitForTimeout(500);
    const arcadePortal = await page.evaluate(() => {
      const host = document.getElementById('linjiang-native-overlay-portal');
      const iframe = host?.shadowRoot?.querySelector('.arcade-layer iframe');
      const hr = host?.getBoundingClientRect();
      const fr = iframe?.getBoundingClientRect();
      const vv = visualViewport;
      return {
        host: !!host,
        frame: !!iframe,
        hostW: Math.round(hr?.width || 0),
        hostH: Math.round(hr?.height || 0),
        frameW: Math.round(fr?.width || 0),
        frameH: Math.round(fr?.height || 0),
        visualW: Math.round(vv?.width || innerWidth),
        visualH: Math.round(vv?.height || innerHeight),
        insetTop: Number(host?.dataset.linjiangInsetTop || 0),
      };
    });
    check(arcadePortal.host && arcadePortal.frame
      && Math.abs(arcadePortal.hostW - arcadePortal.visualW) <= 2
      && Math.abs(arcadePortal.hostH - (arcadePortal.visualH - arcadePortal.insetTop)) <= 2
      && Math.abs(arcadePortal.frameW - arcadePortal.visualW) <= 2
      && Math.abs(arcadePortal.frameH - (arcadePortal.visualH - arcadePortal.insetTop)) <= 2,
      'arcade iframe receives the full app viewport below the phone status bar', JSON.stringify(arcadePortal));
    const arcadeFrame = page.frames().find((frame) => /\/arcade\/index\.html(?:[?#]|$)/.test(frame.url()));
    let arcadeReady = null;
    if (arcadeFrame) {
      try {
        await arcadeFrame.waitForFunction(() => {
          const loader = document.getElementById('loader');
          const game = document.getElementById('frame');
          return !!game?.getAttribute('src') && (loader.hidden || getComputedStyle(loader).display === 'none');
        }, null, { timeout: 5000 });
        arcadeReady = await arcadeFrame.evaluate(() => ({
          loaderHidden: document.getElementById('loader')?.hidden || false,
          gameSrc: document.getElementById('frame')?.getAttribute('src') || '',
          balance: document.getElementById('balance')?.textContent?.trim() || '',
        }));
      } catch (error) {
        arcadeReady = { error: error.message.split('\n')[0] };
      }
    }
    check(!!arcadeFrame && arcadeReady?.loaderHidden && !!arcadeReady.gameSrc,
      'arcade portal completes the HUD handshake and leaves its internal loader', JSON.stringify(arcadeReady));
    const arcadeCloseLayout = arcadeFrame ? await arcadeFrame.evaluate(() => {
      const close = document.getElementById('arcadeClose');
      const topbar = document.querySelector('.topbar');
      const r = close?.getBoundingClientRect();
      return {
        present: !!close, inTopbar: !!close && close.closest('.topbar') === topbar,
        visible: !!close && getComputedStyle(close).display !== 'none',
        width: Math.round(r?.width || 0), height: Math.round(r?.height || 0),
      };
    }) : null;
    const outerArcadeClose = await page.evaluate(() => !!document.getElementById('linjiang-native-overlay-portal')
      ?.shadowRoot?.querySelector('[data-arcade-close]'));
    check(!outerArcadeClose && arcadeCloseLayout?.present && arcadeCloseLayout.inTopbar
      && arcadeCloseLayout.visible && arcadeCloseLayout.width >= 40 && arcadeCloseLayout.height >= 40,
      'arcade close is layout-reserved in the lobby topbar, not floating over game controls',
      JSON.stringify({ outerArcadeClose, arcadeCloseLayout }));
    let arcadeMusic = null;
    if (arcadeFrame) {
      try {
        await arcadeFrame.locator('#tab-scratch').click();
        await page.waitForTimeout(700);
        const scratchFrame = page.frames().find((frame) => /\/arcade\/scratch\.html(?:[?#]|$)/.test(frame.url()));
        if (scratchFrame) {
          /* A physical tap at the portal center crosses both iframe boundaries and
             the lobby's forced-landscape transform, matching the real phone gesture. */
          const vp = page.viewportSize();
          await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height / 2));
          await page.waitForTimeout(1200);
          arcadeMusic = await scratchFrame.evaluate(() => {
            const a = window.__airpBgmAudio;
            return a ? {
              src: a.currentSrc || a.src || '', readyState: a.readyState,
              paused: a.paused, currentTime: Number(a.currentTime || 0), error: a.error?.code || 0,
            } : null;
          });
        }
      } catch (error) {
        arcadeMusic = { error: error.message.split('\n')[0] };
      }
    }
    check(!!arcadeMusic && /96da335a-8e9b-4529-8000-12b4e1924942\.mp3(?:[?#]|$)/.test(arcadeMusic.src || '')
      && arcadeMusic.readyState >= 2 && !arcadeMusic.paused && arcadeMusic.currentTime > 0,
      'mobile portal plays local arcade music after a user gesture', JSON.stringify(arcadeMusic));
    await arcadeFrame.evaluate(() => document.getElementById('arcadeClose')?.click());
    await page.waitForTimeout(250);
    await hud.locator('.pdest-btn[data-page="arcade"]').first().click();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => {
      const host = document.getElementById('linjiang-native-overlay-portal');
      return !!host?.shadowRoot?.querySelector('.arcade-layer iframe');
    }), 'arcade also survives close then second open');
    const arcadeFrame2 = page.frames().find((frame) => /\/arcade\/index\.html(?:[?#]|$)/.test(frame.url()));
    await arcadeFrame2?.evaluate(() => document.getElementById('arcadeClose')?.click());
    await page.waitForTimeout(250);

    /* Detail pages still use fixed-floor geometry; keep the existing orphan-state recovery check. */
    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
    await page.waitForTimeout(400);
    const beforeKill = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      return {
        floorPosition: getComputedStyle(frame).position,
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
        markers: document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length,
      };
    });
    check(beforeKill.floorPosition === 'fixed' && beforeKill.topbar === 'hidden',
      '前提：整页状态已生效（楼层 fixed、chrome 隐藏）', JSON.stringify(beforeKill));

    /* 先把页面关掉，再造残局。
       ------------------------------------------------------------------
       这一步是新加的，原因是"文档被销毁后恢复用户那一页"上线之后，这段测试的前提失效了：
       页面开着的话，重建的文档会**正确地把它恢复回来**，于是整页几何再次生效、记号再次出现，
       而这段要验的恰恰是"没有页面时不许留残留"。两个契约都对，只是不能叠在一起测。 */
    await hud.locator('.pclose').click();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const node = frame.closest('.mes') || frame;
      return !node.dataset.linjiangUiPage;
    }), '关页之后楼层不再记着任何页面（否则下面会被恢复干扰）');

    await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const chat = document.getElementById('chat');
      /* 1. 先让当前文档正常退出整页（它还活着，会自己收干净）。 */
      frame.srcdoc = frame.srcdoc;
      /* 2. 再手工摆出「死文档留下的残局」。这一步刻意绕过所有活代码，就像那个文档从没有
            机会执行清理一样。saved 值按真实 patch 的形状写：[value, priority]。 */
      window.__linjiangPlantLeak = () => {
        frame.setAttribute('data-linjiang-floor-saved', '');
        frame.style.cssText = [
          'position:fixed', 'left:0', 'top:0', 'width:100%', 'height:100%',
          'z-index:2147483000', 'background:#05040a', 'overflow:hidden',
        ].join(';');
        chat.setAttribute('data-linjiang-cb-saved', JSON.stringify({
          'backdrop-filter': ['', ''], '-webkit-backdrop-filter': ['', ''],
        }));
        chat.style.setProperty('backdrop-filter', 'none', 'important');
        ['top-bar', 'top-settings-holder', 'form_sheld'].forEach((id) => {
          const el = document.getElementById(id);
          if (!el) return;
          el.setAttribute('data-linjiang-cb-saved', JSON.stringify({ visibility: ['', ''] }));
          el.style.setProperty('visibility', 'hidden', 'important');
        });
      };
    });
    await page.waitForTimeout(2500);
    /* 残局要在新文档挂载**之前**摆好，否则那一任已经收拾过了。用一次再重载来制造
       「先有残局、后有新控制器」的顺序。 */
    await page.evaluate(() => {
      window.__linjiangPlantLeak();
      const frame = window.__linjiangTavernLive.statusFrame;
      frame.srcdoc = frame.srcdoc;
    });
    await page.waitForTimeout(3500);

    const healed = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const chat = document.getElementById('chat');
      return {
        floorPosition: getComputedStyle(frame).position,
        topbar: getComputedStyle(document.getElementById('top-bar')).visibility,
        form: getComputedStyle(document.getElementById('form_sheld')).visibility,
        chatBackdrop: getComputedStyle(chat).backdropFilter,
        leftoverMarkers: document.querySelectorAll('[data-linjiang-cb-saved],[data-linjiang-floor-saved]').length,
      };
    });
    check(healed.floorPosition === 'static',
      '楼层文档被销毁后，楼层几何自愈（不再钉在满视口）', healed.floorPosition);
    check(healed.topbar === 'visible' && healed.form === 'visible',
      '楼层文档被销毁后，酒馆 chrome 自愈（这是黑屏的直接成因）', JSON.stringify(healed));
    check(healed.chatBackdrop !== 'none' && healed.leftoverMarkers === 0,
      '#chat 的 backdrop-filter 还原，且宿主上不留残留记号', JSON.stringify(healed));
    /* 内嵌页面取不回来时，用户必须看到「可读的等待」，而不是一片近黑。
       ==================================================================
       真机实况（诊断条读出来的）：
           商店加载：等待中           ← load 从未触发
           商店内页：同源 body节点=0   ← 还停在初始 about:blank
       楼层是 tauri://localhost/、商店在 Pages 上，两者不可能同源 —— 能读到且 body 为空，
       说明那个 iframe 压根没导航过去。屏幕上于是只剩 .shop-layer 的底色 #0c1024（近黑），
       用户报的就是"点商店直接黑屏"，而"多开几次就好了"是命中了缓存。

       根因是这几个页面走 GitHub Pages，国内可能很慢甚至取不回来（本仓库早就量过 178~240 秒，
       素材因此改走 jsDelivr；但页面不能简单换源，街机和 CG 的 localStorage 存档绑在 origin 上）。

       所以这里锁的不是"加载要多快"，而是**失败模式必须是可理解、可退出的**：
       拦掉商店地址模拟取不回来，断言加载层在、有文字、并且给出重试/关闭。 */
    await page.route('**/shop/index.html*', (route) => { /* 永不响应，模拟取不回来 */ });
    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForTimeout(1200);
    const loadingEarly = await page.evaluate(() => {
      const host = document.getElementById('linjiang-native-overlay-portal');
      const box = host?.shadowRoot?.querySelector('.shop-layer .overlay-loading');
      if (!box) return { present: false };
      const r = box.getBoundingClientRect();
      return {
        present: true,
        area: Math.round(r.width * r.height),
        text: (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        buttons: box.querySelectorAll('button').length,
        buttonsVisible: [...box.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null).length,
      };
    });
    check(loadingEarly.present && loadingEarly.area > 10000 && loadingEarly.text.includes('正在加载'),
      '内嵌页面加载期间显示可读的等待状态（不是一片近黑）', JSON.stringify(loadingEarly));

    /* 超过 SLOW_MS（6s）之后必须给出解释和出路，否则用户只能杀进程。 */
    await page.waitForTimeout(6500);
    const loadingSlow = await page.evaluate(() => {
      const host = document.getElementById('linjiang-native-overlay-portal');
      const box = host?.shadowRoot?.querySelector('.shop-layer .overlay-loading');
      if (!box) return { present: false };
      return {
        present: true,
        text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
        buttonsVisible: [...box.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()),
      };
    });
    check(loadingSlow.present && loadingSlow.buttonsVisible.includes('重试')
      && loadingSlow.buttonsVisible.includes('关闭'),
      '慢到一定程度给出重试与关闭（用户有出路）', JSON.stringify(loadingSlow.buttonsVisible));
    check(/慢|网络/.test(loadingSlow.text),
      '并且解释了为什么慢', loadingSlow.text.slice(0, 60));

    /* 用它自己的关闭钮退出：这条路不依赖被测页面加载成功。 */
    await page.locator('#linjiang-native-overlay-portal .shop-layer .overlay-loading button').last().click();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => !document.getElementById('linjiang-native-overlay-portal')),
      '等待状态里的关闭钮真的能退出');
    await page.unroute('**/shop/index.html*');

    /* 楼层文档被销毁重建之后，用户正在看的那一页必须回来。
       ==================================================================
       真机症状（TT「角色卡渲染管理 = 自动」）：打开主播完整档案、来回上下滑几次，面板会突然
       像刷新一样消失、视口回到滚动条中央；把渲染管理关掉就不会。

       成因：渲染管理随滚动把楼层挪进/挪出停车场，被挪的那条**楼层文档会被销毁重建**。原生流
       下 HUD 的整个 DOM（包括"当前打开哪一页"）就住在那个文档里，所以面板凭空消失。

       这里用重新赋值 srcdoc 复现"文档被换掉"。它比真机温和（会正常触发 pagehide），但对这条
       契约足够：要验的是"新文档挂载后能不能把那一页恢复回来"。恢复状态只记在当前消息楼层
       元素的 dataset 上：srcdoc 重建时还在，整条消息删除时跟着元素一起销毁。 */
    await hud.locator('.pdest-btn[data-page="schedule"]').first().click();
    await page.waitForTimeout(400);
    check(await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      return doc.documentElement.classList.contains('is-page-open');
    }), '前提：次级页面已打开');
    const remembered = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const node = frame.closest('.mes') || frame;
      try {
        const value = JSON.parse(node.dataset.linjiangUiPage || 'null');
        return value?.page ? `${value.page}/${value.arg ?? '-'}` : '(没记住)';
      } catch { return '(坏数据)'; }
    });
    check(remembered.startsWith('schedule'),
      '壳层把当前页只记在所属消息楼层上（文档重建可恢复、楼层删除即销毁）', remembered);

    await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      frame.srcdoc = frame.srcdoc;   // 换一个新文档
    });
    await page.waitForTimeout(4500);
    const revived = await page.evaluate(() => {
      const doc = window.__linjiangTavernLive.statusFrame.contentDocument;
      return {
        pageOpen: doc.documentElement.classList.contains('is-page-open'),
        restoreGlobal: !!doc.defaultView.__linjiangRestorePage,
        hasPanel: !!doc.querySelector('.pclose'),
        rootNodes: doc.getElementById('linjiang-mobile-native-root')?.querySelectorAll('*').length ?? -1,
      };
    });
    /* 门槛按「恢复出来的是一页，不是完整基础列」定：日程页约 86 个节点，而基础列有 300+。
       原来照基础列写了 >100，结果把正确行为判成失败 —— 恢复的本来就该只是那一页。
       真正要挡住的是"挂了个空壳"，所以 40 足够。 */
    check(revived.rootNodes > 40, '楼层文档换掉后 HUD 重新挂上了', `根节点 ${revived.rootNodes}`);
    check(revived.pageOpen && revived.hasPanel,
      '并且把用户正在看的那一页恢复回来了（不再凭空消失）', JSON.stringify(revived));

    /* Character archive is the long-page control. Use a real CDP touch gesture,
       not a direct scrollTop write: the reported failure is specifically that iOS
       chooses a non-scrollable target when the first full-screen gesture begins. */
    await hud.locator('[data-page-close]').first().click();
    await page.waitForTimeout(350);
    await hud.locator('.prail > .pcard').first().click();
    await hud.locator('.ppanel.is-preview').waitFor({ timeout: 5000 });
    await hud.locator('[data-character-full]').evaluate((element) => element.click());
    await hud.locator('.parc-id').waitFor({ timeout: 5000 });
    await page.waitForTimeout(650);
    const archiveStart = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const root = doc.getElementById('linjiang-mobile-native-root');
      return {
        scrollTop: Math.round(root.scrollTop),
        scrollHeight: Math.round(root.scrollHeight),
        clientHeight: Math.round(root.clientHeight),
        floorPosition: getComputedStyle(frame).position,
        hasArchive: !!doc.querySelector('.parc-id'),
      };
    });
    const x = Math.round(kase.w * 0.5);
    const y0 = Math.round(kase.h * 0.72);
    const y1 = Math.round(kase.h * 0.30);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y: y0, radiusX: 6, radiusY: 6, force: 1 }],
    });
    for (let step = 1; step <= 7; step += 1) {
      const y = Math.round(y0 + (y1 - y0) * step / 7);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }],
      });
      await page.waitForTimeout(24);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(900);
    const archiveAfter = await page.evaluate(() => {
      const frame = window.__linjiangTavernLive.statusFrame;
      const doc = frame.contentDocument;
      const root = doc.getElementById('linjiang-mobile-native-root');
      return {
        scrollTop: Math.round(root.scrollTop),
        scrollHeight: Math.round(root.scrollHeight),
        clientHeight: Math.round(root.clientHeight),
        floorPosition: getComputedStyle(frame).position,
        hasArchive: !!doc.querySelector('.parc-id'),
        uiPage: (() => {
          try {
            const node = frame.closest('.mes') || frame;
            return JSON.parse(node.dataset.linjiangUiPage || 'null')?.page || '';
          } catch { return ''; }
        })(),
      };
    });
    check(archiveStart.hasArchive && archiveStart.floorPosition === 'fixed'
      && archiveStart.scrollHeight > archiveStart.clientHeight,
      'character archive enters fullscreen only after vertical overflow exists', JSON.stringify(archiveStart));
    check(archiveAfter.hasArchive && archiveAfter.floorPosition === 'fixed'
      && archiveAfter.scrollTop > archiveStart.scrollTop + 40,
      'a real first touch gesture scrolls the character archive instead of freezing',
      JSON.stringify({ before: archiveStart, after: archiveAfter }));
    check(archiveAfter.uiPage === 'character',
      'character archive remains open after the first scroll gesture', JSON.stringify(archiveAfter));

    /* 最终生命周期回归：让一个楼层开着跨文档 portal 时直接删除整条消息。壳层必须在 pagehide /
       DOM 移除路径里清掉轮询、重试定时器、宿主监听、直接 bridge 和顶层 portal。旧 iframe 只由
       夹具临时保留引用读取清理标记，读完马上释放。 */
    await hud.locator('[data-page-close]').first().click();
    await page.waitForTimeout(300);
    await hud.locator('.pdest-btn[data-page="shop"]').first().click();
    await page.waitForFunction(() => !!document.getElementById('linjiang-native-overlay-portal'), { timeout: 5000 });
    const beforeRemoveCount = await page.evaluate(() => {
      const api = window.__linjiangTavernLive;
      const frame = api.statusFrame;
      window.__linjiangRemovedFrameProbe = frame;
      window.__linjiangRemovedOwnerProbe = frame.contentWindow?.__linjiangMobileDirectBridge?.owner || '';
      const index = api.statusFrames.indexOf(frame);
      const count = api.statusFloorCount();
      api.removeStatusFloor(index);
      return count;
    });
    await page.waitForTimeout(700);
    const disposed = await page.evaluate(() => {
      const frame = window.__linjiangRemovedFrameProbe;
      const owner = window.__linjiangRemovedOwnerProbe;
      const result = {
        before: Number(frame?.dataset?.linjiangDisposedListeners ?? -1),
        disposed: frame?.dataset?.linjiangDisposed || '',
        listeners: Number(frame?.dataset?.linjiangDisposedListeners ?? -1),
        poll: Number(frame?.dataset?.linjiangDisposedPoll ?? -1),
        retry: Number(frame?.dataset?.linjiangDisposedRetry ?? -1),
        bridge: frame?.dataset?.linjiangDisposedBridge || '',
        connected: !!frame?.isConnected,
        remaining: window.__linjiangTavernLive.statusFloorCount(),
        portal: !!document.getElementById('linjiang-native-overlay-portal'),
        manager: !!window.__linjiangHudManagerV2,
        ownedTopNodes: owner ? document.querySelectorAll(`[data-linjiang-owner="${CSS.escape(owner)}"]`).length : 0,
      };
      delete window.__linjiangRemovedFrameProbe;
      delete window.__linjiangRemovedOwnerProbe;
      return result;
    });
    check(disposed.disposed === '1' && disposed.listeners === 0
      && disposed.poll === 0 && disposed.retry === 0 && disposed.bridge === 'false',
      'removing a floor actively releases timers, host listeners, and the direct bridge', JSON.stringify(disposed));
    check(!disposed.connected && disposed.remaining === beforeRemoveCount - 1
      && !disposed.portal && !disposed.manager && disposed.ownedTopNodes === 0,
      'removing the floor leaves no HUD DOM, portal, owner node, or top-window registry', JSON.stringify(disposed));

    check(errors.length === 0, 'no script errors', errors.slice(0, 3).join(' | '));
  } catch (error) {
    check(false, `${kase.id} execution`, error.message);
  }
  await page.close();
}

await browser.close();
await server.close();
await hudServer.close();
console.log(`\nReal sources: ST ${meta.versions.sillytavern} / Tavern Helper ${meta.versions.tavernHelper}`);
if (failures.length) {
  console.log('\nNative mobile-flow regression failed:');
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('Native mobile-flow regression: all checks passed');
