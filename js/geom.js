// Geometry: element bounds, attachment points and connector routing.

import { getKind, scopeFor, outline } from './kinds.js';

export const rad = d => d * Math.PI / 180;
export function rotatePt(x, y, cx, cy, deg) {
  if (!deg) return [x, y];
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
// local (0..w,0..h) → world
export function toWorld(el, lx, ly) { return rotatePt(el.x + lx, el.y + ly, el.x + el.w / 2, el.y + el.h / 2, el.rot || 0); }
export function toLocal(el, wx, wy) { const [x, y] = rotatePt(wx, wy, el.x + el.w / 2, el.y + el.h / 2, -(el.rot || 0)); return [x - el.x, y - el.y]; }

export function bounds(el, doc) {
  if (el.kind === 'connector') {
    const pts = connectorPoints(el, doc).pts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  if (!el.rot) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const c = [[0, 0], [el.w, 0], [el.w, el.h], [0, el.h]].map(([x, y]) => toWorld(el, x, y));
  const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export function unionBounds(list) {
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of list) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Intersection of a ray from the centre (cx,cy) in direction (dx,dy) with an outline (local coords).
function rayOutline(o, cx, cy, dx, dy) {
  if (o.ellipse) {
    const a = o.w / 2, b = o.h / 2; const t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b) || 1);
    return [cx + dx * t, cy + dy * t];
  }
  let best = null, bt = Infinity;
  const P = o.poly;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - cx) * ey - (y1 - cy) * ex) / den, u = ((x1 - cx) * dy - (y1 - cy) * dx) / den;
    if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 && t < bt) { bt = t; best = [cx + dx * t, cy + dy * t]; }
  }
  return best || [cx, cy];
}

// Side normal for a normalized anchor on the box.
function sideNormal(ax, ay) {
  const d = [[ax, [-1, 0]], [1 - ax, [1, 0]], [ay, [0, -1]], [1 - ay, [0, 1]]];
  d.sort((a, b) => a[0] - b[0]);
  return d[0][1];
}

// Resolve an endpoint {id, ax, ay} | {x,y} to {x, y, nx, ny, el}.
// When ax/ay are missing the anchor is "auto": the side that faces `toward`.
export function endpoint(end, doc, toward) {
  if (!end) return { x: 0, y: 0, nx: 0, ny: 0 };
  const el = end.id && doc.byId ? doc.byId.get(end.id) : end.id ? doc.elements.find(e => e.id === end.id) : null;
  if (!el || el.kind === 'connector') return { x: end.x ?? 0, y: end.y ?? 0, nx: 0, ny: 0 };
  const kind = getKind(el.kind) || getKind('text');
  if (end.float && toward) {
    // floating: aim at the other end, leave the outline where that line crosses it
    const sc = scopeFor(el, kind), o = outline(el, kind, sc);
    const [tx, ty] = toLocal(el, toward[0], toward[1]), cx = el.w / 2, cy = el.h / 2;
    const [dx, dy] = [tx - cx, ty - cy];
    if (Math.hypot(dx, dy) > 0.01) {
      let [lx, ly] = rayOutline(o, cx, cy, dx, dy);
      const l = Math.hypot(dx, dy);
      if (end.gap) { lx += dx / l * end.gap; ly += dy / l * end.gap; }
      const [x, y] = toWorld(el, lx, ly);
      const [nx, ny] = rotatePt(dx / l, dy / l, 0, 0, el.rot || 0);
      return { x, y, nx, ny, el, float: true };
    }
  }
  let ax = end.ax, ay = end.ay;
  if (ax == null || ay == null) {
    const [tx, ty] = toward ? toLocal(el, toward[0], toward[1]) : [el.w / 2, el.h * 2];
    const dx = (tx - el.w / 2) / Math.max(el.w, 1), dy = (ty - el.h / 2) / Math.max(el.h, 1);
    if (Math.abs(dx) > Math.abs(dy)) { ax = dx > 0 ? 1 : 0; ay = 0.5; } else { ax = 0.5; ay = dy > 0 ? 1 : 0; }
  }
  const sc = scopeFor(el, kind);
  const o = outline(el, kind, sc);
  let lx = ax * el.w, ly = ay * el.h;
  const onEdge = ax <= 0.001 || ax >= 0.999 || ay <= 0.001 || ay >= 0.999;
  if (onEdge && !(o.poly && o.poly.length === 4 && o.poly[0][0] === 0 && o.poly[0][1] === 0 && o.poly[2][0] === el.w)) {
    // project onto the real outline along the ray from the centre
    const cx = el.w / 2, cy = el.h / 2;
    [lx, ly] = rayOutline(o, cx, cy, lx - cx, ly - cy);
  }
  if (end.gap) { const [nx0, ny0] = sideNormal(ax, ay); lx += nx0 * end.gap; ly += ny0 * end.gap; }
  let [nx, ny] = onEdge ? sideNormal(ax, ay) : [0, 0];
  [nx, ny] = rotatePt(nx, ny, 0, 0, el.rot || 0);
  const [x, y] = toWorld(el, lx, ly);
  return { x, y, nx, ny, el, ax, ay };
}

function centerOf(end, doc) {
  if (end && end.id) {
    const el = doc.byId ? doc.byId.get(end.id) : doc.elements.find(e => e.id === end.id);
    if (el) { if (end.ax != null && end.ay != null && !end.float) return toWorld(el, end.ax * el.w, end.ay * el.h); return [el.x + el.w / 2, el.y + el.h / 2]; }
  }
  return [end?.x ?? 0, end?.y ?? 0];
}

// Compute the connector path. Returns { d, pts (polyline approximation), start, end, startDir, endDir, mid }.
export function connectorPoints(c, doc) {
  const pts0 = c.points || [];
  const fromToward = pts0.length ? [pts0[0].x, pts0[0].y] : centerOf(c.to, doc);
  const toToward = pts0.length ? [pts0[pts0.length - 1].x, pts0[pts0.length - 1].y] : centerOf(c.from, doc);
  const a = endpoint(c.from, doc, fromToward), b = endpoint(c.to, doc, toToward);
  const route = c.route || 'straight';
  let segs; // array of path commands in absolute coords
  let poly = [];
  if (route === 'curved' && !pts0.length) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const k = (c.bend ?? 0.5) * dist;
    let an = [a.nx, a.ny], bn = [b.nx, b.ny];
    // free ends leave along the dominant axis, giving the usual S-curve
    const dx = b.x - a.x, dy = b.y - a.y, horiz = Math.abs(dx) >= Math.abs(dy);
    if (!an[0] && !an[1]) an = horiz ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
    if (!bn[0] && !bn[1]) bn = horiz ? [-(Math.sign(dx) || 1), 0] : [0, -(Math.sign(dy) || 1)];
    const c1 = [a.x + an[0] * k, a.y + an[1] * k], c2 = [b.x + bn[0] * k, b.y + bn[1] * k];
    segs = { type: 'cubic', p: [[a.x, a.y], c1, c2, [b.x, b.y]] };
    for (let i = 0; i <= 24; i++) poly.push(cubicAt(segs.p, i / 24));
  } else if (route === 'elbow') {
    poly = elbowRoute(a, b, pts0, c.elbowOffset);
    segs = { type: 'poly', p: poly, r: c.radius ?? 8 };
  } else if ((route === 'curved' || route === 'spline') && pts0.length) {
    const all = [[a.x, a.y], ...pts0.map(p => [p.x, p.y]), [b.x, b.y]];
    segs = { type: 'spline', p: all };
    poly = splinePoly(all);
  } else {
    poly = [[a.x, a.y], ...pts0.map(p => [p.x, p.y]), [b.x, b.y]];
    segs = { type: 'poly', p: poly, r: 0 };
  }
  const n = poly.length;
  const startDir = tangent(poly, 0), endDir = tangent(poly, n - 1);
  return { segs, pts: poly, start: [a.x, a.y], end: [b.x, b.y], startDir, endDir, mid: pointAt(poly, c.labelPos ?? 0.5), a, b };
}

const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
function cubicAt(p, t) {
  const u = 1 - t;
  return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
}
function tangent(poly, i) {
  if (poly.length < 2) return [1, 0];
  if (i === 0) { for (let j = 1; j < poly.length; j++) { const d = [poly[j][0] - poly[0][0], poly[j][1] - poly[0][1]]; if (Math.hypot(...d) > 0.5) return norm(...d); } return [1, 0]; }
  const L = poly.length - 1;
  for (let j = L - 1; j >= 0; j--) { const d = [poly[L][0] - poly[j][0], poly[L][1] - poly[j][1]]; if (Math.hypot(...d) > 0.5) return norm(...d); }
  return [1, 0];
}
export function pointAt(poly, t) {
  let total = 0; const seg = [];
  for (let i = 1; i < poly.length; i++) { const l = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); seg.push(l); total += l; }
  let target = total * t;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, target / seg[i]) : 0; return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * f, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * f]; }
    target -= seg[i];
  }
  return poly[0] || [0, 0];
}

function splinePoly(P) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    for (let s = 0; s < 12; s++) {
      const t = s / 12, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
export function splinePath(P) {
  let d = `M${f(P[0][0])},${f(P[0][1])}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

// Orthogonal route between two endpoints. Waypoints (if any) are visited with H/V moves.
function elbowRoute(a, b, pts, offset) {
  const m = 20;
  const dirA = (a.nx || a.ny) ? [a.nx, a.ny] : (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? [Math.sign(b.x - a.x) || 1, 0] : [0, Math.sign(b.y - a.y) || 1]);
  const dirB = (b.nx || b.ny) ? [b.nx, b.ny] : (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? [-(Math.sign(b.x - a.x) || 1), 0] : [0, -(Math.sign(b.y - a.y) || 1)]);
  if (pts.length) {
    const out = [[a.x, a.y]]; let cur = [a.x, a.y], horiz = dirA[0] !== 0;
    for (const p of [...pts.map(q => [q.x, q.y]), [b.x, b.y]]) {
      if (horiz) { out.push([p[0], cur[1]]); } else { out.push([cur[0], p[1]]); }
      out.push(p); cur = p; horiz = !horiz;
    }
    return simplify(out);
  }
  const hA = dirA[0] !== 0, hB = dirB[0] !== 0;
  const s = [a.x + dirA[0] * m, a.y + dirA[1] * m], e = [b.x + dirB[0] * m, b.y + dirB[1] * m];
  let mid;
  if (hA && hB) {
    let mx = offset != null ? offset : (a.x + b.x) / 2;
    if ((dirA[0] > 0 && mx < s[0]) || (dirA[0] < 0 && mx > s[0]) || (dirB[0] > 0 && mx < e[0]) || (dirB[0] < 0 && mx > e[0])) {
      // facing away: go around
      const my = offset != null ? offset : (a.y + b.y) / 2;
      mid = [s, [s[0], my], [e[0], my], e];
    } else mid = [[mx, a.y], [mx, b.y]];
  } else if (!hA && !hB) {
    let my = offset != null ? offset : (a.y + b.y) / 2;
    if ((dirA[1] > 0 && my < s[1]) || (dirA[1] < 0 && my > s[1]) || (dirB[1] > 0 && my < e[1]) || (dirB[1] < 0 && my > e[1])) {
      const mx = offset != null ? offset : (a.x + b.x) / 2;
      mid = [s, [mx, s[1]], [mx, e[1]], e];
    } else mid = [[a.x, my], [b.x, my]];
  } else if (hA) {
    const ok = (dirA[0] > 0 ? b.x >= s[0] : b.x <= s[0]) && (dirB[1] > 0 ? a.y >= e[1] : a.y <= e[1]);
    mid = ok ? [[b.x, a.y]] : [s, [s[0], e[1]], e];
  } else {
    const ok = (dirA[1] > 0 ? b.y >= s[1] : b.y <= s[1]) && (dirB[0] > 0 ? a.x >= e[0] : a.x <= e[0]);
    mid = ok ? [[a.x, b.y]] : [s, [e[0], s[1]], e];
  }
  return simplify([[a.x, a.y], ...mid, [b.x, b.y]]);
}
function simplify(P) {
  const out = [];
  for (const p of P) {
    const l = out[out.length - 1];
    if (l && Math.abs(l[0] - p[0]) < 0.01 && Math.abs(l[1] - p[1]) < 0.01) continue;
    if (out.length >= 2) { const q = out[out.length - 2]; if ((Math.abs(q[0] - l[0]) < 0.01 && Math.abs(l[0] - p[0]) < 0.01) || (Math.abs(q[1] - l[1]) < 0.01 && Math.abs(l[1] - p[1]) < 0.01)) { out[out.length - 1] = p; continue; } }
    out.push(p);
  }
  return out;
}

const f = v => Math.round(v * 100) / 100;
// Rounded polyline path
export function polyPath(P, r) {
  if (!P.length) return '';
  let d = `M${f(P[0][0])},${f(P[0][1])}`;
  for (let i = 1; i < P.length; i++) {
    if (r > 0 && i < P.length - 1) {
      const p = P[i], a = P[i - 1], b = P[i + 1];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, la / 2, lb / 2);
      const s = [p[0] + (a[0] - p[0]) / la * rr, p[1] + (a[1] - p[1]) / la * rr], e = [p[0] + (b[0] - p[0]) / lb * rr, p[1] + (b[1] - p[1]) / lb * rr];
      d += ` L${f(s[0])},${f(s[1])} Q${f(p[0])},${f(p[1])} ${f(e[0])},${f(e[1])}`;
    } else d += ` L${f(P[i][0])},${f(P[i][1])}`;
  }
  return d;
}

// Shorten the start/end of a connector geometry by `da`/`db` so arrowheads sit at the tip.
export function connectorPath(geo, da, db) {
  const s = geo.segs;
  if (s.type === 'cubic') {
    const p = s.p.map(q => q.slice());
    if (da) { p[0] = [p[0][0] + geo.startDir[0] * da, p[0][1] + geo.startDir[1] * da]; }
    if (db) { p[3] = [p[3][0] - geo.endDir[0] * db, p[3][1] - geo.endDir[1] * db]; }
    return `M${f(p[0][0])},${f(p[0][1])} C${f(p[1][0])},${f(p[1][1])} ${f(p[2][0])},${f(p[2][1])} ${f(p[3][0])},${f(p[3][1])}`;
  }
  if (s.type === 'spline') {
    const p = s.p.map(q => q.slice());
    if (da) p[0] = [p[0][0] + geo.startDir[0] * da, p[0][1] + geo.startDir[1] * da];
    if (db) { const L = p.length - 1; p[L] = [p[L][0] - geo.endDir[0] * db, p[L][1] - geo.endDir[1] * db]; }
    return splinePath(p);
  }
  const p = s.p.map(q => q.slice());
  if (da && p.length > 1) p[0] = [p[0][0] + geo.startDir[0] * da, p[0][1] + geo.startDir[1] * da];
  if (db && p.length > 1) { const L = p.length - 1; p[L] = [p[L][0] - geo.endDir[0] * db, p[L][1] - geo.endDir[1] * db]; }
  return polyPath(p, s.r || 0);
}

export function distToPoly(poly, x, y) {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const [x1, y1] = poly[i - 1], [x2, y2] = poly[i];
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l)) : 0;
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}
