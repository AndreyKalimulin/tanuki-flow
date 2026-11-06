// A visual mouse pointer only: native hit testing, selection and scrolling stay intact.
const fineMouse=window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
const root=document.documentElement;

if('PointerEvent' in window&&!document.getElementById('flow-pointer')){
  const pointer=document.createElement('div');
  pointer.id='flow-pointer';pointer.hidden=true;pointer.setAttribute('aria-hidden','true');
  const dot=document.createElement('span');dot.className='flow-pointer__dot';pointer.append(dot);
  document.body.append(pointer);
  const minimumPress=130;
  let nativeDrag=false,mouseDown=false,pressedUntil=0,releaseTimer=0;

  const hide=()=>{
    clearTimeout(releaseTimer);releaseTimer=0;mouseDown=false;pressedUntil=0;
    pointer.hidden=true;delete pointer.dataset.pressed;
    root.removeAttribute('data-flow-pointer');
  };
  const reset=()=>{nativeDrag=false;hide();};
  const updatePress=(pressed,startPress)=>{
    clearTimeout(releaseTimer);releaseTimer=0;mouseDown=pressed;
    if(startPress)pressedUntil=performance.now()+minimumPress;
    const remaining=pressedUntil-performance.now();
    pointer.dataset.pressed=String(pressed||remaining>0);
    if(!pressed&&remaining>0)releaseTimer=setTimeout(function release(){
      releaseTimer=0;
      if(mouseDown||pointer.hidden)return;
      const wait=pressedUntil-performance.now();
      if(wait>0)releaseTimer=setTimeout(release,Math.ceil(wait));
      else pointer.dataset.pressed='false';
    },Math.ceil(remaining));
  };
  const show=(event,pressed=event.buttons!==0,startPress=false)=>{
    const {clientX:x,clientY:y}=event;
    if(event.pointerType!=='mouse'||!fineMouse.matches||nativeDrag||document.hidden||!document.hasFocus()||document.pointerLockElement||
      !Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=innerWidth||y>=innerHeight){hide();return;}
    // Position is written synchronously; only the inner press scale is animated.
    pointer.style.transform=`translate3d(${x}px,${y}px,0)`;
    updatePress(pressed,startPress);pointer.hidden=false;
    root.setAttribute('data-flow-pointer','mouse');
  };
  const passiveCapture={passive:true,capture:true};
  document.addEventListener('pointermove',event=>show(event),passiveCapture);
  document.addEventListener('pointerover',event=>show(event),passiveCapture);
  document.addEventListener('pointerdown',event=>show(event,true,true),passiveCapture);
  document.addEventListener('pointerup',event=>show(event,false),passiveCapture);
  document.addEventListener('pointercancel',reset,passiveCapture);
  document.addEventListener('pointerout',event=>{if(!event.relatedTarget)reset();},passiveCapture);
  document.addEventListener('dragstart',()=>{nativeDrag=true;hide();},passiveCapture);
  document.addEventListener('dragend',reset,passiveCapture);
  document.addEventListener('contextmenu',hide,passiveCapture);
  document.addEventListener('visibilitychange',reset);
  document.addEventListener('pointerlockchange',reset);
  window.addEventListener('blur',reset);
  window.addEventListener('focus',reset);
  window.addEventListener('pagehide',reset);
  window.addEventListener('resize',reset,{passive:true});
  window.visualViewport?.addEventListener('resize',reset,{passive:true});
  window.visualViewport?.addEventListener('scroll',reset,{passive:true});
  if(fineMouse.addEventListener)fineMouse.addEventListener('change',reset);
  else fineMouse.addListener(reset);
}
