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

console.log("circle-flow model tests passed");
