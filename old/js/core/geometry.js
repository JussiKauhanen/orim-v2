/* orim · core/geometry.js
 * Pure geometry: text wrap, node sizing, auto layout, frames, connector and arrow shapes.
 */
'use strict';
function wrapText(text,maxW,size,font){
  const out=[];
  for(const para of String(text).split('\n')){
    const words=para.split(/\s+/).filter(Boolean);
    if(!words.length){out.push('');continue;}
    let line=words[0];
    for(let k=1;k<words.length;k++){
      const t=line+' '+words[k];
      if(Core.measure(t,size,font)>maxW){ out.push(line); line=words[k]; } else line=t;
    }
    out.push(line);
  }
  return out;
}
function labelSize(n){ if(n.fsSet) return n.fsSet; return n.shape==='icon'?12:n.shape==='sticky'?(n.fs||15):(n.fsAuto||13); }
function lineH(n){ const f=labelSize(n); return n.shape==='icon'&&!n.fsSet?15:Math.round(f*1.3); }
function iconSize(n){
  if(!n.sized) return ICON;
  const th=(n.lines||[]).filter(Boolean).length*lineH(n);
  return Math.max(20,Math.min(n.w,n.h-th-8));
}
// ---- tables and documents: sizes and line layout, shared by drawing, editing and connectors ----
const TBL={title:32,pad:8,lh:17,fs:12.5,min:30};
function tableLayout(n){
  const rows=(n.table&&n.table.rows)||[[]]; const nc=Math.max(1,...rows.map(r=>r.length));
  const want=[]; for(let c=0;c<nc;c++){ let w=0; rows.forEach((r,ri)=>{ for(const l of String(r[c]||'').split('\n')) w=Math.max(w,Core.measure(l,TBL.fs)*((ri===0||c===0)?1.07:1)); }); want.push(Math.min(280,Math.max(84,w+TBL.pad*2+4))); }
  let total=want.reduce((a,b)=>a+b,0); const W=n.sized&&n.w?Math.max(nc*48,n.w):Math.max(260,total);
  const cols=want.map(w=>w*W/total);
  const cells=rows.map(r=>cols.map((cw,c)=>wrapText(String(r[c]||''),Math.max(20,cw-TBL.pad*2),TBL.fs)));
  const hs=cells.map(rc=>Math.max(TBL.min,Math.max(...rc.map(ls=>ls.length))*TBL.lh+12));
  const top=n.label&&n.label.trim()?TBL.title:0;
  return {cols,rows:hs,cells,top,w:W,h:top+hs.reduce((a,b)=>a+b,0)};
}
// The band of one table row, for connectors that attach to a row.
function rowRect(n,row){ const L=n._tl||tableLayout(n); const r=Math.max(0,Math.min(L.rows.length-1,row|0)); let y=n.y+L.top; for(let i=0;i<r;i++) y+=L.rows[i]; return {x:n.x,y,w:n.w,h:L.rows[r]}; }
function rowAt(n,y){ const L=n._tl||tableLayout(n); let yy=n.y+L.top; for(let i=0;i<L.rows.length;i++){ if(y<yy+L.rows[i]) return i; yy+=L.rows[i]; } return L.rows.length-1; }
const DOCF={h1:[19,700,10],h2:[16,700,8],h3:[14,700,6],p:[13,400,4],ul:[13,400,2],ol:[13,400,2],todo:[13,400,4],code:[12,400,8],quote:[13,400,6],hr:[13,400,6]};
function docLayout(n){
  const tk=n.doc&&TICKET_TYPES[n.doc.kind];
  const W=n.w||380, PADX=22, PADT=tk?(ticketLine(n)?84:68):n.label&&n.label.trim()?44:20; const out=[]; let y=PADT, k=0;
  for(const b of (n.doc&&n.doc.blocks)||[]){
    const [fs,wt,gap]=DOCF[b.t]||DOCF.p; const lh=Math.round(fs*(b.t==='code'?1.5:1.45)); const ind=b.t==='ul'||b.t==='ol'?18:b.t==='todo'?24:b.t==='quote'?14:b.t==='code'?12:0;
    if(b.t==='ol') k++; else k=0;
    y+=out.length?gap:0;
    if(b.t==='hr'){ out.push({t:'hr',fs,wt,lh,ind,num:0,y,lines:[]}); y+=12; continue; }
    if(b.t==='code'){ // monospace, lines kept as written and wrapped only when too long
      const cw=W-PADX*2-ind*2, lines=[]; y+=8;
      for(const raw of String((b.r[0]&&b.r[0].x)||'').split('\n')){ let rest=raw; if(!rest){ lines.push([{x:''}]); continue; }
        while(rest.length){ let n2=rest.length; while(n2>1&&Core.measure(rest.slice(0,n2),fs,'mono')>cw) n2=Math.floor(n2*0.9); lines.push([{x:rest.slice(0,n2)}]); rest=rest.slice(n2); } }
      if(!lines.length) lines.push([{x:''}]);
      out.push({t:'code',fs,wt,lh,ind,num:0,y,lines,lang:b.lang||''}); y+=lines.length*lh+8; continue; }
    // words with their style, wrapped greedily
    const words=[]; for(const r of b.r) for(const part of r.x.split(/(\s+|\n)/)){ if(!part) continue; if(part==='\n'){ words.push({nl:1}); continue; } if(/^\s+$/.test(part)){ words.push({sp:1,b:r.b,i:r.i,u:r.u}); continue; } words.push({x:part,b:r.b,i:r.i,u:r.u}); }
    const maxW=W-PADX*2-ind; const lines=[[]]; let lw=0;
    const width=w=>Core.measure(w.x,fs)*((w.b||wt>=700)?1.08:1);
    for(const w of words){ if(w.nl){ lines.push([]); lw=0; continue; } if(w.sp){ if(lines[lines.length-1].length){ lines[lines.length-1].push({x:' ',b:w.b,i:w.i,u:w.u}); lw+=fs*0.3; } continue; }
      const ww=width(w); if(lw+ww>maxW&&lines[lines.length-1].length){ const L=lines[lines.length-1]; while(L.length&&L[L.length-1].x===' ') L.pop(); lines.push([]); lw=0; } lines[lines.length-1].push(w); lw+=ww; }
    if(!lines[lines.length-1].length&&lines.length>1) lines.pop();
    out.push({t:b.t,fs,wt,lh,ind,num:k,y,lines,c:b.c?1:0}); y+=lines.length*lh;
  }
  return {blocks:out,h:Math.max(PADT+40,y+22),padx:PADX};
}
// Room for text inside a shape, and the size a shape takes for its text at 13 px.
function innerW(n,fs){ return Math.max(20,(n.shape==='diamond'?n.w*0.6:n.shape==='circle'||n.shape==='cloud'||n.shape==='star'?n.w*0.7:n.shape==='tri'?n.w*0.55:n.w-24)/(n.bold?1.07:1)); }
function innerH(n){ return n.shape==='diamond'?n.h*0.55:n.shape==='circle'||n.shape==='cloud'?n.h*0.7:n.shape==='star'?n.h*0.45:n.shape==='tri'?n.h*0.45:n.shape==='cyl'?n.h-44:n.shape==='bubble'?n.h*0.75-16:n.h-20; }
function naturalSize(n){ const c={...n,sized:false,fsSet:null,fsAuto:null,w:0,h:0}; sizeNode(c); return {w:c.w||120,h:c.h||52}; }
// Turned text (90 or 270 degrees) is laid out across the shape's height: swap the sides, lay out, swap back.
const canTurn=n=>!!n.rot&&!['icon','table','doc'].includes(n.shape)&&!isUi(n);
function sizeNode(n){
  if(canTurn(n)&&n.rot%180){ const sw=n.w!=null; if(sw) [n.w,n.h]=[n.h,n.w]; sizeNode0(n); [n.w,n.h]=[n.h,n.w]; return; }
  sizeNode0(n);
}
function sizeNode0(n){
  if(isUi(n)){ const k=UI_KINDS[n.shape]; if(!n.sized||!n.w){ n.w=k.w*MOCK; n.h=k.h*MOCK; } n.lines=[]; return; }
  if(n.shape==='table'){ if(!n.table) n.table={rows:[['','Option A','Option B'],['','',''],['','','']],colors:{}}; const L=tableLayout(n); n.w=Math.round(L.w); n.h=Math.ceil(L.h); n._tl=L; n.lines=[]; return; }
  if(n.shape==='doc'){ if(!n.doc) n.doc={blocks:[{t:'p',r:[]}]}; if(!n.sized||!n.w) n.w=380; const L=docLayout(n); n.h=Math.min(1600,Math.ceil(L.h)); n._dl=L; n.lines=[]; return; }
  if(n.shape==='sticky'){
    if(!n.sized){ n.w=160; n.h=160; }
    if(n.fsSet){ n.fs=n.fsSet; n.lines=wrapText(n.label,Math.max(20,n.w-28),n.fsSet,n.font); return; }
    // Auto size: 15 px on a standard note, growing with a bigger note and shrinking until the text fits.
    let fs=Math.max(8,Math.min(72,Math.round(15*Math.sqrt(n.w*n.h)/160))),lines;
    for(;fs>=8;fs--){ lines=wrapText(n.label,Math.max(20,n.w-28),fs,n.font); if(lines.length*Math.round(fs*1.3)<=n.h-28&&Math.max(0,...lines.map(l=>Core.measure(l,fs,n.font)))<=n.w-24) break; }
    n.fs=Math.max(8,fs); n.lines=lines; return;
  }
  // Auto text size in a resized shape: scale with the shape against its natural size, then shrink to fit.
  n.fsAuto=null;
  if(n.sized&&!n.fsSet&&n.shape!=='icon'&&n.shape!=='text'&&String(n.label||'').trim()){
    const nat=naturalSize(n); let f=Math.max(13,Math.min(44,Math.round(13*Math.min(n.w/nat.w,n.h/nat.h)*2)/2));
    for(;f>8;f-=0.5){ const iw=innerW(n,f), ls=wrapText(n.label,iw,f,n.font); if(ls.length*Math.round(f*1.3)<=innerH(n)&&Math.max(0,...ls.map(l=>Core.measure(l,f,n.font)))<=iw+1) break; }
    if(Math.abs(f-13)>=0.5) n.fsAuto=f;
  }
  const fs=labelSize(n); const k=fs/13;
  const maxW=n.sized?Math.max(20,n.shape==='icon'?n.w-6:n.shape==='text'?n.w-12:innerW(n,fs)*(n.bold?1.07:1)):(n.shape==='icon'?150*k:n.shape==='text'?320*k:200*k);
  const lines=wrapText(n.label,maxW/(n.bold?1.07:1),fs,n.font); n.lines=lines;
  if(n.sized){
    const th=lines.length*lineH(n);
    if(n.shape==='text') n.h=Math.max(Math.round(fs*1.3)+10,th+12);
    else if(n.shape!=='icon'){ const need=n.shape==='diamond'?th*1.7+40:n.shape==='circle'||n.shape==='cloud'?th*1.4+32:n.shape==='star'||n.shape==='tri'?th*2.2+30:n.shape==='cyl'?th+44:n.shape==='bubble'?th+40:th+24; if(need>n.h) n.h=Math.ceil(need/GRID)*GRID; }
    return; }
  const tw=Math.max(0,...lines.map(l=>measureN(n,l,fs)));
  const th=lines.length*lineH(n);
  switch(n.shape){
    case 'icon':{ const has=lines.some(Boolean); n.w=Math.max(88,Math.ceil(tw)+12); n.h=ICON+(has?8+lines.filter(Boolean).length*15:0); break; }
    case 'text': n.w=Math.max(40,tw+16); n.h=Math.max(28,th+12); break;
    case 'circle':{ const d=Math.max(72,tw+32,th+32); n.w=n.h=d; break; }
    case 'diamond': n.w=Math.max(120,tw*1.6+40); n.h=Math.max(80,th*1.7+40); break;
    case 'cloud': n.w=Math.max(150,tw*1.5+48); n.h=Math.max(96,th*1.6+44); break;
    case 'star': { const d=Math.max(120,tw*1.8+24,th*2.6+40); n.w=n.h=d; break; }
    case 'tri': n.w=Math.max(130,tw*2+24); n.h=Math.max(104,th*2.3+40); break;
    case 'bubble': n.w=Math.max(130,tw+40); n.h=Math.max(72,th+44); break;
    case 'arrow': n.w=Math.max(140,tw+80); n.h=Math.max(64,th+32); break;
    case 'chevron': n.w=Math.max(140,tw+72); n.h=Math.max(56,th+28); break;
    case 'paper': n.w=Math.max(120,tw+36); n.h=Math.max(64,th+40); break;
    default:
      n.w=Math.max(120,tw+(n.shape==='hex'||n.shape==='para'?56:36)); n.h=Math.max(52,th+28);
      if(n.shape==='cyl') n.h=Math.max(68,th+44);
      if(n.shape==='stadium') n.w+=12;
      if(n.shape==='sub') n.w+=16;
  }
  n.w=Math.ceil(n.w/GRID)*GRID; n.h=Math.ceil(n.h/GRID)*GRID;
}
function overlaps(a,b,gap){return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;}
function placeNear(n,m,placed){
  let anchor=null;
  for(const e of m.edges){
    if(e.to===n.id&&placed.has(e.from)){anchor=m.nodes.get(e.from);break;}
  }
  if(!anchor) for(const e of m.edges){ if(e.from===n.id&&placed.has(e.to)){anchor=m.nodes.get(e.to);break;} }
  if(!anchor&&n.group) for(const id of placed){ const o=m.nodes.get(id); if(o&&o.group===n.group){anchor=o;} }
  const dir=m.dir==='TD'?'TB':m.dir; const horiz=dir==='LR'||dir==='RL';
  let x,y;
  if(anchor){
    if(dir==='LR'){x=anchor.x+anchor.w+88;y=anchor.y+(anchor.h-n.h)/2;}
    else if(dir==='RL'){x=anchor.x-88-n.w;y=anchor.y+(anchor.h-n.h)/2;}
    else if(dir==='BT'){x=anchor.x+(anchor.w-n.w)/2;y=anchor.y-72-n.h;}
    else {x=anchor.x+(anchor.w-n.w)/2;y=anchor.y+anchor.h+72;}
  } else if(placed.size){
    let minX=Infinity,maxY=-Infinity;
    for(const id of placed){const o=m.nodes.get(id); if(!o) continue; minX=Math.min(minX,o.x); maxY=Math.max(maxY,o.y+o.h);}
    x=minX; y=maxY+72;
  } else {x=0;y=0;}
  const r={x:SNAP(x),y:SNAP(y),w:n.w,h:n.h};
  for(let k=0;k<80;k++){
    let hit=false;
    for(const id of placed){const o=m.nodes.get(id); if(o&&overlaps(r,o,24)){hit=true;break;}}
    if(!hit) break;
    if(horiz) r.y+=SNAP(n.h+32); else r.x+=SNAP(n.w+40);
  }
  n.x=r.x; n.y=r.y;
}
// Auto layout, frame by frame (inside out): each frame is laid out on its own and becomes one block,
// then the level above is laid out with those blocks. Frames stay compact and in one piece, the way
// Mermaid draws subgraphs. Arrows into a frame count as arrows to its block on the level above.
function autoLayout(m){
  if(!m.nodes.size) return;
  if(typeof dagre==='undefined'){ gridLayout(m); return; }
  try{ layoutBlocks(m); }catch(err){ gridLayout(m); }
}
function layoutBlocks(m){
  const used=new Set(); for(const n of m.nodes.values()){ let p=n.group,k=0; while(p&&m.groups.has(p)&&k++<60){ used.add(p); p=m.groups.get(p).parent; } }
  const parentOf=id=>{ const n=m.nodes.get(id); if(n) return n.group&&used.has(n.group)?n.group:null; const g=m.groups.get(id); return g&&g.parent&&used.has(g.parent)?g.parent:null; };
  const childIn=(id,block)=>{ if(!m.nodes.has(id)&&!used.has(id)) return null; let cur=id,k=0; while(k++<60){ const p=parentOf(cur); if(p===block) return cur; if(p===null) return null; cur=p; } return null; };
  const blocks=new Map();
  const devBox=block=>{ const g=block&&m.groups.get(block); if(!g||!g.dev) return null; const D=DEVICES[g.dev]; const p=m.pos.get(block); if(p&&p.w) return {x:p.x,y:p.y,w:p.w,h:p.h};
    let x0=Infinity,y0=Infinity; for(const n of m.nodes.values()) if(n.group===block&&n.x!=null){ x0=Math.min(x0,n.x); y0=Math.min(y0,n.y); } return {x:isFinite(x0)?x0:0,y:isFinite(y0)?y0-D.top*MOCK:0,w:D.w*MOCK,h:D.h*MOCK}; };
  function layout(block){
    if(blocks.has(block)) return blocks.get(block);
    const kids=[]; for(const id of m.nodeOrder) if(m.nodes.has(id)&&parentOf(id)===block) kids.push(id);
    for(const gid of m.groupOrder) if(used.has(gid)&&parentOf(gid)===block) kids.push(gid);
    // A screen is a drawing: its pieces keep their places inside the device.
    const db=devBox(block);
    if(db){ const pos=new Map(); for(const k of kids){ const n=m.nodes.get(k); if(n&&n.x!=null) pos.set(k,{x:n.x-db.x,y:n.y-db.y}); else if(n) pos.set(k,{x:8,y:DEVICES[m.groups.get(block).dev].top*devScale(m,block)+8}); }
      const r={w:db.w,h:db.h,pos,dev:true}; blocks.set(block,r); return r; }
    const sz=new Map(kids.map(k=>{ const n=m.nodes.get(k); if(n) return [k,{w:n.w,h:n.h}]; const b=layout(k); return [k,{w:b.w,h:b.h}]; }));
    const raw=(block&&m.groups.get(block).dir)||m.dir; const dir=raw==='TD'?'TB':(raw||'LR');
    const ks=new Set(kids), es=[], ext=[];
    m.edges.forEach((e,i)=>{ const a=childIn(e.from,block), b=childIn(e.to,block);
      if(a&&b&&a!==b&&ks.has(a)&&ks.has(b)) es.push({a,b,e,i});
      // Arrows that leave the frame pull their shape toward that side, so the inside lines up with the outside.
      else if(block!==null&&a&&!b&&ks.has(a)) ext.push({a,b:'>'+e.to,i}); else if(block!==null&&b&&!a&&ks.has(b)) ext.push({a:'<'+e.from,b,i}); });
    let pos;
    if(!es.length&&!ext.length&&block!==null) pos=stackLayout(kids,sz,dir);
    else {
      const g=new dagre.graphlib.Graph({multigraph:true});
      g.setGraph({rankdir:dir,nodesep:48,ranksep:76,edgesep:20,marginx:0,marginy:0}); g.setDefaultEdgeLabel(()=>({}));
      for(const k of kids) g.setNode(k,{width:sz.get(k).w,height:sz.get(k).h});
      for(const x of ext){ for(const v of [x.a,x.b]) if(!ks.has(v)&&!g.hasNode(v)) g.setNode(v,{width:1,height:1}); g.setEdge(x.a,x.b,{minlen:1,weight:1},'x'+x.i); }
      for(const x of es){ const lw=x.e.label?Core.measure(x.e.label,12)+16:0; g.setEdge(x.a,x.b,{width:lw,height:x.e.label?22:0,labelpos:'c',minlen:1,weight:2},'e'+x.i); }
      dagre.layout(g);
      pos=new Map(kids.map(k=>{ const p=g.node(k); return [k,{x:p.x-sz.get(k).w/2,y:p.y-sz.get(k).h/2}]; }));
    }
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const k of kids){ const p=pos.get(k),s=sz.get(k); x0=Math.min(x0,p.x); y0=Math.min(y0,p.y); x1=Math.max(x1,p.x+s.w); y1=Math.max(y1,p.y+s.h); }
    if(!kids.length){ x0=y0=x1=y1=0; }
    const pl=block===null?0:PAD, pt=block===null?0:PAD_TOP;
    for(const k of kids){ const p=pos.get(k); p.x=p.x-x0+pl; p.y=p.y-y0+pt; }
    const r={w:(x1-x0)+(block===null?0:PAD*2),h:(y1-y0)+(block===null?0:PAD_TOP+PAD),pos};
    blocks.set(block,r); return r;
  }
  layout(null);
  const place=(block,ox,oy)=>{ const B=blocks.get(block); if(B.dev) m.pos.set(block,{x:SNAP(ox),y:SNAP(oy),w:B.w,h:B.h});
    for(const [k,p] of B.pos){ const n=m.nodes.get(k); if(n){ n.x=B.dev?SNAP(ox)+p.x:SNAP(ox+p.x); n.y=B.dev?SNAP(oy)+p.y:SNAP(oy+p.y); } else place(k,ox+p.x,oy+p.y); } };
  place(null,40,40);
}
// Shapes in a frame with no arrows between them: a neat column (left-to-right boards) or row (top-down).
function stackLayout(kids,sz,dir){
  const vert=dir==='LR'||dir==='RL', G=24, perLine=Math.ceil(kids.length/Math.ceil(kids.length/6||1))||1;
  const lines=[]; kids.forEach((k,i)=>{ if(i%perLine===0) lines.push([]); lines[lines.length-1].push(k); });
  const pos=new Map(); let off=0;
  for(const line of lines){
    const cross=Math.max(...line.map(k=>vert?sz.get(k).w:sz.get(k).h)); let along=0;
    for(const k of line){ const s=sz.get(k); const c=(cross-(vert?s.w:s.h))/2;
      pos.set(k,vert?{x:off+c,y:along}:{x:along,y:off+c}); along+=(vert?s.h:s.w)+G; }
    off+=cross+G*2;
  }
  return pos;
}
function gridLayout(m){
  let k=0; const cols=Math.ceil(Math.sqrt(m.nodes.size));
  for(const n of m.nodes.values()){ n.x=(k%cols)*200; n.y=Math.floor(k/cols)*140; k++; }
}
function resolveGeometry(m,cache){
  const placed=new Set(),unplaced=[];
  for(const id of m.nodeOrder){
    const n=m.nodes.get(id); const p=m.pos.get(id); const c=cache&&cache.get(id);
    const st=styleOf(m,id); n.fsSet=st&&st.fontSize?st.fontSize:null; n.bold=!!(st&&st.bold); n.font=st&&st.font||(boardTheme(m)&&boardTheme(m).font)||null;
    if(p&&p.w&&p.h){ n.w=p.w; n.h=p.h; n.sized=true; } else n.sized=false;
    sizeNode(n);
    const src=p||c;
    if(src){ n.x=src.x; n.y=src.y; placed.add(id); } else { n.x=null; n.y=null; unplaced.push(n); }
  }
  if(unplaced.length&&!placed.size) autoLayout(m);
  else for(const n of unplaced){ placeNear(n,m,placed); placed.add(n.id); }
  if(cache) for(const n of m.nodes.values()) cache.set(n.id,{x:n.x,y:n.y});
}
function groupDepth(m,gid){let d=0,p=m.groups.get(gid);while(p&&p.parent){d++;p=m.groups.get(p.parent);if(d>50)break;}return d;}
function unionRect(a,b){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y};}
function groupBoxes(m,exclude){
  const boxes=new Map(),contentBoxes=new Map(); boxes.content=contentBoxes;
  const order=[...m.groupOrder].sort((a,b)=>groupDepth(m,b)-groupDepth(m,a));
  for(const gid of order){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,any=false,had=false;
    for(const n of m.nodes.values()){
      if(n.group!==gid||n.x==null) continue; had=true;
      if(exclude&&exclude.has(n.id)) continue;
      any=true; x0=Math.min(x0,n.x); y0=Math.min(y0,n.y); x1=Math.max(x1,n.x+n.w); y1=Math.max(y1,n.y+n.h);
    }
    for(const g of m.groups.values()){
      if(g.parent!==gid) continue; had=true;
      const b=boxes.get(g.id); if(!b) continue;
      any=true; x0=Math.min(x0,b.x); y0=Math.min(y0,b.y); x1=Math.max(x1,b.x+b.w); y1=Math.max(y1,b.y+b.h);
    }
    // A turned title runs along the left side (or the bottom), so the room for it moves there.
    const gr=m.groups.get(gid).rot||0, sideP=gr===90||gr===270?22:0, topP=gr?PAD:PAD_TOP, botP=gr===180?PAD_TOP:PAD;
    const cb=any?{x:x0-PAD-sideP,y:y0-topP,w:x1-x0+PAD*2+sideP,h:y1-y0+topP+botP}:null;
    const p=m.pos.get(gid); const fixed=p&&p.w?{x:p.x,y:p.y,w:p.w,h:p.h}:null;
    // A device frame keeps its size; what is dragged past its edge is cut off from view, not added.
    const dv=m.groups.get(gid).dev&&DEVICES[m.groups.get(gid).dev];
    if(dv){ boxes.set(gid,fixed||(cb?{x:cb.x+PAD,y:cb.y+PAD_TOP,w:dv.w*MOCK,h:dv.h*MOCK}:{x:p?p.x:0,y:p?p.y:0,w:dv.w*MOCK,h:dv.h*MOCK})); continue; }
    if(cb&&fixed) boxes.set(gid,unionRect(cb,fixed));
    else if(cb) boxes.set(gid,cb);
    else if(fixed) boxes.set(gid,fixed);
    else if(!had||!exclude) boxes.set(gid,{x:0,y:0,w:280,h:180});
    if(cb) contentBoxes.set(gid,cb);
  }
  return boxes;
}
function cubic(p0,p1,p2,p3,t){const u=1-t;return{x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};}
function sidePt(r,s){return s==='r'?{x:r.x+r.w,y:r.y+r.h/2}:s==='l'?{x:r.x,y:r.y+r.h/2}:s==='t'?{x:r.x+r.w/2,y:r.y}:{x:r.x+r.w/2,y:r.y+r.h};}
const NORM={r:{x:1,y:0},l:{x:-1,y:0},t:{x:0,y:-1},b:{x:0,y:1}};
function unitV(dx,dy){const L=Math.hypot(dx,dy)||1;return {x:dx/L,y:dy/L};}
function clipToRect(r,to){
  const cx=r.x+r.w/2,cy=r.y+r.h/2,dx=to.x-cx,dy=to.y-cy; if(!dx&&!dy) return {x:cx,y:cy};
  const s=Math.min(dx?(r.w/2)/Math.abs(dx):Infinity,dy?(r.h/2)/Math.abs(dy):Infinity);
  return s>=1?{x:to.x,y:to.y}:{x:cx+dx*s,y:cy+dy*s};
}
// sides (optional): {a,b} with t|r|b|l for where the connector leaves a and enters b; missing = automatic.
function edgeShape(a,b,off,route,sides){
  route=route||'curved'; const fa=sides&&sides.a, fb=sides&&sides.b;
  if(a===b||(a.x===b.x&&a.y===b.y&&a.w===b.w)){
    const p0={x:a.x+a.w*0.72,y:a.y},p3={x:a.x+a.w,y:a.y+a.h*0.3};
    return {type:'bez',p0,c1:{x:p0.x,y:p0.y-56},c2:{x:p3.x+56,y:p3.y},p3};
  }
  const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2};
  if(route==='straight'){
    let p0=fa?sidePt(a,fa):clipToRect(a,fb?sidePt(b,fb):bc),p3=fb?sidePt(b,fb):clipToRect(b,fa?sidePt(a,fa):ac);
    if(off){ const u=unitV(p3.x-p0.x,p3.y-p0.y); p0={x:p0.x-u.y*off*0.5,y:p0.y+u.x*off*0.5}; p3={x:p3.x-u.y*off*0.5,y:p3.y+u.x*off*0.5}; }
    return {type:'poly',pts:[p0,p3]};
  }
  const dx=bc.x-ac.x,dy=bc.y-ac.y; let sa,sb;
  if(Math.abs(dx)/((a.w+b.w)/2+1)>=Math.abs(dy)/((a.h+b.h)/2+1)){sa=dx>0?'r':'l';sb=dx>0?'l':'r';}
  else {sa=dy>0?'b':'t';sb=dy>0?'t':'b';}
  if(fa) sa=fa; if(fb) sb=fb;
  const p0=sidePt(a,sa),p3=sidePt(b,sb);
  if(route==='elbow'&&(fa||fb)){
    // Leave and enter straight out of the chosen sides, with a short stub, then join at right angles.
    const S=20, q0={x:p0.x+NORM[sa].x*S,y:p0.y+NORM[sa].y*S}, q3={x:p3.x+NORM[sb].x*S,y:p3.y+NORM[sb].y*S};
    const ha=sa==='r'||sa==='l', hb=sb==='r'||sb==='l'; let mid;
    if(ha&&hb){ const mx=(q0.x+q3.x)/2+(off||0); mid=[{x:mx,y:q0.y},{x:mx,y:q3.y}]; }
    else if(!ha&&!hb){ const my=(q0.y+q3.y)/2+(off||0); mid=[{x:q0.x,y:my},{x:q3.x,y:my}]; }
    else if(ha) mid=[{x:q3.x,y:q0.y}]; else mid=[{x:q0.x,y:q3.y}];
    const pts=[p0,q0,...mid,q3,p3].filter((pt,i,arr)=>i===0||Math.hypot(pt.x-arr[i-1].x,pt.y-arr[i-1].y)>0.5);
    return {type:'poly',pts};
  }
  if(route==='elbow'){
    if(sa==='r'||sa==='l'){ const mx=(p0.x+p3.x)/2+(off||0); return {type:'poly',pts:[p0,{x:mx,y:p0.y},{x:mx,y:p3.y},p3]}; }
    const my=(p0.y+p3.y)/2+(off||0); return {type:'poly',pts:[p0,{x:p0.x,y:my},{x:p3.x,y:my},p3]};
  }
  const dist=Math.hypot(p3.x-p0.x,p3.y-p0.y);
  const k=Math.max(24,Math.min(140,dist*0.45));
  const c1={x:p0.x+NORM[sa].x*k,y:p0.y+NORM[sa].y*k},c2={x:p3.x+NORM[sb].x*k,y:p3.y+NORM[sb].y*k};
  if(off){ const len=dist||1; const px=-(p3.y-p0.y)/len*off,py=(p3.x-p0.x)/len*off; c1.x+=px;c1.y+=py;c2.x+=px;c2.y+=py; }
  return {type:'bez',p0,c1,c2,p3};
}
function roundPoly(pts,r){
  let d='M'+pts[0].x+' '+pts[0].y;
  for(let i=1;i<pts.length-1;i++){
    const a=pts[i-1],b=pts[i],c=pts[i+1]; const l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y);
    const rr=Math.min(r,l1/2,l2/2); const u1=unitV(b.x-a.x,b.y-a.y),u2=unitV(c.x-b.x,c.y-b.y);
    d+='L'+(b.x-u1.x*rr)+' '+(b.y-u1.y*rr)+'Q'+b.x+' '+b.y+' '+(b.x+u2.x*rr)+' '+(b.y+u2.y*rr);
  }
  const l=pts[pts.length-1]; return d+'L'+l.x+' '+l.y;
}
function geomPath(g,s0,s3){
  s0=s0||0; s3=s3||0;
  if(g.type==='bez'){
    const {p0,c1,c2,p3}=g; const t0=unitV(p0.x-c1.x,p0.y-c1.y),t3=unitV(p3.x-c2.x,p3.y-c2.y);
    const d='M'+(p0.x-t0.x*s0)+' '+(p0.y-t0.y*s0)+'C'+(c1.x-t0.x*s0)+' '+(c1.y-t0.y*s0)+' '+(c2.x-t3.x*s3)+' '+(c2.y-t3.y*s3)+' '+(p3.x-t3.x*s3)+' '+(p3.y-t3.y*s3);
    return {d,mid:cubic(p0,c1,c2,p3,.5),t0,t3,p0,p3};
  }
  const pts=[]; for(const q of g.pts){ const l=pts[pts.length-1]; if(!l||Math.hypot(q.x-l.x,q.y-l.y)>0.5) pts.push({x:q.x,y:q.y}); }
  if(pts.length<2) pts.push({x:pts[0].x+0.01,y:pts[0].y});
  const n=pts.length; const t0=unitV(pts[0].x-pts[1].x,pts[0].y-pts[1].y),t3=unitV(pts[n-1].x-pts[n-2].x,pts[n-1].y-pts[n-2].y);
  const p0={...pts[0]},p3={...pts[n-1]};
  pts[0]={x:p0.x-t0.x*s0,y:p0.y-t0.y*s0}; pts[n-1]={x:p3.x-t3.x*s3,y:p3.y-t3.y*s3};
  let total=0; const seg=[]; for(let i=1;i<n;i++){ const L=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y); seg.push(L); total+=L; }
  let half=total/2,mid=pts[0]; for(let i=1;i<n;i++){ if(half<=seg[i-1]){ const t=seg[i-1]?half/seg[i-1]:0; mid={x:pts[i-1].x+(pts[i].x-pts[i-1].x)*t,y:pts[i-1].y+(pts[i].y-pts[i-1].y)*t}; break; } half-=seg[i-1]; }
  return {d:roundPoly(pts,g.r||8),mid,t0,t3,p0,p3};
}
// ---- Orthogonal routing for elbow connectors ----
// Right-angle paths that go around shapes, with few bends, the way Miro draws diagrams.
// Several connectors on one side of a shape are spread along that side, and connectors
// that would share a channel are nudged apart by making shared segments cost more.
const ORTHO_M=14;
function autoSides(a,b){
  const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2},dx=bc.x-ac.x,dy=bc.y-ac.y;
  if(Math.abs(dx)/((a.w+b.w)/2+1)>=Math.abs(dy)/((a.h+b.h)/2+1)) return dx>0?['r','l']:['l','r'];
  return dy>0?['b','t']:['t','b'];
}
// items: [{i,from,to,a,b,sa,sb}] (a, b are rects). Returns Map i -> {type:'poly',pts}.
function orthoRoutes(m,items){
  const out=new Map(); if(!items.length) return out;
  const NV={t:[0,-1],b:[0,1],l:[-1,0],r:[1,0]};
  for(const it of items){ const [sa,sb]=autoSides(it.a,it.b); it.sa=it.sa||sa; it.sb=it.sb||sb; }
  // Spread the attach points of connectors sharing a side, ordered by where their other end is.
  const slots=new Map(); const put=(id,side,it,end)=>{ const k=id+'\u0001'+side; if(!slots.has(k)) slots.set(k,[]); slots.get(k).push({it,end}); };
  for(const it of items){ put(it.from,it.sa,it,0); put(it.to,it.sb,it,1); }
  for(const [k,list] of slots){
    const side=k.slice(k.indexOf('\u0001')+1), horiz=side==='t'||side==='b';
    const other=x=>{ const r=x.end?x.it.a:x.it.b; return horiz?r.x+r.w/2:r.y+r.h/2; };
    list.sort((p,q)=>other(p)-other(q));
    list.forEach((sl,j)=>{ const r=sl.end?sl.it.b:sl.it.a, f=(j+1)/(list.length+1);
      const pt=horiz?{x:r.x+r.w*f,y:side==='t'?r.y:r.y+r.h}:{x:side==='l'?r.x:r.x+r.w,y:r.y+r.h*f};
      if(sl.end) sl.it.p3=pt; else sl.it.p0=pt; });
  }
  const obs=[]; for(const n of m.nodes.values()) if(n.x!=null) obs.push({x0:n.x-ORTHO_M,y0:n.y-ORTHO_M,x1:n.x+n.w+ORTHO_M,y1:n.y+n.h+ORTHO_M});
  const inside=(x,y)=>{ for(const o of obs) if(x>o.x0+0.5&&x<o.x1-0.5&&y>o.y0+0.5&&y<o.y1-0.5) return true; return false; };
  const S=ORTHO_M+8;
  for(const it of items){ it.q0={x:it.p0.x+NV[it.sa][0]*S,y:it.p0.y+NV[it.sa][1]*S}; it.q3={x:it.p3.x+NV[it.sb][0]*S,y:it.p3.y+NV[it.sb][1]*S}; }
  const xs=new Set(), ys=new Set();
  for(const o of obs){ xs.add(o.x0); xs.add(o.x1); ys.add(o.y0); ys.add(o.y1); }
  for(const it of items){ xs.add(it.q0.x); xs.add(it.q3.x); ys.add(it.q0.y); ys.add(it.q3.y); }
  const mids=set=>{ const v=[...set].sort((p,q)=>p-q); for(let k=0;k+1<v.length;k++) if(v[k+1]-v[k]>ORTHO_M*2) set.add((v[k]+v[k+1])/2); };
  mids(xs); mids(ys);
  const X=[...xs].sort((p,q)=>p-q), Y=[...ys].sort((p,q)=>p-q); X.unshift(X[0]-48); X.push(X[X.length-1]+48); Y.unshift(Y[0]-48); Y.push(Y[Y.length-1]+48);
  const nx=X.length, ny=Y.length; if(nx*ny>40000) return out;
  const xi=new Map(X.map((v,k)=>[v,k])), yi=new Map(Y.map((v,k)=>[v,k]));
  const P=(i,j)=>j*nx+i;
  const free=new Uint8Array(nx*ny), hOk=new Uint8Array(nx*ny), vOk=new Uint8Array(nx*ny), hUse=new Uint16Array(nx*ny), vUse=new Uint16Array(nx*ny);
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ free[P(i,j)]=inside(X[i],Y[j])?0:1; }
  for(let j=0;j<ny;j++) for(let i=0;i+1<nx;i++) hOk[P(i,j)]=free[P(i,j)]&&free[P(i+1,j)]&&!inside((X[i]+X[i+1])/2,Y[j])?1:0;
  for(let j=0;j+1<ny;j++) for(let i=0;i<nx;i++) vOk[P(i,j)]=free[P(i,j)]&&free[P(i,j+1)]&&!inside(X[i],(Y[j]+Y[j+1])/2)?1:0;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]], dirOf=s=>({r:0,l:1,b:2,t:3})[s];
  const BEND=36;
  // Longer connectors first get the clean channels; short ones fit around them.
  const order=[...items].sort((p,q)=>(Math.abs(q.q0.x-q.q3.x)+Math.abs(q.q0.y-q.q3.y))-(Math.abs(p.q0.x-p.q3.x)+Math.abs(p.q0.y-p.q3.y)));
  const NS=nx*ny*4, dist=new Float64Array(NS), prev=new Int32Array(NS);
  for(const it of order){
    const si=xi.get(it.q0.x), sj=yi.get(it.q0.y), ti=xi.get(it.q3.x), tj=yi.get(it.q3.y);
    if(si==null||sj==null||ti==null||tj==null||!free[P(si,sj)]||!free[P(ti,tj)]) continue;
    const want=dirOf({r:'l',l:'r',b:'t',t:'b'}[it.sb]); // direction when arriving at the target stub
    dist.fill(Infinity); prev.fill(-1);
    const heap=[]; const push=(c,s)=>{ heap.push([c,s]); let k=heap.length-1; while(k>0){ const pk=(k-1)>>1; if(heap[pk][0]<=heap[k][0]) break; [heap[pk],heap[k]]=[heap[k],heap[pk]]; k=pk; } };
    const pop=()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let k=0; for(;;){ const l=2*k+1,r=l+1; let b=k; if(l<heap.length&&heap[l][0]<heap[b][0]) b=l; if(r<heap.length&&heap[r][0]<heap[b][0]) b=r; if(b===k) break; [heap[b],heap[k]]=[heap[k],heap[b]]; k=b; } } return top; };
    const hx=(i,j)=>Math.abs(X[i]-X[ti])+Math.abs(Y[j]-Y[tj]);
    const s0=P(si,sj)*4+dirOf(it.sa); dist[s0]=0; push(hx(si,sj),s0);
    let goal=-1, alt=-1;
    while(heap.length){
      const [f,st]=pop(); const node=st>>2, d=st&3, g=dist[st]; if(f-hx(node%nx,(node/nx)|0)>g+1e-6) continue;
      const i=node%nx, j=(node/nx)|0;
      if(i===ti&&j===tj){ if(d===want){ goal=st; break; } if(alt<0) alt=st; }
      for(let nd=0;nd<4;nd++){
        const [dx,dy]=DIRS[nd]; const ni=i+dx, nj=j+dy; if(ni<0||nj<0||ni>=nx||nj>=ny) continue;
        if(dy===0){ const k=P(Math.min(i,ni),j); if(!hOk[k]) continue; }
        else { const k=P(i,Math.min(j,nj)); if(!vOk[k]) continue; }
        if(nd===(d^1)) continue; // no U-turns on the spot
        const len=dy===0?Math.abs(X[ni]-X[i]):Math.abs(Y[nj]-Y[j]);
        const use=dy===0?hUse[P(Math.min(i,ni),j)]:vUse[P(i,Math.min(j,nj))];
        const c=g+len*(1+0.6*use)+(nd!==d?BEND:0)+(ni===ti&&nj===tj&&nd!==want?BEND*2:0);
        const ns=P(ni,nj)*4+nd; if(c<dist[ns]-1e-6){ dist[ns]=c; prev[ns]=st; push(c+hx(ni,nj),ns); }
      }
    }
    if(goal<0) goal=alt; if(goal<0) continue;
    const path=[]; for(let st=goal;st>=0;st=prev[st]){ const node=st>>2; path.push({x:X[node%nx],y:Y[(node/nx)|0]}); if(st===s0) break; }
    path.reverse();
    for(let k=1;k<path.length;k++){ const a0=path[k-1],a1=path[k]; const i0=xi.get(a0.x),j0=yi.get(a0.y),i1=xi.get(a1.x),j1=yi.get(a1.y);
      if(j0===j1) for(let i=Math.min(i0,i1);i<Math.max(i0,i1);i++) hUse[P(i,j0)]++; else for(let j=Math.min(j0,j1);j<Math.max(j0,j1);j++) vUse[P(i0,j)]++; }
    const pts=[it.p0,...path,it.p3]; const simp=[pts[0]];
    for(let k=1;k<pts.length-1;k++){ const a0=simp[simp.length-1],a1=pts[k],a2=pts[k+1]; if((Math.abs(a0.x-a1.x)<0.01&&Math.abs(a1.x-a2.x)<0.01)||(Math.abs(a0.y-a1.y)<0.01&&Math.abs(a1.y-a2.y)<0.01)) continue; simp.push(a1); }
    simp.push(pts[pts.length-1]);
    out.set(it.i,{type:'poly',pts:simp});
  }
  nudgeRoutes(out);
  return out;
}
// Connectors that share a channel are drawn side by side instead of on top of each other,
// ordered by where they come from so they cross as little as possible.
function nudgeRoutes(out){
  const GAP=8, segs={h:[],v:[]};
  for(const [i,g] of out){ const p=g.pts; for(let k=1;k<p.length-2;k++){ const a=p[k],b=p[k+1];
    if(Math.abs(a.y-b.y)<0.01) segs.h.push({i,a,b,c:a.y,lo:Math.min(a.x,b.x),hi:Math.max(a.x,b.x),key:(p[k-1].y+p[k+2].y)/2});
    else if(Math.abs(a.x-b.x)<0.01) segs.v.push({i,a,b,c:a.x,lo:Math.min(a.y,b.y),hi:Math.max(a.y,b.y),key:(p[k-1].x+p[k+2].x)/2}); } }
  for(const [kind,list] of Object.entries(segs)){
    const by=new Map(); for(const s of list){ const k=Math.round(s.c); if(!by.has(k)) by.set(k,[]); by.get(k).push(s); }
    for(const grp of by.values()){ if(grp.length<2) continue; grp.sort((p,q)=>p.lo-q.lo);
      let cl=[], hi=-Infinity;
      const flush=()=>{ const ids=[...new Set(cl.map(s=>s.i))]; if(ids.length>1){ const key=new Map(); for(const s of cl) key.set(s.i,s.key); ids.sort((p,q)=>key.get(p)-key.get(q));
          const off=new Map(ids.map((id,k)=>[id,(k-(ids.length-1)/2)*Math.min(GAP,32/ids.length)]));
          for(const s of cl){ const o=off.get(s.i); if(kind==='h'){ s.a.y=s.c+o; s.b.y=s.c+o; } else { s.a.x=s.c+o; s.b.x=s.c+o; } } }
        cl=[]; };
      for(const s of grp){ if(cl.length&&s.lo>=hi-1){ flush(); hi=-Infinity; } cl.push(s); hi=Math.max(hi,s.hi); }
      if(cl.length) flush();
    }
  }
  // Then keep lines that run close beside each other at least GAP apart. Segments that leave or enter
  // a shape stay where they are; the ones between them move.
  for(const kind of ['h','v']){
    const all=[]; for(const [i,g] of out){ const p=g.pts; for(let k=0;k<p.length-1;k++){ const a=p[k],b=p[k+1]; const hz=Math.abs(a.y-b.y)<0.01, vt=Math.abs(a.x-b.x)<0.01; if(kind==='h'?!hz:!vt) continue; all.push({i,a,b,fixed:k===0||k===p.length-2,len:p.length}); } }
    const C=s=>kind==='h'?s.a.y:s.a.x, LO=s=>kind==='h'?Math.min(s.a.x,s.b.x):Math.min(s.a.y,s.b.y), HI=s=>kind==='h'?Math.max(s.a.x,s.b.x):Math.max(s.a.y,s.b.y);
    for(let pass=0;pass<3;pass++) for(const s of all){ if(s.fixed) continue;
      for(const t of all){ if(t===s||t.i===s.i) continue; const ov=Math.min(HI(s),HI(t))-Math.max(LO(s),LO(t)); if(ov<6) continue;
        const d=C(s)-C(t); if(Math.abs(d)>=GAP-0.5) continue;
        const to=C(t)+(d>=0?GAP:-GAP); if(kind==='h'){ s.a.y=to; s.b.y=to; } else { s.a.x=to; s.b.x=to; } } }
  }
}
// Mermaid's curve setting (frontmatter config or %%{init}%%) gives the board's connector style.
function boardCurve(m){
  const txt=[...(m.fmExtra||[]),...(m.pre||[]),...(m.comments||[])].join('\n');
  const mm=/["']?curve["']?\s*:\s*["']?(\w+)/.exec(txt); if(!mm) return 'curved';
  const c=mm[1]; return /^step/.test(c)?'elbow':c==='linear'?'straight':'curved';
}
const routeOf=(m,e)=>e.route||m.curve||'curved';
function edgeGeom(a,b,off,route,sides){ return geomPath(edgeShape(a,b,off,route,sides),0,0); }
// The side of r nearest to p, or null when p is in the middle (then the connector picks its side itself).
function sideNear(r,p){ if(!r||!p) return null; const fx=(p.x-r.x)/(r.w||1), fy=(p.y-r.y)/(r.h||1); if(fx>0.3&&fx<0.7&&fy>0.3&&fy<0.7) return null; const d={l:Math.abs(p.x-r.x)/(r.w||1),r:Math.abs(r.x+r.w-p.x)/(r.w||1),t:Math.abs(p.y-r.y)/(r.h||1),b:Math.abs(r.y+r.h-p.y)/(r.h||1)}; return Object.keys(d).sort((x,y)=>d[x]-d[y])[0]; }
const edgeSides=e=>e&&(e.sa||e.sb)?{a:e.sa||null,b:e.sb||null}:null;
function headSize(w){ return {hl:7+w*2.4,hw:3.8+w*1.5}; }
function headMarkup(type,tip,t,w,col,bg,cls){
  if(!type||type==='none') return '';
  const n={x:-t.y,y:t.x}; const c=cls?' class="'+cls+'"':'';
  if(type==='arrow'){ const {hl,hw}=headSize(w); const bx=tip.x-t.x*hl,by=tip.y-t.y*hl;
    return '<path'+c+' d="M'+tip.x+' '+tip.y+'L'+(bx+n.x*hw)+' '+(by+n.y*hw)+'L'+(bx-n.x*hw)+' '+(by-n.y*hw)+'Z" style="fill:'+col+';stroke:'+col+';stroke-width:1;stroke-linejoin:round"/>'; }
  if(type==='circle'){ const r=3+w*0.9; return '<circle'+c+' cx="'+(tip.x-t.x*r)+'" cy="'+(tip.y-t.y*r)+'" r="'+r+'" style="fill:'+bg+';stroke:'+col+';stroke-width:'+(1+w*0.6)+'"/>'; }
  if(type==='cross'){ const r=3.5+w, cx=tip.x-t.x*r, cy=tip.y-t.y*r; return '<path'+c+' d="M'+(cx-r*0.7)+' '+(cy-r*0.7)+'L'+(cx+r*0.7)+' '+(cy+r*0.7)+'M'+(cx+r*0.7)+' '+(cy-r*0.7)+'L'+(cx-r*0.7)+' '+(cy+r*0.7)+'" style="fill:none;stroke:'+col+';stroke-width:'+(1.2+w*0.5)+'"/>'; }
  return '';
}
function headInset(type,w){ if(type==='arrow') return headSize(w).hl*0.8; if(type==='circle') return (3+w*0.9)*2; return 0; }
function freeArrowShape(a){
  const p0={x:a.x1,y:a.y1},p1={x:a.x2,y:a.y2};
  if(a.kind==='elbow'){ const dx=p1.x-p0.x,dy=p1.y-p0.y; if(Math.abs(dx)>=Math.abs(dy)){ const mx=p0.x+dx/2; return {type:'poly',pts:[p0,{x:mx,y:p0.y},{x:mx,y:p1.y},p1]}; } const my=p0.y+dy/2; return {type:'poly',pts:[p0,{x:p0.x,y:my},{x:p1.x,y:my},p1]}; }
  if(a.kind==='curved'){ const dx=p1.x-p0.x,dy=p1.y-p0.y; const L=Math.hypot(dx,dy); const n={x:-dy/(L||1),y:dx/(L||1)}; const b=L*0.18; return {type:'bez',p0,c1:{x:p0.x+dx*0.3+n.x*b,y:p0.y+dy*0.3+n.y*b},c2:{x:p0.x+dx*0.7+n.x*b,y:p0.y+dy*0.7+n.y*b},p3:p1}; }
  return {type:'poly',pts:[p0,p1]};
}
function blockArrowPts(a){
  const dx=a.x2-a.x1,dy=a.y2-a.y1,L=Math.hypot(dx,dy)||1,u={x:dx/L,y:dy/L},n={x:-u.y,y:u.x};
  const sw=a.w*2.2+3, hw=a.w*4.4+9, hl=Math.min(L*0.5,a.w*4.5+18);
  const bx=a.x2-u.x*hl,by=a.y2-u.y*hl;
  return [[a.x1+n.x*sw,a.y1+n.y*sw],[bx+n.x*sw,by+n.y*sw],[bx+n.x*hw,by+n.y*hw],[a.x2,a.y2],[bx-n.x*hw,by-n.y*hw],[bx-n.x*sw,by-n.y*sw],[a.x1-n.x*sw,a.y1-n.y*sw]].map(q=>q.map(r10).join(' ')).join(' ');
}
function resolveArrow(m,a){
  let gb=null; const rectOf=id=>{ if(!id) return null; const n=m.nodes.get(id); if(n) return n; if(!m.groups.has(id)) return null; gb=gb||groupBoxes(m); return gb.get(id)||null; };
  const nf=rectOf(a.from), nt=rectOf(a.to);
  const okf=nf&&nf.x!=null, okt=nt&&nt.x!=null;
  if(!okf&&!okt) return a;
  const cf=okf?{x:nf.x+nf.w/2,y:nf.y+nf.h/2}:{x:a.x1,y:a.y1}, ct=okt?{x:nt.x+nt.w/2,y:nt.y+nt.h/2}:{x:a.x2,y:a.y2};
  const p0=okf?clipToRect(nf,ct):cf, p1=okt?clipToRect(nt,cf):ct;
  return {...a,x1:p0.x,y1:p0.y,x2:p1.x,y2:p1.y};
}
function arrowBox(a){ const pad=a.kind==='block'?a.w*4.4+9:a.w*3+8; const x0=Math.min(a.x1,a.x2),y0=Math.min(a.y1,a.y2); return {x:x0-pad,y:y0-pad,w:Math.abs(a.x2-a.x1)+pad*2,h:Math.abs(a.y2-a.y1)+pad*2}; }
// Push top-level things apart so none overlap: shapes outside frames, and whole frames (with
// everything in them, and the title above them). Only the blocks in `movable` move; null moves any.
// Returns how many blocks moved.
function separateBlocks(m,movable,gap,pics){
  const G=gap||40, TITLE=30; const boxes=groupBoxes(m); const blocks=[];
  for(const n of m.nodes.values()) if(n.x!=null&&!(n.group&&m.groups.has(n.group))) blocks.push({id:n.id,n,x:n.x,y:n.y,w:n.w,h:n.h});
  for(const g of m.groups.values()){ if(g.parent&&m.groups.has(g.parent)) continue; const b=boxes.get(g.id); if(b) blocks.push({id:g.id,g,x:b.x,y:b.y-TITLE,w:b.w,h:b.h+TITLE}); }
  // With pics, pictures stay where they are and nothing new is left on top of them.
  if(pics) for(const im of m.images||[]) blocks.push({id:'p:'+im.id,im:true,x:im.x,y:im.y,w:im.w,h:im.h});
  const can=b=>!b.im&&(!movable||movable.has(b.id));
  const moved=new Map();
  for(let pass=0;pass<40;pass++){ let any=false;
    for(const a of blocks) for(const b of blocks){ if(a===b||!can(b)) continue;
      const ox=Math.min(a.x+a.w,b.x+b.w)+G-Math.max(a.x,b.x), oy=Math.min(a.y+a.h,b.y+b.h)+G-Math.max(a.y,b.y);
      if(ox<=0||oy<=0) continue;
      if(can(a)&&!movable&&(a.y>b.y||(a.y===b.y&&a.x>b.x))) continue; // of two movable blocks, move the later one
      // Move along the axis that needs the shorter push, away from the other block.
      let dx=0,dy=0; if(ox<=oy) dx=(b.x+b.w/2>=a.x+a.w/2?1:-1)*ox; else dy=(b.y+b.h/2>=a.y+a.h/2?1:-1)*oy;
      b.x+=dx; b.y+=dy; const mv=moved.get(b.id)||{dx:0,dy:0}; mv.dx+=dx; mv.dy+=dy; moved.set(b.id,mv); any=true; }
    if(!any) break; }
  for(const b of blocks){ const mv=moved.get(b.id); if(!mv) continue; const dx=Math.round(mv.dx), dy=Math.round(mv.dy);
    if(b.n){ b.n.x+=dx; b.n.y+=dy; continue; }
    const inside=new Set([b.id]); let grew=true; while(grew){ grew=false; for(const g of m.groups.values()) if(!inside.has(g.id)&&g.parent&&inside.has(g.parent)){ inside.add(g.id); grew=true; } }
    for(const n of m.nodes.values()) if(n.group&&inside.has(n.group)&&n.x!=null){ n.x+=dx; n.y+=dy; }
    for(const gid of inside){ const p=m.pos.get(gid); if(p) m.pos.set(gid,{...p,x:p.x+dx,y:p.y+dy}); } }
  return moved.size;
}
