import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const ROOT=resolve('.'),OUT='artifacts/auction-v32/scene-checked';mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();const report=[];
async function bounds(f,selectors){return f.evaluate(selectors=>selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {selector:s,text:e.textContent.slice(0,35),x:r.x,y:r.y,w:r.width,h:r.height,scroll:e.scrollHeight,client:e.clientHeight,font:getComputedStyle(e).fontSize,clipped:r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5};})),selectors);}

try{
 for(const [name,width,height] of [['wide-desktop',2541,1272],['desktop',1280,720],['small-phone',640,320],['phone',780,360],['portrait',390,844]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/arcade/auction.html');if(width<1000)await page.waitForSelector('iframe');const f=page.frames().find(f=>f.parentFrame())||page.mainFrame();await f.waitForFunction(()=>window.AIRPAuction);
  for(let i=0;i<11;i++){await f.locator(`[data-host="${i}"]`).click();assert.ok(await f.locator('#hostDescription').evaluate(e=>e.scrollHeight<=e.clientHeight+1));}
  const prepared=await bounds(f,['.partner-focus','.partner-details','#hosts','.tool-card','#btnStart']);assert.ok(prepared.every(b=>!b.clipped&&b.scroll<=b.client+2),JSON.stringify(prepared));
  const prepareType=await f.evaluate(()=>{
   const type=s=>{const e=document.querySelector(s),c=getComputedStyle(e),unit=parseFloat(getComputedStyle(document.documentElement).fontSize);return {size:parseFloat(c.fontSize)/unit,weight:Number(c.fontWeight),color:c.color};};
   return {hero:type('#heroName'),page:type('.prepare-topline h1'),skill:type('#hostDescription h3'),description:type('#hostDescription p'),tool:type('#tools .tool-card strong'),toolBody:type('#tools .tool-card p'),stock:type('#tools .tool-card em'),wallet:type('.wallet strong'),walletLabel:type('.wallet small')};
  });
  assert.ok(prepareType.hero.size/prepareType.description.size>=1.65,JSON.stringify(prepareType));
  assert.ok(prepareType.page.size>prepareType.skill.size&&prepareType.skill.size>prepareType.description.size);
  assert.ok(prepareType.tool.size>prepareType.toolBody.size&&prepareType.toolBody.size>prepareType.stock.size);
  assert.ok(prepareType.skill.weight>prepareType.description.weight&&prepareType.tool.weight>prepareType.stock.weight);
  assert.notEqual(prepareType.skill.color,prepareType.description.color);
  assert.ok(prepareType.wallet.size/prepareType.walletLabel.size>=1.6);
  assert.ok(prepareType.description.size>=16.99&&prepareType.toolBody.size>=15.99&&prepareType.stock.size>=13.99);
  const rows=await f.locator('#hosts .host-button').evaluateAll(es=>[...new Set(es.map(e=>e.offsetTop))]);assert.equal(rows.length,2);
  await f.locator('[data-open-shop]').click();assert.equal(await f.locator('.instrument-card').count(),2);const shop=await bounds(f,['#instrumentDialog','.instrument-card','.shop-pagination']);assert.ok(shop.every(b=>!b.clipped&&b.scroll<=b.client+2),JSON.stringify(shop));await page.screenshot({path:`${OUT}/${name}-shop.png`});await f.locator('#instrumentDialog [data-close]').click();
  await page.screenshot({path:`${OUT}/${name}-prepare.png`});
  await f.evaluate(()=>{
   const e=AIRPAuctionEngine.createSession({seed:53,budget:40000,host:0,venue:'street',loadout:['identify-0'],stock:{'identify-0':1}});e.beginLot();
   const s=JSON.parse(localStorage.getItem('airp_auction_state_v3'))||{version:3,venue:'street',revision:0,inventory:[],collected:[],discovered:[],pins:[],receipts:[],compensation:{day:'',used:0},sound:false};s.host=0;s.snapshot=e.export();s.roundPresentation=null;s.loadout=['identify-0'];s.instrumentStock={'identify-0':1};
   localStorage.setItem('airp_auction_state_v3',JSON.stringify(s));localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000}));
  });await f.evaluate(()=>location.reload());await f.locator('#btnBid').waitFor();
  const typography=await f.evaluate(()=>{
   const css=s=>{const e=document.querySelector(s),c=getComputedStyle(e);return {font:parseFloat(c.fontSize),weight:c.fontWeight,family:c.fontFamily,line:c.lineHeight};};
   const viewport=document.querySelector('#clues').getBoundingClientRect(),meta=document.querySelector('.clue-meta').getBoundingClientRect();
   return {body:css('.clue p'),title:css('.intel-panel h2'),caption:css('.clue-meta span'),number:css('.intel-number'),name:css('.bidder-name strong'),price:css('.bid-history span'),status:css('.bidder-status'),round:css('.round-track .current'),estimate:css('.estimate>strong'),estimateLabel:css('.estimate>span'),unit:parseFloat(getComputedStyle(document.documentElement).fontSize),firstSourceVisible:meta.bottom<=viewport.bottom+1};
  });assert.ok(Math.abs(typography.body.font/typography.unit-17)<.01);assert.equal(typography.body.weight,'400');assert.ok(Math.abs(typography.caption.font/typography.unit-14)<.01);assert.ok(typography.number.font>typography.body.font&&typography.body.font>typography.caption.font);assert.ok(typography.firstSourceVisible,JSON.stringify(typography));
  assert.ok(typography.round.font/typography.body.font>=1.4);assert.ok(typography.name.font/typography.status.font>=1.25);assert.ok(typography.estimate.font/typography.estimateLabel.font>=1.8);assert.ok(typography.body.font/typography.caption.font>=1.2);
  const scene=await f.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {ordered:r('.bidders').right<r('.intel-panel').left&&r('.intel-panel').right<r('.warehouse').left,vaultWidth:r('#vault').width,warehouseWidth:r('.warehouse').width,arenaHeight:r('.arena').height,seatsHeight:r('#seats').height,history:getComputedStyle(document.querySelector('.bid-history')).display,scroll:document.documentElement.scrollHeight>innerHeight+1};});assert.ok(scene.ordered&&!scene.scroll&&scene.history==='grid',JSON.stringify(scene));assert.ok(scene.vaultWidth>=scene.warehouseWidth*.72&&scene.seatsHeight<=scene.arenaHeight,JSON.stringify(scene));
  await page.screenshot({path:`${OUT}/${name}-play.png`});
  await f.locator('#btnFieldTools').click();const tools=await bounds(f,['#fieldToolsDialog','#activeInstrument','#btnTool','.instrument-description']);assert.ok(tools.every(b=>!b.clipped&&b.scroll<=b.client+2),JSON.stringify(tools));await page.screenshot({path:`${OUT}/${name}-tools.png`});await f.locator('#fieldToolsDialog [data-close]').click();
  const controls=await bounds(f,['.bidder','.bid-history','#clues','#btnFieldTools','#btnBid']);assert.ok(controls.every(x=>!x.clipped),JSON.stringify(controls));
  await f.locator('.bid-history').first().click();await f.locator('#bidHistoryDialog[open]').waitFor();assert.ok(await f.locator('#bidHistoryEmpty').isVisible());await f.locator('#bidHistoryDialog [data-close]').click();
  await f.locator('#btnBid').click();for(const digit of ['5','8','5'])await f.locator(`[data-digit="${digit}"]`).click();await f.locator('#bidConfirm').click();
  await f.waitForFunction(()=>document.body.dataset.roundStage==='result');await page.waitForTimeout(300);await page.screenshot({path:`${OUT}/${name}-round-result.png`});
  assert.ok(await f.locator('#btnBid').isHidden());await f.locator('.bid-history').first().click();assert.equal(await f.locator('#bidHistoryTable tbody tr').count(),1);assert.equal(await f.locator('#bidHistoryTable tbody td').first().textContent(),'585');
  const tableBounds=await bounds(f,['#bidHistoryDialog','#bidHistoryTable']);assert.ok(tableBounds.every(b=>!b.clipped),JSON.stringify(tableBounds));await page.screenshot({path:`${OUT}/${name}-history.png`});await f.locator('#bidHistoryDialog [data-close]').click();
  await f.waitForFunction(()=>document.body.dataset.roundStage==='idle');assert.equal(await f.evaluate(()=>AIRPAuction.getView().round),2);assert.deepEqual(errors,[]);report.push({name,passed:true,prepareType,typography,scene,prepared,shop});await page.close();
 }
 writeFileSync('artifacts/auction-v32/mobile-type-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
