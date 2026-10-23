// Converts the Microsoft icon packs from the old project (old/assets/icons.json) into kinds:
// library/kinds/azure.json, power-platform.json, dynamics.json. Run: node tools/import-ms-icons.mjs
// Microsoft permits use of these icons in architecture diagrams, training and documentation.
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../old/assets/icons.json', import.meta.url)));
const PACKS = { azure: ['az', 'azure', 'Azure'], pp: ['pp', 'power-platform', 'Power Platform'], d365: ['d365', 'dynamics', 'Dynamics 365'] };

function convert(svg, uidTag) {
  const vb = /viewBox="([^"]+)"/.exec(svg);
  // some packs (Dynamics 365) only give width/height
  const wh = /<svg[^>]*\swidth="([\d.]+)(?:px)?"[^>]*\sheight="([\d.]+)(?:px)?"/.exec(svg);
  const viewBox = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : wh ? [0, 0, +wh[1], +wh[2]] : [0, 0, 18, 18];
  let body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  // inline <style> class rules
  const rules = {};
  body = body.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_, css) => {
    css = css.replace(/<!\[CDATA\[|\]\]>/g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const sel of m[1].split(',')) { const c = sel.trim().replace(/^\./, ''); rules[c] = (rules[c] || '') + m[2].trim().replace(/;?$/, ';'); }
    return '';
  });
  body = body.replace(/\sclass="([^"]+)"/g, (_, cls) => { const st = cls.split(/\s+/).map(c => rules[c] || '').join(''); return st ? ` style="${st}"` : ''; });
  body = body.replace(/<metadata[\s\S]*?<\/metadata>/g, '').replace(/<title>[\s\S]*?<\/title>/g, '').replace(/\s(inkscape|sodipodi):[\w-]+="[^"]*"/g, '').replace(/<sodipodi:[^>]*\/>/g, '');
  // unique ids per instance
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`id="${esc}"`, 'g'), `id="${id}-${uidTag}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${id}-${uidTag})`)
      .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${id}-${uidTag}"`);
  }
  body = body.replace(/\s+/g, ' ').replace(/'/g, '"');
  if (/[{}]/.test(body.replace(new RegExp(`-${uidTag}`, 'g'), ''))) return null;
  return { viewBox, body: body.split(`-${uidTag}`).join('-{uid}') };
}

for (const pack of src.packs) {
  const [prefix, file, label] = PACKS[pack.id];
  const out = [];
  for (const ic of pack.icons) {
    const c = convert(ic.s, 'UIDX');
    if (!c) { console.warn('skip', ic.id); continue; }
    const words = `${ic.t} ${ic.c || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    out.push({
      id: `${prefix}-${ic.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/-$/, ''),
      name: ic.t, category: file, pack: label, group: ic.c || label,
      tags: [...new Set([label.toLowerCase(), ...words])].slice(0, 12),
      description: `${label} icon: ${ic.t}${ic.c && ic.c !== label ? ' (' + ic.c + ')' : ''}. Official colours, keep proportions.`,
      size: [48, Math.round(48 * c.viewBox[3] / c.viewBox[2])], viewBox: c.viewBox, aspect: 'meet', fixedColors: true,
      style: { fill: 'none', stroke: 'none', strokeWidth: 0 },
      svg: c.body,
      textBox: ['-50', 'h+4', 'w+100', '30'], text: { size: 13, color: '#1f2328', valign: 'top' },
    });
  }
  writeFileSync(new URL(`../library/kinds/${file}.json`, import.meta.url), JSON.stringify(out));
  console.log(file, out.length);
}
