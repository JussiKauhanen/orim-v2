/* orim · export-drawio.js
 * draw.io (mxGraph XML) export.
 */
'use strict';
function xa(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'&#10;'); }
function b64utf8(str){ return btoa(unescape(encodeURIComponent(str))); }
function dioImg(uri){ const m=/^data:([^;,]+)((?:;[^;,=]+=[^;,]+)*)(;base64)?,(.*)$/.exec(uri||''); if(!m) return uri; return 'data:'+m[1]+','+(m[3]?m[4]:b64utf8(decodeURIComponent(m[4]))); }
function dioLabel(t){ return xa(esc(t||'').replace(/\n/g,'<br>')); }
// sel: optional selection keys (n:, g:, e:, a:, k:, p:). Frames bring their contents along.
function drawioPick(m,sel){
  const P={n:new Set(),g:new Set(),e:new Set(),a:new Set(),k:new Set(),p:new Set()};
  for(const k of sel){ const t=k[0],id=k.slice(2); if(P[t]) P[t].add(id); }
  for(const gid of [...P.g]) for(const g of m.groups.values()) if(isDesc(m,g.id,gid)) P.g.add(g.id);
  for(const n of m.nodes.values()) if(n.group&&P.g.has(n.group)) P.n.add(n.id);
  return P;
}
function buildDrawio(sel){
  const m0=state.model; const all=groupBoxes(m0); const cells=[]; const ids=new Map(); let seq=2;
  let m=m0, boxes=all;
  if(sel&&sel.size){
    const P=drawioPick(m0,sel);
    m=Object.assign({},m0,{
      nodeOrder:m0.nodeOrder.filter(id=>P.n.has(id)),
      groupOrder:m0.groupOrder.filter(id=>P.g.has(id)),
      edges:m0.edges.map((e,i)=>P.e.has(String(i))||(P.n.has(e.from)||P.g.has(e.from))&&(P.n.has(e.to)||P.g.has(e.to))?e:null),
      arrows:m0.arrows.filter(a=>P.a.has(a.id)),
      inks:m0.inks.filter(k=>P.k.has(k.id)),
      images:m0.images.filter(im=>P.p.has(im.id))
    });
    boxes=new Map([...all].filter(([gid])=>P.g.has(gid)));
  }
  const order=[...m.groupOrder].sort((a,b)=>groupDepth(m0,a)-groupDepth(m0,b));
  const cid=k=>{ if(!ids.has(k)) ids.set(k,'c'+(seq++)); return ids.get(k); };
  const g2=v=>Math.round(v*10)/10;
  const geo=(x,y,w,h,par)=>{ const pb=par?boxes.get(par):null; return '<mxGeometry x="'+g2(x-(pb?pb.x:0))+'" y="'+g2(y-(pb?pb.y:0))+'" width="'+g2(w)+'" height="'+g2(h)+'" as="geometry"/>'; };
  const imgCell=(im,par)=>{ const src=IMG[im.id]; if(!src) return; cells.push('<mxCell id="'+cid('p:'+im.id)+'" value="" style="'+xa('shape=image;html=1;imageAspect=0;aspect=fixed;image='+dioImg(src)+';')+'" vertex="1" parent="'+(par?cid('g:'+par):'1')+'">'+geo(im.x,im.y,im.w,im.h,par)+'</mxCell>'); };
  const imgHome=im=>{ const cx=im.x+im.w/2,cy=im.y+im.h/2; let best=null,ba=Infinity; for(const [gid,b] of boxes){ if(cx>=b.x&&cx<=b.x+b.w&&cy>=b.y&&cy<=b.y+b.h&&b.w*b.h<ba){ ba=b.w*b.h; best=gid; } } return best; };
  const backByFrame=new Map(); for(const im of m.images){ if(im.front) continue; const h=imgHome(im); if(!backByFrame.has(h)) backByFrame.set(h,[]); backByFrame.get(h).push(im); }
  for(const im of backByFrame.get(null)||[]) imgCell(im,null);

  for(const gid of order){ const g=m.groups.get(gid),b=boxes.get(gid); if(!b) continue; const st=styleOf(m,gid)||{};
    const fill=st.fill||'#ffffff';
    if(g.dev){ const ds='rounded=1;arcSize='+(g.dev==='desktop'?2:g.dev==='tablet'?5:9)+';html=1;container=1;collapsible=0;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#3b3f48;strokeWidth=2;verticalLabelPosition=top;verticalAlign=bottom;align=left;fontSize=14;fontColor=#5f5f5f;';
      cells.push('<mxCell id="'+cid('g:'+gid)+'" value="'+dioLabel(g.label)+'" style="'+xa(ds)+'" vertex="1" parent="'+(g.parent&&boxes.has(g.parent)?cid('g:'+g.parent):'1')+'">'+geo(b.x,b.y,b.w,b.h,g.parent&&boxes.has(g.parent)?g.parent:null)+'</mxCell>'); continue; }
    const style='swimlane;html=1;startSize=30;horizontal=1;align=left;spacingLeft=10;fontStyle=0;fontSize=14;fontColor='+(st.color||'#5f5f5f')+';fillColor='+fill+';swimlaneFillColor='+fill+';strokeColor='+(st.stroke||'#d5d7db')+';swimlaneLine=0;container=1;collapsible=0;rounded=0;';
    cells.push('<mxCell id="'+cid('g:'+gid)+'" value="'+dioLabel(g.label)+'" style="'+xa(style)+'" vertex="1" parent="'+(g.parent&&boxes.has(g.parent)?cid('g:'+g.parent):'1')+'">'+geo(b.x,b.y,b.w,b.h,g.parent&&boxes.has(g.parent)?g.parent:null)+'</mxCell>'); for(const im of backByFrame.get(gid)||[]) imgCell(im,gid); }
  const SH={cloud:'ellipse;shape=cloud;',bubble:'shape=callout;perimeter=calloutPerimeter;size=14;position=0.18;position2=0.2;base=16;',tri:'triangle;direction=north;',star:'shape=mxgraph.basic.star;',arrow:'shape=singleArrow;arrowWidth=0.5;arrowSize=0.35;',chevron:'shape=step;perimeter=stepPerimeter;fixedSize=1;size=20;',paper:'shape=document;boundedLbl=1;size=0.15;',rect:'rounded=0;',round:'rounded=1;arcSize=20;',stadium:'rounded=1;arcSize=50;',circle:'ellipse;',diamond:'rhombus;',hex:'shape=hexagon;perimeter=hexagonPerimeter2;size=0.15;fixedSize=0;',cyl:'shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=9;',para:'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size=16;',sub:'shape=process;backgroundOutline=1;size=0.06;'};
  for(const id of m.nodeOrder){ const n=m.nodes.get(id); if(!n||n.x==null) continue; const st=styleOf(m,id)||{}; const par=n.group&&boxes.has(n.group)?n.group:null;
    let style='whiteSpace=wrap;html=1;'; const fs=st.fontSize||labelSize(n); const fst=(st.bold?1:0)+(st.italic?2:0);
    const txt=';fontSize='+Math.round(fs)+(fst?';fontStyle='+fst:'')+(st.bg?';labelBackgroundColor='+st.bg:'')+';fontColor='+(st.color||'#1a1a1a')+';';
    let x=n.x,y=n.y,w=n.w,h=n.h;
    if(n.shape==='icon'){ const ic=iconFor(n.icon); const is=iconSize(n); x=n.x+(n.w-is)/2; w=is; h=is; style='image;html=1;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;image='+(ic?dioImg(ic.uri):'')+txt; }
    else if(n.shape==='text') style='text;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;strokeColor=none;fillColor='+(st.fill||'none')+txt;
    else if(n.shape==='sticky') style='rounded=0;whiteSpace=wrap;html=1;strokeColor=none;shadow=1;fillColor='+(st.fill||'#fff9b1')+txt;
    else if(isUi(n)){ const U={uiButton:'rounded=1;fillColor=#5f6470;strokeColor=none;fontColor=#ffffff;fontStyle=1;',uiInput:'rounded=1;fillColor=#ffffff;strokeColor=#c4c8d0;align=left;spacingLeft=10;fontColor=#4b5160;',uiImage:'rounded=0;fillColor=#eceef2;strokeColor=#c4c8d0;fontColor=#4b5160;',
        uiHeading:'text;align=left;fontStyle=1;fontColor=#1a1a1a;strokeColor=none;fillColor=none;',uiText:'text;align=left;verticalAlign=top;fontColor=#4b5160;strokeColor=none;fillColor=none;',uiTopbar:'rounded=0;fillColor=#eceef2;strokeColor=none;fontStyle=1;fontColor=#1a1a1a;',
        uiTabbar:'rounded=0;fillColor=#ffffff;strokeColor=#c4c8d0;fontColor=#4b5160;',uiSidebar:'rounded=0;fillColor=#eceef2;strokeColor=none;align=left;verticalAlign=top;spacingLeft=16;spacingTop=12;fontColor=#4b5160;',uiTable:'shape=table;startSize=0;rounded=0;fillColor=#ffffff;strokeColor=#c4c8d0;align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontStyle=1;fontColor=#1a1a1a;'};
      { const a=(styleOf(m0,id)||{}).fill; if(a&&/^#[0-9a-f]{3,8}$/i.test(a)&&n.shape==='uiButton') U.uiButton=U.uiButton.replace('fillColor=#5f6470','fillColor='+a); }
      const val=n.shape==='uiTabbar'||n.shape==='uiTable'?uiItems(n.label).join('&nbsp;&nbsp;&nbsp;&nbsp;'):n.shape==='uiSidebar'?uiItems(n.label).join('<br><br>'):n.shape==='uiText'&&!n.label?'Text':n.label;
      cells.push('<mxCell id="'+cid('n:'+id)+'" value="'+xa(n.shape==='uiTabbar'||n.shape==='uiSidebar'||n.shape==='uiTable'?val:String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>'))+'" style="'+xa('html=1;whiteSpace=wrap;fontSize='+Math.max(5,Math.round((n.shape==='uiHeading'?19:13)*uiScale(m0,n)))+';'+U[n.shape])+'" vertex="1" parent="'+(par?cid('g:'+par):'1')+'">'+geo(x,y,w,h,par)+'</mxCell>'); continue; }
    else if(n.shape==='table'||n.shape==='doc'){ style='html=1;whiteSpace=wrap;overflow=fill;verticalAlign=top;align=left;spacing=0;rounded=1;arcSize=3;absoluteArcSize=1;fillColor='+(st.fill||'#ffffff')+';strokeColor='+(st.stroke||'#c9ccd1')+';fontColor=#1a1a1a;fontSize=12;';
      cells.push('<mxCell id="'+cid('n:'+id)+'" value="'+xa(n.shape==='table'?dioTable(n):dioDoc(n))+'" style="'+xa(style)+'" vertex="1" parent="'+(par?cid('g:'+par):'1')+'">'+geo(x,y,w,h,par)+'</mxCell>'); continue; }
    else style+=(SH[n.shape]||SH.rect)+'fillColor='+(st.fill||'#ffffff')+';strokeColor='+(st.stroke||'#1a1a1a')+';strokeWidth=2'+txt;
    cells.push('<mxCell id="'+cid('n:'+id)+'" value="'+dioLabel(n.label)+'" style="'+xa(style)+'" vertex="1" parent="'+(par?cid('g:'+par):'1')+'">'+geo(x,y,w,h,par)+'</mxCell>'); }
  const HD={arrow:'classic',none:'none',circle:'oval',cross:'cross'};
  m.edges.forEach((e,i)=>{ if(!e) return; const sk=m.nodes.has(e.from)?'n:'+e.from:'g:'+e.from, tk=m.nodes.has(e.to)?'n:'+e.to:'g:'+e.to; if(!ids.has(sk)||!ids.has(tk)) return;
    const rt=routeOf(m0,e); let style='html=1;rounded=1;endArrow='+HD[e.head]+';startArrow='+HD[e.tail]+';endFill='+(e.head==='circle'?0:1)+';startFill='+(e.tail==='circle'?0:1)+';strokeWidth='+(e.width||(e.line==='thick'?4:2))+';strokeColor='+(e.line==='invis'?'none':(e.color||'#1a1a1a'))+';fontSize=12;fontColor=#5f5f5f;labelBackgroundColor=#ffffff;';
    style+=rt==='elbow'?'edgeStyle=orthogonalEdgeStyle;':rt==='straight'?'edgeStyle=none;':'edgeStyle=orthogonalEdgeStyle;curved=1;';
    if(e.line==='dotted') style+='dashed=1;';
    const SP={t:[0.5,0],r:[1,0.5],b:[0.5,1],l:[0,0.5]};
    const en=edgeEnds(m0,e,all); const rowY=(id,row)=>{ const n=m0.nodes.get(id); const r=rowRect(n,row); return ((r.y+r.h/2-n.y)/n.h).toFixed(4); };
    const sa=en&&en.sides?en.sides.a:e.sa, sb=en&&en.sides?en.sides.b:e.sb;
    if(e.ra!=null&&sa) style+='exitX='+(sa==='l'?0:1)+';exitY='+rowY(e.from,e.ra)+';exitDx=0;exitDy=0;'; else if(sa&&SP[sa]) style+='exitX='+SP[sa][0]+';exitY='+SP[sa][1]+';exitDx=0;exitDy=0;';
    if(e.rb!=null&&sb) style+='entryX='+(sb==='l'?0:1)+';entryY='+rowY(e.to,e.rb)+';entryDx=0;entryDy=0;'; else if(sb&&SP[sb]) style+='entryX='+SP[sb][0]+';entryY='+SP[sb][1]+';entryDx=0;entryDy=0;';
    cells.push('<mxCell id="'+cid('e:'+i)+'" value="'+dioLabel(e.label)+'" style="'+xa(style)+'" edge="1" parent="1" source="'+ids.get(sk)+'" target="'+ids.get(tk)+'"><mxGeometry relative="1" as="geometry"/></mxCell>'); });
  for(const a0 of m.arrows){ const a=resolveArrow(m,a0); const col=a.color||'#1a1a1a';
    if(a.kind==='block'){ const dx=a.x2-a.x1,dy=a.y2-a.y1,L=Math.hypot(dx,dy)||1,hh=(a.w*4.4+9)*2; const cx=(a.x1+a.x2)/2,cy=(a.y1+a.y2)/2;
      cells.push('<mxCell id="'+cid('a:'+a.id)+'" value="" style="'+xa('shape=singleArrow;html=1;arrowWidth=0.5;arrowSize=0.25;fillColor='+col+';strokeColor='+col+';rotation='+(Math.atan2(dy,dx)*180/Math.PI).toFixed(1)+';')+'" vertex="1" parent="1">'+geo(cx-L/2,cy-hh/2,L,hh,null)+'</mxCell>'); continue; }
    let style='html=1;rounded=1;endArrow='+(a.kind==='line'?'none':'classic')+';endFill=1;startArrow=none;strokeWidth='+a.w+';strokeColor='+col+';';
    style+=a.kind==='elbow'?'edgeStyle=orthogonalEdgeStyle;':a.kind==='curved'?'edgeStyle=orthogonalEdgeStyle;curved=1;':'edgeStyle=none;';
    const src=a0.from&&ids.get('n:'+a0.from), tgt=a0.to&&ids.get('n:'+a0.to);
    cells.push('<mxCell id="'+cid('a:'+a.id)+'" value="" style="'+xa(style)+'" edge="1" parent="1"'+(src?' source="'+src+'"':'')+(tgt?' target="'+tgt+'"':'')+'><mxGeometry relative="1" as="geometry"><mxPoint x="'+g2(a.x1)+'" y="'+g2(a.y1)+'" as="sourcePoint"/><mxPoint x="'+g2(a.x2)+'" y="'+g2(a.y2)+'" as="targetPoint"/></mxGeometry></mxCell>'); }
  for(const k of m.inks){ const b=inkBox(k); const pts=k.pts.map(([x,y])=>[r10(x-b.x),r10(y-b.y)]);
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+Math.ceil(b.w)+'" height="'+Math.ceil(b.h)+'" viewBox="0 0 '+Math.ceil(b.w)+' '+Math.ceil(b.h)+'"><path d="'+inkPath(pts)+'" fill="none" stroke="'+k.color+'" stroke-width="'+k.w+'" stroke-linecap="round" stroke-linejoin="round" opacity="'+(k.tool==='hl'?0.55:1)+'"/></svg>';
    cells.push('<mxCell id="'+cid('k:'+k.id)+'" value="" style="'+xa('shape=image;html=1;imageAspect=0;image=data:image/svg+xml,'+b64utf8(svg)+';')+'" vertex="1" parent="1">'+geo(b.x,b.y,b.w,b.h,null)+'</mxCell>'); }
  for(const im of m.images) if(im.front) imgCell(im,null);
  const name=xa((m.title||'Board').slice(0,80));
  return '<mxfile host="orim" type="device"><diagram id="board" name="'+name+'"><mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'+cells.join('')+'</root></mxGraphModel></diagram></mxfile>';
}
// Tables and documents go to draw.io as HTML labels.
function dioTable(n){ const t=n.table, he=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); const TINT={g:'#c8efd4',a:'#fde4b5',r:'#fbcfcf'}; const L=n._tl||tableLayout(n);
  let h=(n.label?'<div style="padding:8px 12px;font-weight:600;color:#596273">'+he(n.label)+'</div>':'')+'<table style="width:100%;border-collapse:collapse;font-size:12px">';
  t.rows.forEach((r,ri)=>{ h+='<tr>'; r.forEach((c,ci)=>{ const bg=t.colors[ri+','+ci]?TINT[t.colors[ri+','+ci]]:ri===0?'#f0f0f0':''; h+='<td style="border:1px solid #d5d7db;padding:6px 8px;vertical-align:top;'+(L.cols[ci]?'width:'+Math.round(L.cols[ci])+'px;':'')+(ri===0||ci===0?'font-weight:600;':'')+(bg?'background:'+bg+';':'')+'">'+he(c)+'</td>'; }); h+='</tr>'; });
  return h+'</table>'; }
function dioDoc(n){ const he=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); const runs=rs=>rs.map(r=>{ let s=he(r.x); if(r.i) s='<i>'+s+'</i>'; if(r.b) s='<b>'+s+'</b>'; return s; }).join('');
  let h='<div style="padding:12px 18px">'+(n.label?'<div style="font-weight:600;font-size:13px;color:#596273;border-bottom:1px solid #e3e3e3;padding-bottom:8px;margin-bottom:8px">'+he(n.label)+'</div>':''); let list=null;
  for(const b of n.doc.blocks){ if(b.t==='ul'||b.t==='ol'){ if(list!==b.t){ if(list) h+='</'+list+'>'; h+='<'+b.t+' style="margin:2px 0;padding-left:18px">'; list=b.t; } h+='<li>'+runs(b.r)+'</li>'; continue; }
    if(list){ h+='</'+list+'>'; list=null; } const fs={h1:19,h2:16,h3:14,p:13}[b.t]; h+='<div style="font-size:'+fs+'px;'+(b.t[0]==='h'?'font-weight:700;margin-top:8px;':'margin-top:4px;')+'">'+runs(b.r)+'</div>'; }
  if(list) h+='</'+list+'>'; return h+'</div>'; }
function buildDrawioSvg(){ const xml=buildDrawio(); const o=buildSVG(); if(!o) return null; return o.svg.replace('<svg ','<svg content="'+xa(xml)+'" '); }
