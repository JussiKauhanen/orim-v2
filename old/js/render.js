/* orim · render.js
 * Draws frames, nodes, connectors, arrows, drawings, images and selection overlay.
 */
'use strict';
const R={nodeEls:new Map(),sig:new Map()};
function inkFor(hex){
  const m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex||'').trim()); if(!m) return '#171e2b';
  let h=m[1]; if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return (0.299*r+0.587*g+0.114*b)>150?'#171e2b':'#ffffff';
}
const CELL_TINT={g:'rgba(34,197,94,.24)',a:'rgba(245,158,11,.28)',r:'rgba(239,68,68,.24)'};
function tableInner(n,m,P,live){
  const L=n._tl||tableLayout(n), w=n.w, h=n.h, st=styleOf(m,n.id)||{}; const font=P.font, txt=P.nodeText;
  let s='<rect class="shape" width="'+w+'" height="'+h+'" rx="8" style="fill:'+(st.fill||P.nodeFill)+';stroke:'+(st.stroke||P.labelText)+';stroke-opacity:.45;stroke-width:1.2"/>';
  if(L.top) s+='<text class="lbl" x="12" y="21" style="fill:'+P.labelText+';font:600 12.5px '+font+'">'+esc(n.label)+'</text>';
  let y=L.top;
  L.rows.forEach((rh,ri)=>{
    let x=0;
    L.cols.forEach((cw,ci)=>{
      const tint=n.table.colors[ri+','+ci]; const head=ri===0;
      if(head||tint) s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+cw.toFixed(1)+'" height="'+rh.toFixed(1)+'" style="fill:'+(tint?CELL_TINT[tint]:'rgba(127,127,127,.11)')+'"/>';
      const lines=L.cells[ri][ci]; const bold=head||ci===0;
      if(lines.some(Boolean)){ s+='<text class="lbl" style="fill:'+txt+';font:'+(bold?600:400)+' '+TBL.fs+'px '+font+'">'; lines.forEach((l,k)=>{ s+='<tspan x="'+(x+TBL.pad).toFixed(1)+'" y="'+(y+8+TBL.lh*0.78+k*TBL.lh).toFixed(1)+'">'+esc(l)+'</tspan>'; }); s+='</text>'; }
      x+=cw;
    });
    y+=rh;
  });
  // grid lines
  let gl=''; let yy=L.top; for(let i=0;i<L.rows.length;i++){ if(i||L.top) gl+='M0 '+yy.toFixed(1)+'H'+w; yy+=L.rows[i]; }
  let xx=0; for(let i=0;i<L.cols.length-1;i++){ xx+=L.cols[i]; gl+='M'+xx.toFixed(1)+' '+L.top+'V'+h; }
  s+='<path d="'+gl+'" style="fill:none;stroke:'+P.labelText+';stroke-opacity:.3;stroke-width:1"/>';
  return s;
}
function docInner(n,m,P,live){
  const L=n._dl||docLayout(n), w=n.w, h=n.h, st=styleOf(m,n.id)||{}; const font=P.font;
  let s='<rect class="shape" width="'+w+'" height="'+h+'" rx="10" style="fill:'+(st.fill||P.nodeFill)+';stroke:'+(st.stroke||P.labelText)+';stroke-opacity:.35;stroke-width:1.2"/>';
  const tk=TICKET_TYPES[n.doc.kind];
  if(tk){ // Ticket: coloured strip on the left like an Azure Boards card, type, title and fields.
    const cid='tk-'+String(n.id).replace(/[^\w-]/g,'')+(live?'':'-x');
    s+='<clipPath id="'+cid+'"><rect width="'+w+'" height="'+h+'" rx="10"/></clipPath><rect width="5" height="'+h+'" clip-path="url(#'+cid+')" style="fill:'+tk.color+'"/>';
    s+='<rect x="22" y="14" width="9" height="9" rx="2" style="fill:'+tk.color+'"/><text x="37" y="22.5" style="fill:'+P.labelText+';font:600 11px '+font+';letter-spacing:.02em">'+esc(tk.name.toUpperCase())+'</text>';
    const tl=wrapText(n.label&&n.label.trim()?n.label:'Untitled',w-44,14.5)[0]||'';
    s+='<text class="lbl" x="22" y="46" style="fill:'+(n.label&&n.label.trim()?P.nodeText:P.muted)+';font:700 14.5px '+font+'">'+esc(tl)+'</text>';
    const line=ticketLine(n); if(line) s+='<text x="22" y="66" style="fill:'+P.labelText+';font:400 11.5px '+font+'">'+esc(line)+'</text>';
    const dy=line?76:58; s+='<path d="M22 '+dy+'H'+(w-18)+'" style="stroke:'+P.labelText+';stroke-opacity:.2"/>'; }
  else if(n.label&&n.label.trim()){ s+='<g transform="translate(18 15)" style="fill:none;stroke:'+P.labelText+';stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"><path d="M2 1h7l4 4v10H2z"/><path d="M5 8h5M5 11h5"/></g>';
    s+='<text class="lbl" x="40" y="27" style="fill:'+P.labelText+';font:600 13px '+font+'">'+esc(n.label)+'</text><path d="M18 40H'+(w-18)+'" style="stroke:'+P.labelText+';stroke-opacity:.2"/>'; }
  const clip=h<L.h;
  const mono=fontCss('mono'); let bi=-1;
  for(const b of L.blocks){
    bi++; if(b.y>h-8) break;
    if(b.t==='hr'){ s+='<path d="M'+L.padx+' '+(b.y+6)+'H'+(w-L.padx)+'" style="stroke:'+P.labelText+';stroke-opacity:.3;stroke-width:1.2"/>'; continue; }
    if(b.t==='code'){ const bh=Math.min(b.lines.length*b.lh+12,h-b.y);
      s+='<rect x="'+L.padx+'" y="'+(b.y-6)+'" width="'+(w-L.padx*2)+'" height="'+bh+'" rx="7" style="fill:'+P.codeBg+';stroke:'+P.labelText+';stroke-opacity:.14"/>';
      if(b.lang) s+='<text x="'+(w-L.padx-8)+'" y="'+(b.y+7)+'" text-anchor="end" style="fill:'+P.muted+';font:500 9.5px '+font+';letter-spacing:.04em">'+esc(b.lang.toUpperCase())+'</text>';
      b.lines.forEach((line,k)=>{ const by=b.y+k*b.lh+b.fs; if(by>h-6) return; s+='<text class="lbl" x="'+(L.padx+b.ind)+'" y="'+by+'" xml:space="preserve" style="fill:'+P.nodeText+';font:400 '+b.fs+'px '+mono+';white-space:pre">'+esc(line[0]?line[0].x:'')+'</text>'; });
      continue; }
    if(b.t==='quote'&&b.lines.length) s+='<rect x="'+(L.padx+1)+'" y="'+(b.y+2)+'" width="3" height="'+(b.lines.length*b.lh)+'" rx="1.5" style="fill:'+P.labelText+';opacity:.35"/>';
    if(b.t==='todo'){ const cy=b.y+b.fs*0.32; s+='<g'+(live?' class="doc-todo" data-todo="'+bi+'"':'')+'><rect x="'+L.padx+'" y="'+cy+'" width="14" height="14" rx="3.5" style="fill:'+(b.c?P.accent:'transparent')+';stroke:'+(b.c?P.accent:P.labelText)+';stroke-width:1.4"/>'+(b.c?'<path d="M'+(L.padx+3.5)+' '+(cy+7.2)+'l2.6 2.6 4.6-5.2" style="fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"/>':'')+(live?'<rect x="'+(L.padx-4)+'" y="'+(cy-4)+'" width="22" height="22" style="fill:transparent"/>':'')+'</g>'; }
    b.lines.forEach((line,k)=>{
      const by=b.y+k*b.lh+b.fs; if(by>h-6) return;
      if(k===0&&(b.t==='ul'||b.t==='ol')) s+='<text x="'+(L.padx+2)+'" y="'+by+'" style="fill:'+P.nodeText+';font:400 '+b.fs+'px '+font+'">'+(b.t==='ul'?'•':b.num+'.')+'</text>';
      s+='<text class="lbl" x="'+(L.padx+b.ind)+'" y="'+by+'" style="fill:'+(b.t==='quote'||b.c?P.labelText:P.nodeText)+';font:'+(b.t==='quote'?'italic ':'')+b.wt+' '+b.fs+'px '+font+'"'+(b.c?' text-decoration="line-through"':'')+'>';
      for(const r of line) s+='<tspan'+(r.b&&b.wt<700?' font-weight="700"':'')+(r.i?' font-style="italic"':'')+(r.u?' class="doc-link" data-href="'+esc(r.u)+'" text-decoration="underline" style="fill:'+P.accent+'"':'')+'>'+esc(r.x)+(r.u&&live?'<title>'+esc(r.u)+' (Ctrl or Cmd+click to open)</title>':'')+'</tspan>';
      s+='</text>';
    });
  }
  if(L.blocks.length===1&&!L.blocks[0].lines.some(l=>l.length)&&live) s+='<text x="'+L.padx+'" y="'+(L.blocks[0].y+14)+'" style="fill:'+P.muted+';font:400 13px '+font+'">Double-click to write</text>';
  if(clip) s+='<rect x="1" y="'+(h-34)+'" width="'+(w-2)+'" height="33" rx="9" style="fill:'+(st.fill||P.nodeFill)+';opacity:.92"/><text x="'+(w/2)+'" y="'+(h-13)+'" text-anchor="middle" style="fill:'+P.labelText+';font:500 12px '+font+'">Open to read more</text>';
  return s;
}
// Grey wireframe pieces for mockups. k is the drawing scale (half size for new screens).
function uiInner(n,m,P,live){
  const w=n.w,h=n.h,font=P.font,L=n.label||'',k=uiScale(m,n); let s=live?'<rect class="hit" width="'+w+'" height="'+h+'" style="fill:transparent"/>':'';
  const f=v=>+(v*k).toFixed(2);
  const txt=(x,y,t,sz,wt,col,anchor)=>'<text class="lbl" x="'+x+'" y="'+y+'" style="fill:'+col+';font:'+wt+' '+f(sz)+'px '+font+(anchor?';text-anchor:'+anchor:'')+'">'+esc(t)+'</text>';
  const fm=uiMark(L.split('\n')[0]), first=fm.t;
  // An accent colour from the piece's fill; grey when it has none.
  const st=styleOf(m,n.id), A=st&&st.fill&&/^#[0-9a-f]{3,8}$/i.test(st.fill)?st.fill:null, onA=A?inkFor(A):P.devFill;
  const tint=(op)=>A?'fill:'+A+';fill-opacity:'+op:'fill:'+P.wfFill;
  switch(n.shape){
    case 'uiHeading': s+=L?txt(0,h/2+f(7),first,19,700,A||P.nodeText):'<rect y="'+(h/2-f(6))+'" width="'+(w*0.7)+'" height="'+f(12)+'" rx="'+f(6)+'" style="fill:'+(A||P.wfInk)+'"/>'; break;
    case 'uiText': { const lh=f(17);
      if(L){ const ls=wrapText([fm.t].concat(L.split('\n').slice(1)).join('\n'),w/k,12.5).slice(0,Math.max(1,Math.floor((h+2)/lh))); s+='<text class="lbl" style="fill:'+(A||P.wfText)+';font:400 '+f(12.5)+'px '+font+'">'+ls.map((l,q)=>'<tspan x="0" y="'+(f(13)+q*lh)+'">'+esc(l)+'</tspan>').join('')+'</text>'; }
      else { const step=f(14), cnt=Math.max(1,Math.min(6,Math.floor((h+f(7))/step))), y0=Math.max(0,(h-(cnt*step-f(7)))/2);
        for(let q=0;q<cnt;q++) s+='<rect y="'+(y0+q*step).toFixed(1)+'" width="'+(w*(q===cnt-1&&cnt>1?0.6:q%2?0.92:1)).toFixed(1)+'" height="'+f(7)+'" rx="'+f(3.5)+'" style="'+(A?'fill:'+A+';fill-opacity:.45':'fill:'+P.wfLine)+'"/>'; }
      break; }
    case 'uiButton': s+='<rect width="'+w+'" height="'+h+'" rx="'+f(8)+'" style="fill:'+(A||P.wfInk)+'"/>'+txt(w/2,h/2+f(4.5),first,13,600,onA,'middle'); break;
    case 'uiInput': s+='<rect x=".5" y=".5" width="'+(w-1)+'" height="'+(h-1)+'" rx="'+f(8)+'" style="fill:'+P.devFill+';stroke:'+(A||P.wfLine)+';stroke-width:'+f(1.5)+'"/>'+txt(f(12),h/2+f(4.5),first,13,400,P.wfText); break;
    case 'uiImage': s+='<rect x=".5" y=".5" width="'+(w-1)+'" height="'+(h-1)+'" rx="'+f(6)+'" style="'+tint(.16)+';stroke:'+(A||P.wfLine)+';stroke-width:'+f(1.5)+'"/><path d="M'+f(6)+' '+f(6)+'L'+(w-f(6))+' '+(h-f(6))+'M'+(w-f(6))+' '+f(6)+'L'+f(6)+' '+(h-f(6))+'" style="stroke:'+(A||P.wfLine)+';stroke-opacity:'+(A?.5:1)+';stroke-width:'+f(1.5)+'"/>'+(L?txt(w/2,h/2+f(4.5),first,12,500,P.wfText,'middle'):''); break;
    case 'uiTopbar': s+='<rect width="'+w+'" height="'+h+'" style="fill:'+(A||P.wfFill)+'"/><path d="M'+f(16)+' '+(h/2-f(6))+'h'+f(16)+'M'+f(16)+' '+(h/2)+'h'+f(16)+'M'+f(16)+' '+(h/2+f(6))+'h'+f(16)+'" style="stroke:'+(A?onA:P.wfInk)+';stroke-width:'+f(2)+';stroke-linecap:round"/>'+
      '<circle cx="'+(w-f(26))+'" cy="'+(h/2)+'" r="'+Math.max(1,Math.min(f(12),h/2-f(6)))+'" style="fill:'+(A?onA:P.wfLine)+';fill-opacity:'+(A?.45:1)+'"/>'+txt(w/2,h/2+f(5),first,14,600,A?onA:P.nodeText,'middle'); break;
    case 'uiTabbar': { const it=uiItems(L).map(uiMark); const cw=w/Math.max(1,it.length);
      s+='<rect width="'+w+'" height="'+h+'" style="fill:'+P.devFill+'"/><path d="M0 '+f(.75)+'H'+w+'" style="stroke:'+P.wfLine+';stroke-width:'+f(1.5)+'"/>';
      it.forEach(({t,m:mk},q)=>{ const cx=cw*q+cw/2; if(mk) s+='<rect x="'+(cw*q+f(3))+'" y="'+f(4)+'" width="'+(cw-f(6))+'" height="'+(h-f(8))+'" rx="'+f(6)+'" style="fill:'+mk.color+';fill-opacity:.14;stroke:'+mk.color+';stroke-width:'+f(1.2)+'"/>';
        s+='<circle cx="'+cx+'" cy="'+(h/2-f(7))+'" r="'+f(8)+'" style="fill:'+(mk?mk.color:q?P.wfLine:(A||P.wfInk))+'"/>'+txt(cx,h/2+f(16),t,10.5,q&&!mk?400:600,mk?mk.color:q?P.wfText:(A||P.nodeText),'middle'); }); break; }
    case 'uiSidebar': { const it=uiItems(L).map(uiMark); s+='<rect width="'+w+'" height="'+h+'" style="fill:'+P.wfFill+'"/>';
      it.forEach(({t,m:mk},q)=>{ const y=f(16+q*40); if(y+f(32)>h) return; if(!q||mk) s+='<rect x="'+f(10)+'" y="'+y+'" width="'+(w-f(20))+'" height="'+f(32)+'" rx="'+f(7)+'" style="'+(mk?'fill:'+mk.color+';fill-opacity:.15;stroke:'+mk.color+';stroke-width:'+f(1.2):A?'fill:'+A+';fill-opacity:.2':'fill:'+P.wfLine)+'"/>'; s+='<rect x="'+f(22)+'" y="'+(y+f(9))+'" width="'+f(14)+'" height="'+f(14)+'" rx="'+f(3)+'" style="fill:'+(mk?mk.color:q?P.wfLine:(A||P.wfInk))+'"/>'+txt(f(46),y+f(21),t,13,q&&!mk?400:600,mk?mk.color:q?P.wfText:P.nodeText).replace('<text ',mk&&mk.k==='del'?'<text text-decoration="line-through" ':'<text '); }); break; }
    case 'uiTable': { // header row with the column names, then rows of grey placeholder text
      const cm=(uiItems(L).length?uiItems(L):['Name','Status','Date']).map(uiMark), cols=cm.map(c=>c.t); const cw=w/cols.length, hh=f(28), rh=f(26); const rows=Math.max(1,Math.floor((h-hh)/rh));
      s+='<rect x=".5" y=".5" width="'+(w-1)+'" height="'+(h-1)+'" rx="'+f(6)+'" style="fill:'+P.devFill+';stroke:'+P.wfLine+';stroke-width:'+f(1.2)+'"/>';
      s+='<path d="M'+f(6)+' .5H'+(w-f(6))+'a'+f(6)+' '+f(6)+' 0 0 1 '+f(6)+' '+f(6)+'V'+hh+'H.5V'+f(6.5)+'a'+f(6)+' '+f(6)+' 0 0 1 '+f(6)+' -'+f(6)+'z" style="'+tint(A?.22:1)+'"/>';
      // New, changed or removed columns: tinted from top to bottom, with the header in the mark's colour.
      cm.forEach((c,q)=>{ if(c.m) s+='<rect x="'+(q*cw+f(1))+'" y="'+f(1)+'" width="'+(cw-f(2))+'" height="'+(h-f(2))+'" rx="'+f(4)+'" style="fill:'+c.m.color+';fill-opacity:.12;stroke:'+c.m.color+';stroke-width:'+f(1.4)+'"/>'; });
      cols.forEach((c,q)=>{ const mk=cm[q].m; s+=txt(q*cw+f(10),hh/2+f(4),c,11,mk?700:600,mk?mk.color:(A||P.nodeText)).replace('<text ',mk&&mk.k==='del'?'<text text-decoration="line-through" ':'<text '); });
      for(let r=0;r<rows;r++){ const y=hh+r*rh; if(y+rh>h+1) break; if(r) s+='<path d="M0 '+y+'H'+w+'" style="stroke:'+P.wfLine+';stroke-width:'+f(1)+'"/>';
        cols.forEach((c,q)=>{ const bw=(cw-f(20))*[0.8,0.55,0.7,0.45][(r+q)%4]; const mk=cm[q].m; s+='<rect x="'+(q*cw+f(10))+'" y="'+(y+rh/2-f(3))+'" width="'+bw.toFixed(1)+'" height="'+f(6)+'" rx="'+f(3)+'" style="fill:'+(mk?mk.color:P.wfLine)+(mk?';fill-opacity:.45':'')+'"/>'; }); }
      s+='<path d="M0 '+hh+'H'+w+'" style="stroke:'+P.wfLine+';stroke-width:'+f(1.2)+'"/>';
      break; }
  }
  // A whole piece marked new, changed or removed: a coloured outline and a small label above it.
  if(fm.m&&!['uiTable','uiSidebar','uiTabbar'].includes(n.shape)){ const c=fm.m.color, pad=f(4), bw=Core.measure(fm.m.name.toUpperCase(),9)*k+f(12);
    s+='<rect x="'+(-pad)+'" y="'+(-pad)+'" width="'+(w+pad*2)+'" height="'+(h+pad*2)+'" rx="'+f(9)+'" style="fill:'+c+';fill-opacity:.08;stroke:'+c+';stroke-width:'+f(1.6)+(fm.m.k==='del'?';stroke-dasharray:'+f(4)+' '+f(3):'')+'"/>';
    s+='<rect x="'+(w+pad-bw)+'" y="'+(-pad-f(16))+'" width="'+bw+'" height="'+f(14)+'" rx="'+f(7)+'" style="fill:'+c+'"/><text x="'+(w+pad-bw/2)+'" y="'+(-pad-f(6))+'" text-anchor="middle" style="fill:#fff;font:700 '+f(9)+'px '+font+';letter-spacing:.04em">'+fm.m.name.toUpperCase()+'</text>'; }
  return s;
}
// Device frames: a phone, an iPad or a browser window around a screen.
function deviceFrame(g,b,P,live,stroke,sw){
  const x=b.x,y=b.y,w=b.w,h=b.h,dv=g.dev,k=w/(DEVICES[dv]||DEVICES.mobile).w,f=v=>+(v*k).toFixed(2); let s='';
  const rx=f(dv==='mobile'?34:dv==='tablet'?24:10);
  s+='<rect'+(live?' class="frame-body" data-kind="group" data-part="body" data-id="'+esc(g.id)+'"':'')+' x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" style="fill:'+P.devFill+';stroke:'+stroke+';stroke-width:'+sw+'"/>';
  if(dv==='mobile') s+='<rect x="'+(x+w/2-f(38))+'" y="'+(y+f(11))+'" width="'+f(76)+'" height="'+f(20)+'" rx="'+f(10)+'" style="fill:'+P.devStroke+';pointer-events:none"/><rect x="'+(x+w/2-f(50))+'" y="'+(y+h-f(11))+'" width="'+f(100)+'" height="'+f(4)+'" rx="'+f(2)+'" style="fill:'+P.devStroke+';opacity:.7;pointer-events:none"/>';
  else if(dv==='tablet') s+='<circle cx="'+(x+w/2)+'" cy="'+(y+f(15))+'" r="'+f(3.5)+'" style="fill:'+P.devStroke+';pointer-events:none"/><rect x="'+(x+w/2-f(60))+'" y="'+(y+h-f(10))+'" width="'+f(120)+'" height="'+f(4)+'" rx="'+f(2)+'" style="fill:'+P.devStroke+';opacity:.7;pointer-events:none"/>';
  else s+='<g style="pointer-events:none"><path d="M'+x+' '+(y+f(34))+'H'+(x+w)+'" style="stroke:'+P.wfLine+';stroke-width:'+f(1.5)+'"/>'+[0,1,2].map(q=>'<circle cx="'+(x+f(18+q*15))+'" cy="'+(y+f(17))+'" r="'+f(4.5)+'" style="fill:'+P.wfLine+'"/>').join('')+
    '<rect x="'+(x+f(76))+'" y="'+(y+f(8))+'" width="'+Math.max(f(80),w*0.5)+'" height="'+f(18)+'" rx="'+f(9)+'" style="fill:'+P.wfFill+'"/></g>';
  return s;
}
function nodeInner(n,m,P,live){
  if(isUi(n)) return uiInner(n,m,P,live);
  if(n.shape==='table') return tableInner(n,m,P,live);
  if(n.shape==='doc') return docInner(n,m,P,live);
  const w=n.w,h=n.h,st=styleOf(m,n.id);
  const acc=n.group?themeAccent(m,n.group):null;
  const F=(st&&st.fill)||P.nodeFill, S=(st&&st.stroke)||acc||P.nodeStroke, T=(st&&st.color)||((st&&st.fill)?inkFor(st.fill):P.nodeText);
  const sty='fill:'+F+';stroke:'+S+';stroke-width:'+P.nodeSw;
  let s='';
  switch(n.shape){
    case 'round': s='<rect class="shape" width="'+w+'" height="'+h+'" rx="14" style="'+sty+'"/>'; break;
    case 'stadium': s='<rect class="shape" width="'+w+'" height="'+h+'" rx="'+(h/2)+'" style="'+sty+'"/>'; break;
    case 'circle': s='<ellipse class="shape" cx="'+(w/2)+'" cy="'+(h/2)+'" rx="'+(w/2)+'" ry="'+(h/2)+'" style="'+sty+'"/>'; break;
    case 'diamond': s='<path class="shape" d="M'+(w/2)+' 0L'+w+' '+(h/2)+'L'+(w/2)+' '+h+'L0 '+(h/2)+'Z" style="'+sty+';stroke-linejoin:round"/>'; break;
    case 'hex': { const k=Math.min(18,w/4); s='<path class="shape" d="M'+k+' 0H'+(w-k)+'L'+w+' '+(h/2)+'L'+(w-k)+' '+h+'H'+k+'L0 '+(h/2)+'Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'para': { const k=Math.min(16,w/5); s='<path class="shape" d="M'+k+' 0H'+w+'L'+(w-k)+' '+h+'H0Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'cyl': { const ry=Math.min(9,h/6); s='<path class="shape" d="M0 '+ry+'A'+(w/2)+' '+ry+' 0 0 1 '+w+' '+ry+'V'+(h-ry)+'A'+(w/2)+' '+ry+' 0 0 1 0 '+(h-ry)+'Z" style="'+sty+'"/><path d="M0 '+ry+'A'+(w/2)+' '+ry+' 0 0 0 '+w+' '+ry+'" style="fill:none;stroke:'+S+';stroke-width:'+P.nodeSw+'"/>'; break; }
    case 'sub': s='<rect class="shape" width="'+w+'" height="'+h+'" rx="3" style="'+sty+'"/><path d="M8 0V'+h+'M'+(w-8)+' 0V'+h+'" style="stroke:'+S+';stroke-width:'+P.nodeSw+'"/>'; break;
    case 'cloud': { const P2=(a,b)=>(a*w).toFixed(1)+' '+(b*h).toFixed(1);
      s='<path class="shape" d="M'+P2(.22,.86)+'C'+P2(.07,.86)+' '+P2(0,.74)+' '+P2(.03,.62)+'C'+P2(.05,.5)+' '+P2(.13,.44)+' '+P2(.22,.45)+'C'+P2(.2,.27)+' '+P2(.34,.15)+' '+P2(.49,.18)+'C'+P2(.57,.05)+' '+P2(.77,.05)+' '+P2(.82,.22)+'C'+P2(.96,.22)+' '+P2(1.01,.38)+' '+P2(.97,.49)+'C'+P2(1.01,.64)+' '+P2(.93,.8)+' '+P2(.8,.82)+'C'+P2(.76,.92)+' '+P2(.64,.93)+' '+P2(.57,.87)+'C'+P2(.48,.95)+' '+P2(.31,.95)+' '+P2(.22,.86)+'Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'bubble': { const bh=h-14, r=Math.min(14,bh/3); s='<path class="shape" d="M'+r+' 0H'+(w-r)+'Q'+w+' 0 '+w+' '+r+'V'+(bh-r)+'Q'+w+' '+bh+' '+(w-r)+' '+bh+'H'+(w*0.34)+'L'+(w*0.18)+' '+h+'L'+(w*0.22)+' '+bh+'H'+r+'Q0 '+bh+' 0 '+(bh-r)+'V'+r+'Q0 0 '+r+' 0Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'tri': s='<path class="shape" d="M'+(w/2)+' 0L'+w+' '+h+'H0Z" style="'+sty+';stroke-linejoin:round"/>'; break;
    case 'star': { let d=''; for(let k=0;k<10;k++){ const a=-Math.PI/2+k*Math.PI/5, rr=k%2?0.42:1; d+=(k?'L':'M')+(w/2+Math.cos(a)*w/2*rr).toFixed(1)+' '+(h*0.53+Math.sin(a)*h*0.53*rr).toFixed(1); } s='<path class="shape" d="'+d+'Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'arrow': { const hw=Math.min(h*0.62,w*0.4); s='<path class="shape" d="M0 '+(h*0.24)+'H'+(w-hw)+'V0L'+w+' '+(h/2)+'L'+(w-hw)+' '+h+'V'+(h*0.76)+'H0Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'chevron': { const k=Math.min(h/2.2,w/4); s='<path class="shape" d="M0 0H'+(w-k)+'L'+w+' '+(h/2)+'L'+(w-k)+' '+h+'H0L'+k+' '+(h/2)+'Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'paper': { const k=Math.min(10,h/6); s='<path class="shape" d="M0 0H'+w+'V'+(h-k)+'C'+(w*0.75)+' '+(h-k*2.4)+' '+(w*0.55)+' '+(h+k*0.7)+' '+(w*0.3)+' '+(h-k*0.5)+'C'+(w*0.18)+' '+(h-k*1.3)+' '+(w*0.08)+' '+(h-k*0.7)+' 0 '+(h-k*0.9)+'Z" style="'+sty+';stroke-linejoin:round"/>'; break; }
    case 'sticky': s='<rect class="shape sticky" width="'+w+'" height="'+h+'" rx="2" style="fill:'+((st&&st.fill)||'#fff9b1')+';stroke:none"/>'; break;
    case 'text': s=live?'<rect class="hit" width="'+w+'" height="'+h+'" rx="4" style="fill:transparent;stroke:transparent"/>':''; break;
    case 'icon': {
      const is=iconSize(n); const ic=iconFor(n.icon);
      if(live) s+='<rect class="hit" x="-4" y="-4" width="'+(w+8)+'" height="'+(h+8)+'" rx="8" style="fill:transparent;stroke:transparent"/>';
      if(ic) s+='<image href="'+ic.uri+'" x="'+((w-is)/2)+'" y="0" width="'+is+'" height="'+is+'" preserveAspectRatio="xMidYMid meet"/>';
      else s+='<rect x="'+((w-is)/2)+'" y="0" width="'+is+'" height="'+is+'" rx="10" style="fill:'+P.nodeFill+';stroke:'+P.nodeStroke+';stroke-dasharray:4 3"/><text x="'+(w/2)+'" y="'+(is/2+4)+'" text-anchor="middle" style="fill:'+P.muted+';font:500 10px '+P.font+'">'+(Icons.ready||Icons.failed?'?':'…')+'</text>';
      break;
    }
    default: s='<rect class="shape" width="'+w+'" height="'+h+'" rx="4" style="'+sty+'"/>';
  }
  const lines=n.lines||[]; const lh=lineH(n),fs=labelSize(n);
  let y0;
  if(n.shape==='icon'){ y0=iconSize(n)+8+fs*0.95; }
  else if(n.shape==='text'){ const th=lines.length*lh; y0=(h-th)/2+lh*0.76; }
  else { const th=lines.length*lh; y0=(h-th)/2+lh*0.74+(n.rot?0:({cyl:4,tri:h*0.17,star:h*0.05,bubble:-7,paper:-4,cloud:h*0.03}[n.shape]||0)); }
  if(lines.some(Boolean)){
    const tcol=n.shape==='sticky'?((st&&st.color)||'#1d2026'):(n.shape==='icon'||n.shape==='text'?P.nodeText:T);
    const tc=(st&&st.color)||tcol; const wt=st&&st.bold?700:(n.shape==='sticky'?400:500); const it=st&&st.italic?'italic ':'';
    if(st&&st.bg){ lines.forEach((l,k)=>{ if(!l) return; const lw=measureN(n,l,fs); s+='<rect class="lbl" x="'+(w/2-lw/2-3).toFixed(1)+'" y="'+(y0+k*lh-fs*0.86).toFixed(1)+'" width="'+(lw+6).toFixed(1)+'" height="'+(fs*1.18).toFixed(1)+'" rx="2" style="fill:'+st.bg+'"/>'; }); }
    s+='<text class="lbl" text-anchor="middle"'+(canTurn(n)?' transform="rotate('+n.rot+' '+(w/2)+' '+(h/2)+')"':'')+' style="fill:'+tc+';font:'+it+wt+' '+fs+'px '+(fontCss(n.font)||P.font)+'">';
    lines.forEach((l,k)=>{ s+='<tspan x="'+(w/2)+'" y="'+(y0+k*lh).toFixed(1)+'">'+esc(l)+'</tspan>'; });
    s+='</text>';
  }
  return s;
}
function nodeRect(m,id,boxes){ const n=m.nodes.get(id); if(n) return n; return boxes.get(id)||null; }
// A connector end: a shape, a frame, or one row of a table. Row ends leave and enter from the left or right.
function endRect(m,id,boxes,row){ const n=m.nodes.get(id); if(n&&n.shape==='table'&&row!=null&&n.x!=null) return rowRect(n,row); return nodeRect(m,id,boxes); }
// Which row of a table the pointer is over, and the nearer side. Null over the title or for other shapes.
function rowPick(m,id,p){ const n=m.nodes.get(id); if(!n||n.shape!=='table'||n.x==null||!p) return null; const L=n._tl||tableLayout(n); if(p.y<n.y+L.top) return null; return {row:rowAt(n,p.y),side:p.x<n.x+n.w/2?'l':'r'}; }
function edgeEnds(m,e,boxes){
  const a=endRect(m,e.from,boxes,e.ra), b=endRect(m,e.to,boxes,e.rb); if(!a||!b||a.x==null||b.x==null) return null;
  let sa=e.sa||null, sb=e.sb||null;
  if(e.ra!=null&&!sa) sa=(b.x+b.w/2)>(a.x+a.w/2)?'r':'l';
  if(e.rb!=null&&!sb) sb=(a.x+a.w/2)>(b.x+b.w/2)?'r':'l';
  return {a,b,sides:sa||sb?{a:sa,b:sb}:null};
}
function markerDefs(P,pre){
  const mk=(id,c)=>
    '<marker id="'+pre+'a-'+id+'" viewBox="0 0 10 10" refX="9.6" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0.6 0.9L9.6 5L0.6 9.1Z" style="fill:'+c+'"/></marker>'+
    '<marker id="'+pre+'c-'+id+'" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><circle cx="5" cy="5" r="3.8" style="fill:'+P.labelBg+';stroke:'+c+';stroke-width:1.6"/></marker>'+
    '<marker id="'+pre+'x-'+id+'" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" style="fill:none;stroke:'+c+';stroke-width:1.8"/></marker>';
  return mk('n',P.edge)+mk('s',P.accent);
}
// Elbow connectors are routed around shapes; the result is kept for handles and label editing.
function elbowRoutes(m,boxes){
  const items=[];
  m.edges.forEach((e,i)=>{ if(e.from===e.to) return; const r=routeOf(m,e); if(r==='straight') return; const en=edgeEnds(m,e,boxes); if(!en) return;
    // Curved connectors that would cut through other shapes are routed around them too, then drawn with soft corners.
    if(r==='curved'&&!curveHits(m,e,en)) return;
    items.push({i,from:e.from+(e.ra!=null?'#'+e.ra:''),to:e.to+(e.rb!=null?'#'+e.rb:''),a:en.a,b:en.b,sa:en.sides&&en.sides.a,sb:en.sides&&en.sides.b,soft:r==='curved'}); });
  let out; try{ out=orthoRoutes(m,items); }catch(err){ out=new Map(); }
  for(const it of items){ const g=out.get(it.i); if(g&&it.soft) g.r=34; }
  return out;
}
// Does the plain curve between the two ends pass through another shape?
function curveHits(m,e,en){
  const shp=edgeShape(en.a,en.b,0,'curved',en.sides); if(shp.type!=='bez') return false;
  const skip=new Set([e.from,e.to]); const pts=[]; for(let k=2;k<=22;k++) pts.push(cubic(shp.p0,shp.c1,shp.c2,shp.p3,k/24));
  for(const n of m.nodes.values()){ if(skip.has(n.id)||n.x==null) continue; const x0=n.x+4,y0=n.y+4,x1=n.x+n.w-4,y1=n.y+n.h-4; for(const p of pts) if(p.x>x0&&p.x<x1&&p.y>y0&&p.y<y1) return true; }
  return false;
}
function edgeShapeAt(m,i,boxes){ const e=m.edges[i]; if(!e) return null; const r=state.routes&&state.routes.get(i); if(r) return r; const en=edgeEnds(m,e,boxes); if(!en) return null; return edgeShape(en.a,en.b,0,routeOf(m,e),en.sides); }
function edgesMarkup(m,boxes,P,live,pre){
  const counts=new Map(),idx=new Map();
  const routes=elbowRoutes(m,boxes); if(live) state.routes=routes;
  m.edges.forEach(e=>{const k=[e.from,e.to].sort().join('\u0001'); counts.set(k,(counts.get(k)||0)+1);});
  // Lines to and from mockup screens are drawn above the screens' pieces, so they never disappear behind them.
  const onScreen=id=>{ const n=m.nodes.get(id); if(n) return isUi(n)||!!(n.group&&m.groups.get(n.group)&&m.groups.get(n.group).dev); const g=m.groups.get(id); return !!(g&&g.dev); };
  let out='', top='';
  m.edges.forEach((e,i)=>{
    const en=edgeEnds(m,e,boxes); if(!en) return; const a=en.a,b=en.b;
    const o0=out.length;
    if(!live&&e.line==='invis') return;
    const k=[e.from,e.to].sort().join('\u0001'); const c=counts.get(k); const j=idx.get(k)||0; idx.set(k,j+1);
    const off=c>1?(j-(c-1)/2)*28*(e.from<e.to?1:-1):0;
    const sel=live&&state.sel.has('e:'+i);
    const ecol=e.color?(e.color.toLowerCase()==='#1a1a1a'?P.inkBlack:e.color):P.edge; const col=sel?P.accent:ecol;
    const sw=e.width||(e.line==='thick'?P.edgeThick:P.edgeSw);
    const shp=routes.get(i)||edgeShape(a,b,off,routeOf(m,e),en.sides);
    const g=geomPath(shp,headInset(e.tail,sw),headInset(e.head,sw));
    const dash=e.line==='dotted'?';stroke-dasharray:'+(4+sw*1.5)+' '+(4+sw*1.5):e.line==='invis'?';stroke-dasharray:2 6;opacity:.45':'';
    out+='<g class="edge'+(sel?' sel':'')+'"'+(live?' data-kind="edge" data-idx="'+i+'"':'')+'>';
    if(live) out+='<path class="edge-hit" d="'+g.d+'" style="fill:none;stroke:transparent;stroke-width:'+Math.max(14,sw+10)+'"/>';
    out+='<path class="edge-line" d="'+g.d+'" style="fill:none;stroke:'+col+';stroke-width:'+sw+';stroke-linecap:round;stroke-linejoin:round'+dash+'"/>';
    if(e.line!=='invis'){ out+=headMarkup(e.head,g.p3,g.t3,sw,col,P.labelBg,'edge-head'); out+=headMarkup(e.tail,g.p0,g.t0,sw,col,P.labelBg,'edge-head'); }
    if(e.label&&!(live&&state.editing&&state.editing.kind==='edge'&&state.editing.id===i)){
      const ls=wrapText(e.label,180,12); const tw=Math.max(...ls.map(l=>Core.measure(l,12)))+12; const th=ls.length*15+6;
      out+='<rect class="elbl" x="'+(g.mid.x-tw/2)+'" y="'+(g.mid.y-th/2)+'" width="'+tw+'" height="'+th+'" rx="4" style="fill:'+P.labelBg+'"/>';
      out+='<text class="elbl" text-anchor="middle" style="fill:'+(sel?P.accent:(P.edgeText||P.labelText))+';font:500 12px '+P.font+'">';
      ls.forEach((l,k)=>{ out+='<tspan x="'+g.mid.x+'" y="'+(g.mid.y-th/2+3+12+k*15).toFixed(1)+'">'+esc(l)+'</tspan>'; });
      out+='</text>';
    }
    out+='</g>';
    if(onScreen(e.from)||onScreen(e.to)){ top+=out.slice(o0); out=out.slice(0,o0); }
  });
  edgesMarkup.top=top;
  return out;
}
function arrowsMarkup(m,P,live,list){
  let out='';
  for(const a0 of list||m.arrows||[]){
    const a=list?a0:resolveArrow(m,a0);
    const col=a.color.toLowerCase()==='#1a1a1a'?P.inkBlack:a.color; const sel=live&&state.sel.has('a:'+a.id);
    out+='<g class="farrow"'+(live&&a.id?' data-kind="arrow" data-id="'+esc(a.id)+'"':'')+'>';
    if(a.kind==='block'){
      const pts=blockArrowPts(a);
      if(sel) out+='<polygon points="'+pts+'" style="fill:none;stroke:var(--accent);stroke-width:6;stroke-linejoin:round;opacity:.35"/>';
      out+='<polygon points="'+pts+'" style="fill:'+col+';stroke:'+col+';stroke-width:1.5;stroke-linejoin:round"/>';
    } else {
      const head=a.kind==='line'?'none':'arrow'; const g=geomPath(freeArrowShape(a),0,headInset(head,a.w));
      if(live) out+='<path d="'+g.d+'" style="fill:none;stroke:transparent;stroke-width:'+(a.w+14)+'"/>';
      if(sel) out+='<path d="'+g.d+'" style="fill:none;stroke:var(--accent);stroke-width:'+(a.w+6)+';stroke-linecap:round;opacity:.3"/>';
      out+='<path d="'+g.d+'" style="fill:none;stroke:'+col+';stroke-width:'+a.w+';stroke-linecap:round;stroke-linejoin:round"/>'+headMarkup(head,g.p3,g.t3,a.w,col,P.labelBg);
    }
    out+='</g>';
  }
  return out;
}
const imgEls=new Map();
function renderImages(m){
  const seen=new Set();
  for(const im of m.images||[]){
    seen.add(im.id); let el=imgEls.get(im.id);
    if(!el){ el=document.createElementNS(SVGNS,'g'); el.setAttribute('class','pic'); el.dataset.kind='pic'; el.dataset.id=im.id; imgEls.set(im.id,el); el._src=null; }
    const layer=im.front?lImgTop:lImg; if(el.parentNode!==layer||layer.lastChild!==el) layer.appendChild(el);
    const src=IMG[im.id]||null;
    if(el._src!==src){ el._src=src; el.innerHTML=src?'<image preserveAspectRatio="none"/>':'<rect style="fill:var(--panel-2);stroke:var(--line-strong);stroke-dasharray:6 4"/><text text-anchor="middle" style="fill:var(--muted);font:500 13px '+FONT_ATTR+'">Image missing</text>'; if(src) el.firstChild.setAttribute('href',src); }
    el.style.opacity=im.faded?'.4':'';
    const a=el.firstChild; a.setAttribute('x',im.x); a.setAttribute('y',im.y); a.setAttribute('width',im.w); a.setAttribute('height',im.h);
    if(!src){ const t=el.lastChild; t.setAttribute('x',im.x+im.w/2); t.setAttribute('y',im.y+im.h/2); }
  }
  for(const [id,el] of imgEls) if(!seen.has(id)){ el.remove(); imgEls.delete(id); }
}
function imagesMarkup(m,front){ let o=''; for(const im of m.images||[]){ if(!!im.front!==!!front) continue; const src=IMG[im.id]; if(src) o+='<image href="'+src+'" x="'+im.x+'" y="'+im.y+'" width="'+im.w+'" height="'+im.h+'" preserveAspectRatio="none"'+(im.faded?' opacity=".4"':'')+'/>'; } return o; }
function inkPath(pts){
  if(pts.length===1) return 'M'+pts[0][0]+' '+pts[0][1]+'l0.01 0';
  let d='M'+pts[0][0]+' '+pts[0][1];
  for(let i=1;i<pts.length-1;i++){ const mx=(pts[i][0]+pts[i+1][0])/2,my=(pts[i][1]+pts[i+1][1])/2; d+='Q'+pts[i][0]+' '+pts[i][1]+' '+r10(mx)+' '+r10(my); }
  const l=pts[pts.length-1]; return d+'L'+l[0]+' '+l[1];
}
function inkMarkup(m,P,live){
  let out=''; const hide=live&&state.drag&&state.drag.mode==='erase'?state.drag.hits:null;
  for(const k of m.inks||[]){
    if(hide&&hide.has(k.id)) continue;
    const d=inkPath(k.pts); const col=k.color.toLowerCase()==='#1a1a1a'?P.inkBlack:k.color; const op=k.tool==='hl'?0.55:1;
    const sel=live&&state.sel.has('k:'+k.id);
    out+='<g class="ink"'+(live?' data-kind="ink" data-id="'+esc(k.id)+'"':'')+'>';
    if(sel) out+='<path d="'+d+'" style="fill:none;stroke:var(--accent);stroke-width:'+(k.w+6)+';stroke-linecap:round;stroke-linejoin:round;opacity:.3"/>';
    if(live) out+='<path d="'+d+'" style="fill:none;stroke:transparent;stroke-width:'+(k.w+12)+';stroke-linecap:round"/>';
    out+='<path d="'+d+'" style="fill:none;stroke:'+col+';stroke-width:'+k.w+';stroke-linecap:round;stroke-linejoin:round;opacity:'+op+'"/></g>';
  }
  return out;
}
function groupsMarkup(m,boxes,P,live){
  let out='';
  const order=[...m.groupOrder].sort((a,b)=>groupDepth(m,a)-groupDepth(m,b));
  for(const gid of order){
    const g=m.groups.get(gid),b=boxes.get(gid); if(!b) continue;
    const st=styleOf(m,gid); const sel=live&&state.sel.has('g:'+gid); const drop=live&&state.dropGroup===gid;
    const acc=themeAccent(m,gid), TH=boardTheme(m);
    const stroke=sel||drop?P.accent:((st&&st.stroke)||acc||P.frameStroke);
    const fo=P.frameOut, rx=fo?2:12;
    out+='<g class="frame">';
    if(g.dev){ out+=deviceFrame(g,b,P,live,sel||drop?P.accent:P.devStroke,sel||drop?2:1.5);
      if(!(live&&state.editing&&state.editing.kind==='group'&&state.editing.id===gid)) out+='<text x="'+(b.x+2)+'" y="'+(b.y-10)+'" style="fill:'+(sel?P.accent:P.frameText)+';font:500 14px '+P.font+'">'+esc(g.label)+'</text>';
      if(live){ const lw=Core.measure(g.label,14)+28; out+='<rect class="frame-hit" data-kind="group" data-id="'+esc(gid)+'" x="'+b.x+'" y="'+(b.y-30)+'" width="'+Math.max(60,lw)+'" height="28" style="fill:transparent"/><rect class="frame-hit" data-kind="group" data-id="'+esc(gid)+'" x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'" rx="12" style="fill:none;stroke:transparent;stroke-width:10;pointer-events:stroke"/>'; }
      out+='</g>'; continue; }
    const depth=groupDepth(m,gid); const nfill=depth&&fo?(depth%2?'#f7f7f7':'#ffffff'):P.frameFill; const nstroke=depth&&fo&&!sel&&!drop&&!(st&&st.stroke)?'#e2e2e2':stroke;
    out+='<rect'+(live?' class="frame-body" data-kind="group" data-part="body" data-id="'+esc(gid)+'"':'')+' x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'" rx="'+rx+'" style="fill:'+((st&&st.fill)||(acc&&TH.tint?'color-mix(in srgb,'+acc+' 14%,'+TH.bg+')':nfill))+';stroke:'+nstroke+';stroke-width:'+(drop?2:acc?2:sel&&fo?1.5:P.frameSw)+(drop?';stroke-dasharray:6 4':'')+'"/>';
    const editingThis=live&&state.editing&&state.editing.kind==='group'&&state.editing.id===gid;
    if(!editingThis&&g.rot){ // a turned frame title runs along the left side (or upside down along the bottom)
      const col=(st&&st.color)||(acc&&!(TH&&TH.tint)?acc:P.frameText), cx=g.rot===180?b.x+b.w/2:b.x+20, cy=g.rot===180?b.y+b.h-14:b.y+b.h/2;
      out+='<text x="'+cx+'" y="'+cy+'" text-anchor="middle" dominant-baseline="middle" transform="rotate('+(g.rot===270?-90:g.rot)+' '+cx+' '+cy+')" style="fill:'+col+';font:600 '+(fo?14:13)+'px '+(fontCss(TH&&TH.font)||P.font)+'">'+esc(g.label)+'</text>'; }
    else if(!editingThis){
      if(fo) out+='<text x="'+(b.x+1)+'" y="'+(b.y-10)+'" style="fill:'+(sel?P.accent:((st&&st.color)||P.frameText))+';font:500 14px '+P.font+'">'+esc(g.label)+'</text>';
      else out+='<text x="'+(b.x+14)+'" y="'+(b.y+24)+'" style="fill:'+((st&&st.color)||(acc&&!TH.tint?acc:P.frameText))+';font:'+(acc?700:600)+' 12.5px '+(fontCss(TH&&TH.font)||P.font)+';letter-spacing:.01em">'+esc(g.label)+'</text>';
    }
    if(live){
      const lw=Core.measure(g.label,fo?14:12)+28;
      if(fo) out+='<rect class="frame-hit" data-kind="group" data-id="'+esc(gid)+'" x="'+b.x+'" y="'+(b.y-30)+'" width="'+Math.max(60,lw)+'" height="28" style="fill:transparent"/>';
      else out+='<rect class="frame-hit" data-kind="group" data-id="'+esc(gid)+'" x="'+b.x+'" y="'+b.y+'" width="'+Math.min(b.w,Math.max(60,lw))+'" height="34" rx="12" style="fill:transparent"/>';
      out+='<rect class="frame-hit" data-kind="group" data-id="'+esc(gid)+'" x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+'" rx="12" style="fill:none;stroke:transparent;stroke-width:10;pointer-events:stroke"/>';
    }
    out+='</g>';
  }
  return out;
}
// A board theme sets the board's colours on the board pane, so everything drawn there picks them up.
let themeOn='';
function applyBoardTheme(m){
  const T=boardTheme(m), key=T?m.theme:''; if(key===themeOn) return; themeOn=key;
  const V={'--board':'bg','--dot':'grid','--grid':'grid','--node-fill':'node','--node-stroke':'stroke','--node-text':'text','--edge':'edge','--frame-fill':'frame','--frame-text':'frameText','--label-bg':'label','--code-bg':'code','--edge-text':'edgeText','--ink-black':'ink'};
  for(const [v,k] of Object.entries(V)){ if(T&&T[k]) boardPane.style.setProperty(v,T[k]); else boardPane.style.removeProperty(v); }
  if(T) boardPane.style.setProperty('--frame-stroke',T.accents?'transparent':T.stroke); else boardPane.style.removeProperty('--frame-stroke');
  boardPane.dataset.btheme=key; boardPane.classList.toggle('bt-dark',!!(T&&T.dark));
}
// Colours for pictures of a themed board (PNG, SVG).
function palExport(m){ const T=boardTheme(m); if(!T) return PAL_EXPORT;
  return {...PAL_EXPORT,edgeText:T.edgeText||PAL_EXPORT.labelText,inkBlack:T.ink||PAL_EXPORT.inkBlack,nodeFill:T.node,nodeStroke:T.stroke,nodeText:T.text,edge:T.edge,accent:T.accents?T.accents[0]:T.stroke,labelBg:T.label,labelText:T.dark?'#c9cbe0':PAL_EXPORT.labelText,frameFill:T.frame,frameStroke:T.accents?'transparent':T.stroke,frameText:T.frameText,codeBg:T.code||PAL_EXPORT.codeBg,muted:T.dark?'#9ea3c0':PAL_EXPORT.muted,bg:T.bg,frameOut:false}; }
function render(){
  const m=state.model; applyBoardTheme(m);
  $('#emptyHint').hidden=!!(m&&(m.nodes.size||m.groups.size||m.inks.length||m.arrows.length||m.images.length));
  if(!m){ lGroups.innerHTML=lEdges.innerHTML=lOver.innerHTML=lInk.innerHTML=''; for(const el of imgEls.values()) el.remove(); imgEls.clear(); for(const el of R.nodeEls.values()) el.remove(); R.nodeEls.clear(); R.sig.clear(); applyView(); updCtx(); return; }
  if(state.dragExclude&&state.dragExclude.size){ const bx=groupBoxes(m,state.dragExclude); for(const [gid,hb] of state.dragHome||[]) if(!bx.has(gid)) bx.set(gid,hb); state.boxes=bx; }
  else state.boxes=groupBoxes(m);
  lGroups.innerHTML=groupsMarkup(m,state.boxes,PAL_LIVE,true);
  renderImages(m);
  lInk.innerHTML=arrowsMarkup(m,PAL_LIVE,true)+inkMarkup(m,PAL_LIVE,true);
  lEdges.innerHTML=edgesMarkup(m,state.boxes,PAL_LIVE,true,'L'); lEdgesTop.innerHTML=edgesMarkup.top;
  const seen=new Set();
  for(const id of m.nodeOrder){
    const n=m.nodes.get(id); seen.add(id);
    let el=R.nodeEls.get(id);
    if(!el){ el=document.createElementNS(SVGNS,'g'); el.setAttribute('class','node'); el.dataset.kind='node'; el.dataset.id=id; lNodes.appendChild(el); R.nodeEls.set(id,el); }
    const st=styleOf(m,id);
    const sig=[n.shape,n.label,n.icon,n.w,n.h,isUi(n)?uiScale(m,n)+(st&&st.fill||''):'',n.table?JSON.stringify(n.table):'',n.doc?JSON.stringify(n.doc):'',n.fs,n.fsSet,st?[st.bold,st.italic,st.bg].join(','):'',(n.lines||[]).join('\n'),st?(st.fill+'|'+st.stroke+'|'+st.color+'|'+(st.font||'')):'',n.fsAuto,Icons.ready,Icons.failed].join('\u0001');
    if(R.sig.get(id)!==sig){ el.innerHTML=nodeInner(n,m,PAL_LIVE,true); R.sig.set(id,sig); }
    el.setAttribute('transform','translate('+n.x+','+n.y+')');
    el.classList.toggle('editing',!!(state.editing&&state.editing.kind==='node'&&state.editing.id===id));
    el.classList.toggle('rich-hidden',state.richId===id);
  }
  for(const [id,el] of R.nodeEls) if(!seen.has(id)){ el.remove(); R.nodeEls.delete(id); R.sig.delete(id); }
  renderOverlay(); applyView(); updCtx();
}
function selNodes(){ const m=state.model; const out=[]; if(!m) return out; for(const k of state.sel) if(k[0]==='n'){ const n=m.nodes.get(k.slice(2)); if(n) out.push(n);} return out; }
function renderOverlay(){
  const m=state.model; if(!m){lOver.innerHTML='';return;}
  const z=state.view.z,u=1/z; let h='';
  const d=state.drag;
  if(!state.richId) for(const k of state.sel){
    if(k[0]==='n'){ const n=m.nodes.get(k.slice(2)); if(n) h+='<rect x="'+(n.x-4*u)+'" y="'+(n.y-4*u)+'" width="'+(n.w+8*u)+'" height="'+(n.h+8*u)+'" rx="'+(6*u)+'" style="fill:none;stroke:var(--accent);stroke-width:'+(1.5*u)+';pointer-events:none"/>'; }
  }
  const sn=selNodes();
  if(sn.length===1&&state.sel.size===1&&!state.editing&&!state.richId&&(!d||d.mode==='resize')&&state.tool==='select'){
    const n=sn[0]; const hs=8*u;
    const hl=[['nw',n.x-4*u,n.y-4*u],['ne',n.x+n.w+4*u,n.y-4*u],['sw',n.x-4*u,n.y+n.h+4*u],['se',n.x+n.w+4*u,n.y+n.h+4*u]];
    if(n.shape==='text') hl.push(['e',n.x+n.w+4*u,n.y+n.h/2],['w',n.x-4*u,n.y+n.h/2]);
    for(const [c,x,y] of hl)
      h+='<rect class="handle '+c+'" data-kind="handle" data-corner="'+c+'" data-id="'+esc(n.id)+'" x="'+(x-hs/2)+'" y="'+(y-hs/2)+'" width="'+hs+'" height="'+hs+'" rx="'+(2*u)+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(1.5*u)+'"/>';
  }
  const sg=[...state.sel].filter(k=>k[0]==='g');
  if(sg.length===1&&state.sel.size===1&&!state.editing&&(!d||d.mode==='gresize')&&state.tool==='select'){
    const gid=sg[0].slice(2); const b=state.boxes.get(gid);
    if(b){ const hs=9*u;
      for(const [c,x,y] of [['nw',b.x,b.y],['n',b.x+b.w/2,b.y],['ne',b.x+b.w,b.y],['e',b.x+b.w,b.y+b.h/2],['se',b.x+b.w,b.y+b.h],['s',b.x+b.w/2,b.y+b.h],['sw',b.x,b.y+b.h],['w',b.x,b.y+b.h/2]])
        h+='<rect class="handle '+c+'" data-kind="handle" data-corner="'+c+'" data-gid="'+esc(gid)+'" x="'+(x-hs/2)+'" y="'+(y-hs/2)+'" width="'+hs+'" height="'+hs+'" rx="'+(2*u)+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(1.5*u)+'"/>';
    }
  }
  let pid=null;
  if(!d||d.mode==='connect'){ pid=state.hover; if(!pid&&sn.length===1&&state.sel.size===1) pid=sn[0].id; }
  if(d&&d.mode==='connect') pid=null;
  if(pid&&!state.editing&&!state.richId&&(state.tool==='select'||state.tool==='connector')){
    const n=nodeRect(m,pid,state.boxes); const isG=!m.nodes.has(pid);
    if(n){ const o=14*u,r=5*u; const top=isG&&PAL_LIVE.frameOut?n.y-30-o:n.y-o;
      const isT=!isG&&n.shape==='table'; const ports=isT?[['t',n.x+n.w/2,top],['b',n.x+n.w/2,n.y+n.h+o]]:[['t',n.x+n.w/2,top],['r',n.x+n.w+o,n.y+n.h/2],['b',n.x+n.w/2,n.y+n.h+o],['l',n.x-o,n.y+n.h/2]];
      if(isT){ const L=n._tl||tableLayout(n); L.rows.forEach((_,ri)=>{ const rr=rowRect(n,ri); for(const [s,x] of [['l',n.x-o],['r',n.x+n.w+o]]) h+='<g class="port" data-kind="port" data-id="'+esc(pid)+'" data-side="'+s+'" data-row="'+ri+'"><circle cx="'+x+'" cy="'+(rr.y+rr.h/2)+'" r="'+(Math.min(11,rr.h/2)*u)+'" style="fill:transparent"/><circle cx="'+x+'" cy="'+(rr.y+rr.h/2)+'" r="'+(4*u)+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(1.5*u)+'"/></g>'; }); }
      for(const [s,x,y] of ports)
        h+='<g class="port" data-kind="port" data-id="'+esc(pid)+'" data-side="'+s+'"><circle cx="'+x+'" cy="'+y+'" r="'+(11*u)+'" style="fill:transparent"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(1.5*u)+'"/></g>';
    }
  }
  if(d&&d.mode==='draw'&&d.pts.length){
    const col=d.color.toLowerCase()==='#1a1a1a'?'var(--ink-black)':d.color;
    h+='<path d="'+inkPath(d.pts)+'" style="fill:none;stroke:'+col+';stroke-width:'+d.w+';stroke-linecap:round;stroke-linejoin:round;opacity:'+(d.tool==='hl'?0.55:1)+';pointer-events:none"/>';
  }
  if(d&&d.mode==='erase'&&d.cur) h+='<circle cx="'+d.cur.x+'" cy="'+d.cur.y+'" r="'+(10*u)+'" style="fill:color-mix(in srgb,var(--fg) 8%,transparent);stroke:var(--muted);stroke-width:'+u+';pointer-events:none"/>';
  const sa=[...state.sel].filter(k=>k[0]==='a');
  if(sa.length===1&&state.sel.size===1&&(!d||d.mode==='aend')){
    const a0=m.arrows.find(x=>x.id===sa[0].slice(2)); const a=a0&&resolveArrow(m,a0);
    if(a) for(const [end,x,y] of [[0,a.x1,a.y1],[1,a.x2,a.y2]]) h+='<circle class="handle" data-kind="ahandle" data-id="'+esc(a.id)+'" data-end="'+end+'" cx="'+x+'" cy="'+y+'" r="'+(6*u)+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(2*u)+';cursor:move"/>';
  }
  for(const k of state.sel){ if(k[0]!=='p') continue; const im=m.images.find(x=>x.id===k.slice(2)); if(im) h+='<rect x="'+(im.x-2*u)+'" y="'+(im.y-2*u)+'" width="'+(im.w+4*u)+'" height="'+(im.h+4*u)+'" style="fill:none;stroke:var(--accent);stroke-width:'+(1.5*u)+';pointer-events:none"/>'; }
  const sp=[...state.sel].filter(k=>k[0]==='p');
  if(sp.length===1&&state.sel.size===1&&(!d||d.mode==='presize')){ const im=m.images.find(x=>x.id===sp[0].slice(2)); if(im){ const hs=9*u;
    for(const [c,x,y] of [['nw',im.x,im.y],['ne',im.x+im.w,im.y],['sw',im.x,im.y+im.h],['se',im.x+im.w,im.y+im.h]]) h+='<rect class="handle '+c+'" data-kind="phandle" data-corner="'+c+'" data-id="'+esc(im.id)+'" x="'+(x-hs/2)+'" y="'+(y-hs/2)+'" width="'+hs+'" height="'+hs+'" rx="'+(2*u)+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(1.5*u)+'"/>'; } }
  const se=[...state.sel].filter(k=>k[0]==='e');
  if(se.length===1&&state.sel.size===1&&!d&&state.tool==='select'){
    const i=+se[0].slice(2); const e=m.edges[i]; const en=e&&edgeEnds(m,e,state.boxes);
    if(en){ const g=geomPath(edgeShapeAt(m,i,state.boxes),0,0);
      for(const [end,pt] of [[0,g.p0],[1,g.p3]]) h+='<circle class="handle" data-kind="ehandle" data-idx="'+i+'" data-end="'+end+'" cx="'+pt.x+'" cy="'+pt.y+'" r="'+(6*u)+'" style="fill:var(--panel);stroke:var(--accent);stroke-width:'+(2*u)+';cursor:move"/>'; }
  }
  if(d&&d.mode==='eend'){
    const e=m.edges[d.idx]; const fixedId=d.end?e.from:e.to; const fr=endRect(m,fixedId,state.boxes,d.end?e.ra:e.rb); const rp=d.target?rowPick(m,d.target,d.cur):null; const t=d.target?(rp?rowRect(m.nodes.get(d.target),rp.row):nodeRect(m,d.target,state.boxes)):null;
    if(rp) h+=rowBand(t,u);
    if(fr){ const tr=t||{x:d.cur.x-1,y:d.cur.y-1,w:2,h:2}; const ns=rp?rp.side:t?sideNear(t,d.cur):null; const g=d.end?edgeGeom(fr,tr,0,routeOf(m,e),{a:e.sa||null,b:ns}):edgeGeom(tr,fr,0,routeOf(m,e),{a:ns,b:e.sb||null});
      h+='<path d="'+g.d+'" style="fill:none;stroke:var(--accent);stroke-width:1.8;stroke-dasharray:6 4;pointer-events:none"/>'; }
  }
  if(d&&state.snapTarget&&(d.mode==='eend'||d.mode==='aend'||d.mode==='farrow')){ const t=nodeRect(m,state.snapTarget,state.boxes); if(t) h+='<rect x="'+(t.x-5*u)+'" y="'+(t.y-5*u)+'" width="'+(t.w+10*u)+'" height="'+(t.h+10*u)+'" rx="'+(8*u)+'" style="fill:color-mix(in srgb,var(--accent) 6%,transparent);stroke:var(--accent);stroke-width:'+(2*u)+';pointer-events:none"/>'; }
  if(d&&d.mode==='farrow'&&Math.hypot(d.cur.x-d.start.x,d.cur.y-d.start.y)>2) h+=arrowsMarkup(m,PAL_LIVE,false,[{kind:state.arrowKind,x1:d.start.x,y1:d.start.y,x2:(state.snapTarget&&nodeRect(m,state.snapTarget,state.boxes)?clipToRect(nodeRect(m,state.snapTarget,state.boxes),d.start).x:d.cur.x),y2:(state.snapTarget&&nodeRect(m,state.snapTarget,state.boxes)?clipToRect(nodeRect(m,state.snapTarget,state.boxes),d.start).y:d.cur.y),w:state.arrowW,color:ARROW_COLORS[state.arrowColor]||'#1a1a1a'}]).replace('<g class="farrow"','<g class="farrow" style="pointer-events:none;opacity:.8"');
  if(state.frameOffer&&!d){ const r=state.frameOffer; h+='<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" rx="'+(PAL_LIVE.frameOut?2:12)+'" style="fill:color-mix(in srgb,var(--accent) 5%,transparent);stroke:var(--accent);stroke-width:'+(1.5*u)+';stroke-dasharray:'+(6*u)+' '+(4*u)+';pointer-events:none"/>'; }
  if(d&&d.mode==='marquee'){ const r=normRect(d.start,d.cur); h+='<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" style="fill:color-mix(in srgb,var(--accent) 8%,transparent);stroke:var(--accent);stroke-width:'+u+';pointer-events:none"/>'; }
  if(d&&d.mode==='create'){
    const r=normRect(d.start,d.cur);
    if(r.w>4||r.h>4) h+='<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" rx="'+(d.shape==='frame'?12:4)+'" style="fill:none;stroke:var(--accent);stroke-width:'+(1.5*u)+';stroke-dasharray:'+(5*u)+' '+(4*u)+';pointer-events:none"/>';
  }
  if(!d&&state.pendingFrom&&state.pendPt){
    const a=nodeRect(m,state.pendingFrom,state.boxes); const t=state.hover&&state.hover!==state.pendingFrom?nodeRect(m,state.hover,state.boxes):null;
    if(a){
      const g=edgeGeom(a,t||{x:state.pendPt.x-1,y:state.pendPt.y-1,w:2,h:2},0);
      h+='<rect x="'+(a.x-5*u)+'" y="'+(a.y-5*u)+'" width="'+(a.w+10*u)+'" height="'+(a.h+10*u)+'" rx="'+(8*u)+'" style="fill:none;stroke:var(--accent);stroke-width:'+(2*u)+';stroke-dasharray:'+(5*u)+' '+(4*u)+';pointer-events:none"/>';
      h+='<path d="'+g.d+'" marker-end="url(#La-s)" style="fill:none;stroke:var(--accent);stroke-width:1.6;stroke-dasharray:6 4;pointer-events:none"/>';
      if(t) h+='<rect x="'+(t.x-5*u)+'" y="'+(t.y-5*u)+'" width="'+(t.w+10*u)+'" height="'+(t.h+10*u)+'" rx="'+(8*u)+'" style="fill:none;stroke:var(--accent);stroke-width:'+(2*u)+';pointer-events:none"/>';
    }
  }
  if(d&&d.mode==='connect'){
    const a=endRect(m,d.from,state.boxes,d.fromRow); const rp=d.target?rowPick(m,d.target,d.cur):null; const t=d.target?(rp?rowRect(m.nodes.get(d.target),rp.row):nodeRect(m,d.target,state.boxes)):null;
    if(rp) h+=rowBand(t,u);
    if(a){
      const bR=t||{x:d.cur.x-1,y:d.cur.y-1,w:2,h:2}; const ts=rp?rp.side:t?sideNear(t,d.cur):null;
      const g=edgeGeom(a,bR,0,null,{a:d.side||null,b:ts});
      if(t&&ts){ const sp=sidePt(t,ts); h+='<circle cx="'+sp.x+'" cy="'+sp.y+'" r="'+(5*u)+'" style="fill:var(--accent);pointer-events:none"/>'; }
      h+='<path d="'+g.d+'" marker-end="url(#La-s)" style="fill:none;stroke:var(--accent);stroke-width:'+(1.6)+';stroke-dasharray:6 4;pointer-events:none"/>';
      if(t) h+='<rect x="'+(t.x-5*u)+'" y="'+(t.y-5*u)+'" width="'+(t.w+10*u)+'" height="'+(t.h+10*u)+'" rx="'+(8*u)+'" style="fill:none;stroke:var(--accent);stroke-width:'+(2*u)+';pointer-events:none"/>';
    }
  }
  if(state.guides&&d&&d.mode==='move') for(const g of state.guides) h+='<line x1="'+g.x1+'" y1="'+g.y1+'" x2="'+g.x2+'" y2="'+g.y2+'" style="stroke:#f24726;stroke-width:'+u+';pointer-events:none"/>';
  lOver.innerHTML=h;
}
function rowBand(r,u){ return '<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" style="fill:color-mix(in srgb,var(--accent) 14%,transparent);stroke:var(--accent);stroke-width:'+(1.5*u)+';pointer-events:none"/>'; }
function normRect(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
function isDark(){ const t=document.documentElement.getAttribute('data-theme'); if(t==='dark') return true; if(t==='light') return false; return matchMedia('(prefers-color-scheme: dark)').matches; }
function themeChanged(){ const dk=isDark(); PAL_LIVE.frameOut=!dk; PAL_LIVE.edgeSw=dk?1.5:2; PAL_LIVE.edgeThick=dk?3:4; R.sig.clear(); render();  if(typeof Boards!=='undefined'&&Boards.isHome()) Boards.iconsReady(); }
function applyView(){
  const v=state.view;
  world.setAttribute('transform','translate('+v.x+','+v.y+') scale('+v.z+')');
  const light=PAL_LIVE.frameOut; const gs=(light?24:20)*v.z; const show=gs>=(light?9:7);
  boardPane.style.backgroundImage=!show?'none':light?'linear-gradient(to right,var(--grid) 1px,transparent 1px),linear-gradient(to bottom,var(--grid) 1px,transparent 1px)':'radial-gradient(circle,var(--dot) 1px,transparent 1.4px)';
  boardPane.style.backgroundSize=show?gs+'px '+gs+'px':'0 0';
  boardPane.style.backgroundPosition=v.x+'px '+v.y+'px';
  $('#zoomPct').textContent=Math.round(v.z*100)+'%';
  if(state.editing) placeEditor();
  if(state.richId&&typeof Rich!=='undefined') Rich.place();
  if(typeof renderComments==='function') renderComments();
  if(typeof Mini!=='undefined') Mini.onView();
  if(!ctxEl.hidden) placeCtx();
  if(state.frameOffer) placeFrameOffer();
}
