// Builds library/templates/*.json — hand-made replications of the reference images in samples/.
// Coordinates are in the working size the agents use (see vision.modelSize). Run: node tools/make-templates.mjs
import { writeFileSync, readFileSync } from 'node:fs';

let n = 0;
const id = p => p + (++n).toString(36);
const S = (kind, x, y, w, h, o = {}) => ({ id: o.id || id('e'), kind, x, y, w, h, ...(o.rot ? { rot: o.rot } : {}), params: o.params || {}, style: o.style || {}, text: o.text || {}, ...(o.props ? { props: o.props } : {}) });
const T = (content, x, y, w, h, t = {}, o = {}) => S('text', x, y, w, h, { ...o, text: { content, align: 'left', valign: 'middle', ...t } });
const C = (from, to, o = {}) => ({ id: o.id || id('c'), kind: 'connector', from, to, route: o.route || 'straight', start: o.start || 'none', end: o.end ?? 'arrow', style: { stroke: '#1f2328', strokeWidth: 2, ...(o.style || {}) }, ...(o.points ? { points: o.points.map(([x, y]) => ({ x, y })) } : {}), ...(o.bend != null ? { bend: o.bend } : {}), ...(o.radius != null ? { radius: o.radius } : {}), ...(o.capSize ? { capSize: o.capSize } : {}), ...(o.text ? { text: o.text } : {}), ...(o.labelPos != null ? { labelPos: o.labelPos } : {}) });
const at = (el, ax, ay) => ({ id: el.id, ax, ay });
const pt = (x, y) => ({ x, y });
const doc = (name, w, h, background, pattern, elements) => ({ id: 'tpl', name, page: { w, h, background, pattern }, elements });
const templates = [];
const add = (tid, name, description, tags, source, d) => templates.push({ id: tid, name, description, tags, source, doc: d });

// ---------------------------------------------------------------- 1 · launch mind map (dark)
{
  const els = [];
  const root = S('rect', 61, 379, 256, 112, { params: { radius: 13 }, style: { fill: '#ffffff', stroke: '#c9cbe0', strokeWidth: 1.5 }, text: { content: 'Plan the launch', font: 'DM Sans', size: 24.5, weight: 600, color: '#2d2f4e' } });
  const cats = [
    ['Product', 114, '#6bc7b9', '#6bc7b9', ['Pick the launch features', 'Beta with ten customers', 'Pricing page'], [30.5, 128, 225.5]],
    ['Marketing', 462, '#f6c97f', '#f6c97f', ['Launch post and video', 'Partner newsletter', 'Webinar for admins'], [378.5, 476, 573.5]],
    ['Support', 811, '#f2805f', '#f2805f', ['Help centre articles', 'Chat agent in Copilot Studio', 'Onboarding checklist'], [727, 824.5, 922]],
  ];
  const lines = [], boxes = [];
  const lineStyle = { stroke: '#b9bbd6', strokeWidth: 1.2 };
  for (const [label, y, fill, leafStroke, leaves, ly] of cats) {
    const cat = S('rect', 456, y, 233, 112, { params: { radius: 13 }, style: { fill, stroke: '#c9cbe0', strokeWidth: 1.2 }, text: { content: label, font: 'DM Sans', size: 18, weight: 600, color: '#2d2f4e' } });
    boxes.push(cat);
    leaves.forEach((t, i) => {
      const leaf = S('rect', 805, ly[i], 279, 65, { params: { radius: 12.5 }, style: { fill: '#2d2f4e', stroke: leafStroke, strokeWidth: 1.3 }, text: { content: t, font: 'DM Sans', size: 14.8, weight: 500, color: '#ffffff' } });
      boxes.push(leaf);
      lines.push(C(at(cat, 1, 0.5), at(leaf, 0, 0.5), { route: 'curved', end: 'none', bend: 0.55, style: lineStyle }));
    });
    const [ax, ay, bx, by] = label === 'Product' ? [0.5, 0, 0.5, 1] : label === 'Marketing' ? [1, 0.5, 0, 0.5] : [0.5, 1, 0.5, 0];
    lines.push(C(at(root, ax, ay), at(cat, bx, by), { route: 'curved', end: 'none', bend: label === 'Marketing' ? 0.5 : 0.42, style: lineStyle }));
  }
  els.push(...lines, root, ...boxes);
  add('mindmap-dark', 'Launch mind map', 'Dark mind map with coloured branches and curved links', ['mindmap', 'dark', 'plan'], 'samples/1.png',
    doc('Plan the launch', 1132, 1016, '#2d2f4e', { type: 'dots', color: '#3a3c5a', gap: 21.2, size: 1.1, offsetX: 4, offsetY: 4 }, els));
}

// ---------------------------------------------------------------- 10 · swimlane flowchart
{
  const lanes = [[35, '#e0fffd', '#92e7e1'], [102, '#ffe9e4', '#ffa078'], [169, '#fffad9', '#ffeb95'], [236, '#e3f4ff', '#a6d2ff']];
  const els = lanes.map(([y, fill, head]) => S('lane', 28, y, 483, y === 236 ? 68 : 67, { params: { header: 33, radius: 0 }, style: { fill, fill2: head, stroke: 'none', strokeWidth: 0 } }));
  const line = { stroke: '#686583', strokeWidth: 1 };
  const box = (x, y, fill, stroke, kind = 'rect') => S(kind, x, y, 45, 22, { params: kind === 'rect' ? { radius: 1 } : {}, style: { fill, stroke, strokeWidth: 1 } });
  const start = box(95, 58, '#92e7e1', '#4cd7cd', 'pill');
  const a = box(95, 125, '#ffa078', '#f2855d');
  const b = box(192, 58, '#92e7e1', '#4cd7cd');
  const c = box(192, 193, '#ffeb95', '#f6d94c');
  const dia = S('diamond', 293, 120, 46, 32, { style: { fill: '#ffa078', stroke: '#f2855d', strokeWidth: 1 } });
  const d = box(351, 193, '#ffeb95', '#f6d94c');
  const e = box(351, 259, '#a6d2ff', '#7fb6ef');
  const end = box(434, 259, '#a6d2ff', '#7fb6ef', 'pill');
  const note = S('note', 389, 94, 48, 48, { params: { fold: 0, radius: 1 }, style: { fill: '#ffe263', stroke: 'none', strokeWidth: 0, shadow: '1 2 3 rgba(0,0,0,0.18)' } });
  const cs = [
    C(at(start, 0.5, 1), at(a, 0.5, 0), { style: line, capSize: 0.6 }),
    C(at(a, 1, 0.5), at(b, 0, 0.5), { route: 'elbow', radius: 0, style: line, capSize: 0.6 }),
    C(at(b, 0.5, 1), at(c, 0.5, 0), { style: line, capSize: 0.6 }),
    C(at(c, 1, 0.5), at(dia, 0, 0.5), { route: 'elbow', radius: 0, style: line, capSize: 0.6 }),
    C(at(dia, 0.5, 0), at(b, 1, 0.5), { route: 'elbow', radius: 0, style: line, capSize: 0.6 }),
    C(at(dia, 0.5, 1), at(d, 0, 0.5), { route: 'elbow', radius: 0, style: line, capSize: 0.6 }),
    C(at(d, 0.5, 1), at(e, 0.5, 0), { style: line, capSize: 0.6 }),
    C(at(e, 1, 0.5), at(end, 0, 0.5), { style: line, capSize: 0.6 }),
    C(at(note, 0, 0.62), pt(345, 132), { route: 'curved', end: 'open', bend: 0.3, style: { stroke: '#686583', strokeWidth: 1.6 }, capSize: 0.7 }),
  ];
  const tags = [S('rect', 280, 65, 11, 7, { style: { fill: '#686583', stroke: 'none' } }), S('rect', 311, 180, 11, 7, { style: { fill: '#686583', stroke: 'none' } })];
  add('swimlane-flow', 'Swimlane flowchart', 'Four colour lanes with steps, a decision and a sticky note', ['flowchart', 'swimlane', 'process'], 'samples/10.png',
    doc('Swimlane flowchart', 538, 339, '#000000', null, [...els, ...cs, start, a, b, c, dia, d, e, end, ...tags, note]));
}

// ---------------------------------------------------------------- 13 · bubble chart
{
  const teal = '#3acfce', pink = '#ec4165';
  const bub = [['JEANS', 344, 309, 61, pink], ['JACKETS', 191, 405, 88, teal], ['JEANS', 335, 426, 56, teal], ['TROUSERS', 440, 376, 56, pink], ['BAGS', 516, 418, 30, pink], ['WINTERWEAR', 628, 459, 88, pink],
    ['SHORTS', 153, 545, 56, teal], ['SHOES', 278, 537, 68, teal], ['SHIRTS', 451, 537, 104, teal], ['SKIRTS', 599, 600, 56, pink], ['SHIRTS', 526, 656, 35, pink], ['ACCESSORIES', 209, 679, 88, pink], ['SHOES', 406, 763, 125, pink]];
  const sizes = { JACKETS: 20, SHIRTS: 21, SHOES: 21, ACCESSORIES: 20, WINTERWEAR: 21, JEANS: 19, TROUSERS: 16, SHORTS: 17.5, SKIRTS: 19, BAGS: 9.5 };
  const els = bub.map(([t, cx, cy, r, fill]) => S('ellipse', cx - r, cy - r, r * 2, r * 2, { style: { fill, stroke: 'none', strokeWidth: 0 }, text: { content: t, font: 'Oswald', weight: 300, color: '#ffffff', size: r < 40 ? 9.5 : sizes[t] } }));
  els.unshift(T('Most searched **keywords**\non our fashion website.', 40, 58, 736, 130, { font: 'Montserrat', size: 48.5, weight: 300, color: '#ffffff', align: 'center', lineHeight: 1.18 }));
  els.push(S('rect', 232, 942, 352, 57, { style: { fill: 'none', stroke: '#ffffff', strokeWidth: 1.5, dash: 'dashed' } }));
  els.push(S('rect', 253, 963, 43, 19, { style: { fill: teal, stroke: 'none' } }), T('MEN', 309, 961, 60, 22, { font: 'Montserrat', size: 13, weight: 700, color: '#ffffff' }));
  els.push(S('rect', 446, 963, 42, 19, { style: { fill: pink, stroke: 'none' } }), T('WOMEN', 501, 961, 80, 22, { font: 'Montserrat', size: 13, weight: 700, color: '#ffffff' }));
  add('bubble-keywords', 'Bubble chart', 'Keyword bubbles sized by volume, two series and a legend', ['chart', 'bubble', 'infographic', 'dark'], 'samples/13.png',
    doc('Most searched keywords', 816, 1056, '#071c3b', null, els));
}

// ---------------------------------------------------------------- 9 · gantt rows
{
  const row = y => S('rect', 243, y, 830, 110, { params: { radius: 0 }, style: { fill: '#f8f8f8', stroke: '#111111', strokeWidth: 2.3 } });
  const bar = (x, y, w, fill) => S('rect', x, y, w, 41, { params: { radius: 15 }, style: { fill, stroke: '#111111', strokeWidth: 2.3 } });
  const els = [row(202), row(323), row(444), row(565),
    bar(250, 218, 194, '#d99bff'), bar(444, 252, 322, '#d99bff'),
    bar(411, 339, 192, '#fed500'), bar(624, 369, 321, '#fed500'),
    bar(523, 471, 153, '#ff7475'),
    bar(636, 580, 118, '#86b6fe'), bar(735, 621, 321, '#86b6fe')];
  add('gantt-rows', 'Timeline bars', 'Four swim rows with overlapping rounded bars on a dot grid', ['gantt', 'timeline', 'roadmap', 'plan'], 'samples/9.png',
    doc('Timeline', 1313, 876, '#fdfdfd', { type: 'dots', color: '#bbbbbb', gap: 48.6, size: 2.6, offsetX: 24.5, offsetY: 29 }, els));
}

// ---------------------------------------------------------------- 12 · sketchy decision flow
{
  const ink = '#4a5b71', sk = 0.9;
  const scrib = (x, y, w, h, color = ink, waves = 6, o = {}) => S('squiggle', x, y, w, h, { params: { waves: Math.max(2, Math.round(waves * 0.7)), amp: 0.42 }, style: { stroke: color, strokeWidth: 5.5, sketch: 0.7 }, ...o });
  const els = [
    S('pill', 291, 56, 130, 64, { style: { fill: '#f6dee0', stroke: 'none', strokeWidth: 0, sketch: sk } }), scrib(310, 78, 92, 18, '#e3ebe2', 5),
    S('pill', 194, 682, 186, 93, { style: { fill: '#e3ebe2', stroke: 'none', strokeWidth: 0, sketch: sk } }), scrib(220, 715, 135, 24, '#d6dcd6', 6),
    S('rect', 643, 784, 149, 109, { params: { radius: 3 }, style: { fill: '#dfe5f9', stroke: 'none', strokeWidth: 0, sketch: sk } }), scrib(660, 802, 100, 22, '#e3ebe2', 4), scrib(661, 840, 42, 16, '#e3ebe2', 2), scrib(712, 842, 62, 14, '#e3ebe2', 3),
    S('rect', 87, 359, 212, 156, { params: { radius: 4 }, style: { fill: '#5f7ce4', stroke: 'none', strokeWidth: 0, sketch: sk } }),
    scrib(110, 386, 143, 34, ink, 6), scrib(110, 446, 62, 25, ink, 3), scrib(190, 441, 88, 20, ink, 3),
    S('diamond', 390, 329, 234, 232, { style: { fill: '#f5da73', stroke: 'none', strokeWidth: 0, sketch: sk }, text: { content: '?', font: 'Patrick Hand', size: 74, weight: 400, color: ink } }),
    S('pill', 706, 250, 258, 130, { style: { fill: '#749c76', stroke: 'none', strokeWidth: 0, sketch: sk } }), scrib(738, 294, 182, 40, ink, 7),
    S('pill', 706, 497, 258, 126, { style: { fill: '#d15c62', stroke: 'none', strokeWidth: 0, sketch: sk } }), scrib(743, 534, 177, 41, ink, 7),
  ];
  const arrow = { stroke: '#f6567c', strokeWidth: 8.5, sketch: 0.7 };
  els.push(
    C(pt(188, 328), pt(432, 355), { route: 'spline', end: 'open', capSize: 0.75, style: arrow, points: [[214, 278], [268, 240], [330, 238], [352, 262], [338, 292], [318, 275], [336, 247], [372, 252], [406, 290]] }),
    C(pt(585, 377), pt(690, 266), { route: 'spline', end: 'open', capSize: 0.75, style: arrow, points: [[607, 307], [645, 272]] }),
    C(pt(430, 525), pt(696, 604), { route: 'spline', end: 'open', capSize: 0.75, style: arrow, points: [[446, 618], [530, 672], [628, 664]] }),
  );
  add('sketch-decision', 'Sketchy decision', 'Hand-drawn crayon flow: a box, a decision and two outcomes', ['sketch', 'hand-drawn', 'flowchart', 'decision'], 'samples/12.png',
    doc('Sketchy decision', 1000, 900, '#ffffff', null, els));
}

// ---------------------------------------------------------------- 3 · feature map
{
  const els = [];
  els.push(S('rect', 206, 40, 186, 440, { style: { fill: '#ffffff', stroke: 'none' } }));
  els.push(S('rect', 391, 128, 492, 151, { style: { fill: '#e7e7e7', stroke: 'none' } }), S('rect', 391, 354, 492, 114, { style: { fill: '#e7e7e7', stroke: 'none' } }));
  const small = (txt, x, y, w, h, t = {}) => T(txt, x, y, w, h, { font: 'Inter', size: 4.2, color: '#333333', valign: 'top', lineHeight: 1.35, ...t });
  els.push(T('Feature map', 206, 56, 180, 20, { font: 'Inter', size: 15.5, weight: 800, color: '#111111' }));
  els.push(S('rect', 206, 77, 117, 10, { style: { fill: '#fe6204', stroke: 'none' }, text: { content: 'How to use this template', font: 'Inter', size: 7.6, weight: 500, color: '#ffffff', align: 'left', pad: 1 } }));
  els.push(small('**Why to use this template?**\n*Identify or summarise steps, best practise and resulting features (epics / stories) so that you can define a narrative-complete solution in line with identified outcomes.*\n\nFeature maps (or Story maps) are our default tool to elicit and visualise features and scope at overview and detailed level. A Featuremap is based on an end-to-end process (user journey) that provides value to a user and assigns features, epics or stories that enable each step of the journey in priority order.\n\nThe teams we work with use Feature maps as the key tools to define, prioritise and communicate scope.\n\n**How to do it:**\n\n1. AGREE TARGET AUDIENCE AND THEIR GOALS\n2. MAP OVERALL JOURNEY\n3. IDENTIFY AND MAP FEATURES AGAINST THE JOURNEY\n4. DEFINE RELEASES\n5. ASSIGN FEATURES TO RELEASES\n6. PRIORITISE ITEMS WITHIN RELEASE (optional)\n\n**Ultimately this is all about building meaningful features and prioritisation against release.**', 208, 106, 112, 170));
  els.push(S('rect', 208, 430, 184, 49, { style: { fill: '#fe6204', stroke: 'none' } }), small('**Template**\nContent model', 211, 433, 80, 12, { color: '#ffffff', size: 3.8 }));
  for (const [t, y] of [['Inc1', 130], ['Inc2', 282], ['Inc3', 356]]) {
    els.push(T(t, 391, y + 4, 14, 26, { font: 'Inter', size: 9, weight: 800, color: '#111111', align: 'center', vertical: true }));
    els.push(small('Increment / Release\ndescription', 400, y + 26, 36, 10, { size: 2.6, color: '#555555' }));
  }
  const cell = (x, y, fill, label, h = 20, color = '#3a3a3a', size = 3.4) => S('rect', x, y, 37, h, { style: { fill, stroke: 'none' }, text: { content: label, font: 'Inter', size, color } });
  for (const x of [438, 582, 725]) els.push(cell(x, 66, '#ff5e32', 'Stage', 26, '#ffffff', 5));
  for (const x of [438, 486, 534, 582, 630, 678, 725, 773, 821]) els.push(cell(x, 100, '#fe7a2c', 'Step', 26, '#ffffff', 5));
  const cells = '534,132,#0d82c3 821,132,#0d82c3 438,133,#fac612 486,133,#fac612 582,133,#fac612 630,133,#fac612 678,133,#fac612 773,133,#fac612 437,157,#f9eaab 486,157,#f9eaab 533,157,#7cbcc6 629,157,#f9eaab 677,157,#f9eaab 820,157,#7cbcc6 583,158,#fac612 533,182,#7cbcc6 677,182,#f9eaab 820,182,#7cbcc6 438,183,#fac612 533,207,#7cbcc6 439,208,#fac612 821,208,#fac612 821,231,#fac612 439,233,#fac612 439,257,#fac612 438,282,#fac612 485,282,#0d82c3 582,282,#fac612 726,282,#fac612 773,282,#fac612 630,283,#fac612 485,306,#7cbcc6 773,306,#f9eaab 438,307,#fac612 582,307,#fac612 726,307,#fac612 725,332,#f9eaab 772,332,#f9eaab 582,356,#0d82c3 534,357,#fac612 630,357,#fac612 678,357,#fac612 726,357,#fac612 773,357,#fac612 821,357,#fac612 581,381,#7cbcc6 534,382,#fac612 630,382,#fac612 678,382,#fac612 821,382,#fac612 533,406,#f9eaab 629,406,#f9eaab 821,407,#fac612';
  for (const c of cells.split(' ')) { const [x, y, col] = c.split(','); els.push(cell(+x, +y, col, 'Feature', 19, col === '#0d82c3' ? '#ffffff' : '#3a3a3a')); }
  els.push(S('rect', 676, 444, 85, 22, { style: { fill: '#e7e7e7', stroke: 'none' }, text: { content: 'Feature notes', font: 'Inter', size: 4, color: '#666666' } }), S('rect', 768, 444, 85, 22, { style: { fill: '#e7e7e7', stroke: 'none' }, text: { content: 'Client logo', font: 'Inter', size: 4, color: '#666666' } }));
  add('feature-map', 'Feature map', 'Story / feature map: stages, steps and features per increment', ['feature map', 'story map', 'agile', 'release', 'miro'], 'samples/3.png',
    doc('Feature map', 1080, 480, '#fefefe', null, els));
}

// Scale elements authored in source-image pixels down to the working size.
function scaleEls(els, k) {
  const r = v => Math.round(v * k * 100) / 100;
  for (const e of els) {
    if (e.kind === 'connector') {
      for (const end of [e.from, e.to]) if (end.x != null) { end.x = r(end.x); end.y = r(end.y); }
      if (e.points) e.points = e.points.map(p => ({ x: r(p.x), y: r(p.y) }));
      if (e.style.strokeWidth) e.style.strokeWidth = r(e.style.strokeWidth);
      if (e.radius) e.radius = r(e.radius);
      if (e.text?.size) e.text.size = r(e.text.size);
      continue;
    }
    for (const key of ['x', 'y', 'w', 'h']) e[key] = r(e[key]);
    if (e.style.strokeWidth) e.style.strokeWidth = r(e.style.strokeWidth);
    if (e.text.size) e.text.size = r(e.text.size);
    if (e.text.pad) e.text.pad = r(e.text.pad);
    for (const p of ['radius', 'header', 'fold', 'tail', 'accent', 'bar', 'thickness', 'arrow']) if (e.params[p] != null) e.params[p] = r(e.params[p]);
  }
  return els;
}
const icon = (kind, x, y, s, stroke = '#1f2328', o = {}) => S(kind, x, y, s, s, { style: { stroke, fill: 'none', strokeWidth: o.sw || 2, ...(o.style || {}) } });
const panel = (x, y, w, h, o = {}) => S('rect', x, y, w, h, { params: { radius: o.radius ?? 8 }, style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, shadow: '0 2 8 rgba(0,0,0,0.12)', ...(o.style || {}) }, text: o.text });

// ---------------------------------------------------------------- 4 · Miro sprint board (with app UI)
{
  const els = [];
  const font = 'Open Sans';
  els.push(panel(8, 8, 324, 48), T('miro', 22, 14, 70, 34, { font: 'Montserrat', size: 26, weight: 700, color: '#050038' }), T('My First Board', 120, 14, 130, 34, { font, size: 17, weight: 700, color: '#050038' }),
    icon('star-icon', 248, 22, 18, '#c6c6cc', { sw: 1.6 }), S('line', 280, 18, 2, 28, { style: { stroke: '#e3e3e8', strokeWidth: 1 }, rot: 0 }), icon('arrow-right', 292, 20, 24, '#050038', { sw: 2 }));
  els.push(panel(1100, 8, 270, 48), panel(1380, 8, 52, 48));
  els.push(S('rect', 1110, 17, 77, 30, { params: { radius: 4 }, style: { fill: '#4262ff', stroke: 'none' }, text: { content: '    Share', font, size: 14, weight: 600, color: '#ffffff' } }), icon('globe', 1119, 23, 18, '#ffffff', { sw: 1.8 }));
  els.push(S('rect', 1102, 8, 94, 48, { params: { radius: 0 }, style: { fill: 'none', stroke: '#fc2a1c', strokeWidth: 3 } }));
  els.push(icon('filter', 1205, 19, 24, '#050038', { sw: 2 }), icon('bell', 1284, 19, 24, '#050038', { sw: 2 }), icon('search', 1323, 19, 24, '#050038', { sw: 2 }), icon('document-icon', 1392, 19, 26, '#050038', { sw: 1.8 }));
  els.push(S('ellipse', 1244, 19, 24, 24, { style: { fill: 'none', stroke: '#050038', strokeWidth: 2 }, text: { content: '?', font, size: 15, weight: 700, color: '#050038' } }), S('ellipse', 1259, 13, 14, 14, { style: { fill: '#4262ff', stroke: '#ffffff', strokeWidth: 1.5 }, text: { content: '2', font, size: 8, weight: 700, color: '#ffffff' } }));
  els.push(C(pt(901, 90), pt(1098, 30), { style: { stroke: '#fc2a1c', strokeWidth: 4 }, capSize: 0.9 }));
  // left toolbar
  els.push(panel(8, 221, 56, 464));
  const tools = ['cursor', 'layers', null, 'comment', null, 'arrow-right', 'pencil', 'comment', null, 'api', null];
  tools.forEach((k, i) => { const y = 239 + i * 40; if (k) els.push(icon(k, 24, y, 24, '#050038', { sw: 1.9 })); });
  els.push(T('T', 24, 318, 24, 30, { font, size: 24, weight: 400, color: '#050038', align: 'center' }), S('rect', 26, 402, 20, 20, { params: { radius: 1 }, style: { fill: 'none', stroke: '#050038', strokeWidth: 2 } }), S('rect', 26, 566, 20, 20, { params: { radius: 0 }, style: { fill: 'none', stroke: '#050038', strokeWidth: 2 } }), T('•••', 22, 640, 28, 24, { font, size: 16, weight: 700, color: '#050038', align: 'center' }));
  // bottom toolbars
  els.push(panel(8, 851, 456, 46), panel(1376, 851, 56, 46, { text: { content: '50%', font, size: 13, weight: 600, color: '#050038' } }));
  ['layers', 'play', 'comment', 'chats', 'queue', 'link', 'thumbs-up', 'monitor', 'clock', 'bolt'].forEach((k, i) => els.push(icon(k, 24 + i * 40, 862, 24, '#050038', { sw: 1.8 })));
  els.push(T('«', 428, 860, 20, 26, { font, size: 18, color: '#9a9aa8', align: 'center' }));
  // table
  const sprintX = [379, 624, 868, 1112];
  sprintX.forEach((x, i) => els.push(S('rect', x, 127, 233, 30, { style: { fill: '#133f69', stroke: 'none' }, text: { content: `Sprint ${i + 1}`, font, size: 12.5, color: '#ffffff' } })));
  const names = ['Matthew', 'Emma', 'Claire', 'David', 'Sarah', 'Rachel', 'Drew', 'Michael', 'John', 'Liza', 'Jane', 'Jonah', 'Tom', 'Ryan', 'Bianca'];
  const rowY = i => 169 + i * 41.4;
  [['UX and design', 0], ['Marketing', 5], ['Customer support', 10]].forEach(([t, i]) => els.push(S('rect', 94, rowY(i), 30, 196, { style: { fill: '#23c9a7', stroke: 'none' }, text: { content: t, font, size: 12, color: '#ffffff', vertical: true } })));
  names.forEach((n, i) => {
    els.push(S('rect', 136, rowY(i), 232, 30, { style: { fill: '#23c9a7', stroke: 'none' }, text: { content: n, font, size: 12.5, color: '#ffffff' } }));
    for (const x of sprintX) els.push(S('rect', x, rowY(i), 233, 30, { style: { fill: '#c2c3cc', stroke: 'none' } }));
  });
  const O = '#fd5633', Y = '#f8c44b';
  const bars = [[0, 379, 857, O, 'New account structure'], [0, 868, 1101, O, 'Templates'], [1, 379, 773, O, 'Search to navigate on the boards'], [1, 868, 1345, O, 'Slack integration'], [2, 497, 857, Y, 'Link sharing'],
    [3, 379, 612, Y, 'Mentions'], [3, 624, 984, O, 'Jira integration'], [4, 379, 857, O, "Sticky notes' import from spreadsheet"], [5, 379, 495, Y, 'Frames'], [5, 624, 984, O, 'Search to navigate on the boards'],
    [6, 438, 612, Y, 'Mentions'], [6, 985, 1218, O, 'Templates'], [7, 497, 857, O, 'Live cursors'], [7, 868, 1101, Y, 'Link sharing'], [8, 868, 1345, O, 'New account structure'], [9, 741, 1218, O, "Sticky notes' import from spreadsheet"],
    [10, 497, 612, Y, 'Frames'], [10, 868, 1228, O, 'Search to navigate on the boards'], [11, 624, 799, Y, 'Mentions'], [11, 1112, 1345, O, 'Templates'], [12, 741, 1101, O, 'Live cursors'], [12, 1112, 1228, Y, 'Link sharing'],
    [13, 1112, 1345, O, 'New account structure'], [14, 1112, 1345, O, "Sticky notes' import from spreadsheet"]];
  for (const [r, x0, x1, fill, t] of bars) els.push(S('rect', x0, rowY(r), x1 - x0, 30, { style: { fill, stroke: 'none' }, text: { content: t, font, size: 12, color: '#ffffff' } }));
  add('miro-sprints', 'Sprint planning board', 'Team × sprint grid with feature bars, in a Miro-style board with its UI', ['sprint', 'roadmap', 'agile', 'miro', 'team', 'ui'], 'samples/4.png',
    doc('Sprint planning', 1352, 851, '#f1f2f2', null, scaleEls(els, 1352 / 1440)));
}

// ---------------------------------------------------------------- 7 · Azure crash-analytics data flow
{
  const B = '#0078d7', G = '#8d9cb1', els = [];
  const lbl = (t, x, y, w, h, align = 'center') => T(t, x, y, w, h, { font: 'Open Sans', size: 7.2, color: B, align, valign: 'top', lineHeight: 1.15 });
  const ic = (k, x, y, w, h, o = {}) => S(k, x, y, w, h, { style: { stroke: B, fill: 'none', strokeWidth: o.sw || 1.6, ...(o.style || {}) } });
  const devices = [ic('monitor', 39, 196, 37, 40), ic('laptop', 74, 192, 54, 50), ic('mobile', 127, 199, 28, 36)];
  const hub = S('ellipse', 184, 206, 24, 24, { style: { fill: '#ffffff', stroke: G, strokeWidth: 1.2 } });
  const blob = S('az-storage-accounts', 313, 61, 40, 36);
  const queue = S('az-storage-queue', 262, 200, 34, 34);
  const harness = S('ellipse', 313, 134, 41, 40, { style: { fill: B, stroke: 'none' } });
  const lake = S('az-data-lake-store-gen1', 383, 139, 27, 32);
  const doc1 = S('az-azure-cosmos-db', 182, 318, 30, 31), doc2 = S('az-azure-cosmos-db', 319, 318, 30, 31);
  const odata = S('ellipse', 405, 281, 27, 27, { style: { fill: B, stroke: 'none' } }), web = S('ellipse', 405, 355, 27, 26, { style: { fill: B, stroke: 'none' } });
  const devs = ic('users', 536, 192, 62, 46, { sw: 1.8, style: { fill: B } });
  els.push(...devices, hub, blob, queue, harness, ic('monitor', 321, 143, 25, 22, { style: { stroke: '#ffffff' } }), lake, doc1, doc2, odata, ic('cloud-icon', 410, 285, 17, 17, { style: { stroke: '#ffffff' } }), web, ic('cloud-icon', 410, 359, 17, 17, { style: { stroke: '#ffffff' } }), devs);
  const line = { stroke: G, strokeWidth: 1.2 };
  const L = (from, to, points, o = {}) => C(from, to, { points, style: line, capSize: 0.55, ...o });
  els.unshift(
    L(at(devices[2], 1, 0.5), at(hub, 0, 0.5), null, { end: 'none' }),
    L(at(hub, 0.5, 0), at(blob, 0, 0.55), [[196, 81]]),
    L(at(hub, 0.5, 1), at(doc1, 0.5, 0), null, { start: 'arrow' }),
    L(at(hub, 1, 0.5), at(queue, 0, 0.5)),
    L(at(queue, 1, 0.5), at(harness, 0.5, 1), [[333, 217]]),
    L(at(queue, 1, 0.5), at(doc2, 0.5, 0), [[300, 217], [300, 260], [334, 260]], { end: 'arrow' }),
    L(at(harness, 0.5, 0), at(blob, 0.5, 1)),
    L(at(harness, 1, 0.5), at(lake, 0, 0.5)),
    L(at(blob, 1, 0.5), at(devs, 0, 0.3), [[470, 79], [470, 206]]),
    L(at(lake, 1, 0.5), at(devs, 0, 0.45), [[480, 155], [480, 213]]),
    L(at(doc2, 1, 0.5), at(odata, 0, 0.5), [[355, 333], [355, 294]]),
    L(at(doc2, 1, 0.5), at(web, 0, 0.5), [[355, 333], [355, 368]]),
    L(at(lake, 0.5, 1), at(odata, 0.5, 0), [[396, 230], [418, 230]], { end: 'none' }),
    L(at(odata, 1, 0.5), at(devs, 0, 0.6), [[472, 294], [472, 220]]),
    L(at(web, 1, 0.5), at(devs, 0, 0.7), [[472, 368], [472, 225]]),
  );
  els.push(lbl('Crash dumps', 205, 64, 60, 12, 'left'), lbl('Azure Blob\nStorage', 356, 76, 60, 20, 'left'), lbl('Debugging\nharness', 270, 143, 42, 20, 'right'), lbl('Azure Data Lake', 400, 132, 70, 10, 'left'),
    lbl('Devices worldwide', 50, 241, 110, 10), lbl('Azure Queue\nstorage', 249, 238, 60, 20), lbl('Azure DocumentDB:\nCab Catalog and\nBucket Dimensions', 150, 353, 95, 30), lbl('Azure DocumentDB:\nCab Catalog and\nBucket Catalog', 287, 353, 95, 30),
    lbl('OData\nAPI', 438, 285, 30, 20, 'left'), lbl('Web\nUI', 438, 360, 30, 20, 'left'), lbl('Developers and\ndecision makers', 527, 244, 80, 20));
  add('azure-dataflow', 'Azure data flow', 'Telemetry pipeline: devices → storage → analysis → people, with Azure icons', ['azure', 'architecture', 'cloud', 'data', 'pipeline'], 'samples/7.png',
    doc('Crash analytics on Azure', 650, 460, '#ffffff', null, els));
}

// ---------------------------------------------------------------- 6 · AKS architecture
{
  const els = [], F = 'Times New Roman';
  const lbl = (t, x, y, w, h, o = {}) => T(t, x, y, w, h, { font: F, size: o.size || 17, color: o.color || '#111111', align: o.align || 'center', valign: 'top', lineHeight: 1.15 });
  const ring = (x, y) => S('ellipse', x, y, 65, 65, { style: { fill: '#ffffff', stroke: '#b3b3b3', strokeWidth: 1.2 } });
  els.push(S('rect', 467, 125, 511, 371, { params: { radius: 12 }, style: { fill: 'none', stroke: '#0179d4', strokeWidth: 1.6, dash: 'dashed' } }));
  const box = (x, y, w, h, title) => [S('rect', x, y, w, h, { style: { fill: '#ffffff', stroke: '#9b9b9b', strokeWidth: 1.2 } }), lbl(title, x, y + 2, w, 24), lbl('Namespace', x + 6, y + h - 22, 90, 18, { size: 13, align: 'left' })];
  els.push(...box(477, 131, 122, 214, 'Front end'), ...box(609, 131, 357, 214, 'Back-end services'), ...box(609, 354, 357, 113, 'Utility services'));
  const ingress = ring(506, 207), c1 = ring(625, 207), c2 = ring(762, 159), c3 = ring(755, 256), c4 = ring(890, 256), u1 = ring(622, 368), u2 = ring(808, 368);
  els.push(ingress, S('hexagon', 521, 222, 36, 36, { params: { inset: 0.25 }, rot: 90, style: { fill: '#009639', stroke: 'none' }, text: { content: 'N', font: 'Arial', size: 20, weight: 700, color: '#ffffff' } }));
  for (const c of [c1, c2, c3, c4, u1, u2]) els.push(c, S('cube-3d', c.x + 14, c.y + 13, 38, 40, { style: { fill: '#35a7e6', stroke: 'none' } }));
  els.push(lbl('Ingress', 500, 278, 80, 22), lbl('Elasticsearch', 690, 389, 110, 22, { align: 'left' }), lbl('Prometheus', 876, 389, 90, 22, { align: 'left' }), lbl('Pod\nautoscaling', 818, 302, 80, 40, { size: 14 }));
  els.push(S('az-kubernetes-services', 476, 30, 88, 85), lbl('Azure Kubernetes\nService (AKS)', 572, 48, 160, 44, { align: 'left' }));
  els.push(S('k8s-wheel', 509, 366, 60, 60, { style: { fill: '#326ce5', stroke: '#ffffff', strokeWidth: 1.4 } }), lbl('Kubernetes\ncluster', 486, 428, 105, 44));
  els.push(S('browser', 176, 212, 59, 52, { params: { bar: 15, radius: 3 }, style: { fill: '#e8f3fb', fill2: '#5ab4d9', stroke: '#9b9b9b', strokeWidth: 1 } }), lbl('Client apps', 152, 273, 110, 22));
  els.push(S('az-load-balancers', 312, 205, 66, 66), lbl('Azure Load\nBalancer', 290, 274, 110, 44));
  els.push(S('rect', 104, 349, 112, 153, { style: { fill: '#ffffff', stroke: '#111111', strokeWidth: 1.6 } }), lbl('CI/CD', 104, 354, 112, 22), S('az-azure-devops', 137, 384, 48, 48), lbl('Azure\nPipelines', 104, 444, 112, 44));
  els.push(S('k8s-wheel', 236, 357, 34, 34, { style: { fill: 'none', stroke: '#277a9f', strokeWidth: 2.2 } }), T('HELM', 228, 390, 50, 16, { font: 'Arial', size: 12, weight: 700, color: '#277a9f', align: 'center' }));
  els.push(S('az-container-registries', 305, 425, 75, 62), lbl('Azure\nContainer\nRegistry', 290, 492, 105, 62));
  els.push(S('az-users', 190, 555, 60, 60), T('Dev/Ops', 180, 625, 80, 22, { font: F, size: 17, color: '#7c7c7c', align: 'center' }));
  els.push(S('az-entra-id', 606, 537, 80, 65), lbl('Azure Active\nDirectory', 582, 604, 128, 44));
  els.push(S('az-monitor', 785, 540, 60, 60), lbl('Azure\nMonitor', 765, 604, 100, 44));
  els.push(S('az-key-vaults', 958, 540, 60, 60), lbl('Azure\nKey Vault', 938, 604, 100, 44));
  els.push(lbl('External\ndata stores', 1006, 86, 120, 44), S('az-sql-database', 1033, 147, 45, 60), lbl('SQL Database', 990, 214, 140, 22), S('az-azure-cosmos-db', 1030, 252, 70, 60), lbl('Azure\nCosmos DB', 1006, 316, 120, 44));
  els.push(S('az-virtual-networks', 922, 485, 34, 22), lbl('Virtual network', 822, 498, 120, 22, { size: 15 }));
  const A = (f, t, o = {}) => C(f, t, { style: { stroke: '#000000', strokeWidth: 2.2 }, capSize: 0.9, ...o });
  const dash = { stroke: '#000000', strokeWidth: 2.2, dash: 'dashed' };
  els.push(
    A(pt(236, 237), pt(310, 237)), A(pt(380, 237), pt(462, 237)), A(pt(572, 240), pt(624, 240)),
    A(pt(689, 226), pt(760, 196)), A(pt(689, 250), pt(756, 282)), A(pt(827, 192), pt(1028, 192)),
    A(pt(820, 288), pt(888, 288), { style: dash }), A(pt(955, 288), pt(1027, 288)),
    A(pt(300, 383), pt(438, 383), { style: dash }), A(pt(222, 450), pt(302, 450), { style: dash }), A(pt(460, 450), pt(384, 450), { style: dash }),
    A(pt(537, 478), pt(600, 568), { route: 'elbow', radius: 0, points: [[537, 568]] }), A(pt(266, 590), pt(600, 590)),
  );
  els.push(lbl('Helm upgrade', 304, 357, 130, 22), lbl('Docker\npush', 222, 457, 70, 40, { size: 14 }), lbl('Docker\npull', 400, 457, 70, 40, { size: 14 }), lbl('Role-based\naccess control', 540, 512, 110, 40, { size: 14, align: 'left' }));
  add('aks-architecture', 'AKS architecture', 'Azure Kubernetes Service reference architecture with namespaces, CI/CD and data stores', ['azure', 'kubernetes', 'aks', 'architecture', 'cloud'], 'samples/6.png',
    doc('AKS architecture', 1200, 675, '#ffffff', null, els));
}

// ---------------------------------------------------------------- 11 · idea mind map with icon bubbles
{
  const els = [], lines = [], F = 'Nunito', ink = '#1a1a1a';
  const lorem = 'Lorem ipsum dolor sit amet\nconsectetur adipiscing elit,\nnascetur tempus enim faucibus\nfacilisis ut metus, senectus\nporta proin potenti dignissim\nelementum.';
  const center = S('blob', 479, 366, 318, 197, { params: { wobble: 1.2 }, style: { fill: '#d9d9d9', stroke: 'none', strokeWidth: 0 }, text: { content: 'MIND MAP', font: F, size: 49, weight: 800, color: ink, letterSpacing: 1 } });
  const lineSt = { stroke: ink, strokeWidth: 2 };
  const big = [
    ['CREATIVE IDEA', 131, 125, 263, 245, '#fbd261'], ['SIMPLE IDEA', 510, 63, 264, 249, '#f8a8c6'], ['UNIQUE IDEA', 858, 149, 264, 248, '#c8b3ef'],
    ['BRIGHT IDEA', 140, 457, 265, 248, '#b1dacc'], ['FRESH IDEA', 825, 517, 263, 246, '#feae4d'], ['ORIGINAL IDEA', 477, 647, 263, 245, '#3d89ba'],
  ];
  const smalls = { 'CREATIVE IDEA': [[36, 33, '#fbd261', 'globe'], [326, 29, '#fbd261', 'megaphone']], 'SIMPLE IDEA': [[773, 6, '#f8a8c6', 'lightbulb']], 'UNIQUE IDEA': [[1063, 47, '#c8b3ef', 'calendar'], [1044, 393, '#c8b3ef', 'cart']],
    'BRIGHT IDEA': [[22, 356, '#b1dacc', 'users'], [34, 681, '#b1dacc', 'gear']], 'FRESH IDEA': [[1067, 747, '#feae4d', 'chats']], 'ORIGINAL IDEA': [[315, 770, '#3d89ba', 'chart-bar'], [751, 776, '#3d89ba', 'mobile']] };
  const circles = [], texts = [];
  for (const [title, x, y, w, h, fill] of big) {
    const c = S('ellipse', x, y, w, h, { style: { fill, stroke: 'none', strokeWidth: 0 } });
    circles.push(c);
    texts.push(T(`# ${title}\n${lorem}`, x + w / 2 - 118, y + h * 0.2, 236, h * 0.62, { font: F, size: 11.4, h1: 1.95, weight: 500, color: ink, align: 'center', valign: 'top', letterSpacing: 0.9, lineHeight: 1.72 }));
    lines.push(C({ id: center.id, float: true }, { id: c.id, float: true }, { end: 'none', style: lineSt }));
    for (const [sx, sy, sf, ic] of smalls[title]) {
      const s = S('ellipse', sx, sy, 147, 136, { style: { fill: sf, stroke: 'none', strokeWidth: 0 } });
      circles.push(s);
      const light = sf === '#3d89ba';
      texts.push(S(ic, sx + 38, sy + 33, 70, 70, { style: { stroke: light ? '#ffffff' : '#2d6d9b', fill: light ? 'none' : '#ffffff', strokeWidth: 1.6 } }));
      lines.push(C({ id: c.id, float: true }, { id: s.id, float: true }, { end: 'none', style: lineSt }));
    }
  }
  els.push(...lines, center, ...circles, ...texts);
  add('idea-mindmap', 'Idea mind map', 'Central blob with six idea bubbles, each with small icon satellites', ['mindmap', 'brainstorm', 'infographic', 'canva'], 'samples/11.webp',
    doc('Mind map of ideas', 1238, 929, '#f9faf5', null, els));
}

// ---------------------------------------------------------------- 8 · Figma community flow chart in Chrome
{
  const els = [], F = 'Inter', W = '#ffffff';
  const box = (k, x, y, w, h, fill, o = {}) => S(k, x, y, w, h, { params: o.params || {}, style: { fill, stroke: 'none', strokeWidth: 0, ...(o.style || {}) }, text: o.text || {}, rot: o.rot });
  // macOS menu bar + browser chrome
  els.push(S('rect', 0, 0, 2000, 46, { style: { fill: 'linear-gradient(90deg, #6a1c7c 0%, #3a10b0 40%, #350eb9 100%)', stroke: 'none' } }));
  els.push(T(' Chrome    File    Edit    View    History    Bookmarks    Profiles    Tab    Window    Help', 20, 4, 1000, 38, { font: F, size: 19, weight: 500, color: W }), T('Fri 23. Oct  21.51', 1760, 4, 230, 38, { font: F, size: 18, weight: 500, color: W, align: 'right' }));
  els.push(box('rect', 0, 46, 2000, 46, '#292929'), box('rect', 0, 92, 2000, 54, '#3d3d3d'));
  [['#ff5f57', 24], ['#febc2e', 50], ['#28c840', 77]].forEach(([c, x]) => els.push(box('ellipse', x - 8, 61, 16, 16, c)));
  for (let i = 0; i < 26; i++) { const x = 150 + i * 66; els.push(box('rect', x, 60, 18, 18, ['#e14b8a', '#5f6368', '#4285f4', '#f25022', '#f25022', '#f25022', '#f25022', '#f25022', '#f25022', '#f25022', '#f25022', '#ffffff', '#f25022', '#f25022', '#ffffff', '#ffffff', '#ff4500', '#ff4500', '#ff4500', '#ff4500', '#ff4500', '#ffffff', '#4285f4', '#a259ff', '#a259ff', '#a259ff'][i], { params: { radius: 3 } }), T('', x + 22, 58, 30, 20, {})); }
  els.push(box('rect', 1830, 52, 80, 40, '#3d3d3d', { params: { radius: 8 } }), T('+', 1905, 52, 30, 36, { font: F, size: 28, color: '#dddddd' }));
  els.push(box('rect', 145, 101, 1645, 36, '#202124', { params: { radius: 18 } }), T('figma.com/community/file/1095908274380759943/flow-chart', 185, 101, 900, 36, { font: F, size: 18, color: '#e8eaed' }));
  els.push(T('←   →   ↻', 18, 98, 120, 40, { font: F, size: 22, color: '#bdbdbd' }));
  // figma header
  els.push(box('rect', 0, 146, 2000, 58, '#7f7f7f'), S('line', 0, 202, 2000, 2, { style: { stroke: '#767676', strokeWidth: 1 } }));
  els.push(T('Community        Riffs              Design resources ⌄        Websites ⌄        Figma Make        Extensions ⌄        Whiteboarding ⌄        Presentations ⌄', 56, 150, 1300, 48, { font: F, size: 16, weight: 500, color: '#141414' }));
  els.push(box('rect', 213, 166, 44, 18, '#16387a', { params: { radius: 4 }, text: { content: 'New', font: F, size: 11, color: W } }), box('rect', 20, 163, 16, 24, '#3d3d3d', { params: { radius: 4 } }));
  els.push(box('rect', 1590, 157, 245, 36, '#7a7a7a', { params: { radius: 8 }, text: { content: '      Search', font: F, size: 15, color: '#3d3d3d', align: 'left' } }), T('Log in', 1852, 158, 60, 34, { font: F, size: 14, color: '#141414' }), S('rect', 1908, 156, 78, 38, { params: { radius: 6 }, style: { fill: 'none', stroke: '#141414', strokeWidth: 1.5 }, text: { content: 'Sign up', font: F, size: 14, color: '#141414' } }));
  // page + canvas card
  els.push(box('rect', 0, 204, 2000, 1022, '#7e7e7e'), box('rect', 181, 263, 1637, 920, W));
  // diagram
  const pinkSq = box('rect', 296, 377, 203, 203, '#f598f6'), flower = box('flower', 322, 405, 150, 150, '#111111', { params: { n: 8, petal: 0.44 } });
  const pill = box('pill', 296, 687, 288, 71, '#d99efd'), dia = box('diamond', 655, 643, 245, 149, '#fadca2');
  const rectB = box('rect', 1108, 447, 248, 66, '#e9fbfe'), para = box('parallelogram', 1087, 727, 291, 166, '#ffe3f8', { params: { skew: 0.12 } });
  const lime = box('ellipse', 1471, 553, 230, 230, '#e4ff96'), orange = box('rect', 1500, 866, 201, 202, '#fdc46f'), atom = box('atom', 1520, 886, 160, 162, 'none', { style: { stroke: '#111111', strokeWidth: 8 } });
  const bar = (x, y, w, fill) => box('pill', x, y, w, 24, fill);
  const ln = { stroke: '#111111', strokeWidth: 4.5 };
  els.push(
    C(at(pill, 1, 0.5), at(dia, 0, 0.5), { style: ln, end: 'open', capSize: 1.1 }),
    C(at(dia, 1, 0.5), at(rectB, 0, 0.5), { route: 'elbow', radius: 26, style: ln, end: 'open', capSize: 1.1, points: [[995, 483]] }),
    C(at(dia, 1, 0.5), at(para, 0.47, 1), { route: 'elbow', radius: 26, style: ln, end: 'open', capSize: 1.1, points: [[1049, 975]] }),
    C(at(para, 0.5, 0), at(rectB, 0.52, 1), { style: ln, end: 'open', capSize: 1.1 }),
    C(at(rectB, 1, 0.5), at(lime, 0, 0.5), { route: 'elbow', radius: 26, style: ln, end: 'open', capSize: 1.1, points: [[1410, 668]] }),
    pinkSq, flower, pill, bar(322, 711, 177, '#ead8fd'), dia, bar(717, 711, 121, '#fb8a2b'), rectB, bar(1193, 469, 122, '#7dc2f5'), para, bar(1172, 776, 121, '#f598f6'), bar(1136, 822, 193, '#f598f6'),
    lime, bar(1505, 636, 161, '#1fa64f'), bar(1525, 680, 121, '#1fa64f'), orange, atom);
  // context menu
  els.push(S('rect', 1285, 727, 268, 468, { params: { radius: 10 }, style: { fill: 'rgba(214,214,214,0.55)', stroke: 'none', strokeWidth: 0 } }));
  const items = [['Back', 745], ['Forward', 773], ['Reload', 801], ['Save As...', 842], ['Print...', 870], ['Cast...', 898], ['Search this tab with Google Lens', 926], ['Open in reading mode', 954], ['Send to your device', 995], ['Create QR code for this page', 1023], ['Translate to English', 1064], ['Ask ChatGPT', 1105], ['View Page Source', 1146], ['Inspect', 1174]];
  for (const [t, y] of items) els.push(T(t, 1303, y - 14, 245, 28, { font: F, size: 15.5, color: t === 'Forward' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.92)' }));
  for (const y of [823, 976, 1045, 1086, 1127]) els.push(S('line', 1303, y, 232, 2, { style: { stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 } }));
  els.push(box('rect', 1770, 1127, 40, 40, '#2c2c2c', { params: { radius: 6 }, text: { content: '⤡', font: F, size: 18, color: W } }), T('#workflow process', 1448, 1190, 200, 26, { font: F, size: 16, color: '#5a5a5a' }));
  // cookie banner
  els.push(box('rect', 0, 1226, 2000, 75, '#7f7f7f'), S('line', 0, 1225, 2000, 3, { style: { stroke: '#3d3d3d', strokeWidth: 1.5 } }));
  els.push(T('This website uses cookies, pixel tags, and local storage for performance, personalization, and marketing purposes. We use our own cookies and some from third parties. Only essential cookies are turned on by default. **Cookies settings**', 38, 1250, 1560, 28, { font: F, size: 14.2, color: '#141414', wrap: false }));
  els.push(S('rect', 1637, 1245, 163, 37, { params: { radius: 6 }, style: { fill: '#737373', stroke: '#141414', strokeWidth: 1.5 }, text: { content: 'Do not allow cookies', font: F, size: 13.5, weight: 600, color: '#141414' } }), box('rect', 1810, 1245, 134, 37, '#171717', { params: { radius: 6 }, text: { content: 'Allow all cookies', font: F, size: 13.5, weight: 600, color: '#8a8a8a' } }), T('×', 1960, 1244, 24, 36, { font: F, size: 26, color: '#141414', align: 'center' }));
  add('figma-flowchart', 'Flow chart (Figma, in browser)', 'Colourful flow chart on a canvas, captured with the surrounding browser and site UI', ['flowchart', 'figma', 'browser', 'ui', 'screenshot'], 'samples/8.webp',
    doc('Figma flow chart', 1330, 865, '#7e7e7e', null, scaleEls(els, 1330 / 2000)));
}

// ---------------------------------------------------------------- 5 · Miro mobile wireframe board (with app UI)
{
  const els = [], F = 'Roboto', D = '#1e1e1e', P = '#aba3fe', GR = '#d9d9d9', MUTED = '#a3a3a3';
  const txt = (t, x, y, w, h, o = {}) => T(t, x, y, w, h, { font: F, size: o.size || 12, weight: o.weight || 400, color: o.color || D, align: o.align || 'center', valign: o.valign || 'middle', lineHeight: o.lh || 1.3, ...(o.extra || {}) });
  const phone = (x, y) => S('phone', x, y, 203, 420, { params: { radius: 28, notch: true }, style: { fill: '#ffffff', stroke: D, strokeWidth: 5 } });
  const btn = (x, y, w, t, o = {}) => S('button', x, y, w, 22, { params: { radius: 7 }, style: { fill: o.fill || P, stroke: o.stroke || 'none', strokeWidth: o.stroke ? 1.5 : 0 }, text: { content: t, font: F, size: 9, color: o.color || '#3b3b3b', upper: true } });
  const lorem = (x, y, w, lines, size = 8.5) => txt(['Lorem ipsum dolor sit amet,', 'consectetur adipiscing elit, sed do', 'eiusmod tempor incididunt ut', 'labore et dolore magna aliqua.'].slice(0, lines).join('\n'), x, y, w, lines * 12, { size, color: MUTED, lh: 1.35 });
  const imgArea = (x, y, w, h, r = 0) => S('image-placeholder', x, y, w, h, { params: { radius: r, glyph: 0.28 }, style: { fill: GR, fill2: '#8c8c8c', stroke: 'none' } });
  const sticky = (x, y, s, fill, lineCol) => [S('note', x, y, s, s, { params: { fold: 0, radius: 2 }, style: { fill, stroke: 'none', shadow: '0 4 10 rgba(0,0,0,0.12)' } }), S('text-lines', x + s * 0.13, y + s * 0.38, s * 0.74, s * 0.27, { params: { n: 3, thickness: 4, last: 0.55, align: 'center' }, style: { fill: lineCol } })];
  const comment = (x, y, fill) => S('comment-badge', x, y, 32, 30, { style: { fill, stroke: D, strokeWidth: 1.6 } });
  const tag = (x, y, w, name, fill, side = 'right') => S('cursor-tag', x, y, w, 46, { params: { side, arrow: 28 }, style: { fill: '#ffffff', fill2: fill, stroke: D, strokeWidth: 1.6 }, text: { content: name, font: F, size: 23, color: D } });
  // phones row 1
  els.push(phone(258, 163), imgArea(262, 167, 195, 412, 24), btn(276, 531, 165, 'Next'), comment(381, 449, '#f8a8fe'));
  els.push(phone(545, 163), txt('Headline', 560, 258, 173, 24, { size: 17 }), lorem(560, 292, 173, 4), S('input', 563, 362, 165, 22, { params: { radius: 11 }, style: { fill: '#ffffff', stroke: P, strokeWidth: 1.5 }, text: { content: 'LOREM', font: F, size: 8.5, color: MUTED, align: 'center' } }), btn(563, 396, 165, 'Submit'));
  els.push(phone(832, 163), txt('Headline', 845, 207, 175, 24, { size: 17 }), lorem(845, 242, 175, 2), imgArea(836, 280, 195, 212), btn(849, 532, 166, 'Submit'));
  els.push(phone(1118, 163), imgArea(1122, 167, 196, 211), txt('Step 1', 1130, 396, 180, 24, { size: 17 }), lorem(1130, 428, 180, 3, 7.5), S('dots', 1196, 490, 48, 11, { params: { n: 3, active: 0 }, style: { fill: '#b0b0b0', fill2: '#d6d6d6' } }), btn(1137, 532, 165, 'Next'), comment(1268, 363, P));
  // row 2
  const signup = (x, red) => [phone(x, 627), txt('Sign Up', x + 14, 650, 175, 26, { size: 18 }), S('line', x + 14, 680, 175, 4, { style: { stroke: P, strokeWidth: 1.2 } }),
    ...[['Name', 'Kristin', 721], ['Email', 'kristin.johnson1996@yahoo.com', 781], ['Password', '•••••••••••••', 841]].flatMap(([l, v, y], i) => [txt(l, x + 15, y - 8, 80, 14, { size: 10, color: MUTED, align: 'left' }), S('input', x + 15, y + 8, 171, 22, { params: { radius: 11 }, style: { fill: '#ffffff', stroke: red && i === 0 ? '#f0857f' : '#c9c9c9', strokeWidth: 1.4 }, text: { content: v, font: F, size: 8.5, color: '#3b3b3b', align: 'left' } })])];
  els.push(...signup(258, true), btn(273, 990, 168, 'Sign In'), S('ellipse', 414, 960, 12, 12, { style: { fill: D, stroke: 'none' } }));
  els.push(...signup(545, false), btn(560, 895, 168, 'Sign In'));
  els.push(phone(834, 627), S('rect', 845, 750, 180, 138, { params: { radius: 5 }, style: { fill: GR, stroke: 'none' }, text: { content: 'Pop-Up', font: F, size: 13, color: '#3b3b3b' } }), btn(853, 858, 74, 'View bag', { fill: GR, stroke: P }), btn(941, 858, 74, 'Check out'));
  els.push(phone(1118, 627), imgArea(1122, 631, 196, 211), txt('Step 2', 1130, 860, 180, 24, { size: 17 }), lorem(1130, 892, 180, 3, 7.5), S('dots', 1196, 954, 48, 11, { params: { n: 3, active: 0 }, style: { fill: '#b0b0b0', fill2: '#d6d6d6' } }), btn(1137, 995, 165, 'Next'));
  // stickies, comments, annotations, cursors
  els.push(...sticky(370, 95, 147, P, '#8a80ea'), ...sticky(585, 457, 148, '#ffdd33', '#e9c41f'), ...sticky(1253, 128, 147, '#f8a8fe', '#e08ae6'));
  els.push(S('ellipse', 805, 248, 250, 245, { style: { fill: 'none', stroke: '#f0857f', strokeWidth: 2, sketch: 0.4 } }), C(pt(1005, 260), pt(1048, 268), { route: 'curved', end: 'none', style: { stroke: '#f0857f', strokeWidth: 2 } }));
  els.push(comment(949, 509, '#ffdd33'), S('ellipse', 948, 506, 14, 14, { style: { fill: D, stroke: 'none' }, text: { content: '3', font: F, size: 8, weight: 700, color: '#ffffff' } }), comment(1363, 640, '#ffdd33'));
  els.push(S('line', 420, 965, 90, 4, { style: { stroke: D, strokeWidth: 1.5 } }), S('rect', 510, 930, 470, 70, { params: { radius: 7 }, style: { fill: '#ffffff', stroke: D, strokeWidth: 1.5 } }), T('@Misha I think we need to rename CTA', 542, 948, 330, 34, { font: F, size: 17.5, color: D }), T('@Misha', 542, 948, 70, 34, { font: F, size: 17.5, color: '#4262ff' }), S('ellipse', 882, 951, 30, 30, { style: { fill: 'none', stroke: '#b5b5b5', strokeWidth: 1.6 } }), S('arrow-right', 925, 950, 32, 32, { style: { stroke: '#b5b5b5', strokeWidth: 2 } }));
  els.push(tag(770, 505, 114, 'Natalie', '#fecfa4'), tag(1286, 810, 102, 'Anton', '#d6ccfd', 'left'), tag(368, 1100, 100, 'Misha', '#fbf7c3'));
  els.push(txt('Welcome page', 160, 370, 100, 30, { size: 28, extra: { vertical: false } }), txt('Create account', 160, 820, 100, 30, { size: 28 }));
  els[els.length - 2] = S('text', 97, 370, 220, 32, { rot: -90, text: { content: 'Welcome page', font: F, size: 28, color: D, align: 'center' } });
  els[els.length - 1] = S('text', 88, 822, 240, 32, { rot: -90, text: { content: 'Create account', font: F, size: 28, color: D, align: 'center' } });
  // app UI
  const ui = [panel(10, 10, 380, 52), T('miro', 22, 16, 80, 40, { font: 'Montserrat', size: 29, weight: 700, color: '#050038' }), T('Wireframe', 120, 16, 110, 40, { font: F, size: 19, color: '#050038' }), S('line', 106, 22, 2, 28, { rot: 90, style: { stroke: '#e3e3e8', strokeWidth: 1 } }),
    icon('queue', 248, 24, 24, '#050038', { sw: 1.6 }), icon('arrow-right', 298, 24, 24, '#050038'), icon('search', 348, 24, 24, '#050038'),
    panel(1021, 10, 55, 52), icon('layers', 1036, 24, 24, '#050038'), panel(1086, 10, 494, 52), icon('cursor', 1100, 23, 24, '#050038'), icon('sparkle', 1150, 23, 24, '#050038'),
    S('ellipse', 1203, 19, 34, 34, { style: { fill: '#8d6e63', stroke: '#ffffff', strokeWidth: 2 } }), S('ellipse', 1228, 19, 34, 34, { style: { fill: '#d4a59a', stroke: '#e57373', strokeWidth: 2 } }), S('ellipse', 1253, 19, 34, 34, { style: { fill: '#ffffff', stroke: '#9e9e9e', strokeWidth: 1.5 }, text: { content: '12', font: F, size: 13, color: '#050038' } }), S('ellipse', 1311, 18, 36, 36, { style: { fill: '#6d4c41', stroke: '#4caf50', strokeWidth: 2 } }),
    T('Present', 1370, 20, 70, 32, { font: F, size: 15, weight: 500, color: '#050038' }), T('⌄', 1450, 18, 20, 30, { font: F, size: 15, color: '#050038' }),
    S('rect', 1487, 18, 90, 36, { params: { radius: 6 }, style: { fill: '#4262ff', stroke: 'none' }, text: { content: '     Share', font: F, size: 15, weight: 600, color: '#ffffff' } }), icon('user', 1498, 26, 20, '#ffffff', { sw: 2 }),
    panel(10, 360, 54, 364), S('rect', 13, 364, 48, 48, { params: { radius: 6 }, style: { fill: '#e5e8ff', stroke: 'none' } }), icon('cursor', 25, 376, 24, '#4262ff'),
    T('T', 22, 420, 30, 40, { font: F, size: 26, color: '#050038', align: 'center' }), icon('comment', 24, 476, 26, '#050038'), icon('layers', 24, 527, 26, '#050038'), icon('arrow-right', 24, 578, 26, '#050038'), T('A', 22, 622, 30, 40, { font: F, size: 26, color: '#050038', align: 'center' }), S('rect', 25, 683, 24, 24, { params: { radius: 4 }, style: { fill: '#050038', stroke: 'none' }, text: { content: '+', font: F, size: 18, color: '#ffffff' } }),
    panel(10, 735, 54, 107), icon('refresh', 24, 750, 26, '#050038'), icon('refresh', 24, 800, 26, '#050038'),
    panel(10, 1136, 54, 54), icon('layers', 24, 1150, 26, '#050038'), panel(1335, 1136, 190, 54), T('−        100%       +', 1345, 1146, 140, 34, { font: F, size: 15, color: '#050038' }), S('ellipse', 1483, 1149, 28, 28, { style: { fill: '#050038', stroke: 'none' }, text: { content: '?', font: F, size: 15, weight: 700, color: '#ffffff' } }),
    S('rect', 1545, 1145, 36, 36, { params: { radius: 6 }, style: { fill: '#4262ff', stroke: 'none' } }), icon('sparkle', 1551, 1151, 24, '#ffffff')];
  els.unshift(...ui);
  add('miro-wireframe', 'Mobile wireframe board', 'Phone screens for onboarding and sign-up with stickies, comments and live cursors, in a Miro-style board', ['wireframe', 'mobile', 'ux', 'miro', 'ui', 'prototype'], 'samples/5.png',
    doc('Wireframe', 1238, 929, '#f5f5f5', null, scaleEls(els, 1238 / 1600)));
}

// ---------------------------------------------------------------- 2 · Miro play board: mind mapping
{
  const els = [], F = 'Open Sans', W = '#ffffff', NAVY = '#1c2a4b', BLUE = '#1e46a0';
  const t = (c, x, y, w, h, o = {}) => T(c, x, y, w, h, { font: F, size: o.size || 6.4, weight: o.weight || 400, color: o.color || W, align: o.align || 'left', valign: o.valign || 'top', lineHeight: o.lh || 1.45 });
  const sticky = (x, y, s, c) => S('note', x, y, s, s, { params: { fold: 0, radius: 0 }, style: { fill: W, stroke: 'none', shadow: '0 1 2 rgba(0,0,0,0.25)' }, text: { content: c, font: F, size: 7.5, color: '#222222', lineHeight: 1.3 } });
  els.push(S('rect', 80, 36, 154, 160, { style: { fill: BLUE, stroke: 'none' } }), t('General info', 86, 40, 140, 12, { size: 7.4 }), sticky(108, 65, 43, 'People\n1–6'), sticky(108, 119, 43, 'Time\n30 min'), sticky(164, 91, 42, 'Difficulty\nEasy'));
  els.push(S('rect', 244, 36, 155, 160, { style: { fill: BLUE, stroke: 'none' } }), t('Who should be involved?', 250, 40, 140, 12, { size: 7.4 }), t('Mindmapping is a play you can run on your own, in pairs, or with a group. Bring in the roles and people you think will be most helpful, but keep the group fairly small – six or fewer.', 250, 60, 140, 80));
  els.push(S('rect', 80, 207, 319, 159, { style: { fill: BLUE, stroke: 'none' } }), t('Prep', 86, 211, 140, 12, { size: 7.4 }), t('Start with a question that is central to your topic or problem. Make sure the question is somewhat specific – e.g., "How can we make creating Jira issues simpler?" is better than "How can we improve Jira issues?"', 86, 233, 300, 50));
  els.push(S('rect', 408, 36, 486, 330, { style: { fill: '#e0ebfd', stroke: 'none' } }));
  const steps = [[81, 316, '1', 'Turn your brain on', 'Write your question in the middle of the board.\nNow write down any thoughts that spring to mind in relation to this question. Each thought should be a separate bubble hovering around the question in the middle. Resist the urge to self-edit or over-think it at this stage. Just let it flow.', 'Step 1', 240, 316],
    [410, 155, '2', 'Branch out', 'Once you\'ve got an initial set of ideas, use each one to create a branch of more ideas.', 'Step 2', 487, 507],
    [576, 319, '3', 'Grab the gold coins', 'Go back over your mind map and highlight the ideas that resonate strongest with you. Is there anything missing? Or are there ideas worth exploring further?\nWith any luck, you\'ll have hit upon one or two ideas that get you un-stuck and solve your problem. If so, great. Move onto planning your next steps. If not, share your mind map with your team to bring them into the conversation.', 'Step 1', 735, 864]];
  for (const [x, w, n, title, body, label, nx, sx] of steps) {
    els.push(S('rect', x, 377, w, 140, { style: { fill: NAVY, stroke: 'none' } }), T(n, nx - 20, 440, 40, 70, { font: F, size: 50, weight: 400, color: BLUE, align: 'center', valign: 'middle' }), t(label, x + 5, 381, 100, 12, { size: 7.4 }), t(title, x + 35, 398, w - 45, 12, { size: 7.4, weight: 700 }), t(body, x + 35, 410, w - 55, 80));
    els.push(sticky(sx, 483, 36, '5 min'));
  }
  // mind map
  const root = S('pill', 436, 189, 72, 26, { style: { fill: '#e0ebfd', stroke: BLUE, strokeWidth: 1 }, text: { content: 'Miro Mind Map', font: F, size: 6.6, color: NAVY } });
  els.push(root);
  const branch = (label, lx, ly, lw, color, leaves, leafX) => {
    const st = { stroke: color, strokeWidth: 1.3 };
    const lab = (c, x, y, w) => T(c, x, y - 6, w + 20, 12, { font: F, size: 6.4, color: NAVY, align: 'left', valign: 'middle' });
    els.push(C(at(root, 1, 0.5), pt(lx - 3, ly), { route: 'curved', end: 'none', bend: 0.5, style: st }), lab(label, lx, ly, lw));
    for (const [txt, y, w, subs] of leaves) {
      els.push(C(pt(lx + lw + 3, ly), pt(leafX - 3, y), { route: 'curved', end: 'none', bend: 0.5, style: st }), lab(txt, leafX, y, w));
      for (const [s2, sy, sw] of subs || []) els.push(C(pt(leafX + w + 3, y), pt(757, sy), { route: 'curved', end: 'none', bend: 0.5, style: st }), lab(s2, 760, sy, sw));
    }
  };
  branch('Use cases', 546, 153, 34, '#2d4fbf', [['Brainstorm', 62, 36], ['Structure research results', 78, 80], ['Design information architecture', 94, 98], ['Plan projects', 111, 42], ['Create org charts', 127, 56], ['Develop sales strategies', 143, 76], ['Analyze problems', 159, 54]], 640);
  branch('Robust collaborative features', 556, 216, 94, '#6fb3e6', [['Real-time collaboration', 176, 72], ['Endless canvas', 192, 48], ['Comments', 208, 32], ['Video chat', 224, 34], ['Presentation mode', 240, 58], ['High resolution export', 256, 72]], 676);
  branch('Mind mapping features', 556, 306, 72, '#f0a030', [['Different themes', 281, 54, [['Multicolored curved', 273, 64], ['Monochromatic zigzag', 290, 72]]], ['Keyboard shortcuts', 306, 60], ['Auto arrange', 322, 42], ['Links to anything', 338, 54]], 640);
  // embed footer
  els.push(S('rect', 0, 515, 1024, 51, { style: { fill: '#fefefe', stroke: 'none' } }), S('rect', 10, 522, 36, 36, { params: { radius: 4 }, style: { fill: '#ffd02f', stroke: 'none' }, text: { content: 'm', font: 'Montserrat', size: 22, weight: 800, color: '#050038' } }),
    T('Atlassian Team Plays: Mindmapping', 56, 520, 400, 20, { font: F, size: 13.5, color: '#4262ff', align: 'left' }), T('Miro.com', 56, 540, 200, 18, { font: F, size: 12, color: '#6b6b6b', align: 'left' }),
    T('+', 920, 528, 24, 28, { font: F, size: 22, color: '#333333', align: 'center' }), T('−', 957, 528, 24, 28, { font: F, size: 22, color: '#333333', align: 'center' }), S('arrow-right', 994, 531, 22, 22, { rot: -45, style: { stroke: '#333333', strokeWidth: 2 } }));
  add('miro-mindmap-play', 'Mind-mapping play board', 'Workshop board: info panels, steps and a three-branch mind map', ['mindmap', 'workshop', 'miro', 'atlassian', 'playbook'], 'samples/2.png',
    doc('Team play: mindmapping', 1024, 566, '#f2f2f2', null, els));
}

const out = JSON.parse(readFileSync(new URL('../library/index.json', import.meta.url)));
out.templates = [];
for (const t of templates) {
  writeFileSync(new URL(`../library/templates/${t.id}.json`, import.meta.url), JSON.stringify(t));
  out.templates.push(`templates/${t.id}.json`);
}
writeFileSync(new URL('../library/index.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(templates.length, 'templates');
