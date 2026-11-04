# Research Graph

A small local web app that turns a folder of **Obsidian Markdown notes** into an
**interactive, customizable knowledge graph**. It's built for mapping research:
papers, contributions, assumptions, results, and how they relate.

- Each `.md` file is a **node**.
- The note's **YAML frontmatter** gives the node its **attributes**.
- The `relationships` list in the frontmatter gives the **edges**.
- Change a note in Obsidian and the graph updates by itself. Change it in the app
  and the file updates, so Obsidian sees the change.

Everything runs on your own computer. Nothing is uploaded anywhere.

---

## 1. Quick start

You need **Node.js 18 or newer**. Get it from <https://nodejs.org>, then check it with `node -v`.

```bash
cd research-graph
npm install                      # once: downloads the 3 libraries it uses
npm run example                  # opens the included example notes
```

Open **http://localhost:3000** in your browser.

To use your own notes, pass the folder (a whole vault or any folder inside one):

```bash
npm start -- "/path/to/your/Obsidian Vault/Research Mapping"
# Windows:
npm start -- "C:\Users\you\Documents\Vault\Research Mapping"
```

Other options:

```bash
npm start -- "/path/to/notes" --port 4000     # use another port
```

Stop the app with **Ctrl + C** in the terminal.

> Obsidian and this app can be open on the same notes at the same time.

---

## 2. How notes become a graph

### Nodes and attributes

Each Markdown file becomes one node. Every frontmatter key, apart from
`relationships`, becomes an attribute of that node:

```yaml
---
id: contribution-pinnacle-architecture
node_type: contribution
title: Pinnacle architecture
contribution_type: FT architecture
contribution_subtype: Cross-platform
validation_methods: Analytic
level: 1
relationships:
- type: based_on
  target: '[[Contribution - Pauli-based computation]]'
---
```

**No attribute names are hard-coded.** Add a new key to any note, for example
`status: to read` or `year: 2024`. It shows up in every menu of the app right
away, with all of its values. A note with no frontmatter is still a node, just
without attributes.

The app also adds a few built-in attributes. Their names start with `·` in the menus:

| Built-in attribute | Meaning |
|---|---|
| file name | the note's file name |
| folder | the folder the note is in |
| not a file (external reference) | `yes` for references that aren't notes (see below) |
| number of connections | how many edges touch the node |

### Edges (relationships)

The `relationships` list holds the edges. Each entry needs a `type` and a
`target`. **Any extra keys become attributes of the edge.**

```yaml
relationships:
  - type: based_on
    target: '[[Contribution - Pauli-based computation]]'
  - type: compares_with
    target: '[[Contribution - Resource estimate for Fermi-Hubbard model]]'
    direction: both        # extra keys become edge attributes
    strength: 2
  - type: cites
    target: ['[[Paper A]]', '[[Paper B]]']   # several targets at once
```

A shorter form also works:

```yaml
relationships:
  based_on: ['[[A]]', '[[B]]']
  assumes: '[[Assumption - Physical error rate = 10^-3]]'
```

**Any other attribute whose value is a `[[wiki-link]]`** also becomes an edge,
with the attribute name as its type. For example, `supervisor: '[[Alice]]'`
creates a `supervisor` edge.

**Targets**

- `'[[Note name]]'` links to a note. It is matched by file name, or by
  `[[Folder/Note name]]`, the same way Obsidian matches links. `[[Note|alias]]`
  and `[[Note#heading]]` work too.
- Plain text, such as `Surface-code frame cleaning`, becomes an **external
  reference** node: grey, with a dashed border by default. It lets you record
  sources you haven't made a note for yet.
- A `[[link]]` to a note that doesn't exist yet also becomes an external node.
  In the app you can click **Create this note**, and the link connects at once.

**Direction.** Edges point from the note that defines them to the target. An
optional `direction` key changes where the arrow head goes:

| `direction` | Arrow |
|---|---|
| `forward` (default) | source → target |
| `backward` | source ← target |
| `both` | source ↔ target |
| `none` or `undirected` | no arrow head |

The same input always produces the same graph. Nothing is guessed from the
note body.

---

## 3. Using the app

### Moving around

- **Zoom** with the mouse wheel or trackpad. **Pan** by dragging the background.
- **Drag nodes** to arrange them. Positions are remembered in your browser.
- **Layout** menu plus **Re-arrange** arranges all visible nodes automatically.
  The options are force-directed, hierarchy, rings, circle, and grid.
- **Fit** zooms to show everything.

### Search, select, inspect

- **Search** looks in file names and all attribute values. Matches glow and
  everything else fades. Press **Enter** to zoom to the results.
- **Click** a node or edge to select it. Its direct connections stay bright and
  the rest fades.
- **Shift + click** or **Shift + drag** on the background selects several items.
  **Esc** clears the selection.
- The **right panel** shows the selected item's attributes, relationships, and
  incoming and outgoing connections. Click a name there to jump to that node.

### Styling: different attributes on different visual properties

In **Node style** and **Edge style**, pick an attribute for each visual property:

| Nodes | Edges |
|---|---|
| fill color, shape, size, opacity, border color, border width, border style | line color, width, line style, opacity, arrow head |

Every value of the chosen attribute gets its own look automatically. Change any
of them with the color picker, menu, or number box. Click **↺ auto-assign** to
start over.

Each property can use a different attribute, so one node can show several
attributes at once. For example:

- color by `node_type`
- shape by `contribution_type`
- size by `level`
- border color by `validation_methods`

Number attributes such as `level` get sizes and widths in order, from small to
large.

The value lists also work as a **legend**: they show each value and how many
nodes or edges have it.

### Labels

In **Labels**, tick the attributes to show on nodes and on edges. Several can be
ticked; each appears on its own line. Turn on *show attribute names* to display
`key: value`. You can also change the font size.

### Show / hide

Pick an attribute, then untick values to hide them. By default, template notes
are hidden.

Hiding reciprocal edge types such as `part_of_paper` and `assumed_by` declutters
the graph a lot when every link is stored in both directions.

### Editing notes from the app

Select a note and use the right panel:

- **Attributes:** edit values, remove one with ✕, or add a new key and value.
  For lists like `authors`, put one item per line.
- **Relationships:** edit type and target, add rows, or remove them. The
  optional dashed field holds edge attributes such as
  `direction: both; weight: 2`. Suggestions for types and `[[note links]]`
  appear as you type.
- Click **Save to file**.
- **+ New note** (top bar) or **+ New linked note** (right panel) creates a new
  `.md` file. It can also add a link from the selected note, and optionally a
  link back (for example `has_contribution` one way and `part_of_paper` back).
- **Open in Obsidian** opens the note in Obsidian.

### Live updates

The app watches the folder. When a note is added, changed, renamed, or deleted,
by Obsidian, by the app, or by anything else, the graph updates within a
fraction of a second. Existing nodes keep their positions, and new nodes appear
next to the nodes they connect to.

If you're editing a note in the app and it changes on disk at the same time,
you get a warning instead of having your work overwritten.

### Saving your view

Styles, labels, filters, and the layout choice are saved in your browser for
each notes folder. Use **Save / share these settings → Export / Import** to back
them up or give them to a colleague.

---

## 4. What the app writes to your files

The app is careful with your notes:

1. **The Markdown body is never changed.** Only the frontmatter block at the top
   is rewritten, and only when you click **Save to file**.
2. **Only the keys you changed are written.** Other keys keep their order,
   comments, and quoting. In a list such as `relationships`, unchanged entries
   are kept exactly as they were.
3. **The file is re-read from disk just before saving**, so edits made in
   Obsidian a moment earlier aren't lost.
4. If a note's YAML has an error, the app shows the error and won't edit that
   note until you fix it in Obsidian.
5. The app only writes `.md` files inside the folder you gave it.

Two small, harmless reformatting effects can appear in the frontmatter of a
note you save:

- A long text value that was wrapped over two lines is written on one line.
- A number like `1e-3` that you edit is written as `0.001`.

Untouched values keep their original formatting.

---

## 5. How the code is organized

```
research-graph/
├── server.js            Web server: API routes, live updates, file watcher
├── lib/
│   ├── vault.js         Reads the notes folder and builds nodes and edges
│   └── frontmatter.js   Reads and safely updates YAML frontmatter
├── public/              Everything the browser loads
│   ├── index.html       Page layout
│   ├── style.css        Page styling
│   └── js/
│       ├── main.js      Starts the app and connects the pieces
│       ├── graph.js     Graph canvas: data loading, layouts, search, focus
│       ├── visuals.js   Attribute → color/shape/size mapping, side panels
│       ├── inspector.js Right panel: details and editing
│       ├── settings.js  Saving, exporting and importing view settings
│       └── util.js      Small shared helpers
├── example-vault/       Your research-mapping notes, to try things out
└── package.json         Dependencies and the npm start commands
```

**How the pieces talk to each other**

1. `server.js` calls `buildGraph()` in `lib/vault.js` to read every note, and
   keeps the result in memory.
2. The browser asks for it at `GET /api/graph`.
3. `server.js` also keeps a live connection open at `/api/events`. When the file
   watcher (`chokidar`) sees a change, the graph is rebuilt and the browser is
   told to fetch it again.
4. Saving sends only the changed keys to `POST /api/notes/update`.
   `lib/frontmatter.js` updates just those keys in the file.

**Libraries used**

- [Cytoscape.js](https://js.cytoscape.org) draws the graph.
- [yaml](https://eemeli.org/yaml/) parses and edits YAML while keeping its formatting.
- [chokidar](https://github.com/paulmillr/chokidar) watches files.

There is no build step: edit a file, then refresh the browser. If you edit
`server.js` or `lib/`, restart `npm start`.

### Common tweaks

| I want to… | Change |
|---|---|
| change the default colors, shapes, or labels | `defaultSettings()` in `public/js/settings.js` |
| change the colour palette | `PALETTE` in `public/js/util.js` |
| add a node shape or arrow head to the menus | `NODE_SHAPES` / `ARROWS` in `public/js/visuals.js` |
| tune the force-directed layout | `LAYOUTS` in `public/js/graph.js` |
| read relationships from a different key | `readRelationships()` and `buildGraph()` in `lib/vault.js` |
| skip more folders | `IGNORED_DIRS` in `lib/vault.js` |

---

## 6. Troubleshooting

- **`npm install` fails:** check that `node -v` is 18 or newer and that you're
  online. You only need to be online for this one step.
- **"Vault folder not found":** put the path in quotes if it contains spaces.
- **Port already in use:** run `npm start -- "/path" --port 4000`.
- **A note is missing from the graph:** only `.md` files are read. Folders that
  start with `.`, such as `.obsidian` and `.trash`, are skipped.
- **A note shows a YAML error:** the message in the right panel and in the
  terminal names the line. Fix it in Obsidian; the graph updates by itself.
- **The graph looks messy:** hide reciprocal edge types, pick another layout, or
  drag nodes. Your arrangement is remembered.
- **Start over with the view:** use **Reset to defaults** under
  *Save / share these settings*.
