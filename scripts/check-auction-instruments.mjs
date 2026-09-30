import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({console,Date,Math});for(const f of ['auction-data.js','auction-npc.js','auction-engine.js'])vm.runInContext(readFileSync('arcade/'+f,'utf8'),c);
const D=c.AuctionData,I=c.AuctionIntel,E=c.AIRPAuctionEngine,clone=x=>JSON.parse(JSON.stringify(x));
assert.equal(D.tools.length,43);assert.equal(D.toolTiers.length,6);assert.equal(new Set(D.hosts.map(h=>h.effect)).size,11);
const raw=[0,1,2,3,4,1,2,3].map((q,slot)=>({...D.catalog.find(i=>i.quality===q&&i.series===D.series[slot].id),slot,x:slot%6,y:Math.floor(slot/6)}));
const signatures=[];
for(const host of D.hosts){const intel=raw.map(I.empty),facts=[],memory={},rounds=[];
 for(let r=1;r<=5;r++){I.skill(host.effect,r,raw,intel,facts,memory,()=>.41,1);rounds.push(clone({intel,facts}));const {low,high}=I.bounds(intel,facts);assert.ok(low<=raw.reduce((n,i)=>n+i.base,0));assert.ok(high>=raw.reduce((n,i)=>n+i.base,0));}
 signatures.push(JSON.stringify(rounds));
 if(host.effect==='track'){const tracked=memory.tracked;assert.equal(tracked.length,2);assert.equal(rounds[1].intel.filter(i=>i.identified!=null).length,1);assert.ok(rounds[2].intel.filter(i=>i.identified!=null).every(i=>tracked.includes(i.slot)));}
 if(host.effect==='finale'){assert.equal(rounds[3].intel.filter(i=>i.quality!=null).length,1);assert.equal(rounds[4].intel.filter(i=>i.quality!=null).length,4);}
 if(host.effect==='rare-count'){assert.equal(facts[0].scope.length,2);assert.equal(facts[0].value,raw.filter(i=>facts[0].scope.includes(i.slot)&&i.quality>=3).length);assert.equal(rounds[0].intel.filter(i=>i.quality!=null).length,0);assert.equal(intel.filter(i=>i.quality!=null).length,2);}
 if(host.effect==='large-track'){assert.equal(rounds[1].intel.filter(i=>i.identified!=null).length,0);assert.equal(rounds[3].intel.filter(i=>i.identified!=null).length,1);}
}
assert.equal(new Set(signatures).size,11,'all skill timelines genuinely distinct');
// The late-game specialist now has a small useful opening scan.
let finaleSeen=false;
for(let seed=1;seed<=30;seed++){
 const probe=E.createSession({seed,host:0});probe.beginLot();
 for(const p of probe.view().opponents)if(D.hosts[p.host].effect==='finale'){finaleSeen=true;assert.equal(p.skillUsed,true);}
}
assert.ok(finaleSeen,'late-game specialist covered');
const checked=[];
for(const t of D.tools){const intel=raw.map(I.empty),facts=[];const result=I.apply(raw,intel,facts,t.effect,()=>.41,1);assert.ok(result,t.id);const {low,high}=I.bounds(intel,facts);const truth=raw.reduce((n,i)=>n+i.base,0);assert.ok(low<=truth&&high>=truth,t.id+' excludes truth');
 for(const i of intel){if(i.w==null)assert.equal(i.x,null);if(i.identified!=null)assert.equal(i.identified,raw[i.slot].id);}
 if(t.effect.kind==='stat')assert.equal(I.apply(raw,intel,facts,t.effect,()=>.41,1),null,'duplicate aggregate should be free no-op');checked.push(t.id);
}
// Tool scans use their own RNG: neither next warehouse nor next public reveals change.
for(let seed=1;seed<=100;seed++){
 const g=E.createSession({seed,host:5,budget:40000,stock:{'identify-0':2,'quality-0':2},loadout:['identify-0','quality-0']});g.beginLot();for(const p of g.view().opponents)assert.equal(p.skillUsed,g.view().npcEvents.some(e=>e.host===p.host&&e.kind==='skill'),'NPC trigger label must follow an actual skill effect');const a=E.restore(g.export()),b=E.restore(g.export());a.useTool('identify-0');assert.equal(a.view().stock['identify-0'],1);assert.equal(a.view().instrumentCost,30);assert.throws(()=>a.useTool('quality-0'));
 const av=a.view();for(const i of av.items)if(i.w==null){assert.equal(i.x,null);assert.equal(i.y,null);assert.ok(!('image' in i)&&!('value' in i));}
 a.bid(350);b.bid(350);assert.deepEqual(clone(a.export().bots),clone(b.export().bots));assert.deepEqual(clone(a.export().current.publicIntel),clone(b.export().current.publicIntel));
 const restored=E.restore(a.export());assert.equal(restored.view().stock['identify-0'],1);if(a.view().phase==='bidding')assert.throws(()=>restored.useTool('identify-0'));
 while(a.view().phase==='bidding')a.bid(null);a.closeLot(a.view().result.won?'sell':'none');a.beginLot();assert.equal(a.view().stock['identify-0'],1,'new box grants stock');
}
const g=E.createSession({seed:9,host:5,loadout:['identify-0']});g.beginLot();assert.throws(()=>g.useTool('identify-0'),'empty inventory');g.addStock('identify-0');g.useTool('identify-0');assert.equal(g.view().stock['identify-0'],0);assert.equal(g.view().bank,1000,'consumption must not debit prepaid cost twice');
// Failed targeted scan restores RNG and does not consume stock.
const save=g.export();save.stock.supreme=1;save.loadout=['supreme'];save.current.toolRound=0;save.current.round=3;save.current.playerIntel=save.current.items.map(i=>({...I.empty(i),x:i.x,y:i.y,w:i.w,h:i.h,quality:i.quality}));const noop=E.restore(save);assert.throws(()=>noop.useTool('supreme'));assert.equal(noop.view().stock.supreme,1);assert.equal(noop.export().intelRng,save.intelRng);
const report={passed:true,tools:checked.length,tiers:6,distinctSkillTimelines:11,seeds:100,checks:['all instrument effects and truthful bounds','scheduled follow-up reveals','NPC trigger label follows actual effect','private shape/category/identity separation','paid-stock depletion and cross-box persistence','one instrument per round and per-type per box','private RNG separation','no-op rollback','no double cash debit']};mkdirSync('artifacts/auction-v32',{recursive:true});writeFileSync('artifacts/auction-v32/instrument-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
