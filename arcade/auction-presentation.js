/* Presentation-only randomness: never advances the auction/economy RNG. */
(()=>{
'use strict';
const bank={
 '收藏补全':['就差一件凑齐了。','先看看有没有眼缘。','喜欢归喜欢，得看价。','这箱像有我要的。','为收藏多留一点预算。','重复的我可不想收。','心动了，再想想。','不便宜也得有个限度。'],
 '保守捡漏':['我就等个合适的价。','别急，先算算账。','留点利润再说。','便宜才值得出手。','这箱再看看。','钱得花在刀刃上。','不跟自己钱包过不去。','机会多着呢，不急。'],
 '品类行家':['这轮廓有点眼熟。','像是我常看的那类。','先把线索对一下。','这细节值得琢磨。','看着熟也得防看走眼。','有几件还真不好认。','我有点想法了。','只押自己看得懂的。'],
 '稳健估值':['等我再算一遍。','线索还差一点。','先留点余地。','这个范围得再缩缩。','想好了再出手。','估错一点就白忙了。','先排掉几种可能。','稳一点，总没错。'],
 '冒险押宝':['呵呵，这局我想拿下。','这箱有点意思啊。','搏一把？让我想想。','感觉能开出好东西。','这次信一下直觉。','胆子大也得留退路。','好东西可别藏太深。','我先掂量一下钱包。'],
 '试探博弈':['你们都想好了？','这轮会怎么出呢。','谁先沉不住气？','别急，好戏还在后头。','这场挺有意思。','让我猜猜你们的打算。','这回得换个思路。','都挺沉得住气啊。'],
 thinking:['让我想一会儿。','这个价得斟酌一下。','先不急着按。','嗯……再看一眼线索。','差点就冲动了。','这箱真让人纠结。','好像有点眉目了。','稍等，最后算一下。'],
 submitted:['就这个价了。','想好了，交卷。','看你们的了。','落子无悔。','我这边定了。','等揭晓吧。','看看谁猜得准。','行，赌这个判断。'],
 high:['你这价，赚得回来吗？','可恶，出得这么高。','这轮你是真敢啊。','抬这么高，得有好货。','这价格我得再想想。','我可不跟着上头。','钱包挺有底气啊。','再高就有点悬了。'],
 lead:['暂时领先，别急。','呵呵，这轮我在前面。','这价是我认真想过的。','先别庆祝，还没开呢。','就看里面值不值了。','拿下也得能回本。','我是不是有点冲了？','但愿这眼光没错。'],
 pass:['这箱你们来吧。','超过我的打算了。','留点钱等下一箱。','不争了，看看结果。','这次就当看个热闹。','再喜欢也得看预算。','我先收手了。','今天不硬追。'],
 tie:['居然想到一块去了。','这都能撞价？','还真是不分上下。','下一轮再见分晓。','都挺会算啊。','有意思，居然一样。','看来都盯上这箱了。','加赛就再琢磨一下。']
};
const pick=(xs,r)=>xs[Math.min(xs.length-1,Math.floor(r()*xs.length))];
function create(before,random=Math.random,now=Date.now()){
 const order=[1,2,3].filter(i=>before.active[i]);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 const readyAt=[before.active[0]?now:null,null,null,null],bubbles=[];let elapsed=0;
 for(const [index,seat] of order.entries()){
  elapsed+=index===0?1120+Math.floor(random()*1761):880+Math.floor(random()*2241);
  readyAt[seat]=now+elapsed;
  // Each speech opportunity rolls once at creation; saves/repaints never reroll.
  if(index===0&&random()<.25)bubbles.push({seat,at:now+400,until:readyAt[seat],text:pick(bank[before.opponents?.[seat-1]?.tendency]||bank.thinking,random)});
  if(index===1&&random()<.25)bubbles.push({seat,at:readyAt[seat],until:readyAt[seat]+2200,text:pick(bank.submitted,random)});
 }
 const revealAt=now+elapsed+850;
 const reactionSeat=order.length&&random()<.25?pick(order,random):null;
 // Preselect alternatives without access to this round's sealed prices.
 const replies=Object.fromEntries(['high','lead','pass','tie'].map(k=>[k,pick(bank[k],random)]));
 return {id:before.id,round:before.round,before,startedAt:now,readyAt,revealAt,endAt:revealAt+3300,bubbles,reactionSeat,replies};
}
function speech(p,publicRow,now=Date.now()){
 if(now>=p.revealAt&&now<p.endAt&&p.reactionSeat&&publicRow){
  const bids=publicRow.bids,seat=p.reactionSeat,high=Math.max(0,...bids.filter(x=>x!=null)),leaders=bids.filter(x=>x===high).length;
  const kind=bids[seat]==null?'pass':bids[seat]===high?(leaders>1?'tie':'lead'):'high';
  return p.replies?.[kind]?{seat,text:p.replies[kind],key:`${p.id}:${p.round}:reaction`}:null;
 }
 const b=(p.bubbles||[]).find(b=>now>=b.at&&now<b.until&&now<p.revealAt);
 return b?{...b,key:`${p.id}:${p.round}:${b.at}`}:null;
}
function dragScroll(el){
 let drag=null,suppress=false,motion=0;
 const stop=()=>{cancelAnimationFrame(motion);motion=0;};
 const inertia=velocity=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(velocity)<.08)return;
  let last=performance.now();
  const step=now=>{const dt=Math.min(32,now-last);last=now;const top=el.scrollTop;el.scrollTop-=velocity*dt;velocity*=Math.pow(.91,dt/16.67);if(Math.abs(velocity)>.025&&Math.abs(el.scrollTop-top)>.1)motion=requestAnimationFrame(step);};
  motion=requestAnimationFrame(step);
 };
 el.tabIndex=0;el.setAttribute('aria-label','鉴宝情报，可拖动或滚动查看');
 el.addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.isPrimary||e.target.closest('button,a,input,select,textarea'))return;
  stop();drag={id:e.pointerId,y:e.clientY,top:el.scrollTop,lastY:e.clientY,lastAt:e.timeStamp,velocity:0,moved:false,touch:e.pointerType!=='mouse'};suppress=false;
  el.setPointerCapture(e.pointerId);
 });
 el.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dy=e.clientY-drag.y;if(Math.abs(dy)>4)drag.moved=true;
  if(drag.moved){e.preventDefault();el.classList.add('dragging');el.scrollTop=drag.top-dy;const dt=Math.max(1,e.timeStamp-drag.lastAt);drag.velocity=Math.max(-1.8,Math.min(1.8,(e.clientY-drag.lastY)/dt));drag.lastY=e.clientY;drag.lastAt=e.timeStamp;}
 },{passive:false});
 const end=e=>{if(!drag||e.pointerId!==drag.id)return;const old=drag;suppress=drag.moved;drag=null;el.classList.remove('dragging');if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);if(old.touch&&old.moved&&e.type==='pointerup'&&e.timeStamp-old.lastAt<100)inertia(old.velocity);};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,end);
 el.addEventListener('wheel',stop,{passive:true});el.addEventListener('keydown',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();drag=null;el.classList.remove('dragging');}});
 el.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false;}},true);
}

globalThis.AuctionPresentation=Object.freeze({create,speech,dragScroll,bank});
})();
