/* End-to-end resource audit for standalone overlay pages.
   Runs a local build, serves dist/, then checks that second-hop resources really
   decode after HTML load (shop JSON -> item icons, arcade lobby -> game assets,
   city map -> plate images, CG shell -> external covers when --net is supplied). */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const WANT_NET = process.argv.includes('--net');
const ROOT = resolve('dist');
const MIME = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.mp3':'audio/mpeg','.woff2':'font/woff2',
};
let bad=0;
const check=(ok,label,detail='')=>{console.log(`  ${ok?'ok  ':'FAIL'} ${label}${detail?`  ${detail}`:''}`);if(!ok)bad++};

execFileSync(process.execPath,[join('node_modules','vite','bin','vite.js'),'build'],{
  cwd:resolve('.'),stdio:'pipe',env:{...process.env,ASSET_CDN:'',ASSET_CDN_REF:''},
});
const server=createServer((req,res)=>{
  const raw=decodeURIComponent((req.url||'/').split('?')[0]);
  let file=join(ROOT,normalize(raw).replace(/^[/\\]+/,''));
  if(!file.startsWith(ROOT)){res.writeHead(403).end();return}
  try{if(statSync(file).isDirectory())file=join(file,'index.html')}
  catch{res.writeHead(404).end('not found');return}
  res.writeHead(200,{'content-type':MIME[extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
  createReadStream(file).pipe(res);
});
await new Promise((r)=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();

async function open(path,{wait=2500,allowExternal=false}={}){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const failed=[];const errors=[];
  page.on('response',(r)=>{if(r.status()>=400&&(allowExternal||r.url().startsWith(base)))failed.push(`${r.status()} ${r.url()}`)});
  page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(wait);
  return{page,failed,errors};
}

console.log('=== shop: JSON -> product images -> detail image ===');
{
  const {page,failed,errors}=await open('/shop/index.html',{wait:3500});
  const cards=await page.evaluate(()=>[...document.querySelectorAll('.card img[data-product-icon]')].map((img)=>({
    src:img.src,w:img.naturalWidth,h:img.naturalHeight,complete:img.complete,hidden:img.hidden,
  })));
  check(cards.length===8,'first catalog page renders eight product icons',String(cards.length));
  check(cards.every((x)=>x.complete&&x.w>0&&x.h>0&&!x.hidden),'all catalog product icons decode',JSON.stringify(cards.filter(x=>!x.w).slice(0,3)));
  await page.locator('[data-open]').first().click();
  await page.waitForTimeout(300);
  const detail=await page.evaluate(()=>{const i=document.querySelector('.detail-panel img[data-product-icon]');return i?{src:i.src,w:i.naturalWidth,h:i.naturalHeight,hidden:i.hidden}:null});
  check(!!detail&&detail.w>0&&detail.h>0&&!detail.hidden,'detail product icon decodes',JSON.stringify(detail));
  check(failed.length===0,'shop has no failed local requests',failed.slice(0,5).join(' | '));
  check(errors.length===0,'shop has no script errors',errors.slice(0,3).join(' | '));
  await page.close();
}

console.log('\n=== arcade: lobby -> every published game -> media ===');
{
  const {page,failed,errors}=await open('/arcade/index.html',{wait:1800});
  const tabs=await page.evaluate(()=>[...document.querySelectorAll('.tab')].map((b)=>b.id));
  check(tabs.length===4&&!tabs.includes('tab-auction'),'only four completed games are published',JSON.stringify(tabs));
  for(const id of ['shrine','scratch','slots','fishing']){
    await page.locator(`#tab-${id}`).click();
    await page.waitForFunction(()=>document.getElementById('loader')?.hidden===true,null,{timeout:15000});
    await page.waitForTimeout(900);
    const active=page.frames().find((f)=>new RegExp(`/arcade/${id}\\.html(?:[?#]|$)`).test(f.url()));
    /* The original tracks intentionally start only after a gesture. A tab click
       happened before the game iframe existed, so give the newly loaded document
       its own activation before auditing decode state. */
    if(active&&['scratch','slots','fishing'].includes(id)){
      if(id==='fishing'){
        const music=active.locator('#fishMusicToggle');
        if(await music.getAttribute('aria-pressed')==='true') await music.click();
        await music.click();
      }else{
        await active.locator('body').click({position:{x:20,y:20}});
      }
      await page.waitForTimeout(900);
    }
    const state=active?await active.evaluate(()=>({
      images:[...document.images].filter(i=>i.getAttribute('src')).map(i=>({src:i.src,w:i.naturalWidth,h:i.naturalHeight,complete:i.complete,hidden:i.hidden})),
      bgm:window.__airpBgmAudio?{src:window.__airpBgmAudio.currentSrc||window.__airpBgmAudio.src,readyState:window.__airpBgmAudio.readyState,error:window.__airpBgmAudio.error?.code||0}:null,
    })):null;
    check(!!active,`${id} inner page loaded`);
    check(!!state&&state.images.every(i=>i.complete&&(i.hidden||i.w>0)),`${id} referenced images decode`,JSON.stringify(state?.images.filter(i=>!i.hidden&&!i.w).slice(0,3)||[]));
    if(['scratch','slots','fishing'].includes(id))check(!!state?.bgm&&state.bgm.readyState>=2&&state.bgm.error===0,`${id} BGM decodes`,JSON.stringify(state?.bgm));
  }
  check(failed.length===0,'arcade has no failed local requests',failed.slice(0,8).join(' | '));
  check(errors.length===0,'arcade has no script errors',errors.slice(0,3).join(' | '));
  await page.close();
}

console.log('\n=== city map: all ten plate images ===');
{
  const {page,failed,errors}=await open('/city/plate_map.html',{wait:4500});
  const plates=await page.evaluate(()=>[...document.images].filter(i=>/\/city\/plate\/.+\.webp/.test(i.src)).map(i=>({src:i.src,w:i.naturalWidth,h:i.naturalHeight,complete:i.complete})));
  check(plates.length===10,'ten city plate images requested',String(plates.length));
  check(plates.every(i=>i.complete&&i.w>0&&i.h>0),'all city plate images decode',JSON.stringify(plates.filter(i=>!i.w).slice(0,3)));
  check(failed.length===0,'city map has no failed local requests',failed.slice(0,5).join(' | '));
  check(errors.length===0,'city map has no script errors',errors.slice(0,3).join(' | '));
  await page.close();
}

if(WANT_NET){
  console.log('\n=== CG: scripts/styles and external cover host ===');
  const {page,failed,errors}=await open('/cg/index.html',{wait:10000,allowExternal:true});
  const covers=await page.evaluate(()=>[...document.images].filter(i=>i.src.startsWith('https://anchor.bolt.qzz.io/')).map(i=>({src:i.src,w:i.naturalWidth,h:i.naturalHeight,complete:i.complete})));
  check(covers.length>=6,'CG cover URLs were created',String(covers.length));
  check(covers.every(i=>i.complete&&i.w>0&&i.h>0),'CG cover images decode from image host',JSON.stringify(covers.filter(i=>!i.w).slice(0,3)));
  check(failed.length===0,'CG has no 4xx/5xx resource requests',failed.slice(0,8).join(' | '));
  check(errors.length===0,'CG has no script errors',errors.slice(0,3).join(' | '));
  await page.close();
}else console.log('\n(CG external image-host check skipped; add --net)');

await browser.close();await new Promise((r)=>server.close(r));
console.log(bad?`\n>>> ${bad} failures`:'\n>>> all overlay resource chains pass');
process.exit(bad?1:0);
