/* orim · templates.js
 * Templates menu and file import.
 */
'use strict';
// Templates open in a picker: the list on the left, a coloured preview and the suggested next step on the right.
function tplPreview(code,clear){
  let m; try{ const r=parseMermaid(code); m=r.model; resolveGeometry(m,new Map()); }catch(_){ return ''; }
  const b=contentBounds(m); if(!b) return ''; const P=palExport(m); const boxes=groupBoxes(m); const pad=40;
  let o=(P.bg?'<rect x="'+(b.x-pad*4)+'" y="'+(b.y-pad*4)+'" width="'+(b.w+pad*8)+'" height="'+(b.h+pad*8)+'" style="fill:'+P.bg+'"/>':'')+'<defs>'+markerDefs(P,'T')+'</defs>'+groupsMarkup(m,boxes,P,false)+edgesMarkup(m,boxes,P,false,'T');
  const topE=edgesMarkup.top; for(const id of m.nodeOrder){ const n=m.nodes.get(id); o+='<g transform="translate('+n.x+','+n.y+')">'+nodeInner(n,m,P,false)+'</g>'; } o+=topE;
  return '<svg viewBox="'+[b.x-pad,b.y-pad-24,b.w+pad*2,b.h+pad*2+24].map(Math.round).join(' ')+'" preserveAspectRatio="xMidYMid meet" style="background:'+(P.bg||(clear?'transparent':'#ffffff'))+'">'+o+'</svg>';
}
// The picker, like Miro's: categories on the left, a search box, and a grid of coloured previews.
let tplCat='all', tplQ=''; const tplPrev=new Map();
const prevOf=t=>{ if(!tplPrev.has(t.id)) tplPrev.set(t.id,tplPreview(t.code,true)); return tplPrev.get(t.id); };
function openTemplates(){
  const el=$('#tplPicker');
  const nav=(id,label,icon,n)=>'<button type="button" class="tp-nav" data-tp-cat="'+id+'" aria-pressed="'+(tplCat===id)+'">'+ico(icon)+'<span>'+label+'</span>'+(n!=null?'<em>'+n+'</em>':'')+'</button>';
  el.querySelector('.tp-side').innerHTML=nav('all','All templates','library',TEMPLATES.length)+'<button type="button" class="tp-nav" data-quick="1">'+ico('text')+'<span>From text</span></button>'+
    '<div class="tp-cat">Use cases</div>'+TPL_CATS.map(c=>{ const n=TEMPLATES.filter(t=>t.cat===c).length; return n?nav(c,c,{Architecture:'shapes',Diagrams:'diamond',Workshops:'sticky',Planning:'ticket',Basics:'rect'}[c]||'rect',n):''; }).join('');
  el.hidden=false; showTpls(); setTimeout(()=>{ const q=el.querySelector('#tpSearch'); if(q&&matchMedia('(pointer:fine)').matches) q.focus(); },30);
}
function showTpls(){
  const el=$('#tplPicker'); for(const b of el.querySelectorAll('[data-tp-cat]')) b.setAttribute('aria-pressed',String(b.dataset.tpCat===tplCat));
  const q=tplQ.trim().toLowerCase();
  const L=TEMPLATES.filter(t=>(tplCat==='all'||t.cat===tplCat)&&(!q||(t.name+' '+t.desc+' '+t.cat+' '+(t.next||'')).toLowerCase().includes(q)));
  let theme=t=>{ try{ const th=parseMermaid(t.code).model.theme; return th&&BOARD_THEMES[th]?BOARD_THEMES[th]:null; }catch(_){ return null; } };
  el.querySelector('#tpTitle').textContent=q?'Results for "'+tplQ.trim()+'"':tplCat==='all'?'All templates':tplCat;
  el.querySelector('.tp-grid').innerHTML=L.length?L.map(t=>{ const th=theme(t);
    return '<div class="tp-card" data-tpl-use-id="'+t.id+'" tabindex="0" role="button" aria-label="Use '+esc(t.name)+'"'+(t.next?' title="Then ask Claude: '+esc(t.next)+'"':'')+'>'+
      '<div class="tp-thumb" style="background:'+(th?th.bg:(t.tint?'color-mix(in srgb,'+t.tint+' 55%,var(--panel))':'var(--panel-2)'))+'">'+prevOf(t)+
      (t.next?'<button type="button" class="tp-ai" data-tpl-ai="'+t.id+'" title="Use it and ask Claude: '+esc(t.next)+'" aria-label="Use and ask Claude">'+aiSpark()+'</button>':'')+'</div>'+
      '<b>'+esc(t.name)+'</b><small>'+esc(t.desc)+(th?' · '+esc(th.name):'')+'</small></div>'; }).join(''):'<p class="tp-none">No templates match. Try another word, or start from text.</p>';
}
function useTemplate(t,ask){
  $('#tplPicker').hidden=true;
  const m=state.model, empty=!Boards.isHome()&&(!m||(!m.nodes.size&&!m.groups.size&&!m.inks.length&&!m.images.length));
  // An empty board takes the template; otherwise it opens as a new board, so nothing is replaced.
  if(empty){ flushEditorHist(); state.sel.clear(); loadCode(t.code,{clearCache:true}); requestAnimationFrame(fit); toast('Loaded "'+t.name+'"'); }
  else { Boards.openNew(t.code); toast('Opened "'+t.name+'" as a new board'); }
  if(ask&&t.next) setTimeout(()=>{ openAITab(); const i=$('#aiIn'); if(i){ i.value=t.next; if(!i.disabled) i.focus(); } },150);
}
$('#tplPicker').addEventListener('click',e=>{
  if(e.target.id==='tplPicker'||e.target.closest('[data-tp-close]')){ $('#tplPicker').hidden=true; return; }
  if(e.target.closest('[data-quick]')){ $('#tplPicker').hidden=true; openQuickText(); return; }
  const c=e.target.closest('[data-tp-cat]'); if(c){ tplCat=c.dataset.tpCat; tplQ=''; $('#tpSearch').value=''; showTpls(); return; }
  const ai=e.target.closest('[data-tpl-ai]'); if(ai){ const t=TEMPLATES.find(x=>x.id===ai.dataset.tplAi); if(t) useTemplate(t,true); return; }
  const u=e.target.closest('[data-tpl-use-id]'); if(u){ const t=TEMPLATES.find(x=>x.id===u.dataset.tplUseId); if(t) useTemplate(t,false); }
});
$('#tplPicker').addEventListener('keydown',e=>{ const u=e.target.closest&&e.target.closest('[data-tpl-use-id]'); if(u&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); u.click(); } e.stopPropagation(); });
$('#tpSearch').addEventListener('input',e=>{ tplQ=e.target.value; if(tplQ.trim()) tplCat='all'; showTpls(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('#tplPicker').hidden){ e.stopPropagation(); $('#tplPicker').hidden=true; } },true);
$('#importBtn').addEventListener('click',()=>$('#fileIn').click());
$('#imgIn').addEventListener('change',e=>{ const f=e.target.files; if(f&&f.length) addImageFiles([...f],null); e.target.value=''; });
$('#fileIn').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0]; e.target.value=''; if(!f) return;
  const text=await f.text();
  if(Boards.isHome()) Boards.openNew('flowchart LR\n','Untitled board');
  if(/\.json$/i.test(f.name)){ try{ const j=JSON.parse(text); if(typeof j.code==='string'){ if(j.images&&typeof j.images==='object') for(const [k,v] of Object.entries(j.images)) if(typeof v==='string'&&v.startsWith('data:image/')) IMG[k]=v; importText(j.code,f.name); return; } }catch(_){} toast('That JSON file is not a board file from this editor'); return; }
  importText(text,f.name);
});
function importText(text,name){
  let code=text; const fence=/```mermaid\s*\n([\s\S]*?)```/.exec(text); if(fence) code=fence[1];
  if(!/(^|\n)\s*(flowchart|graph)\b/.test(code)){ toast('No flowchart found in '+name); return; }
  flushEditorHist(); state.sel.clear(); loadCode(code.replace(/\s+$/,'')+'\n',{clearCache:true}); requestAnimationFrame(fit); toast('Imported '+name);
}
