// Reuse the existing smoke flow without editing production/test files.
// Added only: settled-animation screenshots, research output path, saved run log.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const out=resolve(here,'..');
let text=readFileSync(resolve(root,'scripts/check-auction.mjs'),'utf8');
text=text.replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');",`const ROOT = ${JSON.stringify(root)};`);
text=text.replace("const OUT = join(ROOT, 'artifacts', 'auction');",`const OUT = ${JSON.stringify(resolve(out,'images/project'))};`);
text=text.replaceAll('await page.screenshot(', 'await page.waitForTimeout(650); await page.screenshot(');
const flow=resolve(here,'capture-flow.generated.mjs');
writeFileSync(flow,text);
const run=spawnSync(process.execPath,[flow,'--shots'],{cwd:root,encoding:'utf8'});
unlinkSync(flow);
writeFileSync(resolve(out,'project-smoke.log'),`Command: node tools/capture-project.mjs\nUnderlying flow: scripts/check-auction.mjs --shots\nResearch change: 650ms wait before each screenshot\nExit code: ${run.status}\n\n${run.stdout||''}${run.stderr||''}`);
console.log(run.stdout);if(run.stderr)console.error(run.stderr);
process.exitCode=run.status??1;
