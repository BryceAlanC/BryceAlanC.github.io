const COLORS = {
  paper: "#f5f1e7",
  ink: "#17211d",
  muted: "#53615c",
  axis: "#77817a",
  grid: "rgba(67,90,80,0.15)",
  stable: "#176d58",
  saddle: "#6b50a3",
  unstable: "#a8513a",
  critical: "#755600",
  orbit: "#4f55a1",
  current: "#8a6200",
  dark: "#09211d",
  darkInk: "#edf5ed",
  darkMuted: "#a9c1b6",
  darkGrid: "rgba(221,240,231,0.16)",
  darkAxis: "#75988a",
  darkOrbit: "#83d5be",
  darkCurrent: "#f2c969"
};

function numberLabel(value) {
  return String(Number(value.toPrecision(4))).replace(/^-/, "\u2212");
}

function rangeOf(values, fallback = [-1, 1], minimumSpan = 0.2) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return fallback;
  const start = Math.min(...finite);
  const end = Math.max(...finite);
  const pad = Math.max((end - start) * 0.09, (minimumSpan - (end - start)) / 2);
  return [start - pad, end + pad];
}

function ticks([min, max], count) {
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find(factor => factor >= raw / power) * power;
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step + 1e-10);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => (first + index) * step);
}

function plot(context, width, height, xRange, yRange, xLabel, yLabel, dark = false) {
  const paper = dark ? COLORS.dark : COLORS.paper;
  const ink = dark ? COLORS.darkInk : COLORS.ink;
  const muted = dark ? COLORS.darkMuted : COLORS.muted;
  const axis = dark ? COLORS.darkAxis : COLORS.axis;
  const grid = dark ? COLORS.darkGrid : COLORS.grid;
  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  if (width < 120 || height < 105) return null;

  const left = width < 250 ? 47 : 53;
  const right = width - 16;
  const top = 28;
  const bottom = height - 41;
  const x = value => left + (right - left) * (value - xRange[0]) / (xRange[1] - xRange[0]);
  const y = value => bottom - (bottom - top) * (value - yRange[0]) / (yRange[1] - yRange[0]);

  function stroke(points, color, weight = 1, dash = []) {
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(...points[0]);
    for (const point of points.slice(1)) context.lineTo(...point);
    context.lineWidth = weight;
    context.strokeStyle = color;
    context.setLineDash(dash);
    context.stroke();
    context.setLineDash([]);
  }

  function label(text, xPos, yPos, options = {}) {
    const { color = ink, align = "left", size = 11, middle = false, outline = false } = options;
    context.font = `${size}px 'IBM Plex Mono', monospace`;
    context.textAlign = align;
    context.textBaseline = middle ? "middle" : "top";
    context.fillStyle = color;
    if (outline) {
      context.lineWidth = 3;
      context.strokeStyle = paper;
      context.strokeText(text, xPos, yPos, right - left + 4);
    }
    context.fillText(text, xPos, yPos, right - left + 4);
  }

  for (const value of ticks(xRange, width < 300 ? 4 : 6)) {
    const px = x(value);
    stroke([[px, top], [px, bottom]], grid);
    label(numberLabel(value), px, bottom + 6, { color: muted, align: "center", size: 10 });
  }
  for (const value of ticks(yRange, height < 230 ? 3 : 5)) {
    const py = y(value);
    stroke([[left, py], [right, py]], grid);
    label(numberLabel(value), left - 6, py, { color: muted, align: "right", size: 10, middle: true });
  }
  label(yLabel, left, 8);
  label(xLabel, (left + right) / 2, bottom + 24, { align: "center" });

  context.save();
  context.beginPath();
  context.rect(left, top, right - left, bottom - top);
  context.clip();

  function line(points, color, weight = 1, dash = []) {
    stroke(points.map(([u, v]) => [x(u), y(v)]), color, weight, dash);
  }

  function point(u, v, color, radius, { hollow = false, square = false } = {}) {
    if (!Number.isFinite(u) || !Number.isFinite(v)) return;
    context.beginPath();
    if (square) context.rect(x(u) - radius, y(v) - radius, 2 * radius, 2 * radius);
    else context.arc(x(u), y(v), radius, 0, 2 * Math.PI);
    context.fillStyle = hollow ? paper : color;
    context.fill();
    if (radius > 2.8 || hollow) {
      context.lineWidth = hollow ? 1.5 : 1;
      context.strokeStyle = hollow ? color : paper;
      context.stroke();
    }
  }

  function fill(points, color) {
    context.beginPath();
    context.moveTo(x(points[0][0]), y(points[0][1]));
    for (const [u, v] of points.slice(1)) context.lineTo(x(u), y(v));
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  function finish() {
    context.restore();
    context.strokeStyle = axis;
    context.lineWidth = 0.85;
    context.strokeRect(left, top, right - left, bottom - top);
  }

  function zeroAxes() {
    if (xRange[0] < 0 && xRange[1] > 0) line([[0, yRange[0]], [0, yRange[1]]], axis, 1);
    if (yRange[0] < 0 && yRange[1] > 0) line([[xRange[0], 0], [xRange[1], 0]], axis, 1);
  }

  function empty(message) {
    label(message, (left + right) / 2, (top + bottom) / 2, { color: muted, middle: true, align: "center" });
  }

  return { left, right, top, bottom, x, y, line, point, label, fill, finish, zeroAxes, empty };
}

function branchStyle(stability) {
  if (stability === "stable") return [COLORS.stable, []];
  if (stability === "saddle") return [COLORS.saddle, [5, 4]];
  if (stability === "unstable") return [COLORS.unstable, [5, 4]];
  return [COLORS.critical, [2, 3]];
}

function drawEquilibriumTrack(view, points, coordinates, selected) {
  if (!points.length) return;
  let start = 0;
  for (let index = 1; index < points.length; index += 1) {
    const last = index === points.length - 1;
    if (!last && points[index].stability === points[start].stability) continue;
    const [color, dash] = branchStyle(points[start].stability);
    view.line(points.slice(start, index + 1).map(coordinates), color, selected ? 2.4 : 1.6, dash);
    start = index;
  }
  for (const item of points) {
    if (item.stability === "critical") view.point(...coordinates(item), COLORS.critical, 3.1, { hollow: true, square: true });
  }
}

function currentMarkers(view, equilibria, coordinates, selectedEquilibrium) {
  const others = equilibria.filter(item => item.id !== selectedEquilibrium);
  const selected = equilibria.find(item => item.id === selectedEquilibrium);
  for (const item of others) {
    const [color] = branchStyle(item.stability);
    view.point(...coordinates(item), color, 3.7, { hollow: item.stability !== "stable" });
  }
  if (selected) view.point(...coordinates(selected), COLORS.current, 5.2);
}

export function drawParameterChart(context, width, height, {
  preset, mode = "equilibria", parameter, branches = [], equilibria = [], peakSweep = [], peaks = [],
  selectedEquilibrium, currentPeakColumn
}) {
  const isPeakView = mode === "peaks";
  const coordinate = preset.peakCoordinate;
  const actualPeaks = peaks.map(peak => peak[coordinate]);
  const current = actualPeaks.length ? actualPeaks : currentPeakColumn?.values ?? [];
  const values = isPeakView
    ? [...peakSweep.flatMap(column => column.values), ...current]
    : branches.flatMap(branch => branch.points.map(item => item.point[0]));
  const xRange = preset.parameterRange;
  const fallback = preset.bounds[coordinate === "z" ? 2 : 0];
  const yRange = values.length ? rangeOf([...values, 0], fallback, 1) : fallback;
  const xLabel = preset.parameterLabel || "r";
  const view = plot(context, width, height, xRange, yRange, xLabel, isPeakView ? preset.peakLabel : "Equilibrium x");
  if (!view) return;

  for (const { parameter: critical } of preset.events) {
    if (critical >= xRange[0] && critical <= xRange[1]) {
      view.line([[critical, yRange[0]], [critical, yRange[1]]], "rgba(67,90,80,0.35)", 1, [2, 4]);
    }
  }
  if (isPeakView) {
    for (const { parameter: value, values: samples, kind } of peakSweep) {
      const steady = kind === "steady";
      for (const sample of samples) {
        view.point(value, sample, steady ? COLORS.stable : "rgba(79,85,161,0.68)", steady ? 1.7 : 1.45, { square: steady });
      }
    }
    if (!peakSweep.length && !current.length) view.empty("Sampling parameter values\u2026");
  } else {
    for (const branch of branches) {
      drawEquilibriumTrack(view, branch.points, item => [item.parameter, item.point[0]], branch.id === selectedEquilibrium);
    }
  }
  view.line([[parameter, yRange[0]], [parameter, yRange[1]]], COLORS.current, 1.45);
  if (isPeakView) {
    const steady = !actualPeaks.length && currentPeakColumn?.kind === "steady";
    for (const value of current) view.point(parameter, value, COLORS.current, 3.6, { square: steady });
  } else {
    currentMarkers(view, equilibria, item => [parameter, item.point[0]], selectedEquilibrium);
  }
  const labelLeft = view.x(parameter) > view.right - 76;
  view.label(`${xLabel} = ${numberLabel(parameter)}`, view.x(parameter) + (labelLeft ? -5 : 5), view.top + 4, {
    align: labelLeft ? "right" : "left", color: COLORS.current, outline: true
  });
  view.finish();
}

export function drawSectionChart(context, width, height, { preset, mode = "section", section, crossings = [], peaks = [] }) {
  if (mode === "return") {
    const series = peaks.map(peak => peak[preset.peakCoordinate]);
    const r = rangeOf(series, preset.bounds[preset.peakCoordinate === "z" ? 2 : 0]);
    const coordinate = preset.peakCoordinate;
    const view = plot(context, width, height, r, r, `${coordinate}_n`, `${coordinate}_(n+1)`);
    if (!view) return;
    view.line([[r[0], r[0]], [r[1], r[1]]], COLORS.axis, 1, [3, 4]);
    for (let index = 1; index < series.length; index += 1) {
      const last = index === series.length - 1;
      view.point(series[index - 1], series[index], last ? COLORS.current : COLORS.orbit, last ? 4.2 : 2.1);
    }
    if (series.length < 2) view.empty("Fewer than two peaks after the transient");
    view.finish();
    return;
  }

  const { angle } = section;
  const [first, second, third] = preset.bounds;
  const bounds = first.flatMap(x => second.map(y => -x * Math.sin(angle) + y * Math.cos(angle)));
  const xFallback = rangeOf(bounds);
  const yFallback = rangeOf(third);
  const xRange = preset.id === "hopf" ? xFallback
    : rangeOf(crossings.map(({ u }) => u), xFallback, (xFallback[1] - xFallback[0]) * 0.16);
  const yRange = preset.id === "hopf" ? yFallback
    : rangeOf(crossings.map(({ v }) => v), yFallback, (yFallback[1] - yFallback[0]) * 0.16);
  const view = plot(context, width, height, xRange, yRange, "u (along plane)", "z");
  if (!view) return;
  view.zeroAxes();
  for (const { u, v } of crossings.slice(0, -1)) view.point(u, v, COLORS.orbit, 2.3);
  const latest = crossings.at(-1);
  if (latest) view.point(latest.u, latest.v, COLORS.current, 4.5);
  else view.empty("No crossings in the chosen direction");
  view.finish();
}

const PERMUTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const trailCache = new WeakMap();

function eigenvalueTrails(branch) {
  if (trailCache.has(branch)) return trailCache.get(branch);
  const trails = [[], [], []];
  for (const { eigenvalues } of branch.points) {
    const choices = trails[0].length ? PERMUTATIONS : [PERMUTATIONS[0]];
    let best;
    let error = Infinity;
    for (const candidate of choices) {
      const cost = trails.reduce((sum, trail, i) => {
        const previous = trail.at(-1);
        const next = eigenvalues[candidate[i]];
        return sum + (previous ? (previous[0] - next.re) ** 2 + (previous[1] - next.im) ** 2 : 0);
      }, 0);
      if (cost < error) {
        best = candidate;
        error = cost;
      }
    }
    for (let i = 0; i < trails.length; i += 1) {
      const { re, im } = eigenvalues[best[i]];
      trails[i].push([re, im]);
    }
  }
  trailCache.set(branch, trails);
  return trails;
}

function drawComplexChart(context, width, height, branches, equilibria, selectedEquilibrium) {
  const tracks = branches.map(branch => ({ id: branch.id, trails: eigenvalueTrails(branch) }));
  const values = [...tracks.flatMap(item => item.trails.flat()), ...equilibria.flatMap(item =>
    item.eigenvalues.map(({ re, im }) => [re, im]))];
  const xRange = rangeOf([0, ...values.map(point => point[0])], [-1, 1], 2.5);
  const maxIm = Math.max(1.1, ...values.map(point => Math.abs(point[1]))) * 1.14;
  const view = plot(context, width, height, xRange, [-maxIm, maxIm], "Re \u03bb", "Im \u03bb", true);
  if (!view) return;
  view.zeroAxes();
  for (const { id, trails } of tracks) {
    if (id === selectedEquilibrium) continue;
    for (const trail of trails) view.line(trail, "rgba(131,213,190,0.25)", 1);
  }
  const selected = tracks.find(item => item.id === selectedEquilibrium);
  for (const trail of selected?.trails ?? []) view.line(trail, "rgba(242,201,105,0.55)", 1.5);

  const current = [];
  for (const { id, eigenvalues } of equilibria) {
    for (const { re, im } of eigenvalues) {
      const tolerance = 1e-7 * Math.max(1, Math.abs(re), Math.abs(im));
      const existing = current.find(point => Math.hypot(point.re - re, point.im - im) < tolerance);
      if (existing) existing.selected ||= id === selectedEquilibrium;
      else current.push({ re, im, selected: id === selectedEquilibrium });
    }
  }
  for (const { re, im, selected: highlighted } of current) {
    view.point(re, im, highlighted ? COLORS.darkCurrent : COLORS.darkOrbit, highlighted ? 4.9 : 3.5, { hollow: !highlighted });
  }
  view.finish();
}

function drawCoefficientChart(context, width, height, branches, equilibria, selectedEquilibrium) {
  const origin = equilibria[0];
  if (!origin) return;
  const [a1] = origin.coefficients;
  const coordinates = item => item.coefficients.slice(1);
  const values = branches.flatMap(branch => branch.points.map(coordinates));
  const xRange = rangeOf([0, ...values.map(([a2]) => a2)], [-1, 1], 2.5);
  const yRange = rangeOf([0, ...values.map(([, a3]) => a3)], [-1, 1], 2.5);
  const view = plot(context, width, height, xRange, yRange, "a2", `a3   (a1 = ${numberLabel(a1)})`);
  if (!view) return;
  view.fill([[0, 0], [xRange[1], 0], [xRange[1], a1 * xRange[1]]], "rgba(23,109,88,0.17)");
  view.zeroAxes();
  view.line([[xRange[0], 0], [xRange[1], 0]], COLORS.critical, 1, [2, 4]);
  view.line([[0, 0], [xRange[1], a1 * xRange[1]]], COLORS.critical, 1.4, [5, 4]);
  for (const branch of branches) {
    drawEquilibriumTrack(view, branch.points, coordinates, branch.id === selectedEquilibrium);
  }
  currentMarkers(view, equilibria, coordinates, selectedEquilibrium);
  view.label("Sink region", view.x(xRange[1]) - 6, view.y(0) - 16, { color: COLORS.stable, align: "right", outline: true });
  view.finish();
}

export function drawStabilityChart(context, width, height, {
  mode = "eigenvalues", equilibria = [], branches = [], selectedEquilibrium
}) {
  if (mode === "coefficients") drawCoefficientChart(context, width, height, branches, equilibria, selectedEquilibrium);
  else drawComplexChart(context, width, height, branches, equilibria, selectedEquilibrium);
}
