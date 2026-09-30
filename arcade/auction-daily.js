/* Host P&L uses settlement value, not cash movement. One UTC+8 noon-to-noon day. */
((root)=>{
'use strict';
const DAY=86400000,OFFSET=4*3600000;
function dayKey(now=Date.now()){return new Date(now-OFFSET).toISOString().slice(0,10);}
function read(saved,now=Date.now()){
 const today=dayKey(now),day=typeof saved?.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(saved.day)&&saved.day>today?saved.day:today;
 return {day,totals:saved?.day===day?{...saved.totals}:{}};
}
// Call only inside the existing receipt-guarded wallet transaction.
function record(saved,results,now=Date.now()){
 const next=read(saved,now),seen=new Set();
 for(const result of results){
  if(!Number.isInteger(result.host)||!Number.isSafeInteger(result.net)||seen.has(result.host))throw Error('Invalid host settlement');
  seen.add(result.host);const old=next.totals[result.host];
  const net=(Number.isSafeInteger(old?.net)?old.net:0)+result.net;
  if(!Number.isSafeInteger(net))throw Error('Host daily P&L overflow');
  next.totals[result.host]={net,lastNet:result.net,auctions:(Number.isSafeInteger(old?.auctions)?old.auctions:0)+1};
 }
 return next;
}
function untilReset(now=Date.now()){return DAY-((now-OFFSET)%DAY+DAY)%DAY;}
root.AuctionDaily=Object.freeze({dayKey,read,record,untilReset});
})(globalThis);
