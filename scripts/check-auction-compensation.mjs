import assert from 'node:assert/strict';
import '../arcade/auction-data.js';
import '../arcade/auction-npc.js';
import '../arcade/auction-engine.js';
const E=AIRPAuctionEngine,D=AuctionData,B=AuctionNPC,P=E.compensationPool;
const sum=a=>a.reduce((x,y)=>x+y,0);
assert.deepEqual(P([{bids:[50000,200000,150000,100000]}],1,100000,3000).payouts,[5000,0,10000,10000]);
assert.equal(P([{bids:[1,200000,150000,100000]}],1,100000,3000).payouts[0],0);
assert.equal(P([{bids:[null,200000,150000,100000]}],1,100000,3000).payouts[0],0);
assert.equal(P([{bids:[50000,200000,150000,100000]}],null,100000,3000).pool,0);
assert.equal(P([{bids:[50000,200000,150000,100000]}],1,0,3000).payouts[0],0);
assert.equal(P([{bids:[50000,180000,140000,100000]},{bids:[null,200000,null,null]}],1,100000,3000).payouts[0],5000,'exit preserves participation');
assert.equal(P([{bids:[1,180000,140000,100000]},{bids:[6000,200000,null,null]}],1,100000,3000).payouts[0],0,'late token bid does not qualify');
for(const venue of D.venues){const f=venue.entryFee;for(let n=0;n<300;n++){
 const stake=n*f/10|0,r=P([{bids:[stake,100000000,10000000,10000000]}],1,99999999,f);
 assert.ok(sum(r.payouts)<=r.pool);assert.equal(r.payouts[1],0);assert.ok(r.payouts.every(Number.isSafeInteger));assert.ok(r.payouts[0]<=Math.floor(stake*.1));
 if(stake<=f*2)assert.ok(r.payouts[0]<f,'minimum participation cannot cover the ticket');
}}
// Collection premium requires identified, genuinely missing targets.
{
 const venue=D.venues[0],item=D.catalog.find(i=>i.quality===3),bot=B.create(1,venue,()=>.5,'collector');B.beginLot(bot,()=>.5);bot.series=item.series;bot.inventory=[];bot.bank=1e7;
 const ctx={venue,policyVersion:2,entryFee:0,seat:1,round:1,lotIndex:1,lots:1,active:[true,true,true,true],history:[],items:[AuctionIntel.empty(item)],facts:[]};
 assert.equal(B.decide(bot,ctx,()=>.5).premium,0);ctx.items[0].identified=item.id;assert.ok(B.decide(bot,ctx,()=>.5).premium>0);bot.inventory=[item.id];assert.equal(B.decide(bot,ctx,()=>.5).premium,0);
}
let decisions=0,returned=0;
for(let seed=1;seed<=300;seed++){
 const venue=D.venues[seed%3],g=E.createSession({seed,venue:venue.id,entryFee:venue.entryFee,budget:1e8});g.beginLot();
 while(g.view().phase==='bidding'){g.bid(null);const s=g.export();for(const bot of s.bots){const d=bot.lot.lastDecision;if(d?.amount!=null){assert.ok(d.amount<=d.cap);assert.ok(d.amount<=d.cashCap);decisions++;}}}
 const v=g.view();assert.equal(v.result.compensation,0);const payout=sum(v.result.compensationDetails.payouts);assert.ok(payout<=v.result.overpayment*.3);g.closeLot('none');const profiles=g.export().npcProfiles;assert.equal(Object.keys(profiles).length,3);
 const restored=E.restore(g.export());assert.deepEqual(restored.export().npcProfiles,profiles);
 const next=E.createSession({seed,venue:venue.id,entryFee:venue.entryFee,budget:1e8,npcProfiles:profiles});next.beginLot();
 for(const bot of next.export().bots){const p=profiles[bot.host];assert.ok(p);assert.deepEqual(bot.inventory,p.inventory);for(const key of ["lossStreak","calibration","heat","boxes","valueProfit"])assert.equal(bot.memory[key],p.memory[key]);assert.equal(bot.type,p.type);returned++;}
 // Repeated expensive competition cannot make any personality bid beyond its own cap.
 for(const type of Object.keys(B.TYPES)){
  const bot=B.create(1,venue,()=>.5,type);B.beginLot(bot,()=>.5);
  const ctx={venue,policyVersion:2,entryFee:venue.entryFee,seat:1,round:2,lotIndex:1,lots:1,active:[true,true,true,true],history:[{bids:[1e12,100,null,null]}],items:g.export().current.items.map(i=>({...AuctionIntel.empty(i),identified:i.id})),facts:[]};
  const stopped=B.decide(bot,ctx,()=>.5);assert.ok(stopped.amount==null||stopped.amount<=stopped.cap);assert.ok(stopped.amount<1e12);
  ctx.history=[];ctx.round=1;bot.memory.lossStreak=0;const normal=B.decide(bot,ctx,()=>.5);bot.memory.lossStreak=5;const cooled=B.decide(bot,ctx,()=>.5);assert.ok(cooled.cap<=normal.cap);
 }
}
console.log(JSON.stringify({passed:true,seededSessions:300,decisions,returningHosts:returned,checks:['shared pool conservation','no winner or no sale payout','no-bid/token-bid rejection','exit preserves participation','minimum-stake refund below ticket','per-stake cap','history-aware qualification','all personalities stop at cap','loss cooling','persisted host memory and collection']},null,2));

