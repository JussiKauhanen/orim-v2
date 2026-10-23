/* orim · editor.js
 * Code pane: Mermaid and Text modes, highlighting, autocomplete.
 */
'use strict';
const TOK=/("(?:[^"\\]|\\.)*")|(@\{[^}]*\}?)|(\|[^|\n]*\|)|(<?(?:-\.+-|={2,}|-{2,}|~{3,})[>ox]?)|(\b(?:flowchart|graph|subgraph|end|direction|classDef|class|style|linkStyle|click)\b)|(\b(?:TB|TD|BT|RL|LR)\b)|([\[\](){}]+)/g;
function hlLine(line){
  const t=line.trim();
  if(t.startsWith('%%')) return '<span class="'+(POS_RE.test(line)||LAYOUT_MARK.test(t)?'t-pos':'t-cmt')+'">'+esc(line)+'</span>';
  let out='',last=0;
  line.replace(TOK,(m0,str,obj,pipe,arrow,kw,dir,br,off)=>{
    out+=esc(line.slice(last,off));
    if(obj) out+='<span class="t-obj">'+esc(m0).replace(/&quot;[^&]*?&quot;/g,s=>'<span class="t-str">'+s+'</span>')+'</span>';
    else out+='<span class="'+(str?'t-str':pipe?'t-lbl':arrow?'t-arrow':kw?'t-kw':dir?'t-dir':'t-br')+'">'+esc(m0)+'</span>';
    last=off+m0.length; return m0;
  });
  return out+esc(line.slice(last));
}
function hlQuick(text){
  return text.split('\n').map(l=>{
    const t=l.trim();
    if(/^(\/\/|%%)/.test(t)) return '<span class="t-cmt">'+esc(l)+'</span>';
    if(/^#{1,6}\s/.test(t)||/^[^:]{1,60}:$/.test(t)&&!QA_RE.test(t)) return '<span class="t-kw">'+esc(l)+'</span>';
    if(/^direction\s*:/.test(t)) return l.replace(/^(\s*)(direction)(.*)$/,(a,sp,k,r)=>esc(sp)+'<span class="t-kw">'+k+'</span><span class="t-dir">'+esc(r)+'</span>');
    let out=''; let rest=l; const bm=/^(\s*)([-*•+]|\d+[.)])(\s+)/.exec(rest); if(bm){ out+=esc(bm[1])+'<span class="t-br">'+esc(bm[2])+'</span>'+esc(bm[3]); rest=rest.slice(bm[0].length); }
    const parts=rest.split(/(<->|<=>|-->|---|—>|–>|->|<-|--|=>|→|←|↔|⇒|[{}])/);
    let afterColon=false;
    parts.forEach((pt,i)=>{ if(i%2===1){ out+='<span class="'+(pt==='{'||pt==='}'?'t-br':'t-arrow')+'">'+esc(pt)+'</span>'; return; }
      const ci=pt.indexOf(':'); if(ci>=0&&!afterColon){ out+=esc(pt.slice(0,ci))+'<span class="t-br">:</span><span class="t-lbl">'+esc(pt.slice(ci+1))+'</span>'; afterColon=true; } else out+=afterColon?'<span class="t-lbl">'+esc(pt)+'</span>':esc(pt); });
    return out;
  }).join('\n');
}
function highlight(text){
  if(state.emode==='text') return hlQuick(text);
  const lines=text.split('\n'); let fm=false,fmDone=false,started=false; const out=[];
  for(const l of lines){
    const t=l.trim();
    if(!fmDone&&t==='---'&&(!started||fm)){ out.push('<span class="t-kw">'+esc(l)+'</span>'); if(fm){fm=false;fmDone=true;} else fm=true; started=true; continue; }
    if(t) started=true;
    if(fm){ out.push(l.replace(/^(\s*)(title)(\s*:)(.*)$/,(a,s,k,c,v)=>esc(s)+'<span class="t-kw">'+k+'</span>'+esc(c)+'<span class="t-str">'+esc(v)+'</span>')||esc(l)); if(!/^\s*title\s*:/.test(l)) out[out.length-1]='<span class="t-cmt">'+esc(l)+'</span>'; continue; }
    out.push(hlLine(l));
  }
  return out.join('\n');
}
state.emode=LS.get('mab.emode','mermaid');
function editorText(){ if(state.emode==='text') return modelToQuick(state.model); return state.showLayout?state.code:stripLayout(state.code)+'\n'; }
function setEmode(md){
  flushEditorHist(); state.emode=md; LS.set('mab.emode',md);
  for(const b of document.querySelectorAll('#modeSeg [data-emode]')) b.setAttribute('aria-pressed',String(b.dataset.emode===md));
  $('#layoutToggle').parentElement.hidden=md!=='mermaid'; $('#formatBtn').hidden=md!=='mermaid'; $('#copyBtn').hidden=md==='ai';
  $('#ed').hidden=md==='ai'; $('#aiPane').hidden=md!=='ai'; if(md==='ai'){ $('#problems').hidden=true; if(typeof AI!=='undefined') AI.show(); } else if(typeof updStatus==='function') updStatus();
  ta.setAttribute('aria-label',md==='text'?'Board as simple text':'Mermaid code'); ta.placeholder=md==='text'?'Browser -> API -> Database\n\n# Ideas\n- First sticky note\n\nSuggestions appear as you type.\nCtrl+Space shows them anywhere.':'';
  acClose(); setEditorFromCode();
}
function setEditorFromCode(){
  if(state.emode==='text'&&state.textTyping) { paintEditor(); return; }
  const v=editorText();
  if(ta.value!==v){
    const st=ta.scrollTop,sl=ta.scrollLeft,ss=ta.selectionStart,se=ta.selectionEnd,focused=document.activeElement===ta;
    ta.value=v;
    if(focused) ta.setSelectionRange(Math.min(ss,v.length),Math.min(se,v.length));
    ta.scrollTop=st; ta.scrollLeft=sl;
  }
  paintEditor();
}
function paintEditor(){
  let html=highlight(ta.value);
  const gh=state.ghost; if(gh){ const L=html.split('\n'); if(L[gh.line]!=null){ L[gh.line]+='<span class="t-ghost">'+esc(gh.text)+'</span>'; html=L.join('\n'); } }
  hl.innerHTML=html+'\n ';
  const n=ta.value.split('\n').length; const bad=new Set(state.errors.map(e=>e.line));
  let g=''; for(let k=0;k<n;k++) g+='<span'+(bad.has(k)?' class="bad"':'')+'>'+(k+1)+'</span>';
  gutterIn.innerHTML=g; syncScroll();
}
function syncScroll(){ hl.style.transform='translate('+(-ta.scrollLeft)+'px,'+(-ta.scrollTop)+'px)'; gutterIn.style.transform='translateY('+(-ta.scrollTop)+'px)'; }
let parseT=0;
ta.addEventListener('input',e=>{
  const v=ta.value; const typedData=e&&e.inputType&&e.inputType.startsWith('insert')&&e.inputType!=='insertLineBreak'?e.data:null;
  if(state.emode==='text'){
    paintEditor(); state.textTyping=true;
    clearTimeout(parseT); parseT=setTimeout(()=>{ applyQuickText(ta.value); paintEditor(); },160);
    clearTimeout(H.timer); H.timer=setTimeout(()=>{ H.timer=0; state.textTyping=false; histPush(state.code); saveLocal(); },700);
    if(AC.open&&typedData!=null&&!acTrigger(typedData)) acClose();
    acUpdate(false); updateGhost(); acSchedule(typedData); return;
  }
  if(state.showLayout) state.code=v;
  else { const L=layoutPart(state.code); state.code=v.replace(/\s+$/,'')+(L.length?'\n\n'+L.join('\n'):'')+'\n'; }
  paintEditor();
  clearTimeout(parseT); parseT=setTimeout(()=>{ const prev=nodeIds(); reparse(); paintEditor(); render(); if(!state.errors.length) revealNew(prev); },90);
  clearTimeout(H.timer); H.timer=setTimeout(()=>{ H.timer=0; idleSyncLayout(); histPush(state.code); saveLocal(); },650);
  if(AC.open&&typedData!=null&&!acTrigger(typedData)) acClose();
  saveLocal(); acUpdate(false); updateGhost(); acSchedule(typedData);
});
ta.addEventListener('keyup',e=>{ if(/^(Arrow|Home|End|PageUp|PageDown)/.test(e.key)){ if(!AC.open){ updateGhost(); } } });
ta.addEventListener('blur',()=>{ clearTimeout(ACP.t); setTimeout(()=>{ if(document.activeElement!==ta){ acClose(); setGhost(null); } },150); if(state.emode==='text'&&state.textTyping){ clearTimeout(parseT); applyQuickText(ta.value); state.textTyping=false; flushEditorHist(); } });
ta.addEventListener('click',()=>{ acClose(); setGhost(null); });
$('#modeSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-emode]'); if(b&&b.dataset.emode!==state.emode) setEmode(b.dataset.emode); });
ta.addEventListener('scroll',()=>{ syncScroll(); acClose(); });
const acEl=$('#ac'); const AC={items:[],i:0,from:0,open:false};
const COMMON_TEXT=['Power Apps','Power Automate','Dataverse','Power BI','Copilot Studio','Power Pages','Function App','App Service','Azure SQL','Cosmos DB','Key Vault','Service Bus','Storage','API Management','Logic App','Entra ID','Event Grid','Front Door','App Insights','Azure OpenAI','User','Browser','Mobile app','Web app','API','Database','Cache','Queue'];
const MM_KEYWORDS=[['flowchart LR','header, left to right'],['flowchart TD','header, top down'],['subgraph group [Title]\n  \nend','frame','subgraph '.length],['end','close subgraph'],['direction TB','inside a subgraph'],['style id fill:#fff9b1','node color'],['classDef name fill:#fff9b1','class style'],['linkStyle 0 stroke-width:3px','line style']];
const MM_ARROWS=[['-->','arrow'],['-->|label|','arrow with label'],['-.->','dotted arrow'],['==>','thick arrow'],['---','line'],['<-->','both ways'],['--o','circle end'],['--x','cross end']];
const QT_ARROWS=[['->','arrow'],['<-','reverse arrow'],['<->','both ways'],['--','plain line'],['=>','thick arrow']];
let cwCache=0;
function charW(){ if(cwCache) return cwCache; const c=document.createElement('canvas').getContext('2d'); c.font='13px '+getComputedStyle(ta).fontFamily; cwCache=c.measureText('MMMMMMMMMM').width/10||7.8; return cwCache; }
/* Assist, timed like VS Code: the list opens as you type (editor.quickSuggestionsDelay, 10 ms),
   on word characters and on trigger characters (an arrow, a comma, "-" "<" "=").
   Enter accepts only when it changes the text ("smart"), so Enter at the end of a line is a new line.
   Esc hides it until you start another word. Ctrl+Space opens it anywhere, including empty lines. */
const ACP={delay:10,t:0,escFrom:-1};
function acPace(){}
function acClose(reason){
  if(AC.open&&reason==='esc') ACP.escFrom=AC.from;
  AC.open=false; AC.auto=false; AC.nav=false; acEl.hidden=true;
}
function acTrigger(data){
  if(data==null||data==='') return false;
  const ch=data.slice(-1);
  if(/[\p{L}\p{N}_\-<=>.|:,]/u.test(ch)) return true;
  if(ch===' '){ const v=ta.value,pos=ta.selectionStart; const before=v.slice(v.lastIndexOf('\n',pos-1)+1,pos);
    return state.emode==='mermaid'?/(-->|---|==>|-\.->|\|)\s*$/.test(before):(QA_END.test(before)||/,\s*$/.test(before)); }
  return false;
}
function acSchedule(data){
  clearTimeout(ACP.t);
  if(AC.open||!acTrigger(data)) return;
  ACP.t=setTimeout(()=>{
    if(document.activeElement!==ta||AC.open||ta.selectionStart!==ta.selectionEnd) return;
    const v=ta.value,pos=ta.selectionStart; const before=v.slice(v.lastIndexOf('\n',pos-1)+1,pos);
    if(!before.trim()) return;
    const r=assistCandidates(); if(!r||!r.items.length) return;
    if(r.from===ACP.escFrom) return; ACP.escFrom=-1;
    const typed=v.slice(r.from,pos).trim().toLowerCase();
    if(typed&&r.items.length===1&&r.items[0].insert.trim().toLowerCase()===typed) return;
    acShow(r,true);
  },ACP.delay);
}
function acShow(r,auto){ AC.items=r.items.slice(0,8); AC.from=r.from; AC.i=0; AC.open=true; AC.auto=!!auto; AC.nav=false; AC.chain=r.chain; setGhost(null); acRender(); }
const QA_END=/(<->|<=>|-->|->|<-|--|=>|→|←|↔|⇒)\s*$/;
const QA_ANY=/(<->|<=>|-->|->|<-|--|=>|→|←|↔|⇒)/;
function boardLabels(exclude){ const out=[]; if(!state.model) return out; const ex=String(exclude||'').trim().toLowerCase(); for(const n of state.model.nodes.values()) if(n.shape!=='sticky'&&n.label.trim()&&n.label.toLowerCase()!==ex&&!out.some(o=>o.label===n.label)) out.push(n); return out; }
function targetItems(pos,exclude){
  const out=[]; const seen=new Set();
  for(const n of boardLabels(exclude)){ const ic=n.icon&&iconFor(n.icon); seen.add(n.label.toLowerCase()); out.push({label:n.label,hint:'on the board',img:ic&&ic.uri,k:'#',insert:n.label}); if(out.length>=5) break; }
  if(state.emode==='text'&&state.model){ let k=0; const exf=String(exclude||'').trim().toLowerCase(); for(const g of state.model.groups.values()){ const l=g.label.trim(); if(!l||seen.has(l.toLowerCase())||l.toLowerCase()===exf) continue; seen.add(l.toLowerCase()); out.push({label:l,hint:'frame',k:'▢',insert:l}); if(++k>=3) break; } }
  const exl=String(exclude||'').trim().toLowerCase();
  for(const name of COMMON_TEXT){ if(out.length>=8) break; if(seen.has(name.toLowerCase())||name.toLowerCase()===exl) continue; const k=iconMatch(name); const ic=k&&Icons.byKey.get(k); out.push({label:name,hint:ic?iconHint(ic):'new box',img:ic&&ic.uri,k:'□',insert:name}); }
  return {from:pos,items:out};
}
function assistCandidates(){
  const v=ta.value,pos=ta.selectionStart; if(pos!==ta.selectionEnd) return null;
  const ls=v.lastIndexOf('\n',pos-1)+1; const before=v.slice(ls,pos); const after=v.slice(pos,(v.indexOf('\n',pos)+1||v.length+1)-1);
  if(after.trim()) return null;
  const pad=/\s$/.test(before)||!before?'':' ';
  if(state.emode==='mermaid'){
    if(!before.trim()){ const out=MM_KEYWORDS.slice(2,4).map(([kw,h,cur])=>({label:kw.split('\n')[0],hint:h,k:'≡',insert:kw,caret:cur}));
      for(const name of ['Power Apps','Dataverse','Power Automate','Function App','Key Vault','Azure SQL']){ const k=iconMatch(name),ic=k&&Icons.byKey.get(k); if(!ic) continue; const id=idFrom(name,x=>!!(state.model&&(state.model.nodes.has(x)||state.model.groups.has(x)))); out.push({label:name,hint:'node with icon',img:ic.uri,insert:id+'@{ icon: "'+ic.key+'", label: "'+name+'" }'}); }
      return {from:pos,items:out}; }
    if(/-->\s*$|---\s*$|==>\s*$|-\.->\s*$|\|\s*$/.test(before)&&state.model) return {from:pos,items:state.model.nodeOrder.slice(0,8).map(id=>({label:id,hint:state.model.nodes.get(id).label,k:'#',insert:id}))};
    if(/[\w\]\)\}]\s+$/.test(before)&&!/(-->|---|==>|-\.->)/.test(before)) return {from:pos,items:MM_ARROWS.map(([a,h])=>({label:a,hint:h,k:'→',insert:a+' '})),chain:true};
    return acCandidates(true);
  }
  const t=before.trim();
  if(/^(#|%%|\/\/|direction\b)/.test(t)||/^([-*•+]|\d+[.)])\s/.test(t)||/[{}]\s*$/.test(t)) return null;
  if(!t){
    const out=[
      {label:'Frame',hint:'Name { … } groups boxes',k:'▢',insert:'Frame {\n  \n}',sel:[0,5]},
      {label:'Sticky notes',hint:'# Heading, then - items',k:'#',insert:'# Ideas\n- ',sel:[2,7]},
      {label:'Direction',hint:'direction: down',k:'≡',insert:'direction: down',sel:[11,15]}];
    const tg=targetItems(pos,'').items.slice(0,5).map(o=>({...o,hint:o.hint==='on the board'?'connect from this':o.hint})); return {from:pos,items:[...tg,...out]};
  }
  if(QA_END.test(before)||/,\s*$/.test(before)){ const parts=before.replace(QA_END,'').replace(/,\s*$/,'').split(QA_ANY); const src=(parts[parts.length-1]||'').split(',').pop().trim(); return targetItems(pos,src); }
  const endsWord=/[^\s:,]$/.test(before);
  if(endsWord) return acCandidates(true);
  if(!QA_ANY.test(before)&&!before.includes(':')) return {from:pos,chain:true,items:[
    {label:'->',hint:'connect to…',k:'→',insert:pad+'-> '},{label:'<->',hint:'both ways',k:'↔',insert:pad+'<-> '},
    {label:'--',hint:'plain line',k:'—',insert:pad+'-- '},{label:'=>',hint:'thick arrow',k:'⇒',insert:pad+'=> '},
    {label:'{',hint:'make it a frame',k:'▢',insert:pad+'{\n  \n}',caret:pad.length+4}]};
  if(QA_ANY.test(before)&&!before.includes(':')) return {from:pos,items:[
    {label:': label',hint:'name the arrow',k:':',insert:': ',noTrim:true},
    {label:'-> next',hint:'continue the chain',k:'→',insert:'-> ',chainNext:true},
    {label:', another',hint:'one more target',k:',',insert:', ',chainNext:true}]};
  return null;
}
/* ghost text: the rest of the best match, shown after the caret, Tab or → to take it */
function setGhost(g){ const prev=state.ghost; state.ghost=g; if((prev&&prev.text)!==(g&&g.text)||(prev&&prev.line)!==(g&&g.line)) paintEditor(); }
function updateGhost(){
  if(AC.open){ setGhost(null); return; }
  const v=ta.value,pos=ta.selectionStart; if(pos!==ta.selectionEnd||document.activeElement!==ta){ setGhost(null); return; }
  const eol=(v.indexOf('\n',pos)+1||v.length+1)-1; if(v.slice(pos,eol).trim()){ setGhost(null); return; }
  const r=acCandidates(false); if(!r||!r.items.length){ setGhost(null); return; }
  const typed=v.slice(r.from,pos); if(typed.length<2){ setGhost(null); return; }
  const it=r.items.find(x=>!x.insert.includes('\n')&&x.insert.toLowerCase().startsWith(typed.toLowerCase())&&x.insert.length>typed.length);
  if(!it){ setGhost(null); return; }
  setGhost({line:v.slice(0,pos).split('\n').length-1,text:it.insert.slice(typed.length),full:it.insert,from:r.from});
}
function acceptGhost(){ const g=state.ghost; if(!g) return false; const pos=ta.selectionStart; ta.setRangeText(g.full,g.from,pos,'end'); setGhost(null); ta.dispatchEvent(new Event('input')); return true; }
function iconHint(ic){ return ic.pack==='pp'?'Power Platform':ic.pack==='d365'?'Dynamics 365':'Azure · '+ic.cat; }
function acMatch(name,lw){ const t=String(name).toLowerCase(); if(t.startsWith(lw)||t.replace(/[\s-]+/g,'').startsWith(lw.replace(/[\s-]+/g,''))) return 0; if(t.split(/[\s-]+/).some(x=>x.startsWith(lw))) return 1; return -1; }
function acCandidates(force){
  const v=ta.value,pos=ta.selectionStart; if(pos!==ta.selectionEnd) return null;
  const ls=v.lastIndexOf('\n',pos-1)+1; const before=v.slice(ls,pos); const after=v.slice(pos,(v.indexOf('\n',pos)+1||v.length+1)-1);
  if(/\S/.test(after.slice(0,1))&&!force) return null;
  const out=[];
  if(state.emode==='mermaid'){
    let mm;
    if((mm=/icon:\s*"([^"]*)$/.exec(before))){ const pfx=mm[1].toLowerCase(); for(const ic of Icons.byKey.values()){ if(ic.key.includes(pfx)||ic.title.toLowerCase().includes(pfx)) out.push({label:ic.key,hint:ic.title,img:ic.uri,insert:ic.key,score:ic.key.startsWith(pfx)||ic.id.startsWith(pfx)?0:1}); } out.sort((a,b)=>a.score-b.score); return {from:pos-mm[1].length,items:out.slice(0,40)}; }
    if((mm=/(?:^|\s)([-=.<>|ox]{1,4})$/.exec(before))&&/\S/.test(before.slice(0,before.length-mm[1].length))){ for(const [a,h] of MM_ARROWS) if(a.startsWith(mm[1])) out.push({label:a,hint:h,k:'→',insert:a+' '}); return out.length?{from:pos-mm[1].length,items:out}:null; }
    mm=/([A-Za-z][\w-]*)$/.exec(before); if(!mm) return null; const w=mm[1]; if(w.length<2&&!force) return null; const lw=w.toLowerCase(); const atStart=!before.slice(0,before.length-w.length).trim();
    if(atStart) for(const [kw,h,cur] of MM_KEYWORDS) if(kw.toLowerCase().startsWith(lw)&&kw.toLowerCase()!==lw) out.push({label:kw.split('\n')[0],hint:h,k:'≡',insert:kw,caret:cur});
    if(state.model) for(const id of state.model.nodeOrder) if(id.toLowerCase().startsWith(lw)&&id!==w) out.push({label:id,hint:'node · '+state.model.nodes.get(id).label,k:'#',insert:id});
    const seen=new Set(out.map(o=>o.label));
    const addIcon=(ic,nm)=>{ if(!ic||seen.has(ic.key)) return; seen.add(ic.key); const lbl=nm||ic.title; const id=idFrom(lbl,x=>!!(state.model&&(state.model.nodes.has(x)||state.model.groups.has(x)))); out.push({label:lbl,hint:iconHint(ic),img:ic.uri,insert:id+'@{ icon: "'+ic.key+'", label: "'+lbl+'" }'}); };
    for(const name of COMMON_TEXT){ if(acMatch(name,lw)===0){ const k=iconMatch(name); if(k) addIcon(Icons.byKey.get(k),name); } }
    if(lw.length>=2){ const pool=[...Icons.byKey.values()].map(ic=>[acMatch(ic.title,lw),ic]).filter(x=>x[0]>=0).sort((a,b)=>a[0]-b[0]); for(const [,ic] of pool){ if(out.length>40) break; addIcon(ic); } }
    return out.length?{from:pos-w.length,items:out}:null;
  }
  // text mode
  if(/^\s*([-*•+]|\d+[.)])\s/.test(before)) return null;
  let mm;
  if((mm=/\.shape:\s*(\w*)$/.exec(before))){ for(const k of Object.keys(D2_SHAPES)) if(k.startsWith(mm[1])) out.push({label:k,hint:'shape',k:'◇',insert:k}); return out.length?{from:pos-mm[1].length,items:out}:null; }
  if((mm=/^\s*(dir\w*)$/.exec(before))){ for(const d of ['right','down','left','up']) out.push({label:'direction: '+d,hint:'layout',k:'≡',insert:'direction: '+d}); return {from:pos-mm[1].length,items:out}; }
  if((mm=/\S\s+([-<=]{1,3})$/.exec(before))){ for(const [a,h] of QT_ARROWS) if(a.startsWith(mm[1])) out.push({label:a,hint:h,k:'→',insert:a+' '}); return out.length?{from:pos-mm[1].length,items:out}:null; }
  const seg=before.split(/<->|<=>|-->|->|<-|--|=>|→|←|↔|⇒|,|\{|:/).pop(); const lead=/^\s*/.exec(seg)[0].length; const word=seg.slice(lead); if(word.length<1&&!force) return null; if(word.length<2&&!force) return null;
  if(before.slice(0,before.length-seg.length).trim().endsWith(':')) return null;
  const lw=word.toLowerCase(); const seen=new Set();
  const push=(label,hint,img,k)=>{ const key=label.toLowerCase(); if(seen.has(key)||key===lw) return; seen.add(key); out.push({label,hint,img,k,insert:label}); };
  if(state.model) for(const n of state.model.nodes.values()) if(n.shape!=='sticky'&&acMatch(n.label,lw)===0){ const ic=n.icon&&iconFor(n.icon); push(n.label,'on board',ic&&ic.uri,'#'); }
  for(const name of COMMON_TEXT) if(acMatch(name,lw)===0){ const k=iconMatch(name); const ic=k&&Icons.byKey.get(k); push(name,ic?iconHint(ic):'box',ic&&ic.uri,'□'); }
  if(lw.length>=2){ const pool=[...Icons.byKey.values()].map(ic=>[acMatch(ic.title,lw),ic]).filter(x=>x[0]>=0).sort((a,b)=>a[0]-b[0]); for(const [,ic] of pool){ if(out.length>40) break; push(ic.title,iconHint(ic),ic.uri); } }
  return out.length?{from:pos-word.length,items:out}:null;
}
function acUpdate(force){
  if(force){ const r=assistCandidates()||acCandidates(true); if(r&&r.items.length) acShow(r,false); else acClose(); return; }
  if(!AC.open) return;
  const r=assistCandidates(); if(!r||!r.items.length){ acClose('ignore'); return; }
  const keepNav=AC.nav; acShow(r,AC.auto); AC.nav=keepNav&&false;
}
function acRender(){
  acEl.innerHTML=AC.items.map((it,i)=>'<button type="button" role="option" data-ac="'+i+'" aria-selected="'+(i===AC.i)+'">'+(it.img?'<img src="'+it.img+'" alt="">':'<span class="k">'+(it.k||'·')+'</span>')+'<span class="t">'+esc(it.label)+'</span><small>'+esc(it.hint||'')+'</small></button>').join('')+'<div class="foot">'+'Tab or Enter to insert · ↑↓ to choose · Esc to hide'+'</div>';
  acEl.hidden=false;
  const v=ta.value,pos=AC.from; const ls=v.lastIndexOf('\n',pos-1)+1; const line=v.slice(0,pos).split('\n').length-1; const col=pos-ls;
  const cw=charW(); const host=ta.parentElement.getBoundingClientRect();
  let left=14+col*cw-ta.scrollLeft, top=12+(line+1)*20-ta.scrollTop+2;
  const w=acEl.offsetWidth,h=acEl.offsetHeight;
  if(left+w>host.width-8) left=Math.max(8,host.width-w-8);
  if(top+h>host.height-8) top=Math.max(8,top-h-24);
  acEl.style.left=left+'px'; acEl.style.top=top+'px';
}
function acAccept(i){
  const it=AC.items[i]; if(!it) return; const pos=ta.selectionStart; const wasAuto=AC.auto; const chain=AC.chain||it.chainNext||/(->|<-|<->|--|=>|-->|---|==>|-\.->|--o|--x|-->\|label\|)\s$/.test(it.insert);
  let from=AC.from; if(it.insert.startsWith(' ')&&/\s$/.test(ta.value.slice(0,from))) it.insert=it.insert.trimStart();
  if(/^(->|<-|<->|--|=>|, )/.test(it.insert)&&!/\s$/.test(ta.value.slice(0,from))&&!it.noTrim&&it.insert[0]!==',') it.insert=' '+it.insert;
  ta.setSelectionRange(from,pos); ta.setRangeText(it.insert,from,pos,'end');
  if(it.sel){ ta.setSelectionRange(from+it.sel[0],from+it.sel[1]); }
  else if(it.caret!=null){ const c=from+it.caret; const nl=it.insert.indexOf('\n'); ta.setSelectionRange(c,c+(state.emode==='mermaid'&&nl>it.caret?'group'.length:0)); }
  if(wasAuto) acPace(-500);
  AC.open=false; AC.auto=false; acEl.hidden=true; ta.dispatchEvent(new Event('input')); ta.focus();
  if(chain&&!it.sel&&it.caret==null){ const r=assistCandidates(); if(r&&r.items.length) acShow(r,wasAuto); }
}
acEl.addEventListener('mousedown',e=>{ e.preventDefault(); const b=e.target.closest('[data-ac]'); if(b) acAccept(+b.dataset.ac); });
ta.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key===' '){ e.preventDefault(); e.stopImmediatePropagation(); acUpdate(true); return; }
  if(!AC.open){
    if(state.ghost&&(e.key==='Tab'&&!e.shiftKey||e.key==='ArrowRight'&&ta.selectionStart===ta.value.length||e.key==='ArrowRight'&&ta.value[ta.selectionStart]==='\n')){ e.preventDefault(); e.stopImmediatePropagation(); acceptGhost(); return; }
    if(state.ghost&&e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); setGhost(null); return; }
    return;
  }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); e.stopImmediatePropagation(); AC.nav=true; AC.i=(AC.i+(e.key==='ArrowDown'?1:AC.items.length-1))%AC.items.length; acRender(); return; }
  if(e.key==='Enter'&&!AC.nav&&AC.auto){
    // Smart Enter: take the suggestion only if it changes what you typed; otherwise it is a new line.
    const typed=ta.value.slice(AC.from,ta.selectionStart).trim().toLowerCase();
    const same=!typed||AC.items.some(it=>it.insert.trim().toLowerCase()===typed||it.label.trim().toLowerCase()===typed);
    if(same){ acClose(); return; }
  }
  if(e.key==='Tab'||e.key==='Enter'){ e.preventDefault(); e.stopImmediatePropagation(); acAccept(AC.i); return; }
  if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); acClose('esc'); updateGhost(); return; }
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='Home'||e.key==='End') acClose();
},true);
ta.addEventListener('beforeinput',e=>{ if(e.inputType==='historyUndo'){ e.preventDefault(); undo(); } else if(e.inputType==='historyRedo'){ e.preventDefault(); redo(); } });
ta.addEventListener('keydown',e=>{
  if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey){
    e.preventDefault();
    const s=ta.selectionStart,en=ta.selectionEnd,v=ta.value;
    if(s!==en&&v.slice(s,en).includes('\n')){
      const ls=v.lastIndexOf('\n',s-1)+1; const block=v.slice(ls,en);
      const nb=e.shiftKey?block.replace(/^ {1,2}/gm,''):block.replace(/^/gm,'  ');
      ta.setRangeText(nb,ls,en,'select');
    } else if(e.shiftKey){
      const ls=v.lastIndexOf('\n',s-1)+1; const rm=v.startsWith('  ',ls)?2:v.startsWith(' ',ls)?1:0;
      if(rm){ ta.setRangeText('',ls,ls+rm,'end'); }
    } else ta.setRangeText('  ',s,en,'end');
    ta.dispatchEvent(new Event('input'));
  } else if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    e.preventDefault();
    const s=ta.selectionStart,v=ta.value; const ls=v.lastIndexOf('\n',s-1)+1;
    let ind=/^\s*/.exec(v.slice(ls,s))[0];
    const prev=v.slice(ls,s).trim();
    if(/^subgraph\b/.test(prev)||/^(flowchart|graph)\b/.test(prev)) ind+='  ';
    ta.setRangeText('\n'+ind,s,ta.selectionEnd,'end');
    ta.dispatchEvent(new Event('input'));
  }
});
function updStatus(){
  const st=$('#status'),pr=$('#problems');
  if(state.errors.length){
    st.hidden=false; st.className='chip err'; st.textContent=state.errors.length+(state.errors.length===1?' issue':' issues');
    pr.hidden=false;
    pr.innerHTML=state.errors.slice(0,8).map(e=>'<button type="button" data-line="'+e.line+'"><b>Line '+(e.line+1)+'</b><span>'+esc(e.msg)+'</span></button>').join('');
  } else { st.hidden=true; st.textContent=''; pr.hidden=true; pr.innerHTML=''; }
}
$('#problems').addEventListener('click',e=>{
  const b=e.target.closest('[data-line]'); if(!b) return;
  const line=+b.dataset.line; const lines=ta.value.split('\n'); let pos=0;
  for(let k=0;k<line&&k<lines.length;k++) pos+=lines[k].length+1;
  ta.focus(); ta.setSelectionRange(pos,pos+(lines[line]||'').length); ta.scrollTop=Math.max(0,line*20-60);
});
$('#layoutToggle').checked=state.showLayout;
$('#layoutToggle').addEventListener('change',e=>{ flushEditorHist(); state.showLayout=e.target.checked; LS.set('mab.showLayout',state.showLayout); if(!state.showLayout&&state.model&&!state.errors.length) state.code=replaceLayout(state.code,state.model); setEditorFromCode(); });
$('#formatBtn').addEventListener('click',()=>{ if(!state.model||state.fatal){toast('Fix the errors before formatting');return;} commitCode(serializeMermaid(state.model)); toast('Code formatted'); });
$('#copyBtn').addEventListener('click',()=>state.emode==='text'?copyText(ta.value,'Text copied'):copyText(state.code,'Mermaid code copied'));

function copyText(text,msg){
  const fallback=()=>openModal('Copy Mermaid code','<p>Your browser blocked the clipboard here. Select the text below and copy it.</p><textarea readonly id="mText">'+esc(text)+'</textarea>',[]);
  try{ const p=navigator.clipboard&&navigator.clipboard.writeText(text); if(p) p.then(()=>toast(msg),()=>{fallback();setTimeout(()=>{const t=$('#mText');if(t){t.focus();t.select();}},30);}); else fallback(); }
  catch(e){ fallback(); }
}
