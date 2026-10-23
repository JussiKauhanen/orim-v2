/* orim · core/mermaid.js
 * Mermaid flowchart parser and serializer, canvas data comments, ids.
 */
'use strict';
const Core={measure:(t,size)=>String(t).length*size*0.56};
// Fonts for shapes and notes, saved as a plain CSS font-family in the style line (style A font-family:Caveat),
// so other Mermaid tools use the font if they have it and their default if not.
const FONTS={caveat:{name:'Caveat',hint:'Handwritten',css:"'Caveat',cursive",g:'Caveat:wght@500;700',k:1.18},bangers:{name:'Bangers',hint:'Marker',css:"'Bangers',Impact,sans-serif",g:'Bangers',k:1},
  fredoka:{name:'Fredoka',hint:'Rounded',css:"'Fredoka',system-ui,sans-serif",g:'Fredoka:wght@400;500;600',k:1},georgia:{name:'Georgia',hint:'Serif',css:"Georgia,'Times New Roman',serif",k:1},
  mono:{name:'Mono',hint:'Code',css:"'JetBrains Mono',ui-monospace,monospace",g:'JetBrains+Mono:wght@400;500',k:1,token:'monospace'}};
const fontKey=v=>{ const s=String(v||'').replace(/['"]/g,'').split(',')[0].trim().toLowerCase().replace(/\s+/g,''); return s==='monospace'||s==='jetbrainsmono'?'mono':FONTS[s]?s:null; };
const fontCss=k=>k&&FONTS[k]?FONTS[k].css:null;
function measureN(n,t,size){ return Core.measure(t,size,n&&n.font)*(n&&n.bold?1.07:1); }
const GRID=8, SNAP=v=>Math.round(v/GRID)*GRID;
const PAD=24, PAD_TOP=40, ICON=52;
const RESERVED=new Set(['end','graph','flowchart','subgraph','style','class','classDef','click','linkStyle','direction','default','call','href']);
const V11={rect:'rect',rectangle:'rect',proc:'rect',process:'rect',square:'rect',rounded:'round',event:'round',stadium:'stadium',pill:'stadium',terminal:'stadium',cyl:'cyl',cylinder:'cyl',db:'cyl',database:'cyl','h-cyl':'cyl','lin-cyl':'cyl',das:'cyl',circle:'circle',circ:'circle','sm-circ':'circle','dbl-circ':'circle','double-circle':'circle',start:'circle',stop:'circle',diamond:'diamond',diam:'diamond',decision:'diamond',question:'diamond',hex:'hex',hexagon:'hex',prepare:'hex','lean-r':'para','lean-l':'para','in-out':'para','out-in':'para','lean-right':'para','lean-left':'para',trap:'para','trap-b':'para','trap-t':'para',text:'text',subproc:'sub',subprocess:'sub',subroutine:'sub','fr-rect':'sub',doc:'paper',document:'paper',cloud:'cloud',tri:'tri',triangle:'tri',extract:'tri',star:'star',flag:'chevron','notch-pent':'chevron',callout:'bubble',comment:'bubble'};
const BRACKETS=[['(((',[')))'],'circle'],['([',['])'],'stadium'],['[(',[')]'],'cyl'],['((',['))'],'circle'],['[[',[']]'],'sub'],['[/',['/]','\\]'],'para'],['[\\',['\\]','/]'],'para'],['{{',['}}'],'hex'],['(',[')'],'round'],['[',[']'],'rect'],['{',['}'],'diamond'],['>',[']'],'rect']];
const BR_OUT={rect:['[',']'],round:['(',')'],stadium:['([','])'],cyl:['[(',')]'],circle:['((','))'],sub:['[[',']]'],para:['[/','/]'],hex:['{{','}}'],diamond:['{','}']};
// Shapes beyond Mermaid's classic set. They are written as the nearest classic shape plus a class (A("Idea"):::cloud),
// so GitHub, Azure DevOps and draw.io still show a box with the right text, and orim draws the real shape.
const XSHAPES={cloud:'round',bubble:'round',tri:'rect',star:'rect',arrow:'rect',chevron:'rect',paper:'rect'};
// Board themes: colours for the board, shapes, lines and frames. Saved as one canvas line (%% @theme midnight),
// so other Mermaid tools simply show their own colours. Frames take the accent colours in turn.
const BOARD_THEMES={
  classic:{name:'Classic'},
  midnight:{name:'Midnight',dark:true,bg:'#2d2f4e',grid:'rgba(255,255,255,.07)',node:'#2d2f4e',stroke:'#c9cbe0',text:'#ffffff',edge:'#b8bbd6',frame:'rgba(255,255,255,.035)',frameText:'#e9eaf5',label:'#2d2f4e',code:'#25273f',edgeText:'#e9eaf5',ink:'#ffffff',accents:['#6cc7b9','#f6c97f','#f2805f','#9ea9ff','#f7a8cf']},
  pastel:{name:'Pastel',bg:'#fbf8f3',grid:'rgba(60,40,20,.06)',node:'#ffffff',stroke:'#3d3d3d',text:'#262626',edge:'#7a7a7a',frame:'#ffffff',frameText:'#4a4a4a',label:'#fbf8f3',code:'#f4f1ea',edgeText:'#4a4a4a',accents:['#56b8a6','#e3a93c','#ea7f5f','#7f88f5','#de74a6'],tint:true},
  blueprint:{name:'Blueprint',dark:true,bg:'#1f4f8f',grid:'rgba(255,255,255,.13)',node:'rgba(255,255,255,.06)',stroke:'#e6f0ff',text:'#ffffff',edge:'#cfe0ff',frame:'rgba(255,255,255,.04)',frameText:'#e6f0ff',label:'#1f4f8f',code:'#1a4579',edgeText:'#ffffff',ink:'#ffffff',font:'mono'},
  sketch:{name:'Sketch',bg:'#f7f4ec',grid:'rgba(60,50,30,.07)',node:'#fffdf7',stroke:'#3a3a3a',text:'#2a2a2a',edge:'#3a3a3a',frame:'#fffdf7',frameText:'#3a3a3a',label:'#f7f4ec',code:'#efeadd',edgeText:'#3a3a3a',font:'caveat',accents:['#3a3a3a']}
};
const boardTheme=m=>m&&m.theme&&BOARD_THEMES[m.theme]&&m.theme!=='classic'?BOARD_THEMES[m.theme]:null;
// The accent of a frame: top-level frames take the theme's colours in turn, and frames inside share their parent's.
function themeAccent(m,gid){ const T=boardTheme(m); if(!T||!T.accents||!gid||!m.groups.has(gid)) return null; let g=m.groups.get(gid), k=0; while(g&&g.parent&&m.groups.has(g.parent)&&k++<50) g=m.groups.get(g.parent);
  const tops=m.groupOrder.filter(id=>{ const x=m.groups.get(id); return x&&!(x.parent&&m.groups.has(x.parent))&&!x.dev; }); const i=tops.indexOf(g.id); return i<0?null:T.accents[i%T.accents.length]; }
const LAYOUT_MARK=/^%%\s*layout\b/i;
const POS_RE=/^\s*%%\s*@(pos|ink|arrow|route|image|comment|table|doc|device|theme|rot)\b/;
const ID_RE=/^[\p{L}\p{N}_]+(?:[-.][\p{L}\p{N}_]+)*/u;

function decodeLabel(t){return String(t).replace(/<br\s*\/?>/gi,'\n').replace(/#quot;/g,'"').replace(/#amp;/g,'&').replace(/#lt;/g,'<').replace(/#gt;/g,'>').replace(/#35;/g,'#')}
function encodeQuoted(t){return String(t).replace(/"/g,'#quot;').replace(/\n/g,'<br>')}

function idFrom(text,taken){
  const words=String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').split(/[^A-Za-z0-9]+/).filter(Boolean);
  let base=words.map((w,i)=>{ const lw=(w===w.toUpperCase())?w.toLowerCase():w; return i===0?lw.charAt(0).toLowerCase()+lw.slice(1):lw.charAt(0).toUpperCase()+lw.slice(1); }).join('').replace(/^[^A-Za-z]+/,'');
  if(!base) base='node';
  if(base.length>24) base=base.slice(0,24);
  let id=base,k=2;
  while(taken(id)||RESERVED.has(id)) id=base+(k++);
  return id;
}

function splitStatements(t){
  const out=[];let cur='',q=false,depth=0,pipe=false;
  for(const ch of t){
    if(ch==='"') q=!q;
    else if(!q){
      if('[({'.includes(ch)) depth++;
      else if('])}'.includes(ch)) depth=Math.max(0,depth-1);
      else if(ch==='|'&&depth===0) pipe=!pipe;
      else if(ch===';'&&depth===0&&!pipe){ if(cur.trim()) out.push(cur.trim()); cur=''; continue; }
    }
    cur+=ch;
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}

function mkLink(core,tail,head,label){
  const line=core.includes('=')?'thick':core.includes('~')?'invis':core.includes('.')?'dotted':'solid';
  const map={'>':'arrow','<':'arrow',o:'circle',x:'cross'};
  return {line,head:map[head]||'none',tail:map[tail]||'none',label:label||''};
}

function scanStatement(s){
  let i=0;const n=s.length;
  const ws=()=>{while(i<n&&(s[i]===' '||s[i]==='\t'))i++;};
  const fail=msg=>{throw {msg};};
  function readLabel(closers){
    let j=i; while(j<n&&s[j]===' ') j++;
    if(s[j]==='"'){
      const k=s.indexOf('"',j+1); if(k<0) fail('Unclosed quote in a label');
      const lab=s.slice(j+1,k); j=k+1; while(j<n&&s[j]===' ') j++;
      const c=closers.find(c=>s.startsWith(c,j)); if(!c) fail('Expected '+closers[0]+' after the quoted label');
      i=j+c.length; return lab;
    }
    let best=-1,bc=null;
    for(const c of closers){const k=s.indexOf(c,j); if(k>=0&&(best<0||k<best)){best=k;bc=c;}}
    if(best<0) fail('Missing '+closers[0]+' to close the label');
    const lab=s.slice(j,best).trim(); i=best+bc.length; return lab;
  }
  function readObj(){
    let j=i,q=false;
    while(j<n){ if(s[j]==='"') q=!q; else if(!q&&s[j]==='}') break; j++; }
    if(j>=n) fail('Missing } to close @{ … }');
    const body=s.slice(i,j); i=j+1;
    const o={}; const re=/([\w-]+)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^,}]+))/g; let m;
    while((m=re.exec(body))) o[m[1]]=(m[2]??m[3]??m[4]??'').trim();
    return o;
  }
  function readRef(){
    ws();
    const m=ID_RE.exec(s.slice(i));
    if(!m) fail(i>=n?'Expected a node id':'Unexpected "'+s[i]+'"');
    const id=m[0]; i+=id.length; const ref={id};
    if(s.startsWith('@{',i)){
      i+=2; const o=readObj(); ref.def=true;
      if(o.icon){ref.shape='icon';ref.icon=o.icon;}
      else ref.shape=V11[String(o.shape||'rect').toLowerCase()]||'rect';
      if('label' in o) ref.label=decodeLabel(o.label);
    } else {
      for(const [open,closers,shape] of BRACKETS){
        if(s.startsWith(open,i)){ i+=open.length; ref.label=decodeLabel(readLabel(closers)); ref.shape=shape; ref.def=true; break; }
      }
    }
    const c=/^:::([\w-]+)/.exec(s.slice(i)); if(c){ref.cls=c[1]; i+=c[0].length;}
    return ref;
  }
  function readGroup(){ const refs=[readRef()]; for(;;){ ws(); if(s[i]==='&'){i++; refs.push(readRef());} else break; } return refs; }
  function readLink(){
    ws(); const rest=s.slice(i); let m;
    if((m=/^(<|o|x)?(--|==|-\.)\s+([^\s|][^|]*?)\s+(-{2,}|={2,}|\.+-)(>|o|x)?/.exec(rest))){
      i+=m[0].length; return mkLink(m[2]+m[4],m[1],m[5],decodeLabel(m[3].trim()));
    }
    if((m=/^(<|o|x)?(-\.+-|={2,}|-{2,}|~{3,})(>|o|x)?/.exec(rest))){
      let all=m[0],tail=m[1],core=m[2],head=m[3];
      if((head==='o'||head==='x')&&/[\p{L}\p{N}_]/u.test(rest[all.length]||'')){ all=all.slice(0,-1); head=undefined; }
      i+=all.length;
      if(!head&&!tail&&core==='--') fail('Incomplete arrow. Use --> or ---');
      let label='';
      ws();
      if(s[i]==='|'){
        let j=i+1; while(j<n&&s[j]===' ') j++;
        if(s[j]==='"'){ const k=s.indexOf('"',j+1); if(k<0) fail('Unclosed quote in an edge label'); label=s.slice(j+1,k); j=k+1; while(j<n&&s[j]===' ') j++; if(s[j]!=='|') fail('Expected | after the edge label'); i=j+1; }
        else { const k=s.indexOf('|',i+1); if(k<0) fail('Missing | to close the edge label'); label=s.slice(i+1,k).trim(); i=k+1; }
      }
      return mkLink(core,tail,head,decodeLabel(label));
    }
    fail(i>=n?'Expected an arrow':'Expected an arrow such as --> but found "'+s[i]+'"');
  }
  const groups=[readGroup()],links=[];
  for(;;){
    ws(); if(i>=n) break;
    const L=readLink(); ws();
    if(i>=n) fail('Add a node after the arrow');
    links.push(L); groups.push(readGroup());
  }
  return {groups,links};
}

function parseStyle(str){
  const st={fill:null,stroke:null,color:null,fontSize:null,bold:false,italic:false,bg:null,extra:[]};
  for(const part of str.split(',')){
    const p=part.trim(); if(!p) continue;
    const k=p.indexOf(':'); if(k<0){st.extra.push(p);continue;}
    const key=p.slice(0,k).trim(),val=p.slice(k+1).trim();
    if(key==='fill'||key==='stroke'||key==='color') st[key]=val;
    else if(key==='font-size'&&/^\d+(\.\d+)?(px)?$/.test(val)) st.fontSize=parseFloat(val);
    else if(key==='font-weight'&&/^(bold|[6-9]00)$/.test(val)) st.bold=true;
    else if(key==='font-style'&&val==='italic') st.italic=true;
    else if(key==='font-family'&&fontKey(val)) st.font=fontKey(val);
    else if(key==='background') st.bg=val;
    else st.extra.push(p);
  }
  return st;
}

// classDef / class / :::name colours, as Mermaid draws them. Kept apart from style lines,
// so the code is written back unchanged; an explicit style line wins over the class.
function applyClassDefs(m){
  const defs=new Map(), classOf=new Map(); m.cstyles=new Map();
  for(const x of m.extras){
    let mm=/^classDef\s+([\w,-]+)\s+(.+?);?\s*$/.exec(x); if(mm){ for(const nm of mm[1].split(',')) if(nm.trim()) defs.set(nm.trim(),mm[2]); continue; }
    mm=/^class\s+(.+?)\s+([\w-]+);?\s*$/.exec(x); if(mm) for(const id of mm[1].split(',')) if(id.trim()) classOf.set(id.trim(),mm[2]);
  }
  if(!defs.size) return;
  for(const n of m.nodes.values()){ if(n.shape==='sticky'||n.shape==='table'||n.shape==='doc'||isUi(n)) continue; const c=n.cls||classOf.get(n.id); const src=(c&&defs.get(c))||defs.get('default'); if(src) m.cstyles.set(n.id,parseStyle(src)); }
  for(const g of m.groups.values()){ const c=classOf.get(g.id); if(c&&defs.has(c)) m.cstyles.set(g.id,parseStyle(defs.get(c))); }
}
function styleOf(m,id){
  const own=m.styles.get(id), c=m.cstyles&&m.cstyles.get(id); if(!c) return own; if(!own) return c;
  const out={...c}; for(const [k,v] of Object.entries(own)){ if(k==='extra') continue; if(v!=null&&v!==false) out[k]=v; }
  out.extra=[...(c.extra||[]),...(own.extra||[])]; return out;
}
// Cells copied from Excel, Google Sheets or a CSV file: tab-separated, or comma or semicolon separated with the
// same number of cells on every line. Null when the text is not a grid.
function parseGrid(text){
  const lines=String(text||'').replace(/\r/g,'').replace(/\n+$/,'').split('\n'); if(lines.length<2) return null;
  const split=(l,sep)=>{ const out=[]; let cur='',q=false; for(let i=0;i<l.length;i++){ const ch=l[i]; if(q){ if(ch==='"'&&l[i+1]==='"'){ cur+='"'; i++; } else if(ch==='"') q=false; else cur+=ch; } else if(ch==='"'&&!cur.trim()) q=true; else if(ch===sep){ out.push(cur.trim()); cur=''; } else cur+=ch; } out.push(cur.trim()); return out; };
  for(const sep of ['\t',';',',']){
    const rows=lines.map(l=>split(l,sep)); const n=rows[0].length; if(n<2) continue;
    if(sep!=='\t'&&!rows.every(r=>r.length===n)) continue;
    if(sep==='\t'&&rows.filter(r=>r.length>1).length<Math.ceil(rows.length*0.6)) continue;
    const nc=Math.min(12,Math.max(...rows.map(r=>r.length)));
    return rows.slice(0,80).map(r=>{ const o=r.slice(0,nc).map(c=>c.slice(0,400)); while(o.length<nc) o.push(''); return o; });
  }
  return null;
}
// Tables: {rows:[[cell,…],…], colors:{"r,c":"g"|"a"|"r"}}. Row 0 is the header row.
function cleanTable(d){
  let rows=Array.isArray(d&&d.rows)?d.rows.filter(Array.isArray).map(r=>r.slice(0,20).map(c=>String(c==null?'':c).slice(0,500))):[];
  if(!rows.length) rows=[['','Option A','Option B'],['','',''],['','','']];
  const nc=Math.max(1,...rows.map(r=>r.length)); rows=rows.slice(0,60).map(r=>{ const x=r.slice(); while(x.length<nc) x.push(''); return x; });
  const colors={}; if(d&&d.colors&&typeof d.colors==='object') for(const [k,v] of Object.entries(d.colors)) if(/^\d+,\d+$/.test(k)&&/^[gar]$/.test(v)) colors[k]=v;
  return {rows,colors};
}
// Documents: {blocks:[{t:'h1'|'h2'|'h3'|'p'|'ul'|'ol', r:[{x:text, b?:1, i?:1}]}]}.
function cleanDoc(d){
  // Blocks: headings, paragraphs, bulleted and numbered lists, checklists (c: ticked), code (lang), quotes and dividers.
  const T=new Set(['h1','h2','h3','p','ul','ol','todo','code','quote','hr']);
  let blocks=Array.isArray(d&&d.blocks)?d.blocks.filter(b=>b&&T.has(b.t)).map(b=>{
    if(b.t==='hr') return {t:'hr',r:[]};
    if(b.t==='code'){ const x=(Array.isArray(b.r)?b.r:[]).map(r=>r&&typeof r.x==='string'?r.x:'').join('').slice(0,20000); const o={t:'code',r:x?[{x}]:[]}; if(/^[\w+#.-]{1,20}$/.test(b.lang||'')) o.lang=b.lang; return o; }
    const o={t:b.t,r:(Array.isArray(b.r)?b.r:[]).filter(x=>x&&typeof x.x==='string'&&x.x).map(x=>{ const o={x:x.x.slice(0,4000)}; if(x.b) o.b=1; if(x.i) o.i=1; const u=safeUrl(x.u); if(u) o.u=u; return o; })};
    if(b.t==='todo'&&b.c) o.c=1; return o; }):[];
  if(!blocks.length) blocks=[{t:'p',r:[]}];
  const out={blocks:blocks.slice(0,400)};
  // A ticket: a work item type and its fields.
  if(d&&TICKET_TYPES[d.kind]){ out.kind=d.kind; const f=cleanFields(d.kind,d.fields); if(Object.keys(f).length) out.fields=f; }
  return out;
}
// Markdown (what the AI writes) to document blocks: # ## ### headings, - and 1. lists, **bold**, *italic*, [links](https://…).
function mdToDoc(md){
  const blocks=[]; const runs=s=>{ const out=[]; const re=/(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g; let last=0,m;
    while((m=re.exec(s))){ if(m.index>last) out.push({x:s.slice(last,m.index)}); const t=m[0];
      if(t[0]==='['){ const k=t.indexOf(']('); out.push({x:t.slice(1,k),u:t.slice(k+2,-1)}); }
      else if(/^https?:/.test(t)) out.push({x:t,u:t});
      else if(t.startsWith('**')) out.push({x:t.slice(2,-2),b:1}); else out.push({x:t.slice(1,-1),i:1}); last=m.index+t.length; }
    if(last<s.length) out.push({x:s.slice(last)}); return out.filter(r=>r.x); };
  const L=String(md||'').replace(/\r/g,'').split('\n');
  for(let li=0;li<L.length;li++){ const raw=L[li]; const l=raw.trimEnd(); if(!l.trim()){ continue; } let m;
    // A fenced code block keeps its lines exactly, blank ones too.
    if((m=/^\s*```\s*([\w+#.-]*)\s*$/.exec(l))){ const body=[]; li++; while(li<L.length&&!/^\s*```\s*$/.test(L[li])) body.push(L[li++]); const x=body.join('\n'); const o={t:'code',r:x?[{x}]:[]}; if(m[1]) o.lang=m[1]; blocks.push(o); continue; }
    if(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)){ blocks.push({t:'hr',r:[]}); continue; }
    if((m=/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(l))){ const o={t:'todo',r:runs(m[2])}; if(m[1]!==' ') o.c=1; blocks.push(o); continue; }
    if((m=/^\s*>\s?(.*)$/.exec(l))){ blocks.push({t:'quote',r:runs(m[1])}); continue; }
    if((m=/^(#{1,3})\s+(.*)$/.exec(l))) blocks.push({t:'h'+m[1].length,r:runs(m[2])});
    else if((m=/^\s*[-*•]\s*(.*)$/.exec(l))&&/^\s*[-*•](\s|$)/.test(l)) blocks.push({t:'ul',r:runs(m[1])});
    else if((m=/^\s*\d+[.)]\s*(.*)$/.exec(l))&&/^\s*\d+[.)](\s|$)/.test(l)) blocks.push({t:'ol',r:runs(m[1])});
    else blocks.push({t:'p',r:runs(l.trim())}); }
  return cleanDoc({blocks});
}
function docToMd(doc){ let k=0; return (doc&&doc.blocks||[]).map(b=>{ if(b.t==='code'){ k=0; return '```'+(b.lang||'')+'\n'+((b.r[0]&&b.r[0].x)||'')+'\n```'; } if(b.t==='hr'){ k=0; return '---'; }
  const s=b.r.map(r=>{ let x=r.b?'**'+r.x+'**':r.i?'*'+r.x+'*':r.x; if(r.u) x=r.x===r.u?r.u:'['+x+']('+r.u+')'; return x; }).join(''); if(b.t==='ol') k++; else k=0;
  return b.t[0]==='h'?'#'.repeat(+b.t[1])+' '+s:b.t==='ul'?'- '+s:b.t==='ol'?k+'. '+s:b.t==='todo'?'- ['+(b.c?'x':' ')+'] '+s:b.t==='quote'?'> '+s:s; }).join('\n'); }
function newModel(){return {title:'',fmExtra:[],pre:[],dir:'LR',comments:[],nodes:new Map(),nodeOrder:[],groups:new Map(),groupOrder:[],edges:[],styles:new Map(),extras:[],pos:new Map(),inks:[],arrows:[],images:[],threads:[],cstyles:new Map()};}
const r10=v=>Math.round(v*10)/10;
function encodeInk(k){
  const pts=k.pts.map(([x,y])=>[r10(x),r10(y)]); if(!pts.length) return '';
  const out=[pts[0][0]+','+pts[0][1]];
  for(let i=1;i<pts.length;i++) out.push(r10(pts[i][0]-pts[i-1][0])+','+r10(pts[i][1]-pts[i-1][1]));
  return '%% @ink '+k.id+' '+k.tool+' '+k.color+' '+k.w+' '+out.join(' ');
}
function decodeInk(t){
  const m=/^%%\s*@ink\s+(\S+)\s+(pen|hl)\s+(#[0-9a-fA-F]{3,8})\s+(\d+(?:\.\d+)?)\s+(.+)$/.exec(t); if(!m) return null;
  const pts=[]; let x=0,y=0;
  m[5].trim().split(/\s+/).forEach((tok,i)=>{ const [a,b]=tok.split(',').map(Number); if(!isFinite(a)||!isFinite(b)) return; if(i===0){x=a;y=b;} else {x+=a;y+=b;} pts.push([r10(x),r10(y)]); });
  return pts.length?{id:m[1],tool:m[2],color:m[3],w:+m[4],pts}:null;
}
function simplifyPts(pts,eps){
  if(pts.length<3) return pts.slice();
  const keep=new Uint8Array(pts.length); keep[0]=keep[pts.length-1]=1;
  const stack=[[0,pts.length-1]];
  while(stack.length){
    const [a,b]=stack.pop(); let md=0,mi=-1; const [ax,ay]=pts[a],[bx,by]=pts[b]; const dx=bx-ax,dy=by-ay; const L=Math.hypot(dx,dy)||1;
    for(let i=a+1;i<b;i++){ const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/L; if(d>md){md=d;mi=i;} }
    if(md>eps&&mi>0){ keep[mi]=1; stack.push([a,mi],[mi,b]); }
  }
  return pts.filter((_,i)=>keep[i]);
}
function inkBox(k){ let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for(const [x,y] of k.pts){ x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);} const h=k.w/2; return {x:x0-h,y:y0-h,w:x1-x0+k.w,h:y1-y0+k.w}; }

function parseMermaid(src){
  const lines=String(src).replace(/\r\n?/g,'\n').split('\n');
  const m=newModel(); const errors=[]; let fatal=null;
  let li=0;
  while(li<lines.length&&!lines[li].trim()) li++;
  if(lines[li]&&lines[li].trim()==='---'){
    let j=li+1; while(j<lines.length&&lines[j].trim()!=='---') j++;
    if(j<lines.length){
      for(let k=li+1;k<j;k++){ const t=lines[k]; const tm=/^\s*title\s*:\s*(.*)$/.exec(t); if(tm) m.title=tm[1].trim().replace(/^["']|["']$/g,''); else if(t.trim()) m.fmExtra.push(t); }
      li=j+1;
    }
  }
  const removeNode=id=>{m.nodes.delete(id); m.nodeOrder=m.nodeOrder.filter(x=>x!==id);};
  const taken=id=>m.nodes.has(id)||m.groups.has(id);
  let header=false; const stack=[]; const pendRoute=new Map(),pendLink=[],pendRich=new Map(),pendDev=new Map(),pendRot=new Map();
  const cur=()=>stack.length?stack[stack.length-1]:null;
  function registerRef(ref){
    const id=ref.id;
    if(RESERVED.has(id)) throw {msg:'"'+id+'" is a reserved word and cannot be a node id'};
    if(m.groups.has(id)&&!ref.def) return id;
    if(m.groups.has(id)) throw {msg:'"'+id+'" is already used by a subgraph'};
    let n=m.nodes.get(id); const g=cur();
    if(!n){ n={id,label:id,shape:'rect',icon:null,group:g?g.id:null,implicit:true,cls:null}; m.nodes.set(id,n); m.nodeOrder.push(id); }
    else if(!n.group&&g) n.group=g.id;
    if(ref.def){ n.implicit=false; n.shape=ref.shape; n.icon=ref.icon||null; if(ref.label!=null) n.label=ref.label; }
    if(ref.cls) n.cls=ref.cls;
    if(n.cls==='sticky'||n.cls==='table'||n.cls==='doc'||UI_KINDS[n.cls]||XSHAPES[n.cls]){ n.shape=n.cls; n.cls=null; }
    return id;
  }
  for(;li<lines.length;li++){
    const raw=lines[li],t=raw.trim(); if(!t) continue;
    if(t.startsWith('%%')){
      const p=/^%%\s*@pos\s+(\S+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?))?\s*$/.exec(t);
      if(p){ m.pos.set(p[1],{x:+p[2],y:+p[3],w:p[4]?+p[4]:null,h:p[5]?+p[5]:null}); continue; }
      if(/^%%\s*@ink\b/.test(t)){ const k=decodeInk(t); if(k) m.inks.push(k); continue; }
      let am=/^%%\s*@arrow\s+(\S+)\s+(straight|elbow|curved|block|line)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+(#[0-9a-fA-F]{3,8})((?:\s+(?:from|to)=\S+)*)\s*$/.exec(t);
      if(am){ const a={id:am[1],kind:am[2],x1:+am[3],y1:+am[4],x2:+am[5],y2:+am[6],w:+am[7],color:am[8],from:null,to:null};
        (am[9]||'').trim().split(/\s+/).forEach(tok=>{ const q=/^(from|to)=(.+)$/.exec(tok); if(q) a[q[1]]=q[2]; }); m.arrows.push(a); continue; }
      am=/^%%\s*@image\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)(\s+front)?(\s+faded)?\s*$/.exec(t);
      if(am){ const im={id:am[1],x:+am[2],y:+am[3],w:+am[4],h:+am[5],front:!!am[6]}; if(am[7]) im.faded=true; m.images.push(im); continue; }
      am=/^%%\s*@comment\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)((?:\s+(?:on=\S+|done))*)\s+(\[.*\])\s*$/.exec(t);
      if(am){ let msgs=[]; try{ msgs=JSON.parse(am[5]).filter(x=>x&&typeof x.t==='string').map(x=>{ const q={t:x.t,d:+x.d||0}; if(typeof x.a==='string'&&x.a) q.a=x.a; return q; }); }catch(_){}
        const fl=am[4]||''; const on=/on=(\S+)/.exec(fl);
        m.threads.push({id:am[1],x:+am[2],y:+am[3],on:on?on[1]:null,done:/\bdone\b/.test(fl),msgs}); continue; }
      am=/^%%\s*@route\s+(\d+)\s+(straight|elbow|curved)(?:\s+([trbl-])\s+([trbl-]))?((?:\s+r[ab]=\d+)*)\s*$/.exec(t);
      if(am){ const rr={r:am[2],a:am[3]&&am[3]!=='-'?am[3]:null,b:am[4]&&am[4]!=='-'?am[4]:null}; const ra=/ra=(\d+)/.exec(am[5]||''), rb=/rb=(\d+)/.exec(am[5]||''); if(ra) rr.ra=+ra[1]; if(rb) rr.rb=+rb[1]; pendRoute.set(+am[1],rr); continue; }
      am=/^%%\s*@(table|doc)\s+(\S+)\s+(\{.*\})\s*$/.exec(t);
      if(am){ try{ pendRich.set(am[2],{kind:am[1],data:JSON.parse(am[3])}); }catch(_){} continue; }
      am=/^%%\s*@theme\s+([a-z]+)\s*$/.exec(t);
      if(am){ if(BOARD_THEMES[am[1]]) m.theme=am[1]; continue; }
      am=/^%%\s*@rot\s+(\S+)\s+(90|180|270)\s*$/.exec(t);
      if(am){ pendRot.set(am[1],+am[2]); continue; }
      am=/^%%\s*@device\s+(\S+)\s+(mobile|tablet|desktop)\s*$/.exec(t);
      if(am){ pendDev.set(am[1],am[2]); continue; }
      if(LAYOUT_MARK.test(t)) continue;
      (header?m.comments:m.pre).push(t); continue;
    }
    if(!header){
      const h=/^(flowchart|graph)(?:\s+(TB|TD|BT|RL|LR))?\s*;?\s*$/i.exec(t);
      if(h){ header=true; m.dir=(h[2]||'TB').toUpperCase(); continue; }
      if(/^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4|sankey|xychart|block|packet|kanban|architecture|radar|treemap)/i.test(t)){
        fatal={line:li,msg:'The visual editor works with flowchart diagrams. Start with: flowchart LR'}; break;
      }
      errors.push({line:li,msg:'Start the diagram with a header such as: flowchart LR'}); header=true;
    }
    let mm;
    if((mm=/^subgraph\s+(.+?)\s*;?$/.exec(t))){
      const rest=mm[1]; let id,label,x;
      if((x=/^([\p{L}\p{N}_-]+)\s*\[\s*(.*?)\s*\]$/u.exec(rest))){ id=x[1]; label=decodeLabel(x[2].replace(/^"(.*)"$/,'$1')); }
      else if((x=/^"(.*)"$/.exec(rest))){ label=decodeLabel(x[1]); id=idFrom(label,taken); }
      else if(/^[\p{L}\p{N}_-]+$/u.test(rest)){ id=rest; label=rest; }
      else { label=rest; id=idFrom(rest,taken); }
      if(m.groups.has(id)){ errors.push({line:li,msg:'Subgraph id "'+id+'" is used twice'}); id=idFrom(id,taken); }
      const ex=m.nodes.get(id);
      if(ex){ if(ex.implicit) removeNode(id); else { errors.push({line:li,msg:'"'+id+'" is already a node id'}); id=idFrom(id,taken); } }
      const g={id,label,parent:cur()?cur().id:null,dir:null,line:li};
      m.groups.set(id,g); m.groupOrder.push(id); stack.push(g); continue;
    }
    if(t==='end'||t==='end;'){ if(!stack.length) errors.push({line:li,msg:'"end" has no matching subgraph'}); else stack.pop(); continue; }
    if((mm=/^direction\s+(TB|TD|BT|RL|LR)\s*;?$/i.exec(t))){ if(cur()) cur().dir=mm[1].toUpperCase(); else m.dir=mm[1].toUpperCase(); continue; }
    if((mm=/^style\s+([\p{L}\p{N}_.-]+)\s+(.+?);?$/u.exec(t))){ m.styles.set(mm[1],parseStyle(mm[2])); continue; }
    if((mm=/^linkStyle\s+([\d\s,]+?)\s+(.+?);?$/.exec(t))){
      const idx=mm[1].split(',').map(x=>parseInt(x.trim(),10)).filter(x=>isFinite(x)); let width=null,color=null; const rest=[];
      for(const part of mm[2].split(',')){ const q=part.trim(); const k=q.indexOf(':'); if(k<0){ if(q) rest.push(q); continue; } const key=q.slice(0,k).trim(),val=q.slice(k+1).trim();
        if(key==='stroke-width'&&/^\d+(\.\d+)?(px)?$/.test(val)) width=parseFloat(val); else if(key==='stroke') color=val; else rest.push(q); }
      pendLink.push({idx,width,color}); if(rest.length) m.extras.push(t); continue;
    }
    if(/^(classDef|class|linkStyle|click|accTitle|accDescr)\b/.test(t)){ m.extras.push(t); continue; }
    for(const st of splitStatements(t)){
      try{
        const r=scanStatement(st);
        const ids=r.groups.map(refs=>refs.map(registerRef));
        r.links.forEach((L,k)=>{
          for(const a of ids[k]) for(const b of ids[k+1]){
            let e={from:a,to:b,line:L.line,head:L.head,tail:L.tail,label:L.label};
            if(e.tail!=='none'&&e.head==='none') e={from:b,to:a,line:L.line,head:L.tail,tail:'none',label:L.label};
            m.edges.push(e);
          }
        });
      }catch(err){
        if(err&&err.msg){ errors.push({line:li,msg:err.msg}); m.extras.push(st); } else throw err;
      }
    }
  }
  if(!fatal&&stack.length) errors.push({line:stack[stack.length-1].line,msg:'subgraph "'+stack[stack.length-1].label+'" needs a closing "end"'});
  for(const id of [...m.nodes.keys()]) if(m.groups.has(id)) removeNode(id);
  for(const L of pendLink) for(const i of L.idx){ const e=m.edges[i]; if(!e) continue; if(L.width) e.width=L.width; if(L.color) e.color=L.color; }
  for(const [i,r] of pendRoute){ const e=m.edges[i]; if(!e) continue; e.route=r.r; if(r.a) e.sa=r.a; if(r.b) e.sb=r.b; if(r.ra!=null) e.ra=r.ra; if(r.rb!=null) e.rb=r.rb; }
  for(const [id,x] of pendRich){ const n=m.nodes.get(id); if(!n) continue; if(x.kind==='table'){ n.shape='table'; n.table=cleanTable(x.data); } else { n.shape='doc'; n.doc=cleanDoc(x.data); } }
  for(const [gid,dv] of pendDev){ const g=m.groups.get(gid); if(g) g.dev=dv; }
  // Text direction: 90, 180 or 270 degrees, for shapes, notes, text and frame titles.
  for(const [id,r] of pendRot){ const x=m.nodes.get(id)||m.groups.get(id); if(x) x.rot=r; }
  for(const n of m.nodes.values()){ if(n.shape==='table'&&!n.table) n.table=cleanTable({}); if(n.shape==='doc'&&!n.doc) n.doc=cleanDoc({}); }
  for(const n of m.nodes.values()) if(n.group&&!m.groups.has(n.group)) n.group=null;
  applyClassDefs(m); m.curve=boardCurve(m);
  return {model:m,errors,fatal};
}

function q(label){
  const s=String(label==null?'':label);
  if(s&&/^[\p{L}\p{N} _.,:'?!+-]+$/u.test(s)&&s.trim()===s) return s;
  return '"'+encodeQuoted(s)+'"';
}
function arrowStr(e){
  if(e.line==='invis') return '~~~';
  const tails={none:'',arrow:'<',circle:'o',cross:'x'},heads={none:'',arrow:'>',circle:'o',cross:'x'};
  const has=e.head!=='none'||e.tail!=='none';
  let core;
  if(e.line==='thick') core=has?'==':'===';
  else if(e.line==='dotted') core='-.-';
  else core=has?'--':'---';
  return tails[e.tail]+core+heads[e.head];
}
function nodeDef(n){
  if(n.shape==='icon') return n.id+'@{ icon: "'+n.icon+'", label: "'+encodeQuoted(n.label)+'" }';
  if(n.shape==='text') return n.id+'@{ shape: text, label: "'+encodeQuoted(n.label)+'" }';
  if(n.shape==='sticky'||n.shape==='table'||n.shape==='doc'||isUi(n)) return n.id+'['+q(n.label)+']:::'+n.shape;
  if(XSHAPES[n.shape]){ const b=BR_OUT[XSHAPES[n.shape]]; return n.id+b[0]+q(n.label)+b[1]+':::'+n.shape; }
  if(n.shape==='rect'&&n.label===n.id&&!n.cls) return n.id;
  const br=BR_OUT[n.shape]||BR_OUT.rect;
  return n.id+br[0]+q(n.label)+br[1]+(n.cls?':::'+n.cls:'');
}
function edgeDef(e){
  let lab='';
  if(e.label){ lab=/[|"\n]/.test(e.label)?'|"'+encodeQuoted(e.label)+'"|':'|'+e.label+'|'; }
  return e.from+' '+arrowStr(e)+lab+' '+e.to;
}
function styleDef(id,st){
  const parts=[]; if(st.fill) parts.push('fill:'+st.fill); if(st.stroke) parts.push('stroke:'+st.stroke); if(st.color) parts.push('color:'+st.color);
  if(st.fontSize) parts.push('font-size:'+Math.round(st.fontSize)+'px'); if(st.bold) parts.push('font-weight:bold'); if(st.italic) parts.push('font-style:italic'); if(st.font&&FONTS[st.font]) parts.push('font-family:'+(FONTS[st.font].token||FONTS[st.font].name)); if(st.bg) parts.push('background:'+st.bg);
  parts.push(...(st.extra||[]));
  return parts.length?'style '+id+' '+parts.join(','):null;
}
const r1=v=>Math.round(v);
function layoutLines(m,boxes){
  const L=[]; if(m.theme&&m.theme!=='classic'&&BOARD_THEMES[m.theme]) L.push('%% @theme '+m.theme);
  for(const id of m.nodeOrder){ const n=m.nodes.get(id); if(!n||n.x==null) continue; L.push('%% @pos '+id+' '+r1(n.x)+' '+r1(n.y)+(n.sized?' '+r1(n.w)+' '+r1(n.h):'')); if(n.rot) L.push('%% @rot '+id+' '+n.rot); }
  for(const gid of m.groupOrder){
    const p=m.pos.get(gid);
    if(p&&p.w) L.push('%% @pos '+gid+' '+r1(p.x)+' '+r1(p.y)+' '+r1(p.w)+' '+r1(p.h));
    const g=m.groups.get(gid); if(g&&g.dev) L.push('%% @device '+gid+' '+g.dev); if(g&&g.rot) L.push('%% @rot '+gid+' '+g.rot);
  }
  (m.edges||[]).forEach((e,i)=>{ const sd=e.sa||e.sb, rw=e.ra!=null||e.rb!=null; if((e.route&&e.route!==(m.curve||'curved'))||sd||rw) L.push('%% @route '+i+' '+(e.route||m.curve||'curved')+(sd||rw?' '+(e.sa||'-')+' '+(e.sb||'-'):'')+(e.ra!=null?' ra='+e.ra:'')+(e.rb!=null?' rb='+e.rb:'')); });
  for(const a0 of (m.arrows||[])){ const a=resolveArrow(m,a0); L.push('%% @arrow '+a.id+' '+a.kind+' '+r10(a.x1)+' '+r10(a.y1)+' '+r10(a.x2)+' '+r10(a.y2)+' '+(+a.w)+' '+a.color+(a0.from&&(m.nodes.has(a0.from)||m.groups.has(a0.from))?' from='+a0.from:'')+(a0.to&&(m.nodes.has(a0.to)||m.groups.has(a0.to))?' to='+a0.to:'')); }
  for(const im of (m.images||[])) L.push('%% @image '+im.id+' '+r10(im.x)+' '+r10(im.y)+' '+r10(im.w)+' '+r10(im.h)+(im.front?' front':'')+(im.faded?' faded':''));
  for(const k of (m.inks||[])){ const e=encodeInk(k); if(e) L.push(e); }
  for(const id of m.nodeOrder){ const n=m.nodes.get(id); if(!n) continue; if(n.shape==='table'&&n.table) L.push('%% @table '+id+' '+JSON.stringify(n.table)); if(n.shape==='doc'&&n.doc) L.push('%% @doc '+id+' '+JSON.stringify(n.doc)); }
  for(const c of (m.threads||[])){
    if(!c.msgs||!c.msgs.length) continue;
    // on=<node>: x y are offsets from the node, so the comment moves with it. If the node is gone, keep the last place on the board.
    const keep=c.on&&m.nodes.has(c.on); const x=keep||!c.on?c.x:(c.wx!=null?c.wx:c.x), y=keep||!c.on?c.y:(c.wy!=null?c.wy:c.y);
    L.push('%% @comment '+c.id+' '+r1(x)+' '+r1(y)+(keep?' on='+c.on:'')+(c.done?' done':'')+' '+JSON.stringify(c.msgs.map(q=>q.a?{a:q.a,t:q.t,d:q.d}:{t:q.t,d:q.d})));
  }
  return L.length?['%% layout: canvas positions and drawings kept by the visual editor',...L]:[];
}
function groupHasMembers(m,gid){
  for(const n of m.nodes.values()) if(n.group===gid) return true;
  for(const g of m.groups.values()) if(g.parent===gid) return true;
  return false;
}
function stripLayout(code){
  return String(code).split('\n').filter(l=>!(POS_RE.test(l)||LAYOUT_MARK.test(l.trim()))).join('\n').replace(/\s+$/,'');
}
function layoutPart(code){
  return String(code).split('\n').filter(l=>POS_RE.test(l)||LAYOUT_MARK.test(l.trim()));
}
function replaceLayout(code,m){
  const L=layoutLines(m);
  return stripLayout(code)+(L.length?'\n\n'+L.join('\n'):'')+'\n';
}
function serializeMermaid(m){
  const L=[];
  if(m.title||m.fmExtra.length){ L.push('---'); if(m.title) L.push('title: '+m.title); L.push(...m.fmExtra); L.push('---'); }
  L.push(...m.pre);
  L.push('flowchart '+m.dir);
  for(const c of m.comments) L.push('  '+c);
  const kidsN=new Map(),kidsG=new Map();
  for(const id of m.nodeOrder){ const n=m.nodes.get(id); const k=n.group||''; if(!kidsN.has(k)) kidsN.set(k,[]); kidsN.get(k).push(n); }
  for(const gid of m.groupOrder){ const g=m.groups.get(gid); const k=g.parent||''; if(!kidsG.has(k)) kidsG.set(k,[]); kidsG.get(k).push(g); }
  const seen=new Set(),order=[];
  (function emit(p,ind){
    for(const n of kidsN.get(p)||[]){ L.push(ind+nodeDef(n)); order.push(n.id); }
    for(const g of kidsG.get(p)||[]){
      if(seen.has(g.id)) continue; seen.add(g.id);
      L.push(ind+'subgraph '+g.id+' ['+q(g.label)+']');
      if(g.dir) L.push(ind+'  direction '+g.dir);
      emit(g.id,ind+'  ');
      L.push(ind+'end');
    }
  })('','  ');
  for(const id of m.nodeOrder) if(!order.includes(id)) order.push(id);
  m.nodeOrder=order;
  if(m.edges.length){ L.push(''); for(const e of m.edges) L.push('  '+edgeDef(e)); }
  const sl=[];
  for(const [id,st] of m.styles){ if(!m.nodes.has(id)&&!m.groups.has(id)) continue; const d=styleDef(id,st); if(d) sl.push('  '+d); }
  m.edges.forEach((e,i)=>{ const pr=[]; if(e.width) pr.push('stroke-width:'+(+e.width)+'px'); if(e.color) pr.push('stroke:'+e.color); if(pr.length) sl.push('  linkStyle '+i+' '+pr.join(',')); });
  if([...m.nodes.values()].some(n=>n.shape==='sticky')&&!m.extras.some(x=>/^classDef\s+sticky\b/.test(x))) m.extras.unshift('classDef sticky stroke-width:0px,color:#1d2026');
  for(const k of ['table','doc']) if([...m.nodes.values()].some(n=>n.shape===k)&&!m.extras.some(x=>new RegExp('^classDef\\s+'+k+'\\b').test(x))) m.extras.unshift('classDef '+k+' fill:#ffffff,stroke:#c9ccd1');
  // Wireframe pieces get grey classes, so other Mermaid tools show them as a sketch too.
  for(const k of Object.keys(UI_KINDS)) if([...m.nodes.values()].some(n=>n.shape===k)&&!m.extras.some(x=>new RegExp('^classDef\\s+'+k+'\\b').test(x))) m.extras.push('classDef '+k+' '+(k==='uiButton'?'fill:#5f6470,stroke:#5f6470,color:#ffffff':'fill:#eceef2,stroke:#c4c8d0,color:#4b5160'));
  if(sl.length||m.extras.length){ L.push(''); L.push(...sl); for(const x of m.extras) L.push('  '+x); }
  const lay=layoutLines(m);
  return L.join('\n')+(lay.length?'\n\n'+lay.join('\n'):'')+'\n';
}
