// Unconditional warehouse distributions (not a quote/return or bankroll simulation).
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({console,Date,Math});for(const f of ['auction-data.js','auction-npc.js','auction-engine.js'])vm.runInContext(readFileSync(new URL('../arcade/'+f,import.meta.url),'utf8'),ctx);
const E=ctx.AIRPAuctionEngine,D=ctx.AuctionData,N=Number(process.argv[2]||2000);
for(const venue of D.venues){const values=[];for(let seed=1;seed<=N;seed++){const game=E.createSession({seed,budget:40000,venue:venue.id});game.beginLot();values.push(game.export().current.items.reduce((n,i)=>n+E.price(i,venue.scale),0));}values.sort((a,b)=>a-b);console.log(JSON.stringify({venue:venue.id,boxes:N,mean:values.reduce((a,b)=>a+b,0)/N,p05:values[Math.floor(N*.05)],median:values[Math.floor(N*.5)],p95:values[Math.floor(N*.95)]}));}
