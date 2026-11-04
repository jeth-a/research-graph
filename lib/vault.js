// -----------------------------------------------------------------------------
// vault.js
//
// Turns a folder of Markdown notes (an Obsidian vault, or any folder inside
// one) into a graph:
//
//   * every `.md` file           -> one NODE
//   * frontmatter keys            -> that node's ATTRIBUTES (discovered
//                                    automatically, nothing is hard-coded)
//   * the `relationships` list    -> EDGES (each entry may carry its own
//                                    attributes, e.g. `direction`, `weight`)
//   * any other key whose value   -> EDGES too, with the key as the edge type
//     is a [[wiki-link]]             (e.g. `supervisor: '[[Alice]]'`)
//
// Everything is deterministic: the same files always produce the same graph.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('./frontmatter');

// Folders we never look inside.
const IGNORED_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash']);

/** Recursively list every .md file under `root` (paths relative to root, using "/"). */
function listMarkdownFiles(root) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }
  walk(root);
  return results.sort();
}

// Matches a value that is exactly one wiki-link, e.g.
//   [[Note]]   [[Folder/Note]]   [[Note|Alias]]   [[Note#Heading]]   [[Note#^block]]
// Group 1 is the link path ("Folder/Note").
const WIKI_LINK = /^\s*!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*$/;

/** If `value` is a wiki-link string, return its link path, otherwise null. */
function wikiLinkPath(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(WIKI_LINK);
  return m ? m[1].trim() : null;
}

/** True if a frontmatter value is a wiki-link, or a non-empty list of only wiki-links. */
function isLinkValue(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every((v) => wikiLinkPath(v) !== null);
  return wikiLinkPath(value) !== null;
}

/**
 * Read the `relationships` frontmatter key into a flat list of
 *   { type, target, attributes }
 * Two shapes are accepted:
 *
 *   relationships:                 relationships:
 *     - type: based_on               based_on:
 *       target: '[[A]]'                - '[[A]]'
 *       weight: 2                      - '[[B]]'
 *
 * In the list shape, `target` may also be a list of targets, and every extra
 * key (weight, direction, note, ...) becomes an attribute of the edge.
 */
function readRelationships(value) {
  const out = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const { type, target, ...extra } = item;
        const targets = Array.isArray(target) ? target : [target];
        for (const t of targets) {
          if (t === undefined || t === null || t === '') continue;
          out.push({ type: type == null ? 'related' : String(type), target: t, attributes: extra });
        }
      } else if (typeof item === 'string') {
        out.push({ type: 'related', target: item, attributes: {} });
      }
    }
  } else if (value && typeof value === 'object') {
    for (const [type, targets] of Object.entries(value)) {
      for (const t of Array.isArray(targets) ? targets : [targets]) {
        if (t === undefined || t === null || t === '') continue;
        out.push({ type, target: t, attributes: {} });
      }
    }
  }
  return out;
}

/**
 * Build the whole graph from the folder `root`.
 * Returns { nodes, edges, folders, warnings }.
 */
function buildGraph(root) {
  const files = listMarkdownFiles(root);
  const nodes = [];
  const warnings = [];

  // Lookup tables so wiki-links can be resolved the way Obsidian does:
  // first by full path ("Folder/Note"), then by file name alone ("Note").
  const byPath = new Map(); // "folder/note" (lower-case) -> node
  const byName = new Map(); // "note" (lower-case)        -> node (first one wins)

  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const { data, error } = parseFrontmatter(text);
    const id = file.replace(/\.md$/i, ''); // relative path without .md: always unique
    const name = path.posix.basename(id);
    const folder = path.posix.dirname(file) === '.' ? '' : path.posix.dirname(file);

    // Every frontmatter key except `relationships` is a node attribute.
    const { relationships, ...attributes } = data;

    const node = {
      id,
      name,
      file,
      folder,
      external: false,
      error,
      attributes,
      relationships: relationships === undefined ? null : relationships, // raw, for the editor
    };
    if (error) warnings.push(file + ': ' + error);
    nodes.push(node);
    byPath.set(id.toLowerCase(), node);
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), node);
  }

  // Nodes for references that are not files: free-text targets such as
  // "Surface-code frame cleaning", or [[links]] to notes that don't exist yet.
  const externals = new Map();
  function externalNode(label, isUnresolvedLink) {
    const id = 'external:' + label;
    if (!externals.has(id)) {
      externals.set(id, {
        id,
        name: label,
        file: null,
        folder: '',
        external: true,
        unresolvedLink: isUnresolvedLink,
        error: null,
        attributes: {},
        relationships: null,
      });
    }
    return externals.get(id);
  }

  /** Turn a raw target value into the id of a node. */
  function resolveTarget(target) {
    const linkPath = wikiLinkPath(target);
    if (linkPath === null) return externalNode(String(target).trim(), false).id; // free text
    const key = linkPath.replace(/\.md$/i, '').replace(/^\.?\//, '').toLowerCase();
    const hit = byPath.get(key) || byName.get(path.posix.basename(key));
    return hit ? hit.id : externalNode(linkPath, true).id;
  }

  const edges = [];
  for (const node of nodes) {
    if (node.error) continue;
    let index = 0;
    const addEdge = (type, target, attributes, origin) => {
      edges.push({
        id: node.id + '::' + index++, // unique and stable as long as the file doesn't change
        source: node.id,
        target: resolveTarget(target),
        origin, // 'relationships' or the name of the attribute that holds the link
        attributes: { type, ...attributes },
      });
    };

    // 1) The `relationships` list.
    for (const rel of readRelationships(node.relationships)) {
      addEdge(rel.type, rel.target, rel.attributes, 'relationships');
    }

    // 2) Any other attribute whose value is a [[wiki-link]] (or a list of them).
    for (const [key, value] of Object.entries(node.attributes)) {
      if (!isLinkValue(value)) continue;
      for (const v of Array.isArray(value) ? value : [value]) addEdge(key, v, {}, key);
    }
  }

  const folders = [...new Set(nodes.map((n) => n.folder))].sort();
  return { nodes: [...nodes, ...externals.values()], edges, folders, warnings };
}

module.exports = { buildGraph, wikiLinkPath };
