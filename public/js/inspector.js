// -----------------------------------------------------------------------------
// inspector.js — the right-hand panel.
//
// Shows the selected node or edge, lists its connections, and lets you edit a
// note's attributes and relationships. Saving sends ONLY the changed keys to
// the server, which updates just those keys in the file's frontmatter.
// -----------------------------------------------------------------------------

import { h, valueKey, toEditText, fromEditText, parseTyped, stableStringify } from './util.js';
import { catalog } from './visuals.js';

export function createInspector(container, ctx) {
  // ctx = { cy, vault(), save(file, changes), reload(), selectById(id), openCreateDialog(opts) }
  let current = null;   // id of the element being shown
  let dirty = false;    // unsaved edits?
  let snapshot = '';    // the note's data when the editor was opened (to detect outside changes)

  // ---- public API ----
  function show(selection) {
    if (dirty && !confirm('Discard your unsaved changes?')) return false;
    dirty = false;
    if (!selection || selection.empty()) { current = null; renderEmpty(); return true; }
    if (selection.length > 1) { current = null; renderMany(selection); return true; }
    const ele = selection[0];
    current = ele.id();
    ele.isNode() ? renderNode(ele) : renderEdge(ele);
    return true;
  }

  /** Called after the graph was reloaded (e.g. the file changed in Obsidian). */
  function refresh() {
    if (!current) return;
    const ele = ctx.cy.getElementById(current);
    if (ele.empty()) { current = null; dirty = false; renderEmpty(); return; }
    if (!dirty) { ele.isNode() ? renderNode(ele) : renderEdge(ele); return; }
    if (ele.isNode() && snapshotOf(ele) !== snapshot) {
      // Someone else changed this note while we were editing it.
      const banner = container.querySelector('.stale');
      if (banner) banner.hidden = false;
    }
  }

  const snapshotOf = (node) => JSON.stringify([node.data('attrs'), node.data('relationships')]);
  const isDirty = () => dirty;

  // ---- small building blocks ----
  function nodeLink(node) {
    return h('button', { class: 'link', title: node.data('file') || 'external reference', onclick: () => ctx.selectById(node.id()) }, node.data('name'));
  }

  function connections(node) {
    const out = node.outgoers('edge');
    const inc = node.incomers('edge');
    const row = (edge, other, arrow) =>
      h('li', {},
        h('span', { class: 'edge-type' }, edge.data('attrs').type), ' ', arrow, ' ', nodeLink(other),
        h('button', { class: 'link tiny', title: 'Show this relationship', onclick: () => ctx.selectById(edge.id()) }, 'ⓘ'));
    return h('section', {},
      h('h3', {}, `Connections (${out.length + inc.length})`),
      out.length ? h('div', { class: 'muted small' }, 'Outgoing (this note → other)') : null,
      h('ul', { class: 'conn' }, out.map((e) => row(e, e.target(), '→'))),
      inc.length ? h('div', { class: 'muted small' }, 'Incoming (other → this note)') : null,
      h('ul', { class: 'conn' }, inc.map((e) => row(e, e.source(), '←'))),
    );
  }

  // ---- views ----
  function renderEmpty() {
    container.replaceChildren(
      h('div', { class: 'empty' },
        h('h2', {}, 'Nothing selected'),
        h('p', {}, 'Click a node or edge to inspect and edit it.'),
        h('ul', { class: 'tips' },
          h('li', {}, 'Scroll to zoom, drag the background to pan.'),
          h('li', {}, 'Drag nodes to arrange them; positions are remembered.'),
          h('li', {}, 'Shift + click or Shift + drag to select several.'),
          h('li', {}, 'Use the left panel to colour, shape, size and label by any attribute.'),
        ),
      ),
    );
  }

  function renderMany(sel) {
    const nodes = sel.nodes();
    container.replaceChildren(
      h('h2', {}, `${nodes.length} nodes, ${sel.edges().length} edges selected`),
      h('ul', { class: 'conn' }, nodes.map((n) => h('li', {}, nodeLink(n)))),
    );
  }

  function renderEdge(edge) {
    const attrs = edge.data('attrs');
    const source = edge.source();
    container.replaceChildren(
      h('div', { class: 'kind' }, 'Relationship'),
      h('h2', {}, attrs.type),
      h('p', { class: 'endpoints' }, nodeLink(source), ' → ', nodeLink(edge.target())),
      h('section', {},
        h('h3', {}, 'Attributes'),
        h('table', { class: 'kv' }, Object.entries(attrs).map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, valueKey(v))))),
      ),
      h('p', { class: 'muted small' },
        edge.data('origin') === 'relationships'
          ? 'Defined in the "relationships" list of the source note.'
          : `Defined by the "${edge.data('origin')}" attribute of the source note.`),
      source.data('file') ? h('button', { class: 'btn', onclick: () => ctx.selectById(source.id()) }, 'Edit in source note') : null,
    );
  }

  function renderNode(node) {
    const d = node.data();
    snapshot = snapshotOf(node);

    if (d.external) {
      container.replaceChildren(
        h('div', { class: 'kind' }, d.unresolvedLink ? 'Link to a note that does not exist yet' : 'External reference (plain text, not a note)'),
        h('h2', {}, d.name),
        d.unresolvedLink
          ? h('button', { class: 'btn primary', onclick: () => ctx.openCreateDialog({ name: d.name }) }, 'Create this note')
          : h('p', { class: 'muted small' }, 'To turn it into a note, create a note and change the reference to [[Note name]].'),
        connections(node),
      );
      return;
    }

    const head = [
      h('div', { class: 'kind' }, 'Note', d.folder ? ' · ' + d.folder : ''),
      h('h2', {}, d.name),
      h('div', { class: 'small' },
        h('a', { href: 'obsidian://open?path=' + encodeURIComponent(ctx.vault().path + '/' + d.file) }, 'Open in Obsidian'),
        h('span', { class: 'muted' }, ' · ' + d.file)),
    ];

    if (d.error) {
      container.replaceChildren(...head, h('div', { class: 'error' }, d.error, h('br'), 'Fix the frontmatter in Obsidian; the graph updates automatically.'), connections(node));
      return;
    }

    // ---------- Attribute editor ----------
    const attrs = d.attrs;
    const rows = []; // { key, original, input, removed, isNew }
    const attrTable = h('div', { class: 'attr-table' });

    const markDirty = () => {
      dirty = true;
      saveBtn.disabled = false;
      discardBtn.disabled = false;
    };

    function addAttrRow(key, original, isNew) {
      const text = toEditText(original);
      const multiline = Array.isArray(original) || (original && typeof original === 'object') || text.length > 50 || text.includes('\n');
      const input = multiline
        ? h('textarea', { rows: Math.min(8, Math.max(2, text.split('\n').length)), oninput: markDirty }, text)
        : h('input', { type: 'text', value: text, oninput: markDirty });
      if (multiline) input.value = text;
      const row = { key, original, input, removed: false, isNew, text };
      const el = h('div', { class: 'attr-row' + (isNew ? ' new' : '') },
        h('label', { title: Array.isArray(original) ? 'List: one item per line' : '' }, key, Array.isArray(original) ? h('span', { class: 'muted' }, ' (list)') : null),
        input,
        h('button', {
          class: 'icon', title: 'Remove this attribute',
          onclick: () => {
            row.removed = !row.removed;
            el.classList.toggle('removed', row.removed);
            input.disabled = row.removed;
            markDirty();
          },
        }, '✕'));
      rows.push(row);
      attrTable.append(el);
    }
    for (const [k, v] of Object.entries(attrs)) addAttrRow(k, v, false);

    // "Add attribute" form. The list of suggestions comes from all notes.
    const knownKeys = [...catalog(ctx.cy, 'node').keys()].filter((k) => !k.startsWith('$') && !(k in attrs));
    const newKey = h('input', { type: 'text', placeholder: 'new attribute', list: 'dl-attr-keys' });
    const newVal = h('input', { type: 'text', placeholder: 'value' });
    const addAttr = () => {
      const key = newKey.value.trim();
      if (!key) return;
      if (key === 'relationships' || rows.some((r) => r.key === key && !r.removed)) { alert('That attribute already exists.'); return; }
      const row = rows.length;
      addAttrRow(key, null, true);
      rows[row].input.value = newVal.value;
      newKey.value = newVal.value = '';
      markDirty();
    };
    newVal.addEventListener('keydown', (ev) => ev.key === 'Enter' && addAttr());

    // ---------- Relationship editor ----------
    const rawRels = d.relationships;
    const editableRels = rawRels === null || (Array.isArray(rawRels) && rawRels.every((r) => r && typeof r === 'object' && !Array.isArray(r)));
    const relRows = []; // { typeIn, targetIn, extraIn, removed }
    const relTable = h('div', { class: 'rel-table' });

    function addRelRow(rel) {
      const { type = '', target = '', ...extra } = rel;
      const typeIn = h('input', { type: 'text', value: type ?? '', placeholder: 'type', list: 'dl-edge-types', oninput: markDirty });
      const targetIn = h('input', { type: 'text', value: target ?? '', title: target ?? '', placeholder: '[[Note name]] or text', list: 'dl-note-links', oninput: markDirty });
      const extraIn = h('input', { type: 'text', value: extraToText(extra), placeholder: 'edge attributes (optional): key: value; key: value', class: 'extra', oninput: markDirty });
      const r = { typeIn, targetIn, extraIn, removed: false };
      const el = h('div', { class: 'rel-row' },
        typeIn, targetIn,
        h('button', {
          class: 'icon', title: 'Remove this relationship',
          onclick: () => { r.removed = !r.removed; el.classList.toggle('removed', r.removed); markDirty(); },
        }, '✕'),
        extraIn);
      relRows.push(r);
      relTable.append(el);
    }
    // A relationship whose target is a list is shown as one row per target.
    const originalRows = [];
    if (Array.isArray(rawRels)) {
      for (const rel of rawRels) {
        const targets = Array.isArray(rel.target) ? rel.target : [rel.target];
        for (const t of targets) originalRows.push({ ...rel, target: t });
      }
    }
    originalRows.forEach(addRelRow);

    // ---------- Save / discard ----------
    const saveBtn = h('button', { class: 'btn primary', disabled: true, onclick: save }, 'Save to file');
    const discardBtn = h('button', { class: 'btn', disabled: true, onclick: () => { dirty = false; renderNode(ctx.cy.getElementById(current)); } }, 'Discard');

    async function save() {
      const set = {};
      const remove = [];
      try {
        for (const r of rows) {
          if (r.removed) { if (!r.isNew) remove.push(r.key); continue; }
          const text = r.input.value;
          if (!r.isNew && text === r.text) continue; // untouched
          set[r.key] = r.isNew && text.includes('\n') ? fromEditText(text, []) : fromEditText(text, r.original);
        }
      } catch (e) {
        alert('Could not read one of the values: ' + e.message);
        return;
      }
      if (editableRels) {
        const newRels = relRows
          .filter((r) => !r.removed && (r.typeIn.value.trim() || r.targetIn.value.trim()))
          .map((r) => ({ type: r.typeIn.value.trim() || 'related', target: r.targetIn.value.trim(), ...textToExtra(r.extraIn.value) }));
        if (stableStringify(newRels) !== stableStringify(originalRows) && !(rawRels === null && newRels.length === 0)) {
          set.relationships = newRels;
        }
      }
      saveBtn.disabled = true;
      try {
        await ctx.save(d.file, { set, remove });
        dirty = false;
        await ctx.reload(); // shows the saved state right away (the file watcher would also do it)
      } catch (e) {
        alert('Saving failed: ' + e.message);
        saveBtn.disabled = false;
      }
    }

    container.replaceChildren(
      ...head,
      h('div', { class: 'stale', hidden: true },
        'This note was changed outside the app. ',
        h('button', { class: 'link', onclick: () => { dirty = false; renderNode(ctx.cy.getElementById(current)); } }, 'Load the new version'),
        ' (discards your edits).'),
      h('section', {},
        h('h3', {}, 'Attributes'),
        attrTable,
        h('div', { class: 'add-row' }, newKey, newVal, h('button', { class: 'btn', onclick: addAttr }, 'Add')),
        h('p', { class: 'hint' }, 'Lists: one item per line. Empty value = null.'),
      ),
      h('section', {},
        h('h3', {}, 'Relationships'),
        editableRels
          ? [
              relTable,
              h('button', { class: 'btn', onclick: () => { addRelRow({ type: '', target: '' }); markDirty(); } }, '+ Add relationship'),
              h('button', { class: 'btn', title: 'Create a new note and link to it from this one', onclick: () => ctx.openCreateDialog({ linkFrom: d.file }) }, '+ New linked note'),
              h('p', { class: 'hint' }, 'Write [[Note name]] to link a note; plain text becomes an external reference. Extra fields like "direction: both; weight: 2" become edge attributes.'),
            ]
          : h('p', { class: 'muted' }, 'This note stores "relationships" in a different shape; edit it in Obsidian.'),
      ),
      h('div', { class: 'save-bar' }, saveBtn, discardBtn),
      connections(node),
    );
  }

  renderEmpty();
  return { show, refresh, isDirty };
}

// "weight: 2; direction: both"  <->  { weight: 2, direction: 'both' }
function extraToText(extra) {
  return Object.entries(extra)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? ''}`)
    .join('; ');
}
function textToExtra(text) {
  const out = {};
  for (const part of text.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    if (!key || key === 'type' || key === 'target') continue;
    if (/^[[{]/.test(raw) && !raw.startsWith('[[')) {
      try { out[key] = JSON.parse(raw); continue; } catch { /* fall through: keep as text */ }
    }
    out[key] = parseTyped(raw, null);
  }
  return out;
}
