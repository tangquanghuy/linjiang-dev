/* iOS WKWebView-oriented fishing renderer regression.
 * Chromium is the control; Playwright WebKit catches the expensive iOS
 * compositing path (rotated lobby iframe + animated 960x540 canvas).
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg' };
const server = createServer((req,res)=>{const raw=decodeURIComponent((req.url||'/').split('?')[0]);const file=join(ROOT,normalize(raw).replace(/^[/\\]+/,''));try{if(!statSync(file).isFile())throw new Error();res.writeHead(200,{'content-type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});createReadStream(file).pipe(res)}catch{res.writeHead(404).end('not found')}});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 TauriTavern/2.2.0';
const results={};
try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:ua});
    await page.goto(`${base}/arcade/index.html#fishing`,{waitUntil:'load'});
    await page.waitForTimeout(1200);
    const frame=page.frames().find((item)=>/\/arcade\/fishing\.html(?:[?#]|$)/.test(item.url()));
    await frame.evaluate(()=>{window.__frameDeltas=[];let previous=performance.now();function sample(time){window.__frameDeltas.push(time-previous);previous=time;requestAnimationFrame(sample)}requestAnimationFrame(sample);const game=window.AIRPFishingGame;game.setBalance(100000,{silent:true});const id=game.spawn('whale');game.lockTarget(id);document.getElementById('autoButton').click()});
    await page.waitForTimeout(5200);
    results[name]=await frame.evaluate(()=>{const values=window.__frameDeltas.slice(10),seconds=values.reduce((sum,value)=>sum+value,0)/1000,sorted=[...values].sort((a,b)=>a-b),screen=document.querySelector('.screen-bezel').getBoundingClientRect(),deck=document.querySelector('.control-deck').getBoundingClientRect(),fire=document.querySelector('.fire-button').getBoundingClientRect();return{fps:values.length/seconds,p50:sorted[Math.floor(sorted.length*.5)]||0,p95:sorted[Math.floor(sorted.length*.95)]||0,iosClass:document.documentElement.classList.contains('is-ios-webkit'),canvas:[document.getElementById('gameCanvas').width,document.getElementById('gameCanvas').height],viewport:[innerWidth,innerHeight],screen:[screen.left,screen.top,screen.right,screen.bottom],deckBottom:deck.bottom,fireBottom:fire.bottom}});
    await browser.close();
  }
  console.log(JSON.stringify(results,null,2));
  if(!results.chromium.iosClass||!results.webkit.iosClass)throw new Error('iOS compositor class missing');
  if(results.chromium.canvas.join('x')!=='960x540'||results.webkit.canvas.join('x')!=='960x540')throw new Error('canvas resolution changed');
  for(const [name,result] of Object.entries(results)){
    if(result.screen[3]>result.viewport[1]+1||result.deckBottom>result.viewport[1]+1||result.fireBottom>result.viewport[1]+1)throw new Error(`${name} fishing controls clipped: ${JSON.stringify(result)}`);
  }
  if(results.chromium.fps<50)throw new Error(`Chromium control ${results.chromium.fps.toFixed(1)} FPS`);
  if(results.webkit.fps<18)throw new Error(`WebKit regression ${results.webkit.fps.toFixed(1)} FPS`);
  console.log('PASS iOS WebKit fishing compositor regression.');
}finally{await new Promise((resolve)=>server.close(resolve))}
