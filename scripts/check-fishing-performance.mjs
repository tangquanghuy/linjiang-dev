/* Fishing performance/audio regression.
 * Runs the portrait-phone path used by the TT arcade portal with 6x CPU slowdown.
 *
 *   node scripts/check-fishing-performance.mjs
 */
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
  const raw = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  const file = join(ROOT, normalize(raw).replace(/^([/\\])+/, ''));
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (_) { res.writeHead(404).end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

await page.addInitScript(() => {
  window.__fishingAudioProbe = [];
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function patchedPlay() {
    const src = (this.currentSrc || this.src || '').split('/').pop();
    const calledAt = performance.now();
    window.__fishingAudioProbe.push({ type: 'media-call', src, time: calledAt, readyState: this.readyState });
    this.addEventListener('playing', () => {
      window.__fishingAudioProbe.push({
        type: 'media-playing', src, time: performance.now(),
        lag: performance.now() - calledAt, readyState: this.readyState,
      });
    }, { once: true });
    return nativePlay.call(this);
  };
  const nativeStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function patchedStart(...args) {
    window.__fishingAudioProbe.push({ type: 'webaudio-start', name: this._airpName || '', time: performance.now() });
    return nativeStart.apply(this, args);
  };
});

try {
  await page.goto(`${base}/arcade/index.html#fishing`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#frame')?.contentWindow?.AIRPFishingGame);
  const frame = page.frames().find((item) => /\/arcade\/fishing\.html(?:[?#]|$)/.test(item.url()));
  if (!frame) throw new Error('fishing iframe did not load');

  await frame.evaluate(() => {
    window.__fishingFrameDeltas = [];
    window.__fishingShotTimes = [];
    addEventListener('airp-fishing:shot', () => window.__fishingShotTimes.push(performance.now()));
    let previous = performance.now();
    function sample(time) {
      window.__fishingFrameDeltas.push(time - previous);
      previous = time;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    const game = window.AIRPFishingGame;
    game.setBalance(100000, { silent: true });
    const fishId = game.spawn('whale');
    game.lockTarget(fishId);
  });
  /* A trusted click unlocks media exactly like the real auto-fire button. */
  await frame.locator('#autoButton').click();
  await page.waitForTimeout(5200);
  await frame.locator('#autoButton').click();
  await page.waitForTimeout(250);

  const metrics = await frame.evaluate(() => {
    const deltas = window.__fishingFrameDeltas.slice(30);
    const totalSeconds = deltas.reduce((sum, value) => sum + value, 0) / 1000;
    const sorted = [...deltas].sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
    const webAudioShots = window.__fishingAudioProbe.filter((row) => row.type === 'webaudio-start' && row.name === 'shot');
    const mediaShotCalls = window.__fishingAudioProbe.filter((row) => row.type === 'media-call' && /fishing-shot\.mp3$/.test(row.src));
    const intervals = window.__fishingShotTimes.slice(1)
      .map((time, index) => time - window.__fishingShotTimes[index]).sort((a, b) => a - b);
    return {
      lowPower: matchMedia('(max-height: 520px), (max-width: 760px)').matches,
      renderWidth: document.getElementById('gameCanvas').width,
      renderHeight: document.getElementById('gameCanvas').height,
      fps: deltas.length / totalSeconds,
      p95FrameMs: percentile(.95),
      over50ms: deltas.filter((value) => value > 50).length,
      shots: window.AIRPFishingGame.getState().stats.shots,
      webAudioShots: webAudioShots.length,
      mediaShotCalls: mediaShotCalls.length,
      medianShotIntervalMs: intervals[Math.floor(intervals.length * .5)] ?? 0,
    };
  });

  const checks = [
    [metrics.lowPower, 'mobile low-power renderer is active'],
    [metrics.renderWidth === 960 && metrics.renderHeight === 540, `render surface is ${metrics.renderWidth}x${metrics.renderHeight}, expected 960x540`],
    [metrics.fps >= 30, `FPS ${metrics.fps.toFixed(1)} is below 30 under 6x CPU slowdown`],
    [metrics.p95FrameMs <= 50.2, `p95 frame time ${metrics.p95FrameMs.toFixed(1)}ms is too high`],
    [metrics.shots >= 12, `auto-fire produced only ${metrics.shots} shots in 5.2s`],
    [metrics.webAudioShots === 0, `unexpected Web Audio shot starts: ${metrics.webAudioShots}`],
    [metrics.mediaShotCalls === 0, `unexpected firing sound plays: ${metrics.mediaShotCalls}`],
    [metrics.medianShotIntervalMs >= 280 && metrics.medianShotIntervalMs <= 380,
      `auto-fire audio interval ${metrics.medianShotIntervalMs.toFixed(1)}ms`],
    [errors.length === 0, `page errors: ${errors.join(' | ')}`],
  ];
  const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
  console.log(JSON.stringify(metrics, null, 2));
  if (failed.length) throw new Error(failed.join('\n'));
  console.log('PASS fishing performance/audio regression.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
