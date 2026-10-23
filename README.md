# orim · replicate

Give it a picture of a diagram; agents rebuild it as an editable diagram that looks the same — shapes, colours, fonts, line routes, text. Shapes the library does not have yet are designed on the spot and saved, so the next replication can use them.

Static site, no build step: open `index.html` through any web server, or publish the folder with GitHub Pages.

```bash
python3 tools/serve.py 8123
```

## How a replication runs

The Agents tab shows every step live: streamed reasoning, measurements, each designer attempt and the score after each critic round.

1. **Preparation** (local): the image is scaled to the size the model sees, so coordinates line up. The palette and connected colour regions with pixel-exact boxes are measured.
2. **Vision analyst** (Claude): gets the image, the palette, the regions, the kind catalogue and learned lessons, and writes a scene in JSON. Elements appear on the canvas while the reply streams in.
3. **Measurer** (local): snaps box edges to the real pixel edges and replaces fill, stroke and text colours with sampled ones. Logos and photos the analyst marked `crop` are copied from the source.
4. **Shape designer** (Claude, loop): for each shape the catalogue lacks, it writes a parametric kind, renders it, compares it with the crop and tries again with a target | render | difference strip. Good designs are saved to the library; weak ones fall back to a pixel crop.
5. **Critic** (Claude, loop): renders the scene, scores it against the source (0–100) with a difference heat map, and returns edits. A round that makes the score worse is reverted. It also writes down general lessons.

Afterwards it is an ordinary diagram: move, resize, rotate, recolour, retype, duplicate, delete; drag from a shape's blue dots to connect (ends attach and follow); click a dot to add a connected copy; drag the line's middle to bend it; switch connectors between straight, curved, elbow and spline. **Refine** runs another critic round, **Ask AI** applies a change you describe.

## The library grows

- `library/kinds/*.json` — built-in kinds: basic and flowchart shapes, containers, wireframe parts, line icons, and the official Azure, Power Platform and Dynamics 365 icons (from `old/`, see `old/THIRD_PARTY_NOTICES.md`).
- Learned kinds, lessons and your templates are stored in the browser. In **Settings → Library folder** (Chrome or Edge) connect this project folder, and they are also written to `library/kinds/learned/`, `library/lessons.json` and `library/templates/`, with `library/index.json` updated. Commit and push, and GitHub Pages serves them to everyone.
- Every kind in the library is offered to the analyst and the critic, and lessons are added to the analyst's instructions, so new capabilities are used from the next run on.

Kinds are plain JSON with a parametric SVG template — see [docs/kinds.md](docs/kinds.md). The inspector builds controls from a kind's params, so learned shapes are editable like built-in ones.

## Models

Settings takes an Anthropic API key (kept in this browser, sent only to the API) and lets you choose the model and effort per agent (default Claude Opus 5.5) and a budget per run. Requests use streaming, adaptive thinking with summarised reasoning (shown in the Agents tab), prompt caching of the system prompt plus catalogue, and server-side refusal fallback. OpenAI and Google are listed in the provider menu but not wired up yet; `js/ai/llm.js` has the one function a provider needs.

Open the app with `?mock` to run the whole pipeline with simulated model replies (it only knows the sample images). Useful for working on the UI without spending credits.

## Templates

`library/templates/` holds hand-built replications of the 13 images in `samples/`, built by `tools/make-templates.mjs` and checked with the same scorer the critic uses (82–97 / 100). The images in `samples/` are screenshots of third-party products; check you may publish them before pushing this folder to a public site.

## Files

- `js/` — editor (`editor.js`, `inspector.js`, `palette.js`), model (`store.js`, `kinds.js`, `render.js`, `geom.js`, `text.js`, `expr.js`), library (`library.js`)
- `js/ai/` — `llm.js` (providers), `prompts.js`, `replicate.js` (pipeline), `vision.js` (measuring and scoring), `raster.js`, `agents-ui.js`, `mock.js`
- `tools/` — `serve.py` (no-cache dev server), `make-templates.mjs`, `make-icons.mjs`, `import-ms-icons.mjs`, `dev.js` (console helpers: measure a sample, score a template)
- `old/` — the previous Mermaid-based orim, kept for reference
