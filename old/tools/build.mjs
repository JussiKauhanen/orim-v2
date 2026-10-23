// Bundles orim into one self-contained HTML file: dist/orim.html
// It runs from file:// with no server and no network (fonts fall back to system fonts offline).
//
//   node tools/build.mjs
//
// The script order comes from the <script src> tags in index.html, so adding a file
// there is all that is needed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const html = read('index.html');

const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const icons = read('assets/icons.json').replace(/<\//g, '<\\/');

let out = html
  .replace(/<link rel="stylesheet" href="css\/orim\.css">/, () => '<style>\n' + read('css/orim.css') + '\n</style>')
  .replace(/<link rel="icon"[^>]*>/, () => {
    const svg = read('assets/favicon.svg');
    return '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + encodeURIComponent(svg) + '">';
  });

let first = true;
out = out.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  let tag = '<script>\n' + safeScript(read(src)) + '\n</script>';
  if (first) { first = false; tag = '<script id="iconData" type="application/json">' + icons + '</script>\n  ' + tag; }
  return tag;
});

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/orim.html'), out);
console.log('Wrote dist/orim.html (' + Math.round(out.length / 1024) + ' KB)');
