import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const ROOT=resolve('.'),OUT='artifacts/auction-v32/roundflow';mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();const report=[];
async function bounds(f,selectors){return f.evaluate(selectors=>selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {selector:s,text:e.textContent.slice(0,35),x:r.x,y:r.y,w:r.width,h:r.height,scroll:e.scrollHeight,client:e.clientHeight,font:getComputedStyle(e).fontSize,clipped:r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5};})),selectors);}

try{
 for(const [name,width,height] of [['desktop',1280,720],['phone',780,360],['small-phone',640,320],['portrait',390,844],['hall-portrait',390,844]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+(name==='hall-portrait'?'/arcade/index.html#auction':'/arcade/auction.html'));
  if(width!==1280)await page.waitForSelector('iframe');
  if(name==='hall-portrait')await page.waitForFunction(()=>document.querySelector('iframe')?.src.includes('auction.html'));
  const frame=width===1280?page.mainFrame():page.frames().find(f=>f.parentFrame()&&f.url().includes('/arcade/auction.html'));
  await frame.waitForFunction(()=>window.AIRPAuction);
  const target=await frame.evaluate(()=>{
   const engine=AIRPAuctionEngine.createSession({seed:53,budget:40000,host:0,venue:'street',loadout:['identify-0'],stock:{'identify-0':1}});engine.beginLot();
   const snapshot=engine.export();snapshot.current.clues.unshift({round:1,text:'对方 消耗了某仪器，结果由对方私有。'});
   snapshot.current.clues.unshift({round:1,text:'检视：总价值：1,234',private:true});
   const trial=AIRPAuctionEngine.restore(snapshot);trial.bid(1);const price=Math.max(...trial.view().history[0].bids.slice(1).filter(n=>n!==null));
   localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000}));
   localStorage.setItem('airp_auction_state_v3',JSON.stringify({version:3,host:0,venue:'street',revision:0,snapshot,instrumentStock:{'identify-0':1},loadout:['identify-0'],inventory:[],collected:[],discovered:[],pins:[],receipts:[],compensation:{day:'',used:0},sound:false}));return price;
  });
  assert.ok(target>0);await frame.evaluate(()=>location.reload());await frame.waitForFunction(()=>window.AIRPAuction);
  assert.ok(!(await frame.locator('#clues').innerText()).includes('结果由对方私有'));
  const hierarchy=await frame.evaluate(()=>({main:parseFloat(getComputedStyle(document.querySelector('.clue p')).fontSize),meta:parseFloat(getComputedStyle(document.querySelector('.clue-meta span')).fontSize),number:parseFloat(getComputedStyle(document.querySelector('.intel-number')).fontSize)}));
  assert.ok(hierarchy.number>hierarchy.main&&hierarchy.main>hierarchy.meta);
  await frame.locator('#btnBid').click();assert.equal(await frame.locator('#bidDialog input').count(),0);assert.ok(await frame.locator('#bidPrevious').isDisabled());
  await frame.locator('[data-digit="00"]').click();assert.equal(await frame.locator('#bidAmount').innerText(),'0');assert.ok(await frame.locator('#bidConfirm').isDisabled());
  await frame.locator('[data-digit="7"]').click();await frame.locator('[data-digit="00"]').click();assert.equal(await frame.locator('#bidAmount').innerText(),'700');
  await frame.locator('[data-edit=backspace]').click();assert.equal(await frame.locator('#bidAmount').innerText(),'70');
  await frame.locator('#bidDialog [data-close]').click();await frame.locator('#btnBid').click();assert.equal(await frame.locator('#bidAmount').innerText(),'70');
  await frame.locator('[data-edit=clear]').click();for(let i=0;i<13;i++)await frame.locator('[data-digit="9"]').click();assert.equal((await frame.locator('#bidAmount').innerText()).replaceAll(',','').length,12);assert.ok(await frame.locator('#bidConfirm').isDisabled());
  await frame.locator('[data-edit=clear]').click();for(const digit of String(target))await frame.locator(`[data-digit="${digit}"]`).click();
  await frame.evaluate(()=>{localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:100}));dispatchEvent(new StorageEvent('storage',{key:'airp_arcade_wallet_v1'}));});assert.ok(await frame.locator('#bidConfirm').isDisabled());
  await frame.evaluate(()=>{localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000}));dispatchEvent(new StorageEvent('storage',{key:'airp_arcade_wallet_v1'}));});assert.ok(await frame.locator('#bidConfirm').isEnabled());
  await page.screenshot({path:`${OUT}/${name}-keypad.png`});
  const keypadBounds=await bounds(frame,['#bidDialog','#bidConfirm','#bidKeypad button']);assert.ok(keypadBounds.every(b=>!b.clipped),JSON.stringify(keypadBounds));
  await frame.locator('#bidConfirm').click();await frame.waitForFunction(()=>document.body.dataset.roundStage==='waiting');
  assert.equal(await frame.locator('.bid-submitted').count(),1);assert.equal(await frame.locator('.bidder').nth(1).locator('.bid-history>span').first().textContent(),'1—');assert.ok(await frame.locator('#btnBid').isDisabled());assert.ok(await frame.locator('#btnTool').isDisabled());
  const saved=await frame.evaluate(()=>JSON.parse(localStorage.getItem('airp_auction_state_v3')));
  const ready=saved.roundPresentation.readyAt.filter(n=>n!==null).sort((a,b)=>a-b);assert.equal(new Set(ready).size,4);assert.ok(ready[1]-ready[0]>=1120);
  // Direct events and a page reload may not submit a duplicate or skip the presentation.
  await frame.evaluate(()=>{document.querySelector('#btnPass').click();document.querySelector('#btnTool').click();});
  if(name==='desktop'){
   await frame.evaluate(()=>location.reload());await frame.waitForFunction(()=>document.body.dataset.roundStage==='waiting');
   const peer=await context.newPage();await peer.goto(base+'/arcade/auction.html');await peer.waitForFunction(()=>document.body.dataset.roundStage==='waiting');
   assert.equal(await peer.evaluate(()=>AIRPAuction.getView().history.length),1);await peer.close();
  }
  await frame.waitForFunction(()=>document.querySelectorAll('.bid-submitted').length>=2);
  await page.screenshot({path:`${OUT}/${name}-waiting.png`});
  await frame.waitForFunction(()=>document.body.dataset.roundStage==='result');
  assert.equal(await frame.locator('#resultDialog[open]').count(),0);assert.match(await frame.locator('#roundFeedback').innerText(),/最高报价/);
  assert.ok(await frame.locator('#btnBid').isDisabled());
  const resultBounds=await bounds(frame,['#roundFeedback','#seats','#btnBid']);assert.ok(resultBounds.every(b=>!b.clipped),JSON.stringify(resultBounds));
  await page.waitForTimeout(300);await page.screenshot({path:`${OUT}/${name}-round-result.png`});
  await frame.waitForFunction(()=>document.body.dataset.roundStage==='idle');
  assert.equal(await frame.evaluate(()=>AIRPAuction.getView().round),2);assert.ok(await frame.locator('#btnBid').isEnabled());
  await frame.locator('#btnBid').click();assert.equal(await frame.locator('#bidAmount').innerText(),'0');assert.ok(await frame.locator('#bidPrevious').isEnabled());await frame.locator('#bidPrevious').click();assert.equal(await frame.locator('#bidAmount').innerText(),Math.ceil(target*13/10).toLocaleString('zh-CN'));
  // Large valid bid ends the auction: still show round result before opening blind boxes.
  await frame.locator('[data-edit=clear]').click();for(const digit of ['4','0','00','0'])await frame.locator(`[data-digit="${digit}"]`).click();
  await frame.locator('#bidConfirm').click();await frame.waitForFunction(()=>document.body.dataset.roundStage==='waiting');assert.equal(await frame.locator('#resultDialog[open]').count(),0);
  await frame.waitForFunction(()=>document.body.dataset.roundStage==='result');assert.match(await frame.locator('#roundFeedback').innerText(),/你竞得/);
  await frame.locator('#resultDialog[open]').waitFor();assert.equal(await frame.locator('#resultVault .revealed').count(),0);
  await frame.locator('#btnSkipReveal').click();await frame.locator('#btnSell').click();await frame.locator('#prepare:not([hidden])').waitFor();
  if(name==='desktop'){
   await frame.evaluate(()=>{
    const engine=AIRPAuctionEngine.createSession({seed:53,budget:40000,host:0,venue:'street'});engine.beginLot();const saved=JSON.parse(localStorage.getItem('airp_auction_state_v3'));saved.snapshot=engine.export();saved.roundPresentation=null;localStorage.setItem('airp_auction_state_v3',JSON.stringify(saved));
   });await frame.evaluate(()=>location.reload());await frame.locator('#btnPass').click();await frame.waitForFunction(()=>document.body.dataset.roundStage==='result');
   await frame.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('airp_auction_state_v3'));return s.roundPresentation.round===2&&document.body.dataset.roundStage==='waiting';});
   const feedback=await frame.locator('#roundFeedback').innerText();assert.match(feedback,/0 \/ 3/);assert.ok(await frame.locator('#btnBid').isDisabled());
   await frame.locator('#resultDialog[open]').waitFor({timeout:120000});await frame.locator('#btnSkipReveal').click();await frame.locator('#btnNext').click();await frame.locator('#prepare:not([hidden])').waitFor();
  }
  assert.deepEqual(errors,[]);report.push({name,passed:true,hierarchy,target,keypadBounds,resultBounds});await context.close();
 }
 writeFileSync('artifacts/auction-v32/roundflow-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({name,passed,hierarchy,target})=>({name,passed,hierarchy,target})),null,2));
}finally{await browser.close();server.close();}
