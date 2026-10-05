/**
 * Pure numerical model for autonomous flows on a circle.
 *
 * A lifted angle is allowed to range over the whole real line.  The vector
 * field is evaluated modulo 2π, while integration keeps the lift intact so a
 * presentation layer can count turns without losing seam crossings.
 */

export const TWO_PI = 2 * Math.PI;

const DEFAULT_PERIOD = TWO_PI;
const DEFAULT_SAMPLES = 2048;
const MIN_SAMPLES = 64;
const MAX_SAMPLES = 65536;
const GOLDEN_RATIO_COMPLEMENT = (Math.sqrt(5) - 1) / 2;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) throw new RangeError(`${label} must be positive`);
  return number;
}

function signWithTolerance(value, tolerance) {
  if (value > tolerance) return 1;
  if (value < -tolerance) return -1;
  return 0;
}

/** Return an angle in [origin, origin + period). */
export function wrapAngle(theta, period = DEFAULT_PERIOD, origin = 0) {
  const angle = finiteNumber(theta, "angle");
  const circumference = positiveNumber(period, "period");
  const start = finiteNumber(origin, "origin");
  const wrapped = ((angle - start) % circumference + circumference) % circumference + start;
  // Avoid returning origin + period or negative zero after roundoff at a seam.
  if (Math.abs(wrapped - (start + circumference)) <= 8 * Number.EPSILON * circumference) return start;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** Shortest signed displacement from `from` to `to`. */
export function circularDifference(to, from, period = DEFAULT_PERIOD) {
  const circumference = positiveNumber(period, "period");
  const half = circumference / 2;
  let difference = wrapAngle(
    finiteNumber(to, "target angle") - finiteNumber(from, "source angle") + half,
    circumference
  ) - half;
  // Choose +period/2 at the otherwise ambiguous antipodal point.
  if (difference <= -half + 8 * Number.EPSILON * circumference) difference = half;
  return difference;
}

export function circularDistance(first, second, period = DEFAULT_PERIOD) {
  return Math.abs(circularDifference(first, second, period));
}

/** Choose the lift of `angle` nearest to `referenceLift`. */
export function unwrapAngleNear(angle, referenceLift, period = DEFAULT_PERIOD) {
  const circumference = positiveNumber(period, "period");
  const reference = finiteNumber(referenceLift, "reference lift");
  const wrapped = wrapAngle(angle, circumference);
  return wrapped + circumference * Math.round((reference - wrapped) / circumference);
}

/** Net (possibly fractional) number of turns between two lifted angles. */
export function turnsBetween(initialLift, currentLift, period = DEFAULT_PERIOD) {
  return (
    finiteNumber(currentLift, "current lift") - finiteNumber(initialLift, "initial lift")
  ) / positiveNumber(period, "period");
}

/** Signed count of complete turns since an initial lifted angle. */
export function lapCount(currentLift, initialLift = 0, period = DEFAULT_PERIOD) {
  const turns = turnsBetween(initialLift, currentLift, period);
  const epsilon = 32 * Number.EPSILON * Math.max(1, Math.abs(turns));
  return turns >= 0 ? Math.floor(turns + epsilon) : Math.ceil(turns - epsilon);
}

/** Number of canonical seam crossings between two lifted samples. */
export function seamCrossings(previousLift, currentLift, period = DEFAULT_PERIOD, origin = 0) {
  const circumference = positiveNumber(period, "period");
  const start = finiteNumber(origin, "origin");
  const previous = finiteNumber(previousLift, "previous lift");
  const current = finiteNumber(currentLift, "current lift");
  return Math.floor((current - start) / circumference) - Math.floor((previous - start) / circumference);
}

function parameter(key, symbol, label, defaultValue, minimum, maximum, step, extra = {}) {
  return Object.freeze({ key, symbol, label, defaultValue, minimum, maximum, step, ...extra });
}

const commonParameters = Object.freeze({
  omega: parameter("omega", "ω", "Drive ω", 1, -3, 3, 0.01),
  amplitude: parameter("amplitude", "a", "Wave amplitude a", 1, 0, 2, 0.01),
  phase: parameter("phase", "φ", "Phase shift φ", 0, 0, TWO_PI, 0.01),
  harmonics: parameter("harmonics", "n", "Number of repeats n", 3, 1, 12, 1, { integer: true }),
  secondAmplitude: parameter("secondAmplitude", "b", "Second harmonic b", 0.42, -1.5, 1.5, 0.01)
});

function normalizedParameter(source, key, fallback, aliases = []) {
  const candidateKeys = [key, ...aliases];
  for (const candidateKey of candidateKeys) {
    if (source[candidateKey] != null && Number.isFinite(Number(source[candidateKey]))) {
      return Number(source[candidateKey]);
    }
  }
  return fallback;
}

function normalizeParameters(definition, overrides = {}) {
  const source = overrides && typeof overrides === "object" ? overrides : {};
  const result = {};
  for (const descriptor of definition.parameters) {
    const aliases = descriptor.key === "omega"
      ? ["drive", "frequency", "deltaOmega", "current"]
      : descriptor.key === "amplitude"
        ? ["a", "coupling", "criticalCurrent"]
        : descriptor.key === "phase"
          ? ["phi", "phaseShift"]
          : descriptor.key === "harmonics"
            ? ["n", "repeats"]
            : descriptor.key === "secondAmplitude"
              ? ["b"]
              : [];
    let value = normalizedParameter(source, descriptor.key, descriptor.defaultValue, aliases);
    if (descriptor.integer) value = clamp(Math.round(value), descriptor.minimum, descriptor.maximum);
    if (descriptor.key === "phase") value = wrapAngle(value);
    result[descriptor.key] = value;
  }
  return Object.freeze(result);
}

const presetDefinitions = Object.freeze({
  uniform: Object.freeze({
    id: "uniform",
    name: "Uniform rotation",
    shortName: "Uniform",
    formula: () => "θ̇ = ω",
    description: "Every point travels around the circle at the same angular velocity.",
    lesson: "With no zeros in the vector field, every trajectory keeps circulating in the same direction.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, defaultValue: 1.1 })
    ]),
    velocity(_theta, params) {
      return params.omega;
    },
    analyticPeriod(params) {
      return params.omega === 0 ? Infinity : TWO_PI / Math.abs(params.omega);
    }
  }),
  nonuniform: Object.freeze({
    id: "nonuniform",
    name: "Nonuniform circle flow",
    shortName: "Nonuniform",
    formula: () => "θ̇ = ω[1 + a cos(θ − φ)]",
    description: "A periodic speed profile can produce rotation, a threshold stall, or a stable–unstable fixed-point pair.",
    lesson: "Changing speed does not create an equilibrium until the velocity actually reaches zero.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, defaultValue: 1 }),
      Object.freeze({ ...commonParameters.amplitude, defaultValue: 0.65, maximum: 1.5 }),
      Object.freeze({ ...commonParameters.phase, defaultValue: 0.35 })
    ]),
    velocity(theta, params) {
      return params.omega * (1 + params.amplitude * Math.cos(theta - params.phase));
    },
    analyticPeriod(params) {
      if (params.omega === 0 || Math.abs(params.amplitude) >= 1) return Infinity;
      return TWO_PI / (Math.abs(params.omega) * Math.sqrt(1 - params.amplitude ** 2));
    }
  }),
  "overdamped-pendulum": Object.freeze({
    id: "overdamped-pendulum",
    name: "Overdamped pendulum (Adler flow)",
    shortName: "Adler flow",
    formula: () => "θ̇ = ω − a sin θ",
    description: "A constant drive competes with a periodic restoring torque.",
    lesson: "A stable and unstable fixed point collide in a saddle-node on the circle, separating locking from rotation.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, defaultValue: 0.55 }),
      commonParameters.amplitude
    ]),
    velocity(theta, params) {
      return params.omega - params.amplitude * Math.sin(theta);
    },
    analyticPeriod(params) {
      const discriminant = params.omega ** 2 - params.amplitude ** 2;
      return discriminant > 0 ? TWO_PI / Math.sqrt(discriminant) : Infinity;
    }
  }),
  "firefly-locking": Object.freeze({
    id: "firefly-locking",
    name: "Firefly phase locking",
    shortName: "Fireflies",
    formula: () => "φ̇ = Δω − K sin(φ − φ₀)",
    description: "The state is the phase difference between an oscillator and a periodic signal.",
    lesson: "Inside the locking range, the phase difference approaches a constant; outside it, phase slips continue.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, symbol: "Δω", label: "Frequency mismatch Δω", defaultValue: 0.45 }),
      Object.freeze({ ...commonParameters.amplitude, symbol: "K", label: "Coupling K", defaultValue: 1 }),
      Object.freeze({ ...commonParameters.phase, symbol: "φ₀", label: "Preferred phase φ₀", defaultValue: 0.25 })
    ]),
    velocity(theta, params) {
      return params.omega - params.amplitude * Math.sin(theta - params.phase);
    },
    analyticPeriod(params) {
      const discriminant = params.omega ** 2 - params.amplitude ** 2;
      return discriminant > 0 ? TWO_PI / Math.sqrt(discriminant) : Infinity;
    }
  }),
  "josephson-junction": Object.freeze({
    id: "josephson-junction",
    name: "Overdamped Josephson junction",
    shortName: "Josephson junction",
    formula: () => "φ̇ = I − I_c sin φ",
    description: "In rescaled time, the phase is pinned when |I| < I_c and runs when |I| > I_c.",
    lesson: "The same circle flow describes a locked state with zero mean voltage and a running state with nonzero mean voltage.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, symbol: "I", label: "Applied current I", defaultValue: 1.25 }),
      Object.freeze({ ...commonParameters.amplitude, symbol: "I_c", label: "Critical current I_c", defaultValue: 1 })
    ]),
    velocity(theta, params) {
      return params.omega - params.amplitude * Math.sin(theta);
    },
    analyticPeriod(params) {
      const discriminant = params.omega ** 2 - params.amplitude ** 2;
      return discriminant > 0 ? TWO_PI / Math.sqrt(discriminant) : Infinity;
    }
  }),
  "repeated-locking-sites": Object.freeze({
    id: "repeated-locking-sites",
    name: "Repeated locking sites",
    shortName: "Repeated locking",
    formula: (params) => `θ̇ = ω − a sin(${params.harmonics}θ + φ)`,
    description: "A repeated wave creates several alternating attracting and repelling equilibria around the circle.",
    lesson: "Simple equilibria on a circle alternate in stability, so they are created and destroyed in pairs.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, defaultValue: 0.2 }),
      commonParameters.amplitude,
      commonParameters.harmonics,
      commonParameters.phase
    ]),
    velocity(theta, params) {
      return params.omega - params.amplitude * Math.sin(params.harmonics * theta + params.phase);
    },
    analyticPeriod(params) {
      const discriminant = params.omega ** 2 - params.amplitude ** 2;
      return discriminant > 0 ? TWO_PI / Math.sqrt(discriminant) : Infinity;
    }
  }),
  "fourier-workshop": Object.freeze({
    id: "fourier-workshop",
    name: "Fourier workshop",
    shortName: "Fourier workshop",
    formula: (params) => `θ̇ = ω + a sin θ + b sin(${params.harmonics}θ + φ)`,
    description: "Combine two periodic waves to build a richer smooth vector field on the circle.",
    lesson: "A generic periodic vector field can have several fixed points, but its simple stable and unstable zeros still alternate.",
    parameters: Object.freeze([
      Object.freeze({ ...commonParameters.omega, defaultValue: 0.1 }),
      Object.freeze({ ...commonParameters.amplitude, defaultValue: 0.7 }),
      commonParameters.secondAmplitude,
      Object.freeze({ ...commonParameters.harmonics, defaultValue: 2 }),
      Object.freeze({ ...commonParameters.phase, defaultValue: 0.65 })
    ]),
    velocity(theta, params) {
      return params.omega
        + params.amplitude * Math.sin(theta)
        + params.secondAmplitude * Math.sin(params.harmonics * theta + params.phase);
    }
  })
});

const PRESET_ALIASES = Object.freeze({
  adler: "overdamped-pendulum",
  overdamped: "overdamped-pendulum",
  pendulum: "overdamped-pendulum",
  fireflies: "firefly-locking",
  firefly: "firefly-locking",
  josephson: "josephson-junction",
  repeated: "repeated-locking-sites",
  "repeated-locking": "repeated-locking-sites",
  fourier: "fourier-workshop"
});

export const PRESET_IDS = Object.freeze(Object.keys(presetDefinitions));

function makeCircleFlow(definition, overrides = {}) {
  const params = normalizeParameters(definition, overrides);
  const flow = {
    id: definition.id,
    name: definition.name,
    shortName: definition.shortName,
    formula: definition.formula(params),
    description: definition.description,
    lesson: definition.lesson,
    period: TWO_PI,
    origin: 0,
    parameters: definition.parameters,
    params,
    eval(theta) {
      return definition.velocity(wrapAngle(theta), params);
    },
    velocity(theta) {
      return definition.velocity(wrapAngle(theta), params);
    }
  };
  if (typeof definition.analyticPeriod === "function") {
    flow.analyticPeriod = () => definition.analyticPeriod(params);
  }
  return Object.freeze(flow);
}

export const PRESETS = Object.freeze(Object.fromEntries(
  PRESET_IDS.map((id) => [id, makeCircleFlow(presetDefinitions[id])])
));

export function createCircleFlow(id = "overdamped-pendulum", parameters = {}) {
  const requestedId = String(id);
  const normalizedId = PRESET_ALIASES[requestedId] || requestedId;
  const definition = presetDefinitions[normalizedId];
  if (!definition) throw new RangeError(`Unknown circle-flow preset: ${requestedId}`);
  const hasOverrides = parameters && typeof parameters === "object" && Object.keys(parameters).length > 0;
  return hasOverrides ? makeCircleFlow(definition, parameters) : PRESETS[normalizedId];
}

export const createFlow = createCircleFlow;

function resolveFlow(flowOrId) {
  if (typeof flowOrId === "string") return createCircleFlow(flowOrId);
  if (typeof flowOrId === "function") {
    return Object.freeze({
      id: "custom",
      name: "Custom circle flow",
      period: TWO_PI,
      origin: 0,
      eval: flowOrId
    });
  }
  if (!flowOrId || (typeof flowOrId.eval !== "function" && typeof flowOrId.velocity !== "function")) {
    throw new TypeError("Expected a circle-flow preset id, function, or object with eval(theta)");
  }
  return flowOrId;
}

export function evaluateFlow(flowOrId, theta) {
  const flow = resolveFlow(flowOrId);
  const period = flow.period == null ? TWO_PI : positiveNumber(flow.period, "flow period");
  const origin = flow.origin == null ? 0 : finiteNumber(flow.origin, "flow origin");
  const angle = wrapAngle(theta, period, origin);
  const evaluator = typeof flow.eval === "function" ? flow.eval : flow.velocity;
  return finiteNumber(evaluator.call(flow, angle), "angular velocity");
}

export const velocityAt = evaluateFlow;

export function derivativeAt(flowOrId, theta, options = {}) {
  const flow = resolveFlow(flowOrId);
  const period = flow.period == null ? TWO_PI : positiveNumber(flow.period, "flow period");
  const step = options.step == null
    ? Math.max(1e-6, period * 1e-5)
    : positiveNumber(options.step, "derivative step");
  // Five-point centered difference gives reliable stability labels without
  // treating the canonical seam as a boundary.
  return (
    evaluateFlow(flow, theta - 2 * step)
    - 8 * evaluateFlow(flow, theta - step)
    + 8 * evaluateFlow(flow, theta + step)
    - evaluateFlow(flow, theta + 2 * step)
  ) / (12 * step);
}

function bisectRoot(flow, left, right, leftValue, rightValue, valueTolerance, angleTolerance) {
  let a = left;
  let b = right;
  let fa = leftValue;
  let fb = rightValue;
  if (Math.abs(fa) <= valueTolerance) return a;
  if (Math.abs(fb) <= valueTolerance) return b;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const middle = (a + b) / 2;
    const fm = evaluateFlow(flow, middle);
    if (Math.abs(fm) <= valueTolerance || b - a <= angleTolerance) return middle;
    if (fa * fm <= 0) {
      b = middle;
      fb = fm;
    } else {
      a = middle;
      fa = fm;
    }
  }
  return Math.abs(fa) <= Math.abs(fb) ? a : b;
}

function minimizeAbsoluteVelocity(flow, left, right) {
  let a = left;
  let b = right;
  let c = b - GOLDEN_RATIO_COMPLEMENT * (b - a);
  let d = a + GOLDEN_RATIO_COMPLEMENT * (b - a);
  let fc = Math.abs(evaluateFlow(flow, c));
  let fd = Math.abs(evaluateFlow(flow, d));
  for (let iteration = 0; iteration < 72; iteration += 1) {
    if (fc <= fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - GOLDEN_RATIO_COMPLEMENT * (b - a);
      fc = Math.abs(evaluateFlow(flow, c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + GOLDEN_RATIO_COMPLEMENT * (b - a);
      fd = Math.abs(evaluateFlow(flow, d));
    }
  }
  return fc <= fd ? { angle: c, value: fc } : { angle: d, value: fd };
}

export function classifyEquilibrium(flowOrId, theta, options = {}) {
  const flow = resolveFlow(flowOrId);
  const period = flow.period == null ? TWO_PI : positiveNumber(flow.period, "flow period");
  const angle = wrapAngle(theta, period, flow.origin || 0);
  const velocityScale = Math.max(1, Number(options.velocityScale) || 1);
  const derivative = derivativeAt(flow, angle, options);
  const derivativeTolerance = options.derivativeTolerance == null
    ? 2e-6 * velocityScale
    : positiveNumber(options.derivativeTolerance, "derivative tolerance");
  const probe = options.probe == null
    ? Math.max(period * 1e-4, 2e-5)
    : positiveNumber(options.probe, "stability probe");
  const sideTolerance = options.sideTolerance == null
    ? 2e-10 * velocityScale
    : positiveNumber(options.sideTolerance, "side tolerance");
  const leftVelocity = evaluateFlow(flow, angle - probe);
  const rightVelocity = evaluateFlow(flow, angle + probe);
  const leftSign = signWithTolerance(leftVelocity, sideTolerance);
  const rightSign = signWithTolerance(rightVelocity, sideTolerance);

  let stability;
  if (derivative < -derivativeTolerance) stability = "stable";
  else if (derivative > derivativeTolerance) stability = "unstable";
  else if (leftSign > 0 && rightSign < 0) stability = "stable";
  else if (leftSign < 0 && rightSign > 0) stability = "unstable";
  else if (leftSign !== 0 || rightSign !== 0) stability = "semistable";
  else stability = "neutral";

  const stable = stability === "stable" ? true : stability === "unstable" ? false : null;
  const label = stability === "stable"
    ? "Stable equilibrium"
    : stability === "unstable"
      ? "Unstable equilibrium"
      : stability === "semistable"
        ? "Semistable equilibrium"
        : "Neutral equilibrium";

  return Object.freeze({
    angle,
    theta: angle,
    velocity: evaluateFlow(flow, angle),
    derivative,
    stability,
    stable,
    label,
    attractingFrom: Object.freeze({
      left: leftSign > 0,
      right: rightSign < 0
    }),
    sideSigns: Object.freeze({ left: leftSign, right: rightSign })
  });
}

function dedupeCircularAngles(angles, period, tolerance) {
  const sorted = angles.map((angle) => wrapAngle(angle, period)).sort((first, second) => first - second);
  const unique = [];
  for (const angle of sorted) {
    if (!unique.some((other) => circularDistance(angle, other, period) <= tolerance)) unique.push(angle);
  }
  return unique;
}

/**
 * Find every equilibrium during one turn.  Sign changes locate simple roots;
 * local minima of |f| locate even-multiplicity tangencies.  Circular-distance
 * deduplication makes a root at 0 ≡ 2π appear exactly once.
 */
export function findEquilibria(flowOrId, options = {}) {
  const flow = resolveFlow(flowOrId);
  const config = typeof options === "number" ? { samples: options } : options;
  const period = flow.period == null ? TWO_PI : positiveNumber(flow.period, "flow period");
  const origin = flow.origin == null ? 0 : finiteNumber(flow.origin, "flow origin");
  const samples = clamp(Math.round(Number(config.samples) || DEFAULT_SAMPLES), MIN_SAMPLES, MAX_SAMPLES);
  const spacing = period / samples;
  const values = new Array(samples + 1);
  let maximumAbsolute = 0;
  for (let index = 0; index <= samples; index += 1) {
    const value = evaluateFlow(flow, origin + spacing * index);
    values[index] = value;
    maximumAbsolute = Math.max(maximumAbsolute, Math.abs(value));
  }

  const velocityScale = Math.max(1, maximumAbsolute);
  const valueTolerance = config.valueTolerance == null
    ? 1e-10 * velocityScale
    : positiveNumber(config.valueTolerance, "root value tolerance");
  const tangencyTolerance = config.tangencyTolerance == null
    ? 2e-9 * velocityScale
    : positiveNumber(config.tangencyTolerance, "tangency tolerance");
  const angleTolerance = config.angleTolerance == null
    ? 2e-12 * period
    : positiveNumber(config.angleTolerance, "root angle tolerance");
  const dedupeTolerance = config.dedupeTolerance == null
    ? Math.max(2e-8 * period, angleTolerance * 16)
    : positiveNumber(config.dedupeTolerance, "root deduplication tolerance");

  if (maximumAbsolute <= valueTolerance) {
    return Object.freeze([Object.freeze({
      angle: origin,
      theta: origin,
      velocity: 0,
      derivative: 0,
      stability: "neutral",
      stable: null,
      continuum: true,
      label: "Every angle is an equilibrium",
      attractingFrom: Object.freeze({ left: false, right: false }),
      sideSigns: Object.freeze({ left: 0, right: 0 })
    })]);
  }

  const candidates = [];
  for (let index = 0; index < samples; index += 1) {
    const left = origin + spacing * index;
    const right = left + spacing;
    const leftValue = values[index];
    const rightValue = values[index + 1];
    if (Math.abs(leftValue) <= valueTolerance) candidates.push(left);
    if (leftValue * rightValue < 0) {
      candidates.push(bisectRoot(
        flow,
        left,
        right,
        leftValue,
        rightValue,
        valueTolerance,
        angleTolerance
      ));
    }
  }

  // A tangency need not change sign.  Search every sampled local minimum of
  // |f| and accept it only when minimization reaches numerical zero.
  for (let index = 0; index < samples; index += 1) {
    const previous = values[(index - 1 + samples) % samples];
    const current = values[index];
    const next = values[(index + 1) % samples];
    if (Math.abs(current) <= Math.abs(previous) && Math.abs(current) <= Math.abs(next)) {
      const center = origin + spacing * index;
      const minimum = minimizeAbsoluteVelocity(flow, center - spacing, center + spacing);
      if (minimum.value <= tangencyTolerance) candidates.push(minimum.angle);
    }
  }

  const angles = dedupeCircularAngles(candidates, period, dedupeTolerance);
  return Object.freeze(angles.map((angle) => classifyEquilibrium(flow, angle, {
    velocityScale,
    derivativeTolerance: config.derivativeTolerance,
    probe: config.probe,
    sideTolerance: config.sideTolerance
  })));
}

export function sampleFlow(flowOrId, options = {}) {
  const flow = resolveFlow(flowOrId);
  const period = flow.period == null ? TWO_PI : positiveNumber(flow.period, "flow period");
  const origin = flow.origin == null ? 0 : finiteNumber(flow.origin, "flow origin");
  const samples = clamp(Math.round(Number(options.samples) || 361), 2, MAX_SAMPLES);
  const points = Array.from({ length: samples }, (_, index) => {
    const angle = origin + period * index / (samples - 1);
    return Object.freeze({
      angle,
      theta: angle,
      velocity: evaluateFlow(flow, angle)
    });
  });
  return Object.freeze({
    flowId: flow.id || "custom",
    period,
    origin,
    points: Object.freeze(points)
  });
}

/** One fourth-order Runge–Kutta step that preserves the real-valued lift. */
export function stepLiftedRK4(flowOrId, liftedTheta, dt) {
  const flow = resolveFlow(flowOrId);
  const theta = finiteNumber(liftedTheta, "lifted angle");
  const step = finiteNumber(dt, "time step");
  const k1 = evaluateFlow(flow, theta);
  const k2 = evaluateFlow(flow, theta + step * k1 / 2);
  const k3 = evaluateFlow(flow, theta + step * k2 / 2);
  const k4 = evaluateFlow(flow, theta + step * k3);
  return theta + step * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
}

export const rk4LiftedStep = stepLiftedRK4;

export function integrateLiftedTrajectory(flowOrId, options = {}) {
  const flow = resolveFlow(flowOrId);
  const dt = finiteNumber(options.dt == null ? 0.02 : options.dt, "time step");
  if (dt === 0) throw new RangeError("time step must be nonzero");
  const duration = Math.abs(finiteNumber(options.duration == null ? 8 : options.duration, "duration"));
  const maximumSteps = clamp(Math.round(Number(options.maximumSteps) || 100000), 1, 1000000);
  const initial = finiteNumber(
    options.liftedTheta0 == null ? (options.theta0 == null ? 0 : options.theta0) : options.liftedTheta0,
    "initial lifted angle"
  );
  const t0 = finiteNumber(options.t0 == null ? 0 : options.t0, "initial time");
  const direction = dt > 0 ? 1 : -1;
  const points = [];
  let time = t0;
  let theta = initial;
  let reason = "duration";

  function appendPoint() {
    points.push(Object.freeze({
      t: time,
      theta,
      liftedTheta: theta,
      wrappedTheta: wrapAngle(theta, flow.period || TWO_PI, flow.origin || 0),
      laps: lapCount(theta, initial, flow.period || TWO_PI)
    }));
  }

  appendPoint();
  for (let index = 0; index < maximumSteps && Math.abs(time - t0) < duration; index += 1) {
    const remaining = duration - Math.abs(time - t0);
    const step = direction * Math.min(Math.abs(dt), remaining);
    theta = stepLiftedRK4(flow, theta, step);
    time += step;
    appendPoint();
    if (!Number.isFinite(theta)) {
      reason = "non-finite";
      break;
    }
    if (index === maximumSteps - 1 && Math.abs(time - t0) < duration) reason = "step-limit";
  }
  return Object.freeze({
    points: Object.freeze(points),
    reason,
    final: points[points.length - 1]
  });
}

function rotationSign(flow) {
  for (let index = 0; index < 64; index += 1) {
    const velocity = evaluateFlow(flow, TWO_PI * (index + 0.371) / 64);
    if (Math.abs(velocity) > 1e-12) return Math.sign(velocity);
  }
  return 0;
}

/** Positive time needed for one complete turn, or Infinity when locked. */
export function rotationPeriod(flowOrId, options = {}) {
  const flow = resolveFlow(flowOrId);
  const equilibria = options.equilibria || findEquilibria(flow, options.equilibriumOptions || {});
  if (equilibria.length > 0) return Infinity;
  if (typeof flow.analyticPeriod === "function" && options.forceNumeric !== true) {
    const exact = Number(flow.analyticPeriod());
    return Number.isFinite(exact) && exact > 0 ? exact : Infinity;
  }

  let samples = clamp(Math.round(Number(options.samples) || 4096), MIN_SAMPLES, MAX_SAMPLES);
  if (samples % 2 !== 0) samples += 1;
  const period = flow.period == null ? TWO_PI : positiveNumber(flow.period, "flow period");
  const origin = flow.origin == null ? 0 : finiteNumber(flow.origin, "flow origin");
  const spacing = period / samples;
  let total = 0;
  let direction = 0;
  for (let index = 0; index <= samples; index += 1) {
    const velocity = evaluateFlow(flow, origin + index * spacing);
    const sign = signWithTolerance(velocity, 1e-12);
    if (sign === 0 || (direction !== 0 && sign !== direction)) return Infinity;
    direction = sign;
    const weight = index === 0 || index === samples ? 1 : index % 2 === 0 ? 2 : 4;
    total += weight / Math.abs(velocity);
  }
  const result = spacing * total / 3;
  return Number.isFinite(result) && result > 0 ? result : Infinity;
}

/** Signed long-time angular velocity; zero for locked and threshold flows. */
export function meanFrequency(flowOrId, options = {}) {
  const flow = resolveFlow(flowOrId);
  const period = rotationPeriod(flow, options);
  if (!Number.isFinite(period)) return 0;
  return rotationSign(flow) * (flow.period || TWO_PI) / period;
}

export function analyzeCircleFlow(flowOrId, options = {}) {
  const flow = resolveFlow(flowOrId);
  const equilibria = findEquilibria(flow, options.equilibriumOptions || {});
  const continuum = equilibria.some((equilibrium) => equilibrium.continuum);
  const threshold = equilibria.some((equilibrium) => equilibrium.stability === "semistable");
  const period = rotationPeriod(flow, { ...options, equilibria });
  const frequency = Number.isFinite(period)
    ? rotationSign(flow) * (flow.period || TWO_PI) / period
    : 0;
  const sign = Number.isFinite(period) ? Math.sign(frequency) : threshold ? rotationSign(flow) : 0;
  return Object.freeze({
    flowId: flow.id || "custom",
    regime: continuum ? "stationary" : equilibria.length === 0 ? "rotating" : threshold ? "threshold" : "locked",
    direction: sign > 0 ? "counterclockwise" : sign < 0 ? "clockwise" : equilibria.length > 0 ? "mixed" : "stationary",
    equilibria,
    equilibriumCount: continuum ? Infinity : equilibria.length,
    period,
    meanFrequency: frequency
  });
}

export const rotationMetrics = analyzeCircleFlow;

export default Object.freeze({
  TWO_PI,
  PRESET_IDS,
  PRESETS,
  createCircleFlow,
  createFlow,
  evaluateFlow,
  velocityAt,
  wrapAngle,
  circularDifference,
  circularDistance,
  unwrapAngleNear,
  turnsBetween,
  lapCount,
  seamCrossings,
  derivativeAt,
  classifyEquilibrium,
  findEquilibria,
  sampleFlow,
  stepLiftedRK4,
  rk4LiftedStep,
  integrateLiftedTrajectory,
  rotationPeriod,
  meanFrequency,
  analyzeCircleFlow,
  rotationMetrics
});
