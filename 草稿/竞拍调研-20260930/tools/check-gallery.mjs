import { chromium } from 'playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
const out=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(out,'../..');
const assets=JSON.parse(readFileSync(resolve(out,'assets.json'),'utf8'));
const lines=[],errors=[];
const browser=await chromium.launch();
try{
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(resolve(out,'gallery.html')).href);
  for(const [group,count] of [['external',20],['nte',14],['bidking',6],['project',25],['all',45]]){
   await page.locator(`[data-group="${group}"]`).click();const actual=await page.locator('.card').count();
   if(actual!==count)throw Error(`${name} ${group}: ${actual} != ${count}`);
  }
  await page.evaluate(async()=>{
   for(const img of document.querySelectorAll('.preview img')){img.loading='eager';await img.decode();}
  });
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  if(overflow>1)throw Error('Horizontal overflow: '+overflow);
  await page.locator('.preview').first().click();if(!await page.locator('#viewer').isVisible())throw Error('Viewer did not open');
  await page.locator('#next').click();await page.locator('#full').evaluate(img=>img.decode());
  await page.keyboard.press('Escape');if(await page.locator('#viewer').isVisible())throw Error('Escape did not close');
  await page.locator('[data-group="external"]').click();await page.evaluate(()=>scrollTo(0,0));
  mkdirSync(resolve(root,'artifacts/auction-research'),{recursive:true});
  await page.screenshot({path:resolve(root,`artifacts/auction-research/gallery-${name}.png`),fullPage:false});
  lines.push(`${name}: filters 20/14/6/25/45 OK; all 45 images decoded; lightbox OK; overflow ${overflow}px`);
  await page.close();
 }
 for(const r of assets)if(r.status!=='downloaded'||!existsSync(resolve(out,r.file)))throw Error('Missing asset '+r.id);
 if(errors.length)throw Error(errors.join('\n'));
 lines.push('No browser page errors. All 45 original image files exist.');
}catch(e){lines.push('FAILED: '+e.message);process.exitCode=1}finally{await browser.close()}
writeFileSync(resolve(out,'gallery-check.log'),lines.join('\n')+'\n');console.log(lines.join('\n'));
