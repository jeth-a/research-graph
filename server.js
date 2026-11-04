// -----------------------------------------------------------------------------
// server.js — the local web server.
//
//   node server.js [path/to/vault] [--port 3000]
//
// It does four things:
//   1. Serves the web page in ./public
//   2. GET  /api/graph          -> the graph built from the Markdown files
//   3. GET  /api/events         -> a live stream that says "the graph changed"
//                                  (Server-Sent Events; the page listens to it)
//   4. POST /api/notes/update   -> edit a note's frontmatter
//      POST /api/notes/create   -> create a new note
//
// A file watcher re-reads the vault whenever a .md file changes, whether the
// change came from Obsidian, this app, or anything else.
// -----------------------------------------------------------------------------

const http = require('http');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { buildGraph } = require('./lib/vault');
const { updateFrontmatter, newNoteText, parseFrontmatter } = require('./lib/frontmatter');

// ---- Settings from the command line ------------------------------------------
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = Number(portFlag >= 0 ? args[portFlag + 1] : process.env.PORT || 3000);
const vaultArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const VAULT = path.resolve(vaultArg || process.env.VAULT || path.join(__dirname, 'example-vault'));

if (!fs.existsSync(VAULT) || !fs.statSync(VAULT).isDirectory()) {
  console.error('Vault folder not found: ' + VAULT);
  process.exit(1);
}

// ---- The graph, kept in memory and rebuilt when files change ------------------
let graph = null;
let version = 0;

function rebuild(reason) {
  try {
    graph = buildGraph(VAULT);
    version++;
    console.log(`[${new Date().toLocaleTimeString()}] graph v${version}: ${graph.nodes.length} nodes, ${graph.edges.length} edges (${reason})`);
    for (const w of graph.warnings) console.warn('  warning: ' + w);
    broadcast('graph', { version });
  } catch (err) {
    console.error('Could not build graph:', err);
  }
}

// ---- Live updates (Server-Sent Events) ----------------------------------------
// Each open browser tab keeps one /api/events request open; we write a short
// message into it whenever the graph changes and the page re-fetches the graph.
const clients = new Set();
function broadcast(event, data) {
  for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---- File watcher -------------------------------------------------------------
// Editors often save a file in several quick steps, so we wait until things
// have been quiet for 200 ms before rebuilding (this is called "debouncing").
let timer = null;
function scheduleRebuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(reason), 200);
}
chokidar
  .watch(VAULT, {
    ignoreInitial: true,
    ignored: (p) => /(^|[\/\\])(\.|node_modules)/.test(path.relative(VAULT, p)),
  })
  .on('all', (event, p) => {
    if (event.endsWith('Dir') || p.toLowerCase().endsWith('.md')) {
      scheduleRebuild(`${event} ${path.relative(VAULT, p)}`);
    }
  });

// ---- Helpers ------------------------------------------------------------------

/** Turn a relative note path from the browser into a safe absolute path inside the vault. */
function safeNotePath(relFile) {
  if (typeof relFile !== 'string' || !relFile.toLowerCase().endsWith('.md')) {
    throw new Error('Not a Markdown file: ' + relFile);
  }
  const abs = path.resolve(VAULT, relFile);
  if (!abs.startsWith(VAULT + path.sep)) throw new Error('Path is outside the vault: ' + relFile);
  return abs;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}

// Characters Obsidian does not allow in note names.
const BAD_NAME = /[\\/:*?"<>|#[\]]/;

// ---- Routes -------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // The graph itself
    if (req.method === 'GET' && url.pathname === '/api/graph') {
      return sendJSON(res, 200, { version, vault: { path: VAULT, name: path.basename(VAULT) }, ...graph });
    }

    // Live update stream
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ version })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Edit frontmatter of an existing note.
    // Body: { file, set: {key: value}, remove: [key] }
    if (req.method === 'POST' && url.pathname === '/api/notes/update') {
      const { file, set, remove } = await readBody(req);
      const abs = safeNotePath(file);
      const before = fs.readFileSync(abs, 'utf8'); // always start from what is on disk *now*
      const after = updateFrontmatter(before, { set, remove });
      if (after !== before) fs.writeFileSync(abs, after, 'utf8');
      rebuild('saved ' + file);
      return sendJSON(res, 200, { ok: true, changed: after !== before });
    }

    // Create a new note.
    // Body: { name, folder, attributes,
    //         linkFrom: { file, type }  (optional: add a link from that note to the new one)
    //         reverseType               (optional: add a link back from the new note) }
    if (req.method === 'POST' && url.pathname === '/api/notes/create') {
      const { name, folder = '', attributes = {}, linkFrom, reverseType } = await readBody(req);
      const cleanName = String(name || '').trim();
      if (!cleanName || BAD_NAME.test(cleanName) || cleanName.startsWith('.')) {
        throw new Error('Please choose a note name without these characters: \\ / : * ? " < > | # [ ]');
      }
      const rel = (folder ? folder.replace(/^\/+|\/+$/g, '') + '/' : '') + cleanName + '.md';
      const abs = safeNotePath(rel);
      if (fs.existsSync(abs)) throw new Error('A note with that name already exists: ' + rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const relationships = [];
      if (linkFrom && linkFrom.file && reverseType) {
        relationships.push({ type: reverseType, target: `[[${path.posix.basename(linkFrom.file, '.md')}]]` });
      }
      fs.writeFileSync(abs, newNoteText({ ...attributes, title: cleanName, relationships }, cleanName), 'utf8');

      // Optionally add a relationship from an existing note to the new one.
      if (linkFrom && linkFrom.file && linkFrom.type) {
        const fromAbs = safeNotePath(linkFrom.file);
        const text = fs.readFileSync(fromAbs, 'utf8');
        const current = parseFrontmatter(text).data.relationships;
        if (current != null && !Array.isArray(current)) {
          throw new Error('Note created, but could not add the link: "relationships" in ' + linkFrom.file + ' is not a list.');
        }
        const existing = current || [];
        const relationships = [...existing, { type: linkFrom.type, target: `[[${cleanName}]]` }];
        fs.writeFileSync(fromAbs, updateFrontmatter(text, { set: { relationships } }), 'utf8');
      }
      rebuild('created ' + rel);
      return sendJSON(res, 200, { ok: true, file: rel, id: rel.replace(/\.md$/, '') });
    }

    // The graph library, served straight from node_modules (works offline).
    if (req.method === 'GET' && url.pathname === '/vendor/cytoscape.min.js') {
      return sendFile(res, require.resolve('cytoscape/dist/cytoscape.min.js'));
    }

    // Static files from ./public
    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(__dirname, 'public', rel);
      if (!file.startsWith(path.join(__dirname, 'public') + path.sep)) return sendJSON(res, 403, { error: 'Forbidden' });
      return sendFile(res, file);
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJSON(res, 400, { error: err.message });
  }
});

// Friendly message when the port is taken (usually: the app is already running).
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use — probably Research Graph (or another app) is already running.`);
    console.error('Either stop it (Ctrl + C in its terminal window), or start on another port, e.g.:');
    console.error(`  npm start -- "${VAULT}" --port ${PORT + 1}\n`);
    process.exit(1);
  }
  throw err;
});

rebuild('startup');
// 127.0.0.1 = only reachable from this computer, not from the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nResearch Graph is running at  http://localhost:${PORT}`);
  console.log(`Reading notes from            ${VAULT}\n`);
});
