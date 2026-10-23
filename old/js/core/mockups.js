/* orim · core/mockups.js
 * Simple UI mockups: device frames (phone, iPad, desktop) and grey wireframe pieces.
 * A device is a frame with a fixed size; each piece is an ordinary node, so it can be
 * dragged, connected and edited like any other shape. No DOM here.
 */
'use strict';
const DEVICES={
  mobile:{name:'Phone',w:300,h:620,top:40,bottom:22},
  tablet:{name:'iPad',w:560,h:760,top:30,bottom:18},
  desktop:{name:'Desktop',w:960,h:600,top:34,bottom:0}
};
// Labels: the text shown on the piece. Menus list their items one per line.
const UI_KINDS={
  uiHeading:{name:'Heading',w:220,h:34,def:'Heading'},
  uiText:{name:'Text',w:220,h:46,def:''},
  uiButton:{name:'Button',w:200,h:40,def:'Button'},
  uiInput:{name:'Input field',w:240,h:40,def:'Placeholder'},
  uiImage:{name:'Image',w:240,h:140,def:''},
  uiTopbar:{name:'Top bar',w:300,h:48,def:'Title'},
  uiTabbar:{name:'Bottom menu',w:300,h:56,def:'Home\nSearch\nProfile'},
  uiSidebar:{name:'Side menu',w:180,h:360,def:'Home\nProjects\nSettings'},
  uiTable:{name:'Table',w:260,h:150,def:'Name\nStatus\nDate'}
};
// Accent colours for pieces, like Miro's wireframe kit. Empty is the grey default.
const UI_COLORS=[['','Grey'],['#4262ff','Blue'],['#0ca789','Green'],['#fac710','Yellow'],['#f24726','Red'],['#9510ac','Purple'],['#1a1a1a','Black']];
// New screens and pieces are drawn at half the sizes above, so they sit well next to other shapes.
// Older boards keep their sizes: a screen's scale is its saved width over the base width.
const MOCK=0.5;
function devScale(m,gid){ const g=m.groups.get(gid); if(!g||!g.dev) return MOCK; const p=m.pos.get(gid); return p&&p.w?p.w/DEVICES[g.dev].w:MOCK; }
// The drawing scale of a piece: its screen's scale, or its size against the base size when loose.
function uiScale(m,n){ const g=n.group&&m.groups.get(n.group); if(g&&g.dev) return devScale(m,g.id); const k=UI_KINDS[n.shape]; if(!k) return 1;
  const r=['uiText','uiImage','uiSidebar','uiTable'].includes(n.shape)?n.w/k.w:n.h/k.h; return Math.max(0.3,Math.min(2,r||MOCK)); }
const SCREEN_PRESETS=[['blank','Blank'],['login','Login'],['main','Main page']];
const isUi=n=>!!(n&&UI_KINDS[n.shape]);
// Changes on a mockup: an item or label starting with + is new, ~ is changed and - is removed.
// Plain text in the Mermaid ("+Industry"), so it reads well anywhere; orim draws it in colour.
const UI_MARKS={'+':{k:'new',name:'New',color:'#0ca789'},'~':{k:'chg',name:'Changed',color:'#d98e04'},'-':{k:'del',name:'Removed',color:'#e5484d'}};
function uiMark(t){ const s=String(t||''); const c=s[0]; if(UI_MARKS[c]&&(c!=='-'||/^-[^\s\d-]/.test(s))) return {t:s.slice(1).trim(),m:UI_MARKS[c]}; return {t:s,m:null}; }
const uiItems=label=>String(label||'').split(/\n|\|/).map(s=>s.trim()).filter(Boolean);
// The pieces of a preset screen, with positions relative to the device's top left corner.
function screenPieces(dev,preset,s){
  if(s==null) s=MOCK;
  const D=DEVICES[dev]||DEVICES.mobile, W=D.w, H=D.h, T=D.top, B=D.bottom, out=[];
  const R=v=>Math.round(v*s*2)/2;
  const add=(kind,label,x,y,w,h)=>out.push({kind,label,x:R(x),y:R(y),w:R(w||UI_KINDS[kind].w),h:R(h||UI_KINDS[kind].h)});
  const wide=dev==='desktop';
  if(preset==='login'){
    const cw=wide?340:Math.min(W-48,400), x=(W-cw)/2; let y=wide?T+90:T+(dev==='tablet'?150:70);
    add('uiImage','',(W-64)/2,y,64,64); y+=88;
    add('uiHeading','Sign in',x,y,cw); y+=50;
    add('uiInput','Email',x,y,cw); y+=52;
    add('uiInput','Password',x,y,cw); y+=60;
    add('uiButton','Sign in',x,y,cw,44); y+=60;
    add('uiText','Forgot password?',x,y,cw,22);
    return out;
  }
  if(preset==='main'){
    if(wide){
      add('uiTopbar','Home',0,T,W,52);
      add('uiSidebar','Home\nSearch\nSaved\nSettings',0,T+52,200,H-T-52-B);
      const x=232, cw=W-x-32; let y=T+80;
      add('uiHeading','Welcome back',x,y,cw); y+=50;
      add('uiInput','Search',x,y,Math.min(cw,420)); y+=64;
      const iw=(cw-32)/3; for(let k=0;k<3;k++) add('uiImage','',x+k*(iw+16),y,iw,150); y+=170;
      add('uiText','',x,y,cw,46);
    } else {
      const pad=dev==='tablet'?32:20, cw=W-pad*2; let y=T+48+24;
      add('uiTopbar','Home',0,T,W,48);
      add('uiHeading','Where to today?',pad,y,cw); y+=50;
      add('uiInput','Search',pad,y,cw); y+=60;
      if(dev==='tablet'){ const iw=(cw-16)/2; add('uiImage','',pad,y,iw,200); add('uiImage','',pad+iw+16,y,iw,200); y+=220; }
      else { add('uiImage','',pad,y,cw,180); y+=200; }
      add('uiText','',pad,y,cw,46);
      add('uiTabbar','Home\nSearch\nProfile',0,H-B-56,W,56);
    }
    return out;
  }
  add('uiTopbar','Title',0,T,W,wide?52:48);
  return out;
}
// Add a device frame with a preset screen to a model. x, y is the device's top left corner.
// Returns the frame id. Piece ids start with the frame id, so they read well in the code.
function addScreen(m,o){
  const dev=DEVICES[o.dev]?o.dev:'mobile', D=DEVICES[dev];
  const taken=id=>m.nodes.has(id)||m.groups.has(id);
  const label=String(o.label||({login:'Login',main:'Main page'}[o.preset]||D.name)).replace(/\n/g,' ');
  const gid=o.id&&!taken(o.id)?o.id:idFrom(o.idBase||label,taken);
  m.groups.set(gid,{id:gid,label,parent:o.parent&&m.groups.has(o.parent)?o.parent:null,dir:null,dev}); m.groupOrder.push(gid);
  const x=Math.round(o.x/8)*8, y=Math.round(o.y/8)*8, s=o.scale||MOCK;
  m.pos.set(gid,{x,y,w:D.w*s,h:D.h*s});
  const ids=[];
  for(const p of screenPieces(dev,o.preset,s)){
    const id=idFrom(gid+' '+(p.label.split('\n')[0]||UI_KINDS[p.kind].name),taken);
    const n={id,label:p.label,shape:p.kind,icon:null,group:gid,cls:null,x:x+p.x,y:y+p.y,w:p.w,h:p.h,sized:true};
    m.nodes.set(id,n); m.nodeOrder.push(id); ids.push(id);
  }
  return {gid,ids};
}
