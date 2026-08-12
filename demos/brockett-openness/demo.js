(function () {
  "use strict";

  const defaults = { kappa: 0.8, target: 0.8, gain: 0.8, radius: 0.1, shape: "sqrt" };
  const state = { ...defaults };
  const controls = {
    kappa: requireElement("kappa-slider"),
    target: requireElement("target-slider"),
    gain: requireElement("gain-slider"),
    radius: requireElement("radius-slider"),
    reset: requireElement("reset-controls"),
  };
  const outputs = {
    kappa: requireElement("kappa-output"),
    target: requireElement("target-output"),
    gain: requireElement("gain-output"),
    radius: requireElement("radius-output"),
    gainFormula: requireElement("gain-formula"),
  };
  const geometryCanvas = requireElement("geometry-canvas");
  const profileCanvas = requireElement("profile-canvas");
  const statusCard = requireElement("status-card");
  const statusKicker = requireElement("status-kicker");
  const statusTitle = requireElement("status-title");
  const statusDetail = requireElement("status-detail");
  const thresholdFormula = requireElement("threshold-formula");
  let resizeObserver = null;
  let heightObserver = null;

  initialize();

  function initialize() {
    document.documentElement.classList.toggle("is-embedded", window.self !== window.top || new URLSearchParams(window.location.search).has("embedded"));
    bindControls();
    resizeCanvases();
    update();
    observeSize();
  }

  function bindControls() {
    controls.kappa.addEventListener("input", () => setNumericState("kappa", controls.kappa.value));
    controls.target.addEventListener("input", () => setNumericState("target", controls.target.value));
    controls.gain.addEventListener("input", () => setNumericState("gain", controls.gain.value));
    controls.radius.addEventListener("input", () => setNumericState("radius", controls.radius.value));
    document.querySelectorAll('input[name="gain-shape"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          state.shape = radio.value;
          update();
        }
      });
    });
    controls.reset.addEventListener("click", resetControls);
    window.addEventListener("pagehide", cleanup, { once: true });
  }

  function setNumericState(key, value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    state[key] = parsed;
    update();
  }

  function resetControls() {
    Object.assign(state, defaults);
    controls.kappa.value = String(state.kappa);
    controls.target.value = String(state.target);
    controls.gain.value = String(state.gain);
    controls.radius.value = String(state.radius);
    const selected = document.querySelector(`input[name="gain-shape"][value="${state.shape}"]`);
    if (selected) selected.checked = true;
    update();
  }

  function update() {
    outputs.kappa.textContent = `κ = ${state.kappa.toFixed(2)}`;
    outputs.target.textContent = `c = ${state.target.toFixed(2)}`;
    outputs.gain.textContent = `K = ${state.gain.toFixed(2)}`;
    outputs.radius.textContent = `r = ${state.radius.toFixed(2)}`;
    outputs.gainFormula.innerHTML = state.shape === "sqrt" ? "d(r)=K&radic;r" : "d(r)=Kr";

    const values = valuesAt(state.radius);
    setText("metric-gain", `d(r) = ${format(values.gainBound)}`);
    setText("metric-radius", `R = ${format(values.jointRadius)}`);
    setText("metric-target", `cr = ${format(values.targetBall)}`);
    requireElement("metric-capacity").innerHTML = `κR<sup>2</sup> = ${format(values.capacity)}`;

    const threshold = Math.sqrt(state.target / state.kappa);
    thresholdFormula.innerHTML = `K &ge; &radic;(c/&kappa;) = ${threshold.toFixed(2)}`;
    updateStatus(values, threshold);
    drawGeometry(values);
    drawProfile();
  }

  function valuesAt(radius) {
    const gainBound = state.shape === "sqrt" ? state.gain * Math.sqrt(radius) : state.gain * radius;
    const jointRadius = Math.hypot(radius, gainBound);
    const targetBall = state.target * radius;
    const capacity = state.kappa * jointRadius * jointRadius;
    return { radius, gainBound, jointRadius, targetBall, capacity, localPass: targetBall <= capacity + 1e-12 };
  }

  function updateStatus(values, threshold) {
    const asymptoticPass = state.shape === "sqrt" && state.gain + 1e-10 >= threshold;
    statusCard.classList.toggle("is-pass", asymptoticPass);
    statusCard.querySelector(".status-icon").textContent = asymptoticPass ? "✓" : "!";
    if (asymptoticPass) {
      statusKicker.textContent = "Exact controller fits";
      statusTitle.textContent = "The square-root envelope reaches the required scale.";
      statusDetail.textContent = `K=${state.gain.toFixed(2)} is at least √(c/κ)=${threshold.toFixed(2)}. In this exact example the constructed feedback produces the linear field −cx and fits the displayed ceiling.`;
    } else if (state.shape === "linear") {
      statusKicker.textContent = "Ruled out near the equilibrium";
      statusTitle.textContent = "Every finite linear envelope is asymptotically too small.";
      statusDetail.textContent = `At r=${state.radius.toFixed(2)}, the necessary inequality ${values.localPass ? "happens to hold" : "already fails"}; however, κ(1+K²)r² eventually falls below cr as r approaches zero.`;
    } else {
      const crossover = Math.max(0, state.target / state.kappa - state.gain * state.gain);
      statusKicker.textContent = "Ruled out near the equilibrium";
      statusTitle.textContent = "This gain envelope is too small.";
      statusDetail.textContent = `K=${state.gain.toFixed(2)} is below √(c/κ)=${threshold.toFixed(2)}. The necessary inequality fails for sufficiently small radii${crossover > 0 ? ` (here, below about r=${crossover.toFixed(2)})` : ""}.`;
    }
  }

  function drawGeometry(values) {
    withCanvas(geometryCanvas, (context, width, height) => {
      drawCanvasBackground(context, width, height);
      const ellipseX = 1.6 * values.capacity;
      const ellipseY = values.capacity;
      const largest = Math.max(ellipseX, values.targetBall, 1e-4);
      const scale = Math.min((width - 72) / (2 * largest), (height - 105) / (2 * Math.max(ellipseY, values.targetBall, 1e-4)));
      const centerX = width / 2;
      const centerY = (height - 20) / 2;
      const ellipseRadiusX = ellipseX * scale;
      const ellipseRadiusY = ellipseY * scale;
      const capacityRadius = values.capacity * scale;
      const targetRadius = values.targetBall * scale;

      context.fillStyle = "rgba(134,170,180,0.22)";
      context.strokeStyle = "rgba(156,198,207,0.9)";
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(centerX, centerY, ellipseRadiusX, ellipseRadiusY, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.save();
      context.setLineDash([6, 5]);
      context.strokeStyle = "#65c895";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(centerX, centerY, capacityRadius, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      context.fillStyle = values.localPass ? "rgba(101,200,149,0.2)" : "rgba(235,104,80,0.2)";
      context.strokeStyle = values.localPass ? "#8bddb2" : "#f07962";
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(centerX, centerY, targetRadius, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.fillStyle = "#fffdf7";
      context.beginPath();
      context.arc(centerX, centerY, 3, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255,253,247,0.74)";
      context.font = "600 10px ui-monospace, monospace";
      context.fillText(`R = ${format(values.jointRadius)}`, 14, 19);
      context.textAlign = "right";
      context.fillText(values.localPass ? "TARGET FITS AT THIS SCALE" : "TARGET OVERFLOWS", width - 14, 19);
      context.textAlign = "left";

      const description = `At radius ${state.radius.toFixed(2)}, the output image is an ellipse with inball radius ${format(values.capacity)}. The desired closed-loop ball has radius ${format(values.targetBall)} and ${values.localPass ? "fits inside" : "exceeds"} that inball.`;
      geometryCanvas.setAttribute("aria-label", description);
    });
  }

  function drawProfile() {
    withCanvas(profileCanvas, (context, width, height) => {
      drawCanvasBackground(context, width, height);
      const margin = { top: 26, right: 18, bottom: 42, left: 49 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const maxRadius = 0.35;
      const samples = 180;
      let maxValue = 0;
      const series = [];
      for (let index = 1; index <= samples; index += 1) {
        const radius = (index / samples) * maxRadius;
        const values = valuesAt(radius);
        maxValue = Math.max(maxValue, values.targetBall, values.capacity);
        series.push(values);
      }
      maxValue = Math.max(maxValue * 1.12, 0.03);
      const mapX = (radius) => margin.left + (radius / maxRadius) * plotWidth;
      const mapY = (value) => margin.top + plotHeight - (value / maxValue) * plotHeight;

      for (let index = 0; index < series.length - 1; index += 1) {
        const current = series[index];
        const next = series[index + 1];
        context.fillStyle = current.localPass ? "rgba(40,132,102,0.075)" : "rgba(189,87,63,0.10)";
        context.fillRect(mapX(current.radius), margin.top, Math.max(1, mapX(next.radius) - mapX(current.radius) + 1), plotHeight);
      }

      context.strokeStyle = "rgba(255,253,247,0.13)";
      context.lineWidth = 1;
      context.fillStyle = "rgba(255,253,247,0.58)";
      context.font = "10px ui-monospace, monospace";
      for (let index = 0; index <= 4; index += 1) {
        const xValue = (index / 4) * maxRadius;
        const x = mapX(xValue);
        context.beginPath();
        context.moveTo(x, margin.top);
        context.lineTo(x, margin.top + plotHeight);
        context.stroke();
        context.textAlign = "center";
        context.fillText(xValue.toFixed(2), x, height - 17);

        const yValue = (index / 4) * maxValue;
        const y = mapY(yValue);
        context.beginPath();
        context.moveTo(margin.left, y);
        context.lineTo(margin.left + plotWidth, y);
        context.stroke();
        context.textAlign = "right";
        context.fillText(yValue.toFixed(2), margin.left - 7, y + 3);
      }

      drawSeries(context, series, mapX, mapY, (values) => values.capacity, "#65c895", 2.7);
      drawSeries(context, series, mapX, mapY, (values) => values.targetBall, "#f3ad64", 2.7);

      const cursorX = mapX(state.radius);
      const cursorValues = valuesAt(state.radius);
      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = "rgba(255,253,247,0.82)";
      context.beginPath();
      context.moveTo(cursorX, margin.top);
      context.lineTo(cursorX, margin.top + plotHeight);
      context.stroke();
      context.restore();

      drawPoint(context, cursorX, mapY(cursorValues.capacity), "#65c895");
      drawPoint(context, cursorX, mapY(cursorValues.targetBall), "#f3ad64");
      context.textAlign = "left";
      context.fillStyle = "rgba(255,253,247,0.72)";
      context.fillText("openness radius", margin.left + 2, 14);
      context.textAlign = "right";
      context.fillText("state radius r", width - margin.right, height - 4);

      profileCanvas.setAttribute("aria-label", `The target curve cr is compared with capacity kappa times r squared plus d of r squared from zero to ${maxRadius}. At the selected radius ${state.radius.toFixed(2)}, the necessary inequality ${cursorValues.localPass ? "holds" : "fails"}.`);
    });
  }

  function drawSeries(context, series, mapX, mapY, accessor, color, lineWidth) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    series.forEach((values, index) => {
      const x = mapX(values.radius);
      const y = mapY(accessor(values));
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  function drawPoint(context, x, y, color) {
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 8;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }

  function drawCanvasBackground(context, width, height) {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0a241e");
    gradient.addColorStop(1, "#061612");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  function withCanvas(canvas, draw) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / pixelRatio;
    const height = canvas.height / pixelRatio;
    context.save();
    context.scale(pixelRatio, pixelRatio);
    context.clearRect(0, 0, width, height);
    draw(context, width, height);
    context.restore();
  }

  function resizeCanvases() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    [geometryCanvas, profileCanvas].forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(280, Math.round(rect.width));
      const ratio = canvas === profileCanvas ? 1.35 : 1.3;
      const height = Math.max(245, Math.round(rect.height || width / ratio));
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    });
    drawGeometry(valuesAt(state.radius));
    drawProfile();
  }

  function observeSize() {
    resizeObserver = new ResizeObserver(resizeCanvases);
    resizeObserver.observe(requireElement("demo-shell"));

    const postHeight = () => {
      if (window.self === window.top) return;
      const height = Math.ceil(requireElement("demo-shell").getBoundingClientRect().height + 2);
      window.parent.postMessage({ type: "paper-concept-demo-height", height }, window.location.origin);
    };
    heightObserver = new ResizeObserver(postHeight);
    heightObserver.observe(requireElement("demo-shell"));
    window.addEventListener("load", postHeight, { once: true });
    window.requestAnimationFrame(postHeight);
    window.setTimeout(postHeight, 400);
  }

  function cleanup() {
    resizeObserver?.disconnect();
    heightObserver?.disconnect();
  }

  function setText(id, value) {
    requireElement(id).textContent = value;
  }

  function format(value) {
    if (value === 0) return "0";
    if (Math.abs(value) < 0.001) return value.toExponential(2);
    return value.toFixed(3);
  }

  function requireElement(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element;
  }
})();
