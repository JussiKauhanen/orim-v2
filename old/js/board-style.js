/* orim · board-style.js
 * Board themes: one click recolours the board (background, shapes, lines, frames) and, for some, the font.
 * The theme is saved as one canvas line (%% @theme midnight), so the Mermaid stays plain for other tools.
 */
'use strict';
(()=>{
  const btn=$('#styleBtn'), menu=$('#styleMenu');
  // A small picture of each theme: its board colour, two outlined boxes in its accents and a line.
  function swatch(k){ const T=BOARD_THEMES[k]; const bg=T.bg||'#f2f2f2', node=T.node||'#ffffff', st=T.stroke||'#1a1a1a', a=T.accents||[st,st], ed=T.edge||'#1a1a1a';
    const f=fontCss(T.font)||FONT_ATTR;
    return '<svg viewBox="0 0 120 64" aria-hidden="true"><rect width="120" height="64" rx="8" style="fill:'+bg+'"/>'+
      '<rect x="10" y="12" width="40" height="20" rx="4" style="fill:'+node+';stroke:'+a[0]+';stroke-width:1.6"/><rect x="70" y="32" width="40" height="20" rx="4" style="fill:'+node+';stroke:'+(a[1]||a[0])+';stroke-width:1.6"/>'+
      '<path d="M50 22C62 22 58 42 70 42" style="fill:none;stroke:'+ed+';stroke-width:1.4"/>'+
      '<text x="30" y="25.5" text-anchor="middle" style="fill:'+(T.text||'#1a1a1a')+';font:600 8.5px '+f+'">Aa</text><text x="90" y="45.5" text-anchor="middle" style="fill:'+(T.text||'#1a1a1a')+';font:600 8.5px '+f+'">Bb</text></svg>'; }
  function paint(){
    const cur=(state.model&&state.model.theme)||'classic';
    menu.innerHTML='<div class="menu-label">Board style</div><div class="style-grid">'+Object.keys(BOARD_THEMES).map(k=>'<button type="button" class="style-card" data-btheme="'+k+'" aria-pressed="'+(k===cur)+'">'+swatch(k)+'<span>'+esc(BOARD_THEMES[k].name)+'</span></button>').join('')+'</div>'+
      '<p class="menu-note">Colours you set on a shape stay as they are. Other Mermaid tools show their own colours.</p>';
  }
  btn.addEventListener('click',e=>{ e.stopPropagation(); const open=menu.hidden; closeMenus(); if(open){ paint(); menu.hidden=false; } });
  menu.addEventListener('click',e=>{ e.stopPropagation(); const b=e.target.closest('[data-btheme]'); if(!b) return; const k=b.dataset.btheme;
    mutate(m=>{ if(k==='classic') delete m.theme; else m.theme=k; },{structural:false}); paint(); toast(BOARD_THEMES[k].name+' style'); });
})();
