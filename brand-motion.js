import { motion, freezeMotion, reducedMotion } from './ui.js';

const brandOwners=new WeakMap(),panelOwners=new WeakMap();
const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};
const relative=(r,parent)=>({...r,left:r.left-parent.left,top:r.top-parent.top});
const textStyle=style=>({fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,color:style.color});

// Capture the drawn layers, including an interrupted transfer, before changing layout.
export function captureBrand(node,destination=false){
  if(!node)return null;
  const owner=brandOwners.get(node);if(owner&&!destination)return owner.capture(node);
  const rect=box(node),style=getComputedStyle(node),brand=node.classList.contains('brand');
  const compact=brand&&getComputedStyle(node.querySelector('.compact-logo')).display!=='none';
  const background={...rect,height:compact?56:rect.height};
  const layers=[];
  if(brand){
    const image=node.querySelector(compact?'.compact-logo':'.brand-logo');
    layers.push({key:`image:${image.getAttribute('src')}`,type:'image',src:image.getAttribute('src'),bounds:relative(box(image),background),opacity:1});
    const caption=node.querySelector('span'),captionStyle=textStyle(getComputedStyle(caption));
    layers.push({key:`caption:${caption.textContent}:${captionStyle.fontSize}:${captionStyle.fontWeight}`,type:'text',text:caption.textContent,style:captionStyle,bounds:relative(box(caption),background),opacity:1});
    const badge=node.querySelector('.pickup-badge');
    if(badge&&getComputedStyle(badge).display!=='none'){
      const badgeStyle=getComputedStyle(badge);
      layers.push({key:'badge',type:'text',text:badge.textContent,style:{...textStyle(badgeStyle),background:badgeStyle.backgroundColor,borderRadius:badgeStyle.borderRadius,padding:badgeStyle.padding},bounds:relative(box(badge),background),opacity:1});
    }
  }else layers.push({key:`image:${node.getAttribute('src')}`,type:'image',src:node.getAttribute('src'),bounds:{left:0,top:0,width:rect.width,height:rect.height},opacity:1});
  return {node,kind:brand?(compact?'compact':'full'):'symbol',background,color:brand?style.getPropertyValue('--brand-bg').trim():'red',radius:compact?'12px':style.borderRadius||'8px',layers,owner:null};
}

function hiddenBounds(layer,pose,destination){
  const image=destination.layers.find(item=>item.type==='image');
  // Full and compact cards share a graphic slot. Their SVGs and labels dissolve
  // independently; the nav symbol instead starts as the source square house sign.
  if(layer.type==='image'&&pose.kind!=='symbol'&&destination.kind!=='symbol'&&image)return {...image.bounds};
  if(layer.type==='image'&&pose.kind==='symbol'&&destination.kind!=='symbol')return {left:0,top:(destination.background.height-destination.background.width)/2,width:destination.background.width,height:destination.background.width};
  const counterpart=destination.layers.find(item=>item.type===layer.type&&item.key.startsWith(layer.key.split(':')[0]+':'));
  if(layer.type==='text'&&pose.kind!=='symbol'&&destination.kind!=='symbol'&&counterpart)return {...counterpart.bounds};
  const scale=destination.background.width/pose.background.width;
  return {left:layer.bounds.left*scale,top:layer.bounds.top*scale,width:layer.bounds.width*scale,height:layer.bounds.height*scale};
}

// One controller owns all common-brand layers, so a new transfer can sample and
// replace the current pose without leaving a duplicate source logo behind.
export function morphBrand(from,to,{host,base,duration,onDone=()=>{}}){
  if(!from||!to){onDone();return;}
  from.owner?.cancel();to.owner?.cancel();
  const ghost=document.createElement('div');ghost.className='brand-flight';ghost.setAttribute('aria-hidden','true');
  ghost.style.cssText='position:absolute;display:block;background:transparent;overflow:visible;pointer-events:none;transform:none;';
  const background=document.createElement('div');background.style.cssText='position:absolute;inset:0;background:inherit;border-radius:inherit;pointer-events:none;';ghost.append(background);
  host.append(ghost);
  const sourceVisibility=from.node?.style.visibility??'',targetVisibility=to.node?.style.visibility??'';
  if(from.node)from.node.style.visibility='hidden';if(to.node)to.node.style.visibility='hidden';
  const visuals=[],keys=new Set([...from.layers,...to.layers].map(layer=>layer.key));
  for(const key of keys){
    const first=from.layers.find(layer=>layer.key===key),last=to.layers.find(layer=>layer.key===key),layer=first||last;
    const start=first?.bounds||hiddenBounds(last,to,from),end=last?.bounds||hiddenBounds(first,from,to);
    const element=document.createElement(layer.type==='image'?'img':'div');element.className='brand-motion-layer';element.dataset.brandLayer=key;
    element.style.cssText='position:absolute;margin:0;padding:0;max-width:none;pointer-events:none;transform-origin:top left;';
    if(layer.type==='image'){element.src=layer.src;element.alt='';element.style.objectFit='contain';}
    else {
      const text=document.createElement('span');text.textContent=layer.text;
      text.style.cssText='display:block;white-space:nowrap;text-align:center;margin:0;box-sizing:border-box;';Object.assign(text.style,layer.style);
      const original=layer.baseBounds||layer.bounds;
      element.append(text);Object.assign(element.style,{width:`${original.width}px`,height:`${original.height}px`});
      text.style.width='100%';text.style.height='100%';
    }
    ghost.append(element);visuals.push({element,layer,start,end,firstOpacity:first?.opacity??0,lastOpacity:last?.opacity??0});
  }
  let settled=false,unmountObserver;
  const cleanup=()=>{
    if(settled)return;settled=true;
    for(const node of [from.node,to.node])if(node&&brandOwners.get(node)===controller)brandOwners.delete(node);
    // An outgoing page may still be fading when a fast reverse cancels this
    // transfer. Its source logo must stay hidden beneath the replacement ghost.
    if(from.node&&(from.node===to.node||!from.node.closest('#page-motion-host')))from.node.style.visibility=sourceVisibility;
    if(to.node)to.node.style.visibility=targetVisibility;
    unmountObserver?.disconnect();ghost.remove();onDone();
  };
  const controller={capture(node){
    const rect=box(ghost),computed=getComputedStyle(ghost);
    return {node,kind:to.kind,background:rect,color:computed.backgroundColor,radius:computed.borderRadius,owner:controller,layers:visuals.map(({element,layer})=>({...layer,baseBounds:layer.baseBounds||layer.bounds,bounds:relative(box(element),rect),opacity:Number(getComputedStyle(element).opacity)}))};
  },cancel(){for(const el of [ghost,...visuals.map(v=>v.element)])freezeMotion(el);cleanup();}};
  for(const node of [from.node,to.node])if(node)brandOwners.set(node,controller);
  if(typeof MutationObserver!=='undefined'&&to.node){
    unmountObserver=new MutationObserver(()=>{if(!to.node.isConnected)controller.cancel();});
    unmountObserver.observe(host.parentElement,{childList:true,subtree:true});
  }
  const rectFrame=(rect,pose)=>({left:`${rect.left-base.left}px`,top:`${rect.top-base.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,borderRadius:pose.radius,backgroundColor:pose.color});
  const jobs=[motion(ghost,[rectFrame(from.background,from),rectFrame(to.background,to)],{duration,fill:'forwards'})];
  for(const {element,layer,start,end,firstOpacity,lastOpacity} of visuals){
    const original=layer.baseBounds||layer.bounds;
    const frame=(bounds,opacity)=>({left:`${bounds.left}px`,top:`${bounds.top}px`,opacity,...(layer.type==='image'?{width:`${bounds.width}px`,height:`${bounds.height}px`}:{transform:`scale(${bounds.width/original.width},${bounds.height/original.height})`})});
    jobs.push(motion(element,[frame(start,firstOpacity),frame(end,lastOpacity)],{duration,fill:'forwards'}));
  }
  Promise.all(jobs).then(cleanup);
  return controller;
}

// A resize changes the live CSS target. Retarget the remaining part of the same
// transition, rather than ending at a stale pixel height and jumping afterwards.
export function animatePromotionPanel(panel,pose,duration){
  if(!panel)return null;
  if(!pose){
    const captured={height:panel.getBoundingClientRect().height,transform:getComputedStyle(panel).transform};
    panelOwners.get(panel)?.cancel();freezeMotion(panel);return captured;
  }
  panelOwners.get(panel)?.cancel();
  let stopped=false,generation=0,observer;
  const deadline=performance.now()+duration,parent=panel.parentElement;
  let parentSize=box(parent);
  const controller={cancel(preservePose=true){if(stopped)return;stopped=true;observer?.disconnect();if(panelOwners.get(panel)===controller)panelOwners.delete(panel);if(preservePose)freezeMotion(panel);}};
  const finish=()=>{if(stopped)return;stopped=true;observer?.disconnect();if(panelOwners.get(panel)===controller)panelOwners.delete(panel);panel.style.height='';panel.style.transform='';panel.style.transition='';};
  panelOwners.set(panel,controller);
  const play=current=>{
    const token=++generation;freezeMotion(panel);
    panel.style.height='';panel.style.transform='';panel.style.transition='none';const target=panel.offsetHeight;
    const remaining=token===1?duration:Math.max(0,deadline-performance.now());
    motion(panel,[{height:`${current.height}px`,transform:current.transform},{height:`${target}px`,transform:'translateY(0)'}],{duration:remaining,fill:'forwards'},()=>{if(generation===token)finish();}).then(()=>{if(!stopped&&generation===token)controller.cancel(false);});
  };
  if(!reducedMotion()&&!document.hidden&&typeof ResizeObserver!=='undefined'){
    observer=new ResizeObserver(()=>{
      const next=box(parent);if(stopped||next.height===parentSize.height&&next.width===parentSize.width)return;parentSize=next;
      play({height:panel.getBoundingClientRect().height,transform:getComputedStyle(panel).transform});
    });observer.observe(parent);
  }
  play(pose);return controller;
}
