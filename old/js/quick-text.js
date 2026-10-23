/* orim · quick-text.js
 * Plain-text language: arrows, lists, headings, basic D2.
 */
'use strict';
const QA_RE=/\s*(<->|<=>|-->|---|—>|–>|->|<-|--|=>|→|←|↔|⇒)\s*/;
const QA_SPLIT=/\s*(<->|<=>|-->|---|—>|–>|->|<-|--|=>|→|←|↔|⇒)\s*/g;
const D2_SHAPES={rectangle:'rect',square:'rect',page:'rect',document:'rect',oval:'circle',circle:'circle',diamond:'diamond',cylinder:'cyl',stored_data:'cyl',queue:'cyl',hexagon:'hex',parallelogram:'para',text:'text',cloud:'round',callout:'round',step:'para',package:'sub',person:'icon:azure:users',sql_table:'cyl'};
const QUICK_ALIASES={'power apps':'pp:power-apps','power app':'pp:power-apps','canvas app':'pp:power-apps','model driven app':'pp:power-apps','power automate':'pp:power-automate','flow':'pp:power-automate','dataverse':'pp:dataverse','power bi':'pp:power-bi','copilot studio':'pp:copilot-studio','power pages':'pp:power-pages','ai builder':'pp:ai-builder','function':'azure:function-apps','function app':'azure:function-apps','azure function':'azure:function-apps','key vault':'azure:key-vaults','service bus':'azure:azure-service-bus','cosmos db':'azure:azure-cosmos-db','cosmo':'azure:azure-cosmos-db','sql database':'azure:sql-database','azure sql':'azure:sql-database','app service':'azure:app-services','web app':'azure:app-services','api management':'azure:api-management-services','apim':'azure:api-management-services','logic app':'azure:logic-apps','storage':'azure:storage-accounts','storage account':'azure:storage-accounts','blob storage':'azure:storage-accounts','entra id':'azure:entra-id','entra':'azure:entra-id','azure ad':'azure:entra-id','app insights':'azure:application-insights','application insight':'azure:application-insights','front door':'azure:front-door-and-cdn-profiles','event grid':'azure:event-grid-topics','event hub':'azure:event-hubs','openai':'azure:azure-openai','azure openai':'azure:azure-openai','aks':'azure:kubernetes-services','kubernete':'azure:kubernetes-services','vnet':'azure:virtual-networks','virtual network':'azure:virtual-networks','user':'azure:users','customer':'azure:users','redis':'azure:cache-redis','data factory':'azure:data-factories','container app':'azure:container-apps-environments','static web app':'azure:static-apps','devop':'azure:azure-devops','sharepoint':null,'teams':null};
function normName(t){ return String(t).toLowerCase().replace(/^(azure|microsoft|ms)\s+/,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().replace(/s$/,''); }
let iconIndex=null; const QUICK_ALIAS_N=new Map(Object.entries(QUICK_ALIASES).map(([k,v])=>[normName(k),v]));
function iconMatch(label){
  const k=normName(label); if(!k) return null;
  if(QUICK_ALIAS_N.has(k)) return QUICK_ALIAS_N.get(k);
  if(!Icons.ready) return null;
  if(!iconIndex){ iconIndex=new Map(); for(const p of Icons.packs) for(const ic of p.icons){ const n=normName(ic.title); if(n.length>3&&!iconIndex.has(n)) iconIndex.set(n,ic.key); } }
  return iconIndex.get(k)||null;
}
function guessShape(label){
  const l=label.toLowerCase();
  if(/\b(database|db|postgres(ql)?|mysql|mongo(db)?|sql|cache|warehouse|data lake|table)\b/.test(l)) return 'cyl';
  if(/\?$/.test(l)) return 'diamond';
  if(/^(start|end|begin|finish|done)$/.test(l)) return 'stadium';
  return 'round';
}
function parseQuick(text,opt){
  opt=opt||{};
  const q={nodes:new Map(),order:[],edges:[],groups:[],dir:'LR',stickies:[]};
  const lines=String(text).replace(/\r/g,'').split('\n');
  const stack=[]; let heading=null;
  const bulletRe=/^([-*•+]|\d+[.)]|\[[ xX]?\])\s+(.*)$/;
  const stripQ=x=>x.trim().replace(/^["'`]|["'`]$/g,'').trim();
  const hasArrow=lines.some(l=>{ const t=l.trim(); const b=bulletRe.exec(t); return QA_RE.test(b?b[2]:t); });
  const cur=()=>stack.length?stack[stack.length-1]:null;
  const node=(name)=>{ name=stripQ(name); if(!name) return null; const key=name.toLowerCase(); let n=q.nodes.get(key); if(!n){ for(const x of q.nodes.values()) if(x.label.toLowerCase()===key){ n=x; break; } } if(!n){ n={key,label:name,group:cur(),shape:null}; q.nodes.set(key,n); q.order.push(key); } return n; };
  const newGroup=(label,list)=>{ const lb=stripQ(label)||'Group'; const ex=q.groups.find(g=>g.label.toLowerCase()===lb.toLowerCase()); if(ex){ if(!list) ex.list=false; return ex; } const g={key:'g'+q.groups.length,label:lb,parent:list?null:cur(),list:!!list}; q.groups.push(g); return g; };
  const indentOf=l=>/^\s*/.exec(l.replace(/\t/g,'    '))[0].length;
  for(let i=0;i<lines.length;i++){
    const raw=lines[i]; let t=raw.trim().replace(/;$/,''); if(!t) continue;
    if(/^(\/\/|%%)/.test(t)) continue;
    let mm;
    if((mm=/^direction\s*:\s*(right|left|down|up)$/i.exec(t))){ q.dir={right:'LR',left:'RL',down:'TB',up:'BT'}[mm[1].toLowerCase()]; q.dirSet=true; continue; }
    if(t==='}'){ stack.pop(); continue; }
    if((mm=/^([^{}:]+?)\s*(?::\s*([^{}]*?))?\s*\{$/.exec(t))){ const g=newGroup(mm[2]||mm[1],false); stack.push(g.key); continue; }
    if((mm=/^#{1,6}\s+(.+)$/.exec(t))){ stack.length=0; heading=newGroup(mm[1],true).key; continue; }
    const bm=bulletRe.exec(t);
    if(bm){
      const body=bm[2].trim(); const ind=indentOf(raw);
      if(QA_RE.test(body)) t=body;
      else {
        const next=lines.slice(i+1).find(l=>l.trim());
        if(next&&bulletRe.test(next.trim())&&indentOf(next)>ind&&ind===0){ heading=newGroup(body,true).key; continue; }
        q.stickies.push({text:body,group:heading}); continue;
      }
    }
    if(!QA_RE.test(t)&&/^[^:]{1,60}:$/.test(t)){ heading=newGroup(t.slice(0,-1),true).key; continue; }
    if(opt.declare&&!QA_RE.test(t)&&(mm=/^([A-Za-z_][\w.-]*)\s*:\s*(.+)$/.exec(t))&&!/\.(shape|label)$/.test(mm[1])){ const n=node(mm[1]); if(n) n.label=stripQ(mm[2]); continue; }
    if((mm=/^([\w .-]+?)\.(shape|label)\s*:\s*(.+)$/.exec(t))){ const n=node(mm[1]); if(n){ if(mm[2]==='shape') n.shape=D2_SHAPES[mm[3].trim().toLowerCase()]||null; else n.label=stripQ(mm[3]); } continue; }
    if(QA_RE.test(t)){
      const parts=t.split(QA_SPLIT); let label='';
      const last=parts[parts.length-1]; const ci=last.indexOf(':'); if(ci>=0){ label=stripQ(last.slice(ci+1)); parts[parts.length-1]=last.slice(0,ci); }
      const sets=[]; for(let k=0;k<parts.length;k+=2) sets.push(parts[k].split(/\s*,\s*/).map(node).filter(Boolean));
      for(let k=1;k<parts.length;k+=2){
        const ar=parts[k], A=sets[(k-1)/2]||[], B=sets[(k+1)/2]||[]; const isLast=k===parts.length-2;
        for(const a of A) for(const b of B){
          let e={from:a.key,to:b.key,line:'solid',head:'arrow',tail:'none',label:isLast?label:''};
          if(ar==='<-'||ar==='←') e={...e,from:b.key,to:a.key};
          else if(ar==='<->'||ar==='<=>'||ar==='↔') e.tail='arrow';
          else if(ar==='--'||ar==='---') e.head='none';
          else if(ar==='=>'||ar==='⇒') e.line='thick';
          q.edges.push(e);
        }
      }
      continue;
    }
    if(hasArrow&&(mm=/^([^:]+):\s*(.+)$/.exec(t))){ const n=node(mm[1]); if(n) n.label=stripQ(mm[2]); continue; }
    if(hasArrow||(opt.declare&&stack.length)) node(t); else q.stickies.push({text:t,group:heading});
  }
  return q;
}
const QA_ARROW_OUT=e=>e.line==='thick'?'=>':(e.head==='none'&&e.tail==='none')?'--':(e.head!=='none'&&e.tail!=='none')?'<->':'->';
function quickSafe(l){ return l&&!/[\n:,{}#]|->|<-|--|=>|→|←|↔|⇒/.test(l)&&!/^[-*•+]\s|^\d+[.)]\s/.test(l)&&l.trim()===l; }
function modelToQuick(m){
  if(!m) return '';
  const DV=devFrames(m); const L=[]; const nonSticky=[...m.nodeOrder].map(id=>m.nodes.get(id)).filter(n=>n&&n.shape!=='sticky'&&!keptNode(n,DV));
  const cnt=new Map(); for(const n of nonSticky){ const k=n.label.toLowerCase(); cnt.set(k,(cnt.get(k)||0)+1); }
  const ref=new Map(), needDecl=new Set();
  const linked=new Set(); for(const e of m.edges){ linked.add(e.from); linked.add(e.to); }
  for(const n of nonSticky){ if(linked.has(n.id)&&quickSafe(n.label)&&cnt.get(n.label.toLowerCase())===1) ref.set(n.id,n.label); else { ref.set(n.id,n.id); needDecl.add(n.id); } }
  // Frames in arrows are written by name; a box with the same name wins, so the frame falls back to its id.
  const gcnt=new Map(); for(const g of m.groups.values()){ const k=g.label.toLowerCase(); gcnt.set(k,(gcnt.get(k)||0)+1); }
  for(const g of m.groups.values()) if(linked.has(g.id)&&!DV.has(g.id)) ref.set(g.id,quickSafe(g.label)&&gcnt.get(g.label.toLowerCase())===1&&!cnt.has(g.label.toLowerCase())?g.label:g.id);
  if(m.dir&&m.dir!=='LR') L.push('direction: '+({TB:'down',TD:'down',BT:'up',RL:'left'}[m.dir]||'right'));
  const decl=n=>needDecl.has(n.id)?n.id+': '+String(n.label).replace(/\n/g,' '):n.label;
  for(const n of nonSticky) if(!n.group&&needDecl.has(n.id)) L.push(decl(n));
  const hasNodes=gid=>nonSticky.some(n=>n.group===gid)||[...m.groups.values()].some(g=>g.parent===gid&&hasNodes(g.id));
  (function blocks(parent,ind){
    for(const gid of m.groupOrder){ const g=m.groups.get(gid); if(!g||(g.parent||null)!==parent||!hasNodes(gid)) continue;
      L.push(ind+(quickSafe(g.label)?g.label:gid+': '+g.label.replace(/[{}]/g,''))+' {');
      for(const n of nonSticky) if(n.group===gid) L.push(ind+'  '+decl(n));
      blocks(gid,ind+'  ');
      L.push(ind+'}'); }
  })(null,'');
  const edgeLines=m.edges.filter(e=>ref.has(e.from)&&ref.has(e.to)).map(e=>ref.get(e.from)+' '+QA_ARROW_OUT(e)+' '+ref.get(e.to)+(e.label?': '+e.label.replace(/\n/g,' '):''));
  if(edgeLines.length){ if(L.length) L.push(''); L.push(...edgeLines); }
  const stick=[...m.nodeOrder].map(id=>m.nodes.get(id)).filter(n=>n&&n.shape==='sticky'&&!keptNode(n,DV));
  const rootS=stick.filter(n=>!n.group||!m.groups.has(n.group));
  if(rootS.length){ L.push(''); for(const n of rootS) L.push('- '+String(n.label).replace(/\n/g,' ')); }
  for(const gid of m.groupOrder){ if(DV.has(gid)) continue; const ss=stick.filter(n=>n.group===gid); const g=m.groups.get(gid);
    const empty=!hasNodes(gid)&&!ss.length;
    if(!ss.length&&!empty) continue; L.push(''); L.push('# '+g.label); for(const n of ss) L.push('- '+String(n.label).replace(/\n/g,' ')); }
  const out=L.join('\n').replace(/^\n+/,''); return out?out+'\n':'';
}
// Tables and documents have no text form: Text mode leaves them, and their connectors, as they are.
const isRich=n=>n&&(n.shape==='table'||n.shape==='doc');
// Mockup screens (device frames, everything inside them, and loose wireframe pieces) are kept the same way.
function devFrames(m){ const s=new Set(); for(const g of m.groups.values()) if(g.dev) s.add(g.id); let grew=true; while(grew){ grew=false; for(const g of m.groups.values()) if(!s.has(g.id)&&g.parent&&s.has(g.parent)){ s.add(g.id); grew=true; } } return s; }
const keptNode=(n,dv)=>isRich(n)||isUi(n)||!!(n&&n.group&&dv.has(n.group));
function isDescIn(m,gid,anc){ let p=m.groups.get(gid),k=0; while(p&&k++<60){ if(p.id===anc) return true; p=p.parent?m.groups.get(p.parent):null; } return false; }
function applyQuickText(text){
  const prevIds=nodeIds();
  const cur=state.model||newModel(); const q=parseQuick(text,{declare:true});
  const m=newModel(); m.title=cur.title; m.fmExtra=cur.fmExtra; m.pre=cur.pre; m.comments=cur.comments; m.dir=q.dirSet?q.dir:(cur.dir||'LR');
  m.extras=cur.extras.slice(); m.inks=cur.inks; m.arrows=cur.arrows; m.images=cur.images||[];
  const taken=id=>m.nodes.has(id)||m.groups.has(id);
  const DV=devFrames(cur);
  for(const gid of cur.groupOrder){ if(!DV.has(gid)) continue; const g=cur.groups.get(gid); m.groups.set(gid,{...g,parent:g.parent&&DV.has(g.parent)?g.parent:null}); m.groupOrder.push(gid); if(cur.styles.has(gid)) m.styles.set(gid,cur.styles.get(gid)); if(cur.pos.has(gid)) m.pos.set(gid,cur.pos.get(gid)); }
  const gmap=new Map(); const curGroupsByLabel=new Map(); for(const g of cur.groups.values()) if(!DV.has(g.id)&&!curGroupsByLabel.has(g.label.toLowerCase())) curGroupsByLabel.set(g.label.toLowerCase(),g);
  for(const g of q.groups){ const ex=curGroupsByLabel.get(g.label.toLowerCase())||cur.groups.get(g.label);
    const id=ex&&!m.groups.has(ex.id)?ex.id:idFrom(g.label,taken); gmap.set(g.key,id);
    m.groups.set(id,{id,label:g.label,parent:null,dir:ex?ex.dir:null}); m.groupOrder.push(id);
    if(ex){ if(cur.styles.has(ex.id)) m.styles.set(id,cur.styles.get(ex.id)); if(cur.pos.has(ex.id)) m.pos.set(id,cur.pos.get(ex.id)); } }
  for(const g of q.groups){ const id=gmap.get(g.key); let par=g.parent?gmap.get(g.parent)||null:null; const old=cur.groups.get(id); if(!par&&g.list&&old&&old.parent&&m.groups.has(old.parent)&&old.parent!==id&&!isDescIn(m,old.parent,id)) par=old.parent; m.groups.get(id).parent=par; }
  for(const id of cur.nodeOrder){ const n=cur.nodes.get(id); if(!keptNode(n,DV)) continue; const c={...n}; if(c.group&&!m.groups.has(c.group)) c.group=null; m.nodes.set(id,c); m.nodeOrder.push(id); if(cur.styles.has(id)) m.styles.set(id,cur.styles.get(id)); if(cur.pos.has(id)) m.pos.set(id,cur.pos.get(id)); }
  const byLabel=new Map(); for(const n of cur.nodes.values()) if(n.shape!=='sticky'&&!keptNode(n,DV)){ const k=n.label.toLowerCase(); if(!byLabel.has(k)) byLabel.set(k,n); }
  const used=new Set(); const kmap=new Map(); const curIdLower=new Map(); for(const n of cur.nodes.values()) curIdLower.set(n.id.toLowerCase(),n);
  const frameByName=new Map(), dupe=new Set();
  for(const id of m.groupOrder){ const g=m.groups.get(id); const k=g.label.toLowerCase(); if(frameByName.has(k)&&frameByName.get(k)!==id) dupe.add(k); else frameByName.set(k,id); }
  for(const k of dupe) frameByName.delete(k);
  for(const id of m.groupOrder) if(!frameByName.has(id.toLowerCase())) frameByName.set(id.toLowerCase(),id);
  const boxNamed=new Set(); for(const n of cur.nodes.values()) if(n.shape!=='sticky'){ boxNamed.add(n.id.toLowerCase()); boxNamed.add(n.label.toLowerCase()); }
  for(const key of q.order){
    const qn=q.nodes.get(key);
    // A bare name used in arrows that matches a frame, with no box of that name: it is the frame.
    if(!qn.group&&!qn.shape&&qn.label.toLowerCase()===key&&frameByName.has(key)&&!boxNamed.has(key)){ kmap.set(key,frameByName.get(key)); continue; }
    let ex=curIdLower.get(key); if(ex&&(ex.shape==='sticky'||keptNode(ex,DV))) ex=null; if(!ex) ex=byLabel.get(qn.label.toLowerCase()); if(ex&&used.has(ex.id)) ex=null;
    const id=ex?ex.id:idFrom(qn.label,taken); if(ex) used.add(ex.id); kmap.set(key,id);
    let shape,icon=null;
    if(qn.shape){ shape=qn.shape; if(shape.startsWith('icon:')){ icon=shape.slice(5); shape='icon'; } }
    else if(ex&&ex.label.toLowerCase()===qn.label.toLowerCase()){ shape=ex.shape; icon=ex.icon; }
    else { icon=iconMatch(qn.label); shape=icon?'icon':guessShape(qn.label); }
    const n={id,label:qn.label,shape,icon,group:qn.group?gmap.get(qn.group)||null:null,cls:ex?ex.cls:null};
    m.nodes.set(id,n); m.nodeOrder.push(id);
    if(ex){ if(cur.styles.has(ex.id)) m.styles.set(id,cur.styles.get(ex.id)); if(cur.pos.has(ex.id)) m.pos.set(id,cur.pos.get(ex.id)); }
  }
  const stickByText=new Map(); for(const n of cur.nodes.values()) if(n.shape==='sticky'&&!keptNode(n,DV)){ const k=n.label.toLowerCase().replace(/\s+/g,' ').trim(); if(!stickByText.has(k)) stickByText.set(k,[]); stickByText.get(k).push(n); }
  const groupColor=new Map(); let ci=0;
  for(const st of q.stickies){
    const k=st.text.toLowerCase().replace(/\s+/g,' ').trim(); const list=stickByText.get(k); let ex=null; while(list&&list.length){ const c=list.shift(); if(!used.has(c.id)){ ex=c; break; } }
    const gid=st.group?gmap.get(st.group)||null:null;
    const id=ex?ex.id:idFrom('note',taken); if(ex) used.add(ex.id);
    m.nodes.set(id,{id,label:ex&&ex.label.replace(/\s+/g,' ').trim().toLowerCase()===k?ex.label:st.text,shape:'sticky',icon:null,group:gid,cls:null}); m.nodeOrder.push(id);
    if(ex&&cur.styles.has(ex.id)) m.styles.set(id,cur.styles.get(ex.id));
    else { if(gid&&!groupColor.has(gid)) groupColor.set(gid,QUICK_STICKY_CYCLE[ci++%QUICK_STICKY_CYCLE.length]); m.styles.set(id,{fill:gid?groupColor.get(gid):'#fff9b1',stroke:null,color:null,fontSize:null,bold:false,italic:false,bg:null,extra:[]}); }
    if(ex&&cur.pos.has(ex.id)) m.pos.set(id,cur.pos.get(ex.id));
  }
  const curEdge=new Map(); cur.edges.forEach(e=>{ const k=e.from+'\u0001'+e.to; if(!curEdge.has(k)) curEdge.set(k,e); });
  for(const e of q.edges){ const from=kmap.get(e.from),to=kmap.get(e.to); if(!from||!to) continue; const old=curEdge.get(from+'\u0001'+to);
    const ne={from,to,line:e.line,head:e.head,tail:e.tail,label:e.label}; if(old){ if(old.route) ne.route=old.route; if(old.sa) ne.sa=old.sa; if(old.sb) ne.sb=old.sb; if(old.width) ne.width=old.width; if(old.color) ne.color=old.color; if(e.line==='solid'&&old.line==='dotted') ne.line='dotted'; } m.edges.push(ne); }
  const keptEnd=id=>DV.has(id)||keptNode(cur.nodes.get(id),DV);
  for(const e of cur.edges) if((keptEnd(e.from)||keptEnd(e.to))&&(m.nodes.has(e.from)||m.groups.has(e.from))&&(m.nodes.has(e.to)||m.groups.has(e.to))) m.edges.push({...e});
  for(const a of m.arrows){ if(a.from&&!m.nodes.has(a.from)&&!m.groups.has(a.from)) a.from=null; if(a.to&&!m.nodes.has(a.to)&&!m.groups.has(a.to)) a.to=null; }
  resolveGeometry(m,state.cache);
  // Empty frames have no content to size them: keep their saved box, or give new ones a spot beside the board.
  const emptyNew=m.groupOrder.filter(gid=>!groupHasMembers(m,gid)&&!(m.pos.get(gid)&&m.pos.get(gid).w));
  if(emptyNew.length){ const others=m.groupOrder.filter(g=>!emptyNew.includes(g)); const tmp={...m,groupOrder:others}; const b=contentBounds(tmp);
    const x0=b?SNAP(b.x+b.w+80):0, y0=b?SNAP(b.y):0; emptyNew.forEach((gid,k)=>m.pos.set(gid,{x:x0,y:y0+k*220,w:280,h:180})); }
  state.code=serializeMermaid(m); reparse(); render(); saveLocal();
  revealNew(prevIds);
}
function quickSummary(q){ const parts=[]; if(q.order.length) parts.push(q.order.length+(q.order.length===1?' box':' boxes')); if(q.edges.length) parts.push(q.edges.length+(q.edges.length===1?' connection':' connections')); if(q.stickies.length) parts.push(q.stickies.length+(q.stickies.length===1?' sticky note':' sticky notes')); const fr=q.groups.filter(g=>g.list?q.stickies.some(s=>s.group===g.key):true).length; if(fr) parts.push(fr+(fr===1?' frame':' frames')); return parts.join(', ')||'Nothing recognised yet'; }
const QUICK_STICKY_CYCLE=['#fff9b1','#d5f692','#a6ccf5','#ffcee0','#f5d128','#67c6c0','#ff9d48','#c6a2d2'];
function quickToBoard(text,replace,useIcons){
  const q=parseQuick(text);
  if(!q.order.length&&!q.stickies.length){ toast('No boxes, arrows or list items found in that text'); return; }
  if(state.fatal){ toast('Fix the diagram type in the code first'); return; }
  const r=boardRect(); const left=64+((state.libOpen&&r.width>760)?300:0);
  const center=replace?{x:0,y:0}:toWorld({clientX:r.left+left+(r.width-left)/2,clientY:r.top+r.height/2});
  const added=[];
  mutate(m=>{
    if(replace){ m.nodes.clear(); m.nodeOrder=[]; m.groups.clear(); m.groupOrder=[]; m.edges=[]; m.styles.clear(); m.pos.clear(); m.inks=[]; m.arrows=[]; m.images=[]; m.extras=m.extras.filter(x=>!/^(class|classDef|click|linkStyle)\b/.test(x)); state.cache.clear(); }
    const taken=id=>m.nodes.has(id)||m.groups.has(id);
    const gmap=new Map();
    for(const g of q.groups){ if(g.list&&!q.stickies.some(s=>s.group===g.key)&&!q.order.some(k=>q.nodes.get(k).group===g.key)) continue; const id=idFrom(g.label,taken); gmap.set(g.key,id); m.groups.set(id,{id,label:g.label,parent:g.parent?gmap.get(g.parent)||null:null,dir:null}); m.groupOrder.push(id); }
    // graph part
    const tmp=newModel(); tmp.dir=q.dir; const nmap=new Map();
    for(const key of q.order){
      const qn=q.nodes.get(key); const id=idFrom(qn.label,x=>taken(x)||tmp.nodes.has(x)); nmap.set(key,id);
      let shape=qn.shape,icon=null;
      if(shape&&shape.startsWith('icon:')){ icon=shape.slice(5); shape='icon'; }
      if(!shape){ icon=useIcons?iconMatch(qn.label):null; shape=icon?'icon':guessShape(qn.label); }
      const n={id,label:qn.label,shape,icon,group:qn.group?gmap.get(qn.group)||null:null,cls:null}; sizeNode(n); tmp.nodes.set(id,n); tmp.nodeOrder.push(id);
    }
    for(const [k,id] of gmap){ const g=m.groups.get(id); if([...tmp.nodes.values()].some(n=>n.group===id)||[...m.groups.values()].some(x=>x.parent===id)){ tmp.groups.set(id,{...g}); tmp.groupOrder.push(id); } }
    for(const e of q.edges) tmp.edges.push({from:nmap.get(e.from),to:nmap.get(e.to),line:e.line,head:e.head,tail:e.tail,label:e.label});
    let gx0=0,gy0=0,gx1=0,gy1=0;
    if(tmp.nodes.size){ autoLayout(tmp); gx0=Infinity;gy0=Infinity;gx1=-Infinity;gy1=-Infinity; for(const n of tmp.nodes.values()){ gx0=Math.min(gx0,n.x);gy0=Math.min(gy0,n.y);gx1=Math.max(gx1,n.x+n.w);gy1=Math.max(gy1,n.y+n.h); } for(const n of tmp.nodes.values()){ n.x-=gx0; n.y-=gy0; } gx1-=gx0; gy1-=gy0; }
    // sticky part
    const S=160,G=24,PX=24,PT=40; const items=[]; const byGroup=new Map();
    for(const st of q.stickies){ const k=st.group&&gmap.has(st.group)?st.group:''; if(!byGroup.has(k)) byGroup.set(k,[]); byGroup.get(k).push(st); }
    let sx=0; const sy=tmp.nodes.size?gy1+(q.groups.some(g=>!g.list)?96:80):0; let ci=0;
    for(const [k,list] of byGroup){
      if(!k) continue;
      const cols=list.length<=4?2:3; const color=QUICK_STICKY_CYCLE[ci++%QUICK_STICKY_CYCLE.length];
      list.forEach((st,i)=>items.push({st,x:sx+PX+(i%cols)*(S+G),y:sy+PT+Math.floor(i/cols)*(S+G),group:gmap.get(k),color}));
      sx+=PX*2+cols*S+(cols-1)*G+64;
    }
    const loose=byGroup.get('')||[];
    if(loose.length){ const cols=Math.min(5,Math.max(2,Math.ceil(Math.sqrt(loose.length*1.6)))); const grouped=items.length?Math.max(...items.map(it=>it.y+S))+PX+64:0; const yy=items.length?grouped:sy;
      loose.forEach((st,i)=>items.push({st,x:(i%cols)*(S+G),y:yy+Math.floor(i/cols)*(S+G),group:null,color:'#fff9b1'})); }
    // bounds of everything, centre on target
    let bx1=gx1,by1=gy1; for(const it of items){ bx1=Math.max(bx1,it.x+S); by1=Math.max(by1,it.y+S); }
    let ox=SNAP(center.x-bx1/2), oy=SNAP(center.y-by1/2);
    if(!replace){
      const ex=contentBounds(m);
      if(ex){
        const blk={x:ox-40,y:oy-60,w:bx1+80,h:by1+100}; let hit=false;
        for(const n of m.nodes.values()) if(n.x!=null&&overlaps(blk,n,0)){ hit=true; break; }
        if(!hit) for(const b of groupBoxes(m).values()) if(overlaps(blk,{x:b.x,y:b.y-30,w:b.w,h:b.h+30},0)){ hit=true; break; }
        if(hit){ ox=SNAP(ex.x+ex.w+160); oy=SNAP(ex.y+40); }
      }
      state.quickFocus={x:ox+bx1/2,y:oy+by1/2};
    }
    for(const id of tmp.nodeOrder){ const n=tmp.nodes.get(id); n.x=SNAP(n.x+ox); n.y=SNAP(n.y+oy); m.nodes.set(id,n); m.nodeOrder.push(id); added.push('n:'+id); }
    for(const e of tmp.edges) m.edges.push(e);
    for(const it of items){ const id=idFrom('note',taken); const n={id,label:it.st.text,shape:'sticky',icon:null,group:it.group||null,cls:null}; sizeNode(n); n.x=SNAP(it.x+ox); n.y=SNAP(it.y+oy); m.nodes.set(id,n); m.nodeOrder.push(id); m.styles.set(id,{fill:it.color,stroke:null,color:null,fontSize:null,bold:false,italic:false,bg:null,extra:[]}); added.push('n:'+id); }
  });
  state.sel=new Set(added.slice(0,400)); selChanged();
  if(replace) requestAnimationFrame(fit);
  else if(state.quickFocus){ const f=state.quickFocus; state.quickFocus=null; const rr=boardRect(); const lf=64+((state.libOpen&&rr.width>760)?300:0); const sc=toScreen(f); if(sc.x<lf||sc.x>rr.width||sc.y<0||sc.y>rr.height){ state.view.x+=(lf+(rr.width-lf)/2)-sc.x; state.view.y+=rr.height/2-sc.y; applyView(); renderOverlay(); } }
  toast('Added '+quickSummary(q));
}
function openQuickText(fromHome){
  const ex='Browser -> API -> Database\nAPI -> Key Vault: secrets\nPower Apps -> Dataverse -> Power Automate\n\n# Ideas\n- Offline mode for inspectors\n- Photo upload\n- Weekly summary in Power BI';
  openModal('Paste text to board','<p>Type or paste text. Arrows become connected boxes, list items become sticky notes, and a <code># Heading</code> or <code>Heading:</code> line groups the items under it into a frame. Basic <a href="https://d2lang.com/tour/intro" target="_blank" rel="noopener">D2</a> also works: <code>id: Label</code>, <code>group { … }</code>, <code>db.shape: cylinder</code>.</p><textarea id="quickIn" spellcheck="false" placeholder="'+esc(ex)+'"></textarea><label class="toggle"><input type="checkbox" id="quickIcons" checked><span>Use Azure and Power Platform icons for known service names</span></label><p id="quickSum" style="font-variant-numeric:tabular-nums"></p>',[
    ...(fromHome?[{label:'Create board',primary:true,run:()=>{ const v=$('#quickIn').value||ex; const ic=$('#quickIcons').checked; closeModal(); Boards.openNew('flowchart LR\n','Untitled board'); requestAnimationFrame(()=>quickToBoard(v,true,ic)); }}]:[
    {label:'Replace board',run:()=>{ const v=$('#quickIn').value||ex; closeModal(); quickToBoard(v,true,$('#quickIcons')?$('#quickIcons').checked:true); }},
    {label:'Add to board',primary:true,run:()=>{ const v=$('#quickIn').value||ex; const ic=$('#quickIcons').checked; closeModal(); quickToBoard(v,false,ic); }}])]);
  const ta=$('#quickIn'); const upd=()=>{ $('#quickSum').textContent=ta.value.trim()?quickSummary(parseQuick(ta.value)):'Empty uses the example shown.'; };
  ta.addEventListener('input',upd); upd(); setTimeout(()=>ta.focus(),30);
}
