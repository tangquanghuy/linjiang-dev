/* Full HUD -> arcade lobby -> fishing wallet transaction regression.
 * Covers stale host snapshots, deterministic golden-whale payout, and no-catch
 * auto-fire balance monotonicity through the real Tavern fixture.
 */
import { chromium } from 'playwright';
import { startFixtureServer } from './lib/fixture-server.mjs';
import { stageRealSources } from './lib/real-tavern-sources.mjs';

stageRealSources({ quiet: true });
const server = await startFixtureServer({ port: 5238 });
const browser = await chromium.launch({ headless: true });
const fixtureUrl = (() => {
  const query = new URLSearchParams({
    chrome: '0', preset: 'desktop-work', theme: 'Dark V 1.0',
    floors: '12', rendered: '2', shell: 'inline',
  });
  return `${server.url}/tools/tavern-live-fixture.html?${query}`;
})();

async function openFishing(randomWord) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((word) => {
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      configurable: true,
      value(array) { array.fill(word); return array; },
    });
  }, randomWord);
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__linjiangTavernLive, { timeout: 45000 });
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilReady());
  await page.evaluate(() => window.__linjiangTavernLive.waitUntilPainted());
  await page.frameLocator('#linjiang-hud-live').locator('button[data-page="arcade"]').first().click();
  await page.waitForTimeout(900);
  const lobby = page.frames().find((frame) => /\/arcade\/index\.html(?:[?#]|$)/.test(frame.url()));
  await lobby.locator('#tab-fishing').click();
  await page.waitForTimeout(1100);
  const fishing = page.frames().find((frame) => /\/arcade\/fishing\.html(?:[?#]|$)/.test(frame.url()));
  if (!lobby || !fishing) throw new Error('arcade/fishing frame did not load');
  return { context, page, lobby, fishing };
}

const results = {};
try {
  {
    const run = await openFishing(0);
    const { page, lobby, fishing, context } = run;
    await fishing.evaluate(() => {
      window.__balancePushes = [];
      addEventListener('message', (event) => {
        if (event.data?.type === 'airp-fishing:set-balance') window.__balancePushes.push(event.data.balance);
      });
    });
    const start = await fishing.evaluate(() => {
      const game = window.AIRPFishingGame;
      const initial = game.getBalance();
      const id = game.spawn('whale');
      game.lockTarget(id);
      return { initial, fired: game.fire(), afterShot: game.getBalance() };
    });
    await fishing.waitForFunction(
      () => window.AIRPFishingGame.getState().history.some((row) => row.fishType === 'whale' && row.payout > 0),
      null,
      { timeout: 7000 },
    );
    await page.waitForTimeout(1800);
    const game = await fishing.evaluate(() => ({
      balance: window.AIRPFishingGame.getBalance(),
      state: window.AIRPFishingGame.getState(),
      pushes: window.__balancePushes,
    }));
    const lobbyWallet = await lobby.evaluate(() => JSON.parse(localStorage.getItem('airp_arcade_wallet_v1') || '{}'));
    const whale = game.state.history.find((row) => row.fishType === 'whale' && row.payout > 0);
    const expected = start.initial - 10 + 1000;
    results.whale = { start, expected, gameBalance: game.balance, lobbyBalance: lobbyWallet.balance, whale, pushes: game.pushes };
    if (!start.fired || start.afterShot !== start.initial - 10) throw new Error(`whale shot charge: ${JSON.stringify(start)}`);
    if (!whale || whale.payout !== 1000) throw new Error(`whale payout: ${JSON.stringify(whale)}`);
    if (game.balance !== expected || lobbyWallet.balance !== expected) throw new Error(`whale balance: ${JSON.stringify(results.whale)}`);
    if (game.pushes.length) throw new Error(`stale host balance pushes after whale shot: ${game.pushes.join(',')}`);
    await context.close();
  }

  {
    const run = await openFishing(0xffffffff);
    const { page, fishing, context } = run;
    await fishing.evaluate(() => {
      window.__walletTrace = [{ type: 'start', balance: window.AIRPFishingGame.getBalance(), time: performance.now() }];
      for (const type of ['airp-fishing:shot', 'airp-fishing:refund', 'airp-fishing:settled']) {
        addEventListener(type, (event) => window.__walletTrace.push({
          type, balance: event.detail?.balance, captured: event.detail?.captured,
          payout: event.detail?.payout || 0, time: performance.now(),
        }));
      }
      let previous = window.AIRPFishingGame.getBalance();
      function sample() {
        const balance = window.AIRPFishingGame.getBalance();
        if (balance !== previous) {
          window.__walletTrace.push({ type: 'balance-change', from: previous, balance, time: performance.now() });
          previous = balance;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      const game = window.AIRPFishingGame;
      const id = game.spawn('whale');
      game.lockTarget(id);
      document.getElementById('autoButton').click();
    });
    await page.waitForTimeout(4200);
    await fishing.evaluate(() => document.getElementById('autoButton').click());
    await page.waitForTimeout(1700);
    const noCatch = await fishing.evaluate(() => ({
      balance: window.AIRPFishingGame.getBalance(),
      state: window.AIRPFishingGame.getState(),
      trace: window.__walletTrace,
    }));
    const captures = noCatch.trace.filter((row) => row.type === 'airp-fishing:settled' && row.captured);
    const refunds = noCatch.trace.filter((row) => row.type === 'airp-fishing:refund');
    const rises = noCatch.trace.filter((row) => row.type === 'balance-change' && row.balance > row.from);
    const initial = noCatch.trace[0].balance;
    const expected = initial - noCatch.state.stats.spent + noCatch.state.stats.paid;
    results.noCatch = {
      initial, final: noCatch.balance, expected, shots: noCatch.state.stats.shots,
      spent: noCatch.state.stats.spent, paid: noCatch.state.stats.paid,
      captures: captures.length, refunds: refunds.length, rises,
    };
    if (captures.length || noCatch.state.stats.paid !== 0) throw new Error(`unexpected capture: ${JSON.stringify(results.noCatch)}`);
    if (noCatch.balance !== expected) throw new Error(`no-catch ledger mismatch: ${JSON.stringify(results.noCatch)}`);
    if (rises.length !== refunds.length) throw new Error(`unexplained balance rises: ${JSON.stringify(results.noCatch)}`);
    await context.close();
  }

  console.log(JSON.stringify(results, null, 2));
  console.log('PASS fishing host wallet transactions.');
} finally {
  await browser.close();
  await server.close();
}
