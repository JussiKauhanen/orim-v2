/* orim · share-qr.js
 * Move the current board to another device with a QR code.
 * The board's Mermaid code is deflated and base64url-encoded into the link:
 *   https://<host>/orim/#m=<data>
 * Opening that link creates a new board from it (see Boards.route).
 * Images are not included; their pixels are far too large for a link or a QR code.
 * The link always carries the whole board; a QR code may carry a smaller version that fits.
 */
'use strict';
const ORIM_PAGES='https://jussikauhanen.github.io/orim/';
const QR_MAX=2900;          // byte capacity of a version 40 QR code at level L is 2953

function shareBase(){
  // On GitHub Pages or a local server the link points back here; anywhere else
  // (the hosted preview, a file opened from disk) it points to the Pages site.
  try{
    const h=location.hostname;
    if(/^https?:$/.test(location.protocol)&&(/\.github\.io$/.test(h)||h==='localhost'||h==='127.0.0.1')) return location.origin+location.pathname;
  }catch(_){}
  return ORIM_PAGES;
}
function b64url(bytes){ let s=''; for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64url(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; const b=atob(s); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
async function pipeBytes(bytes,stream){ const r=new Blob([bytes]).stream().pipeThrough(stream); return new Uint8Array(await new Response(r).arrayBuffer()); }

async function encodeBoard(code){
  const raw=new TextEncoder().encode(code);
  if(typeof CompressionStream==='function'){ try{ return 'm='+b64url(await pipeBytes(raw,new CompressionStream('deflate-raw'))); }catch(_){} }
  return 't='+b64url(raw);
}
async function decodeBoard(hash){
  const k=hash.slice(0,2), data=unb64url(hash.slice(2));
  if(k==='t=') return new TextDecoder().decode(data);
  if(typeof DecompressionStream!=='function') throw new Error('unsupported');
  return new TextDecoder().decode(await pipeBytes(data,new DecompressionStream('deflate-raw')));
}

// Three sizes of the same board, largest first: everything except image placement, then without
// pen strokes, then without positions and arrows (laid out again on the other device). Documents,
// tables, tickets, mockup screens and comments are content, so every size keeps them.
function shareVariants(code){
  const lines=String(code).split('\n');
  const keep=re=>lines.filter(l=>!re.test(l)).join('\n').replace(/\n{3,}/g,'\n\n').replace(/\s+$/,'')+'\n';
  return [
    {code:keep(/^\s*%%\s*@image\b/),note:'Everything except images.'},
    {code:keep(/^\s*%%\s*@(image|ink)\b/),note:'Positions included. Pen and highlighter strokes left out to fit.'},
    {code:keep(/^\s*%%\s*(@(image|ink|pos|route|arrow)\b|layout:)/),note:'Positions left out to fit; the board is laid out again on the other device.'}
  ];
}

function qrSVG(text){
  const q=qrcode(0,'L'); q.addData(text,'Byte'); q.make();
  const n=q.getModuleCount(), m=4; let d='';
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.isDark(r,c)) d+='M'+(c+m)+' '+(r+m)+'h1v1h-1z';
  const s=n+m*2;
  return {svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+s+' '+s+'" shape-rendering="crispEdges" role="img" aria-label="QR code with a link to this board"><rect width="'+s+'" height="'+s+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>',modules:n};
}

async function openShareQR(){
  if(typeof qrcode!=='function'){ toast('The QR code library did not load'); return; }
  flushEditorHist();
  const base=shareBase(), opts=[];
  const seen=new Set();
  for(const v of shareVariants(state.code)){
    if(seen.has(v.code)) continue; seen.add(v.code);
    const url=base+'#'+await encodeBoard(v.code);
    opts.push(Object.assign({url},v));
  }
  // The link always carries the whole board; only the QR code may have to leave things out to fit.
  const full=opts[0], fits=opts.filter(o=>o.url.length<=QR_MAX);
  let i=0;
  const hasImg=((state.model&&state.model.images)||[]).length>0;
  const show=()=>{
    const o=fits[i], q=o?qrSVG(o.url):null;
    openModal('Open on another device',
      '<div class="qr-wrap">'+
        (q?'<div class="qr-code">'+q.svg+'</div>':'')+
        '<div class="qr-side">'+
          (q?'<p>Scan with a phone or tablet camera to open this board there. The link carries the whole board, so nothing is uploaded.</p>'+
            '<p class="qr-note">QR code: '+esc(o.note)+(o===full?'':' The link below has everything.')+'</p>'
            :'<p>This board is too large for a QR code. Copy the link instead: it carries the whole board, so nothing is uploaded.</p>')+
          '<p class="qr-note">Link: everything'+(hasImg?' except images (use a board file for those)':'')+', '+full.url.length+' characters.</p>'+
          '<label class="qr-lbl">Link</label><input class="modal-input qr-url" readonly value="'+esc(full.url)+'">'+
          '<label class="qr-lbl">Mermaid</label><textarea class="qr-code-text" readonly>'+esc(full.code)+'</textarea>'+
        '</div>'+
      '</div>',
      [{label:'Copy link',primary:true,run:()=>copyText(full.url,'Link copied')},
       {label:'Copy Mermaid',run:()=>copyText(full.code,'Mermaid code copied')}]
        .concat(fits.length>1?[{label:i<fits.length-1?'Smaller QR code':'Larger QR code',run:()=>{ i=i<fits.length-1?i+1:0; show(); }}]:[]));
    $('.modal').classList.add('qr');
    const u=$('#modalBody .qr-url'); u.addEventListener('focus',()=>u.select());
  };
  show();
}

// Called by Boards.route for #m=… and #t=… links.
async function importShared(hash){
  try{ const code=await decodeBoard(hash); if(!/\S/.test(code)) throw new Error('empty'); return code; }
  catch(err){ toast(err&&err.message==='unsupported'?'This browser cannot open shared links. Try a newer browser.':'This link does not contain a board'); return null; }
}
