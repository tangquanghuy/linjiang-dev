/* Deterministic advisory estimate. Input is the player's sanitized view only. */
(function(root){
'use strict';
const D=root.AuctionData,I=root.AuctionIntel;
const qualityCounts=D.qualities.map((_,q)=>D.catalog.filter(c=>c.quality===q).length);
function recommend(view,balance){
 const none={amount:null,estimate:0,riskReserve:0,costs:0};
 if(!view||view.phase!=='bidding'||!view.active?.[0]||!view.items?.length||!Number.isFinite(balance)||balance<1)return none;
 const venue=D.venues.find(v=>v.id===view.venue);if(!venue)return none;
 const scale=Number.isFinite(view.scale)&&view.scale>0?view.scale:1;
 // Ignore supplied prices, result, opponent data and history. Catalog prices are public.
 const items=view.items.map(({slot,w,h,quality,category,identified})=>({slot,w,h,quality,category,identified}));
 let mean=0,variance=0;
 for(const item of items){
  const pool=I.candidates(item);if(!pool.length)return none;
  const weighted=pool.map(c=>({price:D.catalogPrice(c,scale,view.pricingVersion),weight:venue.rarity[c.quality]/qualityCounts[c.quality]}));
  const total=weighted.reduce((n,c)=>n+c.weight,0);if(!(total>0))return none;
  const expected=weighted.reduce((n,c)=>n+c.price*c.weight,0)/total;
  mean+=expected;variance+=weighted.reduce((n,c)=>n+c.weight*(c.price-expected)**2,0)/total;
 }
 // Aggregate facts constrain the range, not the unseen inventory. This is an
 // approximation, not a posterior conditioned on grid packing or all statistics.
 const {low,high}=I.bounds(items,view.facts||[],scale,view.pricingVersion);
 if(!Number.isFinite(low)||!Number.isFinite(high)||low>high)return none;
 mean=Math.max(low,Math.min(high,mean));
 const riskReserve=Math.min(.35*Math.sqrt(variance),Math.max(0,mean-low));
 const costs=Math.max(0,view.entryFee||0)+Math.max(0,view.instrumentCost||0);
 // 12% margin after uncertainty, with already-paid costs included for net-value accounting.
 const ceiling=Math.min(Math.floor(balance),Math.floor((mean-riskReserve)*.88-costs));
 const step=ceiling>=1000?10:ceiling>=100?5:1;
 return {amount:ceiling>=1?Math.floor(ceiling/step)*step:null,estimate:Math.round(mean),riskReserve:Math.round(riskReserve),costs};
}
root.AuctionRecommendation=Object.freeze({recommend});
})(globalThis);
