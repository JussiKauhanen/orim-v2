/* orim · ui.js
 * Menus, help panel, toasts and dialogs.
 */
'use strict';
function closeMenus(){ $('#tplMenu').hidden=true; $('#exportMenu').hidden=true; const sm=$('#styleMenu'); if(sm) sm.hidden=true; const t=$('#tidyMenu'); if(t) t.hidden=true; }
function toggleMenu(id){ const el=$(id); const open=el.hidden; closeMenus(); el.hidden=!open; }
$('#tplBtn').addEventListener('click',e=>{ e.stopPropagation(); closeMenus(); openTemplates(); });
$('#exportBtn').addEventListener('click',e=>{ e.stopPropagation(); toggleMenu('#exportMenu'); });
document.addEventListener('click',e=>{ if(!e.target.closest('.menu-wrap')) closeMenus(); if(!e.target.closest('#help')&&!e.target.closest('#helpBtn')) $('#help').hidden=true; });
$('#helpBtn').addEventListener('click',()=>{ $('#help').hidden=!$('#help').hidden; });
let toastT=0;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2200); }
function openModal(title,bodyHTML,buttons){
  $('#modalTitle').textContent=title; $('#modalBody').innerHTML=bodyHTML;
  $('#modalFoot').innerHTML=(buttons||[]).map((b,i)=>'<button type="button" class="btn'+(b.primary?' primary':'')+'" data-mb="'+i+'">'+esc(b.label)+'</button>').join('')+'<button type="button" class="btn" data-mb="close">Close</button>';
  $('#modalFoot').onclick=e=>{ const k=e.target.closest('[data-mb]'); if(!k) return; if(k.dataset.mb==='close'){ closeModal(); return; } const b=buttons[+k.dataset.mb]; b&&b.run&&b.run(); };
  $('#modal').hidden=false;
}
function closeModal(){ $('#modal').hidden=true; $('.modal').classList.remove('qr'); $('#modalBody').innerHTML=''; }
$('#modalClose').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeModal(); });
