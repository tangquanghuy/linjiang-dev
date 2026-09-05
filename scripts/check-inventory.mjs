import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const errors = [];
mkdirSync('artifacts', { recursive: true });
try {
  for (const [width, height] of [[1344, 637], [1672, 941], [900, 520]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5199/?mode=landscape&fit=body', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const { setPref } = await import('/src/prefs.js');
      setPref('inventoryOpen', 'page');
    });
    const open = async () => {
      await page.locator('.pane-pod [data-page="inventory"]').click();
      await page.locator('.inventory-page').evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    };
    await open();
    await page.locator('.inventory-page').waitFor();
    await page.screenshot({ path: `artifacts/inventory-${width}-default.png` });
    assert.equal(await page.locator('.item-copy p').count(), 0, 'list must omit descriptions');
    await page.locator('[data-inv-kind="consumable"]').click();
    assert.equal(await page.locator('[data-inv-kind="consumable"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.item-card:not(.b-consumable)').count(), 0);
    await page.locator('.page-close').click();

    await page.evaluate(async () => {
      const { player } = await import('/src/data.js');
      window.inventoryFixture = structuredClone(player.inventory);
      for (const [bucket, size] of [['materials', 41], ['consumables', 18], ['goods', 5]]) {
        const template = player.inventory[bucket][0] || {};
        player.inventory[bucket] = Array.from({ length: size }, (_, i) => ({ ...template,
          name: i === 0 ? `${bucket} 超长物品名称需要保持格子整齐并截断展示 <特殊字符>` : `${bucket} 测试物品 ${i + 1}`,
          quantity: i + 1, potency: 3,
          description: '这是一段很长的完整物品描述，列表不应展示。<标签也应原样显示>\n'.repeat(100),
          source: '很长的来源说明'.repeat(100),
        }));
      }
    });
    await open();
    const initialY = (await page.locator('.inventory-page').boundingBox()).y;
    const leaf = () => page.locator('.inventory-leaf').innerText();
    const cards = () => page.locator('.item-card').count();
    assert.equal(await cards(), 12);
    assert.equal(await leaf(), '1 / 6');
    assert.equal(await page.locator('[data-inv-step="-1"]').isDisabled(), true);
    const heights = await page.locator('.item-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    assert.ok(Math.max(...heights) - Math.min(...heights) < 1, 'long content must not change tile height');
    assert.ok(await page.locator('.inventory-content').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'no horizontal overflow');
    await page.locator('[data-inv-select]').first().check();
    await page.locator('[data-inv-step="1"]').click();
    assert.equal(await leaf(), '2 / 6');
    assert.equal(await page.locator('.inventory-content').count(), 1, 'page turns must not nest content wrappers');
    assert.equal(await page.locator('.inventory-pagination').count(), 1);
    await page.locator('[data-inv-step="-1"]').click();
    assert.equal(await page.locator('[data-inv-select]').first().isChecked(), true);
    assert.equal(await page.locator('[data-inv-select-all]').evaluate((el) => el.indeterminate), true);
    await page.locator('[data-inv-kind="consumable"]').click();
    assert.equal(await leaf(), '1 / 2');
    assert.equal(await cards(), 12);
    assert.equal(await page.locator('.item-card:not(.b-consumable)').count(), 0);
    await page.locator('[data-inv-select-all]').check();
    assert.equal(await page.locator('[data-inv-selected-count]').innerText(), '已选 13 项');
    await page.locator('[data-inv-step="1"]').click();
    assert.equal(await cards(), 6);
    assert.equal(await leaf(), '2 / 2');
    assert.equal(await page.locator('[data-inv-select-all]').isChecked(), false);
    assert.equal(await page.locator('[data-inv-step="1"]').isDisabled(), true);
    await page.locator('[data-inv-kind="goods"]').click();
    assert.equal(await leaf(), '1 / 1');
    assert.equal(await cards(), 5);
    await page.locator('[data-inv-kind="all"]').click();
    assert.equal(await leaf(), '1 / 6');
    await page.locator('[data-inv-detail]').first().click();
    assert.ok((await page.locator('.inventory-detail-body p').innerText()).includes('<标签也应原样显示>'));
    assert.equal(await page.locator('.inventory-detail-body p').evaluate((el) => el.children.length), 0);
    const detailBody = page.locator('.inventory-detail-body');
    await detailBody.hover();
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    assert.ok(await detailBody.evaluate((el) => el.scrollTop > 0), 'long detail must scroll');
    await page.keyboard.press('ArrowRight');
    assert.equal(await leaf(), '1 / 6', 'detail must not turn background pages');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.inventory-detail').count(), 0);
    assert.equal(await page.locator('.inventory-page').count(), 1);
    assert.equal(await page.locator('[data-inv-detail]').first().evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await leaf(), '2 / 6');
    await page.locator('[data-inv-kind="all"]').click();
    assert.ok(Math.abs((await page.locator('.inventory-page').boundingBox()).y - initialY) < 1, 'inventory must stay in place during interaction');
    await page.screenshot({ path: `artifacts/inventory-${width}-many.png` });

    for (let current = 2; current <= 6; current++) {
      await page.locator('[data-inv-step="1"]').click();
      assert.equal(await leaf(), `${current} / 6`);
      assert.equal(await cards(), current === 6 ? 4 : 12);
      assert.equal(await page.locator('.inventory-content').count(), 1);
      assert.equal(await page.locator('.inventory-pagination').count(), 1);
    }
    assert.equal(await page.locator('[data-inv-step="1"]').isDisabled(), true);
    for (let current = 5; current >= 1; current--) {
      await page.locator('[data-inv-step="-1"]').click();
      assert.equal(await leaf(), `${current} / 6`);
    }
    assert.equal(await page.locator('[data-inv-select]').first().isChecked(), true);

    // Simulate a short embedded HUD band; keep the toolbar and pager outside the scroller.
    await page.addStyleTag({ content: '.inventory-page { height:420px !important; }' });
    const content = page.locator('.inventory-content');
    assert.ok(await content.evaluate((el) => el.scrollHeight > el.clientHeight + 1));
    const pagerY = (await page.locator('.inventory-pagination').boundingBox()).y;
    await page.evaluate(() => {
      window.inventoryWheelLeaks = 0;
      window.addEventListener('wheel', () => { window.inventoryWheelLeaks++; });
    });
    await content.hover();
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(200);
    assert.ok(await content.evaluate((el) => el.scrollTop > 0), 'wheel must scroll the grid');
    assert.equal((await page.locator('.inventory-pagination').boundingBox()).y, pagerY);
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.mouse.wheel(0, 420);
    assert.equal(await page.evaluate(() => window.inventoryWheelLeaks), 0, 'wheel must not leak to host forwarding');
    await page.locator('[data-inv-step="1"]').click();
    assert.equal(await content.evaluate((el) => el.scrollTop), 0, 'new page starts at top');

    await page.evaluate(async () => {
      const { player } = await import('/src/data.js');
      player.inventory.goods = [];
    });
    await page.locator('[data-inv-kind="goods"]').click();
    assert.equal(await cards(), 0);
    assert.equal(await leaf(), '1 / 1');
    assert.equal(await page.locator('[data-inv-select-all]').isChecked(), false);
    assert.ok((await page.locator('.inventory-empty').innerText()).includes('暂无物品'));
    await page.locator('.page-close').click();
    await page.evaluate(async () => {
      const { player } = await import('/src/data.js');
      player.inventory.materials = [];
      player.inventory.consumables = [];
    });
    await open();
    assert.equal(await cards(), 0);
    assert.equal(await page.locator('.inventory-empty').innerText(), '背包是空的');
    assert.equal(await page.locator('[data-inv-step="1"]').isDisabled(), true);
    assert.equal(await page.locator('[data-inv-destroy]').isDisabled(), true);
    await page.locator('.page-close').click();
    await page.evaluate(async () => {
      const { player, MAP_MARKER_ITEM, CITY_BUILD_COST } = await import('/src/data.js');
      player.money = CITY_BUILD_COST;
      player.inventory.goods = [{ ...window.inventoryFixture.goods[0], name: MAP_MARKER_ITEM, quantity: 1 }];
    });
    await open();
    assert.equal(await cards(), 1);
    assert.equal(await leaf(), '1 / 1');
    assert.equal(await page.locator('.item-card [data-map-marker-use]').isEnabled(), true);
    assert.equal(await page.locator('.item-card .item-use em').isVisible(), true, 'blueprint price stays visible');
    await page.locator('[data-inv-detail]').click();
    assert.equal(await page.locator('.inventory-detail [data-map-marker-use]').isEnabled(), true);
    await page.close();
    console.log(`inventory ${width}x${height}: categories, pagination, selection, details, wheel and empty states OK`);
  }
  assert.deepEqual(errors, [], 'browser runtime errors');
} finally {
  await browser.close();
  await server.close();
}
