(function () {
  "use strict";

  const Life = window.VisualLife;
  const elements = {
    topology: document.getElementById("life-topology"),
    rule: document.getElementById("life-rule"),
    ruleHelp: document.getElementById("life-rule-help"),
    size: document.getElementById("life-size"),
    sizeName: document.getElementById("life-size-name"),
    sizeValue: document.getElementById("life-size-value"),
    degree: document.getElementById("life-degree"),
    degreeName: document.getElementById("life-degree-name"),
    degreeValue: document.getElementById("life-degree-value"),
    density: document.getElementById("life-density"),
    densityValue: document.getElementById("life-density-value"),
    speed: document.getElementById("life-speed"),
    speedValue: document.getElementById("life-speed-value"),
    play: document.getElementById("life-play"),
    step: document.getElementById("life-step"),
    reset: document.getElementById("life-reset"),
    randomize: document.getElementById("life-randomize"),
    newGraph: document.getElementById("life-new-graph"),
    fit: document.getElementById("life-fit"),
    stage: document.getElementById("life-stage"),
    message: document.getElementById("life-message"),
    stateLabel: document.getElementById("life-state"),
    status: document.getElementById("life-status"),
    generation: document.getElementById("life-generation"),
    alive: document.getElementById("life-alive"),
    edges: document.getElementById("life-edges"),
    averageDegree: document.getElementById("life-average-degree"),
    announcer: document.getElementById("life-announcer")
  };

  const simulation = {
    graph: null,
    nodes: [],
    links: [],
    edgePairs: new Uint16Array(0),
    state: new Uint8Array(0),
    next: new Uint8Array(0),
    neighborCounts: new Uint16Array(0),
    initialState: new Uint8Array(0),
    birth: new Set(Life ? Life.RULES.conway.birth : [3]),
    survive: new Set(Life ? Life.RULES.conway.survive : [2, 3]),
    generation: 0,
    graphSeed: 481516,
    stateSeed: 815162,
    playing: false,
    lastFrame: 0,
    accumulator: 0,
    frameId: 0,
    resizeObserver: null
  };

  const ruleHelp = {
    conway: "A dead vertex is born with 3 living neighbors; a living vertex survives with 2 or 3.",
    highlife: "Birth occurs with 3 or 6 living neighbors; survival occurs with 2 or 3.",
    seeds: "A dead vertex is born with exactly 2 living neighbors. Living vertices never survive."
  };

  function announce(message) {
    elements.announcer.textContent = "";
    window.setTimeout(function setAnnouncement() {
      elements.announcer.textContent = message;
    }, 10);
  }

  function setPaused(label) {
    simulation.playing = false;
    simulation.accumulator = 0;
    elements.play.textContent = "Play";
    elements.stateLabel.textContent = label || "Paused";
  }

  function disableControls() {
    [
      elements.topology,
      elements.rule,
      elements.size,
      elements.degree,
      elements.density,
      elements.speed,
      elements.play,
      elements.step,
      elements.reset,
      elements.randomize,
      elements.newGraph,
      elements.fit
    ].forEach(function disable(element) {
      element.disabled = true;
    });
  }

  function fail(message) {
    setPaused("Unavailable");
    elements.message.hidden = false;
    elements.message.classList.add("is-error");
    elements.message.textContent = message;
    elements.status.textContent = "The interactive renderer is unavailable.";
    disableControls();
  }

  function configureInputs() {
    const topology = elements.topology.value;
    if (topology === "torus") {
      elements.size.min = "6";
      elements.size.max = "14";
      elements.size.step = "1";
      elements.size.value = String(Life.clamp(Number(elements.size.value), 6, 14));
      elements.sizeName.textContent = "Side length";
      elements.degree.disabled = true;
      elements.degree.min = "8";
      elements.degree.max = "8";
      elements.degree.step = "1";
      elements.degree.value = "8";
      elements.degreeName.textContent = "Degree";
    } else {
      elements.size.min = "40";
      elements.size.max = "200";
      elements.size.step = "1";
      if (Number(elements.size.value) < 40) elements.size.value = "90";
      elements.sizeName.textContent = "Vertices";
      elements.degree.disabled = false;

      if (topology === "regular") {
        elements.degree.min = "2";
        elements.degree.max = "10";
        elements.degree.step = "2";
        const degree = Life.clamp(Number(elements.degree.value), 2, 10);
        elements.degree.value = String(degree % 2 === 0 ? degree : degree - 1);
        elements.degreeName.textContent = "Degree";
      } else if (topology === "erdos") {
        elements.degree.min = "2";
        elements.degree.max = "12";
        elements.degree.step = "1";
        elements.degree.value = String(Life.clamp(Number(elements.degree.value), 2, 12));
        elements.degreeName.textContent = "Mean degree";
      } else {
        elements.degree.min = "1";
        elements.degree.max = "6";
        elements.degree.step = "1";
        elements.degree.value = String(Life.clamp(Number(elements.degree.value), 1, 6));
        elements.degreeName.textContent = "Attachments";
      }
    }
    elements.sizeValue.textContent = elements.size.value;
    elements.degreeValue.textContent = elements.degree.value;
  }

  function selectRule() {
    const selected = Life.RULES[elements.rule.value] || Life.RULES.conway;
    simulation.birth = new Set(selected.birth);
    simulation.survive = new Set(selected.survive);
    elements.ruleHelp.textContent = ruleHelp[elements.rule.value] || ruleHelp.conway;
  }

  function graphOptions() {
    const topology = elements.topology.value;
    const size = Number(elements.size.value);
    const degree = Number(elements.degree.value);
    return {
      seed: simulation.graphSeed,
      side: size,
      count: size,
      degree: degree,
      meanDegree: degree,
      attachments: degree
    };
  }

  function applyStateToNodes() {
    for (let index = 0; index < simulation.nodes.length; index += 1) {
      simulation.nodes[index].alive = Boolean(simulation.state[index]);
    }
  }

  function updateStatus() {
    const living = Life.countAlive(simulation.state);
    const count = simulation.nodes.length;
    const edgeCount = simulation.links.length;
    const average = count ? (2 * edgeCount) / count : 0;
    elements.status.textContent =
      "Generation " + simulation.generation +
      " · " + living + "/" + count + " alive" +
      " · " + edgeCount + " edges" +
      " · average degree " + average.toFixed(1);
    elements.generation.textContent = String(simulation.generation);
    elements.alive.textContent = living + " / " + count;
    elements.edges.textContent = String(edgeCount);
    elements.averageDegree.textContent = average.toFixed(1);
  }

  function makeInitialState(incrementSeed) {
    if (incrementSeed) simulation.stateSeed += 1;
    const random = Life.mulberry32(simulation.stateSeed);
    simulation.state = Life.randomState(
      simulation.nodes.length,
      Number(elements.density.value) / 100,
      random
    );
    simulation.initialState = simulation.state.slice();
    simulation.next = new Uint8Array(simulation.nodes.length);
    simulation.neighborCounts = new Uint16Array(simulation.nodes.length);
    simulation.generation = 0;
    applyStateToNodes();
    if (simulation.graph) simulation.graph.refresh();
    updateStatus();
  }

  function fitGraph(duration) {
    if (!simulation.graph) return;
    simulation.graph.zoomToFit(duration || 450, 38);
  }

  function buildGraph(incrementSeed) {
    setPaused("Paused");
    configureInputs();
    selectRule();
    if (incrementSeed) {
      simulation.graphSeed += 1;
      simulation.stateSeed += 1;
    }

    try {
      const generated = Life.generateGraph(elements.topology.value, graphOptions());
      simulation.nodes = generated.nodes;
      simulation.links = generated.pairs.map(function makeLink(pair) {
        return { source: pair[0], target: pair[1] };
      });
      simulation.edgePairs = Uint16Array.from(generated.pairs.flat());
      makeInitialState(false);
      simulation.graph.graphData({ nodes: simulation.nodes, links: simulation.links });

      if (elements.topology.value === "torus") {
        simulation.graph.cooldownTicks(0);
      } else {
        simulation.graph.cooldownTicks(140);
        const charge = simulation.graph.d3Force("charge");
        const link = simulation.graph.d3Force("link");
        if (charge) charge.strength(-55);
        if (link) link.distance(34);
        if (simulation.graph.d3ReheatSimulation) simulation.graph.d3ReheatSimulation();
      }

      updateStatus();
      const wait = elements.topology.value === "torus" ? 80 : 650;
      window.setTimeout(function fitAfterLayout() {
        if (!document.hidden) fitGraph(450);
      }, wait);
    } catch (error) {
      fail("The graph could not be generated. Please reload the page and try again.");
      window.console.error(error);
    }
  }

  function stepLife() {
    Life.stepInto(
      simulation.state,
      simulation.next,
      simulation.neighborCounts,
      simulation.edgePairs,
      simulation.birth,
      simulation.survive
    );
    const previous = simulation.state;
    simulation.state = simulation.next;
    simulation.next = previous;
    simulation.generation += 1;
    applyStateToNodes();
    simulation.graph.refresh();
    updateStatus();

    if (Life.countAlive(simulation.state) === 0 && simulation.playing) {
      setPaused("Extinct");
      announce("The population became extinct at generation " + simulation.generation + ".");
    }
  }

  function lifeFrame(timestamp) {
    if (!simulation.lastFrame) simulation.lastFrame = timestamp;
    const elapsed = Math.min(250, timestamp - simulation.lastFrame);
    simulation.lastFrame = timestamp;

    if (simulation.playing && !document.hidden) {
      simulation.accumulator += elapsed;
      const period = 1000 / Number(elements.speed.value);
      let catchupSteps = 0;
      while (simulation.accumulator >= period && catchupSteps < 4) {
        stepLife();
        simulation.accumulator -= period;
        catchupSteps += 1;
      }
    }
    simulation.frameId = window.requestAnimationFrame(lifeFrame);
  }

  function resizeGraph() {
    if (!simulation.graph) return;
    const width = Math.max(280, elements.stage.clientWidth);
    const height = Math.max(360, elements.stage.clientHeight);
    simulation.graph.width(width).height(height);
  }

  function bindControls() {
    elements.topology.addEventListener("change", function changeTopology() {
      configureInputs();
      buildGraph(false);
      announce("Generated a " + elements.topology.options[elements.topology.selectedIndex].text + " graph.");
    });
    elements.rule.addEventListener("change", function changeRule() {
      selectRule();
      announce(elements.rule.options[elements.rule.selectedIndex].text + " selected.");
    });
    elements.size.addEventListener("input", function showSize() {
      elements.sizeValue.textContent = elements.size.value;
    });
    elements.size.addEventListener("change", function changeSize() { buildGraph(false); });
    elements.degree.addEventListener("input", function showDegree() {
      elements.degreeValue.textContent = elements.degree.value;
    });
    elements.degree.addEventListener("change", function changeDegree() { buildGraph(false); });
    elements.density.addEventListener("input", function showDensity() {
      elements.densityValue.textContent = elements.density.value + "%";
    });
    elements.density.addEventListener("change", function changeDensity() {
      setPaused("Paused");
      makeInitialState(true);
      announce("Randomized the state at " + elements.density.value + " percent density.");
    });
    elements.speed.addEventListener("input", function showSpeed() {
      elements.speedValue.textContent = elements.speed.value + " gen/s";
    });
    elements.play.addEventListener("click", function togglePlay() {
      simulation.playing = !simulation.playing;
      simulation.accumulator = 0;
      elements.play.textContent = simulation.playing ? "Pause" : "Play";
      elements.stateLabel.textContent = simulation.playing ? "Running" : "Paused";
      announce(simulation.playing ? "Simulation running." : "Simulation paused.");
    });
    elements.step.addEventListener("click", function singleStep() {
      setPaused("Paused");
      stepLife();
      announce("Advanced to generation " + simulation.generation + ".");
    });
    elements.reset.addEventListener("click", function resetState() {
      setPaused("Paused");
      simulation.state.set(simulation.initialState);
      simulation.generation = 0;
      applyStateToNodes();
      simulation.graph.refresh();
      updateStatus();
      announce("Restored the initial state.");
    });
    elements.randomize.addEventListener("click", function randomizeState() {
      setPaused("Paused");
      makeInitialState(true);
      announce("Generated a new initial state.");
    });
    elements.newGraph.addEventListener("click", function newGraph() {
      buildGraph(true);
      announce("Generated a new graph and initial state.");
    });
    elements.fit.addEventListener("click", function fitView() { fitGraph(450); });
    document.addEventListener("visibilitychange", function handleVisibility() {
      if (!simulation.graph) return;
      if (document.hidden && simulation.graph.pauseAnimation) simulation.graph.pauseAnimation();
      if (!document.hidden && simulation.graph.resumeAnimation) simulation.graph.resumeAnimation();
    });
  }

  function initialize() {
    if (!Life) {
      fail("The simulation code could not load. Please reload the page.");
      return;
    }
    if (typeof window.ForceGraph3D !== "function") {
      fail("The 3D renderer could not load. Check your connection, then reload the page.");
      return;
    }

    try {
      simulation.graph = new window.ForceGraph3D(elements.stage, { controlType: "orbit" })
        .showNavInfo(false)
        .enableNodeDrag(false)
        .nodeId("id")
        .nodeColor(function nodeColor(node) { return node.alive ? "#f0b18b" : "#68766f"; })
        .nodeVal(function nodeSize(node) { return node.alive ? 2.1 : 0.42; })
        .nodeResolution(8)
        .nodeLabel(function nodeLabel(node) {
          return "Vertex " + node.id + ": " + (node.alive ? "alive" : "dead") + "; degree " + node.degree;
        })
        .linkColor(function linkColor() { return "#65736c"; })
        .linkOpacity(0.22)
        .linkWidth(0.55)
        .backgroundColor("#17211d")
        .onNodeClick(function toggleNode(node) {
          setPaused("Paused");
          simulation.state[node.id] = simulation.state[node.id] ? 0 : 1;
          applyStateToNodes();
          simulation.graph.refresh();
          updateStatus();
          announce("Vertex " + node.id + " is now " + (simulation.state[node.id] ? "alive" : "dead") + ".");
        });

      const renderer = simulation.graph.renderer();
      if (renderer && renderer.setPixelRatio) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      }
      elements.message.hidden = true;
      bindControls();
      buildGraph(false);
      resizeGraph();
      if (typeof window.ResizeObserver === "function") {
        simulation.resizeObserver = new window.ResizeObserver(resizeGraph);
        simulation.resizeObserver.observe(elements.stage);
      } else {
        window.addEventListener("resize", resizeGraph);
      }
      window.requestAnimationFrame(function hideCanvasFromAssistiveTech() {
        const canvas = elements.stage.querySelector("canvas");
        if (canvas) canvas.setAttribute("aria-hidden", "true");
      });
      simulation.frameId = window.requestAnimationFrame(lifeFrame);
    } catch (error) {
      fail("The 3D renderer could not start in this browser.");
      window.console.error(error);
    }
  }

  initialize();
})();
