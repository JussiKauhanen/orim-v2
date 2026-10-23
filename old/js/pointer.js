/* orim · pointer.js
 * Mouse, pen and touch interaction on the board.
 */
'use strict';
const pointers=new Map(); let pinch=null; let spaceDown=false;
board.addEventListener('pointerdown',onDown);
board.addEventListener('pointermove',onMove);
board.addEventListener('pointerup',onUp);
board.addEventListener('pointercancel',onUp);
board.addEventListener('contextmenu',e=>e.preventDefault());
function onDown(e){
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  try{ board.setPointerCapture(e.pointerId); }catch(_){}
  if(pointers.size===2){ const pts=[...pointers.values()]; pinch={d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),cx:(pts[0].x+pts[1].x)/2,cy:(pts[0].y+pts[1].y)/2}; state.drag=null; renderOverlay(); return; }
  if(state.editing) closeEditor(true);
  if(state.frameOffer) hideFrameOffer();
  if(state.fly&&state.fly!=='ink') closeFly();
  const ae=document.activeElement; if(ae&&ae!==document.body&&ae.blur) ae.blur();
  closePop(); closeMenus();
  const p=toWorld(e); const tgt=e.target.closest&&e.target.closest('[data-kind]'); const kind=tgt&&tgt.dataset.kind; state.downW=p;
  // Links in documents: Ctrl or Cmd+click opens them.
  const lk=e.target.closest&&e.target.closest('.doc-link'); if(lk&&(e.ctrlKey||e.metaKey)&&e.button===0){ e.preventDefault(); openLink(lk.dataset.href); return; }
  // Checklist boxes in documents tick and untick with a click, right on the board.
  const td=e.target.closest&&e.target.closest('[data-todo]'); if(td&&e.button===0&&!e.shiftKey&&(state.tool==='select')){ const nid=td.closest('[data-kind="node"]').dataset.id, bi=+td.dataset.todo;
    e.preventDefault(); mutate(mm=>{ const n=mm.nodes.get(nid); const b=n&&n.doc&&n.doc.blocks[bi]; if(b&&b.t==='todo'){ if(b.c) delete b.c; else b.c=1; } },{structural:false}); return; }
  // Middle or right mouse button drags the board around; so do the Hand tool and Space.
  if(e.button===1||e.button===2||state.tool==='hand'||spaceDown){ startPan(e); return; }
  if(e.button!==0) return;
  if(kind==='phandle'){ const im=state.model.images.find(x=>x.id===tgt.dataset.id); if(im){ state.drag={mode:'presize',id:im.id,corner:tgt.dataset.corner,start:p,orig:{...im},moved:false}; } return; }
  if(kind==='ahandle'){ const a=state.model.arrows.find(x=>x.id===tgt.dataset.id); const end=+tgt.dataset.end; state.drag={mode:'aend',id:tgt.dataset.id,end,moved:false,orig:a?(end?a.to:a.from):null}; return; }
  if(kind==='ehandle'){ state.drag={mode:'eend',idx:+tgt.dataset.idx,end:+tgt.dataset.end,cur:p,target:null,moved:false}; return; }
  if(kind==='handle'&&tgt.dataset.gid){ const gid=tgt.dataset.gid; const b=state.boxes.get(gid); if(!b) return; state.drag={mode:'gresize',gid,corner:tgt.dataset.corner,start:p,orig:{...b},min:state.boxes.content.get(gid)||null,inside:frameInside(gid),moved:false}; return; }
  if(kind==='handle'){ const n=state.model.nodes.get(tgt.dataset.id); state.drag={mode:'resize',id:n.id,corner:tgt.dataset.corner,start:p,orig:{x:n.x,y:n.y,w:n.w,h:n.h},ofs:labelSize(n),moved:false,styled:false}; return; }
  const tl=state.tool;
  // Drawing closes the pen menu, so it is out of the way.
  if((tl==='pen'||tl==='hl'||tl==='eraser')&&state.fly){ state.fly=null; renderFly(); }
  if(tl==='pen'||tl==='hl'){ state.drag={mode:'draw',tool:tl,color:INK_COLORS[tl][state.inkColor[tl]]||INK_COLORS[tl][0],w:INK_W[tl],pts:[[r10(p.x),r10(p.y)]]}; renderOverlay(); return; }
  if(tl==='eraser'){ state.drag={mode:'erase',hits:new Set(),cur:p}; eraseAt(p); render(); return; }
  if(tl==='sticky'){ state.drag={mode:'sticky',start:p}; return; }
  if(tl==='table'||tl==='doc'||tl==='ui'){ state.drag={mode:'place',kind:tl,start:p}; return; }
  if(tl==='comment'){ startComment(p); return; }
  if(kind==='port'){ state.drag={mode:'connect',from:tgt.dataset.id,side:tgt.dataset.side,fromRow:tgt.dataset.row!=null?+tgt.dataset.row:null,start:p,cur:p,target:null,moved:false}; renderOverlay(); return; }
  const tool=state.tool;
  if([...SHAPE_TOOLS,'text','frame'].includes(tool)){ state.drag={mode:'create',shape:tool,start:p,cur:p}; return; }
  if(tool==='connector'){
    const nid=(kind==='node'&&tgt.dataset.id)||nodeAt(p)||frameEdgeAt(p);
    if(state.pendingFrom){
      const from=state.pendingFrom; state.pendingFrom=null; const to=nid||linkAt(p,0,from);
      if(to&&to!==from&&(state.model.nodes.has(from)||state.model.groups.has(from))){ const rp=rowPick(state.model,to,p); addToolEdge(from,to,{a:state.pendRow!=null?state.pendSide:null,b:rp?rp.side:null,ra:state.pendRow,rb:rp?rp.row:null}); return; }
      renderOverlay(); if(!nid) return;
    }
    if(nid&&state.arrowKind!=='block'){ const rp=rowPick(state.model,nid,p); state.drag={mode:'connect',from:nid,side:rp?rp.side:null,fromRow:rp?rp.row:null,auto:true,start:p,cur:p,target:null,moved:false}; renderOverlay(); }
    else state.drag={mode:'farrow',start:p,cur:p,fromNode:state.arrowKind==='block'?nid:null};
    return;
  }
  if(kind==='group'&&tgt.dataset.part==='body'&&(e.shiftKey||e.metaKey||e.ctrlKey)){ state.drag={mode:'marquee',start:p,cur:p,base:new Set(state.sel)}; return; }
  if(kind==='node'||kind==='group'||kind==='ink'||kind==='arrow'||kind==='pic'){
    const key=(kind==='node'?'n:':kind==='ink'?'k:':kind==='arrow'?'a:':kind==='pic'?'p:':'g:')+tgt.dataset.id;
    state.wasSel=state.sel.size===1&&state.sel.has(key);
    if(e.shiftKey||e.metaKey||e.ctrlKey){ if(state.sel.has(key)){ state.sel.delete(key); selChanged(); return; } state.sel.add(key); selChanged(); }
    else if(!state.sel.has(key)){ state.sel=new Set([key]); selChanged(); }
    startMove(p,key,e); return;
  }
  if(kind==='edge'){
    const key='e:'+tgt.dataset.idx;
    if(e.shiftKey){ state.sel.has(key)?state.sel.delete(key):state.sel.add(key); selChanged(); return; }
    state.sel=new Set([key]); selChanged();
    state.drag={mode:'emove',idx:+tgt.dataset.idx,start:p,sx:e.clientX,sy:e.clientY,vel:0,lt:0,lx:e.clientX,ly:e.clientY,onLabel:!!(e.target.closest&&e.target.closest('.elbl'))};
    return;
  }
  if(!e.shiftKey&&state.sel.size){ state.sel.clear(); selChanged(); }
  state.drag={mode:'marquee',start:p,cur:p,base:new Set(state.sel)};
}
function startPan(e){ state.drag={mode:'pan',sx:e.clientX,sy:e.clientY,ox:state.view.x,oy:state.view.y}; board.classList.add('panning'); }
function collectMove(){
  const m=state.model; const nodes=new Set(),groups=new Set(),direct=new Set(),inks=new Set(),arrows=new Set(),pics=new Set();
  for(const k of state.sel){
    const id=k.slice(2);
    if(k[0]==='k') inks.add(id);
    if(k[0]==='a') arrows.add(id);
    if(k[0]==='p') pics.add(id);
    if(k[0]==='n'&&m.nodes.has(id)){ nodes.add(id); direct.add(id); }
    if(k[0]==='g'&&m.groups.has(id)){
      groups.add(id);
      for(const n of m.nodes.values()) if(n.group&&(n.group===id||isDesc(m,n.group,id))) nodes.add(n.id);
      for(const g of m.groups.values()) if(g.id!==id&&isDesc(m,g.id,id)) groups.add(g.id);
    }
  }
  if(groups.size){
    const bx=groupBoxes(m); const inside=(r)=>{ const cx=r.x+r.w/2,cy=r.y+r.h/2; for(const gid of groups){ const b=bx.get(gid); if(b&&cx>=b.x&&cx<=b.x+b.w&&cy>=b.y&&cy<=b.y+b.h) return true; } return false; };
    for(const im of m.images) if(inside(im)) pics.add(im.id);
    for(const k of m.inks) if(inside(inkBox(k))) inks.add(k.id);
    for(const a of m.arrows) if(!a.from&&!a.to&&inside(arrowBox(a))) arrows.add(a.id);
  }
  return {nodes,groups,direct,inks,arrows,pics};
}
function startMove(p,key,e){
  const m=state.model; const c=collectMove();
  const orig=new Map(); for(const id of c.nodes){ const n=m.nodes.get(id); orig.set(id,{x:n.x,y:n.y}); }
  const gorig=new Map(); for(const gid of c.groups){ const p=m.pos.get(gid); const b=state.boxes.get(gid); if(p&&p.w) gorig.set(gid,{x:p.x,y:p.y,w:p.w,h:p.h}); else if(b&&!groupHasMembers(m,gid)) gorig.set(gid,{x:b.x,y:b.y,w:b.w,h:b.h}); }
  const korig=new Map(); for(const k of m.inks) if(c.inks.has(k.id)) korig.set(k.id,k.pts.map(q=>q.slice()));
  const aorig=new Map(); for(const a of m.arrows) if(c.arrows.has(a.id)){ const r=resolveArrow(m,a); aorig.set(a.id,{x1:r.x1,y1:r.y1,x2:r.x2,y2:r.y2,att:!!(a.from||a.to)}); }
  const porig=new Map(); for(const im of m.images) if(c.pics.has(im.id)) porig.set(im.id,{x:im.x,y:im.y});
  state.drag={mode:'move',start:p,orig,gorig,korig,aorig,porig,c,key,wasSel:state.wasSel,moved:false,shift:e.shiftKey||e.metaKey||e.ctrlKey,vel:0,lt:0,lx:e.clientX,ly:e.clientY,popped:new Set(),home:new Map(state.boxes)};
}
let rafLayout=0;
function liveLayoutSync(){
  if(rafLayout) return;
  rafLayout=requestAnimationFrame(()=>{ rafLayout=0; if(!state.model) return; state.code=replaceLayout(state.code,state.model); setEditorFromCode(); });
}
// Edge scrolling while dragging, like a strategy-game camera: near the edge of the board the view
// pans toward the pointer, and if you keep pushing it slowly zooms out so more of the board shows.
const EDGE={raf:0,ev:null,since:0,z0:1};
const EDGE_MODES=new Set(['move','connect','farrow','eend','aend','marquee','resize','gresize','create','presize']);
function edgeTrack(e){
  EDGE.ev={clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey,ctrlKey:e.ctrlKey,target:e.target,preventDefault(){}};
  if(!EDGE.raf) EDGE.raf=requestAnimationFrame(edgeTick);
}
function edgeTick(){
  EDGE.raf=0; const d=state.drag, ev=EDGE.ev;
  if(!d||!ev||!EDGE_MODES.has(d.mode)||pinch){ EDGE.since=0; return; }
  const {r,left}=visibleArea(); const M=56, x=ev.clientX-r.left, y=ev.clientY-r.top;
  const k=v=>Math.max(-1.6,Math.min(1.6,v));
  const fx=x<left+M?k(-(left+M-x)/M):x>r.width-M?k((x-r.width+M)/M):0;
  const fy=y<M?k(-(M-y)/M):y>r.height-M?k((y-r.height+M)/M):0;
  if(!fx&&!fy){ EDGE.since=0; return; }
  const now=performance.now(); if(!EDGE.since){ EDGE.since=now; EDGE.z0=state.view.z; }
  const sp=f=>f?Math.sign(f)*(2+Math.abs(f)*14):0;
  state.view.x-=sp(fx); state.view.y-=sp(fy);
  // After a short push, zoom out gently (to 60% of where you started at most).
  if(now-EDGE.since>500&&state.view.z>Math.max(0.2,EDGE.z0*0.6)) zoomAt(0.993,r.width/2,r.height/2); else { applyView(); renderOverlay(); }
  EDGE.raf=-1; onMove(ev); EDGE.raf=requestAnimationFrame(edgeTick);
}
function onMove(e){
  if(state.drag&&EDGE_MODES.has(state.drag.mode)&&e!==EDGE.ev) edgeTrack(e);
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pointers.size===2){
    const pts=[...pointers.values()]; const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y); const cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2;
    const r=boardRect(); state.view.x+=cx-pinch.cx; state.view.y+=cy-pinch.cy; zoomAt(d/(pinch.d||d),cx-r.left,cy-r.top); pinch={d,cx,cy}; return;
  }
  const d=state.drag; const p=toWorld(e); const m=state.model;
  if(!d){
    if(!m) return;
    let hid=null;
    if(state.tool==='select'||state.tool==='connector'){
      const pad=20/state.view.z;
      if(state.hover){ const n=m.nodes.get(state.hover); if(n&&p.x>=n.x-pad&&p.x<=n.x+n.w+pad&&p.y>=n.y-pad&&p.y<=n.y+n.h+pad) hid=state.hover;
        else if(m.groups.has(state.hover)&&!nodeAt(p,0)&&frameEdgeAt(p,24/state.view.z)===state.hover) hid=state.hover; }
      if(!hid) hid=nodeAt(p,0);
      if(!hid) hid=frameEdgeAt(p);
    }
    if(state.pendingFrom){ state.pendPt=p; state.hover=hid||linkAt(p,0,state.pendingFrom); renderOverlay(); return; }
    if(hid!==state.hover){ state.hover=hid; renderOverlay(); }
    return;
  }
  if(d.mode==='pan'){ state.view.x=d.ox+(e.clientX-d.sx); state.view.y=d.oy+(e.clientY-d.sy); applyView(); return; }
  if(d.mode==='marquee'){
    d.cur=p; const r=normRect(d.start,d.cur); const s=new Set(d.base);
    for(const n of m.nodes.values()) if(n.x<r.x+r.w&&n.x+n.w>r.x&&n.y<r.y+r.h&&n.y+n.h>r.y) s.add('n:'+n.id);
    for(const [gid,b] of state.boxes) if(b.x>=r.x&&b.y>=r.y&&b.x+b.w<=r.x+r.w&&b.y+b.h<=r.y+r.h) s.add('g:'+gid);
    for(const k of m.inks){ const b=inkBox(k); if(b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y) s.add('k:'+k.id); }
    for(const im of m.images){ if(im.x<r.x+r.w&&im.x+im.w>r.x&&im.y<r.y+r.h&&im.y+im.h>r.y) s.add('p:'+im.id); }
    for(const a of m.arrows){ const b=arrowBox(resolveArrow(m,a)); if(b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y) s.add('a:'+a.id); }
    state.sel=s; render(); return;
  }
  if(d.mode==='create'){ d.cur=p; renderOverlay(); return; }
  if(d.mode==='presize'){
    const im=m.images.find(x=>x.id===d.id); if(!im) return; const o=d.orig; const c=d.corner; const ar=o.w/o.h;
    let w=c.includes('e')?o.w+(p.x-d.start.x):o.w-(p.x-d.start.x); w=Math.max(24,w); let h=w/ar;
    if(e.shiftKey){ h=Math.max(24,c.includes('s')?o.h+(p.y-d.start.y):o.h-(p.y-d.start.y)); }
    im.w=r10(w); im.h=r10(h); im.x=r10(c.includes('w')?o.x+o.w-w:o.x); im.y=r10(c.includes('n')?o.y+o.h-h:o.y); d.moved=true; render(); return;
  }
  if(d.mode==='farrow'){ d.cur=e.shiftKey?snapAngle(d.start,p):p; const t=linkAt(d.cur,10/state.view.z,d.fromNode); state.snapTarget=t&&t!==d.fromNode?t:null; renderOverlay(); return; }
  if(d.mode==='aend'){
    const a=m.arrows.find(x=>x.id===d.id); if(!a) return; const ra=resolveArrow(m,a);
    const o=d.end?{x:ra.x1,y:ra.y1}:{x:ra.x2,y:ra.y2}; const q=e.shiftKey?snapAngle(o,p):p; const z=state.view.z;
    let att=null; const on=d.orig&&m.nodes.get(d.orig);
    if(on&&q.x>=on.x-24/z&&q.x<=on.x+on.w+24/z&&q.y>=on.y-24/z&&q.y<=on.y+on.h+24/z) att=d.orig;
    else { const other=d.end?a.from:a.to; const hit=linkAt(q,10/z,other); if(hit&&!(hit===other&&a.kind!=='block')) att=hit; }
    if(d.end){ a.to=att; a.x2=r10(q.x); a.y2=r10(q.y); } else { a.from=att; a.x1=r10(q.x); a.y1=r10(q.y); }
    state.snapTarget=att; d.moved=true; render(); return;
  }
  if(d.mode==='eend'){ d.cur=p; d.moved=true; const e2=m.edges[d.idx]; const other=e2?(d.end?e2.from:e2.to):null; const t=linkAt(p,10/state.view.z,other); d.target=t&&t!==other?t:null; state.snapTarget=d.target; renderOverlay(); return; }
  if(d.mode==='emove'){
    const now=performance.now(); if(d.lt){ const dt=Math.max(1,now-d.lt); d.vel=d.vel*0.55+Math.hypot(e.clientX-d.lx,e.clientY-d.ly)/dt*0.45; } d.lt=now; d.lx=e.clientX; d.ly=e.clientY;
    const dist=Math.hypot(e.clientX-d.sx,e.clientY-d.sy);
    if(dist>=48||(dist>=12&&d.vel>1.3)){
      const ed=m.edges[d.idx]; const a=ed&&nodeRect(m,ed.from,state.boxes),b=ed&&nodeRect(m,ed.to,state.boxes);
      if(!ed||!a||!b){ state.drag=null; return; }
      const g=geomPath(edgeShapeAt(m,d.idx,state.boxes),0,0); const id=nextArrowId(m);
      const ar={id,kind:ed.head==='none'&&ed.tail==='none'?'line':routeOf(m,ed),x1:r10(g.p0.x),y1:r10(g.p0.y),x2:r10(g.p3.x),y2:r10(g.p3.y),w:ed.width||(ed.line==='thick'?3.5:2),color:ed.color||'#1a1a1a',from:null,to:null};
      m.edges.splice(d.idx,1); m.arrows.push(ar); state.sel=new Set(['a:'+id]);
      const c={nodes:new Set(),groups:new Set(),direct:new Set(),inks:new Set(),arrows:new Set([id])};
      state.drag={mode:'move',start:d.start,orig:new Map(),gorig:new Map(),korig:new Map(),aorig:new Map([[id,{x1:ar.x1,y1:ar.y1,x2:ar.x2,y2:ar.y2,att:false}]]),c,key:'a:'+id,moved:true,shift:false,vel:0,lt:0,lx:e.clientX,ly:e.clientY,popped:new Set(),home:new Map(state.boxes),forceStructural:true};
      toast('Detached from its shapes');
      onMove(e);
    }
    return;
  }
  if(d.mode==='draw'){ const l=d.pts[d.pts.length-1]; if(Math.hypot(p.x-l[0],p.y-l[1])*state.view.z>=1.5){ d.pts.push([r10(p.x),r10(p.y)]); renderOverlay(); } return; }
  if(d.mode==='erase'){ d.cur=p; if(eraseAt(p)) lInk.innerHTML=inkMarkup(m,PAL_LIVE,true); renderOverlay(); return; }
  if(d.mode==='connect'){
    d.cur=p; if(Math.hypot(p.x-d.start.x,p.y-d.start.y)*state.view.z>4) d.moved=true;
    d.target=linkAt(p,6/state.view.z,d.from); renderOverlay(); return;
  }
  if(d.mode==='gresize'){
    const o=d.orig; const dx=p.x-d.start.x,dy=p.y-d.start.y;
    let x0=o.x,y0=o.y,x1=o.x+o.w,y1=o.y+o.h;
    if(d.corner.includes('e')) x1+=dx; if(d.corner.includes('w')) x0+=dx;
    if(d.corner.includes('s')) y1+=dy; if(d.corner.includes('n')) y0+=dy;
    if(!e.altKey){ x0=SNAP(x0); y0=SNAP(y0); x1=SNAP(x1); y1=SNAP(y1); }
    if(x1-x0<120){ if(d.corner.includes('w')) x0=x1-120; else x1=x0+120; }
    if(y1-y0<80){ if(d.corner.includes('n')) y0=y1-80; else y1=y0+80; }
    // Smaller than its contents: the contents move closer together to fit, keeping their arrangement.
    const mn=d.min; if(mn&&d.inside) squeezeInto(d,{x:x0,y:y0,w:x1-x0,h:y1-y0});
    else if(mn){ x0=Math.min(x0,mn.x); y0=Math.min(y0,mn.y); x1=Math.max(x1,mn.x+mn.w); y1=Math.max(y1,mn.y+mn.h); }
    if(d.inside&&d.inside.minW){ if(x1-x0<d.inside.minW){ if(d.corner.includes('w')) x0=x1-d.inside.minW; else x1=x0+d.inside.minW; } if(y1-y0<d.inside.minH){ if(d.corner.includes('n')) y0=y1-d.inside.minH; else y1=y0+d.inside.minH; } if(mn) squeezeInto(d,{x:x0,y:y0,w:x1-x0,h:y1-y0}); }
    m.pos.set(d.gid,{x:x0,y:y0,w:x1-x0,h:y1-y0}); d.moved=true;
    render(); liveLayoutSync(); return;
  }
  if(d.mode==='resize'&&m.nodes.get(d.id)&&m.nodes.get(d.id).shape==='text'){
    const n=m.nodes.get(d.id); const o=d.orig; const dx=p.x-d.start.x,dy=p.y-d.start.y; const c=d.corner;
    if(c.length===1){
      let x=o.x,w=c==='e'?o.w+dx:o.w-dx; w=Math.max(40,e.altKey?w:SNAP(w)); if(c==='w') x=o.x+o.w-w;
      n.x=x; n.w=w; n.sized=true; sizeNode(n);
    } else {
      const sx=c.includes('e')?(o.w+dx)/o.w:(o.w-dx)/o.w, sy=c.includes('s')?(o.h+dy)/o.h:(o.h-dy)/o.h;
      const sc=Math.max(0.1,Math.max(sx,sy)); const nfs=Math.max(6,Math.min(400,Math.round(d.ofs*sc)));
      const w=Math.max(30,o.w*nfs/d.ofs);
      let st=m.styles.get(n.id); if(!st){ st={fill:null,stroke:null,color:null,fontSize:null,bold:false,italic:false,bg:null,extra:[]}; m.styles.set(n.id,st); }
      st.fontSize=nfs; n.fsSet=nfs; d.styled=true;
      n.w=w; n.sized=true; sizeNode(n);
      n.x=c.includes('w')?o.x+o.w-w:o.x; n.y=c.includes('n')?o.y+o.h-n.h:o.y;
    }
    d.moved=true; state.cache.set(n.id,{x:n.x,y:n.y}); render(); if(!d.styled) liveLayoutSync(); return;
  }
  if(d.mode==='resize'){
    const n=m.nodes.get(d.id); if(!n) return; const o=d.orig; let dx=p.x-d.start.x,dy=p.y-d.start.y;
    let x=o.x,y=o.y,w=o.w,h=o.h;
    if(d.corner.includes('e')) w=o.w+dx; if(d.corner.includes('s')) h=o.h+dy;
    if(d.corner.includes('w')){ w=o.w-dx; x=o.x+dx; } if(d.corner.includes('n')){ h=o.h-dy; y=o.y+dy; }
    if(e.shiftKey){ const r=o.w/o.h; if(w/h>r) h=w/r; else w=h*r; if(d.corner.includes('w')) x=o.x+o.w-w; if(d.corner.includes('n')) y=o.y+o.h-h; }
    const minW=n.shape==='icon'?40:40,minH=n.shape==='icon'?40:28;
    if(w<minW){ if(d.corner.includes('w')) x-=minW-w; w=minW; } if(h<minH){ if(d.corner.includes('n')) y-=minH-h; h=minH; }
    if(!e.altKey){ const x2=SNAP(x+w),y2=SNAP(y+h); x=SNAP(x); y=SNAP(y); w=Math.max(minW,x2-x); h=Math.max(minH,y2-y); }
    n.x=x;n.y=y;n.w=w;n.h=h;n.sized=true; sizeNode(n); d.moved=true; state.cache.set(n.id,{x,y});
    render(); liveLayoutSync(); return;
  }
  if(d.mode==='move'){
    let dx=p.x-d.start.x,dy=p.y-d.start.y;
    if(!d.moved&&Math.hypot(dx,dy)*state.view.z<3) return;
    if(!d.moved){ d.moved=true; state.hover=null; }
    const first=d.orig.values().next().value||d.gorig.values().next().value;
    // Smart guides (like Miro): line up edges and centres with other shapes; otherwise snap to the grid. Alt turns both off.
    let gx=null,gy=null; state.guides=null;
    if(!e.altKey&&d.orig.size&&d.orig.size<=80){ const sn=smartSnap(d,dx,dy); if(sn){ if(sn.dx!=null){ dx=sn.dx; gx=sn.gx; } if(sn.dy!=null){ dy=sn.dy; gy=sn.gy; } state.guides=sn.lines; } }
    if(first&&!e.altKey){ if(gx==null) dx=SNAP(first.x+dx)-first.x; if(gy==null) dy=SNAP(first.y+dy)-first.y; }
    for(const [id,o] of d.orig){ const n=m.nodes.get(id); n.x=o.x+dx; n.y=o.y+dy; state.cache.set(id,{x:n.x,y:n.y}); }
    for(const [gid,o] of d.gorig){ m.pos.set(gid,{x:o.x+dx,y:o.y+dy,w:o.w,h:o.h}); }
    for(const k of m.inks){ const o=d.korig.get(k.id); if(o) k.pts=o.map(([x,y])=>[r10(x+dx),r10(y+dy)]); }
    if(d.porig) for(const im of m.images){ const o=d.porig.get(im.id); if(o){ im.x=r10(o.x+dx); im.y=r10(o.y+dy); } }
    for(const a of m.arrows){ const o=d.aorig.get(a.id); if(!o) continue;
      if(o.att){ if(Math.hypot(dx,dy)*state.view.z<30&&!o.freed) continue; if(!o.freed){ o.freed=true; a.from=null; a.to=null; } }
      a.x1=r10(o.x1+dx); a.y1=r10(o.y1+dy); a.x2=r10(o.x2+dx); a.y2=r10(o.y2+dy); }
    const now=performance.now();
    if(d.lt){ const dt=Math.max(1,now-d.lt); const v=Math.hypot(e.clientX-d.lx,e.clientY-d.ly)/dt; d.vel=d.vel*0.55+v*0.45; }
    d.lt=now; d.lx=e.clientX; d.ly=e.clientY;
    if(d.c.direct.size&&!d.c.groups.size){
      for(const id of d.c.direct){
        const n=m.nodes.get(id); if(!n||!n.group||d.popped.has(id)) continue;
        const hb=d.home.get(n.group); if(!hb) continue;
        const cx=n.x+n.w/2,cy=n.y+n.h/2; const outside=cx<hb.x||cx>hb.x+hb.w||cy<hb.y||cy>hb.y+hb.h;
        if(outside&&d.vel>1.15) d.popped.add(id);
      }
      state.dragExclude=d.popped.size?d.popped:null; state.dragHome=d.home;
      const pivot=m.nodes.get(d.key.slice(2))||m.nodes.get(d.c.direct.values().next().value);
      const t=pivot?dropTarget(pivot,d):null;
      state.dropGroup=pivot&&t!==pivot.group?t:null;
    } else state.dropGroup=null;
    render(); liveLayoutSync(); return;
  }
}
function smartSnap(d,dx,dy){
  const m=state.model; const th=7/state.view.z;
  if(!d.snapPool){
    const moving=new Set(d.orig.keys());
    d.snapPool=[...m.nodes.values()].filter(n=>!moving.has(n.id)&&n.x!=null).map(n=>({x:n.x,y:n.y,w:n.w,h:n.h}));
    // Screen edges and centre line, so mockup pieces line up inside their device.
    for(const g of m.groups.values()){ if(!g.dev) continue; const b=state.boxes&&state.boxes.get(g.id); if(b) d.snapPool.push({x:b.x,y:b.y,w:b.w,h:b.h}); }
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for(const [id,o] of d.orig){ const n=m.nodes.get(id); if(!n) continue; x0=Math.min(x0,o.x); y0=Math.min(y0,o.y); x1=Math.max(x1,o.x+n.w); y1=Math.max(y1,o.y+n.h); }
    d.snapBox={x:x0,y:y0,w:x1-x0,h:y1-y0};
  }
  const b=d.snapBox; if(!isFinite(b.x)) return null;
  const mx=[b.x+dx,b.x+dx+b.w/2,b.x+dx+b.w], my=[b.y+dy,b.y+dy+b.h/2,b.y+dy+b.h];
  let bx=null,by=null;
  for(const r of d.snapPool){
    const sx=[r.x,r.x+r.w/2,r.x+r.w], sy=[r.y,r.y+r.h/2,r.y+r.h];
    for(let i=0;i<3;i++) for(let j=0;j<3;j++){
      if((i===1)!==(j===1)) continue; // centre to centre, edge to edge
      // Centres win over edges, so connected shapes line up and their arrow runs straight.
      const c=i===1; const better=(cur,dd)=>!cur||(c&&!cur.c)||(c===cur.c&&Math.abs(dd)<Math.abs(cur.d)-0.01);
      const ddx=sx[j]-mx[i]; if(Math.abs(ddx)<=th&&better(bx,ddx)) bx={d:ddx,v:sx[j],c};
      const ddy=sy[j]-my[i]; if(Math.abs(ddy)<=th&&better(by,ddy)) by={d:ddy,v:sy[j],c};
    }
  }
  if(!bx&&!by) return null;
  const out={dx:bx?dx+bx.d:null,dy:by?dy+by.d:null,gx:bx&&bx.v,gy:by&&by.v,lines:[]};
  const fx=bx?dx+bx.d:dx, fy=by?dy+by.d:dy; const mb={x:b.x+fx,y:b.y+fy,w:b.w,h:b.h};
  // Guide lines run from the moving shapes to every shape on the same line.
  if(bx){ let y0=mb.y,y1=mb.y+mb.h; for(const r of d.snapPool){ if([r.x,r.x+r.w/2,r.x+r.w].some(v=>Math.abs(v-bx.v)<0.5)){ y0=Math.min(y0,r.y); y1=Math.max(y1,r.y+r.h); } } out.lines.push({x1:bx.v,y1:y0-12,x2:bx.v,y2:y1+12}); }
  if(by){ let x0=mb.x,x1=mb.x+mb.w; for(const r of d.snapPool){ if([r.y,r.y+r.h/2,r.y+r.h].some(v=>Math.abs(v-by.v)<0.5)){ x0=Math.min(x0,r.x); x1=Math.max(x1,r.x+r.w); } } out.lines.push({x1:x0-12,y1:by.v,x2:x1+12,y2:by.v}); }
  return out;
}
function onUp(e){
  pointers.delete(e.pointerId); state.guides=null;
  if(pinch){ if(pointers.size<2) pinch=null; return; }
  const d=state.drag; state.drag=null; board.classList.remove('panning');
  if(!d){ return; }
  const m=state.model; const p=toWorld(e);
  if(d.mode==='pan'){ return; }
  if(d.mode==='marquee'){
    selChanged();
    const r=normRect(d.start,d.cur); const z=state.view.z;
    if(!state.sel.size&&!d.base.size&&r.w*z>=90&&r.h*z>=60) showFrameOffer({x:SNAP(r.x),y:SNAP(r.y),w:SNAP(r.w),h:SNAP(r.h)});
    return;
  }
  if(d.mode==='gresize'){ if(d.moved){ mutate(()=>{}, {structural:false}); toast(d.inside&&(d.orig.w>m.pos.get(d.gid).w||d.orig.h>m.pos.get(d.gid).h)?'Frame resized. Its contents moved closer together':'Frame size locked. Use "Fit to contents" to undo.'); } else render(); return; }
  if(d.mode==='resize'){ if(d.moved) mutate(()=>{}, {structural:!!d.styled}); else render(); return; }
  const snap=state.snapTarget; state.snapTarget=null;
  if(d.mode==='aend'){
    if(!d.moved){ render(); return; }
    const a=m.arrows.find(x=>x.id===d.id);
    if(a&&a.from&&a.to&&a.from!==a.to&&a.kind!=='block'){ arrowToEdge(a); return; }
    mutate(()=>{}, {structural:false}); return;
  }
  if(d.mode==='emove'){ if(d.onLabel&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<6) queueEdit(d.idx,true,'edge'); return; }
  if(d.mode==='presize'){ if(d.moved) mutate(()=>{}, {structural:false}); else render(); return; }
  if(d.mode==='eend'){
    const e2=m.edges[d.idx]; if(!e2||!d.moved){ render(); return; }
    if(d.target){ const tr=nodeRect(m,d.target,state.boxes); const rp=rowPick(m,d.target,d.cur); const sd=rp?rp.side:sideNear(tr,d.cur); const same=(d.end?e2.to:e2.from)===d.target;
      mutate(mm=>{ const x=mm.edges[d.idx]; if(d.end){ x.to=d.target; if(sd) x.sb=sd; else delete x.sb; if(rp) x.rb=rp.row; else delete x.rb; } else { x.from=d.target; if(sd) x.sa=sd; else delete x.sa; if(rp) x.ra=rp.row; else delete x.ra; } }); toast(same?(sd?'Connection point moved':'Connection point set to automatic'):'Reconnected'); return; }
    const a=nodeRect(m,e2.from,state.boxes),b=nodeRect(m,e2.to,state.boxes); if(!a||!b){ render(); return; }
    if(Math.hypot(d.cur.x-(d.end?b.x+b.w/2:a.x+a.w/2),d.cur.y-(d.end?b.y+b.h/2:a.y+a.h/2))*state.view.z<20){ render(); return; }
    const g=geomPath(edgeShapeAt(m,d.idx,state.boxes),0,0); let id=null;
    mutate(mm=>{ id=nextArrowId(mm); const fixed=d.end?g.p0:g.p3;
      const ar={id,kind:e2.head==='none'&&e2.tail==='none'?'line':routeOf(m,e2),w:e2.width||(e2.line==='thick'?3.5:2),color:e2.color||'#1a1a1a',from:d.end?e2.from:null,to:d.end?null:e2.to};
      if(d.end){ ar.x1=r10(fixed.x); ar.y1=r10(fixed.y); ar.x2=r10(d.cur.x); ar.y2=r10(d.cur.y); } else { ar.x1=r10(d.cur.x); ar.y1=r10(d.cur.y); ar.x2=r10(fixed.x); ar.y2=r10(fixed.y); }
      mm.edges.splice(d.idx,1); mm.arrows.push(ar); });
    state.sel=new Set(['a:'+id]); selChanged(); toast('Detached. Drop the end on a shape to connect it again.'); return;
  }
  if(d.mode==='farrow'){
    const q=d.cur; if(Math.hypot(q.x-d.start.x,q.y-d.start.y)*state.view.z<8){ renderOverlay(); return; }
    if(d.fromNode&&snap&&state.arrowKind!=='block'){ addToolEdge(d.fromNode,snap); return; }
    addFreeArrow(d.start,q,d.fromNode,snap); return;
  }
  if(d.mode==='place'&&d.kind==='ui'){
    const pk=state.uiPick||{dev:'mobile'}; let sel=null, edit=null;
    if(pk.dev){ const D=DEVICES[pk.dev]; mutate(mm=>{ const r=addScreen(mm,{dev:pk.dev,preset:state.uiPreset,x:d.start.x-D.w*MOCK/2,y:d.start.y-40,parent:groupAt(d.start)||null}); sel='g:'+r.gid; edit=r.gid; }); }
    else { const k=UI_KINDS[pk.piece]||UI_KINDS.uiButton; const gin=groupAt(d.start); const sc=gin?devScale(state.model,gin):MOCK; const w=k.w*sc,h=k.h*sc; const nid=createNode({shape:pk.piece,label:k.def,idBase:k.name,rect:{x:SNAP(d.start.x-w/2),y:SNAP(d.start.y-h/2),w,h},group:groupAt(d.start)||null}); sel=nid&&'n:'+nid; }
    setTool('select'); if(sel){ state.sel=new Set([sel]); selChanged(); } if(edit) openEditor('group',edit); return;
  }
  if(d.mode==='place'){
    const nid=createNode({shape:d.kind,label:d.kind==='table'?'Comparison':'',idBase:d.kind==='table'?'table':'doc',cx:d.start.x,cy:d.start.y,group:groupAt(d.start)||null});
    setTool('select'); if(nid){ state.sel=new Set(['n:'+nid]); selChanged(); Rich.open(nid,null,true); } return;
  }
  if(d.mode==='sticky'){
    const nid=createNode({shape:'sticky',label:'',idBase:'note',cx:d.start.x,cy:d.start.y,group:groupAt(d.start)||null,style:{fill:STICKY_COLORS[state.stickyColor]||STICKY_COLORS[0],stroke:null,color:null,fontSize:null,bold:false,italic:false,bg:null,extra:[]}});
    setTool('select'); if(nid){ state.sel=new Set(['n:'+nid]); selChanged(); queueEdit(nid,false); } return;
  }
  if(d.mode==='draw'){
    const pts=simplifyPts(d.pts,0.6/state.view.z).map(([x,y])=>[r10(x),r10(y)]);
    mutate(mm=>{ let n=mm.inks.length+1; const ids=new Set(mm.inks.map(k=>k.id)); while(ids.has('k'+n)) n++; mm.inks.push({id:'k'+n,tool:d.tool,color:d.color,w:d.w,pts}); },{structural:false});
    return;
  }
  if(d.mode==='erase'){ if(d.hits.size) mutate(mm=>{ mm.inks=mm.inks.filter(k=>!d.hits.has(k.id)); },{structural:false}); else renderOverlay(); return; }
  if(d.mode==='move'){
    const dg=state.dropGroup; state.dropGroup=null; state.dragExclude=null;
    if(!d.moved){
      if(!d.shift&&state.sel.size>1){ state.sel=new Set([d.key]); selChanged(); }
      else if(d.wasSel&&!d.shift&&d.key[0]==='n'){ const n=m.nodes.get(d.key.slice(2)); if(n&&n.shape!=='icon') queueEdit(n.id,true); }
      return;
    }
    let structural=false;
    if(d.c.direct.size&&!d.c.groups.size){
      const left=new Map();
      for(const id of d.c.direct){
        const n=m.nodes.get(id); const target=dropTarget(n,d);
        if(target!==n.group){ if(n.group) left.set(id,n.group); n.group=target; structural=true; }
      }
      for(const gid of new Set(left.values())){ const p=m.pos.get(gid); if(!groupHasMembers(m,gid)&&!(p&&p.w)&&d.home.get(gid)) m.pos.set(gid,{...d.home.get(gid)}); }
      if(left.size&&!dg){ const g=m.groups.get([...left.values()][0]); toast('Popped out of '+(g?g.label:'the frame')); }
    } else if(d.c.groups.size){
      for(const k of state.sel){ if(k[0]!=='g') continue; const gid=k.slice(2); const g=m.groups.get(gid); const b=groupBoxes(m).get(gid); if(!g||!b) continue;
        const target=groupAt({x:b.x+b.w/2,y:b.y+12},d.c.nodes,gid);
        if(target!==g.parent){ g.parent=target; structural=true; } }
    }
    mutate(()=>{}, {structural:structural||!!d.forceStructural});
    if(structural&&dg) toast('Moved into '+(m.groups.get(dg)?m.groups.get(dg).label:'frame'));
    return;
  }
  if(d.mode==='connect'){
    const from=nodeRect(m,d.from,state.boxes); if(!from){ render(); return; }
    if(d.target){
      const tr=nodeRect(m,d.target,state.boxes); const rp=rowPick(m,d.target,p); const sb=rp?rp.side:sideNear(tr,p);
      if(state.tool==='connector'&&(!d.side||d.auto)){ addToolEdge(d.from,d.target,{a:d.side||null,b:sb,ra:d.fromRow,rb:rp?rp.row:null}); return; }
      const to=d.target; mutate(mm=>{ const ne={from:d.from,to,line:'solid',head:'arrow',tail:'none',label:''}; if(d.side) ne.sa=d.side; if(sb) ne.sb=sb; if(d.fromRow!=null) ne.ra=d.fromRow; if(rp) ne.rb=rp.row; mm.edges.push(ne); });
      state.sel=new Set(['e:'+(state.model.edges.length-1)]); selChanged(); setTool('select'); return;
    }
    if(!d.moved&&(!d.side||d.auto)&&state.tool==='connector'){ state.pendingFrom=d.from; state.pendRow=d.fromRow; state.pendSide=d.side; state.pendPt=p; renderOverlay(); toast('Now click the shape to connect to'); return; }
    if(d.moved&&(!d.side||d.auto)&&state.tool==='connector'){ addFreeArrow(clipToRect(from,p),p,d.from,null); return; }
    const shape=!from.shape?'round':from.shape==='icon'||from.shape==='text'?'rect':from.shape;
    let cx,cy;
    if(d.moved){ cx=p.x; cy=p.y; }
    else { const side=d.side||'r'; const gap=88; cx=from.x+from.w/2+(side==='r'?from.w/2+gap+60:side==='l'?-(from.w/2+gap+60):0); cy=from.y+from.h/2+(side==='b'?from.h/2+gap+26:side==='t'?-(from.h/2+gap+26):0); }
    const nid=createNode({shape,cx,cy,group:groupAt({x:cx,y:cy})||null},mm=>{});
    if(nid){ mutate(mm=>{ const ne={from:d.from,to:nid,line:'solid',head:'arrow',tail:'none',label:''}; if(d.side&&!d.moved){ ne.sa=d.side; ne.sb={l:'r',r:'l',t:'b',b:'t'}[d.side]; } else if(d.side) ne.sa=d.side; mm.edges.push(ne); }); state.sel=new Set(['n:'+nid]); selChanged(); setTool('select'); openEditor('node',nid); }
    return;
  }
  if(d.mode==='create'){
    const r=normRect(d.start,d.cur); const small=r.w<10&&r.h<10;
    if(d.shape==='frame'){
      const rect=small?{x:SNAP(d.start.x-160),y:SNAP(d.start.y-100),w:320,h:200}:{x:SNAP(r.x),y:SNAP(r.y),w:SNAP(r.w),h:SNAP(r.h)};
      let gid=null;
      mutate(mm=>{
        gid=idFrom('group',id=>mm.nodes.has(id)||mm.groups.has(id));
        const inside=[...mm.nodes.values()].filter(n=>{const cx=n.x+n.w/2,cy=n.y+n.h/2;return cx>=rect.x&&cx<=rect.x+rect.w&&cy>=rect.y&&cy<=rect.y+rect.h;});
        const parents=new Set(inside.map(n=>n.group||null));
        const parent=parents.size===1?[...parents][0]:groupAt({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
        mm.groups.set(gid,{id:gid,label:'Group',parent:parent||null,dir:null}); mm.groupOrder.push(gid);
        if(inside.length) inside.forEach(n=>n.group=gid); else mm.pos.set(gid,rect);
      });
      setTool('select'); if(gid){ state.sel=new Set(['g:'+gid]); selChanged(); openEditor('group',gid); }
      return;
    }
    const opt={shape:d.shape,group:groupAt(small?d.start:{x:r.x+r.w/2,y:r.y+r.h/2})||null};
    if(small){ opt.cx=d.start.x; opt.cy=d.start.y; } else { opt.rect={x:SNAP(r.x),y:SNAP(r.y),w:Math.max(40,SNAP(r.w)),h:Math.max(28,SNAP(r.h))}; }
    const nid=createNode(opt);
    setTool('select'); if(nid){ state.sel=new Set(['n:'+nid]); selChanged(); queueEdit(nid,false); }
  }
}
function openLink(u){ const s=safeUrl(u); if(!s) return; try{ const w=window.open(s,'_blank','noopener'); if(!w) copyText(s,'Link copied: the browser blocked opening it'); }catch(_){ copyText(s,'Link copied'); } }
// What a frame holds, for squeezing it: shapes (not in mockup screens) and screens, with where they were.
function frameInside(gid){
  const m=state.model; const inG=new Set([gid]); let grew=true; while(grew){ grew=false; for(const g of m.groups.values()) if(!inG.has(g.id)&&g.parent&&inG.has(g.parent)){ inG.add(g.id); grew=true; } }
  const devs=[...inG].filter(id=>id!==gid&&m.groups.get(id).dev), inDev=new Set(); for(const dv of devs) for(const id of inG) if(id===dv||isDesc(m,id,dv)) inDev.add(id);
  const items=[];
  for(const n of m.nodes.values()) if(n.group&&inG.has(n.group)&&!inDev.has(n.group)&&n.x!=null) items.push({n,x:n.x,y:n.y,w:n.w,h:n.h});
  for(const dv of devs){ const b=state.boxes.get(dv); if(b) items.push({dev:dv,x:b.x,y:b.y,w:b.w,h:b.h,kids:[...m.nodes.values()].filter(n=>n.group&&(n.group===dv||isDesc(m,n.group,dv))).map(n=>({n,x:n.x,y:n.y}))}); }
  if(!items.length) return null;
  const x0=Math.min(...items.map(i=>i.x)), y0=Math.min(...items.map(i=>i.y)), x1=Math.max(...items.map(i=>i.x+i.w)), y1=Math.max(...items.map(i=>i.y+i.h));
  const nested=[...inG].some(id=>id!==gid&&!m.groups.get(id).dev&&!inDev.has(id));
  return {items,box:{x:x0,y:y0,w:x1-x0,h:y1-y0},minW:Math.max(...items.map(i=>i.w))+PAD*2+(nested?PAD*2:0),minH:Math.max(...items.map(i=>i.h))+PAD+PAD_TOP+(nested?PAD+PAD_TOP:0)};
}
function squeezeInto(d,r){
  const I=d.inside, c=I.box, m=state.model;
  const tx=r.x+PAD, ty=r.y+PAD_TOP, tw=Math.max(1,r.w-PAD*2), th=Math.max(1,r.h-PAD_TOP-PAD);
  // Each axis scales gap sizes only, so the farthest item still fits: s = (room - its size) / (span - its size).
  const scale=(room,span,key,size)=>{ if(room>=span) return 1; let s=1; for(const i of I.items){ const lead=i[key]-c[key]; if(lead>0) s=Math.min(s,Math.max(0,(room-i[size])/lead)); } return s; };
  const sx=scale(tw,c.w,'x','w'), sy=scale(th,c.h,'y','h');
  const ox=tw>=c.w?c.x:tx, oy=th>=c.h?c.y:ty;
  for(const i of I.items){ const nx=ox+(i.x-c.x)*sx, ny=oy+(i.y-c.y)*sy;
    if(i.n){ i.n.x=nx; i.n.y=ny; state.cache.set(i.n.id,{x:nx,y:ny}); }
    else { const p=m.pos.get(i.dev); if(p) m.pos.set(i.dev,{...p,x:nx,y:ny}); for(const k of i.kids){ k.n.x=k.x+(nx-i.x); k.n.y=k.y+(ny-i.y); state.cache.set(k.n.id,{x:k.n.x,y:k.n.y}); } } }
}
function queueEdit(id,caretEnd,kind){ state.pendingEdit={id,caretEnd,kind:kind||'node'}; clearTimeout(state.pendingEditT); state.pendingEditT=setTimeout(runPendingEdit,120); }
function runPendingEdit(){ const pe=state.pendingEdit; if(!pe) return; state.pendingEdit=null; clearTimeout(state.pendingEditT); if(!state.model) return; if(pe.kind==='edge'){ if(!state.model.edges[pe.id]) return; openEditor('edge',pe.id); } else { if(!state.model.nodes.has(pe.id)) return; openEditor('node',pe.id); } if(pe.caretEnd&&state.editing){ const el=state.editing.el; el.setSelectionRange(el.value.length,el.value.length); } }
board.addEventListener('click',()=>{ if(state.pendingEdit) runPendingEdit(); });
function snapAngle(o,p){ const dx=p.x-o.x,dy=p.y-o.y,L=Math.hypot(dx,dy),a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4); return {x:o.x+Math.cos(a)*L,y:o.y+Math.sin(a)*L}; }
function addToolEdge(from,to,sides){
  const k=state.arrowKind; const route=k==='line'?'straight':(k==='block'?'straight':k);
  mutate(mm=>{ const e={from,to,line:'solid',head:k==='line'?'none':'arrow',tail:'none',label:''}; if(sides&&sides.a) e.sa=sides.a; if(sides&&sides.b) e.sb=sides.b; if(sides&&sides.ra!=null) e.ra=sides.ra; if(sides&&sides.rb!=null) e.rb=sides.rb; if(route!=='curved'&&route!==(mm.curve||'curved')) e.route=route; if(state.arrowW!==2) e.width=state.arrowW; if(state.arrowColor) e.color=ARROW_COLORS[state.arrowColor]; mm.edges.push(e); });
  state.sel=new Set(['e:'+(state.model.edges.length-1)]); selChanged(); setTool('select');
}
function nextArrowId(mm){ const ids=new Set(mm.arrows.map(x=>x.id)); let n=mm.arrows.length+1; while(ids.has('a'+n)) n++; return 'a'+n; }
function addFreeArrow(a,b,from,to){
  let id=null;
  mutate(mm=>{ id=nextArrowId(mm);
    mm.arrows.push({id,kind:state.arrowKind,x1:r10(a.x),y1:r10(a.y),x2:r10(b.x),y2:r10(b.y),w:state.arrowW,color:ARROW_COLORS[state.arrowColor]||'#1a1a1a',from:from||null,to:to||null}); },{structural:false});
  state.sel=new Set(['a:'+id]); setTool('select'); selChanged();
  if(to) toast('Snapped to the shape');
}
function arrowToEdge(a){
  let idx=-1;
  mutate(mm=>{ const x=mm.arrows.find(q=>q.id===a.id); if(!x) return; mm.arrows=mm.arrows.filter(q=>q.id!==a.id);
    const e={from:x.from,to:x.to,line:'solid',head:x.kind==='line'?'none':'arrow',tail:'none',label:''};
    const bx=groupBoxes(mm); const ra=nodeRect(mm,x.from,bx), rb=nodeRect(mm,x.to,bx); const s1=ra&&sideNear(ra,{x:x.x1,y:x.y1}), s2=rb&&sideNear(rb,{x:x.x2,y:x.y2}); if(s1) e.sa=s1; if(s2) e.sb=s2;
    const route=x.kind==='line'?'straight':x.kind; if(route!=='curved'&&route!==(mm.curve||'curved')) e.route=route; if(x.w&&x.w!==2) e.width=x.w; if(x.color&&x.color!=='#1a1a1a') e.color=x.color;
    mm.edges.push(e); idx=mm.edges.length-1; });
  state.sel=new Set(['e:'+idx]); selChanged(); toast('Connected both shapes');
}
function showFrameOffer(rect){
  state.frameOffer=rect; renderOverlay(); placeFrameOffer(); clearTimeout(state.frameOfferT); state.frameOfferT=setTimeout(hideFrameOffer,7000);
}
function placeFrameOffer(){ const el=$('#frameOffer'); const r=state.frameOffer; if(!r){ el.hidden=true; return; } el.hidden=false; const a=toScreen({x:r.x+r.w,y:r.y}); const pr=boardPane.getBoundingClientRect(); el.style.left=clamp(a.x-el.offsetWidth,8,pr.width-el.offsetWidth-8)+'px'; el.style.top=clamp(a.y-el.offsetHeight-8,8,pr.height-el.offsetHeight-8)+'px'; }
function hideFrameOffer(){ if(!state.frameOffer) return; state.frameOffer=null; clearTimeout(state.frameOfferT); $('#frameOffer').hidden=true; renderOverlay(); }
$('#frameOffer').addEventListener('pointerdown',e=>e.stopPropagation());
$('#frameOfferBtn').addEventListener('click',()=>{
  const rect=state.frameOffer; if(!rect) return; hideFrameOffer(); let gid=null;
  mutate(mm=>{ gid=idFrom('frame',id=>mm.nodes.has(id)||mm.groups.has(id)); const parent=groupAt({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
    mm.groups.set(gid,{id:gid,label:'Frame',parent:parent||null,dir:null}); mm.groupOrder.push(gid); mm.pos.set(gid,rect); });
  state.sel=new Set(['g:'+gid]); selChanged(); openEditor('group',gid);
});
function nextImageId(mm){ const ids=new Set(mm.images.map(x=>x.id)); let n=mm.images.length+1; while(ids.has('img'+n)||IMG['img'+n]&&!ids.has('img'+n)&&false) n++; while(ids.has('img'+n)) n++; return 'img'+n; }
function readImageFile(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error('read'));
    fr.onload=()=>{
      const src=fr.result; const img=new Image();
      img.onerror=()=>rej(new Error('decode'));
      img.onload=()=>{
        const w=img.naturalWidth||640,h=img.naturalHeight||480; const sc=Math.min(1,1600/Math.max(w,h)); const cw=Math.max(1,Math.round(w*sc)),ch=Math.max(1,Math.round(h*sc));
        let url=src;
        if(file.type!=='image/svg+xml'&&(sc<1||file.size>400000)){ try{ const c=document.createElement('canvas'); c.width=cw; c.height=ch; c.getContext('2d').drawImage(img,0,0,cw,ch); const wp=c.toDataURL('image/webp',0.85); url=wp.startsWith('data:image/webp')?wp:c.toDataURL('image/jpeg',0.86); }catch(_){ url=src; } }
        res({url,w:cw,h:ch});
      };
      img.src=src;
    };
    fr.readAsDataURL(file);
  });
}
async function addImageFiles(files,at){
  const list=[...files].filter(f=>f&&/^image\//.test(f.type)); if(!list.length) return false;
  if(state.fatal){ toast('Fix the diagram type in the code first'); return true; }
  let p=at; if(!p){ const r=boardRect(); const left=64+((state.libOpen&&r.width>760)?300:0); p=toWorld({clientX:r.left+left+(r.width-left)/2,clientY:r.top+r.height/2}); }
  const added=[]; let off=0;
  for(const f of list){
    try{ const {url,w,h}=await readImageFile(f); const dw=Math.min(480,w), dh=dw*h/w;
      mutate(mm=>{ const id=nextImageId(mm); IMG[id]=url; mm.images.push({id,x:r10(SNAP(p.x-dw/2+off)),y:r10(SNAP(p.y-dh/2+off)),w:r10(dw),h:r10(dh),front:true}); added.push('p:'+id); },{structural:false}); off+=32;
    }catch(err){ toast('Could not read '+(f.name||'the image')); }
  }
  if(added.length){ state.sel=new Set(added); selChanged(); toast(added.length===1?'Image added':added.length+' images added'); }
  return true;
}
function dropTarget(n,d){
  const m=state.model; const ctr={x:n.x+n.w/2,y:n.y+n.h/2};
  const t=groupAt(ctr,d.c.nodes);
  if(!n.group||d.popped.has(n.id)) return t;
  if(t===n.group) return t;
  if(t&&isDesc(m,t,n.group)) return t;
  const hb=d.home.get(n.group); const gg=m.groups.get(n.group); const mg=gg&&gg.dev?0:56/state.view.z;
  if(hb&&ctr.x>=hb.x-mg&&ctr.x<=hb.x+hb.w+mg&&ctr.y>=hb.y-mg&&ctr.y<=hb.y+hb.h+mg) return n.group;
  return t;
}
function eraseAt(p){
  const m=state.model,d=state.drag; if(!m||!d) return false; const r=10/state.view.z; let hit=false;
  for(const k of m.inks){
    if(d.hits.has(k.id)) continue; const tol=r+k.w/2; const b=inkBox(k);
    if(p.x<b.x-tol||p.x>b.x+b.w+tol||p.y<b.y-tol||p.y>b.y+b.h+tol) continue;
    const P=k.pts;
    for(let i=0;i<P.length;i++){
      const a=P[i],c=P[Math.min(i+1,P.length-1)]; const dx=c[0]-a[0],dy=c[1]-a[1]; const L=dx*dx+dy*dy;
      let t=L?((p.x-a[0])*dx+(p.y-a[1])*dy)/L:0; t=Math.max(0,Math.min(1,t));
      if(Math.hypot(a[0]+t*dx-p.x,a[1]+t*dy-p.y)<=tol){ d.hits.add(k.id); hit=true; break; }
    }
  }
  return hit;
}
function createNode(o){
  let nid=null;
  mutate(mm=>{
    const sh=SHAPES.find(s=>s.id===o.shape)||SHAPES[0];
    const label=o.label!=null?o.label:sh.def;
    nid=idFrom(o.idBase||label,id=>mm.nodes.has(id)||mm.groups.has(id));
    const n={id:nid,label,shape:o.shape==='icon'?'icon':sh.id,icon:o.icon||null,group:o.group||null,cls:null};
    if(o.shape==='sticky'||o.shape==='table'||o.shape==='doc'||UI_KINDS[o.shape]) n.shape=o.shape;
    if(n.shape==='table') n.table=cleanTable(o.table); if(n.shape==='doc') n.doc=cleanDoc(o.doc);
    if(o.rect){ n.w=o.rect.w; n.h=o.rect.h; n.sized=true; }
    sizeNode(n);
    if(o.rect){ n.x=o.rect.x; n.y=o.rect.y; }
    else { n.x=SNAP(o.cx-n.w/2); n.y=SNAP(o.cy-(n.shape==='icon'?ICON/2:n.h/2)); }
    mm.nodes.set(nid,n); mm.nodeOrder.push(nid);
    if(o.style) mm.styles.set(nid,o.style);
  });
  return nid;
}
board.addEventListener('dblclick',e=>{
  if(!state.model||state.fatal||state.richId) return;
  let tgt=e.target.closest&&e.target.closest('[data-kind]'); let kind=tgt&&tgt.dataset.kind;
  // The shape may have been redrawn between the two clicks, so the event lands on the board itself:
  // look up what is under the pointer instead, and never drop a new shape on top of an existing one.
  if(!kind||kind==='group'){ const hit=nodeAt(toWorld(e)); if(hit){ kind='node'; tgt={dataset:{id:hit}}; } }
  if(kind==='node'){ if(state.editing&&state.editing.kind==='node'&&state.editing.id===tgt.dataset.id) return; state.pendingEdit=null; openEditor('node',tgt.dataset.id,toWorld(e)); return; }
  if(state.editing) return;
  if(kind==='edge'){ if(state.editing&&state.editing.kind==='edge'&&state.editing.id===+tgt.dataset.idx) return; state.pendingEdit=null; openEditor('edge',+tgt.dataset.idx); return; }
  if(kind==='group'&&tgt.dataset.part!=='body'){ openEditor('group',tgt.dataset.id); return; }
  if(kind&&kind!=='group') return;
  const p=toWorld(e); const nid=createNode({shape:'round',cx:p.x,cy:p.y,group:groupAt(p)||null,label:'Step'});
  if(nid){ state.sel=new Set(['n:'+nid]); selChanged(); openEditor('node',nid); }
});
board.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=boardRect(); const k=e.deltaMode===1?16:e.deltaMode===2?r.height:1;
  if(e.ctrlKey||e.metaKey){
    // Mouse wheels send big steps (about 100 per notch): zoom about 10% per notch, like Miro and Figma.
    // Trackpad pinches send many small steps: keep those smooth.
    const dy=e.deltaY*k; const notch=Math.abs(dy)>=40&&Number.isInteger(e.deltaY);
    const f=notch?Math.pow(1.1,-Math.sign(dy)*Math.min(3,Math.abs(dy)/100)):Math.exp(-Math.max(-60,Math.min(60,dy))*0.006);
    zoomAt(f,e.clientX-r.left,e.clientY-r.top); }
  else { state.view.x-=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*k; state.view.y-=(e.shiftKey&&!e.deltaX?0:e.deltaY)*k; applyView(); }
},{passive:false});
boardPane.addEventListener('dragover',e=>{ if(e.dataTransfer&&([...e.dataTransfer.types].includes('application/x-mab-icon')||[...e.dataTransfer.types].includes('Files'))){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; } });
boardPane.addEventListener('drop',e=>{
  if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ const imgs=[...e.dataTransfer.files].filter(f=>/^image\//.test(f.type)); if(imgs.length){ e.preventDefault(); addImageFiles(imgs,toWorld(e)); return; } }
  const key=e.dataTransfer&&e.dataTransfer.getData('application/x-mab-icon'); if(!key) return;
  e.preventDefault(); const p=toWorld(e); const on=nodeAt(p);
  if(on&&state.model.nodes.get(on).shape==='icon'){ setIcon([on],key); return; }
  addIconNode(key,p);
});
