/* orim · export.js
 * PNG, SVG, Markdown, text and board file export.
 */
'use strict';
function buildSVG(){
  const m=state.model; if(!m) return null;
  const boxes=groupBoxes(m); const b=contentBounds(m); if(!b) return null;
  const pad=32,x=b.x-pad,y=b.y-pad,w=Math.ceil(b.w+pad*2),h=Math.ceil(b.h+pad*2);
  const P=palExport(m);
  let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+x+' '+y+' '+w+' '+h+'" width="'+w+'" height="'+h+'">';
  if(m.title) s+='<title>'+esc(m.title)+'</title>';
  s+='<defs>'+markerDefs(P,'X')+'</defs>';
  if(P.bg) s+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" style="fill:'+P.bg+'"/>';
  s+=groupsMarkup(m,boxes,P,false)+imagesMarkup(m,false)+edgesMarkup(m,boxes,P,false,'X');
  const topEdges=edgesMarkup.top;
  for(const id of m.nodeOrder){ const n=m.nodes.get(id); s+='<g transform="translate('+n.x+','+n.y+')">'+nodeInner(n,m,P,false)+'</g>'; }
  s+=topEdges+arrowsMarkup(m,P,false)+inkMarkup(m,P,false)+imagesMarkup(m,true);
  return {svg:s+'</svg>',w,h,bg:P.bg||'#ffffff'};
}
// Pictures of the board carry their fonts, so they look the same on any computer. The fonts come from
// Google Fonts, cut down to the letters on the board; if that fails, the picture uses fallback fonts.
const fontEmbedCache=new Map();
async function embedFonts(svg){
  const m=state.model; if(!m) return svg;
  const fams=new Map([['Instrument+Sans:wght@400;500;600',1]]); let chars='';
  for(const n of m.nodes.values()){ chars+=String(n.label||''); if(n.font&&FONTS[n.font]&&FONTS[n.font].g) fams.set(FONTS[n.font].g,1); if(n.doc) chars+=JSON.stringify(n.doc).slice(0,20000); if(n.table) chars+=JSON.stringify(n.table.rows); if(n.doc&&n.doc.blocks.some(b=>b.t==='code')) fams.set(FONTS.mono.g,1); }
  for(const g of m.groups.values()) chars+=g.label||''; for(const e of m.edges) chars+=e.label||''; chars+=m.title||'';
  const uniq=[...new Set(chars+'0123456789…')].join('');
  const url='https://fonts.googleapis.com/css2?'+[...fams.keys()].map(f=>'family='+f).join('&')+'&display=block&text='+encodeURIComponent(uniq);
  try{
    let css=fontEmbedCache.get(url);
    if(css==null){
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),5000);
      css=await (await fetch(url,{signal:ctl.signal})).text();
      const urls=[...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(x=>x[1]))];
      for(const u of urls){ const b=await (await fetch(u,{signal:ctl.signal})).blob(); const d=await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(b); }); css=css.split(u).join(d); }
      clearTimeout(t); if(!/@font-face/.test(css)) css=''; fontEmbedCache.set(url,css);
    }
    return css?svg.replace(/(<svg[^>]*>)/,'$1<style>'+css.replace(/<\/?style>/g,'')+'</style>'):svg;
  }catch(_){ return svg; }
}
function renderPNG(){
  return new Promise(async (res,rej)=>{
    const out=buildSVG(); if(!out){ rej(new Error('empty')); return; }
    out.svg=await embedFonts(out.svg);
    const scale=Math.min(2,8000/Math.max(out.w,out.h));
    const img=new Image();
    img.onload=()=>{ try{ const c=document.createElement('canvas'); c.width=Math.round(out.w*scale); c.height=Math.round(out.h*scale); const g=c.getContext('2d'); g.fillStyle=out.bg||'#ffffff'; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height); c.toBlob(bl=>bl?res(bl):rej(new Error('encode')),'image/png'); }catch(err){ rej(err); } };
    img.onerror=()=>rej(new Error('render'));
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(out.svg);
  });
}
let dlPromise=null;
function getDownloads(){ if(!dlPromise){ try{ dlPromise=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(()=>null):Promise.resolve(null); }catch(e){ dlPromise=Promise.resolve(null); } } return dlPromise; }
function fileBase(){ const t=(state.model&&state.model.title)||'diagram'; return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'diagram'; }
$('#exportMenu').addEventListener('click',async e=>{
  const b=e.target.closest('[data-export]'); if(!b) return; const fmt=b.dataset.export; closeMenus();
  if(fmt==='copy'){ copyText(state.code,'Mermaid code copied'); return; }
  if(fmt==='drawiocopy'){ if(!state.model||state.fatal){ toast('Fix the code errors before exporting'); return; }
    const sel=state.sel.size?state.sel:null; let xml;
    try{ xml=buildDrawio(sel); }catch(err){ console.error(err); toast('Could not build the draw.io copy'); return; }
    copyText(xml,sel?'Selection copied. Paste onto a draw.io canvas with Ctrl+V':'Copied. Paste onto a draw.io canvas with Ctrl+V'); return; }
  if(fmt==='import'){ $('#fileIn').click(); return; }
  if(!state.model||state.fatal){ toast('Fix the code errors before exporting'); return; }
  if(fmt==='qr'){ openShareQR(); return; }
  if(fmt==='ai'){ openAskAI(); return; }
  flushEditorHist();
  const name=fileBase(); let data,filename,preview=null;
  try{
    if(fmt==='png'){ data=await renderPNG(); filename=name+'.png'; preview=URL.createObjectURL(data); }
    else if(fmt==='svg'){ const o=buildSVG(); if(!o){ toast('The board is empty'); return; } data=await embedFonts(o.svg); filename=name+'.svg'; preview='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data); }
    else if(fmt==='md'){ data=(state.model.title?'# '+state.model.title+'\n\n':'')+'```mermaid\n'+state.code.replace(/\s+$/,'')+'\n```\n'; filename=name+'.md'; }
    else if(fmt==='txt'){ data=state.code; filename=name+'.txt'; }
    else if(fmt==='drawio'){ if(window.claude){ data=buildDrawioSvg(); if(!data){ toast('The board is empty'); return; } filename=name+'.drawio.svg'; } else { data=buildDrawio(); filename=name+'.drawio'; } }
    else if(fmt==='tickets'){ const sel=new Set([...state.sel].filter(k=>k[0]==='n').map(k=>k.slice(2))); data=ticketsCsv(state.model,sel.size&&[...sel].some(id=>isTicket(state.model.nodes.get(id)))?sel:null); if(!data){ toast('No tickets yet. Make a document and set its type, or ask the AI tab for tickets'); return; } filename=name+'-tickets.csv'; }
    else if(fmt==='json'){ data=JSON.stringify({format:'orim-board',version:2,title:state.model.title||'',code:state.code,images:usedImages()},null,2); filename=name+'.json'; }
  }catch(err){ console.error(err); toast(fmt==='png'?'PNG export failed in this browser. Try SVG.':'Export failed'); return; }
  if(fmt==='png'&&!(data&&data.size)){ toast('The board is empty'); return; }
  if(!window.claude){
    try{ const blob=data instanceof Blob?data:new Blob([data],{type:fmt==='svg'?'image/svg+xml':fmt==='json'?'application/json':fmt==='drawio'?'application/xml':fmt==='tickets'?'text/csv':'text/plain'}); const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); toast('Saved '+filename); return; }catch(err){}
  }
  const dl=await getDownloads();
  if(dl){
    try{ await dl.save({filename,data}); toast('Saved '+filename); return; }
    catch(err){ const c=err&&err.code; if(c==='declined') return; if(c==='rate_limited'){ toast('A save prompt is already open'); return; } }
  }
  showExportFallback(fmt,filename,data,preview);
});
function showExportFallback(fmt,filename,data,preview){
  if(fmt==='png'||fmt==='svg'){
    openModal(filename,'<p>Saving files is not available in this view. Right-click or long-press the image to save it.</p><img alt="Exported diagram" src="'+preview+'">'+(fmt==='svg'?'<textarea readonly>'+esc(data)+'</textarea>':''),fmt==='svg'?[{label:'Copy SVG code',primary:true,run:()=>copyText(data,'SVG code copied')}]:[]);
  } else {
    openModal(filename,'<p>Saving files is not available in this view. Copy the contents below into a file named '+esc(filename)+'.</p><textarea readonly>'+esc(data)+'</textarea>',[{label:'Copy',primary:true,run:()=>copyText(data,'Copied')}]);
  }
}
