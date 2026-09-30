/* One-time collection rewards, credited to the existing shared arcade token wallet.
   The wallet write commits both balance and receipts atomically. Profile receipts
   are a second copy, repaired on retry; collecting/selling never removes them. */
(()=>{
'use strict';
if(globalThis.auctionLandscapeHost)return;
const TOKEN='airp_arcade_tokens_v1',PROFILE='airp_arcade_token_progress_v1';
const catalog=AuctionData.catalog;
const read=key=>{const raw=localStorage.getItem(key);if(raw===null)return {};const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid token save');return value;};
const count=value=>Math.max(0,Math.floor(Number(value)||0));
const receipts=(w,p)=>({...p.auctionCollectionClaims,...w.auctionCollectionClaims});
const earned=claims=>catalog.reduce((sum,item)=>sum+(claims[item.key]?item.quality+1:0),0);
function progress(){const claims=receipts(read(TOKEN),read(PROFILE));return {earned:earned(claims),total:catalog.reduce((sum,c)=>sum+c.quality+1,0),claimed:catalog.filter(c=>claims[c.key]).map(c=>c.key)};}
function commit(ids){
 const w=read(TOKEN),p=read(PROFILE),claims=receipts(w,p),collected=new Set(ids);
 const items=catalog.filter(c=>collected.has(c.id)&&!claims[c.key]);
 const amount=items.reduce((sum,c)=>sum+c.quality+1,0);
 for(const c of items)claims[c.key]=c.quality+1;
 const total=earned(claims);
 // No changes for new players with an empty collection.
 if(!total)return {amount:0,items:[]};
 const next={...w,balance:count(w.balance)+amount,totalEarned:count(w.totalEarned)+amount,auctionCollectionClaims:claims,updatedAt:Date.now()};
 // setItem either commits the whole record or throws; never mark claimed first.
 if(amount||JSON.stringify(w.auctionCollectionClaims)!==JSON.stringify(claims))localStorage.setItem(TOKEN,JSON.stringify(next));
 const nextProfile={...p,auctionCollectionClaims:claims,auctionCollectionEarned:total,earned:{...p.earned,auction:count(p.earned?.auction)+Math.max(0,total-count(p.auctionCollectionEarned))}};
 if(JSON.stringify(nextProfile)!==JSON.stringify(p))localStorage.setItem(PROFILE,JSON.stringify(nextProfile));
 if(amount)dispatchEvent(new CustomEvent('airp-token:update',{detail:next}));
 return {amount,items:items.map(c=>c.key)};
}
function claim(ids=[]){const run=()=>commit(ids);return navigator.locks?navigator.locks.request('airp-arcade-tokens-v1',run):Promise.resolve().then(run);}
globalThis.AuctionRewards=Object.freeze({claim,progress});
})();
