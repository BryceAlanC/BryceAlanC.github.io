import assert from "node:assert/strict";
import * as model from "./model.js";

function near(actual, expected, tolerance = 1e-7, message = "values differ") {
  assert.ok(Number.isFinite(actual), message + ": actual value is not finite");
  assert.ok(Math.abs(actual - expected) <= tolerance, message + ": " + actual + " vs " + expected);
}

function findPoint(points, predicate, message = "point not found") {
  const point = points.find(predicate);
  assert.ok(point, message);
  return point;
}

function numericalJacobian(preset, x, y, mu, step = 1e-6) {
  const plusX = model.fieldAt(preset, x + step, y, mu);
  const minusX = model.fieldAt(preset, x - step, y, mu);
  const plusY = model.fieldAt(preset, x, y + step, mu);
  const minusY = model.fieldAt(preset, x, y - step, mu);
  return [
    [(plusX[0] - minusX[0]) / (2 * step), (plusY[0] - minusY[0]) / (2 * step)],
    [(plusX[1] - minusX[1]) / (2 * step), (plusY[1] - minusY[1]) / (2 * step)]
  ];
}

assert.deepEqual(model.PRESET_IDS, [
  "saddle-node",
  "transcritical",
  "pitchfork",
  "supercritical-hopf",
  "subcritical-hopf-normal-form",
  "subcritical-hopf",
  "fold-cycles",
  "homoclinic",
  "snic",
  "varying-speed-hopf"
]);
assert.equal(model.createPreset().id, "supercritical-hopf");
assert.equal(model.PRESETS["supercritical-hopf"], model.createPreset("supercritical-hopf"));
assert.ok(Object.isFrozen(model.PRESETS));
for (const id of model.PRESET_IDS) {
  const preset = model.createPreset(id);
  assert.equal(preset.id, id);
  assert.ok(Object.isFrozen(preset));
  assert.ok(preset.parameterRange[0] < preset.parameterRange[1]);
  assert.ok(preset.phaseWindow.x[0] < preset.phaseWindow.x[1]);
  assert.ok(preset.phaseWindow.y[0] < preset.phaseWindow.y[1]);
  assert.ok(preset.defaultParameter >= preset.parameterRange[0]);
  assert.ok(preset.defaultParameter <= preset.parameterRange[1]);
  assert.equal(typeof preset.field, "function");
  assert.equal(typeof preset.jacobian, "function");
}
assert.throws(() => model.createPreset("not-a-preset"), /Unknown planar bifurcation preset/);

{
  const saddle = model.classifyLinearization([[2, 0], [0, -3]]);
  assert.equal(saddle.type, "saddle");
  assert.equal(saddle.stability, "saddle");
  assert.equal(saddle.hyperbolic, true);

  const stableFocus = model.classifyLinearization([[-1, -2], [2, -1]]);
  assert.equal(stableFocus.type, "stable-focus");
  near(stableFocus.eigenvalues[0].re, -1);
  near(Math.abs(stableFocus.eigenvalues[0].im), 2);

  const hopfPoint = model.classifyLinearization([[0, -1], [1, 0]]);
  assert.equal(hopfPoint.type, "nonhyperbolic");
  assert.equal(hopfPoint.kind, "center-or-hopf");
  near(hopfPoint.determinant, 1);
  near(hopfPoint.eigenvalues[0].im, 1);
  near(hopfPoint.eigenvalues[1].im, -1);
}

{
  const preset = model.createPreset("saddle-node");
  assert.deepEqual(model.fieldAt(preset, 2, 0.5, 0.25), [-3.75, -0.5]);
  assert.deepEqual(model.jacobianAt(preset, 2, 0.5, 0.25), [[-4, 0], [0, -1]]);
  assert.equal(model.equilibriaAt(preset, -0.2).length, 0);

  const positive = model.equilibriaAt(preset, 0.64);
  assert.equal(positive.length, 2);
  const saddle = findPoint(positive, (point) => point.x < 0);
  const node = findPoint(positive, (point) => point.x > 0);
  near(saddle.x, -0.8);
  near(node.x, 0.8);
  assert.equal(saddle.type, "saddle");
  assert.equal(node.type, "stable-node");

  const collision = model.equilibriaAt(preset, 0);
  assert.equal(collision.length, 1);
  assert.equal(collision[0].stability, "nonhyperbolic");
  near(collision[0].eigenvalues[0].re, 0);
}

{
  const preset = model.createPreset("transcritical");
  const negative = model.equilibriaAt(preset, -1);
  assert.equal(findPoint(negative, (point) => Math.abs(point.x) < 1e-10).type, "stable-node");
  assert.equal(findPoint(negative, (point) => Math.abs(point.x + 1) < 1e-10).type, "saddle");

  const positive = model.equilibriaAt(preset, 1);
  assert.equal(findPoint(positive, (point) => Math.abs(point.x) < 1e-10).type, "saddle");
  assert.equal(findPoint(positive, (point) => Math.abs(point.x - 1) < 1e-10).type, "stable-node");

  const crossing = model.equilibriaAt(preset, 0);
  assert.equal(crossing.length, 1, "coincident analytic branches should be deduplicated as an equilibrium");
  assert.equal(crossing[0].type, "nonhyperbolic");
}

{
  const supercritical = model.createPreset("pitchfork");
  assert.equal(supercritical.variant, "supercritical");
  const after = model.equilibriaAt(supercritical, 1);
  assert.equal(after.length, 3);
  assert.equal(findPoint(after, (point) => point.x === 0).type, "saddle");
  assert.equal(findPoint(after, (point) => point.x < 0).type, "stable-node");
  assert.equal(findPoint(after, (point) => point.x > 0).type, "stable-node");
  assert.equal(model.equilibriaAt(supercritical, -1)[0].type, "stable-node");

  const subcritical = model.createPreset("pitchfork", { variant: "subcritical" });
  assert.equal(subcritical.variant, "subcritical");
  const before = model.equilibriaAt(subcritical, -1);
  assert.equal(before.length, 3);
  assert.equal(findPoint(before, (point) => point.x === 0).type, "stable-node");
  assert.equal(findPoint(before, (point) => point.x < 0).type, "saddle");
  assert.equal(findPoint(before, (point) => point.x > 0).type, "saddle");
  assert.equal(model.equilibriaAt(subcritical, 1)[0].type, "saddle");
}

{
  const preset = model.createPreset("supercritical-hopf");
  assert.equal(model.equilibriaAt(preset, -0.4)[0].type, "stable-focus");
  assert.equal(model.equilibriaAt(preset, 0.4)[0].type, "unstable-focus");
  assert.equal(model.equilibriaAt(preset, 0)[0].kind, "center-or-hopf");
  assert.equal(model.cyclesAt(preset, -0.1).length, 0);

  const cycles = model.cyclesAt(preset, 0.49);
  assert.equal(cycles.length, 1);
  near(cycles[0].radius, 0.7);
  assert.equal(cycles[0].stability, "stable");
  near(cycles[0].period, 2 * Math.PI);

  const vector = model.fieldAt(preset, 1, 0, 0.25);
  near(vector[0], -0.75);
  near(vector[1], 1);
}

{
  const preset = model.createPreset("subcritical-hopf-normal-form");
  assert.equal(model.equilibriaAt(preset, -0.25)[0].type, "stable-focus");
  assert.equal(model.equilibriaAt(preset, 0)[0].kind, "center-or-hopf");
  assert.equal(model.equilibriaAt(preset, 0.25)[0].type, "unstable-focus");
  assert.deepEqual(model.cyclesAt(preset, 0), []);
  assert.deepEqual(model.cyclesAt(preset, 0.25), []);
  const [orbit] = model.cyclesAt(preset, -0.25);
  assert.equal(model.cyclesAt(preset, -0.25).length, 1);
  near(orbit.radius, 0.5);
  near(orbit.period, 2 * Math.PI);
  near(orbit.floquetMultiplier, Math.exp(Math.PI));
  assert.equal(orbit.stability, "unstable");
  near(model.fieldAt(preset, 0.5, 0, -0.25)[0], 0);
  assert.ok(model.fieldAt(preset, 0.25, 0, -0.25)[0] < 0);
  assert.ok(model.fieldAt(preset, 0.75, 0, -0.25)[0] > 0);
  const [spectrum] = model.spectrumSlice(preset, -0.25).orbits;
  assert.equal(spectrum.points.length, 1);
  near(spectrum.points[0].trace, 0.5);
  near(spectrum.points[0].determinant, 1);
  const cycleBranch = model.sampleBranches(preset).branches.find((branch) => branch.id === "cycle");
  near(cycleBranch.points.at(-1).parameter, 0);
  near(cycleBranch.points.at(-1).radius, 0);
}

{
  const preset = model.createPreset("subcritical-hopf");
  assert.equal(model.cyclesAt(preset, -0.3).length, 0);

  const fold = model.cyclesAt(preset, -0.25);
  assert.equal(fold.length, 1);
  near(fold[0].radius, Math.sqrt(0.5));
  assert.equal(fold[0].stability, "semistable");

  const bistable = model.cyclesAt(preset, -0.1);
  assert.equal(bistable.length, 2);
  assert.equal(bistable[0].stability, "unstable");
  assert.equal(bistable[1].stability, "stable");
  near(bistable[0].radius ** 2, (1 - Math.sqrt(0.6)) / 2);
  near(bistable[1].radius ** 2, (1 + Math.sqrt(0.6)) / 2);
  assert.equal(model.equilibriaAt(preset, -0.1)[0].type, "stable-focus");

  const afterHopf = model.cyclesAt(preset, 0.1);
  assert.equal(afterHopf.length, 1);
  assert.equal(afterHopf[0].stability, "stable");
  assert.equal(model.equilibriaAt(preset, 0.1)[0].type, "unstable-focus");
}

{
  const preset = model.createPreset("fold-cycles");
  assert.equal(model.cyclesAt(preset, -0.1).length, 0);

  const collision = model.cyclesAt(preset, 0);
  assert.equal(collision.length, 1);
  near(collision[0].radius, 1);
  assert.equal(collision[0].stability, "semistable");

  const pair = model.cyclesAt(preset, 0.25);
  assert.equal(pair.length, 2);
  near(pair[0].radius, Math.sqrt(0.5));
  near(pair[1].radius, Math.sqrt(1.5));
  assert.equal(pair[0].stability, "unstable");
  assert.equal(pair[1].stability, "stable");
  assert.equal(model.equilibriaAt(preset, 0.25)[0].type, "stable-focus");
}

{
  const preset = model.createPreset("snic");
  const before = model.equilibriaAt(preset, -1);
  assert.equal(before.length, 3);
  const top = findPoint(before, (point) => point.y > 0.5);
  const bottom = findPoint(before, (point) => point.y < -0.5);
  assert.equal(top.type, "saddle");
  assert.equal(bottom.type, "stable-node");
  assert.equal(findPoint(before, (point) => Math.hypot(point.x, point.y) < 1e-10).stability, "unstable");

  const collision = model.equilibriaAt(preset, 0);
  assert.equal(collision.length, 2);
  const circlePoint = findPoint(collision, (point) => point.x > 0.9);
  assert.equal(circlePoint.type, "nonhyperbolic");
  near(circlePoint.x, 1);
  near(circlePoint.y, 0);

  assert.equal(model.cyclesAt(preset, 0).length, 0);
  const cycle = model.cyclesAt(preset, 0.5)[0];
  near(cycle.radius, 1);
  assert.equal(cycle.stability, "stable");
  near(cycle.period, 2 * Math.PI / Math.sqrt(0.5 * 2.5));
  const slowCycle = model.cyclesAt(preset, 1e-5)[0];
  assert.ok(slowCycle.period > 100, "SNIC period should diverge at onset");
  const rightmostField = model.fieldAt(preset, 1, 0, 0.5);
  near(rightmostField[0], 0);
  near(rightmostField[1], 0.5);
}

{
  const preset = model.createPreset("homoclinic");
  assert.equal(preset.scope, "global");
  near(model.HOMOCLINIC_PARAMETER, -0.86454525, 1e-10);
  const sampleField = model.fieldAt(preset, 2, 0.5, -0.9);
  near(sampleField[0], 0.5);
  near(sampleField[1], -1.45);
  assert.deepEqual(model.jacobianAt(preset, 2, 0.5, -0.9), [[0, 1], [-2.5, 1.1]]);

  const equilibria = model.equilibriaAt(preset, -0.9);
  assert.equal(equilibria.length, 2);
  const saddle = findPoint(equilibria, (point) => point.x === 0);
  const focus = findPoint(equilibria, (point) => point.x === 1);
  assert.equal(saddle.type, "saddle");
  assert.equal(focus.type, "unstable-focus");
  near(saddle.classification.determinant, -1);
  near(focus.classification.trace, 0.1);
  assert.equal(model.equilibriaAt(preset, -1.05).find((point) => point.x === 1).type, "stable-focus");
  assert.equal(model.equilibriaAt(preset, -1).find((point) => point.x === 1).kind, "center-or-hopf");

  assert.equal(model.cyclesAt(preset, -1).length, 0);
  assert.equal(model.cyclesAt(preset, -0.84).length, 0);
  assert.equal(model.cyclesAt(preset, model.HOMOCLINIC_PARAMETER).length, 0);
  const cycle = model.cyclesAt(preset, -0.9)[0];
  assert.equal(cycle.stability, "stable");
  near(cycle.period, 8.3424, 0.03);
  assert.ok(cycle.floquetMultiplier > 0.24 && cycle.floquetMultiplier < 0.3);
  assert.ok(Object.isFrozen(cycle.path));
  assert.ok(cycle.path.length >= 160 && cycle.path.length <= 400);
  const cycleX = cycle.path.map((point) => point.x);
  near(Math.min(...cycleX), 0.22534, 0.004);
  near(Math.max(...cycleX), 1.4784, 0.004);
  assert.ok(Math.hypot(
    cycle.path[0].x - cycle.path.at(-1).x,
    cycle.path[0].y - cycle.path.at(-1).y
  ) < 0.002, "numerical periodic-orbit path should close");

  const nearLoop = model.cyclesAt(preset, -0.865)[0];
  assert.ok(nearLoop.period > cycle.period * 1.7, "period should diverge near the saddle loop");
  assert.ok(Math.min(...nearLoop.path.map((point) => point.x)) < 0.015, "cycle should approach the saddle");
  assert.ok(nearLoop.floquetMultiplier < 0.003);

  assert.equal(model.connectionsAt(preset, -0.9).length, 0);
  const connection = model.connectionsAt(preset, model.HOMOCLINIC_PARAMETER)[0];
  assert.equal(connection.type, "homoclinic");
  assert.equal(connection.period, Infinity);
  assert.ok(Object.isFrozen(connection.path));
  assert.deepEqual(connection.path[0], { x: 0, y: 0 });
  assert.deepEqual(connection.path.at(-1), { x: 0, y: 0 });
  near(Math.max(...connection.path.map((point) => point.x)), 1.5222, 0.01);
  near(Math.min(...connection.path.map((point) => point.y)), -0.766, 0.02);
  near(Math.max(...connection.path.map((point) => point.y)), 0.470, 0.02);
}

// Every analytic Jacobian agrees with a centered finite-difference audit.
for (const id of model.PRESET_IDS) {
  const preset = model.createPreset(id);
  for (const [x, y, mu] of [[0.23, -0.37, -0.11], [-0.61, 0.42, 0.28]]) {
    const analytic = model.jacobianAt(preset, x, y, mu);
    const numeric = numericalJacobian(preset, x, y, mu);
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        near(analytic[row][column], numeric[row][column], 3e-6, id + " Jacobian entry");
      }
    }
  }
}

{
  const step = model.rk4Step("supercritical-hopf", { x: 1, y: 0 }, 1, 0.01);
  assert.ok(Number.isFinite(step.x) && Number.isFinite(step.y));
  near(Math.hypot(step.x, step.y), 1, 2e-8, "the exact unit cycle should retain its radius");

  const inward = model.integrateTrajectory("supercritical-hopf", {
    initial: [1, 0],
    parameter: -0.5,
    duration: 8,
    dt: 0.01,
    sampleEvery: 10
  });
  assert.equal(inward.status, "completed");
  assert.ok(Math.hypot(inward.final.x, inward.final.y) < 0.03, "stable focus should draw trajectories inward");

  const towardCycle = model.integrateTrajectory("supercritical-hopf", {
    initial: [0.15, 0],
    parameter: 0.5,
    duration: 18,
    dt: 0.01,
    sampleEvery: 20
  });
  assert.equal(towardCycle.status, "completed");
  near(Math.hypot(towardCycle.final.x, towardCycle.final.y), Math.sqrt(0.5), 2e-3, "trajectory should approach the stable Hopf cycle");

  const escaped = model.integrateTrajectory(model.createPreset("pitchfork", { variant: "subcritical" }), {
    initial: [0.8, 0],
    parameter: 0.3,
    duration: 10,
    dt: 0.005,
    maxRadius: 3
  });
  assert.equal(escaped.status, "escaped");
}

{
  const hopf = model.sampleBranches("supercritical-hopf", { samples: 40 });
  assert.equal(hopf.observable, "radius");
  assert.deepEqual(hopf.branches.map((branch) => branch.id), ["origin", "cycle"]);
  const cycleBranch = hopf.branches.find((branch) => branch.id === "cycle");
  const endpoint = findPoint(cycleBranch.points, (point) => point.parameter === 0);
  near(endpoint.observable, 0);
  assert.equal(endpoint.stability, "nonhyperbolic");

  const saddleNode = model.sampleBranchDiagram("saddle-node", { samples: 41 });
  assert.deepEqual(saddleNode.branches.map((branch) => branch.id), ["saddle", "node"]);
  assert.ok(saddleNode.branches.every((branch) => branch.points.some((point) => point.parameter === 0)));

  const subcritical = model.sampleBranches("subcritical-hopf", { samples: 55 });
  assert.deepEqual(subcritical.branches.map((branch) => branch.id), ["origin", "inner-cycle", "outer-cycle"]);
  assert.ok(subcritical.branches[1].points.some((point) => point.parameter === -0.25));
  assert.ok(subcritical.branches[1].points.some((point) => point.parameter === 0));

  const snic = model.sampleBranches("snic", { samples: 60 });
  assert.deepEqual(snic.branches.map((branch) => branch.id), ["circle-saddle", "circle-node", "cycle-frequency"]);
  const frequency = snic.branches.find((branch) => branch.id === "cycle-frequency");
  assert.equal(findPoint(frequency.points, (point) => point.parameter === 0).period, Infinity);
  assert.ok(frequency.points.some((point) => point.parameter > 0 && Number.isFinite(point.period)));

  const homoclinic = model.sampleBranches("homoclinic", { samples: 121 });
  assert.deepEqual(homoclinic.branches.map((branch) => branch.id), [
    "saddle",
    "focus",
    "cycle-minimum-x",
    "cycle-maximum-x"
  ]);
  const lowerEnvelope = homoclinic.branches.find((branch) => branch.id === "cycle-minimum-x");
  const upperEnvelope = homoclinic.branches.find((branch) => branch.id === "cycle-maximum-x");
  const lowerEndpoint = lowerEnvelope.points.at(-1);
  const upperEndpoint = upperEnvelope.points.at(-1);
  near(lowerEndpoint.parameter, model.HOMOCLINIC_PARAMETER, 1e-12);
  near(lowerEndpoint.observable, 0, 1e-12);
  near(upperEndpoint.observable, 1.52227, 1e-5);
  assert.equal(lowerEndpoint.period, Infinity);
}

{
  const grid = model.sampleVectorField("supercritical-hopf", 0.2, {
    xRange: [-1, 1],
    yRange: [-2, 2],
    columns: 5,
    rows: 3
  });
  assert.equal(grid.points.length, 15);
  assert.deepEqual(grid.xRange, [-1, 1]);
  assert.deepEqual(grid.yRange, [-2, 2]);
  for (const point of grid.points) {
    assert.ok(Number.isFinite(point.speed));
    if (point.speed > 1e-12) near(Math.hypot(point.ux, point.uy), 1, 1e-10);
  }
}

{
  const expression = model.compilePlanarExpression("2x_1 + sin(x2) - r");
  assert.equal(expression.usesX1, true);
  assert.equal(expression.usesX2, true);
  assert.equal(expression.usesR, true);
  near(expression.evaluate(2, Math.PI / 2, 3), 2);

  const aliases = model.compilePlanarExpression("x^2 + y^2");
  near(aliases.evaluate(3, 4, 0), 25);
  for (const parameter of ["mu", "μ", "µ"]) {
    const rhs = model.compilePlanarExpression(`(${parameter} + x² + y²)x - y`);
    assert.equal(rhs.usesR, true);
    near(rhs.evaluate(0.5, 0, -0.25), 0);
    near(rhs.evaluate(0.5, 0, 0), 0.125);
  }
  near(model.compilePlanarExpression("μx - y").evaluate(2, 3, 4), 5);
  near(model.compilePlanarExpression("2ρ^2 + rho").evaluate(3, 4, 0), 55);
  assert.ok(Number.isNaN(model.compilePlanarExpression("sqrt(x1)").evaluate(-1, 0, 0)));
  assert.throws(() => model.compilePlanarExpression("window.alert(1)"), /Unsupported character|Unknown name/);
  assert.throws(() => model.compilePlanarExpression(""), /Enter a right-hand side/);
}

{
  const custom = model.createCustomPreset("r*x1 - x2", "x1 + r*x2", {
    x1Range: [-2, 2],
    x2Range: [-2, 2],
    parameterRange: [-1, 1],
    observable: "x2"
  });
  assert.equal(custom.sourceType, "custom");
  assert.equal(custom.expression1, "r*x1 - x2");
  assert.equal(custom.expression2, "x1 + r*x2");
  assert.equal(custom.expressionUsesParameter, true);
  assert.equal(custom.observable, "y");
  assert.deepEqual(model.fieldAt(custom, 1, 2, 0.5), [-1.5, 2]);
  const matrix = model.jacobianAt(custom, 0, 0, -0.4);
  near(matrix[0][0], -0.4, 2e-6);
  near(matrix[0][1], -1, 2e-6);
  near(matrix[1][0], 1, 2e-6);
  near(matrix[1][1], -0.4, 2e-6);
  const stable = model.equilibriaAt(custom, -0.4);
  assert.equal(stable.length, 1);
  near(stable[0].x, 0, 2e-6);
  near(stable[0].y, 0, 2e-6);
  assert.equal(stable[0].type, "stable-focus");
  assert.equal(model.equilibriaAt(custom, 0.4)[0].type, "unstable-focus");
  assert.deepEqual(model.cyclesAt(custom, 0), []);
  assert.deepEqual(model.connectionsAt(custom, 0), []);

  const branches = model.sampleBranches(custom, { samples: 31 });
  assert.equal(branches.observable, "y");
  assert.ok(branches.branches.some((branch) => branch.points.length >= 25));
  assert.ok(branches.branches.every((branch) => branch.kind === "equilibrium"));
}

{
  const cases = [
    {
      equations: ["(μ - ρ²)x - y", "x + (μ - ρ²)y"],
      parameter: 0.25, period: 2 * Math.PI, determinant: 1, stability: "stable",
      radialCubic: -1, angularVelocity: 1
    },
    {
      equations: ["μx + x^3 + x*y^2 - y", "x + μy + x^2*y + y^3"],
      parameter: -0.25, period: 2 * Math.PI, determinant: 1, stability: "unstable",
      radialCubic: 1, angularVelocity: 1
    },
    {
      equations: ["(mu - 2*rho^2)*x - 2*y", "2*x + (mu - 2*rho^2)*y"],
      parameter: 0.5, period: Math.PI, determinant: 4, stability: "stable",
      radialCubic: -2, angularVelocity: 2
    }
  ];
  for (const { equations, parameter, period, determinant, stability, radialCubic, angularVelocity } of cases) {
    const custom = model.createCustomPreset(...equations, { x1Range: [-2, 2], parameterRange: [-1, 1] });
    assert.equal(custom.sourceType, "custom");
    assert.equal(custom.hasAnalyticCycles, true);
    assert.equal(custom.expression1, equations[0]);
    assert.deepEqual(custom.phaseWindow.x, [-2, 2]);
    assert.equal(custom.criticalValues[0].parameter, 0);
    const [orbit] = model.cyclesAt(custom, parameter);
    near(orbit.radius, 0.5);
    near(orbit.period, period);
    near(orbit.floquetMultiplier, Math.exp(-2 * parameter * period));
    assert.equal(orbit.stability, stability);
    assert.deepEqual(model.cyclesAt(custom, 0), []);
    assert.deepEqual(model.cyclesAt(custom, -parameter), []);
    near(model.fieldAt(custom, 0.5, 0, parameter)[0], 0);
    near(model.fieldAt(custom, 0.5, 0, parameter)[1], angularVelocity * 0.5);
    const [spectralOrbit] = model.spectrumSlice(custom, parameter).orbits;
    assert.equal(spectralOrbit.points.length, 1);
    near(spectralOrbit.points[0].trace, -2 * parameter);
    near(spectralOrbit.points[0].determinant, determinant);
    const cycle = model.sampleBranches(custom).branches.find((branch) => branch.id === "cycle");
    near(cycle.points.find((point) => point.parameter === 0).radius, 0);
    assert.ok(cycle.points.some((point) => point.stability === stability));
    near(model.jacobianAt(custom, 0.5, 0, parameter)[0][0], parameter + 0.75 * radialCubic);
  }

  for (const extra of ["1e-14*x^2", "0/x", "x^4"]) {
    const custom = model.createCustomPreset(
      `(r+x^2+y^2)*x-y + ${extra}`, "x+(r+x^2+y^2)*y"
    );
    assert.equal(custom.hasAnalyticCycles, false);
    assert.deepEqual(model.cyclesAt(custom, -0.25, { numerical: false }), []);
  }
}

{
  const family = model.createCustomPreset(
    "(mu + x^2 + y^2)*(1 - x^2 - y^2)*x - y",
    "x + (mu + x^2 + y^2)*(1 - x^2 - y^2)*y"
  );
  assert.equal(family.hasAnalyticCycles, true);
  assert.equal(family.hasNumericalCycles, false);
  for (const parameter of [-0.5, -0.125]) {
    const orbits = model.cyclesAt(family, parameter);
    assert.deepEqual(orbits.map((orbit) => orbit.stability), ["unstable", "stable"]);
    near(orbits[0].radius, Math.sqrt(-parameter));
    near(orbits[1].radius, 1);
    near(orbits[0].floquetMultiplier, Math.exp(-4 * Math.PI * parameter * (1 + parameter)));
    near(orbits[1].floquetMultiplier, Math.exp(-4 * Math.PI * (1 + parameter)));
    for (const orbit of orbits) near(orbit.period, 2 * Math.PI);
    const spectralOrbits = model.spectrumSlice(family, parameter).orbits;
    assert.equal(spectralOrbits.length, 2);
    for (const [index, section] of spectralOrbits.entries()) {
      assert.equal(section.points.length, 1);
      near(section.points[0].trace, orbits[index].radialDerivative);
      near(section.points[0].determinant, 1);
    }
  }

  const coincident = model.cyclesAt(family, -1);
  assert.equal(coincident.length, 1);
  assert.equal(coincident[0].stability, "semistable");
  near(coincident[0].radius, 1);
  near(coincident[0].floquetMultiplier, 1);
  const [unitAtHopf] = model.cyclesAt(family, 0);
  assert.equal(model.cyclesAt(family, 0).length, 1);
  near(unitAtHopf.radius, 1);

  const diagram = model.sampleBranches(family, { samples: 10 });
  const unit = findPoint(diagram.branches, (branch) => branch.id === "unit-cycle");
  const variable = findPoint(diagram.branches, (branch) => branch.id === "variable-radius-cycle");
  for (const branch of [unit, variable]) {
    near(findPoint(branch.points, (point) => point.parameter === -1).radius, 1);
  }
  assert.equal(unit.points[0].stability, "unstable");
  assert.equal(variable.points[0].stability, "stable");
  assert.equal(variable.points.at(-1).parameter, 0);
  near(variable.points.at(-1).radius, 0);
  assert.equal(model.buildSpectrum(family, diagram).orbitTracks.length, 2);

  const expanded = model.createCustomPreset(
    "(mu + (1-mu)*rho^2 - rho^4)*x + 2*y",
    "-2*x + (mu + (1-mu)*rho^2 - rho^4)*y"
  );
  assert.equal(expanded.hasAnalyticCycles, true);
  const [inner] = model.cyclesAt(expanded, -0.5);
  near(inner.radius, Math.SQRT1_2);
  near(inner.period, Math.PI);
}

{
  const saddle = model.createCustomPreset("x_1", "-x_2", {
    x1Range: [-1, 1],
    x2Range: [-1, 1],
    parameterRange: [-1, 1]
  });
  const equilibrium = model.equilibriaAt(saddle, 0)[0];
  assert.ok(equilibrium);
  assert.equal(equilibrium.type, "saddle");
}

{
  const vanDerPol = model.createCustomPreset("x2", "r*(1-x1^2)*x2-x1", {
    x1Range: [-3, 3],
    x2Range: [-3, 3],
    parameterRange: [-1, 1]
  });
  assert.equal(vanDerPol.hasAnalyticCycles, false);
  assert.equal(vanDerPol.hasNumericalCycles, true);
  const equilibriaOnly = model.sampleBranches(vanDerPol, { samples: 5, cycleSamples: 0 });
  assert.ok(equilibriaOnly.branches.length > 0);
  assert.ok(equilibriaOnly.branches.every((branch) => branch.kind === "equilibrium"));
  const samples = model.sampleBranches(vanDerPol, { samples: 5, cycleSamples: 5 });
  const spectrum = model.buildSpectrum(vanDerPol, samples);
  for (const parameter of [-0.5, 0.5]) {
    assert.equal(model.equilibriaAt(vanDerPol, parameter).length, 1);
    const orbits = model.cyclesAt(vanDerPol, parameter);
    assert.equal(orbits.length, 1);
    const [orbit] = orbits;
    assert.equal(orbit.approximate, true);
    assert.equal(orbit.stability, parameter > 0 ? "stable" : "unstable");
    // Reference from high-accuracy integration between successive maxima of x.
    near(orbit.period, 6.380676, 0.002);
    near(Math.log(orbit.floquetMultiplier), Math.sign(parameter) * Math.log(0.039177), 0.02);
    assert.ok(orbit.path.length >= 10);
    near(orbit.path[0].x, orbit.path.at(-1).x, 1e-4);
    near(orbit.path[0].y, orbit.path.at(-1).y, 1e-4);

    const section = findPoint(spectrum.orbitTracks.flat(), (orbit) => orbit.parameter === parameter);
    assert.ok(section.closed);
    assert.equal(section.stability, orbit.stability);
    const radii = section.points.map(({ x, y }) => Math.hypot(x, y));
    assert.ok(Math.max(...radii) - Math.min(...radii) > 0.5, "render the computed noncircular orbit");
    assert.ok(section.points.some(({ determinant }) => Math.abs(determinant - 1) > 0.1));
  }
}

{
  const twoCycles = model.createCustomPreset(
    "(mu+x^2+y^2)*(1-x^2-y^2)*x-(1+0.1*x)*y",
    "(1+0.1*x)*x+(mu+x^2+y^2)*(1-x^2-y^2)*y",
    { x1Range: [-1.5, 1.5], x2Range: [-1.5, 1.5] }
  );
  assert.equal(twoCycles.hasAnalyticCycles, false);
  const orbits = [...model.cyclesAt(twoCycles, -0.5)].sort((a, b) => a.radius - b.radius);
  assert.deepEqual(orbits.map((orbit) => orbit.stability), ["unstable", "stable"]);
  near(orbits[0].radius, Math.SQRT1_2, 1e-4);
  near(orbits[1].radius, 1, 1e-4);
  for (const orbit of orbits) {
    near(orbit.period, 2 * Math.PI / Math.sqrt(1 - 0.01 * orbit.radius ** 2), 0.002);
  }
}

{
  const nonlinearCenter = model.createCustomPreset("y", "-x-x^3");
  assert.equal(nonlinearCenter.hasNumericalCycles, true);
  assert.deepEqual(model.cyclesAt(nonlinearCenter, 0), []);
}

{
  const domainLimited = model.createCustomPreset("1/x1", "-x2", {
    x1Range: [-2, 2],
    x2Range: [-2, 2],
    parameterRange: [-1, 1]
  });
  assert.ok(Number.isNaN(domainLimited.field(0, 1, 0)[0]));
  assert.doesNotThrow(() => model.sampleBranches(domainLimited, { samples: 9 }));
  assert.throws(
    () => model.createCustomPreset("exp(10*x1)", "-x2"),
    /becomes too large/
  );
  assert.throws(
    () => model.createCustomPreset("x1", "x2", { x1Range: [1, 1] }),
    /positive width/
  );
  assert.throws(
    () => model.createCustomPreset("", "x2"),
    /First equation: Enter a right-hand side/
  );
  assert.throws(
    () => model.createCustomPreset("x1", "bad_name"),
    /Second equation: Unknown name/
  );
  assert.throws(
    () => model.createCustomPreset("r*x1", "r*x2"),
    /every visible state is an equilibrium/
  );
}

// Curves of equilibria need an explicit unsupported-set result, not a finite
// count. Singular isolated equilibria must remain available at bifurcations.
for (const [first, second] of [["x1", "0"], ["x1*x2", "0"], ["x1^2+x2^2-1", "0"],
  ["x1+x2", "2*(x1+x2)"], ["(x1-x2)^2", "0"]]) {
  const family = model.createCustomPreset(first, second);
  const equilibria = model.equilibriaAt(family, 0);
  assert.equal(equilibria.nonisolated, true, first + "; " + second);
  assert.equal(equilibria.length, 0, "do not enumerate a curve as isolated points");
  assert.equal(model.sampleBranches(family, { samples: 5 }).branches.length, 0);
}
for (const first of ["x1^2", "x1^3"]) {
  const equilibria = model.equilibriaAt(model.createCustomPreset(first, "-x2"), 0);
  assert.ok(equilibria.length > 0);
  assert.ok(!equilibria.nonisolated, "a singular Jacobian does not alone imply a continuum");
}
{
  const family = model.createCustomPreset("r*x1", "-x2");
  assert.equal(model.equilibriaAt(family, 0).nonisolated, true);
  assert.equal(model.equilibriaAt(family, 0.5).length, 1);
  const outside = model.createCustomPreset("x1-1.02", "-x2", { x1Range: [-1, 1], x2Range: [-1, 1] });
  assert.equal(model.equilibriaAt(outside, 0).length, 0, "never clamp an off-window root onto the boundary");
}

// Independent radial bound, not another RK4 computation: both quintic radial
// fields point inward everywhere outside the initial radius sqrt(18).
for (const id of ["subcritical-hopf", "fold-cycles"]) {
  const family = model.createPreset(id);
  const trajectory = model.integrateTrajectory(family, {
    initial: [3, 3], parameter: family.defaultParameter, duration: 3, dt: 0.018, sampleEvery: 2
  });
  assert.equal(trajectory.status, "completed");
  assert.ok(trajectory.points.every((p) => Math.hypot(p.x, p.y) <= Math.sqrt(18) + 1e-8));
  near(trajectory.points[1].t, 0.036, 1e-12, "adaptation must preserve the animation's output times");
}
{
  const family = model.createCustomPreset("-200*x1", "-x2");
  const trajectory = model.integrateTrajectory(family, { initial: [1, 1], duration: 1, dt: 0.018 });
  assert.equal(trajectory.status, "completed");
  near(trajectory.final.x, Math.exp(-200), 1e-8);
  near(trajectory.final.y, Math.exp(-1), 1e-8);
  const failed = model.integrateTrajectory(family, { initial: [1, 1], duration: 1, dt: 0.018, maxSteps: 1 });
  assert.equal(failed.status, "integration-failed", "an exhausted numerical solve is not physical escape");
  assert.deepEqual(failed.final, { x: 1, y: 1 }, "a rejected trial must never become the trajectory endpoint");
}

{
  const analysis = {
    columns: 45, rows: 45,
    xValues: Array.from({ length: 45 }, (_, index) => -3 + 6 * index / 44),
    yValues: Array.from({ length: 45 }, (_, index) => -3 + 6 * index / 44)
  };
  const contour = (evaluate) => {
    const values = Float64Array.from(analysis.yValues.flatMap((y) => analysis.xValues.map((x) => evaluate(x, y))));
    return model.sampleNullclineSegments(values, analysis, evaluate);
  };
  for (const evaluate of [(x) => 1 / (x - 0.47), (_x, y) => 1 / (y + 0.13), (x, y) => 1 / (x + y - 0.47)]) {
    assert.equal(contour(evaluate).length, 0, "a reciprocal has no nullcline at its pole");
  }
  for (const evaluate of [(x) => x, (_x, y) => y, (x, y) => x * x + y * y - 1]) {
    const segments = contour(evaluate);
    assert.ok(segments.length > 20, "keep genuine straight and curved nullclines");
    for (const segment of segments) for (const point of segment) near(evaluate(point.x, point.y), 0, 1e-8);
  }
}

{
  const saddleNode = model.buildSpectrum("saddle-node");
  assert.equal(saddleNode.equilibriumTracks.length, 2);
  for (const track of saddleNode.equilibriumTracks) {
    near(track[0].parameter, 0);
    near(track[0].trace, -1);
    near(track[0].determinant, 0);
  }
  const repeated = model.spectrumSlice("saddle-node", 0.25).equilibria.find((point) => point.type === "stable-node");
  assert.equal(repeated.boundary, "repeated-eigenvalue");
  assert.equal(model.spectrumSlice("saddle-node", 0.251).equilibria[1].boundary, null);

  const pitchfork = model.buildSpectrum("pitchfork").equilibriumTracks;
  const distinct = pitchfork.filter((track) => track.at(-1).x !== 0);
  assert.equal(distinct.length, 2);
  assert.deepEqual(distinct[0].map((point) => [point.trace, point.determinant]),
    distinct[1].map((point) => [point.trace, point.determinant]));
}

{
  const symmetric = model.spectrumSlice("supercritical-hopf", 0.16).orbits[0];
  assert.equal(symmetric.points.length, 1);
  assert.equal(symmetric.phasePoints.length, 120);
  for (const { x, y } of symmetric.phasePoints) near(Math.hypot(x, y), 0.4);
  assert.ok(symmetric.phasePoints.some(point => point.y > 0.39));
  assert.ok(symmetric.phasePoints.some(point => point.y < -0.39));
  near(symmetric.points[0].trace, -0.32);
  near(symmetric.points[0].determinant, 1);

  const preset = model.createPreset("varying-speed-hopf");
  const orbit = model.spectrumSlice(preset, 0.16).orbits[0];
  assert.equal(orbit.closed, true);
  assert.equal(orbit.stability, "stable");
  near(orbit.period, 2 * Math.PI / Math.sqrt(0.84));
  near(orbit.floquetMultiplier, Math.exp(-0.32 * orbit.period));
  assert.ok(orbit.points.some((point) => point.type === "stable-focus"));
  assert.ok(orbit.points.some((point) => point.type === "unstable-focus"));
  for (const point of orbit.points) {
    near(point.trace, point.x - 0.32);
    near(point.determinant, (1 + point.y) * (1 + 2 * point.y) - 0.32 * point.x);
  }
  const saddlePhase = model.spectrumSlice(preset, 0.36).orbits[0].points.find((point) => point.type === "saddle");
  assert.ok(saddlePhase, "a frozen saddle can lie on an attracting cycle");
  const track = model.buildSpectrum(preset).orbitTracks[0];
  assert.equal(track[0].points.length, 1);
  assert.equal(track[0].phasePoints.length, 1);
  assert.equal(track[0].parameter, 0);
  assert.equal(track[0].points[0].boundary, "imaginary-pair");
  assert.ok(track.at(-1).points.length > 1);
}

{
  assert.equal(model.buildSpectrum("snic").equilibriumTracks.length, 3);
  const snic = model.spectrumSlice("snic", 0).orbits[0];
  assert.equal(snic.kind, "connection");
  assert.equal(snic.phasePoints.length, 120);
  assert.equal(snic.period, Infinity);
  assert.equal(snic.points[0].boundary, "zero-eigenvalue");
  const [track] = model.buildSpectrum("homoclinic").orbitTracks;
  assert.equal(track.at(-1).kind, "connection");
  assert.equal(track.at(-1).parameter, model.HOMOCLINIC_PARAMETER);
  near(track.at(-1).points[0].determinant, -1);
}

console.log("planar bifurcation model tests passed");

