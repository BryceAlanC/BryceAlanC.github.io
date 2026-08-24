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
  const SUMMON_PAGE_SIZE = 4;
  const MAX_PROJECTILES = 240;
  const MAX_SPAWNS_PER_UPDATE = 96;
  const HEX_RADIUS = 215;
  const HEX_RADIUS_SQUARED = HEX_RADIUS * HEX_RADIUS;
  const HEX_DAMAGE_MULTIPLIER = .85;
  const RESERVES = [0, 100, 250, 500];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const ROUTE_ARROWS = [
    { x: 430, y: 195, a: 0 }, { x: 880, y: 195, a: 0 }, { x: 1320, y: 195, a: 0 },
    { x: 1450, y: 330, a: Math.PI / 2 }, { x: 1120, y: 450, a: Math.PI }, { x: 690, y: 450, a: Math.PI }, { x: 280, y: 450, a: Math.PI },
    { x: 150, y: 540, a: Math.PI / 2 }, { x: 430, y: 625, a: 0 }, { x: 850, y: 625, a: 0 }, { x: 1240, y: 625, a: 0 }
  ];
  let renderDetail = 2;
  let arenaBackdrop = null;
  let activeHexAuraDrawn = false;
  const compactDrawerMedia = matchMedia('(max-width: 900px), (pointer: coarse)');
  const $ = (id) => document.getElementById(id);
  const ui = {
    gold: $('gold'), income: $('income'), tickFill: $('tickFill'), wave: $('waveLabel'), timer: $('waveTimer'), threat: $('threatLabel'),
    level: $('level'), hpText: $('hpText'), hpFill: $('hpFill'), xpText: $('xpText'), xpFill: $('xpFill'),
    crystalText: $('crystalText'), crystalFill: $('crystalFill'), announce: $('announce'), note: $('floatNote'), live: $('liveRegion'),
    bossBar: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), bossProgress: $('bossProgress'),
    healthProgress: $('healthProgress'), xpProgress: $('xpProgress'), crystalProgress: $('crystalProgress'),
    rosterTotal: $('rosterTotal'), rosterWaveProgress: $('rosterWaveProgress'), drawerRosterTotal: $('drawerRosterTotal'),
    reserveBtn: $('reserveBtn'), allAutoOff: $('allAutoOff'), autoCount: $('autoCount'), summonFilters: $('summonFilters'),
    summonPageStatus: $('summonPageStatus'), summonPagePrev: $('summonPagePrev'), summonPageNext: $('summonPageNext'),
    summonList: $('summonList'), summonTemplate: $('summonCardTemplate'), summonDock: $('summonDock'),
    drawerToggle: $('summonDrawerToggle'), drawerLabel: $('drawerLabel'), drawerClose: $('summonDrawerClose'),
    purchaseHub: $('purchaseHub'), forgePanel: $('forgePanel'), forgeClose: $('forgeToggle')
  };

  const SUMMON_ROWS = [
    ['runner', 'Runner', 1, 30, 5, 1, 'runner', '', 24, 18, '#ff6577', 'Fast • fragile'],
    ['ash_mites', 'Ash Mite Brood', 1, 45, 7, 3, 'pack', '', 22, 20, '#ff8b6e', '3 bodies • swarms'],
    ['ramling', 'Ramling', 2, 60, 10, 1, 'runner', 'berserk', 22, 22, '#e95b54', 'Charges when wounded'],
    ['bulwark', 'Bulwark', 2, 75, 12, 1, 'guard', '', 20, 24, '#d66088', 'Armored • durable'],
    ['swarm', 'Skitter Pack', 1, 85, 14, 4, 'pack', '', 20, 26, '#ff8d78', '4 bodies • scatters'],
    ['rift_hound', 'Rift Hound', 2, 105, 17, 1, 'surge', '', 20, 28, '#d953a6', 'Bursts of speed'],
    ['hexer', 'Hexer', 3, 120, 20, 1, 'hexer', '', 18, 30, '#9e68d5', 'Weakens Warden damage'],
    ['ironjaw', 'Ironjaw', 3, 150, 24, 1, 'guard', 'berserk', 18, 32, '#b24c6f', 'Armor • enrages'],
    ['brute', 'Brute', 4, 180, 30, 1, 'brute', '', 18, 34, '#bf72df', 'Crushing bruiser'],
    ['plague_pod', 'Plague Pod', 4, 215, 34, 1, 'splitter', '', 16, 38, '#76bd82', 'Splits on death'],
    ['phantom', 'Phantom', 5, 245, 40, 1, 'surge', '', 16, 42, '#826be6', 'Speed surges'],
    ['sapper', 'Sapper', 5, 290, 46, 1, 'siege', '', 16, 45, '#e69a4f', 'Crystal hunter'],
    ['siege', 'Siege Beast', 6, 340, 56, 1, 'siege', '', 15, 48, '#cb5b4c', 'Ignores the hero'],
    ['crimson_leech', 'Crimson Leech', 6, 405, 63, 1, 'leech', '', 15, 52, '#cf486a', 'Heals on impact'],
    ['cinder_pack', 'Cinder Pack', 7, 480, 75, 5, 'pack', 'berserk', 15, 56, '#f1a248', '5 bodies • enrages'],
    ['hydra', 'Void Hydra', 8, 520, 86, 1, 'regen', '', 14, 60, '#7c59bd', 'Regenerates'],
    ['null_knight', 'Null Knight', 8, 625, 96, 1, 'guard', 'phase', 14, 64, '#4f6bbf', 'Armor • phases'],
    ['rift_stalker', 'Rift Stalker', 8, 750, 115, 1, 'surge', 'phase', 14, 68, '#5d83ec', 'Surges • phases'],
    ['bone_convoy', 'Bone Convoy', 9, 900, 135, 3, 'pack', 'siege', 14, 72, '#b88b63', '3 crystal hunters'],
    ['mire_colossus', 'Mire Colossus', 9, 1080, 165, 1, 'regen', '', 13, 78, '#668453', 'Massive regeneration'],
    ['shock_witch', 'Shock Witch', 10, 1300, 195, 1, 'hexer', 'surge', 13, 82, '#7f63e6', 'Weakens • surges'],
    ['dread_ram', 'Dread Ram', 10, 1560, 235, 1, 'siege', 'berserk', 13, 86, '#c77840', 'Siege • enrages'],
    ['mirror_fiend', 'Mirror Fiend', 11, 1875, 280, 1, 'phase', '', 13, 90, '#72d1db', 'Periodic damage ward'],
    ['war_brood', 'War Brood', 11, 2250, 330, 6, 'pack', 'berserk', 12, 94, '#ee5d89', '6 enraging bodies'],
    ['obsidian_guard', 'Obsidian Guard', 12, 2700, 395, 1, 'guard', 'phase', 12, 100, '#555f75', 'Heavy armor • phases'],
    ['carrion_oracle', 'Carrion Oracle', 12, 3250, 475, 1, 'commander', '', 12, 106, '#98b04d', 'Buffs nearby hostiles'],
    ['maw_engine', 'Maw Engine', 13, 3900, 565, 1, 'siege', 'regen', 12, 112, '#b75a37', 'Siege • regenerates'],
    ['starved_legion', 'Starved Legion', 13, 4680, 675, 8, 'pack', 'berserk', 12, 118, '#f06c52', '8 enraging bodies'],
    ['chrono_shade', 'Chrono Shade', 14, 5620, 805, 1, 'phase', 'hexer', 11, 124, '#7463cf', 'Phases • weakens'],
    ['blood_titan', 'Blood Titan', 14, 6750, 960, 1, 'leech', 'berserk', 11, 130, '#9c2848', 'Leeches • enrages'],
    ['storm_reaver', 'Storm Reaver', 15, 8100, 1150, 1, 'surge', 'berserk', 11, 136, '#3aa6c9', 'Surges • enrages'],
    ['bastion_walker', 'Bastion Walker', 15, 9720, 1350, 1, 'siege', 'phase', 11, 142, '#68707f', 'Siege • phases'],
    ['rift_choir', 'Rift Choir', 16, 11650, 1625, 5, 'pack', 'hexer', 10, 148, '#bc69df', '5-body weakening aura'],
    ['grave_leviathan', 'Grave Leviathan', 16, 14000, 1925, 1, 'regen', 'leech', 10, 154, '#4e8266', 'Regenerates • leeches'],
    ['glass_reaper', 'Glass Reaper', 17, 16800, 2300, 1, 'berserk', 'surge', 10, 160, '#f1d174', 'Extreme damage • fragile'],
    ['iron_eclipse', 'Iron Eclipse', 17, 20200, 2750, 1, 'guard', 'commander', 10, 168, '#3b435a', 'Armored commander'],
    ['crown_eater', 'Crown Eater', 18, 24250, 3300, 1, 'leech', 'phase', 10, 176, '#7b243d', 'Leeches • phases'],
    ['cataclysm_pack', 'Cataclysm Pack', 18, 29100, 3925, 10, 'pack', 'berserk', 10, 184, '#ff4f35', '10 enraging bodies'],
    ['abyss_regent', 'Abyss Regent', 19, 34900, 4675, 1, 'commander', 'hexer', 9, 192, '#64398f', 'Commander • weakens'],
    ['worldbreaker', 'Worldbreaker', 20, 41900, 5575, 1, 'titan', '', 9, 200, '#a7372e', 'Titanic crystal hunter'],
    ['paradox_hound', 'Paradox Hound', 21, 50300, 6650, 1, 'phase', 'surge', 9, 208, '#30c2bd', 'Phases • surges'],
    ['blight_cathedral', 'Blight Cathedral', 22, 60400, 7925, 1, 'commander', 'regen|hexer', 9, 216, '#5c8d38', 'Regenerating weakness aura'],
    ['meteor_herald', 'Meteor Herald', 23, 72500, 9450, 1, 'berserk', 'siege', 9, 224, '#ed8c2c', 'Enraged siege monster'],
    ['null_armada', 'Null Armada', 24, 87000, 11200, 6, 'pack', 'siege|phase', 8, 232, '#4c54a8', '6 phasing siege bodies'],
    ['oblivion_hydra', 'Oblivion Hydra', 25, 104500, 13400, 1, 'regen', 'berserk', 8, 240, '#57308c', 'Regenerates • enrages'],
    ['doomsday_engine', 'Doomsday Engine', 26, 125500, 16000, 1, 'titan', 'regen', 8, 252, '#852b20', 'Titanic siege engine'],
    ['time_devourer', 'Time Devourer', 27, 150500, 19100, 1, 'phase', 'hexer|surge', 8, 264, '#77d6f1', 'Phases • weakens • surges'],
    ['godslayer_host', 'Godslayer Host', 28, 180500, 22700, 8, 'pack', 'berserk|surge', 8, 276, '#d21e58', '8 apocalyptic bodies'],
    ['black_sun', 'Black Sun', 29, 216500, 27000, 1, 'titan', 'commander|hexer', 8, 288, '#332347', 'Titanic weakening commander'],
    ['endbringer', 'Endbringer', 30, 260000, 32200, 1, 'titan', 'commander|phase', 8, 300, '#ff2f69', 'The final bad decision']
  ];
  const BODY = {
    runner: { h: 1, d: 1, speed: 188, r: 16, armor: 0, xp: 1, points: 6, traits: [] },
    pack: { h: .30, d: .30, speed: 156, r: 12, armor: 0, xp: 1, points: 5, traits: [] },
    guard: { h: 2.15, d: 1.24, speed: 84, r: 27, armor: .22, xp: 1.15, points: 6, traits: [] },
    hexer: { h: .925, d: .72, speed: 108, r: 23, armor: 0, xp: 1, points: 8, traits: ['hexer'] },
    brute: { h: 2.23, d: 1.30, speed: 76, r: 39, armor: .12, xp: 1.38, points: 7, traits: [] },
    surge: { h: .93, d: .85, speed: 142, r: 28, armor: .06, xp: 1.24, points: 8, traits: ['surge'] },
    siege: { h: 2.01, d: 1.08, speed: 66, r: 46, armor: .16, xp: 1.40, points: 6, traits: ['siege'], crystalDamage: 1.55 },
    regen: { h: 2.17, d: .99, speed: 72, r: 54, armor: .18, xp: 1.55, points: 9, traits: ['regen'], regen: .015 },
    splitter: { h: 1.20, d: .90, speed: 112, r: 25, armor: .04, xp: 1, points: 7, traits: ['split'] },
    leech: { h: 1.55, d: 1.20, speed: 100, r: 31, armor: .10, xp: 1.10, points: 10, traits: ['leech'] },
    phase: { h: 1.10, d: 1.25, speed: 134, r: 25, armor: .08, xp: 1.10, points: 4, traits: ['phase'] },
    commander: { h: 1.85, d: 1.20, speed: 92, r: 38, armor: .15, xp: 1.30, points: 12, traits: ['commander'] },
    berserk: { h: 1.55, d: 1.65, speed: 112, r: 34, armor: .08, xp: 1.25, points: 7, traits: ['berserk'] },
    titan: { h: 4.20, d: 2.20, speed: 60, r: 60, armor: .28, xp: 2, points: 10, traits: ['siege', 'berserk', 'regen'], crystalDamage: 2.4, regen: .003 }
  };
  const LEGACY = {
    runner: { hp: 56, speed: 188, damage: 11, reward: 5, xp: 9, r: 16 },
    bulwark: { hp: 280, speed: 84, damage: 27, reward: 10, xp: 22, r: 27, armor: .22 },
    swarm: { hp: 42, speed: 156, damage: 7, reward: 3, xp: 5, r: 12 },
    hexer: { hp: 185, speed: 108, damage: 22, reward: 15, xp: 29, r: 23 },
    brute: { hp: 650, speed: 76, damage: 54, reward: 25, xp: 54, r: 39, armor: .12 },
    phantom: { hp: 360, speed: 142, damage: 44, reward: 33, xp: 62, r: 28, armor: .06 },
    siege: { hp: 1050, speed: 66, damage: 72, reward: 48, xp: 92, r: 46, armor: .16, crystalDamage: 1.55 },
    hydra: { hp: 1680, speed: 72, damage: 90, reward: 70, xp: 145, r: 54, armor: .18, regen: .015 }
  };
  const nice = number => Math.max(1, Math.round(number));
  function deriveSummon(row, index) {
    const [key, name, unlock, cost, income, count, body, extra, stockCap, restockSeconds, color, tag] = row;
    const base = BODY[body], power = cost / 30;
    const traits = [...new Set([...base.traits, ...extra.split('|').filter(Boolean)])];
    return {
      key, name, unlock, cost, income, count, body, tag, stockCap, restockSeconds, color,
      rank: index + 1, tier: Math.floor(index / 10) + 1,
      hp: nice(56 * power ** .92 * base.h), speed: base.speed,
      damage: nice(11 * power ** .74 * base.d), reward: nice(cost * (.13 - .0013 * index) / count),
      xp: nice(9 * power ** .82 * base.xp / count), r: Math.min(64, nice(base.r + Math.log2(power) * 1.2)),
      armor: base.armor, points: base.points, traits, regen: traits.includes('regen') ? (base.regen || .01) : 0,
      crystalDamage: traits.includes('siege') ? (base.crystalDamage || 1.65) : 1
    };
  }
  const summonDefs = Object.fromEntries(SUMMON_ROWS.map((row, index) => {
    const derived = deriveSummon(row, index);
    return [row[0], { ...derived, ...(LEGACY[row[0]] || {}) }];
  }));
  const summonOrder = Object.keys(summonDefs).sort((a, b) => summonDefs[a].cost - summonDefs[b].cost);
  const ambientDefs = [
    { key: 'drone', body: 'runner', unlockWave: 1, hp: 66, speed: 132, damage: 14, reward: 6, xp: 10, r: 16, color: '#de5267' },
    { key: 'raider', body: 'guard', unlockWave: 3, hp: 155, speed: 105, damage: 23, reward: 10, xp: 16, r: 22, armor: .06, color: '#a95572' },
    { key: 'dart', body: 'pack', unlockWave: 5, hp: 52, speed: 195, damage: 12, reward: 7, xp: 10, r: 12, color: '#ee7c69' },
    { key: 'warden', body: 'brute', unlockWave: 8, hp: 390, speed: 82, damage: 42, reward: 18, xp: 28, r: 29, armor: .18, color: '#b94f68' },
    { key: 'shade', body: 'phase', unlockWave: 12, hp: 245, speed: 144, damage: 35, reward: 15, xp: 24, r: 23, trait: 'surge', color: '#8d589c' }
  ];
  const itemBase = { edge: 85, plate: 100, boots: 125, lens: 150, focus: 175, seal: 220, multishot: 325, chain: 375, splash: 300, revive: 450, repair: 75 };
  const itemGrowth = { multishot: 1.95, chain: 1.92, splash: 1.92, revive: 1.9 };
  const itemLimits = { multishot: 10, chain: 10, splash: 10, revive: 12 };
  const itemNames = { edge: 'RUNE EDGE', plate: 'BASTION PLATE', boots: 'WINDSTEP', lens: 'SEEKER LENS', focus: 'CHRONO CORE', seal: 'CRYSTAL SEAL', multishot: 'SPLIT PRISM', chain: 'STORM COIL', splash: 'BLAST SIGIL', revive: 'GRAVE PACT', repair: 'MEND' };
  const itemKeys = ['edge', 'plate', 'boots', 'lens', 'focus', 'seal', 'multishot', 'chain', 'splash', 'revive'];
  const keys = {};
  const pointer = { stickX: 0, stickY: 0 };
  let audio = null;
  let soundOn = true;
  let last = performance.now();
  let raf = 0;
  let game;
  let activeSummonFilter = '1';
  let activeSummonSubpage = 0;
  let summonUiDirty = true;
  let lastSummonUi = -Infinity;
  const summonViews = new Map();
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

  function buildSummonCatalog() {
    if (!ui.summonList || !ui.summonTemplate) return;
    summonOrder.forEach(type => {
      const def = summonDefs[type];
      const fragment = ui.summonTemplate.content.cloneNode(true);
      const card = fragment.querySelector('.summon-card');
      card.dataset.summon = type;
      card.dataset.tier = String(def.tier);
      card.dataset.body = def.body;
      card.dataset.traits = def.traits.join(' ');
      const creature = card.querySelector('.creature');
      const shape = { runner: 'runner', pack: 'diamond', guard: 'bulwark', hexer: 'hexer', brute: 'brute', surge: 'phantom', siege: 'siege', regen: 'hydra', splitter: 'orb', leech: 'orb', phase: 'diamond', commander: 'crown', berserk: 'brute', titan: 'crown' }[def.body] || 'diamond';
      creature.dataset.shape = shape;
      creature.dataset.body = def.body;
      creature.style.setProperty('--creature-color', def.color);
      card.querySelector('.summon-name').textContent = def.name.toUpperCase();
      card.querySelector('.trait-line').textContent = `LV ${def.unlock} • ${def.tag}`;
      card.querySelector('.summon-cost').textContent = formatCompactNumber(def.cost);
      card.querySelector('.summon-income').textContent = `+${formatCompactNumber(def.income)} ↗`;
      const view = {
        card, buy: card.querySelector('.summon-buy'), auto: card.querySelector('.unit-auto'),
        owned: card.querySelector('.owned'), contracts: card.querySelector('.contract-count'),
        bodies: card.querySelector('.body-count'), stock: card.querySelector('.stock-count'),
        stockState: card.querySelector('.stock-state'), autoState: card.querySelector('.auto-state')
      };
      summonViews.set(type, view);
      ui.summonList.appendChild(fragment);
    });
    ui.summonFilters?.querySelectorAll('[data-tier]').forEach(button => {
      button.setAttribute('aria-controls', 'summonList');
    });
    setSummonFilter('1', false);
  }

  function markSummonUiDirty() { summonUiDirty = true; }

  function summonTypesForActiveFilter() {
    if (activeSummonFilter === 'auto') return summonOrder.filter(type => game?.autos?.[type]);
    return summonOrder.filter(type => String(summonDefs[type].tier) === activeSummonFilter);
  }

  function refreshSummonPage(resetScroll = true) {
    const candidates = summonTypesForActiveFilter();
    const pageCount = Math.max(1, Math.ceil(candidates.length / SUMMON_PAGE_SIZE));
    activeSummonSubpage = clamp(activeSummonSubpage, 0, pageCount - 1);
    const start = activeSummonSubpage * SUMMON_PAGE_SIZE;
    const visibleTypes = candidates.slice(start, start + SUMMON_PAGE_SIZE);
    const visible = new Set(visibleTypes);
    summonViews.forEach((view, type) => { view.card.hidden = !visible.has(type); });

    const pageNumber = activeSummonSubpage + 1;
    if (!visibleTypes.length) {
      ui.summonPageStatus.textContent = 'AUTO • NO ENABLED CONTRACTS';
    } else {
      const first = summonDefs[visibleTypes[0]], last = summonDefs[visibleTypes[visibleTypes.length - 1]];
      const section = activeSummonFilter === 'auto' ? `AUTO • ${candidates.length} ENABLED` : `TIER ${['I', 'II', 'III', 'IV', 'V'][Number(activeSummonFilter) - 1]}`;
      const range = activeSummonFilter === 'auto'
        ? (first === last ? first.name.toUpperCase() : `${first.name.toUpperCase()} → ${last.name.toUpperCase()}`)
        : `CONTRACTS ${first.rank}–${last.rank}`;
      ui.summonPageStatus.textContent = `${section} • PAGE ${pageNumber} OF ${pageCount} • ${range} • ${formatCompactNumber(first.cost)}–${formatCompactNumber(last.cost)} GOLD`;
    }
    ui.summonPagePrev.disabled = activeSummonSubpage === 0;
    ui.summonPageNext.disabled = activeSummonSubpage >= pageCount - 1;
    ui.summonPagePrev.setAttribute('aria-label', `Previous summon page. Page ${pageNumber} of ${pageCount}.`);
    ui.summonPageNext.setAttribute('aria-label', `Next summon page. Page ${pageNumber} of ${pageCount}.`);
    if (resetScroll && ui.summonList?.parentElement) ui.summonList.parentElement.scrollTop = 0;
    markSummonUiDirty();
  }

  function setSummonFilter(filter, moveFocus = true) {
    const requested = String(filter);
    activeSummonFilter = requested === 'auto' || ['1', '2', '3', '4', '5'].includes(requested) ? requested : '1';
    activeSummonSubpage = 0;
    ui.summonFilters?.querySelectorAll('[data-tier]').forEach(button => {
      const active = button.dataset.tier === activeSummonFilter;
      button.setAttribute('aria-pressed', String(active));
      button.toggleAttribute('aria-current', active && activeSummonFilter !== 'auto');
      if (active && moveFocus) {
        button.focus();
        button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });
    refreshSummonPage();
  }

  function turnSummonPage(offset) {
    activeSummonSubpage += offset;
    refreshSummonPage();
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
      autos: emptyAutos(), autoClock: 0, reserveIndex: 1, drawerOpen: false, marketPage: null,
      returnWaves: {}, returnQueued: 0, queueSequence: 0,
      boss: null, spawnId: 0, allyId: 0
    };
  }

  function reset() {
    game = initialState();
    last = performance.now();
    lastSummonUi = -Infinity;
    markSummonUiDirty();
    ui.reserveBtn.textContent = `RESERVE ${RESERVES[game.reserveIndex]}`;
    summonViews.forEach(view => {
      view.autoState.textContent = 'OFF';
      view.auto.setAttribute('aria-pressed', 'false');
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
    setPurchasePage(null, false);
    setSummonFilter('1', false);
    updateUI(true);
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
    if (game.marketPage) setPurchasePage(null, false);
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

  function setPurchasePage(page, moveFocus = true) {
    const valid = ['gear', 'relics', 'summons'].includes(page) ? page : null;
    const canOpen = game?.started && !game.paused && !game.over;
    const next = valid && canOpen ? valid : null;
    const previous = game?.marketPage || null;
    const wasHeld = Boolean(game?.drawerOpen);
    const focusWasInHub = ui.purchaseHub.contains(document.activeElement);
    const forgeOpen = next === 'gear' || next === 'relics';
    const summonOpen = next === 'summons';
    if (game) {
      game.marketPage = next;
      // Compact trays intentionally hold the siege so touch players can shop safely.
      game.drawerOpen = Boolean(next && compactDrawerMedia.matches);
    }
    ui.forgePanel.hidden = !forgeOpen;
    ui.summonDock.hidden = !summonOpen;
    ui.forgePanel.inert = !forgeOpen;
    ui.summonDock.inert = !summonOpen;
    ui.forgePanel.toggleAttribute('aria-hidden', !forgeOpen);
    ui.summonDock.toggleAttribute('aria-hidden', !summonOpen);
    ui.summonDock.classList.toggle('drawer-open', summonOpen);
    ui.summonDock.classList.toggle('drawer-closed', !summonOpen);
    $('gearItems').hidden = next !== 'gear';
    $('relicItems').hidden = next !== 'relics';
    $('forgePanel').classList.toggle('showing-relics', next === 'relics');
    if (forgeOpen) $('forgePageTitle').textContent = `WARDEN'S FORGE • ${next.toUpperCase()}${game.drawerOpen ? ' • BATTLE HELD' : ''}`;
    $('summonTitle').textContent = summonOpen && game.drawerOpen ? 'SUMMON HOSTILES • BATTLE HELD' : 'SUMMON HOSTILES';
    if (game.drawerOpen) ui.live.textContent = `${next} purchase tray open. Battle and timers held until it closes.`;
    else if (wasHeld && game.started && !game.paused && !game.over) ui.live.textContent = 'Purchase tray closed. Battle and timers resumed.';

    const tabs = [
      [$('forgeGearTab'), 'gear'], [$('forgeRelicTab'), 'relics'], [ui.drawerToggle, 'summons']
    ];
    tabs.forEach(([tab, tabPage], index) => {
      const active = next === tabPage;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('aria-expanded', String(active));
      tab.tabIndex = active || (!next && index === 0) ? 0 : -1;
    });
    ui.drawerLabel.textContent = 'SUMMONS';
    ui.drawerToggle.setAttribute('aria-label', summonOpen ? 'Close summon contracts' : 'Open summon contracts');
    if (next) updateUI(true);
    if (moveFocus && next === 'summons') requestAnimationFrame(() => ui.drawerClose.focus());
    else if (moveFocus && forgeOpen) requestAnimationFrame(() => ui.forgeClose.focus());
    else if (moveFocus && !next && (previous || focusWasInHub)) {
      const returnTab = previous === 'relics' ? $('forgeRelicTab') : previous === 'summons' ? ui.drawerToggle : $('forgeGearTab');
      requestAnimationFrame(() => returnTab.focus());
    }
  }

  function setSummonDrawer(open, moveFocus = true) {
    setPurchasePage(open ? 'summons' : null, moveFocus);
  }

  function setForgePage(page, moveFocus = true) {
    setPurchasePage(page === 'relics' ? 'relics' : 'gear', moveFocus);
  }

  function togglePurchasePage(page) {
    setPurchasePage(game.marketPage === page ? null : page);
  }

  function closeDrawerForInterruption() {
    if (game.marketPage) setPurchasePage(null, false);
    Object.keys(keys).forEach(key => { keys[key] = false; });
    pointer.stickX = pointer.stickY = 0;
    const knob = $('stickKnob');
    if (knob) knob.style.transform = '';
    last = performance.now();
  }

  function spawnEntryBefore(a, b) {
    if (a.due !== b.due) return a.due < b.due;
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.sequence < b.sequence;
  }

  function heapPush(entry) {
    const heap = game.spawnQueue;
    heap.push(entry);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!spawnEntryBefore(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  }

  function heapPop() {
    const heap = game.spawnQueue;
    if (!heap.length) return null;
    const first = heap[0], lastEntry = heap.pop();
    if (heap.length) {
      heap[0] = lastEntry;
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        let next = index;
        if (left < heap.length && spawnEntryBefore(heap[left], heap[next])) next = left;
        if (right < heap.length && spawnEntryBefore(heap[right], heap[next])) next = right;
        if (next === index) break;
        [heap[index], heap[next]] = [heap[next], heap[index]];
        index = next;
      }
    }
    return first;
  }

  function queueSpawn(def, options = {}) {
    const source = options.source || 'ambient';
    const entry = {
      def, due: options.due ?? game.time, playerMade: Boolean(options.playerMade), boss: Boolean(options.boss),
      type: options.type || def.key || 'ambient', wave: options.wave || game.wave, source,
      priority: options.priority ?? def.rank ?? 0, sequence: ++game.queueSequence
    };
    if (source === 'roster-return') game.returnQueued++;
    heapPush(entry);
    return entry;
  }

  function hasTrait(entity, trait) { return entity.traits?.includes(trait) || entity.trait === trait; }

  function hasNearbyHexer(hero) {
    for (const enemy of game.enemies) {
      if (!hasTrait(enemy, 'hexer')) continue;
      const dx = enemy.x - hero.x, dy = enemy.y - hero.y;
      if (dx * dx + dy * dy < HEX_RADIUS_SQUARED) return true;
    }
    return false;
  }

  function wardenDamage(multiplier = 1) {
    return game.hero.damage * multiplier * (game.hero.hexed ? HEX_DAMAGE_MULTIPLIER : 1);
  }

  function spawnEnemy(def, options = {}) {
    const playerMade = Boolean(options.playerMade), boss = Boolean(options.boss);
    const waveIndex = Math.max(0, options.wave - 1);
    const late = Math.max(0, (options.wave || 1) - 8);
    const ambientLate = Math.max(0, (options.wave || 1) - 6);
    const deepSiege = Math.max(0, (options.wave || 1) - 16);
    const hpScale = boss ? 1 : playerMade
      ? 1 + waveIndex * .024 + late * late * .0032
      : 1 + waveIndex * .04 + ambientLate * ambientLate * .008 + deepSiege * deepSiege * .0025;
    const damageScale = boss ? 1 : playerMade
      ? 1 + waveIndex * .016 + late * late * .0022
      : 1 + waveIndex * .024 + ambientLate * ambientLate * .004 + deepSiege * deepSiege * .001;
    const ambientBountyScale = 1 / (1 + waveIndex * .035 + deepSiege * .035);
    const traits = [...new Set([...(def.traits || []), ...(def.trait ? [def.trait] : [])])];
    const enemy = {
      id: ++game.spawnId, x: PATH[0].x, y: PATH[0].y, pathIndex: 1, type: options.type || def.key || 'ambient',
      r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale, speed: def.speed,
      damage: def.damage * damageScale,
      reward: boss || playerMade ? def.reward : Math.max(1, Math.round(def.reward * ambientBountyScale)),
      xp: def.xp, armor: def.armor || 0,
      traits, body: def.body || (boss ? 'titan' : 'runner'), regen: def.regen || 0, crystalDamage: def.crystalDamage || 1, points: def.points || 6,
      color: def.color, playerMade, boss, attackCd: 0, leechCd: 0, slow: 0, slowTimer: 0,
      hit: 0, phase: Math.random() * 6.28, source: options.source || 'ambient', originWave: options.wave || game.wave,
      spawnSequence: options.sequence || 0
    };
    enemy.x -= enemy.id % 4 * 5;
    enemy.y += (enemy.id % 9 - 4) * 4;
    game.enemies.push(enemy);
    return enemy;
  }

  function processSpawnQueue() {
    if (!game.spawnQueue.length) return;
    let spawned = 0;
    while (game.spawnQueue.length && game.spawnQueue[0].due <= game.time && spawned < MAX_SPAWNS_PER_UPDATE) {
      const entry = heapPop();
      const enemy = spawnEnemy(entry.def, entry);
      if (entry.source === 'roster-return') {
        game.returnQueued = Math.max(0, game.returnQueued - 1);
        const progress = game.returnWaves[entry.wave];
        if (progress) progress.deployed++;
        markSummonUiDirty();
      }
      if (entry.boss) activateBoss(enemy, entry.wave);
      spawned++;
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

  function ambientWaveCount(wave) {
    const late = Math.max(0, wave - 6);
    const deepSiege = Math.max(0, wave - 14);
    return Math.min(420,
      3 + Math.floor(wave * .82)
      + Math.floor(Math.pow(late, 1.45) * .42)
      + Math.floor(Math.pow(deepSiege, 1.68) * .28)
    );
  }

  function startWave() {
    game.wave++;
    const wave = game.wave;
    const ambientCount = ambientWaveCount(wave);
    const ambientSpread = Math.min(16, 5 + ambientCount * .16);
    for (let i = 0; i < ambientCount; i++) {
      queueSpawn(chooseAmbient(wave), { due: game.time + .15 + i * ambientSpread / Math.max(1, ambientCount - 1), wave, source: 'ambient' });
    }

    const returning = Object.entries(game.roster)
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => summonDefs[b].rank - summonDefs[a].rank)
      .flatMap(([type, count]) => Array.from({ length: count }, () => type));
    game.returnWaves[wave] = { expected: returning.length, deployed: 0 };
    Object.keys(game.returnWaves).forEach(oldWave => {
      if (Number(oldWave) < wave - 4 && game.returnWaves[oldWave].deployed >= game.returnWaves[oldWave].expected) delete game.returnWaves[oldWave];
    });
    const rosterSpread = Math.min(WAVE_SECONDS - 4, Math.max(2, returning.length * .12));
    returning.forEach((type, i) => {
      queueSpawn(summonDefs[type], {
        due: game.time + .65 + i * rosterSpread / Math.max(1, returning.length - 1),
        playerMade: true, type, wave, source: 'roster-return', priority: summonDefs[type].rank
      });
    });

    if (wave % 5 === 0) queueSpawn(bossDefinition(wave), { due: game.time + Math.min(11, ambientSpread * .8), boss: true, wave, source: 'boss', priority: 1000 });
    const rosterCopy = returning.length ? ` • ${returning.length} roster return${returning.length === 1 ? '' : 's'}` : '';
    announce(`WAVE ${wave}`, `${ambientCount} ambient signatures${rosterCopy}`);
    ui.live.textContent = `Wave ${wave}. ${ambientCount} ambient enemies and all ${returning.length} permanent roster bodies scheduled, strongest first.`;
    markSummonUiDirty();
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
      queueSpawn(def, { due: game.time + i * .18, playerMade: true, type, wave: Math.max(1, game.wave), source: 'purchase', priority: def.rank });
    }
    markSummonUiDirty();
    if (!automatic) {
      note(`${def.name.toUpperCase()} CONTRACT • +${def.income} INCOME ONCE`);
      ui.live.textContent = `${def.name} purchased. One stock used; ${game.stock[type]} of ${def.stockCap} remain. ${def.count} ${def.count === 1 ? 'body joined' : 'bodies joined'} the permanent roster. Income increased once by ${def.income}.`;
      tone(190, .08, 'square', .035);
      setTimeout(() => tone(280, .1, 'square', .025), 80);
    }
    updateUI(true);
    return true;
  }

  function activeThreat() {
    return game.enemies.reduce((sum, enemy) => sum + Math.sqrt(enemy.hp / 115), 0) + Math.sqrt(game.spawnQueue.length) * 1.8;
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
        markSummonUiDirty();
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
    const button = document.querySelector(`.summon-card[data-summon="${type}"] .unit-auto`);
    const restoreAutoFocus = activeSummonFilter === 'auto' && !enabled && document.activeElement === button;
    game.autos[type] = Boolean(enabled);
    button?.setAttribute('aria-pressed', String(game.autos[type]));
    if (announceChange) ui.live.textContent = `${def.name} continuous Auto ${game.autos[type] ? 'enabled' : 'disabled'}.`;
    if (activeSummonFilter === 'auto') refreshSummonPage();
    if (restoreAutoFocus) requestAnimationFrame(() => {
      const nextAuto = ui.summonList.querySelector('.summon-card:not([hidden]) .unit-auto:not(:disabled)');
      (nextAuto || ui.summonFilters.querySelector('[data-tier="auto"]'))?.focus();
    });
    markSummonUiDirty();
    updateUI(true);
    return true;
  }

  function disableAllAutos() {
    Object.keys(game.autos).forEach(type => { game.autos[type] = false; });
    ui.live.textContent = 'All continuous unit Autos disabled.';
    if (activeSummonFilter === 'auto') refreshSummonPage();
    markSummonUiDirty();
    updateUI(true);
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
    if (type === 'multishot') {
      const shots = 1 + Math.min(rank, 6);
      const forkDamage = Math.round((.55 + Math.max(0, rank - 6) * .04) * 100);
      return `up to ${shots} distinct shots${rank > 6 ? ` • forks deal ${forkDamage}%` : ''}`;
    }
    if (type === 'chain') {
      const bounces = Math.min(rank, 6);
      const carry = Math.round((.62 + Math.max(0, rank - 6) * .03) * 100);
      return `${bounces} bounce${bounces === 1 ? '' : 's'} • ${carry}% carry`;
    }
    if (type === 'splash') {
      const advanced = Math.max(0, rank - 4);
      const radius = 44 + Math.min(rank, 4) * 9 + advanced * 6;
      const damage = .16 + Math.min(rank, 4) * .055 + advanced * .035;
      return `first hit: ${radius}r • ${Math.round(damage * 100)}% to ${2 + Math.min(rank, 6)} foes`;
    }
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
    markSummonUiDirty();
    updateUI(true);
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
        if (pointLineDistance(enemy.x, enemy.y, sx, sy, hero.x, hero.y) < enemy.r + 25) damageEnemy(enemy, wardenDamage(1.85));
      });
      addSlash({ x1: sx, y1: sy, x2: hero.x, y2: hero.y, life: .28, max: .28, color: '#70e7df', kind: 'dash' });
      game.shake = 4; tone(210, .12, 'sawtooth', .045);
    } else if (name === 'nova') {
      [...game.enemies].forEach(enemy => {
        const distance = dist(hero, enemy);
        if (distance < 225 + enemy.r) {
          damageEnemy(enemy, wardenDamage(2.1));
          if (enemy.hp > 0) { enemy.slow = .45; enemy.slowTimer = 3; }
        }
      });
      addSlash({ x: hero.x, y: hero.y, radius: 20, maxRadius: 240, life: .55, max: .55, ring: true, color: '#b48cff', kind: 'nova' });
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
    entity.facing = Math.atan2(dy, dx);
    entity.x += dx / distance * amount;
    entity.y += dy / distance * amount;
    return distance;
  }

  function addProjectile(projectile) {
    if (game.projectiles.length >= MAX_PROJECTILES) return false;
    game.projectiles.push(projectile);
    return true;
  }

  function addSlash(effect) {
    game.slashes.push(effect);
    if (game.slashes.length > 140) game.slashes.splice(0, game.slashes.length - 140);
  }

  function fireWardenProjectile(target, index, shotCount) {
    const hero = game.hero;
    const dx = target.x - hero.x, dy = target.y - hero.y, magnitude = Math.hypot(dx, dy) || 1;
    const aimX = dx / magnitude, aimY = dy / magnitude;
    const critical = Math.random() < hero.crit;
    const side = (index - (shotCount - 1) / 2) * 7;
    const forkDamage = .55 + Math.max(0, game.items.multishot - 6) * .04;
    const chainCarry = .62 + Math.max(0, game.items.chain - 6) * .03;
    addProjectile({
      x: hero.x + aimX * 26 - aimY * side, y: hero.y + aimY * 26 + aimX * side, target, speed: 760,
      damage: wardenDamage((index ? forkDamage : 1) * (critical ? 2 : 1)), color: critical ? '#ffd269' : '#8ffff4', r: critical ? 7 : 5,
      critical, wardenShot: true, chainLeft: Math.min(game.items.chain, 6), chainCarry, chainRange: 150 + game.items.chain * 12,
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

  function nearestSplashTargets(x, y, radius, limit, excluded) {
    const targets = [], distances = [];
    game.enemies.forEach(enemy => {
      if (enemy === excluded) return;
      const distance = Math.hypot(enemy.x - x, enemy.y - y);
      if (distance > radius + enemy.r) return;
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
      const advanced = Math.max(0, projectile.splashRank - 4);
      const radius = 44 + Math.min(projectile.splashRank, 4) * 9 + advanced * 6;
      const splashDamage = projectile.damage * (.16 + Math.min(projectile.splashRank, 4) * .055 + advanced * .035);
      nearestSplashTargets(impactX, impactY, radius, 2 + Math.min(projectile.splashRank, 6), target)
        .forEach(enemy => damageEnemy(enemy, splashDamage));
      addSlash({ x: impactX, y: impactY, radius: 8, maxRadius: radius, life: .24, max: .24, ring: true, color: '#ff8fcb', kind: 'splash' });
    }

    if (projectile.wardenShot && projectile.chainLeft > 0) {
      projectile.x = impactX; projectile.y = impactY;
      const nextTarget = projectileTarget(projectile, projectile.chainRange, true);
      if (nextTarget) {
        addSlash({ x1: impactX, y1: impactY, x2: nextTarget.x, y2: nextTarget.y, life: .16, max: .16, color: '#ffd269', kind: 'chain' });
        projectile.target = nextTarget;
        projectile.damage *= projectile.chainCarry || .62;
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
      id: ++game.allyId, x: enemy.x, y: enemy.y, r: clamp(enemy.r * .82, 11, 31), type: enemy.type, body: enemy.body,
      hp: maxHp, maxHp, speed: clamp(enemy.speed * 1.05, 105, 195),
      damage: Math.min(game.hero.damage * .52, (clamp(enemy.damage * .28, 12, 70) + game.hero.damage * .06) * (1 + (rank - 1) * .1)),
      attackCd: .2, attackRate: Math.max(.58, .86 - rank * .035), hit: 0, phase: Math.random() * Math.PI * 2,
      color: enemy.color
    });
    addSlash({ x: enemy.x, y: enemy.y, radius: 8, maxRadius: 42, life: .32, max: .32, ring: true, color: '#79efae', kind: 'raise' });
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
      addSlash({ x1: ally.x, y1: ally.y, x2: target.x, y2: target.y, life: .16, max: .16, color: '#79efae', kind: 'revenant' });
    }
  }

  function commanderGrid(enemies) {
    const grid = new Map();
    enemies.forEach(enemy => {
      if (!hasTrait(enemy, 'commander')) return;
      const key = `${Math.floor(enemy.x / 200)},${Math.floor(enemy.y / 200)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(enemy);
    });
    return grid;
  }

  function isCommanded(enemy, grid) {
    if (hasTrait(enemy, 'commander')) return false;
    const gx = Math.floor(enemy.x / 200), gy = Math.floor(enemy.y / 200);
    for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) {
      if (grid.get(`${x},${y}`)?.some(commander => dist(enemy, commander) <= 200)) return true;
    }
    return false;
  }

  function updateEnemy(enemy, dt, commanders) {
    const hero = game.hero;
    enemy.attackCd -= dt;
    enemy.leechCd = Math.max(0, enemy.leechCd - dt);
    enemy.hit = Math.max(0, enemy.hit - dt * 5);
    enemy.phase += dt * 3;
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt; else enemy.slow = 0;
    if (enemy.regen) enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * enemy.regen * dt);
    const enraged = hasTrait(enemy, 'berserk') && enemy.hp <= enemy.maxHp * .5;
    const commanded = isCommanded(enemy, commanders);

    const heroDistance = dist(enemy, hero);
    let allyTarget = null, allyDistance = Infinity;
    if (!hasTrait(enemy, 'siege')) game.allies.forEach(ally => {
      const distance = dist(enemy, ally);
      if (distance < allyDistance) { allyDistance = distance; allyTarget = ally; }
    });
    const chasesAlly = Boolean(allyTarget && allyDistance < enemy.r + allyTarget.r + 105);
    const chasesHero = !chasesAlly && !hasTrait(enemy, 'siege') && heroDistance < enemy.r + hero.r + 92;
    let target = null;
    if (chasesAlly) target = allyTarget;
    else if (chasesHero) target = hero;
    else if (enemy.pathIndex < PATH.length) target = PATH[enemy.pathIndex];
    else target = game.crystal;

    const targetDistance = dist(enemy, target);
    const contact = enemy.r + (target.r || 8) + 4;
    if (targetDistance > contact) {
      let speedFactor = (1 - enemy.slow) * (enraged ? 1.25 : 1) * (commanded ? 1.15 : 1);
      if (hasTrait(enemy, 'surge') && Math.sin(enemy.phase * .48) > .55) speedFactor *= 1.75;
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
    const attackDamage = enemy.damage * (enraged ? 1.5 : 1) * (commanded ? 1.2 : 1);
    let landed = false;
    if (target === allyTarget) {
      damageAlly(allyTarget, attackDamage);
      landed = true;
    } else if (target === hero) {
      if (hero.invuln <= 0) {
        hero.hp -= attackDamage;
        hero.invuln = .24;
        burst(hero.x, hero.y, '#ff6577', 6);
        landed = true;
      }
    } else {
      game.crystal.hp -= attackDamage * enemy.crystalDamage;
      game.crystal.pulse = 1;
      game.shake = Math.max(game.shake, enemy.boss ? 12 : 4);
      burst(game.crystal.x - 20, game.crystal.y, '#ff6577', 8);
      landed = true;
    }
    if (landed && hasTrait(enemy, 'leech') && enemy.leechCd <= 0) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * .07);
      enemy.leechCd = 1;
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

    hero.hexed = hasNearbyHexer(hero);
    const moveSpeed = hero.speed;
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
      const targets = nearestWardenTargets(1 + Math.min(game.items.multishot, 6));
      const target = targets[0] || null;
      if (target) {
        hero.attackCd = hero.attackRate;
        const dx = target.x - hero.x, dy = target.y - hero.y, magnitude = Math.hypot(dx, dy) || 1;
        hero.aimX = dx / magnitude; hero.aimY = dy / magnitude;
        const shotCount = Math.min(1 + Math.min(game.items.multishot, 6), targets.length);
        for (let i = 0; i < shotCount; i++) fireWardenProjectile(targets[i], i, shotCount);
        tone(330 + Math.random() * 50, .04, 'square', .018);
      } else hero.targetScanCd = .08;
    }

    for (let i = game.allies.length - 1; i >= 0; i--) updateAlly(game.allies[i], dt);
    const commanders = commanderGrid(game.enemies);
    for (let i = game.enemies.length - 1; i >= 0; i--) updateEnemy(game.enemies[i], dt, commanders);

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
    const phasing = hasTrait(enemy, 'phase') && (game.time + enemy.id * .17) % 4 < 1.25;
    enemy.hp -= amount * (1 - enemy.armor) * (phasing ? .45 : 1);
    enemy.hit = 1;
    burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 6 : 3);
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function splitEnemy(enemy) {
    if (!hasTrait(enemy, 'split')) return;
    for (let i = 0; i < 2; i++) {
      const fragment = {
        id: ++game.spawnId, x: enemy.x + (i ? 9 : -9), y: enemy.y + (i ? -7 : 7), pathIndex: enemy.pathIndex,
        type: `${enemy.type}_fragment`, body: enemy.body || 'splitter', r: Math.max(8, enemy.r * .65), hp: enemy.maxHp * .22, maxHp: enemy.maxHp * .22,
        speed: enemy.speed * 1.15, damage: enemy.damage * .22, reward: 0, xp: 0, armor: 0,
        traits: enemy.traits.filter(trait => trait !== 'split'), regen: 0, crystalDamage: enemy.crystalDamage,
        points: 5, color: enemy.color, playerMade: enemy.playerMade, boss: false, attackCd: .4, leechCd: 0,
        slow: 0, slowTimer: 0, hit: 0, phase: enemy.phase + i, source: 'split', originWave: enemy.originWave
      };
      game.enemies.push(fragment);
    }
  }

  function killEnemy(enemy) {
    const index = game.enemies.indexOf(enemy);
    if (index < 0) return;
    game.enemies.splice(index, 1);
    splitEnemy(enemy);
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
      markSummonUiDirty();
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
    const entityCount = game.enemies.length + game.allies.length;
    renderDetail = entityCount > 650 ? -1 : entityCount > 220 ? 0 : entityCount > 90 ? 1 : 2;
    activeHexAuraDrawn = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#050b11'; ctx.fillRect(0, 0, width, height);
    const shakeX = reducedMotion ? 0 : (Math.random() - .5) * game.shake * scale;
    const shakeY = reducedMotion ? 0 : (Math.random() - .5) * game.shake * scale;
    ctx.save(); ctx.translate(ox + shakeX, oy + shakeY); ctx.scale(scale, scale);
    drawIllustratedArena();
    game.slashes.forEach(drawIllustratedSlash);
    game.sentinels.forEach(drawIllustratedSentinel);
    game.allies.forEach(drawIllustratedAlly);
    game.enemies.forEach(drawIllustratedEnemy);
    drawIllustratedCrystal(); drawIllustratedHero();
    game.projectiles.forEach(drawIllustratedProjectile);
    game.particles.forEach(drawIllustratedParticle);
    drawBattlefieldTint();
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
    return enemy.points || 6;
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
    if (hasTrait(enemy, 'phase') && (game.time + enemy.id * .17) % 4 < 1.25) { ctx.strokeStyle = '#70e7df'; ctx.lineWidth = 2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(0, 0, enemy.r + 10, 0, Math.PI * 2); ctx.stroke(); }
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

  // The illustrated renderer keeps its static world in one offscreen layer. Late-game
  // roster floods can therefore spend their frame budget on readable silhouettes.
  function seededUnit(index, salt = 0) {
    const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function tracePathOn(target) {
    target.beginPath();
    PATH.forEach((point, index) => { if (index) target.lineTo(point.x, point.y); else target.moveTo(point.x, point.y); });
  }

  function drawFloorGlyph(target, x, y, radius, rotation, color) {
    target.save(); target.translate(x, y); target.rotate(rotation); target.strokeStyle = color; target.lineWidth = 2;
    target.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU, px = Math.cos(angle) * radius, py = Math.sin(angle) * radius;
      if (i) target.lineTo(px, py); else target.moveTo(px, py);
    }
    target.closePath(); target.stroke();
    target.beginPath(); target.moveTo(-radius * .55, 0); target.lineTo(radius * .55, 0);
    target.moveTo(0, -radius * .55); target.lineTo(0, radius * .55); target.stroke(); target.restore();
  }

  function drawPropCrystal(target, x, y, scale, color) {
    target.save(); target.translate(x, y); target.scale(scale, scale);
    target.fillStyle = 'rgba(0,0,0,.34)'; target.beginPath(); target.ellipse(0, 14, 22, 8, 0, 0, TAU); target.fill();
    target.fillStyle = '#102632'; target.beginPath(); target.moveTo(-20, 12); target.lineTo(-9, -7); target.lineTo(6, 10); target.lineTo(17, -4); target.lineTo(24, 14); target.closePath(); target.fill();
    target.fillStyle = color; target.beginPath(); target.moveTo(-10, 7); target.lineTo(-5, -28); target.lineTo(3, -7); target.lineTo(8, 10); target.closePath(); target.fill();
    target.globalAlpha = .62; target.beginPath(); target.moveTo(6, 9); target.lineTo(13, -18); target.lineTo(20, 11); target.closePath(); target.fill();
    target.globalAlpha = .38; target.fillStyle = '#fff'; target.beginPath(); target.moveTo(-4, -23); target.lineTo(-2, -5); target.lineTo(2, -8); target.closePath(); target.fill(); target.restore();
  }

  function buildArenaBackdrop() {
    const layer = document.createElement('canvas'); layer.width = WORLD.w; layer.height = WORLD.h;
    const target = layer.getContext('2d');
    if (!target) return null;
    const base = target.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    base.addColorStop(0, '#08131c'); base.addColorStop(.48, '#102433'); base.addColorStop(1, '#07121b');
    target.fillStyle = base; target.fillRect(0, 0, WORLD.w, WORLD.h);

    const bloomA = target.createRadialGradient(1230, 165, 20, 1230, 165, 520);
    bloomA.addColorStop(0, 'rgba(62,122,139,.18)'); bloomA.addColorStop(1, 'rgba(2,9,14,0)');
    target.fillStyle = bloomA; target.fillRect(650, 0, 950, 650);
    const bloomB = target.createRadialGradient(320, 760, 20, 320, 760, 470);
    bloomB.addColorStop(0, 'rgba(84,52,112,.14)'); bloomB.addColorStop(1, 'rgba(2,9,14,0)');
    target.fillStyle = bloomB; target.fillRect(0, 300, 850, 600);

    for (let y = -12, row = 0; y < WORLD.h; y += 74, row++) {
      for (let x = -18, column = 0; x < WORLD.w; x += 78, column++) {
        const index = row * 24 + column, inset = 3 + seededUnit(index, 1) * 3;
        target.fillStyle = seededUnit(index, 2) > .5 ? 'rgba(29,58,69,.22)' : 'rgba(4,15,23,.2)';
        target.fillRect(x + inset, y + inset, 74 - inset * 2, 70 - inset * 2);
        target.strokeStyle = 'rgba(117,197,200,.045)'; target.strokeRect(x + inset, y + inset, 74 - inset * 2, 70 - inset * 2);
        if (seededUnit(index, 4) > .79) {
          const cx = x + 18 + seededUnit(index, 5) * 35, cy = y + 18 + seededUnit(index, 6) * 30;
          target.strokeStyle = 'rgba(111,194,200,.08)'; target.beginPath(); target.moveTo(cx - 9, cy - 6); target.lineTo(cx, cy); target.lineTo(cx - 5, cy + 12); target.stroke();
        }
      }
    }

    target.lineCap = 'round'; target.lineJoin = 'round';
    target.strokeStyle = 'rgba(1,5,9,.94)'; target.lineWidth = 86; tracePathOn(target); target.stroke();
    target.strokeStyle = '#183743'; target.lineWidth = 72; tracePathOn(target); target.stroke();
    target.strokeStyle = '#07131c'; target.lineWidth = 60; tracePathOn(target); target.stroke();
    target.strokeStyle = 'rgba(108,227,218,.16)'; target.lineWidth = 54; tracePathOn(target); target.stroke();
    target.strokeStyle = '#091821'; target.lineWidth = 47; tracePathOn(target); target.stroke();
    target.strokeStyle = 'rgba(139,246,236,.11)'; target.lineWidth = 2; target.setLineDash([15, 21]); tracePathOn(target); target.stroke(); target.setLineDash([]);

    for (let i = 0; i < ROUTE_ARROWS.length; i += 2) drawFloorGlyph(target, ROUTE_ARROWS[i].x, ROUTE_ARROWS[i].y, 18, ROUTE_ARROWS[i].a, 'rgba(112,231,223,.085)');
    drawFloorGlyph(target, 1470, 625, 112, Math.PI / 6, 'rgba(112,231,223,.18)');
    drawFloorGlyph(target, 1470, 625, 82, 0, 'rgba(112,231,223,.13)');
    drawFloorGlyph(target, 45, 195, 70, Math.PI / 6, 'rgba(255,101,119,.18)');

    const props = [
      [360, 326, .85, '#5cb8c5'], [575, 755, 1.05, '#8b68c2'], [1010, 328, .7, '#5eb2bd'],
      [1195, 755, .88, '#4b8fa7'], [1525, 92, 1.15, '#875fa5'], [72, 765, .75, '#4c91a3'],
      [1280, 350, .55, '#b26ca5'], [765, 78, .8, '#4c91a3']
    ];
    props.forEach(prop => drawPropCrystal(target, ...prop));

    target.fillStyle = 'rgba(112,231,223,.035)'; target.fillRect(1322, 535, 264, 182);
    target.strokeStyle = 'rgba(112,231,223,.22)'; target.lineWidth = 2; target.strokeRect(1322, 535, 264, 182);
    target.fillStyle = 'rgba(255,101,119,.05)'; target.fillRect(0, 118, 112, 154);
    target.strokeStyle = 'rgba(255,101,119,.25)'; target.strokeRect(0, 118, 112, 154);
    target.fillStyle = 'rgba(255,147,158,.72)'; target.font = '800 12px ui-sans-serif,system-ui,sans-serif'; target.fillText('BREACH', 22, 145);
    target.fillStyle = 'rgba(147,244,237,.58)'; target.fillText('SANCTUM', 1410, 704);
    return layer;
  }

  function drawRouteFlow() {
    const phase = reducedMotion ? 0 : game.time * 1.8;
    ROUTE_ARROWS.forEach((arrow, index) => {
      const pulse = .26 + Math.max(0, Math.sin(phase - index * .62)) * .34;
      ctx.save(); ctx.translate(arrow.x, arrow.y); ctx.rotate(arrow.a); ctx.globalAlpha = pulse;
      ctx.fillStyle = '#7ff8ef'; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-8, -9); ctx.lineTo(-2, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
      ctx.globalAlpha *= .45; ctx.translate(-18, 0); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-1, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }

  function drawPortal() {
    const pulse = reducedMotion ? 0 : Math.sin(game.time * 3.4) * 4;
    ctx.save(); ctx.translate(PATH[0].x, PATH[0].y); ctx.rotate(reducedMotion ? 0 : -game.time * .22);
    ctx.strokeStyle = 'rgba(255,76,106,.28)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, 48 + pulse, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,158,121,.7)'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(42, 0); ctx.lineTo(66, -7); ctx.lineTo(59, 8); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
  }

  function drawIllustratedArena() {
    if (!arenaBackdrop) arenaBackdrop = buildArenaBackdrop();
    if (arenaBackdrop) ctx.drawImage(arenaBackdrop, 0, 0);
    else { ctx.fillStyle = '#08131c'; ctx.fillRect(0, 0, WORLD.w, WORLD.h); }
    drawRouteFlow(); drawPortal();
  }

  function drawPolygon(points) {
    ctx.beginPath();
    points.forEach((point, index) => { if (index) ctx.lineTo(point[0], point[1]); else ctx.moveTo(point[0], point[1]); });
    ctx.closePath();
  }

  function creatureBody(entity) {
    return entity.body || summonDefs[entity.type]?.body || (entity.boss ? 'titan' : 'runner');
  }

  function entityFacing(entity, ally = false) {
    if (Number.isFinite(entity.facing)) return entity.facing;
    const target = ally ? game.hero : PATH[entity.pathIndex] || game.crystal;
    return Math.atan2(target.y - entity.y, target.x - entity.x);
  }

  function drawCreatureSilhouette(entity, body, color, detail, spectral = false) {
    const r = entity.r, flash = entity.hit > 0;
    ctx.fillStyle = flash ? '#fff8f8' : color;
    ctx.strokeStyle = spectral ? '#a8ffd0' : 'rgba(255,235,238,.28)';
    ctx.lineWidth = Math.max(1.5, r * .055);

    if (detail < 0) {
      drawPolygon([[r, 0], [-r * .62, r * .65], [-r * .35, 0], [-r * .62, -r * .65]]); ctx.fill();
      return;
    }

    if (body === 'runner') {
      drawPolygon([[r * 1.05, 0], [-r * .34, r * .72], [-r * .08, r * .2], [-r * .92, r * .5], [-r * .62, 0], [-r * .92, -r * .5], [-r * .08, -r * .2], [-r * .34, -r * .72]]); ctx.fill();
    } else if (body === 'pack') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * .9, r * .58, 0, 0, TAU); ctx.fill();
      if (detail > 0) { ctx.beginPath(); for (let side = -1; side <= 1; side += 2) for (let i = -1; i <= 1; i++) { ctx.moveTo(-r * .25 + i * r * .35, side * r * .35); ctx.lineTo(-r * .42 + i * r * .38, side * r * .8); } ctx.stroke(); }
      drawPolygon([[r, 0], [r * .42, r * .35], [r * .42, -r * .35]]); ctx.fill();
    } else if (body === 'guard') {
      drawPolygon([[r * .88, 0], [r * .48, r * .82], [-r * .45, r], [-r, r * .42], [-r, -r * .42], [-r * .45, -r], [r * .48, -r * .82]]); ctx.fill();
      ctx.fillStyle = '#10151d'; drawPolygon([[r * .48, 0], [r * .08, r * .6], [-r * .52, r * .46], [-r * .7, 0], [-r * .52, -r * .46], [r * .08, -r * .6]]); ctx.fill();
    } else if (body === 'hexer') {
      drawPolygon([[r * .82, 0], [0, r], [-r * .72, r * .48], [-r * .44, 0], [-r * .72, -r * .48], [0, -r]]); ctx.fill();
      ctx.fillStyle = '#17101f'; drawPolygon([[r * .43, 0], [0, r * .42], [-r * .3, 0], [0, -r * .42]]); ctx.fill();
    } else if (body === 'brute' || body === 'berserk') {
      drawPolygon([[r * .92, 0], [r * .48, r * .45], [r * .22, r * .95], [-r * .38, r * .72], [-r, r * .42], [-r * .68, 0], [-r, -r * .42], [-r * .38, -r * .72], [r * .22, -r * .95], [r * .48, -r * .45]]); ctx.fill();
      ctx.fillStyle = '#17121a'; ctx.fillRect(-r * .45, -r * .34, r * .85, r * .68);
    } else if (body === 'surge') {
      drawPolygon([[r, 0], [r * .15, r * .3], [-r * .72, r], [-r * .48, r * .2], [-r * .82, 0], [-r * .48, -r * .2], [-r * .72, -r], [r * .15, -r * .3]]); ctx.fill();
      ctx.fillStyle = '#11141e'; drawPolygon([[r * .55, 0], [-r * .28, r * .23], [-r * .5, 0], [-r * .28, -r * .23]]); ctx.fill();
    } else if (body === 'siege') {
      drawPolygon([[r, 0], [r * .48, r * .72], [-r * .75, r * .75], [-r, r * .35], [-r, -r * .35], [-r * .75, -r * .75], [r * .48, -r * .72]]); ctx.fill();
      ctx.fillStyle = '#15151b'; ctx.fillRect(-r * .56, -r * .42, r * 1.02, r * .84);
      if (detail > 0) { ctx.fillStyle = '#080d12'; ctx.beginPath(); ctx.arc(-r * .48, r * .7, r * .22, 0, TAU); ctx.arc(-r * .48, -r * .7, r * .22, 0, TAU); ctx.fill(); }
    } else if (body === 'regen') {
      ctx.beginPath(); ctx.arc(-r * .22, 0, r * .72, 0, TAU); ctx.arc(r * .28, r * .35, r * .5, 0, TAU); ctx.arc(r * .28, -r * .35, r * .5, 0, TAU); ctx.fill();
      drawPolygon([[r, 0], [r * .3, r * .32], [r * .3, -r * .32]]); ctx.fill();
    } else if (body === 'splitter') {
      ctx.beginPath(); ctx.arc(-r * .22, 0, r * .72, 0, TAU); ctx.arc(r * .36, 0, r * .65, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1d1421'; ctx.beginPath(); ctx.moveTo(r * .05, -r * .65); ctx.lineTo(r * .05, r * .65); ctx.stroke();
    } else if (body === 'leech') {
      ctx.beginPath(); ctx.ellipse(-r * .08, 0, r, r * .62, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#180d14'; ctx.beginPath(); ctx.arc(r * .62, 0, r * .42, 0, TAU); ctx.fill();
    } else if (body === 'phase') {
      drawPolygon([[r, 0], [r * .15, r * .58], [-r * .42, r], [-r * .3, r * .3], [-r * .86, 0], [-r * .3, -r * .3], [-r * .42, -r], [r * .15, -r * .58]]); ctx.fill();
      ctx.fillStyle = '#10151e'; drawPolygon([[r * .45, 0], [-r * .05, r * .26], [-r * .28, 0], [-r * .05, -r * .26]]); ctx.fill();
    } else if (body === 'commander') {
      drawPolygon([[r * .9, 0], [r * .32, r * .48], [r * .08, r], [-r * .55, r * .64], [-r * .84, 0], [-r * .55, -r * .64], [r * .08, -r], [r * .32, -r * .48]]); ctx.fill();
      ctx.fillStyle = '#14111a'; drawPolygon([[r * .48, 0], [0, r * .5], [-r * .4, 0], [0, -r * .5]]); ctx.fill();
    } else {
      drawPolygon([[r, 0], [r * .58, r * .7], [0, r], [-r * .72, r * .72], [-r, 0], [-r * .72, -r * .72], [0, -r], [r * .58, -r * .7]]); ctx.fill();
      ctx.fillStyle = '#171119'; drawPolygon([[r * .55, 0], [0, r * .52], [-r * .48, 0], [0, -r * .52]]); ctx.fill();
    }

    if (detail > 0) {
      ctx.fillStyle = spectral ? '#d8ffe8' : '#0a1118'; ctx.beginPath(); ctx.arc(r * .34, -r * .13, Math.max(2.2, r * .11), 0, TAU); ctx.fill();
      ctx.globalAlpha = .42; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(r * .18, -r * .45); ctx.lineTo(r * .55, -r * .22); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  function drawTraitAccents(enemy, detail) {
    const r = enemy.r;
    if (enemy.playerMade) {
      ctx.fillStyle = '#c795ff'; drawPolygon([[-r * .7, 0], [-r * .98, r * .28], [-r * .98, -r * .28]]); ctx.fill();
      ctx.fillStyle = '#f1ddff'; ctx.beginPath(); ctx.arc(-r * .64, 0, Math.max(2, r * .09), 0, TAU); ctx.fill();
    }
    if (hasTrait(enemy, 'hexer')) {
      ctx.strokeStyle = '#d5a4ff'; ctx.lineWidth = Math.max(1.5, r * .07);
      drawPolygon([[r * .52, 0], [0, r * .46], [-r * .36, 0], [0, -r * .46]]); ctx.stroke();
      ctx.fillStyle = '#f0c8ff'; ctx.beginPath(); ctx.arc(r * .08, 0, Math.max(2, r * .09), 0, TAU); ctx.fill();
    }
    if (detail < 1) return;
    if (hasTrait(enemy, 'phase') && (game.time + enemy.id * .17) % 4 < 1.25) {
      ctx.globalAlpha = .48; ctx.strokeStyle = '#79fff5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-r * .18, 0, r * .92, -1.15, 1.15); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (hasTrait(enemy, 'regen')) {
      ctx.fillStyle = '#8bf58a'; ctx.beginPath(); ctx.arc(-r * .12, 0, Math.max(3, r * .15), 0, TAU); ctx.fill();
      if (detail > 1) { ctx.strokeStyle = 'rgba(139,245,138,.6)'; ctx.beginPath(); ctx.arc(-r * .12, 0, r * (.32 + Math.sin(game.time * 3 + enemy.id) * .04), 0, TAU); ctx.stroke(); }
    }
    if (hasTrait(enemy, 'berserk') && enemy.hp <= enemy.maxHp * .5) {
      ctx.fillStyle = '#ffb069'; drawPolygon([[r * .18, -r * .52], [-r * .15, -r * 1.05], [r * .42, -r * .66]]); ctx.fill();
      drawPolygon([[r * .18, r * .52], [-r * .15, r * 1.05], [r * .42, r * .66]]); ctx.fill();
    }
    if (hasTrait(enemy, 'surge') && Math.sin(enemy.phase * .48) > .55) {
      ctx.strokeStyle = '#7bdcff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * .75, -r * .55); ctx.lineTo(-r * 1.15, 0); ctx.lineTo(-r * .75, r * .55); ctx.stroke();
    }
    if (hasTrait(enemy, 'siege')) {
      ctx.fillStyle = '#ffb36b'; drawPolygon([[r * 1.12, 0], [r * .72, r * .24], [r * .72, -r * .24]]); ctx.fill();
    }
    if (hasTrait(enemy, 'leech')) {
      ctx.fillStyle = '#ffe5e7'; for (let side = -1; side <= 1; side += 2) { drawPolygon([[r * .65, side * r * .06], [r * .38, side * r * .29], [r * .72, side * r * .24]]); ctx.fill(); }
    }
    if (hasTrait(enemy, 'split')) {
      ctx.strokeStyle = '#b9ffb2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r * .55); ctx.lineTo(0, r * .55); ctx.stroke();
    }
    if (hasTrait(enemy, 'commander')) {
      ctx.fillStyle = '#ffd269'; drawPolygon([[-r * .34, -r * .82], [-r * .12, -r * 1.22], [r * .02, -r * .82], [r * .25, -r * 1.12], [r * .42, -r * .72]]); ctx.fill();
    }
    if (enemy.boss) {
      ctx.strokeStyle = 'rgba(255,210,105,.78)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.18, -.9, .9); ctx.stroke();
    }
  }

  function drawIllustratedEnemy(enemy) {
    const special = enemy.boss || hasTrait(enemy, 'hexer') || hasTrait(enemy, 'commander');
    const detail = enemy.boss ? 2 : renderDetail < 0 ? (special ? 0 : -1) : renderDetail;
    const bob = reducedMotion || detail < 1 ? 0 : Math.sin(enemy.phase + enemy.id * .31) * 2;
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    if (detail >= 0) { ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.beginPath(); ctx.ellipse(0, enemy.r * .55, enemy.r * .82, enemy.r * .32, 0, 0, TAU); ctx.fill(); }
    if (!activeHexAuraDrawn && hasTrait(enemy, 'hexer') && game.hero.hexed && detail > 0) {
      const dx = enemy.x - game.hero.x, dy = enemy.y - game.hero.y;
      if (dx * dx + dy * dy < HEX_RADIUS_SQUARED) { activeHexAuraDrawn = true; ctx.strokeStyle = 'rgba(180,140,255,.11)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, HEX_RADIUS, 0, TAU); ctx.stroke(); }
    }
    ctx.translate(0, bob); ctx.rotate(entityFacing(enemy));
    const phaseActive = hasTrait(enemy, 'phase') && (game.time + enemy.id * .17) % 4 < 1.25;
    if (phaseActive) ctx.globalAlpha = .68;
    drawCreatureSilhouette(enemy, creatureBody(enemy), enemy.color, detail);
    ctx.globalAlpha = 1; drawTraitAccents(enemy, detail); ctx.restore();

    const showHealth = enemy.boss || (enemy.hp < enemy.maxHp && (detail > 1 || (detail > 0 && enemy.r >= 31)));
    if (showHealth) {
      const width = enemy.r * 2.05, y = enemy.y - enemy.r - 15;
      ctx.fillStyle = 'rgba(1,5,8,.82)'; ctx.fillRect(enemy.x - width / 2 - 1, y - 1, width + 2, 7);
      ctx.fillStyle = enemy.boss ? '#ff6577' : enemy.playerMade ? '#bd8bff' : '#e05b6d'; ctx.fillRect(enemy.x - width / 2, y, width * Math.max(0, enemy.hp / enemy.maxHp), 5);
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(enemy.x - width / 2, y, width * Math.max(0, enemy.hp / enemy.maxHp), 1);
    }
  }

  function drawIllustratedAlly(ally) {
    const detail = renderDetail < 0 ? -1 : Math.max(0, renderDetail);
    const bob = reducedMotion || detail < 1 ? 0 : Math.sin(ally.phase) * 2;
    ctx.save(); ctx.translate(ally.x, ally.y);
    if (detail >= 0) { ctx.fillStyle = 'rgba(0,8,5,.32)'; ctx.beginPath(); ctx.ellipse(0, ally.r * .55, ally.r * .85, ally.r * .32, 0, 0, TAU); ctx.fill(); }
    ctx.rotate(entityFacing(ally, true)); ctx.translate(0, bob);
    if (detail > 0) { ctx.globalAlpha = .24; ctx.fillStyle = '#79efae'; drawPolygon([[-ally.r * .25, 0], [-ally.r * 1.28, ally.r * .56], [-ally.r * .9, 0], [-ally.r * 1.28, -ally.r * .56]]); ctx.fill(); }
    ctx.globalAlpha = .9; drawCreatureSilhouette(ally, creatureBody(ally), '#43d99a', detail, true); ctx.globalAlpha = 1;
    ctx.strokeStyle = ally.color || '#d8ffe8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, ally.r * .45, -.9, .9); ctx.stroke();
    if (detail > 0) { ctx.strokeStyle = '#a7ffd0'; ctx.beginPath(); ctx.ellipse(-ally.r * .05, -ally.r * .83, ally.r * .34, ally.r * .13, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
    if (ally.hp < ally.maxHp && detail > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(ally.x - ally.r, ally.y - ally.r - 11, ally.r * 2, 5);
      ctx.fillStyle = '#79efae'; ctx.fillRect(ally.x - ally.r, ally.y - ally.r - 11, ally.r * 2 * Math.max(0, ally.hp / ally.maxHp), 4);
    }
  }

  function drawIllustratedCrystal() {
    const crystal = game.crystal, health = Math.max(0, crystal.hp / crystal.maxHp);
    const pulse = 1 + (reducedMotion ? 0 : Math.sin(game.time * 3) * .024) + crystal.pulse * .075;
    ctx.save(); ctx.translate(crystal.x, crystal.y);
    const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 125);
    glow.addColorStop(0, crystal.pulse > 0 ? 'rgba(255,155,174,.48)' : 'rgba(112,231,223,.42)'); glow.addColorStop(1, 'rgba(112,231,223,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 125, 0, TAU); ctx.fill();
    ctx.strokeStyle = health < .35 ? 'rgba(255,101,119,.7)' : 'rgba(112,231,223,.35)'; ctx.lineWidth = 3;
    ctx.save(); ctx.rotate(reducedMotion ? 0 : game.time * .12);
    for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.moveTo(66, 0); ctx.lineTo(91, -10); ctx.lineTo(102, 0); ctx.lineTo(91, 10); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#0b2630'; for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i / 6 * TAU); drawPolygon([[28, 0], [57, -18], [74, 0], [57, 18]]); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.scale(pulse, pulse); ctx.shadowBlur = 24; ctx.shadowColor = health < .35 ? '#ff6577' : '#39d8dd';
    ctx.fillStyle = crystal.pulse > 0 ? '#fff' : health < .35 ? '#ff8c9a' : '#83fff4';
    drawPolygon([[0, -67], [37, -16], [22, 49], [0, 72], [-22, 49], [-37, -16]]); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = health < .35 ? '#6d2435' : '#176070'; drawPolygon([[0, -48], [18, -8], [0, 48], [-18, -8]]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; drawPolygon([[-3, -52], [8, -18], [2, 12], [-8, -16]]); ctx.fill();
    if (health < .68) { ctx.strokeStyle = '#280e18'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(3, -34); ctx.lineTo(-8, -8); ctx.lineTo(7, 11); ctx.lineTo(-3, 35); ctx.stroke(); }
    ctx.restore(); ctx.restore();
  }

  function drawHeroRelics(hero) {
    const relics = [
      ['multishot', '#8ffff4'], ['chain', '#ffd269'], ['splash', '#ff8fcb'], ['revive', '#79efae']
    ];
    relics.forEach(([type, color], index) => {
      const rank = game.items[type]; if (!rank) return;
      ctx.strokeStyle = color; ctx.globalAlpha = Math.min(.88, .4 + rank * .055); ctx.lineWidth = Math.min(6, 2 + Math.sqrt(rank) * .9);
      ctx.beginPath(); ctx.arc(0, 0, hero.r + 13 + Math.min(rank, 8), index * Math.PI / 2 + .12, index * Math.PI / 2 + 1.22); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawIllustratedHero() {
    const hero = game.hero, angle = Math.atan2(hero.aimY, hero.aimX), bob = reducedMotion ? 0 : Math.sin(game.time * 7) * 1.2;
    ctx.save(); ctx.translate(hero.x, hero.y);
    ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.ellipse(-3, 18, 31, 12, 0, 0, TAU); ctx.fill();
    drawHeroRelics(hero);
    if (hero.invuln > 0) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, hero.r + 9, 0, TAU); ctx.stroke(); }
    if (hero.hexed) {
      ctx.strokeStyle = '#c79aff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, hero.r + 17, .2, 2.5); ctx.arc(0, 0, hero.r + 17, 3.35, 5.75); ctx.stroke();
      ctx.fillStyle = '#ff718d'; for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i / 3 * TAU + game.time * .18); drawPolygon([[0, -hero.r - 23], [-5, -hero.r - 12], [5, -hero.r - 12]]); ctx.fill(); ctx.restore(); }
    }
    ctx.rotate(angle); ctx.translate(0, bob);
    // Boots and a broad cloak make the Warden read as a character rather than a cursor.
    ctx.fillStyle = '#071218';
    drawPolygon([[-13, -8], [-29, -18], [-34, -10], [-18, -2]]); ctx.fill();
    drawPolygon([[-13, 8], [-29, 18], [-34, 10], [-18, 2]]); ctx.fill();
    ctx.fillStyle = '#123746';
    drawPolygon([[-7, -17], [-28, -25], [-39, 0], [-28, 25], [-7, 17], [-15, 0]]); ctx.fill();
    ctx.strokeStyle = '#2f7784'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -16); ctx.quadraticCurveTo(-26, 0, -8, 16); ctx.stroke();

    // Armored torso, shoulder plates, helmet, and luminous chest rune.
    ctx.fillStyle = '#203f4d'; drawPolygon([[-14, -14], [8, -17], [20, 0], [8, 17], [-14, 14], [-21, 0]]); ctx.fill();
    ctx.fillStyle = '#5ebbc0'; ctx.beginPath(); ctx.arc(-2, -17, 7, 0, TAU); ctx.arc(-2, 17, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a1821'; ctx.beginPath(); ctx.arc(10, 0, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8ffff4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(10, 0, 10, -1.25, 1.25); ctx.stroke();
    ctx.fillStyle = '#d8fffb'; ctx.fillRect(10, -5, 9, 10);
    ctx.fillStyle = '#9bfff7'; drawPolygon([[1, 0], [-5, 7], [-12, 0], [-5, -7]]); ctx.shadowBlur = 11; ctx.shadowColor = '#70e7df'; ctx.fill(); ctx.shadowBlur = 0;

    // A side-held prism lance shows aim without turning the whole body into an arrow.
    ctx.strokeStyle = '#173743'; ctx.lineCap = 'round'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(4, -14); ctx.lineTo(30, -14); ctx.stroke();
    ctx.strokeStyle = '#85f7ee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(15, -14); ctx.lineTo(38, -14); ctx.stroke();
    ctx.fillStyle = '#bffff9'; ctx.shadowBlur = 12; ctx.shadowColor = '#70e7df'; drawPolygon([[45, -14], [34, -8], [34, -20]]); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#1b4855'; ctx.beginPath(); ctx.arc(5, 14, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#79e8df'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(5, 14, 6, .2, 5.8); ctx.stroke();
    ctx.restore();
  }

  function drawIllustratedSentinel(sentinel) {
    const lifeRatio = Math.max(0, sentinel.life / 11);
    ctx.save(); ctx.translate(sentinel.x, sentinel.y);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 18, 25, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,105,.32)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(game.crystal.x - sentinel.x, game.crystal.y - sentinel.y); ctx.stroke();
    ctx.fillStyle = '#1e2930'; drawPolygon([[26, 0], [13, 22], [-13, 22], [-26, 0], [-13, -22], [13, -22]]); ctx.fill();
    ctx.save(); ctx.rotate(sentinel.phase); ctx.fillStyle = '#ffd269';
    for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); drawPolygon([[7, -4], [28, 0], [7, 4]]); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#fff2ad'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd269'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 31, -Math.PI / 2, -Math.PI / 2 + TAU * lifeRatio); ctx.stroke(); ctx.restore();
  }

  function drawIllustratedProjectile(projectile) {
    let dx = 1, dy = 0;
    if (projectile.target) { dx = projectile.target.x - projectile.x; dy = projectile.target.y - projectile.y; }
    const magnitude = Math.hypot(dx, dy) || 1, angle = Math.atan2(dy, dx);
    const trail = renderDetail < 0 && !projectile.wardenShot ? 5 : projectile.critical ? 28 : projectile.wardenShot ? 20 : 12;
    ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(angle);
    ctx.globalAlpha = .24; ctx.strokeStyle = projectile.color; ctx.lineWidth = projectile.r * 2.4; ctx.beginPath(); ctx.moveTo(-trail, 0); ctx.lineTo(2, 0); ctx.stroke();
    ctx.globalAlpha = .86; ctx.lineWidth = Math.max(1.5, projectile.r * .68); ctx.beginPath(); ctx.moveTo(-trail * .82, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = projectile.color;
    if (projectile.wardenShot) { drawPolygon([[projectile.r * 1.5, 0], [0, projectile.r], [-projectile.r, 0], [0, -projectile.r]]); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, 0, projectile.r, 0, TAU); ctx.fill(); }
    if (projectile.critical && renderDetail >= 0) { ctx.strokeStyle = '#fff6c9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -projectile.r * 1.8); ctx.lineTo(0, projectile.r * 1.8); ctx.moveTo(-projectile.r * 1.8, 0); ctx.lineTo(projectile.r * 1.8, 0); ctx.stroke(); }
    ctx.restore();
  }

  function drawIllustratedParticle(particle) {
    const alpha = Math.max(0, particle.life / particle.max);
    ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(Math.atan2(particle.vy, particle.vx)); ctx.globalAlpha = alpha; ctx.fillStyle = particle.color;
    if (renderDetail > 0) { drawPolygon([[particle.size, 0], [0, particle.size * .65], [-particle.size * 1.8, 0], [0, -particle.size * .65]]); ctx.fill(); }
    else ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    ctx.restore();
  }

  function drawIllustratedSlash(slash) {
    const alpha = Math.max(0, slash.life / slash.max);
    ctx.save(); ctx.globalAlpha = alpha;
    if (slash.ring) {
      if (slash.kind === 'splash' || slash.kind === 'nova' || slash.kind === 'raise') {
        ctx.globalAlpha = alpha * .11; ctx.fillStyle = slash.color; ctx.beginPath(); ctx.arc(slash.x, slash.y, slash.radius, 0, TAU); ctx.fill(); ctx.globalAlpha = alpha;
      }
      ctx.strokeStyle = slash.color; ctx.lineWidth = slash.kind === 'nova' ? 7 : 4; ctx.beginPath(); ctx.arc(slash.x, slash.y, slash.radius, 0, TAU); ctx.stroke();
      if (slash.kind === 'raise') { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(slash.x, slash.y, slash.radius * .65, 0, TAU); ctx.stroke(); }
    } else if (slash.kind === 'chain') {
      const dx = slash.x2 - slash.x1, dy = slash.y2 - slash.y1, length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length, ny = dx / length, bend = Math.min(12, length * .1);
      ctx.strokeStyle = 'rgba(255,210,105,.3)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(slash.x1, slash.y1); ctx.lineTo(slash.x1 + dx * .34 + nx * bend, slash.y1 + dy * .34 + ny * bend); ctx.lineTo(slash.x1 + dx * .68 - nx * bend * .7, slash.y1 + dy * .68 - ny * bend * .7); ctx.lineTo(slash.x2, slash.y2); ctx.stroke();
      ctx.strokeStyle = '#fff3a8'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.strokeStyle = slash.color; ctx.lineCap = 'round'; ctx.lineWidth = slash.kind === 'dash' ? 13 * alpha : 6 * alpha;
      ctx.beginPath(); ctx.moveTo(slash.x1, slash.y1); ctx.lineTo(slash.x2, slash.y2); ctx.stroke();
      if (slash.kind === 'dash') { ctx.globalAlpha = alpha * .7; ctx.strokeStyle = '#d7fffb'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawBattlefieldTint() {
    const danger = Math.max(0, .38 - game.crystal.hp / game.crystal.maxHp) / .38;
    if (danger <= 0 && game.flash <= 0) return;
    const alpha = Math.min(.12, danger * .09 + game.flash * .04);
    ctx.fillStyle = `rgba(255,42,78,${alpha})`; ctx.fillRect(0, 0, WORLD.w, 18); ctx.fillRect(0, WORLD.h - 18, WORLD.w, 18); ctx.fillRect(0, 0, 18, WORLD.h); ctx.fillRect(WORLD.w - 18, 0, 18, WORLD.h);
  }

  function updateSummonUI(force = false) {
    if (!force && !summonUiDirty && game.time - lastSummonUi < .2) return;
    const hero = game.hero;
    const totalRoster = Object.values(game.roster).reduce((sum, count) => sum + count, 0);
    const progress = game.returnWaves[game.wave] || { deployed: 0, expected: 0 };
    const backlog = game.returnQueued;
    ui.rosterTotal.textContent = `PERMANENT ROSTER: ${formatCompactNumber(totalRoster)} BODIES / WAVE`;
    ui.rosterWaveProgress.textContent = `THIS WAVE: ${formatCompactNumber(progress.deployed)} / ${formatCompactNumber(progress.expected)} DEPLOYED${backlog ? ` • ${formatCompactNumber(backlog)} QUEUED` : ''}`;
    ui.drawerRosterTotal.textContent = formatCompactNumber(totalRoster);
    const reserve = RESERVES[game.reserveIndex];
    let autoCount = 0;
    summonViews.forEach((view, type) => {
      const def = summonDefs[type], locked = hero.level < def.unlock;
      const inStock = game.stock[type] > 0, affordable = game.gold >= def.cost;
      const autoAffordable = game.gold - def.cost >= reserve;
      const nextStock = Math.max(0, def.restockSeconds - game.stockClocks[type]);
      const stockStatus = game.stock[type] >= def.stockCap ? 'FULL' : `NEXT ${Math.ceil(nextStock)}s`;
      const autoStatus = !inStock ? 'STOCK' : !autoAffordable ? 'WAIT' : 'READY';
      if (game.autos[type]) autoCount++;
      view.card.classList.toggle('locked', locked);
      view.card.classList.toggle('out-of-stock', !inStock);
      view.card.classList.toggle('auto-enabled', game.autos[type]);
      view.buy.disabled = locked || !affordable || !inStock;
      view.buy.setAttribute('aria-label', `Buy one ${def.name} contract for ${def.cost} gold and gain ${def.income} recurring income every five seconds. Trait: ${def.tag}. ${game.contracts[type]} contracts owned create ${game.roster[type]} returning ${game.roster[type] === 1 ? 'body' : 'bodies'} every wave. Stock ${game.stock[type]} of ${def.stockCap}.${locked ? ` Unlocks at level ${def.unlock}.` : ''}`);
      view.owned.textContent = `×${game.contracts[type]}`;
      view.contracts.textContent = formatCompactNumber(game.contracts[type]);
      view.bodies.textContent = formatCompactNumber(game.roster[type]);
      view.stock.textContent = `${game.stock[type]}/${def.stockCap}`;
      view.stockState.textContent = locked ? `LOCKED • LV ${def.unlock}` : stockStatus;
      view.auto.disabled = locked;
      view.auto.setAttribute('aria-pressed', String(game.autos[type]));
      view.autoState.textContent = game.autos[type] ? autoStatus : 'OFF';
      view.auto.setAttribute('aria-label', `${game.autos[type] ? 'Turn off' : 'Turn on'} continuous automatic ${def.name} purchases.${game.autos[type] ? ` Current state: ${autoStatus.toLowerCase()}.` : ''}${locked ? ` Unlocks at level ${def.unlock}.` : ''}`);
    });
    ui.autoCount.textContent = String(autoCount);
    ui.allAutoOff.disabled = autoCount === 0;
    ui.reserveBtn.setAttribute('aria-label', `Protect ${RESERVES[game.reserveIndex]} gold from all automatic purchases. Activate to choose another reserve.`);
    lastSummonUi = game.time;
    summonUiDirty = false;
  }

  function updateUI(force = false) {
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

    updateSummonUI(force);

    document.querySelectorAll('.shop-item').forEach(button => {
      const type = button.dataset.upgrade, cost = itemCost(type);
      const maxed = isItemMaxed(type);
      button.disabled = game.gold < cost || (type === 'repair' && crystal.hp >= crystal.maxHp) || maxed;
      $(`cost-${type}`).textContent = maxed ? 'MAX' : formatCompactNumber(cost);
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
  function formatCompactNumber(number) {
    if (Math.abs(number) < 1000) return String(Math.floor(number));
    if (Math.abs(number) < 1000000) return `${(number / 1000).toFixed(number < 10000 ? 1 : 0).replace('.0', '')}K`;
    return `${(number / 1000000).toFixed(number < 10000000 ? 1 : 0).replace('.0', '')}M`;
  }
  function clamp(number, minimum, maximum) { return Math.max(minimum, Math.min(maximum, number)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pointLineDistance(px, py, x1, y1, x2, y2) { const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (!lengthSquared) return Math.hypot(px - x1, py - y1); const t = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSquared, 0, 1); return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))); }
  function initAudio() { if (!audio) try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (error) { soundOn = false; } }
  function tone(frequency, duration, type = 'sine', volume = .03) { if (!soundOn || !audio) return; const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration); }
  function loop(now) { const dt = Math.min(.033, (now - last) / 1000); last = now; update(dt); draw(); raf = requestAnimationFrame(loop); }

  buildSummonCatalog();
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
    if (game.marketPage && event.code === 'Escape') {
      event.preventDefault();
      setPurchasePage(null);
      return;
    }
    if (game.drawerOpen) {
      if (event.code === 'Escape') {
        event.preventDefault();
        setPurchasePage(null);
        return;
      }
      if (event.code === 'Tab') {
        const focusable = [...ui.purchaseHub.querySelectorAll('button:not([disabled]),select:not([disabled])')]
          .filter(element => !element.closest('[hidden]'));
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
  ui.summonList.addEventListener('click', event => {
    const card = event.target.closest('.summon-card');
    if (!card) return;
    if (event.target.closest('.summon-buy')) buySummon(card.dataset.summon);
    else if (event.target.closest('.unit-auto')) setUnitAuto(card.dataset.summon, !game.autos[card.dataset.summon]);
  });
  ui.summonFilters.addEventListener('click', event => {
    const filter = event.target.closest('[data-tier]');
    if (filter) setSummonFilter(filter.dataset.tier, false);
  });
  ui.summonFilters.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
    const filters = [...ui.summonFilters.querySelectorAll('[data-tier]:not([hidden])')];
    const current = filters.indexOf(event.target.closest('[data-tier]'));
    if (current < 0 || !filters.length) return;
    event.preventDefault();
    const next = event.code === 'Home' ? 0 : event.code === 'End' ? filters.length - 1
      : event.code === 'ArrowLeft' ? (current + filters.length - 1) % filters.length
      : (current + 1) % filters.length;
    setSummonFilter(filters[next].dataset.tier);
  });
  ui.summonPagePrev.addEventListener('click', () => turnSummonPage(-1));
  ui.summonPageNext.addEventListener('click', () => turnSummonPage(1));
  document.querySelectorAll('.shop-item').forEach(button => button.addEventListener('click', () => buyItem(button.dataset.upgrade)));
  $('forgeGearTab').addEventListener('click', () => togglePurchasePage('gear'));
  $('forgeRelicTab').addEventListener('click', () => togglePurchasePage('relics'));
  const purchaseTabs = [$('forgeGearTab'), $('forgeRelicTab'), ui.drawerToggle];
  purchaseTabs.forEach((tab, tabIndex) => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    const nextIndex = event.code === 'Home' ? 0 : event.code === 'End' ? purchaseTabs.length - 1
      : event.code === 'ArrowLeft' ? (tabIndex + purchaseTabs.length - 1) % purchaseTabs.length
      : (tabIndex + 1) % purchaseTabs.length;
    setPurchasePage(['gear', 'relics', 'summons'][nextIndex], false);
    purchaseTabs[nextIndex].focus();
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
    markSummonUiDirty();
    updateUI(true);
  });
  ui.allAutoOff.addEventListener('click', disableAllAutos);
  ui.drawerToggle.addEventListener('click', () => togglePurchasePage('summons'));
  ui.drawerClose.addEventListener('click', () => setPurchasePage(null));
  $('forgeToggle').addEventListener('click', () => setPurchasePage(null));
  $('soundBtn').addEventListener('click', () => {
    initAudio(); soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '♪' : '×';
    $('soundBtn').setAttribute('aria-label', soundOn ? 'Mute sound' : 'Enable sound'); $('soundBtn').setAttribute('aria-pressed', String(!soundOn));
    if (soundOn) { if (audio?.state === 'suspended') audio.resume(); tone(440, .1); }
  });
  const fullBtn = $('fullBtn'), fullscreenSupported = Boolean(document.fullscreenEnabled && $('gameShell').requestFullscreen);
  fullBtn.hidden = !fullscreenSupported;
  fullBtn.addEventListener('click', () => { if (game.marketPage) setPurchasePage(null, false); const action = !document.fullscreenElement ? $('gameShell').requestFullscreen?.() : document.exitFullscreen?.(); action?.catch?.(() => {}); });
  const openHelp = () => {
    if (game.marketPage) setPurchasePage(null, false);
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
    if (game.marketPage) setPurchasePage(null, false);
    const active = document.fullscreenElement === $('gameShell');
    fullBtn.textContent = active ? '×' : '⛶'; fullBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen'); fullBtn.setAttribute('aria-pressed', String(active));
    closeDrawerForInterruption();
    fitCanvas();
  });
  const handleDrawerBreakpoint = () => setPurchasePage(null);
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
      snapshot: () => ({ time: game.time, wave: game.wave, nextWave: game.nextWave, gold: game.gold, income: game.income, incomeClock: game.incomeClock, paused: game.paused, roster: { ...game.roster }, contracts: { ...game.contracts }, stock: { ...game.stock }, stockClocks: { ...game.stockClocks }, queue: game.spawnQueue.length, queueSelf: game.spawnQueue.filter(entry => entry.playerMade).length, returnQueued: game.returnQueued, returnWaves: Object.fromEntries(Object.entries(game.returnWaves).map(([wave, progress]) => [wave, { ...progress }])), queueState: [...game.spawnQueue].sort((a, b) => spawnEntryBefore(a, b) ? -1 : spawnEntryBefore(b, a) ? 1 : 0).map(entry => ({ type: entry.type, source: entry.source, wave: entry.wave, due: entry.due, priority: entry.priority, sequence: entry.sequence })), enemies: game.enemies.length, enemyState: game.enemies.map(enemy => ({ id: enemy.id, type: enemy.type, hp: enemy.hp, maxHp: enemy.maxHp, x: enemy.x, y: enemy.y, boss: enemy.boss, playerMade: enemy.playerMade, source: enemy.source, originWave: enemy.originWave, spawnSequence: enemy.spawnSequence, traits: [...(enemy.traits || [])] })), selfActive: game.enemies.filter(enemy => enemy.playerMade).length, allies: game.allies.length, allyCap: revenantCap(), allyState: game.allies.map(ally => ({ id: ally.id, type: ally.type, hp: ally.hp, maxHp: ally.maxHp, x: ally.x, y: ally.y })), projectiles: game.projectiles.length, projectileState: game.projectiles.map(projectile => ({ targetId: projectile.target?.id || null, damage: projectile.damage, chainLeft: projectile.chainLeft || 0, hitIds: [...(projectile.hitIds || [])], wardenShot: Boolean(projectile.wardenShot) })), hero: { x: game.hero.x, y: game.hero.y, hp: game.hero.hp, maxHp: game.hero.maxHp, damage: game.hero.damage, attackRate: game.hero.attackRate, range: game.hero.range, crit: game.hero.crit, hexed: game.hero.hexed, damageMultiplier: game.hero.hexed ? HEX_DAMAGE_MULTIPLIER : 1 }, level: game.hero.level, xp: game.hero.xp, items: { ...game.items }, autos: { ...game.autos }, autoClock: game.autoClock, reserve: RESERVES[game.reserveIndex], drawerOpen: game.drawerOpen, marketPage: game.marketPage, summonFilter: activeSummonFilter, summonSubpage: activeSummonSubpage, summonPageSize: SUMMON_PAGE_SIZE, summonPageCount: Math.max(1, Math.ceil(summonTypesForActiveFilter().length / SUMMON_PAGE_SIZE)), visibleSummons: summonTypesForActiveFilter().slice(activeSummonSubpage * SUMMON_PAGE_SIZE, (activeSummonSubpage + 1) * SUMMON_PAGE_SIZE) }),
      start: begin,
      purchase: type => buySummon(type),
      buyItem: type => buyItem(type),
      addXp,
      setAuto: (enabled, type = 'runner') => setUnitAuto(type, enabled, false),
      setSummonFilter: filter => setSummonFilter(filter, false),
      setSummonSubpage: page => { activeSummonSubpage = Math.max(0, Math.floor(page)); refreshSummonPage(); },
      allAutoOff: disableAllAutos,
      setDrawer: open => setSummonDrawer(open, false),
      startWave,
      advance: seconds => { const steps = Math.ceil(seconds / .03); for (let i = 0; i < steps; i++) update(Math.min(.03, seconds - i * .03)); },
      drainQueueThrough: seconds => {
        game.time += Math.max(0, seconds);
        while (game.spawnQueue.length && game.spawnQueue[0].due <= game.time) processSpawnQueue();
        updateUI(true);
      },
      setNextWave: time => { game.nextWave = Number.isFinite(time) ? time : Infinity; },
      setGold: amount => { game.gold = amount; markSummonUiDirty(); updateUI(true); },
      setStock: (type, amount, clock = 0) => { game.stock[type] = clamp(Math.floor(amount), 0, summonDefs[type].stockCap); game.stockClocks[type] = Math.max(0, clock); markSummonUiDirty(); updateUI(true); },
      setLevel: level => { game.hero.level = Math.max(1, Math.floor(level)); markSummonUiDirty(); updateUI(true); },
      setContracts: (type, count) => { game.contracts[type] = Math.max(0, Math.floor(count)); game.roster[type] = game.contracts[type] * summonDefs[type].count; markSummonUiDirty(); updateUI(true); },
      setHero: values => { Object.assign(game.hero, values); updateUI(); },
      clearCombat: () => { game.enemies.length = 0; game.allies.length = 0; game.spawnQueue.length = 0; game.projectiles.length = 0; game.returnQueued = 0; game.returnWaves = {}; markSummonUiDirty(); },
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
      ambientWaveCount,
      itemLimits: { ...itemLimits },
      summonDefs: Object.fromEntries(Object.entries(summonDefs).map(([type, def]) => [type, { ...def }])),
      path: PATH.map(point => ({ ...point }))
    };
  }

  reset(); fitCanvas(); syncOverlayAccess('startBtn'); raf = requestAnimationFrame(loop);
})();
