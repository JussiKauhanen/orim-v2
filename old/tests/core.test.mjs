// Round-trip tests for the Mermaid parser and serializer.
//   node tests/core.test.mjs
// The core files are plain browser scripts, so they are loaded into one shared VM context.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
for (const f of ['js/core/mockups.js', 'js/core/tickets.js', 'js/core/mermaid.js', 'js/core/geometry.js', 'js/core/templates.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);
// dagre for the auto layout tests; it is a browser bundle, so give it a window.
ctx.window = ctx; vm.runInContext(readFileSync(join(root, 'vendor/dagre/dagre.min.js'), 'utf8'), ctx, { filename: 'dagre.min.js' });
ctx.__src = '';
const roundTrip = (src) => {
  ctx.__src = src;
  return run(`(() => {
    const a = parseMermaid(__src); resolveGeometry(a.model, new Map());
    const s1 = serializeMermaid(a.model);
    const b = parseMermaid(s1); resolveGeometry(b.model, new Map());
    return { errors: a.errors.concat(b.errors), fatal: a.fatal, s1, s2: serializeMermaid(b.model), model: a.model };
  })()`);
};

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.message); process.exitCode = 1; } };

for (const t of run('TEMPLATES')) {
  test('template round-trips: ' + t.name, () => {
    const r = roundTrip(t.code);
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
    assert.equal(r.s1, r.s2);
  });
}

test('shapes, arrows, labels and styles', () => {
  const r = roundTrip(`graph TD
  A[Start] -- yes --> B(Round)
  B -.-> C{{Hex}}
  C ==>|thick| D[(DB)]
  D <--> E((Circle))
  E --o F[/Para/]
  F --x G[[Sub]]
  A & B --> H
  style A fill:#fff9b1,font-size:24px,font-weight:bold
`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.edges.length, 8);
  assert.match(r.s1, /font-size:24px/);
});

test('canvas data: stickies, drawings, free arrows, routes, images', () => {
  const r = roundTrip(`flowchart LR
  n1["Ship it"]:::sticky
  a --> b
  linkStyle 0 stroke-width:5px,stroke:#f24726
%% @route 0 elbow
%% @arrow a1 straight 0 0 100 40 2 #1a1a1a to=a
%% @ink k1 pen #1a1a1a 2.5 10,10 5,5 3,-2
%% @image img1 10 20 300 200
`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.nodes.get('n1').shape, 'sticky');
  assert.equal(r.model.edges[0].route, 'elbow');
  assert.equal(r.model.edges[0].width, 5);
  assert.equal(r.model.arrows[0].to, 'a');
  assert.equal(r.model.inks.length, 1);
  assert.equal(r.model.images.length, 1);
});

test('comments: threads on shapes and on the board', () => {
  const r = roundTrip(`flowchart LR
  a --> b
%% @comment cm1 12 -8 on=a [{"a":"Anna","t":"Why \\"this\\"?\\nTwo lines","d":1700000000000},{"t":"Because","d":1700000060000}]
%% @comment cm2 300 40 done [{"t":"Fixed","d":1700000000000}]
`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.threads.length, 2);
  assert.equal(r.model.threads[0].on, 'a');
  assert.equal(r.model.threads[0].msgs.length, 2);
  assert.equal(r.model.threads[0].msgs[0].a, 'Anna');
  assert.equal(r.model.threads[0].msgs[1].a, undefined);
  assert.ok(r.model.threads[0].msgs[0].t.includes('\n'));
  assert.equal(r.model.threads[1].done, true);
});

test('free arrows can end on a frame', () => {
  const r = roundTrip(`flowchart LR
  subgraph g [Frame]
  end
  a --> g
%% @pos g 300 0 280 180
%% @arrow a1 straight 0 0 100 40 2 #1a1a1a to=g
`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.arrows[0].to, 'g');
  assert.ok(r.s2.includes('to=g'));
});

test('connector sides are kept', () => {
  const r = roundTrip(`flowchart LR
  a --> b
  b --> c
%% @route 0 curved r t
%% @route 1 elbow - l
`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.edges[0].sa, 'r'); assert.equal(r.model.edges[0].sb, 't'); assert.equal(r.model.edges[0].route, 'curved');
  assert.equal(r.model.edges[1].sa, undefined); assert.equal(r.model.edges[1].sb, 'l'); assert.equal(r.model.edges[1].route, 'elbow');
});

test('board connector style from Mermaid curve config', () => {
  const r = roundTrip(`---
config:
  flowchart:
    curve: step
---
flowchart LR
  a --> b
  b --> c
%% @route 1 curved
`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.curve, 'elbow');
  assert.equal(r.model.edges[0].route, undefined);
  assert.equal(r.model.edges[1].route, 'curved');
  assert.ok(r.s2.includes('%% @route 1 curved'));
});

test('tables, documents and row connectors', () => {
  const r = roundTrip(`flowchart LR
  cmp["Crystallize vs Optimizely"]:::table
  notes["Summary"]:::doc
  api[Orders API]
  api --> cmp
  cmp --> notes
%% @table cmp {"rows":[["","Crystallize","Optimizely"],["Pricing","Usage","Seats"],["PIM","Built in","Add-on"]],"colors":{"2,1":"g","2,2":"r"}}
%% @doc notes {"blocks":[{"t":"h2","r":[{"x":"Why"}]},{"t":"ul","r":[{"x":"Fast "},{"x":"API","b":1}]}]}
%% @route 0 curved - l rb=2
%% @route 1 curved r - ra=1`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  const m = r.model, t = m.nodes.get('cmp'), d = m.nodes.get('notes');
  assert.equal(t.shape, 'table'); assert.equal(t.table.rows[2][2], 'Add-on'); assert.equal(t.table.colors['2,1'], 'g');
  assert.equal(d.shape, 'doc'); assert.equal(d.doc.blocks[1].r[1].b, 1);
  assert.equal(m.edges[0].rb, 2); assert.equal(m.edges[0].sb, 'l'); assert.equal(m.edges[1].ra, 1);
  assert.ok(t.w > 200 && t.h > 90, 'table is sized from its cells');
  assert.match(r.s1, /classDef table /);
  ctx.__md = '# Title\n- one **two**\n1. first\nplain *it*';
  const doc = run('mdToDoc(__md)');
  assert.equal(doc.blocks.map(b => b.t).join(','), 'h1,ul,ol,p');
  assert.equal(run('docToMd(mdToDoc(__md))'), '# Title\n- one **two**\n1. first\nplain *it*');
});

test('mockup screens: device frames and wireframe pieces', () => {
  ctx.__m = run('(() => { const m = newModel(); addScreen(m, { dev: "mobile", preset: "login", x: 0, y: 0 }); addScreen(m, { dev: "desktop", preset: "main", x: 400, y: 0 }); return serializeMermaid(m); })()');
  const r = roundTrip(run('__m'));
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  const m = r.model, login = m.groups.get('login'), main = m.groups.get('mainPage');
  assert.equal(login.dev, 'mobile'); assert.equal(main.dev, 'desktop');
  const btn = [...m.nodes.values()].find(n => n.group === 'login' && n.shape === 'uiButton');
  assert.ok(btn && btn.label === 'Sign in' && btn.w > 100 && btn.w < 140, 'button at half size');
  assert.ok([...m.nodes.values()].some(n => n.group === 'mainPage' && n.shape === 'uiSidebar'));
  assert.match(r.s1, /%% @device login mobile/); assert.match(r.s1, /classDef uiButton /);
  // Auto layout moves screens as a whole and keeps their pieces in place.
  ctx.__src = r.s1;
  const kept = run(`(() => { const a = parseMermaid(__src).model; resolveGeometry(a, new Map()); const b = a.nodes.get('${btn.id}'); const p = a.pos.get('login'); const before = [b.x - p.x, b.y - p.y];
    autoLayout(a); const q = a.pos.get('login'); const bx = groupBoxes(a).get('login'); return JSON.stringify([before, [b.x - q.x, b.y - q.y], bx.w, bx.h]); })()`);
  const [before, after, w, h] = JSON.parse(kept);
  assert.deepEqual(after, before); assert.equal(w, 150); assert.equal(h, 310);
});

test('tickets: type, fields, links and the Azure DevOps CSV', () => {
  const r = roundTrip(`flowchart LR
  epic["Online store"]:::doc
  story["Sign in with Entra ID"]:::doc
  task["Add MSAL to the web app"]:::doc
  epic --> story
  story --> task
%% @doc epic {"kind":"epic","fields":{"priority":"1"},"blocks":[{"t":"p","r":[{"x":"Sell online"}]}]}
%% @doc story {"kind":"story","fields":{"points":3,"priority":2,"tags":"auth; web","bogus":1},"blocks":[{"t":"h2","r":[{"x":"Description"}]},{"t":"p","r":[{"x":"As a shopper, see "},{"x":"the spec","u":"https://example.com/spec"}]},{"t":"h2","r":[{"x":"Acceptance criteria"}]},{"t":"ul","r":[{"x":"Work account sign-in"}]}]}
%% @doc task {"kind":"task","fields":{"remaining":4,"activity":"Development"},"blocks":[{"t":"p","r":[{"x":"Wire up MSAL"}]}]}`);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  const st = r.model.nodes.get('story').doc;
  assert.equal(st.kind, 'story'); assert.equal(st.fields.points, 3); assert.equal(st.fields.priority, '2'); assert.equal(st.fields.bogus, undefined);
  assert.equal(st.blocks[1].r[1].u, 'https://example.com/spec');
  ctx.__md = 'See [docs](https://learn.microsoft.com) and https://example.com/a.';
  assert.equal(run('JSON.stringify(mdToDoc(__md).blocks[0].r.map(x=>x.u||null))'), '[null,"https://learn.microsoft.com",null,"https://example.com/a",null]');
  assert.equal(run('docToMd(mdToDoc(__md))'), __mdEq());
  function __mdEq() { return 'See [docs](https://learn.microsoft.com) and https://example.com/a.'; }
  ctx.__src = r.s1;
  const csv = run('(() => { const m = parseMermaid(__src).model; return ticketsCsv(m); })()');
  const lines = csv.trim().split('\r\n');
  assert.match(lines[0], /^ID,Work Item Type,Title 1,Title 2,Title 3,Description,Acceptance Criteria/);
  assert.match(lines[1], /^,Epic,Online store,,,/);
  assert.match(lines[2], /^,User Story,,Sign in with Entra ID,,/);
  assert.match(lines[2], /<a href=""https:\/\/example.com\/spec"">the spec<\/a>/);
  assert.match(lines[2], /<li>Work account sign-in<\/li>/);
  assert.match(lines[3], /^,Task,,,Add MSAL to the web app,/);
  assert.match(lines[3], /,4,Development,/);
  assert.equal(run('ticketLine(parseMermaid(__src).model.nodes.get("story"))'), '3 pts · P2 · auth, web');
});

test('pictures: faded flag, and kept clear of new blocks', () => {
  const r = roundTrip('flowchart LR\n  a["Note"]:::sticky\n%% @pos a 40 40\n%% @image img1 0 0 300 200 faded\n');
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.images[0].faded, true);
  assert.match(r.s1, /@image img1 0 0 300 200 faded/);
  const moved = run(`(() => { const m = parseMermaid(__src).model; resolveGeometry(m, new Map()); const n = m.nodes.get('a');
    const kept = separateBlocks(m, new Set(['a'])); const before = n.x + ',' + n.y;
    separateBlocks(m, new Set(['a']), null, true); const im = m.images[0];
    return { kept, clear: n.x >= im.x + im.w || n.y >= im.y + im.h || n.x + n.w <= im.x || n.y + n.h <= im.y, before }; })()`);
  assert.equal(moved.kept, 0);
  assert.ok(moved.clear);
});

test('board files: the mermaid block is replaced, notes around it are kept', () => {
  vm.runInContext(readFileSync(join(root, 'js/folder.js'), 'utf8'), ctx, { filename: 'js/folder.js' });
  ctx.__md = '# Plan\n\nNotes above.\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nNotes below.\n';
  assert.equal(run('Folder.codeOf(__md)'), 'flowchart LR\nA --> B\n');
  const out = run('Folder.fileText(__md, "Plan", "flowchart LR\\nA --> C\\n")');
  assert.match(out, /^# Plan\n\nNotes above\.\n\n```mermaid\nflowchart LR\nA --> C\n```\n\nNotes below\.\n$/);
  assert.equal(run('Folder.fileText(null, "New board", "flowchart LR\\n")'), '# New board\n\n```mermaid\nflowchart LR\n```\n');
  assert.equal(run('Folder.supported'), false);
});

test('extra shapes, fonts and board themes stay plain Mermaid', () => {
  const r = roundTrip('flowchart LR\n  a("Big idea"):::cloud\n  b["Risk"]:::tri\n  c["Note"]:::sticky\n  a --> b\n  style c font-family:Caveat\n  style b font-family:monospace\n%% @theme midnight\n');
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.nodes.get('a').shape, 'cloud');
  assert.equal(r.model.nodes.get('b').shape, 'tri');
  assert.match(r.s1, /a\("?Big idea"?\):::cloud/);
  assert.match(r.s1, /b\["?Risk"?\]:::tri/);
  assert.match(r.s1, /style c font-family:Caveat/);
  assert.match(r.s1, /style b font-family:monospace/);
  assert.match(r.s1, /%% @theme midnight/);
  assert.equal(r.model.theme, 'midnight');
  // Mermaid 11 shape names read as the same shapes.
  const v = roundTrip('flowchart LR\n  x@{ shape: cloud, label: "Sky" }\n  y@{ shape: doc, label: "Spec" }\n');
  assert.equal(v.model.nodes.get('x').shape, 'cloud');
  assert.equal(v.model.nodes.get('y').shape, 'paper');
});

test('docs: checklists, code, quotes and dividers in Markdown and back', () => {
  ctx.__md = '# Plan\n- [x] Tests written\n- [ ] Ship it\n> Keep it simple\n---\n```json\n{\n  "a": 1\n}\n```\nDone';
  const d = run('mdToDoc(__md)');
  assert.deepEqual(Array.from(d.blocks, (b) => b.t).join(','), 'h1,todo,todo,quote,hr,code,p');
  assert.equal(d.blocks[1].c, 1);
  assert.equal(d.blocks[2].c, undefined);
  assert.equal(d.blocks[5].lang, 'json');
  assert.equal(d.blocks[5].r[0].x, '{\n  "a": 1\n}');
  assert.equal(run('docToMd(mdToDoc(__md))'), ctx.__md);
  assert.match(run('blocksHtml(mdToDoc(__md).blocks)'), /<li>☑ Tests written<\/li>.*<blockquote>.*<hr><pre><code>/s);
});

test('cells pasted from Excel or CSV become table rows', () => {
  ctx.__t = 'Name\tPrice\nWidget\t10\nGadget\t25\n';
  assert.equal(JSON.stringify(run('parseGrid(__t)')), JSON.stringify([['Name', 'Price'], ['Widget', '10'], ['Gadget', '25']]));
  ctx.__t = 'a;b;c\n1;"two; three";3';
  assert.equal(JSON.stringify(run('parseGrid(__t)')), JSON.stringify([['a', 'b', 'c'], ['1', 'two; three', '3']]));
  ctx.__t = 'Browser -> API\nAPI -> Database';
  assert.equal(run('parseGrid(__t)'), null);
});

test('text direction and marked mockup items', () => {
  const r = roundTrip('flowchart LR\n  subgraph lay [Service layer]\n    a[Side note]\n  end\n%% @pos a 40 40 60 200\n%% @rot a 270\n%% @rot lay 90\n');
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.s1, r.s2);
  assert.equal(r.model.nodes.get('a').rot, 270);
  assert.equal(r.model.groups.get('lay').rot, 90);
  assert.equal(run('uiMark("+Industry").m.k'), 'new');
  assert.equal(run('uiMark("~Owner").m.k'), 'chg');
  assert.equal(run('uiMark("-City").m.k'), 'del');
  assert.equal(run('uiMark("-5% off").m'), null);
  assert.equal(run('uiMark("+Industry").t'), 'Industry');
});

test('reports errors with line numbers', () => {
  const r = roundTrip('flowchart LR\n  A -->\n  subgraph x [X]\n    B\n');
  assert.ok(r.errors.some((e) => e.line === 1));
  assert.ok(r.errors.some((e) => /end/.test(e.msg)));
});

test('rejects non-flowchart diagrams clearly', () => {
  const r = roundTrip('sequenceDiagram\n  A->>B: hi\n');
  assert.ok(r.fatal);
});

console.log('\n' + passed + ' passed');
