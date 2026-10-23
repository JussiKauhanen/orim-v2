/* orim · tools.js
 * Left toolbar, tool fly-outs, tool switching.
 */
'use strict';
const TOOLS=[['select','select','Select (V)','Select'],['hand','hand','Hand (H or Space)','Hand'],'|',['sticky','sticky','Sticky note (N)','Sticky'],['text','text','Text (T)','Text'],['table','table','Table','Table'],['doc','doc','Document','Doc'],['ui','phone','Mockups: phone, iPad and desktop screens','Mockup'],['shapes','shapes','Shapes (S)','Shapes'],['connector','arCurved','Arrows and connectors (A)','Arrows'],['ink','pen','Pen, highlighter and eraser (P)','Draw'],['frame','frame','Frame (F)','Frame'],['image','picture','Image: paste, drop or pick a file','Image'],['comment','comment','Comment (C)','Comment'],'|',['library','library','Icon library (I)','Icons']];
state.inkColor=LS.get('mab.inkColor',{pen:0,hl:0}); state.stickyColor=LS.get('mab.stickyColor',0); state.lastShape='rect'; state.lastInk='pen'; state.fly=null;
const INK_TOOLS=['pen','hl','eraser'];
state.arrowKind=LS.get('mab.arrowKind','curved'); state.arrowW=LS.get('mab.arrowW',2); state.arrowColor=LS.get('mab.arrowColor',0);
function renderTools(){
  $('#tools').innerHTML=TOOLS.map(t=>t==='|'?'<span class="vsep"></span>':'<button type="button" class="ibtn" data-tool="'+t[0]+'" title="'+t[2]+'" aria-label="'+t[2]+'"><span class="ti">'+ico(t[1])+'</span></button>').join('');
  updTools();
}
function updTools(){
  const t=state.tool;
  for(const b of document.querySelectorAll('#tools [data-tool]')){
    const id=b.dataset.tool; let on;
    if(id==='library') on=state.libOpen; else if(id==='shapes') on=SHAPE_TOOLS.includes(t); else if(id==='ink') on=INK_TOOLS.includes(t); else on=t===id;
    b.setAttribute('aria-pressed',String(on));
    const ti=b.querySelector('.ti');
    if(id==='shapes'){ const k=SHAPE_TOOLS.includes(t)?t:state.lastShape; ti.innerHTML=ico(k==='rect'?'shapes':k); }
    if(id==='ink'){ const k=INK_TOOLS.includes(t)?t:state.lastInk; ti.innerHTML=ico(k); }
    if(id==='connector'){ const ak=ARROW_KINDS.find(x=>x[0]===state.arrowKind); ti.innerHTML=ico(ak?ak[1]:'arCurved'); }
  }
  board.classList.toggle('t-hand',t==='hand');
  board.classList.toggle('t-draw',[...SHAPE_TOOLS,'text','frame','sticky','table','doc','ui'].includes(t));
  board.classList.toggle('t-connector',t==='connector');
  board.classList.toggle('t-ink',t==='pen'||t==='hl');
  board.classList.toggle('t-eraser',t==='eraser');
  board.classList.toggle('t-comment',t==='comment');
  renderFly();
}
function renderFly(){
  const fl=$('#flyout'); const t=state.tool; const kind=state.fly&&state.fly===toolFamily(t)?state.fly:null;
  if(!kind){ fl.hidden=true; return; }
  let h='';
  // Miro-style lists: icon, name and shortcut on each row.
  const head=title=>'<div class="fly-head"><span>'+title+'</span><button type="button" class="ibtn fly-close" data-fly-close title="Close panel (Esc)" aria-label="Close panel"><svg class="i" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div>';
  const row=(attr,on,icon,name,key)=>'<button type="button" class="fly-row" '+attr+' aria-pressed="'+on+'">'+ico(icon)+'<span>'+name+'</span>'+(key?'<kbd>'+key+'</kbd>':'')+'</button>';
  // Shapes as a grid of tiles, like Miro: flowchart shapes first, then the rest.
  const tile=id=>{ const sh=SHAPES.find(x=>x.id===id); return '<button type="button" class="fly-tile" data-fly-tool="'+id+'" aria-pressed="'+(t===id)+'" title="'+sh.name+(sh.key?' ('+sh.key.toUpperCase()+')':'')+'" aria-label="'+sh.name+'">'+ico(id)+'</button>'; };
  if(kind==='shapes') h=head('Shapes')+'<div class="fly-sub">Flowchart</div><div class="fly-grid">'+SHAPE_TOOLS.slice(0,9).map(tile).join('')+'</div><div class="fly-sub">More shapes</div><div class="fly-grid">'+SHAPE_TOOLS.slice(9).map(tile).join('')+'</div>';
  if(kind==='ink'){
    h=head('Draw')+[['pen','pen','Pen','P'],['hl','hl','Highlighter','Shift+P'],['eraser','eraser','Eraser','E']].map(([id,ic,nm,k])=>row('data-fly-tool="'+id+'"',t===id,ic,nm,k)).join('');
    if(t!=='eraser'){
      const names=t==='pen'?['Black','Red','Blue']:['Yellow','Pink','Green'];
      h+='<div class="fly-sec">Color</div><div class="fly-dots">'+INK_COLORS[t].map((c,i)=>'<button type="button" class="ink-dot" data-ink-color="'+i+'" aria-pressed="'+(state.inkColor[t]===i)+'" title="'+names[i]+'" aria-label="'+names[i]+'" style="background:'+(c==='#1a1a1a'?'var(--ink-black)':c)+';'+(t==='hl'?'opacity:.75':'')+'"></button>').join('')+'</div>';
    }
  }
  if(kind==='connector'){
    h=head('Arrows')+ARROW_KINDS.map(([id,ic,tt])=>row('data-akind="'+id+'"',state.arrowKind===id,ic,tt,id==='curved'?'A':'')).join('');
    h+='<div class="fly-sec">Thickness</div><label class="thick" title="Thickness"><input type="range" min="1" max="12" step="0.5" value="'+state.arrowW+'" data-fly-thick aria-label="Thickness"><output>'+state.arrowW+'</output></label>';
    h+='<div class="fly-sec">Color</div><div class="fly-dots">'+ARROW_COLORS.map((c,i)=>'<button type="button" class="ink-dot" data-fly-acolor="'+i+'" aria-pressed="'+(state.arrowColor===i)+'" title="'+c+'" aria-label="Color '+c+'" style="width:22px;height:22px;background:'+(c==='#1a1a1a'?'var(--ink-black)':c)+'"></button>').join('')+'</div>';
  }
  if(kind==='ui'){
    const pk=state.uiPick||{};
    h=head('Mockups')+[['mobile','phone'],['tablet','tablet'],['desktop','desktop']].map(([d,ic])=>row('data-ui-dev="'+d+'"',t==='ui'&&pk.dev===d,ic,DEVICES[d].name,'')).join('');
    h+='<div class="fly-seg" role="group" aria-label="Screen">'+SCREEN_PRESETS.map(([id,nm])=>'<button type="button" data-ui-preset="'+id+'" aria-pressed="'+(state.uiPreset===id)+'">'+nm+'</button>').join('')+'</div>';
    h+='<div class="fly-sec">Pieces</div>'+Object.entries(UI_KINDS).map(([id,k])=>row('data-ui-piece="'+id+'"',t==='ui'&&pk.piece===id,id,k.name,'')).join('');
  }
  if(kind==='sticky') h=head('Sticky note color')+'<div class="fly-colors">'+STICKY_COLORS.slice(0,12).map((c,i)=>'<button type="button" class="ink-dot" data-sticky-color="'+i+'" aria-pressed="'+(state.stickyColor===i)+'" title="'+c+'" style="background:'+c+';border-radius:4px"></button>').join('')+'</div>';
  fl.innerHTML=h; fl.hidden=false;
  const btn=$('#tools [data-tool="'+kind+'"]'); const pr=boardPane.getBoundingClientRect(); const lb=$('#leftbar').getBoundingClientRect(); const br=btn?btn.getBoundingClientRect():lb;
  fl.style.left=(lb.right-pr.left+8)+'px';
  fl.style.top=clamp(br.top-pr.top-6,8,Math.max(8,pr.height-fl.offsetHeight-8))+'px';
}
$('#flyout').addEventListener('pointerdown',e=>e.stopPropagation());
$('#flyout').addEventListener('input',e=>{ if(!e.target.matches('[data-fly-thick]')) return; state.arrowW=+e.target.value; LS.set('mab.arrowW',state.arrowW); const o=e.target.parentElement.querySelector('output'); if(o) o.textContent=state.arrowW; });
$('#flyout').addEventListener('click',e=>{
  if(e.target.closest('[data-fly-close]')){ closeFly(); return; }
  const ft=e.target.closest('[data-fly-tool]'),ic=e.target.closest('[data-ink-color]'),sc=e.target.closest('[data-sticky-color]');
  if(ft) setTool(ft.dataset.flyTool);
  const ak=e.target.closest('[data-akind]'),ac=e.target.closest('[data-fly-acolor]');
  if(ak){ state.arrowKind=ak.dataset.akind; LS.set('mab.arrowKind',state.arrowKind); updTools(); }
  if(ac){ state.arrowColor=+ac.dataset.flyAcolor; LS.set('mab.arrowColor',state.arrowColor); renderFly(); }
  if(ic){ state.inkColor[state.tool]=+ic.dataset.inkColor; LS.set('mab.inkColor',state.inkColor); renderFly(); }
  if(sc){ state.stickyColor=+sc.dataset.stickyColor; LS.set('mab.stickyColor',state.stickyColor); renderFly(); }
  const ud=e.target.closest('[data-ui-dev]'),up=e.target.closest('[data-ui-piece]'),us=e.target.closest('[data-ui-preset]');
  if(ud){ state.uiPick={dev:ud.dataset.uiDev}; setTool('ui'); }
  if(up){ state.uiPick={piece:up.dataset.uiPiece}; setTool('ui'); }
  if(us){ state.uiPreset=us.dataset.uiPreset; LS.set('orim.uiPreset',state.uiPreset); if(!state.uiPick||!state.uiPick.dev) state.uiPick={dev:'mobile'}; setTool('ui'); }
});
state.uiPreset=LS.get('orim.uiPreset','blank'); state.uiPick={dev:'mobile'};
function toolFamily(t){ return SHAPE_TOOLS.includes(t)?'shapes':INK_TOOLS.includes(t)?'ink':t==='sticky'?'sticky':t==='connector'?'connector':t==='ui'?'ui':null; }
// The AI mark, the same everywhere: dark sparkles on a warm yellow rounded tile. Size it with CSS (.aim).
function aiSpark(){ return '<svg class="aim" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect width="24" height="24" rx="6.5" fill="#ffd23f"/>'+
  '<path d="M10.25 8.15Q11.5 12.5 15.85 13.75Q11.5 15 10.25 19.35Q9 15 4.65 13.75Q9 12.5 10.25 8.15Z" fill="#1a1a1a"/><path d="M16.6 4.8Q17.2 6.8 19.2 7.4Q17.2 8 16.6 10Q16 8 14 7.4Q16 6.8 16.6 4.8Z" fill="#1a1a1a"/></svg>'; }
function openAITab(){ setMode('split'); setEmode('ai'); setTimeout(()=>{ const i=$('#aiIn'); if(i&&!i.disabled) i.focus(); },60); }
function setTool(t,fromBar){
  if(t==='ai'){ openAITab(); return; }
  if(t==='library'){ setLib(!state.libOpen); return; }
  if(t==='image'){ $('#imgIn').click(); return; }
  const fam0=toolFamily(state.tool);
  if(t==='shapes') t=SHAPE_TOOLS.includes(state.tool)?state.tool:state.lastShape;
  else if(t==='ink') t=INK_TOOLS.includes(state.tool)?state.tool:state.lastInk;
  const fam=toolFamily(t);
  if(fromBar&&fam&&fam===fam0&&state.fly===fam){ state.fly=null; renderFly(); updTools(); return; }
  state.fly=fam;
  if(SHAPE_TOOLS.includes(t)) state.lastShape=t;
  if(INK_TOOLS.includes(t)) state.lastInk=t;
  const was=state.tool; state.tool=t; state.hover=null; state.pendingFrom=null;
  if(INK_TOOLS.includes(t)&&state.sel.size){ state.sel.clear(); selChanged(); }
  updTools(); renderOverlay();
  if(t==='connector'&&was!=='connector') toast('Drag to draw an arrow. Start and end on shapes to connect them.');
}
function closeFly(){ if(state.fly){ state.fly=null; renderFly(); } }
$('#tools').addEventListener('click',e=>{ const b=e.target.closest('[data-tool]'); if(b) setTool(b.dataset.tool,true); });
$('#tools').addEventListener('pointerdown',e=>e.stopPropagation());
$('#zoomBar').addEventListener('pointerdown',e=>e.stopPropagation());
$('#leftbar').addEventListener('pointerdown',e=>e.stopPropagation());

$('#aiFab').innerHTML=aiSpark();
$('#aiFab').addEventListener('click',()=>{ if(state.mode==='split'&&state.emode==='ai'){ const i=$('#aiIn'); if(i) i.focus(); return; } openAITab(); });
{ const t=document.querySelector('#modeSeg .ai-tab-mark'); if(t) t.innerHTML=aiSpark(); for(const el of document.querySelectorAll('.ai-mk')) el.innerHTML=aiSpark(); }
