/* orim · core/templates.js
 * Starter boards, written as Mermaid.
 */
'use strict';
function boardCode(title,cols,theme){
  const S=160,G=24,PADX=24,PADT=40,PADB=24,per=2,colW=PADX*2+per*S+(per-1)*G,gap=72;
  const L=['---','title: '+title,'---','flowchart LR'],styles=[],pos=[]; let x=0;
  const maxRows=Math.max(...cols.map(c=>Math.ceil(c.notes.length/per)))+1;
  const colH=PADT+maxRows*S+(maxRows-1)*G+PADB;
  cols.forEach(c=>{
    L.push('  subgraph '+c.id+' ['+c.label+']');
    c.notes.forEach(([text,color],i)=>{
      const id=c.id+(i+1); L.push('    '+id+'["'+text+'"]:::sticky'); styles.push('  style '+id+' fill:'+color);
      pos.push('%% @pos '+id+' '+(x+PADX+(i%per)*(S+G))+' '+(PADT+Math.floor(i/per)*(S+G)));
    });
    L.push('  end'); pos.push('%% @pos '+c.id+' '+x+' 0 '+colW+' '+colH); x+=colW+gap;
  });
  return L.join('\n')+'\n\n'+styles.join('\n')+'\n  classDef sticky stroke-width:0px,color:#1d2026\n\n%% layout: canvas positions and drawings kept by the visual editor\n'+(theme?'%% @theme '+theme+'\n':'')+pos.join('\n')+'\n';
}

// A board from a plain description: frames (nested with in), shapes with positions, lines and styles.
// Written out as ordinary Mermaid plus orim's canvas lines, like any saved board.
function buildBoard(o){
  const q=t=>'"'+String(t).replace(/"/g,'#quot;').replace(/\n/g,'<br>')+'"';
  const BR={rect:['[',']'],round:['(',')'],stadium:['([','])'],circle:['((','))'],diamond:['{','}'],cyl:['[(',')]'],hex:['{{','}}'],sub:['[[',']]'],para:['[/','/]']};
  const def=n=>{ const sh=n.shape||'rect';
    if(n.icon) return n.id+'@{ icon: "'+n.icon+'", label: "'+String(n.label).replace(/"/g,'#quot;').replace(/\n/g,'<br>')+'" }';
    if(sh==='text') return n.id+'@{ shape: text, label: "'+String(n.label).replace(/"/g,'#quot;').replace(/\n/g,'<br>')+'" }';
    if(sh==='sticky'||sh==='doc'||sh==='table') return n.id+'['+q(n.label)+']:::'+sh;
    if(XSHAPES[sh]){ const b=BR[XSHAPES[sh]]; return n.id+b[0]+q(n.label)+b[1]+':::'+sh; }
    const b=BR[sh]||BR.rect; return n.id+b[0]+q(n.label)+b[1]; };
  const L=['---','title: '+o.title,'---','flowchart '+(o.dir||'LR')];
  const frames=o.frames||[], nodes=o.nodes||[];
  const emit=(parent,ind)=>{ for(const n of nodes) if((n.in||null)===parent) L.push(ind+def(n));
    for(const f of frames) if((f.in||null)===parent){ L.push(ind+'subgraph '+f.id+' ['+f.label+']'); emit(f.id,ind+'  '); L.push(ind+'end'); } };
  emit(null,'  '); L.push('');
  for(const e of o.edges||[]){ const [a,b,lab,kind]=e; const ar=kind==='dotted'?'-.->':kind==='plain'?'---':kind==='thick'?'==>':'-->'; L.push('  '+a+' '+ar+(lab?'|'+lab+'|':'')+' '+b); }
  L.push('');
  for(const n of nodes.concat(frames)){ const st=n.style||{}; const parts=[]; if(n.fill||st.fill) parts.push('fill:'+(n.fill||st.fill)); if(st.stroke) parts.push('stroke:'+st.stroke); if(st.color) parts.push('color:'+st.color); if(st.size) parts.push('font-size:'+st.size+'px'); if(st.bold) parts.push('font-weight:bold'); if(st.font) parts.push('font-family:'+st.font); if(parts.length) L.push('  style '+n.id+' '+parts.join(',')); }
  if(nodes.some(n=>n.shape==='sticky')) L.push('  classDef sticky stroke-width:0px,color:#1d2026');
  L.push('','%% layout: canvas positions and drawings kept by the visual editor'); if(o.theme) L.push('%% @theme '+o.theme);
  for(const n of nodes) if(n.x!=null) L.push('%% @pos '+n.id+' '+n.x+' '+n.y+(n.w?' '+n.w+' '+n.h:''));
  for(const f of frames) if(f.pos) L.push('%% @pos '+f.id+' '+f.pos.join(' '));
  (o.edges||[]).forEach((e,i)=>{ if(e[4]) L.push('%% @route '+i+' '+e[4]); });
  for(const n of nodes) if(n.doc) L.push('%% @doc '+n.id+' '+JSON.stringify(n.doc));
  return L.join('\n')+'\n';
}
// Customer journey: five stages, each with what the customer does, thinks and feels, the pain points and the ideas.
function journeyCode(){
  const S=[['aware','1 · Discover','Sees an ad for the bike shop','"Could this work for my commute?"','Curious','Too many options to compare','Simple "find your bike" quiz'],
    ['consider','2 · Compare','Reads reviews and checks prices','"Is it worth the price?"','Unsure','Delivery cost shown late','Show the full price up front'],
    ['buy','3 · Buy','Orders online, pays by card','"I hope it fits me"','Excited','Size guide hard to find','Size check in the basket'],
    ['onboard','4 · Get started','Assembles the bike at home','"Where does this part go?"','Frustrated','Paper manual only','Short how-to videos'],
    ['loyal','5 · Keep riding','Books the first service','"They remember me"','Happy','No reminder for the service','Service reminders and a loyalty perk']];
  const nodes=[], frames=[], edges=[]; const CW=240, GAP=40;
  const rows=[['Doing',56],['Thinking',196],['Feeling',318],['Pain points',384],['Ideas',524]];
  rows.forEach(([t,y],i)=>nodes.push({id:'row'+i,label:t,shape:'text',x:-160,y:y+30,w:120,h:40,style:{bold:true,size:15}}));
  S.forEach(([id,label,doing,think,feel,pain,idea],i)=>{ const x=i*(CW+GAP);
    frames.push({id,label});
    nodes.push({id:id+'Do',label:doing,shape:'sticky',in:id,x:x+20,y:56,w:200,h:112,fill:'#fff9b1'});
    nodes.push({id:id+'Think',label:think,shape:'bubble',in:id,x:x+20,y:196,w:200,h:96});
    nodes.push({id:id+'Feel',label:feel,shape:'stadium',in:id,x:x+40,y:318,w:160,h:40,style:{fill:['#d5f692','#fff3b0','#d5f692','#fbd7d4','#d5f692'][i]}});
    nodes.push({id:id+'Pain',label:pain,shape:'sticky',in:id,x:x+20,y:384,w:200,h:112,fill:'#ffcee0'});
    nodes.push({id:id+'Idea',label:idea,shape:'sticky',in:id,x:x+20,y:524,w:200,h:112,fill:'#a6ccf5'});
    if(i) edges.push([S[i-1][0],id,'','',null]); });
  return buildBoard({title:'Customer journey map',theme:'pastel',nodes,frames,edges});
}
// Layered architecture: application, service and data layers with modules inside, and cross-cutting concerns on the side.
function layersCode(){
  const nodes=[], frames=[], edges=[]; const W=150, H=48, G=16;
  const box=(id,label,inn,x,y,w)=>nodes.push({id,label,shape:'rect',in:inn,x,y,w:w||W,h:H});
  frames.push({id:'appL',label:'Application layer'},{id:'svcL',label:'Service layer'},{id:'dataL',label:'Data layer'},{id:'cross',label:'Cross-cutting'});
  ['Admin console','Web app','Android app','iOS app'].forEach((t,i)=>box('app'+i,t,'appL',24+i*(W+G+40),60));
  const mods=[['admin','Administration',['Users','Permissions','Organisations','Monitoring']],['orders','Orders',['Basket','Checkout','Payments','Returns']],['catalog','Catalogue',['Products','Prices','Search','Media']]];
  mods.forEach(([id,label,items],k)=>{ frames.push({id,label,in:'svcL'}); const x0=24+k*(2*W+G+60); items.forEach((t,i)=>box(id+i,t,id,x0+(i%2)*(W+G),260+Math.floor(i/2)*(H+G))); });
  frames.push({id:'dbs',label:'Databases',in:'dataL'},{id:'files',label:'File storage',in:'dataL'});
  ['Orders DB','Catalogue DB','Search index'].forEach((t,i)=>nodes.push({id:'db'+i,label:t,shape:'cyl',in:'dbs',x:24+i*(W+G),y:520,w:W,h:64}));
  ['Images and video','Documents'].forEach((t,i)=>box('file'+i,t,'files',600+i*(W+G),528));
  ['Identity','Secrets','Logging'].forEach((t,i)=>box('x'+i,t,'cross',1180,60+i*(H+G)*2.4,140));
  edges.push(['appL','svcL','REST',''],['svcL','dataL','','']);
  return buildBoard({title:'Layered architecture',theme:'pastel',dir:'TB',nodes,frames,edges});
}
// Mind map: one question, three coloured branches, ideas on each.
function mindCode(){
  const B=[['product','Product','#6cc7b9',['Pick the launch features','Beta with ten customers','Pricing page']],['market','Marketing','#f6c97f',['Launch post and video','Partner newsletter','Webinar for admins']],['support','Support','#f2805f',['Help centre articles','Chat agent in Copilot Studio','Onboarding checklist']]];
  const nodes=[{id:'root',label:'Plan the launch',shape:'round',x:0,y:300,w:220,h:96,style:{fill:'#ffffff',color:'#2d2f4e',size:20,bold:true}}], edges=[];
  B.forEach(([id,label,c,items],k)=>{ const y=k*300; nodes.push({id,label,shape:'round',x:340,y:y+12+60,w:200,h:96,style:{fill:c,color:'#1f2140',bold:true,size:16}}); edges.push(['root',id,'','plain']);
    items.forEach((t,i)=>{ const nid=id+i; nodes.push({id:nid,label:t,shape:'round',x:640,y:y+i*84,w:240,h:56,style:{stroke:c}}); edges.push([id,nid,'','plain']); }); });
  return buildBoard({title:'Mind map',theme:'midnight',nodes,edges});
}
// SWOT: four frames of sticky notes.
function swotCode(){
  const Q=[['str','Strengths','#d5f692',['Loyal customers','Fast delivery']],['weak','Weaknesses','#ffcee0',['Old website','Small team']],['opp','Opportunities','#a6ccf5',['Online sales growing','New city stores']],['thr','Threats','#fff3b0',['Price war','Rising costs']]];
  const nodes=[], frames=[];
  Q.forEach(([id,label,c,items],k)=>{ frames.push({id,label}); const x0=(k%2)*480, y0=Math.floor(k/2)*340; items.forEach((t,i)=>nodes.push({id:id+i,label:t,shape:'sticky',in:id,x:x0+24+i*196,y:y0+48,w:176,h:176,fill:c})); });
  return buildBoard({title:'SWOT analysis',theme:'pastel',nodes,frames});
}
// Sprint plan: a feature broken into stories and a task, ready to copy into Azure DevOps.
function sprintCode(){
  const md=s=>({blocks:mdToDoc(s).blocks});
  const doc=(id,kind,title,fields,text,x,y)=>({id,label:title,shape:'doc',in:'sprint',x,y,w:300,h:0,doc:{...md(text),kind,fields}});
  const nodes=[doc('feat','feature','Self-service returns',{priority:'1',tags:'returns'},'## Description\nCustomers start a return online without calling support.\n## Acceptance criteria\n- [ ] Return started from the order page\n- [ ] Label emailed within a minute',0,0),
    doc('s1','story','Start a return from my order',{points:3,priority:'2'},'## Description\nAs a customer, I want to start a return from my order, so that I do not have to call.\n## Acceptance criteria\n- Return button on delivered orders',360,-120),
    doc('s2','story','Email the return label',{points:2,priority:'2'},'## Description\nAs a customer, I want the label by email, so that I can print it.\n## Acceptance criteria\n- PDF label attached',360,160),
    doc('t1','task','Returns API endpoint',{remaining:6,activity:'Development'},'## Description\n```http\nPOST /api/returns\n{ "orderId": "…", "reason": "size" }\n```',720,-120)];
  return buildBoard({title:'Sprint plan',frames:[{id:'sprint',label:'Sprint 14'}],nodes,edges:[['feat','s1'],['feat','s2'],['s1','t1']]});
}
const TEMPLATES=[
{id:'inspect',tint:'#f1e6f4',name:'Field inspections',desc:'Power Apps, Dataverse and Azure services',code:`---
title: Field inspections
---
flowchart LR
  inspector@{ icon: "azure:users", label: "Field inspector" }
  subgraph pp [Power Platform]
    app@{ icon: "pp:power-apps", label: "Inspection app" }
    copilot@{ icon: "pp:copilot-studio", label: "Inspection agent" }
    dv@{ icon: "pp:dataverse", label: "Dataverse" }
    flow@{ icon: "pp:power-automate", label: "Approval flow" }
  end
  subgraph az [Azure]
    apim@{ icon: "azure:api-management-services", label: "API Management" }
    fn@{ icon: "azure:function-apps", label: "Scoring function" }
    sb@{ icon: "azure:azure-service-bus", label: "Service Bus" }
    sql@{ icon: "azure:sql-database", label: "Reporting DB" }
    kv@{ icon: "azure:key-vaults", label: "Key Vault" }
  end
  bi@{ icon: "pp:power-bi", label: "Quality report" }

  inspector --> app
  inspector -.->|asks| copilot
  app -->|saves| dv
  copilot --> dv
  dv -->|row added| flow
  flow -->|custom connector| apim
  apim --> fn
  fn --> sb
  sb --> sql
  fn -.-> kv
  sql --> bi
`},
{id:'webapp',tint:'#e3f0fb',name:'Azure web application',desc:'Front Door, App Service, Functions, SQL',code:`---
title: Azure web application
---
flowchart LR
  user@{ icon: "azure:users", label: "Customers" }
  entra@{ icon: "azure:entra-id", label: "Entra ID" }
  fd@{ icon: "azure:front-door-and-cdn-profiles", label: "Front Door" }
  subgraph rg [Resource group: prod]
    subgraph vnet [Virtual network]
      web@{ icon: "azure:app-services", label: "Web app" }
      api@{ icon: "azure:function-apps", label: "Orders API" }
      sql@{ icon: "azure:sql-database", label: "Orders DB" }
    end
    kv@{ icon: "azure:key-vaults", label: "Key Vault" }
    st@{ icon: "azure:storage-accounts", label: "Blob storage" }
    ai@{ icon: "azure:application-insights", label: "App Insights" }
  end

  user --> fd
  user -.->|sign in| entra
  fd --> web
  web --> api
  api --> sql
  api --> st
  web -.->|secrets| kv
  api -.-> ai
`},
{id:'events',tint:'#e4f4ee',name:'Event-driven orders',desc:'Service Bus, Functions, Cosmos DB, Logic Apps',code:`---
title: Order events
---
flowchart LR
  shop@{ icon: "azure:app-services", label: "Shop" }
  apim@{ icon: "azure:api-management-services", label: "API gateway" }
  sb@{ icon: "azure:azure-service-bus", label: "orders topic" }
  subgraph workers [Processing]
    pay@{ icon: "azure:function-apps", label: "Payment" }
    ship@{ icon: "azure:function-apps", label: "Shipping" }
  end
  cosmos@{ icon: "azure:azure-cosmos-db", label: "Order store" }
  eg@{ icon: "azure:event-grid-topics", label: "Event Grid" }
  la@{ icon: "azure:logic-apps", label: "Notify customer" }
  bi@{ icon: "pp:power-bi", label: "Sales dashboard" }

  shop --> apim --> sb
  sb --> pay
  sb --> ship
  pay --> cosmos
  ship --> cosmos
  cosmos -.->|change feed| eg
  eg --> la
  cosmos ==> bi
`},
{id:'flow',tint:'#fbf3dc',name:'Approval flowchart',desc:'Plain shapes, decisions and colors',code:`---
title: Expense approval
---
flowchart TD
  start([Expense submitted]) --> check{Over 500 EUR?}
  check -->|No| auto[Auto-approve]
  check -->|Yes| mgr[Manager review]
  mgr --> ok{Approved?}
  ok -->|Yes| pay[(Payroll)]
  ok -->|No| reject[Notify employee]
  auto --> pay

  style check fill:#fff3b0,stroke:#d4ac0d
  style ok fill:#fff3b0,stroke:#d4ac0d
  style reject fill:#fbd7d4,stroke:#d24f44
  style pay fill:#d3f0dc,stroke:#36a064
`},
{id:'retro',tint:'#fdeef2',name:'Retrospective',desc:'Went well, to improve, action items',code:boardCode('Sprint retrospective',[
  {id:'well',label:'What went well',notes:[['Release shipped on time','#d5f692'],['Pairing on the API','#d5f692'],['Fewer incidents this sprint','#93d275'],['Clear sprint goal','#fff9b1']]},
  {id:'improve',label:'What could be better',notes:[['Too many meetings','#ffcee0'],['Flaky tests in CI','#f0939d'],['Unclear owner for the Dataverse schema','#ff9d48'],['Late design changes','#ffcee0']]},
  {id:'actions',label:'Action items',notes:[['Timebox standup to 15 min','#a6ccf5'],['Fix the 3 flakiest tests','#a6ccf5'],['Name a schema owner','#9ea9ff']]}])},
{id:'ssc',tint:'#eef6e2',name:'Start, stop, continue',desc:'Three columns of sticky notes',code:boardCode('Start, stop, continue',[
  {id:'start',label:'Start',notes:[['Demo to users every sprint','#d5f692'],['Write ADRs for big decisions','#c9df56']]},
  {id:'stop',label:'Stop',notes:[['Merging without review','#f0939d'],['Ad-hoc prod fixes','#ffcee0']]},
  {id:'continue',label:'Continue',notes:[['Friday knowledge share','#a6ccf5'],['Small pull requests','#6cd8fa'],['Pair on hard bugs','#fff9b1']]}])},
{id:'pp',name:'Power Platform solution',desc:'Apps, Dataverse, flows, agents and reports',tint:'#f1e6f4',code:`---
title: Power Platform solution
---
flowchart LR
  users@{ icon: "azure:users", label: "Employees" }
  entra@{ icon: "azure:entra-id", label: "Entra ID" }
  subgraph env [Power Platform environment]
    app@{ icon: "pp:power-apps", label: "Canvas app" }
    portal@{ icon: "pp:power-pages", label: "Partner portal" }
    agent@{ icon: "pp:copilot-studio", label: "Help agent" }
    dv@{ icon: "pp:dataverse", label: "Dataverse" }
    flow@{ icon: "pp:power-automate", label: "Cloud flows" }
    bi@{ icon: "pp:power-bi", label: "Reports" }
  end
  gw@{ icon: "azure:on-premises-data-gateways", label: "Data gateway" }
  erp[(On-prem ERP)]

  users --> app
  users --> agent
  users -.->|sign in| entra
  app --> dv
  portal --> dv
  agent --> dv
  dv -->|row changed| flow
  flow --> gw
  gw --> erp
  dv ==> bi
`},
{id:'data',name:'Analytics pipeline',desc:'Ingest, lake, transform and report',tint:'#e3f0fb',code:`---
title: Analytics pipeline
---
flowchart LR
  subgraph sources [Sources]
    iot@{ icon: "azure:event-hubs", label: "Event Hubs" }
    crm@{ icon: "pp:dataverse", label: "Dataverse" }
    sql@{ icon: "azure:sql-database", label: "Sales DB" }
  end
  adf@{ icon: "azure:data-factories", label: "Data Factory" }
  subgraph lake [Data lake]
    raw@{ icon: "azure:storage-accounts", label: "Raw" }
    curated@{ icon: "azure:storage-accounts", label: "Curated" }
  end
  dbx@{ icon: "azure:azure-databricks", label: "Databricks" }
  syn@{ icon: "azure:azure-synapse-analytics", label: "Synapse" }
  bi@{ icon: "pp:power-bi", label: "Dashboards" }

  iot --> adf
  crm --> adf
  sql --> adf
  adf --> raw
  raw --> dbx
  dbx --> curated
  curated --> syn
  syn ==> bi
`},
{id:'kanban',name:'Kanban board',desc:'To do, in progress, done',tint:'#fff6cc',code:boardCode('Sprint board',[
  {id:'todo',label:'To do',notes:[['Write the onboarding guide','#fff9b1'],['Set up Dataverse tables','#fff9b1'],['Design the approval flow','#fff9b1'],['Collect report requirements','#fff9b1']]},
  {id:'doing',label:'In progress',notes:[['Build the inspection app','#a6ccf5'],['Custom connector for the API','#a6ccf5']]},
  {id:'done',label:'Done',notes:[['Environment created','#d5f692'],['Security roles agreed','#d5f692'],['Kick-off meeting','#d5f692']]}])},
{id:'brainstorm',name:'Brainstorm',desc:'One topic, ideas around it',tint:'#fdeef2',code:`---
title: Brainstorm
---
flowchart LR
  topic((New hire onboarding))
  n1["Welcome video from the team"]:::sticky
  n2["Buddy for the first month"]:::sticky
  n3["Laptop ready on day one"]:::sticky
  n4["Checklist app in Power Apps"]:::sticky
  n5["Weekly check-in with the lead"]:::sticky
  n6["Short quiz after week one"]:::sticky

  topic --- n1
  topic --- n2
  topic --- n3
  topic --- n4
  topic --- n5
  topic --- n6

  style topic fill:#1a1a1a,color:#ffffff,font-size:18px,font-weight:bold
  style n1 fill:#fff9b1
  style n2 fill:#ffcee0
  style n3 fill:#a6ccf5
  style n4 fill:#d5f692
  style n5 fill:#f5d128
  style n6 fill:#c6a2d2
  classDef sticky stroke-width:0px,color:#1d2026

%% layout: canvas positions and drawings kept by the visual editor
%% @pos topic 384 264 200 200
%% @pos n1 96 40
%% @pos n2 404 -136
%% @pos n3 712 40
%% @pos n4 712 448
%% @pos n5 404 624
%% @pos n6 96 448
%% @route 0 straight
%% @route 1 straight
%% @route 2 straight
%% @route 3 straight
%% @route 4 straight
%% @route 5 straight
`},
{id:'blank',name:'Blank board',desc:'Start from an empty flowchart',code:`flowchart LR
`}];
// New starters, a style for some of the older ones, and for each: a category and a next step to ask Claude.
TEMPLATES.splice(TEMPLATES.findIndex(t=>t.id==='blank'),0,
  {id:'journey',tint:'#fdf1e4',name:'Customer journey map',desc:'Stages with doing, thinking, feeling, pains and ideas',code:journeyCode()},
  {id:'layers',tint:'#e7f4f1',name:'Layered architecture',desc:'Application, service and data layers',code:layersCode()},
  {id:'mind',tint:'#e6e7f3',name:'Mind map',desc:'One question, coloured branches of ideas',code:mindCode()},
  {id:'swot',tint:'#eef6e2',name:'SWOT analysis',desc:'Strengths, weaknesses, opportunities, threats',code:swotCode()},
  {id:'sprint',tint:'#e3f0fb',name:'Sprint plan',desc:'A feature, stories and a task as tickets',code:sprintCode()});
const TPL_META={
  inspect:{cat:'Architecture',next:'Add monitoring, secrets and a test environment, and explain the design in a doc'},
  webapp:{cat:'Architecture',next:'Add a staging slot, a CDN for images and alerts, and list the costs in a table'},
  events:{cat:'Architecture',theme:'blueprint',next:'Add a dead-letter queue and retries, and write tickets for the work'},
  pp:{cat:'Architecture',theme:'midnight',next:'Plan this out with a spec doc, the Dataverse tables and tickets for the work'},
  data:{cat:'Architecture',next:'Add data quality checks and a semantic model, and compare Fabric and Synapse in a table'},
  layers:{cat:'Architecture',next:'Turn these boxes into Azure services with icons, and connect how the data flows'},
  flow:{cat:'Diagrams',theme:'sketch',next:'Add a step for receipts over 2,000 EUR that need a second approver'},
  mind:{cat:'Diagrams',next:'Add two more ideas to each branch and a fourth branch for sales'},
  journey:{cat:'Workshops',next:'Fill this journey for a customer renting a city bike, and turn the best ideas into tickets'},
  retro:{cat:'Workshops',theme:'pastel',next:'Group these notes by theme and turn the action items into tickets'},
  ssc:{cat:'Workshops',theme:'pastel',next:'Summarise what the team agreed in a doc'},
  brainstorm:{cat:'Workshops',theme:'sketch',next:'Add six more ideas and group all of them by theme'},
  swot:{cat:'Workshops',next:'Fill this SWOT for a small online bike shop'},
  kanban:{cat:'Planning',theme:'pastel',next:'Turn the to-do notes into user stories with acceptance criteria'},
  sprint:{cat:'Planning',next:'Add acceptance criteria, estimates and two more stories for the feature'},
  blank:{cat:'Basics'}
};
for(const t of TEMPLATES){ const x=TPL_META[t.id]||{cat:'Basics'}; t.cat=x.cat; if(x.next) t.next=x.next;
  if(x.theme&&!/%% @theme/.test(t.code)) t.code=t.code.replace(/\s*$/,'\n')+(/%% layout:/.test(t.code)?'':'\n%% layout: canvas positions and drawings kept by the visual editor\n')+'%% @theme '+x.theme+'\n'; }
const TPL_CATS=['Architecture','Diagrams','Workshops','Planning','Basics'];
