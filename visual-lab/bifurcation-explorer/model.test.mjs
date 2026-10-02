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
  const exact = model.createFamily("pitchfork-unfolding", "unused", {
    alpha: 0,
    beta: 0,
    couplingSign: 1,
    cubicSign: -1,
    timeSign: 1
  });
  assert.equal(exact.supportsUnfolding, true);
  assert.equal(exact.unfolding.caseId, "perfect");
  assert.equal(exact.formula, "ẋ = rx − x³");
  assert.equal(exact.knownCandidates.length, 1);
  assert.equal(exact.knownCandidates[0].type, "supercritical-pitchfork");
  assert.deepEqual(exact.xRange, [-2.2, 2.2]);
  assert.deepEqual(exact.rRange, [-2.2, 2.2]);

  const legacy = model.createFamily("supercritical-pitchfork", "unused", { imperfection: 0.2 });
  assert.equal(legacy.unfolding.alpha, 0.2, "the former imperfection option maps to alpha");
  assert.equal(legacy.unfolding.beta, 0);
  assert.equal(legacy.knownCandidates.length, 1);
  assert.equal(model.classifyCandidate(legacy, legacy.knownCandidates[0]).type, "saddle-node");

  const transcriticalFold = model.createFamily("pitchfork-unfolding", "unused", {
    alpha: 0,
    beta: 1,
    couplingSign: 1,
    cubicSign: -1
  });
  assert.equal(transcriticalFold.unfolding.caseId, "transcritical-fold");
  assert.deepEqual(
    transcriticalFold.knownCandidates.map((candidate) => candidate.type).sort(),
    ["saddle-node", "transcritical"]
  );
  const transcriticalPoint = transcriticalFold.knownCandidates.find((candidate) => candidate.type === "transcritical");
  const companionFold = transcriticalFold.knownCandidates.find((candidate) => candidate.type === "saddle-node");
  near(transcriticalPoint.x, 0, 1e-12);
  near(transcriticalPoint.r, 0, 1e-12);
  near(companionFold.x, 0.5, 1e-9);
  near(companionFold.r, -0.25, 1e-9);

  const threeFolds = model.createFamily("pitchfork-unfolding", "unused", {
    alpha: 0.0625,
    beta: 1.5,
    couplingSign: 1,
    cubicSign: -1
  });
  assert.equal(threeFolds.unfolding.caseId, "three-folds");
  assert.equal(threeFolds.knownCandidates.length, 3);
  assert.ok(threeFolds.knownCandidates.every((candidate) => candidate.type === "saddle-node"));
  assert.deepEqual(threeFolds.xRange, exact.xRange, "the unfolding camera should not breathe as beta changes");
  assert.deepEqual(threeFolds.rRange, exact.rRange, "the unfolding camera should not breathe as alpha changes");
  const expectedFoldParameters = [
    -3 * Math.sqrt(3) / 8,
    -9 / 16,
    3 * Math.sqrt(3) / 8
  ].sort((left, right) => left - right);
  const actualFoldParameters = threeFolds.knownCandidates.map((candidate) => candidate.r).sort((left, right) => left - right);
  actualFoldParameters.forEach((value, index) => near(value, expectedFoldParameters[index], 2e-8));
  const countSlices = [-0.8, -0.61, 0, 0.8].map((r) => model.findEquilibria(threeFolds, r).length);
  assert.deepEqual(countSlices, [1, 3, 1, 3]);

  const tripleBoundary = model.createFamily("pitchfork-unfolding", "unused", {
    alpha: 0.125,
    beta: 1.5,
    couplingSign: 1,
    cubicSign: -1
  });
  assert.equal(tripleBoundary.unfolding.caseId, "triple-boundary");
  assert.equal(tripleBoundary.knownCandidates.length, 2);
  const triple = tripleBoundary.knownCandidates.find((candidate) => candidate.type === "triple-root-passage");
  const ordinary = tripleBoundary.knownCandidates.find((candidate) => candidate.type === "saddle-node");
  near(triple.x, 0.5, 1e-10);
  near(triple.r, -0.75, 1e-10);
  near(ordinary.x, -0.25, 1e-8);
  near(ordinary.r, 0.9375, 1e-8);
  const tripleJet = model.derivativesAt(tripleBoundary, triple.x, triple.r);
  near(tripleJet.f, 0, 1e-10);
  near(tripleJet.fx, 0, 2e-7);
  near(tripleJet.fxx, 0, 2e-5);
  assert.ok(Math.abs(tripleJet.fr) > 0.1);
  assert.ok(Math.abs(tripleJet.fxxx) > 1);
  assert.equal(model.classifyCandidate(tripleBoundary, triple).type, "triple-root-passage");
  assert.equal(model.findEquilibria(tripleBoundary, triple.r, { samples: 1200 }).length, 1);

  const oneFold = model.createFamily("pitchfork-unfolding", "unused", {
    alpha: 0.18,
    beta: 0.8,
    couplingSign: 1,
    cubicSign: -1
  });
  assert.equal(oneFold.unfolding.caseId, "one-fold");
  assert.equal(oneFold.knownCandidates.length, 1);

  const reversed = model.createFamily("pitchfork-unfolding", "unused", {
    alpha: 0.18,
    beta: 0.8,
    couplingSign: 1,
    cubicSign: -1,
    timeSign: -1
  });
  const forwardEquilibria = model.findEquilibria(oneFold, 0);
  const reversedEquilibria = model.findEquilibria(reversed, 0);
  assert.deepEqual(
    reversedEquilibria.map((equilibrium) => Number(equilibrium.x.toFixed(7))),
    forwardEquilibria.map((equilibrium) => Number(equilibrium.x.toFixed(7)))
  );
  forwardEquilibria.forEach((equilibrium, index) => {
    if (equilibrium.stable != null) assert.equal(reversedEquilibria[index].stable, !equilibrium.stable);
  });

  for (const timeSign of [-1, 1]) {
    for (const couplingSign of [-1, 1]) {
      for (const cubicSign of [-1, 1]) {
        const signedPerfect = model.createFamily("pitchfork-unfolding", "unused", {
          alpha: 0,
          beta: 0,
          couplingSign,
          cubicSign,
          timeSign
        });
        const expectedType = timeSign * cubicSign < 0
          ? "supercritical-pitchfork"
          : "subcritical-pitchfork";
        assert.equal(signedPerfect.knownCandidates[0].type, expectedType);
        assert.equal(model.classifyCandidate(signedPerfect, signedPerfect.knownCandidates[0]).type, expectedType);
        const branchR = -couplingSign * cubicSign;
        const signedEquilibria = model.findEquilibria(signedPerfect, branchR);
        assert.equal(signedEquilibria.length, 3);
        near(equilibriumNear(signedEquilibria, -1).derivative, 2 * timeSign * cubicSign, 2e-5);
        near(equilibriumNear(signedEquilibria, 0).derivative, -timeSign * cubicSign, 2e-5);
        near(equilibriumNear(signedEquilibria, 1).derivative, 2 * timeSign * cubicSign, 2e-5);

        const signedThreeFold = model.createFamily("pitchfork-unfolding", "unused", {
          alpha: 0.0625,
          beta: 1.5,
          couplingSign,
          cubicSign,
          timeSign
        });
        assert.equal(signedThreeFold.unfolding.caseId, "three-folds");
        assert.equal(signedThreeFold.knownCandidates.length, 3);
        assert.ok(signedThreeFold.knownCandidates.every((candidate) => candidate.type === "saddle-node"));
      }
    }
  }
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
  assert.deepEqual(first.knownCandidates, second.knownCandidates);
  assert.notEqual(first.formula, third.formula);
  assert.ok(first.knownCandidates.length >= 3 && first.knownCandidates.length <= 6);
  assert.match(first.name, new RegExp(`${first.knownCandidates.length} folds`));
  assert.ok(first.knownCandidates.every((candidate) => candidate.type === "saddle-node"));
  for (const planted of first.knownCandidates) {
    near(first.eval(planted.x, planted.r), 0, 1e-11, "planted fold must satisfy f=0");
    near(model.partialDerivative(first, planted.x, planted.r, 1, 0), 0, 2e-7, "planted fold must satisfy f_x=0");
    assert.equal(model.classifyCandidate(first, planted).type, "saddle-node");
  }
  const detected = model.detectBifurcations(first);
  assert.equal(detected.length, first.knownCandidates.length);
  assert.ok(detected.every((candidate) => candidate.type === "saddle-node"));

  assert.deepEqual(
    ["c", "e", "a", "d"].map((seed) => model.createRandomFamily(seed).knownCandidates.length),
    [3, 4, 5, 6],
    "seeded defaults should cover the advertised three-to-six-fold range"
  );
  assert.equal(model.createRandomFamily("three-fold-landscape", { foldCount: 2 }).knownCandidates.length, 3);
  assert.equal(model.createRandomFamily("six-fold-landscape", { foldCount: 9 }).knownCandidates.length, 6);

  for (const kind of [
    "saddle-node",
    "transcritical",
    "supercritical-pitchfork",
    "subcritical-pitchfork"
  ]) {
    const local = model.createRandomFamily(`legacy-${kind}`, {
      mode: "local",
      kind,
      x0: 0.2,
      r0: -0.1
    });
    assert.equal(local.knownCandidates.length, 1);
    assert.equal(local.knownCandidates[0].type, kind);
    near(local.eval(0.2, -0.1), 0, 1e-12, "legacy local point must satisfy f=0");
    near(model.partialDerivative(local, 0.2, -0.1, 1, 0), 0, 2e-7, "legacy local point must satisfy f_x=0");
    assert.equal(model.classifyCandidate(local, local.knownCandidates[0]).type, kind);
  }

  const disallowed = model.createRandomFamily("multifold-is-not-local", { mode: "local", kind: "n-fold" });
  assert.equal(disallowed.knownCandidates.length, 1);
  assert.ok([
    "saddle-node",
    "transcritical",
    "supercritical-pitchfork",
    "subcritical-pitchfork"
  ].includes(disallowed.knownCandidates[0].type));
  assert.notEqual(disallowed.knownCandidates[0].type, "n-fold");
}

{
  assert.equal(model.compileExpression("2 + 3 * 4^2").evaluate(0, 0), 50);
  assert.equal(model.compileExpression("2^3^2").evaluate(0, 0), 512, "powers should associate from the right");
  assert.equal(model.compileExpression("-2^2").evaluate(0, 0), -4, "powers should bind more tightly than unary minus");
  assert.equal(model.compileExpression("2^-2").evaluate(0, 0), 0.25);

  const implicit = model.compileExpression("2x + 3r(x + 1) + (x + 1)(x - 1)");
  assert.deepEqual(implicit.variables, ["x", "r"]);
  assert.equal(implicit.evaluate(2, 3), 34);
  near(model.compileExpression("2sin(pi/2) + 3cos(0)").evaluate(0, 0), 5, 1e-12);
  assert.equal(model.compileExpression("xr + x² - r³").evaluate(2, 3), -17);
  assert.throws(() => model.compileExpression("2 3"), SyntaxError);
  assert.throws(() => model.compileExpression("1..2"), SyntaxError);

  for (const unsafe of [
    "globalThis.process.exit()",
    "Math.sin(x)",
    "x; globalThis.parserCompromised = true",
    "constructor.constructor(1)",
    "x[0]"
  ]) {
    assert.throws(() => model.compileExpression(unsafe), SyntaxError, `unsafe expression should be rejected: ${unsafe}`);
  }
}

{
  const saddleNode = model.createFamily("custom", "unused", {
    expression: "r + x²",
    xRange: [-2, 2],
    rRange: [-1, 1]
  });
  assert.equal(saddleNode.sourceType, "custom");
  assert.equal(saddleNode.expression, "r + x²");
  assert.equal(saddleNode.expressionUsesParameter, true);
  assert.equal(saddleNode.knownCandidates.length, 0, "custom families should not rely on planted candidates");
  near(saddleNode.eval(0.5, -0.25), 0, 1e-12);
  const saddleCandidates = model.detectBifurcations(saddleNode);
  assert.equal(saddleCandidates.length, 1);
  assert.equal(saddleCandidates[0].type, "saddle-node");
  near(saddleCandidates[0].x, 0, 2e-4);
  near(saddleCandidates[0].r, 0, 2e-4);

  const transcritical = model.createCustomFamily("rx - x^2", {
    xRange: [-2, 2],
    rRange: [-1, 1]
  });
  const diagram = model.sampleBifurcation(transcritical, -1, 1, -2, 2, {
    rSamples: 81,
    xSamples: 300
  });
  const crossing = diagram.candidates.find((candidate) => candidate.type === "transcritical");
  assert.ok(crossing, "a custom transcritical expression should be detected without a planted candidate");
  near(crossing.x, 0, 2e-4);
  near(crossing.r, 0, 2e-4);

  const shiftedPitchfork = model.createCustomFamily("(r-0.137)(x-0.456)-(x-0.456)^3", {
    xRange: [-3, 3],
    rRange: [-2, 2]
  });
  const shiftedDiagram = model.sampleBifurcation(shiftedPitchfork, -2, 2, -3, 3, {
    rSamples: 221,
    xSamples: 420
  });
  assert.equal(shiftedDiagram.candidates.length, 1, "a shifted pitchfork should not acquire ghost folds");
  assert.equal(shiftedDiagram.candidates[0].type, "supercritical-pitchfork");
  near(shiftedDiagram.candidates[0].x, 0.456, 2e-4);
  near(shiftedDiagram.candidates[0].r, 0.137, 2e-4);

  const pole = model.createCustomFamily("1/(x-1.95)");
  assert.equal(model.findEquilibria(pole, 0, { samples: 420 }).length, 0, "a pole is not an equilibrium");
  assert.throws(() => model.createCustomFamily("r-0.123"), /depend on x/i);
  assert.throws(() => model.createCustomFamily("sqrt(x-2.9)"), /undefined across too much/i);
  assert.throws(
    () => model.createCustomFamily("0/(x*(x-1))", { xRange: [-1, 1], rRange: [-1, 1] }),
    /isolated points|genuinely vary/i,
    "an equilibrium continuum with isolated poles must be rejected"
  );
  assert.throws(
    () => model.createCustomFamily("x-x+r-0.01", { xRange: [-1, 1], rRange: [-1, 1] }),
    /genuinely vary/i,
    "syntactic x references that cancel must not count as state dependence"
  );
  assert.throws(
    () => model.createCustomFamily("1+1e20*exp(-1000*(x^2+r^2))", { xRange: [-1, 1], rRange: [-1, 1] }),
    /too large/i,
    "narrow extreme spikes must not bypass the magnitude guard"
  );
  assert.doesNotThrow(
    () => model.createCustomFamily("1e11*r+x", { xRange: [-1, 1], rRange: [-1, 1] }),
    "continuum checks should use a row-local scale"
  );
  assert.throws(
    () => model.createCustomFamily("x", {
      xRange: [-Number.MAX_VALUE, Number.MAX_VALUE],
      rRange: [-1, 1]
    }),
    /State x minimum must be less than State x maximum/i,
    "ranges whose width overflows must be rejected"
  );
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
