import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const ROOT=resolve('.'),KEY='airp_auction_state_v3',WALLET='airp_arcade_wallet_v1';
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/arcade/auction.html?nolimit=1`,browser=await chromium.launch(),context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));

const checks=[];
async function snapshot(){return page.evaluate(({KEY,WALLET})=>({state:JSON.parse(localStorage.getItem(KEY)),wallet:JSON.parse(localStorage.getItem(WALLET))}),{KEY,WALLET});}
async function shop(p){await p.locator('[data-open-shop]').click();await p.waitForSelector('#instrumentDialog[open]');}
try{
 await page.goto(url);await shop(page);assert.equal(await page.locator('.instrument-card').count(),2);assert.equal(await page.locator('#shopPageSelect option').count(),22);
 await page.selectOption('#instrumentKind','identify');await page.click('[data-buy="identify-0"]');await page.waitForFunction(()=>AIRPAuction.getInstruments().stock['identify-0']===1);assert.equal((await snapshot()).wallet.balance,970);
 await page.reload();assert.equal(await page.evaluate(()=>AIRPAuction.getInstruments().stock['identify-0']),1);checks.push('purchase charges exact amount, stock persists through reload');
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url);await shop(page);await shop(second);
 await Promise.all([page.evaluate(()=>document.querySelector('[data-buy="shape-0"]').click()),second.evaluate(()=>document.querySelector('[data-buy="shape-0"]').click())]);
 await page.waitForFunction(()=>AIRPAuction.getInstruments().stock['shape-0']===2);assert.equal((await snapshot()).wallet.balance,950);checks.push('two-tab purchases serialize; no free inventory or lost purchase');
 await page.locator('#instrumentDialog [data-close]').click();await second.locator('#instrumentDialog [data-close]').click();await page.click('#btnStart');await page.click('#btnConfirmEntry');await page.waitForFunction(()=>AIRPAuction.getView()?.phase==='bidding');await second.waitForFunction(()=>AIRPAuction.getView()?.phase==='bidding');
 await page.click('#btnFieldTools');await second.click('#btnFieldTools');await page.selectOption('#activeInstrument','identify-0');await second.selectOption('#activeInstrument','identify-0');
 await Promise.all([page.evaluate(()=>document.querySelector('#btnTool').click()),second.evaluate(()=>document.querySelector('#btnTool').click())]);
 await page.waitForFunction(()=>AIRPAuction.getView()?.instrumentCost===30);let d=await snapshot();assert.equal(d.wallet.balance,800);assert.equal(d.state.instrumentStock['identify-0'],0);assert.equal(d.state.snapshot.stock['identify-0'],0);assert.equal(d.state.snapshot.current.playerTools.length,1);checks.push('same-round duplicate use consumes once, effect stored with inventory, no second charge');
 await page.reload();assert.equal(await page.evaluate(()=>AIRPAuction.getView().instrumentCost),30);assert.equal(await page.evaluate(()=>AIRPAuction.getView().stock['identify-0']),0);assert.equal(await page.locator('#btnTool').isDisabled(),true);
 await second.close();
 // One remaining coin balance can buy only one exact-priced item, even with concurrent tabs.
 await page.evaluate(({KEY,WALLET})=>{localStorage.removeItem(KEY);localStorage.setItem(WALLET,JSON.stringify({balance:10}));},{KEY,WALLET});await page.reload();const poor=await context.newPage();await poor.goto(url);await shop(page);await shop(poor);
 await Promise.all([page.evaluate(()=>document.querySelector('[data-buy="shape-0"]').click()),poor.evaluate(()=>document.querySelector('[data-buy="shape-0"]').click())]);await page.waitForFunction(()=>AIRPAuction.getBalance()===0);await page.waitForTimeout(100);d=await snapshot();assert.equal(d.wallet.balance,0);assert.equal(d.state.instrumentStock['shape-0'],1);await poor.close();checks.push('insufficient funds race rejects overdraft');
 // Simulate each crash point of an exact purchase journal and a zero-delta consumption journal.
 for(const kind of ['purchase','consume'])for(const afterWallet of [false,true]){
  await page.evaluate(({KEY,WALLET,kind,afterWallet})=>{
   const base={version:3,revision:1,host:5,venue:'street',instrumentStock:{'identify-0':kind==='consume'?1:0},loadout:['identify-0'],snapshot:null,inventory:[],collected:[],discovered:[],pins:[],receipts:[],sound:false,compensation:{day:'',used:0}};
   const id=`crash-${kind}-${afterWallet}`,next=structuredClone(base);next.receipts=[id];
   if(kind==='purchase')next.instrumentStock['identify-0']=1;
   else{const g=AIRPAuctionEngine.createSession({seed:23,host:5,budget:1000,loadout:['identify-0'],stock:{'identify-0':1}});g.beginLot();base.snapshot=g.export();g.useTool('identify-0');next.snapshot=g.export();next.instrumentStock['identify-0']=0;}
   const before=1000,after=kind==='purchase'?970:1000;localStorage.setItem(KEY,JSON.stringify({...base,pending:{id,before,after,next}}));localStorage.setItem(WALLET,JSON.stringify({balance:afterWallet?after:before,...(afterWallet?{auctionTxn:id}:{})}));
  },{KEY,WALLET,kind,afterWallet});await page.reload();await page.waitForTimeout(50);d=await snapshot();assert.equal(d.state.pending,undefined);assert.equal(d.state.receipts.length,1);assert.equal(d.wallet.balance,kind==='purchase'?970:1000);assert.equal(d.state.instrumentStock['identify-0'],kind==='purchase'?1:0);if(kind==='consume')assert.equal(d.state.snapshot.current.instrumentCost,30);await page.reload();assert.equal((await snapshot()).wallet.balance,d.wallet.balance);
 }
 checks.push('purchase + consumption journal recover both crash points without lost effect or repeated debit');
 assert.deepEqual(errors,[]);const report={passed:true,checks};mkdirSync('artifacts/auction-v32',{recursive:true});writeFileSync('artifacts/auction-v32/purchase-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
