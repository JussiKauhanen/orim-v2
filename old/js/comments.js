/* orim · comments.js
 * Miro-style comments: press C (or the toolbar button), click the board, type, Enter.
 * A comment dropped on a shape moves with it. Pins can be dragged; Resolve hides a thread.
 * Stored as %% @comment lines, so comments travel with the board file, QR links and Mermaid.
 */
'use strict';
const cmLayer=document.createElement('div'); cmLayer.className='cm-layer'; boardPane.appendChild(cmLayer);
const cmPop=document.createElement('div'); cmPop.className='cm-pop island'; cmPop.hidden=true; boardPane.appendChild(cmPop);
let cmOpen=null;   // {id} for a thread, or {draft:{x,y,on}} for a new one
let cmDrag=null;

function cmWorld(c){
  const m=state.model; const n=c.on&&m&&m.nodes.get(c.on);
  if(n&&n.x!=null){ c.wx=n.x+c.x; c.wy=n.y+c.y; return {x:c.wx,y:c.wy}; }
  return {x:c.x,y:c.y};
}
function cmAnchor(p){
  // Attach to the shape under the point, as an offset from its corner.
  const id=nodeAt(p,0); const n=id&&state.model.nodes.get(id);
  return n?{x:Math.round(p.x-n.x),y:Math.round(p.y-n.y),on:id}:{x:Math.round(p.x),y:Math.round(p.y),on:null};
}
function cmNextId(m){ const ids=new Set(m.threads.map(c=>c.id)); let k=m.threads.length+1; while(ids.has('cm'+k)) k++; return 'cm'+k; }
function cmFind(id){ return state.model&&state.model.threads.find(c=>c.id===id); }

function renderComments(){
  const m=state.model; const list=m&&!state.fatal?m.threads.filter(c=>!c.done&&c.msgs.length):[];
  let h='';
  for(const c of list){
    const w=cmDrag&&cmDrag.id===c.id&&cmDrag.moved?cmDrag.p:cmWorld(c); const s=toScreen(w);
    const au=c.msgs[0].a; const who=au?esc(au)+': ':'';
    h+='<button type="button" class="cm-pin'+(au?' has-av':'')+(cmOpen&&cmOpen.id===c.id?' on':'')+'" data-cid="'+esc(c.id)+'" style="left:'+s.x.toFixed(1)+'px;top:'+s.y.toFixed(1)+'px'+(au?';--av:'+Me.color(au):'')+'" title="'+who+esc(c.msgs[0].t.slice(0,80))+'" aria-label="Comment by '+(au?esc(au):'someone')+': '+esc(c.msgs[0].t.slice(0,80))+'">'+(au?esc([...au][0].toUpperCase()):c.msgs.length)+(au&&c.msgs.length>1?'<i>'+c.msgs.length+'</i>':'')+'</button>';
  }
  if(cmOpen&&cmOpen.draft){ const s=toScreen(cmOpen.draft.wp); h+='<span class="cm-pin draft" style="left:'+s.x.toFixed(1)+'px;top:'+s.y.toFixed(1)+'px"></span>'; }
  cmLayer.innerHTML=h;
  if(cmOpen) cmPlace();
}
function cmWhen(d){
  if(!d) return '';
  const t=new Date(d), now=new Date(); const sameDay=t.toDateString()===now.toDateString();
  try{ return sameDay?'Today, '+t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):t.toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }catch(_){ return t.toISOString().slice(0,16).replace('T',' '); }
}
function cmShow(open){
  cmOpen=open; const c=open.id?cmFind(open.id):null;
  if(open.id&&!c){ cmClose(); return; }
  let h='';
  if(c){
    h+='<div class="cm-head"><span>Comment</span><span class="grow"></span>'+
       '<button type="button" class="ibtn" data-cm="resolve" title="Resolve" aria-label="Resolve"><svg class="i" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>'+
       '<button type="button" class="ibtn" data-cm="delete" title="Delete thread" aria-label="Delete thread"><svg class="i" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/></svg></button>'+
       '<button type="button" class="ibtn" data-cm="close" title="Close (Esc)" aria-label="Close"><svg class="i" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div>';
    h+='<div class="cm-msgs">'+c.msgs.map((q,i)=>'<div class="cm-msg">'+Me.avatar(q.a||'?',24,q.a?'':'anon')+'<div class="cm-body"><small><b>'+esc(q.a||'Someone')+'</b><span>'+esc(cmWhen(q.d))+'</span>'+(c.msgs.length>1?'<button type="button" class="cm-x" data-cm-del="'+i+'" title="Delete this reply" aria-label="Delete this reply">×</button>':'')+'</small><p>'+esc(q.t)+'</p></div></div>').join('')+'</div>';
  }
  h+='<div class="cm-new"><textarea rows="1" placeholder="'+(c?'Reply':'Add a comment')+'" aria-label="'+(c?'Reply':'Comment')+'"></textarea><button type="button" class="btn primary sm" data-cm="post">'+(c?'Reply':'Post')+'</button></div>';
  cmPop.innerHTML=h; cmPop.hidden=false; renderComments();
  const tx=cmPop.querySelector('textarea');
  const grow=()=>{ tx.style.height='auto'; tx.style.height=Math.min(140,tx.scrollHeight)+'px'; };
  tx.addEventListener('input',grow);
  tx.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); cmPost(); } else if(e.key==='Escape'){ e.preventDefault(); cmClose(); } });
  setTimeout(()=>tx.focus({preventScroll:true}),0);
}
function cmPlace(){
  let w;
  if(cmOpen.draft) w=cmOpen.draft.wp; else { const c=cmFind(cmOpen.id); if(!c) return; w=cmWorld(c); }
  const s=toScreen(w); const pw=boardPane.clientWidth, ph=boardPane.clientHeight; const bw=cmPop.offsetWidth||300, bh=cmPop.offsetHeight||120;
  let x=s.x+22, y=s.y-34; if(x+bw>pw-8) x=s.x-bw-8; x=clamp(x,8,Math.max(8,pw-bw-8)); y=clamp(y,8,Math.max(8,ph-bh-8));
  cmPop.style.left=x+'px'; cmPop.style.top=y+'px';
}
function cmClose(){ cmOpen=null; cmPop.hidden=true; cmPop.innerHTML=''; renderComments(); }
function cmPost(){
  const tx=cmPop.querySelector('textarea'); const t=tx.value.trim(); if(!t){ if(cmOpen&&cmOpen.draft) cmClose(); return; }
  // First comment in this browser: ask for a name, then post.
  if(!Me.get()){ cmAskName(); return; }
  const now=Date.now(), a=Me.get();
  if(cmOpen.draft){
    const d=cmOpen.draft; let id=null;
    mutate(mm=>{ id=cmNextId(mm); mm.threads.push({id,x:d.x,y:d.y,on:d.on,done:false,msgs:[{a,t,d:now}]}); },{structural:false});
    setTool('select'); cmShow({id});
  } else {
    const id=cmOpen.id; mutate(mm=>{ const c=mm.threads.find(x=>x.id===id); if(c) c.msgs.push({a,t,d:now}); },{structural:false}); cmShow({id});
  }
}
// Asked once, inside the comment box: who is posting. Esc goes back to the comment.
function cmAskName(){
  const nw=cmPop.querySelector('.cm-new'); if(!nw||cmPop.querySelector('.cm-ask')) return;
  nw.hidden=true;
  const box=document.createElement('div'); box.className='cm-ask';
  box.innerHTML='<div class="cm-ask-row"><span class="avatar anon" style="--sz:26px" aria-hidden="true">?</span><input maxlength="40" autocomplete="name" placeholder="Your name" aria-label="Your name"><button type="button" class="btn primary sm">Post</button></div><small>Shown on your comments.</small>';
  nw.after(box);
  const inp=box.querySelector('input'), av=box.querySelector('.avatar');
  const back=()=>{ box.remove(); nw.hidden=false; nw.querySelector('textarea').focus(); cmPlace(); };
  const go=()=>{ const v=inp.value.trim(); if(!v){ inp.focus(); return; } Me.set(v); box.remove(); nw.hidden=false; cmPost(); };
  inp.addEventListener('input',()=>{ const v=inp.value.trim(); av.textContent=v?[...v][0].toUpperCase():'?'; av.classList.toggle('anon',!v); av.style.setProperty('--av',Me.color(v)); });
  box.querySelector('button').addEventListener('click',go);
  inp.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter'){ e.preventDefault(); go(); } else if(e.key==='Escape'){ e.preventDefault(); back(); } });
  setTimeout(()=>inp.focus(),0); cmPlace();
}
function startComment(p){
  if(!state.model||state.fatal) return;
  const a=cmAnchor(p); cmShow({draft:{...a,wp:{x:p.x,y:p.y}}});
}
cmPop.addEventListener('pointerdown',e=>e.stopPropagation());
cmPop.addEventListener('click',e=>{
  const b=e.target.closest('[data-cm]'), dm=e.target.closest('[data-cm-del]'); const id=cmOpen&&cmOpen.id;
  if(dm&&id){ const i=+dm.dataset.cmDel; mutate(mm=>{ const c=mm.threads.find(x=>x.id===id); if(c) c.msgs.splice(i,1); },{structural:false}); cmShow({id}); return; }
  if(!b) return; const k=b.dataset.cm;
  if(k==='post') cmPost();
  else if(k==='close') cmClose();
  else if(k==='resolve'&&id){ mutate(mm=>{ const c=mm.threads.find(x=>x.id===id); if(c) c.done=true; },{structural:false}); cmClose(); toast('Comment resolved. Undo with Ctrl+Z'); }
  else if(k==='delete'&&id){ mutate(mm=>{ mm.threads=mm.threads.filter(x=>x.id!==id); },{structural:false}); cmClose(); toast('Comment deleted. Undo with Ctrl+Z'); }
});
cmLayer.addEventListener('pointerdown',e=>{
  const pin=e.target.closest('[data-cid]'); if(!pin) return; e.stopPropagation(); e.preventDefault();
  cmDrag={id:pin.dataset.cid,sx:e.clientX,sy:e.clientY,moved:false,p:null};
  window.addEventListener('pointermove',cmMove,true); window.addEventListener('pointerup',cmUp,true);
});
// Window listeners: the pins are redrawn while dragging, so the pressed element does not survive.
function cmMove(e){
  if(!cmDrag) return; e.stopPropagation();
  if(!cmDrag.moved&&Math.hypot(e.clientX-cmDrag.sx,e.clientY-cmDrag.sy)<4) return;
  cmDrag.moved=true; cmDrag.p=toWorld(e); renderComments();
}
function cmUp(e){
  window.removeEventListener('pointermove',cmMove,true); window.removeEventListener('pointerup',cmUp,true);
  const d=cmDrag; cmDrag=null; if(!d) return; e.stopPropagation();
  if(!d.moved){ if(cmOpen&&cmOpen.id===d.id) cmClose(); else cmShow({id:d.id}); return; }
  const a=cmAnchor(d.p);
  mutate(mm=>{ const c=mm.threads.find(x=>x.id===d.id); if(c){ c.x=a.x; c.y=a.y; c.on=a.on; } },{structural:false});
  if(cmOpen) cmShow(cmOpen);
}
// Clicking the board elsewhere closes the thread (a draft with text is kept until Esc or Post).
board.addEventListener('pointerdown',()=>{ if(!cmOpen||state.tool==='comment') return; const tx=cmPop.querySelector('textarea'); if(cmOpen.draft&&tx&&tx.value.trim()) return; cmClose(); },true);
