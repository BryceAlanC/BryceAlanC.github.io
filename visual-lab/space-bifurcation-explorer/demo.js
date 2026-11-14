import {
  LORENZ_HOPF, PRESETS, compareTrajectories, equilibriaAt, integrateTrajectory, sampleEquilibria, samplePeakColumn, sectionCrossings
} from "./model.js?v=20261114-4";
import { drawPortrait } from "./portrait.js?v=20261114-4";
import { drawParameterChart, drawSectionChart, drawSeparationChart, drawStabilityChart } from "./charts.js?v=20261114-4";

const byId = id => document.getElementById(id);
const controls = {
  workspace: byId("space-lab"),
  form: byId("system-controls"),
  system: byId("system"),
  equations: byId("equations"),
  parameter: byId("parameter"),
  parameterInput: byId("parameter-input"),
  parameterMin: byId("parameter-min"),
  parameterMax: byId("parameter-max"),
  quickParameters: byId("quick-parameters"),
  initial: [byId("initial-x"), byId("initial-y"), byId("initial-z")],
  resetInitial: byId("reset-initial"),
  playback: byId("playback"),
  restart: byId("restart"),
  timeline: byId("timeline"),
  timeReadout: byId("time-readout"),
  stepTime: byId("step-time"),
  playbackSpeed: byId("playback-speed"),
  sweep: byId("sweep"),
  sweepSpeed: byId("sweep-speed"),
  compare: byId("compare"),
  comparisonKey: byId("comparison-key"),
  perturbationControls: byId("perturbation-controls"),
  perturbationAxis: byId("perturbation-axis"),
  perturbationSize: byId("perturbation-size"),
  launchMode: byId("launch-mode"),
  launchHeight: byId("launch-height"),
  portraitHelp: byId("portrait-help"),
  fullscreen: byId("fullscreen"),
  parameterMode: byId("parameter-mode"),
  equilibriumKey: byId("equilibrium-key"),
  peakKey: byId("peak-key"),
  sectionMode: byId("section-mode"),
  showPlane: byId("show-plane"),
  sectionAngle: byId("section-angle"),
  sectionOffset: byId("section-offset"),
  angleReadout: byId("angle-readout"),
  offsetReadout: byId("offset-readout"),
  direction: byId("direction"),
  stabilityMode: byId("stability-mode"),
  equilibrium: byId("equilibrium"),
  portrait: byId("portrait-canvas"),
  parameterChart: byId("parameter-canvas"),
  sectionChart: byId("section-canvas"),
  previousHit: byId("previous-hit"),
  nextHit: byId("next-hit"),
  clearHit: byId("clear-hit"),
  sectionSelection: byId("section-selection"),
  stabilityChart: byId("stability-canvas"),
  separationPanel: byId("separation-panel"),
  separationChart: byId("separation-canvas"),
  separationSummary: byId("separation-summary"),
  trajectorySummary: byId("trajectory-summary"),
  parameterSummary: byId("parameter-summary"),
  sectionSummary: byId("section-summary"),
  sectionTitle: byId("section-title"),
  sectionDefinition: byId("section-definition"),
  stabilitySummary: byId("stability-summary"),
  announcer: byId("announcer")
};

const defaultCamera = { azimuth: -0.55, elevation: 0.31, zoom: 1 };
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const examples = {
  lorenz: [[12, "r = 12"], [LORENZ_HOPF, "Hopf point"], [28, "r = 28"]],
  hopf: [[-0.5, "r = -0.5"], [0, "Hopf point"], [1, "r = 1"]]
};
const equations = {
  lorenz: [
    "x&#775; = 10(y &minus; x), &nbsp; y&#775; = x(r &minus; z) &minus; y",
    "z&#775; = xy &minus; (8/3)z"
  ],
  hopf: [
    "x&#775; = (r &minus; x&sup2; &minus; y&sup2;)x &minus; y",
    "y&#775; = x + (r &minus; x&sup2; &minus; y&sup2;)y, &nbsp; z&#775; = &minus;z"
  ]
};

const state = {
  preset: PRESETS.lorenz, parameter: 28, initial: null, branches: [],
  equilibria: [], selectedEquilibrium: null, run: null, trajectory: null,
  section: { angle: 0, offset: 5, direction: 1 }, crossings: [],
  camera: { ...defaultCamera }, headIndex: 0, playing: !motion.matches,
  lastFrame: null, animation: null, drag: null,
  comparison: null, comparisonTrail: null, sweepTimer: null,
  portraitGeometry: null, parameterGeometry: null, sectionGeometry: null,
  parameterPointer: null, selectedHit: null, hoveredHit: null, placing: false
};
const branchCache = new Map();
const peakCache = new Map();
let peakRequest = null;
let pendingParameter = null;
let parameterFrame = null;
let resizeFrame = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatted = value => String(Number(value.toPrecision(5)));
const announce = message => { controls.announcer.textContent = message; };

function surface(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (width < 1 || height < 1) return null;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const pixelsWide = Math.round(width * ratio);
  const pixelsHigh = Math.round(height * ratio);
  if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
  if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return [context, width, height];
}

function paintPortrait() {
  const target = surface(controls.portrait);
  if (!target || !state.trajectory) return;
  const selection = state.sectionGeometry?.pointAt(state.hoveredHit ?? state.selectedHit);
  state.portraitGeometry = drawPortrait(...target, {
    preset: state.preset,
    trajectory: state.trajectory,
    equilibria: state.equilibria,
    selectedEquilibrium: state.selectedEquilibrium,
    section: controls.showPlane.checked ? state.section : null,
    crossings: controls.showPlane.checked ? state.crossings : [],
    camera: state.camera,
    headIndex: state.headIndex,
    comparison: state.comparisonTrail,
    selectedCrossing: selection?.point,
    nextCrossing: selection?.nextPoint,
    launchHeight: state.placing ? controls.launchHeight.valueAsNumber : null
  });
}

function paintParameter() {
  const mode = controls.parameterMode.value;
  const isPeak = mode === "peaks";
  const cached = peakCache.get(state.preset.id);
  const peakSweep = cached?.columns ?? [];
  const observed = state.run?.peaks ?? [];
  controls.equilibriumKey.hidden = isPeak;
  controls.peakKey.hidden = !isPeak;
  controls.parameterChart.setAttribute("aria-label", isPeak
    ? `${state.preset.peakCoordinate} peaks against r`
    : "Equilibrium x coordinates against r");
  if (!isPeak) {
    controls.parameterSummary.textContent = "Branches show equilibrium x-coordinates. Dashed branches are unstable. The vertical line marks the current r.";
  } else {
    const label = state.preset.peakCoordinate;
    const sampled = state.preset.id === "hopf"
      ? "The curve gives the limiting x peak of the Hopf normal form."
      : "The sweep samples late z peaks from the preset initial condition at each r.";
    const progress = peakRequest?.presetId === state.preset.id
      ? ` Computing parameter samples (${peakRequest.columns.length}/${peakRequest.count}).`
      : cached?.failed ? " The parameter sweep was unavailable." : "";
    controls.parameterSummary.textContent = `${sampled} Gold points show ${observed.length} late ${label} peaks for the current trajectory.${progress}`;
  }
  const target = surface(controls.parameterChart);
  if (target) state.parameterGeometry = drawParameterChart(...target, {
    preset: state.preset, mode, parameter: state.parameter, branches: state.branches,
    equilibria: state.equilibria, peakSweep: peakRequest?.presetId === state.preset.id
      ? peakRequest.columns : peakSweep, peaks: observed, selectedEquilibrium: state.selectedEquilibrium
  });
}

function paintSection() {
  const inSectionMode = controls.sectionMode.value === "section";
  const peaks = state.run?.peaks ?? [];
  const angle = Number(controls.sectionAngle.value);
  const offset = Number(controls.sectionOffset.value);
  controls.angleReadout.textContent = `${angle}\u00b0`;
  controls.offsetReadout.textContent = formatted(offset);
  controls.sectionTitle.textContent = inSectionMode ? "Poincar\u00e9 section" : "Peak return plot";
  if (inSectionMode) {
    controls.sectionDefinition.textContent = angle === 0
      ? `x = ${formatted(offset)}`
      : `x cos(${angle}\u00b0) + y sin(${angle}\u00b0) = ${formatted(offset)}`;
    controls.sectionChart.setAttribute("aria-label", "Directed crossings in the section plane");
    const number = state.crossings.length;
    controls.sectionSummary.textContent = number
      ? `${number} directed ${number === 1 ? "crossing" : "crossings"} after the transient. The coordinates u and z lie in the section plane.`
      : "No directed crossings after the transient. Move the plane, reverse direction, or try another initial condition.";
  } else {
    controls.sectionDefinition.textContent = `Consecutive ${state.preset.peakCoordinate} maxima`;
    controls.sectionChart.setAttribute("aria-label", "Successive peak heights plotted against each other");
    const number = Math.max(0, peaks.length - 1);
    controls.sectionSummary.textContent = number
      ? `${number} consecutive peak ${number === 1 ? "pair" : "pairs"} after the transient. Points can coincide when the motion repeats.`
      : "Fewer than two late peaks in this trajectory.";
  }
  const target = surface(controls.sectionChart);
  if (target) state.sectionGeometry = drawSectionChart(...target, {
    preset: state.preset, mode: controls.sectionMode.value, section: state.section,
    crossings: state.crossings, peaks, selectedIndex: state.selectedHit, hoverIndex: state.hoveredHit
  });
  const count = state.sectionGeometry?.count ?? 0;
  const hit = state.sectionGeometry?.pointAt(state.hoveredHit ?? state.selectedHit);
  controls.previousHit.disabled = !count || state.selectedHit === 0;
  controls.nextHit.disabled = !count || state.selectedHit === count - 1;
  controls.clearHit.disabled = state.selectedHit === null;
  controls.sectionSelection.textContent = hit
    ? inSectionMode
      ? `Crossing ${hit.index + 1}/${count} at t = ${formatted(hit.time)}. (x, y, z) = (${hit.point.map(formatted).join(", ")}).`
      : `Pair ${hit.index + 1}/${count} at t = ${formatted(hit.time)}, ${formatted(hit.nextTime)}. Peaks: ${formatted(hit.u)}, ${formatted(hit.v)}.`
    : count ? "Select a point to locate it on the trajectory." : "No points to inspect.";
}

function currentTime() {
  const samples = state.run?.samples;
  if (!samples?.length) return 0;
  const index = Math.floor(state.headIndex);
  const start = samples[index].t;
  return start + (state.headIndex - index) * ((samples[index + 1]?.t ?? start) - start);
}

function paintSeparation() {
  if (!state.comparison) return;
  const target = surface(controls.separationChart);
  if (!target) return;
  drawSeparationChart(...target, { series: state.comparison.separation, headTime: currentTime() });
}

function syncTimeline() {
  const time = currentTime();
  controls.timeline.value = String(time);
  const text = time.toFixed(2);
  if (controls.timeReadout.textContent !== text) controls.timeReadout.textContent = text;
  controls.timeline.setAttribute("aria-valuetext", `t equals ${text}`);
}

function eigenvalueText({ re, im }) {
  if (Math.abs(im) < 1e-8) return formatted(re);
  const sign = im < 0 ? "\u2212" : "+";
  return `${formatted(re)} ${sign} ${formatted(Math.abs(im))}i`;
}

function paintStability() {
  const mode = controls.stabilityMode.value;
  const selected = state.equilibria.find(eq => eq.id === state.selectedEquilibrium);
  controls.stabilityChart.setAttribute("aria-label", mode === "coefficients"
    ? "Cubic coefficient paths in the a2, a3 plane" : "Jacobian eigenvalues in the complex plane");
  if (selected) {
    const detail = mode === "coefficients"
      ? `a\u2081 = ${formatted(selected.coefficients[0])}, a\u2082 = ${formatted(selected.coefficients[1])}, a\u2083 = ${formatted(selected.coefficients[2])}. Shading marks the sink region.`
      : `Eigenvalues: ${selected.eigenvalues.map(eigenvalueText).join(", ")}.`;
    const descriptor = {
      stable: "sink", saddle: "saddle", unstable: "unstable",
      critical: "nonhyperbolic", nonhyperbolic: "nonhyperbolic"
    }[selected.stability] || selected.stability;
    controls.stabilitySummary.textContent = `${selected.label} is ${descriptor === "nonhyperbolic" || descriptor === "unstable" ? descriptor : `a ${descriptor}`}. ${detail}`;
  }
  const target = surface(controls.stabilityChart);
  if (target) drawStabilityChart(...target, {
    preset: state.preset, mode, equilibria: state.equilibria,
    branches: state.branches, selectedEquilibrium: state.selectedEquilibrium
  });
}

function paintAll() {
  paintParameter();
  paintSection();
  paintPortrait();
  paintStability();
  paintSeparation();
}

function updateEquilibriumList() {
  if (!state.equilibria.some(eq => eq.id === state.selectedEquilibrium)) {
    state.selectedEquilibrium = state.equilibria[0]?.id ?? null;
  }
  const options = state.equilibria.map(eq => {
    const label = eq.point.map(formatted).join(", ");
    return new Option(`${eq.label} (${label})`, eq.id);
  });
  controls.equilibrium.replaceChildren(...options);
  controls.equilibrium.value = state.selectedEquilibrium;
}

function updateCrossings() {
  if (!state.run) return;
  state.crossings = sectionCrossings(state.run.samples, {
    ...state.section, after: state.run.transient
  });
}

function updateSection() {
  state.section = {
    angle: Number(controls.sectionAngle.value) * Math.PI / 180,
    offset: Number(controls.sectionOffset.value),
    direction: Number(controls.direction.value)
  };
  updateCrossings();
  if (controls.sectionMode.value === "section") clearPointSelection();
  paintSection();
  paintPortrait();
}

function syncPlayback() {
  controls.playback.textContent = state.playing ? "Pause" : "Play";
  controls.playback.setAttribute("aria-label", state.playing ? "Pause trajectory playback" : "Play trajectory");
  controls.playback.disabled = !state.trajectory?.points?.length;
  controls.restart.disabled = controls.playback.disabled;
  controls.timeline.disabled = controls.playback.disabled;
  controls.stepTime.disabled = controls.playback.disabled;
}

function animate(time) {
  state.animation = null;
  if (!state.playing || !state.trajectory?.points?.length) return;
  if (state.lastFrame === null) state.lastFrame = time;
  const elapsed = Math.min(50, time - state.lastFrame);
  const count = state.trajectory.points.length;
  state.headIndex += elapsed * (count - 1) * Number(controls.playbackSpeed.value) / 24000;
  state.lastFrame = time;
  if (state.headIndex >= count - 1) {
    state.headIndex = count - 1;
    state.playing = false;
    syncPlayback();
  }
  paintPortrait();
  syncTimeline();
  paintSeparation();
  if (state.playing) state.animation = requestAnimationFrame(animate);
}

function startAnimation() {
  state.lastFrame = null;
  if (state.playing && state.animation === null) state.animation = requestAnimationFrame(animate);
}

function clearPointSelection() {
  state.selectedHit = null;
  state.hoveredHit = null;
}

function seekTime(time) {
  const samples = state.run?.samples;
  if (!samples?.length) return;
  pauseSweep();
  state.playing = false;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].t <= time) low = middle;
    else high = middle;
  }
  const span = samples[high].t - samples[low].t;
  state.headIndex = low + (span ? clamp((time - samples[low].t) / span, 0, 1) : 0);
  syncPlayback();
  syncTimeline();
  paintPortrait();
  paintSeparation();
}

function runTrajectory() {
  state.equilibria = equilibriaAt(state.preset.id, state.parameter);
  updateEquilibriumList();
  if (state.animation !== null) {
    cancelAnimationFrame(state.animation);
    state.animation = null;
  }
  clearPointSelection();
  state.sectionGeometry = null;
  state.comparison = null;
  state.comparisonTrail = null;
  try {
    const options = { initial: state.initial };
    if (controls.compare.checked) {
      state.comparison = compareTrajectories(state.preset.id, state.parameter, {
        ...options, component: controls.perturbationAxis.value, perturbation: controls.perturbationSize.valueAsNumber
      });
      state.run = state.comparison.primary;
      state.comparisonTrail = { points: state.comparison.comparison.samples.map(({ x, y, z }) => [x, y, z]) };
    } else {
      state.run = integrateTrajectory(state.preset.id, state.parameter, options);
    }
    state.trajectory = { points: state.run.samples.map(({ x, y, z }) => [x, y, z]) };
    const endTime = state.run.samples.at(-1).t;
    const timing = `r = ${formatted(state.parameter)} \u00b7 t = 0 to ${formatted(endTime)}`;
    controls.trajectorySummary.textContent = state.run.termination === "completed"
      ? `${timing} \u00b7 discard t < ${formatted(state.run.transient)} for crossings and peaks`
      : `${timing} \u00b7 integration stopped early`;
  } catch (error) {
    state.run = null;
    state.trajectory = { points: [] };
    controls.trajectorySummary.textContent = "Integration failed. Try a smaller initial condition.";
    announce(controls.trajectorySummary.textContent);
    console.error(error);
  }
  controls.separationPanel.hidden = !state.comparison;
  controls.comparisonKey.hidden = !state.comparisonTrail;
  if (state.comparison) {
    const { initialDistance, maximumDistance, firstThresholdTime, finalDistance } = state.comparison;
    const threshold = firstThresholdTime === null ? "Distance stays below 1 at the sampled times." : `First sampled distance of at least 1 at t = ${formatted(firstThresholdTime)}.`;
    const zero = finalDistance === 0 ? " The last samples coincide at numerical precision." : "";
    const partial = state.comparison.comparison.termination !== "completed" || state.run.termination !== "completed"
      ? " The plot ends at the last common sample." : "";
    controls.separationSummary.textContent = `Starts at ${formatted(initialDistance)} and reaches ${formatted(maximumDistance)}. ${threshold}${zero}${partial}`;
  }
  controls.timeline.max = String(state.run?.samples.at(-1).t ?? 1);
  state.crossings = [];
  updateCrossings();
  state.headIndex = state.playing ? 0 : Math.max(0, state.trajectory.points.length - 1);
  syncPlayback();
  syncTimeline();
  paintAll();
  startAnimation();
}

function setParameter(value, { fromSweep = false } = {}) {
  if (!Number.isFinite(value)) return;
  if (!fromSweep) pauseSweep();
  state.parameter = clamp(value, ...state.preset.parameterRange);
  controls.parameterInput.value = String(state.parameter);
  controls.parameter.value = String(state.parameter);
  for (const button of controls.quickParameters.children) {
    button.dataset.current = String(Math.abs(Number(button.value) - state.parameter) < 1e-8);
  }
  runTrajectory();
}

function cancelScheduledParameter() {
  if (parameterFrame !== null) cancelAnimationFrame(parameterFrame);
  parameterFrame = null;
  pendingParameter = null;
}

function scheduleParameter(value) {
  if (!Number.isFinite(value)) return;
  pauseSweep();
  controls.parameterInput.value = String(value);
  pendingParameter = value;
  if (parameterFrame !== null) return;
  parameterFrame = requestAnimationFrame(() => {
    const next = pendingParameter;
    cancelScheduledParameter();
    setParameter(next);
  });
}

function pauseSweep() {
  if (state.sweepTimer === null) return;
  clearTimeout(state.sweepTimer);
  state.sweepTimer = null;
  controls.sweep.textContent = "Play parameter sweep";
  controls.sweep.setAttribute("aria-pressed", "false");
}

function startSweep() {
  state.playing = false;
  syncPlayback();
  const [min, max] = state.preset.parameterRange;
  const interval = 100;
  let direction = state.parameter >= max ? -1 : 1;
  controls.sweep.textContent = "Pause parameter sweep";
  controls.sweep.setAttribute("aria-pressed", "true");
  function next() {
    const speed = Number(controls.sweepSpeed.value);
    const parameter = clamp(state.parameter + direction * speed * (max - min) / 220, min, max);
    if (parameter === min || parameter === max) direction *= -1;
    setParameter(parameter, { fromSweep: true });
    state.sweepTimer = setTimeout(next, interval);
  }
  state.sweepTimer = setTimeout(next, interval);
}

function setInitial(values) {
  state.initial = [...values];
  controls.initial.forEach((input, index) => { input.value = String(values[index]); });
}

function finishPeakRequest(request, failed = false) {
  request.worker?.terminate();
  if (peakRequest !== request) return;
  peakCache.set(request.presetId, { columns: request.columns, failed });
  peakRequest = null;
  paintParameter();
}

function ensurePeakSweep() {
  if (controls.parameterMode.value !== "peaks") return;
  const { id, parameterRange: [min, max] } = state.preset;
  if (peakCache.has(id) || peakRequest?.presetId === id) return;
  const request = { presetId: id, count: id === "lorenz" ? 145 : 121, columns: [], worker: null };
  if (id === "hopf") {
    request.columns = Array.from({ length: request.count }, (_, index) =>
      samplePeakColumn(id, min + (max - min) * index / (request.count - 1))
    );
    peakCache.set(id, { columns: request.columns, failed: false });
    return;
  }
  peakRequest = request;
  try {
    const worker = new Worker(new URL("./peak-worker.js?v=20261114-4", import.meta.url), { type: "module" });
    request.worker = worker;
    worker.onmessage = ({ data }) => {
      if (peakRequest !== request) return;
      if (data.columns) request.columns.push(...data.columns);
      if (data.done || data.error) finishPeakRequest(request, Boolean(data.error));
      else paintParameter();
    };
    worker.onerror = () => finishPeakRequest(request, true);
    worker.onmessageerror = () => finishPeakRequest(request, true);
    worker.postMessage({ id, count: request.count });
  } catch {
    finishPeakRequest(request, true);
  }
}

function loadPreset(id) {
  cancelScheduledParameter();
  pauseSweep();
  setLaunchMode(false);
  state.preset = PRESETS[id];
  state.camera = { ...defaultCamera };
  state.selectedEquilibrium = null;
  if (!branchCache.has(id)) branchCache.set(id, sampleEquilibria(id));
  state.branches = branchCache.get(id);
  const [min, max] = state.preset.parameterRange;
  controls.parameterMin.textContent = String(min);
  controls.parameterMax.textContent = String(max);
  for (const input of [controls.parameter, controls.parameterInput]) {
    input.min = min;
    input.max = max;
  }
  for (const [index, input] of controls.initial.entries()) {
    const [minimum, maximum] = state.preset.bounds[index];
    input.min = minimum;
    input.max = maximum;
  }
  [controls.launchHeight.min, controls.launchHeight.max] = state.preset.bounds[2];
  controls.launchHeight.value = String(state.preset.id === "lorenz" ? state.preset.initial[2] : 0);
  const offsetLimit = id === "lorenz" ? 20 : 2;
  controls.sectionOffset.min = -offsetLimit;
  controls.sectionOffset.max = offsetLimit;
  controls.sectionOffset.step = id === "lorenz" ? 0.1 : 0.02;
  const { sectionAngle, sectionOffset } = state.preset.defaults;
  controls.sectionAngle.value = String(sectionAngle * 180 / Math.PI);
  controls.sectionOffset.value = String(sectionOffset);
  controls.direction.value = "1";
  state.section = { angle: sectionAngle, offset: sectionOffset, direction: 1 };
  controls.stabilityMode.querySelector('option[value="coefficients"]').disabled = id !== "lorenz";
  if (id !== "lorenz") controls.stabilityMode.value = "eigenvalues";
  controls.equations.innerHTML = equations[id].map(line => `<span>${line}</span>`).join("");
  controls.quickParameters.replaceChildren(...examples[id].map(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.value = String(value);
    button.textContent = label;
    button.addEventListener("click", () => {
      cancelScheduledParameter();
      setParameter(value);
      announce(`Parameter r set to ${formatted(value)}.`);
    });
    return button;
  }));
  setInitial(state.preset.initial);
  setParameter(state.preset.defaultParameter);
  ensurePeakSweep();
}

function useCamera(action) {
  const rotation = Math.PI / 12;
  const { camera } = state;
  switch (action) {
    case "left": camera.azimuth -= rotation; break;
    case "right": camera.azimuth += rotation; break;
    case "up": camera.elevation += rotation; break;
    case "down": camera.elevation -= rotation; break;
    case "in": camera.zoom *= 1.18; break;
    case "out": camera.zoom /= 1.18; break;
    case "reset": state.camera = { ...defaultCamera }; break;
  }
  state.camera.elevation = clamp(state.camera.elevation, -1.45, 1.45);
  state.camera.zoom = clamp(state.camera.zoom, 0.55, 3.5);
  paintPortrait();
}

function canvasPoint(canvas, event) {
  const { left, top } = canvas.getBoundingClientRect();
  return [event.clientX - left, event.clientY - top];
}

function selectEquilibrium(id) {
  state.selectedEquilibrium = id;
  controls.equilibrium.value = id;
  paintPortrait();
  paintParameter();
  paintStability();
}

function setLaunchMode(active) {
  state.placing = active;
  controls.launchMode.setAttribute("aria-pressed", String(active));
  controls.portrait.toggleAttribute("data-launch", active);
  controls.portraitHelp.textContent = active
    ? "Click in the portrait to start on the chosen z-plane. Escape cancels. You can also enter coordinates under Initial condition."
    : "Drag to rotate or click an equilibrium to inspect it. Use arrow keys to rotate, + and minus to zoom, and 0 to reset.";
  paintPortrait();
}

function inspectHit(index, seek = false) {
  const hit = state.sectionGeometry?.pointAt(index);
  state.selectedHit = hit?.index ?? null;
  state.hoveredHit = null;
  paintSection();
  if (hit && seek) seekTime(hit.time);
  else paintPortrait();
}

function stepHit(direction) {
  const count = state.sectionGeometry?.count ?? 0;
  if (!count) return;
  const from = state.selectedHit ?? (direction > 0 ? -1 : count);
  inspectHit(clamp(from + direction, 0, count - 1), true);
}

controls.system.addEventListener("change", () => {
  loadPreset(controls.system.value);
  announce(`${state.preset.name} loaded.`);
});
controls.parameter.addEventListener("input", () => scheduleParameter(controls.parameter.valueAsNumber));
controls.parameterInput.addEventListener("change", () => {
  cancelScheduledParameter();
  if (Number.isFinite(controls.parameterInput.valueAsNumber)) setParameter(controls.parameterInput.valueAsNumber);
  else controls.parameterInput.value = String(state.parameter);
});
controls.parameterInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  controls.parameterInput.blur();
});
controls.form.addEventListener("submit", event => {
  event.preventDefault();
  pauseSweep();
  setInitial(controls.initial.map(input => input.valueAsNumber));
  state.playing = !motion.matches;
  runTrajectory();
  if (state.run?.termination === "completed") announce("New trajectory computed from the specified initial condition.");
});
controls.resetInitial.addEventListener("click", () => {
  pauseSweep();
  setInitial(state.preset.initial);
  runTrajectory();
});
controls.playback.addEventListener("click", () => {
  pauseSweep();
  clearPointSelection();
  paintSection();
  state.playing = !state.playing;
  if (state.playing && state.headIndex >= state.trajectory.points.length - 1) state.headIndex = 0;
  syncPlayback();
  startAnimation();
});
controls.restart.addEventListener("click", () => {
  pauseSweep();
  clearPointSelection();
  paintSection();
  state.headIndex = 0;
  state.playing = !motion.matches;
  syncPlayback();
  syncTimeline();
  paintPortrait();
  paintSeparation();
  startAnimation();
});
motion.addEventListener("change", event => {
  if (event.matches) {
    pauseSweep();
    state.playing = false;
    syncPlayback();
  }
});
controls.timeline.addEventListener("input", () => {
  clearPointSelection();
  paintSection();
  seekTime(controls.timeline.valueAsNumber);
});
controls.stepTime.addEventListener("click", () => {
  clearPointSelection();
  paintSection();
  seekTime(currentTime() + 1);
});
controls.sweep.addEventListener("click", () => {
  if (state.sweepTimer === null) startSweep();
  else pauseSweep();
});
controls.compare.addEventListener("change", () => {
  controls.perturbationControls.hidden = !controls.compare.checked;
  runTrajectory();
});
controls.perturbationAxis.addEventListener("change", runTrajectory);
controls.perturbationSize.addEventListener("change", () => {
  const value = controls.perturbationSize.valueAsNumber;
  controls.perturbationSize.value = String(Number.isFinite(value) ? clamp(value, 1e-12, 0.1) : 1e-6);
  runTrajectory();
});
controls.launchMode.addEventListener("click", () => setLaunchMode(!state.placing));
controls.launchHeight.addEventListener("input", paintPortrait);
controls.parameterMode.addEventListener("change", () => {
  ensurePeakSweep();
  paintParameter();
});
controls.sectionMode.addEventListener("change", () => inspectHit(null));
controls.showPlane.addEventListener("change", paintPortrait);
controls.sectionAngle.addEventListener("input", updateSection);
controls.sectionOffset.addEventListener("input", updateSection);
controls.direction.addEventListener("change", updateSection);
controls.stabilityMode.addEventListener("change", paintStability);
controls.equilibrium.addEventListener("change", () => selectEquilibrium(controls.equilibrium.value));
controls.previousHit.addEventListener("click", () => stepHit(-1));
controls.nextHit.addEventListener("click", () => stepHit(1));
controls.clearHit.addEventListener("click", () => inspectHit(null));
controls.sectionChart.addEventListener("pointermove", event => {
  const hit = state.sectionGeometry?.hitAt(...canvasPoint(controls.sectionChart, event));
  const index = hit?.index ?? null;
  if (index === state.hoveredHit) return;
  state.hoveredHit = index;
  paintSection();
  paintPortrait();
});
controls.sectionChart.addEventListener("pointerleave", () => {
  if (state.hoveredHit === null) return;
  state.hoveredHit = null;
  paintSection();
  paintPortrait();
});
controls.sectionChart.addEventListener("click", event => {
  const hit = state.sectionGeometry?.hitAt(...canvasPoint(controls.sectionChart, event));
  if (hit) inspectHit(hit.index, true);
});
controls.sectionChart.addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Escape"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Escape") inspectHit(null);
  else stepHit(event.key === "ArrowRight" ? 1 : -1);
});

controls.parameterChart.addEventListener("pointerdown", event => {
  if (event.button !== 0 || state.parameterPointer !== null) return;
  const value = state.parameterGeometry?.parameterAt(...canvasPoint(controls.parameterChart, event));
  if (!Number.isFinite(value)) return;
  state.parameterPointer = event.pointerId;
  controls.parameterChart.setPointerCapture(event.pointerId);
  scheduleParameter(value);
});
controls.parameterChart.addEventListener("pointermove", event => {
  if (state.parameterPointer !== event.pointerId) return;
  const value = state.parameterGeometry?.parameterAt(...canvasPoint(controls.parameterChart, event), { clamp: true });
  scheduleParameter(value);
});
controls.parameterChart.addEventListener("lostpointercapture", event => {
  if (state.parameterPointer === event.pointerId) state.parameterPointer = null;
});
controls.parameterChart.addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const [min, max] = state.preset.parameterRange;
  const step = (max - min) * (event.shiftKey ? 0.05 : 0.01);
  const delta = event.key === "ArrowRight" ? step : -step;
  setParameter(event.key === "Home" ? min : event.key === "End" ? max : state.parameter + delta);
});

for (const button of document.querySelectorAll("[data-camera]")) {
  button.addEventListener("click", () => useCamera(button.dataset.camera));
}
controls.portrait.addEventListener("keydown", event => {
  const actions = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    "+": "in", "=": "in", "-": "out", "0": "reset"
  };
  if (!actions[event.key]) return;
  event.preventDefault();
  useCamera(actions[event.key]);
});
controls.portrait.addEventListener("pointerdown", event => {
  if (event.button !== 0 || state.drag) return;
  controls.portrait.setPointerCapture(event.pointerId);
  state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, ...state.camera };
});
controls.portrait.addEventListener("pointermove", event => {
  const drag = state.drag;
  if (drag?.id !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
  drag.moved = true;
  controls.portrait.dataset.dragging = "";
  state.camera.azimuth = drag.azimuth + (event.clientX - drag.x) * 0.011;
  state.camera.elevation = clamp(drag.elevation - (event.clientY - drag.y) * 0.011, -1.45, 1.45);
  paintPortrait();
});
controls.portrait.addEventListener("pointerup", event => {
  const drag = state.drag;
  if (drag?.id !== event.pointerId || drag.moved) return;
  const coords = canvasPoint(controls.portrait, event);
  if (state.placing) {
    const height = controls.launchHeight.valueAsNumber;
    const point = Number.isFinite(height) ? state.portraitGeometry?.pointAt(...coords, height) : null;
    if (!point) {
      controls.portraitHelp.textContent = "That click misses the launch plane. Rotate the portrait or choose a different z value.";
      announce(controls.portraitHelp.textContent);
      return;
    }
    pauseSweep();
    setLaunchMode(false);
    setInitial(point);
    state.playing = !motion.matches;
    runTrajectory();
    announce(`Trajectory launched at (${point.map(formatted).join(", ")}).`);
  } else {
    const eq = state.portraitGeometry?.equilibriumAt(...coords);
    if (eq) selectEquilibrium(eq.id);
  }
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
  controls.portrait.addEventListener(event, ({ pointerId }) => {
    if (state.drag?.id !== pointerId) return;
    state.drag = null;
    delete controls.portrait.dataset.dragging;
  });
}

function syncFullscreen() {
  const active = document.fullscreenElement === controls.workspace || controls.workspace.classList.contains("space-expanded");
  controls.fullscreen.textContent = active ? "Exit full screen" : "Full screen";
  controls.fullscreen.setAttribute("aria-pressed", String(active));
}

function setExpanded(active) {
  controls.workspace.classList.toggle("space-expanded", active);
  document.body.classList.toggle("space-expanded-open", active);
  syncFullscreen();
}

controls.fullscreen.addEventListener("click", async () => {
  if (document.fullscreenElement === controls.workspace) {
    await document.exitFullscreen();
  } else if (controls.workspace.classList.contains("space-expanded")) {
    setExpanded(false);
  } else if (document.fullscreenEnabled && controls.workspace.requestFullscreen) {
    try {
      await controls.workspace.requestFullscreen();
    } catch {
      setExpanded(true);
    }
  } else {
    setExpanded(true);
  }
});
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && state.placing) setLaunchMode(false);
  if (event.key === "Escape" && controls.workspace.classList.contains("space-expanded")) setExpanded(false);
});

const resizeObserver = new ResizeObserver(() => {
  if (resizeFrame !== null) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    paintAll();
  });
});
for (const canvas of [controls.portrait, controls.parameterChart, controls.sectionChart, controls.stabilityChart, controls.separationChart]) {
  resizeObserver.observe(canvas);
}
loadPreset(controls.system.value);
