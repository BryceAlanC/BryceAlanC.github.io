import {
  createFamily,
  findEquilibria,
  sampleBifurcation,
  sampleZeroContour,
  taylorData,
  taylorEvaluate,
  rk4Step
} from "./model.js?v=20261002-1";

const COLORS = Object.freeze({
  ink: "#17211d",
  muted: "#53615c",
  paper: "#f4f1e7",
  paperDeep: "#e9e4d7",
  forest: "#0b5748",
  plot: "#071c18",
  plotSoft: "#09251f",
  grid: "rgba(231, 246, 241, 0.09)",
  gridLight: "rgba(23, 33, 29, 0.10)",
  light: "#e7f0ec",
  ivory: "#fffdf7",
  stable: "#0b6f60",
  stableBright: "#79d8c5",
  unstable: "#9c4528",
  unstableBright: "#f0b18b",
  current: "#8a6200",
  currentBright: "#f2c969",
  normal: "#b5a1df",
  backward: "#b5a1df",
  backwardLight: "#694e9a"
});

const elements = {
  workspace: document.getElementById("bifurcation-workspace"),
  fullscreenToggle: document.getElementById("workspace-fullscreen-toggle"),
  fullscreenLabel: document.getElementById("workspace-fullscreen-label"),
  familySelect: document.getElementById("family-select"),
  generateFamily: document.getElementById("generate-family"),
  familyKind: document.getElementById("family-kind"),
  familyEquation: document.getElementById("family-equation"),
  familySeed: document.getElementById("family-seed"),
  nFoldControl: document.getElementById("n-fold-control"),
  nFoldCount: document.getElementById("n-fold-count"),
  nFoldCountValue: document.getElementById("n-fold-count-value"),
  customEquationControls: document.getElementById("custom-equation-controls"),
  customEquation: document.getElementById("custom-equation"),
  customXMin: document.getElementById("custom-x-min"),
  customXMax: document.getElementById("custom-x-max"),
  customRMin: document.getElementById("custom-r-min"),
  customRMax: document.getElementById("custom-r-max"),
  customEquationError: document.getElementById("custom-equation-error"),
  applyCustomEquation: document.getElementById("apply-custom-equation"),
  pitchforkControls: document.getElementById("pitchfork-controls"),
  pitchforkCase: document.getElementById("pitchfork-case"),
  pitchforkSigns: document.getElementById("pitchfork-signs"),
  pitchforkTimeSign: document.getElementById("pitchfork-time-sign"),
  pitchforkAlpha: document.getElementById("pitchfork-alpha"),
  pitchforkAlphaValue: document.getElementById("pitchfork-alpha-value"),
  playPitchforkAlpha: document.getElementById("play-pitchfork-alpha"),
  pitchforkBeta: document.getElementById("pitchfork-beta"),
  pitchforkBetaValue: document.getElementById("pitchfork-beta-value"),
  playPitchforkBeta: document.getElementById("play-pitchfork-beta"),
  parameter: document.getElementById("parameter-r"),
  parameterValue: document.getElementById("parameter-r-value"),
  toggleSweep: document.getElementById("toggle-sweep"),
  centerParameter: document.getElementById("center-parameter"),
  sweepSpeed: document.getElementById("sweep-speed"),
  sweepSpeedValue: document.getElementById("sweep-speed-value"),
  candidateSelect: document.getElementById("candidate-select"),
  focusCandidate: document.getElementById("focus-candidate"),
  fitBranches: document.getElementById("fit-branches"),
  resetParticles: document.getElementById("reset-particles"),
  toggleParticles: document.getElementById("toggle-particles"),
  runHysteresis: document.getElementById("run-hysteresis"),
  hysteresisPanelButton: document.getElementById("hysteresis-panel-button"),
  stageStatus: document.getElementById("stage-status"),
  slopeParameter: document.getElementById("slope-parameter-label"),
  equilibriumSummary: document.getElementById("equilibrium-summary"),
  phaseReadout: document.getElementById("phase-readout"),
  telemetryFamily: document.getElementById("telemetry-family"),
  telemetryR: document.getElementById("telemetry-r"),
  telemetryEquilibria: document.getElementById("telemetry-equilibria"),
  telemetryEvent: document.getElementById("telemetry-event"),
  localPopover: document.getElementById("local-popover"),
  localPopoverTitle: document.getElementById("local-popover-title"),
  closeLocalPopover: document.getElementById("close-local-popover"),
  microscopeDescription: document.getElementById("microscope-description"),
  taylorLegend: document.getElementById("taylor-legend"),
  classificationBadge: document.getElementById("classification-badge"),
  candidateCoordinate: document.getElementById("candidate-coordinate"),
  derivativeGrid: document.getElementById("derivative-grid"),
  taylorFormula: document.getElementById("taylor-formula"),
  normalFormula: document.getElementById("normal-formula"),
  classificationNote: document.getElementById("classification-note"),
  hysteresisStatus: document.getElementById("hysteresis-status"),
  hysteresisDirection: document.getElementById("hysteresis-direction"),
  hysteresisState: document.getElementById("hysteresis-state"),
  hysteresisMemory: document.getElementById("hysteresis-memory"),
  hysteresisControls: document.getElementById("hysteresis-controls"),
  hysteresisPanel: document.getElementById("hysteresis-panel"),
  announcer: document.getElementById("bifurcation-announcer"),
  bifurcationCanvas: document.getElementById("bifurcation-canvas"),
  slopeCanvas: document.getElementById("slope-canvas"),
  phaseCanvas: document.getElementById("phase-canvas"),
  microscopeCanvas: document.getElementById("microscope-canvas"),
  hysteresisCanvas: document.getElementById("hysteresis-canvas")
};

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = {
  seedCounter: 0,
  seed: makeSeed(),
  family: null,
  diagram: null,
  candidates: [],
  selectedCandidate: -1,
  taylor: null,
  microscope: null,
  microscopeView: null,
  microscopePlotBox: null,
  microscopePointer: null,
  r: 0,
  pendingR: null,
  equilibria: [],
  fullView: null,
  view: null,
  sweepRunning: false,
  sweepDirection: 1,
  sweepSpeed: Number(elements.sweepSpeed.value),
  particlesPaused: motionQuery.matches,
  particles: [],
  particleCursor: 0,
  particleEmitterElapsed: 0,
  particleEmitterIndex: 0,
  particleClock: 0,
  extraSlopeInitials: [],
  slopeCursorX: 0,
  phaseCursorX: 0,
  calculationToken: 0,
  pitchforkMorph: null,
  pitchforkPlayers: {
    alpha: { playing: false, direction: 1, lastAt: 0 },
    beta: { playing: false, direction: 1, lastAt: 0 }
  },
  pointerDragging: false,
  pointerStart: null,
  pointerMoved: false,
  plotBox: null,
  candidateScreens: [],
  lastSliceUpdate: 0,
  lastFrameTime: performance.now(),
  lastRenderTime: 0,
  elapsed: 0,
  localDirty: true,
  localPopoverOpen: false,
  localPopoverNeedsPosition: false,
  localPopoverTrigger: null,
  fullscreenActive: false,
  fullscreenInitialized: false,
  hysteresisDirty: true,
  hysteresis: {
    running: false,
    direction: 1,
    x: 0,
    increasing: [],
    decreasing: [],
    cycles: 0,
    lastRecordedAt: 0
  }
};

function makeSeed() {
  const time = Date.now().toString(36).toUpperCase();
  const salt = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0").toUpperCase();
  return `${time.slice(-5)}-${salt}`;
}

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
  const threshold = 10 ** (-(digits + 1));
  const clean = Math.abs(value) < threshold ? 0 : value;
  if (Math.abs(clean) >= 1000 || (Math.abs(clean) > 0 && Math.abs(clean) < 0.001)) {
    return clean.toExponential(2).replace("e+", "e");
  }
  const formatted = clean.toFixed(digits);
  return Number(formatted) === 0 ? formatted.replace(/^-/, "") : formatted;
}

function bifurcationStatus(count, pointOutsideView = false) {
  const pointText = count === 0
    ? "no bifurcation points detected"
    : `${count} bifurcation ${count === 1 ? "point" : "points"} marked`;
  return `Ready · ${pointText}${pointOutsideView ? " · selected point is outside the current view" : ""}`;
}

function titleCase(text) {
  return String(text)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function announce(message) {
  window.clearTimeout(announce.timeout);
  announce.timeout = window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 180);
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

function redrawAfterFullscreenChange() {
  drawBifurcationDiagram();
  drawSlopeField();
  drawPhaseLine();
  if (state.localPopoverOpen) {
    state.localPopoverNeedsPosition = true;
    drawLocalDiagram();
    positionLocalPopover();
  }
  if (!elements.hysteresisPanel.hidden) drawHysteresisPanel();
}

function scheduleFullscreenResize() {
  window.requestAnimationFrame(() => {
    redrawAfterFullscreenChange();
    window.requestAnimationFrame(redrawAfterFullscreenChange);
  });
}

function syncFullscreenState(options = {}) {
  const wasActive = state.fullscreenActive;
  const isActive = currentFullscreenElement() === elements.workspace;
  state.fullscreenActive = isActive;
  elements.workspace?.classList.toggle("is-fullscreen", isActive);
  if (elements.fullscreenToggle) {
    elements.fullscreenToggle.setAttribute("aria-label", isActive ? "Exit full screen" : "Enter full screen");
    elements.fullscreenToggle.title = isActive ? "Exit full screen" : "Enter full screen";
  }
  if (elements.fullscreenLabel) {
    elements.fullscreenLabel.textContent = isActive ? "Exit full screen" : "Full screen";
  }
  if (options.scheduleResize !== false) scheduleFullscreenResize();
  if (state.fullscreenInitialized && isActive !== wasActive && options.announceChange !== false) {
    announce(isActive ? "Full screen view opened." : "Full screen view closed.");
  }
  state.fullscreenInitialized = true;
  return isActive;
}

function initializeFullscreenControl() {
  const supported = fullscreenSupported();
  if (elements.fullscreenToggle) elements.fullscreenToggle.hidden = !supported;
  syncFullscreenState({ announceChange: false, scheduleResize: false });
  return supported;
}

function reportFullscreenError(error) {
  if (error) console.warn("Full screen could not change.", error);
  const now = performance.now();
  if (Number.isFinite(reportFullscreenError.lastAt) && now - reportFullscreenError.lastAt < 500) return;
  reportFullscreenError.lastAt = now;
  announce("Full screen could not change in this browser.");
  syncFullscreenState({ announceChange: false });
}

function toggleWorkspaceFullscreen() {
  if (!fullscreenSupported()) {
    announce("Full screen is not available in this browser.");
    return Promise.resolve(false);
  }
  const active = currentFullscreenElement() === elements.workspace;
  const action = active
    ? document.exitFullscreen || document.webkitExitFullscreen
    : elements.workspace.requestFullscreen || elements.workspace.webkitRequestFullscreen;
  const receiver = active ? document : elements.workspace;
  try {
    return Promise.resolve(action.call(receiver)).then(() => true).catch((error) => {
      reportFullscreenError(error);
      return false;
    });
  } catch (error) {
    reportFullscreenError(error);
    return Promise.resolve(false);
  }
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
  return { context, width, height, ratio };
}

function plotRectangle(width, height, compact = false) {
  return {
    left: compact ? 43 : 52,
    right: width - (compact ? 16 : 22),
    top: compact ? 20 : 24,
    bottom: height - (compact ? 36 : 43)
  };
}

function mapHorizontal(value, minimum, maximum, box) {
  return lerp(box.left, box.right, inverseLerp(minimum, maximum, value));
}

function mapVertical(value, minimum, maximum, box) {
  return lerp(box.bottom, box.top, inverseLerp(minimum, maximum, value));
}

function valueFromHorizontal(pixel, minimum, maximum, box) {
  return lerp(minimum, maximum, inverseLerp(box.left, box.right, pixel));
}

function valueFromVertical(pixel, minimum, maximum, box) {
  return lerp(minimum, maximum, inverseLerp(box.bottom, box.top, pixel));
}

function niceTicks(minimum, maximum, desired = 6) {
  const span = Math.max(1e-12, maximum - minimum);
  const raw = span / desired;
  const exponent = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / exponent;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * exponent;
  const first = Math.ceil(minimum / step) * step;
  const ticks = [];
  for (let value = first; value <= maximum + step * 0.25; value += step) ticks.push(value);
  return ticks;
}

function drawAxes(context, box, xRange, yRange, options = {}) {
  const dark = Boolean(options.dark);
  const gridColor = dark ? COLORS.grid : COLORS.gridLight;
  const axisColor = dark ? "rgba(231, 246, 241, 0.42)" : "rgba(23, 33, 29, 0.42)";
  const labelColor = dark ? "rgba(231, 246, 241, 0.68)" : COLORS.muted;
  context.save();
  context.font = "11px 'IBM Plex Mono', monospace";
  context.textBaseline = "top";
  for (const value of niceTicks(xRange[0], xRange[1], 6)) {
    const x = mapHorizontal(value, xRange[0], xRange[1], box);
    context.strokeStyle = gridColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
    context.fillStyle = labelColor;
    context.textAlign = "center";
    context.fillText(formatNumber(value, Math.abs(value) < 10 ? 1 : 0), x, box.bottom + 9);
  }
  context.textBaseline = "middle";
  for (const value of niceTicks(yRange[0], yRange[1], 6)) {
    const y = mapVertical(value, yRange[0], yRange[1], box);
    context.strokeStyle = gridColor;
    context.beginPath();
    context.moveTo(box.left, y);
    context.lineTo(box.right, y);
    context.stroke();
    context.fillStyle = labelColor;
    context.textAlign = "right";
    context.fillText(formatNumber(value, Math.abs(value) < 10 ? 1 : 0), box.left - 8, y);
  }
  context.strokeStyle = axisColor;
  context.lineWidth = 1;
  context.strokeRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  if (xRange[0] <= 0 && xRange[1] >= 0) {
    const x = mapHorizontal(0, xRange[0], xRange[1], box);
    context.beginPath();
    context.moveTo(x, box.top);
    context.lineTo(x, box.bottom);
    context.stroke();
  }
  if (yRange[0] <= 0 && yRange[1] >= 0) {
    const y = mapVertical(0, yRange[0], yRange[1], box);
    context.beginPath();
    context.moveTo(box.left, y);
    context.lineTo(box.right, y);
    context.stroke();
  }
  context.fillStyle = labelColor;
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText(options.xLabel || "r", box.right, box.bottom - 7);
  context.save();
  context.translate(box.left + 10, box.top + 4);
  context.rotate(-Math.PI / 2);
  context.textAlign = "right";
  context.fillText(options.yLabel || "x", 0, 0);
  context.restore();
  context.restore();
}

function branchStyle(stability, onDark = false) {
  if (String(stability).startsWith("stable")) {
    return { color: onDark ? COLORS.stableBright : COLORS.stable, dash: [], width: 2.5 };
  }
  if (String(stability).startsWith("unstable")) {
    return { color: onDark ? COLORS.unstableBright : COLORS.unstable, dash: [7, 5], width: 2.2 };
  }
  return { color: onDark ? COLORS.currentBright : COLORS.current, dash: [2, 5], width: 2.2 };
}

function sameBranchStyle(left, right) {
  if (!left || !right) return false;
  const leftDash = left.dash || [];
  const rightDash = right.dash || [];
  return (
    left.color === right.color &&
    (left.width || 2) === (right.width || 2) &&
    leftDash.length === rightDash.length &&
    leftDash.every((value, index) => value === rightDash[index])
  );
}

function drawBranchCollection(context, branches, ranges, box, options = {}) {
  context.save();
  context.beginPath();
  context.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  context.clip();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = options.alpha ?? 1;
  for (const branch of branches || []) {
    const points = branch.points || [];
    let activeStyle = null;
    let pathOpen = false;
    const strokePath = () => {
      if (!pathOpen || !activeStyle) return;
      context.strokeStyle = activeStyle.color;
      context.lineWidth = activeStyle.width || 2;
      context.setLineDash(activeStyle.dash || []);
      context.stroke();
      pathOpen = false;
    };
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const style = options.fixedStyle || branchStyle(current.stability, options.onDark);
      if (!sameBranchStyle(style, activeStyle)) {
        strokePath();
        activeStyle = style;
        context.beginPath();
        context.moveTo(
          mapHorizontal(previous.r, ranges.rMin, ranges.rMax, box),
          mapVertical(previous.x, ranges.xMin, ranges.xMax, box)
        );
      }
      context.lineTo(
        mapHorizontal(current.r, ranges.rMin, ranges.rMax, box),
        mapVertical(current.x, ranges.xMin, ranges.xMax, box)
      );
      pathOpen = true;
    }
    strokePath();
  }
  context.restore();
}

function drawDiamond(context, x, y, size, fill, stroke = COLORS.ivory) {
  context.save();
  context.translate(x, y);
  context.rotate(Math.PI / 4);
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = 1.5;
  context.beginPath();
  context.rect(-size / 2, -size / 2, size, size);
  context.fill();
  context.stroke();
  context.restore();
}

function drawEquilibriumMarker(context, x, y, equilibrium, radius = 5, dark = false) {
  const stable = String(equilibrium.stability).startsWith("stable");
  const unstable = String(equilibrium.stability).startsWith("unstable");
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = stable ? COLORS.stable : unstable ? COLORS.unstable : COLORS.current;
  context.fillStyle = stable ? COLORS.stable : dark ? COLORS.plot : COLORS.paper;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  if (!stable && !unstable) {
    context.beginPath();
    context.moveTo(x - radius, y);
    context.lineTo(x + radius, y);
    context.stroke();
  }
  context.restore();
}

function drawFlowParticles(context, project, options = {}) {
  if (!state.view) return;
  context.save();
  if (options.clip) {
    context.beginPath();
    context.rect(
      options.clip.left,
      options.clip.top,
      options.clip.right - options.clip.left,
      options.clip.bottom - options.clip.top
    );
    context.clip();
  }
  for (const particle of state.particles) {
    if (!Number.isFinite(particle.x) || particle.x < state.view.xMin || particle.x > state.view.xMax) continue;
    for (let index = 1; index < particle.trail.length; index += 1) {
      const previous = particle.trail[index - 1];
      const current = particle.trail[index];
      if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
      const start = project(previous, particle.lane);
      const end = project(current, particle.lane);
      const alpha = index / particle.trail.length;
      context.strokeStyle = `rgba(217, 167, 63, ${alpha * 0.24})`;
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    const point = project(particle.x, particle.lane);
    context.fillStyle = COLORS.current;
    context.strokeStyle = COLORS.ivory;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawHysteresisTrail(context, trail, ranges, box, color, width = 2.8, dash = []) {
  if (!trail || trail.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.setLineDash(dash);
  context.beginPath();
  let drawing = false;
  for (const point of trail) {
    if (
      point.r < ranges.rMin || point.r > ranges.rMax ||
      point.x < ranges.xMin || point.x > ranges.xMax
    ) {
      drawing = false;
      continue;
    }
    const x = mapHorizontal(point.r, ranges.rMin, ranges.rMax, box);
    const y = mapVertical(point.x, ranges.xMin, ranges.xMax, box);
    if (!drawing) context.moveTo(x, y);
    else context.lineTo(x, y);
    drawing = true;
  }
  context.stroke();
  context.restore();
}

function drawBifurcationDiagram() {
  const { context, width, height } = canvasSurface(elements.bifurcationCanvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);
  if (!state.diagram || !state.view) return;
  const box = plotRectangle(width, height);
  state.plotBox = box;
  const ranges = state.view;
  drawAxes(context, box, [ranges.rMin, ranges.rMax], [ranges.xMin, ranges.xMax], {
    xLabel: "parameter r",
    yLabel: "equilibrium x"
  });
  drawBranchCollection(context, state.diagram.branches, ranges, box);

  drawHysteresisTrail(context, state.hysteresis.increasing, ranges, box, COLORS.current, 3.2);
  drawHysteresisTrail(context, state.hysteresis.decreasing, ranges, box, COLORS.backwardLight, 3.2, [7, 5]);

  if (state.r >= ranges.rMin && state.r <= ranges.rMax) {
    const currentX = mapHorizontal(state.r, ranges.rMin, ranges.rMax, box);
    context.save();
    context.strokeStyle = COLORS.current;
    context.lineWidth = 1.6;
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(currentX, box.top);
    context.lineTo(currentX, box.bottom);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = COLORS.current;
    context.beginPath();
    context.moveTo(currentX - 6, box.top);
    context.lineTo(currentX + 6, box.top);
    context.lineTo(currentX, box.top + 8);
    context.closePath();
    context.fill();
    context.restore();
    for (const equilibrium of state.equilibria) {
      if (equilibrium.x < ranges.xMin || equilibrium.x > ranges.xMax) continue;
      drawEquilibriumMarker(
        context,
        currentX,
        mapVertical(equilibrium.x, ranges.xMin, ranges.xMax, box),
        equilibrium,
        6,
        false
      );
    }
    drawFlowParticles(
      context,
      (value, lane) => ({
        x: currentX + lane,
        y: mapVertical(value, ranges.xMin, ranges.xMax, box)
      }),
      { clip: box }
    );
  } else {
    const pointsRight = state.r > ranges.rMax;
    const edgeX = pointsRight ? box.right : box.left;
    context.save();
    context.fillStyle = COLORS.current;
    context.font = "600 9px 'IBM Plex Mono', monospace";
    context.textAlign = pointsRight ? "right" : "left";
    context.textBaseline = "top";
    context.fillText(pointsRight ? "CURRENT r →" : "← CURRENT r", edgeX, box.top + 7);
    context.beginPath();
    if (pointsRight) {
      context.moveTo(edgeX, box.top + 24);
      context.lineTo(edgeX - 9, box.top + 19);
      context.lineTo(edgeX - 9, box.top + 29);
    } else {
      context.moveTo(edgeX, box.top + 24);
      context.lineTo(edgeX + 9, box.top + 19);
      context.lineTo(edgeX + 9, box.top + 29);
    }
    context.closePath();
    context.fill();
    context.restore();
  }

  if (state.hysteresis.running && Number.isFinite(state.hysteresis.x)) {
    const x = mapHorizontal(state.r, ranges.rMin, ranges.rMax, box);
    const y = mapVertical(state.hysteresis.x, ranges.xMin, ranges.xMax, box);
    context.fillStyle = state.hysteresis.direction > 0 ? COLORS.currentBright : COLORS.backward;
    context.strokeStyle = COLORS.ivory;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 6.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  state.candidateScreens = [];
  state.candidates.forEach((candidate, index) => {
    if (
      candidate.r < ranges.rMin || candidate.r > ranges.rMax ||
      candidate.x < ranges.xMin || candidate.x > ranges.xMax
    ) return;
    const x = mapHorizontal(candidate.r, ranges.rMin, ranges.rMax, box);
    const y = mapVertical(candidate.x, ranges.xMin, ranges.xMax, box);
    state.candidateScreens.push({ index, x, y });
    if (index === state.selectedCandidate) {
      context.fillStyle = "rgba(217, 167, 63, 0.18)";
      context.beginPath();
      context.arc(x, y, 18, 0, Math.PI * 2);
      context.fill();
    }
    drawDiamond(context, x, y, index === state.selectedCandidate ? 12 : 9, COLORS.current);
    context.fillStyle = COLORS.ink;
    context.font = "600 10px 'IBM Plex Mono', monospace";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(`B${index + 1}`, x + 9, y - 7);
  });
  if (state.localPopoverOpen && state.localPopoverNeedsPosition) {
    positionLocalPopover();
  }
}

function trajectoryPoints(x0, r, duration = 6, step = 0.035) {
  const points = [{ t: 0, x: x0 }];
  let x = x0;
  for (let t = step; t <= duration + 1e-9; t += step) {
    x = rk4Step(state.family, x, r, step);
    const margin = (state.view.xMax - state.view.xMin) * 0.05;
    if (!Number.isFinite(x) || x < state.view.xMin - margin || x > state.view.xMax + margin) break;
    points.push({ t, x });
  }
  return points;
}

function drawSlopeField() {
  const { context, width, height } = canvasSurface(elements.slopeCanvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.plot;
  context.fillRect(0, 0, width, height);
  if (!state.family || !state.view) return;
  const box = plotRectangle(width, height);
  const timeRange = [0, 6];
  const xRange = [state.view.xMin, state.view.xMax];
  drawAxes(context, box, timeRange, xRange, { dark: true, xLabel: "time t", yLabel: "state x" });

  const columns = Math.max(10, Math.floor((box.right - box.left) / 38));
  const rows = Math.max(11, Math.floor((box.bottom - box.top) / 29));
  const segmentLength = 10;
  context.save();
  context.lineCap = "round";
  for (let column = 0; column <= columns; column += 1) {
    const t = lerp(timeRange[0], timeRange[1], column / columns);
    const centerX = mapHorizontal(t, timeRange[0], timeRange[1], box);
    for (let row = 0; row <= rows; row += 1) {
      const xValue = lerp(xRange[0], xRange[1], row / rows);
      const centerY = mapVertical(xValue, xRange[0], xRange[1], box);
      const slope = state.family.eval(xValue, state.r);
      const screenDx = (box.right - box.left) / (timeRange[1] - timeRange[0]);
      const screenDy = -slope * (box.bottom - box.top) / (xRange[1] - xRange[0]);
      const norm = Math.max(1e-9, Math.hypot(screenDx, screenDy));
      const dx = segmentLength * screenDx / norm;
      const dy = segmentLength * screenDy / norm;
      context.strokeStyle = slope >= 0 ? "rgba(121, 216, 197, 0.52)" : "rgba(240, 177, 139, 0.52)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(centerX - dx, centerY - dy);
      context.lineTo(centerX + dx, centerY + dy);
      context.stroke();
    }
  }
  context.restore();

  for (const equilibrium of state.equilibria) {
    if (equilibrium.x < xRange[0] || equilibrium.x > xRange[1]) continue;
    const y = mapVertical(equilibrium.x, xRange[0], xRange[1], box);
    const style = branchStyle(equilibrium.stability, true);
    context.save();
    context.strokeStyle = style.color;
    context.lineWidth = 1.4;
    context.setLineDash(style.dash);
    context.globalAlpha = 0.75;
    context.beginPath();
    context.moveTo(box.left, y);
    context.lineTo(box.right, y);
    context.stroke();
    context.restore();
  }

  const starts = [];
  for (let index = 1; index <= 9; index += 1) {
    starts.push(lerp(xRange[0], xRange[1], index / 10));
  }
  starts.push(...state.extraSlopeInitials.slice(-4));
  for (let index = 0; index < starts.length; index += 1) {
    const points = trajectoryPoints(starts[index], state.r);
    if (points.length < 2) continue;
    context.save();
    context.strokeStyle = "rgba(255, 253, 247, 0.50)";
    context.lineWidth = 1.35;
    context.beginPath();
    points.forEach((point, pointIndex) => {
      const x = mapHorizontal(point.t, timeRange[0], timeRange[1], box);
      const y = mapVertical(point.x, xRange[0], xRange[1], box);
      if (!pointIndex) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    const tracerClock = state.particleClock;
    const tracer = points[Math.min(points.length - 1, Math.floor((tracerClock * 34 + index * 13) % points.length))];
    context.fillStyle = COLORS.ivory;
    context.beginPath();
    context.arc(
      mapHorizontal(tracer.t, timeRange[0], timeRange[1], box),
      mapVertical(tracer.x, xRange[0], xRange[1], box),
      2.7,
      0,
      Math.PI * 2
    );
    context.fill();
    context.restore();
  }

  // Constant solutions deserve their own visible trajectories. New markers
  // enter periodically at t = 0 and move horizontally because x(t) never
  // changes when the initial state is exactly an equilibrium.
  const equilibriumTravelTime = 4.8;
  const equilibriumSpawnInterval = 1.35;
  const equilibriumSlots = 4;
  const equilibriumCycle = equilibriumSpawnInterval * equilibriumSlots;
  state.equilibria.forEach((equilibrium, equilibriumIndex) => {
    if (equilibrium.x < xRange[0] || equilibrium.x > xRange[1]) return;
    const y = mapVertical(equilibrium.x, xRange[0], xRange[1], box);
    for (let slot = 0; slot < equilibriumSlots; slot += 1) {
      const rawAge = state.particleClock + equilibriumIndex * 0.17 - slot * equilibriumSpawnInterval;
      const age = ((rawAge % equilibriumCycle) + equilibriumCycle) % equilibriumCycle;
      if (age > equilibriumTravelTime) continue;
      const t = timeRange[1] * age / equilibriumTravelTime;
      context.save();
      context.fillStyle = COLORS.currentBright;
      context.strokeStyle = COLORS.ivory;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(mapHorizontal(t, timeRange[0], timeRange[1], box), y, 3.6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }
  });

  if (Number.isFinite(state.slopeCursorX)) {
    const cursorY = mapVertical(state.slopeCursorX, xRange[0], xRange[1], box);
    context.save();
    context.fillStyle = COLORS.currentBright;
    context.beginPath();
    context.moveTo(box.left - 2, cursorY);
    context.lineTo(box.left - 12, cursorY - 6);
    context.lineTo(box.left - 12, cursorY + 6);
    context.closePath();
    context.fill();
    context.restore();
  }
}

function phaseX(value, width) {
  const left = 42;
  const right = width - 42;
  return lerp(left, right, inverseLerp(state.view.xMin, state.view.xMax, value));
}

function drawArrow(context, x, y, direction, length = 26) {
  const half = length / 2;
  const start = x - direction * half;
  const end = x + direction * half;
  context.beginPath();
  context.moveTo(start, y);
  context.lineTo(end, y);
  context.lineTo(end - direction * 6, y - 4);
  context.moveTo(end, y);
  context.lineTo(end - direction * 6, y + 4);
  context.stroke();
}

function drawPhaseLine() {
  const { context, width, height } = canvasSurface(elements.phaseCanvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, width, height);
  if (!state.family || !state.view) return;
  const lineY = Math.round(height * 0.48);
  const left = 42;
  const right = width - 42;
  context.strokeStyle = "rgba(23, 33, 29, 0.55)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(left, lineY);
  context.lineTo(right, lineY);
  context.stroke();

  context.font = "11px 'IBM Plex Mono', monospace";
  context.textAlign = "center";
  context.fillStyle = COLORS.muted;
  for (const tick of niceTicks(state.view.xMin, state.view.xMax, 8)) {
    const x = phaseX(tick, width);
    context.beginPath();
    context.moveTo(x, lineY - 5);
    context.lineTo(x, lineY + 5);
    context.stroke();
    context.fillText(formatNumber(tick, 1), x, lineY + 17);
  }

  const boundaries = [state.view.xMin, ...state.equilibria.map((equilibrium) => equilibrium.x), state.view.xMax];
  context.strokeStyle = COLORS.forest;
  context.lineWidth = 1.5;
  for (let index = 1; index < boundaries.length; index += 1) {
    const minimum = boundaries[index - 1];
    const maximum = boundaries[index];
    if (maximum - minimum < (state.view.xMax - state.view.xMin) * 0.015) continue;
    const midpoint = (minimum + maximum) / 2;
    const direction = Math.sign(state.family.eval(midpoint, state.r));
    if (!direction) continue;
    const available = phaseX(maximum, width) - phaseX(minimum, width);
    const count = Math.max(1, Math.min(4, Math.floor(available / 85)));
    for (let arrow = 0; arrow < count; arrow += 1) {
      const fraction = (arrow + 1) / (count + 1);
      drawArrow(context, phaseX(lerp(minimum, maximum, fraction), width), lineY, direction, Math.min(30, available * 0.34));
    }
  }

  for (const equilibrium of state.equilibria) {
    const x = phaseX(equilibrium.x, width);
    drawEquilibriumMarker(context, x, lineY, equilibrium, 7, false);
    context.fillStyle = String(equilibrium.stability).startsWith("stable") ? COLORS.forest : COLORS.unstable;
    context.font = "600 10px 'IBM Plex Mono', monospace";
    context.fillText(
      String(equilibrium.stability).startsWith("stable") ? "STABLE" : String(equilibrium.stability).startsWith("unstable") ? "UNSTABLE" : "NONHYP.",
      x,
      lineY - 18
    );
  }

  drawFlowParticles(context, (value, lane) => ({
    x: phaseX(value, width),
    y: lineY + lane
  }), { clip: { left, right, top: 0, bottom: height } });

  if (Number.isFinite(state.phaseCursorX)) {
    const cursorX = phaseX(state.phaseCursorX, width);
    context.save();
    context.fillStyle = COLORS.current;
    context.beginPath();
    context.moveTo(cursorX, lineY + 30);
    context.lineTo(cursorX - 6, lineY + 40);
    context.lineTo(cursorX + 6, lineY + 40);
    context.closePath();
    context.fill();
    context.restore();
  }
}

function drawLocalDiagram() {
  if (!state.localPopoverOpen || elements.localPopover.hidden) return;
  const { context, width, height } = canvasSurface(elements.microscopeCanvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.plot;
  context.fillRect(0, 0, width, height);
  if (!state.microscope) {
    context.fillStyle = "rgba(231, 240, 236, 0.7)";
    context.font = "13px 'IBM Plex Mono', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("SELECT A NUMBERED BIFURCATION POINT", width / 2, height / 2);
    return;
  }
  const box = plotRectangle(width, height, true);
  state.microscopePlotBox = box;
  const ranges = state.microscopeView || state.microscope.ranges;
  drawAxes(context, box, [ranges.rMin, ranges.rMax], [ranges.xMin, ranges.xMax], {
    dark: true,
    xLabel: "μ = r − r*",
    yLabel: "y = x − x*"
  });

  function drawImplicitModel(family, style) {
    if (!family) return;
    const plotWidth = Math.max(1, box.right - box.left);
    const plotHeight = Math.max(1, box.bottom - box.top);
    const singularVisible = ranges.rMin <= 0 && ranges.rMax >= 0 && ranges.xMin <= 0 && ranges.xMax >= 0;
    const contour = sampleZeroContour(
      (y, mu) => family.eval(y + state.microscope.center.x, mu + state.microscope.center.r),
      ranges,
      {
        rCells: clamp(Math.ceil(plotWidth / 2.35), 72, 260),
        xCells: clamp(Math.ceil(plotHeight / 2.35), 56, 180),
        rAnchors: singularVisible ? [0] : [],
        xAnchors: singularVisible ? [0] : [],
        singularPoints: singularVisible ? [{ r: 0, x: 0 }] : []
      }
    );
    context.save();
    context.beginPath();
    context.rect(box.left, box.top, plotWidth, plotHeight);
    context.clip();
    context.strokeStyle = style.color;
    context.lineWidth = style.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(style.dash || []);
    context.beginPath();
    for (const segment of contour.segments) {
      context.moveTo(
        mapHorizontal(segment[0].r, ranges.rMin, ranges.rMax, box),
        mapVertical(segment[0].x, ranges.xMin, ranges.xMax, box)
      );
      context.lineTo(
        mapHorizontal(segment[1].r, ranges.rMin, ranges.rMax, box),
        mapVertical(segment[1].x, ranges.xMin, ranges.xMax, box)
      );
    }
    context.stroke();
    context.restore();
  }
  drawImplicitModel(state.microscope.exactFamily, { color: COLORS.ivory, dash: [], width: 3 });
  drawImplicitModel(state.microscope.taylorFamily, { color: COLORS.stableBright, dash: [7, 5], width: 2.2 });
  drawImplicitModel(state.microscope.normalFamily, { color: COLORS.normal, dash: [2, 5], width: 2.2 });

  if (ranges.rMin <= 0 && ranges.rMax >= 0 && ranges.xMin <= 0 && ranges.xMax >= 0) {
    const centerX = mapHorizontal(0, ranges.rMin, ranges.rMax, box);
    const centerY = mapVertical(0, ranges.xMin, ranges.xMax, box);
    drawDiamond(context, centerX, centerY, 10, COLORS.currentBright);
  }
}

function drawHysteresisPanel() {
  if (elements.hysteresisPanel.hidden) return;
  const { context, width, height } = canvasSurface(elements.hysteresisCanvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.plot;
  context.fillRect(0, 0, width, height);
  const box = plotRectangle(width, height, true);
  const familyIsHysteresis = state.family?.supportsHysteresis;
  if (!familyIsHysteresis || !state.diagram) {
    context.fillStyle = "rgba(231, 240, 236, 0.7)";
    context.font = "13px 'IBM Plex Mono', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("LOAD THE FOLD-PAIR PRESET TO RECORD A LOOP", width / 2, height / 2);
    return;
  }
  const ranges = state.fullView;
  drawAxes(context, box, [ranges.rMin, ranges.rMax], [ranges.xMin, ranges.xMax], {
    dark: true,
    xLabel: "parameter r",
    yLabel: "tracked state x"
  });
  drawBranchCollection(context, state.diagram.branches, ranges, box, { alpha: 0.52, onDark: true });
  drawHysteresisTrail(context, state.hysteresis.increasing, ranges, box, COLORS.currentBright, 3.3);
  drawHysteresisTrail(context, state.hysteresis.decreasing, ranges, box, COLORS.backward, 3.3, [7, 5]);

  state.candidates.forEach((candidate, index) => {
    if (
      candidate.r < ranges.rMin || candidate.r > ranges.rMax ||
      candidate.x < ranges.xMin || candidate.x > ranges.xMax
    ) return;
    const x = mapHorizontal(candidate.r, ranges.rMin, ranges.rMax, box);
    const y = mapVertical(candidate.x, ranges.xMin, ranges.xMax, box);
    drawDiamond(context, x, y, 8, COLORS.currentBright, COLORS.ivory);
    context.fillStyle = "rgba(231, 240, 236, 0.82)";
    context.font = "9px 'IBM Plex Mono', monospace";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(`F${index + 1}`, x + 7, y - 5);
  });
  const markerPoints = [];
  if (!state.hysteresis.running && state.hysteresis.cycles > 0) {
    const increasing = nearestTracePoint(state.hysteresis.increasing, state.r);
    const decreasing = nearestTracePoint(state.hysteresis.decreasing, state.r);
    if (increasing) markerPoints.push({ x: increasing.x, color: COLORS.currentBright });
    if (decreasing) markerPoints.push({ x: decreasing.x, color: COLORS.backward });
  } else if (Number.isFinite(state.hysteresis.x) && (
    state.hysteresis.running ||
    state.hysteresis.increasing.length ||
    state.hysteresis.decreasing.length
  )) {
    markerPoints.push({
      x: state.hysteresis.x,
      color: state.hysteresis.direction > 0 ? COLORS.currentBright : COLORS.backward
    });
  }
  for (const marker of markerPoints) {
    const x = mapHorizontal(state.r, ranges.rMin, ranges.rMax, box);
    const y = mapVertical(marker.x, ranges.xMin, ranges.xMax, box);
    context.fillStyle = marker.color;
    context.strokeStyle = COLORS.ivory;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}

function randomParticleStart() {
  const count = 13;
  const index = state.particleCursor % count;
  state.particleCursor += 1;
  return lerp(state.view.xMin, state.view.xMax, (index + 1) / (count + 1));
}

const PARTICLE_EMISSION_INTERVAL = 0.45;

function emitterParticleStart(slot) {
  const span = state.view.xMax - state.view.xMin;
  const targetFlow = span * 0.12 / 1.45;
  const candidates = [];
  for (let index = 2; index <= 46; index += 1) {
    const x = lerp(state.view.xMin, state.view.xMax, index / 48);
    const flow = Math.abs(state.family.eval(x, state.r));
    if (!Number.isFinite(flow)) continue;
    candidates.push({
      x,
      score: Math.abs(Math.log((flow + 1e-12) / (targetFlow + 1e-12)))
    });
  }
  candidates.sort((left, right) => left.score - right.score);
  const launchPool = candidates.slice(0, Math.min(6, candidates.length));
  return launchPool.length ? launchPool[slot % launchPool.length].x : randomParticleStart();
}

function resetParticles() {
  state.particleCursor = 0;
  state.particleEmitterElapsed = PARTICLE_EMISSION_INTERVAL;
  state.particleEmitterIndex = 0;
  state.particleClock = 0;
  state.particles = Array.from({ length: 11 }, (_, index) => {
    const x = lerp(state.view.xMin, state.view.xMax, (index + 1) / 12);
    return {
      x,
      age: index * 0.28,
      settledFor: 0,
      respawnDelay: 0.55 + (index % 5) * 0.14,
      ambient: true,
      lane: ((index % 3) - 1) * 9,
      trail: [x]
    };
  });
  state.extraSlopeInitials = [];
}

function respawnParticle(particle, start = randomParticleStart()) {
  const x = start;
  particle.x = x;
  particle.age = 0;
  particle.settledFor = 0;
  particle.trail = [x];
}

function updateParticles(delta) {
  if (state.particlesPaused || !state.family || !state.view) return;
  state.particleClock += delta;
  const stepTotal = Math.min(0.05, delta) * 1.45;
  const substeps = 2;
  const step = stepTotal / substeps;
  const span = state.view.xMax - state.view.xMin;
  for (const particle of state.particles) {
    for (let index = 0; index < substeps; index += 1) {
      particle.x = rk4Step(state.family, particle.x, state.r, step);
    }
    particle.age += delta;
    if (Number.isFinite(particle.x)) {
      particle.trail.push(particle.x);
      if (particle.trail.length > 20) particle.trail.shift();
    }
    const flow = Number.isFinite(particle.x) ? Math.abs(state.family.eval(particle.x, state.r)) : Infinity;
    const visiblySettled = flow < span * 0.0015;
    if (visiblySettled) particle.settledFor = (particle.settledFor || 0) + delta;
    else particle.settledFor = 0;
    if (
      !Number.isFinite(particle.x) ||
      particle.x < state.view.xMin - span * 0.03 ||
      particle.x > state.view.xMax + span * 0.03 ||
      particle.settledFor > (particle.respawnDelay || 0.85) ||
      particle.age > 12
    ) respawnParticle(particle);
  }

  state.particleEmitterElapsed += delta;
  if (state.particleEmitterElapsed >= PARTICLE_EMISSION_INTERVAL) {
    state.particleEmitterElapsed %= PARTICLE_EMISSION_INTERVAL;
    const ambientParticles = state.particles.filter((particle) => particle.ambient);
    if (ambientParticles.length) {
      const particle = ambientParticles[state.particleEmitterIndex % ambientParticles.length];
      const start = emitterParticleStart(state.particleEmitterIndex);
      state.particleEmitterIndex += 1;
      respawnParticle(particle, start);
    }
  }
}

function nearestTracePoint(trace, r) {
  let result = null;
  for (const point of trace) {
    const distance = Math.abs(point.r - r);
    if (!result || distance < result.distance) result = { ...point, distance };
  }
  return result;
}

function updateHysteresis(delta, now) {
  if (!state.hysteresis.running || !state.family?.supportsHysteresis) return;
  state.hysteresisDirty = true;
  const rMin = state.family.rRange[0] + (state.family.rRange[1] - state.family.rRange[0]) * 0.035;
  const rMax = state.family.rRange[1] - (state.family.rRange[1] - state.family.rRange[0]) * 0.035;
  const span = rMax - rMin;
  const duration = 6.5 / Math.max(0.12, state.sweepSpeed);
  let completedLoop = false;
  state.r += state.hysteresis.direction * span * delta / duration;
  if (state.r >= rMax) {
    state.r = rMax;
    state.hysteresis.direction = -1;
    announce("The parameter reached the right side of the loop and is now decreasing. The tracked state retains its branch history.");
  } else if (state.r <= rMin) {
    state.r = rMin;
    if (state.hysteresis.direction < 0) {
      state.hysteresis.cycles += 1;
      completedLoop = true;
    }
  }

  // Relax the state much faster than the display clock so the default loop is
  // close to the quasi-static hysteresis curve. Increasing the sweep-speed
  // control still reveals a small, genuine delayed-tipping effect.
  const dynamicStep = Math.min(delta, 0.04) * 40;
  const substeps = Math.max(12, Math.ceil(dynamicStep / 0.03));
  for (let index = 0; index < substeps; index += 1) {
    state.hysteresis.x = rk4Step(
      state.family,
      state.hysteresis.x,
      state.r,
      dynamicStep / substeps
    );
  }
  if (!Number.isFinite(state.hysteresis.x) || Math.abs(state.hysteresis.x) > state.family.xRange[1] * 4) {
    const stable = findEquilibria(state.family, state.r, { samples: 360 })
      .filter((equilibrium) => String(equilibrium.stability).startsWith("stable"));
    state.hysteresis.x = stable.length ? stable[0].x : 0;
  }
  if (now - state.hysteresis.lastRecordedAt > 28) {
    const target = state.hysteresis.direction > 0
      ? state.hysteresis.increasing
      : state.hysteresis.decreasing;
    target.push({ r: state.r, x: state.hysteresis.x });
    if (target.length > 2200) target.shift();
    state.hysteresis.lastRecordedAt = now;
  }
  if (completedLoop) {
    state.hysteresis.running = false;
    const comparisonR = (rMin + rMax) / 2;
    const increasingAtCenter = nearestTracePoint(state.hysteresis.increasing, comparisonR);
    state.r = comparisonR;
    if (increasingAtCenter) state.hysteresis.x = increasingAtCenter.x;
    elements.runHysteresis.textContent = "Run loop again";
    elements.hysteresisPanelButton.textContent = "Run loop again";
    elements.hysteresisStatus.textContent = "Loop complete · comparing both histories at r = 0";
    updateCurrentSlice();
    announce("The hysteresis loop is complete. The display now compares the increasing and decreasing histories at the same parameter.");
  }
  applyParameterReadout(false);
  updateHysteresisReadout();
}

function updateSweep(delta) {
  if (!state.sweepRunning || state.hysteresis.running || !state.family) return;
  const [minimum, maximum] = state.family.rRange;
  const span = maximum - minimum;
  state.r += state.sweepDirection * span * delta * state.sweepSpeed / 8;
  if (state.r >= maximum) {
    state.r = maximum;
    state.sweepDirection = -1;
  } else if (state.r <= minimum) {
    state.r = minimum;
    state.sweepDirection = 1;
  }
  applyParameterReadout(false);
}

function applyParameterReadout(recompute = true) {
  elements.parameter.value = String(state.r);
  elements.parameterValue.value = formatNumber(state.r, 3);
  elements.parameterValue.textContent = formatNumber(state.r, 3);
  const xWindow = state.view
    ? ` · x: ${formatNumber(state.view.xMin, 2)}…${formatNumber(state.view.xMax, 2)}`
    : "";
  elements.slopeParameter.textContent = `r = ${formatNumber(state.r, 3)}${xWindow}`;
  elements.telemetryR.textContent = formatNumber(state.r, 3);
  if (recompute) updateCurrentSlice();
}

function setParameter(value, options = {}) {
  if (!state.family) return;
  const [minimum, maximum] = state.family.rRange;
  const next = clamp(Number(value), minimum, maximum);
  const previous = state.r;
  state.r = next;
  state.hysteresisDirty = true;
  if (options.manual) {
    stopSweep();
    stopHysteresis(false);
    if (Math.abs(previous - next) > (maximum - minimum) * 0.04) resetParticles();
  }
  applyParameterReadout(true);
  if (options.announce) announce(`Parameter r is ${formatNumber(next, 3)}.`);
}

function updateCurrentSlice(options = {}) {
  if (!state.family || !state.view) return;
  state.equilibria = findEquilibria(
    state.family,
    state.r,
    state.view.xMin,
    state.view.xMax,
    { samples: 420 }
  );
  if (options.updateOutputs !== false) updateCurrentOutputs();
}

function stabilityLabel(equilibrium) {
  if (String(equilibrium.stability).startsWith("stable")) return "stable";
  if (String(equilibrium.stability).startsWith("unstable")) return "unstable";
  if (equilibrium.stability === "semistable") return "semistable";
  return "nonhyperbolic";
}

function updateCurrentOutputs() {
  const count = state.equilibria.length;
  elements.equilibriumSummary.textContent = `${count} visible ${count === 1 ? "equilibrium" : "equilibria"}`;
  elements.telemetryEquilibria.textContent = String(count);
  elements.phaseReadout.replaceChildren();
  if (!count) {
    const chip = document.createElement("span");
    chip.className = "equilibrium-chip";
    chip.setAttribute("role", "listitem");
    chip.textContent = "No equilibria in the visible window";
    elements.phaseReadout.append(chip);
  } else {
    for (const equilibrium of state.equilibria) {
      const chip = document.createElement("span");
      chip.className = "equilibrium-chip";
      chip.setAttribute("role", "listitem");
      const label = stabilityLabel(equilibrium);
      chip.dataset.stability = label === "stable" || label === "unstable" ? label : "neutral";
      chip.textContent = `x = ${formatNumber(equilibrium.x, 3)} · ${label}`;
      elements.phaseReadout.append(chip);
    }
  }
}

function stopSweep() {
  state.sweepRunning = false;
  elements.toggleSweep.textContent = "Play parameter sweep";
  elements.toggleSweep.classList.add("lab-button-primary");
}

function toggleSweep() {
  if (state.hysteresis.running) stopHysteresis(false);
  state.sweepRunning = !state.sweepRunning;
  elements.toggleSweep.textContent = state.sweepRunning ? "Pause parameter sweep" : "Play parameter sweep";
  elements.toggleSweep.classList.toggle("lab-button-primary", !state.sweepRunning);
  announce(state.sweepRunning ? "Parameter sweep playing." : "Parameter sweep paused.");
}

function startHysteresis() {
  if (!state.family?.supportsHysteresis || !state.diagram) return;
  stopSweep();
  const [rMinimum, rMaximum] = state.family.rRange;
  const span = rMaximum - rMinimum;
  state.r = rMinimum + span * 0.035;
  const stable = findEquilibria(state.family, state.r, { samples: 520 })
    .filter((equilibrium) => String(equilibrium.stability).startsWith("stable"))
    .sort((left, right) => left.x - right.x);
  state.hysteresis.running = true;
  state.hysteresis.direction = 1;
  state.hysteresis.x = stable.length ? stable[0].x : state.family.xRange[0] * 0.5;
  state.hysteresis.increasing = [];
  state.hysteresis.decreasing = [];
  state.hysteresis.cycles = 0;
  state.hysteresis.lastRecordedAt = 0;
  state.hysteresisDirty = true;
  elements.runHysteresis.textContent = "Pause loop";
  elements.hysteresisPanelButton.textContent = "Pause loop";
  elements.hysteresisStatus.textContent = "Tracing the path as r increases";
  applyParameterReadout(true);
  announce("Hysteresis loop started. The parameter is increasing from the left.");
}

function stopHysteresis(announceChange = true) {
  if (!state.hysteresis.running) return;
  state.hysteresis.running = false;
  state.hysteresisDirty = true;
  elements.runHysteresis.textContent = "Restart loop";
  elements.hysteresisPanelButton.textContent = "Restart loop";
  elements.hysteresisStatus.textContent = "Loop paused; the recorded path remains visible";
  if (announceChange) announce("Hysteresis loop paused.");
}

function requestHysteresis() {
  if (!state.family?.supportsHysteresis) {
    elements.familySelect.value = "hysteresis";
    loadFamily("hysteresis", { afterReady: startHysteresis, announce: true });
  } else if (state.hysteresis.running) stopHysteresis();
  else startHysteresis();
}

function updateHysteresisReadout() {
  if (!state.family?.supportsHysteresis) {
    elements.hysteresisStatus.textContent = "Choose the hysteresis family to begin";
    elements.hysteresisDirection.textContent = "—";
    elements.hysteresisState.textContent = "x = —";
    elements.hysteresisMemory.textContent = "Run one full loop to compare both histories.";
    return;
  }
  const hasTrace = Boolean(state.hysteresis.increasing.length || state.hysteresis.decreasing.length);
  const direction = state.hysteresis.direction > 0 ? "Increasing r →" : "← Decreasing r";
  elements.hysteresisDirection.textContent = state.hysteresis.running
    ? direction
    : state.hysteresis.cycles > 0 ? "Loop complete" : hasTrace ? "Paused" : "Ready";
  elements.hysteresisState.textContent = `x = ${formatNumber(state.hysteresis.x, 3)}`;
  if (state.hysteresis.running) {
    elements.hysteresisStatus.textContent = state.hysteresis.direction > 0
      ? "Tracing the path as r increases"
      : "Tracing the path as r decreases";
  } else if (!hasTrace) {
    elements.hysteresisStatus.textContent = "Ready to trace increasing and decreasing paths";
  }
  const increasing = nearestTracePoint(state.hysteresis.increasing, state.r);
  const decreasing = nearestTracePoint(state.hysteresis.decreasing, state.r);
  const tolerance = (state.family.rRange[1] - state.family.rRange[0]) * 0.035;
  if (increasing && decreasing && increasing.distance < tolerance && decreasing.distance < tolerance) {
    elements.hysteresisMemory.textContent =
      `Near r = ${formatNumber(state.r, 3)}, the increasing sweep recorded x ≈ ${formatNumber(increasing.x, 3)}, while the decreasing sweep recorded x ≈ ${formatNumber(decreasing.x, 3)}.`;
  } else {
    elements.hysteresisMemory.textContent = "Run one full loop to compare both histories at the same parameter.";
  }
}

function buildCandidateOptions() {
  elements.candidateSelect.replaceChildren();
  if (!state.candidates.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No bifurcation point detected";
    elements.candidateSelect.append(option);
    elements.candidateSelect.disabled = true;
    elements.focusCandidate.disabled = true;
    return;
  }
  elements.candidateSelect.disabled = false;
  elements.focusCandidate.disabled = false;
  state.candidates.forEach((candidate, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `B${index + 1} · ${candidate.label} · r=${formatNumber(candidate.r, 3)}`;
    elements.candidateSelect.append(option);
  });
  elements.candidateSelect.value = String(Math.max(0, state.selectedCandidate));
}

function exponentLabel(variable, power) {
  if (power === 0) return "";
  if (power === 1) return variable;
  return `${variable}${["", "", "²", "³", "⁴"][power] || `^${power}`}`;
}

function formatTaylor(data) {
  const terms = data.coefficients
    .filter((coefficient) => coefficient.xOrder + coefficient.rOrder > 0 && Math.abs(coefficient.value) > 1e-7)
    .map((coefficient) => ({
      coefficient: coefficient.value,
      monomial: `${exponentLabel("y", coefficient.xOrder)}${exponentLabel("μ", coefficient.rOrder)}`
    }));
  const degreeLabel = ["", "₁", "₂", "₃", "₄"][data.degree] || String(data.degree);
  if (!terms.length) return `T${degreeLabel}(y, μ) = 0`;
  let expression = "";
  terms.forEach((term, index) => {
    const magnitude = Math.abs(term.coefficient);
    const coefficientText = Math.abs(magnitude - 1) < 5e-4 && term.monomial
      ? ""
      : formatNumber(magnitude, 3);
    const piece = `${coefficientText}${term.monomial}` || "0";
    if (!index) expression += term.coefficient < 0 ? `−${piece}` : piece;
    else expression += term.coefficient < 0 ? ` − ${piece}` : ` + ${piece}`;
  });
  return `T${degreeLabel}(y, μ) = ${expression}`;
}

function normalFamilyFromTaylor(data, ranges) {
  const terms = data.coefficients.filter((coefficient) => coefficient.normalFormTerm);
  return {
    id: `${data.familyId}-normal`,
    xRange: [ranges.xMin + data.center.x, ranges.xMax + data.center.x],
    rRange: [ranges.rMin + data.center.r, ranges.rMax + data.center.r],
    eval(x, r) {
      if (!terms.length) return 1;
      const y = x - data.center.x;
      const mu = r - data.center.r;
      return terms.reduce(
        (total, coefficient) => total + coefficient.value * y ** coefficient.xOrder * mu ** coefficient.rOrder,
        0
      );
    }
  };
}

function branchProductFamily(candidate, ranges) {
  const slopes = candidate.branchSlopes || state.family.branchSlopes || [];
  const center = { x: candidate.x, r: candidate.r };
  return {
    id: `${state.family.id}-branch-product`,
    xRange: [ranges.xMin + center.x, ranges.xMax + center.x],
    rRange: [ranges.rMin + center.r, ranges.rMax + center.r],
    nongeneric: true,
    branchCount: slopes.length,
    branchSlopes: slopes,
    eval(x, r) {
      const y = x - center.x;
      const mu = r - center.r;
      return slopes.reduce((product, slope) => product * (y - slope * mu), 1);
    }
  };
}

function selectCandidate(index, options = {}) {
  if (!state.candidates.length) return;
  const next = clamp(Number(index) || 0, 0, state.candidates.length - 1);
  state.selectedCandidate = next;
  elements.candidateSelect.value = String(next);
  const candidate = state.candidates[next];
  const branchCount = candidate.branchCount || state.family.branchCount || 0;
  const isManyFold = candidate.type === "four-fold" || candidate.type === "n-fold" || branchCount >= 4;
  const taylorDegree = isManyFold ? clamp(branchCount || 4, 3, 4) : 3;
  state.taylor = taylorData(state.family, candidate, { degree: taylorDegree });
  const rRadius = (state.fullView.rMax - state.fullView.rMin) * 0.13;
  const xRadius = (state.fullView.xMax - state.fullView.xMin) * 0.15;
  const localRanges = { rMin: -rRadius, rMax: rRadius, xMin: -xRadius, xMax: xRadius };
  const absoluteRanges = {
    rMin: candidate.r - rRadius,
    rMax: candidate.r + rRadius,
    xMin: candidate.x - xRadius,
    xMax: candidate.x + xRadius
  };
  const taylorFamily = {
    id: `${state.family.id}-taylor`,
    xRange: [absoluteRanges.xMin, absoluteRanges.xMax],
    rRange: [absoluteRanges.rMin, absoluteRanges.rMax],
    nongeneric: isManyFold,
    branchCount: isManyFold ? branchCount : null,
    branchSlopes: isManyFold ? state.family.branchSlopes : [],
    eval(x, r) {
      return taylorEvaluate(state.taylor, x, r);
    }
  };
  const normalFamily = isManyFold && (candidate.branchSlopes || state.family.branchSlopes)
    ? branchProductFamily(candidate, localRanges)
    : normalFamilyFromTaylor(state.taylor, localRanges);
  state.microscope = {
    center: { x: candidate.x, r: candidate.r },
    ranges: localRanges,
    exactFamily: state.family,
    taylorFamily: branchCount > 4 ? null : taylorFamily,
    normalFamily
  };
  state.localDirty = true;
  updateMicroscopeCopy(candidate);
  elements.telemetryEvent.textContent = `B${next + 1} · ${candidate.label}`;
  const candidateVisible = state.view && (
    candidate.r >= state.view.rMin && candidate.r <= state.view.rMax
    && candidate.x >= state.view.xMin && candidate.x <= state.view.xMax
  );
  if (options.focus || (options.open && !candidateVisible)) focusSelectedCandidate();
  if (options.open) openLocalPopover(options.trigger || null);
  else if (state.localPopoverOpen) state.localPopoverNeedsPosition = true;
  if (options.announce !== false) {
    announce(`Selected B${next + 1}, ${candidate.label}, at r ${formatNumber(candidate.r, 3)} and x ${formatNumber(candidate.x, 3)}.`);
  }
}

function updateMicroscopeCopy(candidate) {
  const classification = state.taylor.classification;
  const branchCount = classification.branchCount || candidate.branchCount || state.family.branchCount || 0;
  elements.localPopoverTitle.textContent = `B${state.selectedCandidate + 1} · ${classification.label}`;
  elements.classificationBadge.textContent = classification.label;
  elements.candidateCoordinate.textContent = `r* = ${formatNumber(candidate.r, 4)} · x* = ${formatNumber(candidate.x, 4)}`;
  elements.candidateCoordinate.setAttribute(
    "aria-label",
    `Bifurcation parameter r equals ${formatNumber(candidate.r, 4)}; equilibrium state x equals ${formatNumber(candidate.x, 4)}`
  );
  const derivativeKeys = ["f", "fx", "fr", "fxx", "fxr", "fxxx"];
  const values = elements.derivativeGrid.querySelectorAll("dd");
  derivativeKeys.forEach((key, index) => {
    values[index].textContent = formatNumber(classification.derivatives[key], 4);
  });
  elements.taylorFormula.textContent = formatTaylor(state.taylor);
  elements.normalFormula.textContent = classification.normalForm;
  const taylorCurveOmitted = branchCount > 4;
  elements.taylorLegend.hidden = taylorCurveOmitted;
  elements.microscopeCanvas.setAttribute(
    "aria-label",
    taylorCurveOmitted
      ? `Bifurcation microscope for a ${branchCount}-branch crossing`
      : `Bifurcation microscope for ${classification.label}`
  );
  elements.microscopeDescription.textContent = taylorCurveOmitted
    ? `At this ${branchCount}-branch crossing, every derivative through total degree 4 vanishes. The degree-4 Taylor polynomial is identically zero, so its zero set fills the local plane and is not drawn as a separate curve. The exact family is compared with its degree-${branchCount} branch-product normal form.`
    : "The selected point is translated to μ = r − r* and y = x − x*. The exact local family is compared with its Taylor polynomial and leading normal-form terms.";
  if (classification.type === "triple-root-passage") {
    elements.classificationNote.textContent =
      "Here f = fₓ = fₓₓ = 0 while fᵣ and fₓₓₓ remain nonzero. A single local equilibrium passes through a triple root without changing the local equilibrium count or stability.";
  } else if (state.family.supportsUnfolding && classification.type === "saddle-node") {
    elements.classificationNote.textContent =
      `This is one ordinary fold in the ${state.family.unfolding.caseLabel.toLowerCase()} regime of the cubic pitchfork unfolding.`;
  } else if (classification.type === "saddle-node") {
    elements.classificationNote.textContent =
      "The parameter term and quadratic state term are both nonzero. Two nearby equilibria meet at a fold; one attracts and one repels.";
  } else if (classification.type === "transcritical") {
    elements.classificationNote.textContent =
      "The quadratic Taylor form factors into two transverse branches. They persist through the crossing and exchange stability.";
  } else if (classification.type.includes("pitchfork")) {
    elements.classificationNote.textContent =
      "The quadratic state term vanishes, leaving the mixed μy term and cubic y³ term to determine the local pitchfork geometry.";
  } else if (classification.type === "four-fold" || classification.type === "n-fold" || branchCount >= 4) {
    if (branchCount > 4) {
      elements.classificationNote.textContent =
        `Every derivative through total degree 4 vanishes here. The degree-4 Taylor polynomial is identically zero, so its zero set fills the local plane and is not drawn as a separate curve. The dashed curve shows the degree-${branchCount} branch-product normal form. This simultaneous crossing is genuine but nongeneric.`;
    } else if (branchCount === 4) {
      elements.classificationNote.textContent =
        "The first nonzero jet is quartic and factors into four equilibrium branches. Exact, Taylor, and branch-product curves overlap here by construction; a generic perturbation splits this high-codimension meeting.";
    } else {
      elements.classificationNote.textContent =
        `The first nonzero jet has degree ${branchCount} and factors into ${branchCount} equilibrium branches. Exact, Taylor, and branch-product curves overlap here by construction; this simultaneous meeting is nongeneric.`;
    }
  } else {
    elements.classificationNote.textContent =
      "The numerical derivative tests do not cleanly isolate a classical generic type. The local Taylor curve is shown without forcing a label.";
  }
}

function positionLocalPopover() {
  if (!state.localPopoverOpen || elements.localPopover.hidden) return false;
  const marker = state.candidateScreens.find((entry) => entry.index === state.selectedCandidate);
  if (!marker) {
    const focusIsInside = elements.localPopover.contains(document.activeElement);
    dismissLocalPopover({ restoreFocus: focusIsInside, announce: focusIsInside });
    return false;
  }
  const host = elements.localPopover.parentElement;
  const hostRect = host.getBoundingClientRect();
  const canvasRect = elements.bifurcationCanvas.getBoundingClientRect();
  const markerX = canvasRect.left - hostRect.left + marker.x;
  const markerY = canvasRect.top - hostRect.top + marker.y;
  const padding = 12;
  const gap = 24;
  const width = elements.localPopover.offsetWidth;
  const height = elements.localPopover.offsetHeight;
  const hostMaxLeft = Math.max(padding, host.clientWidth - width - padding);
  const hostMaxTop = Math.max(padding, host.clientHeight - height - padding);
  const viewportWidth = Number(window.innerWidth) || host.clientWidth;
  const viewportHeight = Number(window.innerHeight) || host.clientHeight;
  const siteHeaderRect = currentFullscreenElement()
    ? null
    : document.querySelector(".site-header")?.getBoundingClientRect();
  const viewportTopInset = siteHeaderRect && siteHeaderRect.top <= padding && siteHeaderRect.bottom > padding
    ? Math.min(viewportHeight - padding, siteHeaderRect.bottom + padding)
    : padding;
  const viewportMinLeft = padding - hostRect.left;
  const viewportMaxLeft = viewportWidth - padding - hostRect.left - width;
  const viewportMinTop = viewportTopInset - hostRect.top;
  const viewportMaxTop = viewportHeight - padding - hostRect.top - height;
  const minLeft = Math.max(padding, viewportMinLeft);
  const maxLeft = Math.min(hostMaxLeft, viewportMaxLeft);
  const minTop = Math.max(padding, viewportMinTop);
  const maxTop = Math.min(hostMaxTop, viewportMaxTop);
  const placements = [
    { side: "left", left: markerX + gap, top: markerY - height * 0.28 },
    { side: "right", left: markerX - gap - width, top: markerY - height * 0.28 },
    { side: "top", left: markerX - width * 0.28, top: markerY + gap },
    { side: "bottom", left: markerX - width * 0.28, top: markerY - gap - height }
  ].map((placement, index) => {
    const left = minLeft <= maxLeft
      ? clamp(placement.left, minLeft, maxLeft)
      : clamp(placement.left, padding, hostMaxLeft);
    const top = minTop <= maxTop
      ? clamp(placement.top, minTop, maxTop)
      : clamp(placement.top, padding, hostMaxTop);
    const overflow = Math.abs(left - placement.left) + Math.abs(top - placement.top);
    const absoluteLeft = hostRect.left + left;
    const absoluteTop = hostRect.top + top;
    const viewportOverflow = Math.max(0, padding - absoluteLeft)
      + Math.max(0, absoluteLeft + width + padding - viewportWidth)
      + Math.max(0, viewportTopInset - absoluteTop)
      + Math.max(0, absoluteTop + height + padding - viewportHeight);
    const coversMarker = markerX > left - 18 && markerX < left + width + 18
      && markerY > top - 18 && markerY < top + height + 18;
    return {
      ...placement,
      left,
      top,
      score: overflow + viewportOverflow * 20 + (coversMarker ? 100000 : 0) + index * 0.01
    };
  });
  placements.sort((left, right) => left.score - right.score);
  const placement = placements[0];
  const { left, top } = placement;
  elements.localPopover.style.left = `${Math.round(left)}px`;
  elements.localPopover.style.top = `${Math.round(top)}px`;
  elements.localPopover.style.setProperty("--pointer-x", `${Math.round(clamp(markerX - left, 18, width - 18))}px`);
  elements.localPopover.style.setProperty("--pointer-y", `${Math.round(clamp(markerY - top, 18, height - 18))}px`);
  elements.localPopover.dataset.side = placement.side;
  state.localPopoverNeedsPosition = false;
  return true;
}

function clearMicroscopePointer(event) {
  const pointerId = state.microscopePointer?.pointerId;
  state.microscopePointer = null;
  delete elements.microscopeCanvas.dataset.dragging;
  if (
    pointerId != null
    && event?.type !== "lostpointercapture"
    && elements.microscopeCanvas.hasPointerCapture(pointerId)
  ) {
    elements.microscopeCanvas.releasePointerCapture(pointerId);
  }
}

function resetMicroscopeView(options = {}) {
  if (!state.microscope) return false;
  clearMicroscopePointer();
  state.microscopeView = { ...state.microscope.ranges };
  state.localDirty = true;
  if (options.draw && state.localPopoverOpen) {
    drawLocalDiagram();
    state.localDirty = false;
  }
  if (options.announce) announce("The bifurcation microscope has been reset to the selected point.");
  return true;
}

function openLocalPopover(trigger = null) {
  if (!state.microscope || state.selectedCandidate < 0) return;
  resetMicroscopeView();
  state.localPopoverOpen = true;
  state.localPopoverNeedsPosition = true;
  state.localPopoverTrigger = trigger || document.activeElement;
  state.localDirty = true;
  elements.localPopover.hidden = false;
  elements.bifurcationCanvas.setAttribute("aria-expanded", "true");
  elements.focusCandidate.setAttribute("aria-expanded", "true");
  elements.candidateSelect.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    if (!state.localPopoverOpen) return;
    drawBifurcationDiagram();
    if (!state.localPopoverOpen || !positionLocalPopover()) return;
    drawLocalDiagram();
    state.localDirty = false;
    if (trigger && trigger !== elements.bifurcationCanvas) {
      elements.localPopover.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      state.localPopoverNeedsPosition = true;
      positionLocalPopover();
    }
    elements.closeLocalPopover.focus({ preventScroll: true });
  });
}

function dismissLocalPopover(options = {}) {
  if (!state.localPopoverOpen && elements.localPopover.hidden) return;
  const trigger = state.localPopoverTrigger;
  clearMicroscopePointer();
  state.localPopoverOpen = false;
  state.localPopoverNeedsPosition = false;
  state.localPopoverTrigger = null;
  state.microscopeView = null;
  state.microscopePlotBox = null;
  elements.localPopover.hidden = true;
  elements.bifurcationCanvas.setAttribute("aria-expanded", "false");
  elements.focusCandidate.setAttribute("aria-expanded", "false");
  elements.candidateSelect.setAttribute("aria-expanded", "false");
  if (options.restoreFocus && trigger?.isConnected && typeof trigger.focus === "function") {
    trigger.focus({ preventScroll: true });
  }
  if (options.announce) announce("Bifurcation microscope closed.");
}

function focusSelectedCandidate() {
  const candidate = state.candidates[state.selectedCandidate];
  if (!candidate) return;
  const rRadius = (state.fullView.rMax - state.fullView.rMin) * 0.18;
  const xRadius = (state.fullView.xMax - state.fullView.xMin) * 0.22;
  state.view = {
    rMin: clamp(candidate.r - rRadius, state.fullView.rMin, state.fullView.rMax),
    rMax: clamp(candidate.r + rRadius, state.fullView.rMin, state.fullView.rMax),
    xMin: clamp(candidate.x - xRadius, state.fullView.xMin, state.fullView.xMax),
    xMax: clamp(candidate.x + xRadius, state.fullView.xMin, state.fullView.xMax)
  };
  if (state.view.rMax - state.view.rMin < rRadius * 1.5) {
    if (state.view.rMin === state.fullView.rMin) state.view.rMax = Math.min(state.fullView.rMax, state.view.rMin + 2 * rRadius);
    else state.view.rMin = Math.max(state.fullView.rMin, state.view.rMax - 2 * rRadius);
  }
  if (state.view.xMax - state.view.xMin < xRadius * 1.5) {
    if (state.view.xMin === state.fullView.xMin) state.view.xMax = Math.min(state.fullView.xMax, state.view.xMin + 2 * xRadius);
    else state.view.xMin = Math.max(state.fullView.xMin, state.view.xMax - 2 * xRadius);
  }
  state.slopeCursorX = clamp(state.slopeCursorX, state.view.xMin, state.view.xMax);
  state.phaseCursorX = clamp(state.phaseCursorX, state.view.xMin, state.view.xMax);
  updateDiagramNavigationMode();
  state.localPopoverNeedsPosition = state.localPopoverOpen;
  setParameter(candidate.r, { manual: true });
  resetParticles();
}

function fitAllBranches() {
  state.view = { ...state.fullView };
  refreshSharedView({ resetParticles: true });
  announce("The full bifurcation diagram is visible.");
}

function updateFamilyCopy() {
  elements.familyKind.textContent = state.family.sourceType === "random"
    ? state.family.shortName
    : state.family.name;
  elements.familyEquation.textContent = state.family.formula;
  if (state.family.seed) elements.familySeed.textContent = `Reproducible seed ${state.family.seed}`;
  else if (state.family.branchCount) elements.familySeed.textContent = `${state.family.branchCount} equilibrium branches meet at r = 0`;
  else if (state.family.supportsUnfolding) {
    const { alpha, beta, caseLabel } = state.family.unfolding;
    elements.familySeed.textContent = `${caseLabel} · α = ${formatNumber(alpha, 3)} · β = ${formatNumber(beta, 3)}`;
  } else if (state.family.sourceType === "custom") {
    elements.familySeed.textContent = state.family.expressionUsesParameter
      ? "Variables in use: x and r"
      : "No r in this equation · changing r has no effect";
  } else elements.familySeed.textContent = "Classical normal form";
  elements.telemetryFamily.textContent = state.family.shortName;
  elements.generateFamily.hidden = state.family.sourceType !== "random";
  elements.generateFamily.disabled = state.family.sourceType !== "random";
  elements.generateFamily.textContent = "Generate another family";
  const showHysteresis = Boolean(state.family.supportsHysteresis);
  elements.hysteresisControls.hidden = !showHysteresis;
  elements.hysteresisPanel.hidden = !showHysteresis;
  elements.workspace.classList.toggle("is-hysteresis", showHysteresis);
  if (showHysteresis) state.hysteresisDirty = true;
}

function familyIsPitchfork(id) {
  return id === "pitchfork-unfolding"
    || id === "supercritical-pitchfork"
    || id === "subcritical-pitchfork";
}

const PITCHFORK_CASE_PRESETS = Object.freeze({
  perfect: Object.freeze({ alpha: 0, beta: 0 }),
  additive: Object.freeze({ alpha: 0.18, beta: 0 }),
  "transcritical-fold": Object.freeze({ alpha: 0, beta: 1 }),
  "three-folds": Object.freeze({ alpha: 0.0625, beta: 1.5 }),
  "triple-boundary": Object.freeze({ alpha: 0.125, beta: 1.5 }),
  "one-fold": Object.freeze({ alpha: 0.18, beta: 0.8 })
});

function updatePitchforkReadouts() {
  const alpha = clamp(Number(elements.pitchforkAlpha.value) || 0, -0.4, 0.4);
  const beta = clamp(Number(elements.pitchforkBeta.value) || 0, -1.5, 1.5);
  elements.pitchforkAlpha.value = String(alpha);
  elements.pitchforkBeta.value = String(beta);
  elements.pitchforkAlphaValue.value = formatNumber(alpha, 3);
  elements.pitchforkAlphaValue.textContent = formatNumber(alpha, 3);
  elements.pitchforkAlpha.setAttribute("aria-valuetext", `alpha equals ${formatNumber(alpha, 3)}`);
  elements.pitchforkBetaValue.value = formatNumber(beta, 3);
  elements.pitchforkBetaValue.textContent = formatNumber(beta, 3);
  elements.pitchforkBeta.setAttribute("aria-valuetext", `beta equals ${formatNumber(beta, 3)}`);
}

const PITCHFORK_PLAYER_CONFIG = Object.freeze({
  alpha: Object.freeze({
    control: elements.pitchforkAlpha,
    button: elements.playPitchforkAlpha,
    spokenName: "alpha",
    rate: 0.105
  }),
  beta: Object.freeze({
    control: elements.pitchforkBeta,
    button: elements.playPitchforkBeta,
    spokenName: "beta",
    rate: 0.38
  })
});

function syncPitchforkPlayerButton(name) {
  const config = PITCHFORK_PLAYER_CONFIG[name];
  const player = state.pitchforkPlayers[name];
  if (!config?.button || !player) return;
  config.button.setAttribute("aria-pressed", String(player.playing));
  config.button.setAttribute(
    "aria-label",
    `${player.playing ? "Pause" : "Play"} ${config.spokenName} imperfection animation`
  );
  const icon = config.button.querySelector("[aria-hidden='true']");
  if (icon) icon.textContent = player.playing ? "Ⅱ" : "▶";
}

function pitchforkPlayerIsRunning() {
  return Object.values(state.pitchforkPlayers).some((player) => player.playing);
}

function setPitchforkPlayer(name, playing, options = {}) {
  const config = PITCHFORK_PLAYER_CONFIG[name];
  const player = state.pitchforkPlayers[name];
  if (!config || !player || player.playing === playing) return false;
  player.playing = playing;
  player.lastAt = performance.now();
  if (playing) {
    const value = Number(config.control.value);
    const maximum = Number(config.control.max);
    const minimum = Number(config.control.min);
    if (value >= maximum - (maximum - minimum) * 0.01) player.direction = -1;
    else if (value <= minimum + (maximum - minimum) * 0.01) player.direction = 1;
  }
  syncPitchforkPlayerButton(name);
  if (options.announce) {
    announce(`${config.spokenName === "alpha" ? "Alpha" : "Beta"} imperfection animation ${playing ? "started" : "paused"}.`);
  }
  if (!playing && options.finalize !== false && !pitchforkPlayerIsRunning()) {
    requestPitchforkMorphFinish(Boolean(options.announce));
  }
  return true;
}

function stopPitchforkPlayers(options = {}) {
  let changed = false;
  for (const name of Object.keys(PITCHFORK_PLAYER_CONFIG)) {
    changed = setPitchforkPlayer(name, false, { announce: false, finalize: false }) || changed;
  }
  if (changed && options.finalize !== false && familyIsPitchfork(elements.familySelect.value)) {
    requestPitchforkMorphFinish(Boolean(options.announce));
  }
  return changed;
}

function togglePitchforkPlayer(name) {
  const player = state.pitchforkPlayers[name];
  if (!player || !familyIsPitchfork(elements.familySelect.value)) return;
  setPitchforkPlayer(name, !player.playing, { announce: true, finalize: true });
}

function updatePitchforkPlayers(now) {
  if (!familyIsPitchfork(elements.familySelect.value) || !pitchforkPlayerIsRunning()) return false;
  let changed = false;
  for (const [name, config] of Object.entries(PITCHFORK_PLAYER_CONFIG)) {
    const player = state.pitchforkPlayers[name];
    if (!player.playing) continue;
    const elapsed = clamp((now - player.lastAt) / 1000, 0, 0.08);
    player.lastAt = now;
    if (elapsed <= 0) continue;
    const minimum = Number(config.control.min);
    const maximum = Number(config.control.max);
    let value = Number(config.control.value) + player.direction * config.rate * elapsed;
    if (value > maximum) {
      value = maximum - (value - maximum);
      player.direction = -1;
    } else if (value < minimum) {
      value = minimum + (minimum - value);
      player.direction = 1;
    }
    config.control.value = String(clamp(value, minimum, maximum));
    changed = true;
  }
  if (!changed) return false;
  elements.pitchforkCase.value = "custom";
  updatePitchforkReadouts();
  queuePitchforkMorph();
  return true;
}

function applyPitchforkCase(caseId) {
  const preset = PITCHFORK_CASE_PRESETS[caseId];
  if (!preset) return;
  elements.pitchforkAlpha.value = String(preset.alpha);
  elements.pitchforkBeta.value = String(preset.beta);
  updatePitchforkReadouts();
}

function updateFamilySpecificControls(id) {
  const showNFold = id === "n-fold";
  const showPitchfork = familyIsPitchfork(id);
  const showCustom = id === "custom";
  elements.nFoldControl.hidden = !showNFold;
  elements.pitchforkControls.hidden = !showPitchfork;
  elements.customEquationControls.hidden = !showCustom;
  elements.hysteresisControls.hidden = id !== "hysteresis";
  elements.hysteresisPanel.hidden = id !== "hysteresis";
  elements.workspace.classList.toggle("is-hysteresis", id === "hysteresis");
  if (id !== "hysteresis") stopHysteresis(false);
  elements.generateFamily.hidden = id !== "random";
  const branchCount = clamp(Math.round(Number(elements.nFoldCount.value) || 5), 3, 9);
  elements.nFoldCount.value = String(branchCount);
  elements.nFoldCountValue.value = String(branchCount);
  elements.nFoldCountValue.textContent = String(branchCount);
  updatePitchforkReadouts();
}

function familyCreationOptions(id) {
  if (id === "n-fold") {
    return { branchCount: clamp(Math.round(Number(elements.nFoldCount.value) || 5), 3, 9) };
  }
  if (familyIsPitchfork(id)) {
    const [couplingSign, cubicSign] = elements.pitchforkSigns.value.split(",").map(Number);
    return {
      alpha: clamp(Number(elements.pitchforkAlpha.value) || 0, -0.4, 0.4),
      beta: clamp(Number(elements.pitchforkBeta.value) || 0, -1.5, 1.5),
      couplingSign,
      cubicSign,
      timeSign: Number(elements.pitchforkTimeSign.value)
    };
  }
  if (id === "custom") {
    return {
      expression: elements.customEquation.value,
      xRange: [Number(elements.customXMin.value), Number(elements.customXMax.value)],
      rRange: [Number(elements.customRMin.value), Number(elements.customRMax.value)]
    };
  }
  return {};
}

function chooseInitialParameter(family) {
  if (!family.knownCandidates.length) return family.defaultR;
  const span = family.rRange[1] - family.rRange[0];
  const margin = span * 0.045;
  const eventValues = [...new Set(family.knownCandidates.map((candidate) => candidate.r))]
    .sort((left, right) => left - right);
  const boundaries = [family.rRange[0], ...eventValues, family.rRange[1]];
  const choices = [family.defaultR, (family.rRange[0] + family.rRange[1]) / 2];
  for (let index = 1; index < boundaries.length; index += 1) {
    choices.push((boundaries[index - 1] + boundaries[index]) / 2);
  }
  for (const r of eventValues) {
    choices.push(clamp(r - margin, family.rRange[0], family.rRange[1]));
    choices.push(clamp(r + margin, family.rRange[0], family.rRange[1]));
  }
  const center = (family.rRange[0] + family.rRange[1]) / 2;
  let best = { r: family.defaultR, count: -1, centerDistance: Infinity };
  for (const r of choices) {
    const count = findEquilibria(family, r, { samples: 360 }).length;
    const centerDistance = Math.abs(r - center);
    if (count > best.count || (count === best.count && centerDistance < best.centerDistance)) {
      best = { r, count, centerDistance };
    }
  }
  return best.r;
}

function clearCustomEquationError() {
  elements.customEquationError.hidden = true;
  elements.customEquationError.textContent = "";
  for (const input of [
    elements.customEquation,
    elements.customXMin,
    elements.customXMax,
    elements.customRMin,
    elements.customRMax
  ]) input.removeAttribute("aria-invalid");
}

function showCustomEquationError(error) {
  const message = error instanceof Error ? error.message : String(error);
  elements.customEquationError.textContent = message;
  elements.customEquationError.hidden = false;
  let invalidInputs = [elements.customEquation];
  if (/State x/i.test(message)) invalidInputs = [elements.customXMin, elements.customXMax];
  else if (/Parameter r/i.test(message)) invalidInputs = [elements.customRMin, elements.customRMax];
  for (const input of invalidInputs) input.setAttribute("aria-invalid", "true");
  invalidInputs[0].focus();
}

function applyCustomFamily(options = {}) {
  clearCustomEquationError();
  let preparedFamily;
  try {
    preparedFamily = createFamily("custom", undefined, familyCreationOptions("custom"));
  } catch (error) {
    showCustomEquationError(error);
    return false;
  }
  loadFamily("custom", {
    announce: options.announce !== false,
    preparedFamily
  });
  return true;
}

function loadFamily(id, options = {}) {
  window.clearTimeout(reloadConfiguredFamily.timeout);
  cancelPitchforkMorph();
  updateFamilySpecificControls(id);
  const seed = id === "random" ? state.seed : undefined;
  let nextFamily;
  try {
    nextFamily = options.preparedFamily || createFamily(id, seed, familyCreationOptions(id));
  } catch (error) {
    if (id === "custom") showCustomEquationError(error);
    else {
      console.error(error);
      announce("The selected family could not be created.");
    }
    return false;
  }
  const previousR = state.r;
  const previousView = state.view ? { ...state.view } : null;
  const previousSlopeCursor = state.slopeCursorX;
  const previousPhaseCursor = state.phaseCursorX;
  const token = ++state.calculationToken;
  stopSweep();
  stopHysteresis(false);
  dismissLocalPopover();
  elements.stageStatus.textContent = "Computing equilibrium branches…";
  elements.generateFamily.disabled = true;
  state.family = nextFamily;
  state.fullView = {
    rMin: state.family.rRange[0],
    rMax: state.family.rRange[1],
    xMin: state.family.xRange[0],
    xMax: state.family.xRange[1]
  };
  const canPreserveView = options.preserveView && previousView;
  state.view = canPreserveView ? {
    rMin: clamp(previousView.rMin, state.fullView.rMin, state.fullView.rMax),
    rMax: clamp(previousView.rMax, state.fullView.rMin, state.fullView.rMax),
    xMin: clamp(previousView.xMin, state.fullView.xMin, state.fullView.xMax),
    xMax: clamp(previousView.xMax, state.fullView.xMin, state.fullView.xMax)
  } : { ...state.fullView };
  if (!(state.view.rMax > state.view.rMin) || !(state.view.xMax > state.view.xMin)) {
    state.view = { ...state.fullView };
  }
  updateDiagramNavigationMode();
  state.r = options.preserveParameter
    ? clamp(previousR, state.family.rRange[0], state.family.rRange[1])
    : chooseInitialParameter(state.family);
  state.slopeCursorX = canPreserveView
    ? clamp(previousSlopeCursor, state.view.xMin, state.view.xMax)
    : (state.view.xMin + state.view.xMax) / 2;
  state.phaseCursorX = canPreserveView
    ? clamp(previousPhaseCursor, state.view.xMin, state.view.xMax)
    : (state.view.xMin + state.view.xMax) / 2;
  elements.parameter.min = String(state.family.rRange[0]);
  elements.parameter.max = String(state.family.rRange[1]);
  elements.parameter.step = String((state.family.rRange[1] - state.family.rRange[0]) / 1400);
  updateFamilyCopy();
  applyParameterReadout(false);
  state.diagram = null;
  state.candidates = [];
  state.microscope = null;
  state.microscopeView = null;
  state.microscopePlotBox = null;
  state.localDirty = true;
  state.hysteresisDirty = true;
  window.setTimeout(() => {
    if (token !== state.calculationToken) return;
    try {
      const diagram = sampleBifurcation(state.family, {
        ...state.fullView,
        rSamples: 221,
        xSamples: 420
      });
      if (token !== state.calculationToken) return;
      state.diagram = diagram;
      state.candidates = diagram.candidates;
      state.selectedCandidate = state.candidates.length ? 0 : -1;
      buildCandidateOptions();
      if (state.candidates.length) selectCandidate(0, { announce: false, open: false });
      else {
        state.taylor = null;
        elements.telemetryEvent.textContent = "None detected";
      }
      state.hysteresis.increasing = [];
      state.hysteresis.decreasing = [];
      state.hysteresis.x = Number.NaN;
      state.hysteresis.direction = 1;
      state.hysteresis.cycles = 0;
      state.hysteresis.lastRecordedAt = 0;
      elements.runHysteresis.textContent = "Run full loop";
      elements.hysteresisPanelButton.textContent = "Run full loop";
      state.hysteresisDirty = true;
      updateCurrentSlice();
      resetParticles();
      updateHysteresisReadout();
      const selectedPoint = state.candidates[state.selectedCandidate];
      const pointOutsideView = selectedPoint && (
        selectedPoint.r < state.view.rMin || selectedPoint.r > state.view.rMax ||
        selectedPoint.x < state.view.xMin || selectedPoint.x > state.view.xMax
      );
      elements.stageStatus.textContent = bifurcationStatus(state.candidates.length, pointOutsideView);
      updateFamilyCopy();
      if (options.announce) {
        const pointSummary = state.candidates.length === 0
          ? "no bifurcation points detected"
          : `${state.candidates.length} bifurcation ${state.candidates.length === 1 ? "point" : "points"} marked`;
        announce(`${state.family.name} loaded; ${pointSummary}.${pointOutsideView ? " The selected point is outside the current view; use Inspect point or Fit full diagram." : ""}`);
      }
      if (typeof options.afterReady === "function") options.afterReady();
    } catch (error) {
      console.error(error);
      elements.stageStatus.textContent = "The numerical analysis could not be completed.";
      announce("The selected family could not be analyzed.");
    }
  }, 24);
  return true;
}

function generateFamily() {
  state.seedCounter += 1;
  state.seed = makeSeed();
  elements.familySelect.value = "random";
  loadFamily("random", { announce: true });
}

function reloadConfiguredFamily(announceChange = false) {
  window.clearTimeout(reloadConfiguredFamily.timeout);
  const id = elements.familySelect.value;
  loadFamily(id, {
    announce: announceChange,
    preserveParameter: true,
    preserveView: true
  });
}

function scheduleConfiguredFamilyReload() {
  window.clearTimeout(reloadConfiguredFamily.timeout);
  reloadConfiguredFamily.timeout = window.setTimeout(() => reloadConfiguredFamily(false), 130);
}

const PITCHFORK_MORPH_ALPHA_TOLERANCE = 0.00025;
const PITCHFORK_MORPH_BETA_TOLERANCE = 0.0025;
const PITCHFORK_MORPH_TIME_CONSTANT = 0.075;

function pitchforkOptionsFromFamily(family) {
  const unfolding = family?.unfolding;
  if (!unfolding) return null;
  return {
    alpha: unfolding.alpha,
    beta: unfolding.beta,
    couplingSign: unfolding.couplingSign,
    cubicSign: unfolding.cubicSign,
    timeSign: unfolding.timeSign
  };
}

function pitchforkOptionsMatch(left, right) {
  if (!left || !right) return false;
  return (
    Math.abs(left.alpha - right.alpha) <= 1e-12
    && Math.abs(left.beta - right.beta) <= 1e-12
    && left.couplingSign === right.couplingSign
    && left.cubicSign === right.cubicSign
    && left.timeSign === right.timeSign
  );
}

function cancelPitchforkMorph() {
  window.clearTimeout(queuePitchforkMorph.idleTimer);
  window.clearTimeout(schedulePitchforkRefinement.timer);
  queuePitchforkMorph.idleTimer = null;
  schedulePitchforkRefinement.timer = null;
  schedulePitchforkRefinement.pending = null;
  state.pitchforkMorph = null;
}

function nearestCandidateIndex(candidates, reference, fallback = 0) {
  if (!candidates.length) return -1;
  if (!reference) return clamp(fallback, 0, candidates.length - 1);
  const rSpan = Math.max(1e-9, state.fullView.rMax - state.fullView.rMin);
  const xSpan = Math.max(1e-9, state.fullView.xMax - state.fullView.xMin);
  let result = 0;
  let bestScore = Infinity;
  candidates.forEach((candidate, index) => {
    const typePenalty = candidate.type === reference.type ? 0 : 0.18;
    const score = Math.hypot(
      (candidate.r - reference.r) / rSpan,
      (candidate.x - reference.x) / xSpan
    ) + typePenalty;
    if (score < bestScore) {
      bestScore = score;
      result = index;
    }
  });
  return result;
}

function applyPitchforkPreview(options) {
  const nextFamily = createFamily("pitchfork-unfolding", undefined, options);
  const bounds = state.fullView || {
    rMin: nextFamily.rRange[0],
    rMax: nextFamily.rRange[1],
    xMin: nextFamily.xRange[0],
    xMax: nextFamily.xRange[1]
  };
  const diagram = sampleBifurcation(nextFamily, {
    ...bounds,
    rSamples: 121,
    xSamples: 220,
    detectCandidates: false
  });
  const previousCandidate = state.candidates[state.selectedCandidate] || null;
  const candidates = [...nextFamily.knownCandidates];
  const selectedCandidate = nearestCandidateIndex(candidates, previousCandidate, state.selectedCandidate);

  // All expensive work happens above. These assignments form one visible
  // commit, so the animation loop can never observe a blank diagram.
  state.family = nextFamily;
  state.diagram = diagram;
  state.candidates = candidates;
  state.selectedCandidate = selectedCandidate;
  state.taylor = null;
  state.microscope = null;
  state.microscopeView = null;
  state.localDirty = true;
  updateCurrentSlice({ updateOutputs: false });
  updateFamilyCopy();
  if (selectedCandidate >= 0) {
    const candidate = candidates[selectedCandidate];
    elements.telemetryEvent.textContent = `B${selectedCandidate + 1} · ${candidate.label}`;
  } else {
    elements.telemetryEvent.textContent = "None detected";
  }
  elements.candidateSelect.disabled = true;
  elements.focusCandidate.disabled = true;
  elements.stageStatus.textContent = `Updating pitchfork unfolding · α = ${formatNumber(options.alpha, 3)} · β = ${formatNumber(options.beta, 3)}`;
  return diagram;
}

function schedulePitchforkRefinement(options, announceChange = false) {
  window.clearTimeout(queuePitchforkMorph.idleTimer);
  window.clearTimeout(schedulePitchforkRefinement.timer);
  queuePitchforkMorph.idleTimer = null;
  state.pitchforkMorph = null;
  const token = ++state.calculationToken;
  const pending = {
    options: { ...options },
    announce: Boolean(announceChange),
    token
  };
  schedulePitchforkRefinement.pending = pending;
  elements.stageStatus.textContent = "Locating bifurcation points…";
  schedulePitchforkRefinement.timer = window.setTimeout(() => {
    if (
      schedulePitchforkRefinement.pending !== pending
      || token !== state.calculationToken
      || !familyIsPitchfork(elements.familySelect.value)
    ) return;
    try {
      const nextFamily = createFamily("pitchfork-unfolding", undefined, pending.options);
      const bounds = state.fullView || {
        rMin: nextFamily.rRange[0],
        rMax: nextFamily.rRange[1],
        xMin: nextFamily.xRange[0],
        xMax: nextFamily.xRange[1]
      };
      const diagram = sampleBifurcation(nextFamily, {
        ...bounds,
        rSamples: 221,
        xSamples: 420
      });
      if (schedulePitchforkRefinement.pending !== pending || token !== state.calculationToken) return;
      const previousCandidate = state.candidates[state.selectedCandidate] || null;
      const candidates = diagram.candidates.length ? [...diagram.candidates] : [...nextFamily.knownCandidates];
      state.family = nextFamily;
      state.diagram = diagram;
      state.candidates = candidates;
      state.selectedCandidate = nearestCandidateIndex(candidates, previousCandidate, state.selectedCandidate);
      state.taylor = null;
      state.microscope = null;
      state.microscopeView = null;
      updateCurrentSlice();
      updateFamilyCopy();
      buildCandidateOptions();
      const candidate = candidates[state.selectedCandidate];
      elements.telemetryEvent.textContent = candidate
        ? `B${state.selectedCandidate + 1} · ${candidate.label}`
        : "None detected";
      elements.stageStatus.textContent = bifurcationStatus(candidates.length);
      if (pending.announce) {
        announce(`Pitchfork unfolding updated: alpha ${formatNumber(pending.options.alpha, 3)}, beta ${formatNumber(pending.options.beta, 3)}.`);
      }
    } catch (error) {
      console.error(error);
      elements.stageStatus.textContent = "Bifurcation points could not be located; the updated diagram remains visible.";
      buildCandidateOptions();
    } finally {
      if (schedulePitchforkRefinement.pending === pending) {
        schedulePitchforkRefinement.pending = null;
        schedulePitchforkRefinement.timer = null;
      }
    }
  }, 24);
}

function requestPitchforkMorphFinish(announceChange = false) {
  window.clearTimeout(queuePitchforkMorph.idleTimer);
  queuePitchforkMorph.idleTimer = null;
  if (schedulePitchforkRefinement.pending) {
    schedulePitchforkRefinement.pending.announce ||= Boolean(announceChange);
    return;
  }
  if (!state.pitchforkMorph) {
    const target = familyCreationOptions(elements.familySelect.value);
    const current = pitchforkOptionsFromFamily(state.family);
    if (pitchforkOptionsMatch(current, target)) {
      if (announceChange) {
        announce(`Pitchfork unfolding is at alpha ${formatNumber(target.alpha, 3)} and beta ${formatNumber(target.beta, 3)}.`);
      }
      return;
    }
    queuePitchforkMorph({ finalize: true, announce: announceChange });
    return;
  }
  state.pitchforkMorph.finalizeRequested = true;
  state.pitchforkMorph.announce ||= Boolean(announceChange);
  if (motionQuery.matches) updatePitchforkMorph(performance.now(), { force: true });
}

function queuePitchforkMorph(options = {}) {
  window.clearTimeout(reloadConfiguredFamily.timeout);
  window.clearTimeout(schedulePitchforkRefinement.timer);
  if (schedulePitchforkRefinement.pending) schedulePitchforkRefinement.pending = null;
  schedulePitchforkRefinement.timer = null;
  const id = elements.familySelect.value;
  if (!familyIsPitchfork(id) || !state.family?.supportsUnfolding || !state.diagram) {
    reloadConfiguredFamily(Boolean(options.announce));
    return false;
  }
  const target = familyCreationOptions(id);
  if (!state.pitchforkMorph) {
    const current = pitchforkOptionsFromFamily(state.family);
    if (!current) return false;
    ++state.calculationToken;
    dismissLocalPopover();
    state.taylor = null;
    state.microscope = null;
    state.microscopeView = null;
    state.pitchforkMorph = {
      current,
      target,
      lastSampleAt: Number.NEGATIVE_INFINITY,
      finalizeRequested: Boolean(options.finalize),
      announce: Boolean(options.announce)
    };
  } else {
    state.pitchforkMorph.target = target;
    state.pitchforkMorph.finalizeRequested ||= Boolean(options.finalize);
    state.pitchforkMorph.announce ||= Boolean(options.announce);
  }
  window.clearTimeout(queuePitchforkMorph.idleTimer);
  if (!options.finalize) {
    queuePitchforkMorph.idleTimer = window.setTimeout(() => requestPitchforkMorphFinish(false), 180);
  }
  if (motionQuery.matches) updatePitchforkMorph(performance.now(), { force: true });
  return true;
}

function updatePitchforkMorph(now, options = {}) {
  const morph = state.pitchforkMorph;
  if (!morph) return false;
  if (!options.force && now - morph.lastSampleAt < 28) return false;
  const elapsed = Number.isFinite(morph.lastSampleAt)
    ? clamp((now - morph.lastSampleAt) / 1000, 0.016, 0.09)
    : 0.016;
  const amount = motionQuery.matches
    ? 1
    : 1 - Math.exp(-elapsed / PITCHFORK_MORPH_TIME_CONSTANT);
  let alpha = lerp(morph.current.alpha, morph.target.alpha, amount);
  let beta = lerp(morph.current.beta, morph.target.beta, amount);
  const alphaDone = Math.abs(alpha - morph.target.alpha) <= PITCHFORK_MORPH_ALPHA_TOLERANCE;
  const betaDone = Math.abs(beta - morph.target.beta) <= PITCHFORK_MORPH_BETA_TOLERANCE;
  if (alphaDone) alpha = morph.target.alpha;
  if (betaDone) beta = morph.target.beta;
  const next = {
    ...morph.target,
    alpha,
    beta
  };
  try {
    applyPitchforkPreview(next);
  } catch (error) {
    console.error(error);
    state.pitchforkMorph = null;
    buildCandidateOptions();
    elements.stageStatus.textContent = "The pitchfork diagram could not be updated.";
    return false;
  }
  morph.current = next;
  morph.lastSampleAt = now;
  const settled = alpha === morph.target.alpha && beta === morph.target.beta;
  if (settled && morph.finalizeRequested) {
    schedulePitchforkRefinement(morph.target, morph.announce);
  }
  return true;
}

function pointerPosition(canvas, event) {
  const rectangle = canvas.getBoundingClientRect();
  return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
}

const MIN_VIEW_FRACTION = 0.08;

function viewIsZoomed() {
  if (!state.view || !state.fullView) return false;
  const fullRSpan = state.fullView.rMax - state.fullView.rMin;
  const fullXSpan = state.fullView.xMax - state.fullView.xMin;
  return (
    state.view.rMax - state.view.rMin < fullRSpan * 0.9999 ||
    state.view.xMax - state.view.xMin < fullXSpan * 0.9999
  );
}

function boundedRange(minimum, maximum, fullMinimum, fullMaximum) {
  const fullSpan = fullMaximum - fullMinimum;
  const span = Math.min(fullSpan, maximum - minimum);
  let nextMinimum = minimum;
  let nextMaximum = minimum + span;
  if (nextMinimum < fullMinimum) {
    nextMinimum = fullMinimum;
    nextMaximum = fullMinimum + span;
  }
  if (nextMaximum > fullMaximum) {
    nextMaximum = fullMaximum;
    nextMinimum = fullMaximum - span;
  }
  return [nextMinimum, nextMaximum];
}

function microscopeViewIsZoomed() {
  if (!state.microscope || !state.microscopeView) return false;
  const full = state.microscope.ranges;
  const view = state.microscopeView;
  return (
    view.rMax - view.rMin < (full.rMax - full.rMin) * 0.9999
    || view.xMax - view.xMin < (full.xMax - full.xMin) * 0.9999
  );
}

function microscopeBoundsMessage(prefix = "Bifurcation microscope") {
  const view = state.microscopeView;
  if (!view) return prefix;
  return `${prefix}: μ from ${formatNumber(view.rMin, 3)} to ${formatNumber(view.rMax, 3)}; y from ${formatNumber(view.xMin, 3)} to ${formatNumber(view.xMax, 3)}.`;
}

function zoomMicroscope(factor, anchorR, anchorX) {
  if (!state.microscope || !state.microscopeView || !Number.isFinite(factor) || factor <= 0) return false;
  const full = state.microscope.ranges;
  const view = state.microscopeView;
  const fullRSpan = full.rMax - full.rMin;
  const fullXSpan = full.xMax - full.xMin;
  const currentRSpan = view.rMax - view.rMin;
  const currentXSpan = view.xMax - view.xMin;
  const nextRSpan = clamp(currentRSpan * factor, fullRSpan * MIN_VIEW_FRACTION, fullRSpan);
  const nextXSpan = clamp(currentXSpan * factor, fullXSpan * MIN_VIEW_FRACTION, fullXSpan);
  const rFraction = clamp(inverseLerp(view.rMin, view.rMax, anchorR), 0, 1);
  const xFraction = clamp(inverseLerp(view.xMin, view.xMax, anchorX), 0, 1);
  const [rMin, rMax] = boundedRange(
    anchorR - rFraction * nextRSpan,
    anchorR + (1 - rFraction) * nextRSpan,
    full.rMin,
    full.rMax
  );
  const [xMin, xMax] = boundedRange(
    anchorX - xFraction * nextXSpan,
    anchorX + (1 - xFraction) * nextXSpan,
    full.xMin,
    full.xMax
  );
  const changed = (
    Math.abs(rMin - view.rMin) > fullRSpan * 1e-9
    || Math.abs(rMax - view.rMax) > fullRSpan * 1e-9
    || Math.abs(xMin - view.xMin) > fullXSpan * 1e-9
    || Math.abs(xMax - view.xMax) > fullXSpan * 1e-9
  );
  if (!changed) return false;
  state.microscopeView = { rMin, rMax, xMin, xMax };
  state.localDirty = true;
  return true;
}

function panMicroscope(deltaR, deltaX) {
  if (!microscopeViewIsZoomed()) return false;
  const full = state.microscope.ranges;
  const view = state.microscopeView;
  const [rMin, rMax] = boundedRange(
    view.rMin + deltaR,
    view.rMax + deltaR,
    full.rMin,
    full.rMax
  );
  const [xMin, xMax] = boundedRange(
    view.xMin + deltaX,
    view.xMax + deltaX,
    full.xMin,
    full.xMax
  );
  if (rMin === view.rMin && rMax === view.rMax && xMin === view.xMin && xMax === view.xMax) return false;
  state.microscopeView = { rMin, rMax, xMin, xMax };
  state.localDirty = true;
  return true;
}

function handleMicroscopeWheel(event) {
  if (!state.localPopoverOpen || !state.microscopeView || !state.microscopePlotBox || state.microscopePointer) return;
  const position = pointerPosition(elements.microscopeCanvas, event);
  const box = state.microscopePlotBox;
  if (position.x < box.left || position.x > box.right || position.y < box.top || position.y > box.bottom) return;
  const modeScale = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? box.bottom - box.top
      : 1;
  const normalizedDelta = clamp(event.deltaY * modeScale, -240, 240);
  if (!normalizedDelta) return;
  const factor = clamp(Math.exp(normalizedDelta * 0.0015), 0.75, 1.35);
  const anchorR = valueFromHorizontal(position.x, state.microscopeView.rMin, state.microscopeView.rMax, box);
  const anchorX = valueFromVertical(position.y, state.microscopeView.xMin, state.microscopeView.xMax, box);
  if (zoomMicroscope(factor, anchorR, anchorX)) {
    event.preventDefault();
    announce(microscopeBoundsMessage(factor < 1 ? "Zoomed into the bifurcation microscope" : "Zoomed out of the bifurcation microscope"));
  }
}

function handleMicroscopeKey(event) {
  if (!state.microscope || !state.microscopeView) return;
  const view = state.microscopeView;
  const centerR = (view.rMin + view.rMax) / 2;
  const centerX = (view.xMin + view.xMax) / 2;
  if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    const zoomIn = event.key === "+" || event.key === "=";
    if (zoomMicroscope(zoomIn ? 0.8 : 1.25, centerR, centerX)) {
      announce(microscopeBoundsMessage(zoomIn ? "Zoomed into the bifurcation microscope" : "Zoomed out of the bifurcation microscope"));
    }
  } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const rStep = (view.rMax - view.rMin) * 0.08;
    const xStep = (view.xMax - view.xMin) * 0.08;
    const deltaR = event.key === "ArrowLeft" ? -rStep : event.key === "ArrowRight" ? rStep : 0;
    const deltaX = event.key === "ArrowDown" ? -xStep : event.key === "ArrowUp" ? xStep : 0;
    if (panMicroscope(deltaR, deltaX)) announce(microscopeBoundsMessage("Panned the bifurcation microscope"));
  } else if (event.key === "0" || event.key.toLowerCase() === "f") {
    event.preventDefault();
    resetMicroscopeView({ announce: true });
  }
}

function updateDiagramNavigationMode() {
  elements.bifurcationCanvas.dataset.navigation = viewIsZoomed() ? "pan" : "parameter";
}

function refreshSharedView(options = {}) {
  if (!state.view) return;
  state.slopeCursorX = clamp(state.slopeCursorX, state.view.xMin, state.view.xMax);
  state.phaseCursorX = clamp(state.phaseCursorX, state.view.xMin, state.view.xMax);
  applyParameterReadout(false);
  updateCurrentSlice();
  updateDiagramNavigationMode();
  state.localPopoverNeedsPosition = state.localPopoverOpen;
  if (options.resetParticles) resetParticles();
}

function zoomDiagram(factor, anchorR, anchorX, options = {}) {
  if (!state.view || !state.fullView || !Number.isFinite(factor) || factor <= 0) return false;
  const currentRSpan = state.view.rMax - state.view.rMin;
  const currentXSpan = state.view.xMax - state.view.xMin;
  const fullRSpan = state.fullView.rMax - state.fullView.rMin;
  const fullXSpan = state.fullView.xMax - state.fullView.xMin;
  const nextRSpan = clamp(currentRSpan * factor, fullRSpan * MIN_VIEW_FRACTION, fullRSpan);
  const nextXSpan = clamp(currentXSpan * factor, fullXSpan * MIN_VIEW_FRACTION, fullXSpan);
  const rFraction = clamp(inverseLerp(state.view.rMin, state.view.rMax, anchorR), 0, 1);
  const xFraction = clamp(inverseLerp(state.view.xMin, state.view.xMax, anchorX), 0, 1);
  const [rMin, rMax] = boundedRange(
    anchorR - rFraction * nextRSpan,
    anchorR + (1 - rFraction) * nextRSpan,
    state.fullView.rMin,
    state.fullView.rMax
  );
  const [xMin, xMax] = boundedRange(
    anchorX - xFraction * nextXSpan,
    anchorX + (1 - xFraction) * nextXSpan,
    state.fullView.xMin,
    state.fullView.xMax
  );
  const changed = (
    Math.abs(rMin - state.view.rMin) > fullRSpan * 1e-9 ||
    Math.abs(rMax - state.view.rMax) > fullRSpan * 1e-9 ||
    Math.abs(xMin - state.view.xMin) > fullXSpan * 1e-9 ||
    Math.abs(xMax - state.view.xMax) > fullXSpan * 1e-9
  );
  if (!changed) return false;
  state.view = { rMin, rMax, xMin, xMax };
  refreshSharedView({ resetParticles: Boolean(options.resetParticles) });
  return true;
}

function viewBoundsMessage(prefix = "View") {
  const currentOutside = state.r < state.view.rMin || state.r > state.view.rMax;
  return `${prefix}: r from ${formatNumber(state.view.rMin, 2)} to ${formatNumber(state.view.rMax, 2)}; x from ${formatNumber(state.view.xMin, 2)} to ${formatNumber(state.view.xMax, 2)}.${currentOutside ? ` Current r ${formatNumber(state.r, 2)} is outside the branch window.` : ""}`;
}

function handleDiagramWheel(event) {
  if (!state.plotBox || !state.view || state.pointerDragging) return;
  const position = pointerPosition(elements.bifurcationCanvas, event);
  if (
    position.x < state.plotBox.left || position.x > state.plotBox.right ||
    position.y < state.plotBox.top || position.y > state.plotBox.bottom
  ) return;
  const modeScale = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? state.plotBox.bottom - state.plotBox.top
      : 1;
  const normalizedDelta = clamp(event.deltaY * modeScale, -240, 240);
  if (!normalizedDelta) return;
  const factor = clamp(Math.exp(normalizedDelta * 0.0015), 0.75, 1.35);
  const anchorR = valueFromHorizontal(position.x, state.view.rMin, state.view.rMax, state.plotBox);
  const anchorX = valueFromVertical(position.y, state.view.xMin, state.view.xMax, state.plotBox);
  if (zoomDiagram(factor, anchorR, anchorX, { resetParticles: false })) {
    event.preventDefault();
    announce(viewBoundsMessage(factor < 1 ? "Zoomed in" : "Zoomed out"));
  }
}

function clearDiagramPointer(event) {
  const pointerId = state.pointerStart?.pointerId;
  state.pointerDragging = false;
  state.pointerStart = null;
  state.pointerMoved = false;
  delete elements.bifurcationCanvas.dataset.dragging;
  if (
    pointerId != null &&
    event?.type !== "lostpointercapture" &&
    elements.bifurcationCanvas.hasPointerCapture(pointerId)
  ) {
    elements.bifurcationCanvas.releasePointerCapture(pointerId);
  }
}

function panDiagram(deltaR, deltaX, options = {}) {
  if (!state.view || !state.fullView || !viewIsZoomed()) return false;
  const [rMin, rMax] = boundedRange(
    state.view.rMin + deltaR,
    state.view.rMax + deltaR,
    state.fullView.rMin,
    state.fullView.rMax
  );
  const [xMin, xMax] = boundedRange(
    state.view.xMin + deltaX,
    state.view.xMax + deltaX,
    state.fullView.xMin,
    state.fullView.xMax
  );
  const changed = rMin !== state.view.rMin || rMax !== state.view.rMax || xMin !== state.view.xMin || xMax !== state.view.xMax;
  if (!changed) return false;
  state.view = { rMin, rMax, xMin, xMax };
  refreshSharedView({ resetParticles: Boolean(options.resetParticles) });
  return true;
}

function candidateMarkerAt(position) {
  if (!state.plotBox || !state.view) return null;
  for (let index = 0; index < state.candidates.length; index += 1) {
    const candidate = state.candidates[index];
    if (
      candidate.r < state.view.rMin || candidate.r > state.view.rMax ||
      candidate.x < state.view.xMin || candidate.x > state.view.xMax
    ) continue;
    const x = mapHorizontal(candidate.r, state.view.rMin, state.view.rMax, state.plotBox);
    const y = mapVertical(candidate.x, state.view.xMin, state.view.xMax, state.plotBox);
    if (Math.hypot(x - position.x, y - position.y) < 15) return { index, x, y };
  }
  return null;
}

function updateParameterFromDiagram(event, announceChange = false) {
  if (!state.plotBox || !state.view) return false;
  const position = pointerPosition(elements.bifurcationCanvas, event);
  const x = clamp(position.x, state.plotBox.left, state.plotBox.right);
  const value = valueFromHorizontal(x, state.view.rMin, state.view.rMax, state.plotBox);
  setParameter(value, { manual: true, announce: announceChange });
  return true;
}

function addSlopeInitialValue(value) {
  const x = clamp(value, state.view.xMin, state.view.xMax);
  state.slopeCursorX = x;
  state.extraSlopeInitials.push(x);
  if (state.extraSlopeInitials.length > 8) state.extraSlopeInitials.shift();
  announce(`Added a slope-field trajectory from x ${formatNumber(x, 2)}.`);
}

function addSlopeInitial(event) {
  const { height, width } = elements.slopeCanvas.getBoundingClientRect();
  const box = plotRectangle(width, height);
  const position = pointerPosition(elements.slopeCanvas, event);
  addSlopeInitialValue(valueFromVertical(position.y, state.view.xMin, state.view.xMax, box));
}

function addPhaseParticleValue(value) {
  const x = clamp(value, state.view.xMin, state.view.xMax);
  state.phaseCursorX = x;
  const particle = {
    x,
    age: 0,
    settledFor: 0,
    respawnDelay: 0.9,
    ambient: false,
    lane: ((state.particles.length % 3) - 1) * 9,
    trail: []
  };
  particle.trail = [particle.x];
  state.particles.push(particle);
  if (state.particles.length > 17) {
    const oldestAddedParticle = state.particles.findIndex((entry) => !entry.ambient);
    state.particles.splice(oldestAddedParticle >= 0 ? oldestAddedParticle : 0, 1);
  }
  announce(`Added a phase-line point at x ${formatNumber(particle.x, 2)}.`);
}

function addPhaseParticle(event) {
  const rectangle = elements.phaseCanvas.getBoundingClientRect();
  const position = pointerPosition(elements.phaseCanvas, event);
  const left = 42;
  const right = rectangle.width - 42;
  addPhaseParticleValue(
    lerp(state.view.xMin, state.view.xMax, inverseLerp(left, right, position.x))
  );
}

function handleInitialConditionKey(kind, event) {
  if (!state.view) return;
  const isSlope = kind === "slope";
  const current = isSlope ? state.slopeCursorX : state.phaseCursorX;
  const span = state.view.xMax - state.view.xMin;
  const step = span * (event.shiftKey ? 0.1 : 0.02);
  let next = current;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") next += step;
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= step;
  else if (event.key === "Home") next = state.view.xMin;
  else if (event.key === "End") next = state.view.xMax;
  else if (event.key === "Enter" || event.key === " " || event.code === "Space") {
    event.preventDefault();
    if (isSlope) addSlopeInitialValue(current);
    else addPhaseParticleValue(current);
    return;
  } else return;
  event.preventDefault();
  next = clamp(next, state.view.xMin, state.view.xMax);
  if (isSlope) state.slopeCursorX = next;
  else state.phaseCursorX = next;
  announce(`${isSlope ? "Slope-field" : "Phase-line"} initial state x ${formatNumber(next, 2)}. Press Enter to add it.`);
}

function handleDiagramKey(event) {
  if (!state.family) return;
  const span = state.family.rRange[1] - state.family.rRange[0];
  const step = span * (event.shiftKey ? 0.025 : 0.005);
  const viewRSpan = state.view.rMax - state.view.rMin;
  const viewXSpan = state.view.xMax - state.view.xMin;
  if (event.key === "Enter" && state.candidates.length) {
    event.preventDefault();
    selectCandidate(Math.max(0, state.selectedCandidate), {
      open: true,
      trigger: elements.bifurcationCanvas
    });
  } else if (event.ctrlKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const deltaR = event.key === "ArrowLeft"
      ? -viewRSpan * 0.08
      : event.key === "ArrowRight"
        ? viewRSpan * 0.08
        : 0;
    const deltaX = event.key === "ArrowUp"
      ? viewXSpan * 0.08
      : event.key === "ArrowDown"
        ? -viewXSpan * 0.08
        : 0;
    if (panDiagram(deltaR, deltaX)) announce(viewBoundsMessage("Panned view"));
  } else if (["+", "=", "-", "_"].includes(event.key)) {
    event.preventDefault();
    const zoomIn = event.key === "+" || event.key === "=";
    const centerR = (state.view.rMin + state.view.rMax) / 2;
    const centerX = (state.view.xMin + state.view.xMax) / 2;
    if (zoomDiagram(zoomIn ? 0.8 : 1.25, centerR, centerX)) {
      announce(viewBoundsMessage(zoomIn ? "Zoomed in" : "Zoomed out"));
    }
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    setParameter(state.r + (event.key === "ArrowRight" ? step : -step), { manual: true, announce: true });
  } else if (event.key === "Home") {
    event.preventDefault();
    setParameter(state.family.rRange[0], { manual: true, announce: true });
  } else if (event.key === "End") {
    event.preventDefault();
    setParameter(state.family.rRange[1], { manual: true, announce: true });
  } else if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    toggleSweep();
  } else if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    fitAllBranches();
  } else if (event.key === "0") {
    event.preventDefault();
    fitAllBranches();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    generateFamily();
  }
}

elements.familySelect.addEventListener("change", () => {
  const id = elements.familySelect.value;
  stopPitchforkPlayers({ finalize: false });
  updateFamilySpecificControls(id);
  if (id === "random") {
    state.seed = makeSeed();
  }
  if (id === "custom") applyCustomFamily({ announce: true });
  else loadFamily(id, { announce: true });
});
elements.generateFamily.addEventListener("click", generateFamily);
elements.nFoldCount.addEventListener("input", () => {
  updateFamilySpecificControls("n-fold");
  scheduleConfiguredFamilyReload();
});
elements.nFoldCount.addEventListener("change", () => reloadConfiguredFamily(true));
elements.pitchforkCase.addEventListener("change", () => {
  stopPitchforkPlayers({ finalize: false });
  applyPitchforkCase(elements.pitchforkCase.value);
  queuePitchforkMorph({ finalize: true, announce: true });
});
for (const [name, control] of [["alpha", elements.pitchforkAlpha], ["beta", elements.pitchforkBeta]]) {
  control.addEventListener("input", () => {
    setPitchforkPlayer(name, false, { announce: false, finalize: false });
    elements.pitchforkCase.value = "custom";
    updatePitchforkReadouts();
    queuePitchforkMorph();
  });
  control.addEventListener("change", () => requestPitchforkMorphFinish(true));
}
elements.playPitchforkAlpha.addEventListener("click", () => togglePitchforkPlayer("alpha"));
elements.playPitchforkBeta.addEventListener("click", () => togglePitchforkPlayer("beta"));
elements.pitchforkSigns.addEventListener("change", () => {
  stopPitchforkPlayers({ finalize: false });
  reloadConfiguredFamily(true);
});
elements.pitchforkTimeSign.addEventListener("change", () => {
  stopPitchforkPlayers({ finalize: false });
  reloadConfiguredFamily(true);
});
elements.applyCustomEquation.addEventListener("click", () => applyCustomFamily({ announce: true }));
elements.customEquation.addEventListener("input", clearCustomEquationError);
for (const control of [
  elements.customEquation,
  elements.customXMin,
  elements.customXMax,
  elements.customRMin,
  elements.customRMax
]) {
  control.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyCustomFamily({ announce: true });
  });
}
elements.customEquation.addEventListener("change", () => {
  if (!elements.customEquationError.hidden) clearCustomEquationError();
});
elements.parameter.addEventListener("input", () => setParameter(elements.parameter.value, { manual: true }));
elements.parameter.addEventListener("change", () => announce(`Parameter r is ${formatNumber(state.r, 3)}.`));
elements.toggleSweep.addEventListener("click", toggleSweep);
elements.centerParameter.addEventListener("click", () => {
  const center = (state.family.rRange[0] + state.family.rRange[1]) / 2;
  setParameter(center, { manual: true, announce: true });
});
elements.sweepSpeed.addEventListener("input", () => {
  state.sweepSpeed = Number(elements.sweepSpeed.value);
  elements.sweepSpeedValue.value = `${state.sweepSpeed.toFixed(2)}×`;
  elements.sweepSpeedValue.textContent = `${state.sweepSpeed.toFixed(2)}×`;
  elements.sweepSpeed.setAttribute("aria-valuetext", `${state.sweepSpeed.toFixed(2)} times`);
});
elements.candidateSelect.addEventListener("change", () => selectCandidate(elements.candidateSelect.value, {
  open: true,
  trigger: elements.candidateSelect
}));
elements.focusCandidate.addEventListener("click", () => selectCandidate(state.selectedCandidate, {
  focus: true,
  open: true,
  trigger: elements.focusCandidate
}));
elements.fitBranches.addEventListener("click", fitAllBranches);
elements.resetParticles.addEventListener("click", () => {
  resetParticles();
  announce("Trajectories restarted from evenly spaced initial conditions.");
});
elements.toggleParticles.addEventListener("click", () => {
  state.particlesPaused = !state.particlesPaused;
  if (!state.particlesPaused) state.particleEmitterElapsed = PARTICLE_EMISSION_INTERVAL;
  elements.toggleParticles.textContent = state.particlesPaused ? "Resume trajectories" : "Pause trajectories";
  announce(state.particlesPaused ? "Trajectory motion paused." : "Trajectory motion resumed.");
});
elements.runHysteresis.addEventListener("click", requestHysteresis);
elements.hysteresisPanelButton.addEventListener("click", requestHysteresis);
elements.closeLocalPopover.addEventListener("click", () => dismissLocalPopover({
  restoreFocus: true,
  announce: true
}));
elements.fullscreenToggle?.addEventListener("click", () => {
  toggleWorkspaceFullscreen();
});
document.addEventListener("fullscreenchange", syncFullscreenState);
document.addEventListener("webkitfullscreenchange", syncFullscreenState);
document.addEventListener("fullscreenerror", () => {
  reportFullscreenError();
});
document.addEventListener("webkitfullscreenerror", () => {
  reportFullscreenError();
});

elements.microscopeCanvas.addEventListener("pointerdown", (event) => {
  if (
    event.button !== 0
    || event.isPrimary === false
    || !state.localPopoverOpen
    || !state.microscopeView
    || !state.microscopePlotBox
  ) return;
  const position = pointerPosition(elements.microscopeCanvas, event);
  const box = state.microscopePlotBox;
  if (position.x < box.left || position.x > box.right || position.y < box.top || position.y > box.bottom) return;
  event.preventDefault();
  elements.microscopeCanvas.focus({ preventScroll: true });
  state.microscopePointer = {
    pointerId: event.pointerId,
    x: position.x,
    y: position.y,
    moved: false,
    view: { ...state.microscopeView }
  };
  elements.microscopeCanvas.setPointerCapture(event.pointerId);
});
elements.microscopeCanvas.addEventListener("pointermove", (event) => {
  if (!state.microscopePointer || event.pointerId !== state.microscopePointer.pointerId) return;
  const position = pointerPosition(elements.microscopeCanvas, event);
  const deltaX = position.x - state.microscopePointer.x;
  const deltaY = position.y - state.microscopePointer.y;
  if (!state.microscopePointer.moved && Math.hypot(deltaX, deltaY) < 5) return;
  event.preventDefault();
  state.microscopePointer.moved = true;
  elements.microscopeCanvas.dataset.dragging = "pan";
  const startView = state.microscopePointer.view;
  const box = state.microscopePlotBox;
  const rSpan = startView.rMax - startView.rMin;
  const xSpan = startView.xMax - startView.xMin;
  state.microscopeView = { ...startView };
  panMicroscope(
    -deltaX / Math.max(1, box.right - box.left) * rSpan,
    deltaY / Math.max(1, box.bottom - box.top) * xSpan
  );
});
elements.microscopeCanvas.addEventListener("pointerup", (event) => {
  if (!state.microscopePointer || event.pointerId !== state.microscopePointer.pointerId) return;
  const moved = state.microscopePointer.moved;
  clearMicroscopePointer(event);
  if (moved) announce(microscopeBoundsMessage("Panned the bifurcation microscope"));
});
elements.microscopeCanvas.addEventListener("pointercancel", clearMicroscopePointer);
elements.microscopeCanvas.addEventListener("lostpointercapture", clearMicroscopePointer);
elements.microscopeCanvas.addEventListener("wheel", handleMicroscopeWheel, { passive: false });
elements.microscopeCanvas.addEventListener("dblclick", () => resetMicroscopeView({ announce: true }));
elements.microscopeCanvas.addEventListener("keydown", handleMicroscopeKey);

elements.bifurcationCanvas.addEventListener("pointerdown", (event) => {
  if ((event.button !== 0 && event.button !== 1) || event.isPrimary === false || !state.plotBox || !state.view) return;
  const position = pointerPosition(elements.bifurcationCanvas, event);
  if (
    position.x < state.plotBox.left || position.x > state.plotBox.right ||
    position.y < state.plotBox.top || position.y > state.plotBox.bottom
  ) return;
  const mode = event.button === 1 ? "pan" : "parameter";
  const candidate = mode === "parameter" ? candidateMarkerAt(position) : null;
  if (mode === "parameter" && !candidate) dismissLocalPopover();
  if (mode === "pan") {
    event.preventDefault();
    elements.bifurcationCanvas.focus({ preventScroll: true });
  }
  state.pointerDragging = true;
  state.pointerMoved = false;
  state.pointerStart = {
    pointerId: event.pointerId,
    x: position.x,
    y: position.y,
    view: { ...state.view },
    mode,
    candidateIndex: candidate?.index ?? null
  };
  elements.bifurcationCanvas.dataset.dragging = mode;
  elements.bifurcationCanvas.setPointerCapture(event.pointerId);
  if (mode === "parameter" && !candidate) updateParameterFromDiagram(event);
});
elements.bifurcationCanvas.addEventListener("pointermove", (event) => {
  const position = pointerPosition(elements.bifurcationCanvas, event);
  if (!state.pointerDragging) {
    const candidate = candidateMarkerAt(position);
    if (candidate) elements.bifurcationCanvas.dataset.hoverCandidate = String(candidate.index);
    else delete elements.bifurcationCanvas.dataset.hoverCandidate;
    return;
  }
  if (event.pointerId !== state.pointerStart?.pointerId) return;
  const deltaX = position.x - state.pointerStart.x;
  const deltaY = position.y - state.pointerStart.y;
  if (!state.pointerMoved && Math.hypot(deltaX, deltaY) < 5) return;
  state.pointerMoved = true;
  if (state.pointerStart.mode === "parameter") {
    state.pointerStart.candidateIndex = null;
    updateParameterFromDiagram(event);
    return;
  }
  event.preventDefault();
  if (!viewIsZoomed()) return;
  const startView = state.pointerStart.view;
  const rSpan = startView.rMax - startView.rMin;
  const xSpan = startView.xMax - startView.xMin;
  const plotWidth = state.plotBox.right - state.plotBox.left;
  const plotHeight = state.plotBox.bottom - state.plotBox.top;
  state.view = { ...startView };
  panDiagram(-deltaX / plotWidth * rSpan, deltaY / plotHeight * xSpan);
});
elements.bifurcationCanvas.addEventListener("pointerup", (event) => {
  if (!state.pointerDragging || event.pointerId !== state.pointerStart?.pointerId) return;
  if (state.pointerStart.mode === "parameter") {
    if (!state.pointerMoved && state.pointerStart.candidateIndex != null) {
      selectCandidate(state.pointerStart.candidateIndex, {
        focus: false,
        open: true,
        trigger: elements.bifurcationCanvas
      });
    } else {
      updateParameterFromDiagram(event, true);
    }
  } else if (state.pointerMoved) {
    announce(viewIsZoomed() ? viewBoundsMessage("Panned view") : "The full bifurcation diagram is already visible.");
  }
  clearDiagramPointer(event);
});
elements.bifurcationCanvas.addEventListener("pointercancel", (event) => {
  clearDiagramPointer(event);
});
elements.bifurcationCanvas.addEventListener("pointerleave", () => {
  if (!state.pointerDragging) delete elements.bifurcationCanvas.dataset.hoverCandidate;
});
elements.bifurcationCanvas.addEventListener("lostpointercapture", (event) => clearDiagramPointer(event));
elements.bifurcationCanvas.addEventListener("mousedown", (event) => {
  if (event.button === 1) event.preventDefault();
});
elements.bifurcationCanvas.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});
elements.bifurcationCanvas.addEventListener("wheel", handleDiagramWheel, { passive: false });
elements.bifurcationCanvas.addEventListener("dblclick", fitAllBranches);
elements.bifurcationCanvas.addEventListener("keydown", handleDiagramKey);
function handleLocalPopoverEscape(event) {
  if (event.key !== "Escape" || !state.localPopoverOpen) return;
  event.preventDefault();
  dismissLocalPopover({ restoreFocus: true, announce: true });
}
elements.localPopover.addEventListener("keydown", handleLocalPopoverEscape);
elements.candidateSelect.addEventListener("keydown", handleLocalPopoverEscape);
elements.bifurcationCanvas.addEventListener("keydown", handleLocalPopoverEscape);
elements.slopeCanvas.addEventListener("click", addSlopeInitial);
elements.slopeCanvas.addEventListener("keydown", (event) => handleInitialConditionKey("slope", event));
elements.phaseCanvas.addEventListener("click", addPhaseParticle);
elements.phaseCanvas.addEventListener("keydown", (event) => handleInitialConditionKey("phase", event));

function animate(now) {
  const delta = Math.min(0.06, Math.max(0, (now - state.lastFrameTime) / 1000));
  state.lastFrameTime = now;
  state.elapsed += delta;
  updatePitchforkPlayers(now);
  updatePitchforkMorph(now);
  updateSweep(delta);
  updateHysteresis(delta, now);
  updateParticles(delta);
  if ((state.sweepRunning || state.hysteresis.running) && now - state.lastSliceUpdate > 55) {
    updateCurrentSlice();
    state.lastSliceUpdate = now;
  }
  if (!document.hidden && now - state.lastRenderTime >= 30) {
    drawBifurcationDiagram();
    drawSlopeField();
    drawPhaseLine();
    if (state.localPopoverOpen && state.localDirty) {
      drawLocalDiagram();
      state.localDirty = false;
    }
    if (!elements.hysteresisPanel.hidden && (state.hysteresis.running || state.hysteresisDirty)) {
      drawHysteresisPanel();
      state.hysteresisDirty = false;
    }
    state.lastRenderTime = now;
  }
  window.requestAnimationFrame(animate);
}

if (typeof ResizeObserver === "function") {
  const observer = new ResizeObserver(() => {
    drawBifurcationDiagram();
    drawSlopeField();
    drawPhaseLine();
    if (state.localPopoverOpen) {
      state.localPopoverNeedsPosition = true;
      drawLocalDiagram();
      positionLocalPopover();
    }
    if (!elements.hysteresisPanel.hidden) drawHysteresisPanel();
  });
  [
    elements.bifurcationCanvas,
    elements.slopeCanvas,
    elements.phaseCanvas,
    elements.microscopeCanvas,
    elements.hysteresisCanvas
  ].forEach((canvas) => observer.observe(canvas));
}

motionQuery.addEventListener?.("change", (event) => {
  if (event.matches) {
    stopSweep();
    stopHysteresis(false);
    stopPitchforkPlayers({ finalize: true });
    state.particlesPaused = true;
    elements.toggleParticles.textContent = "Resume trajectories";
    if (state.pitchforkMorph) {
      state.pitchforkMorph.finalizeRequested = true;
      updatePitchforkMorph(performance.now(), { force: true });
    }
  }
});

elements.toggleParticles.textContent = state.particlesPaused ? "Resume trajectories" : "Pause trajectories";
elements.sweepSpeedValue.value = `${state.sweepSpeed.toFixed(2)}×`;
elements.sweepSpeedValue.textContent = `${state.sweepSpeed.toFixed(2)}×`;
elements.sweepSpeed.setAttribute("aria-valuetext", `${state.sweepSpeed.toFixed(2)} times`);
syncPitchforkPlayerButton("alpha");
syncPitchforkPlayerButton("beta");
loadFamily("random", { announce: true });
initializeFullscreenControl();
window.requestAnimationFrame(animate);
