import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const out=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(out,'../..');
new Function(readFileSync(resolve(root,'arcade/auction-engine.js'),'utf8'))();
const E=globalThis.AIRPAuctionEngine;
const report={engineVersion:E.version,scope:'Read-only deterministic diagnostics, not a balancing benchmark',estimateCounterexample:null,passCounterexample:null,sameRoundBidResponse:null};
for(let seed=1;seed<=10000 && !report.estimateCounterexample;seed++){
 const s=E.createSession({seed,budget:1e9,lots:1,kits:['scope-s','scope-m']});s.beginLot();
 for(let r=0;r<5 && s.view().phase==='bidding';r++){
  const v=s.view(),truth=s._truth().lot.trueValue;
  if(v.estimate>truth){report.estimateCounterexample={seed,round:v.round,estimate:v.estimate,wholeLotTrueValue:truth,kits:['scope-s','scope-m']};break;}
  s.bid(Math.max(v.floorPrice,v.playerBest+1));
 }
}
const s=E.createSession({seed:1,budget:1e9,lots:1,kits:[]});s.beginLot();s.bid(1e7);
const pass=s.bid(null);report.passCounterexample={seed:1,firstBid:1e7,passAccepted:pass.ok,phase:s.view().phase,playerActive:s.view().playerActive,won:s.view().won,hammerPrice:s.view().hammerPrice};
function firstRound(amount){const s=E.createSession({seed:1,budget:1e9,lots:1,kits:[]});s.beginLot();const v=s.view();const b=amount??v.floorPrice;const result=s.bid(b);return {playerBid:b,rivals:result.view.rivals.map(r=>({name:r.name,bid:r.bids[0],active:r.active}))};}
report.sameRoundBidResponse={seed:1,low:firstRound(),high:firstRound(1e7)};
writeFileSync(resolve(out,'engine-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
