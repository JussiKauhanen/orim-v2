// Safe expression evaluator and template processor for element kinds.
// Kinds are plain JSON (often written by the AI), so their SVG templates are evaluated
// here instead of with eval(): only arithmetic, comparisons, ternaries, a few math and
// colour functions, and the variables passed in scope.

import { shade, alpha, mix, readable } from './color.js';

const FUNCS = {
  min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  atan2: Math.atan2, pow: Math.pow, hypot: Math.hypot,
  clamp: (v, a, b) => Math.min(Math.max(v, a), b),
  lerp: (a, b, t) => a + (b - a) * t,
  rad: d => d * Math.PI / 180,
  shade, alpha, mix, readable,
  // pick(i, a, b, c...) → the i-th of the rest, cycling; handy for repeated colours
  pick: (i, ...xs) => xs.length ? xs[((Math.floor(i) % xs.length) + xs.length) % xs.length] : 0,
  str: v => String(v),
};
const CONSTS = { PI: Math.PI, true: true, false: false };

function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.eE]/.test(src[j])) { if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '-' || src[j + 1] === '+')) j++; j++; }
      out.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; s += src[j]; j++; }
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||', '**'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%<>!?:(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('Unexpected "' + c + '" in expression');
  }
  return out;
}

const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 7 };

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p], next = () => tokens[p++];
  const expect = v => { const t = next(); if (!t || t.v !== v) throw new Error('Expected ' + v); };
  function primary() {
    const t = next();
    if (!t) throw new Error('Unexpected end');
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (peek() && peek().v === '(') {
        next(); const args = [];
        if (peek() && peek().v !== ')') { do { args.push(ternary()); } while (peek() && peek().v === ',' && next()); }
        expect(')'); return { k: 'call', f: t.v, args };
      }
      return { k: 'var', n: t.v };
    }
    if (t.v === '(') { const e = ternary(); expect(')'); return e; }
    if (t.v === '-') return { k: 'neg', e: unary() };
    if (t.v === '+') return unary();
    if (t.v === '!') return { k: 'not', e: unary() };
    throw new Error('Unexpected ' + t.v);
  }
  function unary() { return primary(); }
  function binary(minPrec) {
    let left = unary();
    for (;;) {
      const t = peek(); if (!t || t.t !== 'op' || !(t.v in PREC) || PREC[t.v] < minPrec) break;
      next(); const right = binary(PREC[t.v] + (t.v === '**' ? 0 : 1));
      left = { k: 'bin', o: t.v, a: left, b: right };
    }
    return left;
  }
  function ternary() {
    const c = binary(1);
    if (peek() && peek().v === '?') { next(); const a = ternary(); expect(':'); const b = ternary(); return { k: 'tern', c, a, b }; }
    return c;
  }
  const e = ternary();
  if (p < tokens.length) throw new Error('Unexpected ' + tokens[p].v);
  return e;
}

function lookup(scope, name) {
  if (name in CONSTS) return CONSTS[name];
  if (name.includes('.')) { let v = scope; for (const part of name.split('.')) { if (v == null) return 0; v = v[part]; } return v ?? 0; }
  const v = scope[name]; return v === undefined ? 0 : v;
}

function run(n, s) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'var': return lookup(s, n.n);
    case 'neg': return -run(n.e, s);
    case 'not': return !run(n.e, s);
    case 'tern': return run(n.c, s) ? run(n.a, s) : run(n.b, s);
    case 'call': { const f = FUNCS[n.f]; if (!f) throw new Error('Unknown function ' + n.f); return f(...n.args.map(a => run(a, s))); }
    case 'bin': {
      if (n.o === '&&') return run(n.a, s) && run(n.b, s);
      if (n.o === '||') return run(n.a, s) || run(n.b, s);
      const a = run(n.a, s), b = run(n.b, s);
      switch (n.o) {
        case '+': return (typeof a === 'string' || typeof b === 'string') ? String(a) + String(b) : a + b;
        case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : a / b; case '%': return b === 0 ? 0 : a % b;
        case '**': return Math.pow(a, b);
        case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
        case '==': return a == b; case '!=': return a != b; // eslint-disable-line eqeqeq
      }
    }
  }
  return 0;
}

const cache = new Map();
export function compile(src) {
  let c = cache.get(src);
  if (!c) { c = parse(tokenize(String(src))); if (cache.size > 5000) cache.clear(); cache.set(src, c); }
  return c;
}

export function evaluate(src, scope) {
  if (typeof src === 'number') return src;
  try { return run(compile(src), scope); } catch (e) { return 0; }
}

export const num = (src, scope) => { const v = +evaluate(src, scope); return Number.isFinite(v) ? v : 0; };

function fmt(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v).replace(/[<>"]/g, '');
}

// Find the index of the closing "}" for a "{" at i, honouring quotes and nesting.
function closeBrace(t, i) {
  let depth = 0, q = null;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { if (depth > 0) q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

// Template: {expr} substitutes; {#repeat i count}…{/repeat} and {#if cond}…{else}…{/if} blocks.
export function template(t, scope) {
  let out = '', i = 0;
  while (i < t.length) {
    const o = t.indexOf('{', i);
    if (o < 0) { out += t.slice(i); break; }
    out += t.slice(i, o);
    if (t.startsWith('{#repeat ', o)) {
      const head = t.slice(o, t.indexOf('}', o) + 1);
      const m = /^\{#repeat\s+([A-Za-z_]\w*)\s+(.+)\}$/.exec(head);
      const end = matchBlock(t, o + head.length, '{#repeat ', '{/repeat}');
      const body = t.slice(o + head.length, end);
      if (m) { const n = Math.min(500, Math.max(0, Math.floor(num(m[2], scope)))); for (let k = 0; k < n; k++) out += template(body, { ...scope, [m[1]]: k }); }
      i = end + '{/repeat}'.length; continue;
    }
    if (t.startsWith('{#if ', o)) {
      const head = t.slice(o, closeBrace(t, o) + 1);
      const cond = head.slice(5, -1);
      const end = matchBlock(t, o + head.length, '{#if ', '{/if}');
      const body = t.slice(o + head.length, end);
      const parts = splitElse(body);
      out += template(evaluate(cond, scope) ? parts[0] : parts[1], scope);
      i = end + '{/if}'.length; continue;
    }
    const c = closeBrace(t, o);
    if (c < 0) { out += t.slice(o); break; }
    out += fmt(evaluate(t.slice(o + 1, c), scope));
    i = c + 1;
  }
  return out;
}

function matchBlock(t, from, open, close) {
  let depth = 1, i = from;
  while (i < t.length) {
    const a = t.indexOf(open, i), b = t.indexOf(close, i);
    if (b < 0) return t.length;
    if (a >= 0 && a < b) { depth++; i = a + open.length; continue; }
    depth--; if (depth === 0) return b; i = b + close.length;
  }
  return t.length;
}

function splitElse(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('{#if ', i)) depth++;
    else if (body.startsWith('{/if}', i)) depth--;
    else if (depth === 0 && body.startsWith('{else}', i)) return [body.slice(0, i), body.slice(i + 6)];
  }
  return [body, ''];
}
