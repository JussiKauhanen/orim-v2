/* orim · selection.js
 * Delete, group, copy, paste, nudge, align, icons, frames, images.
 */
'use strict';
function selChanged(){ closePop(); render(); if(typeof AI!=='undefined') AI.onSel(); }
function selKinds(){ const k={n:0,e:0,g:0,k:0,a:0,p:0}; for(const s of state.sel) k[s[0]]++; return k; }
function deleteSel(){
  if(!state.sel.size) return;
  mutate(m=>{
    const delN=new Set(),delG=new Set(),delE=new Set();
    const delK=new Set(),delA=new Set(),delP=new Set();
    for(const k of state.sel) if(k[0]==='p') delP.add(k.slice(2));
    if(delP.size) m.images=m.images.filter(im=>!delP.has(im.id));
    for(const k of state.sel) if(k[0]==='a') delA.add(k.slice(2));
    if(delA.size) m.arrows=m.arrows.filter(a=>!delA.has(a.id));
    for(const k of state.sel){ const id=k.slice(2); if(k[0]==='n') delN.add(id); else if(k[0]==='e') delE.add(+id); else if(k[0]==='k') delK.add(id); else if(k[0]==='a'||k[0]==='p'){} else delG.add(id); }
    if(delK.size) m.inks=m.inks.filter(k=>!delK.has(k.id));
    for(const gid of [...delG]) for(const g of m.groups.values()) if(isDesc(m,g.id,gid)) delG.add(g.id);
    for(const n of m.nodes.values()) if(n.group&&delG.has(n.group)) delN.add(n.id);
    m.edges=m.edges.filter((e,i)=>!delE.has(i)&&!delN.has(e.from)&&!delN.has(e.to)&&!delG.has(e.from)&&!delG.has(e.to));
    for(const id of delN){ m.nodes.delete(id); m.styles.delete(id); m.pos.delete(id); state.cache.delete(id); }
    m.nodeOrder=m.nodeOrder.filter(id=>!delN.has(id));
    for(const id of delG){ m.groups.delete(id); m.styles.delete(id); m.pos.delete(id); }
    m.groupOrder=m.groupOrder.filter(id=>!delG.has(id));
  });
  state.sel.clear(); selChanged();
}
function groupSel(){
  const m=state.model; if(!m) return;
  const nodes=selNodes(); const groups=[...state.sel].filter(k=>k[0]==='g').map(k=>m.groups.get(k.slice(2))).filter(Boolean);
  if(!nodes.length&&!groups.length) return;
  let gid=null;
  mutate(mm=>{
    gid=idFrom('group',id=>mm.nodes.has(id)||mm.groups.has(id));
    const parents=new Set([...nodes.map(n=>n.group||null),...groups.map(g=>g.parent||null)]);
    let parent=parents.size===1?[...parents][0]:null;
    if(parent&&groups.some(g=>g.id===parent||isDesc(mm,parent,g.id))) parent=null;
    if(!parent&&parents.size>1){ const anc=[...parents].filter(Boolean); const common=anc.find(a=>anc.every(x=>x===a||isDesc(mm,x,a))); if(common&&!groups.some(g=>g.id===common)) parent=common; }
    mm.groups.set(gid,{id:gid,label:'Group',parent,dir:null}); mm.groupOrder.push(gid);
    nodes.forEach(n=>{ mm.nodes.get(n.id).group=gid; });
    groups.forEach(g=>{ mm.groups.get(g.id).parent=gid; });
  });
  state.sel=new Set(['g:'+gid]); selChanged(); openEditor('group',gid);
}
function ungroupSel(){
  const ids=[...state.sel].filter(k=>k[0]==='g').map(k=>k.slice(2)); if(!ids.length) return;
  const keep=[];
  mutate(m=>{
    for(const gid of ids){ const g=m.groups.get(gid); if(!g) continue;
      for(const n of m.nodes.values()) if(n.group===gid){ n.group=g.parent||null; keep.push('n:'+n.id); }
      for(const c of m.groups.values()) if(c.parent===gid) c.parent=g.parent||null;
      m.groups.delete(gid); m.groupOrder=m.groupOrder.filter(x=>x!==gid); m.styles.delete(gid); m.pos.delete(gid);
    }
  });
  state.sel=new Set(keep); selChanged();
}
function copySel(){
  const m=state.model; if(!m) return false; const nodes=selNodes(); if(!nodes.length) return false;
  const ids=new Set(nodes.map(n=>n.id));
  state.clip={nodes:nodes.map(n=>({id:n.id,label:n.label,shape:n.shape,icon:n.icon,x:n.x,y:n.y,w:n.w,h:n.h,sized:n.sized,group:n.group,table:n.table?JSON.parse(JSON.stringify(n.table)):null,doc:n.doc?JSON.parse(JSON.stringify(n.doc)):null,style:m.styles.get(n.id)?JSON.parse(JSON.stringify(m.styles.get(n.id))):null})),edges:m.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>({...e}))};
  state.pasteN=0; return true;
}
function pasteClip(){
  const c=state.clip; if(!c||!state.model) return;
  state.pasteN++; const off=24*state.pasteN; const map=new Map(); const sel=[];
  mutate(m=>{
    for(const o of c.nodes){
      const nid=idFrom(o.id.replace(/\d+$/,''),id=>m.nodes.has(id)||m.groups.has(id)); map.set(o.id,nid);
      const n={id:nid,label:o.label,shape:o.shape,icon:o.icon,group:o.group&&m.groups.has(o.group)?o.group:null,cls:null,x:o.x+off,y:o.y+off,sized:o.sized,w:o.w,h:o.h}; if(o.table) n.table=JSON.parse(JSON.stringify(o.table)); if(o.doc) n.doc=JSON.parse(JSON.stringify(o.doc));
      sizeNode(n); m.nodes.set(nid,n); m.nodeOrder.push(nid); if(o.style) m.styles.set(nid,JSON.parse(JSON.stringify(o.style))); sel.push('n:'+nid);
    }
    for(const e of c.edges) m.edges.push({...e,from:map.get(e.from),to:map.get(e.to)});
  });
  state.sel=new Set(sel); selChanged();
}
function nudge(dx,dy){
  const m=state.model; if(!m) return; const c=collectMove(); if(!c.nodes.size&&!c.groups.size&&!c.inks.size&&!c.arrows.size&&!c.pics.size) return;
  mutate(mm=>{ for(const im of mm.images) if(c.pics.has(im.id)){ im.x+=dx; im.y+=dy; } for(const a of mm.arrows) if(c.arrows.has(a.id)){ a.x1+=dx;a.x2+=dx;a.y1+=dy;a.y2+=dy; } for(const k of mm.inks) if(c.inks.has(k.id)) k.pts=k.pts.map(([x,y])=>[x+dx,y+dy]); for(const id of c.nodes){ const n=mm.nodes.get(id); n.x+=dx; n.y+=dy; } for(const gid of c.groups){ const p=mm.pos.get(gid); if(p&&p.w) mm.pos.set(gid,{...p,x:p.x+dx,y:p.y+dy}); } },{structural:false});
}
function align(kind){
  const ns=selNodes(); if(ns.length<2) return;
  mutate(()=>{
    const x0=Math.min(...ns.map(n=>n.x)),x1=Math.max(...ns.map(n=>n.x+n.w)),y0=Math.min(...ns.map(n=>n.y)),y1=Math.max(...ns.map(n=>n.y+n.h));
    if(kind==='l') ns.forEach(n=>n.x=x0);
    if(kind==='c') ns.forEach(n=>n.x=SNAP((x0+x1)/2-n.w/2));
    if(kind==='t') ns.forEach(n=>n.y=y0);
    if(kind==='m') ns.forEach(n=>n.y=SNAP((y0+y1)/2-n.h/2));
    if(kind==='h'&&ns.length>2){ const s=[...ns].sort((a,b)=>a.x-b.x); const tot=s.reduce((a,n)=>a+n.w,0); const gap=(x1-x0-tot)/(s.length-1); let x=x0; s.forEach(n=>{n.x=Math.round(x);x+=n.w+gap;}); }
    if(kind==='v'&&ns.length>2){ const s=[...ns].sort((a,b)=>a.y-b.y); const tot=s.reduce((a,n)=>a+n.h,0); const gap=(y1-y0-tot)/(s.length-1); let y=y0; s.forEach(n=>{n.y=Math.round(y);y+=n.h+gap;}); }
  },{structural:false});
}
function setIcon(ids,key){
  mutate(m=>{ for(const id of ids){ const n=m.nodes.get(id); if(!n) continue; const wasIcon=n.shape==='icon'; n.shape='icon'; n.icon=key; if(!wasIcon){ m.styles.delete(id); } m.pos.set(id,{x:n.x,y:n.y}); n.sized=false; } });
}
function addIconNode(key,p){
  const ic=iconFor(key); if(!ic) return;
  if(!p){
    const r=boardRect(); const left=64+((state.libOpen&&r.width>760)?300:0);
    p=toWorld({clientX:r.left+left+(r.width-left)/2,clientY:r.top+r.height/2-30});
    for(let k=0;k<30&&nodeAt(p,8);k++){ p.x+=SNAP(24); p.y+=SNAP(24); }
  }
  const nid=createNode({shape:'icon',icon:key,label:ic.title,idBase:ic.title,cx:p.x,cy:p.y,group:groupAt(p)||null});
  if(nid){ state.sel=new Set(['n:'+nid]); selChanged(); }
}
