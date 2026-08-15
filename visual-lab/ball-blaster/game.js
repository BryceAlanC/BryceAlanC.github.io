import * as THREE from "./vendor/three.module.min.js";
import {
  PLAYER_PHYSICS,
  PROJECTILE,
  clamp
} from "./physics.mjs";
import {
  DODECA_ARENA,
  add3,
  cross3,
  dot3,
  faceLocalCoordinates,
  facePoint,
  facesAreAdjacent,
  makeFaceObstacle,
  normalize3,
  projectToPlane,
  resolveSphereObstacle,
  resolveSphereRoom,
  scale3,
  sphereIntersectsWorld,
  stepPlayerWorld,
  stepProjectileWorld,
  subtract3
} from "./poly-arena.mjs";

const FIXED_STEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const PLAYER_HEIGHT = PLAYER_PHYSICS.eyeHeight;
const PLAYER_RADIUS = 0.36;
const WALK_SPEED = 5.2;
const WALK_SPEEDS = [WALK_SPEED, 6.15, 7.2, 8.45, 9.85];
const JUMP_SPEEDS = [PLAYER_PHYSICS.jumpSpeed, 12.25, 13.5, 14.75, 16];
const LOOK_SPEEDS = [0.00115, 0.0018, 0.0026];
const KEYBOARD_LOOK_SPEEDS = [1.05, 1.65, 2.35];
const MAX_BALLS = 150;
const MAX_SPLATS = 180;
const BASE_BALL_RADIUS = 0.18;
const BALL_SPEED = 17;
const BASE_FIRE_INTERVAL = 0.28;
const RAPID_FIRE_INTERVALS = [0.28, 0.09, 0.065, 0.05, 0.04];
const GIANT_BALL_RADII = [BASE_BALL_RADIUS, 0.38, 0.65, 1, 1.4];
const BALL_GROWTH_DURATION = 0.36;
const SPLAT_SCALE_MULTIPLIERS = [1, 1, 1.45, 1.9, 2.4];
const MAX_POWER_LEVEL = 4;
const POWER_INITIAL_DURATION = 30;
const POWER_STACK_TIME = 10;
const POWER_MAX_DURATION = 60;
const PICKUP_RESPAWN_MIN = 5;
const PICKUP_RESPAWN_MAX = 9;
const SPLAT_LIFETIME = 8;
const BALL_FADE_TIME = 0.45;
const TARGET_RADIUS = 0.85;
const TARGET_COOLDOWN = 0.5;
const TARGET_WARP_TIME = 0.45;
const TARGET_MOVE_MIN = 12;
const TARGET_MOVE_MAX = 18;
const COMBO_WINDOW = 3.2;
const MAX_COMBO = 10;
const GRAVITY_FIRST_FLIP = 22;
const GRAVITY_INTERVAL_MIN = 20;
const GRAVITY_INTERVAL_MAX = 30;
const GRAVITY_WARNING_TIME = 3;
const CAMERA_ALIGN_SPEED = 5.4;
const WALL_WALK_COOLDOWN = 0.55;
const DEFAULT_RANDOM_SEED = 0x52f15e3d;
const TARGET_COUNT = 6;

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
  hudSpeed: document.getElementById("hud-speed"),
  hudJump: document.getElementById("hud-jump"),
  hudWallwalk: document.getElementById("hud-wallwalk"),
  hudScore: document.getElementById("hud-score"),
  hudCombo: document.getElementById("hud-combo"),
  hudGravity: document.getElementById("hud-gravity"),
  hudGravityCountdown: document.getElementById("hud-gravity-countdown"),
  hudTarget: document.getElementById("hud-target"),
  toast: document.getElementById("pickup-toast"),
  comfort: document.getElementById("comfort-mode"),
  lookSpeed: document.getElementById("look-speed"),
  lookSpeedValue: document.getElementById("look-speed-value"),
  reset: document.getElementById("reset-game"),
  scoreCount: document.getElementById("score-count"),
  comboCount: document.getElementById("combo-count"),
  comboMeterFill: document.getElementById("combo-meter-fill"),
  gravityState: document.getElementById("gravity-state"),
  gravityCountdown: document.getElementById("gravity-countdown"),
  targetCount: document.getElementById("target-count"),
  ballCount: document.getElementById("ball-count"),
  bounceCount: document.getElementById("bounce-count"),
  splatCount: document.getElementById("splat-count"),
  powerRapid: document.querySelector("#power-rapid .power-value"),
  powerGiant: document.querySelector("#power-giant .power-value"),
  powerSplat: document.querySelector("#power-splat .power-value"),
  powerSpeed: document.querySelector("#power-speed .power-value"),
  powerJump: document.querySelector("#power-jump .power-value"),
  powerWallwalk: document.querySelector("#power-wallwalk .power-value"),
  powerRapidRow: document.getElementById("power-rapid"),
  powerGiantRow: document.getElementById("power-giant"),
  powerSplatRow: document.getElementById("power-splat"),
  powerSpeedRow: document.getElementById("power-speed"),
  powerJumpRow: document.getElementById("power-jump"),
  powerWallwalkRow: document.getElementById("power-wallwalk"),
  callout: document.getElementById("event-callout"),
  calloutKicker: document.getElementById("event-callout-kicker"),
  calloutTitle: document.getElementById("event-callout-title"),
  calloutPoints: document.getElementById("event-callout-points"),
  announcer: document.getElementById("game-announcer")
};

const palette = [0xffa45b, 0xff6b6b, 0xffd166, 0x5ed6c0, 0x72a0ff, 0xb886ff];
const powerDefinitions = {
  rapid: { label: "Rapid fire", hud: "FAST", color: 0xffb347, symbol: "⚡" },
  giant: { label: "Jumbo balls", hud: "BIG", color: 0x48c9b0, symbol: "◉" },
  splat: { label: "Splat shot", hud: "SPLAT", color: 0xff6f61, symbol: "✹" },
  speed: { label: "Turbo boots", hud: "SPEED", color: 0x4a9ee8, symbol: "»" },
  jump: { label: "Moon jump", hud: "JUMP", color: 0xa988ea, symbol: "↑" },
  wallwalk: { label: "Wall Walk", hud: "GRIP", color: 0x37c994, symbol: "◆" }
};
const powerTypes = Object.keys(powerDefinitions);
const faceById = new Map(DODECA_ARENA.faces.map(function (face) { return [face.id, face]; }));
const startFace = faceById.get(DODECA_ARENA.floorFaceId) || DODECA_ARENA.faces[0];

const terrainColors = [0x236b73, 0xd76d4c, 0xb68bd1, 0xd1a54a, 0x3f8f77, 0x4e7fb2, 0xc98752];
const terrainSpecs = [];
DODECA_ARENA.faces.forEach(function (face, index) {
  if (face.id === startFace.id) return;
  if (index % 3 !== 2) {
    terrainSpecs.push({ face, u: -2.15, v: index % 2 ? 1.65 : -1.55, width: 2.7, depth: 2.35, height: 0.75 + index % 3 * 0.28 });
  }
  if (index % 4 === 1) {
    terrainSpecs.push({ face, u: 2.35, v: -1.4, width: 2.2, depth: 2.6, height: 1.25 });
  }
});
const terrainObstacles = terrainSpecs.map(function (spec, index) {
  return makeFaceObstacle(DODECA_ARENA, spec.face, {
    id: "terrain-" + index,
    u: spec.u,
    v: spec.v,
    width: spec.width,
    depth: spec.depth,
    height: spec.height,
    color: terrainColors[index % terrainColors.length]
  });
});
const WORLD = { room: DODECA_ARENA, obstacles: terrainObstacles };

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
  jumpQueued: false,
  heading: 0,
  pitch: 0,
  keys: new Set(),
  player: {
    position: { x: 0, y: PLAYER_HEIGHT, z: 12 },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    gravityDirection: { ...startFace.normal },
    supportFaceId: startFace.id
  },
  balls: [],
  splats: [],
  nextBallId: 1,
  nextSplatId: 1,
  bounceCount: 0,
  splatCount: 0,
  targetHits: 0,
  score: 0,
  combo: 1,
  comboRemaining: 0,
  lastTargetId: null,
  scoreMilestones: new Set(),
  targets: [],
  powers: {
    rapid: { level: 0, remaining: 0 },
    giant: { level: 0, remaining: 0 },
    splat: { level: 0, remaining: 0 },
    speed: { level: 0, remaining: 0 },
    jump: { level: 0, remaining: 0 },
    wallwalk: { level: 0, remaining: 0 }
  },
  pickupRespawns: { rapid: 0, giant: 0, splat: 0, speed: 0, jump: 0, wallwalk: 0 },
  pickupObjects: {},
  randomSeed: DEFAULT_RANDOM_SEED,
  randomStreams: { pickup: 1, target: 1, gravity: 1 },
  gravityFaceId: startFace.id,
  playerFaceId: startFace.id,
  gravity: {
    nextFlipAt: GRAVITY_FIRST_FLIP,
    nextFaceId: null,
    bag: [],
    warningIssued: false,
    flipCount: 0
  },
  wallWalkCooldown: 0,
  cameraQuaternion: new THREE.Quaternion(),
  callout: { remaining: 0, priority: 0 },
  toastTimeout: 0,
  resizeObserver: null,
  renderer: null,
  scene: null,
  camera: null
};

const ballGeometry = new THREE.SphereGeometry(1, 16, 12);
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
const splatGeometry = new THREE.CircleGeometry(1, 18);
const pickupCoreGeometry = new THREE.OctahedronGeometry(0.48, 0);
const pickupRingGeometry = new THREE.TorusGeometry(0.72, 0.08, 8, 24);
const instanceDummy = new THREE.Object3D();
const zAxis = new THREE.Vector3(0, 0, 1);
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const targetFlashColor = new THREE.Color(0xffffff);
const localZ = new THREE.Vector3(0, 0, 1);
const localY = new THREE.Vector3(0, 1, 0);
const cameraMatrix = new THREE.Matrix4();
const desiredCameraQuaternion = new THREE.Quaternion();
const cameraRightVector = new THREE.Vector3();
const cameraUpVector = new THREE.Vector3();
const cameraBackVector = new THREE.Vector3();
const movementCameraDirection = new THREE.Vector3();
const movementCameraRightDirection = new THREE.Vector3();

function announce(message) {
  elements.announcer.textContent = "";
  window.setTimeout(function () {
    elements.announcer.textContent = message;
  }, 20);
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

function setRandomSeed(seed = DEFAULT_RANDOM_SEED) {
  const normalized = Number(seed) >>> 0;
  simulation.randomSeed = normalized || DEFAULT_RANDOM_SEED;
  simulation.randomStreams.pickup = (simulation.randomSeed ^ 0x9e3779b9) >>> 0 || 0x1a2b3c4d;
  simulation.randomStreams.target = (simulation.randomSeed ^ 0x85ebca6b) >>> 0 || 0x5f356495;
  simulation.randomStreams.gravity = (simulation.randomSeed ^ 0xc2b2ae35) >>> 0 || 0x6d2b79f5;
  return simulation.randomSeed;
}

function randomUnit(streamName = "pickup") {
  let state = simulation.randomStreams[streamName] >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  simulation.randomStreams[streamName] = state >>> 0 || 0x6d2b79f5;
  return simulation.randomStreams[streamName] / 0x100000000;
}

function randomBetween(streamName, minimum, maximum) {
  return minimum + (maximum - minimum) * randomUnit(streamName);
}

function shuffleWithStream(values, streamName) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(randomUnit(streamName) * (index + 1));
    const value = result[index];
    result[index] = result[other];
    result[other] = value;
  }
  return result;
}

function hideCallout() {
  simulation.callout.remaining = 0;
  simulation.callout.priority = 0;
  elements.callout.classList.remove("is-active", "is-visible", "is-gravity", "is-combo", "is-score");
  elements.callout.hidden = true;
}

function showCallout(kind, kicker, title, points, duration = 1.25, priority = 1) {
  if (simulation.callout.remaining > 0 && priority < simulation.callout.priority) return false;
  simulation.callout.remaining = duration;
  simulation.callout.priority = priority;
  elements.callout.hidden = false;
  elements.callout.dataset.kind = kind;
  elements.calloutKicker.textContent = kicker;
  elements.calloutTitle.textContent = title;
  elements.calloutPoints.textContent = points || "";
  elements.callout.classList.remove("is-active", "is-visible", "is-gravity", "is-combo", "is-score");
  // Restart the short entrance animation when a bigger moment replaces another.
  void elements.callout.offsetWidth;
  elements.callout.classList.add("is-active", "is-" + kind);
  return true;
}

function updateCallout(delta) {
  if (simulation.callout.remaining <= 0) return;
  simulation.callout.remaining = Math.max(0, simulation.callout.remaining - delta);
  if (simulation.callout.remaining === 0) hideCallout();
}

function powerLevel(type) {
  return simulation.powers[type].remaining > 0 ? simulation.powers[type].level : 0;
}

function currentFireInterval() {
  return RAPID_FIRE_INTERVALS[powerLevel("rapid")];
}

function currentBallRadius() {
  return GIANT_BALL_RADII[powerLevel("giant")];
}

function currentWalkSpeed() {
  return WALK_SPEEDS[powerLevel("speed")];
}

function currentJumpSpeed() {
  return JUMP_SPEEDS[powerLevel("jump")];
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
    copy: "Bank bright shots into six roaming targets, chain different colors for combo points, and chase stackable power-ups across all twelve faces. There is still no way to lose — even when gravity shifts.",
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

function faceMeshGeometry(face) {
  const positions = [];
  face.vertices.forEach(function (point) { positions.push(point.x, point.y, point.z); });
  const indices = [];
  for (let index = 1; index < face.vertices.length - 1; index += 1) indices.push(0, index, index + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function faceObjectQuaternion(face, planeNormal = "inward") {
  const x = new THREE.Vector3(face.u.x, face.u.y, face.u.z).normalize();
  const zSource = planeNormal === "outward" ? face.normal : face.inwardNormal;
  const z = new THREE.Vector3(zSource.x, zSource.y, zSource.z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function makeTerrainMesh(scene, obstacle) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.dimensions.width, obstacle.dimensions.height, obstacle.dimensions.depth),
    new THREE.MeshStandardMaterial({ color: obstacle.color, roughness: 0.68, metalness: 0.02 })
  );
  const x = new THREE.Vector3(obstacle.axes.u.x, obstacle.axes.u.y, obstacle.axes.u.z).normalize();
  const y = new THREE.Vector3(obstacle.axes.up.x, obstacle.axes.up.y, obstacle.axes.up.z).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  mesh.position.set(obstacle.center.x, obstacle.center.y, obstacle.center.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createTargetMeshes(scene) {
  simulation.targets = [];
  for (let index = 0; index < TARGET_COUNT; index += 1) {
    const color = palette[index % palette.length];
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.52, TARGET_RADIUS, 32),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    const center = new THREE.Mesh(
      new THREE.CircleGeometry(0.41, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.48), side: THREE.DoubleSide })
    );
    center.position.z = 0.002;
    group.add(ring, center);
    group.visible = false;
    scene.add(group);
    simulation.targets.push({
      id: index,
      faceId: null,
      position: group.position,
      radius: TARGET_RADIUS,
      baseColor: new THREE.Color(color),
      group,
      ring,
      center,
      faceQuaternion: new THREE.Quaternion(),
      localCenter: { u: 0, v: 0 },
      amplitude: { u: 0, v: 0 },
      phase: 0,
      speed: 0.5,
      relocateIn: 0,
      warpRemaining: 0,
      cooldown: 0,
      flash: 0,
      active: false
    });
  }
}

function createArena(scene) {
  DODECA_ARENA.faces.forEach(function (face) {
    const material = new THREE.MeshStandardMaterial({
      color: face.color,
      roughness: 0.83,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(faceMeshGeometry(face), material);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  const edgePositions = [];
  DODECA_ARENA.edges.forEach(function (edge) {
    edge.vertices.forEach(function (point) { edgePositions.push(point.x, point.y, point.z); });
  });
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
  scene.add(new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: 0x295f65, transparent: true, opacity: 0.42 })
  ));

  terrainObstacles.forEach(function (obstacle) { makeTerrainMesh(scene, obstacle); });
  createTargetMeshes(scene);
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
  sprite.position.z = 1.2;
  sprite.scale.set(1.65, 0.52, 1);
  return sprite;
}

function pickupSpawnIsClear(point, type, faceId) {
  const playerDistance = Math.hypot(
    simulation.player.position.x - point.x,
    simulation.player.position.y - point.y,
    simulation.player.position.z - point.z
  );
  if (playerDistance < 5 || sphereIntersectsWorld(point, 0.72, WORLD)) return false;
  const overlapsPickup = powerTypes.some(function (otherType) {
    if (otherType === type) return false;
    const other = simulation.pickupObjects[otherType];
    if (!other || !other.visible) return false;
    return other.position.distanceToSquared(point) < 3.2 * 3.2;
  });
  if (overlapsPickup) return false;
  return !simulation.targets.some(function (target) {
    return target.active && target.faceId === faceId && target.group.position.distanceToSquared(point) < 2.4 * 2.4;
  });
}

function randomFacePoint(face, streamName, height, maximumRadius = 5.7) {
  const angle = randomUnit(streamName) * Math.PI * 2;
  const radius = Math.sqrt(randomUnit(streamName)) * maximumRadius;
  return facePoint(face, Math.cos(angle) * radius, Math.sin(angle) * radius, height);
}

function relocatePickup(type, faceId = simulation.gravityFaceId) {
  const object = simulation.pickupObjects[type];
  if (!object) return null;
  const face = faceById.get(faceId) || startFace;
  let chosen;
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = randomFacePoint(face, "pickup", 0.82);
    if (pickupSpawnIsClear(candidate, type, face.id)) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) return null;
  object.position.set(chosen.x, chosen.y, chosen.z);
  object.quaternion.copy(faceObjectQuaternion(face));
  object.userData.basePosition = { ...chosen };
  object.userData.faceId = face.id;
  return { x: chosen.x, y: chosen.y, z: chosen.z, faceId: face.id };
}

function relocateVisiblePickups(faceId = simulation.gravityFaceId) {
  const placements = {};
  powerTypes.forEach(function (type) {
    const object = simulation.pickupObjects[type];
    if (object?.visible) {
      const placement = relocatePickup(type, faceId);
      if (placement) placements[type] = placement;
      else {
        object.visible = false;
        simulation.pickupRespawns[type] = 0.5;
      }
    }
  });
  return placements;
}

function createPickups(scene) {
  powerTypes.forEach(function (type) {
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
    group.add(core, ring);
    const label = createLabelSprite(definition.hud, definition.color);
    group.add(label);
    group.userData.type = type;
    group.userData.label = label;
    group.userData.core = core;
    group.userData.ring = ring;
    group.visible = false;
    scene.add(group);
    simulation.pickupObjects[type] = group;
  });
}

function updatePickupLabels() {
  let nearestLabel = null;
  let nearestDistanceSquared = 6.75 * 6.75;
  powerTypes.forEach(function (type) {
    const object = simulation.pickupObjects[type];
    if (!object) return;
    object.userData.label.visible = false;
    if (!object.visible) return;
    const x = simulation.player.position.x - object.position.x;
    const y = simulation.player.position.y - object.position.y;
    const z = simulation.player.position.z - object.position.z;
    const distanceSquared = x * x + y * y + z * z;
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestLabel = object.userData.label;
    }
  });
  if (nearestLabel) nearestLabel.visible = true;
}

function initializeScene() {
  simulation.renderer = createWebGLRenderer();
  simulation.scene = new THREE.Scene();
  simulation.scene.background = new THREE.Color(0x102f3a);
  simulation.scene.fog = new THREE.Fog(0x102f3a, 25, 58);
  simulation.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
  simulation.scene.add(simulation.camera);

  const hemisphere = new THREE.HemisphereLight(0xeafcff, 0x6b4b38, 2.35);
  simulation.scene.add(hemisphere);
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  simulation.scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff2d4, 2.8);
  sun.position.set(8, 15, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  simulation.scene.add(sun);

  createArena(simulation.scene);
  initializeInstances(simulation.scene);
  createPickups(simulation.scene);
  updateCamera(1, true);
  resizeRenderer();
  render();
}

function gravityFace() {
  return faceById.get(simulation.gravityFaceId) || startFace;
}

function playerFace() {
  return faceById.get(simulation.playerFaceId) || gravityFace();
}

function flatForwardForFace(face = playerFace()) {
  return normalize3(add3(
    scale3(face.v, Math.cos(simulation.heading)),
    scale3(face.u, Math.sin(simulation.heading))
  ), face.v);
}

function viewDirectionForFace(face = playerFace()) {
  const flat = flatForwardForFace(face);
  return normalize3(add3(
    scale3(flat, Math.cos(simulation.pitch)),
    scale3(face.inwardNormal, Math.sin(simulation.pitch))
  ), flat);
}

function desiredViewQuaternion() {
  const face = playerFace();
  const forward = viewDirectionForFace(face);
  const right = normalize3(cross3(forward, face.inwardNormal), face.u);
  const up = normalize3(cross3(right, forward), face.inwardNormal);
  cameraRightVector.set(right.x, right.y, right.z);
  cameraUpVector.set(up.x, up.y, up.z);
  cameraBackVector.set(-forward.x, -forward.y, -forward.z);
  cameraMatrix.makeBasis(cameraRightVector, cameraUpVector, cameraBackVector);
  return desiredCameraQuaternion.setFromRotationMatrix(cameraMatrix);
}

function updateCamera(delta = FIXED_STEP, forceSnap = false) {
  simulation.camera.position.set(
    simulation.player.position.x,
    simulation.player.position.y,
    simulation.player.position.z
  );
  const desired = desiredViewQuaternion();
  if (forceSnap || elements.comfort.checked) simulation.camera.quaternion.copy(desired);
  else simulation.camera.quaternion.slerp(desired, 1 - Math.exp(-CAMERA_ALIGN_SPEED * delta));
  simulation.cameraQuaternion.copy(simulation.camera.quaternion);
}

function screenControlSign() {
  return 1;
}

function gravityLabel() {
  return gravityFace().label;
}

function refillGravityBag() {
  simulation.gravity.bag = shuffleWithStream(
    DODECA_ARENA.faces.map(function (face) { return face.id; }),
    "gravity"
  );
  if (simulation.gravity.bag[0] === simulation.gravityFaceId && simulation.gravity.bag.length > 1) {
    const replacement = simulation.gravity.bag[1];
    simulation.gravity.bag[1] = simulation.gravity.bag[0];
    simulation.gravity.bag[0] = replacement;
  }
}

function takeNextGravityFace() {
  if (!simulation.gravity.bag.length) refillGravityBag();
  let faceId = simulation.gravity.bag.shift();
  if (faceId === simulation.gravityFaceId) {
    if (!simulation.gravity.bag.length) refillGravityBag();
    const replacement = simulation.gravity.bag.shift();
    simulation.gravity.bag.push(faceId);
    faceId = replacement;
  }
  return faceId;
}

function scheduleNextGravity(initial = false) {
  const interval = initial
    ? GRAVITY_FIRST_FLIP
    : randomBetween("gravity", GRAVITY_INTERVAL_MIN, GRAVITY_INTERVAL_MAX);
  simulation.gravity.nextFlipAt = simulation.simulationTime + interval;
  simulation.gravity.nextFaceId = takeNextGravityFace();
  simulation.gravity.warningIssued = false;
  return { faceId: simulation.gravity.nextFaceId, at: simulation.gravity.nextFlipAt };
}

function changePlayerFace(faceId, options = {}) {
  const nextFace = faceById.get(faceId);
  if (!nextFace || faceId === simulation.playerFaceId) return false;
  const previousForward = flatForwardForFace(playerFace());
  const towardFaceCenter = projectToPlane(subtract3(nextFace.center, simulation.player.position), nextFace.normal);
  const centerDirectionIsUseful = dot3(towardFaceCenter, towardFaceCenter) > 0.04;
  const projectedPreviousForward = projectToPlane(previousForward, nextFace.normal);
  const nextForward = normalize3(
    centerDirectionIsUseful ? towardFaceCenter : projectedPreviousForward,
    nextFace.v
  );
  simulation.heading = Math.atan2(dot3(nextForward, nextFace.u), dot3(nextForward, nextFace.v));
  simulation.playerFaceId = nextFace.id;
  simulation.player.gravityDirection = { ...nextFace.normal };
  simulation.player.grounded = false;
  simulation.player.supportFaceId = null;
  const momentumScale = options.keepMomentum === false ? 0 : 0.68;
  simulation.player.velocity.x *= momentumScale;
  simulation.player.velocity.y *= momentumScale;
  simulation.player.velocity.z *= momentumScale;
  const speed = Math.hypot(simulation.player.velocity.x, simulation.player.velocity.y, simulation.player.velocity.z);
  if (speed > 18) {
    const amount = 18 / speed;
    simulation.player.velocity.x *= amount;
    simulation.player.velocity.y *= amount;
    simulation.player.velocity.z *= amount;
  }
  return true;
}

function wallWalkActive() {
  return powerLevel("wallwalk") > 0;
}

function forceGravityFlip(options = {}) {
  const requested = options.faceId || simulation.gravity.nextFaceId || takeNextGravityFace();
  const destinationFace = faceById.get(requested) || startFace;
  simulation.gravityFaceId = destinationFace.id;
  simulation.gravity.flipCount += 1;
  if (!wallWalkActive()) changePlayerFace(destinationFace.id);
  relocateVisiblePickups(destinationFace.id);
  const destination = destinationFace.label + " is down now";
  showCallout("gravity", "Arena alert", "Gravity shift!", destination, 2.25, 6);
  if (options.announceEvent !== false) announce("Gravity shift. " + destination + ".");
  if (isPlaying()) setStatus("Playing · down is " + destinationFace.label, "playing");
  if (options.schedule !== false) scheduleNextGravity(false);
  else simulation.gravity.warningIssued = false;
  updateHud();
  return simulation.gravityFaceId;
}

function updateGravity() {
  const warningAt = simulation.gravity.nextFlipAt - GRAVITY_WARNING_TIME;
  if (!simulation.gravity.warningIssued && simulation.simulationTime >= warningAt) {
    simulation.gravity.warningIssued = true;
    const nextFace = faceById.get(simulation.gravity.nextFaceId) || startFace;
    showCallout("gravity", "Get ready", "Gravity shift incoming!", nextFace.label + " in 3 seconds", 1.75, 5);
    announce("Gravity shift incoming. " + nextFace.label + " will be down in three seconds.");
  }
  if (simulation.simulationTime >= simulation.gravity.nextFlipAt) forceGravityFlip();
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
  simulation.jumpQueued = false;
  const down = playerFace().normal;
  const vertical = dot3(simulation.player.velocity, down);
  simulation.player.velocity.x = down.x * vertical;
  simulation.player.velocity.y = down.y * vertical;
  simulation.player.velocity.z = down.z * vertical;
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
  announce("Keyboard play started. Arrow keys move, I J K L look, Space jumps, and F launches balls.");
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
    copy: "You can still play with the keyboard: use I, J, K, and L to look, Space to jump, and F to launch.",
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
  simulation.targetHits = 0;
  simulation.score = 0;
  simulation.combo = 1;
  simulation.comboRemaining = 0;
  simulation.lastTargetId = null;
  simulation.scoreMilestones.clear();
  simulation.simulationTime = 0;
  simulation.fireCooldown = 0;
  simulation.accumulator = 0;
  simulation.gravityFaceId = startFace.id;
  simulation.playerFaceId = startFace.id;
  simulation.gravity.bag = [];
  simulation.gravity.nextFaceId = null;
  simulation.gravity.flipCount = 0;
  simulation.wallWalkCooldown = 0;
  const startPosition = facePoint(startFace, 0, 0, PLAYER_HEIGHT);
  simulation.player.position.x = startPosition.x;
  simulation.player.position.y = startPosition.y;
  simulation.player.position.z = startPosition.z;
  simulation.player.velocity.x = 0;
  simulation.player.velocity.y = 0;
  simulation.player.velocity.z = 0;
  simulation.player.grounded = true;
  simulation.player.gravityDirection = { ...startFace.normal };
  simulation.player.supportFaceId = startFace.id;
  simulation.heading = 0;
  simulation.pitch = 0;
  setRandomSeed();
  scheduleNextGravity(true);
  powerTypes.forEach(function (type) {
    simulation.powers[type].level = 0;
    simulation.powers[type].remaining = 0;
    simulation.pickupRespawns[type] = 0;
    simulation.pickupObjects[type].visible = false;
  });
  powerTypes.forEach(function (type) {
    const placement = relocatePickup(type, startFace.id);
    simulation.pickupObjects[type].visible = Boolean(placement);
    if (!placement) simulation.pickupRespawns[type] = 0.5;
  });
  resetTargets();
  window.clearTimeout(simulation.toastTimeout);
  elements.toast.hidden = true;
  hideCallout();
  clearInput();
  updateCamera(1, true);
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
  return !sphereIntersectsWorld(position, radius, WORLD);
}

function findSafeMuzzlePosition(direction, radius) {
  const cameraPosition = simulation.camera.position;
  const normalizedDirection = normalize3(direction, viewDirectionForFace());
  const minimumSeparation = PLAYER_RADIUS + radius + 0.14;
  const baseDistance = PLAYER_RADIUS + radius + 0.5;
  const distances = [
    baseDistance,
    minimumSeparation,
    (baseDistance + minimumSeparation) * 0.5,
    baseDistance + 0.3 + radius * 0.35,
    baseDistance + 0.7 + radius * 0.75,
    baseDistance + 1.2 + radius * 1.2
  ];
  for (const distance of distances) {
    const initialPosition = {
      x: cameraPosition.x + normalizedDirection.x * distance,
      y: cameraPosition.y + normalizedDirection.y * distance,
      z: cameraPosition.z + normalizedDirection.z * distance
    };
    const candidate = {
      position: { ...initialPosition },
      velocity: { x: 0, y: 0, z: 0 },
      radius
    };
    if (!canSpawnBall(candidate.position, radius)) {
      const resolutionCollisions = [];
      for (let pass = 0; pass < 5; pass += 1) {
        resolveSphereRoom(candidate, WORLD.room, resolutionCollisions);
        WORLD.obstacles.forEach(function (obstacle) {
          resolveSphereObstacle(candidate, obstacle, resolutionCollisions);
        });
      }
    }
    if (!canSpawnBall(candidate.position, radius)) continue;
    const offset = subtract3(candidate.position, cameraPosition);
    const separationSquared = dot3(offset, offset);
    const forwardDistance = dot3(offset, normalizedDirection);
    const rayErrorSquared = Math.max(0, separationSquared - forwardDistance * forwardDistance);
    const maximumRayError = Math.max(0.035, radius * 0.08);
    if (separationSquared < minimumSeparation * minimumSeparation || forwardDistance < 0.05 ||
        rayErrorSquared > maximumRayError * maximumRayError) continue;
    return candidate.position;
  }
  return null;
}

function findLaunchSphere(direction, targetRadius) {
  const radii = GIANT_BALL_RADII.filter(function (radius) {
    return radius <= targetRadius + 1e-9;
  }).sort(function (first, second) { return second - first; });
  if (!radii.some(function (radius) { return Math.abs(radius - targetRadius) < 1e-9; })) {
    radii.unshift(targetRadius);
  }
  for (const radius of radii) {
    const position = findSafeMuzzlePosition(direction, radius);
    if (position) return { position, radius };
  }
  return null;
}

function fireBall() {
  if (!isPlaying()) return false;
  const direction = new THREE.Vector3();
  simulation.camera.getWorldDirection(direction);
  const targetRadius = currentBallRadius();
  const launch = findLaunchSphere(direction, targetRadius);
  if (!launch) return false;

  if (simulation.balls.length >= MAX_BALLS) {
    const oldest = simulation.balls.shift();
    removeBallMesh(oldest);
  }

  const color = palette[(simulation.nextBallId - 1) % palette.length];
  const slot = simulation.freeBallSlots.pop();
  const ball = {
    id: simulation.nextBallId,
    position: launch.position,
    velocity: {
      x: direction.x * BALL_SPEED + simulation.player.velocity.x * 0.25,
      y: direction.y * BALL_SPEED + simulation.player.velocity.y * 0.25,
      z: direction.z * BALL_SPEED + simulation.player.velocity.z * 0.25
    },
    radius: launch.radius,
    launchRadius: launch.radius,
    targetRadius,
    growthElapsed: launch.radius < targetRadius ? 0 : BALL_GROWTH_DURATION,
    age: 0,
    color,
    splatLevel: powerLevel("splat"),
    ricochets: 0,
    bounceCooldown: 0,
    targetHits: new Set(),
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
  if (ball.splatLevel <= 0 || collision.speed < PROJECTILE.splatThreshold) return false;
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
  const scaleMultiplier = SPLAT_SCALE_MULTIPLIERS[clamp(ball.splatLevel, 0, MAX_POWER_LEVEL)];
  const splatRadius = Math.max(ball.radius, ball.targetRadius || 0);
  const scale = clamp(
    splatRadius * (2.2 + collision.speed * 0.035) * scaleMultiplier,
    0.34,
    4.2
  );
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, (ball.id * 1.618 + simulation.splatCount * 0.7) % (Math.PI * 2)));
  const splat = { id: simulation.nextSplatId, age: 0, slot, position, quaternion, scale, released: false };
  setSplatInstance(splat, 1);
  simulation.splatInstances.setColorAt(slot, new THREE.Color(ball.color));
  simulation.splatInstances.instanceMatrix.needsUpdate = true;
  simulation.splatInstances.instanceColor.needsUpdate = true;
  simulation.splats.push(splat);
  simulation.nextSplatId += 1;
  simulation.splatCount += 1;
  return true;
}

function comboTitle(combo) {
  if (combo === 2) return "Double hit!";
  if (combo === 3) return "Triple hit!";
  if (combo === 5) return "High five!";
  if (combo === 8) return "Ricochet rush!";
  if (combo >= 10) return "Mega combo!";
  return combo + "× combo!";
}

function targetPathIsClear(face, center, amplitude) {
  for (let sample = 0; sample < 16; sample += 1) {
    const angle = sample / 16 * Math.PI * 2;
    const u = center.u + amplitude.u * Math.sin(angle);
    const v = center.v + amplitude.v * Math.sin(angle * 0.73 + 1.1);
    const blocked = terrainObstacles.some(function (obstacle) {
      return obstacle.faceId === face.id &&
        Math.abs(u - obstacle.local.u) < obstacle.halfExtents.u + TARGET_RADIUS + 0.35 &&
        Math.abs(v - obstacle.local.v) < obstacle.halfExtents.v + TARGET_RADIUS + 0.35;
    });
    if (blocked) return false;
  }
  return true;
}

function chooseTargetFace(target) {
  const occupied = new Set(simulation.targets.filter(function (candidate) {
    return candidate !== target && candidate.active;
  }).map(function (candidate) { return candidate.faceId; }));
  const choices = shuffleWithStream(DODECA_ARENA.faces, "target").filter(function (face) {
    return !occupied.has(face.id) && face.id !== target.faceId;
  });
  return choices[0] || DODECA_ARENA.faces.find(function (face) { return !occupied.has(face.id); }) || startFace;
}

function positionTarget(target) {
  const face = faceById.get(target.faceId) || startFace;
  const angle = target.motionTime * target.speed + target.phase;
  const u = target.localCenter.u + target.amplitude.u * Math.sin(angle);
  const v = target.localCenter.v + target.amplitude.v * Math.sin(angle * 0.73 + target.phase * 0.61);
  const point = facePoint(face, u, v, 0.025);
  target.group.position.set(point.x, point.y, point.z);
  target.group.quaternion.copy(target.faceQuaternion);
}

function relocateTarget(target, forcedFaceId = null) {
  let face = forcedFaceId ? faceById.get(forcedFaceId) : null;
  if (!face) face = chooseTargetFace(target);
  let center = { u: 0, v: 0 };
  let amplitude = { u: 0.7, v: 0.7 };
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const radialAngle = randomUnit("target") * Math.PI * 2;
    const radialDistance = Math.sqrt(randomUnit("target")) * 4.45;
    const candidateCenter = {
      u: Math.cos(radialAngle) * radialDistance,
      v: Math.sin(radialAngle) * radialDistance
    };
    const candidateAmplitude = {
      u: randomBetween("target", 0.45, 1.15),
      v: randomBetween("target", 0.45, 1.15)
    };
    if (targetPathIsClear(face, candidateCenter, candidateAmplitude)) {
      center = candidateCenter;
      amplitude = candidateAmplitude;
      break;
    }
  }
  target.faceId = face.id;
  target.faceQuaternion.copy(faceObjectQuaternion(face));
  target.localCenter = center;
  target.amplitude = amplitude;
  target.phase = randomUnit("target") * Math.PI * 2;
  target.speed = randomBetween("target", 0.42, 0.72);
  target.motionTime = 0;
  target.relocateIn = randomBetween("target", TARGET_MOVE_MIN, TARGET_MOVE_MAX);
  target.warpRemaining = 0;
  target.cooldown = 0;
  target.flash = 0;
  target.active = true;
  target.group.visible = true;
  target.group.scale.setScalar(1);
  target.ring.material.color.copy(target.baseColor);
  target.center.material.color.copy(target.baseColor).multiplyScalar(0.48);
  positionTarget(target);
  return { targetId: target.id, faceId: face.id, center: { ...center } };
}

function beginTargetWarp(target) {
  if (!target || !target.active) return false;
  target.active = false;
  target.warpRemaining = TARGET_WARP_TIME;
  target.cooldown = TARGET_COOLDOWN;
  return true;
}

function resetTargets() {
  simulation.targets.forEach(function (target) {
    target.faceId = null;
    target.active = false;
    target.group.visible = false;
    target.cooldown = 0;
    target.flash = 0;
  });
  simulation.targets.forEach(function (target) { relocateTarget(target); });
}

function scoreTargetHit(ball, target) {
  if (!ball || !target || !target.active || target.cooldown > 0) return 0;
  if (!(ball.targetHits instanceof Set)) ball.targetHits = new Set();
  if (ball.targetHits.has(target.id)) return 0;
  ball.targetHits.add(target.id);
  target.cooldown = TARGET_COOLDOWN;
  target.flash = 0.48;
  simulation.targetHits += 1;

  const continues = simulation.comboRemaining > 0 && simulation.lastTargetId !== target.id;
  simulation.combo = continues ? Math.min(MAX_COMBO, simulation.combo + 1) : 1;
  simulation.comboRemaining = COMBO_WINDOW;
  simulation.lastTargetId = target.id;
  const ricochetBonus = 25 * Math.min(Math.max(0, ball.ricochets || 0), 4);
  const points = (100 + ricochetBonus) * simulation.combo;
  const previousScore = simulation.score;
  simulation.score += points;

  const isCombo = simulation.combo > 1;
  const title = isCombo ? comboTitle(simulation.combo) : "Target hit!";
  const priority = simulation.combo >= 3 ? 2 : 1;
  showCallout(
    isCombo ? "combo" : "score",
    isCombo ? "Combo chain" : (ricochetBonus ? "Bank shot" : "Bullseye"),
    title,
    "+" + formatNumber(points) + " points",
    simulation.combo >= 3 ? 1.55 : 0.95,
    priority
  );

  const crossedMilestone = [5000, 10000, 25000, 50000].find(function (milestone) {
    return previousScore < milestone && simulation.score >= milestone && !simulation.scoreMilestones.has(milestone);
  });
  if (crossedMilestone) {
    simulation.scoreMilestones.add(crossedMilestone);
    showCallout("score", "Score milestone", formatNumber(crossedMilestone) + " points!", "Keep it bouncing", 1.8, 2);
    announce(formatNumber(crossedMilestone) + " point milestone!");
  } else if (simulation.combo >= 3) {
    announce(title + " " + formatNumber(points) + " points.");
  }
  beginTargetWarp(target);
  updateHud();
  return points;
}

function scoreFirstTargetCollision(ball, collisions) {
  if (!collisions?.length) return 0;
  for (const collision of collisions) {
    if (collision.kind !== "room" || !collision.faceId || !collision.point) continue;
    const face = faceById.get(collision.faceId);
    if (!face || dot3(collision.normal, face.inwardNormal) < 0.92) continue;
    const localHit = faceLocalCoordinates(face, collision.point);
    for (const target of simulation.targets) {
      if (!target.active || target.faceId !== face.id) continue;
      const localTarget = faceLocalCoordinates(face, target.position);
      const x = localHit.u - localTarget.u;
      const y = localHit.v - localTarget.v;
      const ballRadius = Number.isFinite(ball.radius) ? ball.radius : BASE_BALL_RADIUS;
      const hitRadius = target.radius + Math.min(ballRadius * 0.55, 0.7);
      if (x * x + y * y <= hitRadius * hitRadius) return scoreTargetHit(ball, target);
    }
  }
  return 0;
}

function updateScoring(delta) {
  if (simulation.comboRemaining <= 0) return;
  simulation.comboRemaining = Math.max(0, simulation.comboRemaining - delta);
  if (simulation.comboRemaining === 0) {
    simulation.combo = 1;
    simulation.lastTargetId = null;
  }
}

function updateTargets(delta) {
  simulation.targets.forEach(function (target) {
    target.cooldown = Math.max(0, target.cooldown - delta);
    target.flash = Math.max(0, target.flash - delta);
    if (!target.active) {
      target.warpRemaining = Math.max(0, target.warpRemaining - delta);
      const amount = clamp(target.warpRemaining / TARGET_WARP_TIME, 0, 1);
      target.group.scale.setScalar(Math.max(0.04, amount));
      if (target.warpRemaining === 0) relocateTarget(target);
      return;
    }
    target.motionTime += delta * (elements.comfort.checked ? 0.45 : 1);
    target.relocateIn = Math.max(0, target.relocateIn - delta);
    if (target.relocateIn === 0) {
      beginTargetWarp(target);
      return;
    }
    positionTarget(target);
    const flashAmount = clamp(target.flash / 0.48, 0, 1);
    target.ring.material.color.copy(target.baseColor).lerp(targetFlashColor, flashAmount);
    target.center.material.color.copy(target.baseColor).multiplyScalar(0.5).lerp(targetFlashColor, flashAmount * 0.82);
    const pulse = elements.comfort.checked ? 0 : Math.sin(flashAmount * Math.PI) * 0.16;
    target.group.scale.setScalar(1 + pulse);
  });
}

function activatePower(type) {
  const power = simulation.powers[type];
  if (!power || !simulation.pickupObjects[type]) return false;
  const wasActive = power.level > 0 && power.remaining > 0;
  power.level = Math.min(MAX_POWER_LEVEL, wasActive ? power.level + 1 : 1);
  power.remaining = wasActive
    ? Math.min(POWER_MAX_DURATION, Math.max(power.remaining, POWER_INITIAL_DURATION) + POWER_STACK_TIME)
    : POWER_INITIAL_DURATION;
  if (type === "rapid") simulation.fireCooldown = Math.min(simulation.fireCooldown, currentFireInterval());
  simulation.pickupRespawns[type] = randomBetween("pickup", PICKUP_RESPAWN_MIN, PICKUP_RESPAWN_MAX);
  simulation.pickupObjects[type].visible = false;
  const label = powerDefinitions[type].label;
  elements.toast.textContent = label + " — level " + power.level + "!";
  elements.toast.hidden = false;
  window.clearTimeout(simulation.toastTimeout);
  simulation.toastTimeout = window.setTimeout(function () { elements.toast.hidden = true; }, 1500);
  if (type === "wallwalk" && !wasActive) {
    showCallout("score", "Power up", "Wall Walk!", "Run into a seam to climb", 1.55, 3);
  }
  announce(label + " level " + power.level + ". " + Math.ceil(power.remaining) + " seconds remaining.");
  updateHud();
  return true;
}

function updatePickups(delta) {
  powerTypes.forEach(function (type, index) {
    const object = simulation.pickupObjects[type];
    if (simulation.pickupRespawns[type] > 0) {
      simulation.pickupRespawns[type] = Math.max(0, simulation.pickupRespawns[type] - delta);
      if (simulation.pickupRespawns[type] === 0) {
        const placement = relocatePickup(type);
        object.visible = Boolean(placement);
        if (!placement) simulation.pickupRespawns[type] = 0.5;
      }
    }
    if (object.visible) {
      const face = faceById.get(object.userData.faceId) || gravityFace();
      const base = object.userData.basePosition;
      if (!elements.comfort.checked) {
        const bob = Math.sin(simulation.simulationTime * 2.1 + index) * 0.12;
        object.position.set(
          base.x + face.inwardNormal.x * bob,
          base.y + face.inwardNormal.y * bob,
          base.z + face.inwardNormal.z * bob
        );
        object.userData.ring.rotation.z += delta * (0.8 + index * 0.13);
        object.userData.core.rotation.z -= delta * (0.42 + index * 0.07);
      } else {
        object.position.set(base.x, base.y, base.z);
        object.userData.ring.rotation.z = 0;
        object.userData.core.rotation.z = 0;
      }
      const x = simulation.player.position.x - object.position.x;
      const y = simulation.player.position.y - object.position.y;
      const z = simulation.player.position.z - object.position.z;
      if (x * x + y * y + z * z <= 1.05 * 1.05) activatePower(type);
    }
  });

  powerTypes.forEach(function (type) {
    const power = simulation.powers[type];
    if (power.remaining <= 0) return;
    power.remaining = Math.max(0, power.remaining - delta);
    if (power.remaining === 0) {
      power.level = 0;
      if (type === "wallwalk" && simulation.playerFaceId !== simulation.gravityFaceId) {
        changePlayerFace(simulation.gravityFaceId);
        simulation.wallWalkCooldown = WALL_WALK_COOLDOWN;
        showCallout("score", "Power ended", "Grip released!", gravityLabel() + " is down", 1.35, 3);
      }
      announce(powerDefinitions[type].label + " expired.");
    }
  });
  updatePickupLabels();
}

function updatePlayer(delta) {
  const forwardInput = Number(simulation.keys.has("ArrowUp") || simulation.keys.has("KeyW")) -
    Number(simulation.keys.has("ArrowDown") || simulation.keys.has("KeyS"));
  const sideInput = Number(simulation.keys.has("ArrowRight") || simulation.keys.has("KeyD")) -
    Number(simulation.keys.has("ArrowLeft") || simulation.keys.has("KeyA"));
  const face = playerFace();
  simulation.camera.getWorldDirection(movementCameraDirection);
  const projectedCameraForward = projectToPlane(movementCameraDirection, face.normal);
  const cameraForward = normalize3(projectedCameraForward, flatForwardForFace(face));
  movementCameraRightDirection.set(1, 0, 0).applyQuaternion(simulation.camera.quaternion);
  const projectedCameraRight = projectToPlane(movementCameraRightDirection, face.normal);
  const cameraRight = normalize3(
    projectedCameraRight,
    normalize3(cross3(cameraForward, face.inwardNormal), face.u)
  );
  let desired = add3(scale3(cameraForward, forwardInput), scale3(cameraRight, sideInput));
  const length = Math.sqrt(dot3(desired, desired));
  if (length > 1) {
    desired = scale3(desired, 1 / length);
  }
  const blend = 1 - Math.exp(-14 * delta);
  const walkSpeed = currentWalkSpeed();
  const down = face.normal;
  const verticalSpeed = dot3(simulation.player.velocity, down);
  const currentTangent = projectToPlane(simulation.player.velocity, down);
  const desiredTangent = scale3(desired, walkSpeed);
  const blendedTangent = {
    x: currentTangent.x + (desiredTangent.x - currentTangent.x) * blend,
    y: currentTangent.y + (desiredTangent.y - currentTangent.y) * blend,
    z: currentTangent.z + (desiredTangent.z - currentTangent.z) * blend
  };
  simulation.player.velocity.x = blendedTangent.x + down.x * verticalSpeed;
  simulation.player.velocity.y = blendedTangent.y + down.y * verticalSpeed;
  simulation.player.velocity.z = blendedTangent.z + down.z * verticalSpeed;
  const result = stepPlayerWorld(
    simulation.player,
    {
      jumpRequested: simulation.jumpQueued,
      eyeHeight: PLAYER_HEIGHT,
      jumpSpeed: currentJumpSpeed(),
      gravityDirection: down,
      minimumGroundDot: 0.55
    },
    delta,
    PLAYER_RADIUS,
    WORLD,
    PLAYER_PHYSICS
  );
  simulation.jumpQueued = false;
  simulation.wallWalkCooldown = Math.max(0, simulation.wallWalkCooldown - delta);
  if (wallWalkActive() && simulation.wallWalkCooldown === 0 && length > 0.12 && result.sideRoomFaces.length) {
    const candidates = result.sideRoomFaces.map(function (faceId) { return faceById.get(faceId); }).filter(function (candidate) {
      return candidate && facesAreAdjacent(DODECA_ARENA, face, candidate) && dot3(desired, candidate.normal) > 0.08;
    }).sort(function (first, second) {
      return dot3(desired, second.normal) - dot3(desired, first.normal) || first.id.localeCompare(second.id);
    });
    if (candidates[0] && changePlayerFace(candidates[0].id)) {
      simulation.wallWalkCooldown = WALL_WALK_COOLDOWN;
      setStatus("Playing · gripping " + candidates[0].label, "playing");
    }
  }
  if (result.jumped) {
    setStatus(simulation.mode === "mouse" ? "Playing · big jump" : "Playing · keyboard jump", "playing");
  } else if (result.landed) {
    setStatus(simulation.mode === "mouse" ? "Playing · mouse look" : "Playing · keyboard look", "playing");
  }
  return result;
}

function updateKeyboardLook(delta) {
  if (simulation.mode !== "keyboard") return;
  const speed = KEYBOARD_LOOK_SPEEDS[Number(elements.lookSpeed.value) - 1];
  const horizontal = Number(simulation.keys.has("KeyL")) - Number(simulation.keys.has("KeyJ"));
  const vertical = Number(simulation.keys.has("KeyK")) - Number(simulation.keys.has("KeyI"));
  simulation.heading -= horizontal * speed * delta;
  simulation.pitch = clamp(
    simulation.pitch - vertical * speed * delta,
    -Math.PI * 0.472,
    Math.PI * 0.472
  );
}

function updateFiring(delta) {
  simulation.fireCooldown = Math.max(0, simulation.fireCooldown - delta);
  simulation.fireHeld = simulation.keyboardFire || simulation.mouseFire;
  if (!simulation.fireHeld || simulation.fireCooldown > 0) return;
  if (fireBall()) {
    simulation.fireCooldown = currentFireInterval();
  }
}

function updateBallGrowth(ball, delta) {
  if (!(ball.targetRadius > ball.radius) || !(ball.launchRadius > 0)) return false;
  ball.growthElapsed = Math.min(BALL_GROWTH_DURATION, (ball.growthElapsed || 0) + delta);
  const progress = clamp(ball.growthElapsed / BALL_GROWTH_DURATION, 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  ball.radius = ball.launchRadius + (ball.targetRadius - ball.launchRadius) * eased;
  if (progress === 1) ball.radius = ball.targetRadius;
  return true;
}

function ensureBallWorldClear(ball, collisions) {
  if (!sphereIntersectsWorld(ball.position, ball.radius, WORLD)) return true;
  for (let pass = 0; pass < 5; pass += 1) {
    resolveSphereRoom(ball, WORLD.room, collisions);
    WORLD.obstacles.forEach(function (obstacle) {
      resolveSphereObstacle(ball, obstacle, collisions);
    });
    if (!sphereIntersectsWorld(ball.position, ball.radius, WORLD)) return true;
  }
  return !sphereIntersectsWorld(ball.position, ball.radius, WORLD);
}

function fixedUpdate(delta) {
  simulation.simulationTime += delta;
  updateCallout(delta);
  updateScoring(delta);
  updateGravity();
  updateTargets(delta);
  updateKeyboardLook(delta);
  updatePlayer(delta);
  updateFiring(delta);
  updatePickups(delta);

  const survivingBalls = [];
  for (const ball of simulation.balls) {
    ball.bounceCooldown = Math.max(0, (ball.bounceCooldown || 0) - delta);
    updateBallGrowth(ball, delta);
    const collisions = stepProjectileWorld(ball, delta, WORLD, gravityFace().normal);
    ensureBallWorldClear(ball, collisions);
    let strongestSplatCollision = null;
    for (const collision of collisions) {
      scoreFirstTargetCollision(ball, [collision]);
      if (collision.speed > 0.5 && ball.bounceCooldown === 0) {
        simulation.bounceCount += 1;
        ball.ricochets += 1;
        ball.bounceCooldown = 0.07;
      }
      if (ball.splatLevel > 0 && collision.speed >= PROJECTILE.splatThreshold &&
          (!strongestSplatCollision || collision.speed > strongestSplatCollision.speed)) {
        strongestSplatCollision = collision;
      }
    }
    if (strongestSplatCollision && addSplat(ball, strongestSplatCollision)) {
      removeBallMesh(ball);
      continue;
    }
    if (ball.age < PROJECTILE.lifetime) {
      if (ball.age > PROJECTILE.lifetime - BALL_FADE_TIME) {
        const fade = clamp((PROJECTILE.lifetime - ball.age) / BALL_FADE_TIME, 0, 1);
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
  updateCamera(delta);
}

function updateHud() {
  const scoreText = formatNumber(simulation.score);
  const comboText = "×" + simulation.combo;
  const currentGravity = gravityLabel();
  const playerGravity = playerFace().label;
  const countdown = Math.max(0, Math.ceil(simulation.gravity.nextFlipAt - simulation.simulationTime));
  const gravityHud = wallWalkActive() && simulation.playerFaceId !== simulation.gravityFaceId
    ? "Down: " + currentGravity + " · Grip: " + playerGravity
    : "Down: " + currentGravity;
  setText(elements.scoreCount, scoreText);
  setText(elements.hudScore, scoreText);
  setText(elements.comboCount, comboText);
  setText(elements.hudCombo, comboText + " combo");
  setText(elements.gravityState, currentGravity);
  setText(elements.gravityCountdown, countdown + " s");
  setText(elements.hudGravity, gravityHud);
  setText(elements.hudGravityCountdown, "Shift in " + countdown + " s");
  setText(elements.targetCount, String(simulation.targetHits));
  setText(elements.hudTarget, "Targets hit: " + simulation.targetHits);
  elements.hudCombo.classList.toggle("is-active", simulation.combo > 1 && simulation.comboRemaining > 0);
  elements.hudGravity.classList.toggle("is-active", simulation.gravityFaceId !== startFace.id || simulation.playerFaceId !== simulation.gravityFaceId);
  elements.comboMeterFill.style.width = clamp(simulation.comboRemaining / COMBO_WINDOW * 100, 0, 100) + "%";
  setText(elements.ballCount, String(simulation.balls.length));
  setText(elements.bounceCount, String(simulation.bounceCount));
  setText(elements.splatCount, String(simulation.splatCount));
  powerTypes.forEach(function (type) {
    const power = simulation.powers[type];
    const active = power.remaining > 0 && power.level > 0;
    const output = elements["power" + type.charAt(0).toUpperCase() + type.slice(1)];
    const row = elements["power" + type.charAt(0).toUpperCase() + type.slice(1) + "Row"];
    const hud = elements["hud" + type.charAt(0).toUpperCase() + type.slice(1)];
    setText(output, active ? "Level " + power.level + " · " + Math.ceil(power.remaining) + " s" : "Level 0");
    setText(hud, active ? powerDefinitions[type].hud + " ×" + power.level : powerDefinitions[type].hud);
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
    if (!event.repeat) simulation.jumpQueued = true;
    return;
  }
  if (event.code === "KeyF") {
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
  if (event.code === "KeyF") simulation.keyboardFire = false;
  simulation.keys.delete(event.code);
  if (isPlaying() && (event.code === "Space" || event.code === "KeyF" || keyDirectionHandled(event.code))) {
    event.preventDefault();
  }
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
  simulation.heading -= event.movementX * sensitivity;
  simulation.pitch = clamp(
    simulation.pitch - event.movementY * sensitivity,
    -Math.PI * 0.472,
    Math.PI * 0.472
  );
  updateCamera(1 / 60);
});

document.addEventListener("pointerlockchange", function () {
  if (document.pointerLockElement === elements.canvas) {
    simulation.pointerLockPending = false;
    simulation.mode = "mouse";
    hideGate();
    elements.canvas.focus();
    setStatus("Playing · mouse look", "playing");
    announce("Mouse play started. Arrow keys move, Space jumps, and clicking launches balls.");
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
elements.comfort.addEventListener("change", function () {
  elements.stage.classList.toggle("is-comfort-mode", elements.comfort.checked);
  updateCamera(1, true);
});

document.getElementById("current-year").textContent = String(new Date().getFullYear());
elements.comfort.checked = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
elements.stage.classList.toggle("is-comfort-mode", elements.comfort.checked);

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
  canSpawnBall,
  findSafeMuzzlePosition,
  findLaunchSphere,
  fixedUpdate,
  resetGame,
  activatePower,
  scoreTargetHit,
  scoreFirstTargetCollision,
  hitTarget: function (targetId = 0, ricochets = 0) {
    const target = simulation.targets.find(function (candidate) { return candidate.id === targetId; });
    if (!target) return 0;
    target.cooldown = 0;
    return scoreTargetHit({ ricochets, targetHits: new Set() }, target);
  },
  setRandomSeed,
  resetRandomSeed: function () { return setRandomSeed(DEFAULT_RANDOM_SEED); },
  relocatePickup,
  relocatePickups: relocateVisiblePickups,
  relocateTarget,
  resetTargets,
  forceGravityFlip,
  updateGravity,
  scheduleNextGravity,
  changePlayerFace,
  gravityFace,
  playerFace,
  updateCamera,
  world: WORLD,
  arena: DODECA_ARENA,
  screenControlSign,
  pauseGame,
  beginKeyboardMode,
  constants: {
    fixedStep: FIXED_STEP,
    maxBalls: MAX_BALLS,
    maxSplats: MAX_SPLATS,
    baseFireInterval: BASE_FIRE_INTERVAL,
    rapidFireIntervals: RAPID_FIRE_INTERVALS,
    giantBallRadii: GIANT_BALL_RADII,
    ballGrowthDuration: BALL_GROWTH_DURATION,
    walkSpeeds: WALK_SPEEDS,
    jumpSpeeds: JUMP_SPEEDS,
    maxPowerLevel: MAX_POWER_LEVEL,
    powerDuration: POWER_INITIAL_DURATION,
    powerInitialDuration: POWER_INITIAL_DURATION,
    powerStackTime: POWER_STACK_TIME,
    powerMaxDuration: POWER_MAX_DURATION,
    pickupRespawn: PICKUP_RESPAWN_MIN,
    pickupRespawnRange: [PICKUP_RESPAWN_MIN, PICKUP_RESPAWN_MAX],
    comboWindow: COMBO_WINDOW,
    maxCombo: MAX_COMBO,
    targetCooldown: TARGET_COOLDOWN,
    targetWarpTime: TARGET_WARP_TIME,
    targetMoveRange: [TARGET_MOVE_MIN, TARGET_MOVE_MAX],
    gravityFirstFlip: GRAVITY_FIRST_FLIP,
    gravityFlipInterval: GRAVITY_INTERVAL_MIN,
    gravityIntervalRange: [GRAVITY_INTERVAL_MIN, GRAVITY_INTERVAL_MAX],
    gravityWarningTime: GRAVITY_WARNING_TIME,
    defaultRandomSeed: DEFAULT_RANDOM_SEED
  }
};
