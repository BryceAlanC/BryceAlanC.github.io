(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const WORLD = { w: 1600, h: 900 };
  const PATH = [
    { x: 45, y: 195 }, { x: 1450, y: 195 }, { x: 1450, y: 450 },
    { x: 150, y: 450 }, { x: 150, y: 625 }, { x: 1390, y: 625 }
  ];
  const PAYDAY_SECONDS = 5;
  const WAVE_SECONDS = 20;
  const AUTO_PURCHASE_SECONDS = .4;
  const MAX_PROJECTILES = 240;
  const RESERVES = [0, 100, 250, 500];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compactDrawerMedia = matchMedia('(max-width: 900px) and (max-height: 560px)');
  const $ = (id) => document.getElementById(id);
  const ui = {
    gold: $('gold'), income: $('income'), tickFill: $('tickFill'), wave: $('waveLabel'), timer: $('waveTimer'), threat: $('threatLabel'),
    level: $('level'), hpText: $('hpText'), hpFill: $('hpFill'), xpText: $('xpText'), xpFill: $('xpFill'),
    crystalText: $('crystalText'), crystalFill: $('crystalFill'), announce: $('announce'), note: $('floatNote'), live: $('liveRegion'),
    bossBar: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), bossProgress: $('bossProgress'),
    healthProgress: $('healthProgress'), xpProgress: $('xpProgress'), crystalProgress: $('crystalProgress'),
    rosterTotal: $('rosterTotal'), reserveBtn: $('reserveBtn'), allAutoOff: $('allAutoOff'),
    summonDock: $('summonDock'), drawerToggle: $('summonDrawerToggle'), drawerClose: $('summonDrawerClose')
  };

  const summonDefs = {
    runner: { name: 'Runner', unlock: 1, cost: 30, income: 5, count: 1, hp: 56, speed: 188, damage: 11, reward: 5, xp: 9, r: 16, stockCap: 10, restockSeconds: 20, color: '#ff6577' },
    bulwark: { name: 'Bulwark', unlock: 2, cost: 75, income: 12, count: 1, hp: 280, speed: 84, damage: 27, reward: 10, xp: 22, r: 27, armor: .22, stockCap: 10, restockSeconds: 30, color: '#d66088' },
    swarm: { name: 'Skitter pack', unlock: 1, cost: 85, income: 14, count: 4, hp: 42, speed: 156, damage: 7, reward: 3, xp: 5, r: 12, stockCap: 10, restockSeconds: 40, color: '#ff8d78' },
    hexer: { name: 'Hexer', unlock: 3, cost: 120, income: 20, count: 1, hp: 185, speed: 108, damage: 22, reward: 15, xp: 29, r: 23, trait: 'hexer', stockCap: 8, restockSeconds: 40, color: '#9e68d5' },
    brute: { name: 'Brute', unlock: 4, cost: 180, income: 30, count: 1, hp: 650, speed: 76, damage: 54, reward: 25, xp: 54, r: 39, armor: .12, stockCap: 7, restockSeconds: 55, color: '#bf72df' },
    phantom: { name: 'Phantom', unlock: 5, cost: 245, income: 40, count: 1, hp: 360, speed: 142, damage: 44, reward: 33, xp: 62, r: 28, armor: .06, trait: 'surge', stockCap: 6, restockSeconds: 65, color: '#826be6' },
    siege: { name: 'Siege beast', unlock: 6, cost: 340, income: 56, count: 1, hp: 1050, speed: 66, damage: 72, reward: 48, xp: 92, r: 46, armor: .16, trait: 'siege', crystalDamage: 1.55, stockCap: 5, restockSeconds: 85, color: '#cb5b4c' },
    hydra: { name: 'Void hydra', unlock: 8, cost: 520, income: 86, count: 1, hp: 1680, speed: 72, damage: 90, reward: 70, xp: 145, r: 54, armor: .18, trait: 'regen', regen: .015, stockCap: 4, restockSeconds: 120, color: '#7c59bd' }
  };
  const ambientDefs = [
    { key: 'drone', unlockWave: 1, hp: 66, speed: 132, damage: 14, reward: 6, xp: 10, r: 16, color: '#de5267' },
    { key: 'raider', unlockWave: 3, hp: 155, speed: 105, damage: 23, reward: 10, xp: 16, r: 22, armor: .06, color: '#a95572' },
    { key: 'dart', unlockWave: 5, hp: 52, speed: 195, damage: 12, reward: 7, xp: 10, r: 12, color: '#ee7c69' },
    { key: 'warden', unlockWave: 8, hp: 390, speed: 82, damage: 42, reward: 18, xp: 28, r: 29, armor: .18, color: '#b94f68' },
    { key: 'shade', unlockWave: 12, hp: 245, speed: 144, damage: 35, reward: 15, xp: 24, r: 23, trait: 'surge', color: '#8d589c' }
  ];
  const itemBase = { edge: 85, plate: 100, boots: 125, lens: 150, focus: 175, seal: 220, multishot: 325, chain: 375, splash: 300, revive: 450, repair: 75 };
  const itemGrowth = { multishot: 2.05, chain: 2.05, splash: 2.05, revive: 2.05 };
  const itemLimits = { multishot: 4, chain: 4, splash: 4, revive: 4 };
  const itemNames = { edge: 'RUNE EDGE', plate: 'BASTION PLATE', boots: 'WINDSTEP', lens: 'SEEKER LENS', focus: 'CHRONO CORE', seal: 'CRYSTAL SEAL', multishot: 'SPLIT PRISM', chain: 'STORM COIL', splash: 'BLAST SIGIL', revive: 'GRAVE PACT', repair: 'MEND' };
  const itemKeys = ['edge', 'plate', 'boots', 'lens', 'focus', 'seal', 'multishot', 'chain', 'splash', 'revive'];
  const keys = {};
  const pointer = { stickX: 0, stickY: 0 };
  let audio = null;
  let soundOn = true;
  let last = performance.now();
  let raf = 0;
  let game;
  const overlayFocus = {
    introOverlay: ['startBtn'], pauseOverlay: ['resumeBtn'],
    gameOverOverlay: ['restartBtn'], helpOverlay: ['closeHelp', 'closeHelpBottom']
  };
  const overlayRestore = new Map();

  function emptyRoster() {
    return Object.fromEntries(Object.keys(summonDefs).map(type => [type, 0]));
  }
  function emptyAutos() {
    return Object.fromEntries(Object.keys(summonDefs).map(type => [type, false]));
  }
  function fullStock() {
    return Object.fromEntries(Object.entries(summonDefs).map(([type, def]) => [type, def.stockCap]));
  }
  function emptyStockClocks() {
    return Object.fromEntries(Object.keys(summonDefs).map(type => [type, 0]));
  }

  function openOverlays() { return [...document.querySelectorAll('.overlay.open')]; }
  function syncOverlayAccess(focusId = null) {
    const overlays = openOverlays(), blocked = overlays.length > 0;
    document.querySelector('.topbar').inert = blocked;
    document.querySelector('.playfield').inert = blocked;
    const top = overlays[overlays.length - 1], targetId = focusId || (top && overlayFocus[top.id]?.[0]);
    if (targetId) requestAnimationFrame(() => $(targetId)?.focus());
    else if (!blocked && game?.started) requestAnimationFrame(() => canvas.focus());
  }
  function showOverlay(id, focusId) {
    const overlay = $(id); overlayRestore.set(id, document.activeElement); overlay.classList.add('open'); syncOverlayAccess(focusId);
  }
  function hideOverlay(id, restore = true) {
    $(id).classList.remove('open'); syncOverlayAccess();
    if (restore && !openOverlays().length) requestAnimationFrame(() => overlayRestore.get(id)?.focus?.());
  }

  function initialState() {
    return {
      started: false, paused: false, over: false, time: 0, gold: 175, income: 12, incomeClock: 0,
      wave: 0, nextWave: 6, shake: 0, flash: 0, dangerSpent: 0,
      hero: {
        x: 1160, y: 625, r: 24, hp: 300, maxHp: 300, level: 1, xp: 0, xpNeed: 60,
        damage: 35, attackCd: 0, attackRate: .56, range: 265, crit: .06, speed: 275,
        focus: 0, aimX: -1, aimY: 0, destination: null, invuln: 0, hexed: false, targetScanCd: 0
      },
      crystal: { x: 1470, y: 625, r: 53, hp: 1400, maxHp: 1400, pulse: 0 },
      enemies: [], allies: [], spawnQueue: [], projectiles: [], particles: [], slashes: [], sentinels: [],
      cooldowns: { dash: 0, nova: 0, sentinel: 0 },
      maxCooldowns: { dash: 5, nova: 9, sentinel: 18 },
      items: Object.fromEntries(itemKeys.map(type => [type, 0])),
      roster: emptyRoster(), contracts: emptyRoster(), stock: fullStock(), stockClocks: emptyStockClocks(),
      autos: emptyAutos(), autoClock: 0, reserveIndex: 1, drawerOpen: false,
      boss: null, spawnId: 0, allyId: 0
    };
  }

  function reset() {
    game = initialState();
    last = performance.now();
    ui.reserveBtn.textContent = `RESERVE ${RESERVES[game.reserveIndex]}`;
    document.querySelectorAll('.unit-auto').forEach(button => {
      button.innerHTML = 'AUTO<br>OFF';
      button.setAttribute('aria-pressed', 'false');
    });
    $('pauseBtn').textContent = 'Ⅱ';
    $('pauseBtn').setAttribute('aria-label', 'Pause game');
    $('pauseBtn').setAttribute('aria-pressed', 'false');
    ui.bossBar.hidden = true;
    ui.bossBar.classList.add('hidden');
    ui.bossName.textContent = 'THE IRON WITNESS';
    ui.bossFill.style.width = '100%';
    ui.bossProgress.setAttribute('aria-valuenow', '100');
    $('gameOverOverlay').classList.remove('open');
    setForgePage('gear', false);
    setSummonDrawer(false, false);
    updateUI();
    syncOverlayAccess();
    announce('THE WATCH BEGINS', 'First wave approaching');
  }

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const naturalDpr = Math.min(devicePixelRatio || 1, 2);
    const pixelBudgetDpr = Math.sqrt(4000000 / Math.max(1, rect.width * rect.height));
    const dpr = Math.min(naturalDpr, pixelBudgetDpr);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function screenToWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / WORLD.w, r.height / WORLD.h);
    const ox = (r.width - WORLD.w * scale) / 2;
    const oy = (r.height - WORLD.h * scale) / 2;
    return { x: (clientX - r.left - ox) / scale, y: (clientY - r.top - oy) / scale };
  }

  function begin() {
    initAudio();
    if (audio?.state === 'suspended') audio.resume();
    game.started = true;
    hideOverlay('introOverlay', false);
    canvas.focus();
  }

  function pause(force) {
    if (!game.started || game.over) return;
    if (game.drawerOpen) setSummonDrawer(false, false);
    game.paused = force === undefined ? !game.paused : force;
    if (game.paused) showOverlay('pauseOverlay', 'resumeBtn'); else hideOverlay('pauseOverlay', false);
    $('pauseBtn').textContent = game.paused ? '▶' : 'Ⅱ';
    $('pauseBtn').setAttribute('aria-label', game.paused ? 'Resume game' : 'Pause game');
    $('pauseBtn').setAttribute('aria-pressed', String(game.paused));
    if (game.paused) {
      game.shake = 0; game.flash = 0;
      game.enemies.forEach(enemy => { enemy.hit = 0; });
      Object.keys(keys).forEach(key => { keys[key] = false; });
    }
  }

  function setSummonDrawer(open, moveFocus = true) {
    const compact = compactDrawerMedia.matches;
    const wasOpen = Boolean(game?.drawerOpen);
    const focusWasInDock = ui.summonDock.contains(document.activeElement);
    const canOpen = compact && game?.started && !game.paused && !game.over;
    const shouldOpen = Boolean(open && canOpen);
    if (game) game.drawerOpen = shouldOpen;
    ui.summonDock.classList.toggle('drawer-open', shouldOpen);
    ui.summonDock.classList.toggle('drawer-closed', compact && !shouldOpen);
    ui.summonDock.inert = compact && !shouldOpen;
    if (compact && !shouldOpen) ui.summonDock.setAttribute('aria-hidden', 'true');
    else ui.summonDock.removeAttribute('aria-hidden');
    ui.drawerToggle.setAttribute('aria-expanded', String(shouldOpen));
    ui.drawerToggle.textContent = shouldOpen ? 'CLOSE' : 'SUMMON';
    ui.drawerToggle.setAttribute('aria-label', shouldOpen ? 'Close summon roster' : 'Open summon roster');
    if (moveFocus && shouldOpen) requestAnimationFrame(() => ui.drawerClose.focus());
    else if (moveFocus && compact && (wasOpen || focusWasInDock)) requestAnimationFrame(() => ui.drawerToggle.focus());
  }

  function setForgePage(page, moveFocus = true) {
    const relics = page === 'relics';
    $('forgePanel').classList.toggle('showing-relics', relics);
    $('gearItems').hidden = relics;
    $('relicItems').hidden = !relics;
    $('forgeGearTab').classList.toggle('active', !relics);
    $('forgeRelicTab').classList.toggle('active', relics);
    $('forgeGearTab').setAttribute('aria-selected', String(!relics));
    $('forgeRelicTab').setAttribute('aria-selected', String(relics));
    $('forgeGearTab').tabIndex = relics ? -1 : 0;
    $('forgeRelicTab').tabIndex = relics ? 0 : -1;
    if (moveFocus) (relics ? $('forgeRelicTab') : $('forgeGearTab')).focus();
  }

  function closeDrawerForInterruption() {
    if (game.drawerOpen) setSummonDrawer(false, false);
    if (game.started && !game.paused && !game.over) pause(true);
  }

  function queueSpawn(def, options = {}) {
    game.spawnQueue.push({ def, due: options.due ?? game.time, playerMade: Boolean(options.playerMade), boss: Boolean(options.boss), type: options.type || def.key || 'ambient', wave: options.wave || game.wave });
  }

  function spawnEnemy(def, options = {}) {
    const playerMade = Boolean(options.playerMade), boss = Boolean(options.boss);
    const waveIndex = Math.max(0, options.wave - 1);
    const late = Math.max(0, (options.wave || 1) - 8);
    const hpScale = boss ? 1 : playerMade ? 1 + waveIndex * .015 + late * late * .0022 : 1 + waveIndex * .035 + late * late * .0055;
    const damageScale = boss ? 1 : playerMade ? 1 + waveIndex * .01 + late * late * .0011 : 1 + waveIndex * .02 + late * late * .0025;
    const enemy = {
      id: ++game.spawnId, x: PATH[0].x, y: PATH[0].y, pathIndex: 1, type: options.type || def.key || 'ambient',
      r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale, speed: def.speed,
      damage: def.damage * damageScale, reward: def.reward, xp: def.xp, armor: def.armor || 0,
      trait: def.trait || '', regen: def.regen || 0, crystalDamage: def.crystalDamage || 1,
      color: def.color, playerMade, boss, attackCd: 0, slow: 0, slowTimer: 0, hit: 0, phase: Math.random() * 6.28
    };
    game.enemies.push(enemy);
    return enemy;
  }

  function processSpawnQueue() {
    if (!game.spawnQueue.length) return;
    game.spawnQueue.sort((a, b) => a.due - b.due);
    while (game.spawnQueue.length && game.spawnQueue[0].due <= game.time) {
      const entry = game.spawnQueue.shift();
      const enemy = spawnEnemy(entry.def, entry);
      if (entry.boss) activateBoss(enemy, entry.wave);
    }
  }

  function chooseAmbient(wave) {
    const pool = ambientDefs.filter(def => wave >= def.unlockWave);
    const bias = Math.min(pool.length - 1, Math.floor(Math.random() * pool.length + wave / 15));
    return pool[Math.max(0, bias)];
  }

  function bossDefinition(wave) {
    const tier = Math.floor(wave / 5);
    const late = Math.max(0, wave - 10);
    return { key: 'boss', hp: (1600 + tier * 655) * (1 + late * late * .008), speed: Math.min(104, 68 + tier * 1.5 + late * .18), damage: (54 + tier * 12) * (1 + late * late * .0035), reward: 180 + tier * 45, xp: 170 + tier * 28, r: 58, armor: Math.min(.28, .18 + late * .0015), color: '#ed4f78' };
  }

  function activateBoss(enemy, wave) {
    const names = ['THE IRON WITNESS', 'ASHEN COLOSSUS', 'THE HOLLOW CROWN', 'THE RED ENGINE'];
    enemy.name = names[(Math.floor(wave / 5) - 1) % names.length];
    game.boss = enemy;
    ui.bossName.textContent = enemy.name;
    ui.bossBar.hidden = false;
    ui.bossBar.classList.remove('hidden');
    announce('BOSS INBOUND', enemy.name);
    game.shake = 10;
    tone(60, .45, 'sawtooth', .08);
  }

  function startWave() {
    game.wave++;
    const wave = game.wave;
    const late = Math.max(0, wave - 8);
    const ambientCount = Math.min(42, Math.min(3 + Math.floor(wave * .55), 28) + Math.floor(Math.pow(late, 1.4) * .18));
    const ambientSpread = Math.min(12, 5 + ambientCount * .22);
    for (let i = 0; i < ambientCount; i++) {
      queueSpawn(chooseAmbient(wave), { due: game.time + .15 + i * ambientSpread / Math.max(1, ambientCount - 1), wave });
    }

    const returning = [];
    Object.entries(game.roster).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) returning.push(type);
    });
    const rosterSpread = Math.min(WAVE_SECONDS - 3, Math.max(3, returning.length * .34));
    returning.forEach((type, i) => {
      queueSpawn(summonDefs[type], {
        due: game.time + .65 + i * rosterSpread / Math.max(1, returning.length - 1),
        playerMade: true, type, wave
      });
    });

    if (wave % 5 === 0) queueSpawn(bossDefinition(wave), { due: game.time + Math.min(11, ambientSpread * .8), boss: true, wave });
    game.spawnQueue.sort((a, b) => a.due - b.due);
    const rosterCopy = returning.length ? ` • ${returning.length} roster return${returning.length === 1 ? '' : 's'}` : '';
    announce(`WAVE ${wave}`, `${ambientCount} ambient signatures${rosterCopy}`);
    ui.live.textContent = `Wave ${wave}. ${ambientCount} ambient enemies and ${returning.length} purchased enemies scheduled gradually.`;
    tone(115, .13, 'sawtooth', .045);
  }

  function buySummon(type, automatic = false) {
    if (!game.started || game.paused || game.over) return false;
    const def = summonDefs[type];
    if (!def) return false;
    if (game.hero.level < def.unlock) {
      note(`UNLOCKS AT LEVEL ${def.unlock}`);
      return false;
    }
    if (game.stock[type] <= 0) {
      if (!automatic) note('OUT OF STOCK • RESTOCKING');
      return false;
    }
    if (game.gold < def.cost) {
      if (!automatic) note('NOT ENOUGH GOLD');
      return false;
    }

    game.gold -= def.cost;
    const wasFullStock = game.stock[type] >= def.stockCap;
    game.stock[type]--;
    if (wasFullStock) game.stockClocks[type] = 0;
    game.income += def.income;
    game.dangerSpent += def.cost;
    game.contracts[type]++;
    game.roster[type] += def.count;
    for (let i = 0; i < def.count; i++) {
      queueSpawn(def, { due: game.time + i * .38, playerMade: true, type, wave: Math.max(1, game.wave) });
    }
    game.spawnQueue.sort((a, b) => a.due - b.due);
    if (!automatic) {
      note(`${def.name.toUpperCase()} CONTRACT • +${def.income} INCOME ONCE`);
      ui.live.textContent = `${def.name} purchased. One stock used; ${game.stock[type]} of ${def.stockCap} remain. ${def.count} ${def.count === 1 ? 'body joined' : 'bodies joined'} the permanent roster. Income increased once by ${def.income}.`;
      tone(190, .08, 'square', .035);
      setTimeout(() => tone(280, .1, 'square', .025), 80);
    }
    updateUI();
    return true;
  }

  function activeThreat() {
    return game.enemies.reduce((sum, enemy) => sum + enemy.hp / 115, 0) + Math.min(18, game.spawnQueue.length * .45);
  }

  function updateStock(dt) {
    Object.entries(summonDefs).forEach(([type, def]) => {
      if (game.stock[type] >= def.stockCap) {
        game.stock[type] = def.stockCap;
        game.stockClocks[type] = 0;
        return;
      }
      game.stockClocks[type] += dt;
      if (game.stockClocks[type] >= def.restockSeconds) {
        game.stock[type]++;
        game.stockClocks[type] -= def.restockSeconds;
        if (game.stock[type] >= def.stockCap) game.stockClocks[type] = 0;
      }
    });
  }

  function tryAutoSummon() {
    const reserve = RESERVES[game.reserveIndex];
    const ready = Object.entries(summonDefs)
      .filter(([type, def]) => game.autos[type] && game.hero.level >= def.unlock && game.stock[type] > 0 && game.gold - def.cost >= reserve)
      .sort(([, a], [, b]) => a.cost - b.cost);
    if (ready.length) buySummon(ready[0][0], true);
  }

  function setUnitAuto(type, enabled, announceChange = true) {
    const def = summonDefs[type];
    if (!def || game.hero.level < def.unlock) return false;
    game.autos[type] = Boolean(enabled);
    const button = document.querySelector(`.summon-card[data-summon="${type}"] .unit-auto`);
    button?.setAttribute('aria-pressed', String(game.autos[type]));
    if (announceChange) ui.live.textContent = `${def.name} continuous Auto ${game.autos[type] ? 'enabled' : 'disabled'}.`;
    updateUI();
    return true;
  }

  function disableAllAutos() {
    Object.keys(game.autos).forEach(type => { game.autos[type] = false; });
    ui.live.textContent = 'All continuous unit Autos disabled.';
    updateUI();
  }

  function itemCost(type) {
    if (type === 'repair') return itemBase.repair;
    return Math.round(itemBase[type] * Math.pow(itemGrowth[type] || 1.58, game.items[type]));
  }

  function isItemMaxed(type) {
    if (itemLimits[type] !== undefined) return game.items[type] >= itemLimits[type];
    return (type === 'focus' && game.hero.focus >= .42) || (type === 'lens' && game.hero.crit >= .4);
  }

  function revenantCap() {
    return game.items.revive ? game.items.revive + 1 : 0;
  }

  function relicEffectAtRank(type, rank) {
    if (type === 'multishot') return `up to ${1 + rank} distinct shots`;
    if (type === 'chain') return `${rank} bounce${rank === 1 ? '' : 's'} • 62% carry`;
    if (type === 'splash') return `first hit: ${44 + rank * 9}r • ${Math.round((.16 + rank * .055) * 100)}% to ${2 + rank} foes`;
    if (type === 'revive') return `${rank + 1} revenant cap`;
    return '';
  }

  function relicEffect(type) {
    const rank = game.items[type];
    if (!rank) return `Next: ${relicEffectAtRank(type, 1)}`;
    if (type === 'revive') return `${game.allies.length}/${revenantCap()} revenants active${rank >= itemLimits[type] ? ' • maximum' : ''}`;
    return `${relicEffectAtRank(type, rank)}${rank >= itemLimits[type] ? ' • maximum' : ''}`;
  }

  function buyItem(type) {
    if (!game.started || game.paused || game.over || !itemBase[type]) return false;
    if (isItemMaxed(type)) { note(`${itemNames[type]} AT MAXIMUM`); return false; }
    const cost = itemCost(type);
    if (game.gold < cost) { note('NOT ENOUGH GOLD'); return false; }
    if (type === 'repair' && game.crystal.hp >= game.crystal.maxHp) { note('CRYSTAL AT FULL POWER'); return false; }
    game.gold -= cost;
    const hero = game.hero;
    if (type === 'edge') { game.items.edge++; hero.damage *= 1.16; }
    if (type === 'plate') { game.items.plate++; hero.maxHp += 45; hero.hp += 45; }
    if (type === 'boots') { game.items.boots++; hero.speed += 18; hero.attackRate = Math.max(.31, hero.attackRate * .95); }
    if (type === 'lens') { game.items.lens++; hero.range += 45; hero.crit = Math.min(.4, hero.crit + .05); }
    if (type === 'focus') { game.items.focus++; hero.focus = Math.min(.42, hero.focus + .06); }
    if (type === 'seal') { game.items.seal++; game.crystal.maxHp += 180; game.crystal.hp += 180; }
    if (['multishot', 'chain', 'splash', 'revive'].includes(type)) game.items[type]++;
    if (type === 'repair') game.crystal.hp = Math.min(game.crystal.maxHp, game.crystal.hp + 260);
    const feedback = type === 'repair' ? 'CRYSTAL RESTORED' : ['multishot', 'chain', 'splash', 'revive'].includes(type) ? `${itemNames[type]} • ${relicEffect(type)}` : `${itemNames[type]} EQUIPPED`;
    note(feedback);
    ui.live.textContent = type === 'repair' ? 'Crystal restored.' : `${itemNames[type]} purchased. ${relicEffect(type) || `Rank ${game.items[type]}.`}`;
    tone(420, .1, 'sine', .04);
    setTimeout(() => tone(620, .12, 'sine', .03), 85);
    updateUI();
    return true;
  }

  function ability(name) {
    if (!game.started || game.paused || game.over || game.cooldowns[name] > 0) return;
    const hero = game.hero;
    if (name === 'dash') {
      let dx = hero.aimX, dy = hero.aimY;
      if (hero.destination) { dx = hero.destination.x - hero.x; dy = hero.destination.y - hero.y; }
      const mag = Math.hypot(dx, dy) || 1; dx /= mag; dy /= mag;
      const sx = hero.x, sy = hero.y;
      hero.x = clamp(hero.x + dx * 235, 55, 1545);
      hero.y = clamp(hero.y + dy * 235, 75, 810);
      hero.invuln = .3;
      [...game.enemies].forEach(enemy => {
        if (pointLineDistance(enemy.x, enemy.y, sx, sy, hero.x, hero.y) < enemy.r + 25) damageEnemy(enemy, hero.damage * 1.85);
      });
      game.slashes.push({ x1: sx, y1: sy, x2: hero.x, y2: hero.y, life: .28, max: .28, color: '#70e7df' });
      game.shake = 4; tone(210, .12, 'sawtooth', .045);
    } else if (name === 'nova') {
      [...game.enemies].forEach(enemy => {
        const distance = dist(hero, enemy);
        if (distance < 225 + enemy.r) {
          damageEnemy(enemy, hero.damage * 2.1);
          if (enemy.hp > 0) { enemy.slow = .45; enemy.slowTimer = 3; }
        }
      });
      game.slashes.push({ x: hero.x, y: hero.y, radius: 20, maxRadius: 240, life: .55, max: .55, ring: true, color: '#b48cff' });
      game.shake = 5; burst(hero.x, hero.y, '#b48cff', 20); tone(310, .3, 'sine', .055);
    } else {
      game.sentinels.push({ x: game.crystal.x - 95, y: game.crystal.y - 88, life: 11, attackCd: 0, phase: 0 });
      burst(game.crystal.x - 95, game.crystal.y - 88, '#ffd269', 16); tone(520, .25, 'triangle', .05);
    }
    game.cooldowns[name] = game.maxCooldowns[name] * (1 - hero.focus);
  }

  function moveToward(entity, target, speed, dt) {
    const dx = target.x - entity.x, dy = target.y - entity.y, distance = Math.hypot(dx, dy) || 1;
    const amount = Math.min(distance, speed * dt);
    entity.x += dx / distance * amount;
    entity.y += dy / distance * amount;
    return distance;
  }

  function addProjectile(projectile) {
    if (game.projectiles.length >= MAX_PROJECTILES) return false;
    game.projectiles.push(projectile);
    return true;
  }

  function fireWardenProjectile(target, index) {
    const hero = game.hero;
    const dx = target.x - hero.x, dy = target.y - hero.y, magnitude = Math.hypot(dx, dy) || 1;
    const aimX = dx / magnitude, aimY = dy / magnitude;
    const critical = Math.random() < hero.crit;
    const side = (index - game.items.multishot / 2) * 7;
    addProjectile({
      x: hero.x + aimX * 26 - aimY * side, y: hero.y + aimY * 26 + aimX * side, target, speed: 760,
      damage: hero.damage * (index ? .55 : 1) * (critical ? 2 : 1), color: critical ? '#ffd269' : '#8ffff4', r: critical ? 7 : 5,
      critical, wardenShot: true, chainLeft: game.items.chain, chainRange: 150 + game.items.chain * 12,
      splashRank: game.items.splash, splashReady: true, hitIds: [], canRetarget: true
    });
  }

  function projectileTarget(projectile, radius, excludeHit = true) {
    let target = null, best = radius;
    game.enemies.forEach(enemy => {
      if (excludeHit && projectile.hitIds?.includes(enemy.id)) return;
      const distance = dist(projectile, enemy);
      if (distance < best) { best = distance; target = enemy; }
    });
    return target;
  }

  function nearestWardenTargets(limit) {
    const targets = [], distances = [], hero = game.hero;
    game.enemies.forEach(enemy => {
      const distance = dist(hero, enemy);
      if (distance >= hero.range) return;
      let index = distances.length;
      while (index > 0 && distance < distances[index - 1]) index--;
      if (index >= limit) return;
      targets.splice(index, 0, enemy);
      distances.splice(index, 0, distance);
      if (targets.length > limit) { targets.pop(); distances.pop(); }
    });
    return targets;
  }

  function impactProjectile(projectile) {
    const target = projectile.target;
    const impactX = target.x, impactY = target.y;
    if (projectile.hitIds) projectile.hitIds.push(target.id);
    damageEnemy(target, projectile.damage);
    if (projectile.critical) burst(impactX, impactY, '#ffd269', 8);

    if (projectile.wardenShot && projectile.splashRank > 0 && projectile.splashReady) {
      projectile.splashReady = false;
      const radius = 44 + projectile.splashRank * 9;
      const splashDamage = projectile.damage * (.16 + projectile.splashRank * .055);
      [...game.enemies]
        .filter(enemy => enemy !== target && dist({ x: impactX, y: impactY }, enemy) <= radius + enemy.r)
        .sort((a, b) => dist({ x: impactX, y: impactY }, a) - dist({ x: impactX, y: impactY }, b))
        .slice(0, 2 + projectile.splashRank)
        .forEach(enemy => damageEnemy(enemy, splashDamage));
      game.slashes.push({ x: impactX, y: impactY, radius: 8, maxRadius: radius, life: .24, max: .24, ring: true, color: '#ff8fcb' });
    }

    if (projectile.wardenShot && projectile.chainLeft > 0) {
      projectile.x = impactX; projectile.y = impactY;
      const nextTarget = projectileTarget(projectile, projectile.chainRange, true);
      if (nextTarget) {
        projectile.target = nextTarget;
        projectile.damage *= .62;
        projectile.chainLeft--;
        projectile.color = '#ffd269';
        projectile.r = Math.max(3, projectile.r - .35);
        return true;
      }
    }
    return false;
  }

  function raiseRevenant(enemy) {
    const rank = game.items.revive, cap = revenantCap();
    if (!rank || enemy.boss || enemy.playerMade || game.allies.length >= cap) return;
    const rankScale = 1 + (rank - 1) * .14;
    const maxHp = Math.min(game.hero.maxHp * .72, clamp(enemy.maxHp * .22, 75, 440) * rankScale);
    game.allies.push({
      id: ++game.allyId, x: enemy.x, y: enemy.y, r: clamp(enemy.r * .82, 11, 31), type: enemy.type,
      hp: maxHp, maxHp, speed: clamp(enemy.speed * 1.05, 105, 195),
      damage: Math.min(game.hero.damage * .52, (clamp(enemy.damage * .28, 12, 70) + game.hero.damage * .06) * (1 + (rank - 1) * .1)),
      attackCd: .2, attackRate: Math.max(.58, .86 - rank * .035), hit: 0, phase: Math.random() * Math.PI * 2,
      color: enemy.color
    });
    burst(enemy.x, enemy.y, '#79efae', 12);
  }

  function damageAlly(ally, amount) {
    ally.hp -= amount;
    ally.hit = 1;
    burst(ally.x, ally.y, '#79efae', 3);
    if (ally.hp > 0) return;
    const index = game.allies.indexOf(ally);
    if (index >= 0) game.allies.splice(index, 1);
    burst(ally.x, ally.y, '#79efae', 10);
  }

  function updateAlly(ally, dt) {
    ally.attackCd -= dt;
    ally.hit = Math.max(0, ally.hit - dt * 5);
    ally.phase += dt * 3;
    let target = null, best = Infinity;
    game.enemies.forEach(enemy => {
      const distance = dist(ally, enemy);
      if (distance < best) { best = distance; target = enemy; }
    });
    if (!target) {
      const follow = { x: game.hero.x - 58 - (ally.id % 3) * 25, y: game.hero.y + ((ally.id % 5) - 2) * 28 };
      if (dist(ally, follow) > 55) moveToward(ally, follow, ally.speed, dt);
      return;
    }
    const contact = ally.r + target.r + 7;
    if (best > contact) {
      moveToward(ally, target, ally.speed, dt);
      return;
    }
    if (ally.attackCd <= 0) {
      ally.attackCd = ally.attackRate;
      damageEnemy(target, ally.damage);
      game.slashes.push({ x1: ally.x, y1: ally.y, x2: target.x, y2: target.y, life: .16, max: .16, color: '#79efae' });
    }
  }

  function updateEnemy(enemy, dt) {
    const hero = game.hero;
    enemy.attackCd -= dt;
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    enemy.phase += dt * 3;
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt; else enemy.slow = 0;
    if (enemy.regen) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * enemy.regen * dt);

    const heroDistance = dist(enemy, hero);
    let allyTarget = null, allyDistance = Infinity;
    if (enemy.trait !== 'siege') game.allies.forEach(ally => {
      const distance = dist(enemy, ally);
      if (distance < allyDistance) { allyDistance = distance; allyTarget = ally; }
    });
    const chasesAlly = Boolean(allyTarget && allyDistance < enemy.r + allyTarget.r + 105);
    const chasesHero = !chasesAlly && enemy.trait !== 'siege' && heroDistance < enemy.r + hero.r + 92;
    let target = null;
    if (chasesAlly) target = allyTarget;
    else if (chasesHero) target = hero;
    else if (enemy.pathIndex < PATH.length) target = PATH[enemy.pathIndex];
    else target = game.crystal;

    const targetDistance = dist(enemy, target);
    const contact = enemy.r + (target.r || 8) + 4;
    if (targetDistance > contact) {
      let speedFactor = 1 - enemy.slow;
      if (enemy.trait === 'surge' && Math.sin(enemy.phase * .48) > .55) speedFactor *= 1.75;
      moveToward(enemy, target, enemy.speed * speedFactor, dt);
      if (!chasesHero && !chasesAlly && enemy.pathIndex < PATH.length && dist(enemy, target) <= contact + 3) enemy.pathIndex++;
      return;
    }

    if (!chasesHero && !chasesAlly && enemy.pathIndex < PATH.length) {
      enemy.pathIndex++;
      return;
    }
    if (enemy.attackCd > 0) return;
    enemy.attackCd = enemy.boss ? 1.05 : 1.3;
    if (target === allyTarget) {
      damageAlly(allyTarget, enemy.damage);
    } else if (target === hero) {
      if (hero.invuln <= 0) {
        hero.hp -= enemy.damage;
        hero.invuln = .24;
        burst(hero.x, hero.y, '#ff6577', 6);
      }
    } else {
      game.crystal.hp -= enemy.damage * enemy.crystalDamage;
      game.crystal.pulse = 1;
      game.shake = Math.max(game.shake, enemy.boss ? 12 : 4);
      burst(game.crystal.x - 20, game.crystal.y, '#ff6577', 8);
    }
  }

  function update(dt) {
    if (!game.started || game.paused || game.over || game.drawerOpen) return;
    game.time += dt;
    game.incomeClock += dt;
    updateStock(dt);
    game.autoClock += dt;
    game.shake = Math.max(0, game.shake - dt * 18);
    game.flash = Math.max(0, game.flash - dt * 3);
    Object.keys(game.cooldowns).forEach(key => { game.cooldowns[key] = Math.max(0, game.cooldowns[key] - dt); });
    const hero = game.hero;
    hero.attackCd -= dt;
    hero.targetScanCd = Math.max(0, hero.targetScanCd - dt);
    hero.invuln = Math.max(0, hero.invuln - dt);

    if (game.incomeClock >= PAYDAY_SECONDS) {
      game.incomeClock -= PAYDAY_SECONDS;
      const payout = game.income;
      game.gold += payout;
      note(`PAYDAY +${payout} GOLD`);
      ui.live.textContent = `Fixed five-second payday delivered ${payout} gold.`;
      tone(680, .07, 'sine', .025);
    }
    if (game.autoClock >= AUTO_PURCHASE_SECONDS) {
      game.autoClock %= AUTO_PURCHASE_SECONDS;
      tryAutoSummon();
    }
    if (game.time >= game.nextWave) {
      startWave();
      game.nextWave += WAVE_SECONDS;
    }
    processSpawnQueue();

    hero.hexed = game.enemies.some(enemy => enemy.trait === 'hexer' && dist(enemy, hero) < 215);
    const moveSpeed = hero.speed * (hero.hexed ? .72 : 1);
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (pointer.stickX || 0);
    let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + (pointer.stickY || 0);
    if (mx || my) {
      const magnitude = Math.hypot(mx, my); mx /= magnitude; my /= magnitude;
      hero.x += mx * moveSpeed * dt; hero.y += my * moveSpeed * dt;
      hero.aimX = mx; hero.aimY = my; hero.destination = null;
    } else if (hero.destination) {
      const dx = hero.destination.x - hero.x, dy = hero.destination.y - hero.y, distance = Math.hypot(dx, dy);
      if (distance > 8) {
        hero.x += dx / distance * Math.min(moveSpeed * dt, distance);
        hero.y += dy / distance * Math.min(moveSpeed * dt, distance);
        hero.aimX = dx / distance; hero.aimY = dy / distance;
      } else hero.destination = null;
    }
    hero.x = clamp(hero.x, 55, 1545); hero.y = clamp(hero.y, 75, 810);

    if (hero.attackCd <= 0 && hero.targetScanCd <= 0) {
      const targets = nearestWardenTargets(1 + game.items.multishot);
      const target = targets[0] || null;
      if (target) {
        hero.attackCd = hero.attackRate;
        const dx = target.x - hero.x, dy = target.y - hero.y, magnitude = Math.hypot(dx, dy) || 1;
        hero.aimX = dx / magnitude; hero.aimY = dy / magnitude;
        const shotCount = Math.min(1 + game.items.multishot, targets.length);
        for (let i = 0; i < shotCount; i++) fireWardenProjectile(targets[i], i);
        tone(330 + Math.random() * 50, .04, 'square', .018);
      } else hero.targetScanCd = .08;
    }

    for (let i = game.allies.length - 1; i >= 0; i--) updateAlly(game.allies[i], dt);
    for (let i = game.enemies.length - 1; i >= 0; i--) updateEnemy(game.enemies[i], dt);

    if (hero.hp <= 0) {
      hero.hp = Math.max(85, hero.maxHp * .43);
      hero.x = game.crystal.x - 150; hero.y = game.crystal.y;
      game.crystal.hp -= 90;
      note('WARDEN DOWN • CRYSTAL OVERLOAD');
    }
    game.crystal.pulse = Math.max(0, game.crystal.pulse - dt * 2);
    if (game.crystal.hp <= 0) endGame();

    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const projectile = game.projectiles[i];
      if (!projectile.target || projectile.target.hp <= 0) {
        const nextTarget = projectile.wardenShot && projectile.canRetarget ? projectileTarget(projectile, Math.max(260, projectile.chainRange || 0), true) : null;
        if (!nextTarget) { game.projectiles.splice(i, 1); continue; }
        projectile.target = nextTarget;
      }
      const dx = projectile.target.x - projectile.x, dy = projectile.target.y - projectile.y, distance = Math.hypot(dx, dy) || 1;
      if (distance < projectile.target.r + 8) {
        if (!impactProjectile(projectile)) game.projectiles.splice(i, 1);
        continue;
      }
      projectile.x += dx / distance * projectile.speed * dt;
      projectile.y += dy / distance * projectile.speed * dt;
    }
    for (let i = game.sentinels.length - 1; i >= 0; i--) {
      const sentinel = game.sentinels[i]; sentinel.life -= dt; sentinel.attackCd -= dt; sentinel.phase += dt * 4;
      if (sentinel.life <= 0) { game.sentinels.splice(i, 1); continue; }
      if (sentinel.attackCd <= 0) {
        let sentinelTarget = null, bestDistance = 480;
        game.enemies.forEach(enemy => { const distance = dist(sentinel, enemy); if (distance < bestDistance) { bestDistance = distance; sentinelTarget = enemy; } });
        if (sentinelTarget) {
          sentinel.attackCd = .46;
          addProjectile({ x: sentinel.x, y: sentinel.y, target: sentinelTarget, speed: 840, damage: hero.damage * .68, color: '#ffd269', r: 4, chainLeft: 0 });
        }
      }
    }
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const particle = game.particles[i]; particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= .97; particle.vy *= .97;
      if (particle.life <= 0) game.particles.splice(i, 1);
    }
    for (let i = game.slashes.length - 1; i >= 0; i--) {
      const slash = game.slashes[i]; slash.life -= dt;
      if (slash.ring) slash.radius += (slash.maxRadius - slash.radius) * dt * 9;
      if (slash.life <= 0) game.slashes.splice(i, 1);
    }
    updateUI();
  }

  function damageEnemy(enemy, amount) {
    enemy.hp -= amount * (1 - enemy.armor);
    enemy.hit = 1;
    burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 6 : 3);
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    const index = game.enemies.indexOf(enemy);
    if (index < 0) return;
    game.enemies.splice(index, 1);
    raiseRevenant(enemy);
    game.gold += enemy.reward;
    addXp(enemy.xp);
    burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 35 : 10);
    if (enemy === game.boss) {
      game.boss = null;
      ui.bossBar.hidden = true;
      ui.bossBar.classList.add('hidden');
      announce('MILESTONE CLEARED', `+${enemy.reward} gold bounty`);
      tone(180, .15, 'square', .06);
      setTimeout(() => tone(360, .22, 'sine', .05), 150);
    }
  }

  function addXp(xp) {
    const hero = game.hero;
    hero.xp += xp;
    while (hero.xp >= hero.xpNeed) {
      hero.xp -= hero.xpNeed;
      hero.level++;
      hero.xpNeed = Math.round(hero.xpNeed * 1.34 + 8);
      hero.maxHp += 30;
      hero.hp = hero.maxHp;
      hero.damage *= 1.09;
      hero.speed += 3;
      hero.attackRate = Math.max(.31, hero.attackRate * .985);
      const unlocks = Object.values(summonDefs).filter(def => def.unlock === hero.level).map(def => def.name);
      announce(`LEVEL ${hero.level}`, `+health • +damage${unlocks.length ? ` • ${unlocks.join(' + ')} unlocked` : ''}`);
      tone(480, .12, 'sine', .05);
    }
  }

  function burst(x, y, color, count) {
    if (reducedMotion) count = Math.min(count, 4);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 30 + Math.random() * 130;
      game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .3 + Math.random() * .45, max: .75, color, size: 2 + Math.random() * 3 });
    }
    if (game.particles.length > 500) game.particles.splice(0, game.particles.length - 500);
  }

  function draw() {
    const width = canvas.width, height = canvas.height;
    const scale = Math.min(width / WORLD.w, height / WORLD.h), ox = (width - WORLD.w * scale) / 2, oy = (height - WORLD.h * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#050b11'; ctx.fillRect(0, 0, width, height);
    const shakeX = reducedMotion ? 0 : (Math.random() - .5) * game.shake * scale;
    const shakeY = reducedMotion ? 0 : (Math.random() - .5) * game.shake * scale;
    ctx.save(); ctx.translate(ox + shakeX, oy + shakeY); ctx.scale(scale, scale);
    drawArena();
    game.slashes.forEach(drawSlash);
    game.sentinels.forEach(drawSentinel);
    game.allies.forEach(drawAlly);
    game.enemies.forEach(drawEnemy);
    drawCrystal(); drawHero();
    game.projectiles.forEach(drawProjectile);
    game.particles.forEach(drawParticle);
    ctx.restore();
  }

  function tracePath() {
    ctx.beginPath();
    PATH.forEach((point, index) => { if (index) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); });
  }

  function drawRouteArrows() {
    const arrows = [
      { x: 430, y: 195, a: 0 }, { x: 880, y: 195, a: 0 }, { x: 1320, y: 195, a: 0 },
      { x: 1450, y: 330, a: Math.PI / 2 }, { x: 1120, y: 450, a: Math.PI }, { x: 690, y: 450, a: Math.PI }, { x: 280, y: 450, a: Math.PI },
      { x: 150, y: 540, a: Math.PI / 2 }, { x: 430, y: 625, a: 0 }, { x: 850, y: 625, a: 0 }, { x: 1240, y: 625, a: 0 }
    ];
    ctx.fillStyle = 'rgba(112,231,223,.24)';
    arrows.forEach(arrow => {
      ctx.save(); ctx.translate(arrow.x, arrow.y); ctx.rotate(arrow.a);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-4, 0); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }

  function drawArena() {
    const gradient = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    gradient.addColorStop(0, '#071119'); gradient.addColorStop(.56, '#0b1c25'); gradient.addColorStop(1, '#07131c');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.save();
    ctx.strokeStyle = 'rgba(102,190,197,.05)'; ctx.lineWidth = 1;
    for (let x = 0; x < WORLD.w; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
    for (let y = 0; y < WORLD.h; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(1,7,11,.82)'; ctx.lineWidth = 64; tracePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(112,231,223,.17)'; ctx.lineWidth = 52; tracePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(5,16,23,.94)'; ctx.lineWidth = 46; tracePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(112,231,223,.13)'; ctx.lineWidth = 2; ctx.setLineDash([13, 18]); tracePath(); ctx.stroke(); ctx.setLineDash([]);
    drawRouteArrows();
    ctx.fillStyle = 'rgba(112,231,223,.035)'; ctx.fillRect(1330, 540, 245, 170);
    ctx.strokeStyle = 'rgba(112,231,223,.18)'; ctx.strokeRect(1330, 540, 245, 170);
    ctx.fillStyle = 'rgba(255,101,119,.055)'; ctx.fillRect(0, 130, 105, 130);
    ctx.strokeStyle = 'rgba(255,101,119,.2)'; ctx.strokeRect(0, 130, 105, 130);
    ctx.fillStyle = 'rgba(255,101,119,.55)'; ctx.font = 'bold 10px sans-serif'; ctx.letterSpacing = '2px'; ctx.fillText('BREACH', 23, 155);
    ctx.restore();
  }

  function drawCrystal() {
    const crystal = game.crystal, pulse = 1 + Math.sin(game.time * 3) * .025 + crystal.pulse * .08;
    ctx.save(); ctx.translate(crystal.x, crystal.y); ctx.scale(pulse, pulse);
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 110); glow.addColorStop(0, 'rgba(112,231,223,.38)'); glow.addColorStop(1, 'rgba(112,231,223,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 110, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(112,231,223,.35)'; ctx.lineWidth = 3; ctx.rotate(game.time * .13);
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(65, 0); ctx.lineTo(90, 0); ctx.stroke(); }
    ctx.rotate(-game.time * .13);
    ctx.fillStyle = crystal.pulse > 0 ? '#fff' : '#7df8ee'; ctx.shadowBlur = 24; ctx.shadowColor = '#39d8dd';
    ctx.beginPath(); ctx.moveTo(0, -62); ctx.lineTo(35, -15); ctx.lineTo(20, 50); ctx.lineTo(0, 70); ctx.lineTo(-20, 50); ctx.lineTo(-35, -15); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#164c5a'; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(17, -8); ctx.lineTo(0, 45); ctx.lineTo(-17, -8); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function drawHero() {
    const hero = game.hero;
    ctx.save(); ctx.translate(hero.x, hero.y); ctx.rotate(Math.atan2(hero.aimY, hero.aimX));
    if (hero.invuln > 0) { ctx.globalAlpha = .7; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, hero.r + 9, 0, Math.PI * 2); ctx.stroke(); }
    if (hero.hexed) { ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 3; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(0, 0, hero.r + 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.shadowBlur = 18; ctx.shadowColor = '#70e7df'; ctx.fillStyle = '#70e7df';
    ctx.beginPath(); ctx.moveTo(29, 0); ctx.lineTo(-13, 21); ctx.lineTo(-4, 0); ctx.lineTo(-13, -21); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#123643'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-12, 11); ctx.lineTo(-4, 0); ctx.lineTo(-12, -11); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function enemyPoints(enemy) {
    if (enemy.boss) return 10;
    if (enemy.type === 'swarm') return 5;
    if (enemy.type === 'phantom') return 8;
    if (enemy.type === 'hydra') return 9;
    return 6;
  }

  function drawEnemy(enemy) {
    ctx.save(); ctx.translate(enemy.x, enemy.y + Math.sin(enemy.phase) * 2);
    if (enemy.hit > 0) { ctx.globalAlpha = .75 + Math.random() * .25; ctx.shadowBlur = 22; } else ctx.shadowBlur = enemy.playerMade ? 15 : 7;
    ctx.shadowColor = enemy.color; ctx.fillStyle = enemy.hit > 0 ? '#fff' : enemy.color;
    ctx.beginPath(); const points = enemyPoints(enemy);
    for (let i = 0; i < points; i++) {
      const angle = i / points * Math.PI * 2, radius = enemy.r * (i % 2 ? .7 : 1), x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#091016'; ctx.beginPath(); ctx.arc(enemy.r * .24, -enemy.r * .12, Math.max(2, enemy.r * .12), 0, Math.PI * 2); ctx.fill();
    if (enemy.playerMade) { ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(0, 0, enemy.r + 5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    if (enemy.hp < enemy.maxHp || enemy.boss) {
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r - 11, enemy.r * 2, 4);
      ctx.fillStyle = enemy.boss ? '#ff6577' : enemy.playerMade ? '#b48cff' : '#d95c6d';
      ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r - 11, enemy.r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 4);
    }
  }

  function drawAlly(ally) {
    ctx.save(); ctx.translate(ally.x, ally.y + Math.sin(ally.phase) * 2);
    ctx.globalAlpha = .9; ctx.shadowBlur = ally.hit > 0 ? 22 : 14; ctx.shadowColor = '#79efae';
    ctx.fillStyle = ally.hit > 0 ? '#fff' : '#3ecb91'; ctx.strokeStyle = ally.color; ctx.lineWidth = 2;
    ctx.beginPath(); const points = enemyPoints(ally);
    for (let i = 0; i < points; i++) {
      const angle = i / points * Math.PI * 2, radius = ally.r * (i % 2 ? .68 : 1), x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#07140f'; ctx.beginPath(); ctx.arc(ally.r * .24, -ally.r * .12, Math.max(2, ally.r * .12), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (ally.hp < ally.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(ally.x - ally.r, ally.y - ally.r - 10, ally.r * 2, 4);
      ctx.fillStyle = '#79efae'; ctx.fillRect(ally.x - ally.r, ally.y - ally.r - 10, ally.r * 2 * Math.max(0, ally.hp / ally.maxHp), 4);
    }
  }

  function drawSentinel(sentinel) {
    ctx.save(); ctx.translate(sentinel.x, sentinel.y); ctx.rotate(sentinel.phase); ctx.strokeStyle = '#ffd269'; ctx.lineWidth = 3; ctx.shadowBlur = 15; ctx.shadowColor = '#ffd269';
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const angle = i / 6 * Math.PI * 2, x = Math.cos(angle) * 19, y = Math.sin(angle) * 19; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); ctx.stroke(); ctx.fillStyle = '#ffd269'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawProjectile(projectile) { ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = projectile.color; ctx.fillStyle = projectile.color; ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function drawParticle(particle) { ctx.save(); ctx.globalAlpha = Math.max(0, particle.life / particle.max); ctx.fillStyle = particle.color; ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size); ctx.restore(); }
  function drawSlash(slash) {
    ctx.save(); ctx.globalAlpha = Math.max(0, slash.life / slash.max); ctx.strokeStyle = slash.color; ctx.shadowBlur = 18; ctx.shadowColor = slash.color; ctx.lineWidth = 9 * (slash.life / slash.max);
    if (slash.ring) { ctx.beginPath(); ctx.arc(slash.x, slash.y, slash.radius, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(slash.x1, slash.y1); ctx.lineTo(slash.x2, slash.y2); ctx.stroke(); }
    ctx.restore();
  }

  function updateUI() {
    const hero = game.hero, crystal = game.crystal;
    ui.gold.textContent = Math.floor(game.gold);
    ui.income.textContent = `+${game.income}`;
    ui.tickFill.style.width = `${game.incomeClock / PAYDAY_SECONDS * 100}%`;
    ui.wave.textContent = `WAVE ${Math.max(1, game.wave)}`;
    ui.timer.textContent = formatTime(game.time);
    const threat = activeThreat();
    ui.threat.textContent = `THREAT ${threat > 48 ? 'CRITICAL' : threat > 22 ? 'HIGH' : threat > 8 ? 'RISING' : 'LOW'}`;
    ui.threat.style.color = threat > 22 ? '#ff6577' : '';
    ui.level.textContent = hero.level;
    ui.hpText.textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;
    ui.hpFill.style.width = `${clamp(hero.hp / hero.maxHp * 100, 0, 100)}%`;
    ui.xpText.textContent = `LV ${hero.level} • ${hero.xp} / ${hero.xpNeed} XP`;
    ui.xpFill.style.width = `${hero.xp / hero.xpNeed * 100}%`;
    ui.crystalText.textContent = Math.max(0, Math.ceil(crystal.hp));
    ui.crystalFill.style.width = `${clamp(crystal.hp / crystal.maxHp * 100, 0, 100)}%`;
    ui.healthProgress.setAttribute('aria-valuemax', String(hero.maxHp));
    ui.healthProgress.setAttribute('aria-valuenow', String(Math.max(0, Math.ceil(hero.hp))));
    ui.xpProgress.setAttribute('aria-valuemax', String(hero.xpNeed));
    ui.xpProgress.setAttribute('aria-valuenow', String(hero.xp));
    ui.crystalProgress.setAttribute('aria-valuemax', String(crystal.maxHp));
    ui.crystalProgress.setAttribute('aria-valuenow', String(Math.max(0, Math.ceil(crystal.hp))));
    if (game.boss) {
      const bossPercent = Math.max(0, game.boss.hp / game.boss.maxHp * 100);
      ui.bossFill.style.width = `${bossPercent}%`;
      ui.bossProgress.setAttribute('aria-valuenow', String(Math.round(bossPercent)));
    }

    const totalRoster = Object.values(game.roster).reduce((sum, count) => sum + count, 0);
    ui.rosterTotal.textContent = `ROSTER ${totalRoster}`;
    document.querySelectorAll('.summon-card').forEach(card => {
      const type = card.dataset.summon, def = summonDefs[type], locked = hero.level < def.unlock;
      const buyButton = card.querySelector('.summon-buy'), autoButton = card.querySelector('.unit-auto');
      const inStock = game.stock[type] > 0, affordable = game.gold >= def.cost;
      const reserve = RESERVES[game.reserveIndex];
      const autoAffordable = game.gold - def.cost >= reserve;
      const nextStock = Math.max(0, def.restockSeconds - game.stockClocks[type]);
      const stockStatus = game.stock[type] >= def.stockCap ? 'FULL' : `NEXT ${Math.ceil(nextStock)}s`;
      const autoStatus = !inStock ? 'STOCK' : !autoAffordable ? 'WAIT' : 'READY';
      card.classList.toggle('locked', locked);
      card.classList.toggle('out-of-stock', !inStock);
      card.classList.toggle('auto-enabled', game.autos[type]);
      buyButton.disabled = locked || !affordable || !inStock;
      buyButton.setAttribute('aria-label', `Buy one ${def.name} contract for ${def.cost} gold and gain ${def.income} recurring income. Roster ${game.roster[type]} ${game.roster[type] === 1 ? 'body' : 'bodies'}. Stock ${game.stock[type]} of ${def.stockCap}.${locked ? ` Unlocks at level ${def.unlock}.` : ''}`);
      card.querySelector('.owned').textContent = `R${game.roster[type]}`;
      card.querySelector('.stock-line').innerHTML = `<b class="stock-count">${game.stock[type]}/${def.stockCap}</b> STOCK • ${stockStatus}`;
      autoButton.disabled = locked;
      autoButton.setAttribute('aria-pressed', String(game.autos[type]));
      autoButton.innerHTML = game.autos[type] ? `AUTO<br>${autoStatus}` : 'AUTO<br>OFF';
      autoButton.setAttribute('aria-label', `${game.autos[type] ? 'Turn off' : 'Turn on'} continuous automatic ${def.name} purchases.${game.autos[type] ? ` Current state: ${autoStatus.toLowerCase()}.` : ''}${locked ? ` Unlocks at level ${def.unlock}.` : ''}`);
    });
    ui.allAutoOff.disabled = !Object.values(game.autos).some(Boolean);
    ui.reserveBtn.setAttribute('aria-label', `Protect ${RESERVES[game.reserveIndex]} gold from all automatic purchases. Activate to choose another reserve.`);

    document.querySelectorAll('.shop-item').forEach(button => {
      const type = button.dataset.upgrade, cost = itemCost(type);
      const maxed = isItemMaxed(type);
      button.disabled = game.gold < cost || (type === 'repair' && crystal.hp >= crystal.maxHp) || maxed;
      $(`cost-${type}`).textContent = maxed ? 'MAX' : cost;
      if (type !== 'repair') $(`level-${type}`).textContent = game.items[type];
      const effect = $(`effect-${type}`);
      if (effect) {
        effect.textContent = relicEffect(type);
        button.setAttribute('aria-label', `${itemNames[type]}, rank ${game.items[type]}. ${relicEffect(type)}. ${maxed ? 'Maximum rank.' : `Costs ${cost} gold.`}`);
      }
    });
    document.querySelectorAll('.ability').forEach(button => {
      const name = button.dataset.ability, cooldown = game.cooldowns[name], maximum = game.maxCooldowns[name] * (1 - hero.focus);
      button.classList.toggle('cooling', cooldown > 0);
      button.querySelector('.cooldown').style.height = `${cooldown / maximum * 100}%`;
      button.querySelector('.cooldown-text').textContent = cooldown > 0 ? cooldown.toFixed(1) : '';
    });
  }

  function endGame() {
    setSummonDrawer(false, false);
    game.over = true; game.crystal.hp = 0;
    $('finalTime').textContent = formatTime(game.time); $('finalLevel').textContent = game.hero.level; $('finalIncome').textContent = game.income;
    showOverlay('gameOverOverlay', 'restartBtn'); tone(95, .7, 'sawtooth', .08);
  }
  function announce(title, sub = '') { ui.announce.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; ui.announce.classList.remove('show'); void ui.announce.offsetWidth; ui.announce.classList.add('show'); ui.live.textContent = `${title}. ${sub}`; }
  function note(text) { ui.note.textContent = text; ui.note.classList.remove('show'); void ui.note.offsetWidth; ui.note.classList.add('show'); }
  function formatTime(seconds) { const minutes = Math.floor(seconds / 60).toString().padStart(2, '0'), remainder = Math.floor(seconds % 60).toString().padStart(2, '0'); return `${minutes}:${remainder}`; }
  function clamp(number, minimum, maximum) { return Math.max(minimum, Math.min(maximum, number)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pointLineDistance(px, py, x1, y1, x2, y2) { const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (!lengthSquared) return Math.hypot(px - x1, py - y1); const t = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSquared, 0, 1); return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))); }
  function initAudio() { if (!audio) try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (error) { soundOn = false; } }
  function tone(frequency, duration, type = 'sine', volume = .03) { if (!soundOn || !audio) return; const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration); }
  function loop(now) { const dt = Math.min(.033, (now - last) / 1000); last = now; update(dt); draw(); raf = requestAnimationFrame(loop); }

  addEventListener('resize', fitCanvas);
  addEventListener('keydown', event => {
    const overlays = openOverlays(), overlay = overlays[overlays.length - 1];
    if (overlay) {
      if (event.code === 'Tab') {
        const ids = overlayFocus[overlay.id] || [], buttons = ids.map($).filter(Boolean), current = buttons.indexOf(document.activeElement);
        if (buttons.length) { event.preventDefault(); const next = event.shiftKey ? (current <= 0 ? buttons.length - 1 : current - 1) : (current < 0 || current === buttons.length - 1 ? 0 : current + 1); buttons[next].focus(); }
      } else if (event.code === 'Escape' && overlay.id === 'helpOverlay') { event.preventDefault(); closeHelp(); }
      else if (event.code === 'Escape' && overlay.id === 'pauseOverlay') { event.preventDefault(); pause(false); }
      return;
    }
    if (game.drawerOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        setSummonDrawer(false);
        return;
      }
      if (event.code === 'Tab') {
        const focusable = [...ui.summonDock.querySelectorAll('button:not([disabled]),select:not([disabled])')];
        const current = focusable.indexOf(document.activeElement);
        if (focusable.length) {
          event.preventDefault();
          const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
          focusable[next].focus();
        }
      }
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('button,a,select')) return;
    keys[event.code] = true;
    if (game.started && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyQ') ability('dash');
    if (event.code === 'KeyE') ability('nova');
    if (event.code === 'KeyR') ability('sentinel');
    if (event.code === 'Space' || event.code === 'Escape') pause();
  });
  addEventListener('keyup', event => { keys[event.code] = false; });
  canvas.addEventListener('pointerdown', event => {
    if (!game.started || game.paused || game.drawerOpen) return;
    canvas.focus();
    const point = screenToWorld(event.clientX, event.clientY);
    game.hero.destination = { x: clamp(point.x, 55, 1545), y: clamp(point.y, 75, 810) };
    game.hero.aimX = point.x - game.hero.x; game.hero.aimY = point.y - game.hero.y;
    const magnitude = Math.hypot(game.hero.aimX, game.hero.aimY) || 1;
    game.hero.aimX /= magnitude; game.hero.aimY /= magnitude;
  });
  document.querySelectorAll('.summon-buy').forEach(button => button.addEventListener('click', () => buySummon(button.closest('.summon-card').dataset.summon)));
  document.querySelectorAll('.unit-auto').forEach(button => button.addEventListener('click', () => {
    const type = button.closest('.summon-card').dataset.summon;
    setUnitAuto(type, !game.autos[type]);
  }));
  document.querySelectorAll('.shop-item').forEach(button => button.addEventListener('click', () => buyItem(button.dataset.upgrade)));
  $('forgeGearTab').addEventListener('click', () => setForgePage('gear'));
  $('forgeRelicTab').addEventListener('click', () => setForgePage('relics'));
  [$('forgeGearTab'), $('forgeRelicTab')].forEach(tab => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    setForgePage(event.code === 'ArrowLeft' || event.code === 'Home' ? 'gear' : 'relics');
  }));
  document.querySelectorAll('.ability').forEach(button => button.addEventListener('click', () => ability(button.dataset.ability)));
  $('startBtn').addEventListener('click', begin);
  $('pauseBtn').addEventListener('click', () => pause());
  $('resumeBtn').addEventListener('click', () => pause(false));
  $('restartBtn').addEventListener('click', () => { hideOverlay('gameOverOverlay', false); reset(); game.started = true; syncOverlayAccess(); canvas.focus(); });
  ui.reserveBtn.addEventListener('click', () => {
    game.reserveIndex = (game.reserveIndex + 1) % RESERVES.length;
    ui.reserveBtn.textContent = `RESERVE ${RESERVES[game.reserveIndex]}`;
    ui.live.textContent = `All continuous Autos now share a protected reserve of ${RESERVES[game.reserveIndex]} gold.`;
    updateUI();
  });
  ui.allAutoOff.addEventListener('click', disableAllAutos);
  ui.drawerToggle.addEventListener('click', () => setSummonDrawer(!game.drawerOpen));
  ui.drawerClose.addEventListener('click', () => setSummonDrawer(false));
  $('forgeToggle').addEventListener('click', () => {
    const collapsed = $('forgePanel').classList.toggle('collapsed');
    $('forgeToggle').textContent = collapsed ? '+' : '−';
    $('forgeToggle').setAttribute('aria-expanded', String(!collapsed));
    $('forgeToggle').setAttribute('aria-label', collapsed ? 'Expand item shop' : 'Collapse item shop');
  });
  $('soundBtn').addEventListener('click', () => {
    initAudio(); soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '♪' : '×';
    $('soundBtn').setAttribute('aria-label', soundOn ? 'Mute sound' : 'Enable sound'); $('soundBtn').setAttribute('aria-pressed', String(!soundOn));
    if (soundOn) { if (audio?.state === 'suspended') audio.resume(); tone(440, .1); }
  });
  const fullBtn = $('fullBtn'), fullscreenSupported = Boolean(document.fullscreenEnabled && $('gameShell').requestFullscreen);
  fullBtn.hidden = !fullscreenSupported;
  fullBtn.addEventListener('click', () => { if (game.drawerOpen) setSummonDrawer(false, false); const action = !document.fullscreenElement ? $('gameShell').requestFullscreen?.() : document.exitFullscreen?.(); action?.catch?.(() => {}); });
  const openHelp = () => {
    if (game.drawerOpen) setSummonDrawer(false, false);
    const shouldResume = game.started && !game.paused;
    if (shouldResume) pause(true);
    $('pauseOverlay').classList.remove('open');
    $('helpOverlay').dataset.resume = shouldResume ? '1' : '0';
    showOverlay('helpOverlay', 'closeHelp');
  };
  const closeHelp = () => {
    hideOverlay('helpOverlay', false);
    if ($('helpOverlay').dataset.resume === '1') pause(false);
    else if (game.started && game.paused) showOverlay('pauseOverlay', 'resumeBtn');
    else syncOverlayAccess();
  };
  $('helpBtn').addEventListener('click', openHelp);
  $('closeHelp').addEventListener('click', closeHelp);
  $('closeHelpBottom').addEventListener('click', closeHelp);
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeDrawerForInterruption(); });
  addEventListener('blur', closeDrawerForInterruption);
  document.addEventListener('fullscreenchange', () => {
    if (game.drawerOpen) setSummonDrawer(false, false);
    const active = document.fullscreenElement === $('gameShell');
    fullBtn.textContent = active ? '×' : '⛶'; fullBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen'); fullBtn.setAttribute('aria-pressed', String(active));
    if (!active && game.started && !game.paused && !game.over) pause(true);
    fitCanvas();
  });
  const handleDrawerBreakpoint = () => setSummonDrawer(false);
  if (compactDrawerMedia.addEventListener) compactDrawerMedia.addEventListener('change', handleDrawerBreakpoint);
  else compactDrawerMedia.addListener?.(handleDrawerBreakpoint);
  const stick = $('touchStick'), knob = $('stickKnob');
  function moveStick(event) {
    const rect = stick.getBoundingClientRect(), x = event.clientX - (rect.left + rect.width / 2), y = event.clientY - (rect.top + rect.height / 2), magnitude = Math.hypot(x, y), limit = 36, offset = Math.min(limit, magnitude), nx = magnitude ? x / magnitude : 0, ny = magnitude ? y / magnitude : 0;
    pointer.stickX = nx * (Math.min(magnitude, limit) / limit); pointer.stickY = ny * (Math.min(magnitude, limit) / limit); knob.style.transform = `translate(${nx * offset}px,${ny * offset}px)`;
  }
  stick.addEventListener('pointerdown', event => { stick.setPointerCapture(event.pointerId); moveStick(event); });
  stick.addEventListener('pointermove', event => { if (stick.hasPointerCapture(event.pointerId)) moveStick(event); });
  const endStick = () => { pointer.stickX = pointer.stickY = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

  if (location.protocol === 'file:' || ['localhost', '127.0.0.1', '0.0.0.0', 'terminal.local'].includes(location.hostname)) {
    window.__linewardenTest = {
      snapshot: () => ({ time: game.time, wave: game.wave, nextWave: game.nextWave, gold: game.gold, income: game.income, incomeClock: game.incomeClock, paused: game.paused, roster: { ...game.roster }, contracts: { ...game.contracts }, stock: { ...game.stock }, stockClocks: { ...game.stockClocks }, queue: game.spawnQueue.length, queueSelf: game.spawnQueue.filter(entry => entry.playerMade).length, enemies: game.enemies.length, enemyState: game.enemies.map(enemy => ({ id: enemy.id, type: enemy.type, hp: enemy.hp, maxHp: enemy.maxHp, x: enemy.x, y: enemy.y, boss: enemy.boss, playerMade: enemy.playerMade })), selfActive: game.enemies.filter(enemy => enemy.playerMade).length, allies: game.allies.length, allyCap: revenantCap(), allyState: game.allies.map(ally => ({ id: ally.id, type: ally.type, hp: ally.hp, maxHp: ally.maxHp, x: ally.x, y: ally.y })), projectiles: game.projectiles.length, projectileState: game.projectiles.map(projectile => ({ targetId: projectile.target?.id || null, damage: projectile.damage, chainLeft: projectile.chainLeft || 0, hitIds: [...(projectile.hitIds || [])], wardenShot: Boolean(projectile.wardenShot) })), hero: { x: game.hero.x, y: game.hero.y, hp: game.hero.hp, maxHp: game.hero.maxHp, damage: game.hero.damage, attackRate: game.hero.attackRate, range: game.hero.range, crit: game.hero.crit }, level: game.hero.level, xp: game.hero.xp, items: { ...game.items }, autos: { ...game.autos }, autoClock: game.autoClock, reserve: RESERVES[game.reserveIndex], drawerOpen: game.drawerOpen }),
      start: begin,
      purchase: type => buySummon(type),
      buyItem: type => buyItem(type),
      addXp,
      setAuto: (enabled, type = 'runner') => setUnitAuto(type, enabled, false),
      allAutoOff: disableAllAutos,
      setDrawer: open => setSummonDrawer(open, false),
      advance: seconds => { const steps = Math.ceil(seconds / .03); for (let i = 0; i < steps; i++) update(Math.min(.03, seconds - i * .03)); },
      setGold: amount => { game.gold = amount; updateUI(); },
      setStock: (type, amount, clock = 0) => { game.stock[type] = clamp(Math.floor(amount), 0, summonDefs[type].stockCap); game.stockClocks[type] = Math.max(0, clock); updateUI(); },
      setLevel: level => { game.hero.level = Math.max(1, Math.floor(level)); updateUI(); },
      setHero: values => { Object.assign(game.hero, values); updateUI(); },
      clearCombat: () => { game.enemies.length = 0; game.allies.length = 0; game.spawnQueue.length = 0; game.projectiles.length = 0; },
      spawnEnemy: (type = 'drone', values = {}) => {
        const def = ambientDefs.find(entry => entry.key === type);
        if (!def) return null;
        const enemy = spawnEnemy(def, { wave: Math.max(1, values.wave || game.wave || 1) });
        Object.assign(enemy, Object.fromEntries(Object.entries(values).filter(([key]) => !['wave', 'boss', 'playerMade'].includes(key))));
        if (values.hp !== undefined && values.maxHp === undefined) enemy.maxHp = Math.max(enemy.maxHp, values.hp);
        return enemy.id;
      },
      damageEnemy: (id, amount) => { const enemy = game.enemies.find(entry => entry.id === id); if (enemy) damageEnemy(enemy, amount); updateUI(); },
      setWave: wave => { game.wave = Math.max(0, Math.floor(wave)); updateUI(); },
      summonDefs: Object.fromEntries(Object.entries(summonDefs).map(([type, def]) => [type, { ...def }])),
      path: PATH.map(point => ({ ...point }))
    };
  }

  reset(); fitCanvas(); syncOverlayAccess('startBtn'); raf = requestAnimationFrame(loop);
})();
