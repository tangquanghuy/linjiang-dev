import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import '../arcade/auction-data.js';
import '../arcade/auction-npc.js';
import '../arcade/auction-engine.js';
const D=AuctionData,I=AuctionIntel,B=AuctionNPC,E=AIRPAuctionEngine;
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const clone=x=>JSON.parse(JSON.stringify(x));
const old=vm.createContext({console});vm.runInContext(execFileSync('git',['show','HEAD:arcade/auction-data.js'],{encoding:'utf8'}),old);
const fixtures=[];
for(const venue of D.venues)for(let seed=1;seed<=120;seed++){
 const e=E.createSession({venue:venue.id,seed,host:0});e.beginLot();fixtures.push({venue,seed,raw:e.export().current.items});
}
function metrics(api,effect,raw,venue,seed){
 const intel=raw.map(api.empty),pub=raw.map(api.empty),facts=[],memory={},random=rng(seed^0x85ebca6b),publicRandom=rng(seed^0xc2b2ae35),out=[];
 for(let round=1;round<=5;round++){
  if([1,3].includes(round)){
   const r=api.apply(raw,pub,[],{kind:'shape',count:round===1?1:2},publicRandom,venue.scale);
   for(const slot of r?.slots||[]){const p=pub.find(i=>i.slot===slot);Object.assign(intel.find(i=>i.slot===slot),{x:p.x,y:p.y,w:p.w,h:p.h});}
  }
  if(effect)api.skill(effect,round,raw,intel,facts,memory,random,venue.scale);
  const {low,high}=api.bounds(intel,facts,venue.scale),truth=raw.reduce((n,i)=>n+i.base*venue.scale,0);
  assert.ok(low<=truth&&high>=truth,`${effect} bounds exclude truth / ${venue.id}:${seed}:R${round}`);
  out.push({range:high-low,qualities:intel.filter(i=>i.quality!=null).length,identified:intel.filter(i=>i.identified!=null).length,shapes:intel.filter(i=>i.w!=null).length});
  if(api===I&&round===1&&effect){assert.ok(intel.filter(i=>i.quality!=null).length<=1);assert.ok(facts.every(f=>f.scope?.length<=2),'no full-box opening aggregate');}
 }
 return out;
}
const rows=D.hosts.map(h=>({host:h.name,effect:h.effect,rounds:[1,2,3,4,5].map(round=>({round,rangeReduction:0,knownQualities:0,identified:0,shapes:0})),oldOpeningRangeReduction:0}));
for(const {venue,seed,raw}of fixtures){
 const base=metrics(I,null,raw,venue,seed);
 for(const row of rows){
  const now=metrics(I,row.effect,raw,venue,seed),before=metrics(old.AuctionIntel,row.effect,raw,venue,seed);
  now.forEach((m,r)=>{const a=row.rounds[r];a.rangeReduction+=1-m.range/base[r].range;a.knownQualities+=m.qualities;a.identified+=m.identified;a.shapes+=m.shapes;});
  row.oldOpeningRangeReduction+=1-before[0].range/base[0].range;
 }
}
for(const row of rows){for(const r of row.rounds)for(const key of ['rangeReduction','knownQualities','identified','shapes'])r[key]=+(r[key]/fixtures.length).toFixed(4);row.oldOpeningRangeReduction=+(row.oldOpeningRangeReduction/fixtures.length).toFixed(4);}
// Counterfactual: hidden non-sample quality must not change opening observations.
for(const effect of ['common','rare-count','analyst','apex','track','category-wave'])for(let seed=1;seed<=40;seed++){
 const raw=fixtures[seed].raw,observe=items=>{const intel=items.map(I.empty),facts=[],memory={};I.skill(effect,1,items,intel,facts,memory,rng(seed),1);return {intel,facts,memory};};
 const a=observe(raw),sample=new Set(Object.values(a.memory).flat()),mutated=raw.map(i=>sample.has(i.slot)?i:{...i,quality:i.quality===4?0:4,base:i.quality===4?50:12360});
 assert.deepEqual(observe(mutated),a,`${effect} selects by hidden quality`);
}
// All statistical instruments share three fixed slots, including repeated use after restore.
for(let seed=1;seed<=50;seed++){
 const raw=fixtures[seed].raw,intel=raw.map(I.empty),facts=[],random=rng(seed),truth=raw.reduce((n,i)=>n+i.base,0);
 for(const tool of D.tools.filter(t=>t.effect.sampleSize)){
  I.apply(raw,intel,facts,tool.effect,random,1);assert.equal(facts.at(-1).scope.length,3);assert.deepEqual(facts.at(-1).scope,facts[0].scope);
  const b=I.bounds(intel,facts);assert.ok(b.low<=truth&&truth<=b.high,tool.id);
 }
 const changed=raw.map(i=>facts[0].scope.includes(i.slot)?i:{...i,quality:4,base:12360});
 const replay=[],rr=rng(seed);for(const tool of D.tools.filter(t=>t.effect.sampleSize))I.apply(changed,changed.map(I.empty),replay,tool.effect,rr,1);
 assert.deepEqual(replay,facts,'sample statistics depend on outside items');
}
// One-round lock failure must be a pure no-op, before any inventory or RNG mutation.
for(const tool of D.tools.filter(t=>t.minRound>1)){
 const e=E.createSession({seed:41,stock:{[tool.id]:1},loadout:[tool.id]});e.beginLot();
 for(let round=1;round<tool.minRound;round++){
  const saved=e.export();saved.current.round=round;const g=E.restore(saved),before=g.export();
  assert.throws(()=>g.useTool(tool.id),new RegExp(`第${tool.minRound}轮`));assert.deepEqual(g.export(),before);
  const bot=clone(saved.bots[0]);bot.loadout=[tool.id];bot.stock={[tool.id]:1};bot.lot.toolRound=0;bot.lot.usedTools=[];bot.lot.failedTools=[];
  const ctx={venue:D.venues[0],items:saved.current.items.map(I.empty),facts:[],round,history:[],seat:1,active:[true,true,true,true]};
  assert.equal(B.planTool(bot,ctx),null,`NPC used ${tool.id} early`);
 }
}
// Supreme scans unknown quality, not top rarity or merely unknown identity.
for(let seed=1;seed<=40;seed++){
 const raw=fixtures[seed].raw,run=items=>{const intel=items.map(I.empty);intel[0].quality=items[0].quality;const result=I.apply(items,intel,[],D.tools.find(t=>t.id==='supreme').effect,rng(seed));return result.slots;};
 const picked=run(raw);assert.equal(picked.length,3);assert.ok(!picked.includes(0));assert.deepEqual(run(raw.map(i=>({...i,quality:4-i.quality}))),picked);
}
// NPC local aggregate estimates must equal the same sample plus unchanged outside prior.
{
 const venue=D.venues[0],raw=fixtures[0].raw,items=raw.map(I.empty),e=E.createSession({seed:19});e.beginLot();const bot=e.export().bots[0];
 const sample=[0,1],facts=[{stat:'total',filter:{},scope:sample,value:500}];
 const a=B.assess(bot,{venue,items,facts}),outside=B.assess(bot,{venue,items:items.filter(i=>!sample.includes(i.slot)),facts:[]});
 assert.ok(Math.abs(a.objectiveMean-(500+outside.objectiveMean))<1e-6,'NPC treats sample as whole-box total');
}
// Price checks for effects that are equivalent or strictly less informative.
const tool=id=>D.tools.find(t=>t.id===id);
assert.ok(tool('largest-value').cost<tool('largest-identify').cost);
assert.ok(tool('largest-value').minRound>=tool('largest-identify').minRound);
assert.equal(tool('total-4').cost,tool('count-4').cost,'same-value legendary count and total must cost the same');
for(let q=1;q<=4;q++)assert.ok(tool('mean-'+q).cost<tool('count-'+q).cost,'mean gives no item count');
for(const t of D.tools){assert.ok(!['top-quality','pristine-top'].includes(t.effect.select));if(t.effect.filter?.quality!=null||t.effect.filter?.minQuality!=null)assert.equal(t.effect.sampleSize,3);}
const emptyCategory=fixtures[0].raw.map(i=>({...i,category:'absent'}));
const emptyFacts=[];assert.equal(I.apply(emptyCategory,emptyCategory.map(I.empty),emptyFacts,tool('category-signal').effect,rng(1)),null);assert.equal(emptyFacts.length,0);
const report={passed:true,baselineCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),warehouses:fixtures.length,venues:3,hosts:11,instruments:D.tools.length,metric:'Mean reduction of feasible total-value interval against public-only intel on identical warehouses; not win rate, posterior variance, or ROI.',checks:['all skill timelines retain true value','no opening global quality aggregates','sample selection independent of outside quality','shared fixed instrument samples','all delayed tools locked for both player and NPC','locked use leaves inventory and RNG unchanged','supreme selects missing intel, not hidden rarity','NPC local total leaves outside expectation unchanged'],hosts:rows};
mkdirSync('artifacts/auction-balance',{recursive:true});writeFileSync('artifacts/auction-balance/report.json',JSON.stringify(report,null,2));
console.table(rows.map(h=>({host:h.host,oldR1:h.oldOpeningRangeReduction,R1:h.rounds[0].rangeReduction,R3:h.rounds[2].rangeReduction,R5:h.rounds[4].rangeReduction,q5:h.rounds[4].knownQualities})));
console.log('PASS',fixtures.length,'warehouses, 11 skill timelines, 43 instruments');
