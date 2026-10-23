/* orim · icons.js
 * Loads the Azure, Power Platform and Dynamics 365 icon pack.
 */
'use strict';
const Icons={byKey:new Map(),packs:[],ready:false,failed:false};
const PACK_ALIAS={azure:'azure',az:'azure',pp:'pp',power:'pp',powerplatform:'pp','power-platform':'pp',d365:'d365',dynamics:'d365',dynamics365:'d365'};
function iconFor(key){
  if(!key) return null;
  let k=String(key).trim().toLowerCase(); const c=k.indexOf(':');
  if(c>0){ const p=PACK_ALIAS[k.slice(0,c)]; if(p) k=p+':'+k.slice(c+1); }
  return Icons.byKey.get(k)||null;
}
async function loadIcons(){
  try{
    let d; const inl=document.getElementById('iconData');
    if(inl) d=JSON.parse(inl.textContent);
    else { const r=await fetch('assets/icons.json'); if(!r.ok) throw new Error('HTTP '+r.status); d=await r.json(); }
    for(const p of d.packs){
      const list=[];
      for(const it of p.icons){
        let title=it.t; if(p.id==='d365'&&title==='Dynamics 365') title='Dynamics 365';
        const icon={key:p.id+':'+it.id,pack:p.id,packTitle:p.title,id:it.id,title,cat:it.c,uri:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(it.s)};
        Icons.byKey.set(icon.key,icon); list.push(icon);
      }
      Icons.packs.push({id:p.id,title:p.title,icons:list});
    }
    Icons.ready=true;
  }catch(err){ Icons.failed=true; }
  renderLibrary(); R.sig.clear(); render();
  if(typeof Boards!=='undefined') Boards.iconsReady();
}
