/* orim · core/tickets.js
 * Tickets are document cards with a work item type (Azure DevOps style): Epic, Feature,
 * User Story, Task or Bug. The type adds a coloured strip, a few fields and a starting
 * template; the body is an ordinary document. Tickets copy as rich text and Markdown and
 * export to the CSV that Azure DevOps imports. No DOM here.
 */
'use strict';
const TICKET_TYPES={
  epic:{name:'Epic',ado:'Epic',color:'#e06c00',rank:0,fields:['priority','tags'],tpl:'## Description\n\n## Business value\n'},
  feature:{name:'Feature',ado:'Feature',color:'#773b93',rank:1,fields:['priority','tags'],tpl:'## Description\n\n## Acceptance criteria\n- '},
  story:{name:'User Story',ado:'User Story',color:'#009ccc',rank:2,fields:['points','priority','tags'],tpl:'## Description\nAs a user, I want …, so that …\n## Acceptance criteria\n- '},
  bug:{name:'Bug',ado:'Bug',color:'#cc293d',rank:2,fields:['severity','priority','tags'],tpl:'## Repro steps\n1. \n## Expected result\n\n## Actual result\n'},
  task:{name:'Task',ado:'Task',color:'#d9a800',rank:3,fields:['remaining','activity','tags'],tpl:'## Description\n'}
};
const TICKET_FIELDS={
  priority:{name:'Priority',csv:'Priority',opts:['1','2','3','4'],show:v=>'P'+v},
  points:{name:'Story points',csv:'Story Points',num:true,show:v=>v+' pts'},
  severity:{name:'Severity',csv:'Severity',opts:['1 - Critical','2 - High','3 - Medium','4 - Low'],show:v=>'Sev '+String(v).split(' ')[0]},
  remaining:{name:'Remaining (h)',csv:'Remaining Work',num:true,show:v=>v+' h'},
  activity:{name:'Activity',csv:'Activity',opts:['Development','Design','Testing','Documentation','Deployment','Requirements'],show:v=>v},
  tags:{name:'Tags',csv:'Tags',show:v=>String(v).split(/[;,]/).map(s=>s.trim()).filter(Boolean).join(', ')}
};
const isTicket=n=>!!(n&&n.shape==='doc'&&n.doc&&TICKET_TYPES[n.doc.kind]);
// Keep only known fields with sensible values.
function cleanFields(kind,f){
  const out={}; const t=TICKET_TYPES[kind]; if(!t||!f||typeof f!=='object') return out;
  for(const k of t.fields){ let v=f[k]; if(v==null||v==='') continue; const d=TICKET_FIELDS[k];
    if(d.num){ v=+v; if(!isFinite(v)||v<0) continue; out[k]=Math.round(v*10)/10; continue; }
    v=String(v).trim().slice(0,200); if(!v) continue;
    if(d.opts){ const hit=d.opts.find(o=>o===v||o.split(' ')[0]===v.split(' ')[0]); if(!hit) continue; v=hit; }
    out[k]=v; }
  return out;
}
const ticketLine=n=>{ const d=n.doc, t=TICKET_TYPES[d.kind]; if(!t) return ''; return t.fields.filter(k=>d.fields&&d.fields[k]!=null).map(k=>TICKET_FIELDS[k].show(d.fields[k])).join(' · '); };
const safeUrl=u=>{ const s=String(u||'').trim(); return /^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(s)?s.slice(0,2000):null; };
function ticketTemplate(kind){ const t=TICKET_TYPES[kind]; return t?mdToDoc(t.tpl).blocks:[{t:'p',r:[]}]; }
// Blocks to HTML and Markdown, for copying and export.
function blocksHtml(blocks){
  const he=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
  const runs=rs=>rs.map(r=>{ let s=he(r.x); if(r.i) s='<i>'+s+'</i>'; if(r.b) s='<b>'+s+'</b>'; if(r.u) s='<a href="'+he(r.u)+'">'+s+'</a>'; return s; }).join('');
  let h='', list=null;
  for(const b of blocks){
    if(b.t==='ul'||b.t==='ol'||b.t==='todo'){ const lt=b.t==='ol'?'ol':'ul'; if(list!==lt){ if(list) h+='</'+list+'>'; h+='<'+lt+'>'; list=lt; } h+='<li>'+(b.t==='todo'?(b.c?'☑ ':'☐ '):'')+runs(b.r)+'</li>'; continue; }
    if(list){ h+='</'+list+'>'; list=null; }
    if(b.t==='hr'){ h+='<hr>'; continue; }
    if(b.t==='code'){ h+='<pre><code>'+String((b.r[0]&&b.r[0].x)||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</code></pre>'; continue; }
    if(!b.r.length) continue;
    if(b.t==='quote'){ h+='<blockquote>'+runs(b.r)+'</blockquote>'; continue; }
    h+='<'+(b.t==='p'?'p':b.t)+'>'+runs(b.r)+'</'+(b.t==='p'?'p':b.t)+'>';
  }
  if(list) h+='</'+list+'>';
  return h;
}
// The parts of a ticket body: the section under an "Acceptance criteria" heading, and the rest.
function ticketParts(doc){
  const desc=[], acc=[]; let into=desc, skipHead=false;
  for(const b of doc.blocks){
    if(/^h[1-3]$/.test(b.t)){ const txt=b.r.map(r=>r.x).join('').trim().toLowerCase();
      if(/^acceptance/.test(txt)){ into=acc; continue; } into=desc; if(txt==='description') continue; }
    into.push(b);
  }
  // Empty template lines are not content.
  const real=bs=>bs.filter(b=>b.r.some(r=>r.x.trim()&&!/^(-|…|1\.)$/.test(r.x.trim())));
  return {desc:real(desc).length?desc:[],acc:real(acc).length?acc:[]};
}
function ticketHtml(n){
  const d=n.doc, t=TICKET_TYPES[d.kind]; const he=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let h='<h2>'+(t?he(t.name)+': ':'')+he(n.label||'Untitled')+'</h2>'; const line=t?ticketLine(n):''; if(line) h+='<p><i>'+he(line)+'</i></p>';
  return h+blocksHtml(d.blocks);
}
function ticketMd(n){ const d=n.doc, t=TICKET_TYPES[d.kind]; const line=t?ticketLine(n):''; return '## '+(t?t.name+': ':'')+(n.label||'Untitled')+'\n'+(line?'_'+line+'_\n':'')+'\n'+docToMd(d).replace(/\n{3,}/g,'\n\n')+'\n'; }
// Parent of a ticket: a connected ticket of a higher level (Epic > Feature > Story/Bug > Task).
function ticketParent(m,n){
  const r=TICKET_TYPES[n.doc.kind].rank; let best=null;
  for(const e of m.edges){ const o=e.from===n.id?e.to:e.to===n.id?e.from:null; if(!o) continue; const p=m.nodes.get(o); if(!isTicket(p)) continue;
    const pr=TICKET_TYPES[p.doc.kind].rank; if(pr<r&&(!best||pr>TICKET_TYPES[best.doc.kind].rank)) best=p; }
  return best;
}
// CSV for Azure DevOps: Boards > Work items > Import from CSV. Title 1, Title 2 … give the hierarchy.
function ticketsCsv(m,ids){
  const all=[...m.nodeOrder].map(id=>m.nodes.get(id)).filter(isTicket).filter(n=>!ids||ids.has(n.id));
  if(!all.length) return null;
  const inSet=new Set(all.map(n=>n.id)); const par=new Map(all.map(n=>{ const p=ticketParent(m,n); return [n.id,p&&inSet.has(p.id)?p.id:null]; }));
  const kids=new Map(); for(const n of all){ const p=par.get(n.id)||''; if(!kids.has(p)) kids.set(p,[]); kids.get(p).push(n); }
  const rows=[]; let depth=1;
  const walk=(pid,d,seen)=>{ for(const n of kids.get(pid)||[]){ if(seen.has(n.id)) continue; seen.add(n.id); depth=Math.max(depth,d); rows.push({n,d}); walk(n.id,d+1,seen); } };
  walk('',1,new Set());
  const cols=['ID','Work Item Type']; for(let k=1;k<=depth;k++) cols.push('Title '+k);
  const extra=['Description','Acceptance Criteria','Repro Steps','Priority','Story Points','Severity','Remaining Work','Activity','Tags']; cols.push(...extra);
  const q=v=>{ const s=String(v==null?'':v); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const out=[cols.map(q).join(',')];
  for(const {n,d} of rows){
    const doc=n.doc, t=TICKET_TYPES[doc.kind], f=doc.fields||{}; const parts=ticketParts(doc);
    const row=['',t.ado]; for(let k=1;k<=depth;k++) row.push(k===d?(n.label||'Untitled'):'');
    const bug=doc.kind==='bug';
    row.push(bug?'':blocksHtml(parts.desc), bug?'':blocksHtml(parts.acc), bug?blocksHtml(doc.blocks):'', f.priority||'', f.points!=null?f.points:'', f.severity||'', f.remaining!=null?f.remaining:'', f.activity||'', f.tags?TICKET_FIELDS.tags.show(f.tags).replace(/, /g,'; '):'');
    out.push(row.map(q).join(','));
  }
  return out.join('\r\n')+'\r\n';
}
