import { dot, projectedBounds, sectionFrame, sectionPolygon } from "./section-plane.js";
import assert from "node:assert/strict";
import {
  LORENZ_HOPF,
  compareTrajectories,
  equilibriaAt,
  fieldAt,
  hopfCycleRadius,
  integrateTrajectory,
  sampleEquilibria,
  samplePeakColumn,
  sectionCrossings
} from "./model.js";

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} near ${expected}`);
}

assert.equal(LORENZ_HOPF, 470 / 19);
for (const [r, type] of [[-1e-12, "stable"], [0, "critical"], [1e-12, "saddle"]]) {
  assert.equal(equilibriaAt("hopf", r)[0].stability, type);
}
for (const [r, type] of [[LORENZ_HOPF - 1e-12, "stable"], [LORENZ_HOPF + 1e-12, "saddle"]]) {
  assert.equal(equilibriaAt("lorenz", r)[1].stability, type);
}
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

for (const r of [-1, -1e-12, 0]) assert.equal(hopfCycleRadius(r), null);
for (const r of [1e-12, 0.25, 1, 2]) {
  const radius = hopfCycleRadius(r);
  near(radius, Math.sqrt(r), 1e-15);
  for (const angle of [0, 1.2, Math.PI]) {
    const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
    const [dx, dy, dz] = fieldAt("hopf", r, [x, y, 0]);
    near(dx, -y);
    near(dy, x);
    near(dz, 0);
  }
}
const axial = integrateTrajectory("hopf", 1, { initial: [0, 0, 1] });
assert.ok(axial.samples.every(({ x, y }) => x === 0 && y === 0));
assert.equal(axial.peaks.length, 0);
assert.deepEqual(samplePeakColumn("hopf", 0).values, [0]);
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

// A horizontal slice reports ordinary x-y coordinates, independent of azimuth.
// A cycle lying within the plane has no transverse intersections.
const horizontal = { angle: 0.37, tilt: Math.PI / 2, offset: 2 };
const rising = [{ t: 0, x: 1, y: 2, z: 1 }, { t: 2, x: 3, y: 0, z: 3 }];
const [hit] = sectionCrossings(rising, horizontal);
assert.deepEqual([hit.t, hit.u, hit.v], [1, 2, 1]);
assert.equal(sectionCrossings(rising, { ...horizontal, direction: -1 }).length, 0);
const flatOrbit = integrateTrajectory("hopf", 1, { initial: [1, 0, 0], duration: 12, transient: 0 });
assert.equal(sectionCrossings(flatOrbit.samples, { tilt: Math.PI / 2 }).length, 0);

const box = [[-1, 1], [-1, 1], [-1, 1]];
const oblique = { angle: Math.PI / 4, tilt: Math.asin(1 / Math.sqrt(3)), offset: 0 };
const frame = sectionFrame(oblique);
for (const axis of [frame.normal, frame.u, frame.v]) near(dot(axis, axis), 1);
near(dot(frame.normal, frame.u), 0);
near(dot(frame.normal, frame.v), 0);
near(dot(frame.u, frame.v), 0);
const [obliqueHit] = sectionCrossings([
  { t: 0, x: -1, y: 1, z: -1 }, { t: 1, x: 1, y: 1, z: -1 }
], oblique);
near(obliqueHit.t, 0.5);
near(dot(obliqueHit.point, frame.normal), 0);
near(obliqueHit.u, dot(obliqueHit.point, frame.u));
near(obliqueHit.v, dot(obliqueHit.point, frame.v));
const hexagon = sectionPolygon(box, frame, 0);
assert.equal(hexagon.length, 6);
for (const p of hexagon) {
  near(dot(p, frame.normal), 0);
  assert.equal(p.filter(x => Math.abs(x) === 1).length, 2);
}
near(projectedBounds(box, frame.normal)[1], Math.sqrt(3));
assert.equal(sectionPolygon(box, frame, 1).length, 3);
assert.equal(sectionPolygon(box, frame, 2).length, 0);
const top = sectionPolygon(box, sectionFrame(horizontal), 1);
assert.equal(top.length, 4);
assert.ok(top.every(p => p[2] === 1));

assert.deepEqual(samplePeakColumn("hopf", 1), { parameter: 1, values: [1], kind: "peaks", exact: true });
assert.deepEqual(samplePeakColumn("lorenz", 12), { parameter: 12, values: [11], kind: "steady" });
const chaotic = samplePeakColumn("lorenz", 28);
assert.equal(chaotic.kind, "peaks");
assert.equal(chaotic.values.length, 24);
assert.ok(Math.max(...chaotic.values) - Math.min(...chaotic.values) > 5);
assert.equal(integrateTrajectory("lorenz", 28, { initial: [1e30, 1e30, 1e30] }).termination, "diverged");

const nearbySink = compareTrajectories("lorenz", 12);
near(nearbySink.initialDistance, 1e-6);
assert.ok(nearbySink.maximumDistance < 1e-5);
assert.ok(nearbySink.finalDistance < 1e-8);
assert.equal(nearbySink.firstThresholdTime, null);

const nearbyButterfly = compareTrajectories("lorenz", 28);
assert.equal(nearbyButterfly.separation.length, nearbyButterfly.primary.samples.length);
assert.ok(nearbyButterfly.firstThresholdTime >= 20 && nearbyButterfly.firstThresholdTime <= 35);
assert.ok(nearbyButterfly.maximumDistance > 10);
for (const [index, { t, distance }] of nearbyButterfly.separation.entries()) {
  const a = nearbyButterfly.primary.samples[index];
  const b = nearbyButterfly.comparison.samples[index];
  assert.equal(t, a.t);
  assert.equal(t, b.t);
  near(distance, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
}

const verticallySeparated = compareTrajectories("hopf", 1, {
  initial: [0.6, 0.2, 0.1], component: "z", perturbation: -1e-3, threshold: 1e-4, duration: 3
});
near(verticallySeparated.initialDistance, 1e-3);
near(verticallySeparated.finalDistance, 1e-3 * Math.exp(-3));
near(verticallySeparated.timeOfMaximum, 0);
assert.equal(verticallySeparated.firstThresholdTime, 0);
assert.equal(verticallySeparated.comparison.samples[0].x, 0.6);

const earlyStop = compareTrajectories("lorenz", 28, { perturbation: 1e7 });
assert.equal(earlyStop.comparison.termination, "diverged");
assert.equal(earlyStop.separation.length, 1);

console.log("3D bifurcation model tests passed");
