(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;
  const ROWS = 5;
  const COLS = 9;
  const COSTS = { basic: 50, frost: 75, ember: 100, glow: 75 };
  const COLORS = { basic: "#ffd85e", frost: "#87ecf5", ember: "#ff704d", glow: "#c592ff" };
  const overlayFocus = { tutorial: "tutorialNext", pauseOverlay: "resumeButton", endOverlay: "restartButton" };

  let W = 900, H = 540, dpr = 1, board = {};
  let audioCtx = null, soundOn = true;
  let selectedKind = "basic", selectedDefender = null;
  let keyboardCell = { row: 2, col: 2 };
  let running = false, paused = false, ended = false, tutorialStep = 0;
  let nectar = 250, wave = 1, waveClock = 0, spawnClock = 0, spawnedThisWave = 0;
  let nextId = 1, lastTime = performance.now(), shake = 0, flash = 0;
  let defenders = [], enemies = [], shots = [], particles = [], floaters = [], drops = [];
  let runes = Array.from({ length: ROWS }, () => ({ ready: true, pulse: 0 }));

  function activeOverlay() {
    return ["tutorial", "pauseOverlay", "endOverlay"].map(id => $("#" + id)).find(el => !el.classList.contains("hidden")) || null;
  }

  function syncOverlayAccess(focusId = null) {
    const overlay = activeOverlay(), blocked = Boolean(overlay);
    document.querySelector(".topbar").inert = blocked;
    document.querySelector(".tray").inert = blocked;
    canvas.inert = blocked;
    const targetId = focusId || (overlay && overlayFocus[overlay.id]);
    if (targetId) requestAnimationFrame(() => $("#" + targetId)?.focus());
    else if (!blocked && running) requestAnimationFrame(() => canvas.focus());
  }

  function showOverlay(id, focusId) { $("#" + id).classList.remove("hidden"); syncOverlayAccess(focusId); }
  function hideOverlay(id, focusId = null) { $("#" + id).classList.add("hidden"); syncOverlayAccess(focusId); }

  const tutorialCopy = [
    "Pick a garden friend. Tap a glowing tile.",
    "Friends protect each path. Garden light becomes more nectar!",
    "If shadows reach a rune, it sweeps the path once."
  ];
  const tutorialScenes = [
    '<span class="demo-card">&#x1F33B;</span><span class="demo-arrow">&#x279C;</span><span class="demo-tile">&#x25A6;</span>',
    '<span style="filter:drop-shadow(0 0 12px #ffd92e)">&#x2726;</span><span class="demo-arrow" style="color:#4ca467">&#x2198;</span><span class="demo-card">&#x1F331;</span>',
    '<span style="color:#4ad7ff">&#x25C8;</span><span class="demo-arrow" style="color:#ef8957; transform:rotate(180deg)">&#x279C;</span><span style="filter:grayscale(.5)">&#x1F47E;</span>'
  ];

  function reset() {
    nectar = 250; wave = 1; waveClock = 0; spawnClock = 2.5; spawnedThisWave = 0;
    defenders = []; enemies = []; shots = []; particles = []; floaters = []; drops = [];
    runes = Array.from({ length: ROWS }, () => ({ ready: true, pulse: 0 }));
    selectedKind = "basic"; selectedDefender = null; keyboardCell = { row: 2, col: 2 }; ended = false; paused = false; flash = 0; shake = 0;
    lastTime = performance.now();
    $("#endOverlay").classList.add("hidden"); $("#pauseOverlay").classList.add("hidden");
    $("#pauseButton").textContent = "‖";
    $("#pauseButton").setAttribute("aria-pressed", "false");
    updateUI(); syncOverlayAccess();
  }

  function resize() {
    const previous = board.w ? { ...board } : null;
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    W = r.width; H = r.height;
    board = { x: W * .105, y: H * .075, w: W * .81, h: H * .86 };
    board.cw = board.w / COLS; board.rh = board.h / ROWS;
    if (previous) {
      const remapX = x => board.x + ((x - previous.x) / previous.w) * board.w;
      const remapY = y => board.y + ((y - previous.y) / previous.h) * board.h;
      enemies.forEach(e => { e.x = remapX(e.x); });
      shots.forEach(s => { s.x = remapX(s.x); s.y = board.y + (s.row + .5) * board.rh - board.rh * .1; });
      drops.forEach(drop => { drop.x = remapX(drop.x); drop.y = remapY(drop.y); drop.baseY = remapY(drop.baseY); });
      particles = [];
      floaters = [];
    }
  }

  function sound(type, pitch = 1) {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const now = audioCtx.currentTime;
      const settings = {
        plant: [330, 520, .12, "sine"], shoot: [650, 420, .06, "triangle"],
        hit: [120, 70, .08, "square"], collect: [620, 980, .14, "sine"],
        rune: [180, 520, .4, "sawtooth"], upgrade: [440, 880, .3, "sine"],
        win: [520, 1040, .7, "triangle"], lose: [240, 90, .7, "sine"]
      }[type] || [300, 400, .1, "sine"];
      o.type = settings[3]; o.frequency.setValueAtTime(settings[0] * pitch, now);
      o.frequency.exponentialRampToValueAtTime(settings[1] * pitch, now + settings[2]);
      g.gain.setValueAtTime(.055, now); g.gain.exponentialRampToValueAtTime(.001, now + settings[2]);
      o.connect(g).connect(audioCtx.destination); o.start(now); o.stop(now + settings[2]);
    } catch (_) { soundOn = false; }
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function center(d) { return { x: board.x + (d.col + .5) * board.cw, y: board.y + (d.row + .5) * board.rh }; }
  function puff(x, y, color, count = 8, speed = 50) {
    if (reduceMotion) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = rnd(speed * .3, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.3, .65), max: .65, size: rnd(2, 6), color });
    }
  }
  function floater(x, y, text, color = "#fff") { floaters.push({ x, y, text, color, life: 1 }); }

  function addDefender(row, col, kind) {
    const cost = COSTS[kind];
    if (nectar < cost) { toast("✦ ?"); sound("hit", .7); return; }
    if (defenders.some(d => d.row === row && d.col === col)) return;
    nectar -= cost;
    const hp = kind === "glow" ? 170 : 120;
    const d = { id: nextId++, row, col, kind, hp, maxHp: hp, cooldown: rnd(.2, .8), level: 1, bob: Math.random() * TAU, income: 8 };
    defenders.push(d); selectedDefender = d; selectedKind = kind;
    const p = center(d); puff(p.x, p.y, COLORS[kind], 14, 80); sound("plant"); updateUI();
  }

  function upgradeSelected() {
    const d = selectedDefender;
    if (!d || !defenders.includes(d) || d.level >= 2 || nectar < 75) return;
    nectar -= 75; d.level = 2; d.maxHp *= 1.4; d.hp = d.maxHp;
    const p = center(d); puff(p.x, p.y, "#fff38a", 22, 100); floater(p.x, p.y, "★", "#fff38a"); sound("upgrade"); updateUI();
  }

  function spawnEnemy() {
    const row = Math.floor(Math.random() * ROWS);
    let type = "mote";
    if (wave >= 3 && Math.random() < .22) type = "shell";
    if (wave >= 5 && Math.random() < .18) type = "swift";
    const base = 60 + wave * 12;
    const stats = type === "shell" ? [base * 2.4, 11] : type === "swift" ? [base * .7, 26] : [base, 16];
    enemies.push({ id: nextId++, row, x: board.x + board.w + board.cw * .45, hp: stats[0], maxHp: stats[0], speed: stats[1] + wave * .6, type, slow: 0, bite: 0, wobble: Math.random() * TAU, dead: false });
  }

  function shoot(d, target) {
    const p = center(d);
    shots.push({ x: p.x + board.cw * .19, y: p.y - board.rh * .1, row: d.row, kind: d.kind, damage: (d.kind === "ember" ? 24 : d.kind === "frost" ? 11 : 17) * (d.level === 2 ? 1.75 : 1), speed: 230, target: target.id, life: 3 });
    sound("shoot", d.kind === "frost" ? 1.3 : d.kind === "ember" ? .7 : 1);
  }

  function update(dt) {
    if (!running || paused || ended) return;
    waveClock += dt; spawnClock -= dt;
    const waveTotal = 5 + wave * 2;
    if (spawnedThisWave < waveTotal && spawnClock <= 0) {
      spawnEnemy(); spawnedThisWave++; spawnClock = Math.max(.65, 2.7 - wave * .18) * rnd(.75, 1.25);
    }
    if (spawnedThisWave >= waveTotal && enemies.length === 0) {
      if (wave >= 8) return finish(true);
      wave++; spawnedThisWave = 0; spawnClock = 4; nectar += 35;
      toast("✦ +35   ∿ " + wave); sound("collect");
    }

    defenders.forEach(d => {
      d.bob += dt * 2; d.cooldown -= dt;
      const p = center(d);
      if (d.kind === "glow") {
        d.income -= dt;
        if (d.income <= 0) { drops.push({ x: p.x, y: p.y - 20, baseY: p.y, value: d.level === 2 ? 30 : 20, life: 9, phase: Math.random() * TAU }); d.income = d.level === 2 ? 6 : 8; }
      } else {
        const target = enemies.filter(e => !e.dead && e.row === d.row && e.x > p.x - board.cw * .05).sort((a,b) => a.x - b.x)[0];
        const rate = d.kind === "basic" ? .9 : d.kind === "frost" ? 1.35 : 1.7;
        if (target && d.cooldown <= 0) { shoot(d, target); d.cooldown = rate * (d.level === 2 ? .68 : 1); }
      }
    });

    shots.forEach(s => {
      s.x += s.speed * (board.w / 729) * dt; s.life -= dt;
      let hit = enemies.filter(e => !e.dead && e.row === s.row && Math.abs(e.x - s.x) < board.cw * .28).sort((a,b) => a.x-b.x)[0];
      if (!hit) return;
      if (s.kind === "ember") {
        enemies.forEach(e => { if (!e.dead && Math.hypot(e.x-hit.x, (e.row-hit.row)*board.rh) < board.rh*.9) damageEnemy(e, s.damage); });
        puff(hit.x, board.y + (hit.row+.5)*board.rh, "#ff7b4c", 15, 95);
      } else {
        damageEnemy(hit, s.damage);
        if (s.kind === "frost") hit.slow = 2.5;
        puff(hit.x, s.y, s.kind === "frost" ? "#a7f7ff" : "#ffe878", 5, 35);
      }
      s.life = 0; sound("hit", 1.4);
    });
    shots = shots.filter(s => s.life > 0 && s.x < W + 30);

    enemies.forEach(e => {
      if (e.dead) return;
      e.slow = Math.max(0, e.slow - dt); e.wobble += dt * 5;
      const blocker = defenders.filter(d => d.row === e.row).sort((a,b) => b.col-a.col).find(d => {
        const p = center(d); return e.x > p.x - board.cw*.32 && e.x < p.x + board.cw*.48;
      });
      if (blocker) {
        e.bite -= dt;
        if (e.bite <= 0) { blocker.hp -= e.type === "shell" ? 14 : 10; e.bite = .85; const p=center(blocker); puff(p.x,p.y,"#8fd16e",4,30); }
      } else e.x -= e.speed * (board.w / 729) * (e.slow > 0 ? .52 : 1) * dt;
      if (e.x < board.x - board.cw * .15) triggerRune(e.row);
    });
    defenders.filter(d => d.hp <= 0).forEach(d => { const p=center(d); puff(p.x,p.y,"#8c6658",14,70); if (selectedDefender===d) selectedDefender=null; });
    defenders = defenders.filter(d => d.hp > 0);
    enemies = enemies.filter(e => !e.dead);

    drops.forEach(d => { d.life -= dt; d.phase += dt * 3; d.y = d.baseY - board.rh*.22 + Math.sin(d.phase)*5; });
    const expired = drops.filter(d => d.life <= 0);
    expired.forEach(d => { nectar += d.value; floater(d.x,d.y,"✦+"+d.value,"#fff284"); sound("collect"); });
    drops = drops.filter(d => d.life > 0);
    particles.forEach(p => { p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 40*dt; p.vx *= .98; });
    particles = particles.filter(p => p.life > 0);
    floaters.forEach(f => { f.life -= dt; f.y -= 25*dt; }); floaters = floaters.filter(f=>f.life>0);
    runes.forEach(r => r.pulse += dt * 2);
    shake = Math.max(0, shake - dt * 25); flash = Math.max(0, flash - dt * 3);
    updateUI();
  }

  function damageEnemy(e, amount) {
    e.hp -= amount;
    if (e.hp <= 0 && !e.dead) { e.dead = true; nectar += e.type === "shell" ? 14 : 8; puff(e.x, board.y+(e.row+.5)*board.rh,"#9d78b8",12,75); }
  }

  function triggerRune(row) {
    const rune = runes[row];
    if (rune.ready) {
      rune.ready = false; shake = reduceMotion ? 0 : 12; flash = reduceMotion ? 0 : .55; sound("rune");
      enemies.forEach(e => { if (e.row === row) { e.dead = true; puff(e.x,board.y+(row+.5)*board.rh,"#60e6ff",16,140); } });
      toast("◇ 〰 ✦");
    } else finish(false);
  }

  function finish(win) {
    ended = true; sound(win ? "win" : "lose");
    $("#endIcon").textContent = win ? "✨" : "🌱";
    $("#endTitle").textContent = win ? "Garden Glows!" : "Try Again!";
    showOverlay("endOverlay", "restartButton");
  }

  function collectDrop(d) {
    nectar += d.value; floater(d.x,d.y,"✦+"+d.value,"#fff284"); puff(d.x,d.y,"#fff37c",12,80); sound("collect");
    drops.splice(drops.indexOf(d),1); updateUI();
  }

  function canvasPoint(ev) {
    const r=canvas.getBoundingClientRect(); const t=ev.touches?.[0] || ev;
    return { x:t.clientX-r.left, y:t.clientY-r.top };
  }
  function pointer(ev) {
    if (!running || paused || ended) return;
    ev.preventDefault(); const p=canvasPoint(ev);
    const drop = drops.find(d => Math.hypot(d.x-p.x,d.y-p.y) < Math.min(board.rh,board.cw)*.45);
    if (drop) return collectDrop(drop);
    if (p.x < board.x || p.x > board.x+board.w || p.y < board.y || p.y > board.y+board.h) { selectedDefender=null; updateUI(); return; }
    const col=Math.floor((p.x-board.x)/board.cw), row=Math.floor((p.y-board.y)/board.rh);
    keyboardCell = { row, col };
    activateCell(row, col);
  }

  function activateCell(row, col) {
    const cellDrop = drops.find(drop => {
      const dropCol = Math.floor((drop.x - board.x) / board.cw), dropRow = Math.floor((drop.y - board.y) / board.rh);
      return dropCol === col && dropRow === row;
    });
    if (cellDrop) return collectDrop(cellDrop);
    const existing=defenders.find(d=>d.row===row&&d.col===col);
    if (existing) { selectedDefender=existing; selectedKind=null; sound("plant",.8); updateUI(); }
    else if (selectedKind) addDefender(row,col,selectedKind);
    else { selectedKind="basic"; selectedDefender=null; updateUI(); }
  }

  function updateUI() {
    $("#nectarCount").textContent = Math.floor(nectar);
    $("#waveCount").textContent = wave + "/8";
    $("#nectarStatus").setAttribute("aria-label", Math.floor(nectar) + " nectar");
    $("#waveStatus").setAttribute("aria-label", "Wave " + wave + " of 8");
    document.querySelectorAll(".seed-card").forEach(b => {
      const active=b.dataset.kind===selectedKind; b.classList.toggle("selected",active); b.classList.toggle("unaffordable",nectar<COSTS[b.dataset.kind]); b.setAttribute("aria-pressed",String(active));
    });
    const can=selectedDefender && defenders.includes(selectedDefender) && selectedDefender.level<2 && nectar>=75;
    $("#upgradeButton").disabled=!can; $("#upgradeButton").classList.toggle("ready",!!can);
  }

  let toastTimer;
  function toast(msg) { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),1300); }

  function roundedRect(x,y,w,h,r) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
  function circle(x,y,r) { ctx.beginPath(); ctx.arc(x,y,r,0,TAU); }
  function leaf(x,y,rx,ry,rot,color) { ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.fill();ctx.restore(); }

  function drawBackground(t) {
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#4f9a72");g.addColorStop(1,"#276148");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#173b36";ctx.fillRect(0,0,board.x*.76,H);
    ctx.fillStyle="#31583f";ctx.fillRect(board.x+board.w,0,W-(board.x+board.w),H);
    for(let i=0;i<28;i++){const x=((i*83)%Math.max(W,1)), y=((i*47)%Math.max(H,1)); circle(x,y,1.5);ctx.fillStyle="#d8ffba33";ctx.fill();}
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const x=board.x+c*board.cw,y=board.y+r*board.rh;
      ctx.fillStyle=(r+c)%2?"#73b66b":"#7dc172";ctx.fillRect(x,y,board.cw+1,board.rh+1);
      ctx.fillStyle="rgba(255,255,220,.08)";roundedRect(x+3,y+3,board.cw-6,board.rh-6,Math.min(10,board.rh*.12));ctx.fill();
      ctx.strokeStyle="rgba(25,92,50,.2)";ctx.lineWidth=1;ctx.stroke();
    }
    if (document.activeElement === canvas) {
      const x = board.x + keyboardCell.col * board.cw, y = board.y + keyboardCell.row * board.rh;
      ctx.strokeStyle = "#fff7a8"; ctx.lineWidth = 4; ctx.setLineDash([8, 5]);
      roundedRect(x + 4, y + 4, board.cw - 8, board.rh - 8, Math.min(11, board.rh * .12)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle="#386443";roundedRect(board.x-3,board.y-4,board.w+6,6,3);ctx.fill();
    // path arrows at entry
    for(let r=0;r<ROWS;r++){const y=board.y+(r+.5)*board.rh;ctx.fillStyle="#d8f4bb55";ctx.font=`${Math.max(14,board.rh*.27)}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("‹",board.x+board.w+board.cw*.22,y);}
  }

  function drawRune(row,t) {
    const r=runes[row], x=board.x-board.cw*.55, y=board.y+(row+.5)*board.rh, s=Math.min(board.cw,board.rh)*.25;
    ctx.save();ctx.translate(x,y); if(r.ready){ctx.shadowColor="#66eaff";ctx.shadowBlur=10+Math.sin(r.pulse)*5;ctx.fillStyle="#68dff3";}else{ctx.fillStyle="#485d57";ctx.shadowBlur=0;}
    ctx.rotate(Math.PI/4);roundedRect(-s,-s,s*2,s*2,s*.25);ctx.fill();ctx.strokeStyle=r.ready?"#e6ffff":"#789087";ctx.lineWidth=2;ctx.stroke();ctx.rotate(-Math.PI/4);
    ctx.fillStyle=r.ready?"#174c58":"#2c3e38";circle(0,0,s*.36);ctx.fill();ctx.restore();
  }

  function drawDefender(d,t) {
    const p=center(d), size=Math.min(board.cw,board.rh), bob=Math.sin(d.bob)*size*.025;
    ctx.save();ctx.translate(p.x,p.y+bob); if(selectedDefender===d){ctx.strokeStyle="#fff28a";ctx.lineWidth=4;ctx.setLineDash([7,5]);circle(0,0,size*.39);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle="#28683f";ctx.fillRect(-size*.045,size*.02,size*.09,size*.3);
    leaf(-size*.12,size*.2,size*.16,size*.07,-.45,"#3f9d50");leaf(size*.12,size*.16,size*.16,size*.07,.5,"#55b95f");
    if(d.kind==="glow"){
      ctx.globalAlpha=.18;ctx.fillStyle="#d8b6ff";circle(0,0,size*.38);ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle="#f4dfba";roundedRect(-size*.1,-size*.06,size*.2,size*.35,size*.08);ctx.fill();
      ctx.shadowColor="#c493ff";ctx.shadowBlur=12;ctx.fillStyle="#a969e1";ctx.beginPath();ctx.ellipse(0,-size*.12,size*.31,size*.18,0,Math.PI,TAU);ctx.quadraticCurveTo(0,-size*.38,size*.31,-size*.12);ctx.fill();ctx.shadowBlur=0;
      for(let i=-1;i<=1;i++){ctx.fillStyle="#fff";circle(i*size*.12,-size*(.18+(i%2)*.05),size*.025);ctx.fill();}
    } else {
      const color=COLORS[d.kind];ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;
      for(let i=0;i<6;i++){const a=i*TAU/6;leaf(Math.cos(a)*size*.18,-size*.12+Math.sin(a)*size*.18,size*.14,size*.09,a,color);}
      ctx.shadowBlur=0;ctx.fillStyle=d.kind==="ember"?"#ffdc55":d.kind==="frost"?"#d9ffff":"#704b2d";circle(0,-size*.12,size*.16);ctx.fill();
      ctx.fillStyle="#16392f";circle(size*.045,-size*.15,size*.025);ctx.fill();
    }
    if(d.level===2){ctx.fillStyle="#fff082";ctx.font=`bold ${size*.23}px sans-serif`;ctx.textAlign="center";ctx.fillText("★",0,-size*.42);}
    if(d.hp<d.maxHp){ctx.fillStyle="#26443b";roundedRect(-size*.3,size*.4,size*.6,5,3);ctx.fill();ctx.fillStyle="#7ee37f";roundedRect(-size*.3,size*.4,size*.6*Math.max(0,d.hp/d.maxHp),5,3);ctx.fill();}
    ctx.restore();
  }

  function drawEnemy(e,t) {
    const y=board.y+(e.row+.5)*board.rh, s=Math.min(board.cw,board.rh), bob=Math.sin(e.wobble)*s*.035;
    ctx.save();ctx.translate(e.x,y+bob);if(e.slow>0){ctx.shadowColor="#81efff";ctx.shadowBlur=12;}
    ctx.fillStyle=e.type==="shell"?"#6d5c83":e.type==="swift"?"#9a55a3":"#795a91";
    if(e.type==="shell"){roundedRect(-s*.3,-s*.28,s*.6,s*.62,s*.2);ctx.fill();ctx.fillStyle="#bba4c3";for(let i=-1;i<=1;i++){roundedRect(i*s*.16-s*.07,-s*.3,s*.14,s*.16,4);ctx.fill();}}
    else {ctx.beginPath();ctx.ellipse(0,s*.04,s*(e.type==="swift"?.25:.3),s*(e.type==="swift"?.34:.3),0,0,TAU);ctx.fill();}
    ctx.shadowBlur=0;ctx.fillStyle="#fff3bd";circle(-s*.09,-s*.05,s*.06);ctx.fill();circle(s*.09,-s*.05,s*.06);ctx.fill();ctx.fillStyle="#1f2431";circle(-s*.075,-s*.04,s*.025);ctx.fill();circle(s*.105,-s*.04,s*.025);ctx.fill();
    if(e.type==="swift"){ctx.strokeStyle="#e3b7f1";ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(s*.28+i*5,-s*.1+i*8);ctx.lineTo(s*.44+i*5,-s*.1+i*8);ctx.stroke();}}
    ctx.fillStyle="#26352f";roundedRect(-s*.25,-s*.43,s*.5,5,3);ctx.fill();ctx.fillStyle=e.slow>0?"#83efff":"#ff7780";roundedRect(-s*.25,-s*.43,s*.5*Math.max(0,e.hp/e.maxHp),5,3);ctx.fill();ctx.restore();
  }

  function draw(t) {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.save();
    if(shake&&!reduceMotion)ctx.translate(rnd(-shake,shake),rnd(-shake,shake));
    drawBackground(t);runes.forEach((_,i)=>drawRune(i,t));
    defenders.forEach(d=>drawDefender(d,t));shots.forEach(s=>{ctx.fillStyle=COLORS[s.kind];ctx.shadowColor=COLORS[s.kind];ctx.shadowBlur=10;circle(s.x,s.y,s.kind==="ember"?8:5);ctx.fill();ctx.shadowBlur=0;});
    enemies.forEach(e=>drawEnemy(e,t));
    drops.forEach(d=>{ctx.save();ctx.translate(d.x,d.y);ctx.rotate((paused||reduceMotion?0:t)*.001);ctx.fillStyle="#fff27a";ctx.shadowColor="#fff27a";ctx.shadowBlur=15;ctx.font=`bold ${Math.min(board.cw,board.rh)*.36}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("✦",0,0);ctx.restore();});
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;circle(p.x,p.y,p.size);ctx.fill();});ctx.globalAlpha=1;
    floaters.forEach(f=>{ctx.globalAlpha=Math.max(0,f.life);ctx.fillStyle=f.color;ctx.font="bold 20px sans-serif";ctx.textAlign="center";ctx.fillText(f.text,f.x,f.y);});ctx.globalAlpha=1;
    if(flash>0){ctx.fillStyle=`rgba(120,240,255,${flash*.35})`;ctx.fillRect(0,0,W,H);}ctx.restore();
  }

  function loop(now) { const dt=Math.min(.033,(now-lastTime)/1000);lastTime=now;update(dt);draw(now);requestAnimationFrame(loop); }

  canvas.addEventListener("pointerdown",pointer);
  document.querySelectorAll(".seed-card").forEach(b=>b.addEventListener("click",()=>{selectedKind=b.dataset.kind;selectedDefender=null;sound("plant",1.15);updateUI();}));
  $("#upgradeButton").addEventListener("click",upgradeSelected);
  $("#soundButton").addEventListener("click",()=>{soundOn=!soundOn;$("#soundButton").textContent=soundOn?"♫":"×";$("#soundButton").title=soundOn?"Sound on":"Sound off";$("#soundButton").setAttribute("aria-label",soundOn?"Mute sound":"Turn sound on");$("#soundButton").setAttribute("aria-pressed",String(!soundOn));if(soundOn)sound("collect");});
  function togglePause(){if(ended||!running)return;paused=!paused;if(paused){shake=0;flash=0;showOverlay("pauseOverlay","resumeButton");}else hideOverlay("pauseOverlay");$("#pauseButton").textContent=paused?"▶":"‖";$("#pauseButton").title=paused?"Resume":"Pause";$("#pauseButton").setAttribute("aria-pressed",String(paused));}
  $("#pauseButton").addEventListener("click",togglePause);$("#resumeButton").addEventListener("click",togglePause);
  const fullscreenButton = $("#fullscreenButton");
  const fullscreenSupported = Boolean(document.fullscreenEnabled && $("#app").requestFullscreen);
  fullscreenButton.hidden = !fullscreenSupported;
  fullscreenButton.addEventListener("click",()=>{const action=!document.fullscreenElement?$("#app").requestFullscreen?.():document.exitFullscreen?.();action?.catch?.(()=>{});});
  document.addEventListener("fullscreenchange",()=>{
    const active = document.fullscreenElement === $("#app");
    fullscreenButton.textContent = active ? "×" : "⛶";
    fullscreenButton.title = active ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
    fullscreenButton.setAttribute("aria-pressed", String(active));
    if (!active && running && !ended && !paused) togglePause();
    resize();
  });
  $("#restartButton").addEventListener("click",reset);
  $("#tutorialNext").addEventListener("click",()=>{tutorialStep++;if(tutorialStep>=tutorialCopy.length){hideOverlay("tutorial");running=true;reset();sound("plant");return;}$("#tutorialText").textContent=tutorialCopy[tutorialStep];document.querySelector(".tutorial-scene").innerHTML=tutorialScenes[tutorialStep];document.querySelectorAll(".tutorial-dots i").forEach((d,i)=>d.classList.toggle("on",i===tutorialStep));});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&running&&!ended&&!paused)togglePause();});
  window.addEventListener("blur",()=>{if(running&&!ended&&!paused)togglePause();});
  document.addEventListener("keydown",event=>{
    const overlay = activeOverlay();
    if (overlay && event.code === "Tab") { event.preventDefault(); $("#" + overlayFocus[overlay.id])?.focus(); return; }
    if (overlay?.id === "pauseOverlay" && event.code === "Escape") { event.preventDefault(); togglePause(); return; }
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
  window.addEventListener("resize",resize);resize();document.querySelector(".tutorial-dots i").classList.add("on");updateUI();syncOverlayAccess("tutorialNext");requestAnimationFrame(loop);
})();
