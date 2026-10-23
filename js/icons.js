// Small shared SVG vocabulary for the app controls.
const paths = {
  text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="8"/>',
  diamond: '<path d="m12 3 9 9-9 9-9-9Z"/>',
  note: '<path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 21v-6h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-5 5 6"/>',
  draw: '<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/><path d="m4 14 5 5"/>',
  templates: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  expand: '<path d="M9 4H4v5M15 20h5v-5M4 4l6 6m10 10-6-6"/>',
  collapse: '<path d="m8 5 7 7-7 7"/><path d="M20 4v16"/>',
  'panel-open': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m4-11 3 3-3 3"/>',
  'panel-close': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-11-3 3 3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  map: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16m8-16v16M3 10h18"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  front: '<rect x="8" y="3" width="13" height="13" rx="2"/><path d="M8 8H3v13h13v-5"/>',
  back: '<rect x="3" y="8" width="13" height="13" rx="2"/><path d="M8 8V3h13v13h-5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};

export function icon(name, className = '') {
  const attrs = 'aria-hidden="true" focusable="false" viewBox="0 0 24 24"';
  if (name === 'ai') return `<svg class="ui-icon ai-mark ${className}" ${attrs}><rect width="24" height="24" rx="6.5" fill="#ffd23f"/><path d="M10.25 8.15Q11.5 12.5 15.85 13.75Q11.5 15 10.25 19.35Q9 15 4.65 13.75Q9 12.5 10.25 8.15Z" fill="#1a1a1a"/><path d="M16.6 4.8Q17.2 6.8 19.2 7.4Q17.2 8 16.6 10Q16 8 14 7.4Q16 6.8 16.6 4.8Z" fill="#1a1a1a"/></svg>`;
  return `<svg class="ui-icon ${className}" ${attrs} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.templates}</svg>`;
}

export function welcomeDoodle() {
  return `<svg viewBox="0 0 320 170" fill="none" aria-hidden="true" focusable="false">
    <g stroke="#f47595" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M68 73C57 21 116 9 134 58m-6-3 6 3 1-7M182 65c4-21 20-35 46-30m-5-4 5 4-6 4M150 107c-7 51 69 52 87 7m-6 2 6-2 2 7"/>
    </g>
    <path d="m24 67 69-2 2 51-69 3Z" fill="#7791ed"/>
    <path d="m156 52 35 32-34 37-35-35Z" fill="#f5d76c"/>
    <rect x="223" y="46" width="74" height="35" rx="17.5" transform="rotate(-3 223 46)" fill="#9bbfa0"/>
    <rect x="221" y="102" width="75" height="36" rx="17" transform="rotate(3 221 102)" fill="#ed9396"/>
    <g stroke="#36445d" stroke-width="2" stroke-linecap="round" opacity=".8">
      <path d="M34 81c3-9 5 9 9 0s5 9 9 0 5 9 9 0 5 9 9 0 5 9 9 0M34 96c3-9 5 9 9 0s5 9 9 0 5 9 9 0M235 59c3-9 5 9 9 0s5 9 9 0 5 9 9 0 5 9 9 0 5 9 9 0M233 115c3-9 5 9 9 0s5 9 9 0 5 9 9 0 5 9 9 0 5 9 9 0"/>
      <path d="M153 79c1-7 11-6 10 0-1 4-5 3-5 8m0 6v1"/>
    </g>
    <rect x="70" y="138" width="43" height="13" rx="6.5" fill="#9bbfa0" opacity=".3"/>
    <rect x="170" y="9" width="29" height="10" rx="5" fill="#ed9396" opacity=".4"/>
  </svg>`;
}
