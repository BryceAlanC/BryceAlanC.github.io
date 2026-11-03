import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the production combat loop offline, without drawing or browser events.
const source = readFileSync(new URL('./game.js', import.meta.url), 'utf8');
const eventStart = source.indexOf('  canvas.addEventListener("pointerdown", pointer);');
assert.ok(eventStart > 0);
const element = {
  style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
  getContext: () => ({}), setAttribute() {}, focus() {},
};
const context = {
  window: {}, document: { querySelector: () => element, querySelectorAll: () => [] },
  matchMedia: () => ({ matches: true }), performance: { now: () => 0 },
  requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
};
vm.runInNewContext(source.slice(0, eventStart) + `
  soundOn = false;
  renderTowerTray = updateUI = updateUpgradeChoiceUI = syncOverlayAccess = () => {};
  board = { x: 94.5, y: 40.5, w: 729, h: 464.4, cw: 81, rh: 92.88 };
  let fired = 0;
  const realShoot = shoot;
  shoot = defender => { fired++; realShoot(defender); };
  window.test = {
    fresh(kind, upgraded = false) {
      reset(); nectar = 10000; spawnClock = 1e9;
      pathRanks = { sun: 4, dew: 4, thorn: 4, storm: 4 };
      addDefender(2, 0, kind);
      const defender = defenders[0]; defender.cooldown = 0;
      if (upgraded) { defender.level = 3; defender.infusions = ['storm', 'thorn']; }
      fired = 0;
      return towerCombatStats(defender).rate;
    },
    target() {
      spawnEnemy('mote');
      Object.assign(enemies[enemies.length - 1], {
        row: 2, x: 750, hp: 1e9, maxHp: 1e9, speed: 0,
      });
    },
    clearTargets() { enemies = []; shots = []; },
    tick: update,
    get fired() { return fired; },
  };
})();`, context);
const game = context.window.test;
const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) game.tick(1 / 60); };

for (const kind of ['basic', 'frost', 'tempestorchid']) {
  for (const upgraded of [false, true]) {
    const rate = game.fresh(kind, upgraded);
    tick(30);
    assert.equal(game.fired, 0, 'An empty lane must not fire');
    game.target();
    tick(1);
    const maximum = Math.ceil(1 / rate) + 1;
    assert.ok(game.fired <= maximum,
      `${kind} after idle: ${game.fired} shots in one second, expected at most ${maximum}`);
    const firstCount = game.fired;
    tick(10);
    assert.ok(Math.abs(game.fired - firstCount - 10 / rate) <= 1,
      `${kind} should retain its continuous attack rate`);
    game.clearTargets();
    tick(60);
    const beforeReturn = game.fired;
    game.target();
    tick(1);
    assert.ok(game.fired - beforeReturn <= maximum,
      `${kind} must not bank attacks between waves`);
  }
}
console.log('Rune Garden: idle, continuous-fire, upgraded and between-wave attack-rate checks passed.');
