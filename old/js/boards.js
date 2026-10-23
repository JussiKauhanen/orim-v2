/* orim · boards.js
 * Several boards per browser, the home page and #b-<id> links.
 * Storage: orim.boards (list), orim.b.<id> (Mermaid code), orim.i.<id> (images).
 * With a folder chosen (folder.js), boards also live there as .md files: meta.file and meta.dir
 * link a board to its file; the browser copy stays as a cache and a safety net.
 */
'use strict';
const Boards=(()=>{
  const LIST='orim.boards', CODE='orim.b.', IMGS='orim.i.';
  let list=[], current=null, lastSaved=new Map(), thumbs=new Map(), view=LS.get('orim.homeView','list');
  const now=()=>Date.now();
  const newId=()=>Math.random().toString(36).slice(2,8)+now().toString(36).slice(-4);
  const meta=id=>list.find(b=>b.id===id);
  const titleOf=code=>{ try{ const r=parseMermaid(code); return (r.model&&r.model.title)||''; }catch(_){ return ''; } };
  const saveList=()=>LS.set(LIST,list);

  function init(){
    list=LS.get(LIST,null);
    if(!Array.isArray(list)){
      list=[];
      const old=LS.get('mab.code',null);
      if(typeof old==='string'&&old.trim()){ const id=newId(); const t=now(); LS.set(CODE+id,old); LS.set(IMGS+id,LS.get('mab.images',{})||{}); list.push({id,title:titleOf(old)||'Untitled board',created:t,updated:t,opened:t}); }
      saveList();
    }
    window.addEventListener('hashchange',route);
    renderStatic(); route(); renderFolderBtn();
    Folder.init().catch(()=>{});
    setInterval(watch,2500);
  }
  /* ---- boards in a folder ---- */
  const linked=m=>!!(m&&m.file&&m.dir&&m.dir===Folder.name());
  // Files found in the folder: add new boards, refresh changed ones, and let go of files that are gone.
  function syncFolder(files){
    const fname=Folder.name(); let added=0; const seen=new Set();
    for(const f of files){ seen.add(f.name);
      let m=list.find(b=>b.file===f.name&&b.dir===fname);
      if(!m){ const id=newId(); LS.set(CODE+id,f.code); LS.set(IMGS+id,{}); m={id,title:titleOf(f.code)||f.name.replace(/\.md$/i,''),created:f.mod,updated:f.mod,opened:0,file:f.name,dir:fname,fileMod:f.mod,fileCode:f.code,needImgs:true}; list.push(m); added++; continue; }
      if(f.mod>(m.fileMod||0)+1&&f.code!==m.fileCode&&m.id!==current){ LS.set(CODE+m.id,f.code); m.title=titleOf(f.code)||m.title; m.updated=f.mod; m.fileMod=f.mod; m.fileCode=f.code; m.needImgs=true; thumbs.delete(m.id); }
    }
    for(const m of list) if(m.dir===fname&&m.file&&!seen.has(m.file)&&!m.dirty){ delete m.file; delete m.dir; delete m.fileMod; delete m.fileCode; }
    // Unsaved changes made while the folder was unavailable go out now.
    for(const m of list) if(linked(m)&&m.dirty) Folder.write(m,LS.get(CODE+m.id,''),LS.get(IMGS+m.id,{})||{});
    saveList(); return added;
  }
  function folderChanged(){ renderFileState(); renderFolderBtn(); if(isHome()) renderRecents(); }
  function renderFolderBtn(){
    const b=$('#homeFolder'), foot=$('#homeFoot'); if(!b) return; const st=Folder.state();
    // A one-time suggestion on the home page; No thanks hides it for good (the folder button stays in the corner).
    const tip=$('#folderTip'); if(tip) tip.hidden=!(st==='none'&&LS.get('orim.folderTip','ask')!=='no'&&list.length>0);
    b.hidden=st==='unsupported'; b.classList.toggle('warn',st==='reconnect');
    b.innerHTML=ico('folder')+'<span>'+(st==='none'?'Save to a folder':st==='reconnect'?'Reconnect '+esc(Folder.name()):esc(Folder.name()))+'</span>';
    b.title=st==='none'?'Choose a folder on this computer. Each board is saved there as a Markdown file.':st==='reconnect'?'Let orim open '+Folder.name()+' again':'Boards are saved in '+Folder.name()+'. Click to change.';
    if(foot) foot.textContent=st==='ready'?'New boards are saved as .md files in '+Folder.name()+', and a copy is kept in this browser.':st==='reconnect'?'Reconnect '+Folder.name()+' to keep saving boards there. Until then, changes are kept in this browser.':st==='none'?'Boards are saved in this browser only. Choose a folder to keep them as Markdown files you can put in Git or share.':'Boards are saved in this browser only. To move a board to another device, open it and use Export, Board file.';
  }
  function metaChanged(m,status){ saveList(); if(m.id===current){ fileStatus=status||fileStatus; renderFileState(); } if(isHome()) renderRecents(); }
  let fileStatus='saved', conflictOpen=false;
  function fileConflict(id,code,mod){
    const m=meta(id); if(!m||conflictOpen) return; conflictOpen=true;
    openModal('This board changed in two places','<p><b>'+esc(m.file)+'</b> was changed outside orim while you were editing it here. Which version do you want to keep?</p>',[
      {label:'Use the file',primary:true,run:()=>{ conflictOpen=false; closeModal(); Folder.readImages(m.file).then(imgs=>applyFile(m,code,mod,imgs)).catch(()=>applyFile(m,code,mod,null)); }},
      {label:'Keep mine',run:()=>{ conflictOpen=false; m.fileMod=mod; m.fileCode=code; saveList(); Folder.write(m,id===current?state.code:LS.get(CODE+id,''),id===current?usedImages():LS.get(IMGS+id,{})); closeModal(); toast('Saved your version to the file'); }}]);
  }
  function applyFile(m,code,mod,images){
    m.fileMod=mod; m.fileCode=code; m.title=titleOf(code)||m.title; m.updated=mod; LS.set(CODE+m.id,code); if(images) LS.set(IMGS+m.id,images); thumbs.delete(m.id); saveList();
    if(m.id===current){ if(images){ for(const k of Object.keys(IMG)) delete IMG[k]; Object.assign(IMG,images); } lastSaved.set(m.id,code); loadCode(code,{history:true}); setEditorFromCode(); syncTitle(); toast('Updated from '+m.file); }
  }
  // While a folder board is open, look for changes made to its file by Git, an editor or an AI assistant.
  let watching=false;
  async function watch(){
    const m=meta(current); if(watching||!linked(m)||app.hidden||document.visibilityState!=='visible'||!Folder.ready()) return;
    watching=true;
    try{ const r=await Folder.check(m);
      if(r&&r.missing){ delete m.file; delete m.dir; saveList(); renderFileState(); toast('The board file was moved or deleted, so this board is now kept in the browser only'); }
      else if(r){ if(state.code===m.fileCode||state.code===lastSaved.get(current)&&lastSaved.get(current)===m.fileCode) applyFile(m,r.code,r.mod,r.images); else fileConflict(m.id,r.code,r.mod); } }
    finally{ watching=false; }
  }
  // The file name and save state next to the board title.
  // Where this board is saved, next to its title, like Excel's "Saved to this PC": on disk or only in this browser.
  function renderFileState(){
    const el=$('#fileState'); if(!el) return; const m=meta(current); if(!m){ el.hidden=true; return; }
    el.hidden=false; const st=Folder.state(), here=linked(m);
    let cls='file-state', icon='browser', text='Saved in browser', tip='This board is kept in this browser only. Click for options.';
    if(here&&st==='ready'){ icon='folder'; text=fileStatus==='saving'?'Saving…':fileStatus==='error'?'Not saved to disk':'Saved to disk'; tip=fileStatus==='error'?'Could not write '+m.file+'. Your changes are kept in the browser.':'Saved as '+m.dir+'/'+m.file; if(fileStatus==='error') cls+=' warn'; else cls+=' disk'; }
    else if(m.file&&m.dir&&st==='reconnect'&&m.dir===Folder.name()){ icon='folder'; text='Reconnect folder'; tip='The browser needs your permission again to save '+m.file+' in '+m.dir; cls+=' warn'; }
    el.className=cls; el.innerHTML=ico(icon)+'<span>'+text+'</span>'+ico('chevD'); el.title=tip;
  }
  // The small menu under that note: choose a folder, save this board there, change folder or stop using it.
  function saveMenu(){
    const mn=$('#saveMenu'), m=meta(current); if(!m) return; const st=Folder.state(), here=linked(m), inClaude=(()=>{ try{ return window.self!==window.top; }catch(_){ return true; } })();
    let h;
    if(st==='unsupported') h='<p><b>Saved in this browser.</b> '+(inClaude?'To save boards as files on your computer, open orim on its own page in Chrome or Edge.':'This browser cannot save to a folder. Chrome or Edge on a computer can.')+'</p>';
    else if(st==='none') h='<p><b>Saved in this browser only.</b> Choose a folder and each board is saved there as a Markdown file, with its pictures next to it.</p><button type="button" class="btn primary" data-sm="choose">'+ico('folder')+'Choose a folder</button>';
    else if(st==='reconnect') h='<p>Your browser needs permission again to save into <b>'+esc(Folder.name())+'</b>.</p><button type="button" class="btn primary" data-sm="reconnect">Reconnect '+esc(Folder.name())+'</button><button type="button" class="btn ghost" data-sm="stop">Stop saving to a folder</button>';
    else if(here) h='<p><b>Saved to disk</b> as <code>'+esc(m.dir+'/'+m.file)+'</code>, a moment after each change. A copy is kept in this browser too.</p><button type="button" class="btn" data-sm="choose">Change folder</button><button type="button" class="btn ghost" data-sm="stop">Stop saving to a folder</button>';
    else h='<p><b>Saved in this browser only.</b> New boards go to <b>'+esc(Folder.name())+'</b>; this one is older.</p><button type="button" class="btn primary" data-sm="move">'+ico('folder')+'Save this board to '+esc(Folder.name())+'</button><button type="button" class="btn ghost" data-sm="stop">Stop saving to a folder</button>';
    mn.innerHTML=h; const r=$('#fileState').getBoundingClientRect(); mn.style.left=Math.max(8,Math.min(innerWidth-308,r.left))+'px'; mn.style.top=(r.bottom+6)+'px'; mn.hidden=false;
  }
  $('#saveMenu').addEventListener('click',async e=>{ const b=e.target.closest('[data-sm]'); if(!b) return; $('#saveMenu').hidden=true; const k=b.dataset.sm;
    if(k==='choose'){ const was=Folder.ready(); await Folder.choose(); if(Folder.ready()&&current&&!linked(meta(current))&&!was) moveToFolder(current); }
    else if(k==='reconnect') Folder.reconnect();
    else if(k==='stop') openModal('Stop saving to a folder','<p>Boards will be kept in this browser only. The files already in <b>'+esc(Folder.name())+'</b> stay where they are.</p>',[{label:'Stop saving to a folder',primary:true,run:()=>{ closeModal(); Folder.disconnect(); }}]);
    else if(k==='move') moveToFolder(current); });
  document.addEventListener('pointerdown',e=>{ if(!e.target.closest('#saveMenu')&&!e.target.closest('#fileState')) $('#saveMenu').hidden=true; });
  function folderMenu(){
    const st=Folder.state();
    if(st==='none'){ Folder.choose(); return; }
    if(st==='reconnect'){ Folder.reconnect(); return; }
    const browserOnly=list.filter(b=>!linked(b)).length;
    openModal('Board folder','<p>New boards are saved as Markdown files in <b>'+esc(Folder.name())+'</b>, a moment after each change. They show as diagrams on GitHub, in Azure DevOps and in VS Code, and changes made to a file elsewhere (Git, an editor, an AI assistant) appear here while the board is open.</p>'+
      (browserOnly?'<p>'+browserOnly+(browserOnly===1?' board is':' boards are')+' still only in this browser. Use Move to folder in a board\'s menu to add it.</p>':''),
      [{label:'Change folder',run:()=>{ closeModal(); Folder.choose(); }},{label:'Stop using this folder',run:()=>{ closeModal(); Folder.disconnect(); }}]);
  }
  function moveToFolder(id){
    const m=meta(id); if(!m||!Folder.ready()) return;
    Folder.uniqueName(m.title).then(n=>{ m.file=n; m.dir=Folder.name(); m.fileMod=0; m.fileCode=null; saveList();
      Folder.write(m,id===current?state.code:LS.get(CODE+id,''),id===current?usedImages():LS.get(IMGS+id,{})||{}); renderRecents(); toast('Saved as '+n); });
  }
  function route(){
    const sh=/^#([mt]=[A-Za-z0-9_-]+)$/.exec(location.hash||'');
    if(sh){
      // A shared board link: drop the data from the address first, so reloading or going back does not import it twice.
      try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){}
      importShared(sh[1]).then(code=>{ if(code){ openNew(code); toast('Board opened from the shared link'); } else showHome(); });
      return;
    }
    const m=/^#b-([A-Za-z0-9]+)$/.exec(location.hash||'');
    if(m&&meta(m[1])){ if(current!==m[1]||!$('#home').hidden) open(m[1]); }
    else showHome();
  }
  function setHash(h){
    const want=h?'#'+h:'';
    if((location.hash||'')===want) return;
    if(h){ location.hash=h; return; }
    try{ history.pushState(null,'',location.pathname+location.search); }catch(_){ location.hash=''; }
  }
  function persist(){
    if(!current||!state.model&&!state.code) return;
    const m=meta(current); if(!m) return;
    const imgs=usedImages();
    if(lastSaved.get(current)!==state.code){
      LS.set(CODE+current,state.code); lastSaved.set(current,state.code);
      m.updated=now(); m.title=(state.model&&state.model.title)||'Untitled board'; saveList(); thumbs.delete(current);
      if(linked(m)){ if(Folder.ready()){ fileStatus='saving'; renderFileState(); Folder.write(m,state.code,imgs); } else { m.dirty=true; saveList(); } }
    }
    if(!LS.set(IMGS+current,imgs)&&!imgWarned&&Object.keys(imgs).length){ imgWarned=true; toast('Images are too large to autosave in this browser. Export a board file (.json) to keep them.'); }
  }
  function create(code,title){
    const id=newId(); const t=now();
    let c=code||'flowchart LR\n'; if(title) c=setTitleInCode(c,title);
    LS.set(CODE+id,c); LS.set(IMGS+id,{});
    const m={id,title:titleOf(c)||'Untitled board',created:t,updated:t,opened:t}; list.unshift(m); saveList();
    if(Folder.ready()){ const d=Folder.name(); Folder.uniqueName(m.title).then(n=>{ if(!meta(id)) return; m.file=n; m.dir=d; m.fileMod=0; saveList(); Folder.write(m,LS.get(CODE+id,c),LS.get(IMGS+id,{})||{}); if(id===current) renderFileState(); }); }
    return id;
  }
  function open(id){
    const m=meta(id); if(!m){ showHome(); return; }
    if(current&&current!==id){ flushEditorHist(); saveNow(); }
    current=id; m.opened=now(); saveList();
    for(const k of Object.keys(IMG)) delete IMG[k];
    Object.assign(IMG,LS.get(IMGS+id,{})||{});
    const code=LS.get(CODE+id,'flowchart LR\n');
    lastSaved.set(id,code);
    state.sel.clear(); state.cache.clear(); H.stack=[]; H.i=-1; closeModal(); closeMenus(); cmClose(); if(typeof AI!=='undefined') AI.onBoard();
    $('#home').hidden=true; app.hidden=false;
    loadCode(typeof code==='string'?code:'flowchart LR\n',{clearCache:true}); updUndo();
    state.viewQuietUntil=performance.now()+1500; requestAnimationFrame(()=>{ applyView(); render(); fit(); });
    setHash('b-'+id); document.title=(m.title||'Untitled board')+' · orim';
    fileStatus='saved'; renderFileState();
    if(linked(m)&&Folder.ready()){
      if(m.needImgs) Folder.readImages(m.file).then(imgs=>{ m.needImgs=false; saveList(); if(Object.keys(imgs).length){ LS.set(IMGS+id,imgs); if(current===id){ Object.assign(IMG,imgs); render(); } } });
      watch();
    }
  }
  function openNew(code,title){ const id=create(code,title); open(id); return id; }
  function showHome(){
    if(current){ flushEditorHist(); saveNow(); }
    closeModal(); closeMenus(); cmClose(); hideTip&&hideTip();
    app.hidden=true; $('#home').hidden=false; setHash(''); document.title='orim';
    renderRecents();
  }
  const isHome=()=>!$('#home').hidden;

  /* ---- thumbnails ---- */
  const PACK_TINT={azure:'#0078d4',pp:'#742774',d365:'#0b53ce'};
  function thumbSVG(code,opt){
    opt=opt||{}; const aspect=opt.aspect||1.6;
    let m; try{ const r=parseMermaid(code); if(r.fatal) return emptyThumb(); m=r.model; resolveGeometry(m,new Map()); }catch(_){ return emptyThumb(); }
    const b=contentBounds(m); if(!b) return emptyThumb();
    const pad=Math.max(b.w,b.h)*0.05+24; const vw=b.w+pad*2, vh=b.h+pad*2; const ca=vw/vh;
    const slice=ca>aspect*1.9;
    const vb=[b.x-pad,b.y-pad,vw,vh].map(v=>Math.round(v)).join(' ');
    const ns=' vector-effect="non-scaling-stroke"';
    const bar=(x,y,w,h,fill,op)=>'<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+Math.max(4,w).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="'+(h/2).toFixed(1)+'" style="fill:'+fill+';opacity:'+op+'"/>';
    const lines=(n,cx,cy,maxW,lh,fill,op)=>{ const ls=(n.lines&&n.lines.filter(Boolean))||[]; const k=Math.min(3,Math.max(1,ls.length)); let o=''; const th=k*lh*1.7; for(let i=0;i<k;i++){ const lw=ls[i]?Math.min(maxW,Core.measure(ls[i],labelSize(n))):maxW*0.6; o+=bar(cx-lw/2,cy-th/2+i*lh*1.7+lh*0.35,lw,lh,fill,op); } return o; };
    // A themed board shows its own colours in the thumbnail.
    const T=boardTheme(m);
    let o=T?'<rect x="'+(b.x-pad*3)+'" y="'+(b.y-pad*3)+'" width="'+(vw+pad*4)+'" height="'+(vh+pad*4)+'" style="fill:'+T.bg+'"/>':'';
    const boxes=groupBoxes(m);
    for(const gid of [...m.groupOrder].sort((a,c)=>groupDepth(m,a)-groupDepth(m,c))){ const g=boxes.get(gid); if(!g) continue; const st=styleOf(m,gid); const acc=themeAccent(m,gid);
      const ff=(st&&st.fill)||(T?(acc&&T.tint?'color-mix(in srgb,'+acc+' 16%,'+T.bg+')':T.frame):'var(--th-frame)');
      o+='<rect x="'+g.x+'" y="'+g.y+'" width="'+g.w+'" height="'+g.h+'" rx="8" style="fill:'+ff+';stroke:'+(acc||(T?T.stroke:'var(--th-line)'))+';stroke-width:'+(acc?1.6:1)+'"'+ns+'/>';
      o+=bar(g.x+16,g.y+14,Math.min(g.w*0.4,Core.measure(m.groups.get(gid).label,13)),9,'var(--th-edge)',.55); }
    for(const im of m.images) o+='<rect x="'+im.x+'" y="'+im.y+'" width="'+im.w+'" height="'+im.h+'" rx="4" style="fill:var(--th-image)"/>';
    for(const e of m.edges){ const a=m.nodes.get(e.from)||boxes.get(e.from),c=m.nodes.get(e.to)||boxes.get(e.to); if(!a||!c||a.x==null||c.x==null||e.line==='invis') continue;
      const g=edgeGeom(a,c,0,routeOf(m,e),edgeSides(e)); o+='<path d="'+g.d+'" style="fill:none;stroke:'+(e.color||(T?T.edge:'var(--th-edge)'))+';stroke-width:'+(e.line==='thick'?2.4:1.4)+(e.line==='dotted'?';stroke-dasharray:3 3':'')+'"'+ns+'/>'; }
    for(const id of m.nodeOrder){ const n=m.nodes.get(id); if(!n||n.x==null) continue; const st=styleOf(m,id)||{};
      if(n.shape==='sticky'){ o+='<rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="2" style="fill:'+(st.fill||'#fff9b1')+'"/>'+lines(n,n.x+n.w/2,n.y+n.h/2,n.w*0.66,n.h*0.06,'#1a1a1a',.28); }
      else if(n.shape==='icon'){ const s=iconSize(n); const ic=iconFor(n.icon); const x=n.x+(n.w-s)/2;
        o+=ic?'<image href="'+ic.uri+'" x="'+x+'" y="'+n.y+'" width="'+s+'" height="'+s+'"/>':'<rect x="'+x+'" y="'+n.y+'" width="'+s+'" height="'+s+'" rx="'+(s*0.22)+'" style="fill:'+(PACK_TINT[String(n.icon||'').split(':')[0]]||'#808080')+'"/>';
        o+=bar(n.x+n.w/2-Math.min(n.w*0.8,Core.measure(n.label,12))/2,n.y+s+9,Math.min(n.w*0.8,Core.measure(n.label,12)),7,'var(--th-edge)',.6); }
      else if(n.shape==='text') o+=lines(n,n.x+n.w/2,n.y+n.h/2,n.w*0.8,Math.max(6,labelSize(n)*0.55),'var(--th-stroke)',.55);
      else { const fill=st.fill||(T?T.node:'var(--th-node)'); const sty='fill:'+fill+';stroke:'+(st.stroke||(n.group&&themeAccent(m,n.group))||(T?T.stroke:'var(--th-stroke)'))+';stroke-width:1.4';
        if(n.shape==='circle') o+='<ellipse cx="'+(n.x+n.w/2)+'" cy="'+(n.y+n.h/2)+'" rx="'+(n.w/2)+'" ry="'+(n.h/2)+'" style="'+sty+'"'+ns+'/>';
        else if(n.shape==='diamond') o+='<path d="M'+(n.x+n.w/2)+' '+n.y+'L'+(n.x+n.w)+' '+(n.y+n.h/2)+'L'+(n.x+n.w/2)+' '+(n.y+n.h)+'L'+n.x+' '+(n.y+n.h/2)+'Z" style="'+sty+'"'+ns+'/>';
        else if(n.shape==='cyl'){ const ry=Math.min(9,n.h/6); o+='<path d="M'+n.x+' '+(n.y+ry)+'A'+(n.w/2)+' '+ry+' 0 0 1 '+(n.x+n.w)+' '+(n.y+ry)+'V'+(n.y+n.h-ry)+'A'+(n.w/2)+' '+ry+' 0 0 1 '+n.x+' '+(n.y+n.h-ry)+'Z" style="'+sty+'"'+ns+'/><path d="M'+n.x+' '+(n.y+ry)+'A'+(n.w/2)+' '+ry+' 0 0 0 '+(n.x+n.w)+' '+(n.y+ry)+'" style="fill:none;stroke:var(--th-stroke);stroke-width:1.4"'+ns+'/>'; }
        else o+='<rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="'+(n.shape==='round'||n.shape==='stadium'?Math.min(n.h/2,14):4)+'" style="'+sty+'"'+ns+'/>';
        const dark=/^#?(1a1a1a|000|000000|21|2)/i.test(String(st.fill||''))||st.color==='#ffffff';
        o+=lines(n,n.x+n.w/2,n.y+n.h/2+(n.shape==='cyl'?4:0),n.w*(n.shape==='diamond'?0.45:0.62),Math.max(6,labelSize(n)*0.5),dark?'#ffffff':(T&&!st.fill?T.text:'var(--th-stroke)'),dark?.85:.45); } }
    for(const k of m.inks) o+='<polyline points="'+k.pts.map(q=>q.join(',')).join(' ')+'" style="fill:none;stroke:'+(k.color==='#1a1a1a'?'var(--th-stroke)':k.color)+';stroke-width:'+(k.tool==='hl'?4:1.6)+';stroke-linecap:round;stroke-linejoin:round;opacity:'+(k.tool==='hl'?.55:1)+'"'+ns+'/>';
    for(const a0 of m.arrows){ const a=resolveArrow(m,a0); o+='<line x1="'+a.x1+'" y1="'+a.y1+'" x2="'+a.x2+'" y2="'+a.y2+'" style="stroke:'+(a.color==='#1a1a1a'?'var(--th-stroke)':a.color)+';stroke-width:'+(a.kind==='block'?5:1.6)+';stroke-linecap:round"'+ns+'/>'; }
    return '<svg viewBox="'+vb+'" preserveAspectRatio="xMidYMid '+(slice?'slice':'meet')+'" aria-hidden="true">'+o+'</svg>';
  }
  const emptyThumb=()=>'<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="58" y="38" width="44" height="24" rx="5" style="fill:none;stroke:var(--th-line);stroke-dasharray:4 3"/></svg>';
  function thumbFor(id){ const m=meta(id); const key=id+':'+(m&&m.updated); if(!thumbs.has(key)){ const code=LS.get(CODE+id,''); thumbs.set(key,thumbSVG(code)); } return thumbs.get(key); }

  /* ---- home page ---- */
  const TPL_CARDS=()=>[{id:'ai',name:'Start with AI',desc:'Describe it, Claude draws it',ai:true},{id:'blank',name:'Blank board',desc:'Start from nothing',plus:true},{id:'text',name:'From text',desc:'Type A -> B, get a diagram',text:true},...TEMPLATES.filter(t=>t.id!=='blank').map(t=>({id:t.id,name:t.name,desc:t.desc,code:t.code,tint:t.tint}))];
  const tplThumb=t=>t.ai?'<span class="th-ai">'+(typeof aiSpark==='function'?aiSpark():'')+'</span>':t.plus?'<svg class="i" viewBox="0 0 24 24" style="width:30px;height:30px"><path d="M12 5v14M5 12h14"/></svg>':t.text?'<span class="th-text"><span>A</span><i>→</i><span>B</span></span>':thumbSVG(t.code);
  function renderStatic(){
    renderTeams();
    $('#homeTpl').innerHTML=TPL_CARDS().map(t=>'<button type="button" class="tpl" data-tpl-id="'+t.id+'"'+(t.tint?' style="--tint:'+t.tint+'"':'')+'><span class="th">'+tplThumb(t)+'</span><b>'+esc(t.name)+'</b><small>'+esc(t.desc||'')+'</small></button>').join('');
    const cards=$('#homeTpl').children.length; $('#homeTpl').style.setProperty('--n',Math.ceil(cards/2)); requestAnimationFrame(updTplNav);
    for(const b of document.querySelectorAll('#homeView [data-view]')) b.setAttribute('aria-pressed',String(b.dataset.view===view));
    heroScene(heroAt);
    const hc=$('#heroCode'); if(hc&&!hc.dataset.done){ hc.dataset.done='1'; hc.innerHTML=hlQuick(HERO_TEXT); }
    const ri=$('#heroIcons'); if(ri&&Icons.ready) ri.innerHTML=['pp:power-apps','pp:dataverse','pp:power-automate','pp:copilot-studio','azure:function-apps','azure:key-vaults'].map(k=>{ const ic=iconFor(k); return ic?'<img src="'+ic.uri+'" alt="'+esc(ic.title)+'" title="'+esc(ic.title)+'">':''; }).join('')+'<span>+'+(Icons.byKey.size-6)+' more</span>';
  }
  // The landing shows three short examples in turn: a request, Claude's reply and the board it drew, each in its own style.
  const HERO_SCENES=[
    {tpl:'pp',me:'Map a Power Platform app for employees, with Dataverse, a flow to the on-prem ERP and reports',bot:'Added 9 services and 9 connections in a Power Platform frame, with Entra ID for sign-in.',chips:['9 added','9 connected'],next:'Now plan it out with tickets',typing:'Writing an epic, four stories and a bug'},
    {tpl:'journey',me:'Map the customer journey for buying a bike online: what they do, think and feel',bot:'Five stages with doing, thinking and feeling, plus the pain points and ideas for each.',chips:['30 added','4 connected'],next:'Turn the best ideas into tickets',typing:'Writing five user stories'},
    {tpl:'mind',me:'Mind map our product launch in the Midnight style',bot:'A launch plan with three coloured branches and three ideas on each.',chips:['13 added','12 connected'],next:'Add a branch for sales',typing:'Adding three ideas for sales'}];
  let heroAt=0, heroT=0;
  function heroScene(k){
    const sc=HERO_SCENES[k], t=TEMPLATES.find(x=>x.id===sc.tpl); const board=$('#heroBoard'), chat=$('#heroChat'); if(!board||!chat||!t) return; heroAt=k;
    board.classList.remove('in'); void board.offsetWidth;
    board.innerHTML=typeof tplPreview==='function'?tplPreview(t.code,true):heroSVG(t.code); board.classList.add('in');
    let bg=''; try{ const th=parseMermaid(t.code).model.theme; bg=th&&BOARD_THEMES[th]&&BOARD_THEMES[th].bg||''; }catch(_){}
    board.style.backgroundColor=bg; board.classList.toggle('themed',!!bg);
    $('#heroName').textContent=t.name;
    chat.innerHTML='<div class="sc-msg me">'+esc(sc.me)+'</div><div class="sc-msg bot">'+esc(sc.bot)+'<div class="sc-chips">'+sc.chips.map(c=>'<i>'+esc(c)+'</i>').join('')+'</div></div><div class="sc-msg me">'+esc(sc.next)+'</div><div class="sc-msg bot typing"><span class="sc-dots"><b></b><b></b><b></b></span>'+esc(sc.typing)+'</div><div class="sc-input">Tell Claude what to change…</div>';
    $('#heroDots').innerHTML=HERO_SCENES.map((s,i)=>'<button type="button" role="tab" aria-selected="'+(i===k)+'" aria-label="Example '+(i+1)+'" data-hero="'+i+'"></button>').join('');
    clearTimeout(heroT); heroT=setTimeout(()=>{ if(isHome()&&$('#home').classList.contains('landing')&&!$('#heroShot').matches(':hover')) heroScene((heroAt+1)%HERO_SCENES.length); else heroScene(heroAt); },7000);
  }
  const HERO_TEXT='Power Platform environment {\n  Canvas app\n  Partner portal\n  Help agent\n  Dataverse\n  Cloud flows\n  Reports\n}\n\nEmployees -> Canvas app\nEmployees -> Help agent\nEmployees -> Entra ID: sign in\nCanvas app -> Dataverse\nHelp agent -> Dataverse\nDataverse -> Cloud flows: row changed\nCloud flows -> Data gateway\nData gateway -> On-prem ERP\nDataverse => Reports';
  function heroSVG(code){
    let m; try{ const r=parseMermaid(code); m=r.model; resolveGeometry(m,new Map()); }catch(_){ return ''; }
    const b=contentBounds(m); if(!b) return ''; const pad=36; const boxes=groupBoxes(m);
    let o=groupsMarkup(m,boxes,PAL_LIVE,false)+edgesMarkup(m,boxes,PAL_LIVE,false,'H');
    for(const id of m.nodeOrder){ const n=m.nodes.get(id); o+='<g transform="translate('+n.x+','+n.y+')">'+nodeInner(n,m,PAL_LIVE,false)+'</g>'; }
    return '<svg viewBox="'+[b.x-pad,b.y-pad-24,b.w+pad*2,b.h+pad*2+24].map(Math.round).join(' ')+'" preserveAspectRatio="xMidYMid meet">'+o+'</svg>';
  }
  /* ---- welcome band for returning users: a greeting and a small board scene ---- */
  function greeting(){ const h=new Date().getHours(); const part=h<5?'Good evening':h<12?'Good morning':h<18?'Good afternoon':'Good evening'; const n=typeof Me!=='undefined'&&Me.get(); return n?part+', '+n.split(/\s+/)[0]:part; }
  function renderWelcome(){
    const t=$('#welcomeTitle'); if(t) t.textContent=greeting();
    const art=$('#welcomeArt'); if(!art) return;
    const ic=k=>{ const x=iconFor(k); return x?x.uri:''; };
    const lines=(x,y,w,n,c)=>{ let s=''; for(let i=0;i<n;i++) s+='<rect x="'+x+'" y="'+(y+i*11)+'" width="'+(i===n-1?w*0.6:w)+'" height="4" rx="2" style="fill:'+c+'"/>'; return s; };
    const sticky=(x,y,s,rot,fill)=>'<g transform="translate('+x+' '+y+') rotate('+rot+' '+s/2+' '+s/2+')"><rect width="'+s+'" height="'+s+'" rx="3" fill="'+fill+'" filter="url(#wsh)"/>'+lines(14,20,s-28,3,'rgba(29,32,38,.32)')+'</g>';
    const pa=ic('pp:power-apps'), dv=ic('pp:dataverse'), fn=ic('azure:function-apps');
    art.innerHTML='<svg viewBox="0 0 440 210" role="img">'+
      '<defs><filter id="wsh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#101828" flood-opacity=".16"/></filter>'+
      '<marker id="wah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--fg)"/></marker></defs>'+
      '<path d="M40 176 C 90 168, 150 186, 196 172" stroke="#ffd02f" stroke-width="14" stroke-linecap="round" fill="none" opacity=".55"/>'+
      sticky(22,26,92,-5,'#fff9b1')+sticky(104,92,84,4,'#ffcee0')+sticky(28,124,64,-2,'#a6ccf5')+
      '<g filter="url(#wsh)"><rect x="228" y="34" width="196" height="146" rx="10" style="fill:var(--panel);stroke:var(--line-strong)"/></g>'+
      '<text x="240" y="27" font-size="11" font-weight="600" style="fill:var(--muted)" font-family="Instrument Sans,system-ui,sans-serif">Power Platform</text>'+
      (pa?'<image href="'+pa+'" x="246" y="62" width="40" height="40"/>':'')+(dv?'<image href="'+dv+'" x="358" y="62" width="40" height="40"/>':'')+(fn?'<image href="'+fn+'" x="302" y="122" width="38" height="38"/>':'')+
      lines(244,110,48,1,'var(--line-strong)')+lines(356,110,48,1,'var(--line-strong)')+
      '<path d="M292 82 H352" style="stroke:var(--fg)" stroke-width="2" fill="none" marker-end="url(#wah)"/>'+
      '<path d="M378 106 C 378 132, 362 140, 344 140" style="stroke:var(--fg)" stroke-width="2" fill="none" marker-end="url(#wah)" stroke-dasharray="4 4"/>'+
      '<path d="M118 52 C 160 30, 196 40, 236 66" stroke="#4262ff" stroke-width="2.2" fill="none" marker-end="url(#wah)"/>'+
      '</svg>';
  }
  function iconsReady(){ thumbs.clear(); renderStatic(); if(isHome()) renderRecents(); }
  function when(t){
    if(!t) return ''; const d=new Date(t),n=new Date(); const day=x=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
    const diff=Math.round((day(n)-day(d))/864e5); const hm=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(diff===0) return 'Today, '+hm; if(diff===1) return 'Yesterday, '+hm;
    return d.toLocaleDateString([],{day:'numeric',month:'short',year:d.getFullYear()===n.getFullYear()?undefined:'numeric'});
  }
  function renderRecents(){
    const el=$('#homeRecents'); const items=[...list].sort((a,b)=>(b.opened||0)-(a.opened||0));
    $('#home').classList.toggle('landing',!items.length); $('#recentsSec').hidden=!items.length; renderWelcome();
    if(!items.length){ el.innerHTML=''; return; }
    el.className='recents '+view; const ra=$('#removeAllBtn'); if(ra) ra.hidden=view!=='grid';
    if(view==='grid') el.innerHTML=items.map(b=>'<div class="rc" data-board="'+b.id+'"><button type="button" class="rc-open" data-open="'+b.id+'"><span class="th">'+thumbFor(b.id)+'</span><b>'+esc(b.title||'Untitled board')+'</b><small>'+(b.file&&b.dir?ico('folder')+esc(b.file)+' · ':'')+'Edited '+esc(when(b.updated))+'</small></button><button type="button" class="ibtn rc-more" data-more="'+b.id+'" title="More" aria-label="More actions"><svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg></button></div>').join('');
    else el.innerHTML='<div class="rl-head"><span>Name</span><span>Last opened</span><span>Edited</span><span class="rl-act"><button type="button" class="ibtn" data-remove-all title="Delete all boards" aria-label="Delete all boards">'+ico('trash')+'</button></span></div>'+items.map(b=>'<div class="rl" data-board="'+b.id+'"><button type="button" class="rl-open" data-open="'+b.id+'"><span class="th">'+thumbFor(b.id)+'</span><span class="nm"><b>'+esc(b.title||'Untitled board')+'</b><small>'+(b.file&&b.dir?ico('folder')+esc(b.dir+'/'+b.file):'Created '+esc(when(b.created)))+'</small></span></button><span class="cell">'+esc(when(b.opened))+'</span><span class="cell">'+esc(when(b.updated))+'</span><button type="button" class="ibtn rc-more" data-more="'+b.id+'" title="More" aria-label="More actions"><svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg></button></div>').join('');
  }
  function boardMenu(id,anchor){
    const mn=$('#homeMenu'); mn.dataset.id=id; const mv=mn.querySelector('[data-hm=move]'); if(mv){ mv.hidden=!Folder.ready()||linked(meta(id)); mv.querySelector('b').textContent='Save to '+Folder.name(); } mn.hidden=false;
    const r=anchor.getBoundingClientRect(); const w=200;
    const h=mn.offsetHeight; let top=r.bottom+6; if(top+h>window.innerHeight-8) top=Math.max(8,r.top-h-6);
    mn.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.right-w))+'px'; mn.style.top=top+'px';
  }
  function rename(id){
    const m=meta(id); if(!m) return;
    openModal('Rename board','<input id="renameIn" class="modal-input" value="'+esc(m.title||'')+'" aria-label="Board name" spellcheck="false">',[{label:'Rename',primary:true,run:()=>{ const v=$('#renameIn').value.trim()||'Untitled board'; const code=LS.get(CODE+id,'flowchart LR\n'); const nc=setTitleInCode(code,v); LS.set(CODE+id,nc); m.title=v; m.updated=now(); saveList(); if(current===id){ lastSaved.set(id,nc); } closeModal(); renderRecents();
      if(linked(m)&&Folder.ready()){ m.renameTo=v; Folder.write(m,nc,LS.get(IMGS+id,{})||{}); } }}]);
    setTimeout(()=>{ const i=$('#renameIn'); if(i){ i.focus(); i.select(); i.addEventListener('keydown',e=>{ if(e.key==='Enter') $('#modalFoot [data-mb="0"]').click(); }); } },30);
  }
  function duplicate(id){
    const m=meta(id); if(!m) return; const code=LS.get(CODE+id,'flowchart LR\n'); const nid=create(code,(m.title||'Untitled board')+' copy');
    LS.set(IMGS+nid,LS.get(IMGS+id,{})||{}); renderRecents(); toast('Duplicated');
  }
  function remove(id){
    const m=meta(id); if(!m) return;
    const inFolder=linked(m)&&Folder.ready();
    openModal('Delete board','<p>Delete "'+esc(m.title||'Untitled board')+'"? '+(inFolder?'This also deletes <b>'+esc(m.file)+'</b> from '+esc(m.dir)+'.':'This removes it from this browser.')+' It can\'t be undone.</p>',[{label:'Delete board',primary:true,run:()=>{ if(inFolder) Folder.removeFile(m.file); try{ localStorage.removeItem(CODE+id); localStorage.removeItem(IMGS+id); }catch(_){} list=list.filter(b=>b.id!==id); saveList(); if(current===id) current=null; closeModal(); renderRecents(); toast('Board deleted'); }}]);
  }
  // A new board with the AI tab open, ready to type.
  /* ---- landing: a starting point for each kind of team, with an AI step to try next ---- */
  const TEAMS=[
    {id:'arch',name:'Cloud architects',tpl:'webapp',say:'Draw the system with real Azure icons, then let Claude fill the gaps and write it up.',ask:'Expand this with monitoring, secrets and a staging slot, and explain the design in a doc'},
    {id:'pp',name:'Power Platform makers',tpl:'pp',say:'Map apps, flows, Dataverse and agents, then turn the plan into tables and tickets.',ask:'Plan this out with a spec doc, the Dataverse tables and tickets for the work'},
    {id:'agile',name:'Agile teams',tpl:'retro',say:'Run a retro on sticky notes. Claude groups them by theme and turns actions into tickets.',ask:'Group these notes by theme and turn the action items into tickets'},
    {id:'product',name:'Product and design',tpl:'brainstorm',say:'Collect ideas, then sketch simple phone, iPad and desktop screens next to them.',ask:'Turn the best ideas into a login, a home page and a profile screen for mobile'}];
  let team=TEAMS[0].id;
  function renderTeams(){
    const tabs=$('#teamTabs'), card=$('#teamCard'); if(!tabs) return;
    tabs.innerHTML=TEAMS.map(t=>'<button type="button" role="tab" data-team="'+t.id+'" aria-selected="'+(t.id===team)+'">'+esc(t.name)+'</button>').join('');
    const t=TEAMS.find(x=>x.id===team), tp=TEMPLATES.find(x=>x.id===t.tpl); if(!tp){ card.innerHTML=''; return; }
    card.innerHTML='<div class="team-text"><p>'+esc(t.say)+'</p><div class="team-ask"><span class="ai-mk">'+(typeof aiSpark==='function'?aiSpark():'')+'</span><span>Then ask: <b>'+esc(t.ask)+'</b></span></div>'+
      '<div class="team-cta"><button type="button" class="btn primary" data-team-go="ai">Open it and ask Claude</button><button type="button" class="btn" data-team-go="open">Just open the board</button></div></div>'+
      '<button type="button" class="team-th" data-team-go="open" aria-label="Open '+esc(tp.name)+'"><span class="th">'+tplThumb(tp)+'</span><small>'+esc(tp.name)+'</small></button>';
  }
  $('#teamTabs').addEventListener('click',e=>{ const b=e.target.closest('[data-team]'); if(!b) return; team=b.dataset.team; renderTeams(); });
  $('#teamCard').addEventListener('click',e=>{ const b=e.target.closest('[data-team-go]'); if(!b) return; const t=TEAMS.find(x=>x.id===team), tp=TEMPLATES.find(x=>x.id===t.tpl); if(!tp) return;
    openNew(tp.code); if(b.dataset.teamGo==='ai') setTimeout(()=>{ openAITab(); const i=$('#aiIn'); if(i){ i.value=t.ask; if(!i.disabled) i.focus(); } },120); });
  function startWithAI(){ openNew('flowchart LR\n','Untitled board'); setTimeout(()=>{ if(typeof openAITab==='function') openAITab(); },80); }
  function removeAll(){
    const own=list.filter(b=>!linked(b)); const n=own.length;
    if(!n){ toast('Every board here is a file in '+Folder.name()+'. Delete files there, or one by one here.'); return; }
    openModal('Delete all boards','<p>Delete all '+n+(n===1?' board':' boards')+' kept in this browser? This can\'t be undone. Export board files first for anything you want to keep.'+(n<list.length?' Boards saved in your folder are not touched.':'')+'</p>',[{label:'Delete '+n+(n===1?' board':' boards'),primary:true,run:()=>{
      for(const b of own){ try{ localStorage.removeItem(CODE+b.id); localStorage.removeItem(IMGS+b.id); }catch(_){} }
      list=list.filter(b=>linked(b)); saveList(); if(!meta(current)) current=null; thumbs.clear(); closeModal(); renderRecents(); toast('Deleted '+n+(n===1?' board':' boards')); }}]);
  }
  function exportFile(id){ open(id); setTimeout(()=>{ const b=document.querySelector('#exportMenu [data-export=json]'); if(b) b.click(); },120); }

  // wiring
  // Templates: two rows that scroll sideways, with arrow buttons for mouse users.
  function updTplNav(){
    const r=$('#homeTpl'), nav=$('#tplNav'); if(!r||!nav) return;
    const over=r.scrollWidth>r.clientWidth+4; nav.hidden=!over; if(!over) return;
    nav.querySelector('[data-tpl-dir="-1"]').disabled=r.scrollLeft<=4;
    nav.querySelector('[data-tpl-dir="1"]').disabled=r.scrollLeft+r.clientWidth>=r.scrollWidth-4;
  }
  $('#tplNav').addEventListener('click',e=>{ const b=e.target.closest('[data-tpl-dir]'); if(!b) return; const r=$('#homeTpl'); r.scrollBy({left:+b.dataset.tplDir*r.clientWidth*0.8,behavior:'smooth'}); });
  $('#homeTpl').addEventListener('scroll',updTplNav,{passive:true});
  $('#heroDots').addEventListener('click',e=>{ const b=e.target.closest('[data-hero]'); if(b) heroScene(+b.dataset.hero); });
  $('#folderTip').addEventListener('click',e=>{ const b=e.target.closest('[data-ft]'); if(!b) return; if(b.dataset.ft==='choose') Folder.choose(); else { LS.set('orim.folderTip','no'); $('#folderTip').hidden=true; toast('Boards stay in this browser. You can choose a folder any time from the top of this page.'); } });
  $('#homeAllTpl').addEventListener('click',()=>openTemplates());
  window.addEventListener('resize',updTplNav);
  $('#homeTpl').addEventListener('click',e=>{
    const b=e.target.closest('[data-tpl-id]'); if(!b) return; const id=b.dataset.tplId;
    if(id==='ai'){ startWithAI(); return; }
    if(id==='blank'){ openNew('flowchart LR\n','Untitled board'); return; }
    if(id==='text'){ openQuickText(true); return; }
    const t=TEMPLATES.find(x=>x.id===id); if(t) openNew(t.code);
  });
  $('#homeRecents').addEventListener('click',e=>{
    if(e.target.closest('[data-remove-all]')){ removeAll(); return; }
    const mo=e.target.closest('[data-more]'); if(mo){ e.stopPropagation(); boardMenu(mo.dataset.more,mo); return; }
    const op=e.target.closest('[data-open]'); if(op) open(op.dataset.open);
  });
  $('#homeMenu').addEventListener('click',e=>{ const b=e.target.closest('[data-hm]'); if(!b) return; const id=$('#homeMenu').dataset.id; $('#homeMenu').hidden=true;
    ({open,rename,duplicate,remove,export:exportFile,move:moveToFolder})[b.dataset.hm](id); });
  $('#homeFolder').addEventListener('click',folderMenu);
  $('#fileState').addEventListener('click',()=>{ const mn=$('#saveMenu'); if(!mn.hidden){ mn.hidden=true; return; } saveMenu(); });
  // New or changed files in the folder show up when you come back to the home page.
  const rescan=()=>{ if(isHome()&&Folder.ready()&&document.visibilityState==='visible') Folder.scan().then(()=>renderRecents()); };
  document.addEventListener('visibilitychange',rescan); window.addEventListener('focus',rescan);
  document.addEventListener('click',e=>{ if(!e.target.closest('#homeMenu')&&!e.target.closest('[data-more]')) $('#homeMenu').hidden=true; });
  $('#removeAllBtn').addEventListener('click',removeAll);
  $('#homeView').addEventListener('click',e=>{ const b=e.target.closest('[data-view]'); if(!b) return; view=b.dataset.view; LS.set('orim.homeView',view); renderStatic(); renderRecents(); });
  $('#homeNew').addEventListener('click',()=>openNew('flowchart LR\n','Untitled board'));
  $('#heroStart').addEventListener('click',()=>openNew('flowchart LR\n','Untitled board'));
  $('#heroAI').addEventListener('click',startWithAI);
  $('#heroText').addEventListener('click',()=>openQuickText(true));
  $('#heroTry').addEventListener('click',()=>{ const t=TEMPLATES.find(x=>x.id==='pp'); if(t) openNew(t.code); });
  $('#homeImport').addEventListener('click',()=>$('#fileIn').click());
  $('.welcome-cta').addEventListener('click',e=>{ const b=e.target.closest('[data-welcome]'); if(!b) return; const k=b.dataset.welcome; if(k==='new') openNew('flowchart LR\n','Untitled board'); else if(k==='ai') startWithAI(); else if(k==='text') openQuickText(true); else $('#fileIn').click(); });
  $('#homeTheme').addEventListener('click',()=>$('#themeBtn').click());
  $('#homeBtn').addEventListener('click',showHome);

  return {init,open,openNew,create,showHome,persist,isHome,iconsReady,current:()=>current,thumbSVG,syncFolder,folderChanged,metaChanged,fileConflict};
})();
