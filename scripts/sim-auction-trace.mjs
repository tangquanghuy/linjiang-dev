// Private developer trace. Uses export() for diagnostics; never loaded by the player UI.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({console,Date,Math});for(const f of ['auction-data.js','auction-npc.js','auction-engine.js'])vm.runInContext(readFileSync(new URL('../arcade/'+f,import.meta.url),'utf8'),ctx);
const E=ctx.AIRPAuctionEngine,D=ctx.AuctionData,seed=Number(process.argv[2]||20260930),game=E.createSession({seed,budget:D.venues.find(v=>v.id==='dock').min*2,venue:'dock',host:seed%11});
for(let lot=1;lot<=1;lot++){
 game.beginLot();console.log(JSON.stringify({lot,opponents:game.view().opponents}));
 while(game.view().phase==='bidding'){
  const v=game.view(),bid=v.active[0]?Math.min(v.bank,Math.max(1,Math.floor(v.estimate*.95))):null;game.bid(bid);
  console.log(JSON.stringify({lot,round:v.round,bids:game.view().history.at(-1).bids,npcs:game.export().bots.map(b=>({host:D.hosts[b.host].name,type:b.type,decision:b.lot.lastDecision}))}));
 }
 console.log(JSON.stringify({lot,result:game.view().result,settlement:game.closeLot(game.view().result.won?'sell':'none')}));
}
