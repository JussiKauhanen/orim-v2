/* orim · ai-guide.js
 * "Ask an AI": a prompt that teaches any chat assistant the orim board format,
 * plus a box to paste its answer back onto the board.
 * The same guide downloads as a Markdown skill file (orim-board.md).
 */
'use strict';
// Azure icons most architecture boards use. The prompt lists only these; the skill file lists all.
const AI_COMMON_AZURE='users entra-id managed-identities app-registrations key-vaults conditional-access microsoft-defender-for-cloud azure-sentinel '+
  'app-services app-service-plans function-apps static-apps container-apps-environments kubernetes-services container-registries container-instances virtual-machine vm-scale-sets azure-virtual-desktop '+
  'api-management-services logic-apps azure-service-bus event-grid-topics event-hubs azure-data-factory data-factories app-configuration signalr notification-hubs '+
  'sql-database azure-sql sql-managed-instance azure-cosmos-db azure-database-postgresql-server azure-database-mysql-server cache-redis azure-managed-redis storage-accounts blob-block storage-queue azure-fileshares data-lake-storage-gen1 '+
  'azure-synapse-analytics azure-databricks azure-data-explorer-clusters stream-analytics-jobs power-bi-embedded '+
  'azure-openai ai-foundry cognitive-search cognitive-services bot-services azure-machine-learning speech-services form-recognizers '+
  'virtual-networks subnet network-security-groups application-gateways front-door-and-cdn-profiles load-balancers azure-firewall-manager firewalls private-endpoints private-link bastions dns-zones expressroute-circuits virtual-network-gateways on-premises-data-gateways traffic-manager-profiles public-ip-addresses '+
  'monitor application-insights log-analytics-workspaces alerts azure-devops policy recovery-services-vaults backup-vault resource-groups subscriptions management-groups iot-hub digital-twins azure-maps-accounts browser mobile globe-success';
function aiIconList(full){
  if(!Icons.ready||!Icons.packs.length) return 'Icon list not loaded: use plain nodes.\n';
  let s='';
  for(const p of Icons.packs){
    if(p.id==='azure'){
      if(full){
        const by=new Map(); for(const ic of p.icons){ const c=ic.cat||'Other'; if(!by.has(c)) by.set(c,[]); by.get(c).push(ic.id); }
        s+='\nazure:\n'; for(const [c,ids] of [...by].sort((a,b)=>a[0].localeCompare(b[0]))) s+='- '+c+': '+ids.join(' ')+'\n';
      } else {
        const have=new Set(p.icons.map(ic=>ic.id));
        s+='azure: '+AI_COMMON_AZURE.split(' ').filter(id=>have.has(id)).join(' ')+'\n';
        s+='Other Azure icons use the kebab-case name of the Azure Architecture Icon (e.g. azure:event-hub-clusters). Unknown ids show as an empty box.\n';
      }
    } else s+=p.id+': '+p.icons.map(ic=>ic.id).join(' ')+'\n';
  }
  return s;
}
function aiGuideBody(full){
  return `# orim board format

orim draws a Mermaid flowchart as a whiteboard. Reply with the complete board in one \`\`\`mermaid block (no fragments or diffs), then at most a short note. Change only what was asked; keep the title, ids, styles and every %% line of the rest. Flowcharts only.

## Syntax

\`\`\`
---
title: Board title
---
flowchart LR
  user@{ icon: "azure:users", label: "Customer" }
  subgraph rg [Resource group]
    api@{ icon: "azure:function-apps", label: "Orders API" }
    db[(Orders DB)]
  end
  note["Check retention"]:::sticky
  user --> api
  api -->|writes| db
  style note fill:#ffcee0
\`\`\`

- Shapes: \`id[Rect]\` \`id(Rounded)\` \`id([Pill])\` \`id[(Database)]\` \`id((Circle))\` \`id{Decision}\` \`id{{Hex}}\` \`id[/Lean/]\` \`id[[Subroutine]]\` \`id["Note"]:::sticky\` \`id@{ shape: text, label: "Plain text" }\` \`id@{ icon: "pack:id", label: "Name" }\`
- Edges: \`-->\` arrow, \`---\` line, \`-.->\` dotted, \`==>\` thick, \`<-->\` both ways, \`--o\` \`--x\` circle or cross end, \`-->|label|\`. Chains \`a --> b --> c\` and \`a & b --> c\` work. Frames connect by id.
- Style: \`style id fill:#hex,stroke:#hex,color:#hex,font-size:18px,font-weight:bold,font-style:italic,background:#hex\`; \`linkStyle 0 stroke:#hex,stroke-width:3px\`.
- Connector style for the whole board is Mermaid's front matter setting \`config: flowchart: curve:\` with \`basis\` (curved), \`linear\` (straight) or \`step\` (elbow). Keep it if present.
- Direction: LR, RL, TB or BT. Ids: camelCase letters and digits, unique, not a keyword (end, graph, subgraph, style, class, direction). Declare a node once with its label, then use its id.
- Labels: \`<br>\` for a line break, \`#quot;\` for a quote; quote labels with brackets: \`id["Cache (Redis)"]\`.
- A node belongs to the frame (subgraph) it is declared in. Frames can nest.
- linkStyle numbers edges from 0 in order; renumber if you add or remove edges above it.
- More shapes: the nearest classic shape plus a class: \`id("Idea"):::cloud\`, \`id("Comment"):::bubble\`, \`id[Risk]:::tri\`, \`id[Win]:::star\`, \`id[Next]:::arrow\`, \`id[Step]:::chevron\`, \`id[Spec]:::paper\` (document).
- Fonts: \`style id font-family:Caveat\` (handwritten), Bangers (marker), Fredoka (rounded), Georgia (serif) or monospace.
- Text direction: \`%% @rot id 270\` (or 90, 180) turns a shape's text or a frame's title.
- Mockup changes: start a UI piece's text or one of its items with + (new), ~ (changed) or - (removed), e.g. a uiTable label "Name\\nCity\\n+Industry".
- Board style: one line \`%% @theme midnight\` (or pastel, blueprint, sketch) recolours the whole board in orim.
- Sticky colors: ${STICKY_COLORS.slice(0,10).join(' ')}. Keep any \`classDef sticky\`, \`classDef table\` and \`classDef doc\` line.
- Table (for comparisons): \`cmp["Crystallize vs Optimizely"]:::table\` plus \`%% @table cmp {"rows":[["","Crystallize","Optimizely"],["Pricing","Usage based","Per seat"]],"colors":{"1,1":"g"}}\`. Row 0 is the header, column 0 the row names; colors "row,col" are g (good), a (partly), r (weak).
- UI mockup screen: a frame with \`%% @device <id> mobile|tablet|desktop\` and \`%% @pos <id> x y w h\` (phone 300x620, iPad 560x760, desktop 960x600), holding grey wireframe pieces such as \`loginBtn["Sign in"]:::uiButton\`, each with \`%% @pos id x y w h\` in board coordinates. Pieces: uiHeading, uiText, uiButton, uiInput (label = placeholder), uiImage, uiTopbar (label = title), uiTabbar, uiSidebar and uiTable (menu items or table columns separated by \`<br>\`). A \`style id fill:#hex\` line gives a piece an accent colour. Keep pieces inside their device.
- Document card: \`notes["Summary"]:::doc\` plus \`%% @doc notes {"blocks":[{"t":"h2","r":[{"x":"Heading"}]},{"t":"ul","r":[{"x":"Point "},{"x":"bold","b":1}]}]}\`. Block types h1 h2 h3 p ul ol, todo (checklist item, c:1 when ticked), quote, hr (divider) and code ({"t":"code","lang":"json","r":[{"x":"one run with the code, \\n between lines"}]}); runs have x (text), b (bold), i (italic), u (a link URL).
- Ticket (work item): a document with \`"kind"\` epic, feature, story, bug or task and \`"fields"\` such as \`{"points":3,"priority":"2","tags":"web; auth"}\` (bug: severity "2 - High"; task: remaining, activity). Stories have a Description ("As a …, I want …, so that …") and an Acceptance criteria list; bugs have Repro steps, Expected result and Actual result. Connect parents to children (epic, feature, story or bug, task).

## %% lines (canvas data, after the code)

- \`%% @pos id x y [w h]\` is where the user placed a node or frame. Keep it for every item you keep; rename or delete it with the item. New nodes need none: orim places them next to what they connect to. If you rebuild most of the board, delete all @pos and @route lines and orim lays it out again.
- \`%% @route i kind [from to] [ra=N] [rb=N]\` pins edge number i to sides of its shapes (t r b l, - for automatic); ra and rb attach its start or end to row N of a table. To link a shape to a table row, add the edge and a route line such as \`%% @route 3 curved - - rb=2\`. Renumber route lines if you add or remove edges before them.
- Copy \`%% @theme\`, \`%% @rot\`, \`%% @route\`, \`@table\`, \`@doc\`, \`@device\`, \`@arrow\`, \`@ink\`, \`@image\` and \`@comment\` lines unchanged unless the task is about them. \`@comment\` lines are the user's review comments; read them, they may say what to change.

## Icons

Write \`pack:id\`. If nothing fits, use a plain node.
${aiIconList(full)}`;
}
function aiSkillFile(){
  return '---\nname: orim-board\ndescription: Read, create and edit orim boards: Mermaid flowcharts with Azure, Power Platform and Dynamics 365 icons, sticky notes and saved positions in %% @pos lines. Use when asked for an orim board or given Mermaid code with %% @pos lines.\n---\n\n'+aiGuideBody(true);
}
function aiPrompt(task){
  const code=(state.code||'flowchart LR\n').replace(/\s+$/,'');
  const t=String(task||'').trim();
  return 'I am working on a diagram in orim. Read the format guide, then '+(t?'do the task at the end and reply with the complete updated board.':'reply only "Ready" and wait for my request. When I ask for changes, reply with the complete updated board.')+'\n\n'+
    aiGuideBody(false)+
    '\n## Current board\n\n```mermaid\n'+code+'\n```\n'+
    (t?'\n## Task\n\n'+t+'\n':'');
}
function aiSave(filename,data){
  if(!window.claude){
    try{ const u=URL.createObjectURL(new Blob([data],{type:'text/markdown'})); const a=document.createElement('a'); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); toast('Saved '+filename); return; }catch(_){}
  }
  getDownloads().then(dl=>{
    if(!dl){ copyText(data,'Guide copied. Paste it into a file named '+filename); return; }
    dl.save({filename,data}).then(()=>toast('Saved '+filename),err=>{ const c=err&&err.code; if(c!=='declined') copyText(data,'Guide copied. Paste it into a file named '+filename); });
  });
}
function hasFlowchart(text){ const f=/```mermaid\s*\n([\s\S]*?)```/.exec(text); return /(^|\n)\s*(flowchart|graph)\b/.test(f?f[1]:text); }
function openAskAI(){
  flushEditorHist();
  openModal('Ask an AI',
    '<p>Copy the prompt into any AI chat, such as ChatGPT, Claude or Copilot. It explains how orim boards work and includes this board, so the answer can be pasted straight back here.</p>'+
    '<label class="qr-lbl" for="aiTask">What should the AI do? (optional)</label>'+
    '<textarea id="aiTask" class="ai-task" placeholder="Add a cache between the API and the database, and group the data services in a frame"></textarea>'+
    '<div class="ai-row"><button type="button" class="btn primary" id="aiCopy">Copy prompt</button><span class="ai-size" id="aiSize"></span></div>'+
    '<label class="qr-lbl" for="aiAnswer">Paste the answer</label>'+
    '<textarea id="aiAnswer" class="ai-answer" placeholder="Paste the whole reply. orim takes the Mermaid code block from it."></textarea>'+
    '<div class="ai-row"><button type="button" class="btn" id="aiApply">Replace board with answer</button><span class="ai-size">Undo with Ctrl+Z</span></div>',
    [{label:'Download guide (.md)',run:()=>aiSave('orim-board.md',aiSkillFile())}]);
  const task=$('#aiTask'), size=$('#aiSize');
  const upd=()=>{ size.textContent=Math.round(aiPrompt(task.value).length/100)/10+'k characters'; };
  task.addEventListener('input',upd); upd();
  $('#aiCopy').addEventListener('click',()=>copyText(aiPrompt(task.value),'Prompt copied. Paste it into your AI chat'));
  $('#aiApply').addEventListener('click',()=>{
    const t=$('#aiAnswer').value;
    if(!hasFlowchart(t)){ toast('No Mermaid flowchart found in the answer'); return; }
    closeModal(); importText(t,'the AI answer');
  });
  for(const el of [task,$('#aiAnswer')]) el.addEventListener('keydown',e=>e.stopPropagation());
  setTimeout(()=>task.focus(),30);
}
