# orim · replicate

Give it a picture of a diagram; agents rebuild it as an editable diagram that looks the same — shapes, colours, fonts, line routes, text. Shapes the library does not have yet are designed on the spot and saved, so the next replication can use them.

Static site, no build step: open `index.html` through any web server, or publish the folder with GitHub Pages.

```bash
python3 tools/serve.py 8123
```

## How a replication runs

Floating agent cards show every step live: streamed reasoning, measurements, each designer attempt and the score after each critic round. Cards stack over the canvas and can be collapsed or closed; **Agent activity** in the chat reopens them. Coloured cursors show active agents and softly outline their current targets. These follow streamed edits, designer examples and critic difference regions, and disappear when the run stops or finishes.

1. **Preparation** (local): the image is scaled to the size the model sees, so coordinates line up. The palette and connected colour regions with pixel-exact boxes are measured.
2. **Vision analyst** (selected AI provider): gets the image, the palette, the regions, the kind catalogue and learned lessons, and writes a scene in JSON. Elements appear on the canvas while the reply streams in.
3. **Measurer** (local): snaps box edges to the real pixel edges and replaces fill, stroke and text colours with sampled ones. Logos and photos the analyst marked `crop` are copied from the source.
4. **Shape designer** (selected AI provider, loop): for each shape the catalogue lacks, it writes a parametric kind, renders it, compares it with the crop and tries again with a target | render | difference strip. Good designs are saved to the library; weak ones fall back to a pixel crop.
5. **Critic** (selected AI provider, loop): renders the scene, scores it against the source (0–100) with a difference heat map, and returns edits. A round that makes the score worse is reverted. It also writes down general lessons.

Afterwards it is an ordinary diagram: move, resize, rotate, recolour, retype, duplicate, delete; drag from a shape's blue dots to connect (ends attach and follow); click a dot to add a connected copy; drag the line's middle to bend it; switch connectors between straight, curved, elbow and spline. **Refine** runs another critic round, **Ask AI** applies a change you describe.

The selected AI provider's logo at the bottom right opens a floating chat bar on the canvas. Enter sends, Shift+Enter adds a line, and closing the bar returns to the logo. **Chat & ideas** is a dropdown with five icon suggestions and a conversation-history toggle. All conversation stays in the chat; the right panel is for **Properties**. **Refine from image** runs another comparison. Prompt drafts and conversations stay with their diagram during the session.

The chat's **highlighter** lets you draw translucent yellow strokes over areas you want changed. Add your request and send: the AI receives the clean diagram and a separate image with your marks, with instructions to treat them as pointers rather than diagram content. Marks follow the diagram when panning and zooming, have their own Undo/Clear controls, and are excluded from saved documents and exports. Successful requests clear their marks; stopped or failed requests retain them for another attempt.

The chat bar's **+** button opens **Replicate this image**, where you explicitly choose the original source, an image on the canvas, or an uploaded file. Drag a rectangle over the preview to crop, drag inside it to move the crop, or use its corner handles to resize. Arrow keys move the crop; Alt+arrow keys resize it. **Use full image** resets the selection. Only the selected pixels are sent to replication, and cancelling the dialog leaves the document unchanged.

Blank diagrams start with Shapes open and Properties closed; existing diagrams and image imports start with both panels collapsed. The collapsed shape library becomes a floating tool rail: **V** selects, **H** pans, and Shapes opens a small picker. Selecting an element shows a floating editing toolbar; its Properties button opens the right panel when needed. **Diagram** and **Compare** switch between editing and the source overlay; **Shift+V** toggles them.

The **Overview** minimap shows the page, its contents, and the current viewport. Click or drag it to navigate, or focus it and use the arrow keys. It can be collapsed. When a dragged element reaches a canvas edge, the view follows and gently zooms out. Night mode adapts plain light pages and neutral shapes on screen; saved diagrams, exports, source comparison, and AI scoring retain their original colours.

## The library grows

- `library/kinds/*.json` — built-in kinds: basic and flowchart shapes, containers, wireframe parts, line icons, and the official Azure, Power Platform and Dynamics 365 icons (from `old/`, see `old/THIRD_PARTY_NOTICES.md`).
- Learned kinds, lessons and your templates are stored in the browser. In **Settings → Advanced → Library folder** (Chrome or Edge) connect this project folder, and they are also written to `library/kinds/learned/`, `library/lessons.json` and `library/templates/`, with `library/index.json` updated. Commit and push, and GitHub Pages serves them to everyone.
- Every kind in the library is offered to the analyst and the critic, and lessons are added to the analyst's instructions, so new capabilities are used from the next run on.

Kinds are plain JSON with a parametric SVG template — see [docs/kinds.md](docs/kinds.md). The inspector builds controls from a kind's params, so learned shapes are editable like built-in ones.

## Models

Settings opens on **Bring your AI**: select a **Claude**, **ChatGPT (OpenAI)**, or **Gemini** card to enter a key (each provider has a direct link to get one). ChatGPT uses the existing OpenAI API connection and saved key. The compact **Cheap / Medium / High** control shows the chosen model and can reset to Medium. These presets set the models, reasoning effort, checking rounds, design attempts, and run budget together. **Advanced** keeps individual model, effort, and run controls; opening it preserves existing choices. Saved custom settings remain intact until a preset is selected.

Keys, models, and tuning are remembered separately for each provider in this browser; keys are sent only to that provider's API. Select a saved provider to switch, or use **Delete key** to remove its key. Both actions take effect when you save; Cancel discards the draft. Removing one key preserves the other providers' keys and settings. OpenAI requests include an explicit JSON instruction in the input messages for every agent role.

All three providers stream text and reasoning summaries into the agent cards, support image input and cancellation, and report usage against the per-run budget. Effort is mapped to each provider's supported levels. Claude retains adaptive thinking, prompt caching, and server-side refusal fallback. The budget is checked after completed requests, so concurrent shape designs can exceed it. Model prices shown in Settings are estimates per million tokens; actual availability and charges depend on the provider and account.

Open the app with `?mock` to run the whole pipeline with simulated model replies (it only knows the sample images). Useful for working on the UI without spending credits.

Run the provider request/streaming checks without API keys or paid calls:

```bash
node --test tests/llm.test.mjs
```

## Templates

`library/templates/` holds hand-built replications of the 13 images in `samples/`, built by `tools/make-templates.mjs` and checked with the same scorer the critic uses (82–97 / 100). The images in `samples/` are screenshots of third-party products; check you may publish them before pushing this folder to a public site.

## Files

- `js/` — editor (`editor.js`, `inspector.js`, `palette.js`, `minimap.js`, `context-toolbar.js`), settings (`settings-ui.js`), replication image picker/cropper (`replicate-image.js`), model (`store.js`, `kinds.js`, `render.js`, `geom.js`, `text.js`, `expr.js`), library (`library.js`), shared SVG controls (`icons.js`) and screen-only colours (`theme.js`)
- `js/ai/` — `llm.js` (providers), `prompts.js`, `replicate.js` (pipeline), `vision.js` (measuring and scoring), `raster.js`, `chat-ui.js`, `agents-ui.js`, `agent-meta.js`, `agent-presence.js`, `highlighter.js`, `mock.js`
- `tools/` — `serve.py` (no-cache dev server), `make-templates.mjs`, `make-icons.mjs`, `import-ms-icons.mjs`, `dev.js` (console helpers: measure a sample, score a template)
- `old/` — the previous Mermaid-based orim, kept for reference
