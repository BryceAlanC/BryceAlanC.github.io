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
  const width = maximum - minimum;
  if (!(width > 0) || !Number.isFinite(width)) {
    throw new RangeError(`${label} must have finite positive width`);
  }
  return Object.freeze([minimum, maximum]);
}

function freezeCandidate(candidate) {
  return Object.freeze({
    x: Number(candidate.x),
    r: Number(candidate.r),
    type: candidate.type || "unknown",
    label: candidate.label || candidate.type || "Candidate",
    branchCount: Number.isInteger(candidate.branchCount) ? candidate.branchCount : null,
    nongeneric: Boolean(candidate.nongeneric)
  });
}

function makeFamily(definition) {
  if (!definition || typeof definition.eval !== "function") {
    throw new TypeError("A family requires an eval(x, r) function");
  }

  const unfolding = definition.unfolding && typeof definition.unfolding === "object"
    ? Object.freeze({
      alpha: Number(definition.unfolding.alpha) || 0,
      beta: Number(definition.unfolding.beta) || 0,
      couplingSign: Number(definition.unfolding.couplingSign) < 0 ? -1 : 1,
      cubicSign: Number(definition.unfolding.cubicSign) < 0 ? -1 : 1,
      timeSign: Number(definition.unfolding.timeSign) < 0 ? -1 : 1,
      caseId: String(definition.unfolding.caseId || "custom"),
      caseLabel: String(definition.unfolding.caseLabel || "Custom unfolding")
    })
    : null;

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
    supportsImperfection: Boolean(definition.supportsImperfection),
    supportsUnfolding: Boolean(definition.supportsUnfolding),
    imperfection: Number.isFinite(definition.imperfection) ? definition.imperfection : 0,
    unfolding,
    branchCount: Number.isInteger(definition.branchCount) ? definition.branchCount : null,
    branchSlopes: Object.freeze(Array.isArray(definition.branchSlopes)
      ? definition.branchSlopes.map(Number)
      : []),
    nongeneric: Boolean(definition.nongeneric),
    seed: definition.seed == null ? null : String(definition.seed),
    sourceType: definition.sourceType || "preset",
    expression: definition.expression == null ? null : String(definition.expression),
    expressionUsesParameter: definition.expressionUsesParameter == null
      ? null
      : Boolean(definition.expressionUsesParameter),
    knownCandidates: Object.freeze((definition.knownCandidates || []).map(freezeCandidate)),
    eval: definition.eval
  });
}

const MIN_BRANCH_COUNT = 3;
const MAX_BRANCH_COUNT = 9;

function normalizeBranchCount(value, fallback = 5) {
  const numeric = Number(value);
  const count = Number.isFinite(numeric) ? Math.round(numeric) : fallback;
  return clamp(count, MIN_BRANCH_COUNT, MAX_BRANCH_COUNT);
}

/**
 * An exact n-branch crossing made from a product of n linear factors. It is a
 * perfectly valid analytic scalar family, but the simultaneous meeting is a
 * high-codimension degeneracy and therefore splits under generic perturbation.
 */
function createNFoldDefinition(branchCount = 5, options = {}) {
  const n = normalizeBranchCount(branchCount);
  const slopes = Object.freeze(Array.from(
    { length: n },
    (_, index) => -1.2 + 2.4 * index / (n - 1)
  ));
  const scale = 2 ** (2 - n);
  const candidateType = options.candidateType || "n-fold";
  const name = options.name || `${n}-fold branch crossing`;

  return {
    id: options.id || "n-fold",
    name,
    shortName: options.shortName || name,
    formula: `ẋ = −${Number(scale.toPrecision(4))} ∏(x − aₖr),  k = 1,…,${n};  aₖ = −1.2 + 2.4(k−1)/(${n}−1)`,
    description: `Exactly ${n} equilibrium branches meet at the origin. This analytic example is deliberately nongeneric: a small generic perturbation splits the simultaneous crossing into lower-order events.`,
    xRange: [-2.2, 2.2],
    rRange: [-1.35, 1.35],
    defaultR: 0.75,
    branchCount: n,
    branchSlopes: slopes,
    nongeneric: true,
    knownCandidates: [{
      x: 0,
      r: 0,
      type: candidateType,
      branchCount: n,
      nongeneric: true,
      label: `${n}-fold branch crossing`
    }],
    eval(x, r) {
      let product = 1;
      for (const slope of slopes) product *= x - slope * r;
      return -scale * product;
    }
  };
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
    supportsImperfection: true,
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
    supportsImperfection: true,
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
  "four-fold": createNFoldDefinition(4, {
    id: "four-fold",
    name: "Four-fold branch crossing",
    shortName: "Four-fold",
    candidateType: "four-fold"
  }),
  "n-fold": createNFoldDefinition(5, {
    id: "n-fold",
    name: "Adjustable n-fold crossing",
    shortName: "n-fold",
    candidateType: "n-fold"
  }),
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

function normalizeImperfection(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSign(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return fallback < 0 ? -1 : 1;
  return numeric < 0 ? -1 : 1;
}

function compactNumber(value, digits = 5) {
  const clean = Math.abs(value) < 10 ** (-(digits + 1)) ? 0 : value;
  return String(Number(clean.toFixed(digits))).replace("-", "−");
}

function unfoldingCase(alpha, beta) {
  const scale = Math.max(1, Math.abs(alpha), Math.abs(beta) ** 3);
  const tolerance = 2e-8 * scale;
  if (Math.abs(alpha) <= tolerance && Math.abs(beta) <= tolerance) {
    return { id: "perfect", label: "Perfect pitchfork" };
  }
  if (Math.abs(alpha) <= tolerance && Math.abs(beta) > tolerance) {
    return { id: "transcritical-fold", label: "Transcritical crossing + saddle-node" };
  }
  if (Math.abs(beta) > tolerance) {
    const boundary = beta ** 3 / 27;
    if (Math.abs(alpha - boundary) <= tolerance) {
      return { id: "triple-boundary", label: "Saddle-node + triple-root passage" };
    }
    const ratio = alpha / (beta ** 3);
    if (ratio > 0 && ratio < 1 / 27) {
      return { id: "three-folds", label: "Three saddle-nodes" };
    }
  }
  if (Math.abs(beta) <= tolerance) {
    return { id: "additive", label: "Additive bias · one saddle-node" };
  }
  return { id: "one-fold", label: "One saddle-node + continuing branch" };
}

function formatUnfoldingExpression(alpha, beta, couplingSign, cubicSign) {
  const terms = [
    { coefficient: alpha, symbol: "" },
    { coefficient: beta, symbol: "x²" },
    { coefficient: couplingSign, symbol: "rx" },
    { coefficient: cubicSign, symbol: "x³" }
  ].filter((term, index) => index >= 2 || Math.abs(term.coefficient) > 1e-12);
  let expression = "";
  terms.forEach((term, index) => {
    const magnitude = Math.abs(term.coefficient);
    const coefficient = term.symbol && Math.abs(magnitude - 1) < 1e-12
      ? ""
      : compactNumber(magnitude);
    const body = `${coefficient}${term.symbol}` || "0";
    if (index === 0) expression += term.coefficient < 0 ? `−${body}` : body;
    else expression += term.coefficient < 0 ? ` − ${body}` : ` + ${body}`;
  });
  return expression || "0";
}

function pitchforkFoldRoots(alpha, beta, cubicSign) {
  const polynomial = (x) => alpha - beta * x * x - 2 * cubicSign * x * x * x;
  const bound = 1 + Math.max(Math.abs(beta) / 2, Math.abs(alpha) / 2);
  const critical = uniqueSorted([-bound, 0, -beta / (3 * cubicSign), bound], 1e-12);
  const tolerance = 2e-11 * Math.max(1, Math.abs(alpha), Math.abs(beta));
  const roots = [];
  for (const point of critical) {
    if (Math.abs(polynomial(point)) <= tolerance) roots.push(point);
  }
  for (let index = 1; index < critical.length; index += 1) {
    const left = critical[index - 1];
    const right = critical[index];
    const leftValue = polynomial(left);
    const rightValue = polynomial(right);
    if (leftValue * rightValue < 0) {
      const root = bisectRoot(polynomial, left, right, tolerance, 100);
      if (root != null) roots.push(root);
    }
  }
  return uniqueSorted(roots, 2e-7);
}

function createPitchforkDefinition(id, options = {}) {
  const fallbackCubic = id === "subcritical-pitchfork" ? 1 : -1;
  const legacyImperfection = options.imperfection;
  const alpha = normalizeImperfection(options.alpha ?? legacyImperfection ?? 0);
  const beta = normalizeImperfection(options.beta ?? 0);
  const couplingSign = normalizeSign(options.couplingSign, 1);
  const cubicSign = normalizeSign(options.cubicSign, fallbackCubic);
  const timeSign = normalizeSign(options.timeSign, 1);
  const caseData = unfoldingCase(alpha, beta);
  const roots = pitchforkFoldRoots(alpha, beta, cubicSign);
  const scale = Math.max(1, Math.abs(beta));
  const specialTolerance = 3e-6 * scale;
  const perfectType = couplingSign * cubicSign < 0
    ? "supercritical-pitchfork"
    : "subcritical-pitchfork";
  const tripleX = -beta / (3 * cubicSign);
  const knownCandidates = roots.map((x) => {
    const r = -couplingSign * (2 * beta * x + 3 * cubicSign * x * x);
    let type = "saddle-node";
    let label = "Saddle-node";
    if (caseData.id === "perfect" && Math.abs(x) <= specialTolerance) {
      type = perfectType;
      label = perfectType === "supercritical-pitchfork"
        ? "Supercritical pitchfork"
        : "Subcritical pitchfork";
    } else if (caseData.id === "transcritical-fold" && Math.abs(x) <= specialTolerance) {
      type = "transcritical";
      label = "Transcritical crossing";
    } else if (caseData.id === "triple-boundary" && Math.abs(x - tripleX) <= specialTolerance) {
      type = "triple-root-passage";
      label = "Degenerate triple-root passage";
    }
    return { x, r, type, label };
  });
  const maximumCandidateX = knownCandidates.reduce((maximum, point) => Math.max(maximum, Math.abs(point.x)), 0);
  const maximumCandidateR = knownCandidates.reduce((maximum, point) => Math.max(maximum, Math.abs(point.r)), 0);
  const xLimit = Math.max(2.2, maximumCandidateX + 0.8);
  const rLimit = Math.max(2.2, maximumCandidateR + 0.8);
  const inner = formatUnfoldingExpression(alpha, beta, couplingSign, cubicSign);
  const formula = timeSign < 0 ? `ẋ = −(${inner})` : `ẋ = ${inner}`;

  return {
    id: "pitchfork-unfolding",
    name: "Pitchfork universal unfolding",
    shortName: caseData.label,
    formula,
    description: `The cubic universal unfolding with independent constant and quadratic imperfections. Current slice: ${caseData.label.toLowerCase()}.`,
    xRange: [-xLimit, xLimit],
    rRange: [-rLimit, rLimit],
    defaultR: 0,
    supportsImperfection: true,
    supportsUnfolding: true,
    imperfection: alpha,
    unfolding: {
      alpha,
      beta,
      couplingSign,
      cubicSign,
      timeSign,
      caseId: caseData.id,
      caseLabel: caseData.label
    },
    knownCandidates,
    eval(x, r) {
      return timeSign * (
        alpha
        + beta * x * x
        + couplingSign * r * x
        + cubicSign * x * x * x
      );
    }
  };
}

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
      supportsHysteresis: family.supportsHysteresis,
      supportsImperfection: family.supportsImperfection,
      supportsUnfolding: family.supportsUnfolding,
      imperfection: family.imperfection,
      branchCount: family.branchCount,
      nongeneric: family.nongeneric
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
  subcritical: "subcritical-pitchfork",
  unfolding: "pitchfork-unfolding",
  "pitchfork-universal-unfolding": "pitchfork-unfolding",
  fourfold: "four-fold",
  "four_fold": "four-fold",
  nfold: "n-fold",
  "n_fold": "n-fold"
});

const RANDOM_FAMILY_KINDS = Object.freeze([
  "saddle-node",
  "transcritical",
  "supercritical-pitchfork",
  "subcritical-pitchfork"
]);

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

function polynomialFromRoots(roots) {
  let coefficients = [1];
  for (const root of roots) {
    const next = Array(coefficients.length + 1).fill(0);
    coefficients.forEach((coefficient, index) => {
      next[index] -= root * coefficient;
      next[index + 1] += coefficient;
    });
    coefficients = next;
  }
  return coefficients;
}

function integratePolynomial(coefficients) {
  return [0, ...coefficients.map((coefficient, index) => coefficient / (index + 1))];
}

function evaluatePolynomial(coefficients, value) {
  let total = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    total = total * value + coefficients[index];
  }
  return total;
}

/**
 * Build a reproducible analytic family. Every generated family contains a
 * planted codimension-one bifurcation, plus small polynomial, trigonometric,
 * exponential, and logarithmic perturbations that preserve its local type.
 */
function createLocalRandomFamily(seed = "bifurcation", options = {}) {
  const random = createRng(seed);
  const randomKinds = RANDOM_FAMILY_KINDS;
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
    id: `random-${hashSeed(`${seed}|local|${kind}|${x0}|${r0}`).toString(16).padStart(8, "0")}`,
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

/**
 * Build a globally richer generic family. Its equilibrium set is one analytic
 * snake r = g(x) with three to six planted ordinary folds. The positive speed
 * factor changes the flow without changing the equilibrium geometry.
 */
function createRandomLandscapeFamily(seed = "bifurcation", options = {}) {
  const random = createRng(seed);
  const requestedCount = Math.round(Number(options.foldCount));
  const foldCount = Number.isFinite(requestedCount)
    ? clamp(requestedCount, 3, 6)
    : 3 + Math.floor(random() * 4);
  const centerX = Number.isFinite(options.x0) ? Number(options.x0) : randomBetween(random, -0.25, 0.25);
  const centerR = Number.isFinite(options.r0) ? Number(options.r0) : randomBetween(random, -0.2, 0.2);
  const halfWidth = 1.62;
  const spacing = 2 * halfWidth / Math.max(1, foldCount - 1);
  const foldXs = Array.from({ length: foldCount }, (_, index) => {
    const base = centerX - halfWidth + spacing * index;
    const jitter = randomBetween(random, -0.07, 0.07) * spacing;
    return base + jitter;
  }).sort((left, right) => left - right);
  const derivativePolynomial = polynomialFromRoots(foldXs);
  const antiderivativePolynomial = integratePolynomial(derivativePolynomial);
  const rawCriticalValues = foldXs.map((x) => evaluatePolynomial(antiderivativePolynomial, x));
  const rawMinimum = Math.min(...rawCriticalValues);
  const rawMaximum = Math.max(...rawCriticalValues);
  const rawMidpoint = (rawMinimum + rawMaximum) / 2;
  const orientation = randomSign(random);
  const geometryScale = orientation * 2.7 / Math.max(1e-9, rawMaximum - rawMinimum);
  const gain = randomBetween(random, 0.35, 0.55);
  const sineWeight = randomBetween(random, 0.1, 0.28);
  const sineFrequency = randomBetween(random, 0.75, 1.25);
  const sinePhase = randomBetween(random, -Math.PI, Math.PI);
  const logWeight = randomBetween(random, 0.04, 0.12);
  const logRate = randomBetween(random, 0.25, 0.5);

  const equilibriumCurve = (x) => centerR + geometryScale * (
    evaluatePolynomial(antiderivativePolynomial, x) - rawMidpoint
  );
  const speedFactor = (x, r) => gain
    * Math.exp(sineWeight * Math.sin(sineFrequency * x + sinePhase))
    * (1 + logWeight * Math.log1p(logRate * (r - centerR) ** 2));
  const knownCandidates = foldXs.map((x, index) => ({
    x,
    r: equilibriumCurve(x),
    type: "saddle-node",
    label: `Fold ${index + 1}`
  }));
  const foldList = foldXs.map((value) => compactNumber(value, 3)).join(", ");
  const scaleText = String(Number(geometryScale.toPrecision(4))).replace("-", "−");
  const formula = `ẋ = M(x,r)[r − g(x)],  g(x) = ${compactNumber(centerR, 3)} + ${scaleText}∫₀ˣ∏(s−qⱼ)ds, `
    + `q = (${foldList});  M = ${gain.toFixed(2)}exp(${sineWeight.toFixed(2)}sin(${sineFrequency.toFixed(2)}x ${sinePhase < 0 ? "−" : "+"} ${Math.abs(sinePhase).toFixed(2)}))`
    + `[1 + ${logWeight.toFixed(2)}ln(1 + ${logRate.toFixed(2)}(r−${compactNumber(centerR, 3)})²)]`;

  return makeFamily({
    id: `random-${hashSeed(`${seed}|landscape|${foldCount}|${foldXs.join(",")}`).toString(16).padStart(8, "0")}`,
    name: `Random analytic landscape · ${foldCount} folds`,
    shortName: `Random · ${foldCount} folds`,
    description: `A seeded analytic family with ${foldCount} distinct generic saddle-node bifurcations in the displayed window.`,
    formula,
    xRange: options.xRange || [foldXs[0] - 0.22, foldXs[foldXs.length - 1] + 0.22],
    rRange: options.rRange || [centerR - 1.72, centerR + 1.72],
    defaultR: centerR,
    seed,
    sourceType: "random",
    knownCandidates,
    eval(x, r) {
      return speedFactor(x, r) * (r - equilibriumCurve(x));
    }
  });
}

export function createRandomFamily(seed = "bifurcation", options = {}) {
  if (options.mode === "local" || options.kind || options.kinds) {
    return createLocalRandomFamily(seed, options);
  }
  return createRandomLandscapeFamily(seed, options);
}

const EXPRESSION_FUNCTIONS = Object.freeze({
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log1p: Math.log1p,
  sqrt: Math.sqrt,
  abs: Math.abs
});

const SUPERSCRIPT_DIGITS = Object.freeze({
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9"
});

function expressionSyntaxError(message, position = 0) {
  return new SyntaxError(`${message} at character ${Math.max(0, position) + 1}.`);
}

function normalizeExpressionSource(source) {
  const text = String(source ?? "").trim();
  if (!text) throw expressionSyntaxError("Enter a right-hand side for f(x, r)", 0);
  if (text.length > 256) throw new RangeError("The equation is too long; use at most 256 characters.");
  return text
    .replace(/\*\*/g, "^")
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPT_DIGITS[digit]).join("")}`);
}

function tokenizeExpression(source) {
  const tokens = [];
  let index = 0;
  const push = (type, value, position = index) => {
    tokens.push(Object.freeze({ type, value, position }));
    if (tokens.length > 160) throw new RangeError("The equation has too many terms; simplify it and try again.");
  };
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    const position = index;
    const numberMatch = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) throw expressionSyntaxError("Numeric literal must be finite", position);
      push("number", value, position);
      index += numberMatch[0].length;
      continue;
    }
    const nameMatch = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (nameMatch) {
      const name = nameMatch[0].toLowerCase();
      if (/^[xr]{2,}$/.test(name)) {
        [...name].forEach((variable, offset) => push("name", variable, position + offset));
      } else push("name", name, position);
      index += nameMatch[0].length;
      continue;
    }
    const character = source[index];
    if ("+-*/^".includes(character)) push("operator", character, position);
    else if (character === "(") push("left", character, position);
    else if (character === ")") push("right", character, position);
    else throw expressionSyntaxError(`Unsupported character “${character}”`, position);
    index += 1;
  }
  tokens.push(Object.freeze({ type: "end", value: "", position: source.length }));
  return tokens;
}

function parseExpressionTokens(tokens) {
  let cursor = 0;
  let nodeCount = 0;
  let nesting = 0;
  const variables = new Set();
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const makeNode = (node) => {
    nodeCount += 1;
    if (nodeCount > 96) throw new RangeError("The equation is too complex; use at most 96 operations and values.");
    return Object.freeze(node);
  };
  const enterNesting = (token) => {
    nesting += 1;
    if (nesting > 24) throw expressionSyntaxError("Parentheses are nested too deeply", token.position);
  };
  const leaveNesting = () => { nesting -= 1; };
  const expectRight = () => {
    if (peek().type !== "right") throw expressionSyntaxError("Expected a closing parenthesis", peek().position);
    consume();
  };
  const beginsImplicitFactor = (token) => token.type === "number" || token.type === "name" || token.type === "left";

  let parseAdditive;
  let parseUnary;

  const parsePrimary = () => {
    const token = peek();
    if (token.type === "number") {
      consume();
      return makeNode({ type: "number", value: token.value });
    }
    if (token.type === "name") {
      consume();
      if (token.value === "x" || token.value === "r") {
        variables.add(token.value);
        return makeNode({ type: "variable", name: token.value });
      }
      if (token.value === "pi" || token.value === "e") {
        return makeNode({ type: "number", value: token.value === "pi" ? Math.PI : Math.E });
      }
      if (!Object.prototype.hasOwnProperty.call(EXPRESSION_FUNCTIONS, token.value)) {
        throw expressionSyntaxError(`Unknown name “${token.value}”; use only x, r, pi, e, or a supported function`, token.position);
      }
      if (peek().type !== "left") {
        throw expressionSyntaxError(`Function “${token.value}” needs parentheses`, peek().position);
      }
      const left = consume();
      enterNesting(left);
      const argument = parseAdditive();
      expectRight();
      leaveNesting();
      return makeNode({ type: "function", name: token.value, argument });
    }
    if (token.type === "left") {
      consume();
      enterNesting(token);
      const expression = parseAdditive();
      expectRight();
      leaveNesting();
      return expression;
    }
    throw expressionSyntaxError("Expected a number, x, r, a function, or an opening parenthesis", token.position);
  };

  const parsePower = () => {
    const base = parsePrimary();
    if (peek().type === "operator" && peek().value === "^") {
      consume();
      return makeNode({ type: "binary", operator: "^", left: base, right: parseUnary() });
    }
    return base;
  };

  parseUnary = () => {
    const token = peek();
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      consume();
      return makeNode({ type: "unary", operator: token.value, argument: parseUnary() });
    }
    return parsePower();
  };

  const parseMultiplicative = () => {
    let left = parseUnary();
    while (true) {
      const token = peek();
      if (token.type === "operator" && (token.value === "*" || token.value === "/")) {
        consume();
        left = makeNode({ type: "binary", operator: token.value, left, right: parseUnary() });
      } else if (beginsImplicitFactor(token)) {
        if (token.type === "number") {
          throw expressionSyntaxError("Adjacent numbers need an operator", token.position);
        }
        left = makeNode({ type: "binary", operator: "*", left, right: parseUnary() });
      } else break;
    }
    return left;
  };

  parseAdditive = () => {
    let left = parseMultiplicative();
    while (peek().type === "operator" && (peek().value === "+" || peek().value === "-")) {
      const operator = consume().value;
      left = makeNode({ type: "binary", operator, left, right: parseMultiplicative() });
    }
    return left;
  };

  const ast = parseAdditive();
  if (peek().type !== "end") throw expressionSyntaxError(`Unexpected “${peek().value}”`, peek().position);
  return Object.freeze({ ast, variables: Object.freeze([...variables]) });
}

function evaluateExpressionNode(node, x, r) {
  if (node.type === "number") return node.value;
  if (node.type === "variable") return node.name === "x" ? x : r;
  if (node.type === "unary") {
    const value = evaluateExpressionNode(node.argument, x, r);
    return node.operator === "-" ? -value : value;
  }
  if (node.type === "function") {
    return EXPRESSION_FUNCTIONS[node.name](evaluateExpressionNode(node.argument, x, r));
  }
  const left = evaluateExpressionNode(node.left, x, r);
  const right = evaluateExpressionNode(node.right, x, r);
  if (node.operator === "+") return left + right;
  if (node.operator === "-") return left - right;
  if (node.operator === "*") return left * right;
  if (node.operator === "/") return left / right;
  return left ** right;
}

/** Compile a bounded mathematical expression without evaluating JavaScript. */
export function compileExpression(source) {
  const normalized = normalizeExpressionSource(source);
  const parsed = parseExpressionTokens(tokenizeExpression(normalized));
  const variableSet = new Set(parsed.variables);
  return Object.freeze({
    source: String(source).trim(),
    canonical: normalized,
    variables: parsed.variables,
    usesX: variableSet.has("x"),
    usesR: variableSet.has("r"),
    evaluate(x, r) {
      try {
        const value = evaluateExpressionNode(parsed.ast, Number(x), Number(r));
        return Number.isFinite(value) && Math.abs(value) <= 1e100 ? value : Number.NaN;
      } catch {
        return Number.NaN;
      }
    }
  });
}

/** Turn a user-authored expression into the same immutable family contract. */
export function createCustomFamily(expression, options = {}) {
  const compiled = compileExpression(expression);
  if (!compiled.usesX) {
    throw new RangeError("The equation must depend on x so its equilibria are isolated points rather than whole state lines.");
  }
  const xRange = normalizeRange(options.xRange, [-3, 3], "xRange");
  const rRange = normalizeRange(options.rRange, [-2, 2], "rRange");
  const rows = [];
  const magnitudes = [];
  let finiteCount = 0;
  let variesWithState = false;
  const sampleCount = 13;
  for (let rIndex = 0; rIndex < sampleCount; rIndex += 1) {
    const r = rRange[0] + (rRange[1] - rRange[0]) * rIndex / (sampleCount - 1);
    const row = [];
    for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * xIndex / (sampleCount - 1);
      const value = compiled.evaluate(x, r);
      row.push(value);
      if (Number.isFinite(value)) {
        finiteCount += 1;
        magnitudes.push(Math.abs(value));
      }
    }
    const finite = row.filter(Number.isFinite);
    if (finite.length >= 3) {
      const rowMinimum = Math.min(...finite);
      const rowMaximum = Math.max(...finite);
      const rowScale = Math.max(1, Math.abs(rowMinimum), Math.abs(rowMaximum));
      if (rowMaximum - rowMinimum > 1e-10 * rowScale) variesWithState = true;
    }
    rows.push(row);
  }
  if (finiteCount < Math.ceil(sampleCount * sampleCount * 0.25)) {
    throw new RangeError("The equation is undefined across too much of the selected window. Narrow the window or revise the expression.");
  }
  const upperMagnitude = Math.max(...magnitudes, 0);
  if (upperMagnitude > 1e12) {
    throw new RangeError("The equation becomes too large in the selected window. Narrow the window or revise the expression.");
  }
  if (!variesWithState) {
    throw new RangeError("The equation must genuinely vary with x in the selected window so its equilibria are isolated points.");
  }
  if (rows.some((row) => {
    const finite = row.filter(Number.isFinite);
    if (finite.length < Math.ceil(sampleCount * 0.75)) return false;
    const rowMagnitude = Math.max(...finite.map(Math.abs), 0);
    const zeroTolerance = 1e-10 * Math.max(1, rowMagnitude);
    return finite.every((value) => Math.abs(value) <= zeroTolerance);
  })) {
    throw new RangeError("At one parameter value, the equation makes every visible state an equilibrium. This viewer currently requires isolated equilibria.");
  }
  const defaultR = 0 >= rRange[0] && 0 <= rRange[1]
    ? 0
    : rRange[0] + (rRange[1] - rRange[0]) / 2;
  return makeFamily({
    id: `custom-${hashSeed(`${compiled.canonical}|${xRange.join(",")}|${rRange.join(",")}`).toString(16).padStart(8, "0")}`,
    name: "Custom equation",
    shortName: "Custom equation",
    formula: `ẋ = ${compiled.source}`,
    description: compiled.usesR
      ? "A user-authored scalar family evaluated by the restricted mathematical expression parser."
      : "A user-authored autonomous flow with no parameter r in its expression.",
    xRange,
    rRange,
    defaultR,
    sourceType: "custom",
    expression: compiled.source,
    expressionUsesParameter: compiled.usesR,
    knownCandidates: [],
    eval: compiled.evaluate
  });
}

/** Create one of the named presets, or a seeded random family. */
export function createFamily(id = "saddle-node", seed = "bifurcation", options = {}) {
  const normalizedId = FAMILY_ALIASES[id] || id;
  if (normalizedId === "random" || normalizedId === "random-analytic") {
    return createRandomFamily(seed, options);
  }
  if (normalizedId === "n-fold") {
    return makeFamily(createNFoldDefinition(options.branchCount, {
      id: "n-fold",
      candidateType: "n-fold"
    }));
  }
  if (normalizedId === "custom") {
    return createCustomFamily(options.expression, options);
  }
  if (
    normalizedId === "pitchfork-unfolding"
    || normalizedId === "supercritical-pitchfork"
    || normalizedId === "subcritical-pitchfork"
  ) {
    return makeFamily(createPitchforkDefinition(normalizedId, options));
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
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const value = evaluateFamily(family, x, r);
    if (!Number.isFinite(value)) break;
    const derivative = partialDerivative(family, x, r, 1, 0);
    if (Math.abs(value) <= tolerance && Math.abs(derivative) >= Math.sqrt(tolerance)) break;
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
  if (family.nongeneric && Array.isArray(family.branchSlopes) && family.branchSlopes.length) {
    const dedupeTolerance = options.dedupeTolerance || Math.max(1e-13, (xMax - xMin) * 1e-12);
    const roots = uniqueSorted(
      family.branchSlopes.map((slope) => slope * r).filter((x) => x >= xMin && x <= xMax),
      dedupeTolerance
    );
    return roots.map((x) => Object.freeze({
      x,
      r,
      residual: evaluateFamily(family, x, r),
      ...stabilityAt(family, x, r, xMin, xMax, options)
    }));
  }
  const samples = Math.max(40, Math.floor(options.samples || 720));
  const span = xMax - xMin;
  const sampledMagnitudes = [];
  for (let index = 0; index <= Math.min(samples, 160); index += 1) {
    const value = evaluateFamily(family, xMin + span * index / Math.min(samples, 160), r);
    if (Number.isFinite(value)) sampledMagnitudes.push(Math.abs(value));
  }
  sampledMagnitudes.sort((left, right) => left - right);
  const robustMagnitude = Math.max(
    1,
    sampledMagnitudes[Math.floor(0.9 * Math.max(0, sampledMagnitudes.length - 1))] || 1
  );
  const valueTolerance = options.valueTolerance || 5e-11 * robustMagnitude;
  const tangentTolerance = options.tangentTolerance || 2e-7 * robustMagnitude;
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

function connectAnalyticMultifoldBranches(family, slices, bounds, options = {}) {
  const slopes = family.branchSlopes;
  const crossing = (family.knownCandidates || []).find((candidate) =>
    candidate.type === "four-fold" || candidate.type === "n-fold"
  ) || { x: 0, r: 0 };
  const xSpan = bounds.xMax - bounds.xMin;
  const matchingTolerance = Math.max(1e-11, xSpan * 1e-9);
  let crossingEquilibrium = null;

  if (
    crossing.r >= bounds.rMin && crossing.r <= bounds.rMax
    && crossing.x >= bounds.xMin && crossing.x <= bounds.xMax
  ) {
    crossingEquilibrium = findEquilibria(
      family,
      crossing.r,
      bounds.xMin,
      bounds.xMax,
      options
    ).find((equilibrium) => Math.abs(equilibrium.x - crossing.x) <= matchingTolerance) || null;
  }

  return slopes.map((slope, id) => {
    const branchPoints = [];
    for (const slice of slices) {
      const targetX = crossing.x + slope * (slice.r - crossing.r);
      if (targetX < bounds.xMin - matchingTolerance || targetX > bounds.xMax + matchingTolerance) continue;
      let nearest = null;
      for (const equilibrium of slice.equilibria) {
        const distance = Math.abs(equilibrium.x - targetX);
        if (!nearest || distance < nearest.distance) nearest = { equilibrium, distance };
      }
      if (nearest && nearest.distance <= matchingTolerance) branchPoints.push(nearest.equilibrium);
    }

    if (
      crossingEquilibrium
      && !branchPoints.some((point) => Math.abs(point.r - crossing.r) <= 1e-13)
    ) {
      branchPoints.push(crossingEquilibrium);
      branchPoints.sort((left, right) => left.r - right.r);
    }

    return Object.freeze({ id, points: Object.freeze(branchPoints) });
  });
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

function candidateTypeLabel(type, branchCount = null) {
  if (type === "n-fold" && Number.isInteger(branchCount)) return `${branchCount}-fold branch crossing`;
  return {
    "saddle-node": "Saddle-node",
    transcritical: "Transcritical",
    "supercritical-pitchfork": "Supercritical pitchfork",
    "subcritical-pitchfork": "Subcritical pitchfork",
    "triple-root-passage": "Degenerate triple-root passage",
    "four-fold": "Four-fold branch crossing",
    "n-fold": "n-fold branch crossing",
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
  const branchCount = Number.isInteger(candidate.branchCount)
    ? candidate.branchCount
    : Number.isInteger(matchingKnownCandidate?.branchCount)
      ? matchingKnownCandidate.branchCount
      : Number.isInteger(family.branchCount)
        ? family.branchCount
        : guaranteedType === "four-fold" ? 4 : null;
  const guaranteedPersistentBranch = guaranteedType === "transcritical";
  let type = "unknown";
  let normalForm = "No generic codimension-one normal form identified";
  let normalFormTerms = [];

  if (guaranteedType === "four-fold" || guaranteedType === "n-fold") {
    type = guaranteedType;
    normalForm = Number.isInteger(branchCount)
      ? `u̇ ≈ −C∏(u−aₖμ), k = 1,…,${branchCount}, with ${branchCount} equilibrium branches meeting at μ = 0`
      : "u̇ ≈ −C∏ₖ(u−aₖμ)";
    if (Number.isInteger(branchCount) && branchCount <= 4) {
      normalFormTerms = Array.from({ length: branchCount + 1 }, (_, rOrder) => [branchCount - rOrder, rOrder]);
    }
  } else if (
    guaranteedType === "triple-root-passage"
    || (
      Math.abs(derivatives.fr) > zeroTolerance
      && Math.abs(derivatives.fxx) <= zeroTolerance
      && Math.abs(derivatives.fxxx) > zeroTolerance
    )
  ) {
    type = "triple-root-passage";
    normalForm = "u̇ ≈ aμ + cμu + bu³";
    normalFormTerms = [[0, 1], [1, 1], [3, 0]];
  } else if (Math.abs(derivatives.fr) > zeroTolerance && Math.abs(derivatives.fxx) > zeroTolerance) {
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
    label: candidateTypeLabel(type, branchCount),
    branchCount,
    nongeneric: type === "four-fold" || type === "n-fold",
    classificationNote: type === "four-fold" || type === "n-fold"
      ? "This exact analytic branch crossing is a high-codimension, nongeneric degeneracy; a small generic perturbation splits it into lower-order events."
      : "",
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
  if (family.nongeneric && Number.isInteger(family.branchCount)) {
    return (family.knownCandidates || [])
      .filter((candidate) => candidate.x >= xMin && candidate.x <= xMax && candidate.r >= rMin && candidate.r <= rMax)
      .map((candidate) => classifyCandidate(family, candidate, options))
      .sort((left, right) => left.r - right.r || left.x - right.x);
  }
  const bounds = { xMin, xMax, rMin, rMax };
  const rSamples = Math.max(24, Math.floor(options.rSamples || 96));
  const seeds = (family.knownCandidates || [])
    .filter((candidate) => candidate.x >= xMin && candidate.x <= xMax && candidate.r >= rMin && candidate.r <= rMax)
    .map((candidate) => ({ ...candidate }));
  const rStep = (rMax - rMin) / rSamples;

  // Custom families have no planted events. Reuse the already sampled branch
  // derivatives when available: a sign change of f_x along an equilibrium
  // branch pins down transcritical and pitchfork points that a uniform r-grid
  // can otherwise step over.
  for (const branch of options.branches || []) {
    const points = branch.points || [];
    const derivativeMagnitudes = points
      .map((point) => Math.abs(point.derivative))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    const derivativeScale = derivativeMagnitudes.length
      ? derivativeMagnitudes[Math.floor(0.75 * (derivativeMagnitudes.length - 1))]
      : 1;
    const smallDerivative = Math.max(2e-5, derivativeScale * 0.035);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!Number.isFinite(point.derivative)) continue;
      if (Math.abs(point.derivative) <= smallDerivative) seeds.push({ x: point.x, r: point.r });
      if (index > 0) {
        const previous = points[index - 1];
        if (
          Number.isFinite(previous.derivative)
          && previous.derivative * point.derivative < 0
          && Math.abs(point.r - previous.r) <= 2.5 * rStep
        ) {
          const amount = Math.abs(previous.derivative)
            / (Math.abs(previous.derivative) + Math.abs(point.derivative));
          seeds.push({
            x: previous.x + (point.x - previous.x) * amount,
            r: previous.r + (point.r - previous.r) * amount
          });
        }
      }
    }
  }

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
  const xDedupeTolerance = Math.max(2e-3, (xMax - xMin) * 6e-4);
  const rDedupeTolerance = Math.max(2e-3, rStep * 0.72);
  for (const seed of seeds) {
    // Known points are already exact and should not drift along a degenerate
    // zero set under the regularized solve.
    const seedF = evaluateFamily(family, seed.x, seed.r);
    const seedFx = partialDerivative(family, seed.x, seed.r, 1, 0);
    const point = Math.hypot(seedF, seedFx) < 1e-8
      ? { x: seed.x, r: seed.r, residual: Math.hypot(seedF, seedFx), derivatives: derivativesAt(family, seed.x, seed.r) }
      : refineBifurcationCandidate(family, seed, bounds, options);
    if (point.residual > (options.maximumResidual || 2e-8)) continue;
    if (refined.some((other) =>
      Math.abs(other.x - point.x) < xDedupeTolerance
      && Math.abs(other.r - point.r) < rDedupeTolerance
    )) continue;
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
  const branches = family.nongeneric && Array.isArray(family.branchSlopes) && family.branchSlopes.length
    ? connectAnalyticMultifoldBranches(family, slices, { rMin, rMax, xMin, xMax }, options)
    : connectBranches(slices, xMax - xMin, (rMax - rMin) / Math.max(1, rSamples - 1));
  const candidates = options.detectCandidates === false
    ? []
    : detectBifurcations(family, { ...options, xMin, xMax, rMin, rMax, branches });
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
  compileExpression,
  createCustomFamily,
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
