/* orim · view.js
 * Pan, zoom, fit and tidy up.
 */
'use strict';
function boardRect(){ return board.getBoundingClientRect(); }
function toWorld(e){ const r=boardRect(); return {x:(e.clientX-r.left-state.view.x)/state.view.z,y:(e.clientY-r.top-state.view.y)/state.view.z}; }
function toScreen(p){ return {x:p.x*state.view.z+state.view.x,y:p.y*state.view.z+state.view.y}; }
function zoomAt(f,sx,sy){
  const v=state.view; const nz=clamp(v.z*f,0.1,4); const wx=(sx-v.x)/v.z,wy=(sy-v.y)/v.z;
  v.x=sx-wx*nz; v.y=sy-wy*nz; v.z=nz; renderOverlay(); applyView();
}
function contentBounds(m){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const n of m.nodes.values()){ if(n.x==null) continue; x0=Math.min(x0,n.x);y0=Math.min(y0,n.y);x1=Math.max(x1,n.x+n.w);y1=Math.max(y1,n.y+n.h); }
  for(const b of m.images||[]){ x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h); }
  for(const a of m.arrows||[]){ const b=arrowBox(resolveArrow(m,a)); x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h); }
  for(const k of m.inks||[]){ const b=inkBox(k); x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h); }
  for(const b of groupBoxes(m).values()){ x0=Math.min(x0,b.x);y0=Math.min(y0,b.y-30);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h); }
  m.edges.forEach(e=>{ if(e.from===e.to){ const n=m.nodes.get(e.from); if(n){ x1=Math.max(x1,n.x+n.w+50); y0=Math.min(y0,n.y-50);} } });
  return x0===Infinity?null:{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function visibleArea(){ const r=boardRect(); return {r,left:64+((state.libOpen&&r.width>760)?300:0),top:8,bottom:24}; }
function fitTarget(){
  const {r,left,top,bottom}=visibleArea(); if(!r.width) return null;
  const b=state.model&&contentBounds(state.model);
  const W=r.width-left, Hh=r.height-bottom-top;
  if(!b) return {x:left+W/2,y:top+Hh/2,z:1};
  const z=clamp(Math.min((W-64)/b.w,(Hh-48)/b.h,1.25),0.15,1.25);
  return {x:left+(W-b.w*z)/2-b.x*z,y:top+(Hh-b.h*z)/2-b.y*z,z};
}
let viewAnim=0;
function fit(animate){
  const t=fitTarget(); if(!t) return;
  cancelAnimationFrame(viewAnim);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!animate||reduce){ state.view=t; applyView(); renderOverlay(); return; }
  const s0={...state.view},t0=performance.now(),D=320;
  const step=now=>{ const k=Math.min(1,(now-t0)/D),e=1-Math.pow(1-k,3);
    state.view={x:s0.x+(t.x-s0.x)*e,y:s0.y+(t.y-s0.y)*e,z:s0.z+(t.z-s0.z)*e}; applyView(); if(k<1) viewAnim=requestAnimationFrame(step); else renderOverlay(); };
  viewAnim=requestAnimationFrame(step);
}
/* After text edits: bring new things into view and flash them briefly */
function nodeIds(){ return new Set(state.model?state.model.nodes.keys():[]); }
function revealNew(prev){
  const m=state.model; if(!m||!prev||app.hidden) return;
  const fresh=[...m.nodes.keys()].filter(id=>!prev.has(id)); if(!fresh.length) return;
  const {r,left,top,bottom}=visibleArea(); if(!r.width) return;
  const v=state.view; let out=false;
  for(const id of fresh){ const n=m.nodes.get(id); if(!n||n.x==null) continue; const x0=n.x*v.z+v.x,y0=n.y*v.z+v.y,x1=(n.x+n.w)*v.z+v.x,y1=(n.y+n.h)*v.z+v.y; if(x0<left+8||y0<top+8||x1>r.width-8||y1>r.height-bottom-8){ out=true; break; } }
  if(out) fit(true);
  setTimeout(()=>{ for(const id of fresh.slice(-12)){ const el=R.nodeEls.get(id); if(!el) continue; el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),1700); } },out?260:0);
}
$('#zoomIn').addEventListener('click',()=>{const r=boardRect();zoomAt(1.2,r.width/2,r.height/2);});
$('#zoomOut').addEventListener('click',()=>{const r=boardRect();zoomAt(1/1.2,r.width/2,r.height/2);});
$('#zoomPct').addEventListener('click',()=>{const r=boardRect();zoomAt(1/state.view.z,r.width/2,r.height/2);});
$('#zoomFit').addEventListener('click',fit);
$('#tidyBtn').addEventListener('click',e=>{ e.stopPropagation(); toggleMenu('#tidyMenu'); });
$('#tidyMenu').addEventListener('click',e=>{
  const c=e.target.closest('[data-curve]'); if(c){ setBoardCurve(c.dataset.curve); updCurveSeg(); return; }
  const b=e.target.closest('[data-tidy]'); if(!b) return; closeMenus(); if(b.dataset.tidy==='auto') tidy(); else lineUp(); });
$('#tidyBtn').addEventListener('click',()=>updCurveSeg());
function updCurveSeg(){ const cur=(state.model&&state.model.curve)||'curved'; for(const b of document.querySelectorAll('#curveSeg [data-curve]')) b.setAttribute('aria-pressed',String(b.dataset.curve===cur)); }
// The board's connector style is Mermaid's own curve setting in the front matter,
// so other Mermaid tools draw the board the same way: step = elbow, linear = straight.
function setBoardCurve(v){
  if(!state.model||state.fatal) return;
  const val={elbow:'step',straight:'linear',curved:'basis'}[v]||'basis';
  mutate(mm=>{
    const L=mm.fmExtra.slice(); const ci=L.findIndex(l=>/^\s*curve\s*:/.test(l));
    if(ci>=0){ if(v==='curved') L.splice(ci,1); else L[ci]=L[ci].replace(/curve\s*:.*/,'curve: '+val); }
    else if(v!=='curved'){ const fi=L.findIndex(l=>/^\s*flowchart\s*:/.test(l)), gi=L.findIndex(l=>/^config\s*:/.test(l));
      if(fi>=0){ const ind=/^\s*/.exec(L[fi])[0]+'  '; L.splice(fi+1,0,ind+'curve: '+val); }
      else if(gi>=0) L.splice(gi+1,0,'  flowchart:','    curve: '+val);
      else L.push('config:','  flowchart:','    curve: '+val); }
    // tidy an emptied config block
    for(let k=L.length-1;k>=0;k--){ if(/^\s*flowchart\s*:\s*$/.test(L[k])&&!(L[k+1]&&/^\s{4,}\S/.test(L[k+1]))) L.splice(k,1); }
    for(let k=L.length-1;k>=0;k--){ if(/^config\s*:\s*$/.test(L[k])&&!(L[k+1]&&/^\s+\S/.test(L[k+1]))) L.splice(k,1); }
    mm.fmExtra=L; mm.curve=v;
    for(const e of mm.edges) if(e.route===v) delete e.route;
  });
  toast({curved:'Curved',straight:'Straight',elbow:'Elbow'}[v]+' connectors for this board');
}
// Auto layout: rearranges everything from the connections (dagre).
function tidy(){
  const m=state.model; if(!m||!m.nodes.size) return;
  for(const gid of m.groupOrder) if(groupHasMembers(m,gid)&&!m.groups.get(gid).dev) m.pos.delete(gid);
  autoLayout(m); mutate(()=>{}, {structural:false}); fit(); toast('Rearranged. Undo with Ctrl+Z');
}
// Line up: keeps your layout and only straightens it. Shapes whose centres are nearly in a row or column
// are put exactly in line, then overlaps are pushed apart. Works on the selection, or on everything.
function lineUp(){
  const m=state.model; if(!m||!m.nodes.size||state.fatal) return;
  const picked=[...state.sel].filter(k=>k[0]==='n').map(k=>k.slice(2));
  const ids=picked.length>=2?picked:[...m.nodeOrder];
  const before=new Map(ids.map(id=>{ const n=m.nodes.get(id); return [id,n?n.x+','+n.y:'']; }));
  mutate(mm=>{
    // Pieces of a mockup screen stay where they were drawn; the screen moves as one block.
    const inDev=n=>{ let g=n.group&&mm.groups.get(n.group),k=0; while(g&&k++<60){ if(g.dev) return true; g=g.parent&&mm.groups.get(g.parent); } return false; };
    const nodes=ids.map(id=>mm.nodes.get(id)).filter(n=>n&&n.x!=null&&!inDev(n));
    const by=new Map(); for(const n of nodes){ const k=n.group||''; if(!by.has(k)) by.set(k,[]); by.get(k).push(n); }
    for(const list of by.values()){ alignAxis(list,'y'); alignAxis(list,'x'); separate(list); }
    if(!(picked.length>=2)) separateBlocks(mm,null);
    for(const n of mm.nodes.values()) state.cache.set(n.id,{x:n.x,y:n.y});
  },{structural:false});
  const changed=ids.filter(id=>{ const n=state.model.nodes.get(id); return n&&before.get(id)!==n.x+','+n.y; }).length;
  toast(changed?'Lined up '+changed+(changed===1?' shape':' shapes')+'. Undo with Ctrl+Z':'Already lined up');
}
function alignAxis(list,ax){
  const W=ax==='x'?'w':'h'; const c=n=>n[ax]+n[W]/2;
  const s=[...list].sort((a,b)=>c(a)-c(b)); let cl=[];
  const flush=()=>{ if(cl.length>1){ const cs=cl.map(c).sort((a,b)=>a-b); const t=Math.round(cs[Math.floor((cs.length-1)/2)]/4)*4; for(const n of cl) n[ax]=t-n[W]/2; } cl=[]; };
  for(const n of s){ if(cl.length&&c(n)-c(cl[0])>Math.max(16,0.45*Math.min(n[W],cl[0][W]))) flush(); cl.push(n); }
  flush();
}
function separate(list){
  const G=24;
  for(let pass=0;pass<6;pass++){ let moved=false; const s=[...list].sort((a,b)=>a.x-b.x||a.y-b.y);
    for(let i=0;i<s.length;i++) for(let j=i+1;j<s.length;j++){ const a=s[i],b=s[j];
      const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x), oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
      if(ox<=0||oy<=0) continue;
      const sameRow=Math.abs((a.y+a.h/2)-(b.y+b.h/2))<1, sameCol=Math.abs((a.x+a.w/2)-(b.x+b.w/2))<1;
      if(sameRow||(!sameCol&&ox<=oy)) b.x=a.x+a.w+G; else b.y=a.y+a.h+G;
      moved=true; }
    if(!moved) break; }
}
