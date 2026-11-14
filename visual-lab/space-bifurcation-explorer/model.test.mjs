import assert from "node:assert/strict";
import {
  LORENZ_HOPF,
  equilibriaAt,
  fieldAt,
  integrateTrajectory,
  sampleEquilibria,
  samplePeakColumn,
  sectionCrossings
} from "./model.js";

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} near ${expected}`);
}

near(LORENZ_HOPF, 470 / 19);
assert.equal(equilibriaAt("lorenz", 0)[0].stability, "stable");
assert.deepEqual(equilibriaAt("lorenz", 1).map(eq => eq.stability), ["critical"]);
assert.deepEqual(equilibriaAt("lorenz", 12).map(eq => eq.stability), ["saddle", "stable", "stable"]);
assert.deepEqual(equilibriaAt("lorenz", 28).map(eq => eq.stability), ["saddle", "saddle", "saddle"]);
const [, critical] = equilibriaAt("lorenz", LORENZ_HOPF);
const [a1, a2, a3] = critical.coefficients;
near(a1 * a2, a3);
assert.equal(critical.stability, "critical");
const pair = critical.eigenvalues.find(value => value.im > 0);
near(pair.re, 0);
near(pair.im, Math.sqrt(a2));

for (const r of [1.01, 12, 24.7, 28, 45]) {
  for (const { point, coefficients, eigenvalues } of equilibriaAt("lorenz", r)) {
    near(Math.hypot(...fieldAt("lorenz", r, point)), 0);
    const [a1, a2, a3] = coefficients;
    for (const { re, im } of eigenvalues) {
      near(re ** 3 - 3 * re * im ** 2 + a1 * (re ** 2 - im ** 2) + a2 * re + a3, 0);
      near(3 * re ** 2 * im - im ** 3 + 2 * a1 * re * im + a2 * im, 0);
    }
  }
}

const branches = sampleEquilibria("lorenz");
assert.equal(branches.length, 3);
assert.equal(branches[1].points[0].parameter, 1);
assert.deepEqual(branches[1].points[0].point, [0, 0, 0]);
assert.ok(branches[1].points.some(point => point.parameter === LORENZ_HOPF));
assert.equal(equilibriaAt("hopf", -0.5)[0].stability, "stable");
assert.equal(equilibriaAt("hopf", 0)[0].stability, "critical");
assert.equal(equilibriaAt("hopf", 0.5)[0].stability, "saddle");

const orbit = integrateTrajectory("hopf", 1);
assert.equal(orbit.termination, "completed");
assert.equal(orbit.samples.at(-1).t, 100);
assert.ok(orbit.peaks.length > 10);
for (const peak of orbit.peaks) near(peak.x, 1, 1e-6);
near(orbit.peaks[1].t - orbit.peaks[0].t, 2 * Math.PI, 1e-5);
const section = sectionCrossings(orbit.samples, { after: orbit.transient });
assert.ok(section.length > 10);
for (const { x, y, z, u, v } of section) {
  near(x, 0);
  near(y, -1, 3e-4);
  near(z, 0);
  near(u, y);
  near(v, z);
}
const angle = Math.PI / 4;
const offset = 0.4;
const tilted = sectionCrossings(orbit.samples, { angle, offset, direction: -1, after: orbit.transient });
assert.ok(tilted.length > 10);
for (const { x, y, u } of tilted) {
  near(x * Math.cos(angle) + y * Math.sin(angle), offset);
  near(u, Math.sqrt(1 - offset ** 2), 3e-4);
}

// A sampled hit at the middle frame is counted only when the path crosses.
const line = [-1, 0, 1].map((x, t) => ({ t, x, y: 2, z: 3 }));
assert.deepEqual(sectionCrossings(line).map(crossing => crossing.point), [[0, 2, 3]]);
assert.equal(sectionCrossings(line, { direction: -1 }).length, 0);
assert.equal(sectionCrossings(line, { after: 1.1 }).length, 0);
assert.equal(sectionCrossings([line[0], line[1], { ...line[0], t: 2 }]).length, 0);

assert.deepEqual(samplePeakColumn("hopf", 1), { parameter: 1, values: [1], kind: "peaks", exact: true });
assert.deepEqual(samplePeakColumn("lorenz", 12), { parameter: 12, values: [11], kind: "steady" });
const chaotic = samplePeakColumn("lorenz", 28);
assert.equal(chaotic.kind, "peaks");
assert.equal(chaotic.values.length, 24);
assert.ok(Math.max(...chaotic.values) - Math.min(...chaotic.values) > 5);
assert.equal(integrateTrajectory("lorenz", 28, { initial: [1e30, 1e30, 1e30] }).termination, "diverged");

console.log("3D bifurcation model tests passed");
