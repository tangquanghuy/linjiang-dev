import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const ROOT=resolve('.'),KEY='airp_auction_state_v3',WALLET='airp_arcade_wallet_v1';
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/arcade/auction.html?nolimit=1`,browser=await chromium.launch(),context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function fixture({used=0,dayOffset=0,won=false}={}){await page.goto(url);await page.evaluate(({KEY,WALLET,used,dayOffset,won})=>{
 const g=AIRPAuctionEngine.createSession({seed:23,budget:10000,id:crypto.randomUUID()});g.beginLot();const s=g.export();s.lotIndex=3;s.current.phase='result';s.bots.forEach(b=>b.bank=10000);
 s.current.result={won,winner:won?0:1,price:1500,trueValue:1000,overpayment:500,rawCompensation:50,compensation:won?0:40,profit:won?-500:40,reason:'settlement fixture'};
 const day=new Date(Date.now()+8*3600000+dayOffset*86400000).toISOString().slice(0,10);
 localStorage.setItem(WALLET,JSON.stringify({balance:10000}));localStorage.setItem(KEY,JSON.stringify({version:3,host:0,venue:'street',tool:'scanner',snapshot:s,inventory:[],collected:[],discovered:[],pins:[],receipts:[],sound:false,compensation:{day,used}}));
 },{KEY,WALLET,used,dayOffset,won});await page.reload();await page.waitForSelector('#resultDialog[open]');await page.click('#btnSkipReveal');}
async function settle(button='#btnNext'){await page.click(button);await page.waitForSelector('#prepare:not([hidden])');}
async function data(){return page.evaluate(({KEY,WALLET})=>({state:JSON.parse(localStorage.getItem(KEY)),wallet:JSON.parse(localStorage.getItem(WALLET))}),{KEY,WALLET});}
const checks=[];
try{
 await fixture({used:55});assert.ok((await page.locator('#resultNumbers').innerText()).includes('+5'));await settle();let d=await data();assert.equal(d.wallet.balance,10005);assert.equal(d.state.compensation.used,60);assert.equal(d.state.snapshot,null);await page.reload();assert.equal((await data()).wallet.balance,10005);checks.push('remaining daily cap, UI/engine/wallet agreement, reload idempotence');
 await fixture({used:60});await settle();assert.equal((await data()).wallet.balance,10000);
 await fixture({used:60,dayOffset:-1});await settle();assert.equal((await data()).wallet.balance,10040);
 await fixture({used:60,dayOffset:1});await settle();assert.equal((await data()).wallet.balance,10000);checks.push('quota exhausted, UTC+8 new day reset, backward date does not reset');
 await fixture({won:true});await settle('#btnSell');d=await data();assert.equal(d.wallet.balance,9500);assert.equal(d.state.compensation.used,0);assert.equal(d.state.lastAuction.compensation,0);checks.push('direct sell loss, winner earns no loser compensation');
 await fixture({used:55});const second=await context.newPage();await second.goto(url);await second.waitForSelector('#resultDialog[open]');await second.click('#btnSkipReveal');await Promise.all([page.evaluate(()=>document.querySelector('#btnNext').click()),second.evaluate(()=>document.querySelector('#btnNext').click())]);await page.waitForSelector('#prepare:not([hidden])');await second.waitForSelector('#prepare:not([hidden])');d=await data();assert.equal(d.wallet.balance,10005);assert.equal(d.state.receipts.length,1);assert.equal(d.state.compensation.used,60);await second.close();checks.push('two-tab simultaneous settlement pays once');
 // Both journal crash points: before wallet write, and after wallet write but before final state write.
 const committed=d;for(const walletWritten of [false,true]){
  await page.evaluate(({KEY,WALLET,committed,walletWritten})=>{const id=committed.state.receipts[0],next=committed.state;const pending={id,before:10000,after:10005,next};localStorage.setItem(KEY,JSON.stringify({...next,receipts:[],pending}));localStorage.setItem(WALLET,JSON.stringify(walletWritten?{balance:10005,auctionTxn:id}:{balance:10000}));},{KEY,WALLET,committed,walletWritten});
  await page.reload();await page.waitForSelector('#prepare:not([hidden])');d=await data();assert.equal(d.wallet.balance,10005);assert.equal(d.state.compensation.used,60);assert.equal(d.state.receipts.length,1);assert.ok(!d.state.pending);
 }checks.push('write-ahead journal recovers both crash points without duplicate quota/payout');
 assert.deepEqual(errors,[]);mkdirSync('artifacts/auction-v3',{recursive:true});const report={passed:true,checks};writeFileSync('artifacts/auction-v3/settlement-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
