(function (root) {
  "use strict";

  function accessor(value, fallback) {
    if (typeof value === "function") return value;
    if (typeof value === "string") {
      return function propertyAccessor(item) { return item[value]; };
    }
    if (value !== undefined) return function constantAccessor() { return value; };
    return fallback;
  }

  function LifeCanvasGraph(container) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A two-dimensional canvas context is unavailable.");

    canvas.className = "life-canvas-renderer";
    canvas.setAttribute("aria-hidden", "true");
    container.insertBefore(canvas, container.firstChild);

    const settings = {
      width: 640,
      height: 590,
      pixelRatio: Math.min(root.devicePixelRatio || 1, 2),
      backgroundColor: "#17211d",
      nodeColor: function defaultNodeColor() { return "#68766f"; },
      nodeVal: function defaultNodeValue() { return 1; },
      nodeLabel: function defaultNodeLabel() { return ""; },
      linkColor: function defaultLinkColor() { return "#65736c"; },
      linkOpacity: 0.22,
      linkWidth: 0.55,
      onNodeClick: null,
      yaw: -0.48,
      pitch: 0.34,
      zoom: 1,
      nodes: [],
      links: [],
      projected: [],
      dragging: false,
      moved: false,
      pointerX: 0,
      pointerY: 0
    };

    function chainSetting(name, value) {
      if (value === undefined) return settings[name];
      settings[name] = value;
      draw();
      return api;
    }

    function ensurePositions(nodes) {
      const count = nodes.length;
      nodes.forEach(function positionNode(node, index) {
        if (
          Number.isFinite(node.x) &&
          Number.isFinite(node.y) &&
          Number.isFinite(node.z)
        ) return;

        const latitude = count > 1 ? 1 - (2 * index) / (count - 1) : 0;
        const radiusAtLatitude = Math.sqrt(Math.max(0, 1 - latitude * latitude));
        const longitude = index * Math.PI * (3 - Math.sqrt(5));
        node.x = 128 * Math.cos(longitude) * radiusAtLatitude;
        node.y = 128 * latitude;
        node.z = 128 * Math.sin(longitude) * radiusAtLatitude;
      });
    }

    function nodeByReference(reference, byId) {
      if (reference && typeof reference === "object") return reference;
      return byId.get(reference);
    }

    function project(node, radius, scale) {
      const cosineYaw = Math.cos(settings.yaw);
      const sineYaw = Math.sin(settings.yaw);
      const cosinePitch = Math.cos(settings.pitch);
      const sinePitch = Math.sin(settings.pitch);
      const xzX = cosineYaw * node.x - sineYaw * node.z;
      const xzZ = sineYaw * node.x + cosineYaw * node.z;
      const viewY = cosinePitch * node.y - sinePitch * xzZ;
      const viewZ = sinePitch * node.y + cosinePitch * xzZ;
      const cameraDistance = Math.max(420, radius * 4.2);
      const perspective = cameraDistance / Math.max(80, cameraDistance + viewZ);

      return {
        node: node,
        x: settings.width / 2 + xzX * scale * perspective,
        y: settings.height / 2 + viewY * scale * perspective,
        z: viewZ,
        perspective: perspective
      };
    }

    function draw() {
      const width = Math.max(1, settings.width);
      const height = Math.max(1, settings.height);
      const ratio = Math.max(1, settings.pixelRatio);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = settings.backgroundColor;
      context.fillRect(0, 0, width, height);
      if (!settings.nodes.length) return;

      let radius = 1;
      settings.nodes.forEach(function measure(node) {
        radius = Math.max(radius, Math.hypot(node.x, node.y, node.z));
      });
      const scale = settings.zoom * Math.min(width, height) * 0.39 / radius;
      settings.projected = settings.nodes.map(function projectNode(node) {
        return project(node, radius, scale);
      });
      const projectedByNode = new Map(
        settings.projected.map(function pair(projected) { return [projected.node, projected]; })
      );
      const id = accessor(settings.nodeId, function defaultId(node) { return node.id; });
      const byId = new Map(settings.nodes.map(function mapNode(node) { return [id(node), node]; }));
      const linkColor = accessor(settings.linkColor, function defaultLinkColor() { return "#65736c"; });

      context.save();
      context.globalAlpha = settings.linkOpacity;
      context.lineWidth = Math.max(0.35, settings.linkWidth);
      settings.links.forEach(function drawLink(link) {
        const sourceNode = nodeByReference(link.source, byId);
        const targetNode = nodeByReference(link.target, byId);
        const source = projectedByNode.get(sourceNode);
        const target = projectedByNode.get(targetNode);
        if (!source || !target) return;
        context.strokeStyle = linkColor(link);
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      });
      context.restore();

      const nodeColor = accessor(settings.nodeColor, function defaultNodeColor() { return "#68766f"; });
      const nodeValue = accessor(settings.nodeVal, function defaultNodeValue() { return 1; });
      settings.projected.sort(function backToFront(first, second) { return second.z - first.z; });
      settings.projected.forEach(function drawNode(projected) {
        const value = Math.max(0.01, Number(nodeValue(projected.node)) || 0.01);
        const nodeRadius = (2.2 + 2.45 * Math.sqrt(value)) * projected.perspective;
        projected.radius = nodeRadius;
        context.fillStyle = nodeColor(projected.node);
        context.beginPath();
        context.arc(projected.x, projected.y, nodeRadius, 0, 2 * Math.PI);
        context.fill();
      });
    }

    function pointerPosition(event) {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      };
    }

    function closestNode(x, y) {
      let closest = null;
      let bestDistance = Infinity;
      settings.projected.forEach(function test(projected) {
        const distance = Math.hypot(x - projected.x, y - projected.y);
        if (distance <= Math.max(7, projected.radius + 4) && distance < bestDistance) {
          bestDistance = distance;
          closest = projected.node;
        }
      });
      return closest;
    }

    canvas.addEventListener("pointerdown", function beginRotation(event) {
      const point = pointerPosition(event);
      settings.dragging = true;
      settings.moved = false;
      settings.pointerX = point.x;
      settings.pointerY = point.y;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    });

    canvas.addEventListener("pointermove", function rotateGraph(event) {
      const point = pointerPosition(event);
      if (settings.dragging) {
        const deltaX = point.x - settings.pointerX;
        const deltaY = point.y - settings.pointerY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 2) settings.moved = true;
        settings.yaw += deltaX * 0.008;
        settings.pitch = Math.max(-1.35, Math.min(1.35, settings.pitch + deltaY * 0.008));
        settings.pointerX = point.x;
        settings.pointerY = point.y;
        draw();
        return;
      }

      const node = closestNode(point.x, point.y);
      canvas.title = node
        ? String(accessor(settings.nodeLabel, function emptyLabel() { return ""; })(node) || "")
        : "";
      canvas.classList.toggle("has-node", Boolean(node));
    });

    canvas.addEventListener("pointerup", function finishRotation(event) {
      const point = pointerPosition(event);
      canvas.classList.remove("is-dragging");
      settings.dragging = false;
      if (!settings.moved && typeof settings.onNodeClick === "function") {
        const node = closestNode(point.x, point.y);
        if (node) settings.onNodeClick(node, event);
      }
    });

    canvas.addEventListener("pointercancel", function cancelRotation() {
      settings.dragging = false;
      canvas.classList.remove("is-dragging");
    });

    canvas.addEventListener("wheel", function zoomGraph(event) {
      event.preventDefault();
      settings.zoom = Math.max(0.45, Math.min(3.5, settings.zoom * Math.exp(-event.deltaY * 0.0012)));
      draw();
    }, { passive: false });

    const api = {
      graphData: function graphData(data) {
        if (data === undefined) return { nodes: settings.nodes, links: settings.links };
        settings.nodes = data.nodes || [];
        settings.links = data.links || [];
        ensurePositions(settings.nodes);
        draw();
        return api;
      },
      refresh: function refresh() { draw(); return api; },
      width: function width(value) { return chainSetting("width", value); },
      height: function height(value) { return chainSetting("height", value); },
      backgroundColor: function backgroundColor(value) { return chainSetting("backgroundColor", value); },
      nodeId: function nodeId(value) { return chainSetting("nodeId", value); },
      nodeColor: function nodeColor(value) { return chainSetting("nodeColor", value); },
      nodeVal: function nodeVal(value) { return chainSetting("nodeVal", value); },
      nodeLabel: function nodeLabel(value) { return chainSetting("nodeLabel", value); },
      linkColor: function linkColor(value) { return chainSetting("linkColor", value); },
      linkOpacity: function linkOpacity(value) { return chainSetting("linkOpacity", value); },
      linkWidth: function linkWidth(value) { return chainSetting("linkWidth", value); },
      onNodeClick: function onNodeClick(value) { return chainSetting("onNodeClick", value); },
      zoomToFit: function zoomToFit() { settings.zoom = 1; draw(); return api; },
      renderer: function renderer() {
        return {
          setPixelRatio: function setPixelRatio(value) {
            settings.pixelRatio = Math.max(1, Number(value) || 1);
            draw();
          }
        };
      },
      pauseAnimation: function pauseAnimation() { return api; },
      resumeAnimation: function resumeAnimation() { draw(); return api; },
      showNavInfo: function showNavInfo() { return api; },
      enableNodeDrag: function enableNodeDrag() { return api; },
      nodeResolution: function nodeResolution() { return api; },
      cooldownTicks: function cooldownTicks() { return api; },
      d3Force: function d3Force() { return null; },
      d3ReheatSimulation: function d3ReheatSimulation() { return api; }
    };

    draw();
    return api;
  }

  root.LifeCanvasGraph = LifeCanvasGraph;
})(typeof globalThis !== "undefined" ? globalThis : this);
