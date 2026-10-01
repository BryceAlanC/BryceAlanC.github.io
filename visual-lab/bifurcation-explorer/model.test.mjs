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
  "four-fold",
  "n-fold",
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
  const cases = [
    ["supercritical-pitchfork", 0.2, -1],
    ["supercritical-pitchfork", -0.2, -1],
    ["subcritical-pitchfork", 0.2, 1],
    ["subcritical-pitchfork", -0.2, 1]
  ];
  for (const [id, imperfection, cubicSign] of cases) {
    const family = model.createFamily(id, "unused", { imperfection });
    assert.equal(family.supportsImperfection, true);
    assert.equal(family.imperfection, imperfection);
    assert.match(family.formula, new RegExp(String(Math.abs(imperfection))));
    assert.match(family.description, /symmetry-breaking imperfection/i);
    assert.equal(family.knownCandidates.length, 1);
    const fold = family.knownCandidates[0];
    const expectedX = Math.cbrt(imperfection / (2 * cubicSign));
    const expectedR = -3 * cubicSign * expectedX * expectedX;
    near(fold.x, expectedX, 1e-12, "imperfect-pitchfork fold x");
    near(fold.r, expectedR, 1e-12, "imperfect-pitchfork fold r");
    near(family.eval(fold.x, fold.r), 0, 1e-12, "imperfect fold must lie on f=0");
    near(model.partialDerivative(family, fold.x, fold.r, 1, 0), 0, 1e-7, "imperfect fold must satisfy f_x=0");
    assert.equal(model.classifyCandidate(family, fold).type, "saddle-node");
  }

  const exact = model.createFamily("supercritical-pitchfork", "unused", { imperfection: 0 });
  assert.equal(exact.imperfection, 0);
  assert.equal(exact.formula, "ẋ = rx − x³");
  assert.equal(exact.knownCandidates[0].type, "supercritical-pitchfork");
}

{
  const family = model.createFamily("four-fold");
  assert.equal(family.branchCount, 4);
  assert.equal(family.branchSlopes.length, 4);
  assert.equal(family.nongeneric, true);
  assert.match(family.description, /nongeneric/i);
  const equilibria = model.findEquilibria(family, 0.8);
  assert.equal(equilibria.length, 4);
  for (const slope of family.branchSlopes) {
    assert.ok(equilibriumNear(equilibria, slope * 0.8), `missing four-fold branch with slope ${slope}`);
  }
  const classification = model.classifyCandidate(family, family.knownCandidates[0]);
  assert.equal(classification.type, "four-fold");
  assert.equal(classification.branchCount, 4);
  assert.equal(classification.nongeneric, true);
  assert.match(classification.classificationNote, /high-codimension/i);
  assert.deepEqual(classification.normalFormTerms, [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]]);
  const detected = model.detectBifurcations(family);
  assert.equal(detected.length, 1, "the exact product family has only its planted multi-branch crossing");
  assert.equal(detected[0].type, "four-fold");
  const diagram = model.sampleBifurcation(family, -1, 1, -2, 2, {
    rSamples: 40,
    detectCandidates: false
  });
  assert.equal(diagram.branches.length, 4);
  for (const [index, branch] of diagram.branches.entries()) {
    assert.ok(branch.points.some((point) => Math.abs(point.r) < 1e-14 && Math.abs(point.x) < 1e-14));
    for (const point of branch.points) {
      near(point.x, family.branchSlopes[index] * point.r, 1e-10, "four-fold branch continuity");
      assert.equal(typeof point.stability, "string");
    }
  }
}

{
  for (let branchCount = 3; branchCount <= 9; branchCount += 1) {
    const family = model.createFamily("n-fold", "unused", { branchCount });
    assert.equal(family.branchCount, branchCount);
    assert.equal(family.branchSlopes.length, branchCount);
    assert.equal(family.nongeneric, true);
    const r = 0.8;
    const equilibria = model.findEquilibria(family, r);
    assert.equal(equilibria.length, branchCount, `${branchCount}-fold family should expose ${branchCount} branches`);
    assert.equal(model.findEquilibria(family, 0).length, 1, "all branches should meet in one equilibrium at r = 0");
    assert.equal(model.findEquilibria(family, 1e-8).length, branchCount, "nearby distinct analytic roots must not be merged or mistaken for a zero interval");
    for (const slope of family.branchSlopes) {
      assert.ok(equilibriumNear(equilibria, slope * r), `missing ${branchCount}-fold branch with slope ${slope}`);
    }
    const classification = model.classifyCandidate(family, family.knownCandidates[0]);
    assert.equal(classification.type, "n-fold");
    assert.equal(classification.branchCount, branchCount);
    assert.equal(classification.normalFormTerms.length, branchCount <= 4 ? branchCount + 1 : 0);
    assert.match(classification.normalForm, new RegExp(`1,…,${branchCount}`));
    const detected = model.detectBifurcations(family);
    assert.equal(detected.length, 1);
    assert.equal(detected[0].branchCount, branchCount);
    const diagram = model.sampleBifurcation(family, -1, 1, -2, 2, {
      rSamples: 40,
      detectCandidates: false
    });
    assert.equal(diagram.branches.length, branchCount, "each analytic equilibrium line should remain one branch");
    for (const [index, branch] of diagram.branches.entries()) {
      assert.ok(
        branch.points.some((point) => Math.abs(point.r) < 1e-14 && Math.abs(point.x) < 1e-14),
        `branch ${index + 1} of ${branchCount} should pass through the shared origin`
      );
      for (const point of branch.points) {
        near(point.x, family.branchSlopes[index] * point.r, 1e-10, `${branchCount}-fold branch continuity`);
      }
    }
  }

  assert.equal(model.createFamily("n-fold", "unused", { branchCount: 2 }).branchCount, 3);
  assert.equal(model.createFamily("n-fold", "unused", { branchCount: 12 }).branchCount, 9);
  assert.equal(model.createFamily("n-fold", "unused", { branchCount: 5.7 }).branchCount, 6);
  assert.equal(model.createFamily("n-fold", "unused", { branchCount: "not-a-number" }).branchCount, 5);
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

  const disallowed = model.createRandomFamily("multifold-is-not-random", { kind: "n-fold" });
  assert.ok([
    "saddle-node",
    "transcritical",
    "supercritical-pitchfork",
    "subcritical-pitchfork"
  ].includes(disallowed.knownCandidates[0].type));
  assert.notEqual(disallowed.knownCandidates[0].type, "n-fold");
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
