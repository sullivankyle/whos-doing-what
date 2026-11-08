// node tools/test-merge.mjs
import assert from 'node:assert/strict';
import { mergeState, statesEqual } from '../docs/merge.js';

const p = (id, name, extra = {}) => ({ id, name, color: '#E2542D', ...extra });
const e = (id, text, extra = {}) => ({ id, personIds: ['a'], text, start: '2026-11-10', end: '2026-11-10', createdAt: 1, done: false, ...extra });
const S = (people, entries) => ({ people, entries });
const ids = (l) => l.map((x) => x.id);

// first sync, no base: union of both devices
let m = mergeState(null, S([p('a', 'alex')], [e('1', 'phone only')]), S([p('a', 'alex'), p('b', 'sam')], [e('2', 'laptop only')]));
assert.deepEqual(ids(m.people), ['a', 'b']);
assert.deepEqual(ids(m.entries).sort(), ['1', '2']);

// phone adds, laptop adds: both survive
const base = S([p('a', 'alex')], [e('1', 'x')]);
m = mergeState(base, S(base.people, [e('1', 'x'), e('3', 'phone new')]), S(base.people, [e('1', 'x'), e('4', 'laptop new')]));
assert.deepEqual(ids(m.entries).sort(), ['1', '3', '4']);

// remote edit only -> remote edit; local edit only -> local edit
m = mergeState(base, S(base.people, [e('1', 'x')]), S(base.people, [e('1', 'edited remotely')]));
assert.equal(m.entries[0].text, 'edited remotely');
m = mergeState(base, S(base.people, [e('1', 'edited locally')]), S(base.people, [e('1', 'x')]));
assert.equal(m.entries[0].text, 'edited locally');

// both edit differently -> local wins
m = mergeState(base, S(base.people, [e('1', 'L')]), S(base.people, [e('1', 'R')]));
assert.equal(m.entries[0].text, 'L');

// delete on one side, untouched on other -> deleted
m = mergeState(base, S(base.people, []), S(base.people, [e('1', 'x')]));
assert.equal(m.entries.length, 0);
m = mergeState(base, S(base.people, [e('1', 'x')]), S(base.people, []));
assert.equal(m.entries.length, 0);

// delete on one side, edited on other -> keep the edit
m = mergeState(base, S(base.people, []), S(base.people, [e('1', 'edited')]));
assert.equal(m.entries[0].text, 'edited');
m = mergeState(base, S(base.people, [e('1', 'edited')]), S(base.people, []));
assert.equal(m.entries[0].text, 'edited');

// hide/unhide a friend and mark done sync as normal edits
m = mergeState(base, S([p('a', 'alex', { hidden: true })], [e('1', 'x', { done: true })]), base);
assert.equal(m.people[0].hidden, true);
assert.equal(m.entries[0].done, true);

// idempotent: merging identical states changes nothing
m = mergeState(base, base, base);
assert.ok(statesEqual(m, base));

console.log('merge tests passed');
