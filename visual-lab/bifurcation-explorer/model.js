/**
 * Pure numerical model for the one-dimensional bifurcation explorer.
 *
 * A family is a small immutable record with at least
 *   { id, name, formula, xRange, rRange, eval(x, r) }.
 * The functions below never touch the DOM and are safe to use from a worker.
 */

const EPSILON = Number.EPSILON;
const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
const finiteDifferenceCache = new Map();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function normalizeRange(range, fallback, label) {
  const candidate = Array.isArray(range) && range.length >= 2 ? range : fallback;
  const minimum = assertFinite(Number(candidate[0]), `${label}[0]`);
  const maximum = assertFinite(Number(candidate[1]), `${label}[1]`);
  if (!(maximum > minimum)) throw new RangeError(`${label} must have positive width`);
  return Object.freeze([minimum, maximum]);
}

function freezeCandidate(candidate) {
  return Object.freeze({
    x: Number(candidate.x),
    r: Number(candidate.r),
    type: candidate.type || "unknown",
    label: candidate.label || candidate.type || "Candidate"
  });
}

function makeFamily(definition) {
  if (!definition || typeof definition.eval !== "function") {
    throw new TypeError("A family requires an eval(x, r) function");
  }

  return Object.freeze({
    id: String(definition.id),
    name: String(definition.name),
    shortName: String(definition.shortName || definition.name),
    description: String(definition.description || ""),
    formula: String(definition.formula),
    xRange: normalizeRange(definition.xRange, [-3, 3], "xRange"),
    rRange: normalizeRange(definition.rRange, [-2, 2], "rRange"),
    defaultR: Number.isFinite(definition.defaultR) ? definition.defaultR : 0,
    supportsHysteresis: Boolean(definition.supportsHysteresis),
    seed: definition.seed == null ? null : String(definition.seed),
    sourceType: definition.sourceType || "preset",
    knownCandidates: Object.freeze((definition.knownCandidates || []).map(freezeCandidate)),
    eval: definition.eval
  });
}

const presetDefinitions = {
  "saddle-node": {
    id: "saddle-node",
    name: "Saddle-node",
    formula: "ẋ = r + x²",
    description: "A stable and an unstable equilibrium collide and disappear at r = 0.",
    xRange: [-2.6, 2.6],
    rRange: [-2, 2],
    defaultR: -1,
    knownCandidates: [{ x: 0, r: 0, type: "saddle-node", label: "Saddle-node" }],
    eval(x, r) {
      return r + x * x;
    }
  },
  transcritical: {
    id: "transcritical",
    name: "Transcritical",
    formula: "ẋ = rx − x²",
    description: "Two equilibrium branches cross and exchange stability at r = 0.",
    xRange: [-2.6, 2.6],
    rRange: [-2, 2],
    defaultR: -1,
    knownCandidates: [{ x: 0, r: 0, type: "transcritical", label: "Transcritical" }],
    eval(x, r) {
      return r * x - x * x;
    }
  },
  "supercritical-pitchfork": {
    id: "supercritical-pitchfork",
    name: "Supercritical pitchfork",
    formula: "ẋ = rx − x³",
    description: "A stable equilibrium loses stability while two stable branches emerge.",
    xRange: [-2.2, 2.2],
    rRange: [-2, 2],
    defaultR: -1,
    knownCandidates: [{
      x: 0,
      r: 0,
      type: "supercritical-pitchfork",
      label: "Supercritical pitchfork"
    }],
    eval(x, r) {
      return r * x - x * x * x;
    }
  },
  "subcritical-pitchfork": {
    id: "subcritical-pitchfork",
    name: "Subcritical pitchfork",
    formula: "ẋ = rx + x³",
    description: "Two unstable branches collapse into an equilibrium as it loses stability.",
    xRange: [-2.2, 2.2],
    rRange: [-2, 2],
    defaultR: -1,
    knownCandidates: [{
      x: 0,
      r: 0,
      type: "subcritical-pitchfork",
      label: "Subcritical pitchfork"
    }],
    eval(x, r) {
      return r * x + x * x * x;
    }
  },
  hysteresis: {
    id: "hysteresis",
    name: "Fold pair / hysteresis",
    formula: "ẋ = r + x − x³",
    description: "Two saddle-node folds enclose a three-equilibrium region, the geometric source of a hysteresis loop under slow parameter sweeps.",
    xRange: [-2.1, 2.1],
    rRange: [-1.1, 1.1],
    defaultR: 0,
    supportsHysteresis: true,
    knownCandidates: [
      {
        x: -1 / Math.sqrt(3),
        r: (-1 / Math.sqrt(3)) ** 3 + 1 / Math.sqrt(3),
        type: "saddle-node",
        label: "Right fold"
      },
      {
        x: 1 / Math.sqrt(3),
        r: (1 / Math.sqrt(3)) ** 3 - 1 / Math.sqrt(3),
        type: "saddle-node",
        label: "Left fold"
      }
    ],
    eval(x, r) {
      return r + x - x * x * x;
    }
  }
};

export const PRESET_IDS = Object.freeze(Object.keys(presetDefinitions));

export const PRESETS = Object.freeze(Object.fromEntries(
  Object.entries(presetDefinitions).map(([id, definition]) => {
    const family = makeFamily(definition);
    return [id, Object.freeze({
      id,
      name: family.name,
      formula: family.formula,
      description: family.description,
      xRange: family.xRange,
      rRange: family.rRange,
      defaultR: family.defaultR,
      supportsHysteresis: family.supportsHysteresis
    })];
  })
));

const FAMILY_ALIASES = Object.freeze({
  saddle: "saddle-node",
  "saddle_node": "saddle-node",
  pitchfork: "supercritical-pitchfork",
  "pitchfork-supercritical": "supercritical-pitchfork",
  "pitchfork-subcritical": "subcritical-pitchfork",
  supercritical: "supercritical-pitchfork",
  subcritical: "subcritical-pitchfork"
});

/** A deterministic 32-bit hash suitable for turning labels into PRNG seeds. */
export function hashSeed(seed) {
  const text = String(seed == null ? "bifurcation" : seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

/** Mulberry32: compact, reproducible, and adequate for procedural examples. */
export function createRng(seed = "bifurcation") {
  let state = hashSeed(seed);
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random, minimum, maximum) {
  return minimum + (maximum - minimum) * random();
}

function randomSign(random) {
  return random() < 0.5 ? -1 : 1;
}

function formatCoefficient(value) {
  const rounded = Math.abs(value) < 0.0005 ? 0 : Number(value.toFixed(3));
  return rounded < 0 ? `− ${Math.abs(rounded)}` : `+ ${rounded}`;
}

function formatShift(variable, center) {
  const sign = center < 0 ? "+" : "−";
  return `${variable} ${sign} ${Math.abs(center).toFixed(3)}`;
}

function stableSinRemainder(z, includeCubic = false) {
  if (Math.abs(z) < 0.02) {
    const z2 = z * z;
    if (includeCubic) {
      return z * z2 * z2 * (1 / 120 - z2 / 5040 + z2 * z2 / 362880);
    }
    return z * z2 * (-1 / 6 + z2 / 120 - z2 * z2 / 5040);
  }
  return includeCubic ? Math.sin(z) - z + z * z * z / 6 : Math.sin(z) - z;
}

function stableExpRemainder(z, subtractQuadratic = false) {
  if (Math.abs(z) < 0.02) {
    let term = z * z / 2;
    let total = subtractQuadratic ? 0 : term;
    for (let order = 3; order <= 10; order += 1) {
      term *= z / order;
      total += term;
    }
    return total;
  }
  const quadratic = subtractQuadratic ? z * z / 2 : 0;
  return Math.expm1(z) - z - quadratic;
}

/**
 * Build a reproducible analytic family. Every generated family contains a
 * planted codimension-one bifurcation, plus small polynomial, trigonometric,
 * exponential, and logarithmic perturbations that preserve its local type.
 */
export function createRandomFamily(seed = "bifurcation", options = {}) {
  const random = createRng(seed);
  const randomKinds = PRESET_IDS.filter((id) => id !== "hysteresis");
  const allowedKinds = (options.kinds || randomKinds).filter((id) => randomKinds.includes(id));
  const requestedKind = options.kind && (FAMILY_ALIASES[options.kind] || options.kind);
  const kind = requestedKind && randomKinds.includes(requestedKind)
    ? requestedKind
    : allowedKinds[Math.floor(random() * allowedKinds.length)] || "saddle-node";

  const x0 = Number.isFinite(options.x0) ? options.x0 : randomBetween(random, -0.65, 0.65);
  const r0 = Number.isFinite(options.r0) ? options.r0 : randomBetween(random, -0.55, 0.55);
  const a = randomSign(random) * randomBetween(random, 0.8, 1.3);
  let b = randomSign(random) * randomBetween(random, 0.78, 1.25);
  if (kind === "supercritical-pitchfork") b = -Math.sign(a) * Math.abs(b);
  if (kind === "subcritical-pitchfork") b = Math.sign(a) * Math.abs(b);

  const c = randomBetween(random, -0.12, 0.12);
  const d = randomBetween(random, -0.09, 0.09);
  const e = randomBetween(random, -0.07, 0.07);
  const trigWeight = randomBetween(random, -0.045, 0.045);
  const expWeight = randomBetween(random, -0.035, 0.035);
  const logWeight = randomBetween(random, -0.04, 0.04);
  const trigFrequency = randomBetween(random, 0.7, 1.35);
  const expRate = randomBetween(random, 0.28, 0.56);
  const logRate = randomBetween(random, 0.55, 1.05);

  let evaluate;
  let formula;
  const origin = `u = ${formatShift("x", x0)},  μ = ${formatShift("r", r0)}`;

  if (kind === "saddle-node") {
    evaluate = function randomSaddleNode(x, r) {
      const u = x - x0;
      const mu = r - r0;
      const zTrig = trigFrequency * u;
      const zExp = expRate * u;
      const zLog = logRate * u;
      return a * mu + b * u * u + c * mu * u + d * u * u * u + e * mu * mu
        + trigWeight * stableSinRemainder(zTrig)
        + expWeight * stableExpRemainder(zExp, false)
        + logWeight * Math.log1p(zLog * zLog);
    };
    formula = `ẋ = ${a.toFixed(3)}μ ${formatCoefficient(b)}u² ${formatCoefficient(c)}μu `
      + `${formatCoefficient(d)}u³ ${formatCoefficient(e)}μ² ${formatCoefficient(trigWeight)}(sin(${trigFrequency.toFixed(2)}u)−${trigFrequency.toFixed(2)}u) `
      + `${formatCoefficient(expWeight)}(exp(${expRate.toFixed(2)}u)−1−${expRate.toFixed(2)}u) `
      + `${formatCoefficient(logWeight)}ln(1+(${logRate.toFixed(2)}u)²); ${origin}`;
  } else if (kind === "transcritical") {
    evaluate = function randomTranscritical(x, r) {
      const u = x - x0;
      const mu = r - r0;
      const zTrig = trigFrequency * u;
      const zExp = expRate * u;
      const zLog = logRate * mu;
      return a * mu * u + b * u * u + c * u * u * u + d * mu * u * u + e * mu * mu * u
        + trigWeight * stableSinRemainder(zTrig)
        + expWeight * stableExpRemainder(zExp, true)
        + logWeight * u * Math.log1p(zLog * zLog);
    };
    formula = `ẋ = ${a.toFixed(3)}μu ${formatCoefficient(b)}u² ${formatCoefficient(c)}u³ `
      + `${formatCoefficient(d)}μu² ${formatCoefficient(e)}μ²u ${formatCoefficient(trigWeight)}(sin(${trigFrequency.toFixed(2)}u)−${trigFrequency.toFixed(2)}u) `
      + `${formatCoefficient(expWeight)}(exp(${expRate.toFixed(2)}u)−1−${expRate.toFixed(2)}u−(${expRate.toFixed(2)}u)²/2) `
      + `${formatCoefficient(logWeight)}u ln(1+(${logRate.toFixed(2)}μ)²); ${origin}`;
  } else {
    evaluate = function randomPitchfork(x, r) {
      const u = x - x0;
      const mu = r - r0;
      const zTrig = trigFrequency * u;
      const zExp = expRate * u;
      const zLog = logRate * mu;
      return a * mu * u + b * u * u * u + c * u * u * u * u + d * mu * u * u + e * mu * mu * u
        + trigWeight * stableSinRemainder(zTrig, true)
        + expWeight * stableExpRemainder(zExp, true)
        + logWeight * u * Math.log1p(zLog * zLog);
    };
    formula = `ẋ = ${a.toFixed(3)}μu ${formatCoefficient(b)}u³ ${formatCoefficient(c)}u⁴ `
      + `${formatCoefficient(d)}μu² ${formatCoefficient(e)}μ²u ${formatCoefficient(trigWeight)}(sin(${trigFrequency.toFixed(2)}u)−${trigFrequency.toFixed(2)}u+(${trigFrequency.toFixed(2)}u)³/6) `
      + `${formatCoefficient(expWeight)}(exp(${expRate.toFixed(2)}u)−1−${expRate.toFixed(2)}u−(${expRate.toFixed(2)}u)²/2) `
      + `${formatCoefficient(logWeight)}u ln(1+(${logRate.toFixed(2)}μ)²); ${origin}`;
  }

  const displayName = kind.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  return makeFamily({
    id: `random-${hashSeed(seed).toString(16).padStart(8, "0")}`,
    name: `Random analytic family · ${displayName}`,
    shortName: `Random · ${displayName}`,
    description: "A seeded analytic perturbation with a known local bifurcation and possible additional global structure.",
    formula,
    xRange: options.xRange || [x0 - 3.1, x0 + 3.1],
    rRange: options.rRange || [r0 - 2.15, r0 + 2.15],
    defaultR: clamp(r0 - 0.8, r0 - 2.15, r0 + 2.15),
    seed,
    sourceType: "random",
    knownCandidates: [{ x: x0, r: r0, type: kind, label: displayName }],
    eval: evaluate
  });
}

/** Create one of the named presets, or a seeded random family. */
export function createFamily(id = "saddle-node", seed = "bifurcation", options = {}) {
  const normalizedId = FAMILY_ALIASES[id] || id;
  if (normalizedId === "random" || normalizedId === "random-analytic") {
    return createRandomFamily(seed, options);
  }
  const definition = presetDefinitions[normalizedId];
  if (!definition) throw new RangeError(`Unknown family: ${id}`);
  return makeFamily(definition);
}

export function evaluateFamily(family, x, r) {
  if (!family || typeof family.eval !== "function") throw new TypeError("Invalid family");
  return family.eval(Number(x), Number(r));
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, rowIndex) => row.slice().concat(vector[rowIndex]));

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-15) throw new RangeError("Singular finite-difference system");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function finiteDifferenceWeights(radius, order) {
  if (order === 0) return { nodes: [0], weights: [1] };
  const safeRadius = Math.max(radius, Math.ceil(order / 2));
  const key = `${safeRadius}:${order}`;
  if (finiteDifferenceCache.has(key)) return finiteDifferenceCache.get(key);
  const nodes = [];
  for (let node = -safeRadius; node <= safeRadius; node += 1) nodes.push(node);
  const matrix = nodes.map((_, power) => nodes.map((node) => node ** power));
  const target = nodes.map((_, power) => power === order ? FACTORIALS[order] : 0);
  const result = Object.freeze({ nodes: Object.freeze(nodes), weights: Object.freeze(solveLinearSystem(matrix, target)) });
  finiteDifferenceCache.set(key, result);
  return result;
}

function defaultStep(value, order, span = 1) {
  const scale = Math.max(1, Math.abs(value), Math.abs(span) * 0.25);
  const exponents = [0, 1 / 5, 1 / 6, 1 / 7, 1 / 8];
  const multiplier = [1, 1, 1.5, 1.2, 1][order] || 1;
  return Math.max(1e-6, multiplier * EPSILON ** exponents[Math.min(order, 4)] * scale);
}

/** Numerical mixed partial using symmetric high-order finite differences. */
export function partialDerivative(family, x, r, xOrder = 1, rOrder = 0, options = {}) {
  if (!Number.isInteger(xOrder) || xOrder < 0 || xOrder > 4) throw new RangeError("xOrder must be 0–4");
  if (!Number.isInteger(rOrder) || rOrder < 0 || rOrder > 4) throw new RangeError("rOrder must be 0–4");
  if (xOrder + rOrder > 4) throw new RangeError("Total derivative order must be at most 4");
  if (xOrder === 0 && rOrder === 0) return evaluateFamily(family, x, r);

  const xSpan = family.xRange ? family.xRange[1] - family.xRange[0] : 1;
  const rSpan = family.rRange ? family.rRange[1] - family.rRange[0] : 1;
  const hx = options.xStep || defaultStep(x, xOrder, xSpan);
  const hr = options.rStep || defaultStep(r, rOrder, rSpan);
  const xStencil = finiteDifferenceWeights(Math.max(2, xOrder), xOrder);
  const rStencil = finiteDifferenceWeights(Math.max(2, rOrder), rOrder);
  let total = 0;
  for (let xi = 0; xi < xStencil.nodes.length; xi += 1) {
    for (let ri = 0; ri < rStencil.nodes.length; ri += 1) {
      total += xStencil.weights[xi] * rStencil.weights[ri]
        * evaluateFamily(family, x + xStencil.nodes[xi] * hx, r + rStencil.nodes[ri] * hr);
    }
  }
  return total / (hx ** xOrder * hr ** rOrder);
}

export function derivativesAt(family, x, r, options = {}) {
  return Object.freeze({
    f: evaluateFamily(family, x, r),
    fx: partialDerivative(family, x, r, 1, 0, options),
    fr: partialDerivative(family, x, r, 0, 1, options),
    fxx: partialDerivative(family, x, r, 2, 0, options),
    fxr: partialDerivative(family, x, r, 1, 1, options),
    frr: partialDerivative(family, x, r, 0, 2, options),
    fxxx: partialDerivative(family, x, r, 3, 0, options)
  });
}

function bisectRoot(fn, left, right, tolerance, maximumIterations = 80) {
  let a = left;
  let b = right;
  let fa = fn(a);
  let fb = fn(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (Math.abs(fa) <= tolerance) return a;
  if (Math.abs(fb) <= tolerance) return b;
  if (fa * fb > 0) return null;
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const middle = (a + b) / 2;
    const fm = fn(middle);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) <= tolerance || Math.abs(b - a) <= tolerance) return middle;
    if (fa * fm <= 0) {
      b = middle;
      fb = fm;
    } else {
      a = middle;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

function scanSignChangeRoots(fn, minimum, maximum, samples, valueTolerance) {
  const roots = [];
  const step = (maximum - minimum) / samples;
  let left = minimum;
  let leftValue = fn(left);
  if (Number.isFinite(leftValue) && Math.abs(leftValue) <= valueTolerance) roots.push(left);
  for (let index = 1; index <= samples; index += 1) {
    const right = index === samples ? maximum : minimum + index * step;
    const rightValue = fn(right);
    if (Number.isFinite(rightValue)) {
      if (Math.abs(rightValue) <= valueTolerance) roots.push(right);
      if (Number.isFinite(leftValue) && leftValue * rightValue < 0) {
        const root = bisectRoot(fn, left, right, valueTolerance);
        if (root != null) roots.push(root);
      }
    }
    left = right;
    leftValue = rightValue;
  }
  return roots;
}

function refineRootNewton(family, r, initial, xMin, xMax, tolerance) {
  let x = initial;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const value = evaluateFamily(family, x, r);
    if (!Number.isFinite(value) || Math.abs(value) <= tolerance) break;
    const derivative = partialDerivative(family, x, r, 1, 0);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = x - value / derivative;
    if (!Number.isFinite(next) || next < xMin || next > xMax) break;
    if (Math.abs(next - x) < 1e-12 * (1 + Math.abs(x))) {
      x = next;
      break;
    }
    x = next;
  }
  return x;
}

function uniqueSorted(values, tolerance) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const unique = [];
  for (const value of sorted) {
    if (!unique.length || Math.abs(value - unique[unique.length - 1]) > tolerance) unique.push(value);
    else unique[unique.length - 1] = (unique[unique.length - 1] + value) / 2;
  }
  return unique;
}

function stabilityAt(family, x, r, xMin, xMax, options = {}) {
  const derivative = partialDerivative(family, x, r, 1, 0);
  const span = xMax - xMin;
  const derivativeTolerance = options.derivativeTolerance || 2e-6;
  let stability;
  let attractingFromLeft = false;
  let attractingFromRight = false;
  let flowLeft = 0;
  let flowRight = 0;

  if (derivative < -derivativeTolerance) {
    stability = "stable";
    attractingFromLeft = true;
    attractingFromRight = true;
  } else if (derivative > derivativeTolerance) {
    stability = "unstable";
  } else {
    const probe = Math.max(span * 2e-5, 2e-6 * (1 + Math.abs(x)));
    flowLeft = Math.sign(evaluateFamily(family, Math.max(xMin, x - probe), r));
    flowRight = Math.sign(evaluateFamily(family, Math.min(xMax, x + probe), r));
    attractingFromLeft = flowLeft > 0;
    attractingFromRight = flowRight < 0;
    if (attractingFromLeft && attractingFromRight) stability = "stable-nonhyperbolic";
    else if (!attractingFromLeft && !attractingFromRight && flowLeft !== 0 && flowRight !== 0) {
      stability = "unstable-nonhyperbolic";
    } else if (flowLeft === 0 && flowRight === 0) stability = "nonhyperbolic";
    else stability = "semistable";
  }

  return {
    derivative,
    stability,
    stable: stability.startsWith("stable") ? true : stability.startsWith("unstable") ? false : null,
    attractingFromLeft,
    attractingFromRight,
    flowLeft,
    flowRight
  };
}

/**
 * Find all equilibria in xMin <= x <= xMax for a fixed parameter r.
 * Sign-changing roots and even-multiplicity tangent roots are both retained.
 */
export function findEquilibria(family, r, xMin = family.xRange[0], xMax = family.xRange[1], options = {}) {
  if (typeof xMin === "object") {
    options = xMin;
    xMin = options.xMin ?? family.xRange[0];
    xMax = options.xMax ?? family.xRange[1];
  } else if (typeof xMax === "object") {
    options = xMax;
    xMax = options.xMax ?? family.xRange[1];
  }
  assertFinite(r, "r");
  assertFinite(xMin, "xMin");
  assertFinite(xMax, "xMax");
  if (!(xMax > xMin)) throw new RangeError("xMax must exceed xMin");
  const samples = Math.max(40, Math.floor(options.samples || 720));
  const span = xMax - xMin;
  let maximumMagnitude = 1;
  for (let index = 0; index <= Math.min(samples, 160); index += 1) {
    const value = evaluateFamily(family, xMin + span * index / Math.min(samples, 160), r);
    if (Number.isFinite(value)) maximumMagnitude = Math.max(maximumMagnitude, Math.abs(value));
  }
  const valueTolerance = options.valueTolerance || 5e-11 * maximumMagnitude;
  const tangentTolerance = options.tangentTolerance || 2e-7 * maximumMagnitude;
  const fn = (x) => evaluateFamily(family, x, r);
  const candidates = scanSignChangeRoots(fn, xMin, xMax, samples, valueTolerance);

  // A root with even multiplicity does not change sign. Locate critical points
  // of f and retain only those that actually lie on the zero level.
  const derivativeFn = (x) => partialDerivative(family, x, r, 1, 0);
  const criticalPoints = scanSignChangeRoots(derivativeFn, xMin, xMax, Math.max(80, Math.floor(samples / 2)), 1e-9);
  for (const criticalPoint of criticalPoints) {
    const refined = refineRootNewton(family, r, criticalPoint, xMin, xMax, valueTolerance);
    if (Math.abs(fn(refined)) <= tangentTolerance) candidates.push(refined);
  }

  const dedupeTolerance = options.dedupeTolerance || Math.max(2e-7, span * 2e-6);
  const roots = uniqueSorted(
    candidates.map((candidate) => refineRootNewton(family, r, candidate, xMin, xMax, valueTolerance)),
    dedupeTolerance
  ).filter((root) => Math.abs(fn(root)) <= tangentTolerance);

  return roots.map((x) => Object.freeze({
    x,
    r,
    residual: fn(x),
    ...stabilityAt(family, x, r, xMin, xMax, options)
  }));
}

function connectBranches(slices, xSpan, rStep) {
  const branches = [];
  let active = [];
  let nextId = 0;
  const maximumJump = Math.max(xSpan * 0.14, rStep * 4);

  for (const slice of slices) {
    const roots = slice.equilibria;
    const assignments = [];
    for (let branchIndex = 0; branchIndex < active.length; branchIndex += 1) {
      const branch = active[branchIndex];
      const last = branch.points[branch.points.length - 1];
      const previous = branch.points[branch.points.length - 2];
      const prediction = previous
        ? last.x + (last.x - previous.x) * ((slice.r - last.r) / Math.max(1e-12, last.r - previous.r))
        : last.x;
      for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
        assignments.push({ branchIndex, rootIndex, cost: Math.abs(roots[rootIndex].x - prediction) });
      }
    }
    assignments.sort((left, right) => left.cost - right.cost);
    const usedBranches = new Set();
    const usedRoots = new Set();
    for (const assignment of assignments) {
      if (assignment.cost > maximumJump) continue;
      if (usedBranches.has(assignment.branchIndex) || usedRoots.has(assignment.rootIndex)) continue;
      active[assignment.branchIndex].points.push(roots[assignment.rootIndex]);
      usedBranches.add(assignment.branchIndex);
      usedRoots.add(assignment.rootIndex);
    }

    const continuing = active.filter((_, index) => usedBranches.has(index));
    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      if (usedRoots.has(rootIndex)) continue;
      const branch = { id: nextId, points: [roots[rootIndex]] };
      nextId += 1;
      branches.push(branch);
      continuing.push(branch);
    }
    active = continuing;
  }

  return branches.map((branch) => Object.freeze({ id: branch.id, points: Object.freeze(branch.points.slice()) }));
}

function refineBifurcationCandidate(family, candidate, bounds, options = {}) {
  let x = clamp(candidate.x, bounds.xMin, bounds.xMax);
  let r = clamp(candidate.r, bounds.rMin, bounds.rMax);
  const xScale = Math.max(1, bounds.xMax - bounds.xMin);
  const rScale = Math.max(1, bounds.rMax - bounds.rMin);
  const tolerance = options.candidateTolerance || 2e-7;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const derivatives = derivativesAt(family, x, r);
    const residual = Math.hypot(derivatives.f / xScale, derivatives.fx);
    if (residual < tolerance) break;

    // Levenberg-Marquardt step for [f, f_x] = 0. The regularization also
    // handles the singular Jacobians occurring at pitchfork/transcritical points.
    const j00 = derivatives.fx;
    const j01 = derivatives.fr;
    const j10 = derivatives.fxx;
    const j11 = derivatives.fxr;
    let damping = 1e-8;
    let accepted = false;
    for (let attempt = 0; attempt < 8 && !accepted; attempt += 1) {
      const a00 = j00 * j00 + j10 * j10 + damping;
      const a01 = j00 * j01 + j10 * j11;
      const a11 = j01 * j01 + j11 * j11 + damping;
      const b0 = -(j00 * derivatives.f + j10 * derivatives.fx);
      const b1 = -(j01 * derivatives.f + j11 * derivatives.fx);
      const determinant = a00 * a11 - a01 * a01;
      if (Math.abs(determinant) < 1e-20) {
        damping *= 10;
        continue;
      }
      const dx = (b0 * a11 - b1 * a01) / determinant;
      const dr = (a00 * b1 - a01 * b0) / determinant;
      const nextX = clamp(x + clamp(dx, -0.3 * xScale, 0.3 * xScale), bounds.xMin, bounds.xMax);
      const nextR = clamp(r + clamp(dr, -0.3 * rScale, 0.3 * rScale), bounds.rMin, bounds.rMax);
      const nextF = evaluateFamily(family, nextX, nextR);
      const nextFx = partialDerivative(family, nextX, nextR, 1, 0);
      if (Math.hypot(nextF / xScale, nextFx) < residual) {
        x = nextX;
        r = nextR;
        accepted = true;
      } else damping *= 10;
    }
    if (!accepted) break;
  }

  const derivatives = derivativesAt(family, x, r);
  return {
    x,
    r,
    residual: Math.hypot(derivatives.f, derivatives.fx),
    derivatives
  };
}

function candidateTypeLabel(type) {
  return {
    "saddle-node": "Saddle-node",
    transcritical: "Transcritical",
    "supercritical-pitchfork": "Supercritical pitchfork",
    "subcritical-pitchfork": "Subcritical pitchfork",
    "degenerate-pitchfork": "Pitchfork-like degeneracy",
    degenerate: "Higher-order degeneracy",
    unknown: "Unclassified candidate"
  }[type] || "Unclassified candidate";
}

/** Classify a point satisfying f = f_x = 0 from its local derivative jet. */
export function classifyCandidate(family, candidate, options = {}) {
  const x = Number(candidate.x);
  const r = Number(candidate.r);
  const derivatives = candidate.derivatives || derivativesAt(family, x, r, options);
  const scale = Math.max(
    1,
    Math.abs(derivatives.fr),
    Math.abs(derivatives.fxx),
    Math.abs(derivatives.fxr),
    Math.abs(derivatives.fxxx)
  );
  const zeroTolerance = options.classificationTolerance || 4e-4 * scale;
  const hessianDiscriminant = derivatives.fxr * derivatives.fxr
    - derivatives.fxx * derivatives.frr;
  const pitchforkProduct = derivatives.fxr * derivatives.fxxx;
  const matchingKnownCandidate = (family.knownCandidates || []).find((known) =>
    Math.abs(known.x - x) < 2e-3 && Math.abs(known.r - r) < 2e-3
  );
  const guaranteedType = candidate.type || matchingKnownCandidate?.type || null;
  const guaranteedPersistentBranch = guaranteedType === "transcritical";
  let type = "unknown";
  let normalForm = "No generic codimension-one normal form identified";
  let normalFormTerms = [];

  if (Math.abs(derivatives.fr) > zeroTolerance && Math.abs(derivatives.fxx) > zeroTolerance) {
    type = "saddle-node";
    normalForm = "u̇ ≈ aμ + bu²";
    normalFormTerms = [[0, 1], [2, 0]];
  } else if (
    Math.abs(derivatives.fr) <= zeroTolerance
    && Math.abs(derivatives.fxx) > zeroTolerance
    && Math.abs(derivatives.fxr) > zeroTolerance
    && (guaranteedPersistentBranch || hessianDiscriminant > zeroTolerance * zeroTolerance)
  ) {
    type = "transcritical";
    normalForm = "u̇ ≈ aμu + bu²";
    normalFormTerms = [[1, 1], [2, 0]];
  } else if (
    Math.abs(derivatives.fr) <= zeroTolerance
    && Math.abs(derivatives.fxx) <= zeroTolerance
    && Math.abs(derivatives.fxr) > zeroTolerance
    && Math.abs(derivatives.fxxx) > zeroTolerance
  ) {
    type = pitchforkProduct < 0 ? "supercritical-pitchfork" : "subcritical-pitchfork";
    normalForm = "u̇ ≈ aμu + bu³";
    normalFormTerms = [[1, 1], [3, 0]];
  } else if (Math.abs(derivatives.fxr) > zeroTolerance && Math.abs(derivatives.fxxx) > zeroTolerance) {
    type = "degenerate-pitchfork";
    normalForm = "u̇ ≈ aμu + bu³ plus symmetry-breaking terms";
    normalFormTerms = [[1, 1], [3, 0]];
  } else if (Math.abs(derivatives.f) <= zeroTolerance && Math.abs(derivatives.fx) <= zeroTolerance) {
    type = "degenerate";
  }

  return Object.freeze({
    x,
    r,
    type,
    label: candidateTypeLabel(type),
    normalForm,
    normalFormTerms: Object.freeze(normalFormTerms.map((term) => Object.freeze(term))),
    hessianDiscriminant,
    pitchforkProduct,
    residual: Math.hypot(derivatives.f, derivatives.fx),
    derivatives: Object.freeze({ ...derivatives })
  });
}

/**
 * Find bifurcation candidates. Planted/known points are refined first; a
 * numerical scan then adds generic fold points and low-|f_x| branch points.
 */
export function detectBifurcations(family, options = {}) {
  const xMin = options.xMin ?? family.xRange[0];
  const xMax = options.xMax ?? family.xRange[1];
  const rMin = options.rMin ?? family.rRange[0];
  const rMax = options.rMax ?? family.rRange[1];
  const bounds = { xMin, xMax, rMin, rMax };
  const rSamples = Math.max(24, Math.floor(options.rSamples || 96));
  const seeds = (family.knownCandidates || [])
    .filter((candidate) => candidate.x >= xMin && candidate.x <= xMax && candidate.r >= rMin && candidate.r <= rMax)
    .map((candidate) => ({ ...candidate }));
  const rStep = (rMax - rMin) / rSamples;

  // Along each r-slice, extrema of f are possible fold points. Track sign
  // changes of f evaluated at those extrema to seed the two-variable solve.
  let previousExtrema = [];
  for (let rIndex = 0; rIndex <= rSamples; rIndex += 1) {
    const r = rMin + rIndex * rStep;
    const derivativeFn = (x) => partialDerivative(family, x, r, 1, 0);
    const extrema = scanSignChangeRoots(derivativeFn, xMin, xMax, 160, 1e-8)
      .map((x) => ({ x, r, value: evaluateFamily(family, x, r) }));
    for (const extremum of extrema) {
      if (Math.abs(extremum.value) < 2e-3) seeds.push(extremum);
      let nearest = null;
      for (const previous of previousExtrema) {
        const distance = Math.abs(previous.x - extremum.x);
        if (!nearest || distance < nearest.distance) nearest = { point: previous, distance };
      }
      if (nearest && nearest.distance < (xMax - xMin) * 0.08 && nearest.point.value * extremum.value < 0) {
        seeds.push({ x: (nearest.point.x + extremum.x) / 2, r: (nearest.point.r + r) / 2 });
      }
    }
    previousExtrema = extrema;
  }

  const refined = [];
  for (const seed of seeds) {
    // Known points are already exact and should not drift along a degenerate
    // zero set under the regularized solve.
    const seedF = evaluateFamily(family, seed.x, seed.r);
    const seedFx = partialDerivative(family, seed.x, seed.r, 1, 0);
    const point = Math.hypot(seedF, seedFx) < 1e-8
      ? { x: seed.x, r: seed.r, residual: Math.hypot(seedF, seedFx), derivatives: derivativesAt(family, seed.x, seed.r) }
      : refineBifurcationCandidate(family, seed, bounds, options);
    if (point.residual > (options.maximumResidual || 2e-5)) continue;
    if (refined.some((other) => Math.abs(other.x - point.x) < 2e-3 && Math.abs(other.r - point.r) < 2e-3)) continue;
    refined.push(point);
  }

  return refined
    .map((candidate) => classifyCandidate(family, candidate, options))
    .sort((left, right) => left.r - right.r || left.x - right.x);
}

/** Sample equilibrium branches for the classical bifurcation diagram. */
export function sampleBifurcation(
  family,
  rMin = family.rRange[0],
  rMax = family.rRange[1],
  xMin = family.xRange[0],
  xMax = family.xRange[1],
  options = {}
) {
  if (typeof rMin === "object") {
    options = rMin;
    rMin = options.rMin ?? family.rRange[0];
    rMax = options.rMax ?? family.rRange[1];
    xMin = options.xMin ?? family.xRange[0];
    xMax = options.xMax ?? family.xRange[1];
  }
  const rSamples = Math.max(8, Math.floor(options.rSamples || 201));
  const slices = [];
  const points = [];
  for (let index = 0; index < rSamples; index += 1) {
    const r = rSamples === 1 ? rMin : rMin + (rMax - rMin) * index / (rSamples - 1);
    const equilibria = findEquilibria(family, r, xMin, xMax, {
      ...options,
      samples: options.xSamples || options.samples || 480
    });
    const slice = Object.freeze({ r, equilibria: Object.freeze(equilibria) });
    slices.push(slice);
    points.push(...equilibria);
  }
  const branches = connectBranches(slices, xMax - xMin, (rMax - rMin) / Math.max(1, rSamples - 1));
  const candidates = options.detectCandidates === false
    ? []
    : detectBifurcations(family, { ...options, xMin, xMax, rMin, rMax });
  return Object.freeze({
    familyId: family.id,
    ranges: Object.freeze({ rMin, rMax, xMin, xMax }),
    slices: Object.freeze(slices),
    points: Object.freeze(points),
    branches: Object.freeze(branches),
    candidates: Object.freeze(candidates)
  });
}

/**
 * Taylor data in u = x-x0 and mu = r-r0. Coefficients already include the
 * factorial denominator, so they can be evaluated directly as a polynomial.
 */
export function taylorData(family, candidate, options = {}) {
  const x0 = Number(candidate.x);
  const r0 = Number(candidate.r);
  const degree = clamp(Math.floor(options.degree || 3), 1, 4);
  const classification = classifyCandidate(family, candidate, options);
  const coefficients = [];
  for (let totalOrder = 0; totalOrder <= degree; totalOrder += 1) {
    for (let xOrder = totalOrder; xOrder >= 0; xOrder -= 1) {
      const rOrder = totalOrder - xOrder;
      const derivative = partialDerivative(family, x0, r0, xOrder, rOrder, options);
      const value = derivative / (FACTORIALS[xOrder] * FACTORIALS[rOrder]);
      coefficients.push(Object.freeze({
        xOrder,
        rOrder,
        derivative,
        value,
        normalFormTerm: classification.normalFormTerms.some(
          (term) => term[0] === xOrder && term[1] === rOrder
        )
      }));
    }
  }
  return Object.freeze({
    familyId: family.id,
    center: Object.freeze({ x: x0, r: r0 }),
    degree,
    coefficients: Object.freeze(coefficients),
    classification,
    fullTaylorLabel: `Full degree-${degree} Taylor polynomial`,
    normalFormLabel: "Leading normal-form terms after local translation",
    normalForm: classification.normalForm,
    distinction: "The Taylor polynomial retains every computed term through the selected degree; the normal form highlights only the leading terms that determine the local bifurcation type."
  });
}

export function taylorEvaluate(data, x, r) {
  const u = x - data.center.x;
  const mu = r - data.center.r;
  let total = 0;
  for (const coefficient of data.coefficients) {
    total += coefficient.value * u ** coefficient.xOrder * mu ** coefficient.rOrder;
  }
  return total;
}

/** One fixed-parameter fourth-order Runge–Kutta step for x-dot = f(x,r). */
export function rk4Step(family, x, r, dt) {
  assertFinite(x, "x");
  assertFinite(r, "r");
  assertFinite(dt, "dt");
  const k1 = evaluateFamily(family, x, r);
  const k2 = evaluateFamily(family, x + dt * k1 / 2, r);
  const k3 = evaluateFamily(family, x + dt * k2 / 2, r);
  const k4 = evaluateFamily(family, x + dt * k3, r);
  return x + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
}

/** Integrate a trajectory until duration, bounds exit, or non-finite escape. */
export function integrateTrajectory(family, options = {}) {
  const rSource = options.r ?? family.defaultR;
  const rAt = typeof rSource === "function" ? rSource : () => Number(rSource);
  const dt = Number(options.dt ?? 0.02);
  const duration = Math.abs(Number(options.duration ?? 8));
  const direction = dt < 0 ? -1 : 1;
  const maximumSteps = Math.max(1, Math.floor(options.maximumSteps || 20000));
  const xMin = options.xMin ?? family.xRange[0];
  const xMax = options.xMax ?? family.xRange[1];
  let x = Number(options.x0 ?? 0);
  let t = Number(options.t0 ?? 0);
  let reason = "duration";
  const points = [{ t, x, r: rAt(t) }];

  for (let step = 0; step < maximumSteps && Math.abs(t - points[0].t) < duration; step += 1) {
    const remaining = duration - Math.abs(t - points[0].t);
    const stepSize = direction * Math.min(Math.abs(dt), remaining);
    const r = rAt(t);
    if (typeof rSource === "function") {
      // Nonautonomous RK4 with r sampled at the corresponding stage times.
      const k1 = evaluateFamily(family, x, rAt(t));
      const k2 = evaluateFamily(family, x + stepSize * k1 / 2, rAt(t + stepSize / 2));
      const k3 = evaluateFamily(family, x + stepSize * k2 / 2, rAt(t + stepSize / 2));
      const k4 = evaluateFamily(family, x + stepSize * k3, rAt(t + stepSize));
      x += stepSize * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
    } else x = rk4Step(family, x, r, stepSize);
    t += stepSize;
    points.push({ t, x, r: rAt(t) });
    if (!Number.isFinite(x)) {
      reason = "non-finite";
      break;
    }
    if (x < xMin || x > xMax) {
      reason = "bounds";
      break;
    }
    if (step === maximumSteps - 1) reason = "step-limit";
  }

  return Object.freeze({
    points: Object.freeze(points.map((point) => Object.freeze(point))),
    reason,
    final: Object.freeze(points[points.length - 1])
  });
}

export default Object.freeze({
  PRESET_IDS,
  PRESETS,
  hashSeed,
  createRng,
  createFamily,
  createRandomFamily,
  evaluateFamily,
  partialDerivative,
  derivativesAt,
  findEquilibria,
  sampleBifurcation,
  detectBifurcations,
  classifyCandidate,
  taylorData,
  taylorEvaluate,
  rk4Step,
  integrateTrajectory
});
