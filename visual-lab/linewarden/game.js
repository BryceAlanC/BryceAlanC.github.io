(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const WORLD = { w: 1600, h: 900 };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const ui = {
    gold: $('gold'), income: $('income'), tickFill: $('tickFill'), wave: $('waveLabel'), timer: $('waveTimer'), threat: $('threatLabel'),
    level: $('level'), hpText: $('hpText'), hpFill: $('hpFill'), xpText: $('xpText'), xpFill: $('xpFill'),
    crystalText: $('crystalText'), crystalFill: $('crystalFill'), announce: $('announce'), note: $('floatNote'), live: $('liveRegion'),
    bossBar: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), bossProgress: $('bossProgress'),
    healthProgress: $('healthProgress'), xpProgress: $('xpProgress'), crystalProgress: $('crystalProgress')
  };

  const summonDefs = {
    runner: { cost: 25, income: 2, count: 1, hp: 65, speed: 116, damage: 17, reward: 7, xp: 12, r: 17, color: '#ff6577' },
    bulwark: { cost: 70, income: 6, count: 1, hp: 310, speed: 43, damage: 42, reward: 18, xp: 30, r: 28, armor: .22, color: '#d66088' },
    swarm: { cost: 90, income: 8, count: 5, hp: 70, speed: 88, damage: 12, reward: 5, xp: 8, r: 14, color: '#ff8d78' },
    brute: { cost: 170, income: 16, count: 1, hp: 850, speed: 34, damage: 75, reward: 42, xp: 75, r: 40, armor: .15, color: '#bf72df' }
  };
  const upgradeBase = { might: 80, vigor: 90, focus: 110, repair: 70 };
  const keys = {};
  const pointer = { x: 850, y: 450, active: false };
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
      started: false, paused: false, over: false, time: 0, gold: 120, income: 10, incomeClock: 0,
      wave: 0, nextAmbient: 1, nextBoss: 60, shake: 0, flash: 0, dangerSpent: 0,
      hero: { x: 1010, y: 450, r: 24, hp: 240, maxHp: 240, level: 1, xp: 0, xpNeed: 60, damage: 30, attackCd: 0, attackRate: .62, speed: 250, focus: 0, aimX: -1, aimY: 0, destination: null, invuln: 0 },
      crystal: { x: 1370, y: 450, r: 53, hp: 1000, maxHp: 1000, pulse: 0 },
      enemies: [], projectiles: [], particles: [], slashes: [], sentinels: [],
      cooldowns: { dash: 0, nova: 0, sentinel: 0 },
      maxCooldowns: { dash: 5, nova: 9, sentinel: 18 },
      upgrades: { might: 0, vigor: 0, focus: 0 }, boss: null, spawnId: 0
    };
  }

  function reset() {
    game = initialState();
    last = performance.now();
    updateUI();
    document.querySelectorAll('.summon-card').forEach(b => b.classList.toggle('locked', b.dataset.summon === 'brute'));
    $('bruteNote').textContent = 'Unlocks level 4';
    ui.bossBar.hidden = true;
    ui.bossBar.classList.add('hidden');
    ui.bossName.textContent = 'THE IRON WITNESS';
    ui.bossFill.style.width = '100%';
    ui.bossProgress.setAttribute('aria-valuenow', '100');
    $('gameOverOverlay').classList.remove('open');
    syncOverlayAccess();
    announce('THE WATCH BEGINS', 'Ambient wave approaching');
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
    game.paused = force === undefined ? !game.paused : force;
    if (game.paused) showOverlay('pauseOverlay', 'resumeBtn'); else hideOverlay('pauseOverlay', false);
    $('pauseBtn').textContent = game.paused ? '▶' : 'Ⅱ';
    $('pauseBtn').setAttribute('aria-label', game.paused ? 'Resume game' : 'Pause game');
    $('pauseBtn').setAttribute('aria-pressed', String(game.paused));
    if (game.paused) { game.shake = 0; game.flash = 0; game.enemies.forEach(enemy => { enemy.hit = 0; }); Object.keys(keys).forEach(key => { keys[key] = false; }); }
  }

  function spawnEnemy(def, playerMade = false, offset = 0, boss = false) {
    const laneY = 265 + Math.random() * 370;
    const scale = 1 + Math.min(game.time / 280, .8);
    const enemy = {
      id: ++game.spawnId, x: -50 - offset, y: laneY, r: def.r, hp: def.hp * scale, maxHp: def.hp * scale,
      speed: def.speed, damage: def.damage * scale, reward: def.reward, xp: def.xp, armor: def.armor || 0,
      color: def.color, playerMade, boss, attackCd: 0, slow: 0, slowTimer: 0, hit: 0, phase: Math.random() * 6.28
    };
    game.enemies.push(enemy);
    return enemy;
  }

  function ambientSpawn() {
    const t = game.time;
    const count = Math.min(2 + Math.floor(t / 40), 10);
    const pool = [
      { hp: 62, speed: 62, damage: 15, reward: 7, xp: 11, r: 17, color: '#de5267' },
      { hp: 130, speed: 44, damage: 24, reward: 12, xp: 18, r: 23, color: '#a95572', armor: .08 },
      { hp: 46, speed: 102, damage: 11, reward: 6, xp: 9, r: 13, color: '#ee7c69' }
    ];
    for (let i = 0; i < count; i++) spawnEnemy(pool[Math.floor(Math.random() * Math.min(pool.length, 1 + Math.floor(t / 45)))], false, i * 34);
    announce(`WAVE ${game.wave}`, `${count} signatures detected`);
    tone(115, .13, 'sawtooth', .045);
  }

  function spawnBoss() {
    const n = Math.floor(game.time / 60);
    const names = ['THE IRON WITNESS', 'ASHEN COLOSSUS', 'THE HOLLOW CROWN'];
    const def = { hp: 1900 + n * 620, speed: 27 + n * 2, damage: 105 + n * 15, reward: 190 + n * 50, xp: 180, r: 58, armor: .2, color: '#ed4f78' };
    game.boss = spawnEnemy(def, false, 0, true);
    game.boss.name = names[(n - 1) % names.length];
    ui.bossName.textContent = game.boss.name;
    ui.bossBar.hidden = false;
    ui.bossBar.classList.remove('hidden');
    announce('BOSS INBOUND', game.boss.name);
    game.shake = 10;
    tone(60, .45, 'sawtooth', .08);
  }

  function buySummon(type) {
    if (!game.started || game.paused || game.over) return;
    const d = summonDefs[type];
    if (type === 'brute' && game.hero.level < 4) return note('REACH LEVEL 4');
    if (game.gold < d.cost) return note('NOT ENOUGH GOLD');
    game.gold -= d.cost;
    game.income += d.income;
    game.dangerSpent += d.cost;
    for (let i = 0; i < d.count; i++) spawnEnemy(d, true, i * 28);
    note(`+${d.income} INCOME • THREAT DEPLOYED`);
    ui.live.textContent = `${type} summoned. Recurring income increased by ${d.income}.`;
    tone(190, .08, 'square', .035); setTimeout(() => tone(280, .1, 'square', .025), 80);
    updateUI();
  }

  function upgradeCost(type) {
    if (type === 'repair') return upgradeBase.repair;
    return Math.round(upgradeBase[type] * Math.pow(1.55, game.upgrades[type]));
  }

  function buyUpgrade(type) {
    if (!game.started || game.paused || game.over) return;
    if (type === 'focus' && game.hero.focus >= .35) return note('FOCUS AT MAXIMUM');
    const cost = upgradeCost(type);
    if (game.gold < cost) return note('NOT ENOUGH GOLD');
    if (type === 'repair' && game.crystal.hp >= game.crystal.maxHp) return note('CRYSTAL AT FULL POWER');
    game.gold -= cost;
    if (type === 'might') { game.upgrades.might++; game.hero.damage *= 1.2; }
    if (type === 'vigor') { game.upgrades.vigor++; game.hero.maxHp += 45; game.hero.hp += 45; }
    if (type === 'focus') { game.upgrades.focus++; game.hero.focus = Math.min(.35, game.hero.focus + .07); }
    if (type === 'repair') game.crystal.hp = Math.min(game.crystal.maxHp, game.crystal.hp + 260);
    note(type === 'repair' ? 'CRYSTAL RESTORED' : `${type.toUpperCase()} UPGRADED`);
    tone(420, .1, 'sine', .04); setTimeout(() => tone(620, .12, 'sine', .03), 85);
    updateUI();
  }

  function ability(name) {
    if (!game.started || game.paused || game.over || game.cooldowns[name] > 0) return;
    const h = game.hero;
    if (name === 'dash') {
      let dx = h.aimX, dy = h.aimY;
      if (h.destination) { dx = h.destination.x - h.x; dy = h.destination.y - h.y; }
      const mag = Math.hypot(dx, dy) || 1; dx /= mag; dy /= mag;
      const sx = h.x, sy = h.y;
      h.x = clamp(h.x + dx * 230, 170, 1440); h.y = clamp(h.y + dy * 230, 145, 755); h.invuln = .3;
      [...game.enemies].forEach(e => { if (pointLineDistance(e.x, e.y, sx, sy, h.x, h.y) < e.r + 25) damageEnemy(e, h.damage * 1.8); });
      game.slashes.push({ x1: sx, y1: sy, x2: h.x, y2: h.y, life: .28, max: .28, color: '#70e7df' });
      game.shake = 4; tone(210, .12, 'sawtooth', .045);
    } else if (name === 'nova') {
      [...game.enemies].forEach(e => { const d = dist(h, e); if (d < 220 + e.r) { damageEnemy(e, h.damage * 2.1); if (e.hp > 0) { e.slow = .45; e.slowTimer = 3; } } });
      game.slashes.push({ x: h.x, y: h.y, radius: 20, maxRadius: 235, life: .55, max: .55, ring: true, color: '#b48cff' });
      game.shake = 5; burst(h.x, h.y, '#b48cff', 20); tone(310, .3, 'sine', .055);
    } else {
      game.sentinels.push({ x: game.crystal.x - 85, y: game.crystal.y - 95, life: 10, attackCd: 0, phase: 0 });
      burst(game.crystal.x - 85, game.crystal.y - 95, '#ffd269', 16); tone(520, .25, 'triangle', .05);
    }
    game.cooldowns[name] = game.maxCooldowns[name] * (1 - h.focus);
  }

  function update(dt) {
    if (!game.started || game.paused || game.over) return;
    game.time += dt; game.incomeClock += dt; game.shake = Math.max(0, game.shake - dt * 18); game.flash = Math.max(0, game.flash - dt * 3);
    Object.keys(game.cooldowns).forEach(k => game.cooldowns[k] = Math.max(0, game.cooldowns[k] - dt));
    const h = game.hero; h.attackCd -= dt; h.invuln = Math.max(0, h.invuln - dt);
    if (game.incomeClock >= 5) { game.incomeClock -= 5; game.gold += game.income; note(`PAYDAY +${game.income} GOLD`); tone(680, .07, 'sine', .025); }
    const interval = Math.max(7.5, 14 - game.time / 70);
    if (game.time >= game.nextAmbient) { game.wave++; ambientSpawn(); game.nextAmbient = game.time + interval; }
    if (game.time >= game.nextBoss) { if (!game.boss) spawnBoss(); game.nextBoss += 60; }

    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (pointer.stickX || 0);
    let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + (pointer.stickY || 0);
    if (mx || my) { const m = Math.hypot(mx, my); mx /= m; my /= m; h.x += mx * h.speed * dt; h.y += my * h.speed * dt; h.aimX = mx; h.aimY = my; h.destination = null; }
    else if (h.destination) { const dx = h.destination.x - h.x, dy = h.destination.y - h.y, d = Math.hypot(dx, dy); if (d > 8) { h.x += dx / d * Math.min(h.speed * dt, d); h.y += dy / d * Math.min(h.speed * dt, d); h.aimX = dx / d; h.aimY = dy / d; } else h.destination = null; }
    h.x = clamp(h.x, 145, 1450); h.y = clamp(h.y, 125, 775);

    let target = null, best = 230;
    game.enemies.forEach(e => { const d = dist(h, e); if (d < best) { best = d; target = e; } });
    if (target && h.attackCd <= 0) {
      h.attackCd = h.attackRate; const dx = target.x - h.x, dy = target.y - h.y, m = Math.hypot(dx, dy); h.aimX = dx / m; h.aimY = dy / m;
      game.projectiles.push({ x: h.x + h.aimX * 26, y: h.y + h.aimY * 26, target, speed: 720, damage: h.damage, color: '#8ffff4', r: 5, hero: true });
      tone(330 + Math.random() * 50, .04, 'square', .018);
    }

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i]; e.attackCd -= dt; e.hit = Math.max(0, e.hit - dt * 5); e.phase += dt * 3;
      if (e.slowTimer > 0) e.slowTimer -= dt; else e.slow = 0;
      const heroD = dist(e, h), crystalD = dist(e, game.crystal);
      let targetObj = heroD < 120 ? h : game.crystal;
      const d = targetObj === h ? heroD : crystalD;
      if (d > e.r + targetObj.r + 4) {
        const dx = targetObj.x - e.x, dy = targetObj.y - e.y, m = Math.hypot(dx, dy) || 1;
        e.x += dx / m * e.speed * (1 - e.slow) * dt; e.y += dy / m * e.speed * (1 - e.slow) * dt;
      } else if (e.attackCd <= 0) {
        e.attackCd = e.boss ? 1.1 : 1.35;
        if (targetObj === h) {
          if (h.invuln <= 0) { h.hp -= e.damage; h.invuln = .25; burst(h.x, h.y, '#ff6577', 6); }
        } else { game.crystal.hp -= e.damage; game.crystal.pulse = 1; game.shake = Math.max(game.shake, e.boss ? 12 : 4); burst(game.crystal.x - 20, game.crystal.y, '#ff6577', 8); }
      }
    }

    if (h.hp <= 0) { h.hp = Math.max(80, h.maxHp * .45); h.x = game.crystal.x - 150; h.y = game.crystal.y; game.crystal.hp -= 120; note('WARDEN DOWN • CRYSTAL OVERLOAD'); }
    game.crystal.pulse = Math.max(0, game.crystal.pulse - dt * 2);
    if (game.crystal.hp <= 0) endGame();

    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i];
      if (!p.target || p.target.hp <= 0) { game.projectiles.splice(i, 1); continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
      if (d < p.target.r + 8) { damageEnemy(p.target, p.damage); game.projectiles.splice(i, 1); continue; }
      p.x += dx / d * p.speed * dt; p.y += dy / d * p.speed * dt;
    }
    for (let i = game.sentinels.length - 1; i >= 0; i--) {
      const s = game.sentinels[i]; s.life -= dt; s.attackCd -= dt; s.phase += dt * 4;
      if (s.life <= 0) { game.sentinels.splice(i, 1); continue; }
      if (s.attackCd <= 0) { let t = null, bd = 430; game.enemies.forEach(e => { const d = dist(s, e); if (d < bd) { bd = d; t = e; } }); if (t) { s.attackCd = .5; game.projectiles.push({ x:s.x,y:s.y,target:t,speed:820,damage:h.damage*.7,color:'#ffd269',r:4 }); } }
    }
    for (let i = game.particles.length - 1; i >= 0; i--) { const p = game.particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; if (p.life <= 0) game.particles.splice(i, 1); }
    for (let i = game.slashes.length - 1; i >= 0; i--) { const s = game.slashes[i]; s.life -= dt; if (s.ring) s.radius += (s.maxRadius - s.radius) * dt * 9; if (s.life <= 0) game.slashes.splice(i, 1); }
    updateUI();
  }

  function damageEnemy(e, amount) {
    e.hp -= amount * (1 - e.armor); e.hit = 1; burst(e.x, e.y, e.color, e.boss ? 6 : 3);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    const idx = game.enemies.indexOf(e); if (idx < 0) return;
    game.enemies.splice(idx, 1); game.gold += e.reward; addXp(e.xp); burst(e.x, e.y, e.color, e.boss ? 35 : 10);
    if (e === game.boss) { game.boss = null; ui.bossBar.hidden = true; ui.bossBar.classList.add('hidden'); announce('MILESTONE CLEARED', `+${e.reward} gold bounty`); tone(180, .15, 'square', .06); setTimeout(() => tone(360, .22, 'sine', .05), 150); }
  }
  function addXp(xp) {
    const h = game.hero; h.xp += xp;
    while (h.xp >= h.xpNeed) { h.xp -= h.xpNeed; h.level++; h.xpNeed = Math.round(h.xpNeed * 1.4); h.maxHp += 25; h.hp = h.maxHp; h.damage += 5; announce(`LEVEL ${h.level}`, '+health • +damage'); tone(480, .12, 'sine', .05); if (h.level === 4) { document.querySelector('[data-summon="brute"]').classList.remove('locked'); $('bruteNote').textContent = 'Elite • Crushing'; } }
  }

  function burst(x, y, color, count) {
    if (reducedMotion) count = Math.min(count, 4);
    for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 130; game.particles.push({ x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.3+Math.random()*.45,max:.75,color,size:2+Math.random()*3 }); }
    if (game.particles.length > 500) game.particles.splice(0, game.particles.length - 500);
  }

  function draw() {
    const w = canvas.width, h = canvas.height, scale = Math.min(w / WORLD.w, h / WORLD.h), ox = (w - WORLD.w * scale) / 2, oy = (h - WORLD.h * scale) / 2;
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h); ctx.fillStyle='#050b11'; ctx.fillRect(0,0,w,h);
    const shakeX = reducedMotion ? 0 : (Math.random()-.5)*game.shake*scale, shakeY = reducedMotion ? 0 : (Math.random()-.5)*game.shake*scale;
    ctx.save(); ctx.translate(ox + shakeX, oy + shakeY); ctx.scale(scale,scale);
    drawArena();
    game.slashes.forEach(drawSlash);
    game.sentinels.forEach(drawSentinel);
    game.enemies.forEach(drawEnemy);
    drawCrystal(); drawHero();
    game.projectiles.forEach(drawProjectile);
    game.particles.forEach(drawParticle);
    ctx.restore();
  }

  function drawArena() {
    const g = ctx.createLinearGradient(0,0,WORLD.w,0); g.addColorStop(0,'#081119'); g.addColorStop(.62,'#0b1c25'); g.addColorStop(1,'#08151d'); ctx.fillStyle=g; ctx.fillRect(0,0,WORLD.w,WORLD.h);
    ctx.save(); ctx.strokeStyle='rgba(102,190,197,.055)'; ctx.lineWidth=1;
    for(let x=0;x<WORLD.w;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.h);ctx.stroke()} for(let y=0;y<WORLD.h;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD.w,y);ctx.stroke()}
    ctx.strokeStyle='rgba(112,231,223,.13)';ctx.lineWidth=2;ctx.setLineDash([12,18]);ctx.beginPath();ctx.moveTo(0,450);ctx.lineTo(1450,450);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(112,231,223,.03)';ctx.fillRect(1180,115,300,670);ctx.strokeStyle='rgba(112,231,223,.15)';ctx.strokeRect(1180,115,300,670);
    for(let i=0;i<6;i++){const x=250+i*205;ctx.strokeStyle='rgba(112,231,223,.08)';ctx.beginPath();ctx.arc(x,450,70+(i%2)*35,0,Math.PI*2);ctx.stroke()}
    ctx.restore();
  }
  function drawCrystal() {
    const c=game.crystal,t=game.time,pulse=1+Math.sin(t*3)*.025+c.pulse*.08;ctx.save();ctx.translate(c.x,c.y);ctx.scale(pulse,pulse);
    const glow=ctx.createRadialGradient(0,0,5,0,0,110);glow.addColorStop(0,'rgba(112,231,223,.38)');glow.addColorStop(1,'rgba(112,231,223,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,110,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(112,231,223,.35)';ctx.lineWidth=3;ctx.rotate(t*.13);for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(65,0);ctx.lineTo(90,0);ctx.stroke()}ctx.rotate(-t*.13);
    ctx.fillStyle=c.pulse>0?'#fff':'#7df8ee';ctx.shadowBlur=24;ctx.shadowColor='#39d8dd';ctx.beginPath();ctx.moveTo(0,-62);ctx.lineTo(35,-15);ctx.lineTo(20,50);ctx.lineTo(0,70);ctx.lineTo(-20,50);ctx.lineTo(-35,-15);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#164c5a';ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(17,-8);ctx.lineTo(0,45);ctx.lineTo(-17,-8);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawHero() {
    const h=game.hero;ctx.save();ctx.translate(h.x,h.y);ctx.rotate(Math.atan2(h.aimY,h.aimX));
    if(h.invuln>0){ctx.globalAlpha=.7;ctx.strokeStyle='#fff';ctx.beginPath();ctx.arc(0,0,h.r+9,0,Math.PI*2);ctx.stroke()}
    ctx.shadowBlur=18;ctx.shadowColor='#70e7df';ctx.fillStyle='#70e7df';ctx.beginPath();ctx.moveTo(29,0);ctx.lineTo(-13,21);ctx.lineTo(-4,0);ctx.lineTo(-13,-21);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#123643';ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-12,11);ctx.lineTo(-4,0);ctx.lineTo(-12,-11);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawEnemy(e) {
    ctx.save();ctx.translate(e.x,e.y);const bob=Math.sin(e.phase)*2;ctx.translate(0,bob);if(e.hit>0){ctx.globalAlpha=.75+Math.random()*.25;ctx.shadowBlur=22}else ctx.shadowBlur=e.playerMade?15:7;ctx.shadowColor=e.color;ctx.fillStyle=e.hit>0?'#fff':e.color;
    ctx.beginPath();const points=e.boss?10:6;for(let i=0;i<points;i++){const a=i/points*Math.PI*2,r=e.r*(i%2?0.7:1);const x=Math.cos(a)*r,y=Math.sin(a)*r;(i?ctx.lineTo(x,y):ctx.moveTo(x,y))}ctx.closePath();ctx.fill();
    ctx.fillStyle='#091016';ctx.beginPath();ctx.arc(e.r*.24,-e.r*.12,Math.max(2,e.r*.12),0,Math.PI*2);ctx.fill();ctx.restore();
    if(e.hp<e.maxHp||e.boss){ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(e.x-e.r,e.y-e.r-11,e.r*2,4);ctx.fillStyle=e.boss?'#ff6577':e.playerMade?'#b48cff':'#d95c6d';ctx.fillRect(e.x-e.r,e.y-e.r-11,e.r*2*Math.max(0,e.hp/e.maxHp),4)}
    if(e.playerMade){ctx.fillStyle='#b48cff';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText('SELF-SUMMONED',e.x,e.y+e.r+16)}
  }
  function drawSentinel(s){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.phase);ctx.strokeStyle='#ffd269';ctx.lineWidth=3;ctx.shadowBlur=15;ctx.shadowColor='#ffd269';ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*Math.PI*2,x=Math.cos(a)*19,y=Math.sin(a)*19;(i?ctx.lineTo(x,y):ctx.moveTo(x,y))}ctx.closePath();ctx.stroke();ctx.fillStyle='#ffd269';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawProjectile(p){ctx.save();ctx.shadowBlur=16;ctx.shadowColor=p.color;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawParticle(p){ctx.save();ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);ctx.restore()}
  function drawSlash(s){ctx.save();ctx.globalAlpha=Math.max(0,s.life/s.max);ctx.strokeStyle=s.color;ctx.shadowBlur=18;ctx.shadowColor=s.color;ctx.lineWidth=9*(s.life/s.max);if(s.ring){ctx.beginPath();ctx.arc(s.x,s.y,s.radius,0,Math.PI*2);ctx.stroke()}else{ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke()}ctx.restore()}

  function updateUI() {
    const h=game.hero,c=game.crystal;ui.gold.textContent=Math.floor(game.gold);ui.income.textContent=`+${game.income}`;ui.tickFill.style.width=`${game.incomeClock/5*100}%`;
    ui.wave.textContent=`WAVE ${Math.max(1,game.wave)}`;ui.timer.textContent=formatTime(game.time);const threat=game.enemies.reduce((n,e)=>n+e.hp/100,0);ui.threat.textContent=`THREAT ${threat>18?'CRITICAL':threat>8?'HIGH':threat>3?'RISING':'LOW'}`;ui.threat.style.color=threat>8?'#ff6577':'';
    ui.level.textContent=h.level;ui.hpText.textContent=`${Math.ceil(h.hp)} / ${h.maxHp}`;ui.hpFill.style.width=`${clamp(h.hp/h.maxHp*100,0,100)}%`;ui.xpText.textContent=`${h.xp} / ${h.xpNeed} XP`;ui.xpFill.style.width=`${h.xp/h.xpNeed*100}%`;ui.crystalText.textContent=Math.max(0,Math.ceil(c.hp));ui.crystalFill.style.width=`${clamp(c.hp/c.maxHp*100,0,100)}%`;
    ui.healthProgress.setAttribute('aria-valuemax',String(h.maxHp));ui.healthProgress.setAttribute('aria-valuenow',String(Math.max(0,Math.ceil(h.hp))));ui.xpProgress.setAttribute('aria-valuemax',String(h.xpNeed));ui.xpProgress.setAttribute('aria-valuenow',String(h.xp));ui.crystalProgress.setAttribute('aria-valuenow',String(Math.max(0,Math.ceil(c.hp))));
    if(game.boss){const bossPercent=Math.max(0,game.boss.hp/game.boss.maxHp*100);ui.bossFill.style.width=`${bossPercent}%`;ui.bossProgress.setAttribute('aria-valuenow',String(Math.round(bossPercent)))}
    document.querySelectorAll('.summon-card').forEach(b=>{const d=summonDefs[b.dataset.summon];b.disabled=game.gold<d.cost||(b.dataset.summon==='brute'&&h.level<4)});
    document.querySelectorAll('.shop-item').forEach(b=>{const type=b.dataset.upgrade,cost=upgradeCost(type);b.disabled=game.gold<cost||(type==='repair'&&game.crystal.hp>=game.crystal.maxHp)||(type==='focus'&&h.focus>=.35);$(`cost-${type}`).textContent=type==='focus'&&h.focus>=.35?'MAX':cost});
    document.querySelectorAll('.ability').forEach(b=>{const name=b.dataset.ability,cd=game.cooldowns[name],max=game.maxCooldowns[name]*(1-h.focus);b.classList.toggle('cooling',cd>0);b.querySelector('.cooldown').style.height=`${cd/max*100}%`;b.querySelector('.cooldown-text').textContent=cd>0?cd.toFixed(1):'';});
  }

  function endGame(){game.over=true;game.crystal.hp=0;$('finalTime').textContent=formatTime(game.time);$('finalLevel').textContent=game.hero.level;$('finalIncome').textContent=game.income;showOverlay('gameOverOverlay','restartBtn');tone(95,.7,'sawtooth',.08)}
  function announce(title, sub=''){ui.announce.innerHTML=`${title}${sub?`<small>${sub}</small>`:''}`;ui.announce.classList.remove('show');void ui.announce.offsetWidth;ui.announce.classList.add('show');ui.live.textContent=`${title}. ${sub}`}
  function note(text){ui.note.textContent=text;ui.note.classList.remove('show');void ui.note.offsetWidth;ui.note.classList.add('show')}
  function formatTime(s){const m=Math.floor(s/60).toString().padStart(2,'0'),sec=Math.floor(s%60).toString().padStart(2,'0');return `${m}:${sec}`}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function pointLineDistance(px,py,x1,y1,x2,y2){const l2=(x2-x1)**2+(y2-y1)**2;if(!l2)return Math.hypot(px-x1,py-y1);const t=clamp(((px-x1)*(x2-x1)+(py-y1)*(y2-y1))/l2,0,1);return Math.hypot(px-(x1+t*(x2-x1)),py-(y1+t*(y2-y1)))}
  function initAudio(){if(!audio)try{audio=new(window.AudioContext||window.webkitAudioContext)()}catch(e){soundOn=false}}
  function tone(freq,dur,type='sine',vol=.03){if(!soundOn||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}
  function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();raf=requestAnimationFrame(loop)}

  addEventListener('resize',fitCanvas);
  addEventListener('keydown',e=>{
    const overlays=openOverlays(),overlay=overlays[overlays.length-1];
    if(overlay){
      if(e.code==='Tab'){
        const ids=overlayFocus[overlay.id]||[],buttons=ids.map($).filter(Boolean),current=buttons.indexOf(document.activeElement);
        if(buttons.length){e.preventDefault();const next=e.shiftKey?(current<=0?buttons.length-1:current-1):(current<0||current===buttons.length-1?0:current+1);buttons[next].focus()}
      }else if(e.code==='Escape'&&overlay.id==='helpOverlay'){e.preventDefault();closeHelp()}
      else if(e.code==='Escape'&&overlay.id==='pauseOverlay'){e.preventDefault();pause(false)}
      return;
    }
    if(e.target instanceof HTMLElement&&e.target.closest('button,a'))return;
    keys[e.code]=true;if(game.started&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='KeyQ')ability('dash');if(e.code==='KeyE')ability('nova');if(e.code==='KeyR')ability('sentinel');if(e.code==='Space'||e.code==='Escape')pause();
  });
  addEventListener('keyup',e=>{keys[e.code]=false});
  canvas.addEventListener('pointerdown',e=>{if(!game.started||game.paused)return;canvas.focus();const p=screenToWorld(e.clientX,e.clientY);game.hero.destination={x:clamp(p.x,145,1450),y:clamp(p.y,125,775)};game.hero.aimX=p.x-game.hero.x;game.hero.aimY=p.y-game.hero.y;const m=Math.hypot(game.hero.aimX,game.hero.aimY)||1;game.hero.aimX/=m;game.hero.aimY/=m});
  document.querySelectorAll('.summon-card').forEach(b=>b.addEventListener('click',()=>buySummon(b.dataset.summon)));
  document.querySelectorAll('.shop-item').forEach(b=>b.addEventListener('click',()=>buyUpgrade(b.dataset.upgrade)));
  document.querySelectorAll('.ability').forEach(b=>b.addEventListener('click',()=>ability(b.dataset.ability)));
  $('startBtn').addEventListener('click',begin);$('pauseBtn').addEventListener('click',()=>pause());$('resumeBtn').addEventListener('click',()=>pause(false));
  $('restartBtn').addEventListener('click',()=>{hideOverlay('gameOverOverlay',false);reset();game.started=true;syncOverlayAccess();canvas.focus()});
  $('soundBtn').addEventListener('click',()=>{initAudio();soundOn=!soundOn;$('soundBtn').textContent=soundOn?'♪':'×';$('soundBtn').setAttribute('aria-label',soundOn?'Mute sound':'Enable sound');$('soundBtn').setAttribute('aria-pressed',String(!soundOn));if(soundOn){if(audio?.state==='suspended')audio.resume();tone(440,.1)}});
  const fullBtn=$('fullBtn'),fullscreenSupported=Boolean(document.fullscreenEnabled&&$('gameShell').requestFullscreen);fullBtn.hidden=!fullscreenSupported;
  fullBtn.addEventListener('click',()=>{const action=!document.fullscreenElement?$('gameShell').requestFullscreen?.():document.exitFullscreen?.();action?.catch?.(()=>{})});
  const openHelp=()=>{
    const shouldResume=game.started&&!game.paused;
    if(shouldResume)pause(true);
    $('pauseOverlay').classList.remove('open');
    $('helpOverlay').dataset.resume=shouldResume?'1':'0';
    showOverlay('helpOverlay','closeHelp');
  };
  const closeHelp=()=>{
    hideOverlay('helpOverlay',false);
    if($('helpOverlay').dataset.resume==='1')pause(false);
    else if(game.started&&game.paused)showOverlay('pauseOverlay','resumeBtn');
    else syncOverlayAccess();
  };
  $('helpBtn').addEventListener('click',openHelp);$('closeHelp').addEventListener('click',closeHelp);$('closeHelpBottom').addEventListener('click',closeHelp);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.started&&!game.paused&&!game.over)pause(true)});
  addEventListener('blur',()=>{if(game.started&&!game.paused&&!game.over)pause(true)});
  document.addEventListener('fullscreenchange',()=>{const active=document.fullscreenElement===$('gameShell');fullBtn.textContent=active?'×':'⛶';fullBtn.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');fullBtn.setAttribute('aria-pressed',String(active));if(!active&&game.started&&!game.paused&&!game.over)pause(true);fitCanvas()});
  const stick=$('touchStick'),knob=$('stickKnob');
  function moveStick(e){const r=stick.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),m=Math.hypot(x,y),lim=36,k=Math.min(lim,m),nx=m?x/m:0,ny=m?y/m:0;pointer.stickX=nx*(Math.min(m,lim)/lim);pointer.stickY=ny*(Math.min(m,lim)/lim);knob.style.transform=`translate(${nx*k}px,${ny*k}px)`}
  stick.addEventListener('pointerdown',e=>{stick.setPointerCapture(e.pointerId);moveStick(e)});stick.addEventListener('pointermove',e=>{if(stick.hasPointerCapture(e.pointerId))moveStick(e)});const endStick=()=>{pointer.stickX=pointer.stickY=0;knob.style.transform=''};stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  reset();fitCanvas();syncOverlayAccess('startBtn');raf=requestAnimationFrame(loop);
})();
