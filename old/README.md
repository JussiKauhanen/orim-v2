# orim

orim is a whiteboard and Mermaid editor in one page. Write Mermaid or plain text on the left and edit a Miro-style board on the right; both sides stay in sync. It comes with the official Azure, Power Platform and Dynamics 365 icons, so architecture diagrams look the part.

Everything runs in the browser. There is no backend, no account and no build step. The board is saved in your browser and exported as files.

## Features

**Home**
- A start page with templates in two rows that scroll sideways (each shown as a small preview of the real board) and your recent boards, in a list or a grid.
- Rename, duplicate, export or delete boards from the ⋯ menu.
- Paste text, Mermaid or an image anywhere on the home page to start a new board from it.
- Every board has its own link (`#b-<id>`), so the browser's back button and bookmarks work.
- **Save to a folder** (Chrome and Edge on a computer): each board becomes a Markdown file in a folder you choose (see Boards in a folder).
- New visitors see **Which team are you on?**: a starting board for cloud architects, Power Platform makers, agile teams or product and design, with an AI request to try next.

**Two editors, one board**
- Split and Canvas views, with a draggable splitter. Going to Canvas fits the board to the larger view. On a phone, Split stacks the code above the board.
- The yellow sparkle button at the bottom left of the board opens the AI tab beside the board (undo and redo are in the top bar). The home page has Start with AI too, and the list view's bin icon deletes all boards in this browser after a confirmation.
- Mermaid mode: flowchart syntax with highlighting, line errors and autocomplete for keywords, arrows, node ids and icon nodes.
- Text mode: write `Browser -> API -> Database`, `- list items` and `# Headings`. Basic [D2](https://d2lang.com) also works.
- Paste any text onto the board to turn it into connected boxes or sticky notes.

**Board**
- Shapes, sticky notes, text, frames (nested), pen, highlighter and eraser, with Miro-style menus that name each tool and its shortcut. Besides the flowchart shapes there are a cloud, speech bubble, triangle, star, block arrow, chevron and document.
- Text in a shape or sticky note grows and shrinks with it (Auto size); pick a size in the toolbar to fix it. Six fonts (handwritten, marker, rounded, serif and code), kept in PNG and SVG exports.
- **Style** recolours the whole board: Classic, Midnight (dark navy with coloured frames), Pastel, Blueprint or Sketch (handwritten).
- **Templates** opens a picker like Miro's: use cases on the left, a search box, and a grid of coloured previews. Click a card to use it, or its yellow mark to use it and ask Claude the suggested next step: architecture, journey map, mind map, SWOT, retro, kanban, sprint plan and more.
- Paste cells from Excel, Google Sheets or a CSV file to make a table, or into a selected table to fill it.
- **Text direction** on shapes, notes, text and frame titles: four examples to pick from, horizontal or turned 90°, 180° or 270°. A turned frame title runs up the frame's left side.
- **Duplicate** on a frame's toolbar (or Ctrl+D) copies the frame with everything in it and the lines between, next to it.
- Mockups can show changes: start a column, menu item or piece's text with `+` (new, green), `~` (changed, amber) or `-` (removed, red). A table with the columns `Account name`, `City` and `+Industry` (one per line) draws the new column in green. **Mark** on a piece's toolbar cycles the marks. Lines to and from mockup screens are drawn above the screens' pieces.
- Documents have checklists you can tick on the board, code blocks, quotes and dividers (type `[] `, ```` ``` ````, `> ` or `---` and a space).
- Tables for comparisons: edit cells in place, Tab to the next cell (Tab in the last cell adds a row), Enter to go down, add and delete rows and columns, colour cells green, amber or red. The header row and first column are bold. Pasting cells from a spreadsheet fills the table.
- Connectors can attach to one table row: hover a table for a dot at each end of every row, or drop a connector on a row. Rows keep their connectors when you add, move or delete other rows.
- Simple UI mockups, drawn at half size so they sit well next to other shapes: the Mockup tool adds a phone, iPad or desktop screen, blank or as a login or main page, made of grey wireframe pieces (heading, text, button, input, image, top bar, bottom menu, side menu, table), each with an optional accent colour (blue, green, yellow, red, purple or black) from its toolbar. Each piece can be moved, edited and connected to anything on the board; screens connect to each other for a flow. Auto layout moves screens as a whole and leaves their pieces alone.
- Tickets: set a document's type to Epic, Feature, User Story, Bug or Task and it becomes a work item card with an Azure Boards colour strip, the type's fields (story points, priority, severity, remaining work, activity, tags) and a starting template (for a story: Description as "As a …, I want …, so that …" and Acceptance criteria). Copy puts a ticket, or every selected document, on the clipboard as formatted text (pastes into Azure DevOps, Jira, Word or Teams) with Markdown as plain text. Export → Tickets for Azure DevOps saves the CSV that Boards → Work items → Import reads; a ticket connected to a higher level one (epic, feature, story or bug, task) becomes its child.
- Links in documents: select text and press Ctrl+K (or the link button), or paste a web address. Ctrl or Cmd+click a link to open it, on the board or in the editor.
- Document cards, like Miro docs: headings, paragraphs, bulleted and numbered lists, bold and italic, from the toolbar or by typing `# `, `## `, `### `, `- ` or `1. ` at the start of a line. Expand opens a larger view for reading and writing.
- Connectors that stay attached, plus free arrows: curved, straight, elbow, line and block, with thickness and color. Frames connect too: hover a frame's border or title for its blue dots, or start the Arrow tool there.
- Arrow ends snap to shapes; pull hard to detach.
- Items pop out of a frame when flicked out fast; slow drags grow the frame instead. Dragging a frame's handles smaller than its contents moves the contents closer together, keeping their arrangement (undo restores them).
- Connectors keep their connection points: the side you drag out from and the side you drop on. Drag a connector's end to another side of the same shape to move it, or drop it in the middle of the shape to let orim choose.
- Elbow connectors are routed around shapes with right angles, like Miro. Tidy up → Connectors sets Curved, Straight or Elbow for the whole board; it is saved as Mermaid's own `curve` setting (`basis`, `linear`, `step`), so other Mermaid tools draw it the same way.
- Dragging something to the edge of the view scrolls the board and, if you keep pushing, zooms out a little.
- A minimap shows in the corner while you pan or zoom; click or drag in it to jump. Ctrl or Cmd with the mouse wheel zooms about 10% per notch.
- Dragging shows alignment guides and snaps to other shapes' edges and centres (hold Alt to move freely). Tidy up → Line up straightens rows and columns but keeps your layout, and pushes overlapping frames and screens apart; Auto layout rearranges everything.
- Text in a shape wraps and the shape grows while you type.
- Lasso empty space to create a frame. Drag frame edges to resize, or pick a format such as 16:9 or A4.
- Text styling: size, bold, italic, color and highlight.
- Paste or drop images.
- Comments: press C, click the board or a shape, type and press Enter. Comments on a shape move with it; drag a pin to move it, reply in the thread, or resolve it.
- The first comment asks for your name. It shows as an avatar in the top right, where you can change it or sign out. The name is kept in this browser only; comments keep the name they were written with.
- Undo and redo for everything, light and dark themes, keyboard shortcuts.

**Icons**
- 637 Azure architecture icons (V24), 9 Power Platform icons (Power Apps, Power Automate, Dataverse, Power BI, Copilot Studio, Power Pages, AI Builder, Power Fx, Power Platform) and 33 Dynamics 365 icons.
- Search the library, click or drag to add, or let Text mode pick icons from service names.

**Export**
- PNG, SVG, draw.io (`.drawio`, editable in draw.io and diagrams.net), Mermaid in Markdown, Mermaid text and an orim board file (`.json`, keeps images).
- Copy for draw.io pastes straight onto a draw.io canvas.
- QR code moves the current board to another device: scan it, or save the link (see below).
- Ask an AI copies a prompt for any AI chat (see below).

## Run it locally

Any static file server works. The page must be served over http, because the icon pack is loaded with `fetch`.

```sh
cd orim
python3 -m http.server 8080
# or
npm start
```

Open http://localhost:8080.

For a single file that opens from disk with no server, build it:

```sh
npm run build      # writes dist/orim.html
```

## Deploy to GitHub Pages

1. Create a repository named `orim` and push this folder to the `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. The site is published at `https://<your-user>.github.io/orim/` after a minute or so.

The `.nojekyll` file tells Pages to serve the files as they are. All paths are relative, so the app works under the `/orim/` sub-path without changes.

## Project structure

```
orim/
├── index.html              Page markup and script order
├── css/
│   └── orim.css            All styles, with light and dark theme tokens
├── js/
│   ├── core/               Pure logic, no DOM; covered by tests
│   │   ├── mockups.js      Device sizes, wireframe pieces and screen presets
│   │   ├── tickets.js      Work item types and fields, copy text, Azure DevOps CSV
│   │   ├── mermaid.js      Mermaid parser and serializer, canvas data comments
│   │   ├── geometry.js     Text wrap, node sizing, auto layout, connector shapes
│   │   └── templates.js    Starter boards
│   ├── env.js              DOM references, palettes, toolbar icon set
│   ├── icons.js            Loads assets/icons.json
│   ├── state.js            App state, undo and redo
│   ├── editor.js           Code pane: Mermaid and Text modes, autocomplete
│   ├── title.js            Diagram title
│   ├── render.js           Draws the board
│   ├── view.js             Pan, zoom, fit, tidy up
│   ├── hit-test.js         Hit testing
│   ├── pointer.js          Mouse, pen and touch interaction
│   ├── label-editor.js     Inline text editing
│   ├── rich-edit.js        Table and document editors
│   ├── selection.js        Selection actions
│   ├── context-toolbar.js  Selection toolbar and popovers
│   ├── library.js          Icon library panel
│   ├── tools.js            Left toolbar and fly-outs
│   ├── keyboard.js         Shortcuts and clipboard
│   ├── layout.js           Views and splitter
│   ├── ui.js               Menus, toasts, dialogs
│   ├── templates.js        Templates menu and import
│   ├── quick-text.js       Plain-text language and paste to board
│   ├── export-drawio.js    draw.io export
│   ├── export.js           Other exports
│   ├── share-qr.js         QR code and shared links (#m=…)
│   ├── ai-guide.js         Ask an AI: prompt, format guide, paste back
│   ├── ai-key.js           Claude API with your own key, streamed, for copies outside Claude
│   ├── ai-assist.js        AI tab: Claude edits the board live (inside Claude, or with your key)
│   ├── theme.js            Theme switching
│   ├── tooltips.js         Tooltips
│   ├── me.js               Your name and avatar for comments
│   ├── comments.js         Comment pins and threads
│   ├── minimap.js          Overview while panning and zooming
│   ├── boards.js           Home page, board list, saving, #b-<id> links
│   ├── folder.js           Boards as .md files in a folder you choose (File System Access API)
│   ├── board-style.js      Board styles (themes) menu
│   └── main.js             Startup
├── assets/
│   ├── icons.json          Icon pack (generated)
│   └── favicon.svg
├── vendor/
│   ├── dagre/              dagre 0.8.5 for auto layout (MIT)
│   └── qrcode-generator/   qrcode-generator 1.4.4 for QR codes (MIT)
├── docs/orim-board.md      Format guide for AI assistants (generated)
├── tests/core.test.mjs     Parser and serializer round-trip tests
└── tools/
    ├── build.mjs           Bundles dist/orim.html
    └── build-icons.py      Regenerates assets/icons.json
```

The scripts are plain browser scripts loaded in order, not modules, so the app runs from any static host without bundling. Top-level declarations are shared between them; the order in `index.html` matters.

## Where boards are stored

### Boards in a folder

In Chrome or Edge on a computer, **Save to a folder** on the home page asks for a folder. From then on:

- Every new board is saved there as `<Board name>.md`, a moment after each change: a `# Title` line and a ` ```mermaid ` block holding the whole board (positions and orim's other data ride along in `%%` lines). GitHub, Azure DevOps and VS Code show the file as a diagram. Text you add around the block is kept.
- Pictures are saved next to it in `<Board name>.images/`.
- Renaming a board renames its file. Deleting a board deletes its file. Delete all only touches boards kept in the browser.
- Boards already in the folder (any `.md` with a Mermaid flowchart) show up in Jump back in. Older boards in the browser can be added with **Save to folder** in their ⋯ menu.
- If the file changes outside orim (Git pull, an editor, an AI assistant) while the board is open, orim loads the new version. If you changed the board too, it asks which version to keep.
- Next to the board title, a small note says where the board is saved, like Excel's: **Saved to disk** or **Saved in browser** (and Saving… while it writes). Click it to choose a folder, save an older board to the folder, change folder or stop saving to a folder. The home page suggests a folder once; **No thanks** hides that for good. When the browser needs permission again (after a restart), the note says **Reconnect folder**; changes made meanwhile are kept in the browser and written out once you reconnect.
- The browser keeps its own copy of every board too. Folder saving is not available inside Claude or in browsers without the File System Access API (Firefox, Safari); boards are then kept in the browser as before.

Boards live in the browser's `localStorage` on the device you use: `orim.boards` holds the list, `orim.b.<id>` the Mermaid code and `orim.i.<id>` the images of each board. `orim.me` is your comment name. `orim.anthropicKey`, `orim.anthropicWorkspace` and `orim.anthropicModel` hold your Claude API key, workspace ID and model if you saved them in the AI tab. Clearing site data removes them, so export a board file (`.json`) for anything you want to keep or move.

## File format

A board is stored as standard Mermaid, so it renders on GitHub, Azure DevOps and other Mermaid tools. Things Mermaid has no syntax for are kept in `%%` comment lines, which other tools ignore:

```
%% @pos   <id> <x> <y> [<w> <h>]                     node or frame position and size
%% @route <edgeIndex> curved|straight|elbow [<from> <to>] [ra=<row>] [rb=<row>]   connector routing; sides t r b l, or - for automatic; ra/rb attach an end to a table row
%% @device <frameId> mobile|tablet|desktop          the frame is a mockup screen of that device
%% @table <id> <json>                               table cells {rows:[[…]], colors:{"row,col":"g|a|r"}}; row 0 is the header
%% @doc   <id> <json>                               document {blocks:[{t:h1|h2|h3|p|ul|ol|todo|quote|hr|code, r:[{x:text, b:1, i:1, u:url}], c?:1 (ticked), lang?}], kind?:epic|feature|story|bug|task, fields?:{…}}
%% @theme <name>                                    board style: midnight, pastel, blueprint or sketch
%% @rot   <id> 90|180|270                           text direction of a shape or frame title
%% @arrow <id> <kind> <x1> <y1> <x2> <y2> <w> <color> [from=<id>] [to=<id>]
%% @ink   <id> pen|hl <color> <w> <x,y> <dx,dy> ...   pen and highlighter strokes
%% @image <id> <x> <y> <w> <h> [front] [faded]       image placement; front = above shapes, faded = shown at 40% (pixels live in the board file)
%% @comment <id> <x> <y> [on=<id>] [done] <json>      comment thread [{a: author, t: text, d: time}]; on= makes x y an offset from that shape, done = resolved
```

Icon nodes use Mermaid 11 shape syntax: `fn@{ icon: "azure:function-apps", label: "API" }`. Packs are `azure:`, `pp:` (Power Platform) and `d365:`. Other Mermaid renderers show these as plain nodes unless the same icon pack is registered there.

`classDef`, `class` and `:::name` colours are drawn as Mermaid draws them; a `style` line for a node wins over its class. Auto layout lays out each frame on its own first and then places the frames, so frames stay compact.

Mockup pieces are nodes with classes such as `uiButton`, `uiInput` and `uiTabbar` (menu items one per line). A screen is a frame with a `@device` line and a saved size.

Tables and documents are nodes with the `table` and `doc` classes, so other Mermaid tools show them as a box with the title. Text mode leaves them, mockup screens and their connectors as they are.

Sticky notes are nodes with the `sticky` class. The extra shapes are the nearest classic shape plus a class, `cloud`, `bubble`, `tri`, `star`, `arrow`, `chevron` or `paper`, for example `idea("Big idea"):::cloud`, so other Mermaid tools show a box with the right text. Text styling uses standard `style` properties (`font-size`, `font-weight`, `font-style`, `color`, `font-family`), plus `background` for the highlight. Fonts are Caveat, Bangers, Fredoka, Georgia and monospace; tools without them use their default font.

## Text mode

```
direction: right
Azure {
  API
  Orders: Orders DB
  Orders.shape: cylinder
}
Browser -> API -> Orders: writes
API -> Cache, Key Vault

# Open questions
- Who owns the schema?
```

| Write | Gives |
| --- | --- |
| `A -> B` or `A → B` | arrow |
| `A <- B` | arrow from B to A |
| `A <-> B` | arrows both ways |
| `A -- B` | plain line |
| `A => B` | thick arrow |
| `A -> B, C` | one arrow to each |
| `A -> B: label` | labelled arrow |
| `id: Label` | box with an id and a different label |
| `Name { … }` | frame |
| `Frame A -> Frame B` | arrow between frames (a box with the same name wins) |
| `# Heading` or `Heading:` | frame for the list items below it |
| `- item` | sticky note |

Suggestions work like VS Code:

- The list opens as you type (10 ms, VS Code's quick suggestion delay) and narrows with each letter. It also opens after an arrow, a comma, or when you start an arrow with `-`, `<` or `=`.
- Tab inserts. Enter inserts only when the suggestion changes what you typed, so Enter at the end of a finished line is still a new line. ↑↓ choose, Esc hides the list until the next word.
- Ctrl+Space opens it anywhere, including on an empty line for starters such as frames and sticky notes.
- When the list is closed, the best match shows as grey text after the cursor; Tab or → takes it.
- When new boxes appear outside the view, the board pans and zooms to show them, and new items flash briefly.

## Ask an AI

**Export → Ask an AI** copies a prompt for ChatGPT, Claude, Copilot or any other chat assistant. The prompt contains:

- a short guide to the orim board format: node shapes, frames, edges, styling and the `%%` canvas lines;
- the Power Platform and Dynamics 365 icon ids, and the 88 Azure icons most boards use;
- the current board;
- your request, if you type one in the dialog.

The assistant replies with the complete board in a ```` ```mermaid ```` block. Paste the whole reply into the dialog's answer box, or straight onto the board, and orim takes the code from it. Ctrl+Z undoes the change.

The prompt is about 5,000 characters plus the board. **Download guide (.md)** saves the guide with every Azure icon id as a skill file with a name and description at the top, so it can be added to an assistant that supports skills or custom instructions. A copy is in [docs/orim-board.md](docs/orim-board.md); it is generated from `js/ai-guide.js`, so download a fresh one after changing the format or the icons.

## AI tab

When orim is opened inside Claude (the copy shared from Claude), the editor has a third tab, **AI**. Type what you want ("add a Redis cache between the API and the database", "put these in a frame called Security", "what does this show?") and Claude changes the board while it answers. It uses your own Claude account, with no keys or setup.

- Claude replies with one small command per line (add, connect, update, frame, delete, screen, table, cell, doc, layout, say). A doc with a type is a ticket; each is applied as it arrives.
- Ask for a comparison ("compare Crystallize and Optimizely and link the parts to the table") and Claude builds a table, colours the stronger option, and connects shapes to the rows they belong to. Longer notes become a document card. "Mock up a login and home screen for mobile and desktop" makes screens from the presets and adjusts their pieces. "Map out the tickets for this" makes an epic with stories, bugs and tasks, connected to each other and to the screens and services they touch. New items are pushed clear of what is already on the board. Claude sees the tables and documents on the board, so you can ask about them or have them updated.
- Every request is one undo step, with an Undo button on the reply.
- **Photo to board**: attach, paste or drop a photo of a whiteboard, sticky notes or a sketch, or a screenshot of a diagram (the + button under the request box, or **Make editable** on a picture already on the board). Claude measures every item on a grid over the picture and recreates it beside it, with the same positions, sizes and colours: frames for areas and layers, shapes, sticky notes, text and lines. A follow-up such as "the colours are off" sends the picture again so Claude can compare; the picture is faded afterwards so the editable copy stands out (Fade on the picture toolbar toggles it). Pictures are scaled to 1500 px and sent as JPEG. Inside Claude this needs the page to be allowed to send images.
- Hover a reply to see who answered: with your own API key, the model, the tokens in and out, and the cost at list prices (read from the answer itself, no extra call). Inside Claude it shows the model tier; it uses your Claude plan, so there is no separate cost.
- **AI on the selection**: select sticky notes, shapes, a picture or a frame and press the yellow AI button at the end of the toolbar. Several items: Group by theme, Summarise into a doc, Sort by sentiment, Make a diagram, Turn into tickets. One item: Generate ideas, Explain in a doc, Turn into tickets. Any text: Fix grammar and spelling, Rewrite shorter, Translate (English, Finnish, Swedish, German, French, Spanish). A picture: Make editable. It runs without leaving the canvas and says what it did in a note.
- Selected shapes are sent along, so "these" means your selection. Open comments are sent too.
- **Think harder** uses a slower, more capable model for bigger changes.
- While Claude works, the board stays sharp in the middle and goes soft around the edges, where a sketch drifts and a Claude cursor moves between its pieces; a status note shows what it is doing, and the real changes appear as they arrive.
- "Make it vertical" or "left to right" changes the flow direction and lays the board out again; pinned connection points turn with it.
- On GitHub Pages or a local copy, the tab asks for your own Claude API key instead. **Create a key in the Claude Console** opens [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys); paste the key, pick a model (Sonnet 5.5 by default, Haiku 5.5 or Opus 5.5) and orim calls the Claude API straight from your browser, streaming changes onto the board the same way. Think harder uses Opus 5.5. The key is kept only in this browser (localStorage, or for this tab only if you untick Remember) and is sent only to api.anthropic.com; usage is billed to your API account. The key button next to Think harder changes the model or forgets the key. Keys that work across several workspaces (or are linked to your Console account) also need a workspace ID (`wrkspc_…`, from [Workspaces](https://platform.claude.com/settings/workspaces)); when the API asks for one, the key form opens with that field highlighted and orim sends it as the `anthropic-workspace-id` header. The account button (top right) shows a saved key with Remove key and Manage keys, and Sign out forgets both your name and the key. Inside Claude, the AI tab links to the Console for making a key to use elsewhere. Without a key, Export → Ask an AI still works with any AI chat.

## Move a board to another device

**Export → QR code** shows a large QR code, the link it contains and the board's Mermaid code. Scanning the code, or opening the link, creates a copy of the board on the other device.

- The board travels inside the link itself (`#m=` followed by the deflated, base64url-encoded Mermaid), so nothing is uploaded or stored anywhere else.
- Only the current board is included, and images are left out.
- **Copy link** and **Copy Mermaid** always carry the whole board: positions, arrows, drawings, documents, tables, tickets, mockup screens and comments (only images are left out).
- A QR code holds about 2,900 characters. If the board is too large for it, the QR code alone drops pen strokes and then positions and arrows (the board is laid out again on arrival); documents, tables, tickets, screens and comments always stay. **Smaller QR code** switches between the sizes. A board that does not fit at all shows just the link.
- On GitHub Pages or `localhost` the link points to the same site. Anywhere else it points to `https://jussikauhanen.github.io/orim/`; change `ORIM_PAGES` in `js/share-qr.js` for your own deployment.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| V, H or Space | Select, hand |
| Right or middle mouse button drag | Move around the board |
| N, T, S, A, P, Shift+P, E, F | Sticky, text, shapes, arrows, pen, highlighter, eraser, frame |
| R, O, D, B | Rectangle, circle, decision, database |
| I | Icon library |
| C | Comment |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo |
| Ctrl+D, Ctrl+G, Ctrl+Shift+G | Duplicate, group into frame, ungroup |
| Ctrl+B, Ctrl+I | Bold, italic |
| Shift+1, Shift+L | Fit to screen, line up |
| Alt+1, Alt+2 | Split, Canvas |
| Esc | Close panel, cancel tool, clear selection |

## Development

```sh
npm test          # parser and serializer tests (Node 18+)
npm run build     # single-file build in dist/
```

To update the icons, see the header of `tools/build-icons.py`.

## Licenses

The orim source has no license file yet; add one before publishing if you want others to reuse the code. Third-party material is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Microsoft icons are licensed only for architecture diagrams, training material and documentation.
