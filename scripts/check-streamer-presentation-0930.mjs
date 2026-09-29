import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { chromium } from 'playwright';

const dir = '外部部署/V20260930/';
const read = file => readFileSync(file, 'utf8');
const rows = [
  { name: '鲸鱼娘', theme: 'whale', light: '#536b9c', dark: '#a9bce4', signal: '#91b6ed' },
  { name: '牛肉', theme: 'neuro', light: '#387e79', dark: '#91d1c6', signal: '#79cbbb' },
];
function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing source markers: ${start}`);
  return source.slice(a, b);
}
const reader = read(dir + '正文美化.html');
const configSource = between(reader, 'const AVATAR_BASE =', '// ==================== MVU');
const config = vm.runInNewContext(configSource + '\nCHARACTER_CONFIG;');
const phoneSource = between(read('phone/src/03-state.js'), 'const PHONE_AVATAR_BASE =', '// ==================== 实时刷新');
const phone = vm.createContext({window:{}, currentPhoneData:{}});
vm.runInContext(phoneSource, phone);
const wp = vm.runInNewContext(between(read('phone/src/05-runtime-state.js'), 'const phoneWpBaseUrl =', '// 已加载') + '\nphoneWpCategories;');
const data = read('src/data.js');
const openingSource = read('opening.js');
const openingRoster = vm.runInNewContext(between(openingSource, 'const OSHI=[', 'const OSHI_MAX') + '\nOSHI;');
const cgSource = read('phone/src/18-cg-data.js');
const cgList = vm.runInNewContext(between(cgSource, 'const CG_LIST =', 'const CG_BASE_URL') + '\nCG_LIST;');
const initVars = read('酒馆变量/变量初始化');
const matrix = JSON.parse(read('src/dev-matrix.json'));
const presentation = between(data, 'const STREAMER_PRESENTATION =', 'function safeCharacterArt(');
const hud = vm.createContext({
  CUSTOM_THEMES: ['rose', 'ice', 'violet', 'gold', 'crimson', 'scarlet', 'candy'],
  stableHash: () => 0,
  cover: name => `https://anchor.rown.dpdns.org/封面/${name}.webp`,
});
vm.runInContext(presentation, hud);
for (const row of rows) {
  assert.equal(config[row.name].color, row.light);
  assert.equal(config[row.name].darkColor, row.dark);
  assert.equal(vm.runInContext(`getCharacterAvatar(${JSON.stringify(row.name)})`,phone),config[row.name].avatar);
  assert.ok(wp[row.name][0].endsWith(encodeURIComponent(row.name)+'.webp'));
  assert.equal(vm.runInContext(`configuredCustomTheme({},${JSON.stringify(row.name)})`,hud),row.theme);
  assert.equal(vm.runInContext(`configuredCustomTheme({代表色:'gold'},${JSON.stringify(row.name)})`,hud),'gold');
  assert.equal(vm.runInContext(`placeholderCharacterArt(${JSON.stringify(row.name)})`,hud),`https://anchor.rown.dpdns.org/封面/${row.name}.webp`);
  assert.ok(openingRoster.some(item => item.name === row.name), `${row.name} missing from opening roster`);
  assert.ok(data.includes(`name: '${row.name}'`), `${row.name} missing from authored HUD roster`);
  assert.ok(initVars.includes(`  ${row.name}:\n    羁绊:`), `${row.name} missing from object initialization`);
  assert.ok(initVars.includes(`    ${row.name}:\n      档期:`), `${row.name} missing from live-room initialization`);
  assert.equal(Object.keys(cgList[row.name] || {}).length, Object.keys(cgList['神乐七奈']).length, `${row.name} CG scene table incomplete`);
  assert.deepEqual(Object.keys(matrix[row.name] || {}).sort(), ['anus','chest','oral','vagina']);
  for (const tiers of Object.values(matrix[row.name])) {
    assert.equal(tiers.length, 6, `${row.name} development matrix must contain six tiers`);
    assert.ok(tiers.every(text => typeof text === 'string' && text.length >= 80), `${row.name} development matrix contains an empty/short tier`);
  }
}
assert.equal(vm.runInContext("customTheme('其他主播')",hud),'rose');
assert.ok(config['牛肉'].aliases.includes('Neuro-sama'));
assert.equal(read(dir+'小手机脚本.js'),read('phone/小手机脚本.js'));
assert.equal(read(dir+'开局固定主播配置.js'), openingSource);
assert.equal(read(dir+'变量初始化'), initVars);
assert.equal(read(dir+'变量Schema.js'), read('酒馆变量/mvuzod.js'));
assert.equal(read(dir+'CG图鉴脚本.js'), read('cg/cg-app.js'));
assert.equal(read(dir+'部位开发矩阵.json'), read('src/dev-matrix.json'));
assert.ok(read('src/styles/cards.css').includes(read(dir+'主播展示配色.css')));
const inject = between(reader, 'function injectCustomCharCSS(', 'Object.entries(CHARACTER_CONFIG).forEach');
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  await page.setContent('<style>'+read('src/styles/cards.css')+'</style>');
  await page.evaluate(({inject, rows}) => {
    const apply = new Function(inject+'; return injectCustomCharCSS;')();
    for (const row of rows) {
      apply(row.name,row.light,row.dark);
      const el = document.createElement('span');
      el.id = row.theme;
      el.className = `name-initial-${row.name} t-${row.theme}`;
      el.textContent = row.name;
      document.body.append(el);
    }
  }, {inject,rows});
  const rgb = hex => 'rgb('+hex.slice(1).match(/../g).map(n=>parseInt(n,16)).join(', ')+')';
  for (const theme of ['light','green','dark']) {
    await page.evaluate(theme=>document.body.dataset.theme=theme,theme);
    for (const row of rows) {
      const actual = await page.locator('#'+row.theme).evaluate(el=>({color:getComputedStyle(el).color,signal:getComputedStyle(el).getPropertyValue('--signal').trim()}));
      assert.equal(actual.color,rgb(theme==='dark'?row.dark:row.light));
      assert.equal(actual.signal,row.signal);
    }
  }
} finally { await browser.close(); }
console.log('PASS: two fixed streamers fully integrated across reader, opening, MVU initialization, HUD, CG, development matrices, phone, and archive synchronization.');
