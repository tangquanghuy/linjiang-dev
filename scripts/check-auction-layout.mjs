import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const ROOT=resolve('.'),OUT=resolve('artifacts/auction-v32/screenshots');mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(readFileSync(path));}catch{res.writeHead(404);res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();const report=[];

async function assertShopFits(page,label){
 const rects=await page.evaluate(()=>{const d=document.querySelector('#instrumentDialog'),g=document.querySelector('#instrumentGrid'),n=document.querySelector('.shop-pagination');const r=d.getBoundingClientRect(),f=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,width:innerWidth,scroll:document.documentElement.scrollWidth,dialogScroll:d.scrollHeight,dialogHeight:d.clientHeight,gridScroll:g.scrollHeight,gridHeight:g.clientHeight,footerBottom:f.bottom};});
 assert.ok(rects.top>=0&&rects.bottom<=rects.height+1,`${label}: dialog outside viewport ${JSON.stringify(rects)}`);
 assert.ok(rects.footerBottom<=rects.height,`${label}: page controls clipped`);
 assert.ok(rects.scroll<=rects.width,`${label}: horizontal overflow ${JSON.stringify(await page.evaluate(()=>[...document.body.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,20)))}`);
 assert.ok(rects.dialogScroll<=rects.dialogHeight+1,`${label}: dialog has a long scroll`);
 if(rects.height>=780)assert.ok(rects.gridScroll<=rects.gridHeight+1,`${label}: cards need vertical scroll ${JSON.stringify(rects)}`);
}
try{
 for(const [label,width,height,perPage] of [['desktop',1760,1000,2],['laptop',1280,900,2],['compact',1280,720,2],['tablet',768,1024,2],['phone',780,360,2],['narrow',640,320,2]]){
  const outer=await browser.newPage({viewport:{width,height},hasTouch:width<1000});let page=outer;const errors=[];outer.on('pageerror',e=>errors.push(e.message));
  await outer.goto(base+'/arcade/auction.html');if(height<=600||width<1000){await outer.waitForSelector('iframe');page=outer.frames().find(f=>f.parentFrame());await page.waitForSelector('#btnStart');}await page.evaluate(()=>localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000})));await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.evaluate(()=>location.reload())]);await page.waitForSelector('#btnStart');
  const rows=await page.locator('.host-button').evaluateAll(es=>{const rows=new Map();for(const e of es){const y=Math.round(e.getBoundingClientRect().top);rows.set(y,(rows.get(y)||0)+1);}return [...rows.values()];});assert.deepEqual(rows,[6,5],label);
  for(let i=0;i<11;i++){await page.locator(`[data-host="${i}"]`).click();await page.waitForFunction(i=>document.querySelector(`[data-host="${i}"]`).classList.contains("active"),i);assert.equal(await page.locator('#hostDescription > *').count(),2);const font=await page.evaluate(()=>({size:parseFloat(getComputedStyle(document.querySelector('#hostDescription p')).fontSize),unit:parseFloat(getComputedStyle(document.documentElement).fontSize)}));assert.ok(font.size/font.unit>=16.95,`${label} host${i}: ${JSON.stringify(font)}`);}
  assert.ok(await page.locator('#tools .tool-card strong').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)/parseFloat(getComputedStyle(document.documentElement).fontSize))>=17.95);
  assert.ok(await page.locator('#tools .tool-card p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)/parseFloat(getComputedStyle(document.documentElement).fontSize))>=15.95);
  assert.equal(await page.locator('.skill-timing,.loadout-note').count(),0);
  await page.click('[data-open-shop]');assert.equal(await page.locator('#shopHint').isVisible(),false);assert.equal(await page.locator('.instrument-card').count(),perPage);
  const seen=[],pageCount=await page.locator('#shopPageSelect option').count();assert.equal(pageCount,Math.ceil(43/perPage));assert.equal(await page.locator('#shopPrev').isDisabled(),true);
  for(let i=0;i<pageCount;i++){
   assert.equal(await page.locator('#shopPageSelect').inputValue(),String(i));await assertShopFits(page,`${label} page ${i+1}`);
   seen.push(...await page.locator('[data-buy]').evaluateAll(es=>es.map(e=>e.dataset.buy)));
   if(i<pageCount-1)await page.click('#shopNext');
  }
  assert.equal(seen.length,43);assert.equal(new Set(seen).size,43);assert.equal(await page.locator('#shopNext').isDisabled(),true);
  await page.selectOption('#shopPageSelect','1');const id=await page.locator('[data-buy]').first().getAttribute('data-buy');await page.locator('[data-buy]').first().click();await page.waitForFunction(id=>AIRPAuction.getInstruments().stock[id]===1,id);assert.equal(await page.locator('#shopPageSelect').inputValue(),'1');
  await page.click('#shopPrev');assert.equal(await page.locator('#shopPageSelect').inputValue(),'0');
  await page.selectOption('#shopPageSelect',String(pageCount-1));await page.selectOption('#instrumentKind','identify');assert.equal(await page.locator('#shopPageSelect').inputValue(),'0');assert.ok(await page.locator('[data-buy]').evaluateAll(es=>es.every(e=>AuctionData.tools.find(t=>t.id===e.dataset.buy).effect.kind==='identify')));
  await page.selectOption('#instrumentKind','stat');let empty=false;for(let i=0;i<6;i++){await page.selectOption('#instrumentTier',String(i));if(await page.locator('.shop-empty').count()){empty=true;assert.equal(await page.locator('#shopPrev').isDisabled(),true);assert.equal(await page.locator('#shopNext').isDisabled(),true);assert.equal(await page.locator('#shopPageSelect option').count(),1);break;}}
  assert.equal(empty,true,'empty filter combination');
  await page.selectOption('#instrumentTier','');await page.selectOption('#instrumentKind','');await page.selectOption('#shopPageSelect',String(pageCount-1));
  await outer.setViewportSize({width:1760,height:1000});await page.waitForFunction(()=>document.querySelector('#shopPageSelect').options.length===22);assert.ok(Number(await page.locator('#shopPageSelect').inputValue())<22);await assertShopFits(page,label+' resized');
  assert.deepEqual(errors,[]);report.push({label,width,height,avatarRows:rows,all43Reachable:true,perPage,passed:true});await outer.close();
 }
 writeFileSync('artifacts/auction-v32/layout-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
