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

const PARAMETER_KEY_ALIASES = Object.freeze({
  omega: "omega",
  drive: "omega",
  frequency: "omega",
  deltaOmega: "omega",
  current: "omega",
  mu: "omega",
  "μ": "omega",
  r: "omega",
  a: "amplitude",
  amplitude: "amplitude",
  coupling: "amplitude",
  criticalCurrent: "amplitude",
  b: "secondAmplitude",
  secondAmplitude: "secondAmplitude",
  phase: "phase",
  phi: "phase",
  phaseShift: "phase",
  n: "harmonics",
  harmonics: "harmonics",
  repeats: "harmonics"
});

export function canonicalCircleParameterKey(key) {
  const requested = String(key);
  const canonical = PARAMETER_KEY_ALIASES[requested];
  if (!canonical) throw new RangeError(`Unknown circle-flow parameter: ${requested}`);
  return canonical;
}

function normalizeParameters(definition, overrides = {}) {
  const source = overrides && typeof overrides === "object" ? overrides : {};
  const result = {};
  for (const descriptor of definition.parameters) {
    const aliases = descriptor.key === "omega"
      ? ["drive", "frequency", "deltaOmega", "current", "mu", "μ", "r"]
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
  transcritical: Object.freeze({
    id: "transcritical",
    name: "Transcritical exchange on the circle",
    shortName: "Transcritical",
    formula: () => "θ̇ = 2 sin((θ − π)/2) sin((μ − θ + π)/2)",
    description: "A fixed equilibrium and a moving equilibrium cross at μ = 0 and exchange stability.",
    lesson: "A transcritical bifurcation preserves the stable–unstable pair: the two branches pass through one another instead of being created or destroyed.",
    parameters: Object.freeze([
      Object.freeze({
        ...commonParameters.omega,
        symbol: "μ",
        label: "Transcritical parameter μ",
        defaultValue: 0.7,
        minimum: -2.5,
        maximum: 2.5
      })
    ]),
    velocity(theta, params) {
      const centeredAngle = theta - Math.PI;
      return Math.cos(centeredAngle - params.omega / 2) - Math.cos(params.omega / 2);
    },
    equilibriumAngles(params) {
      return [Math.PI, Math.PI + params.omega];
    }
  }),
  "symmetric-pitchfork": Object.freeze({
    id: "symmetric-pitchfork",
    name: "Symmetric pitchfork on the circle",
    shortName: "Pitchfork",
    formula: () => "θ̇ = sin θ [1 + cos θ − μ] + ε",
    description: "Reflection symmetry produces a supercritical pitchfork; a small bias unfolds it into saddle-nodes.",
    lesson: "At ε = 0 and μ = 0, one symmetric equilibrium loses stability while two stable equilibria emerge.",
    parameters: Object.freeze([
      Object.freeze({
        ...commonParameters.omega,
        symbol: "μ",
        label: "Pitchfork parameter μ",
        defaultValue: 0.45,
        minimum: -0.75,
        maximum: 1.5
      }),
      Object.freeze({
        ...commonParameters.secondAmplitude,
        symbol: "ε",
        label: "Symmetry-breaking bias ε",
        defaultValue: 0,
        minimum: -0.35,
        maximum: 0.35
      })
    ]),
    velocity(theta, params) {
      return Math.sin(theta) * (1 + Math.cos(theta) - params.omega)
        + params.secondAmplitude;
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
  pitchfork: "symmetric-pitchfork",
  "symmetric-pitchfork-flow": "symmetric-pitchfork",
  "transcritical-exchange": "transcritical",
  "transcritical-flow": "transcritical",
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
  if (typeof definition.equilibriumAngles === "function") {
    flow.equilibriumAngles = () => Object.freeze(
      definition.equilibriumAngles(params).map((angle) => wrapAngle(angle))
    );
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

const CUSTOM_EXPRESSION_FUNCTIONS = Object.freeze({
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

const CUSTOM_SUPERSCRIPT_DIGITS = Object.freeze({
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9"
});

const compiledCircleExpressions = new WeakMap();

function customExpressionSyntaxError(message, position = 0) {
  return new SyntaxError(`${message} at character ${Math.max(0, position) + 1}.`);
}

function normalizeCircleExpressionSource(source) {
  const text = String(source ?? "").trim();
  if (!text) throw customExpressionSyntaxError("Enter a right-hand side", 0);
  if (text.length > 256) {
    throw new RangeError("The equation is too long; use at most 256 characters.");
  }
  return text
    .replace(/\*\*/g, "^")
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    // Surround symbolic names with spaces so adjacency such as rθ or πθ
    // retains the same implicit-multiplication meaning as `r theta`.
    .replace(/[θϑΘ]/g, " theta ")
    .replace(/[μΜ]/g, " mu ")
    .replace(/[ωΩ]/g, " omega ")
    .replace(/π/g, " pi ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) =>
      `^${[...digits].map((digit) => CUSTOM_SUPERSCRIPT_DIGITS[digit]).join("")}`
    );
}

function tokenizeCircleExpression(source) {
  const tokens = [];
  let index = 0;
  const push = (type, value, position = index) => {
    tokens.push(Object.freeze({ type, value, position }));
    if (tokens.length > 160) {
      throw new RangeError("The equation has too many terms; simplify it and try again.");
    }
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
      if (!Number.isFinite(value)) {
        throw customExpressionSyntaxError("Numeric literal must be finite", position);
      }
      push("number", value, position);
      index += numberMatch[0].length;
      continue;
    }
    const nameMatch = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (nameMatch) {
      push("name", nameMatch[0].toLowerCase(), position);
      index += nameMatch[0].length;
      continue;
    }
    const character = source[index];
    if ("+-*/^".includes(character)) push("operator", character, position);
    else if (character === "(") push("left", character, position);
    else if (character === ")") push("right", character, position);
    else throw customExpressionSyntaxError(`Unsupported character "${character}"`, position);
    index += 1;
  }
  tokens.push(Object.freeze({ type: "end", value: "", position: source.length }));
  return tokens;
}

function parseCircleExpressionTokens(tokens) {
  let cursor = 0;
  let nodeCount = 0;
  let nesting = 0;
  const variables = new Set();
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const makeNode = (node) => {
    nodeCount += 1;
    if (nodeCount > 96) {
      throw new RangeError("The equation is too complex; use at most 96 operations and values.");
    }
    return Object.freeze(node);
  };
  const expectRight = () => {
    if (peek().type !== "right") {
      throw customExpressionSyntaxError("Expected a closing parenthesis", peek().position);
    }
    consume();
  };
  const beginsImplicitFactor = (token) =>
    token.type === "number" || token.type === "name" || token.type === "left";
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
      const aliases = { x: "theta", theta: "theta", r: "r", mu: "r", omega: "r" };
      const name = aliases[token.value] || token.value;
      if (name === "theta" || name === "r") {
        variables.add(name);
        return makeNode({ type: "variable", name });
      }
      if (name === "pi" || name === "e") {
        return makeNode({ type: "number", value: name === "pi" ? Math.PI : Math.E });
      }
      if (!Object.prototype.hasOwnProperty.call(CUSTOM_EXPRESSION_FUNCTIONS, name)) {
        throw customExpressionSyntaxError(
          `Unknown name "${token.value}"; use theta, x, r, pi, e, or a supported function`,
          token.position
        );
      }
      if (peek().type !== "left") {
        throw customExpressionSyntaxError(`Function "${token.value}" needs parentheses`, peek().position);
      }
      const left = consume();
      nesting += 1;
      if (nesting > 24) {
        throw customExpressionSyntaxError("Parentheses are nested too deeply", left.position);
      }
      const argument = parseAdditive();
      expectRight();
      nesting -= 1;
      return makeNode({ type: "function", name, argument });
    }
    if (token.type === "left") {
      consume();
      nesting += 1;
      if (nesting > 24) {
        throw customExpressionSyntaxError("Parentheses are nested too deeply", token.position);
      }
      const expression = parseAdditive();
      expectRight();
      nesting -= 1;
      return expression;
    }
    throw customExpressionSyntaxError(
      "Expected a number, theta, x, r, a function, or an opening parenthesis",
      token.position
    );
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
          throw customExpressionSyntaxError("Adjacent numbers need an operator", token.position);
        }
        left = makeNode({ type: "binary", operator: "*", left, right: parseUnary() });
      } else {
        break;
      }
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
  if (peek().type !== "end") {
    throw customExpressionSyntaxError(`Unexpected "${peek().value}"`, peek().position);
  }
  return Object.freeze({ ast, variables: Object.freeze([...variables]) });
}

function evaluateCircleExpressionNode(node, theta, r) {
  if (node.type === "number") return node.value;
  if (node.type === "variable") return node.name === "theta" ? theta : r;
  if (node.type === "unary") {
    const value = evaluateCircleExpressionNode(node.argument, theta, r);
    return node.operator === "-" ? -value : value;
  }
  if (node.type === "function") {
    return CUSTOM_EXPRESSION_FUNCTIONS[node.name](
      evaluateCircleExpressionNode(node.argument, theta, r)
    );
  }
  const left = evaluateCircleExpressionNode(node.left, theta, r);
  const right = evaluateCircleExpressionNode(node.right, theta, r);
  if (node.operator === "+") return left + right;
  if (node.operator === "-") return left - right;
  if (node.operator === "*") return left * right;
  if (node.operator === "/") return left / right;
  return left ** right;
}

/** Compile a bounded mathematical expression without evaluating JavaScript. */
export function compileCircleExpression(source) {
  const normalized = normalizeCircleExpressionSource(source);
  const parsed = parseCircleExpressionTokens(tokenizeCircleExpression(normalized));
  const variableSet = new Set(parsed.variables);
  const compiled = Object.freeze({
    source: String(source).trim(),
    canonical: normalized,
    variables: parsed.variables,
    usesTheta: variableSet.has("theta"),
    usesR: variableSet.has("r"),
    evaluate(theta, r) {
      try {
        const value = evaluateCircleExpressionNode(parsed.ast, Number(theta), Number(r));
        return Number.isFinite(value) && Math.abs(value) <= 1e100 ? value : Number.NaN;
      } catch {
        return Number.NaN;
      }
    }
  });
  compiledCircleExpressions.set(compiled, parsed.ast);
  return compiled;
}

function customParameterRange(range = [-2, 2]) {
  if (!Array.isArray(range) || range.length < 2) {
    throw new TypeError("Parameter r range must be a two-number array");
  }
  const minimum = finiteNumber(range[0], "Parameter r minimum");
  const maximum = finiteNumber(range[1], "Parameter r maximum");
  if (!(maximum > minimum)) throw new RangeError("Parameter r range must have positive width");
  return Object.freeze([minimum, maximum]);
}

function hashCustomCircleFlow(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function expressionNodeUsesTheta(node) {
  if (node.type === "number") return false;
  if (node.type === "variable") return node.name === "theta";
  if (node.type === "unary" || node.type === "function") {
    return expressionNodeUsesTheta(node.argument);
  }
  return expressionNodeUsesTheta(node.left) || expressionNodeUsesTheta(node.right);
}

function evaluateCircleExpressionDerivative(node, theta, r) {
  // This structural check matters at constant boundary values: sqrt(0) and
  // abs(0) are perfectly smooth constant subexpressions even though their
  // generic derivative formulas are singular at zero.
  if (!expressionNodeUsesTheta(node)) return 0;
  if (node.type === "number") return 0;
  if (node.type === "variable") return node.name === "theta" ? 1 : 0;
  if (node.type === "unary") {
    const derivative = evaluateCircleExpressionDerivative(node.argument, theta, r);
    return node.operator === "-" ? -derivative : derivative;
  }
  if (node.type === "function") {
    const value = evaluateCircleExpressionNode(node.argument, theta, r);
    const derivative = evaluateCircleExpressionDerivative(node.argument, theta, r);
    let outerDerivative;
    if (node.name === "sin") outerDerivative = Math.cos(value);
    else if (node.name === "cos") outerDerivative = -Math.sin(value);
    else if (node.name === "tan") outerDerivative = 1 / Math.cos(value) ** 2;
    else if (node.name === "asin") outerDerivative = 1 / Math.sqrt(1 - value ** 2);
    else if (node.name === "acos") outerDerivative = -1 / Math.sqrt(1 - value ** 2);
    else if (node.name === "atan") outerDerivative = 1 / (1 + value ** 2);
    else if (node.name === "sinh") outerDerivative = Math.cosh(value);
    else if (node.name === "cosh") outerDerivative = Math.sinh(value);
    else if (node.name === "tanh") outerDerivative = 1 - Math.tanh(value) ** 2;
    else if (node.name === "exp") outerDerivative = Math.exp(value);
    else if (node.name === "log" || node.name === "ln") outerDerivative = 1 / value;
    else if (node.name === "log1p") outerDerivative = 1 / (1 + value);
    else if (node.name === "sqrt") outerDerivative = 1 / (2 * Math.sqrt(value));
    else outerDerivative = value === 0 ? Number.NaN : Math.sign(value);
    return outerDerivative * derivative;
  }

  const left = evaluateCircleExpressionNode(node.left, theta, r);
  const right = evaluateCircleExpressionNode(node.right, theta, r);
  const leftDerivative = evaluateCircleExpressionDerivative(node.left, theta, r);
  const rightDerivative = evaluateCircleExpressionDerivative(node.right, theta, r);
  if (node.operator === "+") return leftDerivative + rightDerivative;
  if (node.operator === "-") return leftDerivative - rightDerivative;
  if (node.operator === "*") return leftDerivative * right + left * rightDerivative;
  if (node.operator === "/") {
    return (leftDerivative * right - left * rightDerivative) / right ** 2;
  }
  if (rightDerivative === 0) {
    if (right === 0) return 0;
    return right * left ** (right - 1) * leftDerivative;
  }
  if (!(left > 0)) return Number.NaN;
  const value = left ** right;
  return value * (rightDerivative * Math.log(left) + right * leftDerivative / left);
}

function collectPotentialDenominators(node, denominators = []) {
  if (node.type === "binary") {
    if (node.operator === "/") denominators.push(node.right);
    collectPotentialDenominators(node.left, denominators);
    collectPotentialDenominators(node.right, denominators);
  } else if (node.type === "unary" || node.type === "function") {
    // tan(u) has the implicit denominator cos(u). Treat it exactly like an
    // explicit division so shifted poles cannot hide between grid points.
    if (node.type === "function" && node.name === "tan") {
      denominators.push(Object.freeze({
        type: "function",
        name: "cos",
        argument: node.argument
      }));
    }
    // log(u) and log1p(u) have domain boundaries at u = 0 and 1 + u = 0.
    // Collect those boundary expressions so isolated logarithmic poles are
    // refined even when they fall between the dense validation samples.
    if (node.type === "function" && (node.name === "log" || node.name === "ln")) {
      denominators.push(node.argument);
    }
    if (node.type === "function" && node.name === "log1p") {
      denominators.push(Object.freeze({
        type: "binary",
        operator: "+",
        left: Object.freeze({ type: "number", value: 1 }),
        right: node.argument
      }));
    }
    collectPotentialDenominators(node.argument, denominators);
  }
  return denominators;
}

function minimizeExpressionNodeAbsolute(node, parameterValue, left, right) {
  let a = left;
  let b = right;
  let c = b - GOLDEN_RATIO_COMPLEMENT * (b - a);
  let d = a + GOLDEN_RATIO_COMPLEMENT * (b - a);
  let fc = Math.abs(evaluateCircleExpressionNode(node, c, parameterValue));
  let fd = Math.abs(evaluateCircleExpressionNode(node, d, parameterValue));
  for (let iteration = 0; iteration < 72; iteration += 1) {
    if (!Number.isFinite(fc) || !Number.isFinite(fd)) return Number.NaN;
    if (fc <= fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - GOLDEN_RATIO_COMPLEMENT * (b - a);
      fc = Math.abs(evaluateCircleExpressionNode(node, c, parameterValue));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + GOLDEN_RATIO_COMPLEMENT * (b - a);
      fd = Math.abs(evaluateCircleExpressionNode(node, d, parameterValue));
    }
  }
  return Math.min(fc, fd);
}

function validateDivisionDenominators(compiled, parameterValue) {
  const ast = compiledCircleExpressions.get(compiled);
  const denominators = collectPotentialDenominators(ast);
  const samples = 1024;
  const spacing = TWO_PI / samples;
  for (const denominator of denominators) {
    const values = new Array(samples + 1);
    let maximumAbsolute = 0;
    for (let index = 0; index <= samples; index += 1) {
      const value = evaluateCircleExpressionNode(denominator, index * spacing, parameterValue);
      if (!Number.isFinite(value)) {
        throw new RangeError("A denominator is undefined on the circle.");
      }
      values[index] = value;
      maximumAbsolute = Math.max(maximumAbsolute, Math.abs(value));
    }
    const zeroTolerance = 5e-13 * Math.max(1, maximumAbsolute);
    if (values.some((value) => Math.abs(value) <= zeroTolerance)) {
      throw new RangeError("A denominator reaches zero on the circle.");
    }
    for (let index = 0; index < samples; index += 1) {
      if (values[index] * values[index + 1] < 0) {
        throw new RangeError("A denominator crosses zero on the circle.");
      }
    }
    for (let index = 1; index < samples; index += 1) {
      const previous = Math.abs(values[index - 1]);
      const current = Math.abs(values[index]);
      const next = Math.abs(values[index + 1]);
      if (current <= previous && current <= next) {
        const minimum = minimizeExpressionNodeAbsolute(
          denominator,
          parameterValue,
          (index - 1) * spacing,
          (index + 1) * spacing
        );
        if (!Number.isFinite(minimum) || minimum <= zeroTolerance) {
          throw new RangeError("A denominator reaches zero on the circle.");
        }
      }
    }
  }
}

function validateCustomCircleExpression(compiled, parameterRange, selectedParameter) {
  const parameters = Array.from({ length: 5 }, (_, index) =>
    parameterRange[0] + (parameterRange[1] - parameterRange[0]) * index / 4
  );
  const selectionTolerance = 1e-13 * Math.max(1, Math.abs(selectedParameter));
  if (!parameters.some((value) => Math.abs(value - selectedParameter) <= selectionTolerance)) {
    parameters.push(selectedParameter);
  }

  const angleSamples = 4096;
  const magnitudeLimit = 1e12;
  const ast = compiledCircleExpressions.get(compiled);
  for (const parameterValue of parameters) {
    validateDivisionDenominators(compiled, parameterValue);
    let maximumMagnitude = 0;
    for (let index = 0; index <= angleSamples; index += 1) {
      const theta = TWO_PI * index / angleSamples;
      const value = compiled.evaluate(theta, parameterValue);
      if (!Number.isFinite(value)) {
        throw new RangeError(
          "The equation must be finite at every angle throughout the selected parameter range."
        );
      }
      maximumMagnitude = Math.max(maximumMagnitude, Math.abs(value));
      if (maximumMagnitude > magnitudeLimit) {
        throw new RangeError(
          "The equation becomes too large on the circle; keep angular velocities below 1e12."
        );
      }
    }

    const startValue = compiled.evaluate(0, parameterValue);
    const endValue = compiled.evaluate(TWO_PI, parameterValue);
    const seamScale = Math.max(1, maximumMagnitude, Math.abs(startValue), Math.abs(endValue));
    const seamTolerance = 1024 * Number.EPSILON * seamScale + 1e-12;
    if (Math.abs(startValue - endValue) > seamTolerance) {
      throw new RangeError("The equation must join continuously at theta = 0 and theta = 2*pi.");
    }

    const startDerivative = evaluateCircleExpressionDerivative(ast, 0, parameterValue);
    const endDerivative = evaluateCircleExpressionDerivative(ast, TWO_PI, parameterValue);
    const derivativeScale = Math.max(
      1,
      Math.abs(startDerivative),
      Math.abs(endDerivative)
    );
    if (
      !Number.isFinite(startDerivative)
      || !Number.isFinite(endDerivative)
      || Math.abs(startDerivative - endDerivative)
        > 1024 * Number.EPSILON * derivativeScale + 1e-12
    ) {
      throw new RangeError(
        "The equation must join smoothly at theta = 0 and theta = 2*pi (matching derivatives)."
      );
    }
  }
}

function customParameterValue(source, fallback, label = "Parameter r") {
  if (!source || typeof source !== "object") return fallback;
  for (const key of ["omega", "r", "mu", "μ", "ω"]) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
      return finiteNumber(source[key], label);
    }
  }
  return fallback;
}

/** Build a smooth numerical circle flow from a user-authored right-hand side. */
export function createCustomCircleFlow(expressionOrCompiled, options = {}) {
  const compiled = typeof expressionOrCompiled === "string"
    ? compileCircleExpression(expressionOrCompiled)
    : expressionOrCompiled;
  if (!compiledCircleExpressions.has(compiled)) {
    throw new TypeError("Expected an equation string or the result of compileCircleExpression()");
  }
  const parameterRange = customParameterRange(options.parameterRange || [-2, 2]);
  const rangeDefault = parameterRange[0] <= 0 && parameterRange[1] >= 0
    ? 0
    : (parameterRange[0] + parameterRange[1]) / 2;
  const initialParameter = customParameterValue(options, rangeDefault);
  validateCustomCircleExpression(compiled, parameterRange, initialParameter);

  const expression = compiled.source;
  const descriptor = parameter(
    "omega",
    "r",
    "Parameter r",
    initialParameter,
    parameterRange[0],
    parameterRange[1],
    Math.max((parameterRange[1] - parameterRange[0]) / 400, 1e-6)
  );
  const id = `custom-${hashCustomCircleFlow(`${compiled.canonical}|${parameterRange.join("|")}`)}`;

  const makeCustomFlow = (parameterValue) => {
    const r = finiteNumber(parameterValue, "Parameter r");
    const params = Object.freeze({ omega: r });
    return Object.freeze({
      id,
      name: "Custom circle flow",
      shortName: "Custom",
      formula: `θ̇ = ${expression}`,
      description: compiled.usesR
        ? "A user-authored one-parameter vector field on the circle."
        : "A user-authored vector field on the circle that does not depend on r.",
      lesson: "Equilibria and bifurcations are detected numerically.",
      sourceType: "custom",
      expression,
      expressionUsesParameter: compiled.usesR,
      compiledExpression: compiled,
      period: TWO_PI,
      origin: 0,
      parameterRange,
      defaultParameter: initialParameter,
      parameters: Object.freeze([descriptor]),
      params,
      eval(theta) {
        return compiled.evaluate(wrapAngle(theta), r);
      },
      velocity(theta) {
        return compiled.evaluate(wrapAngle(theta), r);
      },
      withParameters(overrides = {}) {
        return makeCustomFlow(customParameterValue(overrides, r));
      }
    });
  };

  return makeCustomFlow(initialParameter);
}

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

function bisectRoot(flow, left, right, leftValue, rightValue, angleTolerance) {
  let a = left;
  let b = right;
  let fa = leftValue;
  let fb = rightValue;
  if (fa === 0) return a;
  if (fb === 0) return b;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const middle = (a + b) / 2;
    const fm = evaluateFlow(flow, middle);
    if (fm === 0 || b - a <= angleTolerance) return middle;
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
  if (typeof flow.equilibriumAngles === "function") {
    for (const angle of flow.equilibriumAngles()) {
      if (Number.isFinite(angle) && Math.abs(evaluateFlow(flow, angle)) <= tangencyTolerance) {
        candidates.push(angle);
      }
    }
  }
  for (let index = 0; index < samples; index += 1) {
    const left = origin + spacing * index;
    const right = left + spacing;
    const leftValue = values[index];
    const rightValue = values[index + 1];
    if (leftValue * rightValue < 0) {
      candidates.push(bisectRoot(
        flow,
        left,
        right,
        leftValue,
        rightValue,
        angleTolerance
      ));
    }
  }

  // A sampled local minimum of |f| can be either an odd flat root or an
  // even-multiplicity tangency. Opposite neighbor signs identify the former
  // and call for bisection; equal neighbor signs identify the latter and call
  // for minimization. Keeping those paths separate prevents a flat cubic root
  // from being counted once approximately and once accurately.
  for (let index = 0; index < samples; index += 1) {
    const previous = values[(index - 1 + samples) % samples];
    const current = values[index];
    const next = values[(index + 1) % samples];
    const currentAbsolute = Math.abs(current);
    const previousAbsolute = Math.abs(previous);
    const nextAbsolute = Math.abs(next);
    if (
      currentAbsolute <= previousAbsolute &&
      currentAbsolute <= nextAbsolute &&
      (currentAbsolute < previousAbsolute || currentAbsolute < nextAbsolute)
    ) {
      const center = origin + spacing * index;
      const neighborProduct = previous * next;
      if (neighborProduct < 0) {
        candidates.push(bisectRoot(
          flow,
          center - spacing,
          center + spacing,
          previous,
          next,
          angleTolerance
        ));
      } else if (neighborProduct > 0) {
        const minimum = minimizeAbsoluteVelocity(flow, center - spacing, center + spacing);
        if (minimum.value <= tangencyTolerance) candidates.push(minimum.angle);
      }
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

/**
 * Sample the equilibrium set of a circle-flow family while one continuous
 * parameter varies. Each slice keeps the other parameters fixed. A continuum
 * slice is represented explicitly rather than as one artificial branch point.
 */
function resolveBifurcationFamily(flowOrId, baseParameters) {
  const overrides = baseParameters && typeof baseParameters === "object" ? baseParameters : {};
  if (typeof flowOrId === "string") {
    const baseFlow = createCircleFlow(flowOrId, overrides);
    return {
      baseFlow,
      makeFlow(parameters) {
        return createCircleFlow(baseFlow.id, parameters);
      }
    };
  }

  if (typeof flowOrId === "function") {
    const produced = flowOrId(overrides);
    const baseFlow = resolveFlow(produced);
    return {
      baseFlow,
      makeFlow(parameters) {
        if (typeof baseFlow.withParameters === "function") {
          return resolveFlow(baseFlow.withParameters(parameters));
        }
        return resolveFlow(flowOrId(parameters));
      }
    };
  }

  let baseFlow = resolveFlow(flowOrId);
  const hasOverrides = Object.keys(overrides).length > 0;
  if (hasOverrides) {
    if (typeof baseFlow.withParameters === "function") {
      baseFlow = resolveFlow(baseFlow.withParameters(overrides));
    } else if (presetDefinitions[baseFlow.id]) {
      baseFlow = createCircleFlow(baseFlow.id, overrides);
    }
  }
  if (typeof baseFlow.withParameters === "function") {
    return {
      baseFlow,
      makeFlow(parameters) {
        return resolveFlow(baseFlow.withParameters(parameters));
      }
    };
  }
  if (presetDefinitions[baseFlow.id]) {
    return {
      baseFlow,
      makeFlow(parameters) {
        return createCircleFlow(baseFlow.id, parameters);
      }
    };
  }
  throw new TypeError(
    "A sampled circle-flow object must provide withParameters(overrides), or be supplied as a factory."
  );
}

export function sampleCircleBifurcation(
  flowOrId,
  baseParameters,
  parameterKey,
  range,
  options = {}
) {
  const canonicalKey = canonicalCircleParameterKey(parameterKey);
  const family = resolveBifurcationFamily(flowOrId, baseParameters);
  const { baseFlow } = family;
  const descriptor = Array.isArray(baseFlow.parameters)
    ? baseFlow.parameters.find((parameterDescriptor) => parameterDescriptor.key === canonicalKey)
    : null;
  if (!descriptor) {
    throw new RangeError(`${baseFlow.name} does not use the ${canonicalKey} parameter`);
  }
  if (descriptor.integer) {
    throw new RangeError(`${descriptor.label} is discrete and cannot be used as a continuous bifurcation parameter`);
  }
  if (!Array.isArray(range) || range.length < 2) {
    throw new TypeError("The bifurcation parameter range must be [minimum, maximum]");
  }
  const minimum = finiteNumber(range[0], "bifurcation parameter minimum");
  const maximum = finiteNumber(range[1], "bifurcation parameter maximum");
  if (!(maximum > minimum)) throw new RangeError("The bifurcation parameter maximum must exceed its minimum");

  const parameterSamples = clamp(Math.round(Number(options.parameterSamples) || 181), 9, 801);
  const equilibriumSamples = clamp(Math.round(Number(options.equilibriumSamples) || 512), MIN_SAMPLES, MAX_SAMPLES);
  const values = Array.from(
    { length: parameterSamples },
    (_, index) => minimum + (maximum - minimum) * index / (parameterSamples - 1)
  );
  const anchors = [
    ...(minimum < 0 && maximum > 0 ? [0] : []),
    ...(Array.isArray(options.anchors) ? options.anchors : [])
  ];
  const anchorTolerance = (maximum - minimum) * 1e-11;
  for (const anchor of anchors) {
    const value = Number(anchor);
    if (!Number.isFinite(value) || value < minimum || value > maximum) continue;
    if (!values.some((candidate) => Math.abs(candidate - value) <= anchorTolerance)) values.push(value);
  }
  values.sort((left, right) => left - right);

  const base = { ...(baseFlow.params || {}) };
  const slices = values.map((value) => {
    const flow = family.makeFlow({ ...base, [canonicalKey]: value });
    const equilibria = findEquilibria(flow, { samples: equilibriumSamples });
    const continuum = Boolean(equilibria[0]?.continuum);
    return Object.freeze({
      parameter: value,
      continuum,
      equilibria: continuum ? Object.freeze([]) : equilibria
    });
  });

  return Object.freeze({
    familyId: baseFlow.id,
    parameterKey: canonicalKey,
    range: Object.freeze([minimum, maximum]),
    slices: Object.freeze(slices)
  });
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
  compileCircleExpression,
  createCustomCircleFlow,
  evaluateFlow,
  velocityAt,
  wrapAngle,
  circularDifference,
  circularDistance,
  unwrapAngleNear,
  turnsBetween,
  lapCount,
  seamCrossings,
  canonicalCircleParameterKey,
  derivativeAt,
  classifyEquilibrium,
  findEquilibria,
  sampleCircleBifurcation,
  sampleFlow,
  stepLiftedRK4,
  rk4LiftedStep,
  integrateLiftedTrajectory,
  rotationPeriod,
  meanFrequency,
  analyzeCircleFlow,
  rotationMetrics
});
