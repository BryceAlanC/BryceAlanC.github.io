(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (selector) => document.querySelector(selector);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;
  const ROWS = 5;
  const COLS = 9;
  const BOSS_EVERY = 5;
  const SPEEDS = [1, 2, 3, 5, 10];
  const FIXED_STEP = 1 / 60;
  const LIMITS = { enemies: 260, shots: 500, particles: 450, floaters: 80, drops: 60 };

  const PATHS = {
    sun: { label: "Sun", glyph: "☀", color: "#ffd85e" },
    dew: { label: "Dew", glyph: "≋", color: "#86e9f4" },
    thorn: { label: "Thorn", glyph: "❧", color: "#83d56e" },
    storm: { label: "Storm", glyph: "ϟ", color: "#bd91f2" }
  };

  const TOWERS = {
    basic: { label: "Sun sprout", glyph: "✿", color: "#ffd85e", cost: 50, hp: 120, damage: 17, rate: .9, speed: 230, requires: [], detail: "Fast magic bolts" },
    frost: { label: "Frost fern", glyph: "❄", color: "#87ecf5", cost: 75, hp: 125, damage: 11, rate: 1.35, speed: 215, slow: 2.7, requires: [], detail: "Slows shadows" },
    ember: { label: "Ember bloom", glyph: "✹", color: "#ff704d", cost: 100, hp: 120, damage: 24, rate: 1.7, speed: 205, splash: .9, requires: [], detail: "Bursts hit groups" },
    glow: { label: "Glow cap", glyph: "●", color: "#c592ff", cost: 75, hp: 175, income: true, requires: [], detail: "Grows nectar" },
    sunbeam: { label: "Sunbeam lily", glyph: "☀", color: "#ffe66e", cost: 120, hp: 130, damage: 34, rate: 1.15, speed: 300, pierce: 2, requires: ["sun"], detail: "Light passes through shadows" },
    dewbell: { label: "Dew bell", glyph: "≋", color: "#86e9f4", cost: 110, hp: 145, damage: 15, rate: 1.05, speed: 220, slow: 4.2, requires: ["dew"], detail: "Deep, lasting slow" },
    thornvine: { label: "Thorn vine", glyph: "❧", color: "#83d56e", cost: 105, hp: 150, damage: 9, rate: .48, speed: 255, poison: 9, poisonTime: 4, requires: ["thorn"], detail: "Fast thorns leave poison" },
    stormbud: { label: "Storm bud", glyph: "ϟ", color: "#bd91f2", cost: 130, hp: 125, damage: 22, rate: 1.2, speed: 275, chain: 2, requires: ["storm"], detail: "Magic jumps between shadows" },
    prism: { label: "Prism lotus", glyph: "✧", color: "#fff3a1", cost: 180, hp: 155, damage: 40, rate: 1.05, speed: 330, pierce: 4, slow: 2.2, requires: ["sun", "dew"], detail: "Piercing light and mist" },
    wildfire: { label: "Wildfire rose", glyph: "✺", color: "#ff9e55", cost: 170, hp: 160, damage: 32, rate: 1.2, speed: 225, splash: 1.15, poison: 11, poisonTime: 4, requires: ["sun", "thorn"], detail: "Burning, spreading thorns" },
    thunderstar: { label: "Thunder star", glyph: "✦", color: "#f8dc8a", cost: 190, hp: 145, damage: 42, rate: 1.15, speed: 320, chain: 3, requires: ["sun", "storm"], detail: "Bright magic leaps far" },
    bogroot: { label: "Bog root", glyph: "♒", color: "#62cba0", cost: 165, hp: 210, damage: 17, rate: 1.0, speed: 190, slow: 4.8, poison: 13, poisonTime: 5, requires: ["dew", "thorn"], detail: "Sticky mist and strong roots" },
    rainstorm: { label: "Rainstorm iris", glyph: "☂", color: "#7ccfe9", cost: 175, hp: 150, damage: 21, rate: .95, speed: 270, slow: 3.2, chain: 3, requires: ["dew", "storm"], detail: "Slowing magic jumps lanes" },
    thunderbriar: { label: "Thunder briar", glyph: "⌁", color: "#a8d474", cost: 185, hp: 175, damage: 14, rate: .58, speed: 300, chain: 2, poison: 10, poisonTime: 4, requires: ["thorn", "storm"], detail: "Rapid, jumping poison" }
  };

  const overlayFocus = {
    tutorial: "tutorialNext",
    pauseOverlay: "resumeButton",
    endOverlay: "restartButton",
    specializationOverlay: null
  };

  let W = 900;
  let H = 540;
  let dpr = 1;
  let board = {};
  let audioCtx = null;
  let soundOn = true;
  let soundTimes = {};
  let selectedKind = "basic";
  let selectedDefender = null;
  let keyboardCell = { row: 2, col: 2 };
  let running = false;
  let paused = false;
  let ended = false;
  let helpOpen = false;
  let choosingPath = false;
  let pathChoiceQueued = false;
  let tutorialMode = "intro";
  let tutorialStep = 0;
  let nectar = 250;
  let wave = 1;
  let spawnClock = 2.5;
  let spawnedThisWave = 0;
  let bossSpawnedThisWave = false;
  let pathSeeds = 0;
  let pathRanks = { sun: 0, dew: 0, thorn: 0, storm: 0 };
  let speedIndex = 0;
  let simulationAccumulator = 0;
  let nextId = 1;
  let lastTime = performance.now();
  let shake = 0;
  let flash = 0;
  let defenders = [];
  let enemies = [];
  let shots = [];
  let particles = [];
  let floaters = [];
  let drops = [];
  let runes = Array.from({ length: ROWS }, () => ({ ready: true, pulse: 0 }));

  const tutorialCopy = [
    "Pick a garden friend. Tap a glowing tile.",
    "Friends guard one path. Light becomes more nectar.",
    "A rune sweeps its path once. Guard it after that!",
    "Every fifth wave brings a boss seed. Choose paths. Combine paths."
  ];
  const tutorialScenes = [
    '<span class="demo-card">✿</span><span class="demo-arrow">➜</span><span class="demo-tile">▦</span>',
    '<span style="filter:drop-shadow(0 0 12px #ffd92e)">✦</span><span class="demo-arrow" style="color:#4ca467">↘</span><span class="demo-card">●</span>',
    '<span style="color:#4ad7ff">◆</span><span class="demo-arrow" style="color:#ef8957;transform:rotate(180deg)">➜</span><span style="filter:grayscale(.5)">●</span>',
    '<span style="color:#a25fd0">◈</span><span class="demo-arrow">➜</span><span style="color:#f0b52d">☀</span><span style="font-size:35px">+</span><span style="color:#54bbd2">≋</span>'
  ];

  function activeOverlay() {
    return ["tutorial", "specializationOverlay", "pauseOverlay", "endOverlay"]
      .map((id) => $("#" + id))
      .find((element) => !element.classList.contains("hidden")) || null;
  }

  function syncOverlayAccess(focusId = null) {
    const overlay = activeOverlay();
    const blocked = Boolean(overlay);
    document.querySelector(".topbar").inert = blocked;
    document.querySelector(".tray").inert = blocked;
    canvas.inert = blocked;
    const targetId = focusId || (overlay && overlayFocus[overlay.id]);
    const firstChoice = overlay?.querySelector("button:not(:disabled)");
    if (targetId) requestAnimationFrame(() => $("#" + targetId)?.focus());
    else if (firstChoice) requestAnimationFrame(() => firstChoice.focus());
    else if (!blocked && running) requestAnimationFrame(() => canvas.focus());
  }

  function showOverlay(id, focusId = null) {
    $("#" + id).classList.remove("hidden");
    syncOverlayAccess(focusId);
  }

  function hideOverlay(id, focusId = null) {
    $("#" + id).classList.add("hidden");
    syncOverlayAccess(focusId);
  }

  function reset() {
    nectar = 250;
    wave = 1;
    spawnClock = 2.5;
    spawnedThisWave = 0;
    bossSpawnedThisWave = false;
    pathSeeds = 0;
    pathRanks = { sun: 0, dew: 0, thorn: 0, storm: 0 };
    defenders = [];
    enemies = [];
    shots = [];
    particles = [];
    floaters = [];
    drops = [];
    runes = Array.from({ length: ROWS }, () => ({ ready: true, pulse: 0 }));
    selectedKind = "basic";
    selectedDefender = null;
    keyboardCell = { row: 2, col: 2 };
    ended = false;
    paused = false;
    helpOpen = false;
    choosingPath = false;
    pathChoiceQueued = false;
    speedIndex = 0;
    simulationAccumulator = 0;
    flash = 0;
    shake = 0;
    nextId = 1;
    lastTime = performance.now();
    running = true;
    $("#endOverlay").classList.add("hidden");
    $("#pauseOverlay").classList.add("hidden");
    $("#specializationOverlay").classList.add("hidden");
    $("#pauseButton").textContent = "‖";
    $("#pauseButton").title = "Pause";
    $("#pauseButton").setAttribute("aria-label", "Pause game");
    $("#pauseButton").setAttribute("aria-pressed", "false");
    renderTowerTray();
    updateUI();
    syncOverlayAccess();
  }

  function resize() {
    const previous = board.w ? { ...board } : null;
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    W = rect.width;
    H = rect.height;
    board = { x: W * .105, y: H * .075, w: W * .81, h: H * .86 };
    board.cw = board.w / COLS;
    board.rh = board.h / ROWS;
    if (previous) {
      const remapX = (x) => board.x + ((x - previous.x) / previous.w) * board.w;
      const remapY = (y) => board.y + ((y - previous.y) / previous.h) * board.h;
      enemies.forEach((enemy) => { enemy.x = remapX(enemy.x); });
      shots.forEach((shot) => {
        shot.x = remapX(shot.x);
        shot.y = board.y + (shot.row + .5) * board.rh - board.rh * .1;
      });
      drops.forEach((drop) => {
        drop.x = remapX(drop.x);
        drop.y = remapY(drop.y);
        drop.baseY = remapY(drop.baseY);
      });
      particles = [];
      floaters = [];
    }
  }

  function sound(type, pitch = 1) {
    if (!soundOn) return;
    const realNow = performance.now();
    const throttle = { shoot: 55, hit: 45, collect: 70 }[type] || 0;
    if (throttle && realNow - (soundTimes[type] || 0) < throttle) return;
    soundTimes[type] = realNow;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      const settings = {
        plant: [330, 520, .12, "sine"], shoot: [650, 420, .06, "triangle"],
        hit: [120, 70, .08, "square"], collect: [620, 980, .14, "sine"],
        rune: [180, 520, .4, "sawtooth"], upgrade: [440, 880, .3, "sine"],
        boss: [130, 390, .55, "triangle"], lose: [240, 90, .7, "sine"]
      }[type] || [300, 400, .1, "sine"];
      oscillator.type = settings[3];
      oscillator.frequency.setValueAtTime(settings[0] * pitch, now);
      oscillator.frequency.exponentialRampToValueAtTime(settings[1] * pitch, now + settings[2]);
      gain.gain.setValueAtTime(.052, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + settings[2]);
      oscillator.connect(gain).connect(audioCtx.destination);
      oscillator.start(now);
      oscillator.stop(now + settings[2]);
    } catch (_) {
      soundOn = false;
    }
  }

  function rnd(min, max) { return min + Math.random() * (max - min); }
  function center(defender) {
    return { x: board.x + (defender.col + .5) * board.cw, y: board.y + (defender.row + .5) * board.rh };
  }

  function puff(x, y, color, count = 8, speed = 50) {
    if (particles.length >= LIMITS.particles) return;
    if (reduceMotion) count = Math.ceil(count / 3);
    count = Math.min(count, LIMITS.particles - particles.length);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const velocity = rnd(speed * .3, speed);
      particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: rnd(.3, .65), max: .65, size: rnd(2, 6), color });
    }
  }

  function floater(x, y, text, color = "#fff") {
    if (floaters.length < LIMITS.floaters) floaters.push({ x, y, text, color, life: 1 });
  }

  function unlockedKinds() {
    return Object.keys(TOWERS).filter((kind) => TOWERS[kind].requires.every((path) => pathRanks[path] > 0));
  }

  function renderTowerTray() {
    const holder = $("#towerCards");
    const unlocked = unlockedKinds();
    holder.replaceChildren();
    unlocked.forEach((kind) => {
      const meta = TOWERS[kind];
      const button = document.createElement("button");
      button.className = "seed-card" + (meta.requires.length > 1 ? " combo" : "");
      button.dataset.kind = kind;
      button.style.setProperty("--tower-color", meta.color);
      button.setAttribute("aria-label", `${meta.label}, costs ${meta.cost} nectar. ${meta.detail}.`);
      button.setAttribute("aria-pressed", String(selectedKind === kind));
      button.title = `${meta.label}: ${meta.detail}`;

      if (meta.requires.length) {
        const requirement = document.createElement("span");
        requirement.className = "requirement";
        requirement.setAttribute("aria-hidden", "true");
        requirement.textContent = meta.requires.map((path) => PATHS[path].glyph).join("");
        button.append(requirement);
      }
      const symbol = document.createElement("span");
      symbol.className = "seed-symbol";
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = meta.glyph;
      const cost = document.createElement("span");
      cost.className = "cost";
      cost.innerHTML = `<b aria-hidden="true">✦</b>${meta.cost}`;
      button.append(symbol, cost);
      button.addEventListener("click", () => {
        selectedKind = kind;
        selectedDefender = null;
        sound("plant", 1.15);
        updateUI();
      });
      holder.append(button);
    });
  }

  function addDefender(row, col, kind) {
    const meta = TOWERS[kind];
    if (!meta || !meta.requires.every((path) => pathRanks[path] > 0)) return;
    if (nectar < meta.cost) {
      toast("✦ ?");
      sound("hit", .7);
      return;
    }
    if (defenders.some((defender) => defender.row === row && defender.col === col)) return;
    nectar -= meta.cost;
    const defender = {
      id: nextId++, row, col, kind, hp: meta.hp, maxHp: meta.hp,
      cooldown: rnd(.2, .8), level: 1, bob: Math.random() * TAU, incomeClock: 8
    };
    defenders.push(defender);
    selectedDefender = defender;
    selectedKind = kind;
    const point = center(defender);
    puff(point.x, point.y, meta.color, 14, 80);
    sound("plant");
    updateUI();
  }

  function upgradeCost(defender) {
    if (!defender || defender.level >= 3) return 0;
    return Math.ceil((TOWERS[defender.kind].cost * (.55 + defender.level * .38)) / 5) * 5;
  }

  function upgradeSelected() {
    const defender = selectedDefender;
    const cost = upgradeCost(defender);
    if (!defender || !defenders.includes(defender) || defender.level >= 3 || nectar < cost) return;
    nectar -= cost;
    defender.level++;
    defender.maxHp *= 1.38;
    defender.hp = defender.maxHp;
    const point = center(defender);
    puff(point.x, point.y, "#fff38a", 22, 100);
    floater(point.x, point.y, "★", "#fff38a");
    sound("upgrade");
    updateUI();
  }

  function waveTotal(whichWave = wave) {
    return Math.min(600, 6 + Math.floor(whichWave * 2.15 + Math.pow(whichWave, 1.12) * .55));
  }

  function spawnInterval() {
    return Math.max(.19, 1.55 * Math.pow(.967, wave - 1)) * rnd(.78, 1.22);
  }

  function chooseEnemyType() {
    const choices = [{ type: "mote", weight: 60 }];
    if (wave >= 3) choices.push({ type: "shell", weight: 11 + Math.min(13, wave * .45) });
    if (wave >= 5) choices.push({ type: "swift", weight: 10 + Math.min(10, wave * .3) });
    if (wave >= 8) choices.push({ type: "swarm", weight: 12 + Math.min(14, wave * .35) });
    if (wave >= 12) choices.push({ type: "brute", weight: 7 + Math.min(13, wave * .3) });
    const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
    let roll = Math.random() * total;
    for (const choice of choices) {
      roll -= choice.weight;
      if (roll <= 0) return choice.type;
    }
    return "mote";
  }

  function spawnEnemy(type = chooseEnemyType()) {
    const row = Math.floor(Math.random() * ROWS);
    const scale = Math.pow(1.086, wave - 1) * (1 + wave * .012);
    const definitions = {
      mote: { hp: 1, speed: 16, bite: 10, reward: 8 },
      shell: { hp: 2.8, speed: 10, bite: 16, reward: 14 },
      swift: { hp: .65, speed: 28, bite: 8, reward: 9 },
      swarm: { hp: .42, speed: 21, bite: 6, reward: 6 },
      brute: { hp: 4.5, speed: 7.5, bite: 25, reward: 21 },
      boss: { hp: 10 + wave * .25, speed: 6.8, bite: 34, reward: 60 + wave * 3 }
    };
    const stats = definitions[type];
    const hp = 54 * scale * stats.hp;
    enemies.push({
      id: nextId++, row, x: board.x + board.w + board.cw * rnd(.38, .7),
      hp, maxHp: hp, speed: stats.speed * (1 + Math.min(1.3, wave * .014)),
      biteDamage: stats.bite * (1 + wave * .035), reward: stats.reward,
      type, slow: 0, biteClock: 0, poisonTime: 0, poisonDps: 0,
      wobble: Math.random() * TAU, dead: false, rewarded: false
    });
    if (type === "boss") {
      bossSpawnedThisWave = true;
      sound("boss");
      toast(`◈  ∿ ${wave}`);
    }
  }

  function masteryMultiplier(meta) {
    return 1 + meta.requires.reduce((boost, path) => boost + Math.max(0, pathRanks[path] - 1) * .12, 0);
  }

  function shoot(defender) {
    if (shots.length >= LIMITS.shots) return;
    const meta = TOWERS[defender.kind];
    const point = center(defender);
    const levelPower = Math.pow(1.52, defender.level - 1);
    shots.push({
      x: point.x + board.cw * .19, y: point.y - board.rh * .1, row: defender.row,
      kind: defender.kind, color: meta.color, damage: meta.damage * levelPower * masteryMultiplier(meta),
      speed: meta.speed, slow: meta.slow || 0, splash: meta.splash || 0,
      chain: meta.chain || 0, poison: (meta.poison || 0) * levelPower,
      poisonTime: meta.poisonTime || 0, hitsLeft: 1 + (meta.pierce || 0), hitIds: [], life: 3.5
    });
    sound("shoot", meta.slow ? 1.3 : meta.splash ? .72 : meta.chain ? 1.55 : 1);
  }

  function addStatus(enemy, shot, factor = 1) {
    if (shot.slow) enemy.slow = Math.max(enemy.slow, shot.slow * factor);
    if (shot.poison) {
      enemy.poisonDps = Math.max(enemy.poisonDps, shot.poison * factor);
      enemy.poisonTime = Math.max(enemy.poisonTime, shot.poisonTime * factor);
    }
  }

  function damageEnemy(enemy, amount) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    if (enemy.hp > 0) return;
    enemy.dead = true;
    nectar += enemy.reward;
    const y = board.y + (enemy.row + .5) * board.rh;
    puff(enemy.x, y, enemy.type === "boss" ? "#e0b1ff" : "#9d78b8", enemy.type === "boss" ? 30 : 12, enemy.type === "boss" ? 130 : 75);
    if (enemy.type === "boss" && !enemy.rewarded) {
      enemy.rewarded = true;
      pathSeeds++;
      pathChoiceQueued = true;
      floater(enemy.x, y, "◈ +1", "#f1c7ff");
    }
  }

  function hitWithShot(shot, enemy) {
    damageEnemy(enemy, shot.damage);
    addStatus(enemy, shot);
    if (shot.splash) {
      enemies.forEach((other) => {
        if (other.dead || other === enemy) return;
        const distance = Math.hypot(other.x - enemy.x, (other.row - enemy.row) * board.rh);
        if (distance < board.rh * shot.splash) {
          damageEnemy(other, shot.damage * .62);
          addStatus(other, shot, .72);
        }
      });
      puff(enemy.x, board.y + (enemy.row + .5) * board.rh, shot.color, 15, 95);
    }
    if (shot.chain) {
      const nearby = enemies
        .filter((other) => !other.dead && other !== enemy && !shot.hitIds.includes(other.id))
        .map((other) => ({ other, distance: Math.hypot(other.x - enemy.x, (other.row - enemy.row) * board.rh) }))
        .filter((entry) => entry.distance < board.rh * 1.75)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, shot.chain);
      nearby.forEach((entry, index) => {
        damageEnemy(entry.other, shot.damage * (.58 - index * .07));
        addStatus(entry.other, shot, .65);
        puff(entry.other.x, board.y + (entry.other.row + .5) * board.rh, shot.color, 4, 45);
      });
    }
    puff(enemy.x, board.y + (enemy.row + .5) * board.rh, shot.color, 5, 35);
    sound("hit", shot.slow ? 1.4 : shot.chain ? 1.6 : 1);
  }

  function advanceWave() {
    const completedWave = wave;
    wave++;
    spawnedThisWave = 0;
    bossSpawnedThisWave = false;
    spawnClock = Math.max(1.35, 3.1 - wave * .018);
    const stipend = 25 + Math.min(80, Math.floor(wave * 2.5));
    nectar += stipend;
    const nextBoss = BOSS_EVERY - (wave % BOSS_EVERY || BOSS_EVERY);
    toast(completedWave % BOSS_EVERY === 0 ? `◈  ✦ +${stipend}` : `✦ +${stipend}   ∿ ${wave}${nextBoss === 1 ? "  ◈" : ""}`);
    sound("collect");
  }

  function openPathChoice() {
    if (!pathChoiceQueued || ended) return;
    pathChoiceQueued = false;
    choosingPath = true;
    updatePathChoiceUI();
    showOverlay("specializationOverlay");
    sound("upgrade", .8);
  }

  function choosePath(path) {
    if (!choosingPath || pathSeeds <= 0 || !PATHS[path]) return;
    const before = new Set(unlockedKinds());
    pathRanks[path]++;
    pathSeeds--;
    choosingPath = false;
    hideOverlay("specializationOverlay");
    renderTowerTray();
    const newlyUnlocked = unlockedKinds().filter((kind) => !before.has(kind));
    const unlockGlyphs = newlyUnlocked.map((kind) => TOWERS[kind].glyph).join(" ");
    toast(`${PATHS[path].glyph} ${"●".repeat(Math.min(4, pathRanks[path]))}${unlockGlyphs ? "   " + unlockGlyphs : ""}`);
    sound("upgrade", 1.15);
    updateUI();
    if (pathSeeds > 0) {
      pathChoiceQueued = true;
      requestAnimationFrame(openPathChoice);
    }
  }

  function updatePathChoiceUI() {
    $("#specializationSeedCount").textContent = pathSeeds;
    document.querySelectorAll(".path-choice").forEach((button) => {
      const path = button.dataset.path;
      const rank = pathRanks[path];
      const pips = button.querySelector(".path-pips");
      pips.textContent = rank ? "●".repeat(Math.min(rank, 5)) + (rank > 5 ? "+" : "") : "○";
      button.setAttribute("aria-label", `Choose ${PATHS[path].label} path. Owned rank ${rank}.`);
    });
  }

  function update(dt) {
    if (!running || paused || ended || helpOpen || choosingPath) return;

    spawnClock -= dt;
    const total = waveTotal();
    let spawnGuard = 0;
    while (spawnedThisWave < total && spawnClock <= 0 && spawnGuard < 8) {
      if (enemies.length >= LIMITS.enemies) {
        spawnClock = .1;
        break;
      }
      const bossIndex = Math.floor(total * .56);
      const shouldSpawnBoss = wave % BOSS_EVERY === 0 && !bossSpawnedThisWave && spawnedThisWave >= bossIndex;
      spawnEnemy(shouldSpawnBoss ? "boss" : chooseEnemyType());
      spawnedThisWave++;
      spawnClock += spawnInterval();
      spawnGuard++;
    }

    if (spawnedThisWave >= total && enemies.length === 0 && !pathChoiceQueued) advanceWave();

    const enemiesByRow = Array.from({ length: ROWS }, () => []);
    enemies.forEach((enemy) => { if (!enemy.dead) enemiesByRow[enemy.row].push(enemy); });
    enemiesByRow.forEach((row) => row.sort((a, b) => a.x - b.x));

    defenders.forEach((defender) => {
      const meta = TOWERS[defender.kind];
      defender.bob += dt * 2;
      defender.cooldown -= dt;
      const point = center(defender);
      if (meta.income) {
        defender.incomeClock -= dt;
        if (defender.incomeClock <= 0) {
          const value = 15 + defender.level * 7;
          if (drops.length < LIMITS.drops) drops.push({ x: point.x, y: point.y - 20, baseY: point.y, value, life: 9, phase: Math.random() * TAU });
          else nectar += value;
          defender.incomeClock += Math.max(5.4, 8.2 - defender.level * .9);
        }
        return;
      }
      const target = enemiesByRow[defender.row].find((enemy) => !enemy.dead && enemy.x > point.x - board.cw * .05);
      if (target && defender.cooldown <= 0) {
        shoot(defender);
        defender.cooldown += meta.rate * Math.pow(.72, defender.level - 1);
      }
    });

    shots.forEach((shot) => {
      if (shot.life <= 0) return;
      shot.x += shot.speed * (board.w / 729) * dt;
      shot.life -= dt;
      const hit = enemiesByRow[shot.row].find((enemy) => !enemy.dead && !shot.hitIds.includes(enemy.id) && Math.abs(enemy.x - shot.x) < board.cw * .28);
      if (!hit) return;
      shot.hitIds.push(hit.id);
      hitWithShot(shot, hit);
      shot.hitsLeft--;
      if (shot.hitsLeft <= 0) shot.life = 0;
    });
    shots = shots.filter((shot) => shot.life > 0 && shot.x < W + 40);

    const defendersByRow = Array.from({ length: ROWS }, () => []);
    defenders.forEach((defender) => defendersByRow[defender.row].push(defender));
    defendersByRow.forEach((row) => row.sort((a, b) => b.col - a.col));

    enemies.forEach((enemy) => {
      if (enemy.dead) return;
      enemy.slow = Math.max(0, enemy.slow - dt);
      enemy.wobble += dt * 5;
      if (enemy.poisonTime > 0) {
        enemy.poisonTime -= dt;
        damageEnemy(enemy, enemy.poisonDps * dt);
        if (enemy.dead) return;
      } else enemy.poisonDps = 0;

      const blocker = defendersByRow[enemy.row].find((defender) => {
        const point = center(defender);
        return enemy.x > point.x - board.cw * .32 && enemy.x < point.x + board.cw * .48;
      });
      if (blocker) {
        enemy.biteClock -= dt;
        if (enemy.biteClock <= 0) {
          blocker.hp -= enemy.biteDamage;
          enemy.biteClock += enemy.type === "swift" ? .65 : .85;
          const point = center(blocker);
          puff(point.x, point.y, "#8fd16e", 4, 30);
        }
      } else {
        enemy.x -= enemy.speed * (board.w / 729) * (enemy.slow > 0 ? .5 : 1) * dt;
      }
      if (enemy.x < board.x - board.cw * .15) triggerRune(enemy.row);
    });

    defenders.filter((defender) => defender.hp <= 0).forEach((defender) => {
      const point = center(defender);
      puff(point.x, point.y, "#8c6658", 14, 70);
      if (selectedDefender === defender) selectedDefender = null;
    });
    defenders = defenders.filter((defender) => defender.hp > 0);
    enemies = enemies.filter((enemy) => !enemy.dead);

    drops.forEach((drop) => {
      drop.life -= dt;
      drop.phase += dt * 3;
      drop.y = drop.baseY - board.rh * .22 + Math.sin(drop.phase) * 5;
    });
    drops.filter((drop) => drop.life <= 0).forEach((drop) => {
      nectar += drop.value;
      floater(drop.x, drop.y, `✦+${drop.value}`, "#fff284");
      sound("collect");
    });
    drops = drops.filter((drop) => drop.life > 0);

    particles.forEach((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 40 * dt;
      particle.vx *= .98;
    });
    particles = particles.filter((particle) => particle.life > 0);
    floaters.forEach((item) => { item.life -= dt; item.y -= 25 * dt; });
    floaters = floaters.filter((item) => item.life > 0);
    runes.forEach((rune) => { rune.pulse += dt * 2; });
    shake = Math.max(0, shake - dt * 25);
    flash = Math.max(0, flash - dt * 3);

    if (pathChoiceQueued) openPathChoice();
  }

  function triggerRune(row) {
    const rune = runes[row];
    if (rune.ready) {
      rune.ready = false;
      shake = reduceMotion ? 0 : 12;
      flash = reduceMotion ? 0 : .55;
      sound("rune");
      enemies.forEach((enemy) => {
        if (!enemy.dead && enemy.row === row) {
          damageEnemy(enemy, enemy.hp + 1);
          puff(enemy.x, board.y + (row + .5) * board.rh, "#60e6ff", 16, 140);
        }
      });
      toast("◇ 〰 ✦");
    } else finish();
  }

  function finish() {
    if (ended) return;
    ended = true;
    pathChoiceQueued = false;
    choosingPath = false;
    $("#specializationOverlay").classList.add("hidden");
    sound("lose");
    $("#endIcon").textContent = "🌱";
    $("#endTitle").textContent = `Wave ${wave}`;
    $("#endSummary").textContent = `The garden reached wave ${wave}.`;
    showOverlay("endOverlay", "restartButton");
  }

  function collectDrop(drop) {
    nectar += drop.value;
    floater(drop.x, drop.y, `✦+${drop.value}`, "#fff284");
    puff(drop.x, drop.y, "#fff37c", 12, 80);
    sound("collect");
    drops.splice(drops.indexOf(drop), 1);
    updateUI();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function pointer(event) {
    if (!running || paused || ended || helpOpen || choosingPath) return;
    event.preventDefault();
    const point = canvasPoint(event);
    const drop = drops.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < Math.min(board.rh, board.cw) * .45);
    if (drop) return collectDrop(drop);
    if (point.x < board.x || point.x > board.x + board.w || point.y < board.y || point.y > board.y + board.h) {
      selectedDefender = null;
      updateUI();
      return;
    }
    const col = Math.floor((point.x - board.x) / board.cw);
    const row = Math.floor((point.y - board.y) / board.rh);
    keyboardCell = { row, col };
    activateCell(row, col);
  }

  function activateCell(row, col) {
    const cellDrop = drops.find((drop) => {
      const dropCol = Math.floor((drop.x - board.x) / board.cw);
      const dropRow = Math.floor((drop.y - board.y) / board.rh);
      return dropCol === col && dropRow === row;
    });
    if (cellDrop) return collectDrop(cellDrop);
    const existing = defenders.find((defender) => defender.row === row && defender.col === col);
    if (existing) {
      selectedDefender = existing;
      selectedKind = null;
      sound("plant", .8);
      updateUI();
    } else if (selectedKind) addDefender(row, col, selectedKind);
    else {
      selectedKind = "basic";
      selectedDefender = null;
      updateUI();
    }
  }

  function updateUI() {
    $("#nectarCount").textContent = Math.floor(nectar);
    $("#waveCount").textContent = wave;
    const totalRanks = Object.values(pathRanks).reduce((sum, rank) => sum + rank, 0);
    $("#seedCount").textContent = totalRanks;
    $("#nectarStatus").setAttribute("aria-label", `${Math.floor(nectar)} nectar`);
    $("#waveStatus").setAttribute("aria-label", `Wave ${wave}${wave % BOSS_EVERY === 0 ? ", boss wave" : ""}`);
    $("#seedStatus").setAttribute("aria-label", `${totalRanks} garden path ranks chosen`);

    document.querySelectorAll(".seed-card").forEach((button) => {
      const kind = button.dataset.kind;
      const active = kind === selectedKind;
      button.classList.toggle("selected", active);
      button.classList.toggle("unaffordable", nectar < TOWERS[kind].cost);
      button.setAttribute("aria-pressed", String(active));
    });

    const cost = upgradeCost(selectedDefender);
    const canUpgrade = selectedDefender && defenders.includes(selectedDefender) && selectedDefender.level < 3 && nectar >= cost;
    $("#upgradeButton").disabled = !canUpgrade;
    $("#upgradeButton").classList.toggle("ready", Boolean(canUpgrade));
    $("#upgradeButton small").textContent = cost ? `✦${cost}` : "MAX";
    const upgradeLabel = !selectedDefender
      ? "Select a garden friend to upgrade"
      : cost
        ? `Upgrade selected garden friend, costs ${cost} nectar`
        : "Selected garden friend is fully upgraded";
    $("#upgradeButton").setAttribute("aria-label", upgradeLabel);

    const speed = SPEEDS[speedIndex];
    const nextSpeed = SPEEDS[(speedIndex + 1) % SPEEDS.length];
    $("#speedButton").textContent = `${speed}×`;
    $("#speedButton").setAttribute("aria-label", `Game speed ${speed} times. Activate for ${nextSpeed} times.`);
    $("#speedButton").title = `Speed: ${speed}×`;
  }

  let toastTimer;
  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 1400);
  }

  function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }
  function circle(x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
  }
  function leaf(x, y, radiusX, radiusY, rotation, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#4f9a72");
    gradient.addColorStop(1, "#276148");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#173b36";
    ctx.fillRect(0, 0, board.x * .76, H);
    ctx.fillStyle = "#31583f";
    ctx.fillRect(board.x + board.w, 0, W - (board.x + board.w), H);
    for (let i = 0; i < 28; i++) {
      const x = (i * 83) % Math.max(W, 1);
      const y = (i * 47) % Math.max(H, 1);
      circle(x, y, 1.5);
      ctx.fillStyle = "#d8ffba33";
      ctx.fill();
    }
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = board.x + col * board.cw;
        const y = board.y + row * board.rh;
        ctx.fillStyle = (row + col) % 2 ? "#73b66b" : "#7dc172";
        ctx.fillRect(x, y, board.cw + 1, board.rh + 1);
        ctx.fillStyle = "rgba(255,255,220,.08)";
        roundedRect(x + 3, y + 3, board.cw - 6, board.rh - 6, Math.min(10, board.rh * .12));
        ctx.fill();
        ctx.strokeStyle = "rgba(25,92,50,.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (document.activeElement === canvas) {
      const x = board.x + keyboardCell.col * board.cw;
      const y = board.y + keyboardCell.row * board.rh;
      ctx.strokeStyle = "#fff7a8";
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 5]);
      roundedRect(x + 4, y + 4, board.cw - 8, board.rh - 8, Math.min(11, board.rh * .12));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#386443";
    roundedRect(board.x - 3, board.y - 4, board.w + 6, 6, 3);
    ctx.fill();
    for (let row = 0; row < ROWS; row++) {
      const y = board.y + (row + .5) * board.rh;
      ctx.fillStyle = "#d8f4bb55";
      ctx.font = `${Math.max(14, board.rh * .27)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("‹", board.x + board.w + board.cw * .22, y);
    }
  }

  function drawRune(row) {
    const rune = runes[row];
    const x = board.x - board.cw * .55;
    const y = board.y + (row + .5) * board.rh;
    const size = Math.min(board.cw, board.rh) * .25;
    ctx.save();
    ctx.translate(x, y);
    if (rune.ready) {
      ctx.shadowColor = "#66eaff";
      ctx.shadowBlur = 10 + Math.sin(rune.pulse) * 5;
      ctx.fillStyle = "#68dff3";
    } else {
      ctx.fillStyle = "#485d57";
      ctx.shadowBlur = 0;
    }
    ctx.rotate(Math.PI / 4);
    roundedRect(-size, -size, size * 2, size * 2, size * .25);
    ctx.fill();
    ctx.strokeStyle = rune.ready ? "#e6ffff" : "#789087";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = rune.ready ? "#174c58" : "#2c3e38";
    circle(0, 0, size * .36);
    ctx.fill();
    ctx.restore();
  }

  function drawDefender(defender) {
    const meta = TOWERS[defender.kind];
    const point = center(defender);
    const size = Math.min(board.cw, board.rh);
    const bob = Math.sin(defender.bob) * size * .025;
    ctx.save();
    ctx.translate(point.x, point.y + bob);
    if (selectedDefender === defender) {
      ctx.strokeStyle = "#fff28a";
      ctx.lineWidth = 4;
      ctx.setLineDash([7, 5]);
      circle(0, 0, size * .39);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#28683f";
    ctx.fillRect(-size * .045, size * .02, size * .09, size * .3);
    leaf(-size * .12, size * .2, size * .16, size * .07, -.45, "#3f9d50");
    leaf(size * .12, size * .16, size * .16, size * .07, .5, "#55b95f");

    if (meta.income) {
      ctx.globalAlpha = .18;
      ctx.fillStyle = "#d8b6ff";
      circle(0, 0, size * .38);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f4dfba";
      roundedRect(-size * .1, -size * .06, size * .2, size * .35, size * .08);
      ctx.fill();
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#a969e1";
      ctx.beginPath();
      ctx.ellipse(0, -size * .12, size * .31, size * .18, 0, Math.PI, TAU);
      ctx.quadraticCurveTo(0, -size * .38, size * .31, -size * .12);
      ctx.fill();
    } else {
      const petalColors = meta.requires.length ? meta.requires.map((path) => PATHS[path].color) : [meta.color];
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 9;
      for (let i = 0; i < (meta.requires.length > 1 ? 8 : 6); i++) {
        const angle = i * TAU / (meta.requires.length > 1 ? 8 : 6);
        leaf(Math.cos(angle) * size * .19, -size * .12 + Math.sin(angle) * size * .19, size * .14, size * .085, angle, petalColors[i % petalColors.length]);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = meta.requires.length ? "#f7f2cf" : defender.kind === "ember" ? "#ffdc55" : defender.kind === "frost" ? "#d9ffff" : "#704b2d";
      circle(0, -size * .12, size * .17);
      ctx.fill();
      ctx.fillStyle = "#173c32";
      ctx.font = `bold ${size * (meta.requires.length > 1 ? .22 : .2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.glyph, 0, -size * .12);
    }
    ctx.shadowBlur = 0;
    if (defender.level > 1) {
      ctx.fillStyle = "#fff082";
      ctx.font = `bold ${size * .18}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("★".repeat(defender.level - 1), 0, -size * .43);
    }
    if (defender.hp < defender.maxHp) {
      ctx.fillStyle = "#26443b";
      roundedRect(-size * .3, size * .4, size * .6, 5, 3);
      ctx.fill();
      ctx.fillStyle = "#7ee37f";
      roundedRect(-size * .3, size * .4, size * .6 * Math.max(0, defender.hp / defender.maxHp), 5, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const y = board.y + (enemy.row + .5) * board.rh;
    const base = Math.min(board.cw, board.rh);
    const scale = enemy.type === "boss" ? 1.35 : enemy.type === "brute" ? 1.15 : enemy.type === "swarm" ? .68 : 1;
    const size = base * scale;
    const bob = Math.sin(enemy.wobble) * base * .035;
    ctx.save();
    ctx.translate(enemy.x, y + bob);
    if (enemy.slow > 0) { ctx.shadowColor = "#81efff"; ctx.shadowBlur = 12; }
    if (enemy.type === "boss") {
      ctx.shadowColor = "#d6a2ff";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#654679";
      roundedRect(-size * .34, -size * .3, size * .68, size * .66, size * .2);
      ctx.fill();
      ctx.fillStyle = "#d5a8e8";
      ctx.font = `bold ${size * .28}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("◈", 0, -size * .12);
    } else if (enemy.type === "shell" || enemy.type === "brute") {
      ctx.fillStyle = enemy.type === "brute" ? "#604d72" : "#6d5c83";
      roundedRect(-size * .3, -size * .28, size * .6, size * .62, size * .2);
      ctx.fill();
      ctx.fillStyle = enemy.type === "brute" ? "#d0b58b" : "#bba4c3";
      for (let i = -1; i <= 1; i++) {
        roundedRect(i * size * .16 - size * .07, -size * .3, size * .14, size * .16, 4);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = enemy.type === "swarm" ? "#a56aad" : enemy.type === "swift" ? "#9a55a3" : "#795a91";
      ctx.beginPath();
      ctx.ellipse(0, size * .04, size * (enemy.type === "swift" ? .25 : .3), size * (enemy.type === "swift" ? .34 : .3), 0, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff3bd";
    circle(-size * .09, -size * .05, size * .055);
    ctx.fill();
    circle(size * .09, -size * .05, size * .055);
    ctx.fill();
    ctx.fillStyle = "#1f2431";
    circle(-size * .075, -size * .04, size * .023);
    ctx.fill();
    circle(size * .105, -size * .04, size * .023);
    ctx.fill();
    if (enemy.type === "swift") {
      ctx.strokeStyle = "#e3b7f1";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(size * .28 + i * 5, -size * .1 + i * 8);
        ctx.lineTo(size * .44 + i * 5, -size * .1 + i * 8);
        ctx.stroke();
      }
    }
    if (enemy.poisonTime > 0) {
      ctx.fillStyle = "#9af06d";
      circle(-size * .22, size * .25, size * .04);
      ctx.fill();
      circle(size * .25, size * .18, size * .03);
      ctx.fill();
    }
    const barWidth = Math.min(base * .75, size * .62);
    ctx.fillStyle = "#26352f";
    roundedRect(-barWidth / 2, -size * .43, barWidth, 5, 3);
    ctx.fill();
    ctx.fillStyle = enemy.slow > 0 ? "#83efff" : enemy.type === "boss" ? "#efb0ff" : "#ff7780";
    roundedRect(-barWidth / 2, -size * .43, barWidth * Math.max(0, enemy.hp / enemy.maxHp), 5, 3);
    ctx.fill();
    ctx.restore();
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake && !reduceMotion) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
    drawBackground();
    runes.forEach((_, row) => drawRune(row));
    defenders.forEach(drawDefender);
    shots.forEach((shot) => {
      ctx.fillStyle = shot.color;
      ctx.shadowColor = shot.color;
      ctx.shadowBlur = 10;
      circle(shot.x, shot.y, shot.splash ? 8 : shot.chain ? 6 : 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    enemies.forEach(drawEnemy);
    drops.forEach((drop) => {
      ctx.save();
      ctx.translate(drop.x, drop.y);
      ctx.rotate((paused || reduceMotion ? 0 : now) * .001);
      ctx.fillStyle = "#fff27a";
      ctx.shadowColor = "#fff27a";
      ctx.shadowBlur = 15;
      ctx.font = `bold ${Math.min(board.cw, board.rh) * .36}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✦", 0, 0);
      ctx.restore();
    });
    particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      ctx.fillStyle = particle.color;
      circle(particle.x, particle.y, particle.size);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    floaters.forEach((item) => {
      ctx.globalAlpha = Math.max(0, item.life);
      ctx.fillStyle = item.color;
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.text, item.x, item.y);
    });
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = `rgba(120,240,255,${flash * .35})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function loop(now) {
    const frameDelta = Math.min(.1, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    simulationAccumulator += frameDelta * SPEEDS[speedIndex];
    let steps = 0;
    while (simulationAccumulator >= FIXED_STEP && steps < 90) {
      update(FIXED_STEP);
      simulationAccumulator -= FIXED_STEP;
      steps++;
    }
    if (steps >= 90) simulationAccumulator = 0;
    updateUI();
    draw(now);
    requestAnimationFrame(loop);
  }

  function renderTutorialStep() {
    $("#tutorialText").textContent = tutorialCopy[tutorialStep];
    document.querySelector(".tutorial-scene").innerHTML = tutorialScenes[tutorialStep];
    document.querySelectorAll(".tutorial-dots i").forEach((dot, index) => dot.classList.toggle("on", index === tutorialStep));
    $("#tutorialNext").setAttribute("aria-label", tutorialStep === tutorialCopy.length - 1 ? (tutorialMode === "intro" ? "Start game" : "Return to game") : "Next tutorial step");
  }

  function openHelp() {
    if (!running || ended || paused || choosingPath) return;
    tutorialMode = "help";
    tutorialStep = 0;
    helpOpen = true;
    renderTutorialStep();
    showOverlay("tutorial", "tutorialNext");
  }

  function togglePause() {
    if (ended || !running || helpOpen || choosingPath) return;
    paused = !paused;
    if (paused) {
      shake = 0;
      flash = 0;
      showOverlay("pauseOverlay", "resumeButton");
    } else hideOverlay("pauseOverlay");
    $("#pauseButton").textContent = paused ? "▶" : "‖";
    $("#pauseButton").title = paused ? "Resume" : "Pause";
    $("#pauseButton").setAttribute("aria-label", paused ? "Resume game" : "Pause game");
    $("#pauseButton").setAttribute("aria-pressed", String(paused));
  }

  canvas.addEventListener("pointerdown", pointer);
  $("#upgradeButton").addEventListener("click", upgradeSelected);
  $("#speedButton").addEventListener("click", () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    simulationAccumulator = 0;
    toast(`${SPEEDS[speedIndex]}×`);
    sound("plant", .65 + speedIndex * .14);
    updateUI();
  });
  $("#soundButton").addEventListener("click", () => {
    soundOn = !soundOn;
    $("#soundButton").textContent = soundOn ? "♫" : "×";
    $("#soundButton").title = soundOn ? "Sound on" : "Sound off";
    $("#soundButton").setAttribute("aria-label", soundOn ? "Mute sound" : "Turn sound on");
    $("#soundButton").setAttribute("aria-pressed", String(!soundOn));
    if (soundOn) sound("collect");
  });
  $("#helpButton").addEventListener("click", openHelp);
  $("#pauseButton").addEventListener("click", togglePause);
  $("#resumeButton").addEventListener("click", togglePause);

  const fullscreenButton = $("#fullscreenButton");
  const fullscreenSupported = Boolean(document.fullscreenEnabled && $("#app").requestFullscreen);
  fullscreenButton.hidden = !fullscreenSupported;
  fullscreenButton.addEventListener("click", () => {
    const action = !document.fullscreenElement ? $("#app").requestFullscreen?.() : document.exitFullscreen?.();
    action?.catch?.(() => {});
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === $("#app");
    fullscreenButton.textContent = active ? "×" : "⛶";
    fullscreenButton.title = active ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
    fullscreenButton.setAttribute("aria-pressed", String(active));
    lastTime = performance.now();
    simulationAccumulator = 0;
    resize();
  });

  $("#restartButton").addEventListener("click", reset);
  $("#tutorialNext").addEventListener("click", () => {
    tutorialStep++;
    if (tutorialStep < tutorialCopy.length) {
      renderTutorialStep();
      return;
    }
    hideOverlay("tutorial");
    if (tutorialMode === "intro") reset();
    else {
      helpOpen = false;
      tutorialStep = 0;
      lastTime = performance.now();
      simulationAccumulator = 0;
      sound("plant");
    }
  });
  document.querySelectorAll(".path-choice").forEach((button) => button.addEventListener("click", () => choosePath(button.dataset.path)));

  // Losing focus never changes the player's pause state. Resetting the clock only
  // prevents a throttled background tab from creating a giant catch-up frame.
  document.addEventListener("visibilitychange", () => {
    lastTime = performance.now();
    simulationAccumulator = 0;
  });
  window.addEventListener("blur", () => {
    lastTime = performance.now();
    simulationAccumulator = 0;
  });

  document.addEventListener("keydown", (event) => {
    const overlay = activeOverlay();
    if (overlay && event.code === "Tab") {
      const choices = [...overlay.querySelectorAll("button:not(:disabled)")];
      if (choices.length) {
        event.preventDefault();
        const current = choices.indexOf(document.activeElement);
        const next = event.shiftKey ? (current <= 0 ? choices.length - 1 : current - 1) : (current + 1) % choices.length;
        choices[next].focus();
      }
      return;
    }
    if (overlay?.id === "pauseOverlay" && event.code === "Escape") {
      event.preventDefault();
      togglePause();
      return;
    }
    if (overlay?.id === "tutorial" && tutorialMode === "help" && event.code === "Escape") {
      event.preventDefault();
      tutorialStep = tutorialCopy.length - 1;
      $("#tutorialNext").click();
      return;
    }
    if (overlay) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, a")) return;
    if (document.activeElement === canvas && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.code)) {
      event.preventDefault();
      if (event.code === "ArrowUp") keyboardCell.row = Math.max(0, keyboardCell.row - 1);
      if (event.code === "ArrowDown") keyboardCell.row = Math.min(ROWS - 1, keyboardCell.row + 1);
      if (event.code === "ArrowLeft") keyboardCell.col = Math.max(0, keyboardCell.col - 1);
      if (event.code === "ArrowRight") keyboardCell.col = Math.min(COLS - 1, keyboardCell.col + 1);
      if (event.code === "Enter" && running && !paused && !ended) activateCell(keyboardCell.row, keyboardCell.col);
      return;
    }
    if ((event.code === "Escape" || event.code === "Space") && running && !ended) {
      event.preventDefault();
      togglePause();
    }
  });

  window.addEventListener("resize", resize);
  resize();
  renderTowerTray();
  renderTutorialStep();
  updateUI();
  syncOverlayAccess("tutorialNext");
  requestAnimationFrame(loop);
})();
