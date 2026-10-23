// Colour helpers shared by the renderer, the expression language and the image analysis.

export function parse(c) {
  if (!c || typeof c !== 'string') return null;
  c = c.trim().toLowerCase();
  if (c === 'none' || c === 'transparent') return null;
  let m = /^#([0-9a-f]{3,8})$/.exec(c);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
  if (NAMED[c]) return parse(NAMED[c]);
  return null;
}
const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb' };

const h2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export const hex = ({ r, g, b, a = 1 }) => '#' + h2(r) + h2(g) + h2(b) + (a < 1 ? h2(a * 255) : '');
export const rgbHex = (r, g, b) => '#' + h2(r) + h2(g) + h2(b);

export function shade(c, amt) { // amt -1..1: negative darkens, positive lightens
  const p = parse(c); if (!p) return c || 'none';
  const t = amt < 0 ? 0 : 255, f = Math.abs(amt);
  return hex({ r: p.r + (t - p.r) * f, g: p.g + (t - p.g) * f, b: p.b + (t - p.b) * f, a: p.a });
}
export function alpha(c, a) { const p = parse(c); if (!p) return c || 'none'; return hex({ ...p, a }); }
export function mix(a, b, t) {
  const p = parse(a), q = parse(b); if (!p || !q) return a || b || 'none';
  return hex({ r: p.r + (q.r - p.r) * t, g: p.g + (q.g - p.g) * t, b: p.b + (q.b - p.b) * t, a: p.a + (q.a - p.a) * t });
}
export function luminance(c) {
  const p = parse(c); if (!p) return 1;
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
}
export const readable = c => luminance(c) > 0.45 ? '#1f2328' : '#ffffff';
export const isColor = v => typeof v === 'string' && !!parse(v);

// Perceptual-ish distance in RGB (weighted), 0..~765
export function dist(a, b) {
  const rm = (a.r + b.r) / 2, dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
