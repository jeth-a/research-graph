// -----------------------------------------------------------------------------
// settings.js — what the user chose in the side panel (colours, filters, ...).
//
// Settings are stored in the browser (localStorage), one set per vault, and can
// be exported to / imported from a .json file to share or back them up.
// -----------------------------------------------------------------------------

import { NODE_PROPS, EDGE_PROPS } from './visuals.js';

/** Settings used the first time you open a vault (or after "Reset"). */
export function defaultSettings() {
  const make = (props, mapped) => {
    const out = {};
    for (const [name, def] of Object.entries(props)) {
      out[name] = { attr: mapped[name] || null, fixed: def.fixed, map: {} };
    }
    return out;
  };
  return {
    node: {
      ...make(NODE_PROPS, { color: 'node_type', shape: 'node_type', borderStyle: '$external' }),
      labels: ['title'],       // attributes shown as the node label (in order)
      labelKeys: false,        // show "key: value" instead of just "value"
      fontSize: 11,
      labelWidth: 170,         // long labels wrap after this many pixels
    },
    edge: {
      ...make(EDGE_PROPS, { color: 'type' }),
      labels: [],
      labelKeys: false,
      fontSize: 9,
    },
    filters: {
      node: { attr: 'node_type', hidden: ['template'] }, // hide the template notes by default
      edge: { attr: 'type', hidden: [] },
    },
    layout: 'cose',
  };
}

const keyFor = (vaultPath) => 'research-graph:settings:' + vaultPath;

export function loadSettings(vaultPath) {
  const defaults = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(vaultPath)) || 'null');
    if (!saved) return defaults;
    // Merge so that settings saved by an older version still get any new fields.
    return {
      ...defaults,
      ...saved,
      node: { ...defaults.node, ...saved.node },
      edge: { ...defaults.edge, ...saved.edge },
      filters: { ...defaults.filters, ...saved.filters },
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(vaultPath, settings) {
  try {
    localStorage.setItem(keyFor(vaultPath), JSON.stringify(settings));
  } catch {
    /* storage may be unavailable (private window); settings then last for this visit only */
  }
}

/** Download the settings as a file. */
export function exportSettings(settings) {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'research-graph-settings.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Ask the user for a settings file and return its contents. */
export function importSettings() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      try {
        resolve(JSON.parse(await input.files[0].text()));
      } catch (e) {
        reject(new Error('That file is not a valid settings file.'));
      }
    };
    input.click();
  });
}
