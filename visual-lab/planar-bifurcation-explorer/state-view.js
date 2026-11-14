const PAPER = "#f5f1e7";
const GRID = "#435a50";
const EQUILIBRIUM = "#34564a";
const ORBIT = "#4f55a1";
const CRITICAL = "#755600";
const geometryCache = new WeakMap();

function stabilityDash(stability) {
  if (stability === "unstable" || stability === "saddle") return [5, 4];
  if (stability === "stable") return [];
  return [2, 3];
}

function alignSection(previous, current) {
  if (previous.length !== current.length || current.length < 2) return current;
  let bestShift = 0;
  let bestError = Infinity;
  // Numerical paths can start at different places on the loop. Match their
  // phases before joining the sampled circles of the surface.
  for (let shift = 0; shift < current.length; shift += 1) {
    const error = previous.reduce((sum, [x, y], index) => {
      const [nextX, nextY] = current[(index + shift) % current.length];
      return sum + (x - nextX) ** 2 + (y - nextY) ** 2;
    }, 0);
    if (error < bestError) {
      bestShift = shift;
      bestError = error;
    }
  }
  return current.slice(bestShift).concat(current.slice(0, bestShift));
}

function prepareGeometry(data, phaseWindow) {
  if (geometryCache.has(data)) return geometryCache.get(data);
  const { equilibriumTracks, orbitTracks } = data;
  const equilibria = equilibriumTracks.map(track => track.map(point => ({
    position: [point.x, point.y, point.parameter], stability: point.stability
  })));
  const orbits = orbitTracks.map(track => track.map(orbit => ({
    points: orbit.phasePoints.map(({ x, y }) => [x, y, orbit.parameter]),
    stability: orbit.stability
  })));
  const faces = [];
  for (const track of orbits) {
    for (let index = 1; index < track.length; index += 1) {
      const lower = track[index - 1].points;
      const upper = alignSection(lower, track[index].points);
      track[index].points = upper;
      const count = Math.max(lower.length, upper.length);
      const weak = track[index - 1].stability === "unstable" || track[index].stability === "unstable";
      for (let phase = 0; phase < count && count > 1; phase += 1) {
        const next = (phase + 1) % count;
        faces.push({
          points: [lower[phase % lower.length], lower[next % lower.length], upper[next % upper.length], upper[phase % upper.length]],
          opacity: weak ? 0.12 : 0.2
        });
      }
    }
  }

  const [xmin, xmax] = phaseWindow.x;
  const [ymin, ymax] = phaseWindow.y;
  const positions = [...equilibria.flat().map(point => point.position), ...orbits.flat().flatMap(orbit => orbit.points)];
  const bounds = positions.reduce(([left, right, bottom, top], [x, y]) => [
    Math.min(left, x), Math.max(right, x), Math.min(bottom, y), Math.max(top, y)
  ], [xmin, xmax, ymin, ymax]);
  const geometry = { equilibria, orbits, faces, bounds };
  geometryCache.set(data, geometry);
  return geometry;
}

export function drawStateView(context, width, height, {
  data, slice, parameter, parameterRange: [rmin, rmax], phaseWindow, azimuth, elevation, zoom
}) {
  context.save();
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  if (width < 60 || height < 80) {
    context.restore();
    return;
  }

  const { equilibria, orbits, faces, bounds: [xmin, xmax, ymin, ymax] } = prepareGeometry(data, phaseWindow);
  const xmid = (xmin + xmax) / 2;
  const ymid = (ymin + ymax) / 2;
  const xyScale = 2.8 / Math.max(xmax - xmin, ymax - ymin);
  const rmid = (rmin + rmax) / 2;
  const rScale = 2.2 / (rmax - rmin || 1);
  const a = Math.cos(azimuth);
  const b = Math.sin(azimuth);
  const c = Math.cos(elevation);
  const s = Math.sin(elevation);
  const camera = ([x, y, r]) => {
    const X = (x - xmid) * xyScale;
    const Y = (y - ymid) * xyScale;
    const Z = (r - rmid) * rScale;
    const along = b * X + a * Y;
    return [a * X - b * Y, s * along - c * Z, c * along + s * Z];
  };
  const plane = r => [[xmin, ymin, r], [xmax, ymin, r], [xmax, ymax, r], [xmin, ymax, r]];
  const floor = plane(rmin);
  const ceiling = plane(rmax);
  const corners = [...floor, ...ceiling].map(camera);
  const plotHeight = height - Math.min(55, height * 0.22);
  const span = axis => 2 * Math.max(...corners.map(point => Math.abs(point[axis])));
  const scale = zoom * Math.min((width - 56) / span(0), (plotHeight - 44) / (span(1) || 1));
  const project = point => {
    const [x, y] = camera(point);
    return [width / 2 + scale * x, plotHeight / 2 + scale * y];
  };

  function path(points, closed = false) {
    context.beginPath();
    points.forEach((point, index) => {
      const [x, y] = project(point);
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    if (closed) context.closePath();
  }
  function line(points, color, weight, { dash = [], closed = false, opacity = 1 } = {}) {
    path(points, closed);
    context.strokeStyle = color;
    context.lineWidth = weight;
    context.setLineDash(dash);
    context.globalAlpha = opacity;
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;
  }
  function fill(points, color, opacity) {
    path(points, true);
    context.fillStyle = color;
    context.globalAlpha = opacity;
    context.fill();
    context.globalAlpha = 1;
  }
  function marker(point, color, radius, outlined = false) {
    const [x, y] = project(point);
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fillStyle = outlined ? PAPER : color;
    context.strokeStyle = outlined ? color : PAPER;
    context.lineWidth = 1.6;
    context.fill();
    context.stroke();
  }
  function label(point, text, dx, dy, color = GRID) {
    const [x, y] = project(point);
    context.fillStyle = color;
    context.strokeStyle = PAPER;
    context.lineWidth = 3;
    context.strokeText(text, x + dx, y + dy);
    context.fillText(text, x + dx, y + dy);
  }

  context.beginPath();
  context.rect(0, 0, width, plotHeight);
  context.clip();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const frame of [floor, ceiling]) line(frame, GRID, 1, { closed: true, opacity: 0.35 });
  floor.forEach((point, index) => line([point, ceiling[index]], GRID, 1, { opacity: 0.32 }));
  const currentPlane = plane(parameter);
  fill(currentPlane, CRITICAL, 0.08);
  line(currentPlane, CRITICAL, 1.1, { closed: true, opacity: 0.68 });

  const depth = points => points.reduce((sum, point) => sum + camera(point)[2], 0) / points.length;
  const ordered = faces.map(face => ({ face, depth: depth(face.points) }));
  ordered.sort((left, right) => left.depth - right.depth);
  for (const { face } of ordered) fill(face.points, ORBIT, face.opacity);
  for (const track of orbits) {
    const ringStep = Math.max(1, Math.ceil((track.length - 1) / 6));
    track.forEach(({ points, stability }, index) => {
      if (index % ringStep && index !== track.length - 1) return;
      if (points.length > 1) line(points, ORBIT, 1.2, { closed: true, opacity: 0.76, dash: stabilityDash(stability) });
      else marker(points[0], ORBIT, 2.5, true);
    });
  }
  for (const track of equilibria) {
    if (track.length === 1) marker(track[0].position, EQUILIBRIUM, 2.8);
    let start = 0;
    for (let index = 1; index < track.length; index += 1) {
      if (index + 1 < track.length && track[index].stability === track[start].stability) continue;
      const points = track.slice(start, index + 1).map(point => point.position);
      line(points, EQUILIBRIUM, 2, { dash: stabilityDash(track[start].stability) });
      start = index;
    }
  }

  for (const { phasePoints, stability, kind } of slice.orbits) {
    const points = phasePoints.map(({ x, y }) => [x, y, parameter]);
    if (points.length < 2) continue;
    line(points, PAPER, 5, { closed: true });
    line(points, kind === "connection" ? CRITICAL : ORBIT, 2.7, { closed: true, dash: stabilityDash(stability) });
  }
  for (const { x, y, stability } of slice.equilibria) {
    const color = stability === "nonhyperbolic" ? CRITICAL : EQUILIBRIUM;
    marker([x, y, parameter], color, 4.8, stability !== "stable");
  }

  context.font = "600 13px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const axes = [[floor[1], "x"], [floor[3], "y"], [ceiling[0], "r"]];
  const [axisX, axisY] = project(floor[0]);
  for (const [end, text] of axes) {
    line([floor[0], end], GRID, 1.35);
    const [x, y] = project(end);
    const length = Math.hypot(x - axisX, y - axisY) || 1;
    label(end, text, 11 * (x - axisX) / length, 11 * (y - axisY) / length);
  }
  context.font = "11px system-ui, sans-serif";
  const [x, y] = project(currentPlane[0]);
  const dx = x > width / 2 ? -8 : 8;
  const dy = y > plotHeight / 2 ? -10 : 10;
  context.textAlign = dx > 0 ? "left" : "right";
  label(currentPlane[0], `r = ${Number(parameter.toPrecision(4))}`, dx, dy, CRITICAL);
  context.restore();
}
