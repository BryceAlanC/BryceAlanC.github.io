// Look for isolated periodic orbits as fixed points of transverse return maps.
// Reversing time also makes strongly repelling orbits accessible to the search.
const FAST_FRACTIONS = [0.008, 0.03, 0.075, 0.15, 0.29, 0.48, 0.69, 0.86, 0.995];
const TRIAL_FRACTIONS = [...FAST_FRACTIONS, 0.004, 0.015, 0.05, 0.105, 0.21, 0.34, 0.59, 0.79, 0.93];

// Dormand-Prince 5(4). Reuse the last derivative after each accepted step.
const RUNGE_KUTTA_ROWS = [
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
];
const EMBEDDED_WEIGHTS = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
const ERROR_WEIGHTS = EMBEDDED_WEIGHTS.map((value, index) => (RUNGE_KUTTA_ROWS.at(-1)[index] || 0) - value);

function embeddedStep(field, point, velocity, step) {
  const stages = [velocity];
  let x = point.x;
  let y = point.y;
  for (const weights of RUNGE_KUTTA_ROWS) {
    x = point.x;
    y = point.y;
    weights.forEach((weight, index) => {
      x += step * weight * stages[index][0];
      y += step * weight * stages[index][1];
    });
    const nextVelocity = field(x, y);
    if (!nextVelocity.every(Number.isFinite)) return null;
    stages.push(nextVelocity);
  }
  let errorX = 0;
  let errorY = 0;
  ERROR_WEIGHTS.forEach((weight, index) => {
    errorX += weight * stages[index][0];
    errorY += weight * stages[index][1];
  });
  return { x, y, velocity: stages.at(-1), error: Math.abs(step) * Math.hypot(errorX, errorY) };
}

function interpolateStep(start, end, startVelocity, step, fraction) {
  const square = fraction * fraction;
  const cube = square * fraction;
  const h00 = 2 * cube - 3 * square + 1;
  const h10 = cube - 2 * square + fraction;
  const h01 = -2 * cube + 3 * square;
  const h11 = cube - square;
  return {
    x: h00 * start.x + h10 * step * startVelocity[0] + h01 * end.x + h11 * step * end.velocity[0],
    y: h00 * start.y + h10 * step * startVelocity[1] + h01 * end.y + h11 * step * end.velocity[1]
  };
}

function distanceToPath(point, path) {
  let minimum = Infinity;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fraction = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    minimum = Math.min(minimum, Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy));
  }
  return minimum;
}

function sectionLimit(center, axis, window) {
  const distanceX = axis.x > 0 ? window.x[1] - center.x : center.x - window.x[0];
  const distanceY = axis.y > 0 ? window.y[1] - center.y : center.y - window.y[0];
  return Math.min(distanceX / Math.abs(axis.x), distanceY / Math.abs(axis.y));
}

function makeReturnMap(field, center, axis, direction, window, scale) {
  const crossSection = ({ x, y }) => (y - center.y) * axis.x - (x - center.x) * axis.y;
  const alongSection = ({ x, y }) => (x - center.x) * axis.x + (y - center.y) * axis.y;
  const outside = ({ x, y }) => x < window.x[0] - 0.025 * scale || x > window.x[1] + 0.025 * scale
    || y < window.y[0] - 0.025 * scale || y > window.y[1] + 0.025 * scale;

  return (radius, trace = false) => {
    let point = { x: center.x + radius * axis.x, y: center.y + radius * axis.y };
    const initial = point;
    let velocity = field(point.x, point.y);
    const normalVelocity = velocity[1] * axis.x - velocity[0] * axis.y;
    const speed = Math.hypot(...velocity);
    if (!Number.isFinite(speed) || speed === 0 || Math.abs(normalVelocity) < 1e-4 * speed) return null;

    const orientation = Math.sign(direction * normalVelocity);
    const timeScale = radius / speed;
    const timeLimit = Math.min(1e6, 140 * timeScale);
    const tolerance = trace ? 2e-11 : 2e-9;
    const path = trace ? [{ ...point, velocity, time: 0 }] : null;
    let time = 0;
    let step = 0.08 * timeScale;
    let previousSide = 0;

    for (let attempt = 0; attempt < (trace ? 4500 : 1000) && time < timeLimit; attempt += 1) {
      const localSpeed = Math.hypot(...velocity);
      const radialDistance = Math.hypot(point.x - center.x, point.y - center.y);
      step = Math.min(step, 0.24 * Math.max(radialDistance, radius * 0.02) / localSpeed);
      if (!(step > 8 * Number.EPSILON * Math.max(time, timeScale))) return null;
      const signedStep = direction * step;
      const next = embeddedStep(field, point, velocity, signedStep);
      const errorScale = tolerance * (scale * 0.02 + radialDistance);
      if (!next || next.error > errorScale) {
        step *= next ? Math.max(0.15, 0.85 * (errorScale / next.error) ** 0.2) : 0.25;
        continue;
      }
      if (outside(next)) return null;

      const side = orientation * crossSection(next);
      if (previousSide < 0 && side >= 0) {
        let low = 0;
        let high = 1;
        for (let iteration = 0; iteration < 29; iteration += 1) {
          const middle = (low + high) / 2;
          const interpolated = interpolateStep(point, next, velocity, signedStep, middle);
          if (orientation * crossSection(interpolated) >= 0) high = middle;
          else low = middle;
        }
        const fraction = (low + high) / 2;
        const crossing = interpolateStep(point, next, velocity, signedStep, fraction);
        const returnedRadius = alongSection(crossing);
        if (returnedRadius > 0) {
          const period = time + step * fraction;
          if (path) path.push({ ...crossing, velocity: field(crossing.x, crossing.y), time: period });
          return { radius: returnedRadius, error: returnedRadius - radius, period, path, initial };
        }
      }

      time += step;
      point = { x: next.x, y: next.y };
      if (path) path.push({ ...point, velocity: next.velocity, time });
      velocity = next.velocity;
      previousSide = side;
      if (radialDistance < scale * 1e-5 || localSpeed < speed * 1e-9) return null;
      step *= next.error === 0 ? 3 : Math.min(3, 0.9 * (errorScale / next.error) ** 0.2);
    }
    return null;
  };
}

function refineFixedPoint(returnMap, low, high, scale) {
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const span = high.radius - low.radius;
    const fraction = low.error / (low.error - high.error);
    const radius = low.radius + span * Math.max(0.15, Math.min(0.85, fraction));
    const result = returnMap(radius);
    if (!result) return null;
    if (Math.abs(result.error) < scale * 2e-8 || span < scale * 2e-8) return radius;
    if (Math.sign(result.error) === Math.sign(low.error)) low = { radius, error: result.error };
    else high = { radius, error: result.error };
  }
  return null;
}

function orbitFromFixedPoint(returnMap, field, radius, direction, window, scale) {
  const orbit = returnMap(radius, true);
  if (!orbit || Math.abs(orbit.error) > scale * 4e-7) return null;

  const h = scale * 2e-6;
  const divergence = ({ x, y }) => (field(x + h, y)[0] - field(x - h, y)[0]
    + field(x, y + h)[1] - field(x, y - h)[1]) / (2 * h);
  let logMultiplier = 0;
  for (let index = 1; index < orbit.path.length; index += 1) {
    const a = orbit.path[index - 1];
    const b = orbit.path[index];
    const step = b.time - a.time;
    const middle = interpolateStep(a, b, a.velocity, direction * step, 0.5);
    logMultiplier += step * (divergence(a) + 4 * divergence(middle) + divergence(b)) / 6;
  }
  // A fixed-point continuum such as a center has multiplier 1. Close returns
  // with unresolved isolation are omitted along with degenerate cycles.
  if (!Number.isFinite(logMultiplier) || Math.abs(logMultiplier) < 0.001 || logMultiplier > 700) return null;
  const path = orbit.path.map(({ x, y }) => ({ x, y }));
  if (path.some(({ x, y }) => x < window.x[0] - h || x > window.x[1] + h || y < window.y[0] - h || y > window.y[1] + h)) return null;
  path[path.length - 1] = path[0];
  if (direction < 0) path.reverse();
  const stability = logMultiplier < 0 ? "stable" : "unstable";
  return {
    path,
    radius: Math.max(...path.map(({ x, y }) => Math.hypot(x, y))),
    period: orbit.period,
    floquetMultiplier: Math.exp(logMultiplier),
    radialDerivative: logMultiplier / orbit.period,
    stability,
    label: stability === "stable" ? "Numerical attracting cycle" : "Numerical repelling cycle",
    seed: orbit.initial
  };
}

export function findPlanarCycles(field, parameter, phaseWindow, equilibria, options = {}) {
  const scale = Math.max(phaseWindow.x[1] - phaseWindow.x[0], phaseWindow.y[1] - phaseWindow.y[0]);
  const evaluate = (x, y) => field(x, y, parameter);
  const cycles = [];
  const centers = equilibria.filter(({ x, y }) =>
    x > phaseWindow.x[0] && x < phaseWindow.x[1] && y > phaseWindow.y[0] && y < phaseWindow.y[1]);
  const axes = options.fast ? [{ x: 1, y: 0 }] : [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  const fractions = options.fast ? FAST_FRACTIONS : TRIAL_FRACTIONS;
  const resolution = scale * 8e-7;

  // Every planar periodic orbit encloses an equilibrium. A ray from each
  // candidate equilibrium gives a finite collection of sections to try.
  for (const center of centers.slice(0, options.fast ? 4 : 6)) {
    for (const axis of axes) {
      const extent = sectionLimit(center, axis, phaseWindow);
      if (!(extent > scale * 1e-4)) continue;
      const radii = fractions.map((fraction) => fraction * extent);
      for (const seed of options.seeds || []) {
        if (!seed) continue;
        const projected = (seed.x - center.x) * axis.x + (seed.y - center.y) * axis.y;
        const offset = (seed.y - center.y) * axis.x - (seed.x - center.x) * axis.y;
        if (projected <= 0 || projected >= extent || Math.abs(offset) > 0.15 * extent) continue;
        radii.push(projected * 0.93, projected, Math.min(0.999 * extent, projected * 1.07));
      }
      const sortedRadii = [...new Set(radii)].sort((a, b) => a - b);

      for (const direction of [1, -1]) {
        const returnMap = makeReturnMap(evaluate, center, axis, direction, phaseWindow, scale);
        let previous = null;
        for (const radius of sortedRadii) {
          const result = returnMap(radius);
          if (!result) {
            previous = null;
            continue;
          }
          if (Math.abs(result.error) <= resolution) continue;
          const current = { radius, error: result.error };
          if (previous && Math.sign(previous.error) !== Math.sign(current.error)) {
            const root = refineFixedPoint(returnMap, previous, current, scale);
            const cycle = root == null ? null : orbitFromFixedPoint(returnMap, evaluate, root, direction, phaseWindow, scale);
            if (cycle && !cycles.some((other) => other.stability === cycle.stability
              && Math.abs(other.period - cycle.period) < 0.01 * cycle.period
              && distanceToPath(cycle.seed, other.path) < scale * 2e-4
              && distanceToPath(other.seed, cycle.path) < scale * 2e-4)) {
              cycles.push(cycle);
            }
          }
          previous = current;
        }
      }
    }
  }

  return cycles.sort((a, b) => a.radius - b.radius);
}
