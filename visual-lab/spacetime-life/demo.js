import * as THREE from "../ball-blaster/vendor/three.module.min.js";

(function initializeSpacetimeVisualizer() {
  "use strict";

  const Life = window.SpacetimeLife;
  if (!Life) return;

  const elements = {
    drawAlive: document.getElementById("draw-alive"),
    drawDead: document.getElementById("draw-dead"),
    pattern: document.getElementById("life-pattern"),
    loadPattern: document.getElementById("load-pattern"),
    boardSize: document.getElementById("board-size"),
    wrap: document.getElementById("wrap-boundary"),
    speed: document.getElementById("life-speed"),
    speedValue: document.getElementById("life-speed-value"),
    limit: document.getElementById("generation-limit"),
    limitValue: document.getElementById("generation-limit-value"),
    play: document.getElementById("life-play"),
    step: document.getElementById("life-step"),
    restart: document.getElementById("life-restart"),
    clear: document.getElementById("life-clear"),
    fit: document.getElementById("fit-view"),
    status: document.getElementById("life-status"),
    seedFrame: document.getElementById("seed-grid-frame"),
    seedCanvas: document.getElementById("seed-grid"),
    historyViewport: document.getElementById("history-viewport"),
    historyCanvas: document.getElementById("history-canvas"),
    historyMessage: document.getElementById("history-message"),
    generation: document.getElementById("life-generation"),
    alive: document.getElementById("life-alive"),
    voxels: document.getElementById("life-voxels"),
    boundary: document.getElementById("life-boundary"),
    axisNow: document.getElementById("history-axis-now"),
    axisOldest: document.getElementById("history-axis-oldest"),
    historyRange: document.getElementById("history-range"),
    historyState: document.getElementById("history-state-description"),
    announcer: document.getElementById("life-announcer")
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const voxelLimit = coarsePointer ? 90000 : 160000;
  const emptyBirths = function emptyBirths(size) { return new Uint8Array(size * size); };

  const model = {
    size: Number(elements.boardSize.value),
    seedName: elements.pattern.value,
    seed: null,
    history: [],
    neighborTable: null,
    wrap: elements.wrap.checked,
    generation: 0,
    historyLimit: Number(elements.limit.value),
    layerSpacing: 1,
    speed: Number(elements.speed.value),
    playing: false,
    stopReason: "ready",
    autoStartPending: !reducedMotion,
    inViewport: typeof IntersectionObserver !== "function",
    totalVoxels: 0,
    drawValue: 1,
    cursorRow: 0,
    cursorColumn: 0,
    hoverCell: null,
    painting: false,
    activePaintPointer: null,
    lastPaintCell: null,
    paintedCells: new Set(),
    accumulator: 0,
    previousFrame: 0,
    animationFrame: 0
  };

  const gridContext = elements.seedCanvas.getContext("2d");
  const three = {
    renderer: null,
    scene: null,
    camera: null,
    voxels: null,
    voxelGeometry: null,
    voxelMaterial: null,
    baseGrid: null,
    currentGrid: null,
    timeArrow: null,
    resizeObserver: null,
    ready: false,
    failed: false,
    dummy: new THREE.Object3D(),
    color: new THREE.Color(),
    oldColor: new THREE.Color("#d5ddd9"),
    middleColor: new THREE.Color("#eee9dc"),
    recentColor: new THREE.Color("#f8d5b4"),
    currentColor: new THREE.Color("#fffdf5"),
    birthColor: new THREE.Color("#c9f5e8")
  };

  const orbit = {
    theta: 0.72,
    phi: 1.02,
    radius: 56,
    targetY: 0,
    autoFollow: true,
    pointers: new Map(),
    pinchDistance: 0
  };
  let viewportObserver = null;

  function announce(message) {
    elements.announcer.textContent = "";
    window.setTimeout(function setAnnouncement() {
      elements.announcer.textContent = message;
    }, 10);
  }

  function cancelAutoStart() {
    model.autoStartPending = false;
  }

  function armAutoStart() {
    if (typeof IntersectionObserver !== "function") {
      model.inViewport = true;
      if (model.autoStartPending) {
        cancelAutoStart();
        setPlaying(true, "running", false);
      }
      return;
    }
    viewportObserver = new IntersectionObserver(function trackVisibleRun(entries) {
      const latestEntry = entries[entries.length - 1];
      if (!latestEntry) return;
      const wasVisible = model.inViewport;
      model.inViewport = latestEntry.isIntersecting && latestEntry.intersectionRatio >= 0.05;

      if (!model.inViewport && model.animationFrame) {
        window.cancelAnimationFrame(model.animationFrame);
        model.animationFrame = 0;
        model.previousFrame = 0;
        model.accumulator = 0;
      } else if (!wasVisible && model.inViewport && model.playing) {
        model.previousFrame = 0;
        model.accumulator = 0;
        requestAnimation();
      }

      if (model.autoStartPending && model.inViewport && latestEntry.intersectionRatio >= 0.22) {
        cancelAutoStart();
        setPlaying(true, "running", false);
      }
    }, { threshold: [0, 0.05, 0.22] });
    viewportObserver.observe(elements.historyViewport);
  }

  function currentEntry() {
    return model.history[model.history.length - 1];
  }

  function currentState() {
    return currentEntry().state;
  }

  function firstVisibleGeneration() {
    return model.generation - model.history.length + 1;
  }

  function visibleStackHeight() {
    return Math.max(1, (model.history.length - 1) * model.layerSpacing);
  }

  function discardOldestLayer() {
    if (model.history.length <= 1) return false;
    const removed = model.history.shift();
    const removedPopulation = Number.isFinite(removed.population)
      ? removed.population
      : Life.countAlive(removed.state);
    model.totalVoxels = Math.max(0, model.totalVoxels - removedPopulation);
    return true;
  }

  function trimHistoryWindow() {
    while (model.history.length > model.historyLimit) discardOldestLayer();
    while (model.totalVoxels > voxelLimit && model.history.length > 1) discardOldestLayer();
  }

  function setDrawValue(value, shouldAnnounce) {
    model.drawValue = value ? 1 : 0;
    elements.drawAlive.setAttribute("aria-pressed", model.drawValue ? "true" : "false");
    elements.drawDead.setAttribute("aria-pressed", model.drawValue ? "false" : "true");
    elements.drawAlive.classList.toggle("lab-button-primary", Boolean(model.drawValue));
    elements.drawDead.classList.toggle("lab-button-primary", !model.drawValue);
    if (shouldAnnounce) announce(model.drawValue ? "Drawing living cells." : "Erasing cells.");
  }

  function updateOutputs() {
    const living = Life.countAlive(currentState());
    const generationLabel = model.generation.toLocaleString();
    elements.speedValue.textContent = model.speed + " gen/s";
    const oldestGeneration = firstVisibleGeneration();
    const oldestGenerationLabel = oldestGeneration.toLocaleString();
    elements.limitValue.textContent = model.historyLimit + " layers";
    elements.generation.textContent = generationLabel;
    elements.alive.textContent = living.toLocaleString();
    elements.voxels.textContent = model.totalVoxels.toLocaleString();
    elements.boundary.textContent = model.wrap ? "Wrapped" : "Finite";
    elements.play.textContent = model.playing ? "Pause" : "Play";
    elements.play.setAttribute("aria-pressed", model.playing ? "true" : "false");
    elements.step.disabled = model.playing || living === 0;
    elements.play.disabled = living === 0;
    elements.status.textContent = "Generation " + generationLabel + " · " + model.stopReason;
    elements.axisNow.textContent = "Now · " + generationLabel;
    elements.axisOldest.textContent = "Oldest · " + oldestGenerationLabel;
    elements.historyRange.textContent =
      "Time ↑ · " + oldestGenerationLabel + "–" + generationLabel;
    elements.historyState.textContent =
      "Generation " + generationLabel + ", " + living.toLocaleString() +
      " living cells, " + model.totalVoxels.toLocaleString() +
      " visible voxels across generations " + oldestGenerationLabel +
      " through " + generationLabel + ".";
    elements.seedCanvas.setAttribute(
      "aria-label",
      "Editable " + model.size + " by " + model.size +
        " Game of Life starting grid. Use the arrow keys to move between cells and Space or Enter to apply the selected drawing mode."
    );
  }

  function setPlaying(playing, reason, shouldAnnounce) {
    if (playing) {
      if (Life.countAlive(currentState()) === 0) {
        model.playing = false;
        model.stopReason = "seed is empty";
        if (shouldAnnounce) announce("Draw at least one living cell before playing.");
      } else {
        model.playing = true;
        model.stopReason = "running";
        model.accumulator = 0;
        model.previousFrame = 0;
        requestAnimation();
        if (shouldAnnounce) announce("Simulation running.");
      }
    } else {
      model.playing = false;
      model.stopReason = reason || "paused";
      model.accumulator = 0;
      if (shouldAnnounce) announce("Simulation paused at generation " + model.generation + ".");
    }
    updateOutputs();
  }

  function resetEvolution(reason) {
    const seedPopulation = Life.countAlive(model.seed);
    model.history = [{
      state: model.seed.slice(),
      births: emptyBirths(model.size),
      population: seedPopulation
    }];
    model.generation = 0;
    model.totalVoxels = seedPopulation;
    model.accumulator = 0;
    model.stopReason = reason || "paused";
    rebuildHistoryMesh();
    drawSeedGrid();
    updateOutputs();
  }

  function resizeState(state, oldSize, newSize) {
    const resized = Life.createState(newSize);
    const copySize = Math.min(oldSize, newSize);
    const oldOffset = Math.floor((oldSize - copySize) / 2);
    const newOffset = Math.floor((newSize - copySize) / 2);
    for (let row = 0; row < copySize; row += 1) {
      for (let column = 0; column < copySize; column += 1) {
        resized[(row + newOffset) * newSize + column + newOffset] =
          state[(row + oldOffset) * oldSize + column + oldOffset];
      }
    }
    return resized;
  }

  function rebuildNeighbors() {
    model.neighborTable = Life.buildNeighborTable(model.size, model.wrap);
  }

  function loadSelectedPattern(shouldAnnounce) {
    const name = elements.pattern.value;
    if (Life.minimumSizeForPattern(name) > model.size) {
      model.size = 44;
      elements.boardSize.value = "44";
    }
    model.seedName = name;
    model.seed = Life.seedPattern(name, model.size);
    model.cursorRow = Math.floor(model.size / 2);
    model.cursorColumn = Math.floor(model.size / 2);
    model.hoverCell = null;
    rebuildNeighbors();
    setPlaying(false, "paused", false);
    refreshSceneGuides();
    resetEvolution("ready");
    fitView(true);
    if (shouldAnnounce) {
      const label = elements.pattern.options[elements.pattern.selectedIndex].textContent;
      announce(label + " loaded on a " + model.size + " by " + model.size + " grid.");
    }
  }

  function stepEvolution(shouldAnnounce, deferVisualUpdate) {
    const result = Life.step(currentState(), model.size, model.wrap, model.neighborTable);
    const nextPopulation = Life.countAlive(result.state);
    result.population = nextPopulation;
    model.history.push(result);
    model.generation += 1;
    model.totalVoxels += nextPopulation;
    trimHistoryWindow();
    model.stopReason = model.playing ? "running" : "paused";
    if (!deferVisualUpdate) {
      rebuildHistoryMesh(false);
      updateFollowCamera();
    }

    if (nextPopulation === 0) {
      setPlaying(false, "extinct", false);
      if (shouldAnnounce) announce("The pattern became extinct at generation " + model.generation + ".");
    } else {
      updateOutputs();
      if (shouldAnnounce) announce("Advanced to generation " + model.generation + ".");
    }
    return true;
  }

  function beginSeedEdit() {
    model.playing = false;
    model.seedName = "custom";
    model.stopReason = "editing seed";
    const seedPopulation = Life.countAlive(model.seed);
    model.history = [{
      state: model.seed.slice(),
      births: emptyBirths(model.size),
      population: seedPopulation
    }];
    model.generation = 0;
    model.totalVoxels = seedPopulation;
    model.accumulator = 0;
  }

  function refreshSeedEdit() {
    model.totalVoxels = Life.countAlive(model.seed);
    model.history[0].population = model.totalVoxels;
    rebuildHistoryMesh();
    drawSeedGrid();
    updateOutputs();
  }

  function paintCell(row, column, deferVisualUpdate) {
    const index = row * model.size + column;
    if (model.paintedCells.has(index)) return false;
    model.paintedCells.add(index);
    model.seed[index] = model.drawValue;
    model.history[0].state[index] = model.drawValue;
    model.cursorRow = row;
    model.cursorColumn = column;
    if (!deferVisualUpdate) refreshSeedEdit();
    return true;
  }

  function paintLine(from, to) {
    let column = from.column;
    let row = from.row;
    const columnDistance = Math.abs(to.column - column);
    const rowDistance = Math.abs(to.row - row);
    const columnStep = column < to.column ? 1 : -1;
    const rowStep = row < to.row ? 1 : -1;
    let error = columnDistance - rowDistance;

    let changed = false;
    while (true) {
      changed = paintCell(row, column, true) || changed;
      if (column === to.column && row === to.row) break;
      const doubledError = error * 2;
      if (doubledError > -rowDistance) {
        error -= rowDistance;
        column += columnStep;
      }
      if (doubledError < columnDistance) {
        error += columnDistance;
        row += rowStep;
      }
    }
    if (changed) refreshSeedEdit();
  }

  function cellFromPointer(event) {
    const rectangle = elements.seedCanvas.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) return null;
    const column = Math.floor(((event.clientX - rectangle.left) / rectangle.width) * model.size);
    const row = Math.floor(((event.clientY - rectangle.top) / rectangle.height) * model.size);
    if (row < 0 || row >= model.size || column < 0 || column >= model.size) return null;
    return { row: row, column: column };
  }

  function drawSeedGrid() {
    if (!gridContext) return;
    const rectangle = elements.seedCanvas.getBoundingClientRect();
    const width = Math.max(1, rectangle.width);
    const height = Math.max(1, rectangle.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (elements.seedCanvas.width !== pixelWidth || elements.seedCanvas.height !== pixelHeight) {
      elements.seedCanvas.width = pixelWidth;
      elements.seedCanvas.height = pixelHeight;
    }

    gridContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    gridContext.clearRect(0, 0, width, height);
    gridContext.fillStyle = "#09251f";
    gridContext.fillRect(0, 0, width, height);

    const cellWidth = width / model.size;
    const cellHeight = height / model.size;
    const inset = Math.max(0.65, Math.min(1.35, cellWidth * 0.09));
    for (let row = 0; row < model.size; row += 1) {
      for (let column = 0; column < model.size; column += 1) {
        if (!model.seed[row * model.size + column]) continue;
        const x = column * cellWidth;
        const y = row * cellHeight;
        gridContext.fillStyle = "#f3c4a4";
        gridContext.fillRect(
          x + inset,
          y + inset,
          Math.max(1, cellWidth - inset * 2),
          Math.max(1, cellHeight - inset * 2)
        );
        if (cellWidth > 9) {
          gridContext.fillStyle = "rgba(255, 244, 225, 0.55)";
          gridContext.fillRect(x + inset, y + inset, Math.max(1, cellWidth - inset * 2), 1);
        }
      }
    }

    if (cellWidth >= 5) {
      gridContext.beginPath();
      for (let line = 0; line <= model.size; line += 1) {
        const x = Math.round(line * cellWidth) + 0.5;
        const y = Math.round(line * cellHeight) + 0.5;
        gridContext.moveTo(x, 0);
        gridContext.lineTo(x, height);
        gridContext.moveTo(0, y);
        gridContext.lineTo(width, y);
      }
      gridContext.strokeStyle = "rgba(225, 244, 237, 0.085)";
      gridContext.lineWidth = 1;
      gridContext.stroke();
    }

    const focus = model.hoverCell || { row: model.cursorRow, column: model.cursorColumn };
    gridContext.strokeStyle = model.drawValue ? "#fff4df" : "#f08f68";
    gridContext.lineWidth = 2;
    gridContext.strokeRect(
      focus.column * cellWidth + 1,
      focus.row * cellHeight + 1,
      Math.max(1, cellWidth - 2),
      Math.max(1, cellHeight - 2)
    );
  }

  function showHistoryMessage(message) {
    if (three.failed || message) {
      elements.historyMessage.textContent = message || "The 3D view is unavailable in this browser.";
      elements.historyMessage.hidden = false;
    } else {
      elements.historyMessage.hidden = true;
    }
  }

  function configureMaterialOpacity(material, opacity) {
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach(function setOpacity(item) {
      item.transparent = true;
      item.opacity = opacity;
      item.depthWrite = false;
    });
  }

  function disposeObject(object) {
    if (!object) return;
    object.traverse(function disposePart(part) {
      if (part.geometry) part.geometry.dispose();
      const materials = Array.isArray(part.material) ? part.material : [part.material];
      materials.forEach(function disposeMaterial(material) {
        if (material && material.dispose) material.dispose();
      });
    });
  }

  function refreshSceneGuides() {
    if (!three.ready) return;
    const finalLayer = model.history.length - 1;
    [three.baseGrid, three.currentGrid, three.timeArrow].forEach(function removeGuide(guide) {
      if (!guide) return;
      three.scene.remove(guide);
      disposeObject(guide);
    });

    three.baseGrid = new THREE.GridHelper(model.size, model.size, 0x6ed9c5, 0xb7d4ca);
    configureMaterialOpacity(three.baseGrid.material, 0.26);
    three.baseGrid.position.y = -0.58;
    three.scene.add(three.baseGrid);

    three.currentGrid = new THREE.GridHelper(model.size, model.size, 0xf0b18b, 0xf9e5d2);
    configureMaterialOpacity(three.currentGrid.material, 0.22);
    three.currentGrid.position.y = finalLayer * model.layerSpacing + 0.58;
    three.scene.add(three.currentGrid);

    const arrowOrigin = new THREE.Vector3(
      -model.size / 2 - 1.5,
      -0.52,
      model.size / 2 + 1.5
    );
    const arrowLength = Math.max(2.4, model.history.length * model.layerSpacing);
    three.timeArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      arrowOrigin,
      arrowLength,
      0xf0b18b,
      Math.min(1.5, arrowLength * 0.18),
      0.72
    );
    three.scene.add(three.timeArrow);
    renderScene();
  }

  function colorForInstance(layerIndex, finalLayerIndex, wasBorn) {
    const age = finalLayerIndex ? layerIndex / finalLayerIndex : 1;
    if (age < 0.55) {
      three.color.lerpColors(three.oldColor, three.middleColor, age / 0.55);
    } else {
      three.color.lerpColors(three.middleColor, three.recentColor, (age - 0.55) / 0.45);
    }
    if (layerIndex === finalLayerIndex) three.color.lerp(three.currentColor, 0.36);
    if (wasBorn) three.color.lerp(three.birthColor, 0.72);
    return three.color;
  }

  function rebuildHistoryMesh(renderAfterUpdate) {
    if (!three.ready) return;
    let instance = 0;
    const finalLayer = model.history.length - 1;
    const center = (model.size - 1) / 2;
    for (let layer = 0; layer < model.history.length; layer += 1) {
      const entry = model.history[layer];
      for (let index = 0; index < entry.state.length; index += 1) {
        if (!entry.state[index]) continue;
        const row = Math.floor(index / model.size);
        const column = index - row * model.size;
        three.dummy.position.set(column - center, layer * model.layerSpacing, row - center);
        three.dummy.scale.set(1, 1, 1);
        three.dummy.rotation.set(0, 0, 0);
        three.dummy.updateMatrix();
        three.voxels.setMatrixAt(instance, three.dummy.matrix);
        three.voxels.setColorAt(instance, colorForInstance(layer, finalLayer, Boolean(entry.births[index])));
        instance += 1;
      }
    }

    three.voxels.count = instance;
    if (three.voxels.instanceMatrix.clearUpdateRanges) {
      three.voxels.instanceMatrix.clearUpdateRanges();
      if (instance) three.voxels.instanceMatrix.addUpdateRange(0, instance * 16);
    }
    three.voxels.instanceMatrix.needsUpdate = true;
    if (three.voxels.instanceColor) {
      if (three.voxels.instanceColor.clearUpdateRanges) {
        three.voxels.instanceColor.clearUpdateRanges();
        if (instance) three.voxels.instanceColor.addUpdateRange(0, instance * 3);
      }
      three.voxels.instanceColor.needsUpdate = true;
    }
    if (three.currentGrid) {
      three.currentGrid.position.y = finalLayer * model.layerSpacing + 0.58;
    }
    if (three.timeArrow) {
      const length = Math.max(2.4, model.history.length * model.layerSpacing);
      three.timeArrow.setLength(length, Math.min(1.5, length * 0.18), 0.72);
    }
    if (!three.failed) showHistoryMessage("");
    if (renderAfterUpdate !== false) renderScene();
  }

  function applyOrbit() {
    if (!three.ready) return;
    const sinPhi = Math.sin(orbit.phi);
    three.camera.position.set(
      orbit.radius * sinPhi * Math.cos(orbit.theta),
      orbit.targetY + orbit.radius * Math.cos(orbit.phi),
      orbit.radius * sinPhi * Math.sin(orbit.theta)
    );
    three.camera.lookAt(0, orbit.targetY, 0);
    const sceneRadius = 0.5 * Math.sqrt(
      Math.pow(model.size + 4, 2) * 2 + Math.pow(visibleStackHeight() + 2, 2)
    );
    const requiredFar = Math.ceil(orbit.radius + sceneRadius * 1.25);
    if (requiredFar > three.camera.far) {
      three.camera.far = requiredFar;
      three.camera.updateProjectionMatrix();
    }
  }

  function fittedRadius(height) {
    if (!three.camera) return model.size * 2.8;
    const width = model.size + 4;
    const verticalExtent = Math.max(model.layerSpacing, height) + 2;
    const boundingRadius = 0.5 * Math.sqrt(width * width * 2 + verticalExtent * verticalExtent);
    const verticalFov = THREE.MathUtils.degToRad(three.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * three.camera.aspect);
    const limitingHalfFov = Math.max(0.08, Math.min(verticalFov, horizontalFov) / 2);
    return (boundingRadius / Math.sin(limitingHalfFov)) * 1.12;
  }

  function orbitRadiusCeiling() {
    return Math.max(900, fittedRadius(visibleStackHeight()) * 1.25);
  }

  function fitView(resetAngles) {
    if (!three.ready) return;
    const height = visibleStackHeight();
    if (resetAngles) {
      orbit.theta = 0.72;
      orbit.phi = 1.02;
    }
    orbit.targetY = height * 0.5;
    orbit.radius = fittedRadius(height);
    orbit.autoFollow = true;
    applyOrbit();
    renderScene();
  }

  function updateFollowCamera() {
    if (!three.ready) return;
    if (orbit.autoFollow) {
      const height = visibleStackHeight();
      orbit.targetY = height * 0.5;
      orbit.radius = Math.max(orbit.radius, fittedRadius(height));
      applyOrbit();
    }
    renderScene();
  }

  function renderScene() {
    if (!three.ready || three.failed) return;
    three.renderer.render(three.scene, three.camera);
  }

  function resizeThree() {
    if (!three.ready) return;
    const rectangle = elements.historyViewport.getBoundingClientRect();
    const width = Math.max(1, rectangle.width);
    const height = Math.max(1, rectangle.height);
    three.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.35 : 1.65));
    three.renderer.setSize(width, height, false);
    three.camera.aspect = width / height;
    three.camera.updateProjectionMatrix();
    if (orbit.autoFollow) fitView(false);
    else renderScene();
  }

  function initializeThree() {
    try {
      three.renderer = new THREE.WebGLRenderer({
        canvas: elements.historyCanvas,
        antialias: !coarsePointer,
        alpha: true,
        powerPreference: "high-performance"
      });
      three.renderer.outputColorSpace = THREE.SRGBColorSpace;

      three.scene = new THREE.Scene();
      three.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1800);

      three.voxelGeometry = new THREE.BoxGeometry(1, 1, 1);
      const voxelFaceColors = [
        0xf8f7f2,
        0xe8eeeb,
        0xffffff,
        0xdce3e0,
        0xf2f5f2,
        0xe4eae7
      ];
      three.voxelMaterial = voxelFaceColors.map(function createVoxelFaceMaterial(color) {
        return new THREE.MeshBasicMaterial({
          color: color,
          vertexColors: true,
          fog: false,
          toneMapped: false
        });
      });
      three.voxels = new THREE.InstancedMesh(
        three.voxelGeometry,
        three.voxelMaterial,
        voxelLimit
      );
      three.voxels.count = 0;
      three.voxels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      three.voxels.frustumCulled = false;
      three.scene.add(three.voxels);

      three.ready = true;
      refreshSceneGuides();
      rebuildHistoryMesh();
      fitView(true);
      resizeThree();
      if (typeof ResizeObserver === "function") {
        three.resizeObserver = new ResizeObserver(resizeThree);
        three.resizeObserver.observe(elements.historyViewport);
      } else {
        window.addEventListener("resize", resizeThree);
      }
      elements.historyCanvas.addEventListener("webglcontextlost", function handleContextLoss(event) {
        event.preventDefault();
        three.failed = true;
        model.playing = false;
        model.stopReason = "3D context lost";
        showHistoryMessage("The 3D context was lost. Reload the page to restore this view.");
        updateOutputs();
      });
    } catch (error) {
      three.failed = true;
      showHistoryMessage(
        "This browser could not start the 3D view. The starting-grid editor and Conway simulation remain available."
      );
      elements.fit.disabled = true;
      window.console.error("Unable to initialize the spacetime renderer.", error);
    }
  }

  function pointerDistance(points) {
    const first = points[0];
    const second = points[1];
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function handleOrbitPointerDown(event) {
    elements.historyCanvas.setPointerCapture(event.pointerId);
    orbit.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (orbit.pointers.size === 2) orbit.pinchDistance = pointerDistance(Array.from(orbit.pointers.values()));
    elements.historyCanvas.classList.add("is-dragging");
  }

  function handleOrbitPointerMove(event) {
    if (!orbit.pointers.has(event.pointerId) || !three.ready) return;
    const previous = orbit.pointers.get(event.pointerId);
    orbit.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    orbit.autoFollow = false;

    if (orbit.pointers.size >= 2) {
      const distance = pointerDistance(Array.from(orbit.pointers.values()).slice(0, 2));
      if (orbit.pinchDistance > 0 && distance > 0) {
        orbit.radius = Life.clamp(
          orbit.radius * (orbit.pinchDistance / distance),
          model.size * 0.72,
          orbitRadiusCeiling()
        );
      }
      orbit.pinchDistance = distance;
    } else {
      orbit.theta -= (event.clientX - previous.x) * 0.008;
      orbit.phi = Life.clamp(orbit.phi + (event.clientY - previous.y) * 0.006, 0.3, 1.48);
    }
    applyOrbit();
    renderScene();
  }

  function handleOrbitPointerEnd(event) {
    orbit.pointers.delete(event.pointerId);
    if (orbit.pointers.size < 2) orbit.pinchDistance = 0;
    if (!orbit.pointers.size) elements.historyCanvas.classList.remove("is-dragging");
  }

  function requestAnimation() {
    if (!model.animationFrame && model.playing && model.inViewport && !document.hidden) {
      model.animationFrame = window.requestAnimationFrame(animate);
    }
  }

  function animate(timestamp) {
    model.animationFrame = 0;
    if (!model.playing || !model.inViewport || document.hidden) return;
    if (!model.previousFrame) model.previousFrame = timestamp;
    const delta = Math.min(250, timestamp - model.previousFrame);
    model.previousFrame = timestamp;
    model.accumulator += delta;
    const interval = 1000 / model.speed;
    let catchupSteps = 0;
    let evolved = false;
    while (model.accumulator >= interval && model.playing && catchupSteps < 4) {
      evolved = stepEvolution(false, true) || evolved;
      model.accumulator -= interval;
      catchupSteps += 1;
    }
    if (evolved) {
      rebuildHistoryMesh(false);
      updateFollowCamera();
    }
    if (model.playing) requestAnimation();
  }

  elements.drawAlive.addEventListener("click", function chooseAlive() { setDrawValue(1, true); });
  elements.drawDead.addEventListener("click", function chooseDead() { setDrawValue(0, true); });
  elements.loadPattern.addEventListener("click", function loadPattern() { loadSelectedPattern(true); });

  elements.boardSize.addEventListener("change", function changeBoardSize() {
    const oldSize = model.size;
    const requestedSize = Number(elements.boardSize.value);
    model.size = requestedSize;
    if (model.seedName === "custom") {
      model.seed = resizeState(model.seed, oldSize, model.size);
    } else {
      if (Life.minimumSizeForPattern(model.seedName) > model.size) {
        model.size = 44;
        elements.boardSize.value = "44";
      }
      model.seed = Life.seedPattern(model.seedName, model.size);
    }
    model.cursorRow = Math.floor(model.size / 2);
    model.cursorColumn = Math.floor(model.size / 2);
    rebuildNeighbors();
    setPlaying(false, "paused", false);
    refreshSceneGuides();
    resetEvolution("board resized");
    fitView(true);
    announce("Grid changed to " + model.size + " by " + model.size + ".");
  });

  elements.wrap.addEventListener("change", function changeBoundary() {
    model.wrap = elements.wrap.checked;
    rebuildNeighbors();
    setPlaying(false, "paused", false);
    resetEvolution(model.wrap ? "wrapped boundary" : "finite boundary");
    announce(model.wrap ? "Opposite edges now wrap." : "Cells beyond the grid are now dead.");
  });

  elements.speed.addEventListener("input", function changeSpeed() {
    model.speed = Number(elements.speed.value);
    elements.speedValue.textContent = model.speed + " gen/s";
  });

  elements.limit.addEventListener("input", function changeLimit() {
    model.historyLimit = Number(elements.limit.value);
    trimHistoryWindow();
    rebuildHistoryMesh();
    updateOutputs();
    fitView(false);
  });

  elements.limit.addEventListener("change", function announceLimit() {
    announce("Showing up to " + model.historyLimit + " recent layers.");
  });

  elements.play.addEventListener("click", function togglePlayback() {
    cancelAutoStart();
    setPlaying(!model.playing, model.playing ? "paused" : "running", true);
  });

  elements.step.addEventListener("click", function singleStep() {
    cancelAutoStart();
    model.playing = false;
    model.stopReason = "paused";
    stepEvolution(true);
  });

  elements.restart.addEventListener("click", function restartEvolution() {
    setPlaying(false, "paused", false);
    resetEvolution("restarted");
    orbit.autoFollow = true;
    fitView(true);
    announce("Evolution returned to generation zero.");
  });

  elements.clear.addEventListener("click", function clearSeed() {
    model.seedName = "custom";
    model.seed = Life.createState(model.size);
    setPlaying(false, "paused", false);
    resetEvolution("empty seed");
    announce("The starting grid is empty.");
  });

  elements.fit.addEventListener("click", function resetView() {
    fitView(true);
    announce("The three-dimensional view was reset.");
  });

  elements.seedCanvas.addEventListener("pointerdown", function startPainting(event) {
    if (model.painting || (event.pointerType === "mouse" && event.button !== 0)) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    event.preventDefault();
    elements.seedCanvas.focus({ preventScroll: true });
    elements.seedCanvas.setPointerCapture(event.pointerId);
    model.painting = true;
    model.activePaintPointer = event.pointerId;
    model.lastPaintCell = cell;
    model.paintedCells.clear();
    beginSeedEdit();
    paintLine(cell, cell);
  });

  elements.seedCanvas.addEventListener("pointermove", function continuePainting(event) {
    const cell = cellFromPointer(event);
    if (cell) {
      model.hoverCell = cell;
      if (model.painting && event.pointerId === model.activePaintPointer) {
        paintLine(model.lastPaintCell, cell);
        model.lastPaintCell = cell;
      } else {
        drawSeedGrid();
      }
    }
  });

  function finishPainting(event) {
    if (!model.painting || event.pointerId !== model.activePaintPointer) return;
    model.painting = false;
    model.activePaintPointer = null;
    model.lastPaintCell = null;
    model.paintedCells.clear();
    if (elements.seedCanvas.hasPointerCapture(event.pointerId)) {
      elements.seedCanvas.releasePointerCapture(event.pointerId);
    }
    model.stopReason = "seed edited";
    updateOutputs();
    announce("Starting grid updated. " + Life.countAlive(model.seed) + " cells are alive.");
  }

  elements.seedCanvas.addEventListener("pointerup", finishPainting);
  elements.seedCanvas.addEventListener("pointercancel", finishPainting);
  elements.seedCanvas.addEventListener("lostpointercapture", finishPainting);
  elements.seedCanvas.addEventListener("pointerleave", function leaveSeedGrid() {
    if (!model.painting) {
      model.hoverCell = null;
      drawSeedGrid();
    }
  });

  elements.seedCanvas.addEventListener("keydown", function editWithKeyboard(event) {
    let moved = false;
    if (event.key === "ArrowUp") {
      model.cursorRow = Math.max(0, model.cursorRow - 1);
      moved = true;
    } else if (event.key === "ArrowDown") {
      model.cursorRow = Math.min(model.size - 1, model.cursorRow + 1);
      moved = true;
    } else if (event.key === "ArrowLeft") {
      model.cursorColumn = Math.max(0, model.cursorColumn - 1);
      moved = true;
    } else if (event.key === "ArrowRight") {
      model.cursorColumn = Math.min(model.size - 1, model.cursorColumn + 1);
      moved = true;
    } else if (event.key === "Home") {
      model.cursorColumn = 0;
      if (event.ctrlKey || event.metaKey) model.cursorRow = 0;
      moved = true;
    } else if (event.key === "End") {
      model.cursorColumn = model.size - 1;
      if (event.ctrlKey || event.metaKey) model.cursorRow = model.size - 1;
      moved = true;
    } else if (event.key === "a" || event.key === "A") {
      setDrawValue(1, true);
      event.preventDefault();
      return;
    } else if (event.key === "e" || event.key === "E") {
      setDrawValue(0, true);
      event.preventDefault();
      return;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      model.paintedCells.clear();
      beginSeedEdit();
      paintCell(model.cursorRow, model.cursorColumn);
      model.paintedCells.clear();
      model.stopReason = "seed edited";
      updateOutputs();
      announce(
        "Row " + (model.cursorRow + 1) + ", column " + (model.cursorColumn + 1) +
          (model.drawValue ? " is alive." : " is dead.")
      );
      return;
    }

    if (moved) {
      event.preventDefault();
      drawSeedGrid();
      const alive = model.seed[model.cursorRow * model.size + model.cursorColumn];
      announce(
        "Row " + (model.cursorRow + 1) + ", column " + (model.cursorColumn + 1) +
          (alive ? ", alive." : ", dead.")
      );
    }
  });

  elements.historyCanvas.addEventListener("pointerdown", handleOrbitPointerDown);
  elements.historyCanvas.addEventListener("pointermove", handleOrbitPointerMove);
  elements.historyCanvas.addEventListener("pointerup", handleOrbitPointerEnd);
  elements.historyCanvas.addEventListener("pointercancel", handleOrbitPointerEnd);
  elements.historyCanvas.addEventListener("wheel", function zoomHistory(event) {
    if (!three.ready) return;
    event.preventDefault();
    orbit.autoFollow = false;
    orbit.radius = Life.clamp(
      orbit.radius * Math.exp(event.deltaY * 0.0012),
      model.size * 0.72,
      orbitRadiusCeiling()
    );
    applyOrbit();
    renderScene();
  }, { passive: false });

  elements.historyCanvas.addEventListener("keydown", function moveCameraWithKeyboard(event) {
    if (!three.ready) return;
    let handled = true;
    if (event.key === "ArrowLeft") orbit.theta += 0.08;
    else if (event.key === "ArrowRight") orbit.theta -= 0.08;
    else if (event.key === "ArrowUp") orbit.phi = Life.clamp(orbit.phi - 0.06, 0.3, 1.48);
    else if (event.key === "ArrowDown") orbit.phi = Life.clamp(orbit.phi + 0.06, 0.3, 1.48);
    else if (event.key === "+" || event.key === "=") orbit.radius = Math.max(model.size * 0.72, orbit.radius * 0.9);
    else if (event.key === "-" || event.key === "_") {
      orbit.radius = Math.min(orbitRadiusCeiling(), orbit.radius * 1.1);
    }
    else if (event.key === "0") {
      fitView(true);
      event.preventDefault();
      return;
    } else handled = false;
    if (handled) {
      event.preventDefault();
      orbit.autoFollow = false;
      applyOrbit();
      renderScene();
    }
  });

  document.addEventListener("visibilitychange", function handleVisibility() {
    model.previousFrame = 0;
    model.accumulator = 0;
    if (document.hidden && model.animationFrame) {
      window.cancelAnimationFrame(model.animationFrame);
      model.animationFrame = 0;
    } else if (!document.hidden && model.playing) {
      requestAnimation();
    }
  });

  if (typeof ResizeObserver === "function") {
    const seedResizeObserver = new ResizeObserver(drawSeedGrid);
    seedResizeObserver.observe(elements.seedFrame);
  } else {
    window.addEventListener("resize", drawSeedGrid);
  }

  model.seed = Life.seedPattern(model.seedName, model.size);
  model.cursorRow = Math.floor(model.size / 2);
  model.cursorColumn = Math.floor(model.size / 2);
  rebuildNeighbors();
  model.totalVoxels = Life.countAlive(model.seed);
  model.history = [{
    state: model.seed.slice(),
    births: emptyBirths(model.size),
    population: model.totalVoxels
  }];
  setDrawValue(1, false);
  initializeThree();
  drawSeedGrid();
  updateOutputs();
  armAutoStart();
})();
