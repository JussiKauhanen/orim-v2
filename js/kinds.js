// Element kinds: the expandable vocabulary of shapes.
//
// A kind is plain JSON: a parametric SVG template plus metadata (params, default style,
// text box, outline for connectors). Built-in kinds ship in library/kinds/*.json; the AI
// designs new ones while replicating images and they are stored next to them, so the
// vocabulary grows with use. See docs/kinds.md for the format.

import { template, num } from './expr.js';

const registry = new Map();
const listeners = new Set();
export const onKindsChanged = fn => listeners.add(fn);
const changed = () => listeners.forEach(f => f());

// Kinds the renderer implements natively.
export const NATIVE = {
  text: { id: 'text', name: 'Text', category: 'basic', description: 'Free text with no shape behind it', size: [200, 40], style: { fill: 'none', stroke: 'none', strokeWidth: 0 }, text: { size: 18, align: 'left', valign: 'top' }, svg: '', native: true },
  image: { id: 'image', name: 'Image', category: 'basic', description: 'Bitmap picture (crop of the source or an uploaded image). props.src holds a data URL.', size: [160, 120], params: { radius: { type: 'number', default: 0, min: 0, max: 400, label: 'Corner radius' }, fit: { type: 'select', default: 'fill', options: ['fill', 'contain', 'cover'], label: 'Fit' } }, style: { stroke: 'none', strokeWidth: 0 }, svg: '', native: true },
  connector: { id: 'connector', name: 'Connector', category: 'basic', description: 'Line or arrow between two points or elements', native: true, svg: '' },
};

export function validateKind(k) {
  const errors = [];
  if (!k || typeof k !== 'object') return ['not an object'];
  if (!k.id || !/^[a-z0-9][a-z0-9-]*$/.test(k.id)) errors.push('id must be kebab-case');
  if (typeof k.svg !== 'string') errors.push('svg template missing');
  const s = k.svg || '';
  if (/<\s*(script|foreignObject|style|iframe|object|embed|animate|set)\b/i.test(s)) errors.push('svg uses a forbidden element');
  if (/\son[a-z]+\s*=/i.test(s)) errors.push('event handler attributes are not allowed');
  if (/javascript:/i.test(s)) errors.push('javascript: URLs are not allowed');
  const hrefs = s.match(/href\s*=\s*['"]([^'"]*)['"]/gi) || [];
  for (const h of hrefs) { const v = h.replace(/^[^=]*=\s*['"]/, '').replace(/['"]$/, ''); if (!v.startsWith('#') && !v.startsWith('data:image/') && !v.includes('{')) errors.push('only local (#id) or data:image hrefs are allowed'); }
  if (s.length > 60000) errors.push('svg template too long');
  return errors;
}

export function registerKind(k, { silent } = {}) {
  const errs = validateKind(k);
  if (errs.length) { console.warn('Kind rejected', k && k.id, errs); return false; }
  registry.set(k.id, k);
  if (!silent) changed();
  return true;
}
export function registerKinds(list) { let n = 0; for (const k of list) if (registerKind(k, { silent: true })) n++; changed(); return n; }
export const removeKind = (id, { silent } = {}) => { registry.delete(id); if (!silent) changed(); };
export const getKind = id => NATIVE[id] || registry.get(id) || null;
export const allKinds = () => [...registry.values()];
export const hasKind = id => !!getKind(id);

// Default params/style/text for a new element of this kind.
export function defaults(kind) {
  const params = {};
  for (const [key, p] of Object.entries(kind.params || {})) params[key] = p.default;
  return { params, style: { ...(kind.style || {}) }, text: { ...(kind.text || {}) }, size: kind.size || [160, 80] };
}

export function dashArray(dash, sw) {
  sw = Math.max(sw || 1, 0.5);
  if (!dash || dash === 'solid' || dash === 'none') return 'none';
  if (dash === 'dashed') return `${sw * 4} ${sw * 3}`;
  if (dash === 'dotted') return `${sw * 0.01} ${sw * 2.2}`;
  if (dash === 'dashdot') return `${sw * 5} ${sw * 2.5} ${sw * 0.01} ${sw * 2.5}`;
  return String(dash).replace(/[^0-9., ]/g, '');
}

let uidCounter = 0;
// Build the scope a kind template sees.
export function scopeFor(el, kind) {
  const d = defaults(kind);
  const params = { ...d.params, ...(el.params || {}) };
  const style = { ...d.style, ...(el.style || {}) };
  const sw = style.stroke && style.stroke !== 'none' ? (style.strokeWidth ?? 1) : 0;
  const w = Math.max(1, el.w), h = Math.max(1, el.h);
  const vb = kind.viewBox;
  const sc = { ...style, ...params, w, h, sw, rawSw: style.strokeWidth ?? 1, fill: style.fill ?? 'none', fill2: style.fill2 ?? style.fill ?? 'none', stroke: style.stroke ?? 'none', dash: dashArray(style.dash, sw), uid: (el.id || 'k') + '-' + (++uidCounter % 1e6) };
  if (vb) { sc.vw = vb[2]; sc.vh = vb[3]; sc.vsw = sw * Math.sqrt((vb[2] * vb[3]) / (w * h)); }
  return sc;
}

const MACROS = {
  '{@paint}': "fill='{fill}' stroke='{stroke}' stroke-width='{sw}' stroke-dasharray='{dash}' stroke-linejoin='round'",
  '{@vpaint}': "fill='{fill}' stroke='{stroke}' stroke-width='{vsw}' stroke-dasharray='{dash}' stroke-linejoin='round'",
  '{@line}': "fill='none' stroke='{stroke}' stroke-width='{sw}' stroke-linecap='round' stroke-linejoin='round'",
};
const expandMacros = s => s.replace(/\{@(paint|vpaint|line)\}/g, m => MACROS[m]);

// SVG body for an element (shape only, in local coordinates 0..w, 0..h).
export function shapeSvg(el, kind, scope) {
  if (!kind.svg) return '';
  const body = template(expandMacros(kind.svg), scope);
  if (kind.viewBox) {
    const [x, y, w, h] = kind.viewBox;
    return `<svg x="0" y="0" width="${scope.w}" height="${scope.h}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="${kind.aspect === 'meet' ? 'xMidYMid meet' : 'none'}" overflow="${kind.fixedColors ? 'hidden' : 'visible'}">${body}</svg>`;
  }
  return body;
}

export function textBox(el, kind, scope) {
  // an icon's label can sit to its right instead of below (vertical layouts, where links leave downwards)
  if (el.labelSide === 'right' && kind.pack) return { x: el.w + 8, y: 0, w: 150, h: el.h };
  const tb = kind.textBox;
  if (!tb) return { x: 0, y: 0, w: el.w, h: el.h };
  return { x: num(tb[0], scope), y: num(tb[1], scope), w: Math.max(4, num(tb[2], scope)), h: Math.max(4, num(tb[3], scope)) };
}

// Outline in local coords: polygon point list or {ellipse}. Used for connector attachment.
export function outline(el, kind, scope) {
  const o = kind.outline || 'rect', w = el.w, h = el.h;
  if (o === 'ellipse') return { ellipse: true, w, h };
  if (o === 'diamond') return { poly: [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]] };
  if (o && o.poly) return { poly: o.poly.map(([x, y]) => [num(x, scope), num(y, scope)]) };
  return { poly: [[0, 0], [w, 0], [w, h], [0, h]] };
}

// ---------- vendor icons by name ----------
// The model writes "azure:Key Vault"; we find the closest icon in that pack. This keeps the
// several-hundred-name icon lists out of every prompt.
const PACK_ALIASES = { azure: 'Azure', az: 'Azure', microsoft: 'Azure', 'power-platform': 'Power Platform', powerplatform: 'Power Platform', pp: 'Power Platform', dynamics: 'Dynamics 365', d365: 'Dynamics 365', 'dynamics-365': 'Dynamics 365' };
const words = s => String(s).toLowerCase().replace(/^azure\s+|^microsoft\s+/, '').split(/[^a-z0-9]+/).filter(w => w.length > 1).map(w => w.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1'));
const resolved = new Map();
export function resolveKind(id) {
  if (!id || getKind(id)) return id;
  if (resolved.has(id)) return resolved.get(id);
  let m = /^([a-z0-9-]+)\s*[:/]\s*(.+)$/i.exec(id), pack = null, q = id;
  if (m && PACK_ALIASES[m[1].toLowerCase()]) { pack = PACK_ALIASES[m[1].toLowerCase()]; q = m[2]; }
  else if ((m = /^(az|pp|d365)-(.+)$/.exec(id))) { pack = PACK_ALIASES[m[1]]; q = m[2]; }
  else return id;
  const qw = words(q);
  let best = null, bs = 0;
  for (const k of registry.values()) {
    if (k.pack !== pack) continue;
    const nw = words(k.name), tw = new Set([...(k.tags || []).flatMap(words), ...words(k.group || '')]);
    let sc = words(k.name).join(' ') === qw.join(' ') ? 10 : 0;
    for (const w of qw) sc += nw.includes(w) ? 2 : tw.has(w) ? 0.6 : 0;
    sc -= Math.max(0, nw.length - qw.length) * 0.25;
    if (sc > bs) { bs = sc; best = k.id; }
  }
  const out = best && bs >= 1.5 ? best : id;
  resolved.set(id, out);
  return out;
}
const COMMON = { Azure: ['App Services', 'Function Apps', 'Kubernetes Services', 'Container Apps', 'Container Registries', 'Virtual Machine', 'Virtual Networks', 'Load Balancers', 'Application Gateways', 'Front Door', 'API Management Services', 'Logic Apps', 'Service Bus', 'Event Hubs', 'Event Grid', 'Storage Accounts', 'SQL Database', 'Azure Cosmos DB', 'Key Vaults', 'Entra ID', 'Monitor', 'Application Insights', 'Log Analytics Workspaces', 'Data Factories', 'Azure OpenAI', 'Cognitive Services', 'Machine Learning', 'Azure DevOps', 'Static Apps', 'Firewalls', 'Bastions', 'DNS Zones', 'Cache Redis', 'Data Lake Storage Gen1', 'Users'] };

// Compact catalogue for prompts.
export function catalog({ includeSvg = false } = {}) {
  const out = [], packs = new Map();
  for (const k of [...Object.values(NATIVE), ...registry.values()]) {
    if (k.pack) { if (!packs.has(k.pack)) packs.set(k.pack, []); packs.get(k.pack).push(k.name); continue; }
    const ps = Object.entries(k.params || {}).map(([n, p]) => `${n}:${p.type}${p.options ? '(' + p.options.join('|') + ')' : ''}=${JSON.stringify(p.default)}`).join(', ');
    const st = Object.entries(k.style || {}).filter(([, v]) => v !== undefined).map(([n, v]) => `${n}=${v}`).join(' ');
    out.push(`- ${k.id}${k.learned ? ' [learned]' : ''}: ${k.description || k.name}${ps ? ' | params: ' + ps : ''}${k.viewBox ? ' | icon' : ''}${st ? ' | default style: ' + st : ''}${includeSvg ? '\n  svg: ' + k.svg : ''}`);
  }
  for (const [p, list] of packs) {
    const prefix = { Azure: 'azure', 'Power Platform': 'power-platform', 'Dynamics 365': 'dynamics' }[p] || p.toLowerCase();
    const names = list.length > 60 ? (COMMON[p] || list.slice(0, 40)).join(', ') + ', … (any official product name works)' : list.join(', ');
    out.push(`\n${p} icons: ${list.length} official icons with fixed colours. Use kind "${prefix}:<product name>", e.g. "${prefix}:${(COMMON[p] || list)[0]}"; the closest icon is picked. The element's text is the label under the icon. Names: ${names}`);
  }
  return out.join('\n');
}
