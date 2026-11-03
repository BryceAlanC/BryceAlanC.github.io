import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the same shop and combat handlers used by mouse/touch controls.
const source = readFileSync(new URL('./game.js', import.meta.url), 'utf8');
const eventStart = source.indexOf('\n  buildSummonCatalog();');
assert.ok(eventStart > 0);
const nodes = new Map();
function element(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getContext: () => ({}), setAttribute() {}, toggleAttribute() {}, contains: () => false,
    querySelector: selector => element(id + selector), querySelectorAll: () => [], focus() {},
  });
  return nodes.get(id);
}
const buttons = ['dash', 'nova', 'sentinel'].map(name => {
  const button = element(name); button.dataset.ability = name; return button;
});
const compact = { matches: true };
const context = {
  window: {}, document: {
    getElementById: element, querySelector: element,
    querySelectorAll: selector => selector === '.ability' ? buttons : [],
  },
  matchMedia: query => query.includes('max-width') ? compact : { matches: false },
  performance: { now: () => 0 }, requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
};
vm.runInNewContext(source.slice(0, eventStart) + `
  window.test = {
    fresh() { game = initialState(); game.started = true; return game; },
    setPurchasePage, ability, update, buyItem,
  };
})();`, context);
const game = context.window.test;
for (const page of ['gear', 'relics', 'summons']) {
  const state = game.fresh();
  game.setPurchasePage(page, false);
  assert.equal(state.drawerOpen, true);
  const before = JSON.stringify({ hero: state.hero, cooldowns: state.cooldowns, sentinels: state.sentinels });
  for (const name of ['dash', 'nova', 'sentinel']) game.ability(name);
  assert.equal(JSON.stringify({ hero: state.hero, cooldowns: state.cooldowns, sentinels: state.sentinels }), before,
    `${page}: abilities must not alter a held battle`);
  assert.ok(buttons.every(button => button.disabled), 'Held battle buttons should be disabled');
  game.update(1);
  assert.equal(state.time, 0);
  assert.equal(game.buyItem('edge'), true, 'Shopping must still work during the hold');
  game.setPurchasePage(null, false);
  assert.ok(buttons.every(button => !button.disabled), 'Closing the tray should restore ability buttons');
  game.ability('sentinel');
  assert.equal(state.sentinels.length, 1);
  assert.equal(state.cooldowns.sentinel, 18);
}
compact.matches = false;
const state = game.fresh();
game.setPurchasePage('gear', false);
assert.equal(state.drawerOpen, false);
game.ability('sentinel');
assert.equal(state.sentinels.length, 1, 'Desktop shops do not hold combat');
console.log('Linewarden: held-shop ability, purchase, resume and desktop-shop checks passed.');
