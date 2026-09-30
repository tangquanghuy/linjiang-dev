import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import '../arcade/auction-data.js';
import '../arcade/auction-npc.js';
import '../arcade/auction-engine.js';
import '../arcade/auction-recommendation.js';
const D=AuctionData,R=AuctionRecommendation.recommend;
const unknown=Array.from({length:8},(_,slot)=>({slot,w:null,h:null,quality:null,category:null,identified:null}));
const base={phase:'bidding',active:[true,true,true,true],venue:'street',items:unknown,facts:[],scale:1,entryFee:150,instrumentCost:0};
const first=R(base,10000);assert.ok(first.amount>0);
assert.deepEqual(R({...base,result:{trueValue:999999},history:[{bids:[9,8,7,6]}],opponents:[{bank:5}]},10000),first);
const poison={...base};for(const key of ['result','opponents','history','bank','estimate','ceiling','snapshot'])Object.defineProperty(poison,key,{get(){throw Error('read private/unneeded field '+key);}});
const originalRandom=Math.random;try{Math.random=()=>{throw Error('RNG advanced');};assert.deepEqual(R(poison,10000),first);}finally{Math.random=originalRandom;}
assert.equal(R(base,0).amount,null);assert.equal(R(base,NaN).amount,null);assert.equal(R(base,1).amount,1);
assert.equal(R({...base,entryFee:1e9},10000).amount,null);assert.equal(R({...base,active:[false]},10000).amount,null);
assert.equal(R({...base,phase:'result'},10000).amount,null);
assert.ok(R({...base,venue:'sky'},10000).amount>first.amount);
assert.ok(R({...base,instrumentCost:80},10000).amount<first.amount);
const full=D.catalog.slice(0,8).map((c,slot)=>({...c,slot,identified:c.id,value:999999}));
const total=full.reduce((n,c)=>n+c.base,0),known=R({...base,items:full},10000);
assert.equal(known.estimate,total);assert.equal(known.riskReserve,0);assert.ok(known.amount<=Math.floor(total*.88-150));
assert.equal(R({...base,items:full,scale:2},10000).estimate,total*2);
const fixed=R({...base,facts:[{stat:'total',filter:{},value:1000}]},10000);assert.equal(fixed.estimate,1000);assert.equal(fixed.riskReserve,0);assert.equal(fixed.amount,730);
// Full sessions: advice never mutates engine/RNG and always stays within available cash.
for(let seed=1;seed<=120;seed++)for(const venue of D.venues){
 const engine=AIRPAuctionEngine.createSession({seed,budget:40000,venue:venue.id,host:seed%11});engine.beginLot();
 const saved=JSON.stringify(engine.export()),view=engine.view(),before=JSON.stringify(view);
 for(const balance of [0,1,99,500,40000]){const a=R(view,balance);assert.ok(a.amount===null||Number.isSafeInteger(a.amount)&&a.amount>=1&&a.amount<=balance);assert.deepEqual(R(view,balance),a);}
 assert.equal(JSON.stringify(engine.export()),saved);assert.equal(JSON.stringify(view),before);
}
assert.equal(D.hosts.length,11);assert.equal(D.tools.length,43);
for(const entry of [...D.hosts,...D.tools,...D.venues])assert.ok(!/前期保留悬念|后期集中判断|大件不一定昂贵|每一次判断都/.test(entry.desc));
assert.equal(D.hosts.find(h=>h.effect==='finale').desc,'第1轮随机揭示2件未知轮廓，第3轮随机揭示1件未知品质，第5轮再揭示至多3件未知品质。');
for(const t of D.tools.filter(t=>t.effect.stat==='mean'))assert.ok(t.desc.includes('向下取整'));
{
 const raw=[{...D.catalog.find(c=>c.quality===1),slot:0,x:0,y:0}],seen=raw.map(AuctionIntel.empty),facts=[];
 const stat=AuctionIntel.apply(raw,seen,facts,{kind:'stat',stat:'mean',filter:{quality:1}},()=>.5);
 assert.ok(stat.text.startsWith('精良藏品平均价值（向下取整）：'));
 const cat=AuctionIntel.apply(raw,seen,facts,{kind:'shape',count:1,category:true,filter:{category:raw[0].category}},()=>.5);
 assert.ok(cat.text.includes('轮廓与类别'));
}
const ROOT=resolve('.'),OUT='artifacts/auction-v32/recommendation';mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'};
const server=createServer((req,res)=>{try{const p=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(ROOT+sep)||!statSync(p).isFile())throw Error();res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),report=[];
try{for(const [name,width,height] of [['desktop',1280,720],['wide',2340,1261],['phone',780,360],['small-phone',640,320],['portrait',390,844]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/arcade/auction.html`);if(width<1000)await page.waitForSelector('iframe');const f=page.frames().find(f=>f.parentFrame())||page.mainFrame();await f.waitForFunction(()=>window.AIRPAuction);
 async function reload(){await Promise.all([f.waitForNavigation({waitUntil:'load'}),f.evaluate(()=>location.reload())]);await f.waitForFunction(()=>window.AIRPAuction);}
 await f.evaluate(()=>{const e=AIRPAuctionEngine.createSession({seed:71,budget:40000,venue:'street',host:5,entryFee:150,loadout:['identify-0'],stock:{'identify-0':1}});e.beginLot();const state=JSON.parse(localStorage.getItem('airp_auction_state_v3'))||{version:3,inventory:[],collected:[],discovered:[],pins:[],receipts:[],compensation:{day:'',used:0},sound:false};state.snapshot=e.export();state.roundPresentation=null;state.loadout=['identify-0'];state.instrumentStock={'identify-0':1};localStorage.setItem('airp_auction_state_v3',JSON.stringify(state));localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000}));});await reload();
 const snapshot=await f.evaluate(()=>localStorage.getItem('airp_auction_state_v3'));await f.locator('#btnBid').click();assert.equal(await f.locator('#bidPrevious').isDisabled(),true);
 await f.locator('#bidRecommend').click();const amount=Number((await f.locator('#bidAmount').innerText()).replaceAll(',',''));
 assert.ok(amount>0);assert.equal(await f.locator('#bidDialog').evaluate(e=>e.open),true);assert.equal(await f.evaluate(()=>localStorage.getItem('airp_auction_state_v3')),snapshot);
 const fit=await f.locator('#bidDialog').evaluate(e=>{const r=e.getBoundingClientRect();return {scroll:e.scrollHeight,client:e.clientHeight,inside:r.top>=0&&r.bottom<=innerHeight+1,buttons:[...e.querySelectorAll('.quick-bids button')].every(b=>b.scrollWidth<=b.clientWidth+1)};});assert.ok(fit.inside&&fit.scroll<=fit.client+1&&fit.buttons,JSON.stringify(fit));
 await page.screenshot({path:`${OUT}/${name}-recommend.png`});await f.locator('[data-edit="backspace"]').click();assert.notEqual(Number((await f.locator('#bidAmount').innerText()).replaceAll(',','')),amount);
 await f.locator('#bidRecommend').click();await f.locator('#bidDialog [data-close]').click();await f.locator('#btnBid').click();assert.equal(Number((await f.locator('#bidAmount').innerText()).replaceAll(',','')),amount);await f.locator('#bidDialog [data-close]').click();
 // Use an actual consumable; recommendation must use the new view and paid cost.
 await f.locator('#btnFieldTools').click();await f.locator('#btnTool').click();await f.locator('#fieldToolsDialog').waitFor({state:'hidden'});await f.locator('#btnBid').click();await f.locator('#bidRecommend').click();
 const updated=await f.evaluate(()=>{const s=JSON.parse(localStorage.getItem('airp_auction_state_v3')),v=AIRPAuctionEngine.restore(s.snapshot).view();return {cost:v.instrumentCost,amount:AuctionRecommendation.recommend(v,40000).amount};});assert.equal(updated.cost,30);assert.equal(Number((await f.locator('#bidAmount').innerText()).replaceAll(',','')),updated.amount);
 await f.locator('#bidDialog [data-close]').click();
 // A previous sealed-round price remains independent of the recommendation.
 await f.evaluate(()=>{const state=JSON.parse(localStorage.getItem('airp_auction_state_v3'));state.snapshot.current.history=[{round:1,bids:[100,100,100,100]}];state.snapshot.current.round=2;localStorage.setItem('airp_auction_state_v3',JSON.stringify(state));});await reload();await f.locator('#btnBid').click();await f.locator('#bidPrevious').click();assert.equal(await f.locator('#bidAmount').innerText(),'130');await f.locator('[data-digit="00"]').click();assert.equal(await f.locator('#bidAmount').innerText(),'13,000');await f.locator('#bidDialog [data-close]').click();
 // Empty budget and uneconomic estimates must not invent a minimum recommendation.
 for(const reason of ['balance','cost']){
  await f.evaluate(reason=>{localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:reason==='balance'?0:40000}));if(reason==='cost'){const state=JSON.parse(localStorage.getItem('airp_auction_state_v3'));state.snapshot.current.instrumentCost=100000;localStorage.setItem('airp_auction_state_v3',JSON.stringify(state));}},reason);await reload();if(reason==='balance'){assert.equal(await f.locator('#btnBid').isDisabled(),true);continue;}await f.locator('#btnBid').click();assert.equal(await f.locator('#bidRecommend').isDisabled(),true);assert.equal(await f.locator('#bidConfirm').isDisabled(),true);assert.equal(await f.locator('#bidAmount').innerText(),'0');await f.locator('#bidDialog [data-close]').click();
 }
 await f.evaluate(()=>localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000})));
 for(const won of [false,true]){
  await f.evaluate(won=>{const state=JSON.parse(localStorage.getItem('airp_auction_state_v3')),e=AIRPAuctionEngine.createSession({seed:53,budget:40000,venue:'street',entryFee:150});e.beginLot();while(e.view().phase==='bidding')e.bid(won?40000:null);state.snapshot=e.export();state.roundPresentation=null;localStorage.setItem('airp_auction_state_v3',JSON.stringify(state));},won);await reload();await f.locator('#resultDialog[open]').waitFor();
  await page.waitForTimeout(850);await page.screenshot({path:`${OUT}/${name}-${won?'won':'lost'}-reveal.png`});await f.locator('#btnSkipReveal').click();
  const types=await f.evaluate(()=>{const size=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);const panel=document.querySelector('.result-copy');return {net:size('#resultNet'),value:size('#revealValue'),price:size('.sale-price strong'),cost:size('.settlement-cost strong'),label:size('.settlement-cost span'),title:size('#resultTitle'),fits:panel.scrollHeight<=panel.clientHeight+1};});
  assert.ok(types.net>types.value&&types.value>types.price&&types.price>types.cost&&types.cost>types.label,JSON.stringify(types));assert.ok(types.fits);
  await page.screenshot({path:`${OUT}/${name}-${won?'won':'lost'}-settled.png`});
 }
 assert.deepEqual(errors,[]);report.push({name,recommendation:amount,settlementHierarchy:true,noAutoSubmit:true});await page.close();
}
writeFileSync(`${OUT}/checks.json`,JSON.stringify({passed:true,sessions:360,report},null,2));console.log(JSON.stringify({passed:true,sessions:360,report},null,2));
}finally{await browser.close();server.close();}
