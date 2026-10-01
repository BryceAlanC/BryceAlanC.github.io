import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// This repository intentionally has no package.json. Loading through a data URL
// lets `node model.test.mjs` exercise the browser ESM module without changing
// the module mode of the rest of the site.
const source = await readFile(new URL("./model.js", import.meta.url), "utf8");
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function near(actual, expected, tolerance = 1e-6, message = "values differ") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function equilibriumNear(equilibria, target, tolerance = 2e-5) {
  return equilibria.find((equilibrium) => Math.abs(equilibrium.x - target) <= tolerance);
}

assert.deepEqual(model.PRESET_IDS, [
  "saddle-node",
  "transcritical",
  "supercritical-pitchfork",
  "subcritical-pitchfork",
  "hysteresis"
]);

{
  const family = model.createFamily("saddle-node");
  const equilibria = model.findEquilibria(family, -1, -2, 2);
  assert.equal(equilibria.length, 2);
  assert.equal(equilibriumNear(equilibria, -1).stability, "stable");
  assert.equal(equilibriumNear(equilibria, 1).stability, "unstable");
  assert.equal(model.findEquilibria(family, 1, -2, 2).length, 0);
  const collision = model.findEquilibria(family, 0, -2, 2);
  assert.equal(collision.length, 1, "even-multiplicity equilibrium should be found");
  assert.equal(collision[0].stability, "semistable");
}

{
  const family = model.createFamily("transcritical");
  const negative = model.findEquilibria(family, -1, -2, 2);
  assert.equal(equilibriumNear(negative, 0).stability, "stable");
  assert.equal(equilibriumNear(negative, -1).stability, "unstable");
  const positive = model.findEquilibria(family, 1, -2, 2);
  assert.equal(equilibriumNear(positive, 0).stability, "unstable");
  assert.equal(equilibriumNear(positive, 1).stability, "stable");
  const candidate = model.classifyCandidate(family, { x: 0, r: 0 });
  assert.equal(candidate.type, "transcritical");
  assert.ok(candidate.hessianDiscriminant > 0);
}

{
  const definiteQuadratic = Object.freeze({
    id: "definite-quadratic",
    name: "Definite quadratic",
    formula: "ẋ = x²+xr+r²",
    xRange: [-2, 2],
    rRange: [-2, 2],
    defaultR: 0,
    knownCandidates: [],
    eval: (x, r) => x * x + x * r + r * r
  });
  const classification = model.classifyCandidate(definiteQuadratic, { x: 0, r: 0 });
  assert.ok(classification.hessianDiscriminant < 0);
  assert.notEqual(classification.type, "transcritical", "a definite quadratic contact is not a crossing");
}

{
  const supercritical = model.createFamily("supercritical-pitchfork");
  const before = model.findEquilibria(supercritical, -1, -2, 2);
  assert.equal(before.length, 1);
  assert.equal(before[0].stability, "stable");
  const after = model.findEquilibria(supercritical, 1, -2, 2);
  assert.equal(after.length, 3);
  assert.equal(equilibriumNear(after, 0).stability, "unstable");
  assert.equal(equilibriumNear(after, -1).stability, "stable");
  assert.equal(equilibriumNear(after, 1).stability, "stable");
  const candidate = model.classifyCandidate(supercritical, { x: 0, r: 0 });
  assert.equal(candidate.type, "supercritical-pitchfork");
  assert.ok(candidate.pitchforkProduct < 0);

  const subcritical = model.createFamily("subcritical-pitchfork");
  const subCandidate = model.classifyCandidate(subcritical, { x: 0, r: 0 });
  assert.equal(subCandidate.type, "subcritical-pitchfork");
  assert.ok(subCandidate.pitchforkProduct > 0);
}

{
  const family = model.createFamily("hysteresis");
  assert.equal(family.supportsHysteresis, true);
  assert.equal(family.knownCandidates.length, 2);
  const middle = model.findEquilibria(family, 0, -2, 2);
  assert.equal(middle.length, 3);
  assert.equal(equilibriumNear(middle, -1).stability, "stable");
  assert.equal(equilibriumNear(middle, 0).stability, "unstable");
  assert.equal(equilibriumNear(middle, 1).stability, "stable");
  for (const fold of family.knownCandidates) {
    near(family.eval(fold.x, fold.r), 0, 1e-12, "fold must lie on f=0");
    near(model.partialDerivative(family, fold.x, fold.r, 1, 0), 0, 1e-7, "fold must satisfy f_x=0");
    assert.equal(model.classifyCandidate(family, fold).type, "saddle-node");
  }
}

{
  const first = model.createFamily("random", "repeatable-seed");
  const second = model.createFamily("random", "repeatable-seed");
  const third = model.createFamily("random", "different-seed");
  assert.equal(first.formula, second.formula);
  assert.equal(first.eval(0.37, -0.18), second.eval(0.37, -0.18));
  assert.notEqual(first.formula, third.formula);
  const planted = first.knownCandidates[0];
  near(first.eval(planted.x, planted.r), 0, 1e-11, "planted point must satisfy f=0");
  near(model.partialDerivative(first, planted.x, planted.r, 1, 0), 0, 2e-7, "planted point must satisfy f_x=0");
  assert.equal(model.classifyCandidate(first, planted).type, planted.type);
}

{
  const family = model.createFamily("transcritical");
  const data = model.taylorData(family, { x: 0, r: 0 }, { degree: 3 });
  assert.match(data.distinction, /Taylor polynomial/);
  assert.match(data.distinction, /normal form/);
  for (const [x, r] of [[0.12, -0.2], [-0.18, 0.25], [0.3, 0.4]]) {
    near(model.taylorEvaluate(data, x, r), family.eval(x, r), 2e-5, "cubic Taylor polynomial should recover quadratic preset");
  }
  const normalTerms = data.coefficients.filter((coefficient) => coefficient.normalFormTerm);
  assert.deepEqual(normalTerms.map(({ xOrder, rOrder }) => [xOrder, rOrder]), [[2, 0], [1, 1]]);
}

{
  const stableLinear = Object.freeze({
    id: "stable-linear",
    name: "Stable linear",
    formula: "ẋ = -x",
    xRange: [-3, 3],
    rRange: [-1, 1],
    defaultR: 0,
    knownCandidates: [],
    eval: (x) => -x
  });
  near(model.rk4Step(stableLinear, 1, 0, 0.1), Math.exp(-0.1), 1e-6, "RK4 step");
  const trajectory = model.integrateTrajectory(stableLinear, { x0: 1, r: 0, dt: 0.02, duration: 1 });
  near(trajectory.final.x, Math.exp(-1), 2e-8, "RK4 trajectory");
  assert.equal(trajectory.reason, "duration");
}

{
  const family = model.createFamily("saddle-node");
  const diagram = model.sampleBifurcation(family, -1, 0.5, -2, 2, {
    rSamples: 41,
    xSamples: 220
  });
  assert.equal(diagram.slices.length, 41);
  assert.ok(diagram.points.length > 20);
  assert.ok(diagram.branches.length >= 2);
  assert.equal(diagram.candidates[0].type, "saddle-node");
}

console.log("bifurcation model tests: ok");
