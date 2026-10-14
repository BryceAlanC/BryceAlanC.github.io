import {
  TWO_PI,
  analyzeCircleFlow,
  canonicalCircleParameterKey,
  circularDifference,
  createCircleFlow,
  evaluateFlow,
  sampleCircleBifurcation,
  sampleFlow,
  seamCrossings,
  stepLiftedRK4,
  wrapAngle
} from "./model.js?v=20261014-2";

const byId = (id) => document.getElementById(id);

const elements = {
  workspace: byId("circle-flow-workspace"),
  familySelect: byId("family-select"),
  familyKind: byId("family-kind"),
  familyEquation: byId("family-equation"),
  familyDescription: byId("family-description"),
  omegaControl: byId("parameter-omega-control"),
  omegaLabel: byId("parameter-omega-label"),
  omega: byId("parameter-omega"),
  omegaValue: byId("parameter-omega-value"),
  playOmega: byId("play-parameter-omega"),
  aControl: byId("parameter-a-control"),
  aLabel: byId("parameter-a-label"),
  a: byId("parameter-a"),
  aValue: byId("parameter-a-value"),
  playA: byId("play-parameter-a"),
  bControl: byId("parameter-b-control"),
  bLabel: byId("parameter-b-label"),
  b: byId("parameter-b"),
  bValue: byId("parameter-b-value"),
  playB: byId("play-parameter-b"),
  phaseControl: byId("parameter-phase-control"),
  phaseLabel: byId("parameter-phase-label"),
  phase: byId("parameter-phase"),
  phaseValue: byId("parameter-phase-value"),
  playPhase: byId("play-parameter-phase"),
  nControl: byId("parameter-n-control"),
  nLabel: byId("parameter-n-label"),
  n: byId("parameter-n"),
  nValue: byId("parameter-n-value"),
  playN: byId("play-parameter-n"),
  parameterHelp: byId("parameter-help"),
  toggleAnimation: byId("toggle-animation"),
  resetParticles: byId("reset-particles"),
  animationSpeed: byId("animation-speed"),
  animationSpeedValue: byId("animation-speed-value"),
  showArrows: byId("show-arrows"),
  showTrails: byId("show-trails"),
  showLabels: byId("show-labels"),
  showEquilibriumParticles: byId("show-equilibrium-particles"),
  equilibriumList: byId("equilibrium-list"),
  equilibriumListCount: byId("equilibrium-list-count"),
  stageStatus: byId("stage-status"),
  fullscreenToggle: byId("workspace-fullscreen-toggle"),
  fullscreenLabel: byId("workspace-fullscreen-label"),
  telemetryRegime: byId("telemetry-regime"),
  telemetryEquilibria: byId("telemetry-equilibria"),
  telemetryDirection: byId("telemetry-direction"),
  telemetryFrequency: byId("telemetry-frequency"),
  velocityEquationLabel: byId("velocity-equation-label"),
  velocityTitle: byId("velocity-title"),
  circleCanvas: byId("circle-canvas"),
  velocityCanvas: byId("velocity-canvas"),
  liftCanvas: byId("lift-canvas"),
  bifurcationParameter: byId("bifurcation-parameter"),
  bifurcationRollToggle: byId("bifurcation-roll-toggle"),
  bifurcationRollLabel: byId("bifurcation-roll-label"),
  bifurcationCurrentValue: byId("bifurcation-current-value"),
  bifurcationCanvas: byId("bifurcation-canvas"),
  bifurcationDescription: byId("bifurcation-description"),
  elapsedTime: byId("elapsed-time"),
  selectedAngleReadout: byId("selected-angle-readout"),
  lapCount: byId("lap-count"),
  regimeNote: byId("regime-note"),
  regimeNoteKicker: byId("regime-note-kicker"),
  regimeNoteCopy: byId("regime-note-copy"),
  announcer: byId("circle-flow-announcer")
};

const COLORS = Object.freeze({
  ink: "#17211d",
  muted: "#63736d",
  paper: "#f4f1e7",
  forest: "#0b5748",
  forestBright: "#62c8b5",
  mint: "#a9e4d7",
  rust: "#a84f24",
  peach: "#f0b18b",
  gold: "#f2c969",
  goldDark: "#8a6200",
  dark: "#071c18",
  white: "#fffdf7"
});

const FAMILY_UI = Object.freeze({
  uniform: {
    visible: ["omega"],
    bifurcationDefault: "omega",
    defaults: { omega: 1.1 },
    ranges: { omega: [-2.5, 2.5, 0.002] },
    labels: { omega: "Angular velocity ω" },
    help: "Change the constant angular velocity. At ω = 0, every point on the circle is stationary."
  },
  nonuniform: {
    visible: ["omega", "a", "phase"],
    bifurcationDefault: "a",
    defaults: { omega: 1, a: 0.65, phase: 0.35 },
    ranges: { omega: [-2.2, 2.2, 0.002], a: [0, 1.4, 0.002], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Base angular velocity ω", a: "Speed modulation a", phase: "Wave phase φ" },
    help: "For ω ≠ 0 and a < 1 the speed varies but never vanishes. At a = 1 a bottleneck becomes a threshold; for a > 1 fixed points appear."
  },
  "symmetric-pitchfork": {
    visible: ["omega", "b"],
    bifurcationDefault: "omega",
    defaults: { omega: 0.45, b: 0 },
    ranges: { omega: [-0.75, 1.5, 0.002], b: [-0.35, 0.35, 0.001] },
    labels: { omega: "Pitchfork parameter μ", b: "Symmetry-breaking bias ε" },
    help: "With ε = 0, the reflection symmetry forces a supercritical pitchfork at μ = 0. A nonzero ε breaks the symmetry and unfolds it into saddle-nodes."
  },
  "overdamped-pendulum": {
    visible: ["omega", "a"],
    bifurcationDefault: "omega",
    defaults: { omega: 0.55, a: 1 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002] },
    labels: { omega: "Drive ω", a: "Restoring strength a" },
    help: "Vary the drive through |ω| = a. A stable–unstable pair collides, then leaves behind a slow bottleneck."
  },
  "firefly-locking": {
    visible: ["omega", "a", "phase"],
    bifurcationDefault: "omega",
    defaults: { omega: 0.45, a: 1, phase: 0.25 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Frequency mismatch Δω", a: "Coupling K", phase: "Preferred phase φ₀" },
    help: "The angle is the phase difference. A fixed point means phase locking; continual circulation means repeated phase slips."
  },
  "josephson-junction": {
    visible: ["omega", "a"],
    bifurcationDefault: "omega",
    defaults: { omega: 1.25, a: 1 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002] },
    labels: { omega: "Applied current I", a: "Critical current I_c" },
    help: "For |I| < I_c the phase is pinned with zero mean voltage. At |I| = I_c it reaches threshold; for |I| > I_c it runs with nonzero mean voltage."
  },
  "repeated-locking-sites": {
    visible: ["omega", "a", "n", "phase"],
    bifurcationDefault: "omega",
    defaults: { omega: 0.2, a: 1, n: 3, phase: 0 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002], n: [1, 8, 1], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Drive ω", a: "Wave amplitude a", n: "Number of locking sites n", phase: "Phase shift φ" },
    help: "The n-fold symmetry creates n stable and n unstable states at once. These simultaneous folds split under a generic perturbation."
  },
  "fourier-workshop": {
    visible: ["omega", "a", "b", "n", "phase"],
    bifurcationDefault: "omega",
    defaults: { omega: 0.1, a: 0.7, b: 0.42, n: 2, phase: 0.65 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0, 1.5, 0.002], b: [-1.2, 1.2, 0.002], n: [2, 6, 1], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Bias ω", a: "First harmonic a", b: "Higher harmonic b", n: "Higher harmonic n", phase: "Phase shift φ" },
    help: "Mix two Fourier modes to make a richer periodic vector field. Simple equilibria still alternate stable and unstable around the circle."
  }
});

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = {
  flow: null,
  analysis: null,
  samples: [],
  maximumVelocity: 1,
  minimumVelocityPoint: null,
  particles: [],
  nextParticleId: 1,
  activeParticleId: null,
  selectedAngle: 0,
  elapsed: 0,
  totalLaps: 0,
  running: !motionQuery.matches,
  speed: 1,
  emitterElapsed: 0,
  lastFrameTime: performance.now(),
  lastRenderTime: 0,
  lastTrailTime: 0,
  parameterPlayers: {
    omega: { playing: false, direction: 1, position: null },
    a: { playing: false, direction: 1, position: null },
    b: { playing: false, direction: 1, position: null },
    phase: { playing: false, direction: 1, position: null },
    n: { playing: false, direction: 1, position: null }
  },
  parameterAccumulator: 0,
  pointer: null,
  circleGeometry: null,
  velocityPlot: null,
  trajectoryTube: null,
  bifurcation: {
    data: null,
    cacheKey: "",
    pending: false,
    lastSampleTime: -Infinity,
    plot: null,
    pointerId: null,
    view: "plane"
  },
  fullscreenInitialized: false,
  lastAnnouncement: "",
  dirty: true
};

const PARAMETER_PLAYER_CONFIG = Object.freeze({
  omega: Object.freeze({
    control: elements.omega,
    valueInput: elements.omegaValue,
    wrapper: elements.omegaControl,
    label: elements.omegaLabel,
    button: elements.playOmega
  }),
  a: Object.freeze({
    control: elements.a,
    valueInput: elements.aValue,
    wrapper: elements.aControl,
    label: elements.aLabel,
    button: elements.playA
  }),
  b: Object.freeze({
    control: elements.b,
    valueInput: elements.bValue,
    wrapper: elements.bControl,
    label: elements.bLabel,
    button: elements.playB
  }),
  phase: Object.freeze({
    control: elements.phase,
    valueInput: elements.phaseValue,
    wrapper: elements.phaseControl,
    label: elements.phaseLabel,
    button: elements.playPhase,
    scale: Math.PI
  }),
  n: Object.freeze({
    control: elements.n,
    valueInput: elements.nValue,
    wrapper: elements.nControl,
    label: elements.nLabel,
    button: elements.playN,
    discrete: true
  })
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function inverseLerp(start, end, value) {
  return (value - start) / Math.max(1e-12, end - start);
}

function announce(message) {
  if (!message || message === state.lastAnnouncement) return;
  state.lastAnnouncement = message;
  elements.announcer.textContent = "";
  window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 20);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const clean = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return clean.toFixed(digits).replace(/^-0(?=\.0+$)/, "0");
}

function formatPi(angle, precise = false) {
  const ratio = wrapAngle(angle) / Math.PI;
  const candidates = [1, 2, 3, 4, 6, 8, 12];
  for (const denominator of candidates) {
    const numerator = Math.round(ratio * denominator);
    if (Math.abs(ratio - numerator / denominator) < (precise ? 2e-5 : 0.0025)) {
      if (numerator === 0) return "0";
      if (numerator === denominator) return "π";
      if (numerator === 2 * denominator) return "2π";
      const numeratorText = numerator === 1 ? "" : String(numerator);
      return denominator === 1 ? `${numeratorText}π` : `${numeratorText}π/${denominator}`;
    }
  }
  return `${ratio.toFixed(precise ? 3 : 2)}π`;
}

function canvasSurface(canvas) {
  const rectangle = canvas.getBoundingClientRect();
  const width = Math.max(1, rectangle.width);
  const height = Math.max(1, rectangle.height);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function setRange(input, range) {
  if (!range) return;
  input.min = String(range[0]);
  input.max = String(range[1]);
  input.step = String(range[2]);
}

function currentParameters() {
  return {
    omega: Number(elements.omega.value),
    amplitude: Number(elements.a.value),
    secondAmplitude: Number(elements.b.value),
    phase: Number(elements.phase.value),
    harmonics: Math.round(Number(elements.n.value))
  };
}

function parameterInputValue(name) {
  const config = PARAMETER_PLAYER_CONFIG[name];
  const value = Number(config.control.value) / (config.scale || 1);
  return config.discrete ? String(Math.round(value)) : formatNumber(value, 3);
}

function syncParameterValueInput(name, options = {}) {
  const config = PARAMETER_PLAYER_CONFIG[name];
  const input = config?.valueInput;
  if (!input || (!options.force && input.dataset.dirty === "true")) return;
  const scale = config.scale || 1;
  input.min = String(Number(config.control.min) / scale);
  input.max = String(Number(config.control.max) / scale);
  input.step = config.discrete ? "1" : config.scale ? "0.001" : config.control.step;
  input.value = parameterInputValue(name);
  input.dataset.dirty = "false";
  input.removeAttribute("aria-invalid");
  const label = parameterPlayerLabel(name);
  input.setAttribute(
    "aria-label",
    config.scale
      ? `Set ${label} directly, in multiples of pi`
      : `Set ${label} directly`
  );
  input.setAttribute("aria-describedby", "parameter-help");
  input.title = config.scale
    ? `Enter a value from ${input.min}π to ${input.max}π`
    : `Enter a value from ${input.min} to ${input.max}`;
}

function updateParameterOutputs(options = {}) {
  const omega = Number(elements.omega.value);
  const amplitude = Number(elements.a.value);
  const secondAmplitude = Number(elements.b.value);
  const phase = Number(elements.phase.value);
  const harmonics = Math.round(Number(elements.n.value));
  const pitchforkFamily = elements.familySelect.value === "symmetric-pitchfork";
  Object.keys(PARAMETER_PLAYER_CONFIG).forEach((name) => {
    syncParameterValueInput(name, options);
  });
  elements.omega.setAttribute(
    "aria-valuetext",
    pitchforkFamily ? formatNumber(omega, 3) : `${formatNumber(omega, 3)} radians per unit time`
  );
  elements.a.setAttribute("aria-valuetext", formatNumber(amplitude, 3));
  elements.b.setAttribute(
    "aria-valuetext",
    pitchforkFamily ? `${formatNumber(secondAmplitude, 3)} symmetry-breaking bias` : formatNumber(secondAmplitude, 3)
  );
  elements.phase.setAttribute("aria-valuetext", `${formatNumber(phase / Math.PI, 2)} pi radians`);
  elements.n.setAttribute("aria-valuetext", `${harmonics} repeats`);
}

function configureFamilyControls(id, resetValues = true) {
  const config = FAMILY_UI[id];
  if (!config) return;
  const controls = {
    omega: [elements.omegaControl, elements.omega, elements.omegaLabel],
    a: [elements.aControl, elements.a, elements.aLabel],
    b: [elements.bControl, elements.b, elements.bLabel],
    phase: [elements.phaseControl, elements.phase, elements.phaseLabel],
    n: [elements.nControl, elements.n, elements.nLabel]
  };
  Object.entries(controls).forEach(([key, [wrapper, input, label]]) => {
    wrapper.hidden = !config.visible.includes(key);
    if (config.ranges[key]) setRange(input, config.ranges[key]);
    if (config.labels[key]) label.textContent = config.labels[key];
    if (resetValues && config.defaults[key] != null) input.value = String(config.defaults[key]);
  });
  elements.parameterHelp.textContent = config.help;
  updateParameterOutputs({ force: true });
  syncParameterPlayButtons();
  configureBifurcationControls(id, resetValues);
}

function bifurcationParameterNames(id = elements.familySelect.value) {
  const config = FAMILY_UI[id];
  return config ? config.visible.filter((name) => !PARAMETER_PLAYER_CONFIG[name]?.discrete) : [];
}

function configureBifurcationControls(id, resetSelection = true) {
  const config = FAMILY_UI[id];
  if (!config || !elements.bifurcationParameter) return;
  const previous = elements.bifurcationParameter.value;
  const names = bifurcationParameterNames(id);
  elements.bifurcationParameter.replaceChildren(...names.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = config.labels[name] || name;
    return option;
  }));
  elements.bifurcationParameter.value = !resetSelection && names.includes(previous)
    ? previous
    : config.bifurcationDefault;
  state.bifurcation.data = null;
  state.bifurcation.cacheKey = "";
  state.bifurcation.pending = false;
  state.bifurcation.plot = null;
  updateBifurcationAccessibility();
}

function selectedBifurcationParameter() {
  const family = FAMILY_UI[elements.familySelect.value];
  const selected = elements.bifurcationParameter?.value;
  return family?.visible.includes(selected) && !PARAMETER_PLAYER_CONFIG[selected]?.discrete
    ? selected
    : family?.bifurcationDefault;
}

function formatBifurcationParameterValue(name, value) {
  return name === "phase"
    ? `${formatNumber(value / Math.PI, 3)}π`
    : formatNumber(value, 3);
}

function syncBifurcationViewControl() {
  const rolled = state.bifurcation.view === "tube";
  if (elements.bifurcationCanvas) {
    elements.bifurcationCanvas.dataset.view = rolled ? "tube" : "plane";
  }
  if (elements.bifurcationRollToggle) {
    elements.bifurcationRollToggle.setAttribute("aria-pressed", String(rolled));
    elements.bifurcationRollToggle.setAttribute(
      "aria-label",
      rolled ? "Unroll bifurcation diagram" : "Roll bifurcation diagram"
    );
    elements.bifurcationRollToggle.title = rolled
      ? "Unroll the bifurcation cylinder into a plane"
      : "Roll the planar bifurcation diagram into a cylinder";
  }
  if (elements.bifurcationRollLabel) {
    elements.bifurcationRollLabel.textContent = rolled ? "Unroll" : "Roll";
  }
  if (elements.bifurcationDescription) {
    elements.bifurcationDescription.textContent = rolled
      ? "The selected parameter runs along a transparent cylinder while equilibrium angle wraps around its circumference. Solid green traces are stable, dashed rust traces are unstable, and gold marks nonhyperbolic critical points and the current parameter slice. Faint traces pass behind the tube. Click or drag horizontally to set the parameter. Use the left and right arrow keys to adjust it, Home and End for its bounds, and Space to start or pause its animation."
      : "Equilibrium angle is plotted vertically from zero to two pi while the selected parameter varies horizontally. The top and bottom edges are the same point on the circle. Solid green traces are stable, dashed rust traces are unstable, and gold marks nonhyperbolic critical points and the current parameter slice. Click or drag horizontally to set the parameter. Use the left and right arrow keys to adjust it, Home and End for its bounds, and Space to start or pause its animation.";
  }
}

function updateBifurcationAccessibility() {
  const name = selectedBifurcationParameter();
  const config = PARAMETER_PLAYER_CONFIG[name];
  if (!config?.control || !elements.bifurcationCanvas) return;
  const value = Number(config.control.value);
  const formatted = formatBifurcationParameterValue(name, value);
  elements.bifurcationCurrentValue.value = formatted;
  elements.bifurcationCurrentValue.textContent = formatted;
  const viewLabel = state.bifurcation.view === "tube" ? "cylindrical" : "planar";
  elements.bifurcationCanvas.setAttribute(
    "aria-label",
    `${parameterPlayerLabel(name)} bifurcation parameter, ${viewLabel} view`
  );
  elements.bifurcationCanvas.setAttribute("aria-valuemin", config.control.min);
  elements.bifurcationCanvas.setAttribute("aria-valuemax", config.control.max);
  elements.bifurcationCanvas.setAttribute("aria-valuenow", String(value));
  elements.bifurcationCanvas.setAttribute(
    "aria-valuetext",
    name === "phase" ? `${formatNumber(value / Math.PI, 3)} pi radians` : formatted
  );
  syncBifurcationViewControl();
}

function bifurcationCacheKey() {
  const familyId = elements.familySelect.value;
  const selected = selectedBifurcationParameter();
  const family = FAMILY_UI[familyId];
  const fixed = family.visible
    .filter((name) => name !== selected)
    .map((name) => [name, Number(PARAMETER_PLAYER_CONFIG[name].control.value)]);
  return JSON.stringify({ familyId, selected, fixed });
}

function symmetricPitchforkMuFolds(bias) {
  const epsilon = Math.abs(Number(bias));
  if (epsilon <= 1e-12) return [0, 2];
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 72; iteration += 1) {
    const q = (lower + upper) / 2;
    const residual = (1 - q ** 2) ** 3 - epsilon ** 2 * q ** 2;
    if (residual > 0) lower = q;
    else upper = q;
  }
  const q = (lower + upper) / 2;
  const lowerFold = 1 + 1 / q - 2 * q;
  return [lowerFold, 2 - lowerFold];
}

function bifurcationAnchors(familyId, name) {
  const amplitude = Math.abs(Number(elements.a.value));
  const omega = Math.abs(Number(elements.omega.value));
  if (familyId === "nonuniform" && name === "a") return [1];
  if (familyId === "symmetric-pitchfork" && name === "omega") {
    return symmetricPitchforkMuFolds(Number(elements.b.value));
  }
  if (familyId === "symmetric-pitchfork" && name === "b") {
    const mu = Number(elements.omega.value);
    const offset = 1 - mu;
    const discriminant = Math.sqrt(offset ** 2 + 8);
    const folds = [];
    for (const cosine of [(-offset + discriminant) / 4, (-offset - discriminant) / 4]) {
      if (cosine < -1 || cosine > 1) continue;
      const magnitude = Math.abs(Math.sqrt(Math.max(0, 1 - cosine ** 2)) * (offset + cosine));
      if (magnitude > 1e-10) folds.push(-magnitude, magnitude);
    }
    return folds;
  }
  const lockingFamilies = [
    "overdamped-pendulum",
    "firefly-locking",
    "josephson-junction",
    "repeated-locking-sites"
  ];
  if (lockingFamilies.includes(familyId) && name === "omega") return [-amplitude, amplitude];
  if (lockingFamilies.includes(familyId) && name === "a") return [omega];
  return [];
}

function rebuildBifurcationData(options = {}) {
  const name = selectedBifurcationParameter();
  const config = PARAMETER_PLAYER_CONFIG[name];
  if (!name || !config?.control) return false;
  const key = bifurcationCacheKey();
  if (key === state.bifurcation.cacheKey && state.bifurcation.data) {
    state.bifurcation.pending = false;
    return false;
  }
  const now = performance.now();
  if (!options.force && now - state.bifurcation.lastSampleTime < 140) {
    state.bifurcation.pending = true;
    return false;
  }
  const familyId = elements.familySelect.value;
  try {
    state.bifurcation.data = sampleCircleBifurcation(
      familyId,
      currentParameters(),
      canonicalCircleParameterKey(name),
      [Number(config.control.min), Number(config.control.max)],
      {
        parameterSamples: 181,
        equilibriumSamples: 512,
        anchors: bifurcationAnchors(familyId, name)
      }
    );
    state.bifurcation.cacheKey = key;
    state.bifurcation.pending = false;
    state.bifurcation.lastSampleTime = performance.now();
    state.dirty = true;
    return true;
  } catch (error) {
    console.warn("The bifurcation diagram could not be sampled.", error);
    state.bifurcation.data = null;
    state.bifurcation.cacheKey = key;
    state.bifurcation.pending = false;
    state.bifurcation.lastSampleTime = performance.now();
    state.dirty = true;
    return false;
  }
}

function makeParticle(angle, options = {}) {
  const wrapped = wrapAngle(angle);
  const particle = {
    id: state.nextParticleId++,
    lifted: wrapped,
    initial: wrapped,
    lane: ((state.nextParticleId % 5) - 2) * 2.2,
    ambient: options.ambient !== false,
    bornAt: state.elapsed,
    trail: [{ t: state.elapsed, lifted: wrapped }]
  };
  state.particles.push(particle);
  return particle;
}

function resetParticles(options = {}) {
  state.particles = [];
  state.totalLaps = 0;
  state.emitterElapsed = 0;
  state.nextParticleId = 1;
  const count = 9;
  for (let index = 0; index < count; index += 1) {
    makeParticle(TWO_PI * (index + 0.37) / count, { ambient: true });
  }
  const selected = makeParticle(state.selectedAngle, { ambient: false });
  state.activeParticleId = selected.id;
  state.dirty = true;
  if (options.announce !== false) announce("Trajectories restarted from angles around the circle.");
}

function addParticle(angle, options = {}) {
  state.selectedAngle = wrapAngle(angle);
  const particle = makeParticle(state.selectedAngle, { ambient: false });
  state.activeParticleId = particle.id;
  if (state.particles.length > 18) {
    const removable = state.particles.findIndex((entry) => entry.id !== particle.id && entry.ambient);
    state.particles.splice(removable >= 0 ? removable : 0, 1);
  }
  updateSelectedReadout();
  state.dirty = true;
  const symbolName = state.flow && ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "phi" : "theta";
  if (options.announce !== false) announce(`Trajectory added at ${symbolName} ${formatPi(state.selectedAngle)}.`);
}

function updateSelectedReadout() {
  const symbol = state.flow && ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "φ" : "θ";
  elements.selectedAngleReadout.textContent = `${symbol} = ${formatPi(state.selectedAngle)}`;
}

function minimumVelocitySample(samples) {
  let result = samples[0] || { angle: 0, velocity: 0 };
  for (const point of samples) {
    if (Math.abs(point.velocity) < Math.abs(result.velocity)) result = point;
  }
  return result;
}

function stabilityLabel(stability) {
  if (stability === "stable") return "stable";
  if (stability === "unstable") return "unstable";
  if (stability === "semistable") return "threshold";
  return "nonhyperbolic";
}

function atSymmetricPitchfork() {
  return elements.familySelect.value === "symmetric-pitchfork"
    && Math.abs(Number(elements.omega.value)) <= 1e-9
    && Math.abs(Number(elements.b.value)) <= 1e-9;
}

function updateEquilibriumList() {
  const equilibria = state.analysis.equilibria;
  const symbol = ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "φ" : "θ";
  elements.equilibriumList.replaceChildren();
  if (state.analysis.equilibriumCount === Infinity) {
    const item = document.createElement("li");
    item.className = "equilibrium-empty";
    item.textContent = "Every angle is an equilibrium.";
    elements.equilibriumList.append(item);
    elements.equilibriumListCount.textContent = "continuum";
    return;
  }
  elements.equilibriumListCount.textContent = `${equilibria.length} total`;
  if (!equilibria.length) {
    const item = document.createElement("li");
    item.className = "equilibrium-empty";
    item.textContent = "No equilibria: every point circulates.";
    elements.equilibriumList.append(item);
    return;
  }
  equilibria.forEach((equilibrium) => {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "equilibrium-dot";
    dot.dataset.stability = equilibrium.stability;
    dot.setAttribute("aria-hidden", "true");
    const angle = document.createElement("span");
    angle.className = "equilibrium-angle";
    angle.textContent = `${symbol}* = ${formatPi(equilibrium.angle, true)}`;
    const stability = document.createElement("span");
    stability.className = "equilibrium-stability";
    stability.textContent = stabilityLabel(equilibrium.stability);
    item.append(dot, angle, stability);
    elements.equilibriumList.append(item);
  });
}

function updateRegimeCopy() {
  const { regime, direction, period } = state.analysis;
  const ratio = Math.abs(state.minimumVelocityPoint?.velocity || 0) / Math.max(1e-9, state.maximumVelocity);
  const nearBottleneck = regime === "rotating" && ratio < 0.18;
  if (atSymmetricPitchfork()) {
    elements.regimeNoteKicker.textContent = "Supercritical pitchfork";
    elements.regimeNoteCopy.textContent = "At μ = 0 the symmetric equilibrium is nonhyperbolic. As μ increases, it loses stability and two stable equilibria emerge symmetrically.";
  } else if (regime === "stationary") {
    elements.regimeNoteKicker.textContent = "Degenerate stationary flow";
    elements.regimeNoteCopy.textContent = "The vector field vanishes everywhere, so every initial angle is a constant solution.";
  } else if (regime === "threshold") {
    const repeated = elements.familySelect.value === "repeated-locking-sites" && Number(elements.n.value) > 1;
    elements.regimeNoteKicker.textContent = repeated ? "Symmetry-forced thresholds" : "Saddle-node threshold";
    elements.regimeNoteCopy.textContent = repeated
      ? `${Math.round(Number(elements.n.value))} stable–unstable pairs meet simultaneously because of the rotational symmetry. Motion stalls at each contact from one side.`
      : "A stable and unstable equilibrium have just met. Motion approaches the contact from one side and leaves on the other.";
  } else if (regime === "locked") {
    elements.regimeNoteKicker.textContent = elements.familySelect.value === "firefly-locking" ? "Phase locked" : "Fixed points divide the circle";
    elements.regimeNoteCopy.textContent = elements.familySelect.value === "firefly-locking"
      ? "The phase difference approaches a stable constant, so the firefly and signal run at the same average frequency."
      : "Each arc carries trajectories from an unstable equilibrium toward a stable one.";
  } else if (nearBottleneck) {
    elements.regimeNoteKicker.textContent = "Bottleneck · ghost of the pair";
    elements.regimeNoteCopy.textContent = "The orbit still makes full turns, but it lingers near the recently vanished equilibria; the lap period grows sharply.";
  } else {
    elements.regimeNoteKicker.textContent = direction === "clockwise" ? "Continual clockwise rotation" : "Continual counterclockwise rotation";
    elements.regimeNoteCopy.textContent = `There are no fixed points. One complete turn takes T = ${formatNumber(period, 2)} time units.`;
  }
}

function updateTelemetry() {
  const { regime, direction, equilibriumCount, meanFrequency, period } = state.analysis;
  const pitchforkCritical = atSymmetricPitchfork();
  const regimeLabels = {
    stationary: "Every point fixed",
    locked: pitchforkCritical
      ? "Pitchfork threshold"
      : elements.familySelect.value === "firefly-locking"
        ? "Phase locked"
        : "Locked",
    threshold: "Saddle-node threshold",
    rotating: "Rotating"
  };
  elements.telemetryRegime.textContent = regimeLabels[regime] || regime;
  elements.telemetryEquilibria.textContent = equilibriumCount === Infinity ? "Continuum" : String(equilibriumCount);
  elements.telemetryDirection.textContent = direction === "counterclockwise"
    ? "Counterclockwise"
    : direction === "clockwise"
      ? "Clockwise"
      : direction === "mixed"
        ? "Toward attractors"
        : "Stationary";
  elements.telemetryFrequency.textContent = regime === "rotating"
    ? formatNumber(meanFrequency, 3)
    : regime === "stationary"
      ? "—"
      : regime === "threshold"
        ? "0 (threshold)"
        : "0 (locked)";
  elements.stageStatus.textContent = pitchforkCritical
    ? "Pitchfork point at μ = 0"
    : Number.isFinite(period)
    ? `One lap: T = ${formatNumber(period, 3)}`
    : regime === "threshold"
      ? "Infinite-period threshold"
      : regime === "stationary"
        ? "The vector field is zero everywhere"
        : equilibriumCount === 1
          ? "1 equilibrium on the circle"
          : `${equilibriumCount} equilibria on the circle`;
}

function refreshFlow(options = {}) {
  const id = elements.familySelect.value;
  const previousRegime = state.analysis?.regime || null;
  state.flow = createCircleFlow(id, currentParameters());
  state.analysis = analyzeCircleFlow(state.flow, { equilibriumOptions: { samples: 2048 } });
  state.samples = sampleFlow(state.flow, { samples: 481 }).points;
  state.maximumVelocity = Math.max(0.05, ...state.samples.map((point) => Math.abs(point.velocity)));
  state.minimumVelocityPoint = minimumVelocitySample(state.samples);
  elements.familyKind.textContent = state.flow.name;
  elements.familyEquation.textContent = state.flow.formula;
  elements.familyDescription.textContent = state.flow.description;
  elements.velocityEquationLabel.textContent = state.flow.formula;
  elements.velocityTitle.textContent = ["firefly-locking", "josephson-junction"].includes(state.flow.id)
    ? "Angular velocity f(φ)"
    : "Angular velocity f(θ)";
  updateSelectedReadout();
  updateParameterOutputs();
  updateBifurcationAccessibility();
  updateEquilibriumList();
  updateTelemetry();
  updateRegimeCopy();
  rebuildBifurcationData({ force: Boolean(options.forceBifurcation) });
  state.dirty = true;
  if (options.resetParticles) resetParticles({ announce: false });
  if (previousRegime && previousRegime !== state.analysis.regime && !options.announce) {
    announce(`Regime changed to ${elements.telemetryRegime.textContent.toLowerCase()}.`);
  }
  if (options.announce) announce(`${state.flow.name}. ${elements.telemetryRegime.textContent}.`);
}

function mapAngleToCircle(angle, centerX, centerY, radius) {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY - radius * Math.sin(angle)
  };
}

function drawArrow(context, startX, startY, endX, endY, color, width = 1.5, head = 5) {
  const angle = Math.atan2(endY - startY, endX - startX);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - head * Math.cos(angle - Math.PI / 6), endY - head * Math.sin(angle - Math.PI / 6));
  context.lineTo(endX - head * Math.cos(angle + Math.PI / 6), endY - head * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
  context.restore();
}

function drawEquilibriumMarker(context, x, y, equilibrium, options = {}) {
  const dark = Boolean(options.dark);
  const radius = options.radius || 7;
  context.save();
  context.lineWidth = 2.2;
  if (equilibrium.stability === "stable") {
    context.fillStyle = dark ? COLORS.mint : COLORS.forest;
    context.strokeStyle = dark ? COLORS.white : COLORS.paper;
    context.beginPath();
    context.arc(x, y, radius, 0, TWO_PI);
    context.fill();
    context.stroke();
  } else if (equilibrium.stability === "unstable") {
    context.fillStyle = dark ? COLORS.dark : COLORS.paper;
    context.strokeStyle = dark ? COLORS.peach : COLORS.rust;
    context.setLineDash([3, 2]);
    context.beginPath();
    context.arc(x, y, radius, 0, TWO_PI);
    context.fill();
    context.stroke();
  } else if (equilibrium.continuum) {
    context.strokeStyle = dark ? COLORS.gold : COLORS.goldDark;
    context.setLineDash([3, 4]);
    context.beginPath();
    context.arc(x, y, radius, 0, TWO_PI);
    context.stroke();
  } else {
    context.fillStyle = dark ? COLORS.dark : COLORS.paper;
    context.strokeStyle = COLORS.gold;
    context.beginPath();
    context.arc(x, y, radius + 2.5, 0, TWO_PI);
    context.stroke();
    context.beginPath();
    context.arc(x, y, radius - 1, 0, TWO_PI);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawParticle(context, x, y, radius = 4.5, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = "rgba(242, 201, 105, 0.65)";
  context.shadowBlur = 9;
  context.fillStyle = COLORS.gold;
  context.strokeStyle = COLORS.white;
  context.lineWidth = 1.1;
  context.beginPath();
  context.arc(x, y, radius, 0, TWO_PI);
  context.fill();
  context.stroke();
  context.restore();
}

function drawCirclePortrait() {
  if (!state.flow) return;
  const { context, width, height } = canvasSurface(elements.circleCanvas);
  const centerX = width / 2;
  const centerY = height * 0.48;
  const radius = Math.max(92, Math.min(width * 0.34, height * 0.335));
  state.circleGeometry = { centerX, centerY, radius };

  const glow = context.createRadialGradient(centerX, centerY, radius * 0.25, centerX, centerY, radius * 1.42);
  glow.addColorStop(0, "rgba(80, 169, 146, 0.10)");
  glow.addColorStop(0.7, "rgba(18, 63, 55, 0.04)");
  glow.addColorStop(1, "rgba(5, 23, 31, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(220, 244, 237, 0.09)";
  context.lineWidth = 1;
  context.setLineDash([3, 7]);
  for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    const inner = mapAngleToCircle(angle, centerX, centerY, radius * 0.72);
    const outer = mapAngleToCircle(angle, centerX, centerY, radius * 1.18);
    context.beginPath();
    context.moveTo(inner.x, inner.y);
    context.lineTo(outer.x, outer.y);
    context.stroke();
  }
  context.restore();

  const segments = 180;
  context.save();
  context.lineWidth = Math.max(12, radius * 0.085);
  context.lineCap = "butt";
  for (let index = 0; index < segments; index += 1) {
    const start = TWO_PI * index / segments;
    const end = TWO_PI * (index + 1.08) / segments;
    const velocity = evaluateFlow(state.flow, (start + end) / 2);
    const intensity = 0.18 + 0.42 * Math.min(1, Math.abs(velocity) / state.maximumVelocity);
    context.strokeStyle = velocity >= 0
      ? `rgba(98, 200, 181, ${intensity})`
      : `rgba(240, 177, 139, ${intensity})`;
    context.beginPath();
    context.arc(centerX, centerY, radius, -end, -start);
    context.stroke();
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(224, 248, 241, 0.65)";
  context.lineWidth = 1.3;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, TWO_PI);
  context.stroke();
  context.restore();

  if (elements.showArrows.checked) {
    const arrowCount = radius < 150 ? 16 : 22;
    for (let index = 0; index < arrowCount; index += 1) {
      const angle = TWO_PI * (index + 0.5) / arrowCount;
      const velocity = evaluateFlow(state.flow, angle);
      if (Math.abs(velocity) < state.maximumVelocity * 0.012) continue;
      const sign = Math.sign(velocity);
      const location = mapAngleToCircle(angle, centerX, centerY, radius);
      const tangentX = -Math.sin(angle) * sign;
      const tangentY = -Math.cos(angle) * sign;
      const length = 8 + 13 * Math.min(1, Math.abs(velocity) / state.maximumVelocity);
      drawArrow(
        context,
        location.x - tangentX * length * 0.42,
        location.y - tangentY * length * 0.42,
        location.x + tangentX * length * 0.58,
        location.y + tangentY * length * 0.58,
        velocity >= 0 ? "rgba(220, 250, 242, 0.82)" : "rgba(255, 211, 184, 0.86)",
        1.25,
        4
      );
    }
  }

  if (elements.showLabels.checked) {
    const labels = [
      [0, "0"],
      [Math.PI / 2, "π/2"],
      [Math.PI, "π"],
      [3 * Math.PI / 2, "3π/2"]
    ];
    context.save();
    context.fillStyle = "rgba(231, 246, 241, 0.68)";
    context.font = "11px 'IBM Plex Mono', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    labels.forEach(([angle, label]) => {
      const position = mapAngleToCircle(angle, centerX, centerY, radius + 27);
      context.fillText(label, position.x, position.y);
    });
    context.fillStyle = "rgba(231, 246, 241, 0.55)";
    context.font = "10px 'IBM Plex Mono', monospace";
    const symbol = ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "φ" : "θ";
    context.fillText(`${symbol} increases counterclockwise ↺`, centerX, centerY + radius + 53);
    context.restore();
  }

  if (elements.showTrails.checked) {
    for (const particle of state.particles) {
      const recent = particle.trail.slice(-90);
      if (recent.length < 2) continue;
      context.save();
      context.lineWidth = particle.ambient ? 1.35 : 2;
      context.lineCap = "round";
      for (let index = 1; index < recent.length; index += 1) {
        const previous = recent[index - 1];
        const current = recent[index];
        if (Math.abs(current.lifted - previous.lifted) > 0.5) continue;
        const fade = index / recent.length;
        context.strokeStyle = `rgba(242, 201, 105, ${0.04 + 0.27 * fade})`;
        const trailRadius = radius + particle.lane;
        const start = mapAngleToCircle(previous.lifted, centerX, centerY, trailRadius);
        const end = mapAngleToCircle(current.lifted, centerX, centerY, trailRadius);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }
      context.restore();
    }
  }

  if (state.analysis.regime === "rotating") {
    const bottleneckRatio = Math.abs(state.minimumVelocityPoint.velocity) / state.maximumVelocity;
    if (bottleneckRatio < 0.18) {
      const point = mapAngleToCircle(state.minimumVelocityPoint.angle, centerX, centerY, radius);
      const halo = context.createRadialGradient(point.x, point.y, 1, point.x, point.y, 34);
      halo.addColorStop(0, "rgba(240, 177, 139, 0.38)");
      halo.addColorStop(1, "rgba(240, 177, 139, 0)");
      context.fillStyle = halo;
      context.beginPath();
      context.arc(point.x, point.y, 34, 0, TWO_PI);
      context.fill();
      context.fillStyle = COLORS.peach;
      context.font = "10px 'IBM Plex Mono', monospace";
      context.textAlign = point.x > centerX ? "left" : "right";
      context.fillText("BOTTLENECK", point.x + (point.x > centerX ? 18 : -18), point.y - 18);
    }
  }

  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      const position = mapAngleToCircle(equilibrium.angle, centerX, centerY, radius);
      drawEquilibriumMarker(context, position.x, position.y, equilibrium, { dark: true, radius: 7 });
      if (elements.showEquilibriumParticles.checked) {
        drawParticle(context, position.x, position.y, 2.7, 0.72);
      }
    }
  } else {
    context.save();
    context.strokeStyle = COLORS.gold;
    context.lineWidth = 2;
    context.setLineDash([4, 6]);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, TWO_PI);
    context.stroke();
    context.restore();
  }

  for (const particle of state.particles) {
    const position = mapAngleToCircle(particle.lifted, centerX, centerY, radius + particle.lane);
    drawParticle(context, position.x, position.y, particle.ambient ? 3.7 : 5.2, particle.ambient ? 0.82 : 1);
  }

  const selected = mapAngleToCircle(state.selectedAngle, centerX, centerY, radius + 20);
  const selectedInner = mapAngleToCircle(state.selectedAngle, centerX, centerY, radius + 7);
  context.save();
  context.strokeStyle = COLORS.gold;
  context.fillStyle = COLORS.gold;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(selectedInner.x, selectedInner.y);
  context.lineTo(selected.x, selected.y);
  context.stroke();
  context.translate(selected.x, selected.y);
  context.rotate(-state.selectedAngle);
  context.beginPath();
  context.moveTo(6, 0);
  context.lineTo(-4, -4);
  context.lineTo(-4, 4);
  context.closePath();
  context.fill();
  context.restore();
}

function velocityPlotBox(width, height) {
  return { left: 48, right: width - 17, top: 20, bottom: height - 42 };
}

function drawVelocityCurvePath(context, box, yMaximum) {
  context.beginPath();
  state.samples.forEach((point, index) => {
    const x = lerp(box.left, box.right, point.angle / TWO_PI);
    const y = lerp(box.bottom, box.top, (point.velocity + yMaximum) / (2 * yMaximum));
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
}

function drawVelocityGraph() {
  if (!state.flow) return;
  const { context, width, height } = canvasSurface(elements.velocityCanvas);
  const box = velocityPlotBox(width, height);
  state.velocityPlot = box;
  const yMaximum = Math.max(0.35, state.maximumVelocity * 1.18);
  const zeroY = lerp(box.bottom, box.top, 0.5);

  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);
  context.save();
  context.font = "10px 'IBM Plex Mono', monospace";
  context.fillStyle = COLORS.muted;
  context.strokeStyle = "rgba(23, 33, 29, 0.11)";
  context.lineWidth = 1;
  const angleTicks = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, TWO_PI];
  const tickLabels = ["0", "π/2", "π", "3π/2", "2π"];
  angleTicks.forEach((angle, index) => {
    const x = lerp(box.left, box.right, angle / TWO_PI);
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
    context.textAlign = index === 0 ? "left" : index === angleTicks.length - 1 ? "right" : "center";
    context.fillText(tickLabels[index], x, box.bottom + 12);
  });
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const y = lerp(box.top, box.bottom, fraction);
    context.beginPath();
    context.moveTo(box.left, y);
    context.lineTo(box.right, y);
    context.stroke();
  }
  context.restore();

  context.save();
  context.beginPath();
  context.rect(box.left, box.top, box.right - box.left, zeroY - box.top);
  context.clip();
  drawVelocityCurvePath(context, box, yMaximum);
  context.lineTo(box.right, zeroY);
  context.lineTo(box.left, zeroY);
  context.closePath();
  context.fillStyle = "rgba(48, 143, 122, 0.16)";
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.rect(box.left, zeroY, box.right - box.left, box.bottom - zeroY);
  context.clip();
  drawVelocityCurvePath(context, box, yMaximum);
  context.lineTo(box.right, zeroY);
  context.lineTo(box.left, zeroY);
  context.closePath();
  context.fillStyle = "rgba(193, 105, 71, 0.14)";
  context.fill();
  context.restore();

  context.save();
  context.strokeStyle = "rgba(23, 33, 29, 0.50)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(box.left, zeroY);
  context.lineTo(box.right, zeroY);
  context.stroke();
  context.strokeStyle = COLORS.forest;
  context.lineWidth = 2.6;
  context.lineJoin = "round";
  drawVelocityCurvePath(context, box, yMaximum);
  context.stroke();
  context.strokeStyle = "rgba(23, 33, 29, 0.28)";
  context.lineWidth = 1;
  context.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  context.restore();

  context.save();
  context.font = "10px 'IBM Plex Mono', monospace";
  context.fillStyle = COLORS.muted;
  context.textAlign = "right";
  context.fillText(formatNumber(yMaximum, 2), box.left - 7, box.top + 3);
  context.fillText("0", box.left - 7, zeroY + 3);
  context.fillText(formatNumber(-yMaximum, 2), box.left - 7, box.bottom + 3);
  context.textAlign = "left";
  const stateSymbol = ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "φ" : "θ";
  context.fillText(`f(${stateSymbol})`, box.left + 5, box.top + 13);
  context.restore();

  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      const x = lerp(box.left, box.right, equilibrium.angle / TWO_PI);
      drawEquilibriumMarker(context, x, zeroY, equilibrium, { dark: false, radius: 5.5 });
      if (elements.showEquilibriumParticles.checked) drawParticle(context, x, zeroY, 2.4, 0.72);
    }
  }

  for (const particle of state.particles) {
    const angle = wrapAngle(particle.lifted);
    const velocity = evaluateFlow(state.flow, angle);
    const x = lerp(box.left, box.right, angle / TWO_PI);
    const y = lerp(box.bottom, box.top, (velocity + yMaximum) / (2 * yMaximum));
    drawParticle(context, x, y, particle.ambient ? 2.8 : 4.2, particle.ambient ? 0.68 : 0.95);
    if (angle < 0.045 || angle > TWO_PI - 0.045) {
      const ghostX = angle < 0.045 ? box.right : box.left;
      drawParticle(context, ghostX, y, 2.4, 0.28);
    }
  }

  const selectedX = lerp(box.left, box.right, state.selectedAngle / TWO_PI);
  const selectedVelocity = evaluateFlow(state.flow, state.selectedAngle);
  const selectedY = lerp(box.bottom, box.top, (selectedVelocity + yMaximum) / (2 * yMaximum));
  context.save();
  context.strokeStyle = "rgba(138, 98, 0, 0.72)";
  context.setLineDash([4, 5]);
  context.beginPath();
  context.moveTo(selectedX, box.top);
  context.lineTo(selectedX, box.bottom);
  context.stroke();
  context.restore();
  drawParticle(context, selectedX, selectedY, 4.5, 1);
}

function cylinderPoint(geometry, position, angle) {
  return {
    x: lerp(geometry.startX, geometry.endX, position) + geometry.radiusX * Math.cos(angle),
    y: geometry.centerY - geometry.radiusY * Math.sin(angle),
    depth: Math.cos(angle)
  };
}

function traceCylinderRing(context, geometry, position, startAngle, endAngle, steps = 36) {
  for (let index = 0; index <= steps; index += 1) {
    const angle = lerp(startAngle, endAngle, index / steps);
    const point = cylinderPoint(geometry, position, angle);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
}

function traceCylinderShell(context, geometry) {
  const steps = 28;
  const topStart = cylinderPoint(geometry, 0, Math.PI / 2);
  const topEnd = cylinderPoint(geometry, 1, Math.PI / 2);
  context.moveTo(topStart.x, topStart.y);
  context.lineTo(topEnd.x, topEnd.y);
  for (let index = 1; index <= steps; index += 1) {
    const angle = lerp(Math.PI / 2, -Math.PI / 2, index / steps);
    const point = cylinderPoint(geometry, 1, angle);
    context.lineTo(point.x, point.y);
  }
  const bottomStart = cylinderPoint(geometry, 0, -Math.PI / 2);
  context.lineTo(bottomStart.x, bottomStart.y);
  for (let index = 1; index <= steps; index += 1) {
    const angle = lerp(-Math.PI / 2, -3 * Math.PI / 2, index / steps);
    const point = cylinderPoint(geometry, 0, angle);
    context.lineTo(point.x, point.y);
  }
  context.closePath();
}

function drawCylinderRing(context, geometry, position, front, options = {}) {
  context.save();
  context.strokeStyle = options.strokeStyle || "rgba(11, 87, 72, 0.2)";
  context.lineWidth = options.lineWidth || 1;
  context.setLineDash(options.dash || []);
  context.beginPath();
  if (front) traceCylinderRing(context, geometry, position, -Math.PI / 2, Math.PI / 2);
  else traceCylinderRing(context, geometry, position, Math.PI / 2, 3 * Math.PI / 2);
  context.stroke();
  context.restore();
}

function drawCylinderGenerator(context, geometry, angle, options = {}) {
  const start = cylinderPoint(geometry, 0, angle);
  const end = cylinderPoint(geometry, 1, angle);
  context.save();
  context.strokeStyle = options.strokeStyle || "rgba(11, 87, 72, 0.2)";
  context.lineWidth = options.lineWidth || 1;
  context.setLineDash(options.dash || []);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawCylinderShell(context, geometry, options = {}) {
  context.save();
  context.fillStyle = options.fillStyle || "rgba(98, 200, 181, 0.07)";
  context.beginPath();
  traceCylinderShell(context, geometry);
  context.fill();
  context.strokeStyle = options.strokeStyle || "rgba(11, 87, 72, 0.28)";
  context.lineWidth = options.lineWidth || 1.1;
  context.beginPath();
  traceCylinderShell(context, geometry);
  context.stroke();
  context.restore();
}

function equilibriumTubeStyle(equilibrium, front) {
  if (equilibrium.stability === "stable") {
    return {
      strokeStyle: front ? "rgba(11, 87, 72, 0.72)" : "rgba(11, 87, 72, 0.2)",
      lineWidth: front ? 1.8 : 1.1,
      dash: []
    };
  }
  if (equilibrium.stability === "unstable") {
    return {
      strokeStyle: front ? "rgba(168, 79, 36, 0.68)" : "rgba(168, 79, 36, 0.18)",
      lineWidth: front ? 1.6 : 1,
      dash: [4, 4]
    };
  }
  return {
    strokeStyle: front ? "rgba(138, 98, 0, 0.72)" : "rgba(138, 98, 0, 0.2)",
    lineWidth: front ? 1.7 : 1,
    dash: [2, 4]
  };
}

function drawTrajectorySegments(context, geometry, series, startTime, endTime, front) {
  for (const { particle, trail } of series) {
    if (trail.length < 2) continue;
    const highlighted = particle.id === state.activeParticleId;
    context.save();
    context.strokeStyle = highlighted
      ? front ? "rgba(138, 98, 0, 0.96)" : "rgba(138, 98, 0, 0.3)"
      : front ? "rgba(11, 87, 72, 0.7)" : "rgba(11, 87, 72, 0.22)";
    context.lineWidth = highlighted ? (front ? 2.6 : 1.6) : (front ? 1.55 : 1.05);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash(front ? [] : [3, 4]);
    context.beginPath();
    let drawing = false;
    for (let index = 1; index < trail.length; index += 1) {
      const previous = trail[index - 1];
      const current = trail[index];
      const midpointDepth = Math.cos((previous.lifted + current.lifted) / 2);
      const belongs = front ? midpointDepth >= -1e-8 : midpointDepth < -1e-8;
      if (!belongs) {
        drawing = false;
        continue;
      }
      const start = cylinderPoint(
        geometry,
        clamp(inverseLerp(startTime, endTime, previous.t), 0, 1),
        previous.lifted
      );
      const end = cylinderPoint(
        geometry,
        clamp(inverseLerp(startTime, endTime, current.t), 0, 1),
        current.lifted
      );
      if (!drawing) context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      drawing = true;
    }
    context.stroke();
    context.restore();
  }
}

function drawTrajectoryTube() {
  if (!state.flow) return;
  const { context, width, height } = canvasSurface(elements.liftCanvas);
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);

  const top = 18;
  const bottom = Math.max(top + 76, height - 42);
  const radiusY = Math.min(72, Math.max(30, (bottom - top) * 0.34));
  const radiusX = Math.min(22, Math.max(13, radiusY * 0.28));
  const geometry = {
    startX: 24 + radiusX,
    endX: Math.max(24 + radiusX + 54, width - 24 - radiusX),
    centerY: (top + bottom) / 2,
    radiusX,
    radiusY
  };
  state.trajectoryTube = geometry;

  const timeSpan = 8;
  const startTime = Math.max(0, state.elapsed - timeSpan);
  const endTime = Math.max(startTime + 0.001, state.elapsed);
  const series = state.particles.map((particle) => ({
    particle,
    trail: particle.trail.filter((point) => point.t >= startTime)
  }));

  for (const position of [0, 0.25, 0.5, 0.75, 1]) {
    drawCylinderRing(context, geometry, position, false, {
      strokeStyle: "rgba(11, 87, 72, 0.11)",
      dash: [3, 4]
    });
  }
  drawCylinderGenerator(context, geometry, Math.PI, {
    strokeStyle: "rgba(11, 87, 72, 0.1)",
    dash: [3, 5]
  });

  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      if (Math.cos(equilibrium.angle) < 0) {
        if (elements.showEquilibriumParticles.checked) {
          drawCylinderGenerator(context, geometry, equilibrium.angle, equilibriumTubeStyle(equilibrium, false));
        }
        const endpoint = cylinderPoint(geometry, 1, equilibrium.angle);
        context.save();
        context.globalAlpha = 0.34;
        drawEquilibriumMarker(context, endpoint.x, endpoint.y, equilibrium, {
          dark: false,
          radius: 3.6
        });
        context.restore();
      }
    }
  }
  if (elements.showTrails.checked) {
    drawTrajectorySegments(context, geometry, series, startTime, endTime, false);
  }
  for (const particle of state.particles) {
    if (Math.cos(particle.lifted) >= 0) continue;
    const point = cylinderPoint(geometry, 1, particle.lifted);
    drawParticle(context, point.x, point.y, particle.ambient ? 2.5 : 3.8, particle.ambient ? 0.25 : 0.4);
  }

  drawCylinderShell(context, geometry, {
    fillStyle: "rgba(98, 200, 181, 0.075)",
    strokeStyle: "rgba(11, 87, 72, 0.28)"
  });

  for (const position of [0, 0.25, 0.5, 0.75, 1]) {
    drawCylinderRing(context, geometry, position, true, {
      strokeStyle: position === 1 ? "rgba(11, 87, 72, 0.48)" : "rgba(11, 87, 72, 0.2)",
      lineWidth: position === 1 ? 1.4 : 1
    });
  }
  for (const angle of [0, Math.PI / 2, 3 * Math.PI / 2]) {
    drawCylinderGenerator(context, geometry, angle, {
      strokeStyle: Math.abs(Math.cos(angle)) < 0.1
        ? "rgba(11, 87, 72, 0.28)"
        : "rgba(11, 87, 72, 0.18)"
    });
  }

  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      if (Math.cos(equilibrium.angle) >= 0) {
        if (elements.showEquilibriumParticles.checked) {
          drawCylinderGenerator(context, geometry, equilibrium.angle, equilibriumTubeStyle(equilibrium, true));
        }
        const endpoint = cylinderPoint(geometry, 1, equilibrium.angle);
        drawEquilibriumMarker(context, endpoint.x, endpoint.y, equilibrium, {
          dark: false,
          radius: 4.5
        });
      }
    }
  }
  if (elements.showTrails.checked) {
    drawTrajectorySegments(context, geometry, series, startTime, endTime, true);
  }

  if (elements.showArrows.checked) {
    for (const { particle, trail } of series) {
      if (trail.length < 2 || (particle.ambient && particle.id !== state.activeParticleId)) continue;
      const previous = trail[Math.max(0, trail.length - 2)];
      const current = trail[trail.length - 1];
      const start = cylinderPoint(
        geometry,
        clamp(inverseLerp(startTime, endTime, previous.t), 0, 1),
        previous.lifted
      );
      const end = cylinderPoint(
        geometry,
        clamp(inverseLerp(startTime, endTime, current.t), 0, 1),
        current.lifted
      );
      if (Math.hypot(end.x - start.x, end.y - start.y) > 2.5) {
        drawArrow(
          context,
          start.x,
          start.y,
          end.x,
          end.y,
          particle.id === state.activeParticleId ? COLORS.goldDark : COLORS.forest,
          1.2,
          3.5
        );
      }
    }
  }

  for (const particle of state.particles) {
    if (Math.cos(particle.lifted) < 0) continue;
    const point = cylinderPoint(geometry, 1, particle.lifted);
    drawParticle(context, point.x, point.y, particle.ambient ? 2.8 : 4.2, particle.ambient ? 0.72 : 1);
  }

  const selected = cylinderPoint(geometry, 1, state.selectedAngle);
  context.save();
  context.strokeStyle = COLORS.goldDark;
  context.lineWidth = 1.35;
  context.setLineDash(Math.cos(state.selectedAngle) < 0 ? [3, 3] : []);
  context.beginPath();
  context.moveTo(geometry.endX, geometry.centerY);
  context.lineTo(selected.x, selected.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = COLORS.paper;
  context.beginPath();
  context.arc(selected.x, selected.y, 4.3, 0, TWO_PI);
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = COLORS.muted;
  context.font = "9px 'IBM Plex Mono', monospace";
  context.textBaseline = "middle";
  context.textAlign = "center";
  const arrowY = geometry.centerY + geometry.radiusY + 22;
  drawArrow(context, geometry.startX, arrowY, geometry.endX, arrowY, "rgba(23, 33, 29, 0.42)", 1, 4);
  context.fillText("time t", (geometry.startX + geometry.endX) / 2, arrowY - 7);
  context.textAlign = "left";
  context.fillText(`${formatNumber(startTime, 1)} s`, geometry.startX - geometry.radiusX, arrowY + 10);
  context.textAlign = "right";
  context.fillText("now", geometry.endX + geometry.radiusX, arrowY + 10);
  if (elements.showLabels.checked) {
    const labelAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    const labels = ["0", "π/2", "π", "3π/2"];
    context.textAlign = "center";
    labelAngles.forEach((angle, index) => {
      const point = cylinderPoint(geometry, 1, angle);
      const offsetX = 10 * Math.cos(angle);
      const offsetY = -10 * Math.sin(angle);
      context.fillText(labels[index], point.x + offsetX, point.y + offsetY);
    });
  }
  context.restore();
}

function bifurcationPlotBox(width, height) {
  return {
    left: Math.min(64, Math.max(52, width * 0.13)),
    right: Math.max(76, width - 20),
    top: Math.min(72, Math.max(58, height * 0.2)),
    bottom: Math.max(100, height - 48)
  };
}

function niceTicks(minimum, maximum, target = 6) {
  const span = maximum - minimum;
  if (!(span > 0)) return [minimum];
  const rough = span / Math.max(2, target - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * power;
  const ticks = [];
  const epsilon = span * 1e-10;
  for (let value = Math.ceil((minimum - epsilon) / step) * step; value <= maximum + epsilon; value += step) {
    ticks.push(Math.abs(value) < epsilon ? 0 : value);
  }
  if (!ticks.some((value) => Math.abs(value - minimum) <= epsilon)) ticks.unshift(minimum);
  if (!ticks.some((value) => Math.abs(value - maximum) <= epsilon)) ticks.push(maximum);
  return ticks;
}

function formatAxisNumber(value, span) {
  const tolerance = Math.max(1e-10, span * 1e-8);
  if (Math.abs(value - Math.round(value)) <= tolerance) return formatNumber(value, 0);
  if (Math.abs(value * 10 - Math.round(value * 10)) <= tolerance) return formatNumber(value, 1);
  if (Math.abs(value * 100 - Math.round(value * 100)) <= tolerance) return formatNumber(value, 2);
  return formatNumber(value, 3);
}

function formatPhaseAxisTick(value) {
  const ratio = value / Math.PI;
  if (Math.abs(ratio) < 1e-8) return "0";
  const sign = ratio < 0 ? "−" : "";
  const magnitude = Math.abs(ratio);
  if (Math.abs(magnitude - 1) < 1e-8) return `${sign}π`;
  if (Math.abs(magnitude - 0.5) < 1e-8) return `${sign}π/2`;
  return `${formatNumber(ratio, 2)}π`;
}

function bifurcationHorizontalTicks(name, minimum, maximum) {
  if (name !== "phase") return niceTicks(minimum, maximum, 7);
  const phaseTicks = [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const ticks = phaseTicks.filter((value) => value >= minimum - 1e-8 && value <= maximum + 1e-8);
  if (!ticks.some((value) => Math.abs(value - minimum) < 1e-8)) ticks.unshift(minimum);
  if (!ticks.some((value) => Math.abs(value - maximum) < 1e-8)) ticks.push(maximum);
  return ticks;
}

function drawBifurcationAxes(context, box, name, minimum, maximum) {
  const mapX = (value) => lerp(box.left, box.right, inverseLerp(minimum, maximum, value));
  const mapY = (angle) => lerp(box.bottom, box.top, angle / TWO_PI);
  const yTicks = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, TWO_PI];
  const yTickLabels = ["0", "π/2", "π", "3π/2", "2π"];
  context.save();
  context.font = "10px 'IBM Plex Mono', monospace";
  context.fillStyle = COLORS.muted;
  context.strokeStyle = "rgba(23, 33, 29, 0.12)";
  context.lineWidth = 1;
  context.textBaseline = "middle";
  context.textAlign = "right";
  yTicks.forEach((angle, index) => {
    const y = mapY(angle);
    context.beginPath();
    context.moveTo(box.left, y);
    context.lineTo(box.right, y);
    context.stroke();
    context.fillText(yTickLabels[index], box.left - 8, y);
  });

  context.textBaseline = "top";
  context.textAlign = "center";
  const xTicks = bifurcationHorizontalTicks(name, minimum, maximum);
  for (const value of xTicks) {
    const x = mapX(value);
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
    const label = name === "phase"
      ? formatPhaseAxisTick(value)
      : formatAxisNumber(value, maximum - minimum);
    context.fillText(label, x, box.bottom + 8);
  }

  context.strokeStyle = "rgba(23, 33, 29, 0.34)";
  context.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  const stateSymbol = ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "φ*" : "θ*";
  context.fillStyle = COLORS.ink;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(stateSymbol, 10, box.top + 7);
  context.textAlign = "right";
  context.fillText(parameterPlayerLabel(name), box.right, box.bottom + 31);
  context.fillStyle = COLORS.muted;
  context.font = "9px 'IBM Plex Mono', monospace";
  context.fillText("0 ≡ 2π seam", box.right, box.top - 8);
  context.restore();
}

function drawBifurcationMessage(context, box, title, detail) {
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  const width = Math.min(430, Math.max(180, box.right - box.left - 32));
  const height = 54;
  context.save();
  context.fillStyle = "rgba(244, 241, 231, 0.94)";
  context.strokeStyle = "rgba(23, 33, 29, 0.16)";
  context.fillRect(centerX - width / 2, centerY - height / 2, width, height);
  context.strokeRect(centerX - width / 2, centerY - height / 2, width, height);
  context.fillStyle = COLORS.ink;
  context.font = "500 16px Georgia, serif";
  context.textAlign = "center";
  context.fillText(title, centerX, centerY - 5);
  context.fillStyle = COLORS.muted;
  context.font = "10px 'IBM Plex Mono', monospace";
  context.fillText(detail, centerX, centerY + 16);
  context.restore();
}

function bifurcationTubeGeometry(width, height) {
  const top = Math.min(78, Math.max(60, height * 0.13));
  const bottom = Math.max(top + 120, height - 64);
  const radiusY = Math.min(170, Math.max(46, (bottom - top) * 0.37));
  const radiusX = Math.min(38, Math.max(15, radiusY * 0.23));
  const startX = Math.min(width * 0.22, 54) + radiusX;
  const endX = Math.max(startX + 90, width - 24 - radiusX);
  return {
    startX,
    endX,
    centerY: (top + bottom) / 2,
    radiusX,
    radiusY
  };
}

function drawBifurcationTubeBranches(context, geometry, data, minimum, maximum, front) {
  const stableSegments = [];
  const unstableSegments = [];
  const thresholdPoints = [];
  const continuumPositions = [];
  const parameterStep = (maximum - minimum) / Math.max(1, data.slices.length - 1);

  for (const slice of data.slices) {
    const position = clamp(inverseLerp(minimum, maximum, slice.parameter), 0, 1);
    if (slice.continuum) {
      continuumPositions.push(position);
      continue;
    }
    for (const equilibrium of slice.equilibria) {
      const angle = wrapAngle(equilibrium.angle);
      const belongs = front ? Math.cos(angle) >= -1e-8 : Math.cos(angle) < -1e-8;
      if (!belongs) continue;
      const halfStep = parameterStep * 0.62;
      const startParameter = clamp(slice.parameter - halfStep, minimum, maximum);
      const endParameter = clamp(slice.parameter + halfStep, minimum, maximum);
      const start = cylinderPoint(
        geometry,
        inverseLerp(minimum, maximum, startParameter),
        angle
      );
      const end = cylinderPoint(
        geometry,
        inverseLerp(minimum, maximum, endParameter),
        angle
      );
      const segment = [start.x, start.y, end.x, end.y];
      if (equilibrium.stability === "stable") stableSegments.push(segment);
      else if (equilibrium.stability === "unstable") unstableSegments.push(segment);
      else thresholdPoints.push(cylinderPoint(geometry, position, angle));
    }
  }

  for (const position of continuumPositions) {
    drawCylinderRing(context, geometry, position, front, {
      strokeStyle: front ? "rgba(138, 98, 0, 0.76)" : "rgba(138, 98, 0, 0.24)",
      lineWidth: front ? 1.8 : 1.1,
      dash: [4, 4]
    });
  }

  if (stableSegments.length) {
    context.save();
    context.strokeStyle = front ? "rgba(11, 87, 72, 0.94)" : "rgba(11, 87, 72, 0.28)";
    context.lineWidth = front ? 2.35 : 1.35;
    context.beginPath();
    for (const [startX, startY, endX, endY] of stableSegments) {
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
    }
    context.stroke();
    context.restore();
  }

  if (unstableSegments.length) {
    context.save();
    context.strokeStyle = front ? "rgba(168, 79, 36, 0.94)" : "rgba(168, 79, 36, 0.27)";
    context.lineWidth = front ? 2.05 : 1.2;
    context.setLineDash(front ? [2.4, 2.4] : [2, 3.5]);
    context.beginPath();
    for (const [startX, startY, endX, endY] of unstableSegments) {
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
    }
    context.stroke();
    context.restore();
  }

  if (thresholdPoints.length) {
    context.save();
    context.fillStyle = COLORS.paper;
    context.strokeStyle = front ? "rgba(138, 98, 0, 0.96)" : "rgba(138, 98, 0, 0.32)";
    context.lineWidth = front ? 1.5 : 1;
    context.beginPath();
    for (const point of thresholdPoints) {
      context.moveTo(point.x + 2.8, point.y);
      context.arc(point.x, point.y, 2.8, 0, TWO_PI);
    }
    context.fill();
    context.stroke();
    context.restore();
  }
}

function drawBifurcationTubeCurrentState(context, geometry, currentPosition, front) {
  drawCylinderRing(context, geometry, currentPosition, front, {
    strokeStyle: front ? "rgba(138, 98, 0, 0.92)" : "rgba(138, 98, 0, 0.34)",
    lineWidth: state.analysis.equilibriumCount === Infinity ? (front ? 2.7 : 1.5) : (front ? 1.8 : 1.1),
    dash: [5, 4]
  });

  context.save();
  context.globalAlpha = front ? 1 : 0.34;
  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      const angle = wrapAngle(equilibrium.angle);
      const belongs = front ? Math.cos(angle) >= -1e-8 : Math.cos(angle) < -1e-8;
      if (!belongs) continue;
      const point = cylinderPoint(geometry, currentPosition, angle);
      drawEquilibriumMarker(context, point.x, point.y, equilibrium, { dark: false, radius: 4.6 });
    }
  }
  for (const particle of state.particles) {
    const angle = wrapAngle(particle.lifted);
    const belongs = front ? Math.cos(angle) >= -1e-8 : Math.cos(angle) < -1e-8;
    if (!belongs) continue;
    const point = cylinderPoint(geometry, currentPosition, angle);
    drawParticle(
      context,
      point.x,
      point.y,
      particle.id === state.activeParticleId ? 3.2 : 2,
      particle.id === state.activeParticleId ? 0.96 : 0.5
    );
  }
  context.restore();
}

function drawBifurcationTubeAxes(context, geometry, name, minimum, maximum) {
  const ticks = bifurcationHorizontalTicks(name, minimum, maximum);
  const baselineY = geometry.centerY + geometry.radiusY + 30;
  context.save();
  context.font = "9px 'IBM Plex Mono', monospace";
  context.fillStyle = COLORS.muted;
  context.strokeStyle = "rgba(23, 33, 29, 0.34)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(geometry.startX, baselineY);
  context.lineTo(geometry.endX, baselineY);
  context.stroke();
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const value of ticks) {
    const position = clamp(inverseLerp(minimum, maximum, value), 0, 1);
    const x = lerp(geometry.startX, geometry.endX, position);
    context.beginPath();
    context.moveTo(x, baselineY - 3);
    context.lineTo(x, baselineY + 3);
    context.stroke();
    context.fillText(
      name === "phase" ? formatPhaseAxisTick(value) : formatAxisNumber(value, maximum - minimum),
      x,
      baselineY + 6
    );
  }
  context.fillStyle = COLORS.ink;
  context.textAlign = "right";
  context.fillText(parameterPlayerLabel(name), geometry.endX, baselineY + 24);

  const labels = [
    [0, "0"],
    [Math.PI / 2, "π/2"],
    [Math.PI, "π"],
    [3 * Math.PI / 2, "3π/2"]
  ];
  context.fillStyle = COLORS.muted;
  context.textBaseline = "middle";
  for (const [angle, label] of labels) {
    const point = cylinderPoint(geometry, 0, angle);
    context.textAlign = Math.cos(angle) > 0.2 ? "left" : Math.cos(angle) < -0.2 ? "right" : "center";
    context.fillText(label, point.x + 9 * Math.cos(angle), point.y - 10 * Math.sin(angle));
  }
  const stateSymbol = ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "φ*" : "θ*";
  context.fillStyle = COLORS.ink;
  context.textAlign = "left";
  context.fillText(`${stateSymbol} wraps around`, geometry.startX - geometry.radiusX, geometry.centerY - geometry.radiusY - 18);
  context.restore();
}

function drawCylindricalBifurcation(context, width, height, data, name, config, minimum, maximum) {
  const geometry = bifurcationTubeGeometry(width, height);
  const box = {
    left: geometry.startX,
    right: geometry.endX,
    top: geometry.centerY - geometry.radiusY,
    bottom: geometry.centerY + geometry.radiusY
  };
  state.bifurcation.plot = { box, minimum, maximum, mode: "tube" };
  const ticks = bifurcationHorizontalTicks(name, minimum, maximum);

  for (const value of ticks) {
    const position = clamp(inverseLerp(minimum, maximum, value), 0, 1);
    drawCylinderRing(context, geometry, position, false, {
      strokeStyle: "rgba(23, 33, 29, 0.1)",
      dash: [3, 4]
    });
  }
  drawCylinderGenerator(context, geometry, Math.PI, {
    strokeStyle: "rgba(23, 33, 29, 0.09)",
    dash: [3, 5]
  });

  const currentValue = clamp(Number(config.control.value), minimum, maximum);
  const currentPosition = clamp(inverseLerp(minimum, maximum, currentValue), 0, 1);
  if (data) {
    drawBifurcationTubeBranches(context, geometry, data, minimum, maximum, false);
    drawBifurcationTubeCurrentState(context, geometry, currentPosition, false);
  }

  const allContinuum = data && data.slices.every((slice) => slice.continuum);
  drawCylinderShell(context, geometry, {
    fillStyle: allContinuum ? "rgba(242, 201, 105, 0.16)" : "rgba(98, 200, 181, 0.075)",
    strokeStyle: "rgba(23, 33, 29, 0.3)"
  });

  for (const value of ticks) {
    const position = clamp(inverseLerp(minimum, maximum, value), 0, 1);
    drawCylinderRing(context, geometry, position, true, {
      strokeStyle: "rgba(23, 33, 29, 0.17)"
    });
  }
  for (const angle of [0, Math.PI / 2, 3 * Math.PI / 2]) {
    drawCylinderGenerator(context, geometry, angle, {
      strokeStyle: Math.abs(Math.cos(angle)) < 0.1
        ? "rgba(23, 33, 29, 0.28)"
        : "rgba(23, 33, 29, 0.15)"
    });
  }

  if (data) {
    drawBifurcationTubeBranches(context, geometry, data, minimum, maximum, true);
    drawBifurcationTubeCurrentState(context, geometry, currentPosition, true);
  }
  drawCylinderRing(context, geometry, 1, true, {
    strokeStyle: "rgba(23, 33, 29, 0.42)",
    lineWidth: 1.35
  });
  drawCylinderRing(context, geometry, 0, true, {
    strokeStyle: "rgba(23, 33, 29, 0.36)",
    lineWidth: 1.2
  });
  drawBifurcationTubeAxes(context, geometry, name, minimum, maximum);

  const currentTop = cylinderPoint(geometry, currentPosition, Math.PI / 2);
  context.save();
  context.fillStyle = COLORS.goldDark;
  context.beginPath();
  context.moveTo(currentTop.x, currentTop.y);
  context.lineTo(currentTop.x - 5, currentTop.y - 8);
  context.lineTo(currentTop.x + 5, currentTop.y - 8);
  context.closePath();
  context.fill();
  context.restore();

  if (!data) {
    drawBifurcationMessage(context, box, "Diagram unavailable", "The other linked views remain active.");
    return;
  }
  const continuumCount = data.slices.filter((slice) => slice.continuum).length;
  const equilibriumCount = data.slices.reduce((total, slice) => total + slice.equilibria.length, 0);
  if (continuumCount === data.slices.length) {
    drawBifurcationMessage(context, box, "Every angle is fixed", "The vector field vanishes throughout this sweep.");
  } else if (equilibriumCount === 0 && continuumCount === 0) {
    drawBifurcationMessage(context, box, "No equilibrium branches", "The flow circulates throughout this sweep.");
  }
}

function drawBifurcationDiagram() {
  if (!state.flow || !elements.bifurcationCanvas) return;
  const { context, width, height } = canvasSurface(elements.bifurcationCanvas);
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);

  const data = state.bifurcation.data;
  const name = selectedBifurcationParameter();
  const config = PARAMETER_PLAYER_CONFIG[name];
  const minimum = Number(config?.control.min);
  const maximum = Number(config?.control.max);
  if (state.bifurcation.view === "tube") {
    drawCylindricalBifurcation(context, width, height, data, name, config, minimum, maximum);
    return;
  }
  const box = bifurcationPlotBox(width, height);
  state.bifurcation.plot = { box, minimum, maximum, mode: "plane" };
  drawBifurcationAxes(context, box, name, minimum, maximum);
  if (!data) {
    drawBifurcationMessage(context, box, "Diagram unavailable", "The other linked views remain active.");
    return;
  }

  const mapX = (value) => lerp(box.left, box.right, inverseLerp(minimum, maximum, value));
  const mapY = (angle) => lerp(box.bottom, box.top, angle / TWO_PI);
  const continuumCount = data.slices.filter((slice) => slice.continuum).length;
  const equilibriumCount = data.slices.reduce((total, slice) => total + slice.equilibria.length, 0);
  const sliceWidth = (box.right - box.left) / Math.max(1, data.slices.length - 1);

  context.save();
  context.beginPath();
  context.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  context.clip();
  if (continuumCount === data.slices.length) {
    context.fillStyle = "rgba(242, 201, 105, 0.18)";
    context.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  } else {
    const stableSegments = [];
    const unstableSegments = [];
    const thresholdPoints = [];
    const continuumColumns = [];
    for (const slice of data.slices) {
      const x = mapX(slice.parameter);
      if (slice.continuum) {
        continuumColumns.push(x);
        continue;
      }
      for (const equilibrium of slice.equilibria) {
        const angles = Math.abs(circularDifference(equilibrium.angle, 0)) < 2e-6
          ? [0, TWO_PI]
          : [wrapAngle(equilibrium.angle)];
        for (const angle of angles) {
          const y = mapY(angle);
          if (equilibrium.stability === "stable") {
            stableSegments.push([x, y]);
          } else if (equilibrium.stability === "unstable") {
            unstableSegments.push([x, y]);
          } else {
            thresholdPoints.push([x, y]);
          }
        }
      }
    }

    if (continuumColumns.length) {
      context.strokeStyle = "rgba(138, 98, 0, 0.72)";
      context.lineWidth = Math.max(1.2, sliceWidth * 0.7);
      context.setLineDash([4, 4]);
      context.beginPath();
      for (const x of continuumColumns) {
        context.moveTo(x, box.top);
        context.lineTo(x, box.bottom);
      }
      context.stroke();
    }
    if (stableSegments.length) {
      const halfWidth = Math.max(1.2, sliceWidth * 0.58);
      context.strokeStyle = "rgba(11, 87, 72, 0.92)";
      context.lineWidth = 2.25;
      context.setLineDash([]);
      context.beginPath();
      for (const [x, y] of stableSegments) {
        context.moveTo(x - halfWidth, y);
        context.lineTo(x + halfWidth, y);
      }
      context.stroke();
    }
    if (unstableSegments.length) {
      const halfWidth = Math.max(1.3, sliceWidth * 0.7);
      context.strokeStyle = "rgba(168, 79, 36, 0.92)";
      context.lineWidth = 2;
      context.setLineDash([2.2, 2.2]);
      context.beginPath();
      for (const [x, y] of unstableSegments) {
        context.moveTo(x - halfWidth, y);
        context.lineTo(x + halfWidth, y);
      }
      context.stroke();
    }
    if (thresholdPoints.length) {
      context.setLineDash([]);
      context.fillStyle = COLORS.paper;
      context.strokeStyle = COLORS.goldDark;
      context.lineWidth = 1.5;
      context.beginPath();
      for (const [x, y] of thresholdPoints) {
        context.moveTo(x + 2.8, y);
        context.arc(x, y, 2.8, 0, TWO_PI);
      }
      context.fill();
      context.stroke();
    }
  }

  const currentValue = clamp(Number(config.control.value), minimum, maximum);
  const currentX = mapX(currentValue);
  context.setLineDash([5, 4]);
  context.strokeStyle = "rgba(138, 98, 0, 0.88)";
  context.lineWidth = state.analysis.equilibriumCount === Infinity ? 2.6 : 1.6;
  context.beginPath();
  context.moveTo(currentX, box.top);
  context.lineTo(currentX, box.bottom);
  context.stroke();
  context.setLineDash([]);

  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      const angles = Math.abs(circularDifference(equilibrium.angle, 0)) < 2e-6
        ? [0, TWO_PI]
        : [wrapAngle(equilibrium.angle)];
      for (const angle of angles) {
        drawEquilibriumMarker(context, currentX, mapY(angle), equilibrium, { dark: false, radius: 4.6 });
      }
    }
  }
  for (const particle of state.particles) {
    const angle = wrapAngle(particle.lifted);
    const radius = particle.id === state.activeParticleId ? 3.2 : 2;
    const alpha = particle.id === state.activeParticleId ? 0.96 : 0.5;
    drawParticle(context, currentX, mapY(angle), radius, alpha);
    if (Math.min(angle, TWO_PI - angle) < 0.035) {
      drawParticle(context, currentX, mapY(angle < Math.PI ? TWO_PI : 0), radius, alpha * 0.45);
    }
  }
  context.restore();

  context.save();
  context.fillStyle = COLORS.goldDark;
  context.beginPath();
  context.moveTo(currentX, box.top);
  context.lineTo(currentX - 5, box.top - 8);
  context.lineTo(currentX + 5, box.top - 8);
  context.closePath();
  context.fill();
  context.restore();

  if (continuumCount === data.slices.length) {
    drawBifurcationMessage(context, box, "Every angle is fixed", "The vector field vanishes throughout this sweep.");
  } else if (equilibriumCount === 0 && continuumCount === 0) {
    drawBifurcationMessage(context, box, "No equilibrium branches", "The flow circulates throughout this sweep.");
  }
}

function drawAll() {
  drawCirclePortrait();
  drawVelocityGraph();
  drawTrajectoryTube();
  drawBifurcationDiagram();
  elements.elapsedTime.textContent = formatNumber(state.elapsed, 1);
  elements.lapCount.textContent = String(state.totalLaps);
  state.dirty = false;
}

function appendTrails() {
  for (const particle of state.particles) {
    particle.trail.push({ t: state.elapsed, lifted: particle.lifted });
    while (particle.trail.length > 2 && particle.trail[1].t < state.elapsed - 10) particle.trail.shift();
  }
}

function updateParticles(delta) {
  if (!state.running || !state.flow || delta <= 0) return;
  const scaled = delta * state.speed;
  const steps = Math.max(1, Math.ceil(Math.abs(scaled) / 0.025));
  const step = scaled / steps;
  for (let substep = 0; substep < steps; substep += 1) {
    for (const particle of state.particles) {
      const previous = particle.lifted;
      particle.lifted = stepLiftedRK4(state.flow, particle.lifted, step);
      if (!Number.isFinite(particle.lifted)) particle.lifted = wrapAngle(particle.initial);
      state.totalLaps += Math.abs(seamCrossings(previous, particle.lifted));
    }
  }
  state.elapsed += scaled;
  state.emitterElapsed += scaled;
  if (state.emitterElapsed >= 2.6) {
    state.emitterElapsed %= 2.6;
    const angle = wrapAngle((state.nextParticleId * 0.61803398875 + state.elapsed * 0.035) * TWO_PI);
    makeParticle(angle, { ambient: true });
    if (state.particles.length > 16) {
      const removable = state.particles.findIndex((particle) => particle.ambient && state.elapsed - particle.bornAt > 5);
      if (removable >= 0) state.particles.splice(removable, 1);
    }
  }
  if (state.elapsed - state.lastTrailTime >= 0.055) {
    appendTrails();
    state.lastTrailTime = state.elapsed;
  }
  state.dirty = true;
}

function syncAnimationButton() {
  elements.toggleAnimation.textContent = state.running ? "Pause motion" : "Resume motion";
  elements.toggleAnimation.setAttribute("aria-pressed", String(state.running));
}

function toggleAnimation(options = {}) {
  state.running = !state.running;
  syncAnimationButton();
  if (options.announce !== false) announce(state.running ? "Particle motion resumed." : "Particle motion paused.");
}

function parameterPlayerLabel(name) {
  return PARAMETER_PLAYER_CONFIG[name]?.label?.textContent?.trim() || "Parameter";
}

function cancelParameterValueEdit(name) {
  const config = PARAMETER_PLAYER_CONFIG[name];
  const input = config?.valueInput;
  if (!input) return;
  input.dataset.dirty = "false";
  input.value = parameterInputValue(name);
  input.removeAttribute("aria-invalid");
}

function commitParameterValue(name, options = {}) {
  const config = PARAMETER_PLAYER_CONFIG[name];
  const input = config?.valueInput;
  if (!config || !input || input.dataset.dirty !== "true") return false;
  const rawValue = input.value.trim();
  const typedValue = Number(rawValue);
  if (!rawValue || !Number.isFinite(typedValue)) {
    cancelParameterValueEdit(name);
    announce(`${parameterPlayerLabel(name)} needs a finite number.`);
    return false;
  }

  setParameterPlayer(name, false);
  const minimum = Number(config.control.min);
  const maximum = Number(config.control.max);
  let nextValue = typedValue * (config.scale || 1);
  if (config.discrete) nextValue = Math.round(nextValue);
  config.control.value = String(clamp(nextValue, minimum, maximum));
  input.dataset.dirty = "false";
  input.removeAttribute("aria-invalid");
  refreshFlow();
  if (options.announce !== false) {
    announce(`${parameterPlayerLabel(name)} set to ${config.control.getAttribute("aria-valuetext") || config.control.value}.`);
  }
  return true;
}

function syncParameterPlayButton(name) {
  const config = PARAMETER_PLAYER_CONFIG[name];
  const player = state.parameterPlayers[name];
  if (!config?.button || !player) return;
  const label = parameterPlayerLabel(name);
  config.button.setAttribute("aria-pressed", String(player.playing));
  config.button.setAttribute(
    "aria-label",
    `${player.playing ? "Pause" : "Animate"} the ${label} parameter`
  );
  const icon = config.button.querySelector("span");
  if (icon) icon.textContent = player.playing ? "Ⅱ" : "▶";
}

function syncParameterPlayButtons() {
  Object.keys(PARAMETER_PLAYER_CONFIG).forEach(syncParameterPlayButton);
}

function setParameterPlayer(name, playing, options = {}) {
  const config = PARAMETER_PLAYER_CONFIG[name];
  const player = state.parameterPlayers[name];
  if (!config || !player || (playing && config.wrapper.hidden) || player.playing === playing) return false;
  player.playing = playing;
  if (playing) {
    player.position = Number(config.control.value);
    const minimum = Number(config.control.min);
    const maximum = Number(config.control.max);
    const edgeTolerance = Math.max(Number(config.control.step) || 0, (maximum - minimum) * 0.01);
    if (player.position >= maximum - edgeTolerance) player.direction = -1;
    else if (player.position <= minimum + edgeTolerance) player.direction = 1;
  } else {
    player.position = null;
  }
  syncParameterPlayButton(name);
  if (options.announce) {
    announce(`${parameterPlayerLabel(name)} animation ${playing ? "started" : "paused"}.`);
  }
  return true;
}

function stopParameterPlayers() {
  Object.keys(PARAMETER_PLAYER_CONFIG).forEach((name) => {
    setParameterPlayer(name, false);
  });
  state.parameterAccumulator = 0;
}

function toggleParameterPlayer(name) {
  const player = state.parameterPlayers[name];
  if (!player) return;
  setParameterPlayer(name, !player.playing, { announce: true });
}

function updateParameterPlayers(delta) {
  if (delta <= 0) return;
  let active = false;
  let changed = false;
  for (const [name, config] of Object.entries(PARAMETER_PLAYER_CONFIG)) {
    const player = state.parameterPlayers[name];
    if (!player.playing) continue;
    if (config.wrapper.hidden) {
      setParameterPlayer(name, false);
      continue;
    }
    active = true;
    const minimum = Number(config.control.min);
    const maximum = Number(config.control.max);
    const span = maximum - minimum;
    let position = Number.isFinite(player.position) ? player.position : Number(config.control.value);
    position += player.direction * span * delta / 9;
    if (position >= maximum) {
      position = maximum - (position - maximum);
      player.direction = -1;
    } else if (position <= minimum) {
      position = minimum + (minimum - position);
      player.direction = 1;
    }
    player.position = clamp(position, minimum, maximum);
    const previousValue = Number(config.control.value);
    const nextValue = config.discrete ? Math.round(player.position) : player.position;
    config.control.value = String(clamp(nextValue, minimum, maximum));
    changed = Number(config.control.value) !== previousValue || changed;
  }
  if (!active) return;
  state.parameterAccumulator += delta;
  if (!changed) return;
  if (state.parameterAccumulator >= 0.045) {
    state.parameterAccumulator = 0;
    refreshFlow();
  } else {
    updateParameterOutputs();
  }
}

function pointerPosition(canvas, event) {
  const rectangle = canvas.getBoundingClientRect();
  return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
}

function angleFromCanvas(canvas, event) {
  const position = pointerPosition(canvas, event);
  if (canvas === elements.circleCanvas && state.circleGeometry) {
    const { centerX, centerY } = state.circleGeometry;
    return wrapAngle(Math.atan2(centerY - position.y, position.x - centerX));
  }
  if (canvas === elements.velocityCanvas && state.velocityPlot) {
    return wrapAngle(TWO_PI * clamp(
      inverseLerp(state.velocityPlot.left, state.velocityPlot.right, position.x),
      0,
      1
    ));
  }
  if (canvas === elements.liftCanvas && state.trajectoryTube) {
    const geometry = state.trajectoryTube;
    const normalizedX = (position.x - geometry.endX) / geometry.radiusX;
    const normalizedY = (geometry.centerY - position.y) / geometry.radiusY;
    const distance = Math.hypot(normalizedX, normalizedY);
    if (distance < 0.3 || distance > 1.7) return null;
    return wrapAngle(Math.atan2(normalizedY, normalizedX));
  }
  return state.selectedAngle;
}

function beginCanvasPointer(canvas, event) {
  if (event.button !== 0 || event.isPrimary === false) return;
  const angle = angleFromCanvas(canvas, event);
  if (!Number.isFinite(angle)) return;
  canvas.focus({ preventScroll: true });
  state.pointer = { canvas, pointerId: event.pointerId, moved: false };
  state.selectedAngle = angle;
  updateSelectedReadout();
  state.dirty = true;
  canvas.dataset.dragging = "true";
  canvas.setPointerCapture?.(event.pointerId);
}

function moveCanvasPointer(canvas, event) {
  if (!state.pointer || state.pointer.canvas !== canvas || state.pointer.pointerId !== event.pointerId) return;
  const angle = angleFromCanvas(canvas, event);
  if (!Number.isFinite(angle)) return;
  state.pointer.moved = true;
  state.selectedAngle = angle;
  updateSelectedReadout();
  state.dirty = true;
}

function endCanvasPointer(canvas, event) {
  if (!state.pointer || state.pointer.canvas !== canvas || state.pointer.pointerId !== event.pointerId) return;
  const angle = angleFromCanvas(canvas, event);
  if (Number.isFinite(angle)) state.selectedAngle = angle;
  delete canvas.dataset.dragging;
  try {
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  } catch {
    // The browser may already have released capture after a touch gesture.
  }
  state.pointer = null;
  addParticle(state.selectedAngle);
}

function cancelCanvasPointer(canvas, event) {
  if (!state.pointer || state.pointer.canvas !== canvas || state.pointer.pointerId !== event.pointerId) return;
  delete canvas.dataset.dragging;
  state.pointer = null;
}

function handleCanvasKey(event) {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const increment = event.shiftKey ? Math.PI / 6 : Math.PI / 24;
    state.selectedAngle = wrapAngle(state.selectedAngle + (event.key === "ArrowRight" ? increment : -increment));
    updateSelectedReadout();
    state.dirty = true;
    const symbolName = state.flow && ["firefly-locking", "josephson-junction"].includes(state.flow.id) ? "phi" : "theta";
    announce(`Selected ${symbolName} ${formatPi(state.selectedAngle)}.`);
  } else if (event.key === "Enter") {
    event.preventDefault();
    addParticle(state.selectedAngle);
  } else if (event.key === " ") {
    event.preventDefault();
    toggleAnimation();
  } else if (event.key === "0") {
    event.preventDefault();
    resetParticles();
  }
}

function bifurcationValueFromPointer(event) {
  const rectangle = elements.bifurcationCanvas.getBoundingClientRect();
  const plot = state.bifurcation.plot || {
    box: bifurcationPlotBox(rectangle.width, rectangle.height),
    minimum: Number(PARAMETER_PLAYER_CONFIG[selectedBifurcationParameter()].control.min),
    maximum: Number(PARAMETER_PLAYER_CONFIG[selectedBifurcationParameter()].control.max)
  };
  const x = event.clientX - rectangle.left;
  return lerp(
    plot.minimum,
    plot.maximum,
    clamp(inverseLerp(plot.box.left, plot.box.right, x), 0, 1)
  );
}

function setBifurcationParameterValue(value, options = {}) {
  const name = selectedBifurcationParameter();
  const config = PARAMETER_PLAYER_CONFIG[name];
  if (!config?.control) return;
  setParameterPlayer(name, false);
  cancelParameterValueEdit(name);
  const minimum = Number(config.control.min);
  const maximum = Number(config.control.max);
  config.control.value = String(clamp(Number(value), minimum, maximum));
  updateParameterOutputs();
  updateBifurcationAccessibility();
  state.dirty = true;
  if (options.immediate) refreshFlow();
  else scheduleFlowRefresh();
  if (options.announce) {
    announce(`${parameterPlayerLabel(name)} set to ${formatBifurcationParameterValue(name, Number(config.control.value))}.`);
  }
}

function beginBifurcationPointer(event) {
  if (event.button !== 0 || event.isPrimary === false) return;
  elements.bifurcationCanvas.focus({ preventScroll: true });
  state.bifurcation.pointerId = event.pointerId;
  elements.bifurcationCanvas.dataset.dragging = "true";
  elements.bifurcationCanvas.setPointerCapture?.(event.pointerId);
  setBifurcationParameterValue(bifurcationValueFromPointer(event));
}

function moveBifurcationPointer(event) {
  if (state.bifurcation.pointerId !== event.pointerId) return;
  setBifurcationParameterValue(bifurcationValueFromPointer(event));
}

function endBifurcationPointer(event) {
  if (state.bifurcation.pointerId !== event.pointerId) return;
  const value = bifurcationValueFromPointer(event);
  state.bifurcation.pointerId = null;
  delete elements.bifurcationCanvas.dataset.dragging;
  try {
    if (elements.bifurcationCanvas.hasPointerCapture?.(event.pointerId)) {
      elements.bifurcationCanvas.releasePointerCapture(event.pointerId);
    }
  } catch {
    // The browser may already have released capture after a touch gesture.
  }
  setBifurcationParameterValue(value, { immediate: true, announce: true });
}

function cancelBifurcationPointer(event) {
  if (state.bifurcation.pointerId !== event.pointerId) return;
  state.bifurcation.pointerId = null;
  delete elements.bifurcationCanvas.dataset.dragging;
}

function handleBifurcationKey(event) {
  const name = selectedBifurcationParameter();
  const config = PARAMETER_PLAYER_CONFIG[name];
  if (!config?.control) return;
  const minimum = Number(config.control.min);
  const maximum = Number(config.control.max);
  const current = Number(config.control.value);
  let value = current;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const step = (maximum - minimum) * (event.shiftKey ? 0.025 : 0.005);
    value += event.key === "ArrowRight" ? step : -step;
  } else if (event.key === "Home") {
    value = minimum;
  } else if (event.key === "End") {
    value = maximum;
  } else if (event.key === " ") {
    event.preventDefault();
    toggleParameterPlayer(name);
    return;
  } else {
    return;
  }
  event.preventDefault();
  setBifurcationParameterValue(value, { immediate: true, announce: true });
}

function toggleBifurcationView() {
  const rolled = state.bifurcation.view === "tube";
  state.bifurcation.view = rolled ? "plane" : "tube";
  state.bifurcation.plot = null;
  updateBifurcationAccessibility();
  state.dirty = true;
  drawBifurcationDiagram();
  announce(
    rolled
      ? "Bifurcation diagram unrolled into a plane. Equilibrium angle is vertical and the selected parameter is horizontal."
      : "Bifurcation diagram rolled into a cylinder. The parameter runs along the tube and equilibrium angle wraps around it."
  );
}

function currentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function fullscreenSupported() {
  return Boolean(elements.workspace?.requestFullscreen || elements.workspace?.webkitRequestFullscreen);
}

function syncFullscreen(options = {}) {
  const active = currentFullscreenElement() === elements.workspace;
  elements.workspace.classList.toggle("is-fullscreen", active);
  elements.fullscreenToggle?.setAttribute("aria-label", active ? "Exit full screen" : "Enter full screen");
  if (elements.fullscreenLabel) elements.fullscreenLabel.textContent = active ? "Exit full screen" : "Full screen";
  if (state.fullscreenInitialized && options.announce !== false) announce(active ? "Full screen view opened." : "Full screen view closed.");
  state.fullscreenInitialized = true;
  window.requestAnimationFrame(() => window.requestAnimationFrame(drawAll));
}

async function toggleFullscreen() {
  if (!fullscreenSupported()) return;
  try {
    if (currentFullscreenElement() === elements.workspace) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      await exit.call(document);
    } else {
      const enter = elements.workspace.requestFullscreen || elements.workspace.webkitRequestFullscreen;
      await enter.call(elements.workspace);
    }
  } catch (error) {
    console.warn("Full screen could not change.", error);
    announce("Full screen could not change in this browser.");
  }
}

let refreshRequest = 0;
function scheduleFlowRefresh(options = {}) {
  if (refreshRequest) return;
  refreshRequest = window.requestAnimationFrame(() => {
    refreshRequest = 0;
    refreshFlow(options);
  });
}

function installEvents() {
  elements.familySelect.addEventListener("change", () => {
    stopParameterPlayers();
    configureFamilyControls(elements.familySelect.value, true);
    refreshFlow({ resetParticles: true, announce: true, forceBifurcation: true });
  });
  elements.bifurcationParameter.addEventListener("change", () => {
    state.bifurcation.data = null;
    state.bifurcation.cacheKey = "";
    state.bifurcation.plot = null;
    rebuildBifurcationData({ force: true });
    updateBifurcationAccessibility();
    state.dirty = true;
    announce(`${parameterPlayerLabel(selectedBifurcationParameter())} is now the horizontal bifurcation parameter.`);
  });
  Object.entries(PARAMETER_PLAYER_CONFIG).forEach(([name, config]) => {
    config.control.addEventListener("input", () => {
      setParameterPlayer(name, false);
      cancelParameterValueEdit(name);
      scheduleFlowRefresh();
    });
    config.control.addEventListener("change", () => {
      refreshFlow();
      announce(`${parameterPlayerLabel(name)} set to ${config.control.getAttribute("aria-valuetext") || config.control.value}.`);
    });
    config.valueInput.addEventListener("focus", () => {
      setParameterPlayer(name, false);
      config.valueInput.removeAttribute("aria-invalid");
    });
    config.valueInput.addEventListener("input", () => {
      setParameterPlayer(name, false);
      config.valueInput.dataset.dirty = "true";
      config.valueInput.removeAttribute("aria-invalid");
    });
    config.valueInput.addEventListener("change", () => {
      commitParameterValue(name);
    });
    config.valueInput.addEventListener("blur", () => {
      commitParameterValue(name);
    });
    config.valueInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitParameterValue(name);
        config.valueInput.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelParameterValueEdit(name);
        config.valueInput.blur();
      }
    });
    config.button.addEventListener("click", () => {
      commitParameterValue(name);
      toggleParameterPlayer(name);
    });
  });
  [elements.showArrows, elements.showTrails, elements.showLabels, elements.showEquilibriumParticles].forEach((input) => {
    input.addEventListener("change", () => {
      state.dirty = true;
    });
  });
  elements.toggleAnimation.addEventListener("click", () => toggleAnimation());
  elements.resetParticles.addEventListener("click", () => resetParticles());
  elements.animationSpeed.addEventListener("input", () => {
    state.speed = Number(elements.animationSpeed.value);
    const label = `${state.speed.toFixed(2)}×`;
    elements.animationSpeedValue.value = label;
    elements.animationSpeedValue.textContent = label;
    elements.animationSpeed.setAttribute("aria-valuetext", `${label} time scale`);
  });
  elements.fullscreenToggle?.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreen);
  document.addEventListener("webkitfullscreenchange", syncFullscreen);
  [elements.circleCanvas, elements.velocityCanvas, elements.liftCanvas].forEach((canvas) => {
    canvas.addEventListener("pointerdown", (event) => beginCanvasPointer(canvas, event));
    canvas.addEventListener("pointermove", (event) => moveCanvasPointer(canvas, event));
    canvas.addEventListener("pointerup", (event) => endCanvasPointer(canvas, event));
    canvas.addEventListener("pointercancel", (event) => cancelCanvasPointer(canvas, event));
    canvas.addEventListener("lostpointercapture", (event) => cancelCanvasPointer(canvas, event));
    canvas.addEventListener("keydown", handleCanvasKey);
  });
  elements.bifurcationCanvas.addEventListener("pointerdown", beginBifurcationPointer);
  elements.bifurcationCanvas.addEventListener("pointermove", moveBifurcationPointer);
  elements.bifurcationCanvas.addEventListener("pointerup", endBifurcationPointer);
  elements.bifurcationCanvas.addEventListener("pointercancel", cancelBifurcationPointer);
  elements.bifurcationCanvas.addEventListener("lostpointercapture", cancelBifurcationPointer);
  elements.bifurcationCanvas.addEventListener("keydown", handleBifurcationKey);
  elements.bifurcationRollToggle?.addEventListener("click", toggleBifurcationView);
  motionQuery.addEventListener?.("change", (event) => {
    if (event.matches) {
      state.running = false;
      stopParameterPlayers();
      syncAnimationButton();
      announce("Motion paused because reduced motion is enabled.");
    }
  });
}

function animate(now) {
  const delta = Math.min(0.06, Math.max(0, (now - state.lastFrameTime) / 1000));
  state.lastFrameTime = now;
  updateParameterPlayers(delta);
  updateParticles(delta);
  if (state.bifurcation.pending && now - state.bifurcation.lastSampleTime >= 140) {
    rebuildBifurcationData();
  }
  if (state.dirty && !document.hidden && now - state.lastRenderTime >= 30) {
    drawAll();
    state.lastRenderTime = now;
  }
  window.requestAnimationFrame(animate);
}

function initialize() {
  configureFamilyControls(elements.familySelect.value, true);
  state.speed = Number(elements.animationSpeed.value);
  elements.animationSpeedValue.value = `${state.speed.toFixed(2)}×`;
  elements.animationSpeedValue.textContent = `${state.speed.toFixed(2)}×`;
  elements.animationSpeed.setAttribute("aria-valuetext", `${state.speed.toFixed(2)} times`);
  updateSelectedReadout();
  refreshFlow({ resetParticles: true });
  syncAnimationButton();
  syncParameterPlayButtons();
  syncBifurcationViewControl();
  installEvents();
  if (elements.fullscreenToggle) elements.fullscreenToggle.hidden = !fullscreenSupported();
  syncFullscreen({ announce: false });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      state.dirty = true;
      drawAll();
    });
    observer.observe(elements.circleCanvas);
    observer.observe(elements.velocityCanvas);
    observer.observe(elements.liftCanvas);
    observer.observe(elements.bifurcationCanvas);
  }
  announce(`${state.flow.name} loaded. ${state.running ? "Particles are moving." : "Motion is paused for reduced motion."}`);
  window.requestAnimationFrame(animate);
}

initialize();
