/* orim · minimap.js
 * A small overview that shows up while you pan or zoom and fades out when you stop.
 * Click or drag in it to move the view. Hovering keeps it open.
 */
'use strict';
const Mini=(()=>{
  const W=200,H=128;
  const el=document.createElement('div'); el.className='minimap island'; el.setAttribute('aria-hidden','true');
  const cv=document.createElement('canvas'); el.appendChild(cv); boardPane.appendChild(el);
  let last=null, hideT=0, raf=0, hover=false, drag=false, map=null;
  function css(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function show(){ el.classList.add('on'); clearTimeout(hideT); if(!hover&&!drag) hideT=setTimeout(()=>el.classList.remove('on'),1400); }
  function draw(){
    raf=0; const m=state.model; if(!m||!el.classList.contains('on')) return;
    const dpr=Math.min(2,window.devicePixelRatio||1); cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px';
    const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
    const r=boardRect(), v=state.view; const vw={x:-v.x/v.z,y:-v.y/v.z,w:r.width/v.z,h:r.height/v.z};
    const cb=contentBounds(m)||vw;
    let x0=Math.min(cb.x,vw.x),y0=Math.min(cb.y,vw.y),x1=Math.max(cb.x+cb.w,vw.x+vw.w),y1=Math.max(cb.y+cb.h,vw.y+vw.h);
    const pad=40; x0-=pad; y0-=pad; x1+=pad; y1+=pad;
    // While you drag in the minimap its frame stays put, so the view follows the pointer smoothly.
    if(!(drag&&map)){ const sc=Math.min((W-12)/(x1-x0),(H-12)/(y1-y0)); map={s:sc,ox:(W-(x1-x0)*sc)/2-x0*sc,oy:(H-(y1-y0)*sc)/2-y0*sc}; }
    const {s,ox,oy}=map;
    const X=x=>x*s+ox, Y=y=>y*s+oy;
    const line=css('--line-strong')||'#bbb', panel=css('--panel')||'#fff', ink=css('--muted')||'#777', acc=css('--accent')||'#4262ff';
    for(const b of (state.boxes||new Map()).values()){ g.fillStyle=panel; g.strokeStyle=line; g.lineWidth=1; g.fillRect(X(b.x),Y(b.y),b.w*s,b.h*s); g.strokeRect(X(b.x)+.5,Y(b.y)+.5,b.w*s,b.h*s); }
    for(const im of m.images||[]){ g.fillStyle=line; g.globalAlpha=.5; g.fillRect(X(im.x),Y(im.y),im.w*s,im.h*s); g.globalAlpha=1; }
    for(const n of m.nodes.values()){ if(n.x==null) continue; const st=styleOf(m,n.id);
      if(n.shape==='table'||n.shape==='doc'){ g.fillStyle=panel; g.strokeStyle=ink; g.globalAlpha=.9; g.fillRect(X(n.x),Y(n.y),n.w*s,n.h*s); g.strokeRect(X(n.x)+.5,Y(n.y)+.5,n.w*s,n.h*s); g.globalAlpha=1; continue; }
      g.fillStyle=n.shape==='sticky'?((st&&st.fill)||'#fff9b1'):n.shape==='icon'?acc:((st&&st.fill)||ink);
      g.globalAlpha=n.shape==='sticky'||n.shape==='icon'?.9:.55; g.fillRect(X(n.x),Y(n.y),Math.max(2,n.w*s),Math.max(2,n.h*s)); g.globalAlpha=1; }
    g.strokeStyle=acc; g.lineWidth=1.5; g.fillStyle=acc; g.globalAlpha=.1; g.fillRect(X(vw.x),Y(vw.y),vw.w*s,vw.h*s); g.globalAlpha=1;
    g.strokeRect(X(vw.x)+.75,Y(vw.y)+.75,vw.w*s-1.5,vw.h*s-1.5);
  }
  function onView(){
    const v=state.view; const k=v.x.toFixed(1)+','+v.y.toFixed(1)+','+v.z.toFixed(4);
    const moved=last!==null&&last!==k; last=k;
    if(moved&&state.model&&!app.hidden&&!(state.viewQuietUntil>performance.now())) show();
    if(el.classList.contains('on')&&!raf) raf=requestAnimationFrame(draw);
  }
  function go(e){
    if(!map) return; const b=cv.getBoundingClientRect(); const wx=(e.clientX-b.left-map.ox)/map.s, wy=(e.clientY-b.top-map.oy)/map.s;
    const r=boardRect(), v=state.view; v.x=r.width/2-wx*v.z; v.y=r.height/2-wy*v.z; applyView(); renderOverlay();
  }
  el.addEventListener('pointerenter',()=>{ hover=true; clearTimeout(hideT); });
  el.addEventListener('pointerleave',()=>{ hover=false; if(!drag) show(); });
  el.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); drag=true; el.setPointerCapture(e.pointerId); go(e); });
  el.addEventListener('pointermove',e=>{ if(drag) go(e); });
  el.addEventListener('pointerup',()=>{ drag=false; show(); });
  el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});
  return {onView};
})();
