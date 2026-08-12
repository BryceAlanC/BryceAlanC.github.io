(function () {
  "use strict";

  const dynamics = window.PendulumDynamics;
  const controller = window.PendulumController;
  if (!dynamics || !controller) return;

  const physicsStep = 0.0025;
  const controlTicks = Math.round(controller.SAMPLE_TIME / physicsStep);
  const parameters = dynamics.createParameters();

  const canvas = document.getElementById("pendulum-canvas");
  const context = canvas.getContext("2d");
  const controllerEnabled = document.getElementById("controller-enabled");
  const playbackSpeed = document.getElementById("playback-speed");
  const playbackSpeedValue = document.getElementById("playback-speed-value");
  const playPause = document.getElementById("play-pause");
  const stepButton = document.getElementById("step");
  const resetButton = document.getElementById("reset");
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

  function advancePhysics() {
    if (simulation.ticks % controlTicks === 0) updateForce();
    simulation.state = dynamics.rk4Step(
      simulation.state,
      simulation.force,
      physicsStep,
      parameters
    );
    simulation.ticks += 1;
    simulation.time = simulation.ticks * physicsStep;

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
      return [centerX + x * scale, pivotY + y * scale];
    };
    const pivot = screen(points.pivotX, points.pivotY);
    const joint = screen(points.jointX, points.jointY);
    const tip = screen(points.tipX, points.tipY);

    context.strokeStyle = "rgba(255, 253, 247, 0.28)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width * 0.035, pivotY + 27);
    context.lineTo(width * 0.965, pivotY + 27);
    context.stroke();

    context.fillStyle = "rgba(255, 253, 247, 0.62)";
    context.font = "11px IBM Plex Mono, monospace";
    context.textAlign = "center";
    for (let meter = -3; meter <= 3; meter += 1) {
      const x = centerX + meter * scale;
      context.beginPath();
      context.moveTo(x, pivotY + 20);
      context.lineTo(x, pivotY + 34);
      context.stroke();
      context.fillText(meter + " m", x, pivotY + 50);
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
    let mode = controller.modeAt(simulation.time, enabled);
    if (simulation.time === 0 && !simulation.running && enabled) mode = "Ready · trajectory tracking";
    else if (!simulation.running && simulation.time > 0) mode = "Paused · " + mode;

    controllerMode.textContent = mode;
    controllerMode.classList.toggle("is-balancing", enabled && simulation.time >= controller.SWING_DURATION);
    controllerMode.classList.toggle("is-off", !enabled);
    simulationTime.textContent = "t = " + simulation.time.toFixed(2) + " s";
    cartPosition.textContent = simulation.state[0].toFixed(2) + " m";
    linkOneAngle.textContent = (displayAngle(simulation.state[2]) * 180 / Math.PI).toFixed(1) + "°";
    linkTwoAngle.textContent = (displayAngle(simulation.state[4]) * 180 / Math.PI).toFixed(1) + "°";
    actuatorForce.textContent = simulation.force.toFixed(1) + " N";

    const caught = simulation.time >= controller.SWING_DURATION;
    shoveLeft.disabled = !caught;
    shoveRight.disabled = !caught;
  }

  function reset() {
    simulation.state = new Float64Array([0, 0, Math.PI, 0, Math.PI, 0]);
    simulation.time = 0;
    simulation.force = 0;
    simulation.ticks = 0;
    simulation.running = false;
    simulation.accumulator = 0;
    simulation.lastFrame = 0;
    simulation.trail = [];
    playPause.textContent = "Start";
    draw();
    updateStatus();
  }

  function applyImpulse(impulse) {
    if (simulation.time < controller.SWING_DURATION) return;
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
    playPause.textContent = simulation.running ? "Pause" : "Start";
    announce(simulation.running ? "Simulation started." : "Simulation paused.");
  });

  stepButton.addEventListener("click", function () {
    simulation.running = false;
    playPause.textContent = "Start";
    for (let i = 0; i < controlTicks; i += 1) advancePhysics();
    draw();
    updateStatus();
    announce("Advanced the simulation by 0.02 seconds.");
  });

  resetButton.addEventListener("click", function () {
    reset();
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
