import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import '../arcade/auction-data.js';
import '../arcade/auction-npc.js';
import '../arcade/auction-engine.js';
import '../arcade/auction-recommendation.js';
const D=AuctionData,E=AIRPAuctionEngine,R=AuctionRecommendation.recommend;
const count=Number(process.argv[2]||300),rows=[];
for(const venue of D.venues){
 for(const policy of ['recommend','cheap','informed','estimate','idle']){
  const deltas=[],truths=[],bids=[],fees=[];let wins=0,lossWins=0,overpay=0,toolSpend=0;
  for(let seed=1;seed<=count;seed++){
   const budget=Math.max(10000,venue.npcBudget*2),loadout=policy==='informed'?['identify-3','quality-3','supreme']:policy==='cheap'?['quality-0','shape-0','identify-0']:[];
   const game=E.createSession({seed,venue:venue.id,host:seed%11,budget,entryFee:venue.entryFee,loadout,stock:Object.fromEntries(loadout.map(id=>[id,1]))});game.beginLot();
   while(game.view().phase==='bidding'){
    let v=game.view();if(v.active[0])for(const id of loadout.filter(id=>v.stock[id]>0&&!v.usedTools.includes(id))){try{game.useTool(id);break;}catch(e){if(!e.message.includes('没有新增'))throw e;}}
    v=game.view();const a=R(v,budget);
    const bid=policy==='idle'||!v.active[0]?null:policy==='estimate'?Math.max(1,Math.floor(Math.min(budget,a.estimate*.95))):a.amount;
    game.bid(bid);
   }
   const v=game.view(),r=v.result,delta=(r.won?r.trueValue-r.price:r.compensation)-v.entryFee-v.instrumentCost;
   truths.push(r.trueValue);deltas.push(delta);bids.push(r.won?r.price:0);fees.push(v.entryFee);toolSpend+=v.instrumentCost;
   if(r.won){wins++;if(delta<0)lossWins++;if(r.price>r.trueValue)overpay++;}
   assert.ok(Number.isSafeInteger(r.trueValue));
   assert.equal(r.trueValue,game.export().current.items.reduce((sum,i)=>sum+E.price(i,venue.scale),0));
   const cost=bids.at(-1)+v.instrumentCost+v.entryFee;
   const entry=game.closeLot(r.won?'sell':'none');assert.equal(entry.cashDelta-v.entryFee-v.instrumentCost,delta);
   if(policy==='idle')assert.ok(delta<0);
  }
  const sum=xs=>xs.reduce((a,b)=>a+b,0),pct=n=>Math.round(n/count*10000)/100,quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*q)];
  const row={venue:venue.id,policy,samples:count,scale:venue.scale,fee:venue.entryFee,npcBudget:venue.npcBudget,winPct:pct(wins),netLossPct:pct(deltas.filter(d=>d<0).length),winningNetLossPct:wins?Math.round(lossWins/wins*10000)/100:0,overpayPct:pct(overpay),netPerBox:Math.round(sum(deltas)/count),roiPct:Math.round(sum(deltas)/(sum(bids)+sum(fees)+toolSpend)*10000)/100,medianNet:quantile(deltas,.5),p05Net:quantile(deltas,.05),p95Net:quantile(deltas,.95),medianValue:quantile(truths,.5),meanValue:Math.round(sum(truths)/count)};
  rows.push(row);console.log(JSON.stringify(row));
 }
}
mkdirSync('artifacts/auction-v32/pricing',{recursive:true});
writeFileSync('artifacts/auction-v32/pricing/economy.json',JSON.stringify({count,definitions:{roi:'(sale margin + capped compensation - ticket - consumed instruments)/(winning bids + ticket + consumed instruments)',scope:'Independent seeded boxes, all eleven partners. Not a human win-rate guarantee or a bankroll-survival simulation.',policies:'recommend: UI advice; cheap: UI advice plus basic consumables; informed: UI advice plus paid advanced scans; estimate: 95% estimated mean; idle: always pass.'},rows},null,2));
