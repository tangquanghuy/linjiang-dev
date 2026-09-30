/* Standalone phones use the same landscape viewport as the arcade shell.
   Rotate the iframe, not the game DOM: dialogs and touch coordinates stay native.
   Keep one child alive across orientation changes, including an open reveal. */
(()=>{
 if(window.parent!==window || !(matchMedia('(pointer: coarse)').matches || Math.min(innerWidth,innerHeight)<=600))return;
 window.auctionLandscapeHost=true;
 document.addEventListener('DOMContentLoaded',()=>{
  const frame=document.createElement('iframe');
  frame.id='auctionLandscapeFrame';frame.title='临江拍卖行';
  frame.src=location.href;frame.allow='fullscreen';
  document.body.replaceChildren(frame);
  Object.assign(document.body.style,{margin:'0',overflow:'hidden',background:'#171b1c'});
  Object.assign(frame.style,{position:'fixed',border:'0',maxWidth:'none',maxHeight:'none',left:'50%',top:'50%',transformOrigin:'center'});
  function fit(){
   const portrait=innerHeight>innerWidth;
   frame.style.width=(portrait?innerHeight:innerWidth)+'px';
   frame.style.height=(portrait?innerWidth:innerHeight)+'px';
   frame.style.transform=`translate(-50%,-50%)${portrait?' rotate(-90deg)':''}`;
   document.documentElement.classList.toggle('auction-force-landscape',portrait);
  }
  fit();addEventListener('resize',fit);addEventListener('orientationchange',fit);
 });
})();
