import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The site deliberately has no package.json.  A data URL lets Node exercise
// the same browser ESM module without changing the repository's module mode.
const source = await readFile(new URL("./model.js", import.meta.url), "utf8");
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const { TWO_PI } = model;

function near(actual, expected, tolerance = 1e-8, message = "values differ") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function equilibriumNear(equilibria, target, tolerance = 2e-6) {
  return equilibria.find((equilibrium) => model.circularDistance(equilibrium.angle, target) <= tolerance);
}

assert.deepEqual(model.PRESET_IDS, [
  "uniform",
  "nonuniform",
  "symmetric-pitchfork",
  "overdamped-pendulum",
  "firefly-locking",
  "josephson-junction",
  "repeated-locking-sites",
  "fourier-workshop"
]);

// Canonical wrapping and circular helpers.
near(model.wrapAngle(0), 0, 0);
near(model.wrapAngle(TWO_PI), 0, 1e-14);
near(model.wrapAngle(-Math.PI / 2), 3 * Math.PI / 2, 1e-14);
near(model.wrapAngle(5 * Math.PI), Math.PI, 1e-14);
near(model.circularDistance(0, TWO_PI - 0.1), 0.1, 1e-14);
near(model.unwrapAngleNear(0.05, TWO_PI - 0.05), TWO_PI + 0.05, 1e-14);
assert.equal(model.lapCount(4.1 * Math.PI), 2);
assert.equal(model.lapCount(-4.1 * Math.PI), -2);
assert.equal(model.seamCrossings(0.1, -0.1), -1);
assert.equal(model.seamCrossings(TWO_PI - 0.1, TWO_PI + 0.1), 1);

// Every built-in vector field is genuinely 2π-periodic.
for (const id of model.PRESET_IDS) {
  const flow = model.createCircleFlow(id);
  for (const theta of [-7.31, -0.2, 0, 0.37, 2.8, 9.47]) {
    near(
      model.evaluateFlow(flow, theta),
      model.evaluateFlow(flow, theta + TWO_PI),
      2e-12,
      `${id} should be periodic`
    );
  }
}

// A reflection-symmetric circle flow supports a genuine supercritical
// pitchfork at theta = pi. The antipodal unstable equilibrium is required by
// the topology of the circle.
{
  const before = model.createCircleFlow("symmetric-pitchfork", {
    omega: -0.5,
    secondAmplitude: 0
  });
  const beforeEquilibria = model.findEquilibria(before, { samples: 512 });
  assert.equal(beforeEquilibria.length, 2);
  assert.equal(equilibriumNear(beforeEquilibria, 0).stability, "unstable");
  assert.equal(equilibriumNear(beforeEquilibria, Math.PI).stability, "stable");

  const critical = model.createCircleFlow("symmetric-pitchfork", {
    omega: 0,
    secondAmplitude: 0
  });
  const criticalEquilibria = model.findEquilibria(critical, { samples: 512 });
  assert.equal(criticalEquilibria.length, 2);
  const pitchforkPoint = equilibriumNear(criticalEquilibria, Math.PI);
  assert.ok(pitchforkPoint);
  assert.equal(pitchforkPoint.stability, "neutral");
  near(pitchforkPoint.derivative, 0, 1e-8);

  const after = model.createCircleFlow("symmetric-pitchfork", {
    omega: 0.5,
    secondAmplitude: 0
  });
  const afterEquilibria = model.findEquilibria(after, { samples: 512 });
  assert.equal(afterEquilibria.length, 4);
  assert.equal(equilibriumNear(afterEquilibria, 0).stability, "unstable");
  assert.equal(equilibriumNear(afterEquilibria, 2 * Math.PI / 3).stability, "stable");
  assert.equal(equilibriumNear(afterEquilibria, Math.PI).stability, "unstable");
  assert.equal(equilibriumNear(afterEquilibria, 4 * Math.PI / 3).stability, "stable");
}

// Seam-safe simple roots and stability for sin θ.
{
  const sineFlow = { id: "sine", eval: (theta) => Math.sin(theta) };
  const equilibria = model.findEquilibria(sineFlow);
  assert.equal(equilibria.length, 2, "0 and 2π must be deduplicated");
  assert.equal(equilibriumNear(equilibria, 0).stability, "unstable");
  assert.equal(equilibriumNear(equilibria, Math.PI).stability, "stable");
}

// A stable equilibrium may sit directly on the canonical seam.
{
  const equilibria = model.findEquilibria({ id: "negative-sine", eval: (theta) => -Math.sin(theta) });
  assert.equal(equilibria.length, 2);
  assert.equal(equilibriumNear(equilibria, 0).stability, "stable");
  assert.equal(equilibriumNear(equilibria, Math.PI).stability, "unstable");
}

// Adler locking, saddle-node threshold, and running regimes.
{
  const locked = model.createCircleFlow("overdamped-pendulum", { omega: 0.5, amplitude: 1 });
  const lockedEquilibria = model.findEquilibria(locked);
  assert.equal(lockedEquilibria.length, 2);
  assert.equal(equilibriumNear(lockedEquilibria, Math.PI / 6).stability, "stable");
  assert.equal(equilibriumNear(lockedEquilibria, 5 * Math.PI / 6).stability, "unstable");
  assert.equal(model.rotationPeriod(locked), Infinity);
  assert.equal(model.meanFrequency(locked), 0);
  assert.equal(model.analyzeCircleFlow(locked).regime, "locked");

  const threshold = model.createCircleFlow("overdamped-pendulum", { omega: 1, amplitude: 1 });
  const thresholdEquilibria = model.findEquilibria(threshold);
  assert.equal(thresholdEquilibria.length, 1, "a tangency must not be missed");
  near(thresholdEquilibria[0].angle, Math.PI / 2, 2e-7);
  assert.equal(thresholdEquilibria[0].stability, "semistable");
  assert.equal(model.rotationPeriod(threshold), Infinity);
  assert.equal(model.analyzeCircleFlow(threshold).regime, "threshold");
  assert.equal(model.analyzeCircleFlow(threshold).direction, "counterclockwise");

  const negativeThreshold = model.createCircleFlow("overdamped-pendulum", { omega: -1, amplitude: 1 });
  assert.equal(model.analyzeCircleFlow(negativeThreshold).regime, "threshold");
  assert.equal(model.analyzeCircleFlow(negativeThreshold).direction, "clockwise");

  const running = model.createCircleFlow("overdamped-pendulum", { omega: 1.2, amplitude: 1 });
  assert.equal(model.findEquilibria(running).length, 0);
  assert.equal(model.analyzeCircleFlow(running).regime, "rotating");
}

// Repeated locking produces six alternating simple zeros for n = 3.
{
  const repeated = model.createCircleFlow("repeated-locking-sites", {
    omega: 0.2,
    amplitude: 1,
    harmonics: 3,
    phase: 0
  });
  const equilibria = model.findEquilibria(repeated);
  assert.equal(equilibria.length, 6);
  for (let index = 0; index < equilibria.length; index += 1) {
    assert.notEqual(equilibria[index].stability, "semistable");
    assert.notEqual(
      equilibria[index].stability,
      equilibria[(index + 1) % equilibria.length].stability,
      "simple equilibria must alternate around a circle"
    );
  }
}

// Exact rotation timing for uniform and Adler flows.
for (const omega of [-2, 2]) {
  const uniform = model.createCircleFlow("uniform", { omega });
  near(model.rotationPeriod(uniform), Math.PI, 1e-12);
  near(model.meanFrequency(uniform), omega, 1e-12);
}

for (const omega of [-1.25, 1.25]) {
  const adler = model.createCircleFlow("overdamped-pendulum", { omega, amplitude: 1 });
  near(model.rotationPeriod(adler), TWO_PI / 0.75, 2e-12);
  near(model.meanFrequency(adler), Math.sign(omega) * 0.75, 2e-12);
  // The numerical quadrature path should agree with the closed form too.
  near(model.rotationPeriod(adler, { forceNumeric: true, samples: 8192 }), TWO_PI / 0.75, 2e-9);
}

// Lifted RK4 never wraps its state, so turns and seam crossings remain visible.
{
  const uniform = model.createCircleFlow("uniform", { omega: 2 });
  near(model.stepLiftedRK4(uniform, 7, 0.25), 7.5, 1e-14);
  const trajectory = model.integrateLiftedTrajectory(uniform, {
    liftedTheta0: 0.2,
    dt: 0.01,
    duration: Math.PI
  });
  near(trajectory.final.liftedTheta, 0.2 + TWO_PI, 2e-11);
  assert.equal(trajectory.final.laps, 1);
}

// An equilibrium is a constant solution under the same integrator used by the UI.
{
  const locked = model.createCircleFlow("overdamped-pendulum", { omega: 0.5, amplitude: 1 });
  const equilibrium = Math.PI / 6;
  let theta = equilibrium;
  for (let step = 0; step < 500; step += 1) theta = model.stepLiftedRK4(locked, theta, 0.02);
  near(theta, equilibrium, 2e-12);
}

// The degenerate zero flow is represented explicitly rather than as thousands
// of duplicate roots.
{
  const zero = model.createCircleFlow("uniform", { omega: 0 });
  const equilibria = model.findEquilibria(zero);
  assert.equal(equilibria.length, 1);
  assert.equal(equilibria[0].continuum, true);
  assert.equal(equilibria[0].stability, "neutral");
  assert.equal(model.analyzeCircleFlow(zero).equilibriumCount, Infinity);
}

function bifurcationSlice(diagram, parameter, tolerance = 1e-10) {
  const slice = diagram.slices.find((candidate) => Math.abs(candidate.parameter - parameter) <= tolerance);
  assert.ok(slice, `missing bifurcation slice at ${parameter}`);
  return slice;
}

// The sampler accepts the UI parameter names but records canonical model keys.
assert.equal(model.canonicalCircleParameterKey("a"), "amplitude");
assert.equal(model.canonicalCircleParameterKey("b"), "secondAmplitude");
assert.equal(model.canonicalCircleParameterKey("n"), "harmonics");
assert.equal(model.default.canonicalCircleParameterKey, model.canonicalCircleParameterKey);
assert.equal(model.default.sampleCircleBifurcation, model.sampleCircleBifurcation);

// Uniform rotation has no isolated branch: omega = 0 is one full continuum.
{
  const diagram = model.sampleCircleBifurcation(
    "uniform",
    { omega: 0.7 },
    "omega",
    [-1, 1],
    { parameterSamples: 21, equilibriumSamples: 128 }
  );
  assert.equal(bifurcationSlice(diagram, -1).equilibria.length, 0);
  assert.equal(bifurcationSlice(diagram, 0).continuum, true);
  assert.equal(bifurcationSlice(diagram, 1).equilibria.length, 0);
}

// Sweeping a in the nonuniform family reveals its threshold at a = 1.
{
  const phase = 0.35;
  const diagram = model.sampleCircleBifurcation(
    "nonuniform",
    { omega: 1, amplitude: 0.65, phase },
    "a",
    [0.8, 1.2],
    { parameterSamples: 17, equilibriumSamples: 512, anchors: [1] }
  );
  assert.equal(diagram.parameterKey, "amplitude");
  assert.equal(bifurcationSlice(diagram, 0.8).equilibria.length, 0);
  const threshold = bifurcationSlice(diagram, 1).equilibria;
  assert.equal(threshold.length, 1);
  near(threshold[0].angle, phase + Math.PI, 2e-7);
  assert.equal(threshold[0].stability, "semistable");
  assert.equal(bifurcationSlice(diagram, 1.2).equilibria.length, 2);
}

// Adler and repeated-locking diagrams have the expected fold counts.
{
  const adler = model.sampleCircleBifurcation(
    "overdamped-pendulum",
    { omega: 0.5, amplitude: 1 },
    "omega",
    [-1.2, 1.2],
    { parameterSamples: 25, equilibriumSamples: 512, anchors: [-1, 1] }
  );
  assert.equal(bifurcationSlice(adler, -1.2).equilibria.length, 0);
  assert.equal(bifurcationSlice(adler, -1).equilibria.length, 1);
  assert.equal(bifurcationSlice(adler, 0).equilibria.length, 2);
  assert.equal(bifurcationSlice(adler, 1).equilibria.length, 1);
  assert.equal(bifurcationSlice(adler, 1.2).equilibria.length, 0);

  const repeated = model.sampleCircleBifurcation(
    "repeated-locking-sites",
    { omega: 0.2, amplitude: 1, harmonics: 3, phase: 0 },
    "omega",
    [-1.2, 1.2],
    { parameterSamples: 25, equilibriumSamples: 512, anchors: [-1, 1] }
  );
  assert.equal(bifurcationSlice(repeated, 0).equilibria.length, 6);
  assert.equal(bifurcationSlice(repeated, 1).equilibria.length, 3);
  assert.ok(bifurcationSlice(repeated, 1).equilibria.every((equilibrium) => equilibrium.stability === "semistable"));
}

// The symmetric family has a three-branch pitchfork at mu = 0. Sweeping its
// symmetry-breaking bias exposes the two folds of the imperfect pitchfork.
{
  const pitchfork = model.sampleCircleBifurcation(
    "symmetric-pitchfork",
    { omega: 0.45, secondAmplitude: 0 },
    "omega",
    [-0.75, 1.5],
    { parameterSamples: 19, equilibriumSamples: 512, anchors: [0] }
  );
  assert.equal(bifurcationSlice(pitchfork, -0.75).equilibria.length, 2);
  assert.equal(bifurcationSlice(pitchfork, 0).equilibria.length, 2);
  assert.equal(bifurcationSlice(pitchfork, 0.5).equilibria.length, 4);

  const mu = 0.5;
  const offset = 1 - mu;
  const foldCosine = (-offset - Math.sqrt(offset ** 2 + 8)) / 4;
  const foldBias = Math.abs(
    Math.sqrt(1 - foldCosine ** 2) * (offset + foldCosine)
  );
  const unfolding = model.sampleCircleBifurcation(
    "symmetric-pitchfork",
    { omega: mu, secondAmplitude: 0 },
    "b",
    [-0.35, 0.35],
    { parameterSamples: 15, equilibriumSamples: 512, anchors: [-foldBias, 0, foldBias] }
  );
  assert.equal(bifurcationSlice(unfolding, -0.35).equilibria.length, 2);
  assert.equal(bifurcationSlice(unfolding, 0).equilibria.length, 4);
  assert.equal(bifurcationSlice(unfolding, 0.35).equilibria.length, 2);
  for (const sign of [-1, 1]) {
    const fold = bifurcationSlice(unfolding, sign * foldBias, 1e-9).equilibria;
    assert.equal(fold.length, 3);
    assert.equal(fold.filter((equilibrium) => equilibrium.stability === "semistable").length, 1);
  }

  const bias = 0.2;
  let lowerQ = 0;
  let upperQ = 1;
  for (let iteration = 0; iteration < 72; iteration += 1) {
    const q = (lowerQ + upperQ) / 2;
    const residual = (1 - q ** 2) ** 3 - bias ** 2 * q ** 2;
    if (residual > 0) lowerQ = q;
    else upperQ = q;
  }
  const q = (lowerQ + upperQ) / 2;
  const firstMuFold = 1 + 1 / q - 2 * q;
  const secondMuFold = 2 - firstMuFold;
  const imperfectPitchfork = model.sampleCircleBifurcation(
    "symmetric-pitchfork",
    { omega: 0.45, secondAmplitude: bias },
    "omega",
    [-0.75, 1.5],
    {
      parameterSamples: 19,
      equilibriumSamples: 512,
      anchors: [firstMuFold, secondMuFold]
    }
  );
  for (const foldParameter of [firstMuFold, secondMuFold]) {
    const fold = bifurcationSlice(imperfectPitchfork, foldParameter, 1e-9).equilibria;
    assert.equal(fold.length, 3);
    assert.equal(fold.filter((equilibrium) => equilibrium.stability === "semistable").length, 1);
  }
}

// Alias b must override the canonical base value, and b = 0 is a continuum in
// the pure second-harmonic test family.
{
  const diagram = model.sampleCircleBifurcation(
    "fourier-workshop",
    { omega: 0, amplitude: 0, secondAmplitude: 0.4, harmonics: 2, phase: 0 },
    "b",
    [-1, 1],
    { parameterSamples: 9, equilibriumSamples: 512 }
  );
  assert.equal(diagram.parameterKey, "secondAmplitude");
  assert.equal(bifurcationSlice(diagram, -1).equilibria.length, 4);
  assert.equal(bifurcationSlice(diagram, 0).continuum, true);
  assert.equal(bifurcationSlice(diagram, 1).equilibria.length, 4);
}

// The phase endpoints describe the same vector field, while the discrete n
// control is intentionally rejected as a continuous bifurcation axis.
{
  const diagram = model.sampleCircleBifurcation(
    "nonuniform",
    { omega: 1, amplitude: 1.2, phase: 0 },
    "phase",
    [-Math.PI, Math.PI],
    { parameterSamples: 9, equilibriumSamples: 512 }
  );
  const left = bifurcationSlice(diagram, -Math.PI).equilibria;
  const right = bifurcationSlice(diagram, Math.PI).equilibria;
  assert.equal(left.length, right.length);
  for (const equilibrium of left) {
    assert.ok(equilibriumNear(right, equilibrium.angle), "phase endpoints should agree modulo 2pi");
  }
  assert.throws(
    () => model.sampleCircleBifurcation(
      "repeated-locking-sites",
      { harmonics: 3 },
      "n",
      [1, 8]
    ),
    /discrete/
  );
}

// Empty and all-continuum sweeps remain distinguishable instead of looking
// like failed numerical output.
{
  const empty = model.sampleCircleBifurcation(
    "nonuniform",
    { omega: 1, amplitude: 0.65, phase: 0.35 },
    "phase",
    [-Math.PI, Math.PI],
    { parameterSamples: 13, equilibriumSamples: 256 }
  );
  assert.ok(empty.slices.every((slice) => !slice.continuum && slice.equilibria.length === 0));

  const continuum = model.sampleCircleBifurcation(
    "nonuniform",
    { omega: 0, amplitude: 0.65, phase: 0.35 },
    "a",
    [0, 1.4],
    { parameterSamples: 13, equilibriumSamples: 128 }
  );
  assert.ok(continuum.slices.every((slice) => slice.continuum));
}

// Maximum repeated-locking complexity is resolved at the diagram's sampling
// density, including the simultaneous threshold roots.
{
  const diagram = model.sampleCircleBifurcation(
    "repeated-locking-sites",
    { omega: 0, amplitude: 1, harmonics: 8, phase: 0 },
    "omega",
    [-1.2, 1.2],
    { parameterSamples: 25, equilibriumSamples: 512, anchors: [-1, 1] }
  );
  assert.equal(bifurcationSlice(diagram, 0).equilibria.length, 16);
  assert.equal(bifurcationSlice(diagram, 1).equilibria.length, 8);
}

// A fold close to, but not exactly on, a sampling angle must be represented
// once. The near-zero sample and the refined tangency are not separate roots.
{
  const firefly = model.createCircleFlow("firefly-locking", {
    omega: 1,
    amplitude: 1,
    phase: -2.871592653589793
  });
  const fireflyRoots = model.findEquilibria(firefly, { samples: 512 });
  assert.equal(fireflyRoots.length, 1);
  assert.equal(fireflyRoots[0].stability, "semistable");

  const repeated = model.createCircleFlow("repeated-locking-sites", {
    omega: 1,
    amplitude: 1,
    harmonics: 8,
    phase: -0.8835926535897931
  });
  const repeatedRoots = model.findEquilibria(repeated, { samples: 512 });
  assert.equal(repeatedRoots.length, 8);
  assert.ok(repeatedRoots.every((equilibrium) => equilibrium.stability === "semistable"));
}


// A flat odd root away from the sampling grid must use the sign-changing
// bisection path, not be duplicated by the even-root tangency search.
for (const phase of [0.01, 0.35, 0.37, Math.PI / 2, Math.PI - 0.01]) {
  const shiftedPitchfork = {
    id: "shifted-pitchfork",
    eval(theta) {
      const shifted = theta - phase;
      return Math.sin(shifted) * (1 + Math.cos(shifted));
    }
  };
  const equilibria = model.findEquilibria(shiftedPitchfork, { samples: 512 });
  assert.equal(equilibria.length, 2);
  assert.ok(equilibriumNear(equilibria, phase, 1e-8));
  assert.ok(equilibriumNear(equilibria, phase + Math.PI, 1e-7));
}

console.log("circle-flow model tests passed");
