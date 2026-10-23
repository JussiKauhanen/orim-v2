/* orim · tooltips.js
 * Tooltips with keyboard shortcuts.
 */
'use strict';
const tipEl=$('#tip'); let tipT=0,tipFor=null;
function hideTip(){ clearTimeout(tipT); tipEl.hidden=true; tipFor=null; }
document.addEventListener('pointerover',e=>{
  if(e.pointerType&&e.pointerType!=='mouse') return;
  const el=e.target.closest&&e.target.closest('[title],[data-tip]');
  if(!el||el.closest('svg.board')){ if(tipFor) hideTip(); return; }
  if(el.hasAttribute('title')){ el.dataset.tip=el.getAttribute('title'); el.removeAttribute('title'); }
  if(el===tipFor) return;
  hideTip(); tipFor=el;
  tipT=setTimeout(()=>{
    if(!el.isConnected||tipFor!==el) return;
    const txt=el.dataset.tip||''; const mm=/^(.*?)\s*\(([^()]*(?:Ctrl|Shift|Alt|Del|Enter|Space|[A-Z]\b|\+)[^()]*)\)$/.exec(txt);
    tipEl.innerHTML=mm?esc(mm[1])+' '+mm[2].split(/\s+or\s+/i).map(k=>'<kbd>'+esc(k)+'</kbd>').join(' '):esc(txt).replace(/\n/g,'<br>');
    tipEl.hidden=false;
    const r=el.getBoundingClientRect(),tw=tipEl.offsetWidth,th=tipEl.offsetHeight;
    let top=r.top>window.innerHeight/2?r.top-th-8:r.bottom+8;
    let left=r.left+r.width/2-tw/2; left=clamp(left,8,window.innerWidth-tw-8);
    tipEl.style.left=left+'px'; tipEl.style.top=top+'px';
  },el.closest('.lib-body')?600:280);
});
document.addEventListener('pointerout',e=>{ if(tipFor&&(!e.relatedTarget||!tipFor.contains(e.relatedTarget))) hideTip(); });
document.addEventListener('pointerdown',hideTip,true);
document.addEventListener('wheel',hideTip,{passive:true,capture:true});
