import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import '../arcade/auction-data.js';
import '../arcade/auction-npc.js';
import '../arcade/auction-engine.js';
import '../arcade/auction-recommendation.js';
const D=AuctionData,E=AIRPAuctionEngine,I=AuctionIntel,R=AuctionRecommendation.recommend;
assert.deepEqual(D.venues.map(v=>v.scale),[1,10,100]);
assert.deepEqual(D.venues.map(v=>v.entryFee),[150,3000,60000]);
for(const c of D.catalog){
 assert.equal(D.catalogPrice(c,100),c.base*100);
 assert.equal(D.catalogPrice(c,10,1),c.legacyBase*10);
}
const fixture=JSON.parse(readFileSync('scripts/fixtures/auction-pricing-v1.json','utf8'));
const legacy=E.restore(fixture.snapshot),oldView=legacy.view();
assert.equal(oldView.pricingVersion,1);assert.equal(oldView.scale,1);assert.equal(oldView.entryFee,300);
assert.equal(oldView.estimate,fixture.expected.estimate);assert.equal(oldView.ceiling,fixture.expected.ceiling);
assert.deepEqual(oldView.facts,fixture.expected.facts);assert.deepEqual(R(oldView,40000),fixture.expected.advice);
assert.equal(legacy.export().current.items.reduce((n,i)=>n+E.price(i,oldView.scale),0),fixture.expected.truth);
// Rebalanced skills and instruments change future NPC bids, not legacy prices,
// already-published history, or deterministic continuation of the same save.
const legacyTwin=E.restore(fixture.snapshot),past=oldView.history;
legacy.bid(800);legacyTwin.bid(800);assert.deepEqual(legacy.view(),legacyTwin.view());
assert.deepEqual(legacy.view().history.slice(0,past.length),past);
assert.equal(legacy.view().history.at(-1).bids[0],800);
assert.equal(legacy.view().scale,1);assert.equal(legacy.view().entryFee,300);
assert.equal(legacy.export().current.items.reduce((n,i)=>n+E.price(i,1),0),fixture.expected.truth);
assert.equal(E.restore(legacy.export()).view().pricingVersion,1);
for(const venue of D.venues)for(let seed=1;seed<=100;seed++){
 const g=E.createSession({seed,venue:venue.id,budget:1e8,entryFee:venue.entryFee,host:seed%11});g.beginLot();
 const snapshot=g.export(),v=g.view();assert.equal(v.scale,venue.scale);assert.equal(v.pricingVersion,2);
 const truth=snapshot.current.items.reduce((n,i)=>n+E.price(i,v.scale),0);
 assert.ok(v.estimate<=truth&&v.ceiling>=truth);
 assert.deepEqual(E.restore(snapshot).view(),v);
 const exact=snapshot.current.items.map(i=>({...I.empty(i),w:i.w,h:i.h,quality:i.quality,category:i.category,identified:i.id}));
 assert.deepEqual(I.bounds(exact,[],v.scale),{low:truth,high:truth});
 assert.equal(R({...v,items:exact,facts:[]},1e8).estimate,truth);
 g.bid(1e8);assert.equal(g.view().result.won,true);assert.equal(g.view().result.trueValue,truth);
 const entry=g.closeLot('sell');assert.equal(entry.cashDelta,truth-1e8);
}
console.log('Pricing: 300 seeded auctions, scaled bounds/advice/settlement and pre-update save compatibility passed');
const root=resolve('.'),out=resolve('artifacts/auction-v32/pricing');mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(root+sep)||!statSync(p).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.mp3':'audio/mpeg'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try{for(const [name,width,height] of [['desktop',1280,720],['phone',390,844],['small-phone',640,320]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/arcade/auction.html`);if(name!=='desktop')await page.waitForSelector('iframe');
 const frame=page.frames().find(f=>f.parentFrame())||page.mainFrame();await frame.waitForFunction(()=>window.AIRPAuction);
 async function reload(){await Promise.all([frame.waitForNavigation({waitUntil:'load'}),frame.evaluate(()=>location.reload())]);await frame.waitForFunction(()=>window.AIRPAuction);}
 async function reset(balance,venue){await frame.evaluate(({balance,venue})=>{localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance}));localStorage.setItem('airp_auction_state_v3',JSON.stringify({venue,host:0,sound:false,soundPreference:true}));},{balance,venue});await reload();}
 for(const venue of D.venues){
  await reset(venue.min+venue.entryFee-1,venue.id);await frame.click('#btnStart');assert.equal(await frame.locator('#btnConfirmEntry').isDisabled(),true);
  await reset(1e9,venue.id);await frame.click('#btnStart');assert.equal(await frame.locator('.venue-multiplier').allTextContents().then(xs=>xs.join(',')),'回收倍率 ×1,回收倍率 ×10,回收倍率 ×100');
  const fit=await frame.locator('.venue').evaluateAll(es=>es.every(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1));assert.ok(fit,`${name}: venue card clipped`);
  if(venue.id==='sky')await page.screenshot({path:resolve(out,`${name}-admission.png`)});
  await frame.click('#btnConfirmEntry');await frame.waitForFunction(()=>AIRPAuction.getView()?.phase==='bidding');
  assert.equal(await frame.evaluate(()=>AIRPAuction.getBalance()),1e9-venue.entryFee);
  assert.equal(await frame.evaluate(()=>AIRPAuction.getView().scale),venue.scale);
  await frame.click('#btnCatalog');assert.match(await frame.locator('#catalogHint').innerText(),new RegExp(`×${venue.scale}`));
  const actual=await frame.locator('.catalog-card b').first().innerText();assert.equal(actual,`◈ ${(50*venue.scale).toLocaleString('zh-CN')}`);
  await frame.click('#catalogDialog [data-close]');await reload();assert.equal(await frame.evaluate(()=>AIRPAuction.getBalance()),1e9-venue.entryFee);
 }
 // Real engine result -> UI keep -> changing venues -> selling at the locked acquisition value.
 const result=await frame.evaluate(()=>{const key='airp_auction_state_v3',s=JSON.parse(localStorage.getItem(key)),g=AIRPAuctionEngine.restore(s.snapshot);g.bid(1e8);s.snapshot=g.export();s.roundPresentation=null;localStorage.setItem(key,JSON.stringify(s));return g.view();});
 assert.equal(result.result.won,true);await reload();await frame.locator('#resultDialog[open]').waitFor();await frame.click('#btnSkipReveal');
 await page.screenshot({path:resolve(out,`${name}-settlement.png`)});
 const resultFit=await frame.locator('#resultDialog .result-numbers strong').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1));assert.ok(resultFit,`${name}: large settlement numbers clipped`);
 await frame.click('#btnKeep');await frame.locator('#prepare:not([hidden])').waitFor();
 const kept=await frame.evaluate(()=>AIRPAuction.getCollection().inventory);assert.ok(kept.length>=6);
 for(const i of kept){assert.equal(i.value,D.catalog[i.id].base*100);assert.equal(i.scale,100);}
 await frame.click('#btnStart');await frame.click('[data-venue="street"]');await frame.waitForFunction(()=>document.querySelector('[data-venue="street"]').classList.contains('active'));await frame.click('#btnAdmissionBack');await frame.click('#navCollection');
 const item=kept[0],selector=`[data-sell="${item.id}"]`;assert.match(await frame.locator(selector).locator('xpath=ancestor::article').locator('.cabinet-card-value').first().innerText(),new RegExp(item.value.toLocaleString('zh-CN')));
 const before=await frame.evaluate(()=>AIRPAuction.getBalance());await frame.click(selector);await frame.waitForFunction(before=>AIRPAuction.getBalance()>before,before);assert.equal(await frame.evaluate(()=>AIRPAuction.getBalance()),before+item.value);
 // Same collectible from two price tiers: show/sell the exact next copy, not a recalculated catalog value.
 await frame.evaluate(()=>{const k='airp_auction_state_v3',s=JSON.parse(localStorage.getItem(k));s.inventory=[{uid:'old-copy',id:11,value:1236},{uid:'sky-copy',id:11,value:1236000,scale:100}];s.collected=[11];s.pins=[];localStorage.setItem(k,JSON.stringify(s));});await reload();await frame.click('#navCollection');
 const button=frame.locator('[data-sell="11"]');assert.match(await button.locator('xpath=ancestor::article').locator('.cabinet-card-value').first().innerText(),/1,236$/);await button.click();await frame.waitForFunction(()=>document.querySelector('[data-sell="11"]').closest('article').querySelector('.cabinet-card-value').textContent.includes('1,236,000'));
 await page.screenshot({path:resolve(out,`${name}-cabinet.png`)});
 const valueBefore=await frame.evaluate(()=>AIRPAuction.getBalance());await button.click();await frame.waitForFunction(before=>AIRPAuction.getBalance()>before,valueBefore);assert.equal(await frame.evaluate(()=>AIRPAuction.getBalance()),valueBefore+1236000);
 assert.deepEqual(errors,[]);console.log(`${name}: entry thresholds/fees, multiplier UI, catalog, reload, keep and cross-venue/mixed-vintage resale passed`);await context.close();
}}finally{await browser.close();server.close();}
