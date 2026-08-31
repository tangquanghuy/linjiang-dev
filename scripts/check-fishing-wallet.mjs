/* 捕鱼钱包回归检查
 * ---------------------------------------------------------------
 * 覆盖两个曾经互相放大的问题：
 * 1. 捕鱼页上报一次发射余额后，大厅不再把旧余额异步回灌给同一 iframe；
 * 2. 强制捕获黄金鲸后，100 倍奖金会留在余额里，不被旧的发射余额覆盖。
 *
 *   node scripts/check-fishing-wallet.mjs
 * --------------------------------------------------------------- */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  const file = join(ROOT, normalize(url).replace(/^([/\\])+/, ''));
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (_) { res.writeHead(404).end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

try {
  /* rand() 优先使用 crypto.getRandomValues。固定为 0 后，黄金鲸这发必定捕获。 */
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      configurable: true,
      value(array) { array.fill(0); return array; },
    });
  });
  await page.goto(`${base}/arcade/index.html#fishing`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#frame')?.contentWindow?.AIRPFishingGame);
  const frame = page.frames().find((item) => item.url().includes('/arcade/fishing.html'));
  if (!frame) throw new Error('捕鱼 iframe 未加载');

  await frame.evaluate(() => {
    window.__fishingBalanceEchoes = [];
    addEventListener('message', (event) => {
      if (event.data?.type === 'airp-fishing:set-balance') {
        window.__fishingBalanceEchoes.push(event.data.balance);
      }
    });
  });

  /* First exercise auto-fire and verify one charge per registered shot. */
  await frame.evaluate(() => {
    const game = window.AIRPFishingGame;
    game.reset({ keepBalance: true });
    game.setBalance(2000, { silent: true });
    const fishId = game.spawn('whale');
    game.lockTarget(fishId);
    document.getElementById('autoButton').click();
  });
  await page.waitForTimeout(1150);
  await frame.evaluate(() => document.getElementById('autoButton').click());
  await page.waitForTimeout(1800);
  const auto = await frame.evaluate(() => ({
    balance: window.AIRPFishingGame.getBalance(),
    state: window.AIRPFishingGame.getState(),
    echoes: window.__fishingBalanceEchoes.splice(0),
  }));
  if (auto.echoes.length) throw new Error(`auto-fire received stale balance echoes: ${auto.echoes.join(', ')}`);
  if (auto.state.stats.shots < 3) throw new Error(`auto-fire shot count too low: ${auto.state.stats.shots}`);
  if (auto.state.stats.spent !== auto.state.stats.shots * 10) {
    throw new Error(`auto-fire charged more than once per shot: ${JSON.stringify(auto.state.stats)}`);
  }
  const autoExpected = 2000 - auto.state.stats.spent + auto.state.stats.paid;
  if (auto.balance !== autoExpected) {
    throw new Error(`auto-fire ledger mismatch: got ${auto.balance}, expected ${autoExpected}`);
  }

  /* Then settle one golden whale and ensure its payout survives. */
  const shot = await frame.evaluate(() => {
    const game = window.AIRPFishingGame;
    game.reset({ keepBalance: true });
    game.setBalance(1000, { silent: true });
    const fishId = game.spawn('whale');
    game.lockTarget(fishId);
    return { fired: game.fire(), balance: game.getBalance() };
  });
  if (!shot.fired || shot.balance !== 990) {
    throw new Error(`single-shot charge mismatch: ${JSON.stringify(shot)}`);
  }

  await frame.waitForFunction(
    () => window.AIRPFishingGame.getState().history.some((row) => row.fishType === 'whale'),
    null,
    { timeout: 6000 },
  );
  await page.waitForTimeout(350);

  const result = await frame.evaluate(() => ({
    balance: window.AIRPFishingGame.getBalance(),
    state: window.AIRPFishingGame.getState(),
    echoes: window.__fishingBalanceEchoes,
  }));
  const whale = result.state.history.find((row) => row.fishType === 'whale');
  if (result.echoes.length) throw new Error(`大厅向捕鱼页回灌了余额：${result.echoes.join(', ')}`);
  if (!whale || whale.payout !== 1000) throw new Error(`黄金鲸奖金异常：${JSON.stringify(whale)}`);
  if (result.balance !== 1990) throw new Error(`黄金鲸结算后余额应为 1990，实际 ${result.balance}`);
  if (result.state.stats.shots !== 1 || result.state.stats.spent !== 10) {
    throw new Error(`单发统计异常：${JSON.stringify(result.state.stats)}`);
  }
  if (errors.length) throw new Error(`页面错误：${errors.join(' | ')}`);

  console.log(`PASS fishing wallet: ${auto.state.stats.shots} auto shots charged once each; golden whale payout persisted at 1990.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
