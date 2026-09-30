import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import '../arcade/auction-daily.js';
const Daily=AuctionDaily,at=s=>Date.parse(s);
const before=at('2026-09-30T03:59:59.999Z'),noon=before+1;
assert.equal(Daily.dayKey(before),'2026-09-29');assert.equal(Daily.dayKey(noon),'2026-09-30');
assert.equal(Daily.untilReset(before),1);assert.equal(Daily.untilReset(noon),86400000);
let ledger=Daily.record(null,[{host:0,net:-100},{host:1,net:200}],before);
assert.equal(Daily.read(ledger,at('2026-09-30T00:00:00+08:00')).totals[0].net,-100);
assert.deepEqual(Daily.read(ledger,noon).totals,{});
assert.deepEqual(Daily.read(ledger,before-86400000),ledger,'clock rollback retains current stored day');
const next=Daily.record(ledger,[{host:1,net:-300}],noon);assert.deepEqual(next.totals,{'1':{net:-300,lastNet:-300,auctions:1}});assert.equal(ledger.totals[1].net,200,'no mutation');
assert.throws(()=>Daily.record(null,[{host:1,net:0},{host:1,net:0}],noon));
const ROOT=resolve('.'),KEY='airp_auction_state_v3',WALLET='airp_arcade_wallet_v1';
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/arcade/auction.html?nolimit=1`,browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:720},timezoneId:'America/Los_Angeles'}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.clock.setFixedTime(new Date('2026-09-30T05:00:00Z'));
async function data(){return page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)),KEY);}
async function fixture({host=0,winner=1,keepDaily=true}={}){
 await page.goto(url);
 const expected=await page.evaluate(({KEY,WALLET,host,winner,keepDaily})=>{
  const disk=JSON.parse(localStorage.getItem(KEY))||{};
  const game=AIRPAuctionEngine.createSession({seed:23,host,budget:10000000,id:crypto.randomUUID(),venue:'dock'});game.beginLot();const s=game.export(),c=s.current;
  s.entryFee=3000;c.phase='result';c.instrumentCost=120;
  s.bots.forEach((b,i)=>{b.bank=10000000;b.lot.instrumentCost=(i+1)*100;});
  const trueValue=c.items.reduce((n,i)=>n+AIRPAuctionEngine.price(i,c.scale),0),price=winner===0?trueValue-1000:trueValue+100000;
  c.history=[{round:1,bids:winner===0?[price,100,100,100]:[50000,price,150000,100000]}];
  const details=AIRPAuctionEngine.compensationPool(c.history,winner,Math.max(0,price-trueValue),s.entryFee);
  c.result={won:winner===0,winner,price,trueValue,overpayment:Math.max(0,price-trueValue),compensationDetails:details,compensation:winner===0?0:details.payouts[0],reason:'daily fixture'};
  localStorage.setItem(WALLET,JSON.stringify({balance:10000000}));
  localStorage.setItem(KEY,JSON.stringify({...disk,version:3,host,venue:'dock',hostDaily:keepDaily?disk.hostDaily:null,snapshot:s,inventory:disk.inventory||[],collected:disk.collected||[],discovered:disk.discovered||[],pins:[],receipts:disk.receipts||[],sound:false,soundPreference:true}));
  return [{host,net:(winner===0?trueValue-price:details.payouts[0])-3000-120},...s.bots.map((b,i)=>({host:b.host,net:(winner===i+1?trueValue-price:details.payouts[i+1])-3000-b.lot.instrumentCost}))];
 },{KEY,WALLET,host,winner,keepDaily});
 await page.reload();await page.waitForSelector('#resultDialog[open]');await page.click('#btnSkipReveal');return expected;
}
async function settle(button='#btnNext'){await page.click(button);await page.waitForSelector('#prepare:not([hidden])');return data();}
try{
 let expected=await fixture({keepDaily:false}),d=await settle();
 for(const row of expected)assert.deepEqual(d.hostDaily.totals[row.host],{net:row.net,lastNet:row.net,auctions:1});
 assert.equal(await page.locator('#hostDailyLast').innerText(),'+1,880');assert.equal(await page.locator('#hostDailyProfit').evaluate(e=>getComputedStyle(e).color),'rgb(140, 229, 179)');assert.equal(await page.locator('#hostDailyStatus,#hostDailyCount').count(),0);assert.equal(await page.locator('#hostDailyAccount').getAttribute('title'),null);assert.ok(!(await page.locator('#prepare').innerText()).includes('12:00'));assert.equal(Object.keys(d.hostDaily.totals).length,4);assert.equal(d.hostDaily.day,'2026-09-30');assert.equal(d.hostDaily.totals[0].net,d.lastAuction.net);
 const victim=expected[1].host;assert.equal(expected[1].net,-103100);
 await page.locator(`[data-host="${victim}"]`).click();await page.waitForFunction(()=>document.querySelector('#hostDailyProfit').textContent==='−103,100');assert.equal(await page.locator('#hostDailyProfit').getAttribute('data-sign'),'negative');assert.equal(await page.locator('#hostDailyLast').innerText(),'−103,100');assert.equal(await page.locator('#hostDailyProfit').evaluate(e=>getComputedStyle(e).color),'rgb(255, 147, 147)');
 const previous=d.hostDaily;await page.reload();assert.deepEqual((await data()).hostDaily,previous);
 expected=await fixture({host:victim,winner:0});d=await settle('#btnKeep');
 for(const row of expected)assert.equal(d.hostDaily.totals[row.host].net,(previous.totals[row.host]?.net||0)+row.net);
 assert.equal(d.hostDaily.totals[victim].auctions,2);assert.equal(d.lastAuction.net,-2120);assert.equal(d.hostDaily.totals[victim].lastNet,-2120);assert.equal(await page.locator('#hostDailyLast').innerText(),'−2,120');assert.ok(d.inventory.length>0);
 const kept=structuredClone(d.hostDaily);await page.click('#navCollection');const sell=page.locator('[data-sell]').first();await sell.click();await page.waitForFunction(n=>JSON.parse(localStorage.getItem('airp_auction_state_v3')).inventory.length<n,d.inventory.length);assert.deepEqual((await data()).hostDaily,kept);
 checks.push('four participants, NPC loss and compensation, ticket/tools, partner role switch, reload, keep and later sale');
 await fixture({winner:0,keepDaily:false});d=await settle('#btnSell');assert.equal(d.hostDaily.totals[0].net,-2120);
 checks.push('sell and keep use identical settlement-value P&L');
 // Settlement date, not admission/reveal time, chooses the daily bucket.
 await page.clock.setFixedTime(new Date('2026-10-01T03:59:00Z'));
 await fixture();await page.clock.setFixedTime(new Date('2026-10-01T04:00:00Z'));d=await settle();
 assert.equal(d.hostDaily.day,'2026-10-01');assert.ok(Object.values(d.hostDaily.totals).every(t=>t.auctions===1));
 checks.push('UTC+8 noon boundary, midnight retention, cross-noon settlement, independent of device timezone');
 // Visual checks of all eleven partners on desktop and phone landscape/rotated portrait.
 mkdirSync('artifacts/auction-daily',{recursive:true});
 for(const [name,width,height] of [['desktop',1280,720],['phone-landscape',844,390],['phone-portrait',390,844]]){
  const p=await context.newPage();await p.clock.setFixedTime(new Date('2026-10-01T05:00:00Z'));await p.setViewportSize({width,height});await p.goto(url);
  const game=await (async()=>{for(let n=0;n<60;n++){const f=p.frames().find(f=>f!==p.mainFrame()&&f.url().includes('auction.html'));if(f)return f;if(await p.locator('#hosts').count())return p.mainFrame();await p.waitForTimeout(100);}throw Error('game frame missing');})();
  await game.waitForSelector('#hosts .host-button');
  for(let host=0;host<11;host++){
   await game.locator(`[data-host="${host}"]`).click();await game.waitForFunction(host=>document.querySelector(`[data-host="${host}"]`).classList.contains('active'),host);
   const b=await game.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {details:rect('.partner-details'),focus:rect('.partner-focus'),avatars:rect('#hosts'),amount:rect('#hostDailyProfit'),name:rect('#heroName'),portrait:rect('.partner-portrait'),account:rect('#hostDailyAccount'),last:rect('#hostDailyLast'),skill:rect('#hostDescription'),body:{w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight},rows:[...new Set([...document.querySelectorAll('.host-button')].map(e=>Math.round(e.getBoundingClientRect().top)))]};});
   assert.ok(b.details.bottom<=b.avatars.top,`${name} host${host} overlaps avatars`);assert.ok(b.details.top>=b.focus.top-1,`${name} host${host} overflows top`);assert.ok(b.account.left>=b.name.right+1,`${name} host${host} account overlaps name: ${JSON.stringify(b)}`);assert.ok(b.account.right<=b.details.right+1);assert.ok(b.amount.left>=b.portrait.right);assert.ok(b.account.bottom<=b.skill.top+1);if(b.last.width){assert.ok(b.last.right>=b.amount.right-1);assert.ok(b.last.top<b.amount.top);assert.ok(b.last.right<=b.details.right+1,`${name} host${host}: ${JSON.stringify(b)}`);}assert.equal(b.rows.length,2);const avatarFit=await game.evaluate(()=>{const button=document.querySelector('.host-button').getBoundingClientRect(),panel=document.querySelector('.partner-panel').getBoundingClientRect(),start=document.querySelector('.startbar').getBoundingClientRect();return {height:button.height/parseFloat(getComputedStyle(document.documentElement).fontSize),bottom:panel.bottom,startBottom:start.bottom};});assert.ok(avatarFit.height>=92,`${name}: avatars cropped vertically`);assert.ok(Math.abs(avatarFit.bottom-avatarFit.startBottom)<2,`${name}: unused space below avatars`);assert.ok(b.body.sw<=b.body.w+1&&b.body.sh<=b.body.h+1);
  }
  await game.locator(`[data-host="${d.lastAuction.hostResults[1].host}"]`).click();await game.waitForFunction(()=>document.querySelector('#hostDailyProfit').dataset.sign==='negative');await p.screenshot({path:`artifacts/auction-daily/${name}.png`});
  // Deliberately opposite signs: a profitable day with a loss in the most recent match.
  await game.evaluate(KEY=>{const disk=JSON.parse(localStorage.getItem(KEY));disk.host=2;disk.hostDaily.totals[2]={net:30000,lastNet:-1500,auctions:2};localStorage.setItem(KEY,JSON.stringify(disk));dispatchEvent(new StorageEvent('storage',{key:KEY}));},KEY);
  assert.equal(await game.locator('#hostDailyProfit').innerText(),'30,000');assert.equal(await game.locator('#hostDailyLast').innerText(),'−1,500');
  assert.equal(await game.locator('#hostDailyProfit').evaluate(e=>getComputedStyle(e).color),'rgb(140, 229, 179)');assert.equal(await game.locator('#hostDailyLast').evaluate(e=>getComputedStyle(e).color),'rgb(255, 147, 147)');
  await game.waitForFunction(()=>document.querySelector('#heroPortraitFrame').dataset.state==='ready');await p.screenshot({path:`artifacts/auction-daily/${name}-recent-loss.png`});await p.close();
 }
 checks.push('name-row daily total with separate superscript last result, no portrait overlap or surplus copy; 11 partners fit desktop and phones');
 // Keep the preparation page open through noon; its timer must update without a click/reload.
 const timerPage=await context.newPage();await timerPage.clock.install({time:new Date('2026-10-01T03:00:00Z')});await timerPage.clock.pauseAt(new Date('2026-10-01T03:30:00Z'));await timerPage.goto(url);
 await timerPage.evaluate(KEY=>{const d=JSON.parse(localStorage.getItem(KEY));d.host=0;d.hostDaily={day:'2026-09-30',totals:{0:{net:4567,auctions:2}}};localStorage.setItem(KEY,JSON.stringify(d));},KEY);await timerPage.reload();await timerPage.waitForSelector('#hostDailyProfit');assert.equal(await timerPage.locator('#hostDailyProfit').innerText(),'4,567');
 await timerPage.clock.fastForward(30*60*1000+50);assert.equal(await timerPage.locator('#hostDailyProfit').innerText(),'0');assert.equal(await timerPage.locator('#hostDailyProfit').getAttribute('data-sign'),'zero');assert.equal(await timerPage.locator('#hostDailyLast').isVisible(),false);await timerPage.reload();assert.equal(await timerPage.locator('#hostDailyProfit').innerText(),'0');await timerPage.close();checks.push('open page automatically resets at noon and remains reset after reload');
 assert.deepEqual(errors,[]);const report={passed:true,checks};writeFileSync('artifacts/auction-daily/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();server.close();}
