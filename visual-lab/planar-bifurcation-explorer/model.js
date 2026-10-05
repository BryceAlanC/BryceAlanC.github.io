/**
 * Pure mathematical model for the planar bifurcation explorer.
 *
 * The module has no DOM dependencies.  Every preset is an analytic
 * one-parameter family of planar autonomous systems
 *
 *     z' = F(z; μ),    z = (x, y).
 *
 * The exported helpers are shared by the browser visualizer and the Node
 * regression tests.  The local normal-form presets deliberately keep their
 * standard polynomial form; trajectories that leave a chosen viewport should
 * be stopped and respawned by the presentation layer rather than silently
 * changing the mathematics.
 */

const DEFAULT_TOLERANCE = 1e-9;
const TWO_PI = 2 * Math.PI;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(label + " must be finite");
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) throw new RangeError(label + " must be positive");
  return number;
}

function freezeRange(range, label) {
  if (!Array.isArray(range) || range.length < 2) {
    throw new TypeError(label + " must be a two-number array");
  }
  const minimum = finiteNumber(range[0], label + " minimum");
  const maximum = finiteNumber(range[1], label + " maximum");
  if (!(maximum > minimum)) throw new RangeError(label + " must have positive width");
  return Object.freeze([minimum, maximum]);
}

function freezeCriticalValue(event) {
  return Object.freeze({
    parameter: finiteNumber(event.parameter, "critical parameter"),
    type: String(event.type),
    label: String(event.label || event.type),
    scope: event.scope === "global" ? "global" : "local",
    genericity: String(event.genericity || "generic")
  });
}

function makePreset(definition) {
  const parameterRange = freezeRange(definition.parameterRange, "parameter range");
  const phaseWindow = Object.freeze({
    x: freezeRange(definition.phaseWindow.x, "phase x range"),
    y: freezeRange(definition.phaseWindow.y, "phase y range")
  });
  const observableRange = freezeRange(definition.observableRange, "observable range");

  return Object.freeze({
    id: String(definition.id),
    name: String(definition.name),
    shortName: String(definition.shortName || definition.name),
    formula: String(definition.formula),
    polarFormula: definition.polarFormula == null ? null : String(definition.polarFormula),
    description: String(definition.description || ""),
    lesson: String(definition.lesson || ""),
    scope: definition.scope === "global" ? "global" : "local",
    genericity: String(definition.genericity || "generic"),
    parameterSymbol: String(definition.parameterSymbol || "μ"),
    parameterDigits: clamp(Math.round(definition.parameterDigits == null ? 3 : finiteNumber(definition.parameterDigits, "parameter digits")), 0, 8),
    parameterRange,
    defaultParameter: finiteNumber(definition.defaultParameter, "default parameter"),
    phaseWindow,
    observable: String(definition.observable || "x"),
    observableLabel: String(definition.observableLabel || (definition.observable === "radius" ? "cycle radius ρ" : "equilibrium x")),
    observableRange,
    criticalValues: Object.freeze((definition.criticalValues || []).map(freezeCriticalValue)),
    variants: Object.freeze((definition.variants || []).map(String)),
    variant: definition.variant == null ? null : String(definition.variant),
    field: definition.field,
    jacobian: definition.jacobian,
    equilibria: definition.equilibria,
    cycles: definition.cycles,
    connections: definition.connections || (() => []),
    branches: definition.branches
  });
}

function signWithTolerance(value, tolerance = DEFAULT_TOLERANCE) {
  if (value > tolerance) return 1;
  if (value < -tolerance) return -1;
  return 0;
}

function dedupePoints(points, tolerance = 1e-8) {
  const result = [];
  for (const point of points) {
    const duplicate = result.some((other) =>
      Math.hypot(point.x - other.x, point.y - other.y) <= tolerance
    );
    if (!duplicate) result.push(point);
  }
  return result;
}

function saddleNodeDefinition() {
  return {
    id: "saddle-node",
    name: "Saddle-node of equilibria",
    shortName: "Saddle-node",
    formula: "ẋ = μ − x²,   ẏ = −y",
    description: "A stable node and a saddle collide and disappear.",
    lesson: "One real eigenvalue passes through zero while the transverse direction remains attracting.",
    scope: "local",
    genericity: "generic",
    parameterRange: [-1, 1],
    defaultParameter: 0.55,
    phaseWindow: { x: [-1.7, 1.7], y: [-1.25, 1.25] },
    observable: "x",
    observableRange: [-1.2, 1.2],
    criticalValues: [{ parameter: 0, type: "saddle-node", label: "Node–saddle collision", scope: "local" }],
    field(x, y, mu) {
      return [mu - x * x, -y];
    },
    jacobian(x) {
      return [[-2 * x, 0], [0, -1]];
    },
    equilibria(mu) {
      const relation = signWithTolerance(mu);
      if (relation < 0) return [];
      if (relation === 0) return [{ x: 0, y: 0, label: "Collision point" }];
      const root = Math.sqrt(mu);
      return [
        { x: -root, y: 0, label: "Saddle" },
        { x: root, y: 0, label: "Stable node" }
      ];
    },
    cycles() {
      return [];
    },
    branches(mu) {
      if (mu < -DEFAULT_TOLERANCE) return [];
      const root = Math.sqrt(Math.max(0, mu));
      return [
        { branchId: "saddle", kind: "equilibrium", x: -root, y: 0 },
        { branchId: "node", kind: "equilibrium", x: root, y: 0 }
      ];
    }
  };
}

function transcriticalDefinition() {
  return {
    id: "transcritical",
    name: "Transcritical exchange",
    shortName: "Transcritical",
    formula: "ẋ = μx − x²,   ẏ = −y",
    description: "Two persistent equilibrium branches cross and exchange stability.",
    lesson: "The crossing is sustained by an invariant branch and is not generic under arbitrary perturbations.",
    scope: "local",
    genericity: "structure-dependent",
    parameterRange: [-1.2, 1.2],
    defaultParameter: -0.7,
    phaseWindow: { x: [-1.6, 1.6], y: [-1.2, 1.2] },
    observable: "x",
    observableRange: [-1.35, 1.35],
    criticalValues: [{ parameter: 0, type: "transcritical", label: "Stability exchange", scope: "local", genericity: "structure-dependent" }],
    field(x, y, mu) {
      return [mu * x - x * x, -y];
    },
    jacobian(x, _y, mu) {
      return [[mu - 2 * x, 0], [0, -1]];
    },
    equilibria(mu) {
      return dedupePoints([
        { x: 0, y: 0, label: "Persistent branch" },
        { x: mu, y: 0, label: "Crossing branch" }
      ]);
    },
    cycles() {
      return [];
    },
    branches(mu) {
      return [
        { branchId: "persistent", kind: "equilibrium", x: 0, y: 0 },
        { branchId: "crossing", kind: "equilibrium", x: mu, y: 0 }
      ];
    }
  };
}

function pitchforkDefinition(variant = "supercritical") {
  const normalizedVariant = variant === "subcritical" ? "subcritical" : "supercritical";
  const cubicSign = normalizedVariant === "subcritical" ? 1 : -1;
  const isSubcritical = cubicSign > 0;

  return {
    id: "pitchfork",
    name: isSubcritical ? "Subcritical pitchfork" : "Supercritical pitchfork",
    shortName: "Pitchfork",
    formula: isSubcritical
      ? "ẋ = μx + x³,   ẏ = −y"
      : "ẋ = μx − x³,   ẏ = −y",
    description: isSubcritical
      ? "Two saddle branches collapse into a stable node as it loses stability."
      : "A stable node loses stability while two new stable nodes emerge.",
    lesson: "Reflection symmetry forces the paired branches; a generic asymmetric perturbation unfolds the pitchfork.",
    scope: "local",
    genericity: "symmetry-dependent",
    variants: ["supercritical", "subcritical"],
    variant: normalizedVariant,
    parameterRange: [-1.1, 1.1],
    defaultParameter: isSubcritical ? -0.65 : 0.65,
    phaseWindow: { x: [-1.55, 1.55], y: [-1.2, 1.2] },
    observable: "x",
    observableRange: [-1.2, 1.2],
    criticalValues: [{
      parameter: 0,
      type: isSubcritical ? "subcritical-pitchfork" : "supercritical-pitchfork",
      label: isSubcritical ? "Subcritical pitchfork" : "Supercritical pitchfork",
      scope: "local",
      genericity: "symmetry-dependent"
    }],
    field(x, y, mu) {
      return [mu * x + cubicSign * x * x * x, -y];
    },
    jacobian(x, _y, mu) {
      return [[mu + 3 * cubicSign * x * x, 0], [0, -1]];
    },
    equilibria(mu) {
      const points = [{ x: 0, y: 0, label: "Symmetric branch" }];
      const square = -mu / cubicSign;
      if (square > DEFAULT_TOLERANCE) {
        const root = Math.sqrt(square);
        points.push(
          { x: -root, y: 0, label: "Negative branch" },
          { x: root, y: 0, label: "Positive branch" }
        );
      }
      return points;
    },
    cycles() {
      return [];
    },
    branches(mu) {
      const result = [{ branchId: "symmetric", kind: "equilibrium", x: 0, y: 0 }];
      const square = -mu / cubicSign;
      if (square >= -DEFAULT_TOLERANCE) {
        const root = Math.sqrt(Math.max(0, square));
        result.push(
          { branchId: "negative", kind: "equilibrium", x: -root, y: 0 },
          { branchId: "positive", kind: "equilibrium", x: root, y: 0 }
        );
      }
      return result;
    }
  };
}

function supercriticalHopfDefinition() {
  return {
    id: "supercritical-hopf",
    name: "Supercritical Hopf",
    shortName: "Supercritical Hopf",
    formula: "ẋ = (μ − ρ²)x − y,   ẏ = x + (μ − ρ²)y",
    polarFormula: "ρ̇ = μρ − ρ³,   θ̇ = 1",
    description: "A stable focus becomes unstable while a stable periodic orbit grows from it.",
    lesson: "A complex-conjugate eigenvalue pair crosses the imaginary axis, creating oscillation with continuously growing amplitude.",
    scope: "local",
    genericity: "generic",
    parameterRange: [-1, 1.2],
    defaultParameter: 0.55,
    phaseWindow: { x: [-1.6, 1.6], y: [-1.6, 1.6] },
    observable: "radius",
    observableLabel: "amplitude ρ",
    observableRange: [0, 1.3],
    criticalValues: [{ parameter: 0, type: "supercritical-hopf", label: "Hopf point", scope: "local" }],
    field(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = mu - squareRadius;
      return [radialRate * x - y, x + radialRate * y];
    },
    jacobian(x, y, mu) {
      return [
        [mu - 3 * x * x - y * y, -1 - 2 * x * y],
        [1 - 2 * x * y, mu - x * x - 3 * y * y]
      ];
    },
    equilibria() {
      return [{ x: 0, y: 0, label: "Central focus" }];
    },
    cycles(mu) {
      if (mu <= DEFAULT_TOLERANCE) return [];
      return [{
        radius: Math.sqrt(mu),
        radialDerivative: -2 * mu,
        angularVelocity: 1,
        label: "Stable limit cycle"
      }];
    },
    branches(mu) {
      const result = [{ branchId: "origin", kind: "equilibrium", x: 0, y: 0, observable: 0 }];
      if (mu >= -DEFAULT_TOLERANCE) {
        result.push({
          branchId: "cycle",
          kind: "cycle",
          radius: Math.sqrt(Math.max(0, mu)),
          radialDerivative: mu > DEFAULT_TOLERANCE ? -2 * mu : 0,
          angularVelocity: 1
        });
      }
      return result;
    }
  };
}

function radialJacobian(x, y, radialRate, radialRateX, radialRateY) {
  return [
    [radialRate + x * radialRateX, -1 + x * radialRateY],
    [1 + y * radialRateX, radialRate + y * radialRateY]
  ];
}

function subcriticalHopfDefinition() {
  return {
    id: "subcritical-hopf",
    name: "Subcritical Hopf with saturation",
    shortName: "Subcritical Hopf",
    formula: "ẋ = (μ + ρ² − ρ⁴)x − y,   ẏ = x + (μ + ρ² − ρ⁴)y",
    polarFormula: "ρ̇ = ρ(μ + ρ² − ρ⁴),   θ̇ = 1",
    description: "An unstable inner cycle collapses into the focus; a stabilizing quintic term retains a bounded outer attractor.",
    lesson: "The local subcritical Hopf and the global fold of cycles together produce bistability and hysteresis.",
    scope: "local",
    genericity: "generic locally; globally completed",
    parameterRange: [-0.32, 0.18],
    defaultParameter: -0.12,
    phaseWindow: { x: [-1.45, 1.45], y: [-1.45, 1.45] },
    observable: "radius",
    observableLabel: "amplitude ρ",
    observableRange: [0, 1.25],
    criticalValues: [
      { parameter: -0.25, type: "fold-cycles", label: "Fold of limit cycles", scope: "global" },
      { parameter: 0, type: "subcritical-hopf", label: "Subcritical Hopf", scope: "local" }
    ],
    field(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = mu + squareRadius - squareRadius * squareRadius;
      return [radialRate * x - y, x + radialRate * y];
    },
    jacobian(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = mu + squareRadius - squareRadius * squareRadius;
      const common = 2 * (1 - 2 * squareRadius);
      return radialJacobian(x, y, radialRate, common * x, common * y);
    },
    equilibria() {
      return [{ x: 0, y: 0, label: "Central focus" }];
    },
    cycles(mu) {
      const discriminant = 1 + 4 * mu;
      if (discriminant < -DEFAULT_TOLERANCE) return [];
      const root = Math.sqrt(Math.max(0, discriminant));
      const squares = [(1 - root) / 2, (1 + root) / 2]
        .filter((value) => value > DEFAULT_TOLERANCE)
        .sort((left, right) => left - right);
      const uniqueSquares = squares.filter((value, index) => index === 0 || Math.abs(value - squares[index - 1]) > 1e-8);
      return uniqueSquares.map((squareRadius, index) => ({
        radius: Math.sqrt(squareRadius),
        radialDerivative: 2 * squareRadius * (1 - 2 * squareRadius),
        angularVelocity: 1,
        label: uniqueSquares.length === 1
          ? "Limit cycle"
          : index === 0 ? "Inner limit cycle" : "Outer limit cycle"
      }));
    },
    branches(mu) {
      const result = [{ branchId: "origin", kind: "equilibrium", x: 0, y: 0, observable: 0 }];
      const discriminant = 1 + 4 * mu;
      if (discriminant < -DEFAULT_TOLERANCE) return result;
      const root = Math.sqrt(Math.max(0, discriminant));
      const innerSquare = (1 - root) / 2;
      const outerSquare = (1 + root) / 2;
      if (innerSquare >= -DEFAULT_TOLERANCE && mu <= DEFAULT_TOLERANCE) {
        const squareRadius = Math.max(0, innerSquare);
        result.push({
          branchId: "inner-cycle",
          kind: "cycle",
          radius: Math.sqrt(squareRadius),
          radialDerivative: 2 * squareRadius * (1 - 2 * squareRadius),
          angularVelocity: 1
        });
      }
      if (outerSquare > DEFAULT_TOLERANCE) {
        result.push({
          branchId: "outer-cycle",
          kind: "cycle",
          radius: Math.sqrt(outerSquare),
          radialDerivative: 2 * outerSquare * (1 - 2 * outerSquare),
          angularVelocity: 1
        });
      }
      return result;
    }
  };
}

function foldCyclesDefinition() {
  return {
    id: "fold-cycles",
    name: "Saddle-node of limit cycles",
    shortName: "Fold of cycles",
    formula: "ẋ = [μ − (ρ² − 1)²]x − y,   ẏ = x + [μ − (ρ² − 1)²]y",
    polarFormula: "ρ̇ = ρ[μ − (ρ² − 1)²],   θ̇ = 1",
    description: "An attracting and a repelling periodic orbit collide while the central equilibrium remains unchanged.",
    lesson: "Periodic orbits can be created or destroyed in pairs without any equilibrium bifurcation.",
    scope: "global",
    genericity: "generic",
    parameterRange: [-0.2, 0.6],
    defaultParameter: 0.22,
    phaseWindow: { x: [-1.75, 1.75], y: [-1.75, 1.75] },
    observable: "radius",
    observableLabel: "cycle radius ρ",
    observableRange: [0, 1.5],
    criticalValues: [{ parameter: 0, type: "fold-cycles", label: "Cycle pair collision", scope: "global" }],
    field(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = mu - (squareRadius - 1) * (squareRadius - 1);
      return [radialRate * x - y, x + radialRate * y];
    },
    jacobian(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = mu - (squareRadius - 1) * (squareRadius - 1);
      const common = -4 * (squareRadius - 1);
      return radialJacobian(x, y, radialRate, common * x, common * y);
    },
    equilibria() {
      return [{ x: 0, y: 0, label: "Central focus" }];
    },
    cycles(mu) {
      if (mu < -DEFAULT_TOLERANCE) return [];
      const root = Math.sqrt(Math.max(0, mu));
      const squares = [1 - root, 1 + root]
        .filter((value) => value > DEFAULT_TOLERANCE)
        .sort((left, right) => left - right);
      const uniqueSquares = squares.filter((value, index) => index === 0 || Math.abs(value - squares[index - 1]) > 1e-8);
      return uniqueSquares.map((squareRadius, index) => ({
        radius: Math.sqrt(squareRadius),
        radialDerivative: -4 * squareRadius * (squareRadius - 1),
        angularVelocity: 1,
        label: uniqueSquares.length === 1
          ? "Semistable limit cycle"
          : index === 0 ? "Inner limit cycle" : "Outer limit cycle"
      }));
    },
    branches(mu) {
      const result = [{ branchId: "origin", kind: "equilibrium", x: 0, y: 0, observable: 0 }];
      if (mu < -DEFAULT_TOLERANCE || mu > 1 + DEFAULT_TOLERANCE) return result;
      const root = Math.sqrt(Math.max(0, mu));
      const innerSquare = 1 - root;
      const outerSquare = 1 + root;
      if (innerSquare >= -DEFAULT_TOLERANCE) {
        const squareRadius = Math.max(0, innerSquare);
        result.push({
          branchId: "inner-cycle",
          kind: "cycle",
          radius: Math.sqrt(squareRadius),
          radialDerivative: -4 * squareRadius * (squareRadius - 1),
          angularVelocity: 1
        });
      }
      result.push({
        branchId: "outer-cycle",
        kind: "cycle",
        radius: Math.sqrt(outerSquare),
        radialDerivative: -4 * outerSquare * (outerSquare - 1),
        angularVelocity: 1
      });
      return result;
    }
  };
}

function snicDefinition() {
  return {
    id: "snic",
    name: "Saddle-node on an invariant circle",
    shortName: "SNIC",
    formula: "ẋ = (1 − ρ²)x − (μ + 1 − x)y,   ẏ = (1 − ρ²)y + (μ + 1 − x)x",
    polarFormula: "ρ̇ = ρ(1 − ρ²),   θ̇ = μ + 1 − ρ cos θ",
    description: "A stable node and a saddle collide on an attracting invariant circle, releasing an oscillation of infinite period.",
    lesson: "The new periodic orbit has finite amplitude immediately, but its frequency starts at zero because trajectories linger near the vanished saddle-node.",
    scope: "global",
    genericity: "generic with an invariant circle",
    parameterRange: [-1.6, 1.2],
    defaultParameter: 0.28,
    phaseWindow: { x: [-1.45, 1.45], y: [-1.45, 1.45] },
    observable: "angle",
    observableLabel: "equilibrium angle θ / cycle frequency Ω",
    observableRange: [-Math.PI, Math.PI],
    criticalValues: [{
      parameter: 0,
      type: "snic",
      label: "Infinite-period onset",
      scope: "global",
      genericity: "generic with an invariant circle"
    }],
    field(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = 1 - squareRadius;
      const angularRate = mu + 1 - x;
      return [
        radialRate * x - angularRate * y,
        radialRate * y + angularRate * x
      ];
    },
    jacobian(x, y, mu) {
      const squareRadius = x * x + y * y;
      const radialRate = 1 - squareRadius;
      const angularRate = mu + 1 - x;
      return [
        [radialRate - 2 * x * x + y, -2 * x * y - angularRate],
        [-2 * x * y - x + angularRate, radialRate - 2 * y * y]
      ];
    },
    equilibria(mu) {
      const result = [{ x: 0, y: 0, label: "Interior repeller" }];
      if (mu < -2 - DEFAULT_TOLERANCE || mu > DEFAULT_TOLERANCE) return result;
      const x = clamp(1 + mu, -1, 1);
      const y = Math.sqrt(Math.max(0, 1 - x * x));
      result.push({ x, y, label: y <= DEFAULT_TOLERANCE ? "Saddle-node" : "Saddle" });
      if (y > DEFAULT_TOLERANCE) result.push({ x, y: -y, label: "Stable node" });
      return result;
    },
    cycles(mu) {
      if (mu <= DEFAULT_TOLERANCE) return [];
      const meanAngularVelocity = Math.sqrt(mu * (mu + 2));
      return [{
        radius: 1,
        radialDerivative: -2,
        angularVelocity: meanAngularVelocity,
        period: TWO_PI / meanAngularVelocity,
        label: "Stable infinite-period cycle"
      }];
    },
    branches(mu) {
      const result = [];
      if (mu >= -2 - DEFAULT_TOLERANCE && mu <= DEFAULT_TOLERANCE) {
        const x = clamp(1 + mu, -1, 1);
        const angle = Math.acos(x);
        result.push(
          { branchId: "circle-saddle", kind: "equilibrium", x, y: Math.sin(angle), observable: angle },
          { branchId: "circle-node", kind: "equilibrium", x, y: -Math.sin(angle), observable: -angle }
        );
      }
      if (mu >= -DEFAULT_TOLERANCE) {
        const meanAngularVelocity = mu > DEFAULT_TOLERANCE ? Math.sqrt(mu * (mu + 2)) : 0;
        result.push({
          branchId: "cycle-frequency",
          kind: "cycle",
          radius: 1,
          observable: meanAngularVelocity,
          radialDerivative: mu > DEFAULT_TOLERANCE ? -2 : 0,
          angularVelocity: meanAngularVelocity,
          period: meanAngularVelocity > 0 ? TWO_PI / meanAngularVelocity : Infinity
        });
      }
      return result;
    }
  };
}

// Strogatz, Nonlinear Dynamics and Chaos, section 8.4.  The saddle-loop
// parameter is numerical; the remaining ingredients below are computed from
// the displayed vector field rather than from a decorative surrogate.
export const HOMOCLINIC_PARAMETER = -0.86454525;

const saddleLoopEnvelope = Object.freeze([
  Object.freeze([-0.96000000, 0.54838457, 1.34187860, 6.82714461, -0.04617891]),
  Object.freeze([-0.95000000, 0.48788935, 1.37371359, 6.99815784, -0.05924207]),
  Object.freeze([-0.94000000, 0.43149541, 1.40075806, 7.18993632, -0.07470887]),
  Object.freeze([-0.93000000, 0.37794667, 1.42411726, 7.40830094, -0.09145262]),
  Object.freeze([-0.92000000, 0.32629499, 1.44452744, 7.66202908, -0.11064007]),
  Object.freeze([-0.91000000, 0.27572103, 1.46249179, 7.96515095, -0.13215372]),
  Object.freeze([-0.90000000, 0.22534125, 1.47840082, 8.34237686, -0.15763538]),
  Object.freeze([-0.89000000, 0.17399017, 1.49253915, 8.84340052, -0.19081153]),
  Object.freeze([-0.88000000, 0.11959770, 1.50515815, 9.59533004, -0.23535108]),
  Object.freeze([-0.87500000, 0.08984973, 1.51096301, 10.18355159, -0.26831196]),
  Object.freeze([-0.87000000, 0.05629442, 1.51649582, 11.16333107, -0.31661429]),
  Object.freeze([-0.86800000, 0.04069401, 1.51863564, 11.85245195, -0.34681484]),
  Object.freeze([-0.86600000, 0.02210735, 1.52075064, 13.16076990, -0.39630250]),
  Object.freeze([-0.86550000, 0.01644437, 1.52127103, 13.79911651, -0.41725820]),
  Object.freeze([-0.86500000, 0.00977543, 1.52179529, 14.92486339, -0.45095114]),
  Object.freeze([-0.86480000, 0.00651510, 1.52200131, 15.80526388, -0.47378555]),
  Object.freeze([-0.86465000, 0.00349893, 1.52215350, 17.15644309, -0.50417365]),
  Object.freeze([-0.86460000, 0.00222310, 1.52221118, 18.14261639, -0.52397209]),
  Object.freeze([HOMOCLINIC_PARAMETER, 0, 1.52227000, Infinity, -0.54])
]);

function interpolateSaddleLoopEnvelope(mu) {
  if (mu <= saddleLoopEnvelope[0][0]) {
    const [, minimumX, maximumX, period, transverseRate] = saddleLoopEnvelope[0];
    return { minimumX, maximumX, period, transverseRate };
  }
  const last = saddleLoopEnvelope.at(-1);
  if (mu >= last[0]) {
    const [, minimumX, maximumX, period, transverseRate] = last;
    return { minimumX, maximumX, period, transverseRate };
  }
  for (let index = 1; index < saddleLoopEnvelope.length; index += 1) {
    const right = saddleLoopEnvelope[index];
    if (mu > right[0]) continue;
    const left = saddleLoopEnvelope[index - 1];
    const amount = (mu - left[0]) / (right[0] - left[0]);
    const interpolate = (column) => {
      if (!Number.isFinite(right[column])) {
        if (column === 3 && mu < HOMOCLINIC_PARAMETER) {
          const unstableEigenvalue = (HOMOCLINIC_PARAMETER + Math.sqrt(HOMOCLINIC_PARAMETER ** 2 + 4)) / 2;
          return TWO_PI + Math.log((HOMOCLINIC_PARAMETER + 1) / (HOMOCLINIC_PARAMETER - mu)) / unstableEigenvalue;
        }
        return Infinity;
      }
      return left[column] + amount * (right[column] - left[column]);
    };
    return {
      minimumX: interpolate(1),
      maximumX: interpolate(2),
      period: interpolate(3),
      transverseRate: interpolate(4)
    };
  }
  return { minimumX: 0, maximumX: last[2], period: Infinity, transverseRate: last[4] };
}

function saddleLoopStep(x, y, mu, step) {
  const k1x = y;
  const k1y = mu * y + x - x * x + x * y;
  const x2 = x + step * k1x / 2;
  const y2 = y + step * k1y / 2;
  const k2x = y2;
  const k2y = mu * y2 + x2 - x2 * x2 + x2 * y2;
  const x3 = x + step * k2x / 2;
  const y3 = y + step * k2y / 2;
  const k3x = y3;
  const k3y = mu * y3 + x3 - x3 * x3 + x3 * y3;
  const x4 = x + step * k3x;
  const y4 = y + step * k3y;
  const k4x = y4;
  const k4y = mu * y4 + x4 - x4 * x4 + x4 * y4;
  return [
    x + step * (k1x + 2 * k2x + 2 * k3x + k4x) / 6,
    y + step * (k1y + 2 * k2y + 2 * k3y + k4y) / 6
  ];
}

function resampleOrbitPath(points, count = 241) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    ));
  }
  const total = distances.at(-1);
  if (!(total > 0)) return [points[0]];
  const result = [];
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    const target = total * index / (count - 1);
    while (segment < distances.length - 1 && distances[segment] < target) segment += 1;
    const startDistance = distances[segment - 1];
    const endDistance = distances[segment];
    const amount = endDistance === startDistance ? 0 : (target - startDistance) / (endDistance - startDistance);
    result.push({
      x: points[segment - 1].x + amount * (points[segment].x - points[segment - 1].x),
      y: points[segment - 1].y + amount * (points[segment].y - points[segment - 1].y)
    });
  }
  return result;
}

const saddleLoopCycleCache = new Map();

function numericalSaddleLoopCycle(mu) {
  const key = mu.toFixed(6);
  if (saddleLoopCycleCache.has(key)) return saddleLoopCycleCache.get(key);

  const step = 0.02;
  const maximumSteps = Math.ceil(160 / step);
  let x = 1.35;
  let y = 0;
  let previousX = x;
  let previousY = y;
  let previousCrossingTime = null;
  let previousCrossingX = null;
  let crossingCount = 0;
  let segment = [{ x, y }];
  let candidate = null;

  for (let index = 1; index <= maximumSteps; index += 1) {
    previousX = x;
    previousY = y;
    [x, y] = saddleLoopStep(x, y, mu, step);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 12) break;
    segment.push({ x, y });

    if (previousY < 0 && y >= 0) {
      const fraction = -previousY / (y - previousY);
      const crossingX = previousX + fraction * (x - previousX);
      const crossingTime = (index - 1 + fraction) * step;
      const crossing = { x: crossingX, y: 0 };
      segment[segment.length - 1] = crossing;
      crossingCount += 1;

      if (previousCrossingTime != null) {
        candidate = {
          points: segment,
          period: crossingTime - previousCrossingTime
        };
        if (crossingCount >= 4 && Math.abs(crossingX - previousCrossingX) < 2e-5) break;
      }
      previousCrossingTime = crossingTime;
      previousCrossingX = crossingX;
      segment = [crossing];
    }
  }

  if (!candidate || candidate.points.length < 4 || !(candidate.period > 0)) return null;
  const averageX = candidate.points.reduce((sum, point) => sum + point.x, 0) / candidate.points.length;
  const transverseRate = mu + averageX;
  const floquetMultiplier = Math.exp(transverseRate * candidate.period);
  const path = resampleOrbitPath(candidate.points);
  const radius = Math.max(...path.map((point) => Math.hypot(point.x, point.y)));
  const result = {
    radius,
    path,
    radialDerivative: transverseRate,
    angularVelocity: TWO_PI / candidate.period,
    period: candidate.period,
    floquetMultiplier,
    stability: "stable",
    orbitType: "cycle",
    label: "Attracting limit cycle"
  };
  saddleLoopCycleCache.set(key, result);
  if (saddleLoopCycleCache.size > 128) saddleLoopCycleCache.delete(saddleLoopCycleCache.keys().next().value);
  return result;
}

let cachedHomoclinicLoop = null;

function numericalHomoclinicLoop() {
  if (cachedHomoclinicLoop) return cachedHomoclinicLoop;
  const nearbyCycle = numericalSaddleLoopCycle(HOMOCLINIC_PARAMETER - 0.000055);
  const path = nearbyCycle.path.map((point) => ({ x: point.x, y: point.y }));
  path[0] = { x: 0, y: 0 };
  path[path.length - 1] = { x: 0, y: 0 };
  cachedHomoclinicLoop = {
    radius: nearbyCycle.radius,
    path,
    radialDerivative: -0.54,
    angularVelocity: 0,
    period: Infinity,
    floquetMultiplier: NaN,
    stability: "critical",
    orbitType: "homoclinic",
    label: "Homoclinic saddle loop"
  };
  return cachedHomoclinicLoop;
}

function homoclinicDefinition() {
  return {
    id: "homoclinic",
    name: "Homoclinic saddle-loop bifurcation",
    shortName: "Homoclinic loop",
    formula: "ẋ = y,   ẏ = μy + x − x² + xy",
    description: "As μ increases, an attracting limit cycle grows into the saddle at the origin, forming a homoclinic loop; after the collision, the cycle is gone.",
    lesson: "This is a global bifurcation: the equilibria do not collide, but the cycle period diverges because each lap spends longer near the saddle.",
    scope: "global",
    genericity: "generic, codimension one",
    parameterDigits: 4,
    parameterRange: [-0.96, -0.78],
    defaultParameter: -0.92,
    phaseWindow: { x: [-0.3, 1.78], y: [-0.95, 0.72] },
    observable: "x",
    observableLabel: "x (equilibria and orbit extrema)",
    observableRange: [-0.12, 1.66],
    criticalValues: [{
      parameter: HOMOCLINIC_PARAMETER,
      type: "homoclinic",
      label: "Cycle–saddle collision",
      scope: "global",
      genericity: "generic, codimension one"
    }],
    field(x, y, mu) {
      return [y, mu * y + x - x * x + x * y];
    },
    jacobian(x, y, mu) {
      return [[0, 1], [1 - 2 * x + y, mu + x]];
    },
    equilibria() {
      return [
        { x: 0, y: 0, label: "Saddle" },
        { x: 1, y: 0, label: "Central focus" }
      ];
    },
    cycles(mu) {
      if (mu <= -1 + DEFAULT_TOLERANCE || mu >= HOMOCLINIC_PARAMETER) return [];
      const cycle = numericalSaddleLoopCycle(mu);
      return cycle ? [cycle] : [];
    },
    connections(mu) {
      return Math.abs(mu - HOMOCLINIC_PARAMETER) <= 5e-8
        ? [numericalHomoclinicLoop()]
        : [];
    },
    branches(mu) {
      const result = [
        { branchId: "saddle", kind: "equilibrium", x: 0, y: 0, observable: 0 },
        { branchId: "focus", kind: "equilibrium", x: 1, y: 0, observable: 1 }
      ];
      if (mu <= -1 || mu > HOMOCLINIC_PARAMETER + 1e-10) return result;
      const envelope = interpolateSaddleLoopEnvelope(mu);
      const atLoop = Math.abs(mu - HOMOCLINIC_PARAMETER) <= 1e-8;
      const radius = Math.max(0.01, (envelope.maximumX - envelope.minimumX) / 2);
      const common = {
        kind: "cycle",
        radius,
        radialDerivative: envelope.transverseRate,
        angularVelocity: Number.isFinite(envelope.period) ? TWO_PI / envelope.period : 0,
        period: envelope.period
      };
      result.push(
        { ...common, branchId: "cycle-minimum-x", observable: atLoop ? 0 : envelope.minimumX },
        { ...common, branchId: "cycle-maximum-x", observable: envelope.maximumX }
      );
      return result;
    }
  };
}

const definitions = Object.freeze({
  "saddle-node": saddleNodeDefinition,
  transcritical: transcriticalDefinition,
  pitchfork: pitchforkDefinition,
  "supercritical-hopf": supercriticalHopfDefinition,
  "subcritical-hopf": subcriticalHopfDefinition,
  "fold-cycles": foldCyclesDefinition,
  homoclinic: homoclinicDefinition,
  snic: snicDefinition
});

export const PRESET_IDS = Object.freeze(Object.keys(definitions));

export const PRESETS = Object.freeze(Object.fromEntries(
  PRESET_IDS.map((id) => [id, makePreset(definitions[id]())])
));

export function createPreset(id = "supercritical-hopf", options = {}) {
  const normalizedId = String(id);
  const factory = definitions[normalizedId];
  if (!factory) throw new RangeError("Unknown planar bifurcation preset: " + normalizedId);
  if (normalizedId === "pitchfork") return makePreset(factory(options.variant));
  return PRESETS[normalizedId];
}

function resolvePreset(presetOrId) {
  if (typeof presetOrId === "string") return createPreset(presetOrId);
  if (!presetOrId || typeof presetOrId.field !== "function" || typeof presetOrId.jacobian !== "function") {
    throw new TypeError("Expected a preset id or planar preset object");
  }
  return presetOrId;
}

export function fieldAt(presetOrId, x, y, parameter) {
  const preset = resolvePreset(presetOrId);
  const stateX = finiteNumber(x, "x");
  const stateY = finiteNumber(y, "y");
  const mu = finiteNumber(parameter, "parameter");
  const value = preset.field(stateX, stateY, mu);
  if (!Array.isArray(value) || value.length < 2) throw new TypeError("A vector field must return [dx, dy]");
  return Object.freeze([
    finiteNumber(value[0], "dx/dt"),
    finiteNumber(value[1], "dy/dt")
  ]);
}

export const evaluateField = fieldAt;

export function jacobianAt(presetOrId, x, y, parameter) {
  const preset = resolvePreset(presetOrId);
  const matrix = preset.jacobian(
    finiteNumber(x, "x"),
    finiteNumber(y, "y"),
    finiteNumber(parameter, "parameter")
  );
  if (!Array.isArray(matrix) || matrix.length < 2 || !Array.isArray(matrix[0]) || !Array.isArray(matrix[1])) {
    throw new TypeError("A Jacobian must be a 2 by 2 array");
  }
  return Object.freeze([
    Object.freeze([finiteNumber(matrix[0][0], "J11"), finiteNumber(matrix[0][1], "J12")]),
    Object.freeze([finiteNumber(matrix[1][0], "J21"), finiteNumber(matrix[1][1], "J22")])
  ]);
}

export function eigenvalues2x2(matrix, options = {}) {
  if (!Array.isArray(matrix) || matrix.length < 2 || !Array.isArray(matrix[0]) || !Array.isArray(matrix[1])) {
    throw new TypeError("matrix must be a 2 by 2 array");
  }
  const a = finiteNumber(matrix[0][0], "matrix entry");
  const b = finiteNumber(matrix[0][1], "matrix entry");
  const c = finiteNumber(matrix[1][0], "matrix entry");
  const d = finiteNumber(matrix[1][1], "matrix entry");
  const tolerance = options.tolerance == null
    ? DEFAULT_TOLERANCE
    : positiveNumber(options.tolerance, "tolerance");
  const trace = a + d;
  const determinant = a * d - b * c;
  const discriminant = trace * trace - 4 * determinant;
  let eigenvalues;

  if (discriminant >= -tolerance) {
    const root = Math.sqrt(Math.max(0, discriminant));
    eigenvalues = [
      Object.freeze({ re: (trace + root) / 2, im: 0 }),
      Object.freeze({ re: (trace - root) / 2, im: 0 })
    ];
  } else {
    const imaginary = Math.sqrt(-discriminant) / 2;
    eigenvalues = [
      Object.freeze({ re: trace / 2, im: imaginary }),
      Object.freeze({ re: trace / 2, im: -imaginary })
    ];
  }

  return Object.freeze({
    trace,
    determinant,
    discriminant,
    eigenvalues: Object.freeze(eigenvalues)
  });
}

export function classifyLinearization(matrix, options = {}) {
  const tolerance = options.tolerance == null
    ? DEFAULT_TOLERANCE
    : positiveNumber(options.tolerance, "tolerance");
  const spectral = eigenvalues2x2(matrix, { tolerance });
  const determinantSign = signWithTolerance(spectral.determinant, tolerance);
  const traceSign = signWithTolerance(spectral.trace, tolerance);
  const discriminantSign = signWithTolerance(spectral.discriminant, tolerance);

  let type;
  let kind;
  let stability;
  let hyperbolic;

  if (determinantSign < 0) {
    type = "saddle";
    kind = "saddle";
    stability = "saddle";
    hyperbolic = true;
  } else if (determinantSign === 0 || (traceSign === 0 && determinantSign > 0)) {
    type = "nonhyperbolic";
    kind = determinantSign > 0 && discriminantSign < 0 ? "center-or-hopf" : "degenerate";
    stability = "nonhyperbolic";
    hyperbolic = false;
  } else {
    const focus = discriminantSign < 0;
    kind = focus ? "focus" : "node";
    if (traceSign < 0) {
      type = focus ? "stable-focus" : "stable-node";
      stability = "stable";
      hyperbolic = true;
    } else if (traceSign > 0) {
      type = focus ? "unstable-focus" : "unstable-node";
      stability = "unstable";
      hyperbolic = true;
    } else {
      type = "nonhyperbolic";
      stability = "nonhyperbolic";
      hyperbolic = false;
    }
  }

  return Object.freeze({
    type,
    kind,
    stability,
    hyperbolic,
    trace: spectral.trace,
    determinant: spectral.determinant,
    discriminant: spectral.discriminant,
    eigenvalues: spectral.eigenvalues
  });
}

export function classifyEquilibrium(presetOrId, point, parameter, options = {}) {
  if (!point || typeof point !== "object") throw new TypeError("point must contain x and y");
  const matrix = jacobianAt(presetOrId, point.x, point.y, parameter);
  return classifyLinearization(matrix, options);
}

export function equilibriaAt(presetOrId, parameter, options = {}) {
  const preset = resolvePreset(presetOrId);
  const mu = finiteNumber(parameter, "parameter");
  const tolerance = options.tolerance == null ? 1e-8 : positiveNumber(options.tolerance, "tolerance");
  const raw = dedupePoints(preset.equilibria(mu), tolerance);
  return Object.freeze(raw.map((point) => {
    const x = finiteNumber(point.x, "equilibrium x");
    const y = finiteNumber(point.y, "equilibrium y");
    const jacobian = jacobianAt(preset, x, y, mu);
    const classification = classifyLinearization(jacobian, { tolerance });
    return Object.freeze({
      x,
      y,
      label: String(point.label || "Equilibrium"),
      jacobian,
      classification,
      type: classification.type,
      kind: classification.kind,
      stability: classification.stability,
      eigenvalues: classification.eigenvalues
    });
  }));
}

function cycleStability(radialDerivative, tolerance = DEFAULT_TOLERANCE) {
  if (radialDerivative < -tolerance) return "stable";
  if (radialDerivative > tolerance) return "unstable";
  return "semistable";
}

function normalizeOrbitPath(rawPath, label = "orbit path") {
  if (rawPath == null) return null;
  if (!Array.isArray(rawPath) || rawPath.length < 2) {
    throw new TypeError(label + " must contain at least two points");
  }
  return Object.freeze(rawPath.map((point) => Object.freeze({
    x: finiteNumber(point.x, label + " x"),
    y: finiteNumber(point.y, label + " y")
  })));
}

function enrichCycle(raw, tolerance = DEFAULT_TOLERANCE) {
  const path = normalizeOrbitPath(raw.path, "cycle path");
  const inferredRadius = path == null ? NaN : Math.max(...path.map((point) => Math.hypot(point.x, point.y)));
  const radius = finiteNumber(raw.radius == null ? inferredRadius : raw.radius, "cycle radius");
  if (!(radius > 0)) throw new RangeError("A limit cycle radius must be positive");
  const radialDerivative = finiteNumber(raw.radialDerivative, "radial derivative");
  const angularVelocity = finiteNumber(raw.angularVelocity == null ? 1 : raw.angularVelocity, "angular velocity");
  const period = raw.period == null
    ? TWO_PI / Math.abs(angularVelocity)
    : raw.period === Infinity ? Infinity : positiveNumber(raw.period, "cycle period");
  const stability = ["stable", "unstable", "semistable"].includes(raw.stability)
    ? raw.stability
    : cycleStability(radialDerivative, tolerance);
  const floquetMultiplier = raw.floquetMultiplier == null
    ? (Number.isFinite(period) ? Math.exp(radialDerivative * period) : NaN)
    : finiteNumber(raw.floquetMultiplier, "Floquet multiplier");
  return Object.freeze({
    radius,
    path,
    radialDerivative,
    angularVelocity,
    period,
    floquetMultiplier,
    stability,
    label: String(raw.label || "Limit cycle")
  });
}

export function cyclesAt(presetOrId, parameter, options = {}) {
  const preset = resolvePreset(presetOrId);
  const mu = finiteNumber(parameter, "parameter");
  const tolerance = options.tolerance == null ? DEFAULT_TOLERANCE : positiveNumber(options.tolerance, "tolerance");
  return Object.freeze(preset.cycles(mu).map((cycle) => enrichCycle(cycle, tolerance)));
}

export function connectionsAt(presetOrId, parameter) {
  const preset = resolvePreset(presetOrId);
  const mu = finiteNumber(parameter, "parameter");
  return Object.freeze(preset.connections(mu).map((raw) => {
    const path = normalizeOrbitPath(raw.path, "connection path");
    if (!path) throw new TypeError("A global connection must provide a path");
    return Object.freeze({
      path,
      radius: finiteNumber(raw.radius == null
        ? Math.max(...path.map((point) => Math.hypot(point.x, point.y)))
        : raw.radius, "connection radius"),
      type: String(raw.orbitType || raw.type || "connection"),
      period: Infinity,
      label: String(raw.label || "Global connection")
    });
  }));
}

function normalizeState(state, label = "state") {
  if (Array.isArray(state) && state.length >= 2) {
    return [finiteNumber(state[0], label + " x"), finiteNumber(state[1], label + " y")];
  }
  if (state && typeof state === "object") {
    return [finiteNumber(state.x, label + " x"), finiteNumber(state.y, label + " y")];
  }
  throw new TypeError(label + " must be [x, y] or an object with x and y");
}

export function rk4Step(presetOrId, state, parameter, dt) {
  const preset = resolvePreset(presetOrId);
  const start = normalizeState(state);
  const mu = finiteNumber(parameter, "parameter");
  const step = finiteNumber(dt, "time step");
  if (step === 0) return Object.freeze({ x: start[0], y: start[1] });

  const k1 = preset.field(start[0], start[1], mu);
  const k2 = preset.field(
    start[0] + step * k1[0] / 2,
    start[1] + step * k1[1] / 2,
    mu
  );
  const k3 = preset.field(
    start[0] + step * k2[0] / 2,
    start[1] + step * k2[1] / 2,
    mu
  );
  const k4 = preset.field(
    start[0] + step * k3[0],
    start[1] + step * k3[1],
    mu
  );

  return Object.freeze({
    x: start[0] + step * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6,
    y: start[1] + step * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6
  });
}

function outsideBounds(point, bounds) {
  if (!bounds) return false;
  return point.x < bounds.x[0] || point.x > bounds.x[1]
    || point.y < bounds.y[0] || point.y > bounds.y[1];
}

export function integrateTrajectory(presetOrId, options = {}) {
  const preset = resolvePreset(presetOrId);
  const initial = normalizeState(options.initial || [0.5, 0]);
  const parameter = finiteNumber(
    options.parameter == null ? preset.defaultParameter : options.parameter,
    "parameter"
  );
  const duration = options.duration == null ? 12 : positiveNumber(options.duration, "duration");
  const requestedStep = options.dt == null ? 0.01 : positiveNumber(Math.abs(options.dt), "time step");
  const direction = options.direction === -1 || Number(options.dt) < 0 ? -1 : 1;
  const maxRadius = options.maxRadius == null ? 50 : positiveNumber(options.maxRadius, "maximum radius");
  const sampleEvery = Math.max(1, Math.round(options.sampleEvery == null ? 1 : positiveNumber(options.sampleEvery, "sample interval")));
  const bounds = options.bounds == null ? null : {
    x: freezeRange(options.bounds.x, "integration x bounds"),
    y: freezeRange(options.bounds.y, "integration y bounds")
  };

  let state = { x: initial[0], y: initial[1] };
  let time = 0;
  let status = "completed";
  const points = [Object.freeze({ t: 0, x: state.x, y: state.y })];
  const maximumSteps = Math.ceil(duration / requestedStep);

  for (let index = 1; index <= maximumSteps; index += 1) {
    const remaining = duration - Math.abs(time);
    const stepMagnitude = Math.min(requestedStep, remaining);
    if (!(stepMagnitude > 0)) break;
    const step = direction * stepMagnitude;
    state = rk4Step(preset, state, parameter, step);
    time += step;

    if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
      status = "non-finite";
      break;
    }
    if (Math.hypot(state.x, state.y) > maxRadius || outsideBounds(state, bounds)) {
      status = "escaped";
      points.push(Object.freeze({ t: time, x: state.x, y: state.y }));
      break;
    }
    if (index % sampleEvery === 0 || index === maximumSteps || Math.abs(time) >= duration - 1e-14) {
      points.push(Object.freeze({ t: time, x: state.x, y: state.y }));
    }
  }

  return Object.freeze({
    presetId: preset.id,
    parameter,
    status,
    duration: Math.abs(time),
    direction,
    points: Object.freeze(points),
    final: Object.freeze({ x: state.x, y: state.y })
  });
}

function sampleParameters(range, count, criticalValues) {
  const minimum = range[0];
  const maximum = range[1];
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(minimum + (maximum - minimum) * index / (count - 1));
  }
  for (const event of criticalValues) {
    if (event.parameter >= minimum && event.parameter <= maximum) values.push(event.parameter);
  }
  values.sort((left, right) => left - right);
  return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > 1e-12);
}

export function sampleBranches(presetOrId, options = {}) {
  const preset = resolvePreset(presetOrId);
  const range = options.parameterRange == null
    ? preset.parameterRange
    : freezeRange(options.parameterRange, "branch parameter range");
  const count = clamp(Math.round(options.samples == null ? 181 : positiveNumber(options.samples, "branch samples")), 2, 5001);
  const parameters = sampleParameters(range, count, preset.criticalValues);
  const branchMap = new Map();

  for (const parameter of parameters) {
    for (const raw of preset.branches(parameter)) {
      const branchId = String(raw.branchId);
      let point;
      if (raw.kind === "cycle") {
        const radius = Math.max(0, finiteNumber(raw.radius, "branch cycle radius"));
        const radialDerivative = finiteNumber(raw.radialDerivative, "branch radial derivative");
        const angularVelocity = finiteNumber(raw.angularVelocity == null ? 1 : raw.angularVelocity, "branch angular velocity");
        const period = raw.period == null
          ? (Math.abs(angularVelocity) > DEFAULT_TOLERANCE ? TWO_PI / Math.abs(angularVelocity) : Infinity)
          : Number(raw.period);
        point = Object.freeze({
          parameter,
          kind: "cycle",
          observable: raw.observable == null ? radius : finiteNumber(raw.observable, "branch observable"),
          radius,
          stability: radius <= DEFAULT_TOLERANCE ? "nonhyperbolic" : cycleStability(radialDerivative),
          radialDerivative,
          period
        });
      } else {
        const x = finiteNumber(raw.x, "branch equilibrium x");
        const y = finiteNumber(raw.y, "branch equilibrium y");
        const classification = classifyEquilibrium(preset, { x, y }, parameter);
        point = Object.freeze({
          parameter,
          kind: "equilibrium",
          observable: raw.observable == null
            ? (preset.observable === "radius"
              ? Math.hypot(x, y)
              : preset.observable === "y" ? y
                : preset.observable === "angle" ? Math.atan2(y, x) : x)
            : finiteNumber(raw.observable, "branch observable"),
          x,
          y,
          stability: classification.stability,
          type: classification.type,
          eigenvalues: classification.eigenvalues
        });
      }

      if (!branchMap.has(branchId)) {
        branchMap.set(branchId, { id: branchId, kind: point.kind, points: [] });
      }
      branchMap.get(branchId).points.push(point);
    }
  }

  const branches = Array.from(branchMap.values(), (branch) => Object.freeze({
    id: branch.id,
    kind: branch.kind,
    points: Object.freeze(branch.points)
  }));

  return Object.freeze({
    presetId: preset.id,
    observable: preset.observable,
    observableLabel: preset.observableLabel,
    parameterRange: Object.freeze([range[0], range[1]]),
    criticalValues: preset.criticalValues,
    branches: Object.freeze(branches)
  });
}

export const sampleBranchDiagram = sampleBranches;

export function sampleVectorField(presetOrId, parameter, options = {}) {
  const preset = resolvePreset(presetOrId);
  const mu = finiteNumber(parameter, "parameter");
  const xRange = options.xRange == null ? preset.phaseWindow.x : freezeRange(options.xRange, "field x range");
  const yRange = options.yRange == null ? preset.phaseWindow.y : freezeRange(options.yRange, "field y range");
  const columns = clamp(Math.round(options.columns == null ? 21 : positiveNumber(options.columns, "field columns")), 2, 101);
  const rows = clamp(Math.round(options.rows == null ? 21 : positiveNumber(options.rows, "field rows")), 2, 101);
  const normalize = options.normalize !== false;
  const points = [];

  for (let row = 0; row < rows; row += 1) {
    const y = yRange[0] + (yRange[1] - yRange[0]) * row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * column / (columns - 1);
      const value = fieldAt(preset, x, y, mu);
      const speed = Math.hypot(value[0], value[1]);
      const scale = normalize && speed > 0 ? 1 / speed : 1;
      points.push(Object.freeze({
        x,
        y,
        dx: value[0],
        dy: value[1],
        ux: value[0] * scale,
        uy: value[1] * scale,
        speed
      }));
    }
  }

  return Object.freeze({
    presetId: preset.id,
    parameter: mu,
    xRange: Object.freeze([xRange[0], xRange[1]]),
    yRange: Object.freeze([yRange[0], yRange[1]]),
    columns,
    rows,
    points: Object.freeze(points)
  });
}

export default Object.freeze({
  PRESET_IDS,
  PRESETS,
  createPreset,
  fieldAt,
  evaluateField,
  jacobianAt,
  eigenvalues2x2,
  classifyLinearization,
  classifyEquilibrium,
  equilibriaAt,
  cyclesAt,
  connectionsAt,
  rk4Step,
  integrateTrajectory,
  sampleBranches,
  sampleBranchDiagram,
  sampleVectorField
});
