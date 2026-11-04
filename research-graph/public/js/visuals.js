// -----------------------------------------------------------------------------
// visuals.js — turns attributes into looks.
//
// For every visual property (fill colour, shape, size, line style, ...) the
// user picks ONE attribute, e.g. "colour by node_type", "size by level".
// Every distinct value of that attribute gets its own colour/shape/size,
// assigned automatically and editable in the side panel. Because each visual
// property can use a different attribute, one node can show several
// attributes at once (colour = type, shape = subtype, border = validation...).
//
// How it reaches the screen: for each element we compute the final values and
// store them in hidden data fields (_color, _shape, ...). The Cytoscape
// stylesheet in graph.js simply reads those fields.
// -----------------------------------------------------------------------------

import { h, NONE, valueKey, sortKeys, PALETTE } from './util.js';

// ---- What can be customised ---------------------------------------------------
const NODE_SHAPES = [
  'ellipse', 'round-rectangle', 'diamond', 'hexagon', 'triangle', 'star', 'round-tag', 'barrel',
  'octagon', 'pentagon', 'rhomboid', 'vee', 'rectangle', 'cut-rectangle', 'concave-hexagon',
];
const ARROWS = ['triangle', 'vee', 'circle', 'square', 'diamond', 'tee', 'chevron', 'triangle-tee', 'triangle-backcurve', 'none'];

// kind: 'color' -> colour picker, 'select' -> dropdown, 'number' -> number box
// fixed: the value used when no attribute is chosen
// range: [first, last] value handed out automatically for number properties
export const NODE_PROPS = {
  color:       { label: 'Fill color',   kind: 'color',  fixed: '#9aa7b8' },
  shape:       { label: 'Shape',        kind: 'select', options: NODE_SHAPES, fixed: 'ellipse' },
  size:        { label: 'Size',         kind: 'number', min: 6, max: 160, step: 2, fixed: 34, range: [26, 70] },
  opacity:     { label: 'Opacity',      kind: 'number', min: 0.05, max: 1, step: 0.05, fixed: 1, range: [1, 0.35] },
  borderColor: { label: 'Border color', kind: 'color',  fixed: '#475569' },
  borderWidth: { label: 'Border width', kind: 'number', min: 0, max: 12, step: 0.5, fixed: 1.5, range: [1, 6] },
  borderStyle: { label: 'Border style', kind: 'select', options: ['solid', 'dashed', 'dotted', 'double'], fixed: 'solid' },
};
export const EDGE_PROPS = {
  color:     { label: 'Line color', kind: 'color',  fixed: '#94a3b8' },
  width:     { label: 'Width',      kind: 'number', min: 0.5, max: 14, step: 0.5, fixed: 1.5, range: [1, 6] },
  lineStyle: { label: 'Line style', kind: 'select', options: ['solid', 'dashed', 'dotted'], fixed: 'solid' },
  opacity:   { label: 'Opacity',    kind: 'number', min: 0.05, max: 1, step: 0.05, fixed: 0.9, range: [0.9, 0.3] },
  arrow:     { label: 'Arrow head', kind: 'select', options: ARROWS, fixed: 'triangle' },
};
const PROPS = { node: NODE_PROPS, edge: EDGE_PROPS };

// ---- Built-in "pseudo attributes" (not in the frontmatter) --------------------
const PSEUDO = {
  node: {
    $name: 'file name',
    $folder: 'folder',
    $external: 'not a file (external reference)',
    $degree: 'number of connections',
  },
  edge: {
    $origin: 'defined in (relationships / attribute)',
  },
};

/** Human-friendly name of an attribute for menus. */
export function attrLabel(group, attr) {
  return PSEUDO[group][attr] ? '· ' + PSEUDO[group][attr] : attr;
}

/** Read the value of `attr` for a Cytoscape element. */
export function getValue(ele, attr) {
  const d = ele.data();
  if (ele.isNode()) {
    if (attr === '$name') return d.name;
    if (attr === '$folder') return d.folder || '(vault root)';
    if (attr === '$external') return d.external ? 'yes' : 'no';
    if (attr === '$degree') return ele.degree(false);
  } else if (attr === '$origin') {
    return d.origin;
  }
  return d.attrs[attr];
}

/**
 * Discover every attribute and every value present in the graph right now.
 * Returns Map(attr -> Map(valueKey -> count)). Nothing here is hard-coded:
 * add a new frontmatter key in Obsidian and it appears in the menus.
 */
export function catalog(cy, group) {
  const elements = group === 'node' ? cy.nodes() : cy.edges();
  const attrs = new Set(Object.keys(PSEUDO[group]));
  elements.forEach((ele) => Object.keys(ele.data('attrs')).forEach((a) => attrs.add(a)));
  const result = new Map();
  for (const attr of [...Object.keys(PSEUDO[group]), ...[...attrs].filter((a) => !a.startsWith('$')).sort()]) {
    const counts = new Map();
    elements.forEach((ele) => {
      const k = valueKey(getValue(ele, attr));
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    result.set(attr, counts);
  }
  return result;
}

// ---- Automatic value assignment -------------------------------------------------
/** Pick a value for the i-th of n keys that isn't already used in the map. */
function autoValue(def, key, i, n, used) {
  if (def.kind === 'color') {
    if (key === NONE) return '#c3cad5';
    return PALETTE.find((c) => !used.has(c)) || PALETTE[i % PALETTE.length];
  }
  if (def.kind === 'select') {
    // Start with the default so the first value looks "normal".
    const options = [def.fixed, ...def.options.filter((o) => o !== def.fixed && o !== 'none')];
    return options.find((o) => !used.has(o)) || options[i % options.length];
  }
  // number: spread the values evenly across the range
  const [a, b] = def.range;
  const t = n <= 1 ? 0 : i / (n - 1);
  return Math.round((a + (b - a) * t) * 100) / 100;
}

/** Make sure every value of the chosen attribute has an entry in the map. */
function fillMap(group, propName, prop, counts) {
  const def = PROPS[group][propName];
  const keys = sortKeys([...counts.keys()]);
  const used = new Set(Object.values(prop.map));
  keys.forEach((key, i) => {
    if (!(key in prop.map)) {
      prop.map[key] = autoValue(def, key, i, keys.length, used);
      used.add(prop.map[key]);
    }
  });
}

/** Text shown as a label for an element. */
function labelFor(ele, labels, showKeys, group) {
  const parts = [];
  for (const attr of labels) {
    const k = valueKey(getValue(ele, attr));
    if (k === NONE) continue;
    parts.push(showKeys ? `${attr.startsWith('$') ? PSEUDO[group][attr] : attr}: ${k}` : k);
  }
  // Nodes without any of the chosen attributes (e.g. external references) still get their name.
  if (parts.length === 0 && labels.length > 0 && group === 'node') return ele.data('name');
  return parts.join('\n');
}

/** Compute the look of every node and edge from the settings. */
export function applyVisuals(cy, settings) {
  for (const group of ['node', 'edge']) {
    const cat = catalog(cy, group);
    const s = settings[group];
    for (const name of Object.keys(PROPS[group])) {
      if (s[name].attr && cat.has(s[name].attr)) fillMap(group, name, s[name], cat.get(s[name].attr));
    }
  }

  // Value of one visual property for one element.
  const pick = (ele, prop) => {
    if (!prop.attr) return prop.fixed;
    const v = prop.map[valueKey(getValue(ele, prop.attr))];
    return v === undefined ? prop.fixed : v;
  };

  cy.batch(() => {
    const n = settings.node;
    cy.nodes().forEach((node) => {
      node.data({
        _color: pick(node, n.color),
        _shape: pick(node, n.shape),
        _size: Number(pick(node, n.size)),
        _opacity: Number(pick(node, n.opacity)),
        _borderColor: pick(node, n.borderColor),
        _borderWidth: Number(pick(node, n.borderWidth)),
        _borderStyle: pick(node, n.borderStyle),
        _label: labelFor(node, n.labels, n.labelKeys, 'node'),
      });
    });

    const e = settings.edge;
    cy.edges().forEach((edge) => {
      // The `direction` attribute decides at which end(s) the arrow head goes.
      //   forward (default): source -> target     backward: source <- target
      //   both: <->                               none / undirected: no arrow
      const shape = pick(edge, e.arrow);
      const dir = String(edge.data('attrs').direction ?? 'forward').toLowerCase();
      const atTarget = !['backward', 'none', 'undirected'].includes(dir);
      const atSource = ['backward', 'both', 'bidirectional'].includes(dir);
      edge.data({
        _color: pick(edge, e.color),
        _width: Number(pick(edge, e.width)),
        _lineStyle: pick(edge, e.lineStyle),
        _opacity: Number(pick(edge, e.opacity)),
        _targetArrow: atTarget ? shape : 'none',
        _sourceArrow: atSource ? shape : 'none',
        _label: labelFor(edge, e.labels, e.labelKeys, 'edge'),
      });
    });
  });

  cy.style()
    .selector('node').style({ 'font-size': settings.node.fontSize, 'text-max-width': settings.node.labelWidth })
    .selector('edge').style({ 'font-size': settings.edge.fontSize })
    .update();
}

// ---- Filters (show / hide) ---------------------------------------------------------
/** Hide every element whose value for the filter attribute is in the hidden list. */
export function applyFilters(cy, settings) {
  cy.batch(() => {
    for (const group of ['node', 'edge']) {
      const f = settings.filters[group];
      const hidden = new Set(f.hidden);
      (group === 'node' ? cy.nodes() : cy.edges()).forEach((ele) => {
        const hide = f.attr ? hidden.has(valueKey(getValue(ele, f.attr))) : false;
        ele.toggleClass('hidden', hide);
      });
    }
  });
}

// ---- Side-panel UI ----------------------------------------------------------------

/** A <select> listing every attribute, plus an optional "none" entry. */
function attrSelect(group, cat, current, noneLabel, onchange) {
  return h(
    'select',
    { onchange: (ev) => onchange(ev.target.value || null) },
    noneLabel ? h('option', { value: '' }, noneLabel) : null,
    [...cat.keys()].map((a) => h('option', { value: a, selected: a === current }, attrLabel(group, a))),
  );
}

/** The input used to edit one visual value (colour picker, dropdown or number). */
function valueInput(def, value, onchange) {
  if (def.kind === 'color') {
    return h('input', { type: 'color', value, oninput: (ev) => onchange(ev.target.value) });
  }
  if (def.kind === 'select') {
    return h(
      'select',
      { class: 'small', onchange: (ev) => onchange(ev.target.value) },
      def.options.map((o) => h('option', { value: o, selected: o === value }, o)),
    );
  }
  return h('input', {
    type: 'number', class: 'num', value, min: def.min, max: def.max, step: def.step,
    oninput: (ev) => ev.target.value !== '' && onchange(Number(ev.target.value)),
  });
}

/**
 * Build the "Node style" or "Edge style" panel.
 * `onChange(rebuild)` is called after every edit; rebuild=true means the panel
 * itself needs redrawing (e.g. a different attribute was chosen).
 */
export function renderStylePanel(container, cy, group, settings, onChange) {
  const cat = catalog(cy, group);
  const s = settings[group];
  container.replaceChildren();

  for (const [name, def] of Object.entries(PROPS[group])) {
    const prop = s[name];
    const head = h(
      'div', { class: 'prop-head' },
      h('span', { class: 'prop-name' }, def.label),
      attrSelect(group, cat, prop.attr, '— same for all —', (attr) => {
        prop.attr = attr;
        prop.map = {}; // new attribute -> fresh automatic values
        onChange(true);
      }),
    );
    const body = h('div', { class: 'prop-body' });

    if (!prop.attr || !cat.has(prop.attr)) {
      body.append(h('div', { class: 'value-row' }, valueInput(def, prop.fixed, (v) => { prop.fixed = v; onChange(false); }), h('span', { class: 'muted' }, 'all elements')));
    } else {
      for (const key of sortKeys([...cat.get(prop.attr).keys()])) {
        body.append(
          h('div', { class: 'value-row' },
            valueInput(def, prop.map[key] ?? prop.fixed, (v) => { prop.map[key] = v; onChange(false); }),
            h('span', { class: 'value-key', title: key }, key),
            h('span', { class: 'count' }, cat.get(prop.attr).get(key)),
          ),
        );
      }
      body.append(
        h('button', { class: 'link', title: 'Forget manual choices and assign values automatically again', onclick: () => { prop.map = {}; onChange(true); } }, '↺ auto-assign'),
      );
    }
    container.append(h('div', { class: 'prop' }, head, body));
  }
}

/** Build the "Labels" panel: tick the attributes to show on nodes / edges. */
export function renderLabelPanel(container, cy, settings, onChange) {
  container.replaceChildren();
  for (const group of ['node', 'edge']) {
    const s = settings[group];
    const cat = catalog(cy, group);
    const list = h('div', { class: 'check-list' });
    // Ticked attributes first (in the order they appear in the label), then the rest.
    const ordered = [...s.labels.filter((a) => cat.has(a)), ...[...cat.keys()].filter((a) => !s.labels.includes(a))];
    for (const attr of ordered) {
      list.append(
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: s.labels.includes(attr),
            onchange: (ev) => {
              s.labels = ev.target.checked ? [...s.labels, attr] : s.labels.filter((a) => a !== attr);
              onChange(true);
            },
          }),
          attrLabel(group, attr),
        ),
      );
    }
    container.append(
      h('h4', {}, group === 'node' ? 'Node labels' : 'Edge labels'),
      list,
      h('div', { class: 'row' },
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: s.labelKeys, onchange: (ev) => { s.labelKeys = ev.target.checked; onChange(false); } }),
          'show attribute names'),
        h('label', { class: 'inline' }, 'font ',
          h('input', { type: 'number', class: 'num', min: 4, max: 40, value: s.fontSize, oninput: (ev) => { s.fontSize = Number(ev.target.value) || s.fontSize; onChange(false); } })),
      ),
    );
  }
}

/** Build the "Show / hide" panel. */
export function renderFilterPanel(container, cy, settings, onChange) {
  container.replaceChildren();
  for (const group of ['node', 'edge']) {
    const f = settings.filters[group];
    const cat = catalog(cy, group);
    const list = h('div', { class: 'check-list' });
    if (f.attr && cat.has(f.attr)) {
      for (const key of sortKeys([...cat.get(f.attr).keys()])) {
        list.append(
          h('label', { class: 'check' },
            h('input', {
              type: 'checkbox', checked: !f.hidden.includes(key),
              onchange: (ev) => {
                f.hidden = ev.target.checked ? f.hidden.filter((k) => k !== key) : [...f.hidden, key];
                onChange(false);
              },
            }),
            h('span', { class: 'value-key' }, key),
            h('span', { class: 'count' }, cat.get(f.attr).get(key)),
          ),
        );
      }
    }
    container.append(
      h('div', { class: 'prop-head' },
        h('span', { class: 'prop-name' }, group === 'node' ? 'Nodes by' : 'Edges by'),
        attrSelect(group, cat, f.attr, '— show all —', (attr) => { f.attr = attr; f.hidden = []; onChange(true); }),
      ),
      list,
    );
  }
}
