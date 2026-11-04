// -----------------------------------------------------------------------------
// frontmatter.js
//
// Reading and writing the YAML "frontmatter" block at the top of a Markdown
// note, i.e. the part between the two `---` lines:
//
//   ---
//   title: My note
//   relationships:
//     - type: based_on
//       target: '[[Other note]]'
//   ---
//   # The ordinary Markdown body starts here
//
// Golden rule of this file: the Markdown BODY is never touched. When we save a
// change we only rewrite the YAML block, and inside the YAML block we only
// change the keys that were actually edited. Comments, key order and quoting
// of the other keys are preserved by the `yaml` library's Document API.
// -----------------------------------------------------------------------------

const YAML = require('yaml');

/**
 * Split a note into its pieces so it can be put back together exactly.
 *
 * Returns:
 *   bom            - a byte-order mark if the file had one ('' otherwise)
 *   hasFrontmatter - true if the note starts with a `---` block
 *   opening        - the opening line, e.g. '---\n'
 *   yaml           - the raw YAML text between the fences
 *   closing        - the closing line, e.g. '---\n'
 *   body           - everything after the closing fence (left untouched)
 *   eol            - '\r\n' if the file uses Windows line endings, else '\n'
 */
function splitNote(text) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const t = text.slice(bom.length);
  const eol = t.includes('\r\n') ? '\r\n' : '\n';

  const open = t.match(/^---[ \t]*\r?\n/);
  if (!open) {
    return { bom, hasFrontmatter: false, opening: '', yaml: '', closing: '', body: t, eol };
  }

  const rest = t.slice(open[0].length);
  // The closing fence is a line containing only `---` (either right at the
  // start of `rest` for an empty block, or after a newline).
  const close = /(^|\n)---[ \t]*\r?(\n|$)/.exec(rest);
  if (!close) {
    // An opening `---` without a closing one is not frontmatter.
    return { bom, hasFrontmatter: false, opening: '', yaml: '', closing: '', body: t, eol };
  }

  const yamlEnd = close.index + close[1].length; // keep the newline before ---
  return {
    bom,
    hasFrontmatter: true,
    opening: open[0],
    yaml: rest.slice(0, yamlEnd),
    closing: close[0].slice(close[1].length),
    body: rest.slice(close.index + close[0].length),
    eol,
  };
}

/**
 * Parse the frontmatter of a note into a plain JavaScript object.
 * Returns { data, error }. `data` is {} when there is no frontmatter.
 */
function parseFrontmatter(text) {
  const parts = splitNote(text);
  if (!parts.hasFrontmatter || parts.yaml.trim() === '') return { data: {}, error: null, body: parts.body };

  const doc = YAML.parseDocument(parts.yaml);
  if (doc.errors.length > 0) {
    return { data: {}, error: 'YAML error: ' + doc.errors[0].message.split('\n')[0], body: parts.body };
  }
  const data = doc.toJS();
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { data: {}, error: 'Frontmatter must be a list of "key: value" lines.', body: parts.body };
  }
  return { data, error: null, body: parts.body };
}

/**
 * Apply a set of changes to a note's frontmatter and return the new file text.
 *
 * changes = {
 *   set:    { key: newValue, ... }   // add or replace these keys
 *   remove: [ 'key', ... ]           // delete these keys
 * }
 */
function updateFrontmatter(text, changes) {
  const parts = splitNote(text);
  const doc = YAML.parseDocument(parts.yaml || '');
  if (doc.errors.length > 0) {
    throw new Error('Cannot edit: the frontmatter has a YAML error (' + doc.errors[0].message.split('\n')[0] + '). Fix it in Obsidian first.');
  }
  if (!doc.contents) doc.contents = doc.createNode({}); // empty frontmatter
  if (!YAML.isMap(doc.contents)) throw new Error('Cannot edit: the frontmatter is not a list of "key: value" lines.');

  for (const [key, value] of Object.entries(changes.set || {})) {
    const oldNode = doc.get(key, true);
    const oldValue = YAML.isNode(oldNode) ? oldNode.toJSON() : oldNode;
    if (doc.has(key) && stableStringify(oldValue) === stableStringify(value)) continue; // unchanged: leave the text alone
    doc.set(key, listNode(doc, oldNode, value));
  }
  for (const key of changes.remove || []) doc.delete(key);

  // New strings that need quotes (e.g. '[[Note]]') get the same quote style
  // the file already uses for links: single quotes '...' or double quotes "...".
  const singleQuote = /'\[\[/.test(parts.yaml) || !/"\[\[/.test(parts.yaml);

  // Match the existing list indentation style of the file:
  //   key:            key:
  //   - item    vs      - item
  // (Obsidian uses the indented style, many scripts use the flush style.)
  const firstList = parts.yaml.match(/:[ \t]*\r?\n([ \t]*)- /);
  const indentSeq = firstList ? firstList[1].length > 0 : true;

  // lineWidth: 0 means "never fold long strings onto several lines".
  let newYaml = doc.toString({ lineWidth: 0, indentSeq, singleQuote });

  // Keep any blank lines the author had before the closing `---`.
  const trailing = parts.yaml.match(/(\r?\n)*$/)[0] || '\n';
  newYaml = newYaml.replace(/\n+$/, '') + (trailing.length ? trailing : '\n');
  if (parts.eol === '\r\n') newYaml = newYaml.replace(/\r?\n/g, '\r\n');

  if (!parts.hasFrontmatter) {
    // The note had no frontmatter yet: add one above the untouched body.
    return parts.bom + '---' + parts.eol + newYaml + '---' + parts.eol + parts.body;
  }
  return parts.bom + parts.opening + newYaml + parts.closing + parts.body;
}

/**
 * When a list is replaced (e.g. one relationship added), reuse the existing
 * YAML item for every entry that did not change. That keeps those lines
 * exactly as they were written (same quotes, same formatting, same comments),
 * so only the edited entries show up as changed in the file.
 */
function listNode(doc, oldNode, newValue) {
  if (!Array.isArray(newValue) || !YAML.isSeq(oldNode)) return newValue;
  const unused = [...oldNode.items];
  const seq = doc.createNode([]);
  for (const item of newValue) {
    const json = stableStringify(item);
    const i = unused.findIndex((n) => stableStringify(YAML.isNode(n) ? n.toJSON() : n) === json);
    seq.items.push(i >= 0 ? unused.splice(i, 1)[0] : doc.createNode(item));
  }
  return seq;
}

/** JSON.stringify with object keys sorted, so {a,b} and {b,a} compare as equal. */
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/** Build the text of a brand-new note. */
function newNoteText(frontmatter, heading) {
  const yaml = YAML.stringify(frontmatter, { lineWidth: 0 });
  return '---\n' + yaml + '---\n\n# ' + heading + '\n';
}

module.exports = { splitNote, parseFrontmatter, updateFrontmatter, newNoteText };
