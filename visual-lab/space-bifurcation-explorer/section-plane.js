// Angles are in radians. Elevation zero recovers the original vertical section.
export function sectionFrame({ angle = 0, tilt = 0 } = {}) {
  const snap = value => Math.abs(value) < 1e-12 ? 0 : value;
  const c = snap(Math.cos(angle));
  const s = snap(Math.sin(angle));
  const h = snap(Math.cos(tilt));
  const z = snap(Math.sin(tilt));
  if (h === 0) return { normal: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0] };
  return { normal: [h * c, h * s, z], u: [-s, c, 0], v: [-z * c, -z * s, h] };
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Extreme projections of an axis-aligned box onto a unit direction.
export function projectedBounds(bounds, axis) {
  let min = 0;
  let max = 0;
  for (let i = 0; i < 3; i += 1) {
    const a = axis[i] * bounds[i][0];
    const b = axis[i] * bounds[i][1];
    min += Math.min(a, b);
    max += Math.max(a, b);
  }
  return [min, max];
}

export function axisLabel(axis, fallback) {
  const i = axis.findIndex(value => Math.abs(value) === 1);
  if (i < 0) return fallback;
  return (axis[i] < 0 ? "\u2212" : "") + "xyz"[i];
}

// Intersect the plane with each box edge. Sort the vertices around their
// centroid in plane coordinates so tilted triangular/hexagonal cuts draw correctly.
export function sectionPolygon(bounds, frame, offset) {
  const points = [];
  const corners = bounds[0].flatMap(x => bounds[1].flatMap(y => bounds[2].map(z => [x, y, z])));
  const tolerance = 1e-10 * Math.max(1, ...bounds.map(([low, high]) => high - low));
  function add(point) {
    if (!points.some(other => other.every((n, i) => Math.abs(n - point[i]) <= tolerance))) points.push(point);
  }
  const distances = corners.map(point => {
    const distance = dot(point, frame.normal) - offset;
    return Math.abs(distance) <= tolerance ? 0 : distance;
  });
  for (const [index, start] of corners.entries()) {
    const d = distances[index];
    if (d === 0) add(start);
    for (const bit of [1, 2, 4]) {
      if (index & bit) continue;
      const endIndex = index + bit;
      const endDistance = distances[endIndex];
      if (d * endDistance >= 0) continue;
      const t = d / (d - endDistance);
      add(start.map((value, i) => value + t * (corners[endIndex][i] - value)));
    }
  }
  if (points.length < 3) return [];
  const centerU = points.reduce((sum, point) => sum + dot(point, frame.u), 0) / points.length;
  const centerV = points.reduce((sum, point) => sum + dot(point, frame.v), 0) / points.length;
  const angle = point => Math.atan2(dot(point, frame.v) - centerV, dot(point, frame.u) - centerU);
  return points.sort((a, b) => angle(a) - angle(b));
}
