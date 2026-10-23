// Text: font loading (Google Fonts on demand), measuring, wrapping and SVG output.
// Text is drawn as SVG <text> with our own line breaking so the same markup renders on
// screen, in exports and in the rasteriser the AI loop uses to compare against the source.

export const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'system-ui'];
export const SUGGESTED_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Nunito Sans', 'DM Sans', 'Manrope', 'Work Sans', 'Source Sans 3', 'IBM Plex Sans', 'Noto Sans', 'Rubik', 'Figtree', 'Plus Jakarta Sans', 'Space Grotesk', 'Outfit', 'Raleway', 'Oswald', 'Bebas Neue', 'Barlow Condensed', 'Fjalla One', 'Archivo Narrow', 'Merriweather', 'Playfair Display', 'Source Serif 4', 'Lora', 'Caveat', 'Patrick Hand', 'Kalam', 'Gochi Hand', 'Shadows Into Light', 'Permanent Marker', 'Fira Code', 'JetBrains Mono', 'Roboto Mono'];
const FALLBACK = '"Segoe UI", system-ui, -apple-system, sans-serif';

const fontCss = new Map();      // family -> Promise<css text | null>
const listeners = new Set();
export const onFontsChanged = fn => listeners.add(fn);
let notifyTimer = 0;
const notify = () => { clearTimeout(notifyTimer); notifyTimer = setTimeout(() => { measureCache.clear(); listeners.forEach(f => f()); }, 30); };

export const isSystemFont = f => !f || SYSTEM_FONTS.some(s => s.toLowerCase() === f.toLowerCase()) || /^(sans-serif|serif|monospace|cursive)$/i.test(f);

// Google rejects a request naming any weight the family lacks, so ask for each weight
// on its own and keep whatever exists.
async function fetchCss(family) {
  const fam = encodeURIComponent(family).replace(/%20/g, '+');
  const get = q => fetch(`https://fonts.googleapis.com/css2?family=${fam}${q}&display=swap`).then(r => r.ok ? r.text() : '').catch(() => '');
  // Remember which request worked per family, so failed probes happen once per browser.
  const KEY = 'orim.fontq.' + family;
  let known = null; try { known = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
  if (known) { const css = (await Promise.all(known.map(get))).filter(Boolean).join('\n'); if (css) return css; }
  // Variable fonts answer one range request; static fonts need weight-by-weight probing.
  for (const q of [':ital,wght@0,100..900;1,100..900', ':wght@100..900']) { const css = await get(q); if (css) { try { localStorage.setItem(KEY, JSON.stringify([q])); } catch (_) {} return css; } }
  const qs = [...[300, 400, 500, 600, 700, 800].map(w => `:wght@${w}`), ':ital,wght@1,400', ':ital,wght@1,700'];
  const parts = await Promise.all(qs.map(get));
  const ok = qs.filter((_, i) => parts[i]);
  let css = parts.filter(Boolean).join('\n');
  if (!css) { css = await get(''); ok.push(''); }
  try { localStorage.setItem(KEY, JSON.stringify(ok)); } catch (_) {}
  return css || null;
}

// Load a font family into the page. Resolves when usable (or when we give up).
export function ensureFont(family) {
  if (isSystemFont(family)) return Promise.resolve(null);
  if (fontCss.has(family)) return fontCss.get(family);
  const p = fetchCss(family).then(async css => {
    if (!css) return null;
    const st = document.createElement('style'); st.dataset.font = family; st.textContent = css; document.head.appendChild(st);
    try { await Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 16px "${family}"`))); } catch (_) {}
    notify();
    return css;
  });
  fontCss.set(family, p);
  return p;
}
export const fontCssFor = family => fontCss.get(family) || Promise.resolve(null);
export const loadedFonts = () => [...fontCss.keys()];

export function fontStack(family) {
  if (!family) return FALLBACK;
  return `"${family}", ${/mono|code/i.test(family) ? 'monospace' : /serif|georgia|times|merriweather|playfair|lora/i.test(family) && !/sans/i.test(family) ? 'serif' : FALLBACK}`;
}

// ---------- measuring ----------
const ctx = (typeof document !== 'undefined') ? document.createElement('canvas').getContext('2d') : null;
const measureCache = new Map();
function fontString(family, size, weight, italic) { return `${italic ? 'italic ' : ''}${weight || 400} ${size}px ${fontStack(family)}`; }
export function measure(str, family, size, weight, italic, spacing = 0) {
  const k = str + '|' + family + '|' + size + '|' + weight + '|' + italic + '|' + spacing;
  let v = measureCache.get(k);
  if (v === undefined) {
    ctx.font = fontString(family, size, weight, italic);
    v = ctx.measureText(str).width + spacing * str.length;
    if (measureCache.size > 20000) measureCache.clear();
    measureCache.set(k, v);
  }
  return v;
}
const metricCache = new Map();
function metrics(family, size, weight) {
  const k = family + '|' + weight;
  let m = metricCache.get(k);
  if (!m) {
    ctx.font = fontString(family, 100, weight, false);
    const t = ctx.measureText('Hg');
    m = { asc: (t.fontBoundingBoxAscent ?? 92) / 100, desc: (t.fontBoundingBoxDescent ?? 24) / 100 };
    metricCache.set(k, m);
  }
  return { asc: m.asc * size, desc: m.desc * size };
}
onFontsChanged(() => metricCache.clear());

// ---------- markup → runs ----------
// Paragraphs split on newlines. "# " / "## " headings, "- " bullets, **bold**, *italic*.
function parseParagraph(p, base) {
  let size = base.size, weight = base.weight, prefix = '';
  if (/^#\s/.test(p)) { p = p.slice(2); size *= base.h1 || 1.4; weight = Math.max(700, weight); }
  else if (/^##\s/.test(p)) { p = p.slice(3); size *= base.h2 || 1.18; weight = Math.max(700, weight); }
  else if (/^[-•]\s/.test(p)) { p = p.slice(2); prefix = '• '; }
  const runs = []; let bold = false, ital = false, buf = '';
  const flush = () => { if (buf) runs.push({ t: buf, weight: bold ? Math.max(700, weight + 300) : weight, italic: ital || base.italic }); buf = ''; };
  const s = prefix + p;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '*' && s[i + 1] === '*') { flush(); bold = !bold; i++; continue; }
    if (s[i] === '*' && (ital || /\S/.test(s[i + 1] || ''))) { flush(); ital = !ital; continue; }
    buf += s[i];
  }
  flush();
  return { runs, size };
}

// Layout text into lines within maxW. Returns { lines, width, height }.
export function layout(t, maxW) {
  const content = t.upper ? String(t.content || '').toUpperCase() : String(t.content || '');
  const base = { size: t.size || 16, weight: t.weight || 400, italic: !!t.italic, h1: t.h1, h2: t.h2 };
  const lh = t.lineHeight || 1.25, sp = t.letterSpacing || 0, fam = t.font;
  const lines = [];
  const wrap = t.wrap !== false;
  for (const para of content.split('\n')) {
    const { runs, size } = parseParagraph(para, base);
    // split runs into words keeping spaces attached
    const words = [];
    for (const r of runs) for (const piece of r.t.split(/(\s+)/)) if (piece) words.push({ ...r, t: piece, space: /^\s+$/.test(piece) });
    let line = { runs: [], width: 0, size };
    const push = () => {
      while (line.runs.length && line.runs[line.runs.length - 1].space) { line.width -= line.runs.pop().w; }
      lines.push(line); line = { runs: [], width: 0, size };
    };
    for (const w of words) {
      const ww = measure(w.t, fam, size, w.weight, w.italic, sp);
      if (w.space && !line.runs.length && lines.length && wrap) continue; // no leading spaces on wrapped lines
      if (wrap && !w.space && line.runs.length && line.width + ww > maxW + 0.5) push();
      if (wrap && !w.space && !line.runs.length && ww > maxW + 0.5 && w.t.length > 1) {
        // a single word wider than the box: break it by characters
        let chunk = '';
        for (const ch of w.t) {
          const cw = measure(chunk + ch, fam, size, w.weight, w.italic, sp);
          if (cw > maxW && chunk) { line.runs.push({ ...w, t: chunk, w: measure(chunk, fam, size, w.weight, w.italic, sp) }); line.width += line.runs[line.runs.length - 1].w; push(); chunk = ch; }
          else chunk += ch;
        }
        if (chunk) { const cw = measure(chunk, fam, size, w.weight, w.italic, sp); line.runs.push({ ...w, t: chunk, w: cw }); line.width += cw; }
        continue;
      }
      line.runs.push({ ...w, w: ww }); line.width += ww;
    }
    push();
  }
  let height = 0, width = 0;
  for (const l of lines) { l.h = l.size * lh; height += l.h; width = Math.max(width, l.width); }
  return { lines, width, height };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Render text into box {x,y,w,h}. Returns an SVG string.
export function textSvg(t, box) {
  if (!t || t.content == null || t.content === '') return '';
  const pad = t.pad ?? 0;
  const bx = box.x + pad, by = box.y + pad, bw = Math.max(1, box.w - pad * 2), bh = box.h - pad * 2;
  const L = layout(t, bw);
  const align = t.align || 'center', valign = t.valign || 'middle';
  let y = valign === 'top' ? by : valign === 'bottom' ? by + bh - L.height : by + (bh - L.height) / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const x = align === 'left' ? bx : align === 'right' ? bx + bw : bx + bw / 2;
  const fam = fontStack(t.font).replace(/"/g, "'");
  let out = '';
  for (const l of L.lines) {
    if (l.runs.length) {
      const m = metrics(t.font, l.size, t.weight || 400);
      const base = y + (l.h - (m.asc + m.desc)) / 2 + m.asc;
      out += `<text x="${r2(x)}" y="${r2(base)}" text-anchor="${anchor}" font-family="${fam}" font-size="${r2(l.size)}" fill="${t.color || '#1f2328'}"${t.letterSpacing ? ` letter-spacing="${t.letterSpacing}"` : ''}${t.decoration ? ` text-decoration="${t.decoration}"` : ''}${t.opacity != null && t.opacity < 1 ? ` opacity="${t.opacity}"` : ''} xml:space="preserve">`;
      for (const r of l.runs) out += `<tspan font-weight="${r.weight}"${r.italic ? ' font-style="italic"' : ''}>${esc(r.t)}</tspan>`;
      out += '</text>';
    }
    y += l.h;
  }
  return out;
}
const r2 = v => Math.round(v * 100) / 100;
