const INK = "#071c18";
const AXIS = "#8eafa6";
const TRAIL = "#78ddc9";
const COMPARISON = "#ffb280";
const SECTION = "#d2b7fa";
const SELECTION = "#f2c969";
const projectionCache = new WeakMap();

function cameraProjection(bounds, width, height, { azimuth, elevation, zoom }) {
  const [xmid, ymid, zmid] = bounds.map(([min, max]) => (min + max) / 2);
  const a = Math.cos(azimuth);
  const b = Math.sin(azimuth);
  const c = Math.cos(elevation);
  const s = Math.sin(elevation);
  function orient([x, y, z]) {
    const horizontal = a * (x - xmid) - b * (y - ymid);
    const depth = b * (x - xmid) + a * (y - ymid);
    return [horizontal, s * depth - c * (z - zmid)];
  }

  const corners = bounds[0].flatMap(x => bounds[1].flatMap(y => bounds[2].map(z => orient([x, y, z]))));
  const viewWidth = 2 * Math.max(...corners.map(([x]) => Math.abs(x)));
  const viewHeight = 2 * Math.max(...corners.map(([, y]) => Math.abs(y)));
  const padding = Math.min(30, width * 0.075, height * 0.085);
  const scale = zoom * Math.min((width - 2 * padding) / viewWidth, (height - 2 * padding) / viewHeight);
  const project = (point) => {
    const [x, y] = orient(point);
    return [width / 2 + scale * x, height / 2 + scale * y];
  };
  function pointAt(x, y, z = 0) {
    // At zero elevation a fixed-z plane is seen edge-on, so a screen
    // location cannot pick a unique point on it.
    if (Math.abs(s) < 0.08 || !Number.isFinite(z)) return null;
    const horizontal = (x - width / 2) / scale;
    const depth = ((y - height / 2) / scale + c * (z - zmid)) / s;
    const point = [xmid + a * horizontal + b * depth, ymid - b * horizontal + a * depth, z];
    return point.every((value, axis) => value >= bounds[axis][0] && value <= bounds[axis][1]) ? point : null;
  }
  return { project, pointAt };
}

function sectionCorners([[xmin, xmax], [ymin, ymax], [zmin, zmax]], { angle, offset }) {
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const x0 = offset * nx;
  const y0 = offset * ny;
  let low = -Infinity;
  let high = Infinity;
  // Intersect the plane's horizontal line with the x-y bounds before
  // extending that segment between the minimum and maximum z values.
  for (const [start, direction, min, max] of [[x0, -ny, xmin, xmax], [y0, nx, ymin, ymax]]) {
    if (Math.abs(direction) < 1e-10) {
      if (start < min || start > max) return [];
      continue;
    }
    const first = (min - start) / direction;
    const second = (max - start) / direction;
    low = Math.max(low, Math.min(first, second));
    high = Math.min(high, Math.max(first, second));
  }
  if (low >= high) return [];
  return [[low, zmin], [high, zmin], [high, zmax], [low, zmax]].map(([u, z]) => [x0 - u * ny, y0 + u * nx, z]);
}

function traceGeometry(points, project, key) {
  const cached = projectionCache.get(points);
  if (cached?.key === key) return cached;
  const stride = Math.max(1, Math.ceil(points.length / 4400));
  const last = points.length - 1;
  const rendered = [];
  for (let index = 0; index < last; index += stride) rendered.push(project(points[index]));
  if (last >= 0) rendered.push(project(points[last]));
  const path = new Path2D();
  for (const [index, [x, y]] of rendered.entries()) {
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  const result = { key, stride, rendered, path };
  projectionCache.set(points, result);
  return result;
}

export function drawPortrait(context, width, height, {
  preset,
  trajectory,
  comparison = null,
  equilibria = [],
  section = null,
  crossings = [],
  selectedCrossing = null,
  nextCrossing = null,
  launchHeight = null,
  camera,
  headIndex,
  selectedEquilibrium
}) {
  if (width < 1 || height < 1) return;
  const bounds = preset.bounds ?? preset.viewBounds;
  const [[xmin, xmax], [ymin, ymax], [zmin, zmax]] = bounds;
  const { project, pointAt } = cameraProjection(bounds, width, height, camera);
  const key = [width, height, camera.azimuth, camera.elevation, camera.zoom, ...bounds.flat()].join(",");
  const selectedId = selectedEquilibrium?.id ?? selectedEquilibrium;

  function polygon(points, close = false) {
    context.beginPath();
    for (const [index, point] of points.entries()) {
      const [x, y] = project(point);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (close) context.closePath();
  }

  function line(points, color, weight = 1, close = false) {
    polygon(points, close);
    context.strokeStyle = color;
    context.lineWidth = weight;
    context.stroke();
  }

  function circle(x, y, radius, fill, border, weight = 1.3) {
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (border) {
      context.strokeStyle = border;
      context.lineWidth = weight;
      context.stroke();
    }
  }

  function labelAt(x, y, label, color, size = 12, align = "left") {
    context.font = `600 ${size}px system-ui, sans-serif`;
    context.textAlign = align;
    context.textBaseline = "middle";
    context.strokeStyle = INK;
    context.lineWidth = 3;
    context.strokeText(label, x, y);
    context.fillStyle = color;
    context.fillText(label, x, y);
  }

  function drawTrail(points, color, muted, headColor) {
    if (!points?.length) return;
    const animated = Number.isFinite(headIndex);
    const { stride, rendered, path } = traceGeometry(points, project, key);
    context.strokeStyle = animated ? muted : color;
    context.lineWidth = animated ? 1.05 : 1.22;
    context.stroke(path);
    if (!animated) return;

    const head = Math.max(0, Math.min(points.length - 1, Math.round(headIndex)));
    const end = Math.floor(head / stride);
    const tail = Math.max(0, end - Math.max(40, Math.round(rendered.length * 0.055)));
    const [headX, headY] = project(points[head]);
    context.beginPath();
    context.moveTo(...rendered[tail]);
    for (let index = tail + 1; index <= end; index += 1) context.lineTo(...rendered[index]);
    context.lineTo(headX, headY);
    context.strokeStyle = color;
    context.lineWidth = 1.7;
    context.stroke();
    circle(headX, headY, 4, headColor, INK, 1.35);
  }

  function drawNormal(corners) {
    const sign = section.direction < 0 ? -1 : 1;
    const length = 0.15 * Math.min(xmax - xmin, ymax - ymin) * sign;
    const [x, y] = corners[2].map((coordinate, axis) => 0.5 * (coordinate + corners[3][axis]));
    const z = zmax - 0.15 * (zmax - zmin);
    const [startX, startY] = project([x, y, z]);
    const [endX, endY] = project([x + length * Math.cos(section.angle), y + length * Math.sin(section.angle), z]);
    if (Math.hypot(endX - startX, endY - startY) < 9) return;
    const heading = Math.atan2(endY - startY, endX - startX);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    for (const tilt of [-0.57, 0.57]) {
      context.moveTo(endX, endY);
      context.lineTo(endX - 6 * Math.cos(heading + tilt), endY - 6 * Math.sin(heading + tilt));
    }
    context.strokeStyle = SECTION;
    context.lineWidth = 1.65;
    context.stroke();
  }

  context.save();
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0c2b25");
  background.addColorStop(1, INK);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  const floor = [[xmin, ymin, zmin], [xmax, ymin, zmin], [xmax, ymax, zmin], [xmin, ymax, zmin]];
  const ceiling = floor.map(([x, y]) => [x, y, zmax]);
  line(floor, "#5f867b70", 1, true);
  line(ceiling, "#5f867b38", 1, true);
  floor.forEach((point, index) => line([point, ceiling[index]], "#5f867b38"));
  for (let division = 1; division < 5; division += 1) {
    const x = xmin + (xmax - xmin) * division / 5;
    const y = ymin + (ymax - ymin) * division / 5;
    line([[x, ymin, zmin], [x, ymax, zmin]], "#5f867b40");
    line([[xmin, y, zmin], [xmax, y, zmin]], "#5f867b40");
  }
  const axes = [
    { start: [xmin, 0, 0], end: [xmax, 0, 0], label: "x" },
    { start: [0, ymin, 0], end: [0, ymax, 0], label: "y" },
    { start: [0, 0, zmin], end: [0, 0, zmax], label: "z" }
  ];
  axes.forEach(({ start, end }) => line([start, end], "#8eafa686", 1.05));

  if (Number.isFinite(launchHeight) && launchHeight >= zmin && launchHeight <= zmax) {
    const launchPlane = floor.map(([x, y]) => [x, y, launchHeight]);
    polygon(launchPlane, true);
    context.fillStyle = "#78ddc922";
    context.fill();
    context.setLineDash([4, 4]);
    line(launchPlane, TRAIL, 1.2, true);
    context.setLineDash([]);
  }

  if (section) {
    const corners = sectionCorners(bounds, section);
    if (corners.length) {
      polygon(corners, true);
      context.fillStyle = "#b595e526";
      context.fill();
      context.strokeStyle = "#d2b7fa8c";
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      context.stroke();
      context.setLineDash([]);
      drawNormal(corners);
    }
  }

  drawTrail(comparison?.points, COMPARISON, "#ffb28060", COMPARISON);
  drawTrail(trajectory.points, TRAIL, "#78ddc976", "#e5fff8");

  if (section) {
    for (const hit of crossings) {
      const [x, y] = project(hit.point ?? hit);
      circle(x, y, 2.6, SECTION, INK, 0.85);
    }
  }

  for (const { start, end, label } of axes) {
    const [x, y] = project(end);
    const [x0, y0] = project(start);
    const length = Math.hypot(x - x0, y - y0);
    if (length > 12) labelAt(x + 10 * (x - x0) / length, y + 10 * (y - y0) / length, label, AXIS, 12, "center");
  }
  for (const { id, label, point, stability } of equilibria) {
    const [x, y] = project(point);
    const color = stability === "stable" ? TRAIL : "#f0b18b";
    if (id === selectedId) circle(x, y, 8, null, SELECTION, 1.4);
    if (stability === "critical" || stability === "nonhyperbolic") {
      context.strokeStyle = SELECTION;
      context.lineWidth = 1.65;
      context.strokeRect(x - 3.65, y - 3.65, 7.3, 7.3);
    } else {
      circle(x, y, 4.25, stability === "stable" ? color : INK, color, 1.65);
    }
    if (label) labelAt(x + 8, y - 9, label, id === selectedId ? SELECTION : "#eef8f4");
  }
  for (const [point, color] of [[nextCrossing, SECTION], [selectedCrossing, SELECTION]]) {
    if (!point) continue;
    const [x, y] = project(point);
    circle(x, y, 8, null, INK, 3.6);
    circle(x, y, 8, null, color, 1.7);
    circle(x, y, 3.7, color, INK, 1.2);
  }
  context.restore();

  function equilibriumAt(x, y) {
    let nearest = null;
    let gap = 10;
    for (const equilibrium of equilibria) {
      const [px, py] = project(equilibrium.point);
      const distance = Math.hypot(x - px, y - py);
      if (distance < gap) {
        gap = distance;
        nearest = equilibrium;
      }
    }
    return nearest;
  }
  return { pointAt, equilibriumAt };
}
