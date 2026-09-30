// Paid consumable / truthful-information audit. No hidden warehouse is read by a policy.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const N=Number(arg('--accounts',arg('--n',100))),H=Number(arg('--horizon',12)),label=arg('--label','paid-current');
const context=vm.createContext({console,Date,Math});const files=['auction-data.js','auction-npc.js','auction-engine.js'];
const strength=Number(arg('--npc-strength',1)),sourceHashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync('arcade/'+f)).digest('hex')]));
for(const f of files){let src=readFileSync('arcade/'+f,'utf8');if(f==='auction-npc.js')src=src.replace('const BID_STRENGTH=1;',`const BID_STRENGTH=${strength};`);vm.runInContext(src,context);}
const D=context.AuctionData,E=context.AIRPAuctionEngine,B=context.AuctionNPC;
const policies={none:[],cheap:['quality-0','shape-0','identify-0'],data:['count-3','total-3','mean-1'],premium:['quality-3','identify-3','supreme'],mixed:['quality-0','identify-0','count-3'],floor:['quality-0','shape-0','identify-0'],idle:[],reckless:['quality-3','identify-3','supreme']};
const round=x=>+x.toFixed(3),pct=(a,b)=>b?round(a/b*100):0,quantile=(xs,q)=>xs[Math.floor((xs.length-1)*q)];
function appraise(v){return B.assess({inventory:[],series:'',category:'',lot:{error:1},memory:{calibration:1}},{items:v.items,facts:v.facts,venue:D.venues.find(x=>x.id===v.venue)});}
const results=[];
for(const venue of D.venues)for(const [policy,loadout] of Object.entries(policies)){
 let boxes=0,wins=0,lossWins=0,netLossBoxes=0,spent=0,admissionPaid=0,consumed=0,purchases=0,comp=0,auctionProfit=0,halted=0,down20=0,npcPurchases=0,npcConsumed=0;const netDeltas=[],cashEnds=[],wealthEnds=[],toolDecisions={used:0,skipped:0};
 const initial=Math.max(1000,venue.min*2);
 for(let account=1;account<=N;account++){
  let bank=initial,stock={},game=null,claimed=0,npcProfiles={};
  for(let box=0;box<H;box++){
   if(bank<venue.min+venue.entryFee){halted++;break;}
   const fee=venue.entryFee;bank-=fee;admissionPaid+=fee;
   const seed=(account*1000003+box*104729+17)>>>0;
   game=E.createSession({seed,id:`audit-${account}-${box}`,budget:bank,entryFee:fee,venue:venue.id,host:account%11,stock,loadout,npcProfiles});
   const procurementBefore=game.export().bots?.reduce((s,b)=>s+(b.memory.toolPurchases||0),0)||0;
   game.setBudget(bank);game.beginLot();npcPurchases+=game.export().bots.reduce((s,b)=>s+(b.memory.toolPurchases||0),0)-procurementBefore;
   let bought=0,procurement=bank*(policy==='premium'||policy==='reckless'?.35:.12);
   for(const id of loadout){const t=D.tools.find(t=>t.id===id);if(!(game.view().stock[id]>0)&&t.cost<=procurement&&bank-t.cost>=venue.min){game.addStock(id);bank-=t.cost;procurement-=t.cost;bought+=t.cost;}}
   game.setBudget(bank);
   while(game.view().phase==='bidding'){
    let v=game.view();if(v.active[0]){
     const a=appraise(v),ranked=loadout.filter(id=>v.stock[id]>0&&!v.usedTools.includes(id)).map(id=>D.tools.find(t=>t.id===id)).sort((a,b)=>a.cost-b.cost);
     for(const t of ranked){const benefit=a.sd*Math.min(.65,(t.effect.count||2)/v.items.length);if(!['premium','reckless'].includes(policy)&&benefit<t.cost){toolDecisions.skipped++;continue;}
      try{game.useTool(t.id);toolDecisions.used++;break;}catch(e){if(!e.message.includes('没有新增'))throw e;}
     }
    }
    v=game.view();const a=appraise(v);
    const amount=bank<1||!v.active[0]||policy==='idle'?null:policy==='reckless'?bank:policy==='floor'?Math.floor(v.estimate*.96):Math.floor(a.mean*.93-a.sd*.1);
    game.bid(amount===null?null:Math.max(1,Math.min(bank,amount)));
   }
   const v=game.view(),r=v.result,rebate=r.won?0:(v.policyVersion>=2?r.compensation:Math.min(r.compensation,Math.max(0,D.economy.compensationDaily-claimed))),raw=r.won?r.trueValue-r.price:rebate,net=raw-v.instrumentCost-fee;
   claimed+=rebate;bank+=raw;auctionProfit+=raw;comp+=rebate;purchases+=bought;consumed+=v.instrumentCost;boxes++;netDeltas.push(net);if(net<0)netLossBoxes++;
   if(r.won){wins++;spent+=r.price;if(r.price>r.trueValue)lossWins++;}
   npcConsumed+=game.export().bots.reduce((s,b)=>s+b.lot.instrumentCost,0);
   assert.ok(bank>=0&&Number.isSafeInteger(bank));game.closeLot(r.won?'sell':'none',bank,{compensationLimit:rebate});stock={...game.view().stock};npcProfiles=game.export().npcProfiles;
  }
  const inventoryValue=Object.entries(stock).reduce((n,[id,count])=>n+D.tools.find(t=>t.id===id).cost*count,0);
  cashEnds.push(bank);wealthEnds.push(bank+inventoryValue);if(bank+inventoryValue<initial*.8)down20++;
 }
 assert.equal(Math.round(wealthEnds.reduce((a,b)=>a+b,0)-N*initial),auctionProfit-consumed-admissionPaid,'wealth accounting mismatch');
 cashEnds.sort((a,b)=>a-b);wealthEnds.sort((a,b)=>a-b);const mean=netDeltas.reduce((a,b)=>a+b,0)/boxes,variance=netDeltas.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,boxes-1);
 const row={venue:venue.id,policy,accounts:N,boxes,horizon:H,initial,winPct:pct(wins,boxes),valueLossAmongWinsPct:pct(lossWins,wins),netLossBoxPct:pct(netLossBoxes,boxes),netPerBox:round(mean),boxMean95CI:[round(mean-1.96*Math.sqrt(variance/boxes)),round(mean+1.96*Math.sqrt(variance/boxes))],netROI:spent+consumed+admissionPaid?pct(auctionProfit-consumed-admissionPaid,spent+consumed+admissionPaid):null,admissionPaid,admissionPerBox:round(admissionPaid/boxes),instrumentPurchasePerBox:round(purchases/boxes),instrumentConsumedPerBox:round(consumed/boxes),unusedInstrumentBookValue: purchases-consumed,rewardPerBox:round(comp/boxes),meanEndCash:round(cashEnds.reduce((a,b)=>a+b,0)/N),meanEndWealth:round(wealthEnds.reduce((a,b)=>a+b,0)/N),p05Wealth:quantile(wealthEnds,.05),medianWealth:quantile(wealthEnds,.5),p95Wealth:quantile(wealthEnds,.95),haltedPct:pct(halted,N),lost20Pct:pct(down20,N),npcPurchasePerBox:round(npcPurchases/boxes),npcConsumedPerBox:round(npcConsumed/boxes),toolDecisions};results.push(row);console.log(JSON.stringify(row));
}
const report={engine:E.VERSION,sourceHashes,parameters:{accounts:N,horizon:H,strength},definitions:{netROI:'(auction sale gain + compensation - consumed tool cost - admission fees)/(winning bids + consumed tool cost + admission fees)',cash:'Admission prepaid separately for every one-box auction. Purchases immediately debited, no second debit on consumption; unused stock retained at purchase book value, not redeemable cash.',limits:'Local simulation policies, not human playtest. Box CI ignores within-account correlation; use tail wealth and halted rate as diagnostics, not promises. Modern shared-pool compensation and host memory persist across auctions.'},results};
mkdirSync('artifacts/auction-v32',{recursive:true});writeFileSync(`artifacts/auction-v32/economy-${label}.json`,JSON.stringify(report,null,2));
