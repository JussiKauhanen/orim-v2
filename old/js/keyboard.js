/* orim · keyboard.js
 * Keyboard shortcuts and clipboard paste.
 */
'use strict';
document.addEventListener('keydown',e=>{
  if(Boards.isHome()){ if(e.key==='Escape'){ $('#homeMenu').hidden=true; closeModal(); } return; }
  const t=e.target; const inField=t&&t.closest&&t.closest('input,textarea,select,[contenteditable="true"]');
  const mod=e.metaKey||e.ctrlKey; const key=e.key.toLowerCase();
  if(mod&&(key==='z'||key==='y')){
    if(inField&&t!==ta) return;
    e.preventDefault(); (key==='y'||e.shiftKey)?redo():undo(); return;
  }
  if(e.altKey&&!mod&&['1','2'].includes(e.key)){ e.preventDefault(); setMode(['split','canvas'][+e.key-1]); return; }
  if(inField) return;
  if(e.key==='Escape'&&state.fly){ e.preventDefault(); closeFly(); return; }
  if(e.key==='Escape'&&cmOpen){ e.preventDefault(); cmClose(); return; }
  if(e.key==='Escape'){ hideFrameOffer(); closeMenus(); closePop(); $('#help').hidden=true; if(state.pick){endPick();return;} if(state.pendingFrom){state.pendingFrom=null;renderOverlay();return;} if(state.tool!=='select'){setTool('select');return;} if(state.sel.size){state.sel.clear();selChanged();} return; }
  if(e.key===' '){ if(!spaceDown){ spaceDown=true; board.classList.add('t-hand'); } e.preventDefault(); return; }
  if(mod&&key==='a'){ e.preventDefault(); const m=state.model; if(!m) return; state.sel=new Set([...m.nodeOrder.map(id=>'n:'+id)]); selChanged(); return; }
  if(mod&&key==='c'){ if(copySel()){ e.preventDefault(); state.clipWritten=false; try{ const pr=navigator.clipboard&&navigator.clipboard.writeText(CLIP_MARK+' '+Date.now()); if(pr) pr.then(()=>{state.clipWritten=true;},()=>{}); }catch(_){} toast('Copied'); } return; }
  if(mod&&key==='x'){ if(copySel()){ e.preventDefault(); deleteSel(); } return; }
  if(mod&&key==='v'){ if(state.clip&&!state.clipWritten){ e.preventDefault(); pasteClip(); } return; }
  if(mod&&key==='d'){ e.preventDefault(); const gs=[...state.sel].filter(k=>k[0]==='g'); if(gs.length===1&&state.sel.size===1){ dupFrame(gs[0].slice(2)); return; } if(copySel()){ state.pasteN=0; pasteClip(); } return; }
  if(mod&&key==='g'){ e.preventDefault(); e.shiftKey?ungroupSel():groupSel(); return; }
  if(mod&&(key==='='||key==='+')){ e.preventDefault(); const r=boardRect(); zoomAt(1.2,r.width/2,r.height/2); return; }
  if(mod&&key==='-'){ e.preventDefault(); const r=boardRect(); zoomAt(1/1.2,r.width/2,r.height/2); return; }
  if(mod&&key==='0'){ e.preventDefault(); const r=boardRect(); zoomAt(1/state.view.z,r.width/2,r.height/2); return; }
  if(mod&&(key==='b'||key==='i')&&selNodes().length){ e.preventDefault(); toggleTextStyle(key==='b'?'bold':'italic'); return; }
  if(mod) return;
  if(e.key==='Delete'||e.key==='Backspace'){ if(state.sel.size){ e.preventDefault(); deleteSel(); } return; }
  if(e.key==='Enter'){ const k=[...state.sel]; if(k.length===1){ e.preventDefault(); openEditor(k[0][0]==='n'?'node':k[0][0]==='e'?'edge':'group',k[0][0]==='e'?+k[0].slice(2):k[0].slice(2)); } return; }
  if(e.key.startsWith('Arrow')&&state.sel.size){ e.preventDefault(); const s=e.shiftKey?1:GRID; nudge(e.key==='ArrowLeft'?-s:e.key==='ArrowRight'?s:0,e.key==='ArrowUp'?-s:e.key==='ArrowDown'?s:0); return; }
  if(e.shiftKey&&(e.code==='Digit1')){ e.preventDefault(); fit(); return; }
  if(e.shiftKey&&key==='l'){ e.preventDefault(); lineUp(); return; }
  if(e.key.length===1&&!e.altKey&&state.sel.size===1&&[...state.sel][0][0]==='n'&&e.key!==' '){
    const id=[...state.sel][0].slice(2); const n=state.model&&state.model.nodes.get(id);
    if(n&&(n.shape==='table'||n.shape==='doc')){ if(e.key==='Enter'){ e.preventDefault(); openEditor('node',id); } return; }
    if(n&&n.shape!=='icon'){ e.preventDefault(); openEditor('node',id); const ed=state.editing; if(ed){ ed.el.value=e.key; ed.el.setSelectionRange(1,1); placeEditor(); } return; }
  }
  if(e.shiftKey&&key==='p'){ e.preventDefault(); setTool('hl'); return; }
  const map={v:'select',h:'hand',r:'rect',o:'circle',d:'diamond',b:'cyl',t:'text',a:'connector',c:'comment',f:'frame',i:'library',n:'sticky',p:'pen',e:'eraser',s:'shapes'};
  if(map[key]&&!e.shiftKey&&!e.altKey){ e.preventDefault(); setTool(map[key]); }
});
document.addEventListener('keyup',e=>{ if(e.key===' '){ spaceDown=false; updTools(); } });
const CLIP_MARK='%% mermaid-board-clip';
function looksMermaid(t){ return /^\s*(---\s*\n|%%|flowchart\b|graph\b)/.test(t)||/```mermaid\s*\n\s*(---[\s\S]*?---\s*\n\s*)?(%%[^\n]*\n\s*)*(flowchart|graph)\b/.test(t); }
document.addEventListener('paste',e=>{
  // Pasting into a text field, a table cell or a document stays there; only the board itself takes pastes.
  const t=e.target; if(e.defaultPrevented||(t&&t.closest&&t.closest('input,textarea,[contenteditable],.rich-box,.rich-bar'))) return;
  const files=[]; for(const it of (e.clipboardData&&e.clipboardData.items)||[]) if(it.kind==='file'&&/^image\//.test(it.type)){ const f=it.getAsFile(); if(f) files.push(f); }
  if(Boards.isHome()){
    const tx=(e.clipboardData&&e.clipboardData.getData('text/plain'))||'';
    if(!files.length&&!tx.trim()) return; e.preventDefault();
    Boards.openNew('flowchart LR\n','Untitled board');
    requestAnimationFrame(()=>{ if(files.length) addImageFiles(files,null); else if(looksMermaid(tx)) importText(tx,'clipboard'); else quickToBoard(tx,true,true); });
    return;
  }
  if(files.length){ e.preventDefault(); addImageFiles(files,null); return; }
  const text=(e.clipboardData&&e.clipboardData.getData('text/plain'))||'';
  if(text.startsWith(CLIP_MARK)||(!text.trim()&&state.clip)){ if(state.clip){ e.preventDefault(); pasteClip(); } return; }
  if(!text.trim()) return;
  e.preventDefault();
  // Cells from Excel or a CSV become a table, or fill the selected table.
  const grid=!looksMermaid(text)&&parseGrid(text);
  if(grid&&!state.fatal){ const sel=[...state.sel].filter(k=>k[0]==='n').map(k=>state.model.nodes.get(k.slice(2)));
    if(sel.length===1&&sel[0]&&sel[0].shape==='table'){ const id=sel[0].id; mutate(mm=>{ const n=mm.nodes.get(id); n.table={rows:grid,colors:{}}; n.sized=false; sizeNode(n); }); toast('Table filled from the clipboard'); return; }
    const r=boardRect(); const c=toWorld({clientX:r.left+r.width/2,clientY:r.top+r.height/2});
    const id=createNode({shape:'table',label:'Table',idBase:'table',cx:c.x,cy:c.y,table:{rows:grid,colors:{}}}); if(id){ state.sel=new Set(['n:'+id]); selChanged(); } toast('Pasted as a table: '+grid.length+' rows, '+grid[0].length+' columns'); return; }
  if(looksMermaid(text)) importText(text,'clipboard');
  else quickToBoard(text,false,true);
});
