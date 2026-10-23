/* orim · context-toolbar.js
 * Floating toolbar and popovers for the current selection.
 */
'use strict';
function selBBox(){
  const m=state.model; let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const k of state.sel){
    const id=k.slice(2); let r=null;
    if(k[0]==='n') r=m.nodes.get(id);
    else if(k[0]==='g'){ const b=state.boxes.get(id); r=b&&PAL_LIVE.frameOut?{x:b.x,y:b.y-30,w:b.w,h:b.h+30}:b; }
    else if(k[0]==='k'){ const ik=m.inks.find(x=>x.id===id); r=ik?inkBox(ik):null; }
    else if(k[0]==='a'){ const ar=m.arrows.find(x=>x.id===id); r=ar?arrowBox(resolveArrow(m,ar)):null; }
    else if(k[0]==='p'){ r=m.images.find(x=>x.id===id)||null; }
    else { const e=m.edges[+id]; if(e){ const a=nodeRect(m,e.from,state.boxes),b=nodeRect(m,e.to,state.boxes); if(a&&b){ const g=geomPath(edgeShapeAt(m,+id,state.boxes),0,0); r={x:g.mid.x-20,y:g.mid.y-14,w:40,h:28}; } } }
    if(r){ x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.w);y1=Math.max(y1,r.y+r.h); }
  }
  return x0===Infinity?null:{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
let ctxSig='';
function updCtx(){
  const m=state.model;
  if(!m||!state.sel.size||state.editing||state.richId||(state.drag&&state.drag.mode!=='pan')){ ctxEl.hidden=true; ctxSig=''; return; }
  const k=selKinds(); let html='';
  const b=(act,icon,title,extra='')=>'<button type="button" class="ibtn" data-act="'+act+'" title="'+title+'" aria-label="'+title+'" '+extra+'>'+ico(icon)+'</button>';
  const sep='<span class="vsep"></span>';
  const thick=(v)=>'<label class="thick" title="Thickness"><input type="range" min="1" max="12" step="0.5" value="'+v+'" data-thick aria-label="Thickness"><output>'+v+'</output></label>';
  const colorDots=(cur,withDefault)=>(withDefault?'<button type="button" class="ink-dot" data-acolor="" aria-pressed="'+!cur+'" title="Default" style="background:var(--edge);width:18px;height:18px"></button>':'')+ARROW_COLORS.map(c=>'<button type="button" class="ink-dot" data-acolor="'+c+'" aria-pressed="'+((cur||'').toLowerCase()===c)+'" title="'+c+'" style="background:'+(c==='#1a1a1a'?'var(--ink-black)':c)+';width:18px;height:18px"></button>').join('');
  const lineColorBtn=(c)=>'<button type="button" class="ibtn" data-act="lineColor" title="Line color" aria-label="Line color"><span class="dot" style="background:'+(c?(c==='#1a1a1a'?'var(--ink-black)':c):'var(--edge)')+';border-color:transparent"></span></button>';
  // Claude's button sits at the end of the toolbar, as in Mural: the yellow mark opens a menu of actions for the selection.
  let ai=false; const aiBtn='<button type="button" class="ibtn ai-tile" data-act="aiPop" title="Ask Claude about the selection" aria-label="Ask Claude about the selection">'+aiSpark()+'</button>';
  if(k.p&&!k.a&&!k.n&&!k.e&&!k.g&&!k.k){
    html+='<span class="ctx-count">'+(k.p===1?'Image':k.p+' images')+'</span>'+sep+b('picFront','layerUp','Bring to front, above shapes, notes and lines')+b('picBack','layerDown','Send to back, behind shapes and notes')+b('picDup','dup','Duplicate (Ctrl+D)')+b('picFade','picture',(m.images.find(x=>'p:'+x.id===[...state.sel][0])||{}).faded?'Show at full strength':'Fade, to trace over it')+sep+b('del','trash','Delete (Del)');
    if(k.p===1) ai=true;
  } else if(k.a&&!k.n&&!k.e&&!k.g&&!k.k){
    const as=[...state.sel].map(x=>m.arrows.find(a=>a.id===x.slice(2))).filter(Boolean); const a0=as[0];
    if(as.length>1) html+='<span class="ctx-count">'+as.length+' arrows</span>';
    html+='<div class="seg2">'+ARROW_KINDS.map(([id,ic,tt])=>b('akind-'+id,ic,tt,'aria-pressed="'+(a0.kind===id)+'"')).join('')+'</div>'+sep+thick(a0.w)+sep+lineColorBtn(a0.color)+sep+b('del','trash','Delete (Del)');
  } else if(k.k&&!k.n&&!k.e&&!k.g&&!k.p){
    html+='<span class="ctx-count">'+k.k+(k.k===1?' drawing':' drawings')+'</span>'+sep+b('del','trash','Delete (Del)');
  } else if(k.n&&!k.e&&!k.g&&!k.k&&!k.a&&!k.p&&selNodes().every(isUi)){
    // Mockup pieces: an accent colour, the text, and the usual actions.
    const ns=selNodes(); const cur=(m.styles.get(ns[0].id)||{}).fill||'';
    if(ns.length>1) html+='<span class="ctx-count">'+ns.length+' selected</span>';
    html+='<div class="ui-dots">'+UI_COLORS.map(([c,nm])=>'<button type="button" class="ui-dot" data-uicolor="'+c+'" title="'+nm+'" aria-label="'+nm+'" aria-pressed="'+(c===cur)+'" style="--c:'+(c||'var(--wf-ink)')+'"></button>').join('')+'</div>'+sep;
    if(ns.length===1) html+=b('editLabel','edit','Edit text (Enter)');
    // Mark a piece as new, changed or removed (tables and menus mark single items with +, ~ or - in their text).
    if(ns.every(n=>!['uiTable','uiSidebar','uiTabbar'].includes(n.shape))){ const mk=uiMark(String(ns[0].label||'').split('\n')[0]).m; html+='<button type="button" class="btn ui-mark'+(mk?' on':'')+'" data-act="uiMark" title="Mark as new, changed or removed (click to cycle)"'+(mk?' style="--mk:'+mk.color+'"':'')+'>'+(mk?mk.name:'Mark')+'</button>'; }
    html+=b('group','group','Group into frame (Ctrl+G)')+b('dup','dup','Duplicate (Ctrl+D)')+b('del','trash','Delete (Del)');
  } else if(k.n&&!k.e&&!k.g&&!k.k&&!k.a&&!k.p&&selNodes().every(n=>n.shape==='table'||n.shape==='doc')){
    // Tables and documents: edit them in their own editor; the rest is the frame and copy actions.
    const ns=selNodes(); if(ns.length>1) html+='<span class="ctx-count">'+ns.length+' selected</span>';
    if(ns.length===1) html+='<button type="button" class="btn" data-act="editLabel" title="Edit (Enter)">'+(ns[0].shape==='table'?'Edit table':isTicket(ns[0])?'Edit '+TICKET_TYPES[ns[0].doc.kind].name.toLowerCase():'Edit document')+'</button>'+sep;
    if(ns.some(n=>n.shape==='doc')) html+=b('copyDocs','copyDoc','Copy as text, for Azure DevOps or any editor');
    ai=true;
    html+=b('group','group','Group into frame (Ctrl+G)')+b('dup','dup','Duplicate (Ctrl+D)')+b('del','trash','Delete (Del)');
  } else if(k.n&&!k.e&&!k.g&&!k.k&&!k.a&&!k.p){
    const ns=selNodes(); const first=ns[0]; const st=m.styles.get(first.id);
    ai=true;
    const allIcon=ns.every(n=>n.shape==='icon'); const allSticky=ns.every(n=>n.shape==='sticky');
    const shapeIco=allIcon?'shapes':(SHAPES.find(s=>s.id===first.shape)?first.shape:'rect');
    if(!allSticky) html+='<button type="button" class="ibtn" data-act="shapes" title="Change shape" aria-label="Change shape">'+ico(shapeIco)+'</button>';
    if(allSticky) html+='<button type="button" class="ibtn" data-act="colors" title="Sticky color" aria-label="Sticky color"><span class="dot" style="background:'+((st&&st.fill)||'#fff9b1')+';border-color:transparent;border-radius:3px"></span></button>';
    else if(!allIcon) html+='<button type="button" class="ibtn" data-act="colors" title="Fill color" aria-label="Fill color"><span class="dot" style="'+(st&&st.fill?'background:'+st.fill+';border-color:'+(st.stroke||st.fill):'')+'"></span></button>';
    // The icon button shows the icon itself, so it never looks like the shape button next to it.
    if(!allSticky){ const ic=allIcon&&ns.length===1&&iconFor(first.icon); html+=ic?'<button type="button" class="ibtn ctx-icon" data-act="pickIcon" title="Change icon" aria-label="Change icon"><img alt="" src="'+ic.uri+'"></button>':b('pickIcon','library',allIcon?'Change icon':'Use an icon'); }
    if(ns.some(n=>n.shape==='icon')) html+=b('noIcon','noimage','Remove icon');
    { const fsz=st&&st.fontSize?Math.round(st.fontSize):(allIcon?Math.round(labelSize(first)):'Auto');
      const fk=st&&st.font&&FONTS[st.font]?st.font:null;
      html+=sep+'<button type="button" class="btn fs-btn font-btn" data-act="fontFam" title="Font" style="font-family:'+esc(fontCss(fk)||'inherit')+'">'+(fk?FONTS[fk].name:'Default')+ico('chevD')+'</button>';
      html+='<button type="button" class="btn fs-btn" data-act="fontSize" title="Font size">'+fsz+ico('chevD')+'</button>';
      html+=b('bold','bold','Bold (Ctrl+B)','aria-pressed="'+!!(st&&st.bold)+'"')+b('italic','italic','Italic (Ctrl+I)','aria-pressed="'+!!(st&&st.italic)+'"');
      if(!allIcon) html+=b('textDir','textDir','Text direction: '+TEXT_DIRS[first.rot||0],first.rot?'aria-pressed="true"':'');
      html+='<button type="button" class="ibtn" data-act="textColor" title="Text color" aria-label="Text color"><svg class="i" viewBox="0 0 24 24"><path d="M7 15.5L12 4l5 11.5M8.8 11.5h6.4"/><rect x="5" y="18" width="14" height="3" rx="1" style="fill:'+((st&&st.color)||'var(--fg)')+';stroke:none"/></svg></button>';
      html+='<button type="button" class="ibtn" data-act="textBg" title="Text highlight color" aria-label="Text highlight color"><svg class="i" viewBox="0 0 24 24"><path d="M14.5 3.5l4.5 4.5-6.5 6.5H8V10z"/><path d="M8 10l-2.5 2.5V15H8"/><rect x="5" y="18" width="14" height="3" rx="1" style="fill:'+((st&&st.bg)||'transparent')+';stroke:'+((st&&st.bg)?'none':'currentColor')+';stroke-width:1"/></svg></button>'; }
    if(ns.length>1) html='<span class="ctx-count">'+ns.length+' selected</span>'+html;
    if(ns.length===1) html+=b('editLabel','edit','Edit text (Enter)');
    if(ns.length>1){ html+=sep+b('al-l','alL','Align left')+b('al-c','alC','Align centers')+b('al-t','alT','Align top')+b('al-m','alM','Align middles'); if(ns.length>2) html+=b('al-h','disH','Distribute horizontally')+b('al-v','disV','Distribute vertically'); }
    html+=sep+b('group','group','Group into frame (Ctrl+G)')+b('dup','dup','Duplicate (Ctrl+D)')+b('del','trash','Delete (Del)');
  } else if(k.e&&!k.n&&!k.g&&!k.a&&!k.k&&!k.p){
    const es=[...state.sel].map(s=>m.edges[+s.slice(2)]).filter(Boolean); const e=es[0];
    const on=(c)=>'aria-pressed="'+(c?'true':'false')+'"';
    if(es.length>1) html+='<span class="ctx-count">'+es.length+' connectors</span>';
    html+='<div class="seg2">'+b('line-solid','lineSolid','Solid line',on(e.line==='solid'))+b('line-dotted','lineDot','Dotted line',on(e.line==='dotted'))+b('line-thick','lineThick','Thick line',on(e.line==='thick'))+'</div>';
    html+='<div class="seg2">'+b('arr-none','arrNone','No arrowheads',on(e.head==='none'))+b('arr-end','arrEnd','Arrow at end',on(e.head!=='none'&&e.tail==='none'))+b('arr-both','arrBoth','Arrows at both ends',on(e.head!=='none'&&e.tail!=='none'))+'</div>';
    const rt=routeOf(state.model,e);
    html+='<div class="seg2">'+b('route-curved','arCurved','Curved',on(rt==='curved'))+b('route-straight','arLine','Straight',on(rt==='straight'))+b('route-elbow','arElbow','Elbow',on(rt==='elbow'))+'</div>';
    html+=sep+thick(e.width||(e.line==='thick'?3.5:2))+sep+lineColorBtn(e.color);
    html+=sep+b('reverse','reverse','Reverse direction');
    if(es.some(x=>x.sa||x.sb)) html+=b('autoSides','autoSides','Automatic connection points');
    if(es.length===1) html+=b('editLabel','label',e.label?'Edit label':'Add label');
    html+=sep+b('del','trash','Delete (Del)');
  } else if(k.g&&!k.n&&!k.e&&!k.k&&!k.a&&!k.p){
    const g=m.groups.get([...state.sel][0].slice(2)); const st=g&&m.styles.get(g.id);
    if(k.g===1&&g&&!g.dev) ai=true;
    if(k.g===1) html+='<button type="button" class="btn" data-act="editLabel" title="Rename frame (Enter)">'+esc(g?g.label:'Frame')+'</button>'+sep;
    else html+='<span class="ctx-count">'+k.g+' frames</span>'+sep;
    if(k.g===1&&g&&g.dev) html+='<span class="ctx-count">'+esc(DEVICES[g.dev].name)+'</span>';
    else if(k.g===1) html+='<button type="button" class="btn" data-act="format" title="Frame format">'+ico('format')+'<span>'+esc(frameFormatName(g.id))+'</span></button>';
    if(!(k.g===1&&g&&g.dev)) html+='<button type="button" class="ibtn" data-act="colors" title="Background color" aria-label="Background color"><span class="dot" style="'+(st&&st.fill?'background:'+st.fill+';border-color:'+(st.stroke||st.fill):'')+'"></span></button>';
    if(k.g===1&&g&&!g.dev){ const p=m.pos.get(g.id); if(p&&p.w&&groupHasMembers(m,g.id)) html+=b('fitGroup','fitIn','Resize to fit content'); }
    if(k.g===1&&g&&!g.dev) html+=b('textDir','textDir','Title direction: '+TEXT_DIRS[g.rot||0],g.rot?'aria-pressed="true"':'');
    if(k.g===1) html+=b('dupFrame','dup','Duplicate frame and contents (Ctrl+D)');
    html+=sep+b('ungroup','ungroup','Remove frame, keep contents (Ctrl+Shift+G)')+b('del','trash','Delete frame and contents (Del)');
  } else {
    ai=true; html+='<span class="ctx-count">'+state.sel.size+' selected</span>'+b('group','group','Group into frame (Ctrl+G)')+b('del','trash','Delete (Del)');
  }
  if(ai) html+=sep+aiBtn;
  if(html!==ctxSig&&!state.sliding){ ctxEl.innerHTML=html; ctxSig=html; }
  ctxEl.hidden=false; placeCtx();
}
function placeCtx(){
  const bb=selBBox(); if(!bb){ ctxEl.hidden=true; return; }
  const pr=boardPane.getBoundingClientRect(); const a=toScreen({x:bb.x,y:bb.y}),b=toScreen({x:bb.x+bb.w,y:bb.y+bb.h});
  const w=ctxEl.offsetWidth,h=ctxEl.offsetHeight;
  let left=(a.x+b.x)/2-w/2, top=a.y-h-14;
  if(top<8) top=b.y+14;
  if(top+h>pr.height-70) top=Math.max(8,a.y-h-14);
  left=clamp(left,8,Math.max(8,pr.width-w-8)); top=clamp(top,8,Math.max(8,pr.height-h-8));
  ctxEl.style.left=left+'px'; ctxEl.style.top=top+'px';
  if(!popEl.hidden&&popEl.dataset.anchor) placePop();
}
ctxEl.addEventListener('pointerdown',e=>e.stopPropagation());
function thickTargets(){ const m=state.model; return {edges:[...state.sel].filter(k=>k[0]==='e').map(k=>m.edges[+k.slice(2)]).filter(Boolean),arrows:[...state.sel].filter(k=>k[0]==='a').map(k=>m.arrows.find(a=>a.id===k.slice(2))).filter(Boolean)}; }
ctxEl.addEventListener('input',e=>{
  if(!e.target.matches('[data-thick]')) return; state.sliding=true; const v=+e.target.value; const o=e.target.parentElement.querySelector('output'); if(o) o.textContent=v;
  const t=thickTargets(); t.edges.forEach(x=>x.width=v); t.arrows.forEach(x=>x.w=v); render();
});
ctxEl.addEventListener('change',e=>{
  if(!e.target.matches('[data-thick]')) return; state.sliding=false; const v=+e.target.value; const t=thickTargets(); const structural=t.edges.length>0;
  mutate(()=>{ t.edges.forEach(x=>x.width=v===2?null:v); t.arrows.forEach(x=>x.w=v); },{structural});
});
ctxEl.addEventListener('click',e=>{
  const ud=e.target.closest('[data-uicolor]');
  if(ud){ const c=ud.dataset.uicolor||null; mutate(m=>{ for(const n of selNodes()){ const cur=m.styles.get(n.id)||blankStyle(); cur.fill=c; if(!c&&!cur.stroke&&!cur.color&&!cur.fontSize&&!cur.bold&&!cur.italic&&!cur.bg&&!(cur.extra||[]).length) m.styles.delete(n.id); else m.styles.set(n.id,cur); } }); return; }
  const dot=e.target.closest('[data-acolor]');
  if(dot){ const c=dot.dataset.acolor||null; const t=thickTargets(); mutate(()=>{ t.edges.forEach(x=>x.color=c); t.arrows.forEach(x=>x.color=c||'#1a1a1a'); },{structural:t.edges.length>0}); return; }
  const btn=e.target.closest('[data-act]'); if(!btn) return; const act=btn.dataset.act; const m=state.model;
  const edgesSel=()=>[...state.sel].filter(k=>k[0]==='e').map(k=>+k.slice(2));
  switch(act){
    case 'del': deleteSel(); break;
    case 'copyDocs': copyDocs(selNodes()); break;
    case 'dup': if(copySel()){ state.pasteN=0; pasteClip(); } break;
    case 'group': groupSel(); break;
    case 'ungroup': ungroupSel(); break;
    case 'fitGroup': { const gid=[...state.sel][0].slice(2); mutate(mm=>{ mm.pos.delete(gid); },{structural:false}); toast('Frame fits its contents again'); break; }
    case 'editLabel': { const k=[...state.sel][0]; openEditor(k[0]==='n'?'node':k[0]==='e'?'edge':'group',k[0]==='e'?+k.slice(2):k.slice(2)); break; }
    case 'shapes': openPop('shapes',btn); break;
    case 'colors': openPop('colors',btn); break;
    case 'format': openPop('format',btn); break;
    case 'picFront': case 'picBack': { const ids=new Set([...state.sel].filter(x=>x[0]==='p').map(x=>x.slice(2))); mutate(mm=>{ const sel=mm.images.filter(im=>ids.has(im.id)),rest=mm.images.filter(im=>!ids.has(im.id)); for(const im of sel) im.front=act==='picFront'; mm.images=act==='picFront'?[...rest,...sel]:[...sel,...rest]; },{structural:false}); for(const el of imgEls.values()) el.remove(); imgEls.clear(); render(); toast(act==='picFront'?'Image in front of everything':'Image behind shapes and notes'); break; }
    case 'aiPop': openPop('ai',btn); return;
    case 'textDir': openPop('textDir',btn); return;
    case 'dupFrame': { const gid=[...state.sel].find(x=>x[0]==='g'); if(gid) dupFrame(gid.slice(2)); return; }
    case 'uiMark': { const ns=selNodes(); const cur=uiMark(String(ns[0].label||'').split('\n')[0]).m; const order=[null,'+','~','-']; const nx=order[(order.indexOf(cur?Object.keys(UI_MARKS).find(k=>UI_MARKS[k]===cur):null)+1)%4];
      mutate(mm=>{ for(const n0 of ns){ const n=mm.nodes.get(n0.id); if(!n) continue; const L=String(n.label||'').split('\n'); const base=uiMark(L[0]).t; L[0]=(nx||'')+base; n.label=L.join('\n'); } },{structural:true}); return; }
    case 'picAI': { const id=[...state.sel].find(x=>x[0]==='p'); if(id) AI.fromImage(id.slice(2)); return; }
    case 'picFade': { const ids=new Set([...state.sel].filter(x=>x[0]==='p').map(x=>x.slice(2))); mutate(mm=>{ const sel=mm.images.filter(im=>ids.has(im.id)); const on=!sel.every(im=>im.faded); for(const im of sel){ if(on) im.faded=true; else delete im.faded; } },{structural:false}); return; }
    case 'picDup': { const ids=[...state.sel].filter(x=>x[0]==='p').map(x=>x.slice(2)); const nsel=[]; mutate(mm=>{ for(const id of ids){ const im=mm.images.find(x=>x.id===id); if(!im) continue; const nid=nextImageId(mm); IMG[nid]=IMG[id]; mm.images.push({id:nid,x:im.x+24,y:im.y+24,w:im.w,h:im.h,front:!!im.front}); nsel.push('p:'+nid); } },{structural:false}); state.sel=new Set(nsel); selChanged(); break; }
    case 'fontSize': openPop('fontSize',btn); break;
    case 'fontFam': openPop('fontFam',btn); break;
    case 'textColor': openPop('textColor',btn); break;
    case 'textBg': openPop('textBg',btn); break;
    case 'lineColor': openPop('lineColor',btn); break;
    case 'bold': toggleTextStyle('bold'); break;
    case 'italic': toggleTextStyle('italic'); break;
    case 'pickIcon': startPick(); break;
    case 'noIcon': mutate(mm=>{ for(const n of selNodes()){ const x=mm.nodes.get(n.id); if(x.shape==='icon'){ x.shape='rect'; x.icon=null; mm.pos.set(x.id,{x:x.x,y:x.y}); x.sized=false; } } }); break;
    case 'autoSides': mutate(mm=>{ for(const i of edgesSel()){ const e=mm.edges[i]; if(e){ delete e.sa; delete e.sb; } } }); toast('Connection points set to automatic'); break;
    case 'reverse': mutate(mm=>{ for(const i of edgesSel()){ const e=mm.edges[i]; [e.from,e.to]=[e.to,e.from]; [e.sa,e.sb]=[e.sb,e.sa]; if(!e.sa) delete e.sa; if(!e.sb) delete e.sb; [e.head,e.tail]=[e.tail==='none'?e.head:e.tail,e.tail==='none'?'none':e.head]; } }); break;
    default:
      if(act.startsWith('akind-')){ const v=act.slice(6); mutate(mm=>{ for(const k of state.sel) if(k[0]==='a'){ const a=mm.arrows.find(x=>x.id===k.slice(2)); if(a) a.kind=v; } },{structural:false}); break; }
      if(act.startsWith('route-')){ const v=act.slice(6); mutate(mm=>{ for(const i of edgesSel()){ if(v===(mm.curve||'curved')) delete mm.edges[i].route; else mm.edges[i].route=v; } },{structural:false}); break; }
      if(act.startsWith('line-')){ const v=act.slice(5); mutate(mm=>{ for(const i of edgesSel()) mm.edges[i].line=v; }); }
      else if(act.startsWith('arr-')){ const v=act.slice(4); mutate(mm=>{ for(const i of edgesSel()){ const e=mm.edges[i]; if(v==='none'){e.head='none';e.tail='none';} else if(v==='end'){e.head=e.head==='none'?'arrow':e.head;e.tail='none';} else {e.head=e.head==='none'?'arrow':e.head;e.tail=e.tail==='none'?'arrow':e.tail;} } }); }
      else if(act.startsWith('al-')) align(act.slice(3));
  }
});
const TEXT_DIRS={0:'Horizontal',90:'Rotate all text 90°',180:'Rotate all text 180°',270:'Rotate all text 270°'};
// Duplicate a frame with everything in it (frames inside, shapes, the lines between them), to its right.
function dupFrame(gid){
  const m0=state.model, b=state.boxes&&state.boxes.get(gid); if(!m0||!m0.groups.has(gid)) return; const dx=(b?b.w:300)+48;
  let top=null;
  mutate(m=>{
    const inside=new Set([gid]); let grew=true; while(grew){ grew=false; for(const g of m.groups.values()) if(!inside.has(g.id)&&g.parent&&inside.has(g.parent)){ inside.add(g.id); grew=true; } }
    const taken=id=>m.nodes.has(id)||m.groups.has(id), map=new Map();
    for(const id of m.groupOrder.filter(x=>inside.has(x))){ const g=m.groups.get(id); const nid=idFrom(id.replace(/\d+$/,'')+'Copy',taken); map.set(id,nid);
      m.groups.set(nid,{...g,id:nid,label:id===gid?g.label+' copy':g.label,parent:id===gid?g.parent:map.get(g.parent)}); m.groupOrder.push(nid);
      const p=m.pos.get(id); if(p) m.pos.set(nid,{...p,x:p.x+dx}); const st=m.styles.get(id); if(st) m.styles.set(nid,JSON.parse(JSON.stringify(st))); }
    for(const id of [...m.nodeOrder]){ const n=m.nodes.get(id); if(!n||!inside.has(n.group)) continue; const nid=idFrom(id.replace(/\d+$/,''),taken); map.set(id,nid);
      const c=JSON.parse(JSON.stringify(n)); c.id=nid; c.group=map.get(n.group); c.x=n.x+dx; m.nodes.set(nid,c); m.nodeOrder.push(nid); const st=m.styles.get(id); if(st) m.styles.set(nid,JSON.parse(JSON.stringify(st))); }
    for(const e of [...m.edges]) if(map.has(e.from)&&map.has(e.to)) m.edges.push({...e,from:map.get(e.from),to:map.get(e.to)});
    top=map.get(gid);
  });
  if(top){ state.sel=new Set(['g:'+top]); selChanged(); toast('Frame duplicated'); }
}
// What Claude can do with the selection. The request text is what the AI tab sends; "selected" means the selection.
const AI_ACTIONS={
  editable:{name:'Make editable',icon:'picture',ask:''},
  themes:{name:'Group by theme',icon:'frame',ask:'Group the selected items by theme. Put each group in a new frame named after its theme, side by side next to where they are now. Keep their text as it is.'},
  summary:{name:'Summarise into a doc',icon:'doc',ask:'Summarise the selected items in a doc next to them: a short title, the key points as a list, and any open questions.'},
  sentiment:{name:'Sort by sentiment',icon:'sticky',ask:'Sort the selected notes by sentiment: colour positive ones green (#c9df56), neutral ones yellow (#fff9b1) and negative ones pink (#ffcee0), and move them into three frames named Positive, Neutral and Negative.'},
  expand:{name:'Generate ideas',icon:'sticky',ask:'Build on the selected item: add four to six related ideas as sticky notes around it, each connected to it.'},
  diagram:{name:'Make a diagram',icon:'shapes',ask:'Turn the selected notes into a diagram next to them: shapes (with icons where a service fits) and connections that show how the ideas relate.'},
  tickets:{name:'Turn into tickets',icon:'ticket',ask:'Turn the selected items into tickets next to them: a user story for each piece of work (a task if it is small), with acceptance criteria, connected to the item it came from, in a frame named Tickets.'},
  explain:{name:'Explain in a doc',icon:'doc',ask:'Explain the selected items in a doc next to them: what each part is for and how they connect.'},
  fix:{name:'Fix grammar and spelling',icon:'spell',ask:'Fix spelling and grammar in the text of the selected items (labels, table cells and doc text). Change nothing else.'},
  shorter:{name:'Rewrite shorter',icon:'edit',ask:'Rewrite the text of the selected items to be shorter and clearer, keeping the meaning. Change only the text.'},
  translate:{name:'Translate',icon:'globe',sub:true}
};
const AI_LANGS=[['EN','English'],['FI','Finnish'],['SV','Swedish'],['DE','German'],['FR','French'],['ES','Spanish']];
function aiActions(){
  if([...state.sel].every(k=>k[0]==='p')) return ['editable','explain'];
  const ns=selNodes(), many=state.sel.size>1||[...state.sel].some(k=>k[0]==='g'); const sticky=ns.some(n=>n.shape==='sticky');
  return (many?['themes','summary',...(sticky?['sentiment']:[]),'diagram','tickets']:['expand','explain','tickets']).concat(['|','fix','shorter','translate']);
}
function aiMenuHtml(sub){
  const row=(k,a)=>'<button type="button" class="ai-row" data-aiask="'+k+'">'+ico(a.icon)+'<span>'+esc(a.name)+'</span>'+(a.sub?ico('chev'):'')+'</button>';
  const body=sub==='translate'?'<button type="button" class="ai-row ai-back" data-aiback>'+ico('chev')+'<span>Translate to</span></button>'+AI_LANGS.map(([c,l])=>'<button type="button" class="ai-row" data-ailang="'+l+'"><span class="ai-lang">'+c+'</span><span>'+l+'</span></button>').join('')
    :aiActions().map(k=>k==='|'?'<hr>':row(k,AI_ACTIONS[k])).join('');
  return '<div class="ai-menu">'+body+'<p class="ai-foot">Claude can make mistakes. Each request is one undo step, so you can take it back.</p></div>';
}
function openPop(kind,anchor){
  if(!popEl.hidden&&popEl.dataset.kind===kind){ closePop(); return; }
  const m=state.model; let html='';
  if(kind==='lineColor'){
    const t=thickTargets(); const cur=(t.edges[0]&&t.edges[0].color)||(t.arrows[0]&&t.arrows[0].color)||'';
    html='<div class="pop-label">Line color</div><div class="swatches">'+(t.edges.length?'<button type="button" class="swt none" data-lc="" aria-pressed="'+!cur+'" title="Default"></button>':'')+MIRO_COLORS.map(c=>'<button type="button" class="swt" data-lc="'+c+'" aria-pressed="'+(cur.toLowerCase()===c)+'" title="'+c+'" style="background:'+c+';border-color:'+(c==='#ffffff'?'var(--line-strong)':c)+'"></button>').join('')+'</div>';
  } else if(kind==='fontSize'){
    const st=m.styles.get([...state.sel][0].slice(2)); const sticky=selNodes().every(n=>n.shape==='sticky');
    const cur=st&&st.fontSize?Math.round(st.fontSize):'';
    html='<div class="pop-label">Font size</div><div class="fs-row"><input id="fsIn" type="number" min="6" max="400" step="1" value="'+cur+'" placeholder="Auto" aria-label="Font size"></div><div class="fs-list">'+'<button type="button" data-fs="auto">Auto</button>'+FONT_SIZES.map(v=>'<button type="button" data-fs="'+v+'"'+(+cur===v?' aria-pressed="true"':'')+'>'+v+'</button>').join('')+'</div>';
  } else if(kind==='textColor'||kind==='textBg'){
    const st=m.styles.get([...state.sel][0].slice(2)); const list=kind==='textColor'?TEXT_COLORS:TEXT_BGS; const curv=st?(kind==='textColor'?st.color:st.bg):null;
    html='<div class="pop-label">'+(kind==='textColor'?'Text color':'Highlight')+'</div><div class="swatches">'+list.map(c=>'<button type="button" class="swt'+(c?'':' none')+'" data-tc="'+(c||'')+'" data-tk="'+kind+'" aria-pressed="'+((curv||'')===(c||''))+'" title="'+(c||'None')+'" style="'+(c?'background:'+c+';border-color:'+(c==='#ffffff'?'var(--line-strong)':c):'')+'"></button>').join('')+'</div>';
  } else if(kind==='textDir'){
    // Text direction, named as in PowerPoint and Word.
    const one=[...state.sel][0], cur=(one[0]==='g'?(m.groups.get(one.slice(2))||{}).rot:(m.nodes.get(one.slice(2))||{}).rot)||0;
    html='<div class="rot-row">'+[0,90,180,270].map(r=>'<button type="button" class="rot-btn" data-rot="'+r+'" aria-pressed="'+(r===cur)+'" title="'+TEXT_DIRS[r]+'" aria-label="'+TEXT_DIRS[r]+'"><b style="transform:rotate('+r+'deg)">Ab</b></button>').join('')+'</div>';
  } else if(kind==='fontFam'){
    const st=m.styles.get([...state.sel][0].slice(2)); const cur=(st&&st.font)||'';
    html='<div class="pop-label">Font</div><div class="font-list">'+[['','Default','Clean sans']].concat(Object.entries(FONTS).map(([k,f])=>[k,f.name,f.hint])).map(([k,nm,h])=>'<button type="button" class="fly-row" data-font="'+k+'" aria-pressed="'+(k===cur)+'"><span style="font-family:'+esc(fontCss(k)||'var(--font-ui)')+';font-size:'+(k==='caveat'?19:15)+'px">'+nm+'</span><small>'+h+'</small></button>').join('')+'</div>';
  } else if(kind==='ai'){
    // Quick AI actions on the selection, like Mural's: Claude sees what is selected.
    html=aiMenuHtml();
  } else if(kind==='format'){
    html='<div class="pop-label">Frame format</div><div class="fmt-list">'+FRAME_FORMATS.map((f,i)=>'<button type="button" class="fmt" data-fmt="'+i+'"><b>'+f.name+'</b><small>'+(f.w?f.w+' × '+f.h:'Grows with content')+'</small></button>').join('')+'</div>';
  } else if(kind==='shapes'){
    html='<div class="pop-label">Shape</div><div class="pop-grid">'+SHAPES.filter(s=>s.id!=='sticky').map(s=>'<button type="button" class="ibtn" data-shape="'+s.id+'" title="'+s.name+'" aria-label="'+s.name+'">'+ico(s.id)+'</button>').join('')+'</div>';
  } else {
    const k=[...state.sel][0]; const st=m.styles.get(k.slice(2));
    const stickies=selNodes().length&&selNodes().every(n=>n.shape==='sticky');
    if(stickies) html='<div class="pop-label">Sticky color</div><div class="swatches" style="grid-template-columns:repeat(5,26px)">'+STICKY_COLORS.map(c=>'<button type="button" class="swt" data-stc="'+c+'" aria-pressed="'+((st&&st.fill)===c)+'" title="'+c+'" style="background:'+c+';border-color:transparent;border-radius:4px"></button>').join('')+'</div>';
    else html='<div class="pop-label">'+(k[0]==='g'?'Background':'Fill')+'</div><div class="swatches">'+SWATCHES.map((s,i)=>{ const on=s?(st&&st.fill===s.fill):!(st&&st.fill); return '<button type="button" class="swt'+(s?'':' none')+'" data-sw="'+i+'" aria-pressed="'+on+'" title="'+(s?s.fill:'Default')+'" style="'+(s?'background:'+s.fill+';border-color:'+s.stroke:'')+'"></button>'; }).join('')+'</div>';
  }
  popEl.innerHTML=html; popEl.dataset.kind=kind; popEl.dataset.anchor='1'; popEl._anchor=anchor; popEl.hidden=false; placePop();
}
function placePop(){
  const a=popEl._anchor; if(!a||!a.isConnected){ closePop(); return; }
  const pr=boardPane.getBoundingClientRect(),ar=a.getBoundingClientRect();
  let left=ar.left-pr.left, top=ar.bottom-pr.top+8;
  if(top+popEl.offsetHeight>pr.height-8) top=ar.top-pr.top-popEl.offsetHeight-8;
  popEl.style.left=clamp(left,8,Math.max(8,pr.width-popEl.offsetWidth-8))+'px'; popEl.style.top=Math.max(8,top)+'px';
}
const FRAME_FORMATS=[{name:'Custom'},{name:'16:9',w:1280,h:720},{name:'4:3',w:1024,h:768},{name:'1:1',w:800,h:800},{name:'A4',w:794,h:1123},{name:'Letter',w:816,h:1056},{name:'Mobile',w:390,h:844},{name:'Desktop',w:1440,h:1024}];
function frameFormatName(gid){ const p=state.model&&state.model.pos.get(gid); if(!p||!p.w) return 'Custom'; const f=FRAME_FORMATS.find(f=>f.w===Math.round(p.w)&&f.h===Math.round(p.h)); return f?f.name:'Custom'; }
const FONT_SIZES=[10,12,14,18,24,36,48,64,80,144,288];
const TEXT_COLORS=[null,...MIRO_COLORS];
const TEXT_BGS=[null,'#fff9b1','#f5d128','#ff9d48','#d5f692','#c9df56','#a6ccf5','#6cd8fa','#ffcee0','#ea94bb','#c6a2d2','#e6e6e6','#ffffff'];
function blankStyle(){ return {fill:null,stroke:null,color:null,fontSize:null,bold:false,italic:false,bg:null,extra:[]}; }
function applyTextStyle(patch){
  const ns=selNodes(); if(!ns.length) return;
  mutate(m=>{ for(const n of ns){ const st=m.styles.get(n.id)||blankStyle(); Object.assign(st,patch); const empty=!st.fill&&!st.stroke&&!st.color&&!st.fontSize&&!st.bold&&!st.italic&&!st.bg&&!st.font&&!(st.extra&&st.extra.length); if(empty) m.styles.delete(n.id); else m.styles.set(n.id,st); } });
}
function toggleTextStyle(k){ const ns=selNodes(); if(!ns.length) return; const st=state.model.styles.get(ns[0].id); applyTextStyle({[k]:!(st&&st[k])}); }
function setFontSize(v){
  const nv=v&&isFinite(v)?Math.max(6,Math.min(400,Math.round(v))):null;
  for(const n of selNodes()) if(n.shape==='text'&&n.sized){ const of=labelSize(n); const tf=nv||13; n.w=Math.max(30,Math.round(n.w*tf/of)); }
  applyTextStyle({fontSize:nv});
}
function closePop(){ popEl.hidden=true; popEl.dataset.kind=''; popEl._anchor=null; }
popEl.addEventListener('pointerdown',e=>e.stopPropagation());
popEl.addEventListener('keydown',e=>{ if(e.target.id==='fsIn'&&e.key==='Enter'){ e.preventDefault(); const v=e.target.value.trim(); setFontSize(v?+v:null); closePop(); } e.stopPropagation(); });
popEl.addEventListener('click',e=>{
  const aa=e.target.closest('[data-aiask]'); if(aa){ const k=aa.dataset.aiask, a=AI_ACTIONS[k]; if(!a) return;
    if(a.sub){ popEl.innerHTML=aiMenuHtml(k); return; }
    closePop(); if(k==='editable'){ const id=[...state.sel].find(x=>x[0]==='p'); if(id) AI.fromImage(id.slice(2)); return; } AI.ask(a.ask,a.name); return; }
  if(e.target.closest('[data-aiback]')){ popEl.innerHTML=aiMenuHtml(); return; }
  const al=e.target.closest('[data-ailang]'); if(al){ closePop(); AI.ask('Translate the text of the selected items (labels, table cells and doc text) into '+al.dataset.ailang+'. Keep everything else as it is.','Translate'); return; }
  const sb=e.target.closest('[data-shape]'),sw=e.target.closest('[data-sw]'),stc=e.target.closest('[data-stc]'),fmt=e.target.closest('[data-fmt]');
  const fsb=e.target.closest('[data-fs]'),tcb=e.target.closest('[data-tc]'),lcb=e.target.closest('[data-lc]');
  if(lcb){ const c=lcb.dataset.lc||null; const t=thickTargets(); mutate(()=>{ t.edges.forEach(x=>x.color=c); t.arrows.forEach(x=>x.color=c||'#1a1a1a'); },{structural:t.edges.length>0}); closePop(); return; }
  if(fsb){ setFontSize(fsb.dataset.fs==='auto'?null:+fsb.dataset.fs); closePop(); return; }
  const rb=e.target.closest('[data-rot]'); if(rb){ const r=+rb.dataset.rot; mutate(mm=>{ for(const k of state.sel){ const x=k[0]==='n'?mm.nodes.get(k.slice(2)):k[0]==='g'?mm.groups.get(k.slice(2)):null; if(!x) continue; if(r) x.rot=r; else delete x.rot; if(k[0]==='n') sizeNode(x); } },{structural:false}); closePop(); return; }
  const fnb=e.target.closest('[data-font]'); if(fnb){ applyTextStyle({font:fnb.dataset.font||null}); closePop(); return; }
  if(tcb){ const v=tcb.dataset.tc||null; applyTextStyle(tcb.dataset.tk==='textColor'?{color:v}:{bg:v}); closePop(); return; }
  if(stc){ const c=stc.dataset.stc; mutate(m=>{ for(const n of selNodes()){ const cur=m.styles.get(n.id)||{fill:null,stroke:null,color:null,extra:[]}; cur.fill=c; cur.stroke=null; m.styles.set(n.id,cur); } }); closePop(); return; }
  if(fmt){ const f=FRAME_FORMATS[+fmt.dataset.fmt]; const gid=[...state.sel][0].slice(2); const b=state.boxes.get(gid);
    mutate(m=>{ if(!f.w) m.pos.delete(gid); else if(b) m.pos.set(gid,{x:b.x,y:b.y,w:f.w,h:f.h}); },{structural:false}); closePop(); return; }
  if(sb){ const shape=sb.dataset.shape; mutate(m=>{ for(const n of selNodes()){ const x=m.nodes.get(n.id); x.shape=shape; x.icon=null; m.pos.set(x.id,{x:x.x,y:x.y}); x.sized=false; } }); closePop(); }
  if(sw){ const s=SWATCHES[+sw.dataset.sw]; mutate(m=>{ for(const k of state.sel){ if(k[0]==='e') continue; const id=k.slice(2); const cur=m.styles.get(id)||{fill:null,stroke:null,color:null,extra:[]}; if(s){cur.fill=s.fill;cur.stroke=s.stroke;cur.color=null;} else {cur.fill=null;cur.stroke=null;cur.color=null;} if(!cur.fill&&!cur.stroke&&!cur.extra.length) m.styles.delete(id); else m.styles.set(id,cur); } }); closePop(); }
});
