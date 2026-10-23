/* orim · me.js
 * Your name for comments, shown as an avatar in the top right like a signed-in account.
 * There is no server: the name lives in this browser (orim.me). The account card also shows a
 * Claude API key saved for the AI tab, with a way to remove it. Signing out forgets both;
 * comments you already wrote keep the name they were written with.
 */
'use strict';
const Me=(()=>{
  const KEY='orim.me';
  const COLORS=['#1a73e8','#d93025','#188038','#e37400','#9334e6','#007b83','#c2185b','#5f6368','#3949ab','#b06000'];
  let name=String(LS.get(KEY,'')||'').trim();
  const get=()=>name;
  function color(n){ let h=0; for(const ch of String(n)) h=(h*31+ch.codePointAt(0))>>>0; return COLORS[h%COLORS.length]; }
  function initial(n){ const w=String(n||'').trim(); return w?[...w][0].toUpperCase():'?'; }
  function avatar(n,size,cls){ return '<span class="avatar'+(cls?' '+cls:'')+'" style="--av:'+color(n)+';--sz:'+(size||28)+'px" aria-hidden="true">'+esc(initial(n))+'</span>'; }
  function set(n){ name=String(n||'').trim().slice(0,40); if(name) LS.set(KEY,name); else { try{ localStorage.removeItem(KEY); }catch(_){} } paint(); }
  const hasKey=()=>typeof AIKey!=='undefined'&&!!AIKey.get();
  const guest='<span class="avatar guest" style="--sz:30px" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.5"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg></span>';
  function paint(){
    for(const b of document.querySelectorAll('[data-me]')){
      const show=!!name||hasKey(); b.hidden=!show; b.innerHTML=name?avatar(name,30):show?guest:''; b.title=name?name+' · account':'Account'; b.setAttribute('aria-label',name?'Account: '+name:'Account');
    }
    if(!name&&!hasKey()) closeMenu();
  }
  const menu=$('#meMenu');
  function openMenu(btn){
    const r=btn.getBoundingClientRect();
    menu.innerHTML=(name?'<div class="me-card">'+avatar(name,64)+'<b>Hi, '+esc(name)+'!</b><small>Your name on comments. Saved in this browser only.</small></div>'
        :'<div class="me-card">'+guest.replace('--sz:30px','--sz:64px')+'<b>Not signed in</b><small>Add your name to sign your comments.</small></div>')+
      keySection()+
      '<div class="me-actions">'+(name?'<button type="button" class="btn" data-me-act="rename">Change name</button>':'<button type="button" class="btn" data-me-act="rename">Add your name</button>')+
      '<button type="button" class="btn" data-me-act="out" title="'+(hasKey()?'Forgets your name and the Claude API key in this browser':'Forgets your name in this browser')+'">Sign out</button></div>';
    menu.hidden=false;
    menu.style.top=(r.bottom+8)+'px'; menu.style.right=Math.max(8,window.innerWidth-r.right)+'px';
  }
  function closeMenu(){ menu.hidden=true; }
  // The Claude API key used by the AI tab outside Claude: where it is, a way to remove it, and where to make one.
  function keySection(){
    if(typeof AIKey==='undefined') return '';
    const k=AIKey.get(), ws=AIKey.workspace();
    return '<div class="me-key"><div class="me-key-head">'+aiSpark()+'<b>Claude API key</b></div>'+
      (k?'<small>Saved in this browser: '+esc(k.slice(0,10))+'…'+esc(k.slice(-4))+' · '+esc(AIKey.modelName())+(ws?' · '+esc(ws.slice(0,12))+'…':'')+'</small><div class="me-key-row"><button type="button" class="btn" data-me-act="forgetkey">Remove key</button><a class="btn ghost" href="'+AIKey.KEYS_URL+'" target="_blank" rel="noopener noreferrer">Manage keys</a></div>'
        :'<small>None saved. Outside Claude, the AI tab uses your own key.</small><div class="me-key-row"><a class="btn ghost" href="'+AIKey.KEYS_URL+'" target="_blank" rel="noopener noreferrer">Create a key in the Claude Console</a></div>')+'</div>';
  }
  // Change the name right in the account card.
  function editName(){
    menu.querySelector('.me-card').innerHTML=avatar(name,64)+'<input class="me-input" maxlength="40" autocomplete="name" value="'+esc(name)+'" aria-label="Your name"><small>New comments use the new name.</small>';
    menu.querySelector('.me-actions').innerHTML='<button type="button" class="btn" data-me-act="cancel">Cancel</button><button type="button" class="btn primary" data-me-act="save">Save</button>';
    const inp=menu.querySelector('.me-input'), av=menu.querySelector('.avatar');
    inp.addEventListener('input',()=>{ const v=inp.value.trim(); av.textContent=v?[...v][0].toUpperCase():'?'; av.style.setProperty('--av',color(v)); });
    inp.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter'){ e.preventDefault(); save(); } else if(e.key==='Escape'){ e.preventDefault(); closeMenu(); } });
    setTimeout(()=>{ inp.focus(); inp.select(); },0);
  }
  function save(){ const inp=menu.querySelector('.me-input'); const v=inp&&inp.value.trim(); if(!v){ inp&&inp.focus(); return; } set(v); closeMenu(); toast('Name changed'); }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-me]');
    if(b){ e.stopPropagation(); if(menu.hidden) openMenu(b); else closeMenu(); return; }
    const a=e.target.closest('[data-me-act]');
    if(a){ e.stopPropagation(); const k=a.dataset.meAct;
      if(k==='out'){ const had=hasKey(); closeMenu(); if(had&&typeof AIKey!=='undefined'){ AIKey.clear(); if(typeof AI!=='undefined'&&AI.keyChanged) AI.keyChanged(); } set(''); toast(had?'Signed out. Your name and Claude API key are gone from this browser.':'Signed out. Your comments keep your name.'); }
      else if(k==='forgetkey'){ AIKey.clear(); if(typeof AI!=='undefined'&&AI.keyChanged) AI.keyChanged(); paint(); const btn=document.querySelector('[data-me]:not([hidden])'); if(name&&btn) openMenu(btn); else closeMenu(); toast('Claude API key removed from this browser'); }
      else if(k==='rename') editName(); else if(k==='save') save(); else closeMenu();
      return; }
    if(!e.target.closest('#meMenu')) closeMenu();
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!menu.hidden) closeMenu(); });
  paint();
  return {get,set,avatar,color,refresh:paint};
})();
