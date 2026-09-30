import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('.');
const server=createServer((req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!path.startsWith(root+sep)||!statSync(path).isFile())throw Error('not found');
  const bytes=readFileSync(path),range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.webp':'image/webp'})[extname(path)]||'application/octet-stream');
  res.setHeader('Accept-Ranges','bytes');
  if(range){
   const start=Number(range[1]),end=Math.min(Number(range[2]||bytes.length-1),bytes.length-1);
   res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});res.end(bytes.subarray(start,end+1));
  }else{res.setHeader('Content-Length',bytes.length);res.end(bytes);}
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
try{
 for(const [name,width,height] of [['desktop',1280,720],['portrait-phone',390,844]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop'});
  await context.addInitScript(()=>{
   window.__music=[];window.__rejectMusic=false;
   const NativeAudio=window.Audio;
   window.Audio=class extends NativeAudio{
    constructor(...args){super(...args);window.__music.push(this);}
    play(){return window.__rejectMusic?Promise.reject(new DOMException('gesture required','NotAllowedError')):super.play();}
   };
   window.__audioErrors=[];addEventListener('unhandledrejection',e=>window.__audioErrors.push(String(e.reason)));
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/arcade/auction.html`);
  if(name!=='desktop')await page.waitForSelector('iframe');
  const frame=page.frames().find(f=>f.parentFrame())||page.mainFrame();
  await frame.waitForFunction(()=>window.AIRPAuction);
  assert.equal(await frame.evaluate(()=>__music.length),0,'silent by default');
  // A blocked first play must be retryable without creating another player.
  await frame.evaluate(()=>{__rejectMusic=true;});await frame.locator('#btnSound').click();
  await frame.waitForTimeout(100);
  assert.equal(await frame.evaluate(()=>__music.length),1);
  await frame.evaluate(()=>{__rejectMusic=false;});
  await frame.locator('#btnSound').focus();await page.keyboard.press('Shift');
  await frame.waitForFunction(()=>__music[0]?.currentTime>.1);
  assert.equal(await frame.evaluate(()=>__music[0].loop),false);
  assert.equal(await frame.evaluate(()=>__music[0].volume),1,'same BGM playback volume as other arcade games');
  assert.match(await frame.evaluate(()=>__music[0].src),/groove-01.mp3$/);
  await frame.evaluate(()=>{__music[0].currentTime=5;for(let i=0;i<30;i++)AuctionAudio.setEnabled(true);});
  assert.ok(await frame.evaluate(()=>__music.length===1&&__music[0].currentTime>=5));
  // Real decoded MP3 end events, both directions; server supports seeking.
  for(const suffix of ['02','01']){
   await frame.waitForFunction(()=>Number.isFinite(__music[0].duration)&&__music[0].duration>1);
   await frame.evaluate(()=>{__music[0].currentTime=__music[0].duration-.2;});
   await frame.waitForFunction(s=>__music[0].src.endsWith(`groove-${s}.mp3`)&&!__music[0].paused,suffix,{timeout:15000});
  }
  await frame.locator('#btnSound').click();
  assert.equal(await frame.evaluate(()=>__music[0].paused),true);
  const paused=await frame.evaluate(()=>__music[0].currentTime);await frame.waitForTimeout(150);
  assert.equal(await frame.evaluate(()=>__music[0].currentTime),paused);
  await frame.locator('#btnSound').click();await frame.waitForFunction(()=>!__music[0].paused);
  // Simulated visibility transitions (headless tabs don't consistently background).
  await frame.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await frame.evaluate(()=>__music[0].paused),true);
  await frame.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await frame.waitForFunction(()=>!__music[0].paused);
  await frame.evaluate(()=>dispatchEvent(new Event('pagehide')));
  assert.equal(await frame.evaluate(()=>__music[0].paused),true);
  await frame.evaluate(()=>dispatchEvent(new Event('pageshow')));
  await frame.waitForFunction(()=>!__music[0].paused);
  assert.equal(await frame.evaluate(()=>__music.length),1);
  if(name!=='desktop')assert.equal(await page.evaluate(()=>__music.length),0,'mobile shell must remain silent');
  assert.deepEqual(await frame.evaluate(()=>__audioErrors),[]);assert.deepEqual(errors,[]);
  console.log(`${name}: real MP3 01 → 02 → 01; autoplay retry, mute, resume, single player passed`);
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
