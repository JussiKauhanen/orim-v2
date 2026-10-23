/* orim · label-editor.js
 * Inline text editing on the board.
 */
'use strict';
function openEditor(kind,id,at){
  if(kind==='node'&&typeof Rich!=='undefined'){ const n0=state.model&&state.model.nodes.get(id); if(n0&&(n0.shape==='table'||n0.shape==='doc')){ Rich.open(id,at||state.downW); return; } }
  if(state.editing) closeEditor(true);
  const m=state.model; if(!m) return;
  let rect,label,fs=13,left=false;
  if(kind==='node'){ const n=m.nodes.get(id); if(!n) return; label=n.label; if(n.shape==='icon'){ const s=iconSize(n); rect={x:n.x-20,y:n.y+s+2,w:n.w+40,h:Math.max(20,n.h-s-2)}; fs=12; } else { rect={x:n.x,y:n.y,w:n.w,h:n.h}; fs=labelSize(n); } }
  else if(kind==='edge'){ const e=m.edges[id]; if(!e) return; const a=nodeRect(m,e.from,state.boxes),b=nodeRect(m,e.to,state.boxes); if(!a||!b) return; const g=geomPath(edgeShapeAt(m,id,state.boxes),0,0); label=e.label; rect={x:g.mid.x-90,y:g.mid.y-14,w:180,h:28}; fs=12; }
  else { const b=state.boxes.get(id),g=m.groups.get(id); if(!b||!g) return; label=g.label; rect=PAL_LIVE.frameOut||g.dev?{x:b.x-4,y:b.y-34,w:Math.max(180,Math.min(b.w,320)),h:26}:{x:b.x+8,y:b.y+8,w:Math.max(180,Math.min(b.w-16,320)),h:24}; fs=PAL_LIVE.frameOut||g.dev?14:12; left=true; }
  const el=document.createElement('textarea'); el.className='label-editor'+(left?' left':''); el.value=label; el.setAttribute('aria-label','Edit label'); el.spellcheck=false;
  if(kind==='node'){ const st=styleOf(m,id); if(st&&st.bold) el.style.fontWeight='700'; if(st&&st.italic) el.style.fontStyle='italic'; }
  boardPane.appendChild(el);
  state.editing={kind,id,el,rect,fs,orig:label,group:kind==='group'};
  // Shapes are edited in place: the text sits on the shape, which grows as you type.
  if(kind==='node'){ const n=m.nodes.get(id); if(n&&n.shape!=='icon'){ state.editing.live=true; state.editing.geo={x:n.x,y:n.y,w:n.w,h:n.h,sized:n.sized}; el.classList.add('inplace');
    const tEl=R.nodeEls.get(id)&&R.nodeEls.get(id).querySelector('text.lbl'); el.style.color=(tEl&&tEl.style.fill)||''; } }
  placeEditor(); render();
  try{ window.focus(); }catch(_){}
  el.focus({preventScroll:true}); el.select();
  el.addEventListener('keydown',ev=>{ ev.stopPropagation(); if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();closeEditor(true);} else if(ev.key==='Escape'){ev.preventDefault();closeEditor(false);} });
  el.addEventListener('input',()=>{ if(state.editing&&state.editing.live) liveLabel(); placeEditor(); });
  el.addEventListener('blur',()=>closeEditor(true));
}
// Resize the shape to the text while typing: auto-sized shapes grow wider then taller around their centre,
// shapes with a set size keep their width and grow taller. Esc puts everything back.
function liveLabel(){
  const ed=state.editing, m=state.model; const n=m&&m.nodes.get(ed.id); if(!n) return;
  const cx=n.x+n.w/2, cy=n.y+n.h/2; n.label=ed.el.value; sizeNode(n);
  if(!n.sized){ n.x=SNAP(cx-n.w/2); n.y=SNAP(cy-n.h/2); }
  else { const g=ed.geo; n.y=n.h>g.h?SNAP(g.y-(n.h-g.h)/2):g.y; }
  ed.rect={x:n.x,y:n.y,w:n.w,h:n.h}; ed.fs=labelSize(n); state.cache.set(n.id,{x:n.x,y:n.y}); render();
}
function placeEditor(){
  const ed=state.editing; if(!ed) return; const z=state.view.z; const el=ed.el;
  const s=toScreen({x:ed.rect.x,y:ed.rect.y});
  const padX=ed.live?(ed.rect.w>60?12:4):0;
  el.style.fontSize=(ed.fs*z)+'px'; el.style.lineHeight=(ed.fs*1.3*z)+'px';
  el.style.width=Math.max(ed.live?24:80,(ed.rect.w-padX*2)*z)+'px'; el.style.left=(s.x+padX*z)+'px';
  el.style.height='0px'; const hgt=Math.max(ed.fs*1.3*z+6,el.scrollHeight); el.style.height=hgt+'px';
  el.style.top=(ed.group?s.y:s.y+ed.rect.h*z/2-hgt/2)+'px';
}
function closeEditor(commit){
  const ed=state.editing; if(!ed) return; state.editing=null;
  const v=ed.el.value; ed.el.remove();
  if(ed.live&&!(commit&&v!==ed.orig)){ const n=state.model&&state.model.nodes.get(ed.id); if(n){ n.label=ed.orig; Object.assign(n,ed.geo); sizeNode(n); state.cache.set(n.id,{x:n.x,y:n.y}); } }
  if(commit&&v!==ed.orig){
    mutate(m=>{
      if(ed.kind==='node'){ const n=m.nodes.get(ed.id); if(n) n.label=v.replace(/\s+$/,''); }
      else if(ed.kind==='edge'){ const e=m.edges[ed.id]; if(e) e.label=v.trim(); }
      else { const g=m.groups.get(ed.id); if(g) g.label=v.trim()||g.label; }
    });
  } else render();
}
