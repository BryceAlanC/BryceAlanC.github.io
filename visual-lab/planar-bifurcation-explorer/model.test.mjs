import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The website intentionally has no package.json.  Importing the browser ESM
// source through a data URL keeps the test self-contained.
const source = await readFile(new URL("./model.js", import.meta.url), "utf8");
const model = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

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
  "subcritical-hopf",
  "fold-cycles",
  "homoclinic",
  "snic"
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

console.log("planar bifurcation model tests passed");
