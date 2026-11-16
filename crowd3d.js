/* The path includes a pavement segment, a turn, and a walk through the doorway. */
function streetRoute(progress, index) {
  const entering=index%3!==2, fromLeft=index%2===0;
  const start=fromLeft?55:845, end=fromLeft?850:50;
  if(!entering)return {x:start+(end-start)*progress,z:60+(index%2)*35,angle:fromLeft?Math.PI/2:-Math.PI/2,visible:true};
  const turn=.68, walk=Math.min(progress/turn,1);
  if(progress<turn)return {x:start+(450-start)*walk,z:65,angle:fromLeft?Math.PI/2:-Math.PI/2,visible:true};
  const inward=(progress-turn)/(1-turn);
  return {x:450,z:65-195*inward,angle:Math.PI,visible:inward<.96};
}
(()=>{
  const scene=document.querySelector('.street-scene'),toggle=document.getElementById('streetToggle');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const world=document.createElement('div');world.className='street-world';scene.replaceChildren(world);
  function box(parent,w,h,d,x,y,z,color){
    const solid=document.createElement('div');solid.className='street-solid';solid.style.setProperty('--solid-color',color);
    solid.style.transform=`translate3d(${x}px,${y}px,${z}px)`;
    const faces=[['front',w,h,`translate3d(${-w/2}px,${-h/2}px,${d/2}px)`],['back',w,h,`translate3d(${-w/2}px,${-h/2}px,${-d/2}px) rotateY(180deg)`],['left',d,h,`translate3d(${-w/2-d/2}px,${-h/2}px,0) rotateY(-90deg)`],['right',d,h,`translate3d(${w/2-d/2}px,${-h/2}px,0) rotateY(90deg)`],['top',w,d,`translate3d(${-w/2}px,${-h/2-d/2}px,0) rotateX(90deg)`],['bottom',w,d,`translate3d(${-w/2}px,${h/2-d/2}px,0) rotateX(-90deg)`]];
    for(const [name,width,height,transform]of faces){const face=document.createElement('div');face.className='street-face '+name;Object.assign(face.style,{width:width+'px',height:height+'px',transform,transformOrigin:'50% 50%'});solid.append(face)}
    parent.append(solid);return solid;
  }
  // Raised pavement, warm shop interior, solid walls around an open doorway.
  box(world,850,12,230,450,252,-5,'#9a8873');
  for(let x=70;x<870;x+=70)box(world,1,1,225,x,245,-5,'#bba58b');
  box(world,300,170,10,450,160,-145,'#80583c');
  box(world,12,170,110,300,160,-95,'#b98b62');box(world,12,170,110,600,160,-95,'#b98b62');
  box(world,112,170,12,356,160,-40,'#cfaa7b');box(world,112,170,12,544,160,-40,'#cfaa7b');
  box(world,76,44,12,450,97,-40,'#75492e');
  box(world,320,16,132,450,69,-91,'#573b2b');
  box(world,310,17,42,450,119,-20,'#ba642f');
  for(let x=304;x<600;x+=24)box(world,12,18,43,x,120,-19,'#eed5ab');
  box(world,88,4,108,450,242,-88,'#bc8c59');
  const sign=document.createElement('div');sign.className='street-sign';sign.innerHTML='炙 餃<small>ZHI JIAO</small>';world.append(sign);
  for(const name of ['street-window','street-door']){const el=document.createElement('div');el.className=name;world.append(el)}
  // Planters give the storefront a clear foreground and scale reference.
  for(const x of [279,621]){box(world,26,28,26,x,230,-18,'#865638');box(world,35,28,32,x,205,-18,'#647655')}
  const colors=['#c7834c','#829788','#dec09b','#b55e3e','#8b839e','#b7a37c','#617d8a'];
  const actors=colors.map((color,index)=>{
    const el=document.createElement('div');el.className='street-actor';world.append(el);
    const shadow=document.createElement('div');shadow.className='street-shadow';el.append(shadow);
    box(el,19,27,13,0,30,0,color);box(el,15,17,15,0,7,0,'#d5aa86');box(el,16,6,16,0,-3,0,'#3e3028');
    const limbs=[];
    for(const side of [-1,1]){
      for(const arm of [false,true]){
        const limb=document.createElement('div');limb.className='street-limb';el.append(limb);
        const x=side*(arm?13:5),y=arm?19:44;
        box(limb,arm?6:7,arm?25:24,arm?7:8,0,12,0,arm?color:'#4b4541');
        box(limb,arm?6:8,arm?7:5,arm?7:14,0,25,arm?0:3,arm?'#d5aa86':'#302b28');
        limbs.push({el:limb,x,y,side,arm});
      }
    }
    if(index%2===0)box(el,13,16,9,17,48,0,'#e6c493');
    return {el,limbs,index};
  });
  let elapsed=0,last=null,paused=false,frame;
  function resize(){const scale=Math.min(scene.clientWidth/930,1.12);world.style.transform=`translateX(-50%) scale(${scale}) rotateX(-13deg) rotateY(-15deg)`}
  resize();window.addEventListener('resize',resize);
  toggle.addEventListener('click',()=>{paused=!paused;toggle.setAttribute('aria-pressed',String(paused));toggle.setAttribute('aria-label',paused?'播放3D人群動畫':'暫停3D人群動畫');toggle.textContent=paused?'播放動畫':'暫停動畫'});
  function render(now){
    const delta=last===null?0:Math.min(now-last,64);last=now;
    if(!paused&&!document.hidden)elapsed+=delta;
    for(const actor of actors){
      const duration=(16000+actor.index*1200)*(reduced.matches?2:1);
      const progress=(elapsed/duration+actor.index/actors.length)%1;
      const path=streetRoute(progress,actor.index);
      const stride=reduced.matches?0:Math.sin(elapsed/150+actor.index)*28;
      actor.el.style.visibility=path.visible?'visible':'hidden';
      actor.el.style.transform=`translate3d(${path.x}px,175px,${path.z}px) rotateY(${path.angle}rad)`;
      for(const limb of actor.limbs)limb.el.style.transform=`translate3d(${limb.x}px,${limb.y}px,0) rotateX(${stride*limb.side*(limb.arm?-1:1)}deg)`;
    }
    frame=requestAnimationFrame(render);
  }
  frame=requestAnimationFrame(render);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  window.addEventListener('pageshow',event=>{if(event.persisted){last=null;frame=requestAnimationFrame(render)}});
})();
