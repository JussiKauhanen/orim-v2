/* orim · state.js
 * App state, undo and redo history, parse and commit cycle.
 */
'use strict';
const state={
  code:'',model:null,errors:[],fatal:false,cache:new Map(),boxes:new Map(),
  sel:new Set(),view:{x:0,y:0,z:1},tool:'select',hover:null,drag:null,editing:null,
  mode:LS.get('mab.mode','split'),showLayout:LS.get('mab.showLayout',false),libOpen:LS.get('mab.lib',!matchMedia('(max-width:760px)').matches),
  libFilter:'all',libQuery:'',pick:null,clip:null,pasteN:0,dropGroup:null
};
const H={stack:[],i:-1,timer:0};

function histPush(code){
  if(H.stack[H.i]===code) return;
  H.stack=H.stack.slice(0,H.i+1); H.stack.push(code);
  if(H.stack.length>300) H.stack.shift();
  H.i=H.stack.length-1; updUndo();
}
function flushEditorHist(){ if(H.timer){ clearTimeout(H.timer); H.timer=0; if(state.emode==='text'&&state.textTyping){ clearTimeout(parseT); applyQuickText(ta.value); state.textTyping=false; } else idleSyncLayout(); histPush(state.code); } }
function updUndo(){ $('#undoBtn').disabled=H.i<=0; $('#redoBtn').disabled=H.i>=H.stack.length-1; }
$('#undoBtn').addEventListener('click',()=>undo());
$('#redoBtn').addEventListener('click',()=>redo());
function undo(){ flushEditorHist(); if(H.i<=0) return; H.i--; loadCode(H.stack[H.i],{history:false}); updUndo(); }
function redo(){ flushEditorHist(); if(H.i>=H.stack.length-1) return; H.i++; loadCode(H.stack[H.i],{history:false}); updUndo(); }

function reparse(){
  const r=parseMermaid(state.code);
  state.errors=r.errors.slice();
  if(r.fatal){ state.errors.unshift(r.fatal); state.fatal=true; updStatus(); return; }
  state.fatal=false;
  resolveGeometry(r.model,state.cache);
  state.model=r.model;
  for(const k of [...state.sel]){
    const t=k[0],id=k.slice(2);
    if((t==='n'&&!r.model.nodes.has(id))||(t==='g'&&!r.model.groups.has(id))||(t==='e'&&!(+id<r.model.edges.length))||(t==='k'&&!r.model.inks.some(x=>x.id===id))||(t==='a'&&!r.model.arrows.some(x=>x.id===id))||(t==='p'&&!r.model.images.some(x=>x.id===id))) state.sel.delete(k);
  }
  updStatus();
}
let saveT=0;
function usedImages(){ const out={}; for(const im of (state.model&&state.model.images)||[]) if(IMG[im.id]) out[im.id]=IMG[im.id]; return out; }
function saveLocal(){ clearTimeout(saveT); saveT=setTimeout(saveNow,300); }
function saveNow(){ clearTimeout(saveT); if(typeof Boards!=='undefined') Boards.persist(); }
function loadCode(code,{history=true,clearCache=false}={}){
  if(clearCache) state.cache.clear();
  state.code=code; reparse();
  if(state.model&&!state.errors.length){ const want=replaceLayout(state.code,state.model); if(want!==state.code&&!layoutPart(state.code).length) state.code=want; }
  if(history) histPush(state.code);
  setEditorFromCode(); syncTitle(); render(); saveLocal();
}
function commitCode(code){
  flushEditorHist();
  state.code=code; histPush(code); reparse(); setEditorFromCode(); syncTitle(); render(); saveLocal();
}
function mutate(fn,{structural=true}={}){
  const m=state.model; if(!m) return;
  if(state.fatal){ toast('Fix the diagram type in the code first'); return; }
  const hadErr=state.errors.length>0;
  fn(m);
  commitCode(structural?serializeMermaid(m):replaceLayout(state.code,m));
  if(hadErr&&structural) toast('Code with errors was kept at the end of the file');
}
function idleSyncLayout(){
  if(state.showLayout||!state.model||state.errors.length) return;
  const want=replaceLayout(state.code,state.model);
  if(want!==state.code) state.code=want;
}
