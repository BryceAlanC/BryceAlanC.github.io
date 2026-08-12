(function () {
  "use strict";

  const MAX_TIME = 8;
  const DT = 1 / 120;
  const VIEW = 0.22;
  const initialStates = [
    [0.09, 0],
    [0.064, 0.064],
    [0, 0.09],
    [-0.064, 0.064],
    [-0.09, 0],
    [-0.064, -0.064],
    [0, -0.09],
    [0.064, -0.064],
  ];
  const trajectoryColors = ["#f3b45a", "#e99166", "#f5d37a", "#a8d4b4", "#78c8c0", "#76a9ca", "#9d98cf", "#e7a9bd"];
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvases = {
    uncontrolled: requireElement("uncontrolled-canvas"),
    associated: requireElement("associated-canvas"),
    controlled: requireElement("controlled-canvas"),
  };
  const playToggle = requireElement("play-toggle");
  const restartButton = requireElement("restart");
  const timeSlider = requireElement("time-slider");
  const timeOutput = requireElement("time-output");
  const speedSelect = requireElement("speed-select");
  const motionNote = requireElement("motion-note");
  const trajectorySummary = requireElement("trajectory-summary");

  const trajectories = {
    uncontrolled: initialStates.map((state) => integrate(state, uncontrolledField)),
    controlled: initialStates.map((state) => integrate(state, associatedField)),
  };

  let currentTime = 0;
  let playing = !prefersReducedMotion;
  let lastTimestamp = null;
  let animationFrame = null;
  let resizeObserver = null;
  let heightObserver = null;

  initialize();

  function initialize() {
    document.documentElement.classList.toggle("is-embedded", window.self !== window.top || new URLSearchParams(window.location.search).has("embedded"));
    motionNote.hidden = !prefersReducedMotion;
    resizeCanvases();
    bindControls();
    updateControls();
    drawAll();
    announceState();
    observeSize();
    if (playing) animationFrame = window.requestAnimationFrame(tick);
  }

  function uncontrolledField(state) {
    const [x1, x2] = state;
    return [x1 * x1 + x2 * x2 + x2, x1 * x2 + x2 * x2];
  }

  function associatedField(state) {
    const [x1, x2] = state;
    return [x1 * x1 + x2 * x2 + x2, -0.5 * x1 - 2 * x2];
  }

  function controlCorrection(state) {
    const [x1, x2] = state;
    const cube = -0.5 * x1 - 2 * x2 - x1 * x2 - x2 * x2;
    const control = Math.cbrt(cube);
    return { control, cube };
  }

  function integrate(initial, field) {
    const points = [initial.slice()];
    let state = initial.slice();
    const steps = Math.round(MAX_TIME / DT);
    for (let index = 0; index < steps; index += 1) {
      if (!Number.isFinite(state[0]) || !Number.isFinite(state[1]) || Math.hypot(state[0], state[1]) > 5) {
        points.push([Number.NaN, Number.NaN]);
        continue;
      }
      state = rk4Step(state, field, DT);
      points.push(state);
    }
    return points;
  }

  function rk4Step(state, field, step) {
    const k1 = field(state);
    const k2 = field(addScaled(state, k1, step / 2));
    const k3 = field(addScaled(state, k2, step / 2));
    const k4 = field(addScaled(state, k3, step));
    return [
      state[0] + (step / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      state[1] + (step / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    ];
  }

  function addScaled(state, vector, scalar) {
    return [state[0] + scalar * vector[0], state[1] + scalar * vector[1]];
  }

  function bindControls() {
    playToggle.addEventListener("click", () => {
      playing = !playing;
      if (playing && currentTime >= MAX_TIME) currentTime = 0;
      lastTimestamp = null;
      updateControls();
      if (playing && animationFrame === null) animationFrame = window.requestAnimationFrame(tick);
      announceState();
    });

    restartButton.addEventListener("click", () => {
      currentTime = 0;
      playing = !prefersReducedMotion;
      lastTimestamp = null;
      updateControls();
      drawAll();
      announceState();
      if (playing && animationFrame === null) animationFrame = window.requestAnimationFrame(tick);
    });

    timeSlider.addEventListener("input", () => {
      currentTime = clamp(Number(timeSlider.value), 0, MAX_TIME);
      playing = false;
      lastTimestamp = null;
      updateControls();
      drawAll();
    });

    timeSlider.addEventListener("change", announceState);
    speedSelect.addEventListener("change", () => {
      lastTimestamp = null;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        lastTimestamp = null;
      } else if (playing && animationFrame === null) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    });

    window.addEventListener("pagehide", cleanup, { once: true });
  }

  function tick(timestamp) {
    animationFrame = null;
    if (!playing || document.hidden) return;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const elapsed = Math.min((timestamp - lastTimestamp) / 1000, 0.08);
    lastTimestamp = timestamp;
    currentTime += elapsed * Number(speedSelect.value || 1);
    if (currentTime >= MAX_TIME) {
      currentTime = MAX_TIME;
      playing = false;
      announceState();
    }
    updateControls();
    drawAll();
    if (playing) animationFrame = window.requestAnimationFrame(tick);
  }

  function updateControls() {
    timeSlider.value = currentTime.toFixed(2);
    timeOutput.textContent = `${currentTime.toFixed(2)} s`;
    playToggle.textContent = playing ? "Pause trajectories" : currentTime >= MAX_TIME ? "Replay trajectories" : "Play trajectories";
    playToggle.setAttribute("aria-pressed", String(playing));
  }

  function drawAll() {
    drawPanel(canvases.uncontrolled, uncontrolledField, trajectories.uncontrolled, "uncontrolled");
    drawPanel(canvases.associated, associatedField, trajectories.controlled, "associated");
    drawPanel(canvases.controlled, associatedField, trajectories.controlled, "controlled");
  }

  function drawPanel(canvas, field, panelTrajectories, mode) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    context.save();
    context.scale(pixelRatio, pixelRatio);
    const cssWidth = width / pixelRatio;
    const cssHeight = height / pixelRatio;
    context.clearRect(0, 0, cssWidth, cssHeight);
    drawBackground(context, cssWidth, cssHeight);
    drawVectorField(context, cssWidth, cssHeight, field, mode);
    drawTrajectories(context, cssWidth, cssHeight, panelTrajectories);
    drawOrigin(context, cssWidth, cssHeight);
    if (mode === "controlled") drawControlDecomposition(context, cssWidth, cssHeight, panelTrajectories[1]);
    drawPanelLabel(context, cssWidth, cssHeight, mode);
    context.restore();
  }

  function drawBackground(context, width, height) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0a241e");
    gradient.addColorStop(1, "#061612");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(255,253,247,0.07)";
    context.lineWidth = 1;
    for (let index = -4; index <= 4; index += 1) {
      const coordinate = index * 0.05;
      const x = mapX(coordinate, width);
      const y = mapY(coordinate, height);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.strokeStyle = "rgba(255,253,247,0.26)";
    context.beginPath();
    context.moveTo(mapX(0, width), 0);
    context.lineTo(mapX(0, width), height);
    context.moveTo(0, mapY(0, height));
    context.lineTo(width, mapY(0, height));
    context.stroke();
  }

  function drawVectorField(context, width, height, field, mode) {
    const color = mode === "uncontrolled" ? "rgba(229,166,73,0.42)" : "rgba(98,184,206,0.42)";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1;
    const count = width < 390 ? 8 : 10;
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        const x = -VIEW + ((column + 0.5) * 2 * VIEW) / count;
        const y = -VIEW + ((row + 0.5) * 2 * VIEW) / count;
        const vector = field([x, y]);
        const magnitude = Math.hypot(vector[0], vector[1]);
        if (magnitude < 1e-7) continue;
        const length = 5 + 11 * Math.min(magnitude / 0.17, 1);
        const vx = (vector[0] / magnitude) * length;
        const vy = (-vector[1] / magnitude) * length;
        drawArrow(context, mapX(x, width), mapY(y, height), mapX(x, width) + vx, mapY(y, height) + vy, color, 1, 3.2);
      }
    }
  }

  function drawTrajectories(context, width, height, panelTrajectories) {
    const currentIndex = Math.min(Math.round(currentTime / DT), Math.round(MAX_TIME / DT));
    panelTrajectories.forEach((points, trajectoryIndex) => {
      const color = trajectoryColors[trajectoryIndex % trajectoryColors.length];
      context.strokeStyle = color;
      context.lineWidth = 1.8;
      context.globalAlpha = 0.72;
      context.beginPath();
      let started = false;
      for (let index = 0; index <= currentIndex; index += 2) {
        const point = points[index];
        if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) break;
        const x = mapX(point[0], width);
        const y = mapY(point[1], height);
        if (!started) {
          context.moveTo(x, y);
          started = true;
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
      context.globalAlpha = 1;

      const point = points[currentIndex];
      if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      if (Math.abs(point[0]) > VIEW || Math.abs(point[1]) > VIEW) return;
      const x = mapX(point[0], width);
      const y = mapY(point[1], height);
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 9;
      context.beginPath();
      context.arc(x, y, 4.1, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    });
  }

  function drawOrigin(context, width, height) {
    const x = mapX(0, width);
    const y = mapY(0, height);
    context.fillStyle = "#fffdf7";
    context.beginPath();
    context.arc(x, y, 3.4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(255,253,247,0.5)";
    context.beginPath();
    context.arc(x, y, 8.5, 0, Math.PI * 2);
    context.stroke();
  }

  function drawControlDecomposition(context, width, height, trajectory) {
    const currentIndex = Math.min(Math.round(currentTime / DT), trajectory.length - 1);
    const state = trajectory[currentIndex];
    if (!state || !Number.isFinite(state[0]) || !Number.isFinite(state[1])) return;
    if (Math.abs(state[0]) > VIEW * 0.85 || Math.abs(state[1]) > VIEW * 0.85) return;
    const native = uncontrolledField(state);
    const correction = controlCorrection(state);
    const result = associatedField(state);
    const largest = Math.max(Math.hypot(...native), Math.abs(correction.cube), Math.hypot(...result), 0.035);
    const scale = Math.min(54 / largest, 620);
    const originX = mapX(state[0], width);
    const originY = mapY(state[1], height);
    const nativeEndX = originX + native[0] * scale;
    const nativeEndY = originY - native[1] * scale;
    const resultEndX = originX + result[0] * scale;
    const resultEndY = originY - result[1] * scale;

    drawArrow(context, originX, originY, nativeEndX, nativeEndY, "#e5a649", 2.4, 6);
    drawArrow(context, nativeEndX, nativeEndY, resultEndX, resultEndY, "#65c895", 2.4, 6);
    drawArrow(context, originX, originY, resultEndX, resultEndY, "#62b8ce", 2.8, 7);

    context.font = "600 10px ui-monospace, monospace";
    context.fillStyle = "#e5a649";
    context.fillText("native", nativeEndX + 5, nativeEndY - 5);
    context.fillStyle = "#65c895";
    context.fillText(`u³`, resultEndX + 5, (nativeEndY + resultEndY) / 2);
    context.fillStyle = "#8dd6e7";
    context.fillText("g(x)", resultEndX + 5, resultEndY + 12);
  }

  function drawPanelLabel(context, width, height, mode) {
    context.fillStyle = "rgba(255,253,247,0.68)";
    context.font = "600 10px ui-monospace, monospace";
    const label = mode === "uncontrolled" ? "UNCONTROLLED" : mode === "associated" ? "ASSOCIATED FIELD" : "CONTROLLED PLANT";
    context.fillText(label, 12, 18);
    context.textAlign = "right";
    context.fillText("ORIGIN · (0,0)", width - 12, height - 11);
    context.textAlign = "left";
  }

  function drawArrow(context, startX, startY, endX, endY, color, lineWidth, headSize) {
    const angle = Math.atan2(endY - startY, endX - startX);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    context.beginPath();
    context.moveTo(endX, endY);
    context.lineTo(endX - headSize * Math.cos(angle - Math.PI / 6), endY - headSize * Math.sin(angle - Math.PI / 6));
    context.lineTo(endX - headSize * Math.cos(angle + Math.PI / 6), endY - headSize * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
  }

  function mapX(value, width) {
    return ((value + VIEW) / (2 * VIEW)) * width;
  }

  function mapY(value, height) {
    return ((VIEW - value) / (2 * VIEW)) * height;
  }

  function resizeCanvases() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    Object.values(canvases).forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(280, Math.round(rect.width));
      const height = Math.max(220, Math.round(rect.height || width / 1.12));
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    });
    drawAll();
  }

  function observeSize() {
    resizeObserver = new ResizeObserver(() => resizeCanvases());
    resizeObserver.observe(requireElement("demo-shell"));

    const postHeight = () => {
      if (window.self === window.top) return;
      const shell = requireElement("demo-shell");
      const height = Math.ceil(shell.getBoundingClientRect().height + 2);
      window.parent.postMessage({ type: "paper-concept-demo-height", height }, window.location.origin);
    };
    heightObserver = new ResizeObserver(postHeight);
    heightObserver.observe(requireElement("demo-shell"));
    window.addEventListener("load", postHeight, { once: true });
    window.requestAnimationFrame(postHeight);
    window.setTimeout(postHeight, 400);
  }

  function announceState() {
    trajectorySummary.textContent = `${playing ? "Playing" : "Paused"} at ${currentTime.toFixed(1)} seconds. The uncontrolled panel contains trajectories that move away from the origin; the associated and controlled panels show the same trajectories converging locally toward the origin.`;
  }

  function cleanup() {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    resizeObserver?.disconnect();
    heightObserver?.disconnect();
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function requireElement(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element;
  }
})();
