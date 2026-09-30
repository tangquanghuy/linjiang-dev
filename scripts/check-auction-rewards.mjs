import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import '../arcade/auction-data.js';
const KEY='airp_auction_state_v3',TOKEN='airp_arcade_tokens_v1',PROFILE='airp_arcade_token_progress_v1';
const report=AuctionData.qualities.map((q,i)=>({quality:q.name,count:AuctionData.catalog.filter(c=>c.quality===i).length,each:i+1}));
assert.deepEqual(report.map(r=>r.count),[24,24,24,16,8]);
assert.equal(report.reduce((sum,r)=>sum+r.count*r.each,0),248);
const ids=AuctionData.catalog.map(c=>c.id),allKeys=AuctionData.catalog.map(c=>c.key);
const storage=new Map(),events=[];let failKey=null;
const sandbox={AuctionData,navigator:{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(k===failKey)throw Error('quota fixture');storage.set(k,v);}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},dispatchEvent:e=>events.push(e)};
vm.runInNewContext(readFileSync('arcade/auction-rewards.js','utf8'),sandbox);
const R=sandbox.AuctionRewards,read=k=>JSON.parse(storage.get(k)||'{}');
assert.equal((await R.claim([null,-1,10000,'0'])).amount,0);
assert.equal((await R.claim([...ids,...ids])).amount,248);
assert.equal(read(TOKEN).balance,248);assert.equal(read(PROFILE).earned.auction,248);
assert.equal((await R.claim(ids)).amount,0);
assert.equal(read(TOKEN).totalEarned,248);
assert.equal(R.progress().earned,248);
// Spending and old clients that omit wallet receipt metadata must not re-award.
storage.set(TOKEN,JSON.stringify({balance:18,totalEarned:248}));
assert.equal((await R.claim(ids)).amount,0);assert.equal(read(TOKEN).balance,18);
assert.equal(Object.keys(read(TOKEN).auctionCollectionClaims).length,96);
// Failure before atomic wallet write: nothing claimed; retry credits exactly once.
storage.clear();failKey=TOKEN;
await assert.rejects(R.claim(ids),/quota/);assert.equal(storage.size,0);
failKey=null;assert.equal((await R.claim(ids)).amount,248);
// Failure after wallet commit, before profile mirror: retry repairs without payment.
storage.clear();failKey=PROFILE;
await assert.rejects(R.claim(ids),/quota/);assert.equal(read(TOKEN).balance,248);
failKey=null;assert.equal((await R.claim(ids)).amount,0);
assert.equal(read(PROFILE).earned.auction,248);assert.equal(read(TOKEN).balance,248);
storage.set(TOKEN,'{broken');await assert.rejects(R.claim(ids));
console.log('Unit: 248 total; unique claims; invalid IDs; spending; receipt repair; both storage failure boundaries passed');

const root=resolve('.'),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(root+sep)||!statSync(p).isFile())throw Error();res.writeHead(200,{'Content-Type':mime[extname(p)]||'application/octet-stream'});res.end(readFileSync(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,url=base+'/arcade/auction.html';
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function boot(){await page.reload();await page.waitForFunction(()=>window.AIRPAuction);}
async function fixture(won=true){
 await page.goto(url);await page.waitForFunction(()=>window.AIRPAuction);
 await page.evaluate(({KEY,TOKEN,PROFILE,won})=>{
  localStorage.removeItem(TOKEN);localStorage.removeItem(PROFILE);
  const game=AIRPAuctionEngine.createSession({seed:23,budget:10000,id:crypto.randomUUID()});game.beginLot();const s=game.export();s.current.phase='result';s.bots.forEach(b=>b.bank=10000);
  s.current.result={won,winner:won?0:1,price:1500,trueValue:1000,overpayment:500,rawCompensation:50,compensation:won?0:40,profit:won?-500:40,reason:'collection fixture'};
  localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:10000}));
  localStorage.setItem(KEY,JSON.stringify({version:3,snapshot:s,collected:[],inventory:[],discovered:[],pins:[],receipts:[],sound:false,soundPreference:true}));
 },{KEY,TOKEN,PROFILE,won});
 await boot();await page.locator('#resultDialog[open]').waitFor();await page.locator('#btnSkipReveal').click();
 return page.evaluate(()=>{const catalog=AuctionData.catalog,keys=new Set(AIRPAuction.getView().items.map(i=>i.identified));return catalog.filter(c=>keys.has(c.id)).reduce((sum,c)=>sum+c.quality+1,0);});
}
const tokens=()=>page.evaluate(TOKEN=>JSON.parse(localStorage.getItem(TOKEN)||'{}'),TOKEN);
try{
 const expected=await fixture();await page.locator('#btnKeep').click();await page.waitForFunction(TOKEN=>JSON.parse(localStorage.getItem(TOKEN)||'{}').balance>0,TOKEN);
 assert.equal((await tokens()).balance,expected);
 await boot();assert.equal((await tokens()).balance,expected);
 await page.locator('#navCollection').click();assert.match(await page.locator('#collectionRewards').innerText(),new RegExp(`${expected} / 248`));
 assert.ok((await page.locator('#collectionGrid').innerText()).includes('首藏已奖励'));
 await page.locator('[data-sell]').first().click();
 await page.waitForTimeout(100);await boot();assert.equal((await tokens()).balance,expected);
 console.log('Browser: keep awards, cabinet progress, reload and inventory sale do not repeat rewards');
 await fixture();await page.locator('#btnSell').click();await page.locator('#prepare:not([hidden])').waitFor();assert.equal((await tokens()).balance||0,0);
 await fixture(false);await page.locator('#btnNext').click();await page.locator('#prepare:not([hidden])').waitFor();assert.equal((await tokens()).balance||0,0);
 console.log('Browser: direct sale and NPC win never unlock collection rewards');
 // Two tabs load the same old full collection simultaneously: one backfill only.
 await page.evaluate(({KEY,TOKEN,PROFILE,ids})=>{localStorage.removeItem(TOKEN);localStorage.removeItem(PROFILE);localStorage.setItem(KEY,JSON.stringify({collected:ids,sound:false,soundPreference:true}));},{KEY,TOKEN,PROFILE,ids});
 const second=await context.newPage();await Promise.all([boot(),second.goto(url)]);
 await page.waitForFunction(TOKEN=>JSON.parse(localStorage.getItem(TOKEN)||'{}').balance===248,TOKEN);
 await second.waitForFunction(()=>window.AIRPAuction);
 await Promise.all([page.evaluate(ids=>AuctionRewards.claim(ids),ids),second.evaluate(ids=>AuctionRewards.claim(ids),ids)]);
 assert.equal((await tokens()).balance,248);assert.equal((await tokens()).totalEarned,248);await second.close();
 // Other arcade reward writers and the shop preserve first-collection receipts.
 await page.addScriptTag({url:base+'/arcade/token-system.js'});
 await page.evaluate(()=>AIRPToken.award('scratch',2));
 assert.equal(Object.keys((await tokens()).auctionCollectionClaims).length,96);
 const shrine=await context.newPage();await shrine.goto(base+'/arcade/shrine.html');const gift=await shrine.evaluate(()=>{const r=AIRPShrineFortune.draw();AIRPShrineFortune.open();return r.tokenReward;});await shrine.locator('.selected .packet').click();await shrine.close();
 assert.equal(Object.keys((await tokens()).auctionCollectionClaims).length,96);
 const shop=await context.newPage();await shop.goto(base+'/shop/index.html');await shop.evaluate(price=>dispatchEvent(new MessageEvent('message',{data:{type:'airp-shop:purchase-result',ok:true,price,name:'fixture'}})),gift+2);await shop.close();
 assert.equal((await tokens()).balance,248);assert.equal((await tokens()).totalEarned,250+gift);
 assert.equal(Object.keys((await tokens()).auctionCollectionClaims).length,96);
 await boot();assert.equal((await tokens()).balance,248);
 mkdirSync('artifacts/auction-v32/rewards',{recursive:true});
 await page.locator('#navCollection').click();await page.screenshot({path:'artifacts/auction-v32/rewards/desktop-cabinet.png'});
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 const mobile=await mobileContext.newPage();await mobile.goto(url);await mobile.waitForSelector('iframe');
 const game=mobile.frames().find(f=>f.parentFrame());await game.waitForFunction(()=>window.AIRPAuction);
 await game.locator('#navCollection').click();
 const bounds=await game.locator('#collectionDialog').evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,sw:e.scrollWidth,cw:e.clientWidth};});
 assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=bounds.w+1&&bounds.bottom<=bounds.h+1,JSON.stringify(bounds));
 assert.ok(bounds.sw<=bounds.cw+1,JSON.stringify(bounds));
 assert.equal(await game.locator('#collectionRewards').innerText(),'首藏代币 0 / 248');
 await mobile.screenshot({path:'artifacts/auction-v32/rewards/phone-cabinet.png'});await mobileContext.close();
 assert.deepEqual(errors,[]);
 console.log('Browser: two-tab legacy backfill pays once; other arcade rewards and shop spending preserve receipts');
 console.log(JSON.stringify({passed:true,total:248,rarities:report},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
