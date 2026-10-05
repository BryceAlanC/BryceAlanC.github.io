import {
  PRESET_IDS,
  PRESETS,
  createPreset,
  equilibriaAt,
  cyclesAt,
  integrateTrajectory,
  sampleBranches
} from "./model.js?v=20261005-1";

const COLORS = Object.freeze({
  ink: "#17211d",
  muted: "#53615c",
  paper: "#f5f1e7",
  plot: "#071c18",
  plotSoft: "#0b2822",
  gridDark: "rgba(231, 246, 241, 0.10)",
  gridLight: "rgba(23, 33, 29, 0.10)",
  axisDark: "rgba(231, 246, 241, 0.46)",
  axisLight: "rgba(23, 33, 29, 0.44)",
  textDark: "#e7f0ec",
  stable: "#0b6f60",
  stableBright: "#79d8c5",
  unstable: "#9c4528",
  unstableBright: "#f0b18b",
  saddle: "#7655a6",
  current: "#8a6200",
  currentBright: "#f2c969",
  nullclineX: "#79d8c5",
  nullclineY: "#f0b18b",
  traceX: "#0b6f60",
  traceY: "#7655a6"
});

const elements = {
  workspace: document.getElementById("planar-workspace"),
  familySelect: document.getElementById("family-select"),
  familyTitle: document.getElementById("family-title"),
  familyEquations: document.getElementById("family-equations"),
  familyNote: document.getElementById("family-note"),
  parameter: document.getElementById("parameter-r"),
  parameterValue: document.getElementById("parameter-r-value"),
  toggleSweep: document.getElementById("toggle-sweep"),
  centerParameter: document.getElementById("center-parameter"),
  sweepSpeed: document.getElementById("sweep-speed"),
  sweepSpeedValue: document.getElementById("sweep-speed-value"),
  initialX: document.getElementById("initial-x"),
  initialY: document.getElementById("initial-y"),
  addInitialCondition: document.getElementById("add-initial-condition"),
  toggleTrajectories: document.getElementById("toggle-trajectories"),
  restartTrajectories: document.getElementById("restart-trajectories"),
  stepTrajectories: document.getElementById("step-trajectories"),
  showVectorField: document.getElementById("show-vector-field"),
  showNullclines: document.getElementById("show-nullclines"),
  showTrajectories: document.getElementById("show-trajectories"),
  resetViews: document.getElementById("reset-views"),
  objectSelect: document.getElementById("object-select"),
  objectList: document.getElementById("object-list"),
  eventList: document.getElementById("event-list"),
  selectedObjectSummary: document.getElementById("selected-object-summary"),
  fullscreenToggle: document.getElementById("workspace-fullscreen-toggle"),
  fullscreenLabel: document.getElementById("workspace-fullscreen-label"),
  stageStatus: document.getElementById("stage-status"),
  telemetryFamily: document.getElementById("telemetry-family"),
  telemetryR: document.getElementById("telemetry-r"),
  telemetryObject: document.getElementById("telemetry-object"),
  telemetryEvent: document.getElementById("telemetry-event"),
  phaseParameterLabel: document.getElementById("phase-parameter-label"),
  bifurcationObservableLabel: document.getElementById("bifurcation-observable-label"),
  stabilityObjectLabel: document.getElementById("stability-object-label"),
  linearizationTitle: document.getElementById("linearization-title"),
  jacobianMatrix: document.getElementById("jacobian-matrix"),
  spectralQuantityLabel: document.getElementById("spectral-quantity-label"),
  eigenvalueFormula: document.getElementById("eigenvalue-formula"),
  traceLabel: document.getElementById("trace-label"),
  traceValue: document.getElementById("trace-value"),
  determinantLabel: document.getElementById("determinant-label"),
  determinantValue: document.getElementById("determinant-value"),
  classificationValue: document.getElementById("classification-value"),
  timeTraceLabel: document.getElementById("time-trace-label"),
  trajectorySummary: document.getElementById("trajectory-summary"),
  phaseZoomIn: document.getElementById("phase-zoom-in"),
  phaseZoomOut: document.getElementById("phase-zoom-out"),
  phasePanLeft: document.getElementById("phase-pan-left"),
  phasePanRight: document.getElementById("phase-pan-right"),
  phasePanUp: document.getElementById("phase-pan-up"),
  phasePanDown: document.getElementById("phase-pan-down"),
  phaseFit: document.getElementById("phase-fit"),
  bifurcationZoomIn: document.getElementById("bifurcation-zoom-in"),
  bifurcationZoomOut: document.getElementById("bifurcation-zoom-out"),
  bifurcationPanLeft: document.getElementById("bifurcation-pan-left"),
  bifurcationPanRight: document.getElementById("bifurcation-pan-right"),
  bifurcationPanUp: document.getElementById("bifurcation-pan-up"),
  bifurcationPanDown: document.getElementById("bifurcation-pan-down"),
  bifurcationFit: document.getElementById("bifurcation-fit"),
  announcer: document.getElementById("planar-announcer"),
  phaseCanvas: document.getElementById("phase-canvas"),
  bifurcationCanvas: document.getElementById("bifurcation-canvas"),
  eigenvalueCanvas: document.getElementById("eigenvalue-canvas"),
  timeCanvas: document.getElementById("time-canvas")
};

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const FAMILY_ALIASES = Object.freeze({
  "cycle-fold": "fold-cycles",
  "pitchfork-subcritical": "pitchfork"
});
const state = {
  family: null,
  parameter: 0,
  equilibria: [],
  cycles: [],
  branchDiagram: null,
  objects: [],
  selectedObjectId: null,
  selectedTrajectoryId: null,
  userSeeds: [],
  trajectories: [],
  trajectorySerial: 0,
  trajectoriesPaused: motionQuery.matches,
  sweepRunning: false,
  sweepDirection: 1,
  sweepSpeed: Number(elements.sweepSpeed?.value || 0.35),
  phaseFullView: null,
  phaseView: null,
  bifurcationFullView: null,
  bifurcationView: null,
  phaseBox: null,
  bifurcationBox: null,
  eigenvalueBox: null,
  timeBox: null,
  phaseCursor: { x: 0.8, y: 0.2 },
  phasePointer: null,
  bifurcationPointer: null,
  phaseCache: null,
  animationTime: 0,
  lastFrameTime: performance.now(),
  lastRenderTime: 0,
  lastTrajectoryRefresh: 0,
  trajectoryRefreshPending: false,
  fullscreenActive: false,
  fullscreenInitialized: false
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function inverseLerp(start, end, value) {
  return end === start ? 0 : (value - start) / (end - start);
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  const clean = Math.abs(value) < 10 ** (-(digits + 1)) ? 0 : value;
  if (Math.abs(clean) >= 1000 || (Math.abs(clean) > 0 && Math.abs(clean) < 0.001)) {
    return clean.toExponential(2).replace("e+", "e").replace("-0.00", "0.00");
  }
  return clean.toFixed(digits).replace(/^-0(?=\.0+$)/, "0");
}

function formatSigned(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${formatNumber(Math.abs(value), digits)}`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function announce(message) {
  window.clearTimeout(announce.timeout);
  announce.timeout = window.setTimeout(() => {
    if (elements.announcer) elements.announcer.textContent = message;
  }, 160);
}

function normalizeFamilyId(id) {
  return FAMILY_ALIASES[id] || id;
}

function canvasSurface(canvas) {
  const rectangle = canvas.getBoundingClientRect();
  const width = Math.max(1, rectangle.width);
  const height = Math.max(1, rectangle.height);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function plotRectangle(width, height, compact = false) {
  return {
    left: compact ? 38 : 48,
    right: width - (compact ? 15 : 20),
    top: compact ? 17 : 22,
    bottom: height - (compact ? 30 : 38)
  };
}

function mapHorizontal(value, range, box) {
  return lerp(box.left, box.right, inverseLerp(range[0], range[1], value));
}

function mapVertical(value, range, box) {
  return lerp(box.bottom, box.top, inverseLerp(range[0], range[1], value));
}

function valueFromHorizontal(pixel, range, box) {
  return lerp(range[0], range[1], inverseLerp(box.left, box.right, pixel));
}

function valueFromVertical(pixel, range, box) {
  return lerp(range[0], range[1], inverseLerp(box.bottom, box.top, pixel));
}

function niceTicks(minimum, maximum, desired = 5) {
  const span = Math.max(1e-12, maximum - minimum);
  const raw = span / desired;
  const exponent = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / exponent;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * exponent;
  const ticks = [];
  for (let value = Math.ceil(minimum / step) * step; value <= maximum + step * 0.1; value += step) {
    ticks.push(Math.abs(value) < step * 1e-8 ? 0 : value);
  }
  return ticks;
}

function drawAxes(context, box, xRange, yRange, options = {}) {
  const dark = Boolean(options.dark);
  context.save();
  context.font = "11px 'IBM Plex Mono', monospace";
  context.lineWidth = 1;
  context.textBaseline = "top";
  for (const value of niceTicks(xRange[0], xRange[1], options.xTicks || 5)) {
    const x = mapHorizontal(value, xRange, box);
    context.strokeStyle = dark ? COLORS.gridDark : COLORS.gridLight;
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
    context.fillStyle = dark ? "rgba(231,246,241,.70)" : COLORS.muted;
    context.textAlign = "center";
    context.fillText(formatNumber(value, Math.abs(value) < 10 ? 1 : 0), x, box.bottom + 8);
  }
  context.textBaseline = "middle";
  for (const value of niceTicks(yRange[0], yRange[1], options.yTicks || 5)) {
    const y = mapVertical(value, yRange, box);
    context.strokeStyle = dark ? COLORS.gridDark : COLORS.gridLight;
    context.beginPath();
    context.moveTo(box.left, y);
    context.lineTo(box.right, y);
    context.stroke();
    context.fillStyle = dark ? "rgba(231,246,241,.70)" : COLORS.muted;
    context.textAlign = "right";
    context.fillText(formatNumber(value, Math.abs(value) < 10 ? 1 : 0), box.left - 7, y);
  }
  context.strokeStyle = dark ? COLORS.axisDark : COLORS.axisLight;
  context.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  if (options.xLabel) {
    context.fillStyle = dark ? COLORS.textDark : COLORS.ink;
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillText(options.xLabel, box.right, box.bottom - 5);
  }
  context.restore();
}

function pointInBox(point, box) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function pointerPosition(canvas, event) {
  const rectangle = canvas.getBoundingClientRect();
  return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
}

function currentPhaseRanges() {
  return {
    x: [state.phaseView.xMin, state.phaseView.xMax],
    y: [state.phaseView.yMin, state.phaseView.yMax]
  };
}

function currentBifurcationRanges() {
  return {
    parameter: [state.bifurcationView.rMin, state.bifurcationView.rMax],
    observable: [state.bifurcationView.oMin, state.bifurcationView.oMax]
  };
}

function defaultInitialConditions() {
  const xRange = state.family.phaseWindow.x;
  const yRange = state.family.phaseWindow.y;
  const xCenter = (xRange[0] + xRange[1]) / 2;
  const yCenter = (yRange[0] + yRange[1]) / 2;
  const radiusX = (xRange[1] - xRange[0]) * 0.36;
  const radiusY = (yRange[1] - yRange[0]) * 0.36;
  const seeds = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = 2 * Math.PI * index / 10 + 0.17;
    const factor = index % 2 ? 0.58 : 1;
    seeds.push({
      x: xCenter + radiusX * factor * Math.cos(angle),
      y: yCenter + radiusY * factor * Math.sin(angle),
      user: false
    });
  }
  return seeds;
}

function integrationBounds() {
  const xRange = state.family.phaseWindow.x;
  const yRange = state.family.phaseWindow.y;
  const xPadding = (xRange[1] - xRange[0]) * 0.42;
  const yPadding = (yRange[1] - yRange[0]) * 0.42;
  return {
    x: [xRange[0] - xPadding, xRange[1] + xPadding],
    y: [yRange[0] - yPadding, yRange[1] + yPadding]
  };
}

function trajectoryDuration() {
  if (state.family.id === "snic") {
    const nearestPeriod = state.cycles[0]?.period;
    return Number.isFinite(nearestPeriod) ? clamp(nearestPeriod * 2.2, 18, 70) : 32;
  }
  return state.family.id.includes("hopf") || state.family.id === "fold-cycles" ? 28 : 15;
}

function makeTrajectory(seed, previous = null) {
  const result = integrateTrajectory(state.family, {
    initial: [seed.x, seed.y],
    parameter: state.parameter,
    dt: 0.018,
    duration: trajectoryDuration(),
    bounds: integrationBounds(),
    maxRadius: 40,
    sampleEvery: 2
  });
  const previousFraction = previous && previous.points.length > 1
    ? previous.progress / (previous.points.length - 1)
    : 0;
  return {
    id: previous?.id || `trajectory-${++state.trajectorySerial}`,
    seed: { x: seed.x, y: seed.y, user: Boolean(seed.user) },
    points: result.points,
    status: result.status,
    progress: clamp(Math.round(previousFraction * Math.max(0, result.points.length - 1)), 0, Math.max(0, result.points.length - 1)),
    phase: previous?.phase ?? ((state.trajectorySerial * 37) % 100) / 100
  };
}

function rebuildTrajectories(options = {}) {
  if (!state.family) return;
  const seeds = [...defaultInitialConditions(), ...state.userSeeds];
  const previousBySeed = state.trajectories;
  state.trajectories = seeds.map((seed, index) => makeTrajectory(seed, options.preserveProgress ? previousBySeed[index] : null));
  if (!state.selectedTrajectoryId || !state.trajectories.some((trajectory) => trajectory.id === state.selectedTrajectoryId)) {
    state.selectedTrajectoryId = state.trajectories.at(-1)?.id || null;
  }
  state.trajectoryRefreshPending = false;
  drawTimeTrace();
}

function requestTrajectoryRefresh(options = {}) {
  state.trajectoryRefreshPending = true;
  if (options.immediate) {
    rebuildTrajectories({ preserveProgress: options.preserveProgress });
    state.lastTrajectoryRefresh = performance.now();
  }
}

function updateTrajectoryProgress(delta) {
  if (state.trajectoriesPaused || !elements.showTrajectories?.checked) return;
  for (const trajectory of state.trajectories) {
    if (trajectory.points.length < 2) continue;
    const increment = delta / 0.036;
    trajectory.progress += increment;
    if (trajectory.progress >= trajectory.points.length - 1) {
      trajectory.progress = trajectory.phase * Math.min(20, trajectory.points.length - 1);
    }
  }
}

function stepTrajectories() {
  state.trajectoriesPaused = true;
  syncTrajectoryButton();
  for (const trajectory of state.trajectories) {
    trajectory.progress = Math.min(trajectory.points.length - 1, trajectory.progress + 8);
  }
  drawPhasePortrait();
  drawTimeTrace();
  announce("Trajectories advanced one numerical step group.");
}

function setTrajectoryPaused(paused, options = {}) {
  state.trajectoriesPaused = Boolean(paused);
  syncTrajectoryButton();
  if (options.announce !== false) {
    announce(state.trajectoriesPaused ? "Trajectory motion paused." : "Trajectory motion resumed.");
  }
}

function syncTrajectoryButton() {
  if (!elements.toggleTrajectories) return;
  elements.toggleTrajectories.textContent = state.trajectoriesPaused ? "Resume trajectories" : "Pause trajectories";
}

function objectLabel(object) {
  if (object.kind === "equilibrium") {
    return `${object.shortLabel} · ${classificationText(object.data.type)}`;
  }
  const cycleStability = object.data.stability === "stable"
    ? "Attracting"
    : object.data.stability === "unstable" ? "Repelling" : titleCase(object.data.stability);
  return `${object.shortLabel} · ${cycleStability} periodic orbit`;
}

function objectDescription(object) {
  if (object.kind === "equilibrium") {
    return `Equilibrium at (${formatNumber(object.data.x)}, ${formatNumber(object.data.y)})`;
  }
  const period = Number.isFinite(object.data.period) ? `, period ${formatNumber(object.data.period, 2)}` : "";
  return `Periodic orbit of radius ${formatNumber(object.data.radius)}${period}`;
}

function refreshObjects(options = {}) {
  const previous = options.preferredId || state.selectedObjectId;
  state.objects = [
    ...state.equilibria.map((equilibrium, index) => ({
      id: `equilibrium-${index}`,
      shortLabel: `E${index + 1}`,
      kind: "equilibrium",
      data: equilibrium
    })),
    ...state.cycles.map((cycle, index) => ({
      id: `cycle-${index}`,
      shortLabel: `P${index + 1}`,
      kind: "cycle",
      data: cycle
    }))
  ];
  state.selectedObjectId = state.objects.some((object) => object.id === previous)
    ? previous
    : state.objects[0]?.id || null;

  if (elements.objectSelect) {
    elements.objectSelect.replaceChildren();
    for (const object of state.objects) {
      const option = document.createElement("option");
      option.value = object.id;
      option.textContent = `${objectLabel(object)} · ${objectDescription(object)}`;
      elements.objectSelect.append(option);
    }
    if (!state.objects.length) {
      const option = document.createElement("option");
      option.textContent = "No invariant object in the current window";
      option.value = "";
      elements.objectSelect.append(option);
    }
    elements.objectSelect.value = state.selectedObjectId || "";
  }

  if (elements.objectList) {
    elements.objectList.replaceChildren();
    for (const object of state.objects) {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = objectLabel(object);
      span.textContent = objectDescription(object);
      item.append(strong, span);
      elements.objectList.append(item);
    }
    if (!state.cycles.length) {
      const item = document.createElement("li");
      item.textContent = "No periodic orbit detected in the current window.";
      elements.objectList.append(item);
    }
    if (!state.objects.length) {
      const item = document.createElement("li");
      item.textContent = "No equilibrium or periodic orbit lies in the current window.";
      elements.objectList.append(item);
    }
  }
  updateSelectedObjectPanels();
}

function selectedObject() {
  return state.objects.find((object) => object.id === state.selectedObjectId) || null;
}

function selectObject(id, options = {}) {
  if (!state.objects.some((object) => object.id === id)) return;
  state.selectedObjectId = id;
  if (elements.objectSelect) elements.objectSelect.value = id;
  updateSelectedObjectPanels();
  drawPhasePortrait();
  drawEigenvaluePlane();
  if (options.announce !== false) {
    const object = selectedObject();
    announce(`${objectLabel(object)} selected. ${objectDescription(object)}.`);
  }
}

function classificationText(type) {
  const labels = {
    "stable-node": "Attracting node",
    "unstable-node": "Repelling node",
    "stable-focus": "Attracting focus",
    "unstable-focus": "Repelling focus",
    saddle: "Saddle",
    nonhyperbolic: "Nonhyperbolic equilibrium"
  };
  return labels[type] || titleCase(type);
}

function formatEigenvalue(value) {
  if (!value) return "—";
  if (Math.abs(value.im) < 1e-9) return formatNumber(value.re);
  return `${formatNumber(value.re)} ${value.im >= 0 ? "+" : "−"} ${formatNumber(Math.abs(value.im))}i`;
}

function formatEigenvalues(values) {
  if (!values?.length) return "—";
  if (values.length === 2 && Math.abs(values[0].re - values[1].re) < 1e-8 && Math.abs(values[0].im + values[1].im) < 1e-8 && Math.abs(values[0].im) > 1e-9) {
    return `${formatNumber(values[0].re)} ± ${formatNumber(Math.abs(values[0].im))}i`;
  }
  return values.map((value, index) => `λ${index + 1} = ${formatEigenvalue(value)}`).join(", ");
}

function updateSelectedObjectPanels() {
  const object = selectedObject();
  const summaryStrong = elements.selectedObjectSummary?.querySelector("strong");
  if (!object) {
    if (summaryStrong) summaryStrong.textContent = "No invariant object selected";
    if (elements.telemetryObject) elements.telemetryObject.textContent = "None";
    if (elements.stabilityObjectLabel) elements.stabilityObjectLabel.textContent = "No equilibrium selected";
    if (elements.linearizationTitle) elements.linearizationTitle.textContent = "Jacobian";
    if (elements.jacobianMatrix) elements.jacobianMatrix.textContent = "J = —";
    if (elements.spectralQuantityLabel) elements.spectralQuantityLabel.textContent = "Eigenvalues";
    if (elements.eigenvalueFormula) elements.eigenvalueFormula.textContent = "—";
    if (elements.traceLabel) elements.traceLabel.textContent = "Trace";
    if (elements.traceValue) elements.traceValue.textContent = "—";
    if (elements.determinantLabel) elements.determinantLabel.textContent = "Determinant";
    if (elements.determinantValue) elements.determinantValue.textContent = "—";
    if (elements.classificationValue) elements.classificationValue.textContent = "No local classification";
    drawEigenvaluePlane();
    return;
  }
  if (summaryStrong) summaryStrong.textContent = `${objectLabel(object)} · ${objectDescription(object)}`;
  if (elements.telemetryObject) elements.telemetryObject.textContent = object.shortLabel;
  if (elements.stabilityObjectLabel) elements.stabilityObjectLabel.textContent = `${object.shortLabel} · ${object.kind === "equilibrium" ? "equilibrium" : "periodic orbit"}`;
  if (object.kind === "cycle") {
    if (elements.linearizationTitle) elements.linearizationTitle.textContent = "Orbit data";
    if (elements.jacobianMatrix) elements.jacobianMatrix.textContent = "J varies along the periodic orbit";
    const multiplier = Number.isFinite(object.data.period)
      ? Math.exp(object.data.radialDerivative * object.data.period)
      : NaN;
    if (elements.spectralQuantityLabel) elements.spectralQuantityLabel.textContent = "Period";
    if (elements.eigenvalueFormula) elements.eigenvalueFormula.textContent = Number.isFinite(object.data.period)
      ? formatNumber(object.data.period, 3)
      : "Diverges at onset";
    if (elements.traceLabel) elements.traceLabel.textContent = "Floquet multiplier";
    if (elements.traceValue) elements.traceValue.textContent = Number.isFinite(multiplier)
      ? formatNumber(multiplier, 3)
      : "—";
    if (elements.determinantLabel) elements.determinantLabel.textContent = "Radial rate";
    if (elements.determinantValue) elements.determinantValue.textContent = formatNumber(object.data.radialDerivative, 3);
    if (elements.classificationValue) {
      const stability = object.data.stability === "stable"
        ? "Attracting"
        : object.data.stability === "unstable" ? "Repelling" : titleCase(object.data.stability);
      elements.classificationValue.textContent = `${stability} periodic orbit`;
    }
  } else {
    if (elements.linearizationTitle) elements.linearizationTitle.textContent = `Jacobian at ${object.shortLabel}`;
    const matrix = object.data.jacobian;
    const classification = object.data.classification;
    if (elements.jacobianMatrix) {
      elements.jacobianMatrix.textContent = `J = [ ${formatNumber(matrix[0][0])}  ${formatNumber(matrix[0][1])} ; ${formatNumber(matrix[1][0])}  ${formatNumber(matrix[1][1])} ]`;
    }
    if (elements.spectralQuantityLabel) elements.spectralQuantityLabel.textContent = "Eigenvalues";
    if (elements.eigenvalueFormula) elements.eigenvalueFormula.textContent = formatEigenvalues(object.data.eigenvalues);
    if (elements.traceLabel) elements.traceLabel.textContent = "Trace";
    if (elements.traceValue) elements.traceValue.textContent = formatNumber(classification.trace);
    if (elements.determinantLabel) elements.determinantLabel.textContent = "Determinant";
    if (elements.determinantValue) elements.determinantValue.textContent = formatNumber(classification.determinant);
    if (elements.classificationValue) elements.classificationValue.textContent = classificationText(object.data.type);
  }
  drawEigenvaluePlane();
}

function updateFamilyCopy() {
  if (elements.familyTitle) elements.familyTitle.textContent = state.family.name;
  if (elements.familyEquations) {
    elements.familyEquations.replaceChildren();
    const equation = document.createElement("code");
    equation.textContent = state.family.formula.replaceAll("μ", "r");
    elements.familyEquations.append(equation);
    if (state.family.polarFormula) {
      const polar = document.createElement("code");
      polar.textContent = state.family.polarFormula.replaceAll("μ", "r");
      elements.familyEquations.append(polar);
    }
  }
  if (elements.familyNote) {
    elements.familyNote.textContent = `${state.family.description} ${state.family.lesson}`.trim();
  }
  if (elements.telemetryFamily) elements.telemetryFamily.textContent = state.family.shortName;
  if (elements.bifurcationObservableLabel) elements.bifurcationObservableLabel.textContent = `Vertical axis: ${state.family.observableLabel}`;
  if (elements.eventList) {
    elements.eventList.replaceChildren();
    for (const event of state.family.criticalValues) {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = `${event.label} · r = ${formatNumber(event.parameter)}`;
      span.textContent = `${titleCase(event.scope)} event · ${event.genericity}`;
      item.append(strong, span);
      elements.eventList.append(item);
    }
  }
}

function nearestEvent() {
  if (!state.family?.criticalValues?.length) return null;
  return state.family.criticalValues.reduce((nearest, event) =>
    !nearest || Math.abs(event.parameter - state.parameter) < Math.abs(nearest.parameter - state.parameter) ? event : nearest
  , null);
}

function updateTelemetry() {
  const event = nearestEvent();
  if (elements.telemetryR) elements.telemetryR.textContent = formatNumber(state.parameter);
  if (elements.phaseParameterLabel) elements.phaseParameterLabel.textContent = `r = ${formatNumber(state.parameter)}`;
  if (elements.telemetryEvent) {
    elements.telemetryEvent.textContent = event
      ? `${event.label} at r = ${formatNumber(event.parameter)}`
      : "No marked event";
  }
  if (elements.stageStatus) {
    const equilibriumWord = state.equilibria.length === 1 ? "equilibrium" : "equilibria";
    const orbitWord = state.cycles.length === 1 ? "periodic orbit" : "periodic orbits";
    elements.stageStatus.textContent = `${state.equilibria.length} ${equilibriumWord} · ${state.cycles.length} ${orbitWord}`;
  }
}

function refreshSlice(options = {}) {
  const preferredObjectId = state.selectedObjectId;
  state.equilibria = equilibriaAt(state.family, state.parameter);
  state.cycles = cyclesAt(state.family, state.parameter);
  state.phaseCache = null;
  refreshObjects({ preferredId: preferredObjectId });
  updateTelemetry();
  requestTrajectoryRefresh({ immediate: Boolean(options.immediate), preserveProgress: options.preserveProgress !== false });
  if (!options.deferDraw) drawAll();
}

function setParameter(value, options = {}) {
  if (!state.family) return;
  const next = clamp(Number(value), state.family.parameterRange[0], state.family.parameterRange[1]);
  if (!Number.isFinite(next)) return;
  state.parameter = next;
  if (elements.parameter) elements.parameter.value = String(next);
  elements.parameter?.setAttribute("aria-valuetext", `r equals ${formatNumber(next)}`);
  if (elements.parameterValue) elements.parameterValue.textContent = formatNumber(next);
  refreshSlice({
    immediate: Boolean(options.immediate),
    preserveProgress: options.preserveProgress,
    deferDraw: Boolean(options.deferDraw)
  });
  if (options.stopSweep) stopSweep();
  if (options.announce) {
    const event = nearestEvent();
    const eventText = event && Math.abs(event.parameter - next) < (state.family.parameterRange[1] - state.family.parameterRange[0]) * 0.012
      ? ` Near ${event.label}.`
      : "";
    const equilibriumWord = state.equilibria.length === 1 ? "equilibrium" : "equilibria";
    const orbitWord = state.cycles.length === 1 ? "periodic orbit" : "periodic orbits";
    announce(`Parameter r is ${formatNumber(next)}. ${state.equilibria.length} ${equilibriumWord} and ${state.cycles.length} ${orbitWord}.${eventText}`);
  }
}

function configureParameterControl() {
  const [minimum, maximum] = state.family.parameterRange;
  const step = (maximum - minimum) / 700;
  elements.parameter.min = String(minimum);
  elements.parameter.max = String(maximum);
  elements.parameter.step = String(step);
  elements.parameter.setAttribute("aria-valuetext", `r equals ${formatNumber(state.parameter)}`);
}

function resetPhaseView() {
  const [xMin, xMax] = state.family.phaseWindow.x;
  const [yMin, yMax] = state.family.phaseWindow.y;
  state.phaseFullView = { xMin, xMax, yMin, yMax };
  state.phaseView = { ...state.phaseFullView };
  state.phaseCache = null;
}

function resetBifurcationView() {
  const [rMin, rMax] = state.family.parameterRange;
  const [oMin, oMax] = state.family.observableRange;
  state.bifurcationFullView = { rMin, rMax, oMin, oMax };
  state.bifurcationView = { ...state.bifurcationFullView };
}

function loadFamily(id, options = {}) {
  const requestedId = String(id);
  const normalizedId = normalizeFamilyId(requestedId);
  const safeId = PRESET_IDS.includes(normalizedId) ? normalizedId : "supercritical-hopf";
  state.family = createPreset(safeId, {
    variant: requestedId === "pitchfork-subcritical" ? "subcritical" : "supercritical"
  });
  state.parameter = state.family.defaultParameter;
  state.branchDiagram = sampleBranches(state.family, { samples: 241 });
  state.userSeeds = [];
  state.trajectories = [];
  state.selectedTrajectoryId = null;
  state.selectedObjectId = null;
  state.phaseCursor = {
    x: Number(elements.initialX?.value) || 0.8,
    y: Number(elements.initialY?.value) || 0.2
  };
  resetPhaseView();
  resetBifurcationView();
  updateFamilyCopy();
  configureParameterControl();
  if (elements.familySelect && normalizeFamilyId(elements.familySelect.value) !== safeId) {
    const matchingOption = [...elements.familySelect.options].find((option) => normalizeFamilyId(option.value) === safeId);
    if (matchingOption) elements.familySelect.value = matchingOption.value;
  }
  refreshSlice({ immediate: true, preserveProgress: false });
  if (options.announce !== false) {
    announce(`${state.family.name} loaded. ${state.family.description}`);
  }
}

function initializeFamilyOptions() {
  if (!elements.familySelect) return;
  for (const option of [...elements.familySelect.options]) {
    const normalized = normalizeFamilyId(option.value);
    if (!PRESET_IDS.includes(normalized)) option.remove();
  }
  for (const id of PRESET_IDS) {
    const existing = [...elements.familySelect.options].some((option) => normalizeFamilyId(option.value) === id);
    if (existing) continue;
    const option = document.createElement("option");
    option.value = id;
    option.textContent = PRESETS[id]?.shortName || titleCase(id);
    elements.familySelect.append(option);
  }
}

function samplePhaseAnalysis() {
  const ranges = currentPhaseRanges();
  const key = [state.family.id, state.parameter.toPrecision(12), ...ranges.x, ...ranges.y].join("|");
  if (state.phaseCache?.key === key) return state.phaseCache;
  const columns = 45;
  const rows = 45;
  const valuesX = new Float64Array(columns * rows);
  const valuesY = new Float64Array(columns * rows);
  const vectors = [];
  for (let row = 0; row < rows; row += 1) {
    const y = lerp(ranges.y[0], ranges.y[1], row / (rows - 1));
    for (let column = 0; column < columns; column += 1) {
      const x = lerp(ranges.x[0], ranges.x[1], column / (columns - 1));
      const value = state.family.field(x, y, state.parameter);
      const index = row * columns + column;
      valuesX[index] = value[0];
      valuesY[index] = value[1];
    }
  }
  const arrowColumns = 19;
  const arrowRows = 15;
  for (let row = 0; row < arrowRows; row += 1) {
    const y = lerp(ranges.y[0], ranges.y[1], (row + 0.5) / arrowRows);
    for (let column = 0; column < arrowColumns; column += 1) {
      const x = lerp(ranges.x[0], ranges.x[1], (column + 0.5) / arrowColumns);
      const value = state.family.field(x, y, state.parameter);
      vectors.push({ x, y, dx: value[0], dy: value[1], speed: Math.hypot(value[0], value[1]) });
    }
  }
  state.phaseCache = {
    key,
    columns,
    rows,
    valuesX,
    valuesY,
    vectors,
    xValues: Array.from({ length: columns }, (_, index) => lerp(ranges.x[0], ranges.x[1], index / (columns - 1))),
    yValues: Array.from({ length: rows }, (_, index) => lerp(ranges.y[0], ranges.y[1], index / (rows - 1)))
  };
  return state.phaseCache;
}

function interpolateZero(first, second, firstValue, secondValue) {
  const denominator = firstValue - secondValue;
  const amount = Math.abs(denominator) < 1e-15 ? 0.5 : clamp(firstValue / denominator, 0, 1);
  return { x: lerp(first.x, second.x, amount), y: lerp(first.y, second.y, amount) };
}

function nullclineSegments(values, analysis) {
  const segments = [];
  const { columns, rows, xValues, yValues } = analysis;
  const valueAt = (column, row) => values[row * columns + column];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const corners = [
        { x: xValues[column], y: yValues[row], value: valueAt(column, row) },
        { x: xValues[column + 1], y: yValues[row], value: valueAt(column + 1, row) },
        { x: xValues[column + 1], y: yValues[row + 1], value: valueAt(column + 1, row + 1) },
        { x: xValues[column], y: yValues[row + 1], value: valueAt(column, row + 1) }
      ];
      const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
      const intersections = [];
      edgePairs.forEach(([firstIndex, secondIndex], edge) => {
        const first = corners[firstIndex];
        const second = corners[secondIndex];
        const firstZero = Math.abs(first.value) < 1e-12;
        const secondZero = Math.abs(second.value) < 1e-12;
        if (firstZero && secondZero) return;
        if (firstZero || secondZero || Math.sign(first.value) !== Math.sign(second.value)) {
          const point = firstZero
            ? { x: first.x, y: first.y }
            : secondZero
              ? { x: second.x, y: second.y }
              : interpolateZero(first, second, first.value, second.value);
          if (!intersections.some((record) => Math.hypot(record.point.x - point.x, record.point.y - point.y) < 1e-11)) {
            intersections.push({ edge, point });
          }
        }
      });
      if (intersections.length === 2) {
        segments.push([intersections[0].point, intersections[1].point]);
      } else if (intersections.length === 4) {
        const centerValue = corners.reduce((sum, corner) => sum + corner.value, 0) / 4;
        const firstPairing = Math.sign(centerValue) === Math.sign(corners[0].value);
        const pairs = firstPairing ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
        for (const [first, second] of pairs) segments.push([intersections[first].point, intersections[second].point]);
      }
    }
  }
  return segments;
}

function drawArrow(context, startX, startY, endX, endY, color, width = 1) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const head = 3.5;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.lineTo(endX - head * Math.cos(angle - 0.55), endY - head * Math.sin(angle - 0.55));
  context.moveTo(endX, endY);
  context.lineTo(endX - head * Math.cos(angle + 0.55), endY - head * Math.sin(angle + 0.55));
  context.stroke();
}

function drawVectorField(context, box, ranges, analysis) {
  const plotWidth = box.right - box.left;
  const plotHeight = box.bottom - box.top;
  const speedValues = analysis.vectors.map((vector) => vector.speed).filter((speed) => Number.isFinite(speed)).sort((a, b) => a - b);
  const speedScale = speedValues[Math.floor(speedValues.length * 0.62)] || 1;
  for (const vector of analysis.vectors) {
    if (!(vector.speed > 1e-11)) continue;
    const centerX = mapHorizontal(vector.x, ranges.x, box);
    const centerY = mapVertical(vector.y, ranges.y, box);
    const screenDX = vector.dx / (ranges.x[1] - ranges.x[0]) * plotWidth;
    const screenDY = -vector.dy / (ranges.y[1] - ranges.y[0]) * plotHeight;
    const screenSpeed = Math.hypot(screenDX, screenDY);
    if (!(screenSpeed > 0)) continue;
    const intensity = 0.28 + 0.72 * Math.tanh(vector.speed / speedScale);
    const length = 7 + 7 * intensity;
    const unitX = screenDX / screenSpeed;
    const unitY = screenDY / screenSpeed;
    drawArrow(
      context,
      centerX - unitX * length * 0.42,
      centerY - unitY * length * 0.42,
      centerX + unitX * length * 0.58,
      centerY + unitY * length * 0.58,
      `rgba(231,246,241,${0.18 + 0.26 * intensity})`
    );
  }
}

function drawNullcline(context, box, ranges, segments, options) {
  context.save();
  context.strokeStyle = options.color;
  context.lineWidth = 1.7;
  context.setLineDash(options.dash || []);
  context.beginPath();
  for (const segment of segments) {
    context.moveTo(mapHorizontal(segment[0].x, ranges.x, box), mapVertical(segment[0].y, ranges.y, box));
    context.lineTo(mapHorizontal(segment[1].x, ranges.x, box), mapVertical(segment[1].y, ranges.y, box));
  }
  context.stroke();
  context.setLineDash([]);
  const labelSegment = segments[Math.floor(segments.length * 0.57)];
  if (labelSegment) {
    const point = labelSegment[1];
    const x = mapHorizontal(point.x, ranges.x, box);
    const y = mapVertical(point.y, ranges.y, box);
    if (x > box.left + 18 && x < box.right - 35 && y > box.top + 14 && y < box.bottom - 14) {
      context.font = "11px 'IBM Plex Mono', monospace";
      context.fillStyle = COLORS.plot;
      context.fillRect(x - 3, y - 8, context.measureText(options.label).width + 6, 15);
      context.fillStyle = options.color;
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(options.label, x, y);
    }
  }
  context.restore();
}

function traceDataPath(context, points, box, ranges, endIndex = points.length - 1) {
  let started = false;
  context.beginPath();
  for (let index = 0; index <= endIndex && index < points.length; index += 1) {
    const point = points[index];
    if (point.x < ranges.x[0] || point.x > ranges.x[1] || point.y < ranges.y[0] || point.y > ranges.y[1]) {
      started = false;
      continue;
    }
    const x = mapHorizontal(point.x, ranges.x, box);
    const y = mapVertical(point.y, ranges.y, box);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else context.lineTo(x, y);
  }
}

function drawTrajectories(context, box, ranges) {
  if (!elements.showTrajectories?.checked) return;
  context.save();
  for (const trajectory of state.trajectories) {
    if (trajectory.points.length < 2) continue;
    const selected = trajectory.id === state.selectedTrajectoryId;
    const showCompleteStaticPath = motionQuery.matches && state.trajectoriesPaused;
    const endIndex = clamp(Math.floor(trajectory.progress), 1, trajectory.points.length - 1);
    const pathEndIndex = showCompleteStaticPath ? trajectory.points.length - 1 : endIndex;
    context.strokeStyle = selected ? "rgba(242,201,105,.82)" : "rgba(231,246,241,.34)";
    context.lineWidth = selected ? 2.1 : 1.25;
    traceDataPath(context, trajectory.points, box, ranges, pathEndIndex);
    context.stroke();
    const point = trajectory.points[endIndex];
    if (point && point.x >= ranges.x[0] && point.x <= ranges.x[1] && point.y >= ranges.y[0] && point.y <= ranges.y[1]) {
      const x = mapHorizontal(point.x, ranges.x, box);
      const y = mapVertical(point.y, ranges.y, box);
      context.fillStyle = selected ? COLORS.currentBright : COLORS.textDark;
      context.beginPath();
      context.arc(x, y, selected ? 3.5 : 2.5, 0, 2 * Math.PI);
      context.fill();
      const previous = trajectory.points[Math.max(0, endIndex - 4)];
      if (previous) {
        const previousX = mapHorizontal(previous.x, ranges.x, box);
        const previousY = mapVertical(previous.y, ranges.y, box);
        if (Math.hypot(x - previousX, y - previousY) > 2) {
          drawArrow(context, previousX, previousY, x, y, selected ? COLORS.currentBright : COLORS.textDark, selected ? 1.7 : 1);
        }
      }
    }
  }
  context.restore();
}

function drawCycle(context, cycle, box, ranges, selected) {
  context.save();
  context.strokeStyle = cycle.stability === "stable" ? COLORS.stableBright : COLORS.unstableBright;
  context.lineWidth = selected ? 4 : 2.8;
  if (cycle.stability === "unstable") context.setLineDash([7, 5]);
  else if (cycle.stability === "semistable") context.setLineDash([9, 4, 2, 4]);
  context.beginPath();
  for (let index = 0; index <= 160; index += 1) {
    const angle = 2 * Math.PI * index / 160;
    const x = mapHorizontal(cycle.radius * Math.cos(angle), ranges.x, box);
    const y = mapVertical(cycle.radius * Math.sin(angle), ranges.y, box);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.setLineDash([]);
  const angle = Math.PI / 4;
  const direction = Math.sign(cycle.angularVelocity || 1);
  const firstAngle = angle - direction * 0.08;
  drawArrow(
    context,
    mapHorizontal(cycle.radius * Math.cos(firstAngle), ranges.x, box),
    mapVertical(cycle.radius * Math.sin(firstAngle), ranges.y, box),
    mapHorizontal(cycle.radius * Math.cos(angle), ranges.x, box),
    mapVertical(cycle.radius * Math.sin(angle), ranges.y, box),
    cycle.stability === "stable" ? COLORS.stableBright : COLORS.unstableBright,
    1.8
  );
  context.restore();
}

function drawEquilibrium(context, equilibrium, box, ranges, selected) {
  const x = mapHorizontal(equilibrium.x, ranges.x, box);
  const y = mapVertical(equilibrium.y, ranges.y, box);
  const radius = 5.2;
  context.save();
  if (selected) {
    context.strokeStyle = COLORS.currentBright;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 10, 0, 2 * Math.PI);
    context.stroke();
  }
  context.lineWidth = 2;
  if (equilibrium.type === "saddle") {
    context.fillStyle = COLORS.plot;
    context.strokeStyle = COLORS.unstableBright;
    context.beginPath();
    context.moveTo(x, y - radius - 1);
    context.lineTo(x + radius + 1, y);
    context.lineTo(x, y + radius + 1);
    context.lineTo(x - radius - 1, y);
    context.closePath();
    context.fill();
    context.stroke();
  } else if (equilibrium.type === "nonhyperbolic") {
    context.fillStyle = COLORS.plot;
    context.strokeStyle = COLORS.currentBright;
    context.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    context.strokeRect(x - radius, y - radius, 2 * radius, 2 * radius);
  } else {
    const stable = equilibrium.stability === "stable";
    context.fillStyle = stable ? COLORS.stableBright : COLORS.plot;
    context.strokeStyle = stable ? COLORS.stableBright : COLORS.unstableBright;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawPhaseCursor(context, box, ranges) {
  const x = mapHorizontal(state.phaseCursor.x, ranges.x, box);
  const y = mapVertical(state.phaseCursor.y, ranges.y, box);
  if (!pointInBox({ x, y }, box)) return;
  context.save();
  context.strokeStyle = COLORS.currentBright;
  context.lineWidth = 1.2;
  context.setLineDash([3, 3]);
  context.beginPath();
  context.moveTo(x - 7, y);
  context.lineTo(x + 7, y);
  context.moveTo(x, y - 7);
  context.lineTo(x, y + 7);
  context.stroke();
  context.restore();
}

function drawPhasePortrait() {
  if (!state.family || !elements.phaseCanvas) return;
  const { context, width, height } = canvasSurface(elements.phaseCanvas);
  const box = plotRectangle(width, height);
  state.phaseBox = box;
  const ranges = currentPhaseRanges();
  context.fillStyle = COLORS.plot;
  context.fillRect(0, 0, width, height);
  drawAxes(context, box, ranges.x, ranges.y, { dark: true });
  context.save();
  context.beginPath();
  context.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  context.clip();
  const analysis = samplePhaseAnalysis();
  if (elements.showVectorField?.checked) drawVectorField(context, box, ranges, analysis);
  if (elements.showNullclines?.checked) {
    drawNullcline(context, box, ranges, nullclineSegments(analysis.valuesX, analysis), {
      color: COLORS.nullclineX,
      label: "ẋ = 0"
    });
    drawNullcline(context, box, ranges, nullclineSegments(analysis.valuesY, analysis), {
      color: COLORS.nullclineY,
      label: "ẏ = 0",
      dash: [5, 4]
    });
  }
  drawTrajectories(context, box, ranges);
  state.cycles.forEach((cycle, index) => drawCycle(context, cycle, box, ranges, state.selectedObjectId === `cycle-${index}`));
  state.equilibria.forEach((equilibrium, index) => drawEquilibrium(context, equilibrium, box, ranges, state.selectedObjectId === `equilibrium-${index}`));
  drawPhaseCursor(context, box, ranges);
  context.restore();
}

function branchStyle(point) {
  if (point.stability === "stable") return { color: COLORS.stable, dash: [], width: 2.5 };
  if (point.stability === "unstable") return { color: COLORS.unstable, dash: [7, 5], width: 2.3 };
  if (point.stability === "saddle") return { color: COLORS.saddle, dash: [8, 4, 2, 4], width: 2.3 };
  if (point.stability === "semistable") return { color: COLORS.current, dash: [9, 4, 2, 4], width: 2.5 };
  return { color: COLORS.current, dash: [3, 3], width: 2.2 };
}

function drawBifurcationDiagram() {
  if (!state.branchDiagram || !elements.bifurcationCanvas) return;
  const { context, width, height } = canvasSurface(elements.bifurcationCanvas);
  const box = plotRectangle(width, height, true);
  state.bifurcationBox = box;
  const ranges = currentBifurcationRanges();
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);
  drawAxes(context, box, ranges.parameter, ranges.observable, { xLabel: "r", xTicks: 5, yTicks: 4 });
  context.save();
  context.beginPath();
  context.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  context.clip();

  for (const branch of state.branchDiagram.branches) {
    let dashDistance = 0;
    let previousStyleKey = "";
    for (let index = 1; index < branch.points.length; index += 1) {
      const first = branch.points[index - 1];
      const second = branch.points[index];
      const maximumGap = (state.family.parameterRange[1] - state.family.parameterRange[0]) / 18;
      if (second.parameter - first.parameter > maximumGap) {
        dashDistance = 0;
        previousStyleKey = "";
        continue;
      }
      const style = branchStyle(second);
      const styleKey = `${style.color}|${style.dash.join(",")}|${style.width}`;
      if (styleKey !== previousStyleKey) dashDistance = 0;
      const firstX = mapHorizontal(first.parameter, ranges.parameter, box);
      const firstY = mapVertical(first.observable, ranges.observable, box);
      const secondX = mapHorizontal(second.parameter, ranges.parameter, box);
      const secondY = mapVertical(second.observable, ranges.observable, box);
      context.save();
      context.strokeStyle = style.color;
      context.lineWidth = style.width;
      context.setLineDash(style.dash);
      context.lineDashOffset = -dashDistance;
      context.beginPath();
      context.moveTo(firstX, firstY);
      context.lineTo(secondX, secondY);
      context.stroke();
      context.restore();
      dashDistance += Math.hypot(secondX - firstX, secondY - firstY);
      previousStyleKey = styleKey;
    }
  }

  for (const event of state.family.criticalValues) {
    if (event.parameter < ranges.parameter[0] || event.parameter > ranges.parameter[1]) continue;
    const x = mapHorizontal(event.parameter, ranges.parameter, box);
    context.save();
    context.strokeStyle = "rgba(138,98,0,.55)";
    context.setLineDash([2, 4]);
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = COLORS.current;
    context.font = "10px 'IBM Plex Mono', monospace";
    context.textAlign = x > (box.left + box.right) / 2 ? "right" : "left";
    context.textBaseline = "top";
    context.fillText(event.label, x + (x > (box.left + box.right) / 2 ? -5 : 5), box.top + 5);
    context.restore();
  }

  if (state.parameter >= ranges.parameter[0] && state.parameter <= ranges.parameter[1]) {
    const x = mapHorizontal(state.parameter, ranges.parameter, box);
    context.save();
    context.strokeStyle = COLORS.current;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
    context.fillStyle = COLORS.current;
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x - 4, box.top + 7);
    context.lineTo(x + 4, box.top + 7);
    context.closePath();
    context.fill();
    context.restore();
  }

  for (const branch of state.branchDiagram.branches) {
    const nearest = branch.points.reduce((best, point) =>
      !best || Math.abs(point.parameter - state.parameter) < Math.abs(best.parameter - state.parameter) ? point : best
    , null);
    if (!nearest || Math.abs(nearest.parameter - state.parameter) > (state.family.parameterRange[1] - state.family.parameterRange[0]) / 80) continue;
    if (nearest.observable < ranges.observable[0] || nearest.observable > ranges.observable[1]) continue;
    const x = mapHorizontal(nearest.parameter, ranges.parameter, box);
    const y = mapVertical(nearest.observable, ranges.observable, box);
    context.fillStyle = branchStyle(nearest).color;
    context.strokeStyle = COLORS.paper;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 4, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function nearbyEigenvalueTrail(equilibrium) {
  const [minimum, maximum] = state.family.parameterRange;
  const span = maximum - minimum;
  const start = clamp(state.parameter - span * 0.13, minimum, maximum);
  const end = clamp(state.parameter + span * 0.13, minimum, maximum);
  const trails = [[], []];
  let anchor = equilibrium;
  for (let index = 0; index <= 44; index += 1) {
    const parameter = lerp(start, end, index / 44);
    const candidates = equilibriaAt(state.family, parameter);
    if (!candidates.length) continue;
    const sameBranch = candidates.find((candidate) => candidate.label === equilibrium.label);
    const selected = sameBranch || candidates.reduce((nearest, candidate) => {
      const nearestDistance = Math.hypot(nearest.x - anchor.x, nearest.y - anchor.y);
      const candidateDistance = Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      return candidateDistance < nearestDistance ? candidate : nearest;
    }, candidates[0]);
    anchor = selected;
    selected.eigenvalues.forEach((value, eigenIndex) => trails[eigenIndex].push(value));
  }
  return trails;
}

function drawEigenvaluePlane() {
  if (!elements.eigenvalueCanvas) return;
  const { context, width, height } = canvasSurface(elements.eigenvalueCanvas);
  const box = plotRectangle(width, height, true);
  state.eigenvalueBox = box;
  context.fillStyle = COLORS.plot;
  context.fillRect(0, 0, width, height);
  const object = selectedObject();
  if (!object || object.kind !== "equilibrium") {
    drawAxes(context, box, [-1, 1], [-1, 1], { dark: true, xTicks: 3, yTicks: 3 });
    context.fillStyle = "rgba(231,246,241,.72)";
    context.font = "11px 'IBM Plex Mono', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(object ? "Jacobian varies along the orbit" : "Select an equilibrium", (box.left + box.right) / 2, (box.top + box.bottom) / 2);
    return;
  }
  const trails = nearbyEigenvalueTrail(object.data);
  const allValues = [...trails.flat(), ...object.data.eigenvalues];
  const extent = Math.max(1.05, ...allValues.map((value) => Math.max(Math.abs(value.re), Math.abs(value.im)))) * 1.18;
  const range = [-extent, extent];
  drawAxes(context, box, range, range, { dark: true, xTicks: 3, yTicks: 3 });
  context.save();
  context.strokeStyle = "rgba(240,177,139,.85)";
  context.lineWidth = 1.4;
  for (const trail of trails) {
    context.beginPath();
    trail.forEach((value, index) => {
      const x = mapHorizontal(value.re, range, box);
      const y = mapVertical(value.im, range, box);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  object.data.eigenvalues.forEach((value, index) => {
    const x = mapHorizontal(value.re, range, box);
    const y = mapVertical(value.im, range, box);
    context.fillStyle = index === 0 ? COLORS.currentBright : COLORS.stableBright;
    context.strokeStyle = COLORS.plot;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 5, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
  });
  context.restore();
}

function selectedTrajectory() {
  return state.trajectories.find((trajectory) => trajectory.id === state.selectedTrajectoryId) || state.trajectories[0] || null;
}

function drawTimeTrace() {
  if (!elements.timeCanvas) return;
  const { context, width, height } = canvasSurface(elements.timeCanvas);
  const box = plotRectangle(width, height, true);
  state.timeBox = box;
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);
  const trajectory = selectedTrajectory();
  if (!trajectory?.points?.length) {
    drawAxes(context, box, [0, 1], [-1, 1], { xLabel: "t", xTicks: 4, yTicks: 3 });
    if (elements.trajectorySummary) elements.trajectorySummary.textContent = "No trajectory is currently selected.";
    return;
  }
  const timeRange = [0, Math.max(1, trajectory.points.at(-1).t)];
  const values = trajectory.points.flatMap((point) => [point.x, point.y]);
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  const padding = Math.max(0.12, (maximum - minimum) * 0.12);
  if (!(maximum > minimum)) {
    minimum -= 1;
    maximum += 1;
  } else {
    minimum -= padding;
    maximum += padding;
  }
  const valueRange = [minimum, maximum];
  drawAxes(context, box, timeRange, valueRange, { xLabel: "t", xTicks: 5, yTicks: 3 });
  for (const [key, color] of [["x", COLORS.traceX], ["y", COLORS.traceY]]) {
    context.strokeStyle = color;
    context.lineWidth = 1.8;
    context.beginPath();
    trajectory.points.forEach((point, index) => {
      const x = mapHorizontal(point.t, timeRange, box);
      const y = mapVertical(point[key], valueRange, box);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  const cursorIndex = clamp(Math.floor(trajectory.progress), 0, trajectory.points.length - 1);
  const cursorPoint = trajectory.points[cursorIndex];
  if (cursorPoint) {
    const x = mapHorizontal(cursorPoint.t, timeRange, box);
    context.strokeStyle = "rgba(138,98,0,.55)";
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
  }
  if (elements.timeTraceLabel) {
    elements.timeTraceLabel.textContent = `x(t) and y(t) from (${formatNumber(trajectory.seed.x, 2)}, ${formatNumber(trajectory.seed.y, 2)})`;
  }
  if (elements.trajectorySummary) {
    const endpoint = trajectory.points.at(-1);
    const status = trajectory.status === "completed"
      ? "The numerical integration reached its requested duration"
      : trajectory.status === "escaped" ? "The trajectory left the integration window" : "The numerical integration stopped early";
    elements.trajectorySummary.textContent = `The selected trajectory starts at x ${formatNumber(trajectory.seed.x, 3)}, y ${formatNumber(trajectory.seed.y, 3)}. ${status} at t ${formatNumber(endpoint.t, 2)}, near x ${formatNumber(endpoint.x, 3)}, y ${formatNumber(endpoint.y, 3)}.`;
  }
}

function drawAll() {
  drawPhasePortrait();
  drawBifurcationDiagram();
  drawEigenvaluePlane();
  drawTimeTrace();
}

function zoomPhase(factor, centerX, centerY) {
  const view = state.phaseView;
  const full = state.phaseFullView;
  const xSpan = clamp((view.xMax - view.xMin) * factor, (full.xMax - full.xMin) * 0.08, (full.xMax - full.xMin) * 4);
  const ySpan = clamp((view.yMax - view.yMin) * factor, (full.yMax - full.yMin) * 0.08, (full.yMax - full.yMin) * 4);
  const xRatio = inverseLerp(view.xMin, view.xMax, centerX);
  const yRatio = inverseLerp(view.yMin, view.yMax, centerY);
  state.phaseView = {
    xMin: centerX - xSpan * xRatio,
    xMax: centerX + xSpan * (1 - xRatio),
    yMin: centerY - ySpan * yRatio,
    yMax: centerY + ySpan * (1 - yRatio)
  };
  state.phaseCache = null;
  drawPhasePortrait();
}

function panPhase(deltaX, deltaY) {
  state.phaseView.xMin += deltaX;
  state.phaseView.xMax += deltaX;
  state.phaseView.yMin += deltaY;
  state.phaseView.yMax += deltaY;
  state.phaseCache = null;
  drawPhasePortrait();
}

function zoomBifurcation(factor, centerR, centerObservable) {
  const view = state.bifurcationView;
  const full = state.bifurcationFullView;
  const rSpan = clamp((view.rMax - view.rMin) * factor, (full.rMax - full.rMin) * 0.08, (full.rMax - full.rMin) * 4);
  const oSpan = clamp((view.oMax - view.oMin) * factor, (full.oMax - full.oMin) * 0.08, (full.oMax - full.oMin) * 4);
  const rRatio = inverseLerp(view.rMin, view.rMax, centerR);
  const oRatio = inverseLerp(view.oMin, view.oMax, centerObservable);
  state.bifurcationView = {
    rMin: centerR - rSpan * rRatio,
    rMax: centerR + rSpan * (1 - rRatio),
    oMin: centerObservable - oSpan * oRatio,
    oMax: centerObservable + oSpan * (1 - oRatio)
  };
  drawBifurcationDiagram();
}

function panBifurcation(deltaR, deltaObservable) {
  state.bifurcationView.rMin += deltaR;
  state.bifurcationView.rMax += deltaR;
  state.bifurcationView.oMin += deltaObservable;
  state.bifurcationView.oMax += deltaObservable;
  drawBifurcationDiagram();
}

function addInitialCondition(x, y, options = {}) {
  const xIsValid = Number.isFinite(x);
  const yIsValid = Number.isFinite(y);
  if (!xIsValid || !yIsValid) {
    elements.initialX?.setCustomValidity(xIsValid ? "" : "Enter a finite x value.");
    elements.initialY?.setCustomValidity(yIsValid ? "" : "Enter a finite y value.");
    const firstInvalid = xIsValid ? elements.initialY : elements.initialX;
    firstInvalid?.focus();
    firstInvalid?.reportValidity();
    announce("The initial condition must contain finite x and y values.");
    return;
  }
  elements.initialX?.setCustomValidity("");
  elements.initialY?.setCustomValidity("");
  const seed = { x, y, user: true };
  state.userSeeds.push(seed);
  if (state.userSeeds.length > 10) state.userSeeds.shift();
  const trajectory = makeTrajectory(seed);
  state.trajectories.push(trajectory);
  state.selectedTrajectoryId = trajectory.id;
  state.phaseCursor = { x, y };
  if (elements.initialX) elements.initialX.value = formatNumber(x, 3);
  if (elements.initialY) elements.initialY.value = formatNumber(y, 3);
  drawPhasePortrait();
  drawTimeTrace();
  if (options.announce !== false) announce(`Trajectory added from x ${formatNumber(x, 2)}, y ${formatNumber(y, 2)}.`);
}

function addInitialConditionFromInputs() {
  const rawX = elements.initialX?.value.trim() || "";
  const rawY = elements.initialY?.value.trim() || "";
  const x = rawX === "" ? NaN : Number(rawX);
  const y = rawY === "" ? NaN : Number(rawY);
  addInitialCondition(x, y);
}

function phaseCoordinates(position) {
  const ranges = currentPhaseRanges();
  return {
    x: valueFromHorizontal(position.x, ranges.x, state.phaseBox),
    y: valueFromVertical(position.y, ranges.y, state.phaseBox)
  };
}

function phaseObjectAt(position) {
  if (!state.phaseBox) return null;
  const ranges = currentPhaseRanges();
  for (let index = 0; index < state.equilibria.length; index += 1) {
    const equilibrium = state.equilibria[index];
    const screen = {
      x: mapHorizontal(equilibrium.x, ranges.x, state.phaseBox),
      y: mapVertical(equilibrium.y, ranges.y, state.phaseBox)
    };
    if (Math.hypot(position.x - screen.x, position.y - screen.y) <= 12) return `equilibrium-${index}`;
  }
  const dataPoint = phaseCoordinates(position);
  const pixelsPerUnit = Math.min(
    (state.phaseBox.right - state.phaseBox.left) / (ranges.x[1] - ranges.x[0]),
    (state.phaseBox.bottom - state.phaseBox.top) / (ranges.y[1] - ranges.y[0])
  );
  for (let index = 0; index < state.cycles.length; index += 1) {
    if (Math.abs(Math.hypot(dataPoint.x, dataPoint.y) - state.cycles[index].radius) * pixelsPerUnit <= 9) {
      return `cycle-${index}`;
    }
  }
  return null;
}

function updateParameterFromBifurcation(event, announceChange = false) {
  const position = pointerPosition(elements.bifurcationCanvas, event);
  const ranges = currentBifurcationRanges();
  const value = valueFromHorizontal(clamp(position.x, state.bifurcationBox.left, state.bifurcationBox.right), ranges.parameter, state.bifurcationBox);
  setParameter(value, { stopSweep: true, announce: announceChange });
}

function phaseViewAnnouncement(action) {
  return `${action} Visible x range ${formatNumber(state.phaseView.xMin, 2)} to ${formatNumber(state.phaseView.xMax, 2)}; visible y range ${formatNumber(state.phaseView.yMin, 2)} to ${formatNumber(state.phaseView.yMax, 2)}.`;
}

function bifurcationViewAnnouncement(action) {
  return `${action} Visible r range ${formatNumber(state.bifurcationView.rMin, 2)} to ${formatNumber(state.bifurcationView.rMax, 2)}; visible vertical range ${formatNumber(state.bifurcationView.oMin, 2)} to ${formatNumber(state.bifurcationView.oMax, 2)}.`;
}

function handlePhaseKey(event) {
  if (!state.phaseView) return;
  const xSpan = state.phaseView.xMax - state.phaseView.xMin;
  const ySpan = state.phaseView.yMax - state.phaseView.yMin;
  if (event.ctrlKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    panPhase(
      event.key === "ArrowLeft" ? -xSpan * 0.08 : event.key === "ArrowRight" ? xSpan * 0.08 : 0,
      event.key === "ArrowDown" ? -ySpan * 0.08 : event.key === "ArrowUp" ? ySpan * 0.08 : 0
    );
    announce(phaseViewAnnouncement("Phase portrait panned."));
    return;
  }
  if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    zoomPhase(event.key === "+" || event.key === "=" ? 0.8 : 1.25, state.phaseCursor.x, state.phaseCursor.y);
    announce(phaseViewAnnouncement(event.key === "+" || event.key === "=" ? "Phase portrait zoomed in." : "Phase portrait zoomed out."));
    return;
  }
  if (event.key === "0" || event.key.toLowerCase() === "f") {
    event.preventDefault();
    resetPhaseView();
    drawPhasePortrait();
    announce(phaseViewAnnouncement("Phase portrait restored to its full view."));
    return;
  }
  if (event.key === "Enter" || event.key === " " || event.code === "Space") {
    event.preventDefault();
    addInitialCondition(state.phaseCursor.x, state.phaseCursor.y);
    return;
  }
  const keyDirections = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowDown: [0, -1],
    ArrowUp: [0, 1]
  };
  const direction = keyDirections[event.key];
  if (!direction) return;
  event.preventDefault();
  const factor = event.shiftKey ? 0.1 : 0.025;
  state.phaseCursor.x = clamp(state.phaseCursor.x + direction[0] * xSpan * factor, state.phaseView.xMin, state.phaseView.xMax);
  state.phaseCursor.y = clamp(state.phaseCursor.y + direction[1] * ySpan * factor, state.phaseView.yMin, state.phaseView.yMax);
  if (elements.initialX) elements.initialX.value = formatNumber(state.phaseCursor.x, 3);
  if (elements.initialY) elements.initialY.value = formatNumber(state.phaseCursor.y, 3);
  drawPhasePortrait();
  announce(`Initial-condition cursor at x ${formatNumber(state.phaseCursor.x, 2)}, y ${formatNumber(state.phaseCursor.y, 2)}. Press Enter to launch.`);
}

function handleBifurcationKey(event) {
  if (!state.bifurcationView) return;
  const rSpan = state.bifurcationView.rMax - state.bifurcationView.rMin;
  const oSpan = state.bifurcationView.oMax - state.bifurcationView.oMin;
  if (event.ctrlKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    panBifurcation(
      event.key === "ArrowLeft" ? -rSpan * 0.08 : event.key === "ArrowRight" ? rSpan * 0.08 : 0,
      event.key === "ArrowDown" ? -oSpan * 0.08 : event.key === "ArrowUp" ? oSpan * 0.08 : 0
    );
    announce(bifurcationViewAnnouncement("Bifurcation diagram panned."));
    return;
  }
  if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    zoomBifurcation(
      event.key === "+" || event.key === "=" ? 0.8 : 1.25,
      state.parameter,
      (state.bifurcationView.oMin + state.bifurcationView.oMax) / 2
    );
    announce(bifurcationViewAnnouncement(event.key === "+" || event.key === "=" ? "Bifurcation diagram zoomed in." : "Bifurcation diagram zoomed out."));
    return;
  }
  if (event.key === "0" || event.key.toLowerCase() === "f") {
    event.preventDefault();
    resetBifurcationView();
    drawBifurcationDiagram();
    announce(bifurcationViewAnnouncement("Bifurcation diagram restored to its full view."));
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const step = (state.family.parameterRange[1] - state.family.parameterRange[0]) * (event.shiftKey ? 0.025 : 0.005);
    setParameter(state.parameter + (event.key === "ArrowRight" ? step : -step), { stopSweep: true, announce: true });
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const eventRecord = nearestEvent();
    if (eventRecord) announce(`${eventRecord.label} occurs at r ${formatNumber(eventRecord.parameter)}. Current r is ${formatNumber(state.parameter)}.`);
  }
}

function startSweep() {
  if (state.sweepRunning) return;
  state.sweepRunning = true;
  if (elements.toggleSweep) {
    elements.toggleSweep.textContent = "Pause parameter sweep";
  }
  announce("Parameter sweep started.");
}

function stopSweep(options = {}) {
  if (!state.sweepRunning && options.force !== true) return;
  state.sweepRunning = false;
  if (elements.toggleSweep) {
    elements.toggleSweep.textContent = "Play parameter sweep";
  }
  if (options.announce) announce("Parameter sweep paused.");
}

function updateSweep(delta) {
  if (!state.sweepRunning) return;
  const [minimum, maximum] = state.family.parameterRange;
  const span = maximum - minimum;
  let next = state.parameter + state.sweepDirection * delta * span * 0.13 * state.sweepSpeed;
  if (next >= maximum) {
    next = maximum;
    state.sweepDirection = -1;
  } else if (next <= minimum) {
    next = minimum;
    state.sweepDirection = 1;
  }
  setParameter(next, { preserveProgress: true, deferDraw: true });
}

function currentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function fullscreenSupported() {
  if (!elements.workspace) return false;
  const request = elements.workspace.requestFullscreen || elements.workspace.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const explicitlyDisabled = document.fullscreenEnabled === false && document.webkitFullscreenEnabled !== true;
  return typeof request === "function" && typeof exit === "function" && !explicitlyDisabled;
}

function syncFullscreenState(options = {}) {
  const wasActive = state.fullscreenActive;
  state.fullscreenActive = currentFullscreenElement() === elements.workspace;
  elements.workspace?.classList.toggle("is-fullscreen", state.fullscreenActive);
  if (elements.fullscreenLabel) elements.fullscreenLabel.textContent = state.fullscreenActive ? "Exit full screen" : "Full screen";
  if (elements.fullscreenToggle) elements.fullscreenToggle.setAttribute("aria-label", state.fullscreenActive ? "Exit full screen" : "Enter full screen");
  window.requestAnimationFrame(() => {
    drawAll();
    window.requestAnimationFrame(drawAll);
  });
  if (state.fullscreenInitialized && state.fullscreenActive !== wasActive && options.announceChange !== false) {
    announce(state.fullscreenActive ? "Full screen view opened." : "Full screen view closed.");
  }
  state.fullscreenInitialized = true;
}

async function toggleFullscreen() {
  if (!fullscreenSupported()) {
    announce("Full screen is not available in this browser.");
    return;
  }
  try {
    if (currentFullscreenElement() === elements.workspace) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (elements.workspace.requestFullscreen || elements.workspace.webkitRequestFullscreen).call(elements.workspace);
    }
  } catch (error) {
    console.warn("Full screen could not change.", error);
    announce("Full screen could not change in this browser.");
  }
}

function initializeFullscreen() {
  if (elements.fullscreenToggle) elements.fullscreenToggle.hidden = !fullscreenSupported();
  syncFullscreenState({ announceChange: false });
}

elements.familySelect?.addEventListener("change", () => {
  stopSweep({ force: true });
  loadFamily(elements.familySelect.value);
});
elements.parameter?.addEventListener("input", () => setParameter(elements.parameter.value, { stopSweep: true, preserveProgress: true }));
elements.parameter?.addEventListener("change", () => setParameter(elements.parameter.value, { stopSweep: true, announce: true, immediate: true }));
elements.toggleSweep?.addEventListener("click", () => state.sweepRunning ? stopSweep({ announce: true }) : startSweep());
elements.centerParameter?.addEventListener("click", () => setParameter(
  clamp(0, state.family.parameterRange[0], state.family.parameterRange[1]),
  { stopSweep: true, announce: true, immediate: true }
));
elements.sweepSpeed?.addEventListener("input", () => {
  state.sweepSpeed = Number(elements.sweepSpeed.value);
  if (elements.sweepSpeedValue) elements.sweepSpeedValue.textContent = `${state.sweepSpeed.toFixed(2)}×`;
  elements.sweepSpeed.setAttribute("aria-valuetext", `${state.sweepSpeed.toFixed(2)} times speed`);
});
elements.addInitialCondition?.addEventListener("click", addInitialConditionFromInputs);
for (const input of [elements.initialX, elements.initialY]) {
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addInitialConditionFromInputs();
  });
}
elements.toggleTrajectories?.addEventListener("click", () => setTrajectoryPaused(!state.trajectoriesPaused));
elements.restartTrajectories?.addEventListener("click", () => {
  rebuildTrajectories({ preserveProgress: false });
  announce("Trajectories restarted from their initial conditions.");
});
elements.stepTrajectories?.addEventListener("click", stepTrajectories);
for (const checkbox of [elements.showVectorField, elements.showNullclines, elements.showTrajectories]) {
  checkbox?.addEventListener("change", () => drawPhasePortrait());
}
elements.resetViews?.addEventListener("click", () => {
  resetPhaseView();
  resetBifurcationView();
  drawAll();
  announce(`${phaseViewAnnouncement("All plot views restored.")} ${bifurcationViewAnnouncement("")}`);
});
elements.phaseZoomIn?.addEventListener("click", () => {
  zoomPhase(0.8, (state.phaseView.xMin + state.phaseView.xMax) / 2, (state.phaseView.yMin + state.phaseView.yMax) / 2);
  announce(phaseViewAnnouncement("Phase portrait zoomed in."));
});
elements.phaseZoomOut?.addEventListener("click", () => {
  zoomPhase(1.25, (state.phaseView.xMin + state.phaseView.xMax) / 2, (state.phaseView.yMin + state.phaseView.yMax) / 2);
  announce(phaseViewAnnouncement("Phase portrait zoomed out."));
});
for (const [control, horizontal, vertical] of [
  [elements.phasePanLeft, -1, 0],
  [elements.phasePanRight, 1, 0],
  [elements.phasePanUp, 0, 1],
  [elements.phasePanDown, 0, -1]
]) {
  control?.addEventListener("click", () => {
    panPhase(
      horizontal * (state.phaseView.xMax - state.phaseView.xMin) * 0.1,
      vertical * (state.phaseView.yMax - state.phaseView.yMin) * 0.1
    );
    announce(phaseViewAnnouncement("Phase portrait panned."));
  });
}
elements.phaseFit?.addEventListener("click", () => {
  resetPhaseView();
  drawPhasePortrait();
  announce(phaseViewAnnouncement("Phase portrait restored to its full view."));
});
elements.bifurcationZoomIn?.addEventListener("click", () => {
  zoomBifurcation(0.8, state.parameter, (state.bifurcationView.oMin + state.bifurcationView.oMax) / 2);
  announce(bifurcationViewAnnouncement("Bifurcation diagram zoomed in."));
});
elements.bifurcationZoomOut?.addEventListener("click", () => {
  zoomBifurcation(1.25, state.parameter, (state.bifurcationView.oMin + state.bifurcationView.oMax) / 2);
  announce(bifurcationViewAnnouncement("Bifurcation diagram zoomed out."));
});
for (const [control, horizontal, vertical] of [
  [elements.bifurcationPanLeft, -1, 0],
  [elements.bifurcationPanRight, 1, 0],
  [elements.bifurcationPanUp, 0, 1],
  [elements.bifurcationPanDown, 0, -1]
]) {
  control?.addEventListener("click", () => {
    panBifurcation(
      horizontal * (state.bifurcationView.rMax - state.bifurcationView.rMin) * 0.1,
      vertical * (state.bifurcationView.oMax - state.bifurcationView.oMin) * 0.1
    );
    announce(bifurcationViewAnnouncement("Bifurcation diagram panned."));
  });
}
elements.bifurcationFit?.addEventListener("click", () => {
  resetBifurcationView();
  drawBifurcationDiagram();
  announce(bifurcationViewAnnouncement("Bifurcation diagram restored to its full view."));
});
elements.objectSelect?.addEventListener("change", () => selectObject(elements.objectSelect.value));
elements.fullscreenToggle?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", syncFullscreenState);
document.addEventListener("webkitfullscreenchange", syncFullscreenState);
document.addEventListener("fullscreenerror", () => announce("Full screen could not change in this browser."));

elements.phaseCanvas?.addEventListener("click", (event) => {
  if (state.phasePointer?.moved || !state.phaseBox) return;
  const position = pointerPosition(elements.phaseCanvas, event);
  if (!pointInBox(position, state.phaseBox)) return;
  const objectId = phaseObjectAt(position);
  if (objectId) {
    selectObject(objectId);
    return;
  }
  const point = phaseCoordinates(position);
  addInitialCondition(point.x, point.y);
});
elements.phaseCanvas?.addEventListener("pointermove", (event) => {
  const position = pointerPosition(elements.phaseCanvas, event);
  if (state.phasePointer && event.pointerId === state.phasePointer.pointerId) {
    const deltaX = position.x - state.phasePointer.startX;
    const deltaY = position.y - state.phasePointer.startY;
    if (Math.hypot(deltaX, deltaY) > 3) state.phasePointer.moved = true;
    if (state.phasePointer.mode === "pan" && state.phasePointer.moved) {
      event.preventDefault();
      const start = state.phasePointer.view;
      state.phaseView = { ...start };
      panPhase(
        -deltaX / Math.max(1, state.phaseBox.right - state.phaseBox.left) * (start.xMax - start.xMin),
        deltaY / Math.max(1, state.phaseBox.bottom - state.phaseBox.top) * (start.yMax - start.yMin)
      );
    }
    return;
  }
  if (state.phaseBox && pointInBox(position, state.phaseBox)) {
    state.phaseCursor = phaseCoordinates(position);
    drawPhasePortrait();
  }
});
elements.phaseCanvas?.addEventListener("pointerdown", (event) => {
  if (event.button !== 1 || !state.phaseBox) return;
  const position = pointerPosition(elements.phaseCanvas, event);
  if (!pointInBox(position, state.phaseBox)) return;
  event.preventDefault();
  elements.phaseCanvas.focus({ preventScroll: true });
  state.phasePointer = {
    pointerId: event.pointerId,
    mode: "pan",
    startX: position.x,
    startY: position.y,
    moved: false,
    view: { ...state.phaseView }
  };
  elements.phaseCanvas.dataset.dragging = "pan";
  elements.phaseCanvas.setPointerCapture(event.pointerId);
});
function clearPhasePointer(event) {
  if (!state.phasePointer || (event.pointerId != null && event.pointerId !== state.phasePointer.pointerId)) return;
  const pointer = state.phasePointer;
  state.phasePointer = null;
  delete elements.phaseCanvas.dataset.dragging;
  if (event.pointerId != null && elements.phaseCanvas.hasPointerCapture?.(event.pointerId)) elements.phaseCanvas.releasePointerCapture(event.pointerId);
  if (pointer.moved) announce(phaseViewAnnouncement("Phase portrait panned."));
}
elements.phaseCanvas?.addEventListener("pointerup", clearPhasePointer);
elements.phaseCanvas?.addEventListener("pointercancel", clearPhasePointer);
elements.phaseCanvas?.addEventListener("lostpointercapture", clearPhasePointer);
elements.phaseCanvas?.addEventListener("mousedown", (event) => { if (event.button === 1) event.preventDefault(); });
elements.phaseCanvas?.addEventListener("auxclick", (event) => { if (event.button === 1) event.preventDefault(); });
elements.phaseCanvas?.addEventListener("wheel", (event) => {
  if (!state.phaseBox) return;
  const position = pointerPosition(elements.phaseCanvas, event);
  if (!pointInBox(position, state.phaseBox)) return;
  event.preventDefault();
  const center = phaseCoordinates(position);
  zoomPhase(Math.exp(clamp(event.deltaY, -120, 120) * 0.0018), center.x, center.y);
}, { passive: false });
elements.phaseCanvas?.addEventListener("dblclick", () => {
  resetPhaseView();
  drawPhasePortrait();
  announce(phaseViewAnnouncement("Phase portrait restored to its full view."));
});
elements.phaseCanvas?.addEventListener("keydown", handlePhaseKey);

elements.bifurcationCanvas?.addEventListener("pointerdown", (event) => {
  if ((event.button !== 0 && event.button !== 1) || !state.bifurcationBox) return;
  const position = pointerPosition(elements.bifurcationCanvas, event);
  if (!pointInBox(position, state.bifurcationBox)) return;
  if (event.button === 1) event.preventDefault();
  elements.bifurcationCanvas.focus({ preventScroll: true });
  const touchPending = event.pointerType === "touch" && event.button === 0;
  state.bifurcationPointer = {
    pointerId: event.pointerId,
    mode: event.button === 1 ? "pan" : touchPending ? "touch-pending" : "parameter",
    startX: position.x,
    startY: position.y,
    moved: false,
    view: { ...state.bifurcationView }
  };
  elements.bifurcationCanvas.dataset.dragging = event.button === 1 ? "pan" : touchPending ? "touch-pending" : "parameter";
  if (!touchPending) elements.bifurcationCanvas.setPointerCapture(event.pointerId);
  if (event.button === 0 && !touchPending) updateParameterFromBifurcation(event);
});
elements.bifurcationCanvas?.addEventListener("pointermove", (event) => {
  if (!state.bifurcationPointer || event.pointerId !== state.bifurcationPointer.pointerId) return;
  const position = pointerPosition(elements.bifurcationCanvas, event);
  const deltaX = position.x - state.bifurcationPointer.startX;
  const deltaY = position.y - state.bifurcationPointer.startY;
  if (Math.hypot(deltaX, deltaY) > 3) state.bifurcationPointer.moved = true;
  if (state.bifurcationPointer.mode === "touch-pending") {
    if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      state.bifurcationPointer.mode = "parameter";
      elements.bifurcationCanvas.dataset.dragging = "parameter";
      elements.bifurcationCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      updateParameterFromBifurcation(event);
    }
    return;
  }
  if (state.bifurcationPointer.mode === "parameter") {
    updateParameterFromBifurcation(event);
  } else if (state.bifurcationPointer.mode === "pan" && state.bifurcationPointer.moved) {
    event.preventDefault();
    const start = state.bifurcationPointer.view;
    state.bifurcationView = { ...start };
    panBifurcation(
      -deltaX / Math.max(1, state.bifurcationBox.right - state.bifurcationBox.left) * (start.rMax - start.rMin),
      deltaY / Math.max(1, state.bifurcationBox.bottom - state.bifurcationBox.top) * (start.oMax - start.oMin)
    );
  }
});
function clearBifurcationPointer(event) {
  if (!state.bifurcationPointer || (event.pointerId != null && event.pointerId !== state.bifurcationPointer.pointerId)) return;
  const pointer = state.bifurcationPointer;
  state.bifurcationPointer = null;
  delete elements.bifurcationCanvas.dataset.dragging;
  if (event.pointerId != null && elements.bifurcationCanvas.hasPointerCapture?.(event.pointerId)) elements.bifurcationCanvas.releasePointerCapture(event.pointerId);
  if (pointer.mode === "touch-pending" && event.type === "pointerup" && !pointer.moved) {
    updateParameterFromBifurcation(event, true);
  } else if (pointer.mode === "parameter" && event.type === "pointerup") {
    updateParameterFromBifurcation(event, true);
  } else if (pointer.mode === "pan" && pointer.moved) announce(bifurcationViewAnnouncement("Bifurcation diagram panned."));
}
elements.bifurcationCanvas?.addEventListener("pointerup", clearBifurcationPointer);
elements.bifurcationCanvas?.addEventListener("pointercancel", clearBifurcationPointer);
elements.bifurcationCanvas?.addEventListener("lostpointercapture", clearBifurcationPointer);
elements.bifurcationCanvas?.addEventListener("mousedown", (event) => { if (event.button === 1) event.preventDefault(); });
elements.bifurcationCanvas?.addEventListener("auxclick", (event) => { if (event.button === 1) event.preventDefault(); });
elements.bifurcationCanvas?.addEventListener("wheel", (event) => {
  if (!state.bifurcationBox) return;
  const position = pointerPosition(elements.bifurcationCanvas, event);
  if (!pointInBox(position, state.bifurcationBox)) return;
  event.preventDefault();
  const ranges = currentBifurcationRanges();
  zoomBifurcation(
    Math.exp(clamp(event.deltaY, -120, 120) * 0.0018),
    valueFromHorizontal(position.x, ranges.parameter, state.bifurcationBox),
    valueFromVertical(position.y, ranges.observable, state.bifurcationBox)
  );
}, { passive: false });
elements.bifurcationCanvas?.addEventListener("dblclick", () => {
  resetBifurcationView();
  drawBifurcationDiagram();
  announce(bifurcationViewAnnouncement("Bifurcation diagram restored to its full view."));
});
elements.bifurcationCanvas?.addEventListener("keydown", handleBifurcationKey);

motionQuery.addEventListener?.("change", (event) => {
  if (event.matches) {
    setTrajectoryPaused(true, { announce: false });
    stopSweep({ force: true });
    drawAll();
    announce("Reduced motion enabled. Trajectories and the parameter sweep are paused; use Step forward once for discrete motion.");
  }
});

function animate(now) {
  const delta = Math.min(0.06, Math.max(0, (now - state.lastFrameTime) / 1000));
  state.lastFrameTime = now;
  state.animationTime += delta;
  updateSweep(delta);
  updateTrajectoryProgress(delta);
  if (state.trajectoryRefreshPending && now - state.lastTrajectoryRefresh > 75) {
    rebuildTrajectories({ preserveProgress: true });
    state.lastTrajectoryRefresh = now;
  }
  if (!document.hidden && now - state.lastRenderTime > 32) {
    drawPhasePortrait();
    drawBifurcationDiagram();
    drawTimeTrace();
    state.lastRenderTime = now;
  }
  window.requestAnimationFrame(animate);
}

if (typeof ResizeObserver === "function") {
  const observer = new ResizeObserver(() => drawAll());
  [elements.phaseCanvas, elements.bifurcationCanvas, elements.eigenvalueCanvas, elements.timeCanvas]
    .filter(Boolean)
    .forEach((canvas) => observer.observe(canvas));
}

initializeFamilyOptions();
syncTrajectoryButton();
if (elements.sweepSpeedValue) elements.sweepSpeedValue.textContent = `${state.sweepSpeed.toFixed(2)}×`;
initializeFullscreen();
loadFamily(elements.familySelect?.value || "supercritical-hopf", { announce: false });
window.requestAnimationFrame(animate);
