/* orim · rich-edit.js
 * Editors for tables and documents. Both sit over the shape on the board, at the board's zoom,
 * and write back to the model as you type so connectors follow. One undo step per edit session.
 */
'use strict';
const Rich=(()=>{
  let cur=null;
  const CELL_COLORS=[['', 'No colour'],['g','Green'],['a','Amber'],['r','Red']];
  const escH=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function open(id,at,fresh){
    const m=state.model; const n=m&&m.nodes.get(id); if(!n||(n.shape!=='table'&&n.shape!=='doc')) return false;
    if(cur) close(true);
    if(state.editing) closeEditor(true);
    if(typeof flushEditorHist==='function') flushEditorHist();
    const box=document.createElement('div'); box.className='rich-box '+(n.shape==='table'?'rt':'rd');
    const bar=document.createElement('div'); bar.className='rich-bar island ctx';
    boardPane.appendChild(box); boardPane.appendChild(bar);
    cur={id,kind:n.shape,box,bar,orig:{label:n.label,table:n.table&&JSON.parse(JSON.stringify(n.table)),doc:n.doc&&JSON.parse(JSON.stringify(n.doc)),w:n.w,h:n.h,sized:n.sized},expanded:false};
    state.richId=id;
    if(n.shape==='table') tableOpen(n,at,fresh); else docOpen(n,at);
    box.addEventListener('keydown',e=>e.stopPropagation()); bar.addEventListener('keydown',e=>e.stopPropagation());
    for(const el of [box,bar]){ el.addEventListener('pointerdown',e=>e.stopPropagation()); el.addEventListener('wheel',e=>{ if(cur&&cur.expanded) e.stopPropagation(); },{passive:true}); el.addEventListener('dblclick',e=>e.stopPropagation()); }
    document.addEventListener('pointerdown',outside,true);
    state.sel=new Set(['n:'+id]); selChanged();
    render(); place();
    return true;
  }
  function outside(e){ if(!cur) return; if(cur.box.contains(e.target)||cur.bar.contains(e.target)) return; close(true); }
  function node(){ return cur&&state.model&&state.model.nodes.get(cur.id); }
  // Live: write the working copy into the model without a history step.
  function live(){
    const n=node(); if(!n) return;
    const cx=n.x, cy=n.y; if(cur.kind==='table'){ n.table={rows:cur.rows.map(r=>r.slice()),colors:{...cur.colors}}; n.label=cur.title.value; }
    else { n.doc=readDoc(); n.label=cur.title.value; }
    sizeNode(n); n.x=cx; n.y=cy; state.cache.set(n.id,{x:n.x,y:n.y});
    if(cur.kind==='table') syncCols(n);
    render();
  }
  function close(commit){
    if(!cur) return; const c=cur; cur=null; state.richId=null;
    document.removeEventListener('pointerdown',outside,true);
    const n=state.model&&state.model.nodes.get(c.id);
    let next=null;
    if(n){ next=c.kind==='table'?{label:c.title.value.trim(),table:cleanTable({rows:c.rows,colors:c.colors})}:{label:c.title.value.trim(),doc:cleanDoc({...readDocFrom(c.body),kind:c.tkind,fields:c.fields})};
      Object.assign(n,{label:c.orig.label,table:c.orig.table,doc:c.orig.doc,w:c.orig.w,h:c.orig.h,sized:c.orig.sized}); sizeNode(n); }
    c.box.remove(); c.bar.remove();
    const changed=n&&commit&&(next.label!==c.orig.label||JSON.stringify(c.kind==='table'?next.table:next.doc)!==JSON.stringify(c.kind==='table'?c.orig.table:c.orig.doc));
    if(changed){
      mutate(mm=>{ const x=mm.nodes.get(c.id); if(!x) return; x.label=next.label; if(c.kind==='table'){ x.table=next.table;
          // Connectors on rows follow their row when rows move, and lose the row when it is deleted.
          for(const e of mm.edges) for(const [k,s,end] of [['ra','sa',e.from],['rb','sb',e.to]]){ if(end!==c.id||e[k]==null) continue; const ni=c.rowMap.indexOf(e[k]); if(ni<0){ delete e[k]; delete e[s]; } else e[k]=ni; } }
        else x.doc=next.doc; });
    } else render();
  }
  function place(){
    if(!cur) return; const n=node(); if(!n){ close(false); return; }
    const z=state.view.z, s=toScreen({x:n.x,y:n.y}), box=cur.box, bar=cur.bar;
    if(cur.expanded){ box.style.transform=''; box.style.left=''; box.style.top=''; }
    else { box.style.transform='scale('+z+')'; box.style.left=s.x+'px'; box.style.top=s.y+'px'; }
    const br=box.getBoundingClientRect(), pr=boardPane.getBoundingClientRect();
    const bw=bar.offsetWidth||300; let x=br.left-pr.left, y=br.top-pr.top-bar.offsetHeight-10;
    if(y<8) y=Math.min(pr.height-bar.offsetHeight-8,br.bottom-pr.top+10);
    x=Math.max(8,Math.min(pr.width-bw-8,x)); bar.style.left=x+'px'; bar.style.top=Math.max(8,y)+'px';
  }
  function btn(act,label,icon,extra){ return '<button type="button" class="'+(icon?'ibtn':'btn')+'" data-act="'+act+'" title="'+label+'" aria-label="'+label+'"'+(extra||'')+'>'+(icon?ico(icon):label)+'</button>'; }

  /* ---------- tables ---------- */
  function tableOpen(n,at,fresh){
    cur.rows=n.table.rows.map(r=>r.slice()); cur.colors={...n.table.colors}; cur.rowMap=cur.rows.map((_,i)=>i);
    let r0=1,c0=1; if(at&&!(at.x>=n.x&&at.x<=n.x+n.w&&at.y>=n.y&&at.y<=n.y+n.h)) at=null; if(at){ const L=n._tl||tableLayout(n); if(at.y>=n.y+L.top){ r0=rowAt(n,at.y); let x=n.x; c0=L.cols.length-1; for(let i=0;i<L.cols.length;i++){ if(at.x<x+L.cols[i]){ c0=i; break; } x+=L.cols[i]; } } else r0=-1; }
    cur.act={r:Math.min(r0,cur.rows.length-1),c:Math.min(c0,cur.rows[0].length-1)};
    cur.box.innerHTML='<input class="rich-title" placeholder="Table title" aria-label="Table title"><table class="rt-table"><colgroup></colgroup><tbody></tbody></table>';
    cur.title=cur.box.querySelector('.rich-title'); cur.title.value=n.label||'';
    cur.title.addEventListener('input',()=>{ live(); place(); });
    cur.title.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key==='Tab'&&!e.shiftKey){ e.preventDefault(); focusCell(0,0); } else if(e.key==='Escape'){ e.preventDefault(); close(true); } });
    cur.bar.innerHTML=btn('rowAdd','Add row','rowAdd')+btn('colAdd','Add column','colAdd')+'<span class="vsep"></span>'+btn('rowDel','Delete row','rowDel')+btn('colDel','Delete column','colDel')+'<span class="vsep"></span>'+
      CELL_COLORS.map(([k,l])=>'<button type="button" class="ibtn" data-act="tint" data-tint="'+k+'" title="'+l+'" aria-label="Cell colour: '+l+'"><span class="tint-dot'+(k?' t-'+k:'')+'"></span></button>').join('')+
      '<span class="vsep"></span>'+btn('done','Done');
    cur.bar.addEventListener('mousedown',e=>{ if(e.target.closest('button')) e.preventDefault(); });
    cur.bar.addEventListener('click',e=>{ const b=e.target.closest('[data-act]'); if(!b||!cur) return; tableAct(b.dataset.act,b.dataset.tint); });
    build();
    if(fresh) focusCell(0,Math.min(1,cur.rows[0].length-1),true); else if(cur.act.r<0) setTimeout(()=>{ cur&&cur.title.focus(); },0); else focusCell(cur.act.r,cur.act.c);
  }
  function build(){
    const tb=cur.box.querySelector('tbody'); const nc=cur.rows[0].length;
    tb.innerHTML=cur.rows.map((r,ri)=>'<tr>'+r.map((v,ci)=>'<td contenteditable="true" spellcheck="false" data-r="'+ri+'" data-c="'+ci+'" class="'+(ri===0?'hd ':'')+(ci===0?'fc ':'')+(cur.colors[ri+','+ci]?'t-'+cur.colors[ri+','+ci]:'')+'">'+escH(v).replace(/\n/g,'<br>')+'</td>').join('')+'</tr>').join('');
    cur.box.querySelector('colgroup').innerHTML='<col>'.repeat(nc);
    for(const td of tb.querySelectorAll('td')){
      td.addEventListener('focus',()=>{ cur.act={r:+td.dataset.r,c:+td.dataset.c}; markAct(); });
      td.addEventListener('input',()=>{ cur.rows[+td.dataset.r][+td.dataset.c]=cellText(td); live(); place(); });
      td.addEventListener('keydown',cellKey);
      td.addEventListener('paste',e=>{ e.preventDefault(); const t=(e.clipboardData||window.clipboardData).getData('text/plain'); pasteCells(+td.dataset.r,+td.dataset.c,t); });
    }
    live(); markAct();
  }
  function cellText(td){ return td.innerText.replace(/ /g,' ').replace(/\n$/,''); }
  function markAct(){ if(!cur||cur.kind!=='table') return; for(const td of cur.box.querySelectorAll('td')) td.classList.toggle('act',+td.dataset.r===cur.act.r&&+td.dataset.c===cur.act.c);
    const t=cur.colors[cur.act.r+','+cur.act.c]||''; for(const b of cur.bar.querySelectorAll('[data-tint]')) b.setAttribute('aria-pressed',String(b.dataset.tint===t)); }
  function syncCols(n){ const L=n._tl||tableLayout(n); const cols=cur.box.querySelectorAll('col'); L.cols.forEach((w,i)=>{ if(cols[i]) cols[i].style.width=w+'px'; }); cur.box.style.width=n.w+'px'; cur.box.querySelector('table').style.width=n.w+'px';
    const trs=cur.box.querySelectorAll('tr'); L.rows.forEach((h,i)=>{ if(trs[i]) trs[i].style.height=h+'px'; }); }
  function focusCell(r,c,all){ if(!cur) return; const td=cur.box.querySelector('td[data-r="'+r+'"][data-c="'+c+'"]'); if(!td) return; td.focus({preventScroll:true});
    const s=getSelection(), rg=document.createRange(); rg.selectNodeContents(td); if(!all) rg.collapse(false); s.removeAllRanges(); s.addRange(rg); }
  function cellKey(e){
    const r=cur.act.r,c=cur.act.c, R=cur.rows.length, C=cur.rows[0].length;
    if(e.key==='Escape'){ e.preventDefault(); close(true); return; }
    if(e.key==='Tab'){ e.preventDefault(); if(e.shiftKey){ if(c>0) focusCell(r,c-1,true); else if(r>0) focusCell(r-1,C-1,true); else cur.title.focus(); return; }
      if(c<C-1) focusCell(r,c+1,true); else if(r<R-1) focusCell(r+1,0,true); else { addRow(R); focusCell(R,0); } return; }
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); if(r<R-1) focusCell(r+1,c); else { addRow(R); focusCell(R,c); } return; }
    if(e.key==='ArrowUp'&&r>0&&atEdge(e.target,true)){ e.preventDefault(); focusCell(r-1,c); }
    if(e.key==='ArrowDown'&&r<R-1&&atEdge(e.target,false)){ e.preventDefault(); focusCell(r+1,c); }
  }
  function atEdge(td,top){ const s=getSelection(); if(!s.rangeCount) return true; const rr=s.getRangeAt(0).getBoundingClientRect(), tr=td.getBoundingClientRect(); if(!rr.height) return true; return top?rr.top-tr.top<rr.height+4:tr.bottom-rr.bottom<rr.height+4; }
  function addRow(at){ const nc=cur.rows[0].length; cur.rows.splice(at,0,Array(nc).fill('')); cur.rowMap.splice(at,0,null); shiftColors((r,c)=>[r>=at?r+1:r,c]); build(); }
  function addCol(at){ cur.rows.forEach(r=>r.splice(at,0,'')); shiftColors((r,c)=>[r,c>=at?c+1:c]); build(); }
  function shiftColors(f){ const o={}; for(const [k,v] of Object.entries(cur.colors)){ const [r,c]=k.split(',').map(Number); const p=f(r,c); if(p) o[p[0]+','+p[1]]=v; } cur.colors=o; }
  function tableAct(a,tint){
    const {r,c}=cur.act;
    if(a==='done'){ close(true); return; }
    if(a==='rowAdd'){ const at=Math.max(1,r+1); addRow(at); focusCell(at,Math.max(0,c)); return; }
    if(a==='colAdd'){ const at=c+1; addCol(at); focusCell(Math.max(0,r),at); return; }
    if(a==='rowDel'){ if(cur.rows.length<=1){ toast('A table needs at least one row'); return; } cur.rows.splice(r,1); cur.rowMap.splice(r,1); shiftColors((rr,cc)=>rr===r?null:[rr>r?rr-1:rr,cc]); build(); focusCell(Math.min(r,cur.rows.length-1),c); return; }
    if(a==='colDel'){ if(cur.rows[0].length<=1){ toast('A table needs at least one column'); return; } cur.rows.forEach(x=>x.splice(c,1)); shiftColors((rr,cc)=>cc===c?null:[rr,cc>c?cc-1:cc]); build(); focusCell(r,Math.min(c,cur.rows[0].length-1)); return; }
    if(a==='tint'){ if(r<0) return; const k=r+','+c; if(tint) cur.colors[k]=tint; else delete cur.colors[k];
      const td=cur.box.querySelector('td[data-r="'+r+'"][data-c="'+c+'"]'); if(td){ td.classList.remove('t-g','t-a','t-r'); if(tint) td.classList.add('t-'+tint); } live(); markAct(); focusCell(r,c); }
  }
  // Pasting rows from a spreadsheet fills cells from the caret and adds rows or columns as needed.
  function pasteCells(r,c,t){
    const lines=t.replace(/\r/g,'').replace(/\n$/,'').split('\n'); const grid=parseGrid(t)||lines.map(l=>l.split('\t'));
    if(grid.length===1&&grid[0].length===1){ document.execCommand('insertText',false,t); return; }
    const needC=c+Math.max(...grid.map(g=>g.length)); while(cur.rows[0].length<needC) cur.rows.forEach(x=>x.push(''));
    while(cur.rows.length<r+grid.length){ cur.rows.push(Array(cur.rows[0].length).fill('')); cur.rowMap.push(null); }
    grid.forEach((g,i)=>g.forEach((v,j)=>{ cur.rows[r+i][c+j]=v.trim(); })); build(); focusCell(r,c);
  }

  /* ---------- documents ---------- */
  const BLK={h1:'h1',h2:'h2',h3:'h3',p:'p',quote:'blockquote'};
  // In the editor: lists are UL/OL, checklists UL.todo with data-c on ticked items, code is PRE, quotes BLOCKQUOTE, dividers HR.
  const listKind=el=>el.tagName==='OL'?'ol':el.classList.contains('todo')?'todo':'ul';
  function docHtml(doc){
    let h='', list=null;
    const runs=rs=>rs.map(r=>{ let s=escH(r.x).replace(/\n/g,'<br>'); if(r.i) s='<i>'+s+'</i>'; if(r.b) s='<b>'+s+'</b>'; if(r.u) s='<a href="'+escH(r.u)+'">'+s+'</a>'; return s; }).join('')||'<br>';
    const open=t=>t==='ol'?'<ol>':t==='todo'?'<ul class="todo">':'<ul>', shut=t=>t==='ol'?'</ol>':'</ul>';
    for(const b of doc.blocks){
      if(b.t==='ul'||b.t==='ol'||b.t==='todo'){ if(list!==b.t){ if(list) h+=shut(list); h+=open(b.t); list=b.t; } h+='<li'+(b.t==='todo'&&b.c?' data-c="1"':'')+'>'+runs(b.r)+'</li>'; continue; }
      if(list){ h+=shut(list); list=null; }
      if(b.t==='hr'){ h+='<hr contenteditable="false">'; continue; }
      if(b.t==='code'){ h+='<pre'+(b.lang?' data-lang="'+escH(b.lang)+'"':'')+'>'+(escH((b.r[0]&&b.r[0].x)||'')||'<br>')+'</pre>'; continue; }
      h+='<'+BLK[b.t]+'>'+runs(b.r)+'</'+BLK[b.t]+'>';
    }
    if(list) h+=shut(list);
    return h||'<p><br></p>';
  }
  function readDocFrom(body){
    const blocks=[];
    const runsOf=el=>{ const out=[]; const walk=(nd,b,i,u)=>{ if(nd.nodeType===3){ const x=nd.nodeValue.replace(/ /g,' '); if(x) out.push({x,b,i,u}); return; } if(nd.nodeType!==1) return; const t=nd.tagName;
        if(t==='BR'){ out.push({x:'\n',b,i,u}); return; } if(t==='UL'||t==='OL') return;
        const fw=nd.style&&nd.style.fontWeight, fs=nd.style&&nd.style.fontStyle;
        const nb=b||t==='B'||t==='STRONG'||fw==='bold'||+fw>=600, ni=i||t==='I'||t==='EM'||fs==='italic', nu=t==='A'?(safeUrl(nd.getAttribute('href'))||u):u;
        for(const ch of nd.childNodes) walk(ch,nb,ni,nu); };
      for(const ch of el.childNodes) walk(ch,false,false,null);
      while(out.length&&!out[out.length-1].x.trim()) out.pop();
      if(out.length) out[out.length-1]={...out[out.length-1],x:out[out.length-1].x.replace(/\s+$/,'')};
      const m=[]; for(const r of out){ const p=m[m.length-1]; if(p&&!!p.b===!!r.b&&!!p.i===!!r.i&&(p.u||null)===(r.u||null)) p.x+=r.x; else m.push({x:r.x,b:r.b?1:0,i:r.i?1:0,u:r.u||null}); }
      return m.map(r=>{ const o={x:r.x}; if(r.b) o.b=1; if(r.i) o.i=1; if(r.u) o.u=r.u; return o; }); };
    const add=(t,el)=>{ const r=runsOf(el); blocks.push({t,r}); };
    let loose=null;
    for(const nd of body.childNodes){
      if(nd.nodeType===3||(nd.nodeType===1&&/^(B|I|STRONG|EM|SPAN|BR|A)$/.test(nd.tagName))){ if(!loose){ loose=document.createElement('p'); } loose.appendChild(nd.cloneNode(true)); continue; }
      if(loose){ add('p',loose); loose=null; }
      if(nd.nodeType!==1) continue; const t=nd.tagName;
      if(t==='H1'||t==='H2'||t==='H3') add(t.toLowerCase(),nd);
      else if(t==='H4'||t==='H5'||t==='H6') add('h3',nd);
      else if(t==='HR') blocks.push({t:'hr',r:[]});
      else if(t==='PRE'){ const x=nd.innerText.replace(/\u00a0/g,' ').replace(/\n$/,''); const o={t:'code',r:x?[{x}]:[]}; if(nd.dataset.lang) o.lang=nd.dataset.lang; blocks.push(o); }
      else if(t==='BLOCKQUOTE') add('quote',nd);
      else if(t==='UL'||t==='OL'){ const k=listKind(nd); for(const li of nd.children) if(li.tagName==='LI'){ add(k,li); if(k==='todo'&&li.dataset.c) blocks[blocks.length-1].c=1; for(const sub of li.querySelectorAll('ul,ol')) for(const l2 of sub.children) add(listKind(sub),l2); } }
      else add('p',nd);
    }
    if(loose) add('p',loose);
    // Trailing empty paragraphs are just where the caret was.
    while(blocks.length>1&&!blocks[blocks.length-1].r.length&&blocks[blocks.length-1].t==='p') blocks.pop();
    return {blocks};
  }
  function readDoc(){ return cleanDoc({...readDocFrom(cur.body),kind:cur.tkind,fields:cur.fields}); }
  function docOpen(n){
    cur.tkind=n.doc&&TICKET_TYPES[n.doc.kind]?n.doc.kind:null; cur.fields={...((n.doc&&n.doc.fields)||{})};
    cur.box.innerHTML='<div class="rd-head"><span class="rd-chip"></span><select class="rd-type" aria-label="Type"><option value="">Note</option>'+Object.entries(TICKET_TYPES).map(([k,t])=>'<option value="'+k+'">'+t.name+'</option>').join('')+'</select><input class="rich-title" placeholder="Untitled document" aria-label="Title"></div><div class="rd-fields"></div><div class="rd-body" contenteditable="true" spellcheck="true"></div>';
    cur.typeEl=cur.box.querySelector('.rd-type'); cur.fieldsEl=cur.box.querySelector('.rd-fields'); cur.typeEl.value=cur.tkind||'';
    cur.typeEl.addEventListener('change',()=>setKind(cur.typeEl.value||null));
    cur.fieldsEl.addEventListener('input',e=>{ const k=e.target.dataset.f; if(!k) return; const v=e.target.value; if(v==='') delete cur.fields[k]; else cur.fields[k]=v; live(); place(); });
    cur.fieldsEl.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); close(true); } });
    cur.title=cur.box.querySelector('.rich-title'); cur.title.value=n.label||'';
    cur.body=cur.box.querySelector('.rd-body'); cur.body.innerHTML=docHtml(n.doc||{blocks:[]});
    cur.box.style.width=(n.w||380)+'px';
    cur.bar.innerHTML=btn('h1','Heading 1','h1')+btn('h2','Heading 2','h2')+btn('h3','Heading 3','h3')+btn('p','Text','para')+'<span class="vsep"></span>'+
      btn('b','Bold (Ctrl+B)','bold')+btn('i','Italic (Ctrl+I)','italic')+'<span class="vsep"></span>'+btn('ul','Bulleted list','list')+btn('ol','Numbered list','olist')+btn('todo','Checklist','todo')+'<span class="vsep"></span>'+btn('code','Code block','code')+btn('quote','Quote','quote')+btn('hr','Divider','hr')+'<span class="vsep"></span>'+
      btn('link','Link (Ctrl+K)','link')+'<span class="vsep"></span>'+btn('copy','Copy as text, for Azure DevOps or any editor','copyDoc')+btn('expand','Expand','expand')+btn('done','Done')+
      '<span class="rd-linkbox" hidden><input type="url" placeholder="Paste a link" aria-label="Link address"><button type="button" class="btn" data-link-ok>Add</button></span>';
    cur.linkBox=cur.bar.querySelector('.rd-linkbox');
    const li=cur.linkBox.querySelector('input');
    li.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter'){ e.preventDefault(); applyLink(li.value); } else if(e.key==='Escape'){ e.preventDefault(); hideLink(); } });
    cur.linkBox.querySelector('[data-link-ok]').addEventListener('click',()=>applyLink(li.value));
    renderFields();
    try{ document.execCommand('defaultParagraphSeparator',false,'p'); }catch(_){}
    cur.bar.addEventListener('mousedown',e=>{ if(e.target.closest('button')) e.preventDefault(); });
    cur.bar.addEventListener('click',e=>{ const b=e.target.closest('[data-act]'); if(!b||!cur) return; docAct(b.dataset.act); });
    cur.title.addEventListener('input',()=>{ live(); place(); });
    cur.title.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); caretEnd(cur.body,true); } else if(e.key==='Escape'){ e.preventDefault(); close(true); } });
    cur.body.addEventListener('input',()=>{ live(); place(); markDoc(); });
    cur.body.addEventListener('keydown',docKey);
    cur.body.addEventListener('keyup',markDoc); cur.body.addEventListener('mouseup',markDoc);
    cur.body.addEventListener('mousedown',e=>{ const li=e.target.closest&&e.target.closest('ul.todo>li'); if(!li) return; const r=li.getBoundingClientRect(); if(e.clientX-r.left>22) return;
      e.preventDefault(); if(li.dataset.c) delete li.dataset.c; else li.dataset.c='1'; live(); });
    cur.body.addEventListener('click',e=>{ const a=e.target.closest&&e.target.closest('a[href]'); if(a&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); openLink(a.getAttribute('href')); } });
    cur.body.addEventListener('paste',e=>{ const t=(e.clipboardData||window.clipboardData).getData('text/plain'); if(!t) return; e.preventDefault();
      const u=safeUrl(t.trim()); if(u&&!/\s/.test(t.trim())){ const sel=getSelection(); if(sel.rangeCount&&!sel.isCollapsed) document.execCommand('createLink',false,u); else document.execCommand('insertHTML',false,'<a href="'+escH(u)+'">'+escH(u)+'</a>&nbsp;'); live(); return; }
      const inCode=(()=>{ const b=curBlock(); return b&&b.tagName==='PRE'; })();
      if(!inCode&&/^\s*(#{1,3}\s|[-*]\s|\d+\.\s|>\s|```)/m.test(t)&&t.includes('\n')){ document.execCommand('insertHTML',false,docHtml(mdToDoc(t))); } else document.execCommand('insertText',false,t); });
    const empty=!(n.doc&&n.doc.blocks.some(b=>b.r.length));
    setTimeout(()=>{ if(!cur) return; if(!n.label&&empty) cur.title.focus(); else caretEnd(cur.body,false); markDoc(); },0);
  }
  function caretEnd(el,start){ el.focus({preventScroll:true}); const s=getSelection(), r=document.createRange(); r.selectNodeContents(el); r.collapse(!!start); s.removeAllRanges(); s.addRange(r); }
  function curBlock(){ const s=getSelection(); if(!s.rangeCount) return null; let nd=s.anchorNode; if(!cur.body.contains(nd)) return null;
    // Loose text right in the editor gets a paragraph first.
    if(nd.parentNode===cur.body&&nd.nodeType===3){ const off=s.anchorOffset; const p=document.createElement('p'); cur.body.insertBefore(p,nd); p.appendChild(nd); setCaret(p,off); return p; }
    while(nd&&nd!==cur.body&&!(nd.nodeType===1&&/^(P|H1|H2|H3|LI|DIV|PRE|BLOCKQUOTE)$/.test(nd.tagName))) nd=nd.parentNode; return nd&&nd!==cur.body?nd:null; }
  function caretOffset(block){ const s=getSelection(); if(!s.rangeCount) return 0; const t=textBefore(block,s.anchorNode,s.anchorOffset); return t==null?0:t.length; }
  function setCaret(el,off){ const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n, left=off; const r=document.createRange();
    while((n=w.nextNode())){ if(left<=n.nodeValue.length){ r.setStart(n,left); r.collapse(true); const s=getSelection(); s.removeAllRanges(); s.addRange(r); return; } left-=n.nodeValue.length; }
    r.selectNodeContents(el); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }
  const fill=el=>{ if(!el.textContent&&!el.querySelector('br')) el.appendChild(document.createElement('br')); return el; };
  // Turn the block with the caret into another kind: a heading, a paragraph or a list item.
  const isList=t=>t==='ul'||t==='ol'||t==='todo';
  const mkList=t=>{ const el=document.createElement(t==='ol'?'ol':'ul'); if(t==='todo') el.className='todo'; return el; };
  const TAG={code:'pre',quote:'blockquote'};
  function setBlock(type){
    if(type==='hr'){ const b=curBlock(); const hr=document.createElement('hr'); hr.contentEditable='false'; const p=fill(document.createElement('p'));
      const at=b&&b.tagName==='LI'?b.parentNode:b; if(at){ at.after(hr); hr.after(p); } else { cur.body.appendChild(hr); cur.body.appendChild(p); } setCaret(p,0); return; }
    const b=curBlock(); if(!b){ return; } const off=caretOffset(b);
    const isLi=b.tagName==='LI', list=isLi?b.parentNode:null, lt=list?listKind(list):null;
    let out;
    if(isList(type)){
      if(isLi&&lt===type) type='p';
      else if(isLi){ const nl=mkList(type); while(list.firstChild) nl.appendChild(list.firstChild); list.replaceWith(nl); setCaret(b,off); return; }
    }
    if((type==='code'&&b.tagName==='PRE')||(type==='quote'&&b.tagName==='BLOCKQUOTE')) type='p';
    const kids=[...b.childNodes].filter(c=>!(c.nodeType===1&&/^(UL|OL)$/.test(c.tagName)));
    if(isList(type)){
      out=document.createElement('li'); kids.forEach(k=>out.appendChild(k));
      const prev=b.previousElementSibling, next=b.nextElementSibling; let host;
      const same=el=>el&&/^(UL|OL)$/.test(el.tagName)&&listKind(el)===type;
      if(same(prev)){ host=prev; host.appendChild(out); b.remove(); }
      else { host=mkList(type); host.appendChild(out); b.replaceWith(host); }
      if(same(next)&&next!==host){ while(next.firstChild) host.appendChild(next.firstChild); next.remove(); }
    } else {
      out=document.createElement(TAG[type]||type);
      if(type==='code'){ out.textContent=b.innerText.replace(/\n$/,''); } else kids.forEach(k=>out.appendChild(k));
      if(isLi){ const after=[]; let x=b.nextElementSibling; while(x){ after.push(x); x=x.nextElementSibling; }
        list.after(out); if(after.length){ const tail=mkList(lt); after.forEach(li=>tail.appendChild(li)); out.after(tail); } b.remove(); if(!list.children.length) list.remove(); }
      else b.replaceWith(out);
      // A code block always has a paragraph after it, so there is somewhere to keep writing.
      if(type==='code'&&!out.nextElementSibling) out.after(fill(document.createElement('p')));
    }
    fill(out); setCaret(out,off);
  }
  function markDoc(){ if(!cur||cur.kind!=='doc') return; const b=curBlock(); const t=b?(b.tagName==='LI'?listKind(b.parentNode):b.tagName==='PRE'?'code':b.tagName==='BLOCKQUOTE'?'quote':b.tagName.toLowerCase()):'p';
    for(const k of ['h1','h2','h3','p','ul','ol','todo','code','quote']){ const el=cur.bar.querySelector('[data-act="'+k+'"]'); if(el) el.setAttribute('aria-pressed',String(t===k||(k==='p'&&t==='div'))); }
    for(const k of ['b','i']){ const el=cur.bar.querySelector('[data-act="'+k+'"]'); let on=false; try{ on=document.queryCommandState(k==='b'?'bold':'italic'); }catch(_){} if(el) el.setAttribute('aria-pressed',String(on)); } }
  function docAct(a){
    if(a==='done'){ close(true); return; }
    if(a==='link'){ showLink(); return; }
    if(a==='copy'){ const n=node(); if(n) copyDocs([n]); return; }
    if(a==='expand'){ cur.expanded=!cur.expanded; cur.box.classList.toggle('expanded',cur.expanded); const b=cur.bar.querySelector('[data-act="expand"]'); if(b){ b.innerHTML=ico(cur.expanded?'collapse':'expand'); b.title=b.ariaLabel=cur.expanded?'Back to the board':'Expand'; } place(); cur.body.focus(); return; }
    cur.body.focus();
    if(a==='b'||a==='i') document.execCommand(a==='b'?'bold':'italic');
    else { if(!curBlock()) caretEnd(cur.body,false); setBlock(a); }
    live(); place(); markDoc();
  }
  // Markdown shortcuts at the start of a line: "# ", "## ", "### ", "- ", "* ", "1. ".
  function docKey(e){
    if(e.key==='Escape'){ e.preventDefault(); if(cur.expanded) docAct('expand'); else close(true); return; }
    if((e.ctrlKey||e.metaKey)&&!e.altKey){ const k=e.key.toLowerCase(); if(k==='k'){ e.preventDefault(); showLink(); return; } if(k==='b'||k==='i'){ e.preventDefault(); docAct(k); return; } if(k==='enter'){ e.preventDefault(); close(true); return; } }
    if(e.key===' '){
      const s=getSelection(); if(!s.rangeCount||!s.isCollapsed) return; const b=curBlock(); const nd=s.anchorNode;
      const pre=b?textBefore(b,nd,s.anchorOffset):(nd&&nd.nodeType===3?nd.nodeValue.slice(0,s.anchorOffset):'');
      const mm=/^(#{1,3}|[-*]|1[.)]|\[\s?\]|>|```|---)$/.exec(pre); if(!mm) return;
      if(b&&(b.tagName==='LI'||b.tagName==='PRE')) return;
      e.preventDefault();
      const blk=b||curBlock(); if(!blk) return;
      const r=document.createRange(); r.setStart(blk,0); r.setEnd(nd,s.anchorOffset); r.deleteContents(); fill(blk); setCaret(blk,0);
      const k=mm[1]; setBlock(k[0]==='#'?'h'+k.length:(k==='-'||k==='*')?'ul':k[0]==='['?'todo':k==='>'?'quote':k==='```'?'code':k==='---'?'hr':'ol');
      live(); place(); markDoc(); return;
    }
    if(e.key==='Enter'&&!e.shiftKey){ const b=curBlock();
      if(b&&b.tagName==='PRE'){ e.preventDefault(); document.execCommand('insertText',false,'\n'); live(); place(); return; }
      if(b&&b.tagName==='LI'&&b.dataset.c) setTimeout(()=>{ const nb=curBlock(); if(nb&&nb!==b&&nb.tagName==='LI') delete nb.dataset.c; live(); },0); }
    if(e.key==='Backspace'){ const b=curBlock(); const s=getSelection(); if(b&&s.isCollapsed&&/^H[1-3]$/.test(b.tagName)&&textBefore(b,s.anchorNode,s.anchorOffset)===''){ e.preventDefault(); setBlock('p'); live(); markDoc(); } }
  }
  /* ---------- tickets and links ---------- */
  function renderFields(){
    const t=TICKET_TYPES[cur.tkind]; const chip=cur.box.querySelector('.rd-chip');
    chip.style.background=t?t.color:''; chip.hidden=!t; cur.box.classList.toggle('ticket',!!t); cur.box.style.setProperty('--tk',t?t.color:'transparent');
    if(!t){ cur.fieldsEl.innerHTML=''; cur.fieldsEl.hidden=true; return; }
    cur.fieldsEl.hidden=false;
    cur.fieldsEl.innerHTML=t.fields.map(k=>{ const d=TICKET_FIELDS[k], v=cur.fields[k]!=null?String(cur.fields[k]):'';
      const ctl=d.opts?'<select data-f="'+k+'"><option value="">–</option>'+d.opts.map(o=>'<option'+(o===v?' selected':'')+'>'+escH(o)+'</option>').join('')+'</select>'
        :'<input data-f="'+k+'" '+(d.num?'type="number" min="0" step="0.5" style="width:56px"':'placeholder="web; login" style="width:120px"')+' value="'+escH(v)+'">';
      return '<label><span>'+escH(d.name)+'</span>'+ctl+'</label>'; }).join('');
  }
  // Switching type swaps the starting template when the body is still empty or untouched.
  function setKind(k){
    const prev=cur.tkind; cur.tkind=TICKET_TYPES[k]?k:null;
    const t=TICKET_TYPES[cur.tkind]; if(t) cur.fields=cleanFields(cur.tkind,cur.fields);
    const body=JSON.stringify(cleanDoc(readDocFrom(cur.body)).blocks), empty=!cleanDoc(readDocFrom(cur.body)).blocks.some(b=>b.r.some(r=>r.x.trim()));
    const wasTpl=prev&&body===JSON.stringify(cleanDoc({blocks:ticketTemplate(prev)}).blocks);
    if(t&&(empty||wasTpl)) cur.body.innerHTML=docHtml({blocks:ticketTemplate(cur.tkind)});
    else if(!t&&wasTpl) cur.body.innerHTML='<p><br></p>';
    cur.title.placeholder=t?t.name+' title':'Untitled document';
    renderFields(); live(); place();
  }
  function showLink(){
    const s=getSelection(); cur.linkRange=s.rangeCount&&cur.body.contains(s.anchorNode)?s.getRangeAt(0).cloneRange():null;
    const a=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentNode).closest('a[href]');
    cur.linkA=a&&cur.body.contains(a)?a:null;
    cur.linkBox.hidden=false; const li=cur.linkBox.querySelector('input'); li.value=cur.linkA?cur.linkA.getAttribute('href'):''; li.placeholder=cur.linkA?'Empty removes the link':'Paste a link'; li.focus(); li.select(); place();
  }
  function hideLink(){ cur.linkBox.hidden=true; place(); cur.body.focus(); if(cur.linkRange){ const s=getSelection(); s.removeAllRanges(); s.addRange(cur.linkRange); } }
  function applyLink(v){
    const raw=String(v||'').trim(); const u=raw?safeUrl(/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)&&!/^\w+:/.test(raw)?'https://'+raw:raw):null;
    if(raw&&!u){ toast('Use a web address, such as https://…'); return; }
    hideLink();
    if(cur.linkA){ if(u) cur.linkA.setAttribute('href',u); else cur.linkA.replaceWith(...cur.linkA.childNodes); }
    else if(u){ const s=getSelection(); if(s.rangeCount&&!s.isCollapsed) document.execCommand('createLink',false,u); else document.execCommand('insertHTML',false,'<a href="'+escH(u)+'">'+escH(u)+'</a>&nbsp;'); }
    live(); place();
  }
  function textBefore(block,nd,off){ const r=document.createRange(); r.setStart(block,0); try{ r.setEnd(nd,off); }catch(_){ return null; } return r.toString(); }

  return {open,close,place,active:()=>cur};
})();
// Copy documents and tickets as rich text (pastes formatted into Azure DevOps, Word, Teams, mail)
// with Markdown as the plain-text version.
function copyDocs(nodes){
  const docs=nodes.filter(n=>n&&n.shape==='doc'&&n.doc); if(!docs.length) return;
  const html=docs.map(ticketHtml).join('<hr>'), md=docs.map(ticketMd).join('\n---\n\n');
  const msg=docs.length>1?docs.length+' documents copied':(isTicket(docs[0])?'Ticket copied':'Document copied');
  try{
    if(navigator.clipboard&&window.ClipboardItem){ navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([md],{type:'text/plain'})})]).then(()=>toast(msg),()=>copyText(md,msg)); return; }
  }catch(_){}
  copyText(md,msg);
}
