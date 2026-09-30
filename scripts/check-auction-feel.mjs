import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import '../arcade/auction-presentation.js';
const P=globalThis.AuctionPresentation,OUT='artifacts/auction-v32/feel';mkdirSync(OUT,{recursive:true});
let seed=1;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const sample={id:'fixture',round:1,active:[true,true,true,true],opponents:[{tendency:'收藏补全'},{tendency:'稳健估值'},{tendency:'保守捡漏'}]};
const durations=[],firsts=[],speechCounts={thinking:0,submitted:0,reaction:0};let silentRounds=0;
for(let n=0;n<1200;n++){
 const p=P.create(sample,random,10000),times=p.readyAt.slice(1).sort((a,b)=>a-b);durations.push(p.revealAt-10000);firsts.push(times[0]-10000);
 assert.ok(times[0]>=11120&&times[0]<=12880);assert.ok(times[1]-times[0]>=880&&times[1]-times[0]<=3120&&times[2]-times[1]>=880&&times[2]-times[1]<=3120);
 assert.equal(p.endAt-p.revealAt,3300);assert.equal(JSON.stringify(p).includes('bids'),false);
 for(let t=10000;t<p.revealAt;t+=300){const b=P.speech(p,null,t);if(b)assert.ok(!P.bank.high.includes(b.text));}
 const row={bids:[9999,100,200,300]},reaction=P.speech(p,row,p.revealAt);
 if(p.reactionSeat){assert.ok(P.bank.high.includes(reaction.text));speechCounts.reaction++;}else assert.equal(reaction,null);
 speechCounts.thinking+=p.bubbles.filter(b=>b.at===10400).length;
 speechCounts.submitted+=p.bubbles.filter(b=>b.at!==10400).length;
 if(!p.bubbles.length&&!p.reactionSeat)silentRounds++;
 assert.equal(p.revealAt-times[2],850);
 const copy=JSON.parse(JSON.stringify(p));assert.deepEqual(P.speech(copy,row,p.revealAt),P.speech(p,row,p.revealAt));
}
assert.ok(Math.max(...durations)-Math.min(...durations)>4800);assert.ok(Math.max(...firsts)-Math.min(...firsts)>1680);
// Fixed seeded sample checks all three 25% opportunities, including fully quiet rounds.
for(const [kind,count] of Object.entries(speechCounts))assert.ok(count/1200>.21&&count/1200<.29,`${kind}: ${count}/1200`);
assert.ok(silentRounds>400&&silentRounds<620,`silent rounds: ${silentRounds}`);
for(const [roll,talking] of [[0,true],[.249999,true],[.25,false],[.999999,false]]){
 const p=P.create(sample,()=>roll,10000);
 assert.equal(p.bubbles.length,talking?2:0);assert.equal(p.reactionSeat!==null,talking);
}
for(const active of [[true,false,false,false],[true,false,true,false]]){
 const p=P.create({...sample,active},()=>.1,10000);
 assert.ok(p.bubbles.every(b=>active[b.seat]));assert.ok(p.reactionSeat===null||active[p.reactionSeat]);
}
console.log('Presentation sampling:',speechCounts,'silent rounds:',silentRounds);
const legacy=P.create(sample,random,10000);delete legacy.bubbles;delete legacy.replies;delete legacy.reactionSeat;assert.equal(P.speech(legacy,null,11000),null);assert.equal(P.speech(legacy,{bids:[100,200,null,300]},legacy.revealAt),null);
const lines=new Set(Object.values(P.bank).flat());assert.ok(lines.size>=80);
const ROOT=resolve('.');const server=createServer((req,res)=>{try{const p=resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(ROOT+sep)||!statSync(p).isFile())throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const report=[];
async function reload(frame){await Promise.all([frame.waitForNavigation({waitUntil:'load'}),frame.evaluate(()=>location.reload())]);await frame.waitForFunction(()=>window.AIRPAuction);}
try{for(const [name,width,height] of [['desktop',1280,720],['phone',780,360],['small-phone',640,320],['portrait',390,844]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop',deviceScaleFactor:2});
 await context.addInitScript(()=>{
  const Original=window.AudioContext;if(!Original)return;window.__audioStarts=0;window.__audioStops=0;
  window.AudioContext=class extends Original{createOscillator(){const o=super.createOscillator(),start=o.start.bind(o),stop=o.stop.bind(o);o.start=(...a)=>{window.__audioStarts++;return start(...a);};o.stop=(...a)=>{window.__audioStops++;return stop(...a);};return o;}};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/arcade/auction.html`);
 if(name!=='desktop')await page.waitForSelector('iframe');const frame=page.frames().find(f=>f.parentFrame())||page.mainFrame();await frame.waitForFunction(()=>window.AIRPAuction);
 await frame.evaluate(()=>{
  const e=AIRPAuctionEngine.createSession({seed:53,budget:40000,host:0,venue:'street',loadout:['identify-0'],stock:{'identify-0':1}});e.beginLot();
  const snapshot=e.export();for(let i=0;i<16;i++)snapshot.current.clues.push({round:1,text:`测试滚动线索 ${i+1}：这是一条用于验证拖动和持续阅读的情报。`});
  localStorage.setItem('airp_arcade_wallet_v1',JSON.stringify({balance:40000}));localStorage.setItem('airp_auction_state_v3',JSON.stringify({snapshot,host:0,venue:'street',revision:0,sound:false,soundPreference:true}));
 });await reload(frame);
 // Every line, at every NPC seat: bubble and tail must stay next to their speaker,
 // with no clipping or overlap with any avatar, name, status or quote history.
 const chatFit=await frame.evaluate(()=>{
  const failures=[],cards=[...document.querySelectorAll('#seats .bidder')];
  const phrases=[...new Set(Object.values(AuctionPresentation.bank).flat())];
  const obstacles=[...document.querySelectorAll('#seats .bidder-avatar,#seats .bidder-name,#seats .bidder-status,#seats .bid-history')];
  let checked=0;
  for(const card of cards.slice(1)){
   const bubble=card.querySelector('.npc-bubble');
   for(const text of phrases){
    bubble.textContent=text;
    const r=bubble.getBoundingClientRect(),a=card.querySelector('.bidder-avatar').getBoundingClientRect(),bounds=document.querySelector('#seats').getBoundingClientRect();
    if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>a.top||bubble.scrollWidth>bubble.clientWidth+1)failures.push({text,issue:'bounds'});
    for(const other of obstacles){const q=other.getBoundingClientRect();if(Math.min(r.right,q.right)-Math.max(r.left,q.left)>1&&Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)>1)failures.push({text,issue:'overlap',element:other.className});}
    const t=getComputedStyle(bubble,'::after'),tip=r.left+parseFloat(t.left)+parseFloat(t.width)/2;
    if(t.content==='none'||tip<a.left||tip>a.right+1)failures.push({text,issue:'tail'});
    checked++;
   }
   bubble.textContent='';
  }
  return {checked,failures};
 });
 assert.deepEqual(chatFit.failures,[],`${name} chat layout`);assert.equal(chatFit.checked,288);
 const rect=await frame.locator('#clues').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y1:r.bottom-25,y2:r.y+25};});
 const convert=async(x,y)=>{if(frame===page.mainFrame())return {x,y};return page.locator('iframe').evaluate((el,{x,y})=>{const r=el.getBoundingClientRect();return innerHeight>innerWidth?{x:r.left+y,y:r.bottom-x}:{x:r.left+x,y:r.top+y};},{x,y});};
 const start=await convert(rect.x,rect.y1),end=await convert(rect.x,rect.y2);
 if(name==='desktop'){await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();}
 else{const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);await cdp.detach();}
 const dragged=await frame.locator('#clues').evaluate(e=>e.scrollTop);assert.ok(dragged>70,`${name}: drag did not scroll (${dragged})`);
 await frame.locator('#clues').evaluate(e=>{e.scrollTop=120;window.__clueNode=e.firstElementChild;});
 // A normal render caused by warehouse selection must not recreate clue content or reset it.
 await frame.locator('#vault .vault-item').first().click();assert.equal(await frame.locator('#clues').evaluate(e=>e.firstElementChild===window.__clueNode&&Math.abs(e.scrollTop-120)<1),true);
 await frame.locator('#btnBid').click();await frame.locator('[data-digit="5"]').click();assert.equal(await frame.evaluate(()=>window.__audioStarts),0);await frame.locator('#bidDialog [data-close]').click();
 await frame.locator('#btnSound').click();await page.waitForTimeout(150);await frame.locator('#btnBid').click();const soundBefore=await frame.evaluate(()=>window.__audioStarts);await frame.locator('[data-edit="clear"]').click();await frame.locator('[data-digit="5"]').click();assert.ok(await frame.evaluate(()=>window.__audioStarts)>soundBefore);
 // Only presentation randomness is fixed; engine/economy RNG is untouched.
 await frame.evaluate(()=>{const original=AuctionPresentation;window.AuctionPresentation={...original,create:(before,random,now)=>original.create(before,()=>.1,now)};});
 await frame.locator('[data-digit="8"]').click();await frame.locator('[data-digit="5"]').click();await frame.locator('#bidConfirm').click();
 await frame.waitForFunction(()=>document.querySelector('.npc-bubble.speaking'));
 assert.equal(await frame.locator('.npc-bubble.speaking').count(),1);await page.waitForTimeout(240);const bubbleFit=await frame.locator('.npc-bubble.speaking').evaluate(e=>{const bubble=e.getBoundingClientRect(),card=e.parentElement,avatar=card.querySelector('.bidder-avatar').getBoundingClientRect(),prev=card.previousElementSibling.getBoundingClientRect(),tail=getComputedStyle(e,'::after');return {top:bubble.top,bottom:bubble.bottom,avatarTop:avatar.top,previousBottom:prev.bottom,scroll:e.scrollWidth,client:e.clientWidth,tail:tail.content,tailSize:parseFloat(tail.width)};});assert.ok(bubbleFit.bottom<=bubbleFit.avatarTop,JSON.stringify(bubbleFit));assert.ok(bubbleFit.top>=bubbleFit.previousBottom-1,JSON.stringify(bubbleFit));assert.ok(bubbleFit.scroll<=bubbleFit.client+1);assert.ok(bubbleFit.tailSize>0&&bubbleFit.tail!=='none');assert.ok(await frame.locator('#btnBid').isDisabled());
 const persisted=await frame.evaluate(()=>JSON.parse(localStorage.getItem('airp_auction_state_v3')).roundPresentation);
 assert.ok(persisted.bubbles.length>=1);await page.screenshot({path:`${OUT}/${name}-thinking.png`});
 await frame.waitForFunction(()=>document.querySelectorAll('.bid-submitted').length>=2);
 const before=await frame.evaluate(()=>window.__audioStarts);
 await frame.evaluate(()=>document.querySelector('#vault .vault-item').click());
 assert.equal(await frame.evaluate(()=>window.__audioStarts),before,'repainting repeats NPC sound');
 assert.equal(await frame.locator('#clues').evaluate(e=>e.firstElementChild===window.__clueNode&&Math.abs(e.scrollTop-120)<1),true);
 await frame.locator('#btnSound').click();const muted=await frame.evaluate(()=>window.__audioStarts);await frame.waitForFunction(()=>document.body.dataset.roundStage==='result');assert.equal(await frame.evaluate(()=>window.__audioStarts),muted,'muted round plays audio');
 assert.ok(await frame.locator('.npc-bubble.speaking').count()<=1);await page.screenshot({path:`${OUT}/${name}-round.png`});
 await frame.waitForFunction(()=>document.body.dataset.roundStage==='idle');assert.equal(await frame.locator('.bid-submitted,.npc-bubble.speaking').count(),0,'old state leaked to next round');
 // Directly generate real result states for both winner/nonwinner geometry without spending a minute spectating.
 for(const won of [false,true]){
  await frame.evaluate(won=>{const s=JSON.parse(localStorage.getItem('airp_auction_state_v3')),e=AIRPAuctionEngine.createSession({seed:53,budget:40000,host:0,venue:'street'});e.beginLot();while(e.view().phase==='bidding')e.bid(won?40000:null);s.snapshot=e.export();s.roundPresentation=null;localStorage.setItem('airp_auction_state_v3',JSON.stringify(s));},won);await reload(frame);await frame.locator('#resultDialog[open]').waitFor();await page.waitForTimeout(800);
  const fit=await frame.locator('.result-copy').evaluate(e=>({client:e.clientHeight,scroll:e.scrollHeight}));assert.ok(fit.scroll<=fit.client+2,`${name} ${won}: result clipping ${JSON.stringify(fit)}`);
  await page.screenshot({path:`${OUT}/${name}-${won?'won':'lost'}-reveal.png`});await frame.locator('#btnSkipReveal').click();await frame.locator(won?'#btnSell':'#btnNext').waitFor({state:'visible'});
  const finalFit=await frame.locator('.result-copy').evaluate(e=>e.scrollHeight<=e.clientHeight+2);assert.equal(finalFit,true);
 }
 assert.deepEqual(errors,[]);report.push({name,dragged,soundTest:true,resultsFit:true,chatPhrasesChecked:chatFit.checked});await context.close();
}
 const result={passed:true,lines:lines.size,timingSamples:1200,firstRange:[Math.min(...firsts),Math.max(...firsts)],revealRange:[Math.min(...durations),Math.max(...durations)],devices:report};writeFileSync(`${OUT}/checks.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();server.close();}
