/* 临江拍卖行 3.0 — deterministic sealed-round auction. No DOM/network dependencies.
 * NPC bids are computed from a frozen previous-round snapshot, never player input.
 * v0.2 saves are intentionally not reused. See arcade/AUCTION.md for exact rules. */
(function(root){
'use strict';
const B=root.AuctionNPC,D=root.AuctionData,I=root.AuctionIntel, VERSION='3.2.0', THRESHOLDS=[2,1.6,1.3,1.1];
const clone=x=>JSON.parse(JSON.stringify(x));
const price=(item,scale)=>Math.max(1,Math.round(item.base*scale));
const candidates=I.candidates;
function resolveRound(bids,round){
 const entries=bids.map((amount,seat)=>({amount,seat})).filter(x=>x.amount!=null&&x.amount>0).sort((a,b)=>b.amount-a.amount);
 if(!entries.length)return {done:true,winner:null,price:0,reason:'所有竞拍人退出，本箱流拍'};
 const top=entries[0],second=entries[1]?.amount||0,ties=entries.filter(e=>e.amount===top.amount).map(e=>e.seat);
 if(round<=4&&top.amount>second*THRESHOLDS[round-1])return {done:true,winner:top.seat,price:top.amount,reason:`第 ${round} 轮领先超过 ${THRESHOLDS[round-1]} 倍，提前落槌`};
 if(round>=5&&ties.length===1)return {done:true,winner:top.seat,price:top.amount,reason:round===6?'加赛唯一最高价成交':'最终轮最高价成交'};
 if(round===6)return {done:true,winner:null,price:0,reason:'加赛最高价仍相同，本箱流拍'};
 return {done:false,ties:round===5?ties:null};
}
function createSession(options={}, saved=null){
 let s=saved?clone(saved):{version:VERSION,id:options.id||`auction-${Date.now()}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`,rng:(options.seed>>>0)||Math.floor(Math.random()*4294967295),venue:options.venue||'street',host:options.host??0,tool:options.tool||'scanner',bank:Math.max(0,Math.floor(options.budget??1000)),lotIndex:0,lots:1,ledger:[],current:null};
 // Admission is prepaid by the wallet transaction; old saves carry no retroactive fee.
 s.lots=Math.max(1,s.lotIndex);if(s.current)s.current.deadline=null;
 s.entryFee??=saved?0:Math.max(0,Math.floor(options.entryFee||0));
 s.stock??=clone(options.stock||{});s.loadout??=(options.loadout||[]).filter(id=>D.tools.some(t=>t.id===id)).slice(0,3);s.publicRng??=(s.rng^0xc2b2ae35)>>>0;s.intelRng??=(s.rng^0x85ebca6b)>>>0;
 s.version=VERSION;if(s.npcRng==null)s.npcRng=(s.rng^0x9e3779b9)>>>0;
 const venue=D.venues.find(v=>v.id===s.venue)||D.venues[0];
 function rand(){s.rng=(s.rng+0x6d2b79f5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
 function npcRand(){s.npcRng=(s.npcRng+0x6d2b79f5)>>>0;let t=s.npcRng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
 function publicRand(){s.publicRng=(Math.imul(s.publicRng,1664525)+1013904223)>>>0;return s.publicRng/4294967296;}
 function intelRand(){s.intelRng=(Math.imul(s.intelRng,1664525)+1013904223)>>>0;return s.intelRng/4294967296;}
 const choose=a=>a[Math.floor(rand()*a.length)];
 function clue(text,privateClue=false){s.current.clues.unshift({round:s.current.round,text,private:privateClue});}
 function beginLot(){
  if(s.current&&s.current.phase!=='closed')throw Error('先处理当前拍品');
  if(s.lotIndex>=s.lots)return null;
  const used=new Set(),items=[];let attempts=0;
  const count=6+Math.floor(rand()*3);
  while(items.length<count&&attempts++<300){
   const roll=rand();let sum=0,q=0;for(;q<D.qualities.length-1;q++){sum+=venue.rarity[q];if(roll<sum)break;}
   const d=choose(D.catalog.filter(c=>c.quality===q)), x=Math.floor(rand()*(7-d.w)),y=Math.floor(rand()*(7-d.h));
   const cells=[];for(let xx=x;xx<x+d.w;xx++)for(let yy=y;yy<y+d.h;yy++)cells.push(xx+yy*6);
   if(cells.some(c=>used.has(c)))continue;cells.forEach(c=>used.add(c));items.push({...d,x,y,slot:items.length,known:false,qualityKnown:false,categoryKnown:false});
  }
  if(!s.bots){const rivals=D.hosts.filter(h=>h.id!==s.host);for(let i=rivals.length-1;i>0;i--){let j=Math.floor(npcRand()*(i+1));[rivals[i],rivals[j]]=[rivals[j],rivals[i]];}s.bots=rivals.slice(0,3).map(h=>B.create(h.id,venue,npcRand));}
  s.lotIndex++;
  s.current={id:`${s.id}-${s.lotIndex}`,phase:'bidding',round:1,items,scale:venue.scale,history:[],active:[true,true,true,true],rivals:s.bots.map(b=>b.host),clues:[],toolUsed:false,result:null,deadline:null};
  const c=s.current;c.playerIntel=items.map(I.empty);c.playerFacts=[];c.playerMemory={};c.usedTools=[];c.toolRound=0;c.instrumentCost=0;c.playerTools=[];

  initNPCs();roundInfo();
  return view();
 }
 function npcContext(index){const c=s.current;return {items:clone(c.npcIntel[index]),facts:clone(c.npcFacts[index]),venue,seat:index+1,active:[...c.active],history:clone(c.history),round:c.round,lotIndex:s.lotIndex,lots:s.lots};}
 function initNPCs(){
  const c=s.current;c.npcEvents=[];c.npcIntel=s.bots.map(()=>c.items.map(I.empty));c.npcFacts=s.bots.map(()=>[]);c.npcMemory=s.bots.map(()=>({}));
  s.bots.forEach(bot=>B.beginLot(bot,npcRand));
 }
 function roundInfo(){
  const c=s.current;
  // Deliberately limited public information. No free full-quality reveal on R3.
  if([1,3].includes(c.round)){
   const spec={kind:'shape',count:c.round===1?1:2},seen=c.publicIntel??=c.items.map(I.empty);
   const res=I.apply(c.items,seen,[],spec,publicRand,c.scale);
   if(res){for(const slot of res.slots){const raw=c.items.find(i=>i.slot===slot);for(const intel of [c.playerIntel,...c.npcIntel])Object.assign(intel.find(i=>i.slot===slot),{x:raw.x,y:raw.y,w:raw.w,h:raw.h});}clue(`公开 ${res.slots.length} 件轮廓。`);}
  }
  const host=D.hosts[s.host];
  if(c.active[0])for(const r of I.skill(host.effect,c.round,c.items,c.playerIntel,c.playerFacts,c.playerMemory,intelRand,c.scale))clue(`${host.name} · ${host.skill}：${r.text}`,true);
  s.bots.forEach((bot,index)=>{if(!c.active[index+1])return;const h=D.hosts[bot.host];const rs=I.skill(h.effect,c.round,c.items,c.npcIntel[index],c.npcFacts[index],c.npcMemory[index],npcRand,c.scale);
   if(rs.length){bot.lot.skillUsed=true;c.npcEvents.push({round:c.round,host:bot.host,kind:'skill',label:h.skill});}
  });
 }
 // 3.0 / 3.1 saves keep paid collectibles and existing information, but grant no consumables.
 if(s.current&&!s.current.playerIntel){const c=s.current;c.playerIntel=c.items.map(i=>({...I.empty(i),x:i.x,y:i.y,w:i.w,h:i.h,quality:i.qualityKnown?i.quality:null,category:i.categoryKnown?i.category:null,identified:i.known?i.id:null}));c.playerFacts=[];c.playerMemory={};c.usedTools=[];c.toolRound=c.toolUsed?c.round:0;c.instrumentCost=0;c.playerTools=[];
  if(!s.bots)s.bots=c.rivals.map(id=>B.create(id,venue,npcRand));
  const oldIntel=c.npcIntel;initNPCs();if(oldIntel)c.npcIntel=oldIntel;
  clue('旧版进度已保留；免费仪器已退役。付费库存从零开始。',true);
 }
 function npcBids(){
  const c=s.current;
  return s.bots.map((bot,index)=>{
   if(!c.active[index+1])return null;
   const plan=B.planTool(bot,npcContext(index));
   if(plan){const tool=D.tools.find(t=>t.id===plan.tool),before=npcRngSnapshot();
    const result=I.apply(c.items,c.npcIntel[index],c.npcFacts[index],tool.effect,npcRand,c.scale);
    if(result){bot.stock[tool.id]--;bot.lot.instrumentCost+=tool.cost;bot.lot.usedTools.push(tool.id);bot.lot.toolRound=c.round;bot.lot.toolUsed=true;bot.lot.usedRound=c.round;
     c.npcEvents.push({round:c.round,host:bot.host,kind:'tool',label:tool.name});
    }else{s.npcRng=before;bot.lot.failedTools.push(tool.id);}
   }
   return B.decide(bot,npcContext(index),npcRand).amount;
  });
 }
 function npcRngSnapshot(){return s.npcRng;}
 function bid(amount){
  const c=s.current;if(!c||c.phase!=='bidding')throw Error('当前阶段没有开放竞拍');
  if(amount!==null&&(!Number.isSafeInteger(amount)||amount<1||amount>s.bank))throw Error('请输入预算范围内的整数报价');
  if(!c.active[0]&&amount!==null)throw Error('本箱已退出竞拍');
  const other=npcBids(); // all decisions before publishing any new bids
  const bids=[amount,...other];bids.forEach((v,i)=>{if(v===null)c.active[i]=false;});
  c.history.push({round:c.round,bids});const resolution=resolveRound(bids,c.round);
  if(resolution.done){
   c.phase='result';c.result={...resolution,won:resolution.winner===0,trueValue:c.items.reduce((v,i)=>v+price(i,c.scale),0)};
   c.result.overpayment=Math.max(0,c.result.price-c.result.trueValue);
   c.result.rawCompensation=Math.floor(c.result.overpayment*D.economy.compensationRate);
   c.result.compensation=c.result.won?0:Math.min(D.economy.compensationPerLot,c.result.rawCompensation);
   c.result.auctionProfit=c.result.won?c.result.trueValue-c.result.price:c.result.compensation;c.result.instrumentCost=c.instrumentCost;c.result.profit=c.result.auctionProfit-c.instrumentCost;
  }else{
   if(resolution.ties)c.active=c.active.map((active,i)=>active&&resolution.ties.includes(i));
   c.round++;c.deadline=null;
   roundInfo();
   if(c.round===5)clue('最终轮：唯一最高报价直接成交。同价者进入第六轮加赛。');
   if(c.round===6)clue('同价加赛：仅最高价并列者参与。仍同价则流拍。');
  }
  return view();
 }
 function useTool(id){
  const c=s.current,tool=D.tools.find(t=>t.id===id);
  if(!c||c.phase!=='bidding'||!c.active[0])throw Error('当前阶段未开放仪器');
  if(!tool||!s.loadout.includes(id))throw Error('仪器未装入本场的三个槽位');
  if(c.toolRound===c.round)throw Error('每轮至多消耗一件仪器');
  if(c.usedTools.includes(id))throw Error('同款仪器每箱至多使用一次');
  if(!(s.stock[id]>0))throw Error('库存不足，请先购买');
  const rngBefore=s.intelRng,result=I.apply(c.items,c.playerIntel,c.playerFacts,tool.effect,intelRand,c.scale);
  if(!result){s.intelRng=rngBefore;throw Error('该仪器没有新增情报，库存未消耗');}
  s.stock[id]--;c.usedTools.push(id);c.toolRound=c.round;c.toolUsed=true;c.instrumentCost+=tool.cost;c.playerTools.push({id,cost:tool.cost,round:c.round});
  clue(`${tool.name}（消耗 1，成本 ${tool.cost}）：${result.text}`,true);return view();
 }
 function addStock(id,count=1){if(!D.tools.some(t=>t.id===id)||!Number.isSafeInteger(count)||count<1||count>99)throw Error('采购参数异常');s.stock[id]=(s.stock[id]||0)+count;s.purchaseCost=(s.purchaseCost||0)+D.tools.find(t=>t.id===id).cost*count;}
 function closeLot(choice,balance,options={}){
  const c=s.current;if(!c||c.phase!=='result')throw Error('本箱尚未落槌');
  const r=c.result;if(r.won&&!['sell','keep'].includes(choice))throw Error('请选择出售或留藏');
  const compensation=r.won?0:Math.min(r.compensation||0,Math.max(0,Math.floor(options.compensationLimit??D.economy.compensationDaily)));
  const entry={id:c.id,lot:s.lotIndex,...r,compensation,profit:(r.won?r.trueValue-r.price:compensation)-c.instrumentCost,instrumentCost:c.instrumentCost,choice:r.won?choice:'none',cashDelta:r.won?(choice==='sell'?r.trueValue-r.price:-r.price):compensation};
  s.bots.forEach((bot,index)=>B.settle(bot,{seat:index+1,winner:r.winner,price:r.price,trueValue:r.trueValue,items:c.items.map(i=>({...i,value:price(i,c.scale)})),compensation:Math.min(D.economy.compensationPerLot,r.rawCompensation||0),history:c.history}));
  s.ledger.push(entry);s.bank=Math.max(0,Math.floor(balance??(s.bank+entry.cashDelta)));c.phase='closed';return clone(entry);
 }
 function view(){
  const c=s.current;if(!c)return {version:VERSION,lotIndex:s.lotIndex,bank:s.bank,phase:'setup',ledger:clone(s.ledger)};
  const revealed=c.phase==='result'||c.phase==='closed';
  const items=c.playerIntel.map(o=>{const i=c.items.find(i=>i.slot===o.slot);return {...o,...(revealed||o.identified!=null?{x:i.x,y:i.y,w:i.w,h:i.h,identified:i.id,name:i.name,quality:i.quality,category:i.category,image:i.image,value:price(i,c.scale)}:{})};});
  const {low:estimate,high:ceiling}=I.bounds(items,c.playerFacts,c.scale);
  return {version:VERSION,id:c.id,phase:c.phase,lotIndex:s.lotIndex,lots:s.lots,round:c.round,bank:s.bank,venue:s.venue,host:s.host,tool:s.loadout[0]||null,loadout:[...s.loadout],stock:clone(s.stock),usedTools:[...c.usedTools],toolRound:c.toolRound,instrumentCost:c.instrumentCost,entryFee:s.entryFee,purchaseCost:s.purchaseCost||0,toolUsed:c.toolRound===c.round,facts:clone(c.playerFacts),scale:c.scale,items,estimate,ceiling,clues:clone(c.clues),history:clone(c.history),active:[...c.active],rivals:[...c.rivals],opponents:s.bots.map(B.publicProfile),npcEvents:clone(c.npcEvents),result:clone(c.result),ledger:clone(s.ledger),deadline:c.deadline};
 }
 function setBudget(value){if(!Number.isFinite(value)||value<0)throw Error('预算数据异常');s.bank=Math.floor(value);}
 return {beginLot,bid,useTool,addStock,closeLot,view,setBudget,export:()=>clone(s)};
}
root.AIRPAuctionEngine=Object.freeze({VERSION,THRESHOLDS,createSession,restore:s=>{if(![VERSION,'3.1.0','3.0.0'].includes(s?.version))throw Error('存档版本不同');return createSession({},s);},resolveRound,candidates,price});
})(globalThis);
