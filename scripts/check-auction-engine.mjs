import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({console,Date,Math});
for(const f of ['auction-data.js','auction-npc.js','auction-engine.js'])vm.runInContext(readFileSync('arcade/'+f,'utf8'),context);
const E=context.AIRPAuctionEngine,D=context.AuctionData;
const json=x=>JSON.parse(JSON.stringify(x));
assert.equal(D.catalog.length,96);assert.equal(new Set(D.catalog.map(c=>c.name)).size,96);assert.equal(new Set(D.catalog.map(c=>c.image)).size,96);assert.equal(D.qualities.length,5);assert.equal(D.series.length,8);
for(const c of D.catalog){assert.ok(existsSync('arcade/'+c.image),c.image);assert.ok(Number.isInteger(c.base));}
for(let r=1;r<=4;r++){const threshold=E.THRESHOLDS[r-1];assert.equal(E.resolveRound([Math.round(1000*threshold),1000,900,null],r).done,false);assert.equal(E.resolveRound([Math.round(1000*threshold)+1,1000,900,null],r).winner,0);}
assert.deepEqual(json(E.resolveRound([100,100,null,null],5).ties),[0,1]);assert.equal(E.resolveRound([100,100,null,null],6).winner,null);assert.equal(E.resolveRound([null,null,null,null],1).winner,null);assert.equal(E.resolveRound([null,1,null,null],1).winner,1);assert.equal(E.resolveRound([99,100,98,null],5).winner,1);
let rounds=0,early=0,rarities=new Set();
for(let seed=1;seed<=1000;seed++){
 const game=E.createSession({seed,budget:40000,venue:D.venues[seed%3].id,host:seed%11,loadout:['identify-0'],stock:{'identify-0':3}});game.beginLot();
 const initial=game.export();const low=E.restore(initial),high=E.restore(initial);
 low.bid(1);high.bid(40000);assert.deepEqual(json(low.view().history[0].bids.slice(1)),json(high.view().history[0].bids.slice(1)),`sealed leak seed ${seed}`);
 const cells=new Set();for(const i of initial.current.items){rarities.add(i.quality);for(let x=i.x;x<i.x+i.w;x++)for(let y=i.y;y<i.y+i.h;y++){assert.ok(x<6&&y<6);const cell=x+y*6;assert.ok(!cells.has(cell),'overlap');cells.add(cell);}}
 const truth=initial.current.items.reduce((n,i)=>n+E.price(i,initial.current.scale),0);
 for(let r=1;r<=6;r++){
  const v=game.view();if(v.phase!=='bidding')break;
  assert.ok(v.estimate<=truth,`floor ${seed} ${v.estimate}>${truth}`);assert.ok(v.ceiling>=truth);
  assert.equal(v.items.some(i=>!i.identified&&'base' in i),false);
  if(r===1){game.useTool('identify-0');assert.throws(()=>game.useTool('identify-0'));assert.ok(game.view().estimate<=truth);}
  const before=game.export(),restored=E.restore(before);const bid=r===1?300:null;
  game.bid(bid);restored.bid(bid);assert.deepEqual(json({...game.view(),deadline:0}),json({...restored.view(),deadline:0}),'restore changes deterministic bids');rounds++;
 }
 const v=game.view();assert.equal(v.phase,'result');assert.ok(v.round<=6);if(v.round<5)early++;
 if(v.history.length>1)assert.equal(v.result.won,false,'withdrawn player won with an old bid');
 assert.throws(()=>game.bid(1));game.closeLot(v.result.won?'sell':'none');assert.throws(()=>game.closeLot('sell'),'double settle');
}
assert.equal(rarities.size,5);
const g=E.createSession({budget:1000,seed:3});g.beginLot();for(const bad of [-1,0,1.1,1001,NaN,Infinity])assert.throws(()=>g.bid(bad));
console.log(JSON.stringify({passed:true,seeds:1000,rounds,early,uniqueCollectibles:96,rarities:5,checks:['all threshold boundaries','sealed-bid independence','withdrawal invalidates old bids','ties and no sale','candidate lower bound','deterministic restore','single-use instruments','settlement idempotency guard','grid non-overlap','budget validation']},null,2));
