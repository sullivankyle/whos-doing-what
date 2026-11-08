// Pure three-way merge for the app's state ({ people: [], entries: [] }), keyed by item id.
// base   = the last state both sides agreed on (what we last synced)
// local  = this device's current state
// remote = the server's current state
//
// Rules per item id:
//  - changed on only one side      -> take that side's version
//  - changed identically on both   -> that version
//  - changed differently on both   -> local wins (the device the user is acting on)
//  - deleted on one side, untouched on the other -> deleted
//  - deleted on one side, edited on the other    -> keep the edited item (never lose data silently)
// Order follows the winning side so the list is stable across devices.

function same(a, b) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  }
  return v;
}

function byId(list) {
  const m = new Map();
  for (const item of list || []) m.set(item.id, item);
  return m;
}

export function mergeList(base, local, remote) {
  const B = byId(base), L = byId(local), R = byId(remote);
  const ids = new Set([...L.keys(), ...R.keys()]);
  const kept = new Map();

  for (const id of ids) {
    const b = B.get(id), l = L.get(id), r = R.get(id);
    let out;
    if (l && r) {
      if (same(l, r)) out = l;
      else if (b && same(b, l)) out = r;       // only remote changed
      else out = l;                            // local changed (alone or both): local wins
    } else if (l && !r) {
      // gone remotely
      if (b && same(b, l)) out = undefined;    // untouched locally -> honor remote delete
      else out = l;                            // new or edited locally -> keep
    } else {
      // gone locally (r exists)
      if (b && same(b, r)) out = undefined;    // untouched remotely -> honor local delete
      else out = r;                            // new or edited remotely -> keep
    }
    if (out) kept.set(id, out);
  }

  // Order: local order first (stable on this device), then remote-only items in remote order.
  const result = [];
  for (const item of local || []) if (kept.has(item.id)) result.push(kept.get(item.id));
  for (const item of remote || []) if (kept.has(item.id) && !L.has(item.id)) result.push(kept.get(item.id));
  return result;
}

export function mergeState(base, local, remote) {
  const b = base || { people: [], entries: [] };
  return {
    people: mergeList(b.people, local.people, remote.people),
    entries: mergeList(b.entries, local.entries, remote.entries),
  };
}

export function statesEqual(a, b) {
  return same(a, b);
}
