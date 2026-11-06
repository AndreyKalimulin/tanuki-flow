// Patch matching elements in place: inputs, scroll inertia and active gestures survive.
export const ease='cubic-bezier(.22,1,.36,1)';
export const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function identity(node){
  if(node.nodeType!==1)return `node:${node.nodeType}`;
  const d=node.dataset;
  return `${node.tagName}:${node.id||d.key||d.scroll||d.wheel||d.product||
    (d.action?`${d.action}:${d.id||d.mode||d.index||d.delta||d.category||d.query||''}`:
      node.classList[0]||'')}`;
}
function update(old,next){
  if(old.nodeType!==1){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return;}
  for(const attr of [...old.attributes]){
    if(!next.hasAttribute(attr.name)&&attr.name!=='style'&&!attr.name.startsWith('data-ui-'))old.removeAttribute(attr.name);
  }
  for(const attr of [...next.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  if(old.tagName==='INPUT'){
    if(old.value!==next.value)old.value=next.value;
    return;
  }
  reconcile(old,next);
}
function reconcile(root,next){
  const available=[...root.childNodes],used=new Set();
  let cursor=root.firstChild;
  for(const desired of [...next.childNodes]){
    const key=identity(desired);
    const found=available.find(n=>!used.has(n)&&identity(n)===key);
    if(found){
      used.add(found);
      if(found!==cursor)root.insertBefore(found,cursor);
      update(found,desired);
      cursor=found.nextSibling;
    }else{
      root.insertBefore(desired,cursor);
    }
  }
  for(const old of available)if(!used.has(old))old.remove();
}
export function patch(root,html){
  const next=document.createElement('template');next.innerHTML=html;
  reconcile(root,next.content);
}

// Each element owns one finite animation; replacing its target samples the visible pose first.
const owners=new WeakMap();
export function freezeMotion(el){
  const owner=owners.get(el);if(!owner)return;
  const style=getComputedStyle(el),pose={};
  for(const property of owner.properties)pose[property]=style[property];
  owner.cancel();for(const [property,value] of Object.entries(pose))el.style[property]=value;
}
export function motion(el,frames,options,onDone=()=>{}){
  if(!el){onDone();return Promise.resolve();}
  const previous=owners.get(el);
  if(previous){
    const style=getComputedStyle(el),first={...frames[0]};
    for(const property of Object.keys(first))first[property]=style[property];
    frames=[first,...frames.slice(1)];
    previous.cancel();
  }
  if(reducedMotion()||document.hidden||!el.animate){onDone();return Promise.resolve();}
  let animation,resolve,settled=false;
  const promise=new Promise(r=>resolve=r);
  const finish=()=>{
    if(settled)return;settled=true;
    if(owners.get(el)===owner){owners.delete(el);delete el.dataset.uiAnimating;}
    if(options.fill==='forwards')for(const [key,value] of Object.entries(frames.at(-1)))if(!['offset','easing','composite'].includes(key))el.style[key]=value;
    animation?.cancel();onDone();resolve();
  };
  const owner={properties:Object.keys(frames[0]).filter(k=>!['offset','easing','composite'].includes(k)),cancel(){if(settled)return;settled=true;animation?.cancel();delete el.dataset.uiAnimating;owners.delete(el);resolve();},finish};
  owners.set(el,owner);el.dataset.uiAnimating='1';
  animation=el.animate(frames,{easing:ease,...options});
  animation.finished.then(finish,()=>{if(!settled)finish();});
  // No focus/blur teardown: changing tabs or keyboard focus must not interrupt visible motion.
  return promise;
}
