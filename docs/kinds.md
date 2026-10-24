# Kind format

A kind is one element type: a parametric SVG template plus metadata. The same text is in the agents' prompt (`js/ai/prompts.js`, `KIND_FORMAT`), so kinds you write by hand and kinds the designer writes look the same.

```json
{
  "id": "callout", "name": "Speech bubble", "category": "basic",
  "tags": ["comment", "bubble"], "description": "Rounded speech bubble with a tail",
  "size": [200, 110],
  "params": { "radius": { "type": "number", "default": 12, "min": 0, "max": 60, "label": "Corner radius" } },
  "style": { "fill": "#ffffff", "stroke": "#1f2328", "strokeWidth": 2 },
  "text": { "size": 15, "color": "#1f2328" },
  "svg": "<rect x='{sw/2}' y='{sw/2}' width='{w-sw}' height='{h-sw}' rx='{radius}' {@paint}/>",
  "textBox": ["8", "4", "w-16", "h-8"],
  "outline": "rect"
}
```

- `params` types: `number`, `select` (with `options`), `boolean`, `color`, `text`. The inspector shows a control for each.
- `viewBox` + `aspect: "meet"` draws in fixed units (icons); `vsw` is the stroke width converted to those units.
- `outline`: `rect`, `ellipse`, `diamond` or `{ "poly": [["x","y"], …] }` — where connectors attach.
- `textBox`: expressions for the text area (default: the whole box).
- Element `text.autoSize: true` fits the label inside that area, using numeric `text.size` as its upper limit (minimum 6px). It changes layout without rewriting the saved size. Newly placed manual shapes enable it by default; explicit font sizes and loaded documents keep their existing behavior.

## Template language

- `{expr}` — arithmetic, comparisons, `a ? b : c`, functions `min max abs sqrt round floor ceil sin cos tan atan2 pow hypot clamp lerp rad`, `PI`, colour helpers `shade(c, -1..1)`, `alpha(c, a)`, `mix(a, b, t)`, `pick(i, a, b, …)`.
- Variables: `w`, `h`, every param, every style key (`fill`, `fill2`, `stroke`, …), `sw` (0 when there is no stroke), `rawSw`, `dash`, `uid` (for ids in `<defs>`).
- Blocks: `{#repeat i n}…{/repeat}`, `{#if cond}…{else}…{/if}`.
- Macros: `{@paint}`, `{@vpaint}`, `{@line}`.
- Not allowed: `script`, `style`, `foreignObject`, event attributes, external `href`s. Use single quotes for attributes.

Convention: an element's box is its outer visual bounds, so strokes are inset by `sw/2`.
