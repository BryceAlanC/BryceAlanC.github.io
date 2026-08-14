import * as THREE from "./vendor/three.module.min.js";
import {
  ARENA,
  PROJECTILE,
  clamp,
  movePlayer,
  sphereIntersectsBox,
  stepProjectile
} from "./physics.mjs";

const FIXED_STEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.36;
const WALK_SPEED = 5.2;
const LOOK_SPEEDS = [0.00115, 0.0018, 0.0026];
const KEYBOARD_LOOK_SPEEDS = [1.05, 1.65, 2.35];
const MAX_BALLS = 150;
const MAX_SPLATS = 180;
const BASE_BALL_RADIUS = 0.18;
const GIANT_BALL_RADIUS = 0.38;
const BALL_SPEED = 17;
const BASE_FIRE_INTERVAL = 0.28;
const RAPID_FIRE_INTERVAL = 0.085;
const POWER_DURATION = 10;
const PICKUP_RESPAWN = 12;
const SPLAT_LIFETIME = 14;

const elements = {
  stage: document.getElementById("ball-stage"),
  canvas: document.getElementById("game-canvas"),
  status: document.getElementById("game-status"),
  gate: document.getElementById("game-gate"),
  gateTitle: document.getElementById("gate-title"),
  gateCopy: document.getElementById("gate-copy"),
  gateControls: document.getElementById("gate-controls"),
  gateActions: document.getElementById("gate-actions"),
  gateHint: document.getElementById("gate-hint"),
  startMouse: document.getElementById("start-mouse"),
  startKeyboard: document.getElementById("start-keyboard"),
  reload: document.getElementById("reload-game"),
  back: document.getElementById("back-to-lab"),
  hud: document.getElementById("game-hud"),
  hudRapid: document.getElementById("hud-rapid"),
  hudGiant: document.getElementById("hud-giant"),
  hudSplat: document.getElementById("hud-splat"),
  toast: document.getElementById("pickup-toast"),
  comfort: document.getElementById("comfort-mode"),
  lookSpeed: document.getElementById("look-speed"),
  lookSpeedValue: document.getElementById("look-speed-value"),
  reset: document.getElementById("reset-game"),
  ballCount: document.getElementById("ball-count"),
  bounceCount: document.getElementById("bounce-count"),
  splatCount: document.getElementById("splat-count"),
  powerRapid: document.querySelector("#power-rapid .power-value"),
  powerGiant: document.querySelector("#power-giant .power-value"),
  powerSplat: document.querySelector("#power-splat .power-value"),
  powerRapidRow: document.getElementById("power-rapid"),
  powerGiantRow: document.getElementById("power-giant"),
  powerSplatRow: document.getElementById("power-splat"),
  announcer: document.getElementById("game-announcer")
};

const palette = [0xffa45b, 0xff6b6b, 0xffd166, 0x5ed6c0, 0x72a0ff, 0xb886ff];
const powerDefinitions = {
  rapid: { label: "Rapid fire", color: 0xffb347, symbol: "⚡" },
  giant: { label: "Jumbo balls", color: 0x48c9b0, symbol: "◉" },
  splat: { label: "Splat shot", color: 0xff6f61, symbol: "✹" }
};

const simulation = {
  mode: "loading",
  pointerLockPending: false,
  pendingPauseReason: "Paused",
  accumulator: 0,
  lastTime: 0,
  simulationTime: 0,
  fireCooldown: 0,
  fireHeld: false,
  keyboardFire: false,
  mouseFire: false,
  yaw: 0,
  pitch: 0,
  keys: new Set(),
  player: {
    position: { x: 0, y: PLAYER_HEIGHT, z: 7.5 },
    velocity: { x: 0, y: 0, z: 0 }
  },
  balls: [],
  splats: [],
  nextBallId: 1,
  nextSplatId: 1,
  bounceCount: 0,
  splatCount: 0,
  powers: { rapid: 0, giant: 0, splat: 0 },
  pickupRespawns: { rapid: 0, giant: 0, splat: 0 },
  pickupObjects: {},
  toastTimeout: 0,
  resizeObserver: null,
  renderer: null,
  scene: null,
  camera: null
};

const obstacleDefinitions = [
  { id: "center", min: { x: -1.8, y: 0, z: -1.5 }, max: { x: 1.8, y: 2.5, z: 1.5 }, color: 0x236b73 },
  { id: "left-block", min: { x: -9.6, y: 0, z: -6.2 }, max: { x: -6.3, y: 3.5, z: -2.8 }, color: 0xd76d4c },
  { id: "right-block", min: { x: 6.2, y: 0, z: 2.2 }, max: { x: 9.7, y: 4.2, z: 5.7 }, color: 0xb68bd1 },
  { id: "low-block", min: { x: 4.5, y: 0, z: -8.3 }, max: { x: 8.8, y: 1.35, z: -5.2 }, color: 0xd1a54a },
  { id: "back-block", min: { x: -7.5, y: 0, z: 4.2 }, max: { x: -4.2, y: 2.1, z: 7.8 }, color: 0x3f8f77 }
];

const pickupSpawns = {
  rapid: new THREE.Vector3(-10.5, 1, 7.5),
  giant: new THREE.Vector3(10.6, 1, -7.2),
  splat: new THREE.Vector3(9.8, 1, 8.2)
};

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xddeee8, roughness: 0.82, metalness: 0 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xf3ddaa, roughness: 0.86, metalness: 0 });
const ballGeometry = new THREE.SphereGeometry(1, 16, 12);
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
const splatGeometry = new THREE.CircleGeometry(1, 18);
const pickupCoreGeometry = new THREE.OctahedronGeometry(0.48, 0);
const pickupRingGeometry = new THREE.TorusGeometry(0.72, 0.08, 8, 24);
const instanceDummy = new THREE.Object3D();
const zAxis = new THREE.Vector3(0, 0, 1);
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

function announce(message) {
  elements.announcer.textContent = "";
  window.setTimeout(function () {
    elements.announcer.textContent = message;
  }, 20);
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setStatus(text, className) {
  setText(elements.status, text);
  elements.status.classList.toggle("is-playing", className === "playing");
  elements.status.classList.toggle("is-error", className === "error");
}

function setGate(options) {
  elements.gate.hidden = false;
  elements.canvas.tabIndex = -1;
  elements.gateTitle.textContent = options.title;
  elements.gateCopy.textContent = options.copy;
  elements.gateControls.hidden = !options.controls;
  elements.gateActions.hidden = false;
  elements.startMouse.hidden = options.mouse === false;
  elements.startKeyboard.hidden = options.keyboard === false;
  elements.reload.hidden = !options.reload;
  elements.back.hidden = !options.back;
  elements.gateHint.hidden = !options.hint;
  if (options.hint) elements.gateHint.textContent = options.hint;
  elements.startMouse.textContent = options.mouseLabel || "Start with mouse";
  elements.startKeyboard.textContent = options.keyboardLabel || "Play with keyboard only";
  const focusTarget = options.focus === "mouse" ? elements.startMouse :
    options.focus === "keyboard" ? elements.startKeyboard :
      options.focus === "reload" ? elements.reload : null;
  if (focusTarget && !focusTarget.hidden) window.setTimeout(function () { focusTarget.focus(); }, 0);
}

function hideGate() {
  elements.gate.hidden = true;
  elements.hud.hidden = false;
  elements.canvas.tabIndex = 0;
}

function showReadyGate() {
  const coarsePointer = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  if (coarsePointer) {
    setGate({
      title: "Keyboard + mouse recommended",
      copy: "This playground is built for a laptop or desktop with a keyboard and mouse or trackpad. A tablet with an attached keyboard can still try keyboard mode.",
      controls: true,
      mouse: false,
      keyboard: true,
      keyboardLabel: "Try keyboard mode",
      reload: false,
      back: true,
      hint: false
    });
    setStatus("Keyboard + mouse recommended");
    return;
  }
  setGate({
    title: "Ready to bounce?",
    copy: "Fill the room with color. There are no enemies, no score, and no way to lose. Walk through a glowing power-up to change your launcher for a little while.",
    controls: true,
    mouse: true,
    keyboard: true,
    reload: false,
    back: false,
    hint: "Mouse mode keeps the pointer inside the arena. Press Esc whenever you want it back."
  });
  setStatus("Ready");
}

function showPauseGate(message) {
  setGate({
    title: message || "Paused",
    copy: "Everything is frozen right where you left it.",
    controls: false,
    mouse: true,
    keyboard: true,
    reload: false,
    back: false,
    mouseLabel: "Resume with mouse",
    keyboardLabel: "Resume with keyboard",
    hint: "Press Esc to pause and release your mouse at any time.",
    focus: "mouse"
  });
  setStatus(message || "Paused");
}

function showError(title, copy) {
  clearInput();
  simulation.mode = "error";
  simulation.pointerLockPending = false;
  if (document.pointerLockElement === elements.canvas) document.exitPointerLock();
  elements.hud.hidden = true;
  setGate({
    title,
    copy,
    controls: false,
    mouse: false,
    keyboard: false,
    reload: true,
    back: true,
    hint: false,
    focus: "reload"
  });
  setStatus("Graphics unavailable", "error");
  announce(title + ". " + copy);
}

function createWebGLRenderer() {
  const renderer = new THREE.WebGLRenderer({
    canvas: elements.canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

function makeBox(scene, definition) {
  const width = definition.max.x - definition.min.x;
  const height = definition.max.y - definition.min.y;
  const depth = definition.max.z - definition.min.z;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.68, metalness: 0.02 })
  );
  mesh.position.set(
    (definition.min.x + definition.max.x) / 2,
    (definition.min.y + definition.max.y) / 2,
    (definition.min.z + definition.max.z) / 2
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function createArena(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.maxX - ARENA.minX, ARENA.maxZ - ARENA.minZ),
    floorMaterial
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.maxX - ARENA.minX, ARENA.maxZ - ARENA.minZ),
    wallMaterial
  );
  ceiling.position.y = ARENA.ceilingY;
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  const wallXGeometry = new THREE.PlaneGeometry(ARENA.maxZ - ARENA.minZ, ARENA.ceilingY);
  const leftWall = new THREE.Mesh(wallXGeometry, wallMaterial);
  leftWall.position.set(ARENA.minX, ARENA.ceilingY / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.receiveShadow = true;
  scene.add(leftWall);
  const rightWall = new THREE.Mesh(wallXGeometry, wallMaterial);
  rightWall.position.set(ARENA.maxX, ARENA.ceilingY / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  scene.add(rightWall);

  const wallZGeometry = new THREE.PlaneGeometry(ARENA.maxX - ARENA.minX, ARENA.ceilingY);
  const backWall = new THREE.Mesh(wallZGeometry, wallMaterial);
  backWall.position.set(0, ARENA.ceilingY / 2, ARENA.minZ);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const frontWall = new THREE.Mesh(wallZGeometry, wallMaterial);
  frontWall.position.set(0, ARENA.ceilingY / 2, ARENA.maxZ);
  frontWall.rotation.y = Math.PI;
  frontWall.receiveShadow = true;
  scene.add(frontWall);

  const grid = new THREE.GridHelper(28, 28, 0x2f776c, 0xc8b67f);
  grid.position.y = 0.004;
  scene.add(grid);

  obstacleDefinitions.forEach(function (definition) { makeBox(scene, definition); });

  for (let index = 0; index < 6; index += 1) {
    const target = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 24),
      new THREE.MeshBasicMaterial({ color: palette[index % palette.length], side: THREE.DoubleSide })
    );
    target.position.set(-10 + index * 4, 3.1 + (index % 2) * 1.25, ARENA.minZ + 0.015);
    scene.add(target);
  }
}

function createSplatTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const textureContext = textureCanvas.getContext("2d");
  textureContext.clearRect(0, 0, 128, 128);
  textureContext.fillStyle = "#ffffff";
  textureContext.beginPath();
  const points = 28;
  for (let index = 0; index < points; index += 1) {
    const angle = index / points * Math.PI * 2;
    const ripple = 0.78 + 0.16 * Math.sin(index * 2.37) + 0.07 * Math.cos(index * 4.91);
    const radius = 52 * ripple;
    const x = 64 + Math.cos(angle) * radius;
    const y = 64 + Math.sin(angle) * radius;
    if (index === 0) textureContext.moveTo(x, y);
    else textureContext.lineTo(x, y);
  }
  textureContext.closePath();
  textureContext.fill();
  [[24, 34, 8], [102, 45, 6], [93, 99, 9], [29, 96, 5]].forEach(function (drop) {
    textureContext.beginPath();
    textureContext.arc(drop[0], drop[1], drop[2], 0, Math.PI * 2);
    textureContext.fill();
  });
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function initializeInstances(scene) {
  simulation.ballInstances = new THREE.InstancedMesh(ballGeometry, ballMaterial, MAX_BALLS);
  simulation.ballInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  simulation.ballInstances.frustumCulled = false;
  simulation.splatInstances = new THREE.InstancedMesh(
    splatGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: createSplatTexture(),
      transparent: true,
      opacity: 0.88,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    }),
    MAX_SPLATS
  );
  simulation.splatInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  simulation.splatInstances.frustumCulled = false;
  simulation.freeBallSlots = [];
  simulation.freeSplatSlots = [];
  for (let index = MAX_BALLS - 1; index >= 0; index -= 1) {
    simulation.ballInstances.setMatrixAt(index, zeroMatrix);
    simulation.freeBallSlots.push(index);
  }
  for (let index = MAX_SPLATS - 1; index >= 0; index -= 1) {
    simulation.splatInstances.setMatrixAt(index, zeroMatrix);
    simulation.freeSplatSlots.push(index);
  }
  simulation.ballInstances.instanceMatrix.needsUpdate = true;
  simulation.splatInstances.instanceMatrix.needsUpdate = true;
  scene.add(simulation.ballInstances, simulation.splatInstances);
}

function createLabelSprite(text, color) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 80;
  const labelContext = labelCanvas.getContext("2d");
  labelContext.fillStyle = "rgba(7, 30, 25, 0.86)";
  labelContext.fillRect(4, 4, 248, 72);
  labelContext.strokeStyle = "rgba(255, 255, 255, 0.7)";
  labelContext.lineWidth = 3;
  labelContext.strokeRect(4, 4, 248, 72);
  labelContext.fillStyle = "#ffffff";
  labelContext.font = "500 34px monospace";
  labelContext.textAlign = "center";
  labelContext.textBaseline = "middle";
  labelContext.fillText(text, 128, 42);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, color });
  const sprite = new THREE.Sprite(material);
  sprite.position.y = 1.35;
  sprite.scale.set(2.5, 0.78, 1);
  return sprite;
}

function createPickups(scene) {
  Object.keys(powerDefinitions).forEach(function (type) {
    const definition = powerDefinitions[type];
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: definition.color,
      emissive: definition.color,
      emissiveIntensity: 0.55,
      roughness: 0.35
    });
    const core = new THREE.Mesh(pickupCoreGeometry, material);
    const ring = new THREE.Mesh(pickupRingGeometry, material);
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    group.add(createLabelSprite(type === "rapid" ? "FAST" : type === "giant" ? "BIG" : "SPLAT", definition.color));
    group.position.copy(pickupSpawns[type]);
    group.userData.type = type;
    group.userData.baseY = group.position.y;
    scene.add(group);
    simulation.pickupObjects[type] = group;
  });
}

function initializeScene() {
  simulation.renderer = createWebGLRenderer();
  simulation.scene = new THREE.Scene();
  simulation.scene.background = new THREE.Color(0x8dd7e8);
  simulation.scene.fog = new THREE.Fog(0x8dd7e8, 22, 44);
  simulation.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  simulation.camera.rotation.order = "YXZ";
  simulation.scene.add(simulation.camera);

  const hemisphere = new THREE.HemisphereLight(0xeafcff, 0x775534, 2.7);
  simulation.scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff2d4, 3.1);
  sun.position.set(5, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  simulation.scene.add(sun);

  createArena(simulation.scene);
  initializeInstances(simulation.scene);
  createPickups(simulation.scene);
  updateCamera();
  resizeRenderer();
  render();
}

function updateCamera() {
  simulation.camera.position.set(
    simulation.player.position.x,
    simulation.player.position.y,
    simulation.player.position.z
  );
  simulation.camera.rotation.set(simulation.pitch, simulation.yaw, 0, "YXZ");
}

function resizeRenderer() {
  if (!simulation.renderer || !simulation.camera) return;
  const width = Math.max(1, elements.canvas.clientWidth);
  const height = Math.max(1, elements.canvas.clientHeight);
  const maximumPixels = 2100000;
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  ratio = Math.min(ratio, Math.sqrt(maximumPixels / Math.max(1, width * height)));
  simulation.renderer.setPixelRatio(Math.max(0.75, ratio));
  simulation.renderer.setSize(width, height, false);
  simulation.camera.aspect = width / height;
  simulation.camera.updateProjectionMatrix();
}

function render() {
  if (simulation.renderer && simulation.scene && simulation.camera) {
    simulation.renderer.render(simulation.scene, simulation.camera);
  }
}

function clearInput() {
  simulation.keys.clear();
  simulation.keyboardFire = false;
  simulation.mouseFire = false;
  simulation.fireHeld = false;
  simulation.player.velocity.x = 0;
  simulation.player.velocity.z = 0;
}

function isFormTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, button, a, [contenteditable='true']"));
}

function isPlaying() {
  return simulation.mode === "mouse" || simulation.mode === "keyboard";
}

function beginKeyboardMode() {
  clearInput();
  simulation.pointerLockPending = false;
  simulation.mode = "keyboard";
  hideGate();
  elements.canvas.focus();
  setStatus("Playing · keyboard look", "playing");
  announce("Keyboard play started. Arrow keys move, I J K L look, and Space launches balls.");
}

function beginMouseMode() {
  if (!elements.canvas.requestPointerLock) {
    showPointerLockFallback();
    return;
  }
  clearInput();
  simulation.pointerLockPending = true;
  try {
    const request = elements.canvas.requestPointerLock();
    if (request && typeof request.catch === "function") request.catch(showPointerLockFallback);
  } catch (error) {
    showPointerLockFallback();
  }
}

function showPointerLockFallback() {
  simulation.pointerLockPending = false;
  simulation.mode = "ready";
  setGate({
    title: "Mouse look did not start",
    copy: "You can still play with the keyboard: use I, J, K, and L to look and Space to launch.",
    controls: false,
    mouse: true,
    keyboard: true,
    reload: false,
    back: false,
    mouseLabel: "Try mouse look again",
    keyboardLabel: "Play with keyboard",
    hint: false,
    focus: "keyboard"
  });
  setStatus("Keyboard play available");
  announce("Mouse look did not start. Keyboard play is available.");
}

function pauseGame(reason) {
  if (!isPlaying() && simulation.mode !== "unlocking" && simulation.mode !== "mouse-pending") return;
  clearInput();
  simulation.pointerLockPending = false;
  simulation.mode = "paused";
  simulation.accumulator = 0;
  simulation.lastTime = performance.now();
  showPauseGate(reason);
  announce((reason || "Paused") + ". The playground is frozen.");
}

function requestPause(reason) {
  if (document.pointerLockElement === elements.canvas) {
    simulation.pendingPauseReason = reason || "Paused";
    simulation.mode = "unlocking";
    document.exitPointerLock();
    return;
  }
  pauseGame(reason);
}

function resetGame(options = {}) {
  simulation.balls.forEach(removeBallMesh);
  simulation.splats.forEach(removeSplatMesh);
  simulation.balls = [];
  simulation.splats = [];
  simulation.nextBallId = 1;
  simulation.nextSplatId = 1;
  simulation.bounceCount = 0;
  simulation.splatCount = 0;
  simulation.simulationTime = 0;
  simulation.fireCooldown = 0;
  simulation.accumulator = 0;
  simulation.player.position.x = 0;
  simulation.player.position.y = PLAYER_HEIGHT;
  simulation.player.position.z = 7.5;
  simulation.player.velocity.x = 0;
  simulation.player.velocity.z = 0;
  simulation.yaw = 0;
  simulation.pitch = 0;
  Object.keys(simulation.powers).forEach(function (type) {
    simulation.powers[type] = 0;
    simulation.pickupRespawns[type] = 0;
    simulation.pickupObjects[type].visible = true;
  });
  clearInput();
  updateCamera();
  updateHud();
  render();
  if (!options.silent) announce("The playground was reset.");
}

function hideInstance(instances, slot) {
  if (!instances || !Number.isInteger(slot)) return;
  instances.setMatrixAt(slot, zeroMatrix);
  instances.instanceMatrix.needsUpdate = true;
}

function removeBallMesh(ball) {
  if (!ball || ball.released) return;
  ball.released = true;
  hideInstance(simulation.ballInstances, ball.slot);
  simulation.freeBallSlots.push(ball.slot);
}

function removeSplatMesh(splat) {
  if (!splat || splat.released) return;
  splat.released = true;
  hideInstance(simulation.splatInstances, splat.slot);
  simulation.freeSplatSlots.push(splat.slot);
}

function setBallInstance(ball, fade) {
  instanceDummy.position.set(ball.position.x, ball.position.y, ball.position.z);
  instanceDummy.quaternion.identity();
  instanceDummy.scale.setScalar(ball.radius * fade);
  instanceDummy.updateMatrix();
  simulation.ballInstances.setMatrixAt(ball.slot, instanceDummy.matrix);
}

function setSplatInstance(splat, fade) {
  instanceDummy.position.copy(splat.position);
  instanceDummy.quaternion.copy(splat.quaternion);
  instanceDummy.scale.set(splat.scale * fade, splat.scale * 0.78 * fade, splat.scale * fade);
  instanceDummy.updateMatrix();
  simulation.splatInstances.setMatrixAt(splat.slot, instanceDummy.matrix);
}

function canSpawnBall(position, radius) {
  if (position.x - radius <= ARENA.minX || position.x + radius >= ARENA.maxX ||
      position.y - radius <= ARENA.floorY || position.y + radius >= ARENA.ceilingY ||
      position.z - radius <= ARENA.minZ || position.z + radius >= ARENA.maxZ) return false;
  return !obstacleDefinitions.some(function (box) {
    return sphereIntersectsBox(position, radius, box);
  });
}

function fireBall() {
  if (!isPlaying()) return false;
  const direction = new THREE.Vector3();
  simulation.camera.getWorldDirection(direction);
  const radius = simulation.powers.giant > 0 ? GIANT_BALL_RADIUS : BASE_BALL_RADIUS;
  const spawnDistance = PLAYER_RADIUS + radius + 0.5;
  const position = {
    x: simulation.camera.position.x + direction.x * spawnDistance,
    y: simulation.camera.position.y + direction.y * spawnDistance,
    z: simulation.camera.position.z + direction.z * spawnDistance
  };
  if (!canSpawnBall(position, radius)) return false;

  if (simulation.balls.length >= MAX_BALLS) {
    const oldest = simulation.balls.shift();
    removeBallMesh(oldest);
  }

  const color = palette[(simulation.nextBallId - 1) % palette.length];
  const slot = simulation.freeBallSlots.pop();
  const ball = {
    id: simulation.nextBallId,
    position,
    velocity: {
      x: direction.x * BALL_SPEED + simulation.player.velocity.x * 0.25,
      y: direction.y * BALL_SPEED,
      z: direction.z * BALL_SPEED + simulation.player.velocity.z * 0.25
    },
    radius,
    age: 0,
    color,
    splat: simulation.powers.splat > 0,
    lastSplatTime: -Infinity,
    slot,
    released: false
  };
  setBallInstance(ball, 1);
  simulation.ballInstances.setColorAt(slot, new THREE.Color(color));
  simulation.ballInstances.instanceMatrix.needsUpdate = true;
  simulation.ballInstances.instanceColor.needsUpdate = true;
  simulation.balls.push(ball);
  simulation.nextBallId += 1;
  updateHud();
  return true;
}

function addSplat(ball, collision) {
  if (!ball.splat || collision.speed < PROJECTILE.splatThreshold ||
      simulation.simulationTime - ball.lastSplatTime < PROJECTILE.splatCooldown) return;
  ball.lastSplatTime = simulation.simulationTime;
  if (simulation.splats.length >= MAX_SPLATS) {
    const oldest = simulation.splats.shift();
    removeSplatMesh(oldest);
  }

  const slot = simulation.freeSplatSlots.pop();
  const normal = new THREE.Vector3(collision.normal.x, collision.normal.y, collision.normal.z).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(zAxis, normal);
  const position = new THREE.Vector3(
    collision.point.x + normal.x * 0.012,
    collision.point.y + normal.y * 0.012,
    collision.point.z + normal.z * 0.012
  );
  const scale = clamp(ball.radius * (2.2 + collision.speed * 0.035), 0.34, 1.15);
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, (ball.id * 1.618 + simulation.splatCount * 0.7) % (Math.PI * 2)));
  const splat = { id: simulation.nextSplatId, age: 0, slot, position, quaternion, scale, released: false };
  setSplatInstance(splat, 1);
  simulation.splatInstances.setColorAt(slot, new THREE.Color(ball.color));
  simulation.splatInstances.instanceMatrix.needsUpdate = true;
  simulation.splatInstances.instanceColor.needsUpdate = true;
  simulation.splats.push(splat);
  simulation.nextSplatId += 1;
  simulation.splatCount += 1;
}

function activatePower(type) {
  simulation.powers[type] = POWER_DURATION;
  if (type === "rapid") simulation.fireCooldown = Math.min(simulation.fireCooldown, RAPID_FIRE_INTERVAL);
  simulation.pickupRespawns[type] = PICKUP_RESPAWN;
  simulation.pickupObjects[type].visible = false;
  const label = powerDefinitions[type].label;
  elements.toast.textContent = label + " — 10 seconds";
  elements.toast.hidden = false;
  window.clearTimeout(simulation.toastTimeout);
  simulation.toastTimeout = window.setTimeout(function () { elements.toast.hidden = true; }, 1500);
  announce(label + " active for 10 seconds.");
  updateHud();
}

function updatePickups(delta) {
  Object.keys(powerDefinitions).forEach(function (type, index) {
    const object = simulation.pickupObjects[type];
    if (simulation.pickupRespawns[type] > 0) {
      simulation.pickupRespawns[type] = Math.max(0, simulation.pickupRespawns[type] - delta);
      if (simulation.pickupRespawns[type] === 0) object.visible = true;
    }
    if (object.visible) {
      if (!elements.comfort.checked) {
        object.rotation.y += delta * (0.8 + index * 0.13);
        object.position.y = object.userData.baseY + Math.sin(simulation.simulationTime * 2.1 + index) * 0.12;
      } else {
        object.rotation.y = 0;
        object.position.y = object.userData.baseY;
      }
      const x = simulation.player.position.x - object.position.x;
      const z = simulation.player.position.z - object.position.z;
      if (x * x + z * z <= 0.85 * 0.85) activatePower(type);
    }
  });

  Object.keys(simulation.powers).forEach(function (type) {
    if (simulation.powers[type] <= 0) return;
    simulation.powers[type] = Math.max(0, simulation.powers[type] - delta);
    if (simulation.powers[type] === 0) announce(powerDefinitions[type].label + " expired.");
  });
}

function updatePlayer(delta) {
  const forwardInput = Number(simulation.keys.has("ArrowUp") || simulation.keys.has("KeyW")) -
    Number(simulation.keys.has("ArrowDown") || simulation.keys.has("KeyS"));
  const sideInput = Number(simulation.keys.has("ArrowRight") || simulation.keys.has("KeyD")) -
    Number(simulation.keys.has("ArrowLeft") || simulation.keys.has("KeyA"));
  const cameraForward = { x: -Math.sin(simulation.yaw), z: -Math.cos(simulation.yaw) };
  const cameraRight = { x: Math.cos(simulation.yaw), z: -Math.sin(simulation.yaw) };
  let desiredX = cameraForward.x * forwardInput + cameraRight.x * sideInput;
  let desiredZ = cameraForward.z * forwardInput + cameraRight.z * sideInput;
  const length = Math.hypot(desiredX, desiredZ);
  if (length > 1) {
    desiredX /= length;
    desiredZ /= length;
  }
  const blend = 1 - Math.exp(-14 * delta);
  simulation.player.velocity.x += (desiredX * WALK_SPEED - simulation.player.velocity.x) * blend;
  simulation.player.velocity.z += (desiredZ * WALK_SPEED - simulation.player.velocity.z) * blend;
  movePlayer(
    simulation.player.position,
    simulation.player.velocity,
    delta,
    PLAYER_RADIUS,
    obstacleDefinitions,
    ARENA
  );
}

function updateKeyboardLook(delta) {
  if (simulation.mode !== "keyboard") return;
  const speed = KEYBOARD_LOOK_SPEEDS[Number(elements.lookSpeed.value) - 1];
  const horizontal = Number(simulation.keys.has("KeyL")) - Number(simulation.keys.has("KeyJ"));
  const vertical = Number(simulation.keys.has("KeyK")) - Number(simulation.keys.has("KeyI"));
  simulation.yaw -= horizontal * speed * delta;
  simulation.pitch = clamp(simulation.pitch - vertical * speed * delta, -Math.PI * 0.472, Math.PI * 0.472);
}

function updateFiring(delta) {
  simulation.fireCooldown = Math.max(0, simulation.fireCooldown - delta);
  simulation.fireHeld = simulation.keyboardFire || simulation.mouseFire;
  if (!simulation.fireHeld || simulation.fireCooldown > 0) return;
  if (fireBall()) {
    simulation.fireCooldown = simulation.powers.rapid > 0 ? RAPID_FIRE_INTERVAL : BASE_FIRE_INTERVAL;
  }
}

function fixedUpdate(delta) {
  simulation.simulationTime += delta;
  updateKeyboardLook(delta);
  updatePlayer(delta);
  updateFiring(delta);
  updatePickups(delta);

  const survivingBalls = [];
  for (const ball of simulation.balls) {
    const collisions = stepProjectile(ball, delta, obstacleDefinitions, ARENA);
    for (const collision of collisions) {
      if (collision.speed > 0.5) simulation.bounceCount += 1;
      addSplat(ball, collision);
    }
    if (ball.age < PROJECTILE.lifetime) {
      if (ball.age > PROJECTILE.lifetime - 0.7) {
        const fade = clamp((PROJECTILE.lifetime - ball.age) / 0.7, 0, 1);
        setBallInstance(ball, fade);
      } else {
        setBallInstance(ball, 1);
      }
      survivingBalls.push(ball);
    } else {
      removeBallMesh(ball);
    }
  }
  simulation.balls = survivingBalls;

  const survivingSplats = [];
  for (const splat of simulation.splats) {
    splat.age += delta;
    if (splat.age < SPLAT_LIFETIME) {
      if (splat.age > SPLAT_LIFETIME - 0.7) {
        const fade = clamp((SPLAT_LIFETIME - splat.age) / 0.7, 0, 1);
        setSplatInstance(splat, fade);
      } else {
        setSplatInstance(splat, 1);
      }
      survivingSplats.push(splat);
    } else {
      removeSplatMesh(splat);
    }
  }
  simulation.splats = survivingSplats;
  simulation.ballInstances.instanceMatrix.needsUpdate = true;
  simulation.splatInstances.instanceMatrix.needsUpdate = true;
  updateCamera();
}

function updateHud() {
  setText(elements.ballCount, String(simulation.balls.length));
  setText(elements.bounceCount, String(simulation.bounceCount));
  setText(elements.splatCount, String(simulation.splatCount));
  ["rapid", "giant", "splat"].forEach(function (type) {
    const active = simulation.powers[type] > 0;
    const output = elements["power" + type.charAt(0).toUpperCase() + type.slice(1)];
    const row = elements["power" + type.charAt(0).toUpperCase() + type.slice(1) + "Row"];
    const hud = elements["hud" + type.charAt(0).toUpperCase() + type.slice(1)];
    setText(output, active ? Math.ceil(simulation.powers[type]) + " s" : "Inactive");
    row.classList.toggle("is-active", active);
    hud.classList.toggle("is-active", active);
  });
}

function animate(timestamp) {
  if (!simulation.lastTime) simulation.lastTime = timestamp;
  const elapsed = Math.min(0.05, Math.max(0, (timestamp - simulation.lastTime) / 1000));
  simulation.lastTime = timestamp;
  if (isPlaying() && !document.hidden) {
    simulation.accumulator += elapsed;
    let steps = 0;
    while (simulation.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      fixedUpdate(FIXED_STEP);
      simulation.accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (steps === MAX_SUBSTEPS) simulation.accumulator = 0;
  }
  updateHud();
  render();
  window.requestAnimationFrame(animate);
}

function keyDirectionHandled(code) {
  return [
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "KeyW", "KeyA", "KeyS", "KeyD", "KeyI", "KeyJ", "KeyK", "KeyL"
  ].includes(code);
}

window.addEventListener("keydown", function (event) {
  if (!isPlaying()) return;
  if (event.code === "Escape") {
    event.preventDefault();
    requestPause("Paused");
    return;
  }
  if (isFormTarget(event.target)) return;
  if (event.code === "Space") {
    event.preventDefault();
    simulation.keyboardFire = true;
    if (simulation.fireCooldown <= 0) updateFiring(0);
    return;
  }
  if (!keyDirectionHandled(event.code)) return;
  event.preventDefault();
  simulation.keys.add(event.code);
});

window.addEventListener("keyup", function (event) {
  if (event.code === "Space") simulation.keyboardFire = false;
  simulation.keys.delete(event.code);
  if (isPlaying() && (event.code === "Space" || keyDirectionHandled(event.code))) event.preventDefault();
});

elements.canvas.addEventListener("mousedown", function (event) {
  if (!isPlaying() || event.button !== 0 || simulation.mode !== "mouse") return;
  event.preventDefault();
  simulation.mouseFire = true;
  if (simulation.fireCooldown <= 0) updateFiring(0);
});

window.addEventListener("mouseup", function (event) {
  if (event.button === 0) simulation.mouseFire = false;
});

window.addEventListener("mousemove", function (event) {
  if (simulation.mode !== "mouse" || document.pointerLockElement !== elements.canvas) return;
  const sensitivity = LOOK_SPEEDS[Number(elements.lookSpeed.value) - 1];
  simulation.yaw -= event.movementX * sensitivity;
  simulation.pitch = clamp(simulation.pitch - event.movementY * sensitivity, -Math.PI * 0.472, Math.PI * 0.472);
  updateCamera();
});

document.addEventListener("pointerlockchange", function () {
  if (document.pointerLockElement === elements.canvas) {
    simulation.pointerLockPending = false;
    simulation.mode = "mouse";
    hideGate();
    elements.canvas.focus();
    setStatus("Playing · mouse look", "playing");
    announce("Mouse play started. Arrow keys move and clicking launches balls.");
    return;
  }
  if (simulation.pointerLockPending) {
    showPointerLockFallback();
    return;
  }
  if (simulation.mode === "unlocking") pauseGame(simulation.pendingPauseReason);
  else if (simulation.mode === "mouse") pauseGame("Paused");
});

document.addEventListener("pointerlockerror", showPointerLockFallback);

window.addEventListener("blur", function () {
  clearInput();
  if (isPlaying()) requestPause("Paused");
});

document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    clearInput();
    if (isPlaying()) requestPause("Paused while you were away");
  }
});

elements.canvas.addEventListener("blur", function () {
  clearInput();
  if (simulation.mode === "keyboard") pauseGame("Paused");
});

elements.canvas.addEventListener("webglcontextlost", function (event) {
  event.preventDefault();
  showError("3D view paused", "The browser lost the graphics connection. Reload the page to rebuild the playground.");
});

elements.startMouse.addEventListener("click", beginMouseMode);
elements.startKeyboard.addEventListener("click", beginKeyboardMode);
elements.reload.addEventListener("click", function () { window.location.reload(); });
elements.reset.addEventListener("click", function () {
  resetGame();
  if (isPlaying()) elements.canvas.focus();
});
elements.lookSpeed.addEventListener("input", function () {
  const label = ["Slow", "Medium", "Fast"][Number(elements.lookSpeed.value) - 1];
  setText(elements.lookSpeedValue, label);
  elements.lookSpeed.setAttribute("aria-valuetext", label);
});

document.getElementById("current-year").textContent = String(new Date().getFullYear());
elements.comfort.checked = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

try {
  initializeScene();
  resetGame({ silent: true });
  simulation.mode = "ready";
  showReadyGate();
  simulation.resizeObserver = "ResizeObserver" in window ? new ResizeObserver(resizeRenderer) : null;
  if (simulation.resizeObserver) simulation.resizeObserver.observe(elements.canvas);
  else window.addEventListener("resize", resizeRenderer);
  window.requestAnimationFrame(animate);
} catch (error) {
  console.error(error);
  showError(
    "3D playground unavailable",
    "This browser could not start WebGL, which the game needs. Try an up-to-date version of Chrome, Edge, Firefox, or Safari on a laptop or desktop."
  );
}

window.__ballBlasterLoaded = true;

window.__ballBlasterDebug = {
  simulation,
  fireBall,
  fixedUpdate,
  resetGame,
  activatePower,
  pauseGame,
  beginKeyboardMode,
  constants: {
    fixedStep: FIXED_STEP,
    maxBalls: MAX_BALLS,
    maxSplats: MAX_SPLATS,
    baseFireInterval: BASE_FIRE_INTERVAL,
    rapidFireInterval: RAPID_FIRE_INTERVAL
  }
};
