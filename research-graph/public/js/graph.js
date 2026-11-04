// -----------------------------------------------------------------------------
// graph.js — everything about the Cytoscape graph canvas:
// creating it, loading/updating data, layouts, remembering node positions,
// search highlighting and "focus on the selection".
// -----------------------------------------------------------------------------

import { valueKey } from './util.js';

// The stylesheet reads the per-element values computed in visuals.js (data(_color) etc).
const STYLESHEET = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(_color)',
      shape: 'data(_shape)',
      width: 'data(_size)',
      height: 'data(_size)',
      opacity: 'data(_opacity)',
      'border-color': 'data(_borderColor)',
      'border-width': 'data(_borderWidth)',
      'border-style': 'data(_borderStyle)',
      label: 'data(_label)',
      'text-wrap': 'wrap',
      'text-valign': 'bottom',
      'text-margin-y': 5,
      color: '#1f2937',
      'text-outline-color': '#ffffff',
      'text-outline-width': 2,
      'min-zoomed-font-size': 7, // hide labels when zoomed far out (keeps it fast and tidy)
    },
  },
  {
    selector: 'edge',
    style: {
      'line-color': 'data(_color)',
      width: 'data(_width)',
      'line-style': 'data(_lineStyle)',
      opacity: 'data(_opacity)',
      'target-arrow-shape': 'data(_targetArrow)',
      'source-arrow-shape': 'data(_sourceArrow)',
      'target-arrow-color': 'data(_color)',
      'source-arrow-color': 'data(_color)',
      'arrow-scale': 1.1,
      'curve-style': 'bezier', // lets several edges between the same two nodes fan out
      label: 'data(_label)',
      'text-rotation': 'autorotate',
      color: '#475569',
      'text-outline-color': '#ffffff',
      'text-outline-width': 2,
      'min-zoomed-font-size': 7,
    },
  },
  // Selection / search / focus effects come last so they win over the mappings.
  { selector: 'node:selected', style: { 'underlay-color': '#2563eb', 'underlay-opacity': 0.28, 'underlay-padding': 7 } },
  { selector: 'edge:selected', style: { 'underlay-color': '#2563eb', 'underlay-opacity': 0.25, 'underlay-padding': 4 } },
  { selector: '.match', style: { 'underlay-color': '#f59e0b', 'underlay-opacity': 0.45, 'underlay-padding': 8 } },
  { selector: '.faded', style: { opacity: 0.1, 'text-opacity': 0.15 } },
  { selector: '.hidden', style: { display: 'none' } },
];

/** Create the graph inside `container`. `onSelect(collection)` fires when the selection changes. */
export function createGraph(container, { onSelect }) {
  const cy = cytoscape({
    container,
    style: STYLESHEET,
    minZoom: 0.05,
    maxZoom: 4,
    boxSelectionEnabled: true, // Shift + drag on the background selects a box of nodes
    selectionType: 'single',   // a click replaces the selection; Shift/Ctrl + click adds to it
  });

  // Cytoscape fires one event per (un)selected element; group them into one callback.
  let pending = false;
  cy.on('select unselect', () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      updateHighlight(cy);
      onSelect(cy.$(':selected'));
    }, 0);
  });
  return cy;
}

// ---- Loading and updating data ---------------------------------------------------

/** Convert the server's graph JSON into Cytoscape elements. */
function toElements(graph) {
  const nodes = graph.nodes.map((n) => ({
    group: 'nodes',
    data: {
      id: n.id, name: n.name, file: n.file, folder: n.folder, external: n.external,
      unresolvedLink: !!n.unresolvedLink, error: n.error, attrs: n.attributes, relationships: n.relationships,
    },
  }));
  const edges = graph.edges.map((e) => ({
    group: 'edges',
    data: { id: e.id, source: e.source, target: e.target, origin: e.origin, attrs: e.attributes },
  }));
  return [...nodes, ...edges];
}

/**
 * Put new graph data on screen. On later calls (live updates) only the
 * differences are applied, so existing nodes keep their positions.
 */
export function setGraphData(cy, graph, vaultPath) {
  const firstLoad = cy.elements().empty();
  const elements = toElements(graph);
  const newIds = new Set(elements.map((el) => el.data.id));
  const saved = loadPositions(vaultPath);
  const added = [];

  cy.batch(() => {
    // 1) remove what no longer exists
    cy.elements().filter((ele) => !newIds.has(ele.id())).remove();

    // 2) update or add
    for (const el of elements) {
      const existing = cy.getElementById(el.data.id);
      const endpointsChanged =
        existing.nonempty() && el.group === 'edges' &&
        (existing.data('source') !== el.data.source || existing.data('target') !== el.data.target);
      if (existing.nonempty() && !endpointsChanged) {
        const { id, source, target, ...changeable } = el.data; // ids and endpoints can't be changed in place
        existing.data(changeable); // replaces attrs with the new values
      } else {
        if (endpointsChanged) existing.remove();
        if (el.group === 'nodes') el.position = saved[el.data.id] ? { ...saved[el.data.id] } : { x: 0, y: 0 };
        const ele = cy.add(el);
        if (el.group === 'nodes' && !saved[el.data.id]) added.push(ele);
      }
    }
  });

  // Tell the caller whether a full layout is needed (first load, positions mostly unknown).
  if (firstLoad && added.length > cy.nodes().length * 0.4) return { needsLayout: true };
  placeNearNeighbours(cy, added);
  savePositions(cy, vaultPath);
  return { needsLayout: false };
}

/** Put freshly added nodes next to the nodes they connect to (or in the middle). */
function placeNearNeighbours(cy, nodes) {
  const placed = new Set(nodes.map((n) => n.id()));
  const ext = cy.extent();
  for (const node of nodes) {
    const anchors = node.neighborhood('node').filter((n) => !placed.has(n.id()));
    // A random point on a circle of radius 110 around the anchor point.
    const angle = Math.random() * 2 * Math.PI;
    const offset = { x: Math.cos(angle) * 110, y: Math.sin(angle) * 110 };
    if (anchors.nonempty()) {
      const x = anchors.map((n) => n.position('x')).reduce((a, b) => a + b, 0) / anchors.length;
      const y = anchors.map((n) => n.position('y')).reduce((a, b) => a + b, 0) / anchors.length;
      node.position({ x: x + offset.x, y: y + offset.y });
    } else {
      node.position({ x: (ext.x1 + ext.x2) / 2 + offset.x, y: (ext.y1 + ext.y2) / 2 + offset.y });
    }
    placed.delete(node.id());
  }
}

// ---- Layouts ---------------------------------------------------------------------------

export const LAYOUTS = {
  cose: { label: 'Force-directed', options: { name: 'cose', nodeRepulsion: () => 25000, idealEdgeLength: () => 70, edgeElasticity: () => 100, nodeOverlap: 40, gravity: 1, numIter: 2500, componentSpacing: 60 } },
  breadthfirst: { label: 'Hierarchy', options: { name: 'breadthfirst', directed: true, spacingFactor: 1.15 } },
  concentric: { label: 'Rings (most connected in centre)', options: { name: 'concentric', concentric: (n) => n.degree(), levelWidth: () => 3, minNodeSpacing: 25 } },
  circle: { label: 'Circle', options: { name: 'circle' } },
  grid: { label: 'Grid', options: { name: 'grid', avoidOverlap: true } },
};

/** Arrange the visible nodes with the chosen layout. */
export function runLayout(cy, name, vaultPath, animate = true) {
  const def = LAYOUTS[name] || LAYOUTS.cose;
  const layout = cy.elements(':visible').layout({ ...def.options, animate, animationDuration: 600, padding: 40, fit: true });
  layout.one('layoutstop', () => savePositions(cy, vaultPath));
  layout.run();
}

// ---- Remembering where nodes are (so dragging survives reloads) ----------------------

const posKey = (vaultPath) => 'research-graph:positions:' + vaultPath;

export function savePositions(cy, vaultPath) {
  const out = {};
  cy.nodes().forEach((n) => (out[n.id()] = { x: Math.round(n.position('x')), y: Math.round(n.position('y')) }));
  try { localStorage.setItem(posKey(vaultPath), JSON.stringify(out)); } catch { /* storage unavailable */ }
}

function loadPositions(vaultPath) {
  try { return JSON.parse(localStorage.getItem(posKey(vaultPath)) || '{}'); } catch { return {}; }
}

// ---- Search and focus -----------------------------------------------------------------------

let searchMatches = null;

/** Highlight nodes whose name or any attribute value contains `query`. Returns the matches. */
export function search(cy, query) {
  const q = query.trim().toLowerCase();
  cy.elements().removeClass('match');
  if (!q) {
    searchMatches = null;
  } else {
    searchMatches = cy.nodes(':visible').filter((n) => {
      if (n.data('name').toLowerCase().includes(q)) return true;
      return Object.values(n.data('attrs')).some((v) => valueKey(v).toLowerCase().includes(q));
    });
    searchMatches.addClass('match');
  }
  updateHighlight(cy);
  return searchMatches;
}

/**
 * Fade everything that is not related to the current selection, so its
 * connections stand out. With nothing selected, fade everything that does
 * not match the search (if a search is active).
 */
export function updateHighlight(cy) {
  cy.batch(() => {
    cy.elements().removeClass('faded');
    const sel = cy.$(':selected');
    let keep = null;
    if (sel.nonempty()) {
      keep = sel.union(sel.nodes().closedNeighborhood()).union(sel.edges().connectedNodes());
    } else if (searchMatches) {
      keep = searchMatches.union(searchMatches.edgesWith(searchMatches));
    }
    if (keep) cy.elements().not(keep).addClass('faded');
  });
}
