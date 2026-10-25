# orim · replicate

Give it a picture of a diagram; agents rebuild it as an editable diagram that looks the same — shapes, colours, fonts, line routes, text. Shapes the library does not have yet are designed on the spot and saved, so the next replication can use them.

Static site, no build step: open `index.html` through any web server, or publish the folder with GitHub Pages.

```bash
python3 tools/serve.py 8123
```

## Drawing with AI

Describe what you want to understand ("how does an AD group end up granting access in Azure?") and the AI draws it as **structure**: components, the boundaries that hold them (on-premises, a subscription, a network) and numbered links. It replies with short JSON lines instead of coordinates, so a first diagram streams in within seconds; each shape fades in and flashes green as it arrives, and [ELK](https://github.com/kieler/elkjs) lays everything out, with groups really containing their nodes and links routed around them. Every component carries a one-sentence note on what it is and why it is there, shown under the toolbar when you select it.

Follow-up requests ("add a Key Vault for the app") change only what they need and flash it: green for added, blue for changed. Once you have moved things by hand, later edits keep your arrangement and only place what is new; **Tidy up** (next to the zoom controls, or under a reply) lays the whole diagram out again, hand-drawn parts included. The reply reads like a chat: what the AI is doing, then one line that expands into the list of changes (click one to jump to it), a thumbnail, and the token count.

**+** in the AI panel takes a picture. **Understand it** (default) reads the picture's meaning into the same editable structure; **Copy the exact look** runs the slower pixel-faithful replication described below. Requests with highlighter marks or a chosen style go to the visual editor.

## How a replication runs

The AI works in a side panel on the right, one conversation per diagram. Each request appears as your message followed by a live reply listing the agents' steps as they happen: who is working, what they are doing, how long it has taken, and the latest line of their reasoning. Click a step for its summary, log, before/after images, reasoning and usage, or **Show on canvas** to fly to what it changed; hovering a step outlines its shapes. Finished replies fold their steps into one line, show the similarity trend, and offer **Undo** and **Refine again**. While the panel is closed, a small pill next to the AI button shows the active agent, with a Stop button.

Each active agent also has a named, coloured cursor on the canvas with a soft outline on what it is working on. Cursors move on a critically damped spring, so they speed up, ease into place, follow pans and zooms, and drift slightly while they work; the next agent's cursor starts where the previous one stopped.

1. **Preparation** (local): the image is scaled to the size the model sees, so coordinates line up. The palette and connected colour regions with pixel-exact boxes are measured.
2. **Vision analyst** (selected AI provider): gets the image, the palette, the regions, the kind catalogue and learned lessons, and writes a scene in JSON. Elements appear on the canvas while the reply streams in.
3. **Measurer** (local): snaps box edges to the real pixel edges and replaces fill, stroke and text colours with sampled ones. Logos and photos the analyst marked `crop` are copied from the source.
4. **Shape designer** (selected AI provider, loop): for each shape the catalogue lacks, it writes a parametric kind, renders it, compares it with the crop and tries again with a target | render | difference strip. Good designs are saved to the library; weak ones fall back to a pixel crop.
5. **Critic** (selected AI provider, loop): renders the scene, scores it against the source (0–100) with a difference heat map, and returns edits. A round that makes the score worse is reverted. It also writes down general lessons.

Afterwards it is an ordinary diagram: move, resize, rotate, recolour, retype, duplicate, delete; drag from a shape's blue dots to connect (ends attach and follow); click a dot to add a connected copy; drag the line's middle to bend it; switch connectors between straight, curved, elbow and spline. **Refine** runs another critic round, **Ask AI** applies a change you describe.

Any box that fully holds other elements drawn above it — a container, lane, frame, phone or a plain background rectangle — carries them when it moves, and Alt-drag copies it with its contents. Pressing on the body of such a box and dragging draws a selection rectangle, so items sitting on a background are easy to select; a click still selects the box, and its rim or header moves it straight away. A shape dropped into a box drawn above it moves up in front of that box. **⌘G** groups the selection and **⇧⌘G** ungroups (also in the toolbar and Properties). Clicking any member selects the whole group, clicking again picks that member, and Escape returns to the group. Copies form their own groups.

The provider logo at the bottom right opens the panel. Enter sends and Shift+Enter adds a line. The composer shows what the next message refers to: with shapes selected, a chip says so and the request applies to them (click the chip to use the whole diagram instead); highlighter marks appear as a chip too. **+** rebuilds an image, the pen icon starts a new conversation, and the header opens the provider and model settings. Prompt drafts and conversations stay with their diagram during the session.

The chat's **highlighter** lets you draw translucent yellow strokes over areas you want changed. Add your request and send: the AI receives the clean diagram and a separate image with your marks, with instructions to treat them as pointers rather than diagram content. Marks follow the diagram when panning and zooming, have their own Undo/Clear controls, and are excluded from saved documents and exports. Successful requests clear their marks; stopped or failed requests retain them for another attempt.

The AI panel's **+** button opens **Replicate this image**, where you explicitly choose the original source, an image on the canvas, or an uploaded file. Drag a rectangle over the preview to crop, drag inside it to move the crop, or use its corner handles to resize. Arrow keys move the crop; Alt+arrow keys resize it. **Use full image** resets the selection. Only the selected pixels are sent to replication, and cancelling the dialog leaves the document unchanged.

Blank diagrams start with Shapes open and Properties closed; existing diagrams and image imports start with both panels collapsed. The collapsed shape library becomes a floating tool rail: **V** selects, **H** pans, and Shapes opens a small picker. Selecting an element shows a floating editing toolbar; its Properties button opens the right panel when needed. **Diagram** and **Compare** switch between editing and the source overlay; **Shift+V** toggles them.

Double-click empty canvas space to open a compact **Shapes & lines** picker. Choose a shape to place it at that point, or choose Line, Arrow, Elbow arrow or Curved arrow and drag on the canvas. Lines can attach to shapes at either end; hold Shift for 45° directions, or Escape to cancel. Double-clicking an existing shape still edits its text. The Shapes rail includes these line tools too. Flowchart shapes include Subprocess, Manual input and Delay. Wireframes include matching phone, desktop and iPad frames; the iPad has a portrait/landscape setting.

New manually placed shapes use **Auto** font sizing: labels shrink to fit and return toward their normal size as space allows. The floating editing toolbar and Properties offer an Auto/common-size dropdown, preserving existing custom font sizes. Choosing a number fixes the size; Auto fitting is shared by the editor, SVG exports and image rendering. Existing saved and replicated font sizes are preserved.

The top bar groups the board name, Diagram/Compare and board actions into compact floating panels. Zoom controls sit at the bottom left of the canvas. On smaller screens, More contains Library, theme and Settings.

The **Overview** minimap appears while panning or zooming when some of the page or its contents are off-screen. It hides when everything fits or after 1.5 seconds without movement; hovering, focusing or dragging it keeps navigation available. Opening chat or receiving agent comments does not move it. It shows the page, its contents, and the current viewport. Click or drag it to navigate, or focus it and use the arrow keys. It can be collapsed. When a dragged element reaches a canvas edge, the view follows and gently zooms out. Night mode adapts plain light pages and neutral shapes on screen; saved diagrams, exports, source comparison, and AI scoring retain their original colours.

## The library grows

- `library/kinds/*.json` — built-in kinds: basic and flowchart shapes, containers, wireframe parts, line icons, and the official Azure, Power Platform and Dynamics 365 icons (from `old/`, see `old/THIRD_PARTY_NOTICES.md`).
- Learned kinds, lessons and your templates are stored in the browser. In **Settings → Advanced → Library folder** (Chrome or Edge) connect this project folder, and they are also written to `library/kinds/learned/`, `library/lessons.json` and `library/templates/`, with `library/index.json` updated. Commit and push, and GitHub Pages serves them to everyone.
- Every kind in the library is offered to the analyst and the critic, and lessons are added to the analyst's instructions, so new capabilities are used from the next run on.

Kinds are plain JSON with a parametric SVG template — see [docs/kinds.md](docs/kinds.md). The inspector builds controls from a kind's params, so learned shapes are editable like built-in ones.

## Models

**AI settings** is one view. **Your AI** lists Claude, ChatGPT (OpenAI) and Gemini; each row shows whether its key is saved and has a trash button to delete it. Selecting a provider opens its key field right under it, with a link to get a key. **Quality & cost** shows Cheap, Medium and High for the selected provider, each with the model it uses and its limit per run; a preset sets models, reasoning effort, checking rounds, design attempts and the run budget together. **Advanced** (collapsed) keeps the per-agent model and effort controls, run limits and the library folder; changing them marks the setup as custom until a preset is picked again.

Keys, models, and tuning are remembered separately for each provider in this browser; keys are sent only to that provider's API. Select a provider to switch, or use its trash button to remove its key. Both actions take effect when you save; Cancel discards the draft. Removing one key preserves the other providers' keys and settings. OpenAI requests include an explicit JSON instruction in the input messages for every agent role.

All three providers stream text and reasoning summaries into the agent cards, support image input and cancellation, and report usage against the per-run budget. Effort is mapped to each provider's supported levels. Claude retains adaptive thinking, prompt caching, and server-side refusal fallback. The budget is checked after completed requests, so concurrent shape designs can exceed it. Model prices shown in Settings are estimates per million tokens; actual availability and charges depend on the provider and account.

Open the app with `?mock` to run the whole pipeline with simulated model replies (it only knows the sample images). Useful for working on the UI without spending credits.

Run the provider request/streaming checks without API keys or paid calls:

```bash
node --test tests/llm.test.mjs
```

## Templates

`library/templates/` holds hand-built replications of the 13 images in `samples/`, built by `tools/make-templates.mjs` and checked with the same scorer the critic uses (82–97 / 100). The images in `samples/` are screenshots of third-party products; check you may publish them before pushing this folder to a public site.

## Files

- `js/` — structured diagrams and auto-layout (`structure.js`), editor (`editor.js`, `inspector.js`, `palette.js`, `minimap.js`, `context-toolbar.js`), settings (`settings-ui.js`), replication image picker/cropper (`replicate-image.js`), model (`store.js`, `kinds.js`, `render.js`, `geom.js`, `text.js`, `expr.js`), library (`library.js`), shared SVG controls (`icons.js`) and screen-only colours (`theme.js`)
- `js/ai/` — `llm.js` (providers), `prompts.js`, `replicate.js` (pipeline), `vision.js` (measuring and scoring), `raster.js`, `draw.js` (structured drawing and editing), `chat-ui.js` (AI panel), `agent-meta.js`, `agent-presence.js`, `highlighter.js`, `mock.js`
- `tools/` — `serve.py` (no-cache dev server), `make-templates.mjs`, `make-icons.mjs`, `import-ms-icons.mjs`, `dev.js` (console helpers: measure a sample, score a template)
- `old/` — the previous Mermaid-based orim, kept for reference
