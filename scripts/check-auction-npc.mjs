import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({console,Date,Math});
for(const f of ['auction-data.js','auction-npc.js','auction-engine.js'])vm.runInContext(readFileSync('arcade/'+f,'utf8'),context);
const E=context.AIRPAuctionEngine,D=context.AuctionData,B=context.AuctionNPC;
const json=x=>JSON.parse(JSON.stringify(x)),same=(a,b,msg)=>assert.deepEqual(json(a),json(b),msg);
// A low player bid may advance the round and trigger the next skill, while a high
// bid settles immediately. Compare full decision state except that post-round UI flag.
const decisionState=bots=>json(bots).map(b=>{delete b.lot.skillUsed;return b;});
const checks=[],types=new Set(),tools=new Set(),nodes=new Set(),hosts=new Set();let decisions=0,toolUses=0;
for(let seed=1;seed<=500;seed++){
 const game=E.createSession({seed,id:'npc-'+seed,budget:40000,host:seed%11,venue:D.venues[seed%3].id,loadout:['identify-0'],stock:{'identify-0':3}});game.beginLot();
 const initial=game.export(),rivals=game.view().rivals;
 assert.equal(new Set(rivals).size,3);assert.ok(!rivals.includes(seed%11));
 initial.bots.forEach((bot,index)=>{const intel=initial.current.npcIntel[index],effect=D.hosts[bot.host].effect;
  for(const i of intel){const truth=initial.current.items.find(t=>t.slot===i.slot);if(i.identified!=null)assert.equal(i.identified,truth.id);if(i.quality!=null)assert.equal(i.quality,truth.quality);if(i.category!=null)assert.equal(i.category,truth.category);}
 });

 const low=E.restore(initial),high=E.restore(initial),privateTool=E.restore(initial);
 low.bid(1);high.bid(40000);privateTool.useTool('identify-0');privateTool.bid(1);
 same(decisionState(low.export().bots),decisionState(high.export().bots),'current sealed bid leaks into decision');
 same(low.export().bots,privateTool.export().bots,'player private tool leaks into NPC');
 same(low.export().current.npcIntel,privateTool.export().current.npcIntel);
 for(let lot=1;lot<=1;lot++){
  same(game.view().rivals,rivals,'opponents change within session');
  const pub=game.view();assert.equal(pub.opponents.length,3);assert.ok(!('bots' in pub)&&!('npcIntel' in pub));
  for(const p of pub.opponents)for(const key of ['bank','inventory','traits','cap','estimate'])assert.ok(!(key in p));
  for(let r=0;r<6&&game.view().phase==='bidding';r++){
   const before=game.export(),restored=E.restore(before);game.bid(null);restored.bid(null);
   same(game.export().bots,restored.export().bots,'restore diverged');same(game.export().current.npcIntel,restored.export().current.npcIntel);
   const after=game.export();
   for(let i=0;i<3;i++){
    const bot=after.bots[i],prev=before.bots[i];types.add(bot.type);tools.add(bot.tool);hosts.add(bot.host);
    if(!before.current.active[i+1])same(bot,prev,'inactive NPC acted');
    const d=bot.lot.lastDecision;if(d){nodes.add(d.node);if(bot.lot.decisions.length>prev.lot.decisions.length)decisions++;assert.ok(d.path.length>=2);if(d.amount!==null){assert.ok(Number.isInteger(d.amount)&&d.amount>0);assert.ok(d.amount<=d.cap&&d.amount<=d.cashCap&&d.amount<=bot.bank);}}
    const events=after.current.npcEvents.filter(e=>e.host===bot.host);assert.ok(events.filter(e=>e.kind==='skill').length<=after.current.round);const uses=events.filter(e=>e.kind==='tool');assert.equal(new Set(uses.map(e=>e.round)).size,uses.length);assert.ok(uses.length<=3);assert.equal(new Set(bot.lot.usedTools).size,bot.lot.usedTools.length);assert.ok(Object.values(bot.stock).every(n=>n>=0));
    if(!prev.lot.toolUsed&&bot.lot.toolUsed)toolUses++;
    // NPC private information never updates the player's legacy known flags.
    for(let j=0;j<before.current.items.length;j++)assert.equal(after.current.items[j].known,before.current.items[j].known);
   }
  }
  assert.equal(game.view().phase,'result');const ledger=game.closeLot('none',undefined,{compensationLimit:7});assert.ok(ledger.compensation<=7);for(const bot of game.export().bots){assert.ok(bot.bank>=0);assert.equal(bot.memory.boxes,lot);assert.ok(bot.memory.compensationClaimed<=60);}
  assert.equal(game.beginLot(),null,'single admission must not start another warehouse');
 }
}
checks.push('500 seeded single-box sessions: fixed cast, exclusion, private knowledge, sealed independence, deterministic restore, budgets, skill/tool limits, settlement balance');
assert.equal(types.size,6);assert.ok(tools.size>=8);assert.equal(hosts.size,11);
// Fully identified preferred collection: missing earns a premium, duplicate does not.
const item=D.catalog[0],venue=D.venues[0];
const ctx={items:[{slot:0,w:item.w,h:item.h,quality:item.quality,category:item.category,identified:item.id}],venue,seat:1,active:[true,true,true,true],history:[],round:1,lotIndex:1,lots:1};
const bot=B.create(0,venue,()=>.5,'collector');B.beginLot(bot,()=>.5);bot.series=item.series;bot.inventory=[];bot.bank=100000;
const missing=B.decide(bot,ctx,()=>.5);bot.inventory=[item.id];const duplicate=B.decide(bot,ctx,()=>.5);
assert.ok(missing.premium>0&&duplicate.premium===0);assert.ok(missing.cap>duplicate.cap);
assert.equal(B.assess(bot,ctx).mean,Math.round(item.base*venue.scale));
const dealer=B.create(1,venue,()=>.5,'dealer');B.beginLot(dealer,()=>.5);dealer.bank=100000;
const hot={...ctx,round:2,history:[{round:1,bids:[100000,10,100000,100000]}]};assert.equal(B.decide(dealer,hot,()=>.5).node,'walk-away');
checks.push('collector missing vs duplicate premium; dealer exits inflated history; exact identification removes appraisal bias');

const probe=json(bot);B.beginLot(probe,()=>.5);
assert.equal(B.decide(probe,{...ctx,active:[true,false,true,true]},()=>.5).node,'inactive');
probe.bank=0;assert.equal(B.decide(probe,ctx,()=>.5).node,'no-cash');
probe.bank=1;assert.equal(B.decide(probe,ctx,()=>.5).node,'reserve-cash');
probe.bank=100000;assert.equal(B.decide(probe,{...ctx,active:[false,true,false,false]},()=>.5).node,'sole-bidder');
probe.lot.toolUsed=true;assert.equal(B.planTool(probe,ctx),null);
checks.push('inactive, zero cash, reserve cash, sole bidder and consumed-tool branches');

// Counterfactual true identity, same lawful information, no fresh reveals: identical bids.
const cf=E.createSession({seed:42,budget:40000});cf.beginLot();const a=cf.export();a.bots.forEach(b=>{b.lot.toolRound=a.current.round;b.loadout=[];});
a.current.npcIntel=a.current.npcIntel.map(slots=>slots.map(i=>({...i,quality:null,category:null,identified:null})));
const b=json(a);for(const i of b.current.items){const other=D.catalog.find(c=>c.w===i.w&&c.h===i.h&&c.id!==i.id);if(other)Object.assign(i,other);}
const ga=E.restore(a),gb=E.restore(b);ga.bid(1);gb.bid(1);same(decisionState(ga.export().bots),decisionState(gb.export().bots),'hidden truth leak');
checks.push('counterfactual hidden inventory produces identical decisions without a lawful reveal');
// NPC random consumption does not change the generated warehouse or unlock a free next box.
const world=E.createSession({seed:22,budget:40000});world.beginLot();const wa=world.export(),wb=json(wa);wb.npcRng=123;wb.bots.forEach(b=>b.type='gambler');
const x=E.restore(wa),y=E.restore(wb);for(const game of [x,y]){game.bid(40000);game.closeLot('sell',40000);assert.equal(game.beginLot(),null);}
same(x.export().current.items,y.export().current.items,'NPC RNG changes warehouse');
checks.push('warehouse invariant under NPC random path; no free next warehouse');
// Existing 3.0 save migrates without changing its player observations or warehouse.
const legacy=json(wa);legacy.version='3.0.0';delete legacy.bots;delete legacy.npcRng;delete legacy.current.npcIntel;delete legacy.current.npcEvents;delete legacy.current.playerIntel;delete legacy.stock;delete legacy.loadout;
const migrated=E.restore(legacy);same(migrated.export().current.items,legacy.current.items);same(migrated.view().rivals,legacy.current.rivals);assert.equal(migrated.view().version,'3.2.0');assert.equal(Object.keys(migrated.view().stock).length,0);
checks.push('3.0 unfinished-save migration');
// Forced resolution isolates the payout formula from quote strategy.
for(const [price,trueValue,expected]of [[1500,1000,40],[1009,1000,0],[1010,1000,1],[900,1000,0]]){
 const s=json(wa);s.current.phase='result';s.current.result={won:false,winner:1,price,trueValue,rawCompensation:Math.floor(Math.max(0,price-trueValue)*.1),compensation:Math.min(40,Math.floor(Math.max(0,price-trueValue)*.1)),profit:0};s.bots[0].bank=10000;
 const e=E.restore(s),r=e.closeLot('none');assert.equal(r.compensation,expected);assert.equal(r.cashDelta,expected);assert.equal(e.view().bank,wa.bank+expected);assert.throws(()=>e.closeLot('none'));
 const limited=E.restore(s).closeLot('none',undefined,{compensationLimit:3});assert.equal(limited.compensation,Math.min(expected,3));
}
checks.push('compensation rounding, per-box / remaining caps, loser balance, duplicate settlement guard');
const report={passed:true,sessions:500,boxes:500,decisions,toolUses,types:[...types],tools:[...tools],hosts:hosts.size,nodes:[...nodes],checks};mkdirSync('artifacts/auction-v32',{recursive:true});writeFileSync('artifacts/auction-v32/npc-test.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
