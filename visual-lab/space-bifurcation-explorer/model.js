const SIGMA = 10;
const B = 8 / 3;
const LORENZ_A1 = SIGMA + B + 1;
export const LORENZ_HOPF = SIGMA * (SIGMA + B + 3) / (SIGMA - B - 1);

export const PRESETS = Object.freeze({
  lorenz: Object.freeze({
    id: "lorenz",
    name: "Lorenz system",
    parameterLabel: "r",
    parameterRange: [0, 45],
    defaultParameter: 28,
    initial: [1, 1, 1],
    bounds: [[-24, 24], [-32, 32], [0, 70]],
    defaults: { sectionAngle: 0, sectionOffset: 5 },
    peakCoordinate: "z",
    peakLabel: "z peaks",
    events: [{ parameter: 1, label: "Pitchfork" }, { parameter: LORENZ_HOPF, label: "Subcritical Hopf" }],
    step: 0.01,
    duration: 90,
    transient: 25
  }),
  hopf: Object.freeze({
    id: "hopf",
    name: "Planar Hopf with transverse contraction",
    parameterLabel: "r",
    parameterRange: [-1, 2],
    defaultParameter: 1,
    initial: [0.6, 0.2, 0.85],
    bounds: [[-2, 2], [-2, 2], [-1.3, 1.3]],
    defaults: { sectionAngle: 0, sectionOffset: 0 },
    peakCoordinate: "x",
    peakLabel: "x peaks",
    events: [{ parameter: 0, label: "Supercritical Hopf" }],
    step: 0.02,
    duration: 100,
    transient: 25
  })
});

function presetFor(id) {
  if (!Object.hasOwn(PRESETS, id)) throw new RangeError(`Unknown system: ${id}`);
  return PRESETS[id];
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function lerp(left, right, fraction) {
  return left + fraction * (right - left);
}

function lorenz(x, y, z, r) {
  return [SIGMA * (y - x), x * (r - z) - y, x * y - B * z];
}

function hopf(x, y, z, r) {
  const radial = r - x * x - y * y;
  return [radial * x - y, x + radial * y, -z];
}

export function fieldAt(id, r, [x, y, z]) {
  presetFor(id);
  return (id === "lorenz" ? lorenz : hopf)(x, y, z, r);
}

function cubicEigenvalues([a1, a2, a3]) {
  const shift = a1 / 3;
  const p = a2 - a1 * shift;
  const q = 2 * shift ** 3 - a2 * shift + a3;
  const halfQ = q / 2;
  const thirdP = p / 3;
  const discriminant = halfQ ** 2 + thirdP ** 3;
  const tolerance = 32 * Number.EPSILON * Math.max(1, halfQ ** 2, Math.abs(thirdP ** 3));
  if (discriminant < -tolerance) {
    const radius = 2 * Math.sqrt(-thirdP);
    const cosine = Math.max(-1, Math.min(1, -halfQ / (-thirdP) ** 1.5));
    const phase = Math.acos(cosine) / 3;
    return [0, 1, 2].map(index => ({ re: radius * Math.cos(phase - index * 2 * Math.PI / 3) - shift, im: 0 }));
  }
  if (discriminant <= tolerance) {
    const root = Math.cbrt(-halfQ);
    return [{ re: 2 * root - shift, im: 0 }, { re: -root - shift, im: 0 }, { re: -root - shift, im: 0 }];
  }
  // Choose the larger term for the cube root to avoid a near-zero divisor.
  const radical = Math.sqrt(discriminant);
  const u = Math.cbrt(-halfQ + (halfQ > 0 ? -radical : radical));
  const v = -thirdP / u;
  const re = -(u + v) / 2 - shift;
  const im = Math.sqrt(3) * Math.abs(u - v) / 2;
  return [{ re: u + v - shift, im: 0 }, { re, im }, { re, im: -im }];
}

function equilibrium(id, label, point, coefficients, eigenvalues) {
  const tolerance = 1e-9;
  const positive = eigenvalues.some(({ re }) => re > tolerance);
  const negative = eigenvalues.some(({ re }) => re < -tolerance);
  const critical = eigenvalues.some(({ re }) => Math.abs(re) <= tolerance);
  const stability = critical ? "critical" : positive ? negative ? "saddle" : "unstable" : "stable";
  return { id, label, point, coefficients, eigenvalues, stability };
}

export function equilibriaAt(id, r) {
  presetFor(id);
  finite(r, "Parameter");
  if (id === "hopf") {
    // (lambda + 1)((lambda - r)^2 + 1).
    const coefficients = [1 - 2 * r, r * r + 1 - 2 * r, r * r + 1];
    return [equilibrium("origin", "O", [0, 0, 0], coefficients,
      [{ re: -1, im: 0 }, { re: r, im: 1 }, { re: r, im: -1 }])];
  }

  // The origin's (x,y) block and z direction give separate factors.
  const trace = -(SIGMA + 1);
  const determinant = SIGMA * (1 - r);
  const discriminant = trace * trace - 4 * determinant;
  const root = Math.sqrt(Math.abs(discriminant));
  const originEigenvalues = discriminant >= 0
    ? [{ re: (trace - root) / 2, im: 0 }, { re: (trace + root) / 2, im: 0 }]
    : [{ re: trace / 2, im: root / 2 }, { re: trace / 2, im: -root / 2 }];
  const origin = equilibrium("origin", "O", [0, 0, 0],
    [LORENZ_A1, determinant - B * trace, B * determinant], [...originEigenvalues, { re: -B, im: 0 }]);
  if (r <= 1) return [origin];

  const coordinate = Math.sqrt(B * (r - 1));
  const coefficients = [LORENZ_A1, B * (SIGMA + r), 2 * SIGMA * B * (r - 1)];
  const eigenvalues = cubicEigenvalues(coefficients);
  return [origin,
    equilibrium("plus", "C+", [coordinate, coordinate, r - 1], coefficients, eigenvalues),
    equilibrium("minus", "C-", [-coordinate, -coordinate, r - 1], coefficients, eigenvalues)
  ];
}

export function sampleEquilibria(id, count = 151) {
  const { events, parameterRange: [min, max] } = presetFor(id);
  const size = Math.max(2, Math.min(501, Math.round(finite(count, "Sample count"))));
  const parameters = new Set(Array.from({ length: size }, (_, index) => lerp(min, max, index / (size - 1))));
  events.forEach(event => parameters.add(event.parameter));
  const branches = new Map();
  for (const parameter of [...parameters].sort((a, b) => a - b)) {
    const equilibria = equilibriaAt(id, parameter);
    if (id === "lorenz" && parameter === 1) {
      // At the pitchfork these are the same equilibrium, used only as the
      // endpoint of each side branch in the parameter diagram.
      equilibria.push({ ...equilibria[0], id: "plus", label: "C+" },
        { ...equilibria[0], id: "minus", label: "C-" });
    }
    for (const point of equilibria) {
      if (!branches.has(point.id)) branches.set(point.id, { id: point.id, label: point.label, points: [] });
      branches.get(point.id).points.push({ ...point, parameter });
    }
  }
  return [...branches.values()];
}

function rk4(field, r, x, y, z, step) {
  const [ax, ay, az] = field(x, y, z, r);
  const [bx, by, bz] = field(x + step * ax / 2, y + step * ay / 2, z + step * az / 2, r);
  const [cx, cy, cz] = field(x + step * bx / 2, y + step * by / 2, z + step * bz / 2, r);
  const [dx, dy, dz] = field(x + step * cx, y + step * cy, z + step * cz, r);
  return [x + step * (ax + 2 * bx + 2 * cx + dx) / 6,
    y + step * (ay + 2 * by + 2 * cy + dy) / 6,
    z + step * (az + 2 * bz + 2 * cz + dz) / 6];
}

function interpolatedPeak(left, middle, right, coordinate) {
  const rise = middle[coordinate] - left[coordinate];
  const fall = middle[coordinate] - right[coordinate];
  const tolerance = 1e-12 * Math.max(1, Math.abs(middle[coordinate]));
  if (!(rise > 0 && fall >= 0 && rise + fall > tolerance)) return null;
  // Fit a quadratic to three consecutive states and use the turning time
  // of the observed coordinate for all three interpolated coordinates.
  const alpha = (rise - fall) / (2 * (rise + fall));
  function quadratic(key) {
    const next = right[key] - middle[key];
    const previous = left[key] - middle[key];
    return middle[key] + alpha * (next - previous + alpha * (next + previous)) / 2;
  }
  return { t: middle.t + alpha * (right.t - middle.t), x: quadratic("x"), y: quadratic("y"), z: quadratic("z") };
}

export function integrateTrajectory(id, r, options = {}) {
  const preset = presetFor(id);
  finite(r, "Parameter");
  const initial = options.initial ?? preset.initial;
  if (initial.length !== 3 || ![...initial].every(Number.isFinite)) throw new RangeError("Enter three finite initial coordinates.");
  const duration = finite(options.duration ?? preset.duration, "Duration");
  const transient = finite(options.transient ?? Math.min(duration, preset.transient), "Transient");
  const step = finite(options.step ?? preset.step, "Step size");
  const recordEvery = Math.max(1, Math.round(finite(options.recordEvery ?? 2, "Recording interval")));
  if (!(duration > 0 && step > 0 && transient >= 0 && transient <= duration && duration / step <= 100000)) {
    throw new RangeError("Choose a positive duration and step size with at most 100,000 integration steps.");
  }
  const count = Math.ceil(duration / step);
  const dt = duration / count;
  const field = id === "lorenz" ? lorenz : hopf;
  const [x, y, z] = initial;
  let previous = null;
  let current = { t: 0, x, y, z };
  const samples = [current];
  const peaks = [];
  let termination = "completed";
  for (let index = 1; index <= count; index += 1) {
    const [nextX, nextY, nextZ] = rk4(field, r, current.x, current.y, current.z, dt);
    if (![nextX, nextY, nextZ].every(value => Number.isFinite(value) && Math.abs(value) <= 1e6)) {
      termination = "diverged";
      if (samples.at(-1) !== current) samples.push(current);
      break;
    }
    const next = { t: index * dt, x: nextX, y: nextY, z: nextZ };
    if (previous && next.t >= transient) {
      const peak = interpolatedPeak(previous, current, next, preset.peakCoordinate);
      if (peak && peak.t >= transient) peaks.push(peak);
    }
    if (index % recordEvery === 0 || index === count) samples.push(next);
    previous = current;
    current = next;
  }
  return { samples, peaks, step: dt, transient, termination };
}

export function compareTrajectories(id, r, {
  initial = presetFor(id).initial, component = "x", perturbation = 1e-6, threshold = 1,
  ...integrationOptions
} = {}) {
  const axis = ["x", "y", "z"].indexOf(component);
  if (axis < 0) throw new RangeError("Choose x, y, or z as the perturbed coordinate.");
  finite(perturbation, "Perturbation");
  if (finite(threshold, "Threshold") <= 0) throw new RangeError("The separation threshold must be positive.");

  const primary = integrateTrajectory(id, r, { ...integrationOptions, initial });
  const perturbed = [...initial];
  perturbed[axis] += perturbation;
  const comparison = integrateTrajectory(id, r, { ...integrationOptions, initial: perturbed });

  const separation = [];
  let maximumDistance = 0;
  let timeOfMaximum = 0;
  let firstThresholdTime = null;
  const commonCount = Math.min(primary.samples.length, comparison.samples.length);
  for (let index = 0; index < commonCount; index += 1) {
    const a = primary.samples[index];
    const b = comparison.samples[index];
    // Both runs share a time grid. A run that stops early can append an
    // off-grid final sample, which has no matching time in the other run.
    if (a.t !== b.t) break;
    const distance = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    separation.push({ t: a.t, distance });
    if (distance > maximumDistance) {
      maximumDistance = distance;
      timeOfMaximum = a.t;
    }
    if (firstThresholdTime === null && distance >= threshold) firstThresholdTime = a.t;
  }
  return {
    primary, comparison, separation, maximumDistance, timeOfMaximum, firstThresholdTime,
    initialDistance: separation[0].distance,
    finalDistance: separation.at(-1).distance
  };
}

export function sectionCrossings(samples, { angle = 0, offset = 0, direction = 1, after = 0 } = {}) {
  const normalX = Math.cos(angle);
  const normalY = Math.sin(angle);
  const sign = direction < 0 ? -1 : 1;
  const crossings = [];
  let previous = null;
  let previousDistance = 0;
  let onPlane = null;
  for (const sample of samples) {
    const distance = sign * (normalX * sample.x + normalY * sample.y - offset);
    if (distance === 0) {
      onPlane ??= sample;
      continue;
    }
    // Require a sign change on both sides of the plane, even if one of the
    // recorded points lies exactly on it. A grazing contact is not a hit.
    if (previousDistance < 0 && distance > 0) {
      const fraction = -previousDistance / (distance - previousDistance);
      const intersection = onPlane ?? {
        t: lerp(previous.t, sample.t, fraction),
        x: lerp(previous.x, sample.x, fraction),
        y: lerp(previous.y, sample.y, fraction),
        z: lerp(previous.z, sample.z, fraction)
      };
      const { t, x, y, z } = intersection;
      if (t >= after) crossings.push({ t, x, y, z, point: [x, y, z], u: -normalY * x + normalX * y, v: z });
    }
    previous = sample;
    previousDistance = distance;
    onPlane = null;
  }
  return crossings;
}

export function samplePeakColumn(id, r, { count = 24 } = {}) {
  const preset = presetFor(id);
  finite(r, "Parameter");
  if (id === "hopf") {
    // The attracting circle has radius sqrt(r) and lies in z = 0.
    return { parameter: r, values: [Math.sqrt(Math.max(0, r))], kind: r > 0 ? "peaks" : "steady", exact: true };
  }

  const peakCount = Math.max(1, Math.min(100, Math.round(finite(count, "Peak count"))));
  const dynamics = integrateTrajectory(id, r, { duration: 160, transient: 115, recordEvery: 200 });
  if (dynamics.termination !== "completed") return { parameter: r, values: [], kind: "insufficient" };
  const tail = dynamics.samples.slice(-4);
  const steady = equilibriaAt(id, r).find(eq => eq.stability === "stable" && tail.every(sample =>
    Math.hypot(sample.x - eq.point[0], sample.y - eq.point[1], sample.z - eq.point[2]) < 1e-4));
  if (steady) return { parameter: r, values: [steady.point[2]], kind: "steady" };
  const values = dynamics.peaks.slice(-peakCount).map(peak => peak[preset.peakCoordinate]);
  return { parameter: r, values, kind: values.length ? "peaks" : "insufficient" };
}
