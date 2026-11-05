const PAPER = "#f5f1e7";
const INK = "#17211d";
const GRID = "#435a50";
const EQUILIBRIUM = "#34564a";
const ORBIT = "#4f55a1";
const BOUNDARY = "#755600";
const COLORS = {
  "stable-node": "#176d58",
  "stable-focus": "#176990",
  "unstable-node": "#a85122",
  "unstable-focus": "#b03b58",
  saddle: "#6b50a3"
};
const geometryCache = new WeakMap();

function spectralColor(point) {
  if (point.boundary !== undefined) return point.boundary ? BOUNDARY : COLORS[point.type] || BOUNDARY;
  const { trace, determinant } = point;
  if (Math.abs(determinant) < 1e-9) return BOUNDARY;
  if (determinant < 0) return COLORS.saddle;
  const discriminant = trace * trace - 4 * determinant;
  if (Math.abs(trace) < 1e-9 || Math.abs(discriminant) < 1e-8 * Math.max(1, determinant)) return BOUNDARY;
  return COLORS[`${trace < 0 ? "stable" : "unstable"}-${discriminant < 0 ? "focus" : "node"}`];
}

function evenlySpaced(items, limit) {
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, index) => items[Math.round(index * (items.length - 1) / (limit - 1))]);
}

function prepareGeometry(data, [parameterMin, parameterMax]) {
  const cached = geometryCache.get(data);
  if (cached && cached.parameterMin === parameterMin && cached.parameterMax === parameterMax) return cached;

  const { equilibriumTracks, orbitTracks } = data;
  let traceMin = -2.25;
  let traceMax = 2.25;
  let detMin = -0.55;
  let detMax = 1.65;
  function include(point) {
    traceMin = Math.min(traceMin, point.trace);
    traceMax = Math.max(traceMax, point.trace);
    detMin = Math.min(detMin, point.determinant);
    detMax = Math.max(detMax, point.determinant);
  }
  equilibriumTracks.forEach(track => track.forEach(include));
  orbitTracks.forEach(track => track.forEach(orbit => orbit.points.forEach(include)));
  const tracePadding = (traceMax - traceMin) * 0.06;
  const detPadding = (detMax - detMin) * 0.07;
  traceMin -= tracePadding;
  traceMax += tracePadding;
  detMin -= detPadding;
  detMax += detPadding;

  // Scale each axis once per family, so rotating or changing the slice does not
  // change the coordinate ranges. Every region boundary uses data coordinates.
  const midTrace = (traceMin + traceMax) / 2;
  const midDet = (detMin + detMax) / 2;
  const traceScale = 2.9 / (traceMax - traceMin);
  const detScale = 2.35 / (detMax - detMin);
  const parameterScale = 2.2 / (parameterMax - parameterMin || 1);
  const world = (trace, determinant, parameter) => [
    (trace - midTrace) * traceScale,
    (determinant - midDet) * detScale,
    (parameter - parameterMin) * parameterScale - 1.1
  ];
  const at = (p, parameter = p.parameter) => world(p.trace, p.determinant, parameter);
  const level = (points, parameter) => points.map(([trace, determinant]) => world(trace, determinant, parameter));
  const frame = [[traceMin, detMin], [traceMax, detMin], [traceMax, detMax], [traceMin, detMax]];

  const regions = [{
    label: "Saddle", color: COLORS.saddle, anchor: [midTrace, detMin * 0.56],
    points: [[traceMin, detMin], [traceMax, detMin], [traceMax, 0], [traceMin, 0]]
  }];
  const curves = [];
  for (const [direction, edge, label] of [[-1, traceMin, "Stable"], [1, traceMax, "Unstable"]]) {
    const limit = Math.min(Math.abs(edge), 2 * Math.sqrt(detMax));
    const curve = Array.from({ length: 25 }, (_, index) => {
      const trace = direction * limit * index / 24;
      return [trace, Math.min(detMax, trace * trace / 4)];
    });
    curves.push(curve);
    const nodeTrace = edge * 0.74;
    const focusTrace = direction * limit * 0.37;
    const key = label.toLowerCase();
    regions.push({
      label: `${label} node`, color: COLORS[`${key}-node`],
      anchor: [nodeTrace, Math.min(detMax, nodeTrace * nodeTrace / 4) * 0.45],
      points: [...curve, [edge, curve.at(-1)[1]], [edge, 0]]
    }, {
      label: `${label} focus`, color: COLORS[`${key}-focus`],
      anchor: [focusTrace, (detMax + focusTrace * focusTrace / 4) * 0.52],
      points: [...curve, [edge, curve.at(-1)[1]], [edge, detMax], [0, detMax]]
    });
  }
  const boundaries = [
    [[traceMin, 0], [traceMax, 0]], [[0, 0], [0, detMax]], ...curves
  ];
  const volumes = [];
  for (const { points, color } of regions) {
    volumes.push({ points: level(points, parameterMin), color, opacity: 0.07 });
    volumes.push({ points: level(points, parameterMax), color, opacity: 0.035 });
    // The outer walls provide a shaded extrusion while the selected slice
    // carries the labels and the stronger color.
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if ((a[0] === b[0] && (a[0] === traceMin || a[0] === traceMax)) ||
          (a[1] === b[1] && (a[1] === detMin || a[1] === detMax))) {
        volumes.push({ points: [...level([a, b], parameterMin), ...level([b, a], parameterMax)], color, opacity: 0.045 });
      }
    }
  }
  for (const line of boundaries) {
    for (let index = 1; index < line.length; index += 1) {
      const a = line[index - 1];
      const b = line[index];
      volumes.push({
        points: [...level([a, b], parameterMin), ...level([b, a], parameterMax)],
        color: BOUNDARY, opacity: line.length === 2 ? 0.045 : 0.027
      });
    }
  }

  const equilibriumPaths = equilibriumTracks.map(track => track.map(point => at(point)));
  const orbitPaths = [];
  const orbitFaces = [];
  for (const track of orbitTracks) {
    const orbits = evenlySpaced(track, 42).map(orbit => ({
      points: evenlySpaced(orbit.points, 33).map(point => at(point, orbit.parameter)),
      closed: orbit.closed
    })).filter(orbit => orbit.points.length > 0);
    if (!orbits.length) continue;
    if (orbits.every(orbit => orbit.points.length === 1)) {
      orbitPaths.push({ points: orbits.map(orbit => orbit.points[0]), closed: false });
      continue;
    }
    for (let index = 1; index < orbits.length; index += 1) {
      const lower = orbits[index - 1];
      const upper = orbits[index];
      const count = Math.max(lower.points.length, upper.points.length);
      const closed = (lower.closed || lower.points.length === 1) && (upper.closed || upper.points.length === 1);
      const steps = closed ? count : count - 1;
      function vertex(orbit, i) {
        const last = orbit.points.length - 1;
        if (!last) return orbit.points[0];
        const position = Math.round(i * (orbit.closed ? last + 1 : last) / steps);
        return orbit.points[position % orbit.points.length];
      }
      if (count === 1) orbitPaths.push({ points: [lower.points[0], upper.points[0]], closed: false });
      for (let i = 0; i < steps; i += 1) {
        orbitFaces.push({ points: [vertex(lower, i), vertex(lower, i + 1), vertex(upper, i + 1), vertex(upper, i)] });
      }
    }
    orbitPaths.push(orbits[0]);
    if (orbits.length > 1) orbitPaths.push(orbits.at(-1));
  }

  const geometry = {
    parameterMin, parameterMax, traceMin, traceMax, detMin, detMax,
    world, at, level, frame, regions, boundaries, volumes, equilibriumPaths, orbitFaces, orbitPaths
  };
  geometryCache.set(data, geometry);
  return geometry;
}

function numberLabel(value) {
  return String(Number(value.toPrecision(3)));
}

export function drawSpectrumView(context, width, height, {
  data, slice, parameter, parameterRange, azimuth, elevation, zoom = 1, showRegions = true
}) {
  context.save();
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  if (!data || width < 40 || height < 40) {
    context.restore();
    return;
  }
  const geometry = prepareGeometry(data, parameterRange);
  const {
    parameterMin, parameterMax, traceMin, traceMax, detMin, detMax, frame, regions,
    world, at, level, boundaries, volumes, equilibriumPaths, orbitFaces, orbitPaths
  } = geometry;
  const a = Math.cos(azimuth);
  const b = Math.sin(azimuth);
  const c = Math.cos(elevation);
  const s = Math.sin(elevation);
  const plotHeight = height - Math.min(36, height * 0.19);
  const horizontalRadius = Math.hypot(1.45, 1.175);
  const verticalRadius = Math.abs(s) * horizontalRadius + Math.abs(c) * 1.1;
  const scale = zoom * Math.min((width - 38) / (2 * horizontalRadius), (plotHeight - 28) / (2 * verticalRadius));
  const project = ([x, y, z]) => [
    width / 2 + scale * (a * x - b * y), plotHeight / 2 + scale * (s * (b * x + a * y) - c * z)
  ];
  function depth(face) {
    const points = face.points;
    return points.reduce((sum, [x, y, z]) => sum + c * (b * x + a * y) + s * z, 0) / points.length;
  }
  function paintFaces(faces, color, opacity) {
    const ordered = faces.map(face => ({ face, depth: depth(face) })).sort((first, second) => first.depth - second.depth);
    for (const { face } of ordered) fill(face.points, face.color || color, face.opacity ?? opacity);
  }
  function path(points, closed) {
    context.beginPath();
    points.forEach((point, index) => {
      const [x, y] = project(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (closed) context.closePath();
  }
  function fill(points, color, opacity) {
    context.fillStyle = color;
    context.globalAlpha = opacity;
    path(points, true);
    context.fill();
    context.globalAlpha = 1;
  }
  function line(points, color, size, { opacity = 1, closed = false, dash = [] } = {}) {
    if (points.length < 2) return;
    context.strokeStyle = color;
    context.lineWidth = size;
    context.globalAlpha = opacity;
    context.setLineDash(dash);
    path(points, closed);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;
  }
  function marker(point, color, radius, diamond = false) {
    const [x, y] = project(point);
    context.beginPath();
    if (diamond) {
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
    } else {
      context.arc(x, y, radius, 0, 2 * Math.PI);
    }
    context.fillStyle = color;
    context.strokeStyle = PAPER;
    context.lineWidth = 1.8;
    context.stroke();
    context.fill();
  }
  const occupied = [];
  const selected = [];
  for (const point of slice?.equilibria ?? []) {
    const position = at(point, parameter);
    const same = selected.find(item => Math.hypot(position[0] - item.position[0], position[1] - item.position[1]) < 1e-7);
    if (same) same.count += 1;
    else selected.push({ position, point, count: 1 });
  }
  function reserveMarker(point, radius) {
    const [x, y] = project(point);
    occupied.push([x - radius, y - radius, x + radius, y + radius]);
  }
  selected.forEach(({ position }) => reserveMarker(position, 6));
  for (const { points } of slice?.orbits ?? []) {
    if (points.length === 1) reserveMarker(at(points[0], parameter), 8);
  }
  function caption(point, label, color, size, positions) {
    const [x, y] = project(point);
    context.font = `${size >= 11 ? "600 " : ""}${size}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const halfWidth = context.measureText(label).width / 2 + 2;
    const halfHeight = size * 0.58;
    for (const [dx, dy] of positions) {
      const labelX = x + dx;
      const labelY = y + dy;
      const box = [labelX - halfWidth, labelY - halfHeight, labelX + halfWidth, labelY + halfHeight];
      if (box[0] < 2 || box[1] < 2 || box[2] > width - 2 || box[3] > plotHeight - 2 ||
          occupied.some(other => box[0] < other[2] && box[1] < other[3] && box[2] > other[0] && box[3] > other[1])) continue;
      occupied.push(box);
      context.strokeStyle = PAPER;
      context.lineWidth = 3;
      context.strokeText(label, labelX, labelY);
      context.fillStyle = color;
      context.fillText(label, labelX, labelY);
      return;
    }
  }

  context.beginPath();
  context.rect(0, 0, width, plotHeight);
  context.clip();
  context.lineCap = "round";
  context.lineJoin = "round";
  if (showRegions) paintFaces(volumes);
  for (const r of [parameterMin, parameterMax]) {
    line(level(frame, r), GRID, 0.9, { opacity: 0.34, closed: true });
  }
  for (const [trace, determinant] of frame) {
    line([world(trace, determinant, parameterMin), world(trace, determinant, parameterMax)], GRID, 0.8, { opacity: 0.25 });
  }

  // Plane and borders share the exact current parameter, including during a sweep.
  if (showRegions) {
    for (const { points, color } of regions) fill(level(points, parameter), color, 0.17);
  } else {
    fill(level(frame, parameter), BOUNDARY, 0.07);
  }
  line(level(frame, parameter), BOUNDARY, 1.25, { opacity: 0.62, closed: true });
  boundaries.forEach((points, index) => {
    line(level(points, parameter), BOUNDARY, 1, { opacity: showRegions ? 0.62 : 0.35, dash: index === 0 ? [] : index === 1 ? [2, 3] : [4, 4] });
  });

  const axisEnds = [
    [world(traceMin, 0, parameterMin), world(traceMax, 0, parameterMin), "\u03c4"],
    [world(0, detMin, parameterMin), world(0, detMax, parameterMin), "\u0394"],
    [world(0, 0, parameterMin), world(0, 0, parameterMax), "r"]
  ];
  for (const [start, end] of axisEnds) {
    line([start, end], GRID, 1.25, { opacity: 0.75 });
    const [x, y] = project(end);
    const [fromX, fromY] = project(start);
    const angle = Math.atan2(y - fromY, x - fromX);
    context.beginPath();
    context.moveTo(x - 6 * Math.cos(angle - 0.45), y - 6 * Math.sin(angle - 0.45));
    context.lineTo(x, y);
    context.lineTo(x - 6 * Math.cos(angle + 0.45), y - 6 * Math.sin(angle + 0.45));
    context.strokeStyle = GRID;
    context.lineWidth = 1.25;
    context.stroke();
  }

  paintFaces(orbitFaces, ORBIT, 0.12);
  for (const { points, closed } of orbitPaths) {
    if (points.length === 1) marker(points[0], ORBIT, 3, true);
    else line(points, ORBIT, 1.7, { opacity: 0.75, closed, dash: [4, 3] });
  }
  for (const points of equilibriumPaths) {
    if (points.length === 1) marker(points[0], EQUILIBRIUM, 2.8);
    else line(points, EQUILIBRIUM, 1.7, { opacity: 0.82 });
  }

  const axisOffsets = [[0, -11], [10, -8], [-10, -8], [11, 8], [-11, 8], [0, 12]];
  for (const [, end, label] of axisEnds) caption(end, label, INK, 13, axisOffsets);
  const tickOffsets = [[-12, 8], [12, 8], [-12, -8], [12, -8], [0, 12]];
  if (width >= 250 && height >= 155) {
    for (const r of parameterMin === parameterMax ? [parameterMin] : [parameterMin, parameterMax]) {
      caption(world(0, 0, r), numberLabel(r), GRID, 9, tickOffsets);
    }
    if (parameter > parameterMin && parameter < parameterMax) {
      marker(world(0, 0, parameter), BOUNDARY, 2.6);
      caption(world(0, 0, parameter), numberLabel(parameter), BOUNDARY, 10, tickOffsets);
    }
  }
  for (const { position, count } of selected) {
    if (count > 1) caption(position, `\u00d7${count}`, INK, 10, [[16, -8], [-16, -8], [16, 8], [-16, 8]]);
  }
  if (showRegions && width >= 220 && height >= 130) {
    for (const { anchor, label, color } of regions) {
      const positions = [[0, 0], [0, -10], [0, 10], [-10, -8], [10, -8], [-12, 8], [12, 8]];
      caption(world(...anchor, parameter), label, color, width >= 340 ? 10 : 9, positions);
    }
  }

  for (const orbit of slice?.orbits ?? []) {
    const points = orbit.points;
    if (points.length === 1) {
      marker(at(points[0], parameter), spectralColor(points[0]), 6.7, true);
      continue;
    }
    const projectedOrbit = points.map(point => at(point, parameter));
    line(projectedOrbit, PAPER, 4.9, { closed: orbit.closed });
    const count = orbit.closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % points.length;
      const midpoint = {
        trace: (points[index].trace + points[next].trace) / 2,
        determinant: (points[index].determinant + points[next].determinant) / 2
      };
      line([projectedOrbit[index], projectedOrbit[next]], spectralColor(midpoint), 2.7);
    }
  }

  for (const { position, point } of selected) {
    marker(position, spectralColor(point), 4.6);
  }
  context.restore();
}
