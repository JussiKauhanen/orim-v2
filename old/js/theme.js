/* orim · theme.js
 * Auto, day and night themes.
 */
'use strict';
const hostTheme=document.documentElement.getAttribute('data-theme');
const THEMES={system:{icon:'auto',label:'Theme: Auto, follows your system'},light:{icon:'sun',label:'Theme: Day'},dark:{icon:'moon',label:'Theme: Night'}};
function setTheme(t){
  state.theme=t; LS.set('mab.theme',t);
  const root=document.documentElement;
  if(t==='system'){ if(hostTheme) root.setAttribute('data-theme',hostTheme); else root.removeAttribute('data-theme'); }
  else root.setAttribute('data-theme',t);
  const b=$('#themeBtn'); b.innerHTML=ico(THEMES[t].icon); b.title=THEMES[t].label+' (click to switch)'; delete b.dataset.tip; b.setAttribute('aria-label',THEMES[t].label);
  const hb=document.getElementById('homeTheme'); if(hb){ hb.innerHTML=ico(THEMES[t].icon); hb.title=THEMES[t].label; delete hb.dataset.tip; hb.setAttribute('aria-label',THEMES[t].label); }
  if(tipEl&&!tipEl.hidden&&tipFor===b) hideTip();
  themeChanged();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>themeChanged());
new MutationObserver(()=>{ if(PAL_LIVE.frameOut===isDark()) themeChanged(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
$('#themeBtn').addEventListener('click',()=>{ const order=['system','light','dark']; const next=order[(order.indexOf(state.theme)+1)%3]; setTheme(next); toast(THEMES[next].label.replace('Theme: ','')+' mode'); });
