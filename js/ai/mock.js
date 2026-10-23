// Offline stand-in for the model, for testing the pipeline without an API key.
// Enable with ?mock in the URL. The "analyst" returns a jittered copy of the bundled
// template whose page size matches the image (so it only knows the sample images), the
// "designer" returns a simple kind, and the "critic" nudges elements back towards the template.

const sleep = ms => new Promise(r => setTimeout(r, ms));
let templatesCache = null;
async function templates() {
  if (templatesCache) return templatesCache;
  const idx = await (await fetch(new URL('../../library/index.json', import.meta.url))).json();
  templatesCache = await Promise.all(idx.templates.map(p => fetch(new URL('../../library/' + p, import.meta.url)).then(r => r.json())));
  return templatesCache;
}
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
async function stream(text, onText, onThinking, thinking) {
  for (const part of thinking.match(/.{1,40}/gs) || []) { onThinking && onThinking(part); await sleep(8); }
  for (let i = 0; i < text.length; i += 120) { onText && onText(text.slice(i, i + 120)); await sleep(60); }
}
const result = text => ({ text, usage: { input_tokens: 5000, output_tokens: Math.round(text.length / 3.5) }, model: 'mock', stop: 'end_turn', cost: 0 });

export async function mockComplete({ role, system, content, onText, onThinking, signal }) {
  const prompt = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (signal?.aborted) throw Object.assign(new Error('Stopped.'), { code: 'aborted' });
  if (role === 'analyst') {
    const m = /Image size: (\d+) × (\d+)/.exec(prompt);
    const t = (await templates()).find(t => m && t.doc.page.w === +m[1] && t.doc.page.h === +m[2]);
    if (!t) { const text = JSON.stringify({ summary: 'Unknown image (mock)', page: { background: '#ffffff' }, elements: [{ id: 'e1', kind: 'text', x: 40, y: 40, w: 400, h: 40, text: { content: 'Mock analyst only knows the sample images', size: 20 } }] }); await stream(text, onText, onThinking, 'No matching template.'); return result(text); }
    const r = rng(7), els = JSON.parse(JSON.stringify(t.doc.elements));
    let renamed = null;
    for (const e of els) {
      if (e.kind === 'connector') continue;
      e.x += (r() - 0.5) * 14; e.y += (r() - 0.5) * 14; e.w *= 0.96 + r() * 0.08; e.h *= 0.96 + r() * 0.08;
      if (e.text?.font) e.text.font = 'Inter';
      if (!renamed && (e.kind === 'ellipse' || e.kind === 'note' || e.kind === 'cube-3d')) { renamed = e; e.kind = 'mock-badge'; }
    }
    const scene = { summary: t.name + ' (mock analysis)', page: t.doc.page, fonts: ['Inter'], elements: els, newKinds: renamed ? [{ id: 'mock-badge', name: 'Mock badge', description: 'Round badge with an inner ring', example: renamed.id }] : [] };
    const text = JSON.stringify(scene);
    await stream(text, onText, onThinking, `Looking at a ${m[1]}×${m[2]} image. It resembles "${t.name}". Listing ${els.length} elements back to front, matching palette colours, then connectors…`);
    return result(text);
  }
  if (role === 'designer') {
    const kind = { id: 'mock-badge', name: 'Mock badge', category: 'learned', tags: ['badge', 'circle', 'mock'], description: 'Circle with an inner ring (designed by the mock designer)', size: [100, 100],
      style: { fill: '#f6c97f', fill2: '#ffffff', stroke: 'none', strokeWidth: 0 }, text: { size: 14, color: '#1f2328' },
      svg: "<ellipse cx='{w/2}' cy='{h/2}' rx='{w/2}' ry='{h/2}' fill='{fill}'/><ellipse cx='{w/2}' cy='{h/2}' rx='{w*0.38}' ry='{h*0.38}' fill='none' stroke='{fill2}' stroke-opacity='0.5' stroke-width='{min(w,h)*0.03}'/>",
      textBox: ['w*0.15', 'h*0.15', 'w*0.7', 'h*0.7'], outline: 'ellipse' };
    const text = JSON.stringify({ kind, element: { style: {} } });
    await stream(text, onText, onThinking, 'The crop is a round badge; drawing a parametric circle with an inner ring.');
    return result(text);
  }
  if (role === 'sketch') {
    const boxes = [];
    for (let i = 0; i < 4; i++) { boxes.push({ x: 40 + i * 300, y: 120, w: 260, h: 520, label: 'Column ' + (i + 1) }); for (let j = 0; j < 3; j++) boxes.push({ x: 60 + i * 300, y: 180 + j * 150, w: 220, h: 110, label: 'Step' }); }
    await sleep(600);
    return result(JSON.stringify({ boxes }));
  }
  if (/^Request: /m.test(prompt)) {
    const req = /^Request: (.*)$/m.exec(prompt)[1];
    const ops = [];
    for (let i = 0; i < 6; i++) ops.push({ op: 'add', element: { id: 'mock' + i + Date.now().toString(36), kind: 'note', x: 40 + i * 130, y: 40, w: 110, h: 110, style: { fill: ['#fde68a', '#bbf7d0', '#bfdbfe'][i % 3] }, text: { content: i ? `Step ${i}` : req.slice(0, 40), size: 13 } } });
    const text = JSON.stringify({ assessment: `Added six sticky notes for "${req}" (mock edit).`, ops, done: true });
    await sleep(2500); // the real model thinks a while before the first op
    await stream(text, onText, onThinking, 'Reading the request and planning the edits…');
    return result(text);
  }
  // critic
  const sm = /Current scene:\n([\s\S]*?)\n\nImages:/.exec(prompt);
  const scene = sm ? JSON.parse(sm[1]) : { elements: [] };
  const t = (await templates()).find(t => t.doc.page.w === scene.page?.w && t.doc.page.h === scene.page?.h);
  const ops = [];
  if (t) {
    const want = new Map(t.doc.elements.map(e => [e.id, e]));
    for (const e of scene.elements) {
      const w = want.get(e.id); if (!w || e.kind === 'connector') continue;
      const set = {};
      for (const k of ['x', 'y', 'w', 'h']) if (Math.abs((e[k] || 0) - w[k]) > 0.6) set[k] = Math.round((e[k] + (w[k] - e[k]) * 0.8) * 10) / 10;
      if (w.text?.font && e.text?.font !== w.text.font) set.text = { font: w.text.font };
      if (Object.keys(set).length) ops.push({ op: 'update', id: e.id, set });
    }
  }
  const text = JSON.stringify({ assessment: `${ops.length} elements are a few pixels off or use the wrong font.`, ops, lessons: [{ text: 'Mock lesson: measure repeated cards once and reuse the same size for all of them.', tags: ['general'] }], done: ops.length === 0 });
  await stream(text, onText, onThinking, 'Comparing the render with the source: boxes are slightly offset and the font is too wide.');
  return result(text);
}
