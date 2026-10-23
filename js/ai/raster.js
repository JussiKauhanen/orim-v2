// Rasterise a scene to a canvas (fonts embedded so text renders exactly as on screen).

import { sceneSvg } from '../render.js';
import { fontCssFor, ensureFont, isSystemFont } from '../text.js';

const embedded = new Map(); // family -> Promise<css with data: urls>

async function toDataUrl(url) {
  const r = await fetch(url); const b = await r.blob();
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
}
async function embedFamily(family) {
  if (embedded.has(family)) return embedded.get(family);
  const p = (async () => {
    await ensureFont(family);
    const css = await fontCssFor(family); if (!css) return '';
    // keep latin + latin-ext subsets only
    const blocks = css.split(/(?=\/\*)/).filter(b => /\/\*\s*latin(-ext)?\s*\*\//.test(b) || !/\/\*/.test(b));
    let out = blocks.join('\n');
    const urls = [...new Set(out.match(/url\((https:[^)]+)\)/g) || [])].map(u => u.slice(4, -1));
    for (const u of urls) { try { out = out.split(u).join(await toDataUrl(u)); } catch (_) {} }
    return out;
  })();
  embedded.set(family, p);
  return p;
}

export function fontsOf(doc) {
  const s = new Set();
  for (const e of doc.elements) if (e.text && e.text.font && !isSystemFont(e.text.font)) s.add(e.text.font);
  return [...s];
}

export async function svgWithFonts(doc, opts = {}) {
  const css = (await Promise.all(fontsOf(doc).map(embedFamily))).join('\n');
  return sceneSvg(doc, { fontCss: css, ...opts });
}

export async function renderToCanvas(doc, { scale = 1, width, height } = {}) {
  const svg = await svgWithFonts(doc, { scale });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('render failed')); img.src = url; });
    if (img.decode) await img.decode().catch(() => {});
    const W = Math.round(width || doc.page.w * scale), H = Math.round(height || doc.page.h * scale);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.drawImage(img, 0, 0, W, H);
    return c;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
