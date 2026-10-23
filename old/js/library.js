/* orim · library.js
 * Icon library panel.
 */
'use strict';
const COMMON=['azure:function-apps','azure:app-services','azure:static-apps','azure:api-management-services','azure:logic-apps','azure:azure-service-bus','azure:event-grid-topics','azure:sql-database','azure:azure-cosmos-db','azure:storage-accounts','azure:key-vaults','azure:entra-id','azure:users','azure:application-insights','azure:azure-openai','azure:ai-foundry','azure:front-door-and-cdn-profiles','azure:virtual-networks','azure:container-apps-environments','azure:kubernetes-services','azure:data-factories','azure:bot-services','azure:on-premises-data-gateways','azure:azure-devops'];
function tileHTML(ic){ return '<button type="button" class="tile" draggable="true" data-key="'+ic.key+'" title="'+esc(ic.title)+'\n'+ic.key+'"><img src="'+ic.uri+'" alt="" decoding="async" loading="lazy"><span>'+esc(ic.title)+'</span></button>'; }
function secHTML(title,icons,open){ return '<details class="lib-sec"'+(open?' open':'')+'><summary>'+ico('chev')+esc(title)+'<em>'+icons.length+'</em></summary><div class="grid">'+icons.map(tileHTML).join('')+'</div></details>'; }
function renderLibrary(){
  const chips=$('#libChips'); const F=[['all','All'],['pp','Power Platform'],['d365','Dynamics 365'],['azure','Azure']];
  chips.innerHTML=F.map(([id,t])=>'<button type="button" data-f="'+id+'" aria-pressed="'+(state.libFilter===id)+'">'+t+'</button>').join('');
  const body=$('#libBody');
  if(Icons.failed){ body.innerHTML='<div class="lib-empty">The icon pack could not be loaded. Shapes and Mermaid code still work.</div>'; return; }
  if(!Icons.ready){ body.innerHTML='<div class="lib-empty">Loading icons…</div>'; return; }
  const total=Icons.byKey.size; $('#libSearch').placeholder='Search '+total+' icons';
  const qv=state.libQuery.trim().toLowerCase(); const f=state.libFilter;
  const packs=Icons.packs.filter(p=>f==='all'||p.id===f);
  let html='';
  if(qv){
    const words=qv.split(/\s+/); const hits=[];
    for(const p of packs) for(const ic of p.icons){ const hay=(ic.title+' '+ic.id+' '+ic.cat+' '+ic.packTitle).toLowerCase(); if(words.every(w=>hay.includes(w))) hits.push(ic); }
    hits.sort((a,b)=>(a.title.toLowerCase().startsWith(qv)?0:1)-(b.title.toLowerCase().startsWith(qv)?0:1));
    html=hits.length?'<div class="grid" style="padding-top:4px">'+hits.slice(0,240).map(tileHTML).join('')+'</div>':'<div class="lib-empty">No icons match "'+esc(state.libQuery)+'"</div>';
  } else {
    for(const p of packs){
      if(p.id==='azure'){
        if(f==='all'){ const common=COMMON.map(k=>Icons.byKey.get(k)).filter(Boolean); html+=secHTML('Common Azure',common,true); }
        const cats=new Map(); for(const ic of p.icons){ if(!cats.has(ic.cat)) cats.set(ic.cat,[]); cats.get(ic.cat).push(ic); }
        for(const [c,list] of [...cats].sort((a,b)=>a[0].localeCompare(b[0]))) html+=secHTML('Azure · '+c,list,f==='azure'&&c==='Compute');
      } else html+=secHTML(p.title,p.icons,p.id==='pp'||f===p.id);
    }
  }
  body.innerHTML=html;
}
$('#libChips').addEventListener('click',e=>{ const b=e.target.closest('[data-f]'); if(!b) return; state.libFilter=b.dataset.f; renderLibrary(); $('#libBody').scrollTop=0; });
$('#libSearch').addEventListener('input',e=>{ state.libQuery=e.target.value; renderLibrary(); });
$('#libSearch').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.target.value='';state.libQuery='';renderLibrary(); e.target.blur(); } });
$('#libBody').addEventListener('click',e=>{
  const t=e.target.closest('.tile'); if(!t) return;
  if(state.pick){ setIcon(state.pick,t.dataset.key); endPick(); return; }
  addIconNode(t.dataset.key);
});
$('#libBody').addEventListener('dragstart',e=>{ const t=e.target.closest('.tile'); if(!t) return; e.dataTransfer.setData('application/x-mab-icon',t.dataset.key); e.dataTransfer.setData('text/plain',t.dataset.key); e.dataTransfer.effectAllowed='copy'; const img=t.querySelector('img'); if(img) try{ e.dataTransfer.setDragImage(img,16,16); }catch(_){} });
$('#libClose').addEventListener('click',()=>setLib(false));
$('#lib').addEventListener('pointerdown',e=>e.stopPropagation());
function setLib(open){ state.libOpen=open; LS.set('mab.lib',open); $('#lib').hidden=!open; if(!open) endPick(); updTools(); }
function startPick(){
  const ns=selNodes(); if(!ns.length) return;
  state.pick=ns.map(n=>n.id); setLib(true);
  $('#libPick').hidden=false; $('#libPickText').textContent='Choose an icon for '+(ns.length===1?'"'+ns[0].label.replace(/\n/g,' ')+'"':ns.length+' shapes');
  $('#libSearch').focus();
}
function endPick(){ state.pick=null; $('#libPick').hidden=true; }
$('#libPickCancel').addEventListener('click',endPick);
