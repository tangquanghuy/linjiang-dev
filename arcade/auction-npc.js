/* Observation-only NPC behaviour tree. Never accepts a hidden warehouse or player current bid. */
(function(root){
'use strict';
const D=root.AuctionData,I=root.AuctionIntel;
const BID_STRENGTH=1; // Offline sensitivity probe may override; production is fixed, never adaptive to player wealth.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pick=(xs,rng)=>xs[Math.floor(rng()*xs.length)];
const TYPES={
 collector:{name:'收藏补全',hint:'愿为缺藏多出一点，但重复藏品吸引力低',margin:.015,risk:.12,premium:.22,exposure:.84},
 dealer:{name:'保守捡漏',hint:'先算利润；价格过热时倾向离场',margin:.15,risk:.28,premium:0,exposure:.65},
 specialist:{name:'品类行家',hint:'偏爱熟悉的门类，跨品类更谨慎',margin:.075,risk:.20,premium:.16,exposure:.77},
 analyst:{name:'稳健估值',hint:'先补情报，再按自己的估值出价',margin:.065,risk:.14,premium:0,exposure:.76},
 gambler:{name:'冒险押宝',hint:'愿意为未知品质下注，仍留有止损预算',margin:-.025,risk:-.07,premium:0,exposure:.80},
 tactician:{name:'试探博弈',hint:'观察历史报价，择机抢拍或抽身',margin:.065,risk:.12,premium:0,exposure:.76}
};
const qualityCounts=D.qualities.map((_,q)=>D.catalog.filter(x=>x.quality===q).length);
const poolCache=new Map();
function poolFor(slot,venue){
 const key=[venue.id,slot.w,slot.h,slot.quality,slot.category,slot.identified].join('|');
 if(!poolCache.has(key)){
  const pool=D.catalog.filter(c=>(slot.w==null||c.w===slot.w)&&(slot.h==null||c.h===slot.h)&&(slot.quality==null||c.quality===slot.quality)&&(!slot.category||c.category===slot.category)&&(slot.identified==null||c.id===slot.identified));
  if(!pool.length)throw Error('NPC observation has no compatible catalog candidates');
  const weights=pool.map(c=>venue.rarity[c.quality]/qualityCounts[c.quality]);
  const sum=weights.reduce((a,b)=>a+b,0);
  poolCache.set(key,pool.map((item,i)=>({item,p:weights[i]/sum})));
 }
 return poolCache.get(key);
}
function create(host,venue,rng,type){
 type=type||pick(Object.keys(TYPES),rng);const t=TYPES[type],series=pick(D.series,rng);
 const inventory=D.catalog.filter(c=>rng()<(c.series===series.id?(type==='collector'?.58:.32):.12)).map(c=>c.id);
 return {host,type,series:series.id,category:series.category,inventory,bank:Math.round(Math.max(1000,venue.npcBudget||venue.min)*(.9+rng()*.5)),
  traits:{patience:.2+rng()*.7,confidence:.55+rng()*.4,accuracy:.62+rng()*.32,
   reserve:.08+rng()*.14,lossTolerance:.045+rng()*.065,margin:t.margin+(rng()-.5)*.055,
   premium:t.premium*(.8+rng()*.4),exposure:t.exposure+(rng()-.5)*.10,bluff:.12+rng()*.35},
  tool:null,stock:{},loadout:[],
  memory:{boxes:0,cashDelta:0,valueProfit:0,calibration:1,heat:.85,lossStreak:0,compensationClaimed:0},lot:null};
}
function beginLot(bot,rng){
 bot.stock??={};const tier=bot.bank>=10000?3:bot.bank>=2400?2:0;
 const wishes=bot.type==='specialist'?['category-'+bot.series,'count-3','shape-'+tier]:bot.type==='collector'?['identify-'+tier,'quality-'+tier,'count-4']:bot.type==='analyst'?['total-3','count-3','identify-'+tier]:bot.type==='dealer'?['quality-0','count-2','shape-0']:bot.type==='gambler'?['identify-'+tier,'quality-'+tier,'largest-shape']:['shape-'+tier,'quality-'+tier,'identify-'+tier];
 bot.loadout=wishes;bot.tool=wishes[0];let procurement=Math.floor(bot.bank*.12);
 for(const id of wishes){const t=D.tools.find(t=>t.id===id);if(!(bot.stock[id]>0)&&t.cost<=procurement&&t.cost<=bot.bank){bot.bank-=t.cost;procurement-=t.cost;bot.stock[id]=1;bot.memory.toolPurchases=(bot.memory.toolPurchases||0)+t.cost;}}
 const amplitude=(1-bot.traits.accuracy)*.45;
 bot.lot={usedTools:[],failedTools:[],toolRound:0,instrumentCost:0,toolUsed:false,skillUsed:false,usedRound:null,error:1+(rng()-.5)*2*amplitude,
  urgency:rng(),opportunity:rng(),lastDecision:null,lastAction:'正在观察仓库',previousEstimate:null,decisions:[]};
}
function assess(bot,ctx){
 const owned=new Set(bot.inventory);let mean=0,variance=0,floor=0,ceiling=0,desired=0,special=0,known=0;
 const slots=ctx.items.map(slot=>{
  const pool=poolFor(slot,ctx.venue);let m=0,v2=0,missing=0,familiar=0,min=Infinity,max=0;
  for(const {item,p}of pool){const value=D.catalogPrice(item,ctx.venue.scale,ctx.venue.pricingVersion);m+=p*value;v2+=p*value*value;min=Math.min(min,value);max=Math.max(max,value);
   if(!owned.has(item.id)&&item.series===bot.series&&(ctx.policyVersion<2||ctx.policyVersion==null||slot.identified!=null))missing+=p*value;
   if(item.category===bot.category&&(ctx.policyVersion<2||ctx.policyVersion==null||slot.identified!=null))familiar+=p*value;
  }
  mean+=m;variance+=Math.max(0,v2-m*m);floor+=min;ceiling+=max;desired+=missing;special+=familiar;if(slot.identified!=null)known++;
  return {slot:slot.slot,mean:m,sd:Math.sqrt(Math.max(0,v2-m*m)),missing,familiar,identified:slot.identified!=null,qualityKnown:slot.quality!=null,categoryKnown:!!slot.category};
 });
 // Aggregates change valuation using only the observer's own facts; never the hidden contents.
 const groups=new Map();
 for(const f of ctx.facts||[]){if(!['count','total','mean'].includes(f.stat))continue;const key=JSON.stringify([f.filter,f.scope||null]);if(!groups.has(key))groups.set(key,{filter:f.filter,scope:f.scope});groups.get(key)[f.stat]=f.value;}
 for(const f of groups.values()){
  const observed=f.scope?ctx.items.filter(i=>f.scope.includes(i.slot)):ctx.items;
  if(f.mean!=null&&!Object.keys(f.filter).length){mean+=(f.mean+.5)*observed.length-slots.filter(i=>!f.scope||f.scope.includes(i.slot)).reduce((n,i)=>n+i.mean,0);if(!f.scope)variance=Math.min(variance,ctx.items.length**2/12);continue;}
  let expectedCount=0,groupValue=0,otherValue=0,otherCount=0;
  for(const slot of observed)for(const {item,p} of poolFor(slot,ctx.venue)){if(I.match(item,f.filter)){expectedCount+=p;groupValue+=p*D.catalogPrice(item,ctx.venue.scale,ctx.venue.pricingVersion);}else{otherCount+=p;otherValue+=p*D.catalogPrice(item,ctx.venue.scale,ctx.venue.pricingVersion);}}
  const count=f.count??expectedCount,unit=f.mean!=null?f.mean+.5:expectedCount?groupValue/expectedCount:0;
  mean+=(f.total??(count*unit))-groupValue;
  if(f.count!=null&&otherCount)mean+=(expectedCount-count)*otherValue/otherCount;
 }
 const bounds=I.bounds(ctx.items,ctx.facts||[],ctx.venue.scale,ctx.venue.pricingVersion);floor=bounds.low;ceiling=bounds.high;mean=clamp(mean,floor,ceiling);
 const sd=Math.min(Math.sqrt(variance),(ceiling-floor)/2),uncertainty=mean?sd/mean:0;
 const bias=1+(bot.lot.error*bot.memory.calibration-1)*clamp(uncertainty*2.5,0,1);
 return {mean:clamp(mean*bias,floor,ceiling),objectiveMean:mean,sd,floor,ceiling,desired,special,known,slots,uncertainty};
}

function contextTrace(node,reason){return {node,reason};}
function chooseSkillSlots(bot,ctx,count){
 const a=assess(bot,ctx);return a.slots.map(i=>({slot:i.slot,score:i.sd+i.missing*.3+i.familiar*.2})).sort((a,b)=>b.score-a.score||a.slot-b.slot).slice(0,count).map(i=>i.slot);
}
function planTool(bot,ctx){
 if(bot.lot.toolRound===ctx.round||!ctx.active[ctx.seat])return null;
 const a=assess(bot,ctx),heat=Math.max(0,...(ctx.history.at(-1)?.bids||[]).filter(x=>x!=null));
 if(heat>a.mean*(1+bot.traits.premium)||bot.bank<a.floor*.35||a.uncertainty<.015)return null;
 const ranked=(bot.loadout||[]).filter(id=>bot.stock[id]>0&&!bot.lot.usedTools.includes(id)&&!bot.lot.failedTools.includes(id)).map(id=>D.tools.find(t=>t.id===id)).filter(t=>{
  if(ctx.round<(t.minRound||1))return false;
  if(t.effect.kind==='stat')return !(ctx.facts||[]).some(f=>f.key===JSON.stringify([t.effect.stat,t.effect.filter||{}]));
  return ctx.items.some(i=>t.effect.kind==='identify'?i.identified==null:t.effect.kind==='shape'?i.w==null:i.quality==null);
 }).map(t=>{const count=t.effect.count||2,benefit=a.sd*Math.min(.65,count/Math.max(1,ctx.items.length))*(bot.type==='collector'?1.25:1);return {tool:t.id,benefit,net:benefit-t.cost};}).filter(t=>t.net>0).sort((a,b)=>b.net-a.net);
 // A paid scan competes with cash reserved for the actual auction; sunk purchase cost does not force use.
 if(!ranked.length)return null;
 if(ctx.round===1&&bot.traits.patience>.6&&bot.type!=='analyst')return null;
 return {...ranked[0],reason:'预期情报收益超过消耗成本，且历史报价仍在承受区间'};
}
function decide(bot,ctx,rng){
 const path=[contextTrace('root','检查参与资格')];
 const finish=(amount,node,reason,extra={})=>{path.push(contextTrace(node,reason));const decision={amount,node,reason,path,...extra};bot.lot.lastDecision=decision;bot.lot.decisions.push(decision);bot.lot.lastAction=amount===null?'选择退出本箱':node==='early-close'?'尝试提前落槌':node==='pressure'?'试探性报价':node==='wait-info'?'谨慎观察':'提交密封报价';return decision;};
 if(!ctx.active[ctx.seat])return finish(null,'inactive','已退出或未取得加赛资格');
 if(bot.bank<1)return finish(null,'no-cash','流动资金已用尽');
 const a=assess(bot,ctx),t=TYPES[bot.type];path.push(contextTrace('appraise','仅使用自己的技能、仪器情报和公开历史'));
 const familiarRatio=a.special/Math.max(1,a.objectiveMean);
 const premium=bot.type==='collector'?a.desired*bot.traits.premium:bot.type==='specialist'?a.special*bot.traits.premium:0;
 const margin=bot.traits.margin+(bot.type==='specialist'?(1-familiarRatio)*.075:0);
 const modern=ctx.policyVersion>=2;
 const lossCooling=1-Math.min(modern?.30:.12,bot.memory.lossStreak*(modern?.06:.035));
 let willingness=(a.mean*(1-margin)+premium-a.sd*t.risk*(1.5-bot.traits.confidence))*lossCooling;
 // Three independent hard stops: own valuation, cash reserve, maximum plausible overpayment.
 const lossBudget=bot.bank*bot.traits.lossTolerance;
 const valueCap=Math.min(a.ceiling*1.22,a.mean+Math.min(premium+a.mean*.10,lossBudget));
 const reserve=ctx.lotIndex<ctx.lots?bot.bank*bot.traits.reserve:0;
 const cashCap=Math.floor(Math.min(bot.bank-reserve,bot.bank*clamp(bot.traits.exposure,0.4,.95)));
 // Modern policy never adds a positive uncertainty bonus, even for gamblers.
 if(modern)willingness=Math.min(willingness,(a.mean*(1-Math.max(.04,margin))+premium-a.sd*Math.max(.12,t.risk)-ctx.entryFee-bot.lot.instrumentCost)*lossCooling);
 const prudentCap=modern?Math.min(a.ceiling+premium,a.mean+Math.min(premium,lossBudget)):valueCap;
 const cap=Math.max(0,Math.floor(Math.min(willingness,valueCap,prudentCap,cashCap)));
 bot.lot.previousEstimate=a.objectiveMean;
 path.push(contextTrace('risk-gates','估值上限、收藏溢价、留存现金与连续亏损降温'));
 const details={estimate:Math.round(a.mean),uncertainty:a.uncertainty,premium:Math.round(premium),cap,cashCap};
 if(cap<1)return finish(null,'reserve-cash','可承担的出价不足',details);
 const previous=ctx.history.at(-1)?.bids||[];
 const others=previous.filter((x,i)=>i!==ctx.seat&&ctx.active[i]&&x!=null);
 const high=others.length?Math.max(...others):0;
 const competition=ctx.active.filter((active,i)=>active&&i!==ctx.seat).length;
 const tooHot=high>cap*(1.03+(1-bot.traits.patience)*.08);
 // A sealed historical offer is not a standing ask: hold our limit instead of handing the lot to a token bid.
 if(modern&&ctx.round>1&&high>cap)return finish(Math.max(1,Math.floor(cap*.95)),'hold-cap','不跟随历史高价；仅提交自身止损价以内的报价',details);
 if(!modern&&ctx.round>1&&tooHot&&(bot.type==='dealer'||bot.type==='specialist'||ctx.round>=4||rng()>bot.traits.patience*.65))return finish(null,'walk-away','历史价格已超过自身承受区间；不追逐沉没成本',details);
 const fractions=[0,.69,.79,.89,.96,1,1];
 let fraction=fractions[ctx.round]+(bot.lot.urgency-.5)*.10;
 if(bot.type==='collector'&&premium>a.mean*.04)fraction+=.07;
 if(bot.type==='dealer')fraction-=ctx.round<3?.07:0;
 if(bot.type==='gambler')fraction+=.08;
 if(bot.type==='analyst'&&a.uncertainty>.25&&ctx.round<3)fraction-=.07;
 let quote=cap*clamp(fraction,.45,1),node='value-bid',reason='按估值、竞争和预算提交报价';
 if(competition===0){quote=Math.min(cap,Math.max(1,a.floor*.45));node='sole-bidder';reason='只剩自己，保留议价空间';}
 else if(ctx.round<=2&&a.uncertainty>.30&&bot.traits.patience>.62){quote=Math.min(quote,cap*.62);node='wait-info';reason='未知价值占比较大，等待后续公开情报';}
 const predicted=high*(.94+bot.memory.heat*.10);
 if(ctx.round>=2&&predicted>0&&predicted<cap){quote=Math.max(quote,Math.min(cap,predicted*(1.005+rng()*.025)));}
 if(bot.type==='tactician'&&ctx.round<=3&&rng()<bot.traits.bluff&&!tooHot){quote=Math.min(cap,quote*(1.03+rng()*.07));node='pressure';reason='在自己愿意接盘的价格内施压，并承担中拍风险';}
 // Early-close attempt uses only last round's visible bids; never guarantees the unknown current outcome.
 const thresholds=[0,2,1.6,1.3,1.1];
 if(ctx.round>=2&&ctx.round<=4&&high>0){const target=Math.floor(predicted*thresholds[ctx.round]+1);if(target<=cap&&rng()<.25+bot.lot.urgency*.4){quote=Math.max(quote,target);node='early-close';reason='根据历史竞争预测尝试抢拍，不突破止损线';}}
 quote=Math.min(cap,quote*BID_STRENGTH*(.98+rng()*.04));
 const step=quote>=1500?10:quote>=250?5:1;
 quote=Math.max(1,Math.min(cap,Math.floor(quote/step)*step));
 return finish(quote,node,reason,details);
}
function settle(bot,ctx){
 const {winner,seat,price,items,trueValue,compensation}=ctx;const before=bot.bank;let retained=0,received=0;
 if(winner===seat){
  bot.bank-=price;const owned=new Set(bot.inventory);
  for(const item of items){const keep=(bot.type==='collector'||bot.type==='specialist')&&!owned.has(item.id)&&item.series===bot.series;
   if(keep){retained+=item.value;owned.add(item.id);}else bot.bank+=item.value;
  }
  bot.inventory=[...owned];const gain=trueValue-price-(bot.lot.instrumentCost||0)-(ctx.policyVersion>=2?ctx.entryFee||0:0);bot.memory.valueProfit+=gain;bot.memory.lossStreak=gain<0?bot.memory.lossStreak+1:0;
 }else{const rebate=ctx.policyVersion>=2?compensation:Math.min(compensation,Math.max(0,D.economy.compensationDaily-bot.memory.compensationClaimed));received=rebate;bot.bank+=rebate;bot.memory.compensationClaimed+=rebate;
  if(ctx.policyVersion>=2){const gain=rebate-(ctx.entryFee||0)-(bot.lot.instrumentCost||0);bot.memory.valueProfit+=gain;bot.memory.lossStreak=gain<0?bot.memory.lossStreak+1:0;}
 }
 // Revealed result calibrates future lots, never retroactively changes an earlier sealed bid.
 if(bot.lot.previousEstimate){const ratio=clamp(trueValue/bot.lot.previousEstimate,ctx.policyVersion>=2?.5:.75,1.25);bot.memory.calibration=clamp(bot.memory.calibration*.80+ratio*.20,ctx.policyVersion>=2?.80:.90,1.10);}
 const histories=ctx.history.flatMap(h=>h.bids.filter(x=>x!=null));if(histories.length){bot.memory.heat=clamp(histories.reduce((a,b)=>a+b,0)/histories.length/Math.max(1,trueValue),.5,1.2);}
 bot.memory.boxes++;bot.memory.cashDelta+=bot.bank-before;bot.memory.lastRetained=retained;
 if(!Number.isSafeInteger(bot.bank)||bot.bank<0)throw Error('NPC settlement violated budget');
 const entryFee=ctx.policyVersion>=2?(ctx.entryFee||0):0,instrumentCost=bot.lot.instrumentCost||0;
 return {host:bot.host,role:'npc',net:(winner===seat?trueValue-price:received)-entryFee-instrumentCost,entryFee,instrumentCost,compensation:received};
}
function publicProfile(bot){const series=D.series.find(s=>s.id===bot.series),tool=D.tools.find(t=>t.id===bot.tool);return {host:bot.host,tendency:TYPES[bot.type].name,hint:TYPES[bot.type].hint,interest:series.name,tool:tool?.name||'未配仪器',toolUsed:!!bot.lot?.toolUsed,skillUsed:!!bot.lot?.skillUsed,action:bot.lot?.lastAction||'等待入场'};}
root.AuctionNPC=Object.freeze({TYPES,create,beginLot,assess,chooseSkillSlots,planTool,decide,settle,publicProfile});
})(globalThis);
