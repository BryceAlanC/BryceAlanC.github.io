(function () {
  "use strict";

  const dynamics = window.PendulumDynamics;
  const controller = window.PendulumController;
  if (!dynamics || !controller) return;

  const physicsStep = 0.0025;
  const controlTicks = Math.round(controller.SAMPLE_TIME / physicsStep);
  const parameters = dynamics.createParameters();
  const cameraLagSeconds = 0.24;
  const cameraMaxLag = 1.25;
  const cameraFollowFraction = 1 - Math.exp(-physicsStep / cameraLagSeconds);
  const manualForceLimit = 24;
  const manualForceSlew = 90;

  const canvas = document.getElementById("pendulum-canvas");
  const context = canvas.getContext("2d");
  const controllerEnabled = document.getElementById("controller-enabled");
  const playbackSpeed = document.getElementById("playback-speed");
  const playbackSpeedValue = document.getElementById("playback-speed-value");
  const playPause = document.getElementById("play-pause");
  const stepButton = document.getElementById("step");
  const resetButton = document.getElementById("reset");
  const manualModeButton = document.getElementById("manual-mode");
  const manualControls = document.getElementById("manual-controls");
  const manualLeft = document.getElementById("manual-left");
  const manualRight = document.getElementById("manual-right");
  const shoveLeft = document.getElementById("shove-left");
  const shoveRight = document.getElementById("shove-right");
  const controllerMode = document.getElementById("controller-mode");
  const simulationTime = document.getElementById("simulation-time");
  const cartPosition = document.getElementById("cart-position");
  const linkOneAngle = document.getElementById("link-one-angle");
  const linkTwoAngle = document.getElementById("link-two-angle");
  const actuatorForce = document.getElementById("actuator-force");
  const announcer = document.getElementById("simulation-announcer");

  const simulation = {
    state: new Float64Array([0, 0, Math.PI, 0, Math.PI, 0]),
    time: 0,
    force: 0,
    ticks: 0,
    running: false,
    accumulator: 0,
    lastFrame: 0,
    cameraX: 0,
    manualMode: false,
    manualInput: {
      keyboardCodes: new Set(),
      pointerLeft: false,
      pointerRight: false
    },
    trail: []
  };

  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(function () {
      announcer.textContent = message;
    }, 20);
  }

  function cssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function mechanismPoints(state) {
    const pivotX = state[0];
    const pivotY = 0;
    const jointX = pivotX + parameters.link1Length * Math.sin(state[2]);
    const jointY = pivotY - parameters.link1Length * Math.cos(state[2]);
    const tipX = jointX + parameters.link2Length * Math.sin(state[4]);
    const tipY = jointY - parameters.link2Length * Math.cos(state[4]);
    return { pivotX, pivotY, jointX, jointY, tipX, tipY };
  }

  function updateForce() {
    const desired = controller.desiredAcceleration(
      simulation.state,
      simulation.time,
      controllerEnabled.checked
    );
    simulation.force = desired === null
      ? 0
      : dynamics.forceForAcceleration(simulation.state, desired, parameters);
  }

  function updateManualForce() {
    const leftHeld = keyboardDirectionHeld("left") || simulation.manualInput.pointerLeft;
    const rightHeld = keyboardDirectionHeld("right") || simulation.manualInput.pointerRight;
    const target = (Number(rightHeld) - Number(leftHeld)) * manualForceLimit;
    const maximumChange = manualForceSlew * physicsStep;
    simulation.force += dynamics.clamp(
      target - simulation.force,
      -maximumChange,
      maximumChange
    );
    simulation.force = dynamics.clamp(
      simulation.force,
      -parameters.forceLimit,
      parameters.forceLimit
    );
  }

  function advancePhysics() {
    if (simulation.manualMode) updateManualForce();
    else if (simulation.ticks % controlTicks === 0) updateForce();
    simulation.state = dynamics.rk4Step(
      simulation.state,
      simulation.force,
      physicsStep,
      parameters
    );
    simulation.ticks += 1;
    simulation.time = simulation.ticks * physicsStep;
    const cartX = simulation.state[0];
    simulation.cameraX += (cartX - simulation.cameraX) * cameraFollowFraction;
    simulation.cameraX = dynamics.clamp(
      simulation.cameraX,
      cartX - cameraMaxLag,
      cartX + cameraMaxLag
    );

    if (simulation.ticks % controlTicks === 0) {
      const points = mechanismPoints(simulation.state);
      simulation.trail.push([points.tipX, points.tipY]);
      if (simulation.trail.length > 180) simulation.trail.shift();
    }
  }

  function drawForceArrow(fromX, fromY, force, color) {
    if (Math.abs(force) < 0.5) return;
    const length = dynamics.clamp(Math.abs(force) * 2.2, 24, 72);
    const direction = Math.sign(force);
    const toX = fromX + direction * length;

    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, fromY);
    context.stroke();
    context.beginPath();
    context.moveTo(toX, fromY);
    context.lineTo(toX - direction * 10, fromY - 6);
    context.lineTo(toX - direction * 10, fromY + 6);
    context.closePath();
    context.fill();
  }

  function draw() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const paper = cssColor("--paper", "#f5f2e9");
    const ink = cssColor("--ink", "#17211d");
    const muted = cssColor("--muted", "#87918c");
    const first = cssColor("--gold", "#d29a4a");
    const second = cssColor("--teal", "#187a74");
    const white = cssColor("--white", "#fffdf7");
    const centerX = width / 2;
    const pivotY = height * 0.5;
    const scale = Math.min(width / 7.2, height / 3.8);
    const points = mechanismPoints(simulation.state);

    const screen = function (x, y) {
      return [centerX + (x - simulation.cameraX) * scale, pivotY + y * scale];
    };
    const pivot = screen(points.pivotX, points.pivotY);
    const joint = screen(points.jointX, points.jointY);
    const tip = screen(points.tipX, points.tipY);

    context.strokeStyle = "rgba(255, 253, 247, 0.28)";
    context.lineWidth = 2;
    const trackLeft = width * 0.035;
    const trackRight = width * 0.965;
    context.beginPath();
    context.moveTo(trackLeft, pivotY + 27);
    context.lineTo(trackRight, pivotY + 27);
    context.stroke();

    context.fillStyle = "rgba(255, 253, 247, 0.62)";
    context.font = "11px IBM Plex Mono, monospace";
    context.textAlign = "center";
    const firstMeter = Math.ceil(simulation.cameraX + (trackLeft - centerX) / scale);
    const lastMeter = Math.floor(simulation.cameraX + (trackRight - centerX) / scale);
    for (let meter = firstMeter; meter <= lastMeter; meter += 1) {
      const label = meter + " m";
      const x = screen(meter, 0)[0];
      const labelWidth = context.measureText(label).width;
      context.beginPath();
      context.moveTo(x, pivotY + 20);
      context.lineTo(x, pivotY + 34);
      context.stroke();
      if (x - labelWidth / 2 >= 4 && x + labelWidth / 2 <= width - 4) {
        context.fillText(label, x, pivotY + 50);
      }
    }

    if (simulation.trail.length > 1) {
      context.save();
      context.globalAlpha = 0.38;
      context.strokeStyle = second;
      context.lineWidth = 2;
      context.beginPath();
      simulation.trail.forEach(function (trailPoint, index) {
        const trailScreen = screen(trailPoint[0], trailPoint[1]);
        if (index === 0) context.moveTo(trailScreen[0], trailScreen[1]);
        else context.lineTo(trailScreen[0], trailScreen[1]);
      });
      context.stroke();
      context.restore();
    }

    const cartWidth = dynamics.clamp(width * 0.105, 58, 96);
    const cartHeight = dynamics.clamp(height * 0.068, 25, 38);
    context.fillStyle = paper;
    context.fillRect(
      pivot[0] - cartWidth / 2,
      pivotY - cartHeight / 2,
      cartWidth,
      cartHeight
    );
    context.fillStyle = ink;
    context.beginPath();
    context.arc(pivot[0] - cartWidth * 0.31, pivotY + cartHeight * 0.62, cartHeight * 0.23, 0, 2 * Math.PI);
    context.fill();
    context.beginPath();
    context.arc(pivot[0] + cartWidth * 0.31, pivotY + cartHeight * 0.62, cartHeight * 0.23, 0, 2 * Math.PI);
    context.fill();

    context.lineCap = "round";
    context.strokeStyle = first;
    context.lineWidth = dynamics.clamp(width * 0.01, 5, 9);
    context.beginPath();
    context.moveTo(pivot[0], pivot[1]);
    context.lineTo(joint[0], joint[1]);
    context.stroke();

    context.strokeStyle = second;
    context.lineWidth = dynamics.clamp(width * 0.008, 4, 8);
    context.beginPath();
    context.moveTo(joint[0], joint[1]);
    context.lineTo(tip[0], tip[1]);
    context.stroke();

    [
      [pivot[0], pivot[1], 7],
      [joint[0], joint[1], 7],
      [tip[0], tip[1], 8]
    ].forEach(function (point) {
      context.fillStyle = white;
      context.strokeStyle = paper;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(point[0], point[1], point[2], 0, 2 * Math.PI);
      context.fill();
      context.stroke();
    });

    drawForceArrow(pivot[0], pivotY + cartHeight, simulation.force, first);

    context.fillStyle = muted;
    context.textAlign = "left";
  }

  function displayAngle(angle) {
    const wrapped = dynamics.wrapAngle(angle);
    return Math.abs(wrapped + Math.PI) < 1e-7 ? Math.PI : wrapped;
  }

  function updateStatus() {
    const enabled = controllerEnabled.checked;
    let mode;
    if (simulation.manualMode) {
      mode = simulation.running ? "Manual · hold ← or →" : "Paused · manual control";
    } else {
      mode = controller.modeAt(simulation.time, enabled);
      if (simulation.time === 0 && !simulation.running && enabled) mode = "Ready · trajectory tracking";
      else if (!simulation.running && simulation.time > 0) mode = "Paused · " + mode;
    }

    controllerMode.textContent = mode;
    controllerMode.classList.toggle(
      "is-balancing",
      !simulation.manualMode && enabled && simulation.time >= controller.SWING_DURATION
    );
    controllerMode.classList.toggle("is-off", !simulation.manualMode && !enabled);
    controllerMode.classList.toggle("is-manual", simulation.manualMode);
    simulationTime.textContent = "t = " + simulation.time.toFixed(2) + " s";
    cartPosition.textContent = simulation.state[0].toFixed(2) + " m";
    linkOneAngle.textContent = (displayAngle(simulation.state[2]) * 180 / Math.PI).toFixed(1) + "°";
    linkTwoAngle.textContent = (displayAngle(simulation.state[4]) * 180 / Math.PI).toFixed(1) + "°";
    actuatorForce.textContent = simulation.force.toFixed(1) + " N";

    const caught = simulation.time >= controller.SWING_DURATION;
    shoveLeft.disabled = simulation.manualMode || !caught;
    shoveRight.disabled = simulation.manualMode || !caught;
  }

  function clearManualInput(update) {
    simulation.manualInput.keyboardCodes.clear();
    simulation.manualInput.pointerLeft = false;
    simulation.manualInput.pointerRight = false;
    manualLeft.classList.remove("is-held");
    manualRight.classList.remove("is-held");
    if (update === "immediate" && simulation.manualMode) simulation.force = 0;
  }

  function syncManualInputButton(direction) {
    const button = direction === "left" ? manualLeft : manualRight;
    const held = direction === "left"
      ? keyboardDirectionHeld("left") || simulation.manualInput.pointerLeft
      : keyboardDirectionHeld("right") || simulation.manualInput.pointerRight;
    button.classList.toggle("is-held", held);
  }

  function keyboardDirectionHeld(direction) {
    if (direction === "left") {
      return simulation.manualInput.keyboardCodes.has("ArrowLeft") ||
        simulation.manualInput.keyboardCodes.has("KeyA");
    }
    return simulation.manualInput.keyboardCodes.has("ArrowRight") ||
      simulation.manualInput.keyboardCodes.has("KeyD");
  }

  function setPointerInput(direction, held) {
    if (!simulation.manualMode) return;
    simulation.manualInput[direction === "left" ? "pointerLeft" : "pointerRight"] = held;
    syncManualInputButton(direction);
  }

  function setKeyboardInput(code, direction, held) {
    if (!simulation.manualMode) return;
    if (held) simulation.manualInput.keyboardCodes.add(code);
    else simulation.manualInput.keyboardCodes.delete(code);
    syncManualInputButton(direction);
  }

  function reset() {
    clearManualInput(false);
    simulation.state = new Float64Array([0, 0, Math.PI, 0, Math.PI, 0]);
    simulation.time = 0;
    simulation.force = 0;
    simulation.ticks = 0;
    simulation.running = false;
    simulation.accumulator = 0;
    simulation.lastFrame = 0;
    simulation.cameraX = 0;
    simulation.trail = [];
    playPause.textContent = "Start";
    draw();
    updateStatus();
  }

  function setManualMode(enabled) {
    clearManualInput(false);
    if (enabled) {
      simulation.manualMode = true;
      controllerEnabled.checked = false;
      controllerEnabled.disabled = true;
      manualControls.hidden = false;
      manualModeButton.textContent = "Return to automatic demo";
      manualModeButton.setAttribute("aria-pressed", "true");
      reset();
      simulation.running = true;
      playPause.textContent = "Pause";
      updateStatus();
      manualControls.focus();
      announce("Manual control started. Hold the left or right arrow key, or A or D, to apply force.");
      return;
    }

    simulation.manualMode = false;
    controllerEnabled.disabled = false;
    controllerEnabled.checked = true;
    manualControls.hidden = true;
    manualModeButton.textContent = "Try it yourself!";
    manualModeButton.setAttribute("aria-pressed", "false");
    reset();
    manualModeButton.focus();
    announce("Returned to the automatic demonstration.");
  }

  function applyImpulse(impulse) {
    if (simulation.manualMode || simulation.time < controller.SWING_DURATION) return;
    simulation.state = dynamics.applyCartImpulse(simulation.state, impulse, parameters);
    updateForce();
    draw();
    updateStatus();
    announce("Applied a " + (impulse < 0 ? "left" : "right") + " two newton-second cart impulse.");
  }

  function frame(timestamp) {
    if (!simulation.lastFrame) simulation.lastFrame = timestamp;
    const elapsed = Math.min(0.08, (timestamp - simulation.lastFrame) / 1000);
    simulation.lastFrame = timestamp;

    if (simulation.running && !document.hidden) {
      simulation.accumulator += elapsed * Number(playbackSpeed.value);
      let steps = 0;
      while (simulation.accumulator >= physicsStep && steps < 80) {
        advancePhysics();
        simulation.accumulator -= physicsStep;
        steps += 1;
      }
    }

    draw();
    updateStatus();
    window.requestAnimationFrame(frame);
  }

  playPause.addEventListener("click", function () {
    simulation.running = !simulation.running;
    if (!simulation.running && simulation.manualMode) clearManualInput("immediate");
    playPause.textContent = simulation.running ? "Pause" : "Start";
    draw();
    updateStatus();
    if (simulation.manualMode && simulation.running) manualControls.focus();
    announce(simulation.running ? "Simulation started." : "Simulation paused.");
  });

  stepButton.addEventListener("click", function () {
    simulation.running = false;
    if (simulation.manualMode) clearManualInput("immediate");
    playPause.textContent = "Start";
    for (let i = 0; i < controlTicks; i += 1) advancePhysics();
    draw();
    updateStatus();
    announce("Advanced the simulation by 0.02 seconds.");
  });

  resetButton.addEventListener("click", function () {
    reset();
    if (simulation.manualMode) manualControls.focus();
    announce("Simulation reset.");
  });

  controllerEnabled.addEventListener("change", function () {
    updateForce();
    updateStatus();
    announce(controllerEnabled.checked ? "Controller enabled." : "Controller disabled.");
  });

  playbackSpeed.addEventListener("input", function () {
    playbackSpeedValue.textContent = playbackSpeed.value + "×";
  });

  shoveLeft.addEventListener("click", function () { applyImpulse(-2); });
  shoveRight.addEventListener("click", function () { applyImpulse(2); });

  manualModeButton.addEventListener("click", function () {
    setManualMode(!simulation.manualMode);
  });

  function bindManualHoldButton(button, direction) {
    button.addEventListener("pointerdown", function beginManualHold(event) {
      if (!simulation.manualMode) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setPointerInput(direction, true);
    });
    button.addEventListener("pointerup", function endManualHold(event) {
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      setPointerInput(direction, false);
    });
    button.addEventListener("pointercancel", function cancelManualHold() {
      setPointerInput(direction, false);
    });
    button.addEventListener("lostpointercapture", function loseManualHold() {
      setPointerInput(direction, false);
    });
  }

  bindManualHoldButton(manualLeft, "left");
  bindManualHoldButton(manualRight, "right");

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, select, textarea, button, [contenteditable='true']"));
  }

  function manualDirectionForCode(code) {
    if (code === "ArrowLeft" || code === "KeyA") return "left";
    if (code === "ArrowRight" || code === "KeyD") return "right";
    return null;
  }

  window.addEventListener("keydown", function beginKeyboardManualInput(event) {
    if (!simulation.manualMode) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setManualMode(false);
      return;
    }
    const direction = manualDirectionForCode(event.code);
    if (!direction || isTypingTarget(event.target)) return;
    event.preventDefault();
    setKeyboardInput(event.code, direction, true);
  });

  window.addEventListener("keyup", function endKeyboardManualInput(event) {
    if (!simulation.manualMode) return;
    const direction = manualDirectionForCode(event.code);
    if (!direction) return;
    event.preventDefault();
    setKeyboardInput(event.code, direction, false);
  });

  window.addEventListener("blur", function releaseManualInputOnBlur() {
    clearManualInput("immediate");
  });

  document.addEventListener("visibilitychange", function releaseManualInputWhenHidden() {
    if (document.hidden) clearManualInput("immediate");
  });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", draw);
  }

  document.getElementById("current-year").textContent = String(new Date().getFullYear());
  reset();
  window.requestAnimationFrame(frame);
})();
