/* Procedural UI sounds and a local, sequential two-track music playlist. */
(()=>{
'use strict';
// The rotated mobile shell owns no audio; only its game iframe does.
if(globalThis.auctionLandscapeHost)return;
const assetBase=new URL('assets/auction/audio/',document.currentScript.src);
const tracks=['treasure-hunt-groove-01.mp3','treasure-hunt-groove-02.mp3'];
let music,track=0,pendingPlay=null,pageActive=true;
const audible=()=>enabled&&!document.hidden&&pageActive;
function startMusic(){
 if(!audible())return;
 if(!music){
  music=new Audio();music.preload='none';music.volume=1;music.loop=false;
  music.src=new URL(tracks[track],assetBase).href;
  music.addEventListener('ended',()=>{
   track=(track+1)%tracks.length;
   pendingPlay=null;
   music.src=new URL(tracks[track],assetBase).href;
   startMusic();
  });
 }
 if(!music.paused||pendingPlay)return;
 // A rejected autoplay request is retried on the next real interaction.
 const request={};pendingPlay=request;
 try{
  Promise.resolve(music.play()).then(()=>{if(!audible())music.pause();}).catch(()=>{}).finally(()=>{
   if(pendingPlay===request)pendingPlay=null;
  });
 }catch{pendingPlay=null;}
}
function pauseMusic(){if(music)music.pause();pendingPlay=null;}

let context,master,enabled=false;const voices=new Set();
function unlock(){
 if(!audible())return;
 startMusic();
 try{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;
  if(!context){context=new C();master=context.createGain();master.gain.value=.55;master.connect(context.destination);}
  if(context.state==='suspended')context.resume().catch(()=>{});
 }catch{}
}
function stop(){pauseMusic();for(const o of voices){try{o.stop();}catch{}}voices.clear();}
function setEnabled(value){enabled=!!value;if(enabled)unlock();else stop();}
function tone(frequency,time,duration,volume=.12,type='sine',end=frequency){
 const o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.setValueAtTime(frequency,time);o.frequency.exponentialRampToValueAtTime(Math.max(30,end),time+duration);
 g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.008);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
 o.connect(g);g.connect(master);voices.add(o);o.onended=()=>{voices.delete(o);o.disconnect();g.disconnect();};o.start(time);o.stop(time+duration+.02);
}
function play(kind='submit',quality=0){
 if(!enabled||document.hidden)return;unlock();if(!context||context.state!=='running')return;
 const t=context.currentTime+.006;
 switch(kind){
  case 'key':tone(720,t,.045,.07,'triangle',560);break;
  case 'npc':tone(390,t,.11,.095,'sine',510);tone(680,t+.07,.10,.04);break;
  case 'round':[440,554,659].forEach((f,i)=>tone(f,t+i*.075,.22,.08));break;
  case 'hammer':tone(110,t,.19,.25,'triangle',42);tone(1300,t,.045,.045,'square',180);break;
  case 'tool':[360,720,1080].forEach((f,i)=>tone(f,t+i*.07,.16,.07,'triangle'));break;
  case 'purchase':[660,880].forEach((f,i)=>tone(f,t+i*.09,.25,.09));break;
  case 'reveal':{const base=quality>=3?660:440;tone(170,t,.09,.08,'triangle',70);[1,1.25,1.5,...(quality>=3?[2]:[])].forEach((r,i)=>tone(base*r,t+.04+i*.065,.3,.075));break;}
  case 'finish':case 'win':[523,659,784,1046].forEach((f,i)=>tone(f,t+i*.10,.38,.09));break;
  default:tone(300,t,.10,.1,'triangle',420);tone(600,t+.075,.17,.075);break;
 }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else unlock();});
addEventListener('pagehide',()=>{pageActive=false;stop();});
addEventListener('pageshow',()=>{pageActive=true;unlock();});
globalThis.AuctionAudio=Object.freeze({setEnabled,unlock,play,stop});
})();
