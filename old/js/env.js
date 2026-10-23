/* orim · env.js
 * DOM references, constants, palettes and the toolbar icon set.
 */
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const SVGNS='http://www.w3.org/2000/svg';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}};
const IMG={}; let imgWarned=false;
const FONT_UI='"Instrument Sans","Segoe UI",system-ui,-apple-system,sans-serif';
const FONT_EXPORT="'Segoe UI','Instrument Sans',system-ui,-apple-system,Helvetica,Arial,sans-serif";
const FONT_ATTR="'Instrument Sans','Segoe UI',system-ui,-apple-system,sans-serif";
const mctx=document.createElement('canvas').getContext('2d');
const mcache=new Map();
Core.measure=(t,size,font)=>{const k=size+'|'+(font||'')+'|'+t;let v=mcache.get(k);if(v==null){mctx.font='500 '+size+'px '+(fontCss(font)||FONT_UI);v=mctx.measureText(String(t)).width;if(mcache.size>5000)mcache.clear();mcache.set(k,v);}return v;};

const app=$('#app'),board=$('#board'),world=$('#world'),lGroups=$('#lGroups'),lEdges=$('#lEdges'),lNodes=$('#lNodes'),lInk=$('#lInk'),lOver=$('#lOver'),lEdgesTop=$('#lEdgesTop'),lImg=$('#lImg'),lImgTop=$('#lImgTop');
const boardPane=$('#boardPane'),ta=$('#code'),hl=$('#hl'),gutterIn=$('#gutterIn'),ctxEl=$('#ctx'),popEl=$('#pop');

const SHAPES=[
  {id:'rect',name:'Rectangle',def:'Process',key:'r'},{id:'round',name:'Rounded',def:'Step'},{id:'stadium',name:'Stadium',def:'Start'},
  {id:'circle',name:'Circle',def:'Event',key:'o'},{id:'diamond',name:'Decision',def:'Decision',key:'d'},{id:'hex',name:'Hexagon',def:'Prepare'},
  {id:'cyl',name:'Database',def:'Database',key:'b'},{id:'para',name:'Input / output',def:'Input'},{id:'sub',name:'Subroutine',def:'Subprocess'},{id:'text',name:'Text',def:'Text',key:'t'},{id:'sticky',name:'Sticky note',def:''},
  {id:'cloud',name:'Cloud',def:'Idea'},{id:'bubble',name:'Speech bubble',def:'Comment'},{id:'tri',name:'Triangle',def:'Triangle'},{id:'star',name:'Star',def:'Star'},{id:'arrow',name:'Arrow',def:'Next'},{id:'chevron',name:'Chevron',def:'Step'},{id:'paper',name:'Document',def:'Document'}];
const ARROW_COLORS=['#1a1a1a','#808080','#f24726','#ff9d48','#0ca789','#2d9bf0','#9510ac'];
const ARROW_KINDS=[['curved','arCurved','Curved arrow'],['straight','arStraight','Straight arrow'],['elbow','arElbow','Elbow arrow'],['line','arLine','Line'],['block','arBlock','Block arrow']];
const STICKY_COLORS=['#fff9b1','#f5d128','#ff9d48','#d5f692','#c9df56','#93d275','#67c6c0','#a6ccf5','#6cd8fa','#9ea9ff','#ffcee0','#ea94bb','#f0939d','#c6a2d2','#e6e6e6'];
const INK_COLORS={pen:['#1a1a1a','#f24726','#2d9bf0'],hl:['#f5d128','#ea94bb','#93d275']};
const INK_W={pen:2.5,hl:16};
const SHAPE_TOOLS=['rect','round','stadium','circle','diamond','hex','cyl','para','sub','cloud','bubble','tri','star','arrow','chevron','paper'];
const MIRO_COLORS=['#ffffff','#e6e6e6','#808080','#1a1a1a','#fff9b1','#f5d128','#ff9d48','#f24726','#d5f692','#c9df56','#93d275','#0ca789','#a6ccf5','#6cd8fa','#2d9bf0','#414bb2','#ffcee0','#ea94bb','#c6a2d2','#9510ac'];
const SWATCHES=[null,...MIRO_COLORS.map(c=>({fill:c,stroke:null}))];
const PAL_LIVE={nodeFill:'var(--node-fill)',nodeStroke:'var(--node-stroke)',nodeText:'var(--node-text)',edge:'var(--edge)',accent:'var(--accent)',labelBg:'var(--label-bg)',labelText:'var(--muted)',frameFill:'var(--frame-fill)',frameStroke:'var(--frame-stroke)',frameText:'var(--frame-text)',muted:'var(--faint)',font:FONT_ATTR,nodeSw:'var(--node-sw)',frameSw:'var(--frame-sw)',edgeSw:'var(--edge-sw)',edgeThick:'var(--edge-thick)',inkBlack:'var(--ink-black)',frameOut:false,devFill:'var(--dev-fill)',devStroke:'var(--dev-stroke)',wfFill:'var(--wf-fill)',wfLine:'var(--wf-line)',wfInk:'var(--wf-ink)',wfText:'var(--wf-text)',codeBg:'var(--code-bg)',edgeText:'var(--edge-text)'};
const PAL_EXPORT={nodeFill:'#ffffff',nodeStroke:'#1a1a1a',nodeText:'#1a1a1a',edge:'#1a1a1a',accent:'#1a1a1a',labelBg:'#ffffff',labelText:'#596273',frameFill:'#ffffff',frameStroke:'#e3e3e3',frameText:'#1d2026',muted:'#8a92a1',font:FONT_EXPORT,nodeSw:2,frameSw:1.2,edgeSw:2,edgeThick:4,inkBlack:'#1a1a1a',frameOut:true,devFill:'#ffffff',devStroke:'#3b3f48',wfFill:'#eceef2',wfLine:'#c4c8d0',wfInk:'#5f6470',wfText:'#4b5160',codeBg:'#f4f5f7'};

const I={
  select:'<path d="M5.5 3.5l13 7.2-5.8 1.6-2.6 5.6z"/>',
  hand:'<path d="M8 12.5V5.8a1.4 1.4 0 0 1 2.8 0V11"/><path d="M10.8 10V4.6a1.4 1.4 0 0 1 2.8 0V11"/><path d="M13.6 10.2V5.8a1.4 1.4 0 0 1 2.8 0v6"/><path d="M16.4 9.6a1.4 1.4 0 0 1 2.8 0v4.2a6.4 6.4 0 0 1-6.4 6.4h-1.1a6 6 0 0 1-4.6-2.2l-3-3.7a1.4 1.4 0 0 1 2.1-1.8L8 14.4"/>',
  rect:'<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  round:'<rect x="4" y="6" width="16" height="12" rx="4.5"/>',
  stadium:'<rect x="3" y="7" width="18" height="10" rx="5"/>',
  circle:'<circle cx="12" cy="12" r="7.5"/>',
  diamond:'<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/>',
  hex:'<path d="M7.5 5h9l4 7-4 7h-9l-4-7z"/>',
  cyl:'<ellipse cx="12" cy="6.5" rx="7" ry="2.5"/><path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11"/>',
  para:'<path d="M7 6h14l-4 12H3z"/>',
  sub:'<rect x="3.5" y="6" width="17" height="12" rx="1"/><path d="M6.5 6v12M17.5 6v12"/>',
  text:'<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  connector:'<path d="M5 19L18 6"/><path d="M11 6h7v7"/>',
  frame:'<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  library:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  folder:'<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.3A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  dup:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  group:'<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><rect x="7" y="7" width="4" height="4" rx="1"/><rect x="13" y="13" width="4" height="4" rx="1"/>',
  ungroup:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/><path d="M15 4h5v5M4 15v5h5" stroke-dasharray="2 2"/>',
  reverse:'<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  label:'<path d="M4 7V5h10v2M9 5v12M6 17h6"/><path d="M15 13h5M17.5 13v6"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  image:'<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9.5" cy="9.5" r="1.5"/><path d="M20 15l-4.5-4.5L6 20"/>',
  noimage:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 4l16 16"/>',
  lineSolid:'<path d="M4 12h16"/>',
  lineDot:'<path d="M4 12h16" stroke-dasharray="2.5 3"/>',
  lineThick:'<path d="M4 12h16" stroke-width="3.4"/>',
  arrNone:'<path d="M4 12h16"/>',
  arrEnd:'<path d="M4 12h15"/><path d="M15 8l4 4-4 4"/>',
  arrBoth:'<path d="M5 12h14"/><path d="M15 8l4 4-4 4M9 8l-4 4 4 4"/>',
  alL:'<path d="M4 4v16"/><rect x="8" y="6.5" width="11" height="4" rx="1"/><rect x="8" y="13.5" width="7" height="4" rx="1"/>',
  alC:'<path d="M12 4v16"/><rect x="6.5" y="6.5" width="11" height="4" rx="1"/><rect x="8.5" y="13.5" width="7" height="4" rx="1"/>',
  alT:'<path d="M4 4h16"/><rect x="6.5" y="8" width="4" height="11" rx="1"/><rect x="13.5" y="8" width="4" height="7" rx="1"/>',
  alM:'<path d="M4 12h16"/><rect x="6.5" y="6.5" width="4" height="11" rx="1"/><rect x="13.5" y="8.5" width="4" height="7" rx="1"/>',
  disH:'<path d="M4 4v16M20 4v16"/><rect x="9.5" y="8" width="5" height="8" rx="1"/>',
  disV:'<path d="M4 4h16M4 20h16"/><rect x="8" y="9.5" width="8" height="5" rx="1"/>',
  chev:'<path d="M9 6l6 6-6 6"/>',
  arCurved:'<path d="M4.5 19c1-7.5 5-11.5 13.5-13"/><path d="M14 3.2L18.4 6l-3.2 4"/>',
  arStraight:'<path d="M5 19L18 6"/><path d="M11 6h7v7"/>',
  arElbow:'<path d="M4 19h8V7h8"/><path d="M16.5 3.5L20 7l-3.5 3.5"/>',
  arLine:'<path d="M5 19L19 5"/>',
  arBlock:'<path d="M3.5 9.5h9.5V5.5L20.5 12 13 18.5v-4H3.5z"/>',
  layerUp:'<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4" opacity=".45"/><path d="M4 16l8 4 8-4" opacity=".45"/>',
  layerDown:'<path d="M12 12l8 4-8 4-8-4z"/><path d="M4 8l8 4 8-4" opacity=".45"/><path d="M4 4l8 4 8-4" opacity=".45"/>',
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z"/>',
  spell:'<path d="M4 16l4-10 4 10M5.5 12.5h5"/><path d="M13.5 15.5l2.5 2.5 5-6"/>',
  cloud:'<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.3 4.6 4.6 0 0 0 7 18.5z"/>',
  bubble:'<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  tri:'<path d="M12 4.5l8.5 15h-17z"/>',
  star:'<path d="M12 3.8l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.6 6.9 19.4 8 13.7 3.8 9.8l5.7-.7z"/>',
  arrow:'<path d="M3.5 9h10V5.5L20.5 12l-7 6.5V15h-10z"/>',
  chevron:'<path d="M3.5 6h12l5 6-5 6h-12l5-6z"/>',
  paper:'<path d="M5 4.5h14v13c-2.3-1.6-4.6-1.6-7 0s-4.7 1.6-7 0z"/>',
  todo:'<rect x="4" y="5" width="6" height="6" rx="1.5"/><path d="M5.5 8l1.2 1.2L9 6.8M13 8h7M4 15.5h6v.01M13 16h7"/><rect x="4" y="13" width="6" height="6" rx="1.5"/>',
  code:'<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14"/>',
  quote:'<path d="M5 7v10M9 9h10M9 13h10M9 17h6"/>',
  hr:'<path d="M3.5 12h17M7 7h10M7 17h10" stroke-dasharray="0"/>',
  textDir:'<path d="M3.5 17l4-10 4 10M5 13.5h5"/><path d="M17 4.5v15M14.5 17l2.5 2.5 2.5-2.5"/>',
  browser:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M6.5 6.8h.01M9 6.8h.01"/>',
  close:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  picture:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5L5 19.5"/>',
  chevD:'<path d="M8 10l4 4 4-4"/>',
  autoSides:'<rect x="3" y="8" width="6" height="8" rx="1.5"/><rect x="15" y="8" width="6" height="8" rx="1.5"/><path d="M9 12h6"/><path d="M12 4v2M12 18v2" opacity=".55"/>',
  comment:'<path d="M12 4a8 8 0 1 1-4.1 14.9L4 20l1.1-3.9A8 8 0 0 1 12 4z"/>',
  bold:'<path d="M7.5 5h5.5a3.5 3.5 0 0 1 0 7H7.5z"/><path d="M7.5 12h6.5a3.5 3.5 0 0 1 0 7H7.5z"/>',
  italic:'<path d="M10.5 5h7M6.5 19h7M14 5l-4 14"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon:'<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  auto:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  pen:'<path d="M4 20l1.2-4.6L15.8 4.8a2.1 2.1 0 0 1 3 3L8.2 18.4z"/><path d="M14 6.6l3 3"/>',
  hl:'<path d="M14.5 4.5l5 5-7.5 7.5h-5v-5z"/><path d="M7 12l-3 3v3h3"/><path d="M4 21h9"/>',
  eraser:'<path d="M9 20h11"/><path d="M4.6 14.6l9.2-9.2a2 2 0 0 1 2.8 0l2.9 2.9a2 2 0 0 1 0 2.8L12 18.6a2 2 0 0 1-1.4.6H8.4a2 2 0 0 1-1.4-.6l-2.4-2.4a2 2 0 0 1 0-2.8z"/><path d="M9.5 9.7l5.6 5.6"/>',
  sticky:'<path d="M5 4.5h14v9.5L13.5 19.5H5z"/><path d="M13.5 19.5v-5.5H19"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copyDoc:'<rect x="5.5" y="5" width="13" height="16" rx="2"/><path d="M9 3.5h6v3H9z"/><path d="M9 11h6M9 14.5h6M9 18h3"/>',
  ticket:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 4v16"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
  phone:'<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5h3"/>',
  tablet:'<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M11 18h2"/>',
  desktop:'<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M2.5 7.5h19M9 20.5h6M12 17v3.5"/>',
  uiHeading:'<path d="M5 6v12M13 6v12M5 12h8M16.5 18h3"/>',
  uiText:'<path d="M4 7h16M4 11h16M4 15h16M4 19h9"/>',
  uiButton:'<rect x="3" y="7.5" width="18" height="9" rx="3"/><path d="M8.5 12h7"/>',
  uiInput:'<rect x="3" y="7.5" width="18" height="9" rx="2"/><path d="M6.5 10v4"/>',
  uiImage:'<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5"/><circle cx="15.5" cy="9" r="1.3"/>',
  uiTopbar:'<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 9h17M6 6.5h3"/>',
  uiTabbar:'<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 15h17M7.5 17.5h1M11.5 17.5h1M15.5 17.5h1"/>',
  uiTable:'<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 9.5h17M3.5 14h17M9.5 5v14M15 5v14"/>',
  uiSidebar:'<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M9 4v16M5.5 7.5h1.5M5.5 10.5h1.5"/>',
  table:'<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 10h17M3.5 14.5h17M9.5 10v9"/>',
  doc:'<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  rowAdd:'<rect x="3.5" y="4.5" width="17" height="9" rx="1.5"/><path d="M3.5 9h17M12 16.5v5M9.5 19h5"/>',
  colAdd:'<rect x="3.5" y="3.5" width="9" height="17" rx="1.5"/><path d="M8 3.5v17M16.5 12h5M19 9.5v5"/>',
  rowDel:'<rect x="3.5" y="4.5" width="17" height="9" rx="1.5"/><path d="M3.5 9h17M9.5 19h5"/>',
  colDel:'<rect x="3.5" y="3.5" width="9" height="17" rx="1.5"/><path d="M8 3.5v17M16.5 12h5"/>',
  h1:'<path d="M4.5 6v12M12.5 6v12M4.5 12h8"/><path d="M16.5 9l2.5-1.5V18"/>',
  h2:'<path d="M4.5 6v12M12.5 6v12M4.5 12h8"/><path d="M16 9.5a2.2 2.2 0 0 1 4.3.6c0 1.6-4.3 4.4-4.3 7.9h4.5"/>',
  h3:'<path d="M4.5 6v12M12.5 6v12M4.5 12h8"/><path d="M16 8h4l-2.4 3.4a2.4 2.4 0 1 1-1.8 4.2"/>',
  para:'<path d="M5 7h14M5 12h14M5 17h9"/>',
  list:'<circle cx="5.5" cy="7" r="1" fill="currentColor"/><circle cx="5.5" cy="12" r="1" fill="currentColor"/><circle cx="5.5" cy="17" r="1" fill="currentColor"/><path d="M9.5 7h10M9.5 12h10M9.5 17h10"/>',
  olist:'<path d="M4.5 5.5l1.2-.8V9.5M4.2 13.6a1.2 1.2 0 0 1 2.3.4c0 .9-2.3 1.7-2.3 3.4h2.5"/><path d="M10 7h10M10 12h10M10 17h10"/>',
  expand:'<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
  collapse:'<path d="M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6"/>',
  shapes:'<rect x="3.5" y="10" width="9.5" height="9.5" rx="1.5"/><circle cx="15.5" cy="8.5" r="5"/>',
  format:'<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M4 10h16"/>',
  fitIn:'<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>'
};
const ico=(k,extra='')=>`<svg class="i" viewBox="0 0 24 24" ${extra}>${I[k]}</svg>`;
