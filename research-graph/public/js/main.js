// -----------------------------------------------------------------------------
// main.js — starts the app and connects the pieces:
//   server  <->  graph (graph.js)  <->  side panels (visuals.js)  <->  inspector
// -----------------------------------------------------------------------------

import { h, sortKeys, debounce } from './util.js';
import { createGraph, setGraphData, runLayout, savePositions, search, updateHighlight, LAYOUTS } from './graph.js';
import { applyVisuals, applyFilters, renderStylePanel, renderLabelPanel, renderFilterPanel, catalog } from './visuals.js';
import { loadSettings, saveSettings, defaultSettings, exportSettings, importSettings } from './settings.js';
import { createInspector } from './inspector.js';

const $ = (id) => document.getElementById(id);

let vault = null;    // { path, name } of the notes folder
let settings = null; // see settings.js

// ---- Talking to the server ---------------------------------------------------------
async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---- The graph and the inspector -------------------------------------------------------
const cy = createGraph($('cy'), { onSelect: (sel) => inspector.show(sel) });

const inspector = createInspector($('inspector'), {
  cy,
  vault: () => vault,
  save: (file, changes) => api('/api/notes/update', { file, ...changes }),
  reload,
  selectById,
  openCreateDialog,
});

/** Select one element and move the view to it. */
function selectById(id) {
  const ele = cy.getElementById(id);
  if (ele.empty()) return;
  cy.$(':selected').unselect();
  ele.select();
  cy.animate({ center: { eles: ele }, duration: 300 });
}

// Remember positions after dragging.
cy.on('dragfree', 'node', () => savePositions(cy, vault.path));

// ---- (Re)loading the graph -------------------------------------------------------------
async function reload() {
  const graph = await api('/api/graph');
  const firstTime = vault === null;
  if (firstTime) {
    vault = graph.vault;
    settings = loadSettings(vault.path);
    $('vault-name').textContent = '— ' + vault.name;
    $('layout').value = settings.layout;
  }

  const { needsLayout } = setGraphData(cy, graph, vault.path);
  refreshLooks();
  renderPanels();
  fillSuggestionLists();
  search(cy, $('search').value);
  inspector.refresh();

  if (needsLayout) runLayout(cy, settings.layout, vault.path, false);
  else if (firstTime) cy.fit(cy.elements(':visible'), 40);

  // Notes whose frontmatter could not be read.
  const w = $('warnings');
  w.hidden = graph.warnings.length === 0;
  w.replaceChildren(h('b', {}, 'Some notes could not be read:'), h('ul', {}, graph.warnings.map((x) => h('li', {}, x))));
}

/** Re-compute colours/shapes/labels and visibility after any change. */
function refreshLooks() {
  applyVisuals(cy, settings);
  applyFilters(cy, settings);
  updateHighlight(cy);
}

// Called by the side panels after every edit.
function onSettingsChange(redrawPanels) {
  saveSettings(vault.path, settings);
  refreshLooks();
  if (redrawPanels) renderPanels();
}

function renderPanels() {
  renderFilterPanel($('filters'), cy, settings, onSettingsChange);
  renderStylePanel($('node-style'), cy, 'node', settings, onSettingsChange);
  renderStylePanel($('edge-style'), cy, 'edge', settings, onSettingsChange);
  renderLabelPanel($('labels'), cy, settings, onSettingsChange);
}

/** Suggestions shown while typing in the editor and the "New note" dialog. */
function fillSuggestionLists() {
  const fill = (id, values) => $(id).replaceChildren(...values.map((v) => h('option', { value: v })));
  const nodeCat = catalog(cy, 'node');
  const edgeCat = catalog(cy, 'edge');
  fill('dl-attr-keys', [...nodeCat.keys()].filter((k) => !k.startsWith('$')));
  fill('dl-edge-types', sortKeys([...(edgeCat.get('type')?.keys() || [])]));
  fill('dl-note-links', cy.nodes().filter((n) => n.data('file')).map((n) => `[[${n.data('name')}]]`).sort());
  fill('dl-folders', [...new Set(cy.nodes().map((n) => n.data('folder')).filter(Boolean))].sort());
  fill('dl-node-types', sortKeys([...(nodeCat.get('node_type')?.keys() || [])]).filter((k) => k !== '(none)'));
}

// ---- Top bar ------------------------------------------------------------------------------
for (const [name, def] of Object.entries(LAYOUTS)) $('layout').append(h('option', { value: name }, def.label));
$('layout').addEventListener('change', (ev) => {
  settings.layout = ev.target.value;
  saveSettings(vault.path, settings);
  runLayout(cy, settings.layout, vault.path);
});
$('run-layout').addEventListener('click', () => runLayout(cy, settings.layout, vault.path));
$('fit').addEventListener('click', () => cy.animate({ fit: { eles: cy.elements(':visible'), padding: 40 }, duration: 300 }));

const runSearch = debounce(() => {
  const matches = search(cy, $('search').value);
  $('search-count').textContent = matches ? `${matches.length} found` : '';
}, 150);
$('search').addEventListener('input', runSearch);
$('search').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    const matches = search(cy, $('search').value);
    if (matches && matches.nonempty()) {
      if (matches.length === 1) selectById(matches[0].id());
      else cy.animate({ fit: { eles: matches, padding: 80 }, duration: 300 });
    }
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) cy.$(':selected').unselect();
});

// ---- Settings buttons ----------------------------------------------------------------------
$('export-settings').addEventListener('click', () => exportSettings(settings));
$('import-settings').addEventListener('click', async () => {
  try {
    const imported = await importSettings();
    settings = { ...defaultSettings(), ...imported };
    onSettingsChange(true);
  } catch (e) {
    alert(e.message);
  }
});
$('reset-settings').addEventListener('click', () => {
  if (!confirm('Reset all styles, labels and filters to the defaults?')) return;
  settings = defaultSettings();
  $('layout').value = settings.layout;
  onSettingsChange(true);
});

// ---- "New note" dialog ------------------------------------------------------------------------
let linkFrom = null;
function openCreateDialog({ name = '', linkFrom: from = null } = {}) {
  const form = $('new-note-form');
  form.reset();
  form.elements.name.value = name;
  linkFrom = from;
  $('link-from-row').hidden = !from;
  if (from) {
    $('link-from-name').textContent = from.replace(/\.md$/, '').split('/').pop();
    const fromNode = cy.nodes().filter((n) => n.data('file') === from)[0];
    if (fromNode) form.elements.folder.value = fromNode.data('folder'); // same folder by default
  }
  $('new-note-dialog').showModal();
}
$('new-note').addEventListener('click', () => {
  const sel = cy.$('node:selected');
  openCreateDialog({ linkFrom: sel.length === 1 && sel.data('file') ? sel.data('file') : null });
});
$('new-note-dialog').addEventListener('close', async () => {
  if ($('new-note-dialog').returnValue !== 'create') return;
  const f = $('new-note-form').elements;
  const attributes = f.node_type.value.trim() ? { node_type: f.node_type.value.trim() } : {};
  try {
    const res = await api('/api/notes/create', {
      name: f.name.value,
      folder: f.folder.value.trim(),
      attributes,
      linkFrom: linkFrom && f.link_type.value.trim() ? { file: linkFrom, type: f.link_type.value.trim() } : null,
      reverseType: linkFrom ? f.reverse_type.value.trim() : '',
    });
    await reload();
    selectById(res.id);
  } catch (e) {
    alert(e.message);
  }
});

// ---- Live updates -------------------------------------------------------------------------------
// The server sends a "graph" event whenever a Markdown file changes on disk.
function connectLive() {
  const events = new EventSource('/api/events');
  const status = $('status');
  events.addEventListener('open', () => { status.textContent = '● live'; status.className = 'status live'; });
  events.addEventListener('error', () => { status.textContent = '● reconnecting…'; status.className = 'status off'; });
  events.addEventListener('graph', debounce(() => reload().catch(console.error), 100));
}

reload()
  .then(connectLive)
  .catch((e) => {
    $('inspector').replaceChildren(h('div', { class: 'error' }, 'Could not load the graph: ' + e.message));
  });
