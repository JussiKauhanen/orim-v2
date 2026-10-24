// Image choice and a crop in original image coordinates. Nothing edits the doc here.
export function initReplicateImage(dialog) {
  const $ = s => dialog.querySelector(s), select = $('#repImageSelect'), image = $('#repPreview');
  const surface = $('#repCropSurface'), overlay = $('#repCropOverlay'), hint = $('#repCropHint');
  let choices = [], loaded = null, src = '', box = full(), version = 0, drag = null;
  function full() { return { x: 0, y: 0, w: 1, h: 1 }; }
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  function pixels() {
    const w = loaded.naturalWidth, h = loaded.naturalHeight;
    const x = Math.min(w - 1, Math.round(box.x * w)), y = Math.min(h - 1, Math.round(box.y * h));
    return { x, y, w: Math.max(1, Math.min(w - x, Math.round(box.w * w))), h: Math.max(1, Math.min(h - y, Math.round(box.h * h))) };
  }
  function draw() {
    if (!loaded) return;
    const x = box.x * 100, y = box.y * 100, w = box.w * 100, h = box.h * 100;
    overlay.innerHTML = `<path d="M0 0H100V100H0Z M${x} ${y}h${w}v${h}h${-w}Z" fill="#0007" fill-rule="evenodd"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/>${[['nw', x, y], ['ne', x + w, y], ['sw', x, y + h], ['se', x + w, y + h]].map(([corner, cx, cy]) => `<rect data-corner="${corner}" x="${cx - 1}" y="${cy - 1}" width="2" height="2" fill="#fff" stroke="#4f6bff" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}`;
    const p = pixels(); hint.textContent = `${p.w} × ${p.h} px · Drag to crop`;
    surface.setAttribute('aria-label', `Crop area, ${p.w} by ${p.h} pixels. Drag a rectangle to select. Arrow keys move; Alt and arrow keys resize.`);
    $('#repCropReset').disabled = box.x === 0 && box.y === 0 && box.w === 1 && box.h === 1;
  }
  function clear() {
    version++; drag = null; loaded = null; src = ''; box = full(); image.removeAttribute('src');
    surface.hidden = true; $('#repGo').disabled = true; hint.textContent = 'Choose an image, then drag to select an area.';
    $('#repCropEmpty').hidden = false; $('#repCropReset').disabled = true;
  }
  async function load(source) {
    clear(); const request = version;
    if (!source) return;
    hint.textContent = 'Loading image…';
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = source; });
      if (request !== version) return;
      loaded = img; src = source; image.src = source;
      surface.hidden = false; $('#repCropEmpty').hidden = true; $('#repGo').disabled = false; draw();
    } catch (_) { if (request === version) hint.textContent = 'Could not open this image. Choose another file.'; }
  }
  select.addEventListener('change', () => load(choices[select.value]?.src));
  $('#repFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    clear(); const request = version; hint.textContent = 'Opening image…';
    try {
      if (!file.type.startsWith('image/')) throw new Error();
      const source = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
      if (request !== version) return;
      choices.push({ src: source, name: file.name }); select.add(new Option(file.name, choices.length - 1)); select.value = String(choices.length - 1);
      await load(source);
    } catch (_) { if (request === version) hint.textContent = 'Choose an image file such as PNG, JPG or WebP.'; }
    e.target.value = '';
  });
  $('#repChooseFile').addEventListener('click', () => $('#repFile').click());
  $('#repCropReset').addEventListener('click', () => { box = full(); draw(); });
  function point(e) { const r = surface.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }; }
  surface.addEventListener('pointerdown', e => {
    if (!loaded || e.button !== 0) return;
    e.preventDefault(); surface.focus();
    const p = point(e), corner = e.target.dataset.corner;
    const inside = p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
    const cropped = box.w < 1 || box.h < 1;
    drag = { start: p, before: { ...box }, mode: corner || (inside && cropped ? 'move' : 'draw') };
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = point(e), b = drag.before, mode = drag.mode;
    if (mode === 'move') box = { ...b, x: clamp(b.x + p.x - drag.start.x, 0, 1 - b.w), y: clamp(b.y + p.y - drag.start.y, 0, 1 - b.h) };
    else {
      const anchor = mode === 'draw' ? drag.start : { x: mode.includes('w') ? b.x + b.w : b.x, y: mode.includes('n') ? b.y + b.h : b.y };
      box = { x: Math.min(anchor.x, p.x), y: Math.min(anchor.y, p.y), w: Math.abs(p.x - anchor.x), h: Math.abs(p.y - anchor.y) };
    }
    draw();
  });
  function end(e) {
    if (!drag) return;
    if (e.type === 'pointercancel' || box.w * loaded.naturalWidth < 2 || box.h * loaded.naturalHeight < 2) box = drag.before;
    drag = null; draw();
  }
  surface.addEventListener('pointerup', end); surface.addEventListener('pointercancel', end); surface.addEventListener('lostpointercapture', end);
  surface.addEventListener('keydown', e => {
    if (!loaded || !e.key.startsWith('Arrow')) return;
    e.preventDefault(); e.stopPropagation();
    const n = e.shiftKey ? 10 : 1, dx = (e.key === 'ArrowRight' ? n : e.key === 'ArrowLeft' ? -n : 0) / loaded.naturalWidth, dy = (e.key === 'ArrowDown' ? n : e.key === 'ArrowUp' ? -n : 0) / loaded.naturalHeight;
    if (e.altKey) { box.w = clamp(box.w + dx, 1 / loaded.naturalWidth, 1 - box.x); box.h = clamp(box.h + dy, 1 / loaded.naturalHeight, 1 - box.y); }
    else { box.x = clamp(box.x + dx, 0, 1 - box.w); box.y = clamp(box.y + dy, 0, 1 - box.h); }
    draw();
  });
  return {
    open(doc, initialSource) {
      clear(); choices = [];
      if (doc.source?.src) choices.push({ src: doc.source.src, name: 'Original source image' });
      for (const [i, el] of doc.elements.filter(e => e.kind === 'image' && e.props?.src).entries()) {
        if (!choices.some(c => c.src === el.props.src)) choices.push({ src: el.props.src, name: el.text?.content || `Canvas image ${i + 1}` });
      }
      if (initialSource && !choices.some(c => c.src === initialSource)) choices.push({ src: initialSource, name: 'Uploaded image' });
      select.replaceChildren(new Option('Choose an image…', ''));
      choices.forEach((c, i) => select.add(new Option(c.name, i)));
      select.value = ''; if (initialSource) { select.value = String(choices.findIndex(c => c.src === initialSource)); load(initialSource); }
    },
    source() {
      if (!loaded) throw new Error('Choose an image first.');
      const p = pixels();
      if (!p.x && !p.y && p.w === loaded.naturalWidth && p.h === loaded.naturalHeight) return src;
      const canvas = document.createElement('canvas'); canvas.width = p.w; canvas.height = p.h;
      canvas.getContext('2d').drawImage(loaded, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
      return canvas.toDataURL('image/png');
    },
  };
}
