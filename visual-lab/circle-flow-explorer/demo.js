import {
  TWO_PI,
  analyzeCircleFlow,
  circularDifference,
  createCircleFlow,
  evaluateFlow,
  sampleFlow,
  seamCrossings,
  stepLiftedRK4,
  wrapAngle
} from "./model.js";

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
  bControl: byId("parameter-b-control"),
  bLabel: byId("parameter-b-label"),
  b: byId("parameter-b"),
  bValue: byId("parameter-b-value"),
  phaseControl: byId("parameter-phase-control"),
  phaseLabel: byId("parameter-phase-label"),
  phase: byId("parameter-phase"),
  phaseValue: byId("parameter-phase-value"),
  nControl: byId("parameter-n-control"),
  nLabel: byId("parameter-n-label"),
  n: byId("parameter-n"),
  nValue: byId("parameter-n-value"),
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
    defaults: { omega: 1.1 },
    ranges: { omega: [-2.5, 2.5, 0.002] },
    labels: { omega: "Angular velocity ω" },
    help: "Change the constant angular velocity. At ω = 0, every point on the circle is stationary."
  },
  nonuniform: {
    visible: ["omega", "a", "phase"],
    defaults: { omega: 1, a: 0.65, phase: 0.35 },
    ranges: { omega: [-2.2, 2.2, 0.002], a: [0, 1.4, 0.002], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Base angular velocity ω", a: "Speed modulation a", phase: "Wave phase φ" },
    help: "For a < 1 the speed varies but never vanishes. At a = 1 a bottleneck becomes a threshold; for a > 1 fixed points appear."
  },
  "overdamped-pendulum": {
    visible: ["omega", "a"],
    defaults: { omega: 0.55, a: 1 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002] },
    labels: { omega: "Drive ω", a: "Restoring strength a" },
    help: "Vary the drive through |ω| = a. A stable–unstable pair collides, then leaves behind a slow bottleneck."
  },
  "firefly-locking": {
    visible: ["omega", "a", "phase"],
    defaults: { omega: 0.45, a: 1, phase: 0.25 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Frequency mismatch Δω", a: "Coupling K", phase: "Preferred phase φ₀" },
    help: "The angle is the phase difference. A fixed point means phase locking; continual circulation means repeated phase slips."
  },
  "josephson-junction": {
    visible: ["omega", "a"],
    defaults: { omega: 1.25, a: 1 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002] },
    labels: { omega: "Applied current I", a: "Critical current I_c" },
    help: "Below critical current the phase is pinned. Above it the phase runs, producing a nonzero mean voltage."
  },
  "repeated-locking-sites": {
    visible: ["omega", "a", "n", "phase"],
    defaults: { omega: 0.2, a: 1, n: 3, phase: 0 },
    ranges: { omega: [-1.8, 1.8, 0.002], a: [0.15, 1.6, 0.002], n: [1, 8, 1], phase: [-Math.PI, Math.PI, 0.002] },
    labels: { omega: "Drive ω", a: "Wave amplitude a", n: "Number of locking sites n", phase: "Phase shift φ" },
    help: "The n-fold symmetry creates n stable and n unstable states at once. These simultaneous folds split under a generic perturbation."
  },
  "fourier-workshop": {
    visible: ["omega", "a", "b", "n", "phase"],
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
  selectedAngle: 0,
  elapsed: 0,
  totalLaps: 0,
  running: !motionQuery.matches,
  speed: 1,
  emitterElapsed: 0,
  lastFrameTime: performance.now(),
  lastRenderTime: 0,
  lastTrailTime: 0,
  parameterPlaying: false,
  parameterDirection: 1,
  parameterAccumulator: 0,
  pointer: null,
  circleGeometry: null,
  velocityPlot: null,
  liftPhaseLine: null,
  fullscreenInitialized: false,
  lastAnnouncement: ""
};

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

function updateParameterOutputs() {
  const omega = Number(elements.omega.value);
  const amplitude = Number(elements.a.value);
  const secondAmplitude = Number(elements.b.value);
  const phase = Number(elements.phase.value);
  const harmonics = Math.round(Number(elements.n.value));
  elements.omegaValue.value = formatNumber(omega, 3);
  elements.omegaValue.textContent = formatNumber(omega, 3);
  elements.aValue.value = formatNumber(amplitude, 3);
  elements.aValue.textContent = formatNumber(amplitude, 3);
  elements.bValue.value = formatNumber(secondAmplitude, 3);
  elements.bValue.textContent = formatNumber(secondAmplitude, 3);
  elements.phaseValue.value = `${formatNumber(phase / Math.PI, 2)}π`;
  elements.phaseValue.textContent = `${formatNumber(phase / Math.PI, 2)}π`;
  elements.nValue.value = String(harmonics);
  elements.nValue.textContent = String(harmonics);
  elements.omega.setAttribute("aria-valuetext", `${formatNumber(omega, 3)} radians per unit time`);
  elements.a.setAttribute("aria-valuetext", formatNumber(amplitude, 3));
  elements.b.setAttribute("aria-valuetext", formatNumber(secondAmplitude, 3));
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
  updateParameterOutputs();
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
  makeParticle(state.selectedAngle, { ambient: false });
  if (options.announce !== false) announce("Trajectories restarted from angles around the circle.");
}

function addParticle(angle, options = {}) {
  state.selectedAngle = wrapAngle(angle);
  const particle = makeParticle(state.selectedAngle, { ambient: false });
  if (state.particles.length > 18) {
    const removable = state.particles.findIndex((entry) => entry.id !== particle.id && entry.ambient);
    state.particles.splice(removable >= 0 ? removable : 0, 1);
  }
  updateSelectedReadout();
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
  return "neutral";
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
  if (regime === "stationary") {
    elements.regimeNoteKicker.textContent = "Degenerate stationary flow";
    elements.regimeNoteCopy.textContent = "The vector field vanishes everywhere, so every initial angle is a constant solution.";
  } else if (regime === "threshold") {
    elements.regimeNoteKicker.textContent = "Saddle-node threshold";
    elements.regimeNoteCopy.textContent = "A stable and unstable equilibrium have just met. Motion approaches the contact from one side and leaves on the other.";
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
  const regimeLabels = {
    stationary: "Every point fixed",
    locked: elements.familySelect.value === "firefly-locking" ? "Phase locked" : "Locked",
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
  elements.telemetryFrequency.textContent = regime === "rotating" ? formatNumber(meanFrequency, 3) : regime === "stationary" ? "—" : "0 (locked)";
  elements.stageStatus.textContent = Number.isFinite(period)
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
  updateEquilibriumList();
  updateTelemetry();
  updateRegimeCopy();
  if (options.resetParticles) resetParticles({ announce: false });
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
  context.fillText("f(θ)", box.left + 5, box.top + 13);
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

function liftedRange(recentTrails) {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const trail of recentTrails) {
    for (const point of trail) {
      minimum = Math.min(minimum, point.lifted);
      maximum = Math.max(maximum, point.lifted);
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    minimum = 0;
    maximum = TWO_PI;
  }
  const padding = Math.max(0.25, (maximum - minimum) * 0.08);
  minimum -= padding;
  maximum += padding;
  if (maximum - minimum < TWO_PI * 0.75) {
    const center = (minimum + maximum) / 2;
    minimum = center - TWO_PI * 0.375;
    maximum = center + TWO_PI * 0.375;
  }
  return [minimum, maximum];
}

function drawLiftedFlow() {
  if (!state.flow) return;
  const { context, width, height } = canvasSurface(elements.liftCanvas);
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);

  const phaseY = height - 54;
  const lineLeft = 46;
  const lineRight = width - 18;
  state.liftPhaseLine = { left: lineLeft, right: lineRight, y: phaseY };
  const graph = {
    left: lineLeft,
    right: lineRight,
    top: 17,
    bottom: Math.max(74, phaseY - 39)
  };
  const timeSpan = 8;
  const startTime = Math.max(0, state.elapsed - timeSpan);
  const endTime = Math.max(startTime + 0.001, state.elapsed);
  const recentTrails = state.particles.map((particle) => particle.trail.filter((point) => point.t >= startTime));
  const [liftMinimum, liftMaximum] = liftedRange(recentTrails);

  const mapTime = (time) => lerp(graph.left, graph.right, inverseLerp(startTime, endTime, time));
  const mapLift = (lift) => lerp(graph.bottom, graph.top, inverseLerp(liftMinimum, liftMaximum, lift));

  context.save();
  context.beginPath();
  context.rect(graph.left, graph.top, graph.right - graph.left, graph.bottom - graph.top);
  context.clip();
  const firstTurn = Math.ceil(liftMinimum / TWO_PI);
  const lastTurn = Math.floor(liftMaximum / TWO_PI);
  context.font = "9px 'IBM Plex Mono', monospace";
  for (let turn = firstTurn; turn <= lastTurn; turn += 1) {
    const y = mapLift(turn * TWO_PI);
    context.strokeStyle = "rgba(11, 87, 72, 0.14)";
    context.setLineDash([3, 5]);
    context.beginPath();
    context.moveTo(graph.left, y);
    context.lineTo(graph.right, y);
    context.stroke();
    context.fillStyle = "rgba(71, 92, 84, 0.68)";
    context.textAlign = "left";
    context.fillText(`${turn} turn${Math.abs(turn) === 1 ? "" : "s"}`, graph.left + 4, y - 4);
  }
  context.setLineDash([]);

  if (elements.showEquilibriumParticles.checked && state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      const minCopy = Math.floor((liftMinimum - equilibrium.angle) / TWO_PI) - 1;
      const maxCopy = Math.ceil((liftMaximum - equilibrium.angle) / TWO_PI) + 1;
      for (let copy = minCopy; copy <= maxCopy; copy += 1) {
        const lift = equilibrium.angle + copy * TWO_PI;
        if (lift < liftMinimum || lift > liftMaximum) continue;
        const y = mapLift(lift);
        context.strokeStyle = equilibrium.stability === "stable"
          ? "rgba(11, 87, 72, 0.20)"
          : equilibrium.stability === "unstable"
            ? "rgba(168, 79, 36, 0.18)"
            : "rgba(138, 98, 0, 0.24)";
        context.setLineDash(equilibrium.stability === "stable" ? [] : [4, 5]);
        context.beginPath();
        context.moveTo(graph.left, y);
        context.lineTo(graph.right, y);
        context.stroke();
      }
    }
  }

  if (elements.showTrails.checked) {
    recentTrails.forEach((trail, particleIndex) => {
      if (trail.length < 2) return;
      context.strokeStyle = particleIndex === recentTrails.length - 1
        ? "rgba(138, 98, 0, 0.88)"
        : "rgba(11, 87, 72, 0.48)";
      context.lineWidth = particleIndex === recentTrails.length - 1 ? 2 : 1.2;
      context.lineJoin = "round";
      context.beginPath();
      trail.forEach((point, index) => {
        const x = mapTime(point.t);
        const y = mapLift(point.lifted);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(23, 33, 29, 0.25)";
  context.lineWidth = 1;
  context.strokeRect(graph.left, graph.top, graph.right - graph.left, graph.bottom - graph.top);
  context.fillStyle = COLORS.muted;
  context.font = "9px 'IBM Plex Mono', monospace";
  context.textAlign = "left";
  context.fillText("lift Θ(t)", graph.left + 4, graph.top + 11);
  context.fillText(`${formatNumber(startTime, 1)} s`, graph.left, graph.bottom + 12);
  context.textAlign = "right";
  context.fillText(`${formatNumber(endTime, 1)} s`, graph.right, graph.bottom + 12);
  context.restore();

  context.save();
  context.strokeStyle = "rgba(23, 33, 29, 0.45)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(lineLeft, phaseY);
  context.lineTo(lineRight, phaseY);
  context.stroke();
  context.strokeStyle = "rgba(138, 98, 0, 0.58)";
  context.setLineDash([3, 4]);
  context.beginPath();
  context.moveTo(lineLeft, phaseY - 17);
  context.lineTo(lineLeft, phaseY + 15);
  context.moveTo(lineRight, phaseY - 17);
  context.lineTo(lineRight, phaseY + 15);
  context.stroke();
  context.restore();

  if (elements.showArrows.checked) {
    const arrowCount = Math.max(8, Math.min(15, Math.round((lineRight - lineLeft) / 35)));
    for (let index = 0; index < arrowCount; index += 1) {
      const angle = TWO_PI * (index + 0.5) / arrowCount;
      const velocity = evaluateFlow(state.flow, angle);
      if (Math.abs(velocity) < state.maximumVelocity * 0.012) continue;
      const center = lerp(lineLeft, lineRight, angle / TWO_PI);
      const sign = Math.sign(velocity);
      const length = 7 + 14 * Math.min(1, Math.abs(velocity) / state.maximumVelocity);
      drawArrow(
        context,
        center - sign * length * 0.5,
        phaseY,
        center + sign * length * 0.5,
        phaseY,
        velocity >= 0 ? COLORS.forest : COLORS.rust,
        1.25,
        4
      );
    }
  }

  if (state.analysis.equilibriumCount !== Infinity) {
    for (const equilibrium of state.analysis.equilibria) {
      const x = lerp(lineLeft, lineRight, equilibrium.angle / TWO_PI);
      drawEquilibriumMarker(context, x, phaseY, equilibrium, { dark: false, radius: 5.7 });
      if (elements.showEquilibriumParticles.checked) drawParticle(context, x, phaseY, 2.35, 0.7);
    }
  }

  for (const particle of state.particles) {
    const angle = wrapAngle(particle.lifted);
    const x = lerp(lineLeft, lineRight, angle / TWO_PI);
    drawParticle(context, x, phaseY + particle.lane * 0.35, particle.ambient ? 2.8 : 4.2, particle.ambient ? 0.72 : 1);
    const seamDistance = Math.min(angle, TWO_PI - angle);
    if (seamDistance < 0.08) {
      const ghostX = angle < 0.08 ? lineRight : lineLeft;
      drawParticle(context, ghostX, phaseY + particle.lane * 0.35, 2.6, 0.3);
    }
  }

  const selectedX = lerp(lineLeft, lineRight, state.selectedAngle / TWO_PI);
  context.save();
  context.strokeStyle = COLORS.goldDark;
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(selectedX, phaseY - 17);
  context.lineTo(selectedX, phaseY + 17);
  context.stroke();
  context.fillStyle = COLORS.goldDark;
  context.beginPath();
  context.moveTo(selectedX, phaseY - 21);
  context.lineTo(selectedX - 4, phaseY - 28);
  context.lineTo(selectedX + 4, phaseY - 28);
  context.closePath();
  context.fill();
  context.restore();
}

function drawAll() {
  drawCirclePortrait();
  drawVelocityGraph();
  drawLiftedFlow();
  elements.elapsedTime.textContent = formatNumber(state.elapsed, 1);
  elements.lapCount.textContent = String(state.totalLaps);
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

function syncParameterPlayButton() {
  elements.playOmega.setAttribute("aria-pressed", String(state.parameterPlaying));
  elements.playOmega.setAttribute("aria-label", state.parameterPlaying ? "Pause the main parameter animation" : "Animate the main parameter");
  const icon = elements.playOmega.querySelector("span");
  if (icon) icon.textContent = state.parameterPlaying ? "Ⅱ" : "▶";
}

function toggleParameterPlay() {
  state.parameterPlaying = !state.parameterPlaying;
  syncParameterPlayButton();
  announce(state.parameterPlaying ? "Main parameter animation started." : "Main parameter animation paused.");
}

function updateParameterSweep(delta) {
  if (!state.parameterPlaying || delta <= 0) return;
  const minimum = Number(elements.omega.min);
  const maximum = Number(elements.omega.max);
  const span = maximum - minimum;
  let next = Number(elements.omega.value) + state.parameterDirection * span * delta / 9;
  if (next >= maximum) {
    next = maximum;
    state.parameterDirection = -1;
  } else if (next <= minimum) {
    next = minimum;
    state.parameterDirection = 1;
  }
  elements.omega.value = String(next);
  state.parameterAccumulator += delta;
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
  if (canvas === elements.liftCanvas && state.liftPhaseLine) {
    return wrapAngle(TWO_PI * clamp(
      inverseLerp(state.liftPhaseLine.left, state.liftPhaseLine.right, position.x),
      0,
      1
    ));
  }
  return state.selectedAngle;
}

function beginCanvasPointer(canvas, event) {
  if (event.button !== 0 || event.isPrimary === false) return;
  canvas.focus({ preventScroll: true });
  state.pointer = { canvas, pointerId: event.pointerId, moved: false };
  state.selectedAngle = angleFromCanvas(canvas, event);
  updateSelectedReadout();
  canvas.dataset.dragging = "true";
  canvas.setPointerCapture?.(event.pointerId);
}

function moveCanvasPointer(canvas, event) {
  if (!state.pointer || state.pointer.canvas !== canvas || state.pointer.pointerId !== event.pointerId) return;
  state.pointer.moved = true;
  state.selectedAngle = angleFromCanvas(canvas, event);
  updateSelectedReadout();
}

function endCanvasPointer(canvas, event) {
  if (!state.pointer || state.pointer.canvas !== canvas || state.pointer.pointerId !== event.pointerId) return;
  state.selectedAngle = angleFromCanvas(canvas, event);
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
    state.parameterPlaying = false;
    syncParameterPlayButton();
    configureFamilyControls(elements.familySelect.value, true);
    refreshFlow({ resetParticles: true, announce: true });
  });
  [elements.omega, elements.a, elements.b, elements.phase, elements.n].forEach((input) => {
    input.addEventListener("input", () => scheduleFlowRefresh());
    input.addEventListener("change", () => {
      refreshFlow();
      announce(`${input.previousElementSibling?.textContent?.trim() || "Parameter"} set to ${input.getAttribute("aria-valuetext") || input.value}.`);
    });
  });
  elements.playOmega.addEventListener("click", toggleParameterPlay);
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
  motionQuery.addEventListener?.("change", (event) => {
    if (event.matches) {
      state.running = false;
      state.parameterPlaying = false;
      syncAnimationButton();
      syncParameterPlayButton();
      announce("Motion paused because reduced motion is enabled.");
    }
  });
}

function animate(now) {
  const delta = Math.min(0.06, Math.max(0, (now - state.lastFrameTime) / 1000));
  state.lastFrameTime = now;
  updateParameterSweep(delta);
  updateParticles(delta);
  if (!document.hidden && now - state.lastRenderTime >= 30) {
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
  syncParameterPlayButton();
  installEvents();
  if (elements.fullscreenToggle) elements.fullscreenToggle.hidden = !fullscreenSupported();
  syncFullscreen({ announce: false });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(drawAll);
    observer.observe(elements.circleCanvas);
    observer.observe(elements.velocityCanvas);
    observer.observe(elements.liftCanvas);
  }
  announce(`${state.flow.name} loaded. ${state.running ? "Particles are moving." : "Motion is paused for reduced motion."}`);
  window.requestAnimationFrame(animate);
}

initialize();
