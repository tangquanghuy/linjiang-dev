import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const ROOT=resolve('.'),OUT='artifacts/auction-v32/screenshots';mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{try{const path=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(ROOT+sep)||!statSync(path).isFile())throw Error();res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch();const report=[];
async function bounds(f,selectors){return f.evaluate(selectors=>selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {selector:s,text:e.textContent.slice(0,35),x:r.x,y:r.y,w:r.width,h:r.height,scroll:e.scrollHeight,client:e.clientHeight,font:getComputedStyle(e).fontSize,clipped:r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5};})),selectors);}
try{
 for(const [name,width,height,hall] of [['desktop',1280,720],['phone',780,360],['small-phone',640,320],['portrait',390,844],['hall-portrait',390,844,true]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width!==1280});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+(hall?'/arcade/index.html#auction':'/arcade/auction.html'));
  if(hall||Math.min(width,height)<=600)await page.waitForSelector('iframe');
  const f=hall||Math.min(width,height)<=600?await page.locator('iframe').first().contentFrame():page;
  await f.locator('#btnStart').waitFor();
  const game=hall||Math.min(width,height)<=600?page.frames().find(f=>f.url().includes('/arcade/auction.html')&&f.parentFrame()):page.mainFrame();
  await game.evaluate(()=>localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000})));
  await game.evaluate(()=>location.reload());await f.locator('#btnStart').waitFor();
  for(let i=0;i<11;i++){await f.locator(`[data-host="${i}"]`).click();const skill=await bounds(game,['#hostDescription']);assert.ok(skill.every(x=>x.scroll<=x.client+2),`${name}: skill ${i} clipped`);}
  const prep=await bounds(game,['#btnStart','.partner-details','#hosts','#tools','.tool-card']);
  await page.screenshot({path:`${OUT}/landscape-${name}-prepare.png`});
  await f.locator('[data-open-shop]').click();const shop=await bounds(game,['#instrumentDialog','#instrumentGrid','.instrument-card','.shop-pagination']);await page.screenshot({path:`${OUT}/landscape-${name}-shop.png`});await f.locator('#instrumentDialog [data-close]').click();
  await f.locator('#btnStart').click();await page.screenshot({path:`${OUT}/landscape-${name}-admission.png`});
  const admission=await bounds(game,['#venues','#admissionBill','#btnConfirmEntry']);
  await f.locator('#btnConfirmEntry').click();await f.locator('#play:not([hidden])').waitFor();
  const play=await bounds(game,['#seats','.intel-panel','.field-tools','#vault','#btnTool','#btnPass','#btnBid']);
  await page.screenshot({path:`${OUT}/landscape-${name}-play.png`});
  assert.equal(await f.locator('#timer').count(),0);assert.equal(await f.locator('.npc-intent').count(),0);
  if(name==='desktop'){const round=await game.evaluate(()=>AIRPAuction.getView().round);await page.waitForTimeout(31000);assert.equal(await game.evaluate(()=>AIRPAuction.getView().round),round);assert.equal(await game.evaluate(()=>AIRPAuction.getView().deadline),null);}
  await f.locator('#btnPass').click();await f.locator('#resultDialog[open]').waitFor({timeout:120000});
  assert.equal(await f.locator('#resultVault .revealed').count(),0);assert.equal(await f.locator('#btnNext').isVisible(),false);

  await page.waitForTimeout(1300);await page.screenshot({path:`${OUT}/landscape-${name}-reveal.png`});
  assert.ok(await f.locator('#resultVault .revealed').count()>0);assert.ok(await f.locator('#resultVault .sealed').count()>0);
  const result=await bounds(game,['#resultDialog','.result-copy','#resultVault','#btnSkipReveal']);
  if(name==='portrait'){const id=await game.evaluate(()=>AIRPAuction.getView().id);await page.setViewportSize({width:height,height:width});await page.waitForTimeout(200);assert.equal(await game.evaluate(()=>AIRPAuction.getView().id),id);assert.equal(await f.locator('#resultDialog').isVisible(),true);await page.setViewportSize({width,height});}
  if(name==='desktop')await game.waitForFunction(()=>document.querySelector('#resultDialog').dataset.revealing==='false',null,{timeout:18000});else await f.locator('#btnSkipReveal').click();
  const total=await game.evaluate(()=>AIRPAuction.getView().items.reduce((n,i)=>n+i.value,0));assert.equal(Number((await f.locator('#revealValue').innerText()).replaceAll(',','')),total);assert.equal(await f.locator('#resultVault .sealed').count(),0);
  await f.locator('#btnNext').click();await f.locator('#prepare:not([hidden])').waitFor();
  assert.deepEqual(errors,[]);for(const [panel,items] of Object.entries({prep,shop,admission,play,result}))for(const item of items){assert.equal(item.clipped,false,`${name}/${panel}: ${item.selector} offscreen`);assert.ok(item.scroll<=item.client+2,`${name}/${panel}: ${item.selector} content clipped`);}
  report.push({name,passed:true,errors,prep,shop,admission,play,result});await page.close();
 }
 writeFileSync('artifacts/auction-v32/landscape-diagnostics.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
