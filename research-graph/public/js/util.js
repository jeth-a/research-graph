// -----------------------------------------------------------------------------
// util.js — small helpers shared by the other files.
// -----------------------------------------------------------------------------

/**
 * Create a DOM element in one line:
 *   h('button', { class: 'btn', onclick: save }, 'Save')
 * Props starting with "on" become event listeners; everything else is an attribute.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked') el.checked = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** The label used for "this element has no value for that attribute". */
export const NONE = '(none)';

/**
 * Turn any attribute value into a short text "key" used for grouping:
 * the same key always gets the same color/shape/etc.
 */
export function valueKey(v) {
  if (v === undefined || v === null || v === '') return NONE;
  if (Array.isArray(v)) return v.length ? v.map(valueKey).join(', ') : NONE;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Sort value keys: "(none)" first, then numerically if all are numbers, else alphabetically. */
export function sortKeys(keys) {
  const rest = keys.filter((k) => k !== NONE);
  const numeric = rest.length > 0 && rest.every((k) => k.trim() !== '' && !isNaN(Number(k)));
  rest.sort(numeric ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return keys.includes(NONE) ? [NONE, ...rest] : rest;
}

/**
 * Convert text typed into the editor back into a YAML-friendly value.
 * `original` is the value before editing; we try to keep its type.
 */
export function parseTyped(text, original) {
  const t = text.trim();
  if (t === '') return null;
  if (typeof original === 'string') return text; // was text -> stays text
  if (typeof original === 'number') return isNumber(t) ? Number(t) : text;
  if (typeof original === 'boolean' && (t === 'true' || t === 'false')) return t === 'true';
  // New attribute or previously empty: guess.
  if (t === 'true' || t === 'false') return t === 'true';
  if (isNumber(t)) return Number(t);
  return text;
}
function isNumber(t) {
  return /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t);
}

/** Show a value in a text box (lists become one item per line). */
export function toEditText(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x))).join('\n');
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

/** Inverse of toEditText. */
export function fromEditText(text, original) {
  if (Array.isArray(original)) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => parseTyped(line, original.length ? original[0] : null)); // keep the items' type
  }
  if (original && typeof original === 'object') return JSON.parse(text); // advanced: nested objects as JSON
  return parseTyped(text, original);
}

/** A colour palette that stays readable on white (from Tableau 10 + extras). */
export const PALETTE = [
  '#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2',
  '#edc948', '#ff9da7', '#9c755f', '#3b3b98', '#bab0ac', '#2e8b57',
];

/** Debounce: run `fn` only after calls have stopped for `ms` milliseconds. */
export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** JSON.stringify with object keys sorted, so {a,b} and {b,a} compare as equal. */
export function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
