/* 临江拍卖行 — UI, resumable game and shared arcade-wallet journal. */
(()=>{
'use strict';
if(window.auctionLandscapeHost)return;
const D=AuctionData,E=AIRPAuctionEngine,$=id=>document.getElementById(id);
const KEY='airp_auction_state_v3',WALLET='airp_arcade_wallet_v1',NS='airp-auction';
const peers=['airp_scratch_card_state_v2','airp_physical_slot_state_v2','airp_fishing_state_v1'];
const fmt=n=>Math.round(n||0).toLocaleString('zh-CN'),signed=n=>(n>=0?'+':'−')+fmt(Math.abs(n));
const read=(k,f=null)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
const blank=()=>({version:3,host:0,venue:'street',tool:null,instrumentStock:{},loadout:['quality-0','shape-0','identify-0'],revision:0,npcProfiles:{},hostDaily:null,snapshot:null,inventory:[],collected:[],discovered:[],pins:[],receipts:[],compensation:{day:'',used:0},sound:true,soundPreference:false});
const hydrate=saved=>({...blank(),...saved,sound:saved?.soundPreference===true?saved.sound!==false:true});
let state=hydrate(read(KEY,{})),session=null,view=null,selected=null,candidateSlot=null,cabinetSeries='',busy=false;
let storageWarning=false,toastTimer=0,activeTool=null,shopPage=0,dailyTimer=0;
let revealState=null,roundTimer=0,bidDraft="",bidDraftKey="";
const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
document.body.dataset.prepareTab='partner';document.body.dataset.playTab='warehouse';
function wallet(){const value=read(WALLET);if(value&&Number.isFinite(value.balance))return {...value,balance:Math.max(0,Math.floor(value.balance))};for(const key of peers){const p=read(key);if(p&&Number.isFinite(p.balance))return {balance:Math.max(0,Math.floor(p.balance))};}return {balance:1000};}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function emit(type,detail={}){if(parent!==window)parent.postMessage({type:NS+':'+type,detail:{...detail,balance:wallet().balance}},'*');}
function writeStore(next){next.revision=(read(KEY)?.revision||0)+1;localStorage.setItem(KEY,JSON.stringify(next));state=next;}
async function save(){const revision=state.revision||0,next={...structuredClone(state),balance:wallet().balance,snapshot:session?.export()||null};return locked(()=>{try{const disk=recover();if((disk.revision||0)!==revision){state=hydrate(disk);session=state.snapshot?E.restore(state.snapshot):null;toast('其他窗口已更新进度，本次操作未覆盖新存档。');return false;}writeStore(next);return true;}catch{if(!storageWarning){toast('浏览器存储已满，进度暂未保存。请清理空间后再结算。');storageWarning=true;}return false;}});}
function putWallet(value,id){const w=wallet();localStorage.setItem(WALLET,JSON.stringify({...w,balance:Math.max(0,Math.floor(value)),updatedAt:Date.now(),source:'auction',...(id?{auctionTxn:id}:{})}));}
// Journal survives a reload between shared-wallet write and game-state write.
function recover(){const current=hydrate(read(KEY,state)),p=current.pending;if(!p)return current;const w=wallet();if(w.auctionTxn===p.id||w.balance===p.after){localStorage.setItem(KEY,JSON.stringify(p.next));return hydrate(p.next);}if(w.balance===p.before){putWallet(p.after,p.id);localStorage.setItem(KEY,JSON.stringify(p.next));return hydrate(p.next);}throw Error('钱包在待处理结算期间发生变化，请保留存档并核对余额。');}
function locked(fn){return navigator.locks?navigator.locks.request('airp-auction-wallet-v3',fn):Promise.resolve().then(fn);}
async function transaction(id,makeNext){return locked(()=>{const disk=recover();if(disk.receipts.includes(id)){state=disk;session=state.snapshot?E.restore(state.snapshot):null;return false;}const before=wallet().balance;const {next,delta}=makeNext(disk,before);if(!Number.isSafeInteger(delta)||before+delta<0)throw Error('可用资产已变化，余额不足以完成这笔成交。');next.receipts=[...disk.receipts,id];next.balance=before+delta;const pending={id,before,after:before+delta,next};localStorage.setItem(KEY,JSON.stringify({...disk,pending}));putWallet(pending.after,id);writeStore(next);session=next.snapshot?E.restore(next.snapshot):null;emit('settled',{transaction:id,delta});return true;});}
function rewardQuota(disk=state){const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),old=disk.compensation||{day:'',used:0};const day=old.day>today?old.day:today,used=old.day===day?Math.max(0,old.used||0):0;return {day,used,remaining:disk.snapshot?.policyVersion>=2?Number.MAX_SAFE_INTEGER:Math.max(0,D.economy.compensationDaily-used)};}
async function syncCollectionRewards(){try{const reward=await AuctionRewards.claim(read(KEY,state).collected||[]);if(reward.amount)toast(`首次收藏 +${reward.amount} 代币`);if($('collectionDialog').open)renderCabinet();}catch{toast('收藏代币尚未入账，重新打开拍卖行后自动重试。');}}
function balanceUI(){$('balance').textContent=fmt(wallet().balance);$('collectionCount').textContent=state.collected.length;}
function sound(type='submit',quality=0){AuctionAudio.setEnabled(state.sound);AuctionAudio.play(type,quality);}
function showDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialogs(){stopReveal();document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function screen(name){for(const id of ['prepare','admission','play'])$(id).hidden=id!==name;document.body.dataset.screen=name;}
let portraitRequest=0,portraitSource='';
function renderPortrait(host,force=false){
 const frame=$('heroPortraitFrame'),src=new URL(host.portrait,document.baseURI).href;
 if(!force&&portraitSource===src)return;
 portraitSource=src;
 const request=++portraitRequest,image=new Image();
 $('heroPortrait').hidden=true;
 frame.dataset.state='loading';frame.setAttribute('aria-busy','true');
 $('heroPortraitLoading').hidden=false;$('heroPortraitRetry').hidden=true;
 image.id='heroPortrait';image.alt=host.name;image.hidden=true;image.decoding='async';
 const fail=()=>{
  if(request!==portraitRequest)return;
  frame.dataset.state='error';frame.setAttribute('aria-busy','false');
  $('heroPortraitLoading').hidden=true;$('heroPortraitRetry').hidden=false;
 };
 image.onerror=fail;
 image.onload=async()=>{
  try{await image.decode();}catch{fail();return;}
  if(request!==portraitRequest)return;
  image.onload=null;image.onerror=null;
  $('heroPortrait').replaceWith(image);image.hidden=false;
  frame.dataset.state='ready';frame.setAttribute('aria-busy','false');
  $('heroPortraitLoading').hidden=true;
 };
 image.src=src;
}
$('heroPortraitRetry').onclick=()=>renderPortrait(D.hosts[state.host]||D.hosts[0],true);
function renderHostDaily(){
 clearTimeout(dailyTimer);state.hostDaily=AuctionDaily.read(state.hostDaily);
 const total=state.hostDaily.totals[state.host],net=total?.net||0,amount=$('hostDailyProfit'),last=$('hostDailyLast');
 const sign=value=>value>0?'positive':value<0?'negative':'zero';
 amount.textContent=net<0?'−'+fmt(-net):fmt(net);amount.dataset.sign=sign(net);
 last.hidden=!Number.isSafeInteger(total?.lastNet);last.textContent=last.hidden?'':signed(total.lastNet);last.dataset.sign=sign(total?.lastNet||0);
 $('hostDailyAccount').dataset.long=String(amount.textContent.length+last.textContent.length>18);
 $('hostDailyAccount').setAttribute('aria-label',`${D.hosts[state.host]?.name||''}今日总账 ${amount.textContent}${last.hidden?'':`，最近一场 ${last.textContent}`}`);
 $('hosts').querySelectorAll('[data-host]').forEach(button=>{const h=D.hosts[+button.dataset.host],value=state.hostDaily.totals[h.id]?.net||0,label=`${h.name} · ${h.skill} · 今日总账 ${value===0?'0':signed(value)}`;button.title=label;button.setAttribute('aria-label',label);});
 dailyTimer=setTimeout(renderHostDaily,AuctionDaily.untilReset()+20);
}
function renderPrepare(){balanceUI();
 $('hosts').innerHTML=D.hosts.map(h=>`<button class="host-button ${state.host===h.id?'active':''}" data-host="${h.id}" aria-label="邀请${h.name} · ${h.skill}" aria-pressed="${state.host===h.id}" title="${h.name} · ${h.skill}"><img src="${h.avatar}" alt="${h.name}" width="64" height="64"></button>`).join('');
 renderHostDaily();const h=D.hosts[state.host]||D.hosts[0];renderPortrait(h);$('heroName').textContent=h.name;$('hostDescription').innerHTML=`<h3>${h.skill}</h3><p>${h.desc}</p>`;
 $('tools').innerHTML=`<div class="loadout-heading"><span>已装备 ${state.loadout.length} / 3</span><button class="text-button" data-open-shop>采购 / 配装 ↗</button></div>`+state.loadout.map(id=>{const t=D.tools.find(t=>t.id===id);return `<article class="tool-card"><span>${t.symbol}</span><div><div class="tool-title"><strong>${t.name}</strong><em>库存 ${state.instrumentStock[id]||0}</em></div><p>${t.desc}</p></div></article>`;}).join('');
 $('btnStart').disabled=false;$('btnStart').innerHTML='选择会场 <span>↗</span>';renderAdmission();
}
function renderAdmission(){const bal=wallet().balance,v=D.venues.find(v=>v.id===state.venue)||D.venues[0],h=D.hosts[state.host]||D.hosts[0];
 $('venues').innerHTML=D.venues.map(x=>`<button class="venue ${v.id===x.id?'active':''}" data-venue="${x.id}" aria-pressed="${v.id===x.id}"><strong>${x.name}</strong><p>${x.desc}</p><span class="venue-multiplier">回收倍率 ×${x.scale}</span><div class="venue-fee">◈ ${fmt(x.entryFee)}<small>门票</small></div><span>扣票后至少保留 ◈ ${fmt(x.min)}</span><span class="venue-availability">${bal<x.min+x.entryFee?'入场所需资产 ◈ '+fmt(x.min+x.entryFee):'可入场'}</span></button>`).join('');
 $('admissionPartner').innerHTML=`<img src="${h.avatar}" alt="${h.name}"><strong>${h.name}</strong>`;
 $('admissionBill').innerHTML=`<p><span>当前资产</span><b>◈ ${fmt(bal)}</b></p><p><span>${v.name} · 门票</span><b>− ${fmt(v.entryFee)}</b></p><p class="remaining"><span>扣票后可用资金</span><b>◈ ${fmt(Math.max(0,bal-v.entryFee))}</b></p>`;
 $('admissionError').textContent=bal<v.min+v.entryFee?`还差 ${fmt(v.min+v.entryFee-bal)} 资产：门票 ${fmt(v.entryFee)} + 最低资金 ${fmt(v.min)}。`:'';
 $('btnConfirmEntry').disabled=busy||bal<v.min+v.entryFee;$('btnConfirmEntry').textContent=`支付 ${fmt(v.entryFee)} · 确认入场 ↗`;
}
function vaultHTML(items,revealed=false){return items.filter(i=>i.w!=null).map(i=>{const q=i.quality==null?null:D.qualities[i.quality],known=i.identified!=null;return `<button class="vault-item ${selected===i.slot&&!revealed?'selected':''}" data-slot="${i.slot}" style="grid-column:${i.x+1}/span ${i.w};grid-row:${i.y+1}/span ${i.h};--q:${q?.color||'#75838a'}" aria-label="${known?i.name:((q?.name||'未知品质')+'藏品')}，占格${i.w}乘${i.h}">${known?`<img src="${i.image}" alt="${i.name}">`:'<span class="unknown">?</span>'}<small>${known?(revealed?fmt(i.value):i.name):(i.category||`${i.w}×${i.h}`)}</small></button>`;}).join('');}
// Presentation is persisted with the atomic bid, not with a second economic action.
// Only the previous public view is painted until every sealed envelope is ready.
function makeRoundPresentation(before){return AuctionPresentation.create(before);}
const presentationSounds=new Set(),presentationLoadedAt=Date.now();
function presentationSound(key,at,kind){
 if(presentationSounds.has(key))return;presentationSounds.add(key);
 if(at>=presentationLoadedAt&&Date.now()-at<800)sound(kind);
 if(presentationSounds.size>200){const first=presentationSounds.values().next().value;presentationSounds.delete(first);}
}

function roundPresentation(disk=state){
 const p=disk.roundPresentation,c=disk.snapshot?.current;
 return p&&c?.id===p.id&&c.history.at(-1)?.round===p.round&&Date.now()<p.endAt?p:null;
}
function paintRoundPresentation(p,actual){
 const now=Date.now(),revealed=now>=p.revealAt,row=actual.history.find(h=>h.round===p.round);
 document.body.dataset.roundStage=revealed?'result':'waiting';
 const seats=[...$('seats').children],ready=p.readyAt.filter(t=>t!==null&&t<=now).length,total=p.before.active.filter(Boolean).length;
 seats.forEach((card,i)=>{
  if(!p.before.active[i])return;
  const submitted=p.readyAt[i]<=now,status=card.querySelector('.bidder-status');
  if(i>0&&submitted)presentationSound(`${p.id}:${p.round}:seat:${i}`,p.readyAt[i],'npc');
  card.classList.toggle('bid-submitted',submitted);card.classList.toggle('bid-thinking',!submitted);
  card.classList.toggle('bid-revealed',revealed);
  if(revealed)card.querySelectorAll('.bid-history>span')[p.round-1]?.classList.add('round-amount');
  status.textContent=revealed?(row.bids[i]===null?'已退出':'已出价'):(submitted?'已提交':'思考中');
  if(revealed&&row.bids[i]!==null&&row.bids[i]===Math.max(...row.bids.filter(n=>n!==null))){card.classList.add('round-leading');status.textContent='最高价';}
 });
 const speech=AuctionPresentation.speech(p,revealed?row:null,now);
 seats.forEach((card,i)=>{const bubble=card.querySelector('.npc-bubble');if(!bubble)return;const text=speech?.seat===i?speech.text:'';if(bubble.textContent!==text){bubble.textContent=text;bubble.classList.toggle('speaking',!!text);}card.classList.toggle('npc-speaking',!!text);bubble.setAttribute('aria-hidden',String(!text));});
 const feedback=$('roundFeedback');feedback.hidden=false;
 if(revealed)presentationSound(`${p.id}:${p.round}:reveal`,p.revealAt,E.resolveRound(row.bids,p.round).done?'hammer':'round');
 const feedbackKey=`${p.id}:${p.round}:${revealed}`;
 if(feedback.dataset.phase!==feedbackKey){feedback.dataset.phase=feedbackKey;feedback.classList.remove('round-flash');if(revealed){void feedback.offsetWidth;feedback.classList.add('round-flash');}}

 if(revealed){
  const resolution=E.resolveRound(row.bids,p.round),high=Math.max(0,...row.bids.filter(n=>n!==null));
  const winner=resolution.winner===0?'你':resolution.winner!=null?D.hosts[p.before.rivals[resolution.winner-1]].name:null;
  const title=resolution.done?(winner?`${winner}竞得 · ${fmt(resolution.price)}`:'本场流拍'):`最高报价 ${fmt(high)}`;
  const detail=resolution.done?'即将揭晓藏品':resolution.ties?'最高价并列 · 即将进入加赛':'未达落槌条件 · 即将进入第 '+(p.round+1)+' 轮';
  feedback.innerHTML=`<strong><small>第 ${p.round} 轮</small>${escapeHTML(title)}</strong><span>${detail}</span>`;
 }else feedback.innerHTML=`<strong>等待其他竞拍人 <small>${ready} / ${total}</small></strong><span>报价将在全员提交后公开</span>`;
 $('btnBid').textContent=revealed?'本轮结算':'等待出价';
 for(const id of ['btnBid','btnPass','btnTool'])$(id).disabled=true;
 const next=[...p.readyAt,p.revealAt,p.endAt,...(p.bubbles||[]).flatMap(b=>[b.at,b.until])].filter(t=>t!==null&&t>now).sort((a,b)=>a-b)[0];
 roundTimer=setTimeout(()=>{if(session?.view().id===p.id)renderPlay();},Math.max(20,next-now+10));
}
function intelHTML(c){
 let text=c.text,source=c.private?'私有情报':'公开情报';
 const colon=text.indexOf('：');
 // Partner/tool identity is metadata, not part of the main clue sentence.
 if(c.private&&colon>0){source=text.slice(0,colon).replace(/（消耗.*?）/g,'');text=text.slice(colon+1);}
 const main=escapeHTML(text).replace(/\d[\d,]*(?:\.\d+)?/g,n=>`<b class="intel-number">${n}</b>`);
 return `<article class="clue ${c.private?'private':''}"><p>${main}</p><div class="clue-meta"><span>第${c.round}轮</span><span>${escapeHTML(source)}</span></div></article>`;
}
function renderPlay(){clearTimeout(roundTimer);if(!session)return;const actual=session.view(),presentation=roundPresentation();view=presentation?structuredClone(presentation.before):actual;const v=view;v.pricingVersion??=actual.pricingVersion;if(presentation&&$('bidDialog').open)$('bidDialog').close();if(presentation&&$('fieldToolsDialog').open)$('fieldToolsDialog').close();if(presentation&&Date.now()>=presentation.revealAt)v.history=structuredClone(actual.history);balanceUI();screen('play');document.body.dataset.roundStage='idle';$('roundFeedback').hidden=true;$('btnBid').textContent='出价 ↗';
 if(v.phase==='result'){renderResult();return;}
 $('venueTitle').textContent=D.venues.find(x=>x.id===v.venue).name+` · ×${v.scale}`;
 $('roundTrack').innerHTML=`<span class="current">${v.round>5?'同价加赛':'竞拍第 '+v.round+' 回合'}</span>`;
 $('roundRule').textContent=v.round<=4?`落槌：最高价 > 次高价 × ${E.THRESHOLDS[v.round-1]}`:v.round===5?'唯一最高价胜出，同价加赛':'最高价仍同价则流拍';
 const seatsHTML=[D.hosts[v.host],...v.rivals.map(id=>D.hosts[id])].map((h,i)=>`<article class="bidder ${i===0?'self':''} ${!v.active[i]?'out':''}"><div class="bidder-main"><img class="bidder-avatar" src="${h.avatar}" alt="${h.name}"><div class="bidder-name"><strong>${i===0?'你 · '+h.name:h.name}</strong></div><span class="bidder-status">${v.active[i]?'竞拍中':'已退出'}</span></div><button type="button" class="bidder-last" data-bid-history="${i}" aria-haspopup="dialog" aria-label="查看${escapeHTML(h.name)}的报价记录">${v.history.at(-1)?.bids[i]!=null?fmt(v.history.at(-1).bids[i]):'—'}</button><button type="button" class="bid-history" data-bid-history="${i}" aria-haspopup="dialog" aria-label="查看${escapeHTML(h.name)}的逐轮报价">${Array.from({length:6},(_,r)=>{const row=v.history[r],amount=row?.bids[i];return `<span title="第${r+1}轮${row?(amount==null?'退出':'报价 '+fmt(amount)):'待公开'}"><small>${r+1}</small>${row?(amount==null?'弃':amount>=10000?(amount/1000).toFixed(1)+'k':fmt(amount)):'—'}</span>`;}).join('')}</button>${i?'<div class="npc-bubble" role="status" aria-live="polite" aria-atomic="true" aria-hidden="true"></div>':''}</article>`).join('');
 const seatsKey=v.id+':'+v.round+':'+seatsHTML;if($('seats').dataset.content!==seatsKey){$('seats').innerHTML=seatsHTML;$('seats').dataset.content=seatsKey;}
 const clues=v.clues.filter(c=>!c.text.includes('结果由对方私有'));const clueHTML=clues.map(intelHTML).join('');if($('clues').dataset.content!==clueHTML){const top=$('clues').scrollTop;$('clues').innerHTML=clueHTML;$('clues').dataset.content=clueHTML;$('clues').scrollTop=top;}$('intelCount').textContent=clues.length+' 条';
 $('vault').innerHTML=vaultHTML(v.items);
 const unlocated=v.items.filter(i=>i.w==null),informed=unlocated.filter(i=>i.quality!=null||i.category);
 $('unlocatedIntel').innerHTML=(unlocated.length?`<span class="unlocated-count">未定位 ${unlocated.length}</span>`:'')+informed.map(i=>`<button class="unlocated-chip" data-slot="${i.slot}" style="--q:${D.qualities[i.quality]?.color||'#9ca6ab'}">${[D.qualities[i.quality]?.name,i.category].filter(Boolean).join(' · ')}</button>`).join('');
 $('itemCount').textContent=v.items.length+' 件';$('estimate').textContent=fmt(v.estimate);
 const item=v.items.find(i=>i.slot===selected);if(item){const pool=E.candidates(item);$('selection').innerHTML=`<b>${item.name||'未知藏品'}</b><button id="selectedCandidates" class="text-button">${pool.length} 种候选 · ${fmt(Math.min(...pool.map(i=>D.catalogPrice(i,v.scale,v.pricingVersion))))}–${fmt(Math.max(...pool.map(i=>D.catalogPrice(i,v.scale,v.pricingVersion))))} ↗</button>`;}else $('selection').textContent='';
 if(!v.loadout.includes(activeTool))activeTool=v.loadout[0]||null;
 $('activeInstrument').innerHTML=v.loadout.map(id=>{const t=D.tools.find(t=>t.id===id);return `<option value="${id}" ${id===activeTool?'selected':''}>${t.name} · ${v.stock[id]||0}件${v.usedTools.includes(id)?' · 已用':''}</option>`;}).join('')||'<option value="">未装备仪器</option>';
 const tool=D.tools.find(t=>t.id===activeTool);$('instrumentDescription').textContent=tool?tool.desc:'';
 $('btnTool').textContent=v.round<(tool?.minRound||1)?`第${tool.minRound}轮可用`:v.toolUsed?'本轮已用':v.usedTools.includes(tool?.id)?'本场已用':!(v.stock[tool?.id]>0)?'库存不足':'使用仪器';$('btnTool').disabled=!tool||v.round<(tool?.minRound||1)||v.toolUsed||v.usedTools.includes(tool?.id)||!(v.stock[tool?.id]>0)||v.phase!=='bidding'||!v.active[0];
 const high=v.history.at(-1)?.bids.filter(x=>x!=null);$('lastHigh').textContent=high?.length?fmt(Math.max(...high)):'—';$('btnBid').disabled=v.phase!=='bidding'||!v.active[0]||wallet().balance<1;$('btnPass').disabled=v.phase!=='bidding'||!v.active[0];
 if($('bidHistoryDialog').open)renderBidHistory();
 if(presentation)paintRoundPresentation(presentation,actual);else if(v.phase==='bidding'&&!v.active[0])roundTimer=setTimeout(autoFinish,450);
}
function renderBidHistory(){
 const hosts=[D.hosts[view.host],...view.rivals.map(i=>D.hosts[i])];
 $('bidHistoryTable').innerHTML=`<thead><tr><th scope="col">轮次</th>${hosts.map((h,i)=>`<th scope="col">${i===0?'你 · ':''}${escapeHTML(h.name)}</th>`).join('')}</tr></thead><tbody>${view.history.map(row=>`<tr><th scope="row">${row.round===6?'加赛':row.round}</th>${row.bids.map(n=>`<td>${n===null?'退出':fmt(n)}</td>`).join('')}</tr>`).join('')}</tbody>`;
 $('bidHistoryEmpty').hidden=view.history.length>0;
}
function openCatalog(slot=null){candidateSlot=slot;$('filterCategory').value='';$('filterQuality').value='';renderCatalog();showDialog('catalogDialog');}
function catalogPricing(){return session?session.view():{scale:D.venues.find(v=>v.id===state.venue)?.scale||1,pricingVersion:D.pricingVersion};}
function catalogCard(c){const pricing=catalogPricing();const q=D.qualities[c.quality];return `<article class="catalog-card" style="--q:${q.color}"><img src="${c.image}" alt="${c.name}" loading="lazy"><small>${q.label} · ${q.name} / ${c.seriesName}</small><strong>${c.name}</strong><p><span>${c.w}×${c.h} · ${c.category}</span><b>◈ ${fmt(D.catalogPrice(c,pricing.scale,pricing.pricingVersion))}</b></p></article>`;}
function renderCatalog(){const slot=view?.items.find(i=>i.slot===candidateSlot);let pool=slot?E.candidates(slot):D.catalog;const cat=$('filterCategory').value,q=$('filterQuality').value;pool=pool.filter(i=>(!cat||i.category===cat)&&(q===''||i.quality===+q));$('catalogTitle').textContent=slot?'符合情报的候选藏品':'城市藏品图鉴';$('catalogHint').textContent=`${pool.length} 件 · 回收倍率 ×${catalogPricing().scale}`;$('catalogGrid').innerHTML=pool.map(catalogCard).join('')||'<p class="empty">暂无符合条件的藏品</p>';$('clearCandidate').hidden=!slot;}
function previousPlayerBid(){return view?.history.filter(row=>row.bids[0]!=null).at(-1)?.bids[0]??null;}
function updateBidDisplay(){
 const amount=Number(bidDraft),balance=wallet().balance;
 $('bidAmount').textContent=fmt(amount);$('bidBudget').textContent='可用资产 '+fmt(balance);
 $('bidError').textContent=amount>balance?'报价超出可用资产':'';
 $('bidConfirm').disabled=busy||!Number.isSafeInteger(amount)||amount<1||amount>balance;
 const previous=previousPlayerBid();$('bidPrevious').disabled=previous===null;
 $('bidPrevious').title=previous===null?'首轮暂无上次出价':'上次出价 '+fmt(previous);
 const advice=AuctionRecommendation.recommend(view,balance);
 $('bidRecommend').disabled=busy||advice.amount===null;
 $('bidRecommend').textContent=advice.amount===null?'暂无推荐价':'推荐出价 '+fmt(advice.amount);
 $('bidAdvice').textContent=advice.amount===null?(balance<1?'当前余额不足以出价。':'估算扣除成本后无出价空间，建议退出。'):'按已知情报估算，不保证盈利。';
}
function openBid(){
 if(busy||roundPresentation()||view?.phase!=='bidding'||!view.active[0])return;
 const key=view.id+'-'+view.round;if(bidDraftKey!==key){bidDraft='';bidDraftKey=key;}
 updateBidDisplay();showDialog('bidDialog');$('bidKeypad').querySelector('button').focus({preventScroll:true});
}
async function submit(amount){if(busy||roundPresentation()||!session||view?.phase!=='bidding')return;busy=true;const expected=session.view();try{
 await transaction(`bid-${expected.id}-${expected.round}`,(disk,bal)=>{const engine=E.restore(disk.snapshot),v=engine.view();if(roundPresentation(disk)||v.id!==expected.id||v.round!==expected.round||v.phase!=='bidding')throw Error('竞拍进度已更新，请查看当前回合');engine.setBudget(bal);engine.bid(amount);return {next:{...disk,snapshot:engine.export(),roundPresentation:makeRoundPresentation(v)},delta:0};});
 closeDialogs();sound();selected=null;renderPlay();
 }catch(e){$('bidError').textContent=e.message;toast(e.message);}finally{busy=false;if($('bidDialog').open)updateBidDisplay();}}
function autoFinish(){if(!session||roundPresentation()||view.phase!=='bidding'||view.active[0])return;submit(null);}
function stopReveal(){if(revealState){clearTimeout(revealState.timer);cancelAnimationFrame(revealState.frame);revealState=null;}}
function revealCard(item){const el=$('resultVault').querySelector(`[data-slot="${item.slot}"]`),q=D.qualities[item.quality];el.classList.remove('sealed');el.classList.add('revealed');el.style.setProperty('--q',q.color);el.setAttribute('aria-label',`${item.name}，${fmt(item.value)}`);el.innerHTML=`<img src="${item.image}" alt="${item.name}"><small>${fmt(item.value)}</small>`;}
function countRevealValue(from,to){const current=revealState;cancelAnimationFrame(current.frame);const start=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function step(now){if(revealState!==current)return;const t=reduced?1:Math.min(1,(now-start)/380);$('revealValue').textContent=fmt(from+(to-from)*(1-Math.pow(1-t,3)));if(t<1)current.frame=requestAnimationFrame(step);}current.frame=requestAnimationFrame(step);}
function finishReveal(){const a=revealState;if(!a||a.done)return;clearTimeout(a.timer);cancelAnimationFrame(a.frame);a.done=true;sound('finish');$('resultDialog').dataset.revealing='false';$('revealValue').textContent=fmt(a.total);$('resultItemCount').textContent=`${a.items.length} / ${a.items.length}`;$('btnSkipReveal').hidden=true;
 const r=view.result,reward=Math.min(r.compensation||0,rewardQuota().remaining),net=(r.won?r.profit:reward-view.instrumentCost)-(view.entryFee||0);
 $('resultTitle').textContent=r.winner==null?'本场流拍':'拍品已揭晓';$('resultGrade').textContent=!r.won?'◆':net<0?'C':net/Math.max(1,r.price)>.5?'S':net/Math.max(1,r.price)>.2?'A':'B';
 $('resultNet').textContent=signed(net);$('resultNet').className=net>=0?'positive':'negative';$('resultReward').textContent=fmt(reward);$('btnSell').hidden=$('btnKeep').hidden=!r.won;$('btnNext').hidden=r.won;for(const id of ['btnSell','btnKeep','btnNext'])$(id).disabled=false;
}
function revealNext(){const a=revealState;if(!a||a.done)return;if(a.index>=a.items.length){finishReveal();return;}
 const item=a.items[a.index++],q=D.qualities[item.quality],before=a.total;a.total+=item.value;revealCard(item);$('resultItemCount').textContent=`${a.index} / ${a.items.length}`;$('revealSpotlight').style.setProperty('--q',q.color);$('revealSpotlight').innerHTML=`<img src="${item.image}" alt=""><div><small>${q.name}</small><strong>${item.name}</strong></div><b class="reveal-gain">+${fmt(item.value)}</b>`;countRevealValue(before,a.total);sound('reveal',item.quality);a.timer=setTimeout(revealNext,item.quality>=3?1100:750);
}
function skipReveal(){const a=revealState;if(!a||a.done)return;clearTimeout(a.timer);for(const item of a.items)revealCard(item);a.index=a.items.length;a.total=a.items.reduce((n,i)=>n+i.value,0);$('revealSpotlight').innerHTML='';finishReveal();}
function renderResult(){const v=view,r=v.result;if(revealState?.id===v.id&&$('resultDialog').open)return;closeDialogs();
 $('resultGrade').textContent='◆';$('resultTitle').textContent='逐件揭晓';$('resultError').textContent='';$('revealSpotlight').innerHTML='';$('resultDialog').dataset.revealing='true';
 const winner=r.winner===0?D.hosts[v.host]:r.winner!=null?D.hosts[v.rivals[r.winner-1]]:null;$('resultWinner').innerHTML=winner?`<img src="${winner.avatar}" alt="${winner.name}"><span>${r.won?'你竞得仓库':winner.name+'竞得仓库'}</span>`:'<span>本场流拍</span>';
 $('resultNumbers').innerHTML=`<div class="sale-price"><span>成交价</span><strong>${fmt(r.price)}</strong></div><div class="value-total"><span>拍品总值</span><strong id="revealValue">0</strong></div><div class="settlement-cost"><span>门票</span><strong>${fmt(v.entryFee||0)}</strong></div><div class="settlement-cost"><span>已用仪器</span><strong>${fmt(v.instrumentCost)}</strong></div>${!r.won?'<div class="settlement-cost"><span>溢价补偿</span><strong id="resultReward">—</strong></div>':'<span id="resultReward" hidden></span>'}<div class="profit"><span>本场净盈亏</span><strong id="resultNet">—</strong></div>`;
 for(const id of ['btnSell','btnKeep','btnNext']){$(id).hidden=true;$(id).disabled=true;}$('btnSkipReveal').hidden=false;
 $('resultVault').innerHTML=v.items.map((i,n)=>`<button class="vault-item sealed" data-slot="${i.slot}" style="grid-column:${i.x+1}/span ${i.w};grid-row:${i.y+1}/span ${i.h};--q:#738087" aria-label="未揭晓藏品 ${n+1}"><span class="seal-mark">✦</span><small>${String(n+1).padStart(2,'0')}</small></button>`).join('');$('resultItemCount').textContent=`0 / ${v.items.length}`;
 revealState={id:v.id,items:[...v.items],index:0,total:0,done:false,timer:0,frame:0};showDialog('resultDialog');revealState.timer=setTimeout(revealNext,650);
}
async function settle(choice){if(busy||view?.phase!=='result'||!revealState?.done)return;busy=true;const v=view;
 try{await transaction(v.id,(disk,bal)=>{if(v.result.won&&bal<v.result.price)throw Error('当前余额低于成交价，请先在藏室出售藏品或同步钱包。');if(disk.snapshot?.current?.id!==v.id||disk.snapshot.current.phase!=='result')throw Error('竞拍进度已在其他窗口更新，请刷新查看。');const engine=E.restore(disk.snapshot),quota=rewardQuota(disk),reward=Math.min(v.result.compensation||0,quota.remaining);const entry=engine.closeLot(choice,bal+(v.result.won?(choice==='sell'?v.result.trueValue-v.result.price:-v.result.price):reward),{compensationLimit:quota.remaining});entry.settledAt=Date.now();const inventory=[...disk.inventory],collected=[...disk.collected];if(v.result.won&&choice==='keep')v.items.forEach((i,n)=>{inventory.push({uid:v.id+'-'+n,id:i.identified,value:i.value,venue:v.venue,scale:v.scale,pricingVersion:v.pricingVersion});collected.push(i.identified);});const next={...disk,compensation:{day:quota.day,used:quota.used+(v.policyVersion>=2?0:entry.compensation)},npcProfiles:{...disk.npcProfiles,...engine.export().npcProfiles},hostDaily:AuctionDaily.record(disk.hostDaily,entry.hostResults,entry.settledAt),snapshot:null,lastAuction:{...entry,entryFee:v.entryFee||0,net:entry.profit-(v.entryFee||0)},inventory,collected:[...new Set(collected)],discovered:[...new Set([...disk.discovered,...v.items.map(i=>i.identified)])]};return {next,delta:entry.cashDelta};});returnToPrepare();await syncCollectionRewards();}catch(e){$('resultError').textContent=e.message;}finally{busy=false;}}
function returnToPrepare(){clearTimeout(roundTimer);closeDialogs();session=null;view=null;selected=null;screen('prepare');renderPrepare();scrollTo({top:0,behavior:'instant'});}
async function finishLegacy(){if(!session)return;const id=session.view().id;try{await transaction('finish-'+id,(disk)=>{if(disk.snapshot?.current?.id!==id||disk.snapshot.current.phase!=='closed')throw Error('进度已更新');return {next:{...disk,snapshot:null},delta:0};});returnToPrepare();}catch(e){toast(e.message);}}
function renderCabinet(){balanceUI();const rewards=AuctionRewards.progress();$('collectionRewards').textContent=`首藏代币 ${rewards.earned} / ${rewards.total}`;const collected=new Set(state.collected),owned=new Map();for(const i of state.inventory)owned.set(i.id,(owned.get(i.id)||0)+1);
 $('collectionProgress').textContent=`${collected.size} / ${D.catalog.length}`;$('collectionProgressBar').style.width=collected.size/D.catalog.length*100+'%';
 state.pins=state.pins.filter(id=>owned.has(id));$('showcase').innerHTML=Array.from({length:6},(_,n)=>{const id=state.pins[n],c=D.catalog.find(x=>x.id===id);return c?`<button class="showcase-slot filled" data-unpin="${id}" style="--q:${D.qualities[c.quality].color}" title="移出展示柜"><span class="showcase-rarity">${D.qualities[c.quality].name}</span><img src="${c.image}" alt="${c.name}"><strong>${c.name}</strong><small>点击移出展示柜</small></button>`:`<div class="showcase-slot empty-slot"><span>＋</span><small>展位 0${n+1}</small></div>`;}).join('');
 $('seriesTabs').innerHTML=[{id:'',name:'全部系列'},...D.series].map(s=>{const all=D.catalog.filter(c=>!s.id||c.series===s.id),have=all.filter(c=>collected.has(c.id)).length;return `<button data-series="${s.id}" class="${cabinetSeries===s.id?'active':''}" aria-pressed="${cabinetSeries===s.id}">${s.name}<small>${have} / ${all.length}${have===all.length?' ✓':''}</small></button>`;}).join('');
 const filter=$('collectionFilter').value,rarity=$('collectionRarity').value,query=$('collectionSearch').value.trim();const pool=D.catalog.filter(c=>(!cabinetSeries||c.series===cabinetSeries)&&(rarity===''||c.quality===+rarity)&&(!query||c.name.includes(query))&&(filter==='all'||filter==='missing'&&!collected.has(c.id)||filter==='collected'&&collected.has(c.id)||filter==='owned'&&owned.has(c.id)));
 $('collectionTotal').textContent=`显示 ${pool.length} 件 · 当前持有 ${state.inventory.length} 件`;
 $('collectionGrid').innerHTML=pool.map(c=>{const q=D.qualities[c.quality],count=owned.get(c.id)||0,nextOwned=state.inventory.find(i=>i.id===c.id),known=collected.has(c.id),pinned=state.pins.includes(c.id);return `<article class="cabinet-card ${known?'collected':'locked'}" style="--q:${q.color}"><div class="cabinet-card-top"><span>${q.label} / ${q.name}</span><b>${count?'×'+count:known?'已收集':'未收集'}</b></div><img src="${c.image}" alt="${c.name}${known?'':'的未收集轮廓'}" loading="lazy"><small>${c.seriesName}</small><h3>${c.name}</h3><div class="cabinet-card-value">${count?'本件回收':'基础回收'} <b>◈ ${fmt(nextOwned?.value??c.base)}</b></div><div class="cabinet-card-value"><span>${rewards.claimed.includes(c.key)?'首藏已奖励':'首次留藏'}</span><b>${c.quality+1} 代币</b></div>${count?`<div class="cabinet-actions"><button data-pin="${c.id}" ${pinned?'disabled':''}>${pinned?'已陈列':'陈列'}</button><button data-sell="${c.id}">出售 1 件</button></div>`:`<p class="cabinet-locked-note">${known?'收集记录已保留':'在竞拍中寻获并留藏'}</p>`}</article>`;}).join('')||'<div class="empty">暂无符合条件的藏品</div>';
}
function openCollection(){renderCabinet();showDialog('collectionDialog');}
async function sellItem(id){if(busy)return;busy=true;try{const item=state.inventory.find(i=>i.id===id);if(!item)return;await transaction('sell-'+item.uid,(disk)=>{const found=disk.inventory.find(i=>i.uid===item.uid);if(!found)throw Error('这件藏品已售出。');return {next:{...disk,inventory:disk.inventory.filter(i=>i.uid!==item.uid)},delta:found.value};});renderCabinet();toast('出售成功，收集记录继续保留。');}catch(e){toast(e.message);}finally{busy=false;}}
$('venues').onclick=async e=>{const b=e.target.closest('[data-venue]');if(b&&!busy){busy=true;state.venue=b.dataset.venue;renderAdmission();try{await save();}finally{busy=false;renderPrepare();}}};
$('hosts').onclick=async e=>{const b=e.target.closest('[data-host]');if(b){state.host=+b.dataset.host;await save();renderPrepare();}};
function shopPageSize(){return 2;}
function renderShop(){
 balanceUI();$('shopBalance').textContent=`◈ ${fmt(wallet().balance)} · 装备 ${state.loadout.length} / 3`;
 const filter=$('instrumentTier').value,kind=$('instrumentKind').value;
 const pool=D.tools.filter(t=>(filter===''||t.tier===+filter)&&(!kind||t.effect.kind===kind)),size=shopPageSize(),pages=Math.max(1,Math.ceil(pool.length/size));shopPage=Math.max(0,Math.min(shopPage,pages-1));
 $('instrumentGrid').innerHTML=pool.slice(shopPage*size,(shopPage+1)*size).map(t=>`<article class="instrument-card tier-${t.tier}"><div class="instrument-eyebrow">${D.toolTiers[t.tier]} · 库存 ${state.instrumentStock[t.id]||0}</div><h3><span>${t.symbol}</span>${t.name}</h3><p>${t.desc}</p><div class="instrument-price">◈ ${fmt(t.cost)} <small>/ 件</small></div><div class="instrument-actions"><button class="secondary" data-equip="${t.id}" ${session?'disabled':''}>${state.loadout.includes(t.id)?'移出':'装备'}</button><button class="primary" data-buy="${t.id}" ${wallet().balance<t.cost||busy?'disabled':''}>购买</button></div></article>`).join('')||'<p class="shop-empty">暂无符合条件的仪器</p>';
 $('shopHint').hidden=!session;$('shopHint').textContent=session?'本场配装已锁定，可补货。':'';
 $('shopCount').textContent=`${pool.length} 件`;
 $('shopPageSelect').innerHTML=Array.from({length:pages},(_,i)=>`<option value="${i}" ${i===shopPage?'selected':''}>${i+1} / ${pages}</option>`).join('');
 $('shopPrev').disabled=shopPage===0;$('shopNext').disabled=shopPage>=pages-1;
}
function openShop(){shopPage=0;renderShop();showDialog('instrumentDialog');}
async function buyInstrument(id){if(busy)return;busy=true;try{const tool=D.tools.find(t=>t.id===id);if(!tool)throw Error('仪器不存在');await transaction('purchase-'+crypto.randomUUID(),(disk,bal)=>{
 const stock={...(disk.instrumentStock||{})};if((stock[id]||0)>=99)throw Error('单种库存上限99件');if(bal<tool.cost)throw Error('余额不足');stock[id]=(stock[id]||0)+1;
 const engine=disk.snapshot?E.restore(disk.snapshot):null;if(engine){engine.addStock(id);engine.setBudget(bal-tool.cost);}
 return {next:{...disk,instrumentStock:stock,snapshot:engine?.export()||null},delta:-tool.cost};});sound('purchase');toast(`已购买 ${tool.name} ×1，扣除 ${tool.cost}`);if(session)renderPlay();else renderPrepare();}catch(e){toast(e.message);}finally{busy=false;renderShop();}}
async function equipInstrument(id){if(busy||session)return;busy=true;try{await transaction('loadout-'+crypto.randomUUID(),(disk)=>{if(disk.snapshot)throw Error('本场已经开始，配装已锁定');const loadout=[...disk.loadout];const n=loadout.indexOf(id);if(n>=0)loadout.splice(n,1);else{if(loadout.length>=3)throw Error('最多装备3种，请先移出一种');if(!D.tools.some(t=>t.id===id))throw Error('仪器不存在');loadout.push(id);}return {next:{...disk,loadout},delta:0};});renderPrepare();}catch(e){toast(e.message);}finally{busy=false;renderShop();}}
$('tools').onclick=e=>{if(e.target.closest('[data-open-shop]'))openShop();};$('btnFieldTools').onclick=()=>$('fieldToolsDialog').showModal();
$('btnShop').onclick=openShop;
$('instrumentTier').innerHTML='<option value="">全部档次</option>'+D.toolTiers.map((t,i)=>`<option value="${i}">${t}</option>`).join('');
$('instrumentTier').onchange=$('instrumentKind').onchange=()=>{shopPage=0;renderShop();};
$('shopPrev').onclick=()=>{shopPage--;renderShop();};$('shopNext').onclick=()=>{shopPage++;renderShop();};$('shopPageSelect').onchange=()=>{shopPage=+$('shopPageSelect').value;renderShop();};
addEventListener('resize',()=>{if($('instrumentDialog').open)renderShop();});
$('instrumentGrid').onclick=e=>{const buy=e.target.closest('[data-buy]'),equip=e.target.closest('[data-equip]');if(buy)buyInstrument(buy.dataset.buy);else if(equip)equipInstrument(equip.dataset.equip);};
$('activeInstrument').onchange=()=>{activeTool=$('activeInstrument').value;renderPlay();};
$('btnStart').onclick=()=>{if(session||busy)return;renderAdmission();screen('admission');scrollTo({top:0,behavior:'instant'});};
$('btnAdmissionBack').onclick=()=>{if(busy)return;screen('prepare');renderPrepare();};
$('btnConfirmEntry').onclick=async()=>{if(busy)return;const expectedVenue=state.venue,expectedHost=state.host;busy=true;$('btnConfirmEntry').disabled=true;try{await transaction('start-'+crypto.randomUUID(),(disk,bal)=>{if(disk.snapshot)throw Error('其他窗口已开始一场竞拍');if(disk.venue!==expectedVenue||disk.host!==expectedHost)throw Error('会场或搭档已在其他窗口更改，请核对后再确认');const venue=D.venues.find(v=>v.id===disk.venue);if(!venue||bal<venue.min+venue.entryFee)throw Error('余额不足：支付门票后需保留会场最低资金');const engine=E.createSession({budget:bal-venue.entryFee,entryFee:venue.entryFee,venue:disk.venue,host:disk.host,loadout:disk.loadout,stock:disk.instrumentStock,npcProfiles:disk.npcProfiles});engine.beginLot();return {next:{...disk,snapshot:engine.export()},delta:-venue.entryFee};});selected=null;renderPlay();scrollTo({top:0,behavior:'instant'});}catch(e){toast(e.message);await locked(()=>{const disk=recover();state=hydrate(disk);AuctionAudio.setEnabled(state.sound);$('btnSound').setAttribute('aria-pressed',String(state.sound));$('btnSound').setAttribute('aria-label',state.sound?'关闭音乐与音效':'开启音乐与音效');session=disk.snapshot?E.restore(disk.snapshot):null;});if(session){view=session.view();if(view.phase==='closed')await finishLegacy();else renderPlay();}}finally{busy=false;renderAdmission();}};
$('seats').onclick=e=>{if(e.target.closest('[data-bid-history]')){renderBidHistory();showDialog('bidHistoryDialog');}};
$('btnBid').onclick=openBid;$('btnPass').onclick=()=>submit(null);
$('bidForm').onsubmit=e=>{e.preventDefault();if(!$('bidConfirm').disabled)submit(Number(bidDraft));};
$('bidKeypad').onclick=e=>{const key=e.target.closest('button');if(!key)return;sound('key');
 if(key.dataset.digit!=null){const next=(bidDraft+key.dataset.digit).replace(/^0+/,'');if(next.length>12)return;bidDraft=next;}
 if(key.dataset.edit==='backspace')bidDraft=bidDraft.slice(0,-1);
 if(key.dataset.edit==='clear')bidDraft='';updateBidDisplay();
};
$('bidRecommend').onclick=()=>{const advice=AuctionRecommendation.recommend(view,wallet().balance);if(advice.amount===null||busy)return;bidDraft=String(advice.amount);updateBidDisplay();sound('key');};
$('bidPrevious').onclick=()=>{const last=previousPlayerBid();if(last===null)return;bidDraft=String(Math.ceil(last*13/10));updateBidDisplay();sound('key');};
$('vault').onclick=$('unlocatedIntel').onclick=e=>{const b=e.target.closest('[data-slot]');if(b){selected=+b.dataset.slot;renderPlay();}};$('selection').onclick=e=>{if(e.target.closest('#selectedCandidates'))openCatalog(selected);};
$('btnTool').onclick=async()=>{if(busy||roundPresentation()||!session)return;busy=true;const expected=session.view();try{await transaction(`consume-${expected.id}-${expected.round}`,(disk,bal)=>{const engine=E.restore(disk.snapshot),v=engine.view();if(roundPresentation(disk)||v.id!==expected.id||v.round!==expected.round||v.phase!=='bidding')throw Error('本轮已变化，请查看最新进度');engine.setBudget(bal);engine.useTool(activeTool);return {next:{...disk,instrumentStock:engine.view().stock,snapshot:engine.export()},delta:0};});$('fieldToolsDialog').close();renderPlay();sound('tool');}catch(e){toast(e.message);}finally{busy=false;}};$('btnCatalog').onclick=()=>openCatalog();$('filterCategory').onchange=$('filterQuality').onchange=renderCatalog;$('clearCandidate').onclick=()=>openCatalog();
$('btnSkipReveal').onclick=skipReveal;
$('btnSell').onclick=()=>settle('sell');$('btnKeep').onclick=()=>settle('keep');$('btnNext').onclick=()=>settle('none');$('resultDialog').addEventListener('cancel',e=>e.preventDefault());
$('navPrepare').onclick=()=>{if(session){toast('请先完成当前竞拍。');return;}screen('prepare');renderPrepare();};
$('btnRules').onclick=$('estimateInfo').onclick=()=>showDialog('rulesDialog');$('navCollection').onclick=$('btnMobileCollection').onclick=openCollection;
$('btnSound').onclick=async()=>{state.sound=!state.sound;state.soundPreference=true;AuctionAudio.setEnabled(state.sound);sound('key');$('btnSound').setAttribute('aria-pressed',String(state.sound));$('btnSound').setAttribute('aria-label',state.sound?'关闭音乐与音效':'开启音乐与音效');await save();toast(state.sound?'音乐与音效已开启':'音乐与音效已关闭');};
$('seriesTabs').onclick=e=>{const b=e.target.closest('[data-series]');if(b){cabinetSeries=b.dataset.series;renderCabinet();}};$('collectionFilter').onchange=$('collectionRarity').onchange=$('collectionSearch').oninput=renderCabinet;
$('collectionRarity').innerHTML='<option value="">全部稀有度</option>'+D.qualities.map((q,i)=>`<option value="${i}">${q.name}</option>`).join('');
$('collectionGrid').onclick=async e=>{const sell=e.target.closest('[data-sell]'),pin=e.target.closest('[data-pin]');if(sell)sellItem(+sell.dataset.sell);if(pin){const id=+pin.dataset.pin;if(state.pins.length>=6){toast('六个展位已满，先点击展示柜中的藏品腾出位置。');return;}if(!state.pins.includes(id))state.pins.push(id);await save();renderCabinet();}};$('showcase').onclick=async e=>{const b=e.target.closest('[data-unpin]');if(b){state.pins=state.pins.filter(id=>id!==+b.dataset.unpin);await save();renderCabinet();}};
for(const b of document.querySelectorAll('[data-play-tab]'))b.onclick=()=>{document.body.dataset.playTab=b.dataset.playTab;document.querySelectorAll('[data-play-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
for(const b of document.querySelectorAll('[data-prepare-tab]'))b.onclick=()=>{document.body.dataset.prepareTab=b.dataset.prepareTab;document.querySelectorAll('[data-prepare-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
addEventListener('message',async e=>{if(e.source!==parent||parent===window)return;const d=e.data||{};if(d.type===NS+':set-balance'&&Number.isFinite(d.balance)){putWallet(d.balance);balanceUI();if(!session)renderPrepare();}if(d.type===NS+':reset-command'){closeDialogs();session=null;view=null;state.snapshot=null;if(d.keepBalance!==true)putWallet(1000);await save();screen('prepare');renderPrepare();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderHostDaily();if(session&&state.roundPresentation)renderPlay();}});
addEventListener('focus',renderHostDaily);
addEventListener('storage',e=>{if(e.key===WALLET){balanceUI();if($('bidDialog').open)updateBidDisplay();if(!session)renderPrepare();}if(e.key===KEY&&!busy){const disk=read(KEY);if(disk&&!disk.pending){state=hydrate(disk);AuctionAudio.setEnabled(state.sound);$('btnSound').setAttribute('aria-pressed',String(state.sound));$('btnSound').setAttribute('aria-label',state.sound?'关闭音乐与音效':'开启音乐与音效');session=disk.snapshot?E.restore(disk.snapshot):null;if(session){view=session.view();if(view.phase==='closed')finishLegacy();else renderPlay();}else{if(view)closeDialogs();view=null;if(document.body.dataset.screen!=='admission')screen('prepare');renderPrepare();}if($('collectionDialog').open)renderCabinet();if($('instrumentDialog').open)renderShop();}}});
try{state=hydrate(recover());if(state.snapshot)session=E.restore(state.snapshot);}catch(e){toast(e.message);session=null;}
$('btnSound').setAttribute('aria-pressed',String(state.sound));
$('btnSound').setAttribute('aria-label',state.sound?'关闭音乐与音效':'开启音乐与音效');
AuctionAudio.setEnabled(state.sound);
AuctionPresentation.dragScroll($('clues'));
document.addEventListener('pointerdown',()=>AuctionAudio.setEnabled(state.sound),{capture:true});
document.addEventListener('keydown',()=>AuctionAudio.setEnabled(state.sound),{capture:true});
if(session){view=session.view();if(view.phase==='closed')finishLegacy();else{renderPlay();if(!view.active[0]&&view.phase==='bidding')setTimeout(autoFinish,400);}}else{screen('prepare');renderPrepare();}
syncCollectionRewards();
emit('ready');
window.AIRPAuction={version:E.VERSION,getView:()=>session?.view()||null,getBalance:()=>wallet().balance,getInstruments:()=>({stock:structuredClone(state.instrumentStock),loadout:[...state.loadout]}),getLedger:()=>session?.view().ledger||(state.lastAuction?[state.lastAuction]:[]),getCollection:()=>({inventory:structuredClone(state.inventory),collected:[...state.collected],pins:[...state.pins]})};
})();
