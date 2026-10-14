const TAU = Math.PI * 2;
const GRAPH_BACKGROUND = "#071c18";
const FUTURE_OPACITY = 0.94;
const AHEAD_INACCESSIBLE_OPACITY = 0.5;
const BEHIND_OPACITY = 0.13;
const PATH_OPACITY = 0.88;
const LANDMARK_OPACITY = 0.58;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundedRect(context, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function parseHexColor(color) {
  const value = color.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function colorWithOpacity(color, opacity) {
  const [red, green, blue] = parseHexColor(color);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity, 0, 1)})`;
}

function nodeEmphasis(node, renderer) {
  if (
    node.id === renderer.currentId ||
    node.id === renderer.previewId ||
    renderer.legalIds.has(node.id)
  ) return 1;
  if (renderer.pathNodeIds.has(node.id)) return PATH_OPACITY;
  if (renderer.reachableNodeIds.has(node.id)) return FUTURE_OPACITY;
  if (node.outcome) return LANDMARK_OPACITY;
  return node.totalStones > renderer.currentTotal
    ? BEHIND_OPACITY
    : AHEAD_INACCESSIBLE_OPACITY;
}

function edgeEmphasis(edge, renderer) {
  const sourceId = edgeSourceId(edge);
  const targetId = edgeTargetId(edge);
  if (edge.id === renderer.lastEdgeId || (sourceId === renderer.currentId && targetId === renderer.previewId)) return 1;
  if (renderer.pathEdgeIds.has(edge.id)) return PATH_OPACITY;
  if (sourceId === renderer.currentId) return 0.92;
  if (renderer.reachableEdgeIds.has(edge.id)) return 0.52;
  const source = renderer.nodeById.get(sourceId);
  const target = renderer.nodeById.get(targetId);
  const isBehind = (source?.totalStones ?? 0) > renderer.currentTotal || (target?.totalStones ?? 0) > renderer.currentTotal;
  return isBehind ? 0.06 : 0.18;
}

class CanvasNimGraphRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    if (!this.context) throw new Error("The directed graph needs a canvas context.");

    this.options = {
      onNodeClick: options.onNodeClick || null,
      onNodeHover: options.onNodeHover || null
    };
    this.keyTarget = options.keyTarget || canvas;
    this.nodes = [];
    this.edges = [];
    this.nodeById = new Map();
    this.projected = [];
    this.projectedById = new Map();
    this.currentId = null;
    this.legalIds = new Set();
    this.pathEdgeIds = new Set();
    this.pathNodeIds = new Set();
    this.reachableNodeIds = new Set();
    this.reachableEdgeIds = new Set();
    this.currentTotal = Infinity;
    this.lastEdgeId = null;
    this.previewId = null;
    this.hoverId = null;
    this.showLabels = false;
    this.yaw = -0.67;
    this.pitch = 0.28;
    this.zoom = 1;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.center = { x: 0, y: 0, z: 0 };
    this.radius = 1;
    this.pointer = null;
    this.frame = 0;
    this.animationFrame = 0;
    this.reducedMotion = prefersReducedMotion();

    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundPointerCancel = this.onPointerCancel.bind(this);
    this.boundPointerLeave = this.onPointerLeave.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);

    canvas.addEventListener("pointerdown", this.boundPointerDown);
    canvas.addEventListener("pointermove", this.boundPointerMove);
    canvas.addEventListener("pointerup", this.boundPointerUp);
    canvas.addEventListener("pointercancel", this.boundPointerCancel);
    canvas.addEventListener("pointerleave", this.boundPointerLeave);
    canvas.addEventListener("wheel", this.boundWheel, { passive: false });
    this.keyTarget.addEventListener("keydown", this.boundKeyDown);
  }

  setGraph(graph) {
    this.nodes = Array.isArray(graph?.nodes)
      ? graph.nodes.map((node) => ({
        ...node,
        x: node.position?.x ?? node.x ?? 0,
        y: node.position?.y ?? node.y ?? 0,
        z: node.position?.z ?? node.z ?? 0
      }))
      : [];
    this.edges = Array.isArray(graph?.edges) ? graph.edges : [];
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.measureGraph();
    this.draw();
  }

  setHighlights({
    currentId,
    legalIds,
    pathEdgeIds,
    pathNodeIds,
    reachableNodeIds,
    reachableEdgeIds,
    lastEdgeId,
    previewId
  } = {}) {
    this.currentId = currentId ?? null;
    this.legalIds = new Set(legalIds || []);
    this.pathEdgeIds = new Set(pathEdgeIds || []);
    this.pathNodeIds = new Set(pathNodeIds || []);
    this.reachableNodeIds = new Set(reachableNodeIds || []);
    this.reachableEdgeIds = new Set(reachableEdgeIds || []);
    this.currentTotal = this.nodeById.get(this.currentId)?.totalStones ?? Infinity;
    this.lastEdgeId = lastEdgeId ?? null;
    this.previewId = previewId ?? null;
    this.draw();
  }

  setShowLabels(showLabels) {
    this.showLabels = Boolean(showLabels);
    this.draw();
  }

  resize(width, height) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    const pixelWidth = Math.round(this.width * this.pixelRatio);
    const pixelHeight = Math.round(this.height * this.pixelRatio);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.draw();
  }

  resetView() {
    this.yaw = -0.67;
    this.pitch = 0.28;
    this.zoom = 1;
    this.draw();
  }

  pulse() {
    if (this.reducedMotion || this.animationFrame) return;
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      this.frame = Math.min(1, elapsed / 520);
      this.draw();
      if (elapsed < 520) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.frame = 0;
        this.animationFrame = 0;
        this.draw();
      }
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  destroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundPointerCancel);
    this.canvas.removeEventListener("pointerleave", this.boundPointerLeave);
    this.canvas.removeEventListener("wheel", this.boundWheel);
    this.keyTarget.removeEventListener("keydown", this.boundKeyDown);
  }

  measureGraph() {
    if (!this.nodes.length) {
      this.center = { x: 0, y: 0, z: 0 };
      this.radius = 1;
      return;
    }
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    };
    this.nodes.forEach((node) => {
      bounds.minX = Math.min(bounds.minX, node.x);
      bounds.maxX = Math.max(bounds.maxX, node.x);
      bounds.minY = Math.min(bounds.minY, node.y);
      bounds.maxY = Math.max(bounds.maxY, node.y);
      bounds.minZ = Math.min(bounds.minZ, node.z);
      bounds.maxZ = Math.max(bounds.maxZ, node.z);
    });
    this.center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2
    };
    this.radius = Math.max(
      1,
      ...this.nodes.map((node) => Math.hypot(
        node.x - this.center.x,
        node.y - this.center.y,
        node.z - this.center.z
      ))
    );
  }

  project(node) {
    const sourceX = node.x - this.center.x;
    const sourceY = node.y - this.center.y;
    const sourceZ = node.z - this.center.z;
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const yawX = cosYaw * sourceX - sinYaw * sourceZ;
    const yawZ = sinYaw * sourceX + cosYaw * sourceZ;
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const viewY = cosPitch * sourceY - sinPitch * yawZ;
    const viewZ = sinPitch * sourceY + cosPitch * yawZ;
    const cameraDistance = Math.max(620, this.radius * 4.4);
    const perspective = cameraDistance / Math.max(120, cameraDistance + viewZ);
    const scale = this.zoom * Math.min(this.width, this.height) * 0.41 / this.radius;
    return {
      node,
      x: this.width / 2 + yawX * scale * perspective,
      y: this.height / 2 - viewY * scale * perspective,
      z: viewZ,
      perspective,
      radius: clamp((node.terminal ? 7.2 : 4.25) * perspective, 2.4, 12)
    };
  }

  drawBackdrop(context) {
    const gradient = context.createRadialGradient(
      this.width * 0.54,
      this.height * 0.42,
      20,
      this.width * 0.54,
      this.height * 0.42,
      Math.max(this.width, this.height) * 0.72
    );
    gradient.addColorStop(0, "#123d39");
    gradient.addColorStop(0.58, "#0a2825");
    gradient.addColorStop(1, "#061915");
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);

    context.save();
    context.strokeStyle = "rgba(223, 248, 240, 0.045)";
    context.lineWidth = 1;
    const spacing = 34;
    for (let x = -spacing; x < this.width + spacing; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.height);
      context.stroke();
    }
    for (let y = -spacing; y < this.height + spacing; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.width, y);
      context.stroke();
    }
    context.restore();
  }

  drawEdge(context, edge, source, target) {
    const isCurrent = edgeSourceId(edge) === this.currentId;
    const isPath = this.pathEdgeIds.has(edge.id);
    const isLast = edge.id === this.lastEdgeId;
    const isPreview = target.node.id === this.previewId && isCurrent;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const unitX = dx / length;
    const unitY = dy / length;
    const sourceOffset = source.radius + 1;
    const targetOffset = target.radius + 2;
    const startX = source.x + unitX * sourceOffset;
    const startY = source.y + unitY * sourceOffset;
    const endX = target.x - unitX * targetOffset;
    const endY = target.y - unitY * targetOffset;

    let stroke = "rgba(153, 180, 171, 0.25)";
    let lineWidth = 0.7;
    if (isPath) {
      stroke = "rgba(107, 205, 191, 0.46)";
      lineWidth = 1.55;
    }
    if (isCurrent) {
      stroke = "rgba(255, 209, 102, 0.72)";
      lineWidth = 2;
    }
    if (isLast || isPreview) {
      stroke = isPreview ? "rgba(255, 229, 154, 0.98)" : "rgba(107, 224, 204, 0.96)";
      lineWidth = 3;
    }

    context.save();
    context.globalAlpha = edgeEmphasis(edge, this);
    context.strokeStyle = stroke;
    context.fillStyle = stroke;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    const arrowPosition = isCurrent ? 0.72 : 0.64;
    const arrowX = startX + (endX - startX) * arrowPosition;
    const arrowY = startY + (endY - startY) * arrowPosition;
    const arrowLength = isCurrent ? 7.5 : 4.4;
    const arrowWidth = isCurrent ? 4.8 : 2.8;
    context.beginPath();
    context.moveTo(arrowX + unitX * arrowLength, arrowY + unitY * arrowLength);
    context.lineTo(arrowX - unitX * arrowLength * 0.45 - unitY * arrowWidth, arrowY - unitY * arrowLength * 0.45 + unitX * arrowWidth);
    context.lineTo(arrowX - unitX * arrowLength * 0.45 + unitY * arrowWidth, arrowY - unitY * arrowLength * 0.45 - unitX * arrowWidth);
    context.closePath();
    context.fill();
    context.restore();
  }

  drawNode(context, projected) {
    const node = projected.node;
    const isCurrent = node.id === this.currentId;
    const isLegal = this.legalIds.has(node.id);
    const isHovered = node.id === this.hoverId;
    const isPreview = node.id === this.previewId;
    const isPath = this.pathNodeIds.has(node.id);
    let radius = projected.radius;
    if (isLegal) radius += 1.3;
    if (isCurrent) radius += 2.6;

    context.save();
    context.globalAlpha = nodeEmphasis(node, this);

    if (isCurrent || isLegal || isPreview || isPath) {
      context.save();
      context.beginPath();
      const pulse = isCurrent && this.frame ? Math.sin(this.frame * Math.PI) * 3 : 0;
      const halo = isCurrent ? 8 : isPath ? 3 : 4;
      context.arc(projected.x, projected.y, radius + halo + pulse, 0, TAU);
      context.strokeStyle = isCurrent
        ? "rgba(255, 209, 102, 0.72)"
        : isPath
          ? "rgba(107, 224, 204, 0.72)"
          : "rgba(223, 250, 244, 0.62)";
      context.lineWidth = isCurrent ? 2.2 : isPath ? 1.6 : 1.35;
      context.stroke();
      context.restore();
    }

    let outer = "#7d938a";
    let inner = "#456057";
    if (node.nimSum === 0) {
      outer = "#efb08a";
      inner = "#7f3f29";
    } else {
      outer = "#9be7d7";
      inner = "#167363";
    }
    if (node.outcome === "victory") {
      outer = "#d9fff5";
      inner = "#20a98f";
    } else if (node.outcome === "defeat") {
      outer = "#ffe0d0";
      inner = "#ba5d35";
    }
    if (isPath && !node.outcome && !isCurrent && !isLegal && !isPreview) {
      outer = "#c9fff4";
      inner = "#32a890";
    }

    const gradient = context.createRadialGradient(
      projected.x - radius * 0.35,
      projected.y - radius * 0.4,
      Math.max(0.5, radius * 0.08),
      projected.x,
      projected.y,
      radius
    );
    gradient.addColorStop(0, outer);
    gradient.addColorStop(1, inner);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(projected.x, projected.y, radius, 0, TAU);
    context.fill();

    context.strokeStyle = isHovered || isPreview ? "#fff5c9" : "rgba(255, 255, 255, 0.42)";
    context.lineWidth = isHovered || isPreview ? 2 : 0.8;
    context.stroke();

    if (node.outcome) {
      context.save();
      context.strokeStyle = "#fffdf7";
      context.lineWidth = 1.5;
      if (node.outcome === "victory") {
        context.beginPath();
        context.moveTo(projected.x - radius * 0.45, projected.y);
        context.lineTo(projected.x - radius * 0.08, projected.y + radius * 0.34);
        context.lineTo(projected.x + radius * 0.5, projected.y - radius * 0.38);
        context.stroke();
      } else {
        context.beginPath();
        context.moveTo(projected.x - radius * 0.34, projected.y - radius * 0.34);
        context.lineTo(projected.x + radius * 0.34, projected.y + radius * 0.34);
        context.moveTo(projected.x + radius * 0.34, projected.y - radius * 0.34);
        context.lineTo(projected.x - radius * 0.34, projected.y + radius * 0.34);
        context.stroke();
      }
      context.restore();
    }
    context.restore();
  }

  drawLabel(context, projected) {
    const node = projected.node;
    const persistent = node.id === this.currentId || node.outcome || this.legalIds.has(node.id);
    if (!this.showLabels && !persistent && node.id !== this.hoverId && node.id !== this.previewId) return;
    if (this.showLabels && this.nodes.length > 260 && !persistent && node.id !== this.hoverId) return;

    const label = node.outcome === "victory"
      ? "VICTORY"
      : node.outcome === "defeat"
        ? "DEFEAT"
        : `[${node.piles.join(", ")}]`;
    context.save();
    context.globalAlpha = nodeEmphasis(node, this);
    context.font = "500 10px 'IBM Plex Mono', monospace";
    const textWidth = context.measureText(label).width;
    const boxWidth = textWidth + 14;
    const boxHeight = 22;
    let x = projected.x + projected.radius + 7;
    if (x + boxWidth > this.width - 6) x = projected.x - projected.radius - boxWidth - 7;
    let y = projected.y - boxHeight / 2;
    y = clamp(y, 6, this.height - boxHeight - 6);
    roundedRect(context, x, y, boxWidth, boxHeight, 3);
    context.fillStyle = "rgba(5, 25, 22, 0.88)";
    context.fill();
    context.strokeStyle = node.id === this.currentId
      ? "rgba(255, 209, 102, 0.72)"
      : "rgba(223, 248, 240, 0.24)";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "#edf8f4";
    context.textBaseline = "middle";
    context.fillText(label, x + 7, y + boxHeight / 2 + 0.5);
    context.restore();
  }

  draw() {
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop(context);
    if (!this.nodes.length) return;

    this.projected = this.nodes.map((node) => this.project(node));
    this.projectedById = new Map(this.projected.map((item) => [item.node.id, item]));

    const projectedEdges = this.edges
      .map((edge) => ({
        edge,
        source: this.projectedById.get(edge.source),
        target: this.projectedById.get(edge.target)
      }))
      .filter((item) => item.source && item.target)
      .sort((left, right) => ((right.source.z + right.target.z) - (left.source.z + left.target.z)));
    projectedEdges.forEach(({ edge, source, target }) => this.drawEdge(context, edge, source, target));

    const nodeOrder = [...this.projected].sort((left, right) => right.z - left.z);
    nodeOrder.forEach((projected) => this.drawNode(context, projected));
    nodeOrder.forEach((projected) => this.drawLabel(context, projected));
  }

  pointerPosition(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    };
  }

  nodeAt(x, y) {
    let match = null;
    let matchDepth = Infinity;
    this.projected.forEach((projected) => {
      const hitRadius = Math.max(9, projected.radius + 5);
      if (Math.hypot(x - projected.x, y - projected.y) <= hitRadius && projected.z < matchDepth) {
        match = projected.node;
        matchDepth = projected.z;
      }
    });
    return match;
  }

  updateHover(node, point) {
    const nextId = node?.id ?? null;
    if (nextId === this.hoverId) return;
    this.hoverId = nextId;
    this.canvas.classList.toggle("has-node", Boolean(node));
    this.options.onNodeHover?.(node || null, point || null);
    this.draw();
  }

  onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const point = this.pointerPosition(event);
    this.pointer = {
      id: event.pointerId,
      type: event.pointerType,
      x: point.x,
      y: point.y,
      startX: point.x,
      startY: point.y,
      moved: false
    };
    this.canvas.setPointerCapture?.(event.pointerId);
    this.canvas.classList.add("is-dragging");
  }

  onPointerMove(event) {
    const point = this.pointerPosition(event);
    if (this.pointer && this.pointer.id === event.pointerId) {
      const dx = point.x - this.pointer.x;
      const dy = point.y - this.pointer.y;
      if (Math.hypot(point.x - this.pointer.startX, point.y - this.pointer.startY) > 4) {
        this.pointer.moved = true;
      }
      if (this.pointer.moved) {
        this.yaw += dx * 0.008;
        if (this.pointer.type !== "touch") {
          this.pitch = clamp(this.pitch - dy * 0.008, -1.35, 1.35);
        }
        this.pointer.x = point.x;
        this.pointer.y = point.y;
        this.updateHover(null, null);
        this.draw();
      }
      return;
    }
    this.updateHover(this.nodeAt(point.x, point.y), point);
  }

  onPointerUp(event) {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    const point = this.pointerPosition(event);
    const moved = this.pointer.moved;
    this.pointer = null;
    this.canvas.classList.remove("is-dragging");
    if (!moved) {
      const node = this.nodeAt(point.x, point.y);
      if (node) this.options.onNodeClick?.(node);
    }
    this.updateHover(this.nodeAt(point.x, point.y), point);
  }

  onPointerCancel() {
    this.pointer = null;
    this.canvas.classList.remove("is-dragging");
  }

  onPointerLeave() {
    if (!this.pointer) this.updateHover(null, null);
  }

  onWheel(event) {
    if (event.ctrlKey || event.metaKey) return;
    const delta = clamp(event.deltaY, -120, 120);
    const nextZoom = clamp(this.zoom * Math.exp(-delta * 0.0018), 0.55, 2.7);
    if (nextZoom === this.zoom) return;
    event.preventDefault();
    this.zoom = nextZoom;
    this.draw();
  }

  onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    let handled = true;
    if (event.key === "ArrowLeft") this.yaw -= 0.12;
    else if (event.key === "ArrowRight") this.yaw += 0.12;
    else if (event.key === "ArrowUp") this.pitch = clamp(this.pitch + 0.1, -1.35, 1.35);
    else if (event.key === "ArrowDown") this.pitch = clamp(this.pitch - 0.1, -1.35, 1.35);
    else if (event.key === "+" || event.key === "=") this.zoom = clamp(this.zoom * 1.12, 0.55, 2.7);
    else if (event.key === "-" || event.key === "_") this.zoom = clamp(this.zoom / 1.12, 0.55, 2.7);
    else if (event.key.toLowerCase() === "r") this.resetView();
    else handled = false;
    if (!handled) return;
    event.preventDefault();
    this.draw();
  }
}

function edgeSourceId(edge) {
  if (edge.sourceId) return edge.sourceId;
  return typeof edge.source === "object" ? edge.source.id : edge.source;
}

function edgeTargetId(edge) {
  if (edge.targetId) return edge.targetId;
  return typeof edge.target === "object" ? edge.target.id : edge.target;
}

function forceNodeColor(node, renderer) {
  let color = node.nimSum === 0 ? "#a95834" : "#27907b";
  if (renderer.pathNodeIds.has(node.id)) color = "#62d8c2";
  if (node.outcome === "victory") color = "#56e3c4";
  if (node.outcome === "defeat") color = "#f07f52";
  if (renderer.legalIds.has(node.id)) color = "#dffaf4";
  if (node.id === renderer.currentId) color = "#ffd166";
  if (node.id === renderer.previewId) color = "#fff1a8";
  return colorWithOpacity(color, nodeEmphasis(node, renderer));
}

function forceEdgeColor(edge, renderer) {
  let color = "#5f7d74";
  if (renderer.pathEdgeIds.has(edge.id)) color = "#4ebca7";
  if (edgeSourceId(edge) === renderer.currentId) color = "#ffd166";
  if (edge.id === renderer.lastEdgeId) color = "#8bf1dd";
  if (edgeSourceId(edge) === renderer.currentId && edgeTargetId(edge) === renderer.previewId) color = "#fff1a8";
  return colorWithOpacity(color, edgeEmphasis(edge, renderer));
}

class ForceNimGraphRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.currentId = null;
    this.legalIds = new Set();
    this.pathEdgeIds = new Set();
    this.pathNodeIds = new Set();
    this.reachableNodeIds = new Set();
    this.reachableEdgeIds = new Set();
    this.currentTotal = Infinity;
    this.lastEdgeId = null;
    this.previewId = null;
    this.nodes = [];
    this.edges = [];
    this.nodeById = new Map();
    this.rendererType = "webgl";
    this.sceneRadius = 100;
    this.sceneCenter = { x: 0, y: 0, z: 0 };
    this.layoutSettling = false;
    this.pendingReset = false;
    this.resetTimer = 0;
    this.reducedMotion = prefersReducedMotion();
    this.boundKeyDown = this.onKeyDown.bind(this);

    const graph = new window.ForceGraph3D(container, { controlType: "orbit" });
    this.graph = graph
      .showNavInfo(false)
      .enableNodeDrag(true)
      .backgroundColor(GRAPH_BACKGROUND)
      .forceEngine("d3")
      .warmupTicks(this.reducedMotion ? 80 : 24)
      .cooldownTicks(this.reducedMotion ? 0 : 90)
      .cooldownTime(this.reducedMotion ? 0 : 2500)
      .d3AlphaMin(0.02)
      .d3AlphaDecay(0.045)
      .d3VelocityDecay(0.5)
      .nodeId("id")
      .nodeRelSize(2.2)
      .nodeResolution(8)
      .nodeOpacity(1)
      .nodeColor((node) => forceNodeColor(node, this))
      .nodeVal((node) => {
        let value = node.nimSum === 0 ? 1.35 : 1;
        if (this.pathNodeIds.has(node.id)) value = 1.8;
        if (node.outcome) value = 4.8;
        if (this.legalIds.has(node.id)) value = 3.3;
        if (node.id === this.previewId) value = 4.2;
        if (node.id === this.currentId) value = 6;
        return value * (0.55 + nodeEmphasis(node, this) * 0.45);
      })
      .nodeLabel((node) => {
        const outcome = node.outcome === "victory"
          ? "<strong>Victory</strong><br>Computer to move on an empty board"
          : node.outcome === "defeat"
            ? "<strong>Defeat</strong><br>You to move on an empty board"
            : `<strong>[${node.piles.join(", ")}]</strong><br>${node.turn === "human" ? "Your turn" : "Computer turn"}<br>Nim-sum ${node.nimSum} · ${node.nimSum === 0 ? "losing" : "winning"} for mover`;
        return `<div class="force-node-label">${outcome}</div>`;
      })
      .linkColor((edge) => forceEdgeColor(edge, this))
      .linkOpacity(1)
      .linkWidth((edge) => {
        if (edge.id === this.lastEdgeId) return 2.8;
        if (edgeSourceId(edge) === this.currentId && edgeTargetId(edge) === this.previewId) return 2.5;
        if (edgeSourceId(edge) === this.currentId) return 1.8;
        if (this.pathEdgeIds.has(edge.id)) return 1.1;
        return 0;
      })
      .linkDirectionalArrowLength((edge) => {
        if (edge.id === this.lastEdgeId || (edgeSourceId(edge) === this.currentId && edgeTargetId(edge) === this.previewId)) return 4.6;
        if (edgeSourceId(edge) === this.currentId) return 3.8;
        if (this.pathEdgeIds.has(edge.id)) return 2.7;
        return 0;
      })
      .linkDirectionalArrowResolution(4)
      .linkDirectionalArrowRelPos(0.72)
      .linkDirectionalArrowColor((edge) => forceEdgeColor(edge, this))
      .linkDirectionalParticles((edge) => !this.reducedMotion && edge.id === this.lastEdgeId ? 2 : 0)
      .linkDirectionalParticleWidth(2.1)
      .linkDirectionalParticleColor(() => "#c9fff4")
      .linkDirectionalParticleSpeed(0.012)
      .onEngineStop(() => this.handleEngineStop())
      .onNodeClick((node) => this.options.onNodeClick?.(node))
      .onNodeHover((node) => this.options.onNodeHover?.(node || null, null));

    const chargeForce = graph.d3Force?.("charge");
    chargeForce?.strength?.(-23);
    chargeForce?.theta?.(1.1);
    chargeForce?.distanceMin?.(2);
    chargeForce?.distanceMax?.(220);
    const linkForce = graph.d3Force?.("link");
    linkForce?.distance?.(28);
    linkForce?.iterations?.(1);

    const renderer = graph.renderer?.();
    renderer?.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, 1.5));
    const controls = graph.controls?.();
    if (controls) {
      controls.enableDamping = !this.reducedMotion;
      controls.dampingFactor = 0.08;
      controls.minDistance = 70;
      controls.maxDistance = 2400;
    }
    window.requestAnimationFrame(() => {
      container.querySelectorAll("canvas").forEach((canvas) => canvas.setAttribute("aria-hidden", "true"));
    });
    container.addEventListener("keydown", this.boundKeyDown);
  }

  setGraph(graphData) {
    window.clearTimeout(this.resetTimer);
    this.nodes = (graphData?.nodes || []).map((node) => {
      const { x, y, z, fx, fy, fz, ...unpositionedNode } = node;
      return { ...unpositionedNode };
    });
    this.edges = (graphData?.edges || []).map((edge) => ({
      ...edge,
      source: edge.sourceId || edge.source,
      target: edge.targetId || edge.target
    }));
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.layoutSettling = true;
    this.pendingReset = true;
    this.graph.graphData({ nodes: this.nodes, links: this.edges });
  }

  setHighlights({
    currentId,
    legalIds,
    pathEdgeIds,
    pathNodeIds,
    reachableNodeIds,
    reachableEdgeIds,
    lastEdgeId,
    previewId
  } = {}) {
    this.currentId = currentId ?? null;
    this.legalIds = new Set(legalIds || []);
    this.pathEdgeIds = new Set(pathEdgeIds || []);
    this.pathNodeIds = new Set(pathNodeIds || []);
    this.reachableNodeIds = new Set(reachableNodeIds || []);
    this.reachableEdgeIds = new Set(reachableEdgeIds || []);
    this.currentTotal = this.nodeById.get(this.currentId)?.totalStones ?? Infinity;
    this.lastEdgeId = lastEdgeId ?? null;
    this.previewId = previewId ?? null;
    this.graph.refresh();
  }

  setShowLabels() {}

  resize(width, height) {
    this.graph.width(Math.max(1, Math.round(width)));
    this.graph.height(Math.max(1, Math.round(height)));
  }

  fitView(duration = 350) {
    this.graph.zoomToFit(this.reducedMotion ? 0 : duration, 56);
  }

  resetView() {
    if (this.layoutSettling) {
      this.pendingReset = true;
      return;
    }
    this.applyResetView();
  }

  measureScene() {
    const positioned = this.nodes.filter((node) => [node.x, node.y, node.z].every(Number.isFinite));
    if (!positioned.length) {
      this.sceneCenter = { x: 0, y: 0, z: 0 };
      this.sceneRadius = 100;
      return;
    }
    const bounds = positioned.reduce((result, node) => ({
      minX: Math.min(result.minX, node.x),
      maxX: Math.max(result.maxX, node.x),
      minY: Math.min(result.minY, node.y),
      maxY: Math.max(result.maxY, node.y),
      minZ: Math.min(result.minZ, node.z),
      maxZ: Math.max(result.maxZ, node.z)
    }), {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    });
    this.sceneCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2
    };
    this.sceneRadius = Math.max(
      30,
      ...positioned.map((node) => Math.hypot(
        node.x - this.sceneCenter.x,
        node.y - this.sceneCenter.y,
        node.z - this.sceneCenter.z
      ))
    );
  }

  handleEngineStop() {
    this.layoutSettling = false;
    this.measureScene();
    if (!this.pendingReset) return;
    this.pendingReset = false;
    this.applyResetView();
  }

  applyResetView() {
    window.clearTimeout(this.resetTimer);
    const duration = this.reducedMotion ? 0 : 260;
    const radius = this.sceneRadius;
    const target = this.sceneCenter;
    this.graph.cameraPosition(
      {
        x: target.x + radius * 0.92,
        y: target.y + radius * 0.58,
        z: target.z + radius * 2.25
      },
      target,
      duration
    );
    this.resetTimer = window.setTimeout(() => {
      this.resetTimer = 0;
      this.fitView(this.reducedMotion ? 0 : 260);
    }, duration);
  }

  pulse() {}

  destroy() {
    window.clearTimeout(this.resetTimer);
    this.container.removeEventListener("keydown", this.boundKeyDown);
    this.graph._destructor?.();
  }

  moveCamera({ yaw = 0, pitch = 0, scale = 1 }) {
    const position = this.graph.cameraPosition?.();
    if (!position) return;
    const controlTarget = this.graph.controls?.()?.target;
    const target = controlTarget && [controlTarget.x, controlTarget.y, controlTarget.z].every(Number.isFinite)
      ? { x: controlTarget.x, y: controlTarget.y, z: controlTarget.z }
      : this.sceneCenter;
    const offsetX = position.x - target.x;
    const offsetY = position.y - target.y;
    const offsetZ = position.z - target.z;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const yawX = cosYaw * offsetX - sinYaw * offsetZ;
    const yawZ = sinYaw * offsetX + cosYaw * offsetZ;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const nextY = cosPitch * offsetY - sinPitch * yawZ;
    const nextZ = sinPitch * offsetY + cosPitch * yawZ;
    this.graph.cameraPosition(
      {
        x: target.x + yawX * scale,
        y: target.y + nextY * scale,
        z: target.z + nextZ * scale
      },
      target,
      this.reducedMotion ? 0 : 120
    );
  }

  onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    let action = null;
    if (event.key === "ArrowLeft") action = { yaw: -0.13 };
    else if (event.key === "ArrowRight") action = { yaw: 0.13 };
    else if (event.key === "ArrowUp") action = { pitch: 0.11 };
    else if (event.key === "ArrowDown") action = { pitch: -0.11 };
    else if (event.key === "+" || event.key === "=") action = { scale: 0.88 };
    else if (event.key === "-" || event.key === "_") action = { scale: 1.14 };
    else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      this.resetView();
      return;
    }
    if (!action) return;
    event.preventDefault();
    this.moveCamera(action);
  }
}

export function createNimGraphRenderer(container, options = {}) {
  if (typeof window.ForceGraph3D === "function") {
    try {
      return new ForceNimGraphRenderer(container, options);
    } catch (error) {
      window.console.warn("WebGL graph unavailable; using the canvas compatibility view.", error);
      container.replaceChildren();
    }
  } else {
    window.console.warn("3d-force-graph did not load; using the canvas compatibility view.");
  }

  const canvas = document.createElement("canvas");
  canvas.className = "nim-canvas-graph";
  canvas.tabIndex = -1;
  canvas.setAttribute("aria-hidden", "true");
  container.replaceChildren(canvas);
  const fallback = new CanvasNimGraphRenderer(canvas, { ...options, keyTarget: container });
  fallback.rendererType = "canvas";
  fallback.fitView = function fitView() { fallback.resetView(); };
  return fallback;
}
