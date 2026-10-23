// Screen-only neutral colours. The saved scene and export renderer keep their originals.
import { getKind } from './kinds.js';
import { parse, hex } from './color.js';

const neutral = c => c && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 18;
const light = c => neutral(c) && Math.min(c.r, c.g, c.b) >= 235;

function screenColour(value, ink = false) {
  const c = parse(value);
  if (!neutral(c)) return value;
  const bright = (c.r + c.g + c.b) / 3;
  const replacement = ink ? (bright < 145 ? '#d9dfe9' : null) : (bright >= 220 ? '#303640' : null);
  return replacement ? hex({ ...parse(replacement), a: c.a }) : value;
}

export function displayElement(el) {
  const kind = getKind(el.kind);
  if (el.kind === 'image' || el.ghost) return el;
  const style = { ...kind?.style, ...el.style };
  const fill = parse(style.fill);
  const onDark = !fill || (neutral(fill) && Math.min(fill.r, fill.g, fill.b) >= 220);
  if (!kind?.fixedColors) {
    if (onDark) for (const key of ['fill', 'fill2']) if (style[key]) style[key] = screenColour(style[key]);
    if (style.stroke && onDark) style.stroke = screenColour(style.stroke, true);
  }
  const text = { ...kind?.text, ...el.text };
  if (onDark) text.color = screenColour(text.color || '#1f2328', true);
  if (text.bg) text.bg = screenColour(text.bg);
  return { ...el, style, text };
}

export function displayDoc(doc, enabled = true) {
  if (!enabled || document.documentElement.dataset.theme !== 'dark' || !light(parse(doc.page.background))) return doc;
  const elements = doc.elements.map(displayElement);
  const pattern = doc.page.pattern;
  const screenPattern = pattern && neutral(parse(pattern.color)) ? { ...pattern, color: '#353c47' } : pattern;
  return { ...doc, page: { ...doc.page, background: '#1c2027', pattern: screenPattern }, elements, byId: new Map(elements.map(e => [e.id, e])) };
}
