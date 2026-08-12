(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const resizeMessageType = "paper-concept-demo-height";

  const vertices = {
    clone: { key: "clone", label: "1′", x: 58, y: 280 },
    one: { key: "one", label: "1", x: 178, y: 280 },
    two: { key: "two", label: "2", x: 350, y: 72 },
    three: { key: "three", label: "3", x: 674, y: 158 },
    four: { key: "four", label: "4", x: 674, y: 402 },
    five: { key: "five", label: "5", x: 350, y: 488 },
  };

  const originalEdges = [
    { from: "one", to: "two", color: "red" },
    { from: "two", to: "three", color: "red" },
    { from: "three", to: "four", color: "red" },
    { from: "four", to: "five", color: "red" },
    { from: "five", to: "one", color: "red" },
    { from: "one", to: "three", color: "blue" },
    { from: "one", to: "four", color: "blue" },
    { from: "two", to: "four", color: "blue" },
    { from: "two", to: "five", color: "blue" },
    { from: "three", to: "five", color: "blue" },
  ];

  const cloneEdges = [
    { from: "clone", to: "two", color: "red" },
    { from: "clone", to: "five", color: "red" },
    { from: "clone", to: "three", color: "blue" },
    { from: "clone", to: "four", color: "blue" },
  ];

  const outcomes = {
    red: {
      colorName: "red",
      neighbors: ["two", "five"],
      neighborLabels: ["2", "5"],
      triangles: [
        ["clone", "one", "two"],
        ["clone", "one", "five"],
      ],
      triangleLabels: ["{1, 1′, 2}", "{1, 1′, 5}"],
    },
    blue: {
      colorName: "blue",
      neighbors: ["three", "four"],
      neighborLabels: ["3", "4"],
      triangles: [
        ["clone", "one", "three"],
        ["clone", "one", "four"],
      ],
      triangleLabels: ["{1, 1′, 3}", "{1, 1′, 4}"],
    },
  };

  const elements = {
    shell: byId("demo-shell"),
    graph: byId("graph"),
    graphStep: byId("graph-step"),
    graphHeading: byId("graph-heading"),
    graphCaption: byId("graph-caption"),
    countTitle: byId("count-title"),
    triangleTotalPanel: byId("triangle-total-panel"),
    triangleCount: byId("triangle-count"),
    triangleCountLabel: byId("triangle-count-label"),
    equivalence: byId("equivalence"),
    neighborCount: byId("neighbor-count"),
    neighborLabel: byId("neighbor-label"),
    copyCount: byId("copy-count"),
    formulaCard: byId("formula-card"),
    formulaMain: byId("formula-main"),
    formulaNote: byId("formula-note"),
    statusBox: byId("status-box"),
    statusTitle: byId("status-title"),
    statusText: byId("status-text"),
    witnessTitle: byId("witness-title"),
    witnessIntro: byId("witness-intro"),
    witnessList: byId("witness-list"),
    controls: Array.from(
      document.querySelectorAll('input[name="construction-state"]'),
    ),
  };

  let state = "clone";
  let heightFrame = 0;

  initializeEmbedSizing();
  bindControls();
  render();

  function bindControls() {
    elements.controls.forEach((control) => {
      control.addEventListener("change", () => {
        if (!control.checked) return;
        state = control.value;
        render();
      });
    });
  }

  function render() {
    renderGraph();
    renderCopy();
    scheduleHeightMessage();
  }

  function renderGraph() {
    const graph = elements.graph;
    const resolved = state === "red" || state === "blue";
    const outcome = resolved ? outcomes[state] : null;
    const witnessVertices = outcome
      ? new Set(["clone", "one", ...outcome.neighbors])
      : new Set();

    graph.classList.toggle("is-resolved", resolved);
    graph.classList.toggle("is-red", state === "red");
    graph.classList.toggle("is-blue", state === "blue");

    const title = svgElement("title", { id: "graph-title" });
    const description = svgElement("desc", { id: "graph-description" });
    title.textContent = graphTitle();
    description.textContent = graphDescription();
    graph.replaceChildren(title, description);

    const triangleLayer = svgElement("g", { class: "triangle-layer" });
    const edgeLayer = svgElement("g", { class: "edge-layer" });
    const annotationLayer = svgElement("g", { class: "annotation-layer" });
    const nodeLayer = svgElement("g", { class: "node-layer" });
    graph.append(triangleLayer, edgeLayer, annotationLayer, nodeLayer);

    if (outcome) {
      outcome.triangles.forEach((triangle, index) => {
        const polygon = svgElement("polygon", {
          class: `triangle-area triangle-area-${state}`,
          points: triangle
            .map((key) => `${vertices[key].x},${vertices[key].y}`)
            .join(" "),
        });
        const triangleTitle = svgElement("title", {});
        triangleTitle.textContent = `${state} triangle ${outcome.triangleLabels[index]}`;
        polygon.append(triangleTitle);
        triangleLayer.append(polygon);
      });
    }

    originalEdges.forEach((edge) => {
      edgeLayer.append(graphEdge(edge, isWitnessEdge(edge, outcome)));
    });

    if (state !== "k5") {
      cloneEdges.forEach((edge) => {
        edgeLayer.append(
          graphEdge(edge, isWitnessEdge(edge, outcome), "clone-edge"),
        );
      });

      const finalEdgeClass =
        state === "clone" ? "edge-missing" : `edge-${state}`;
      edgeLayer.append(
        graphLine(
          vertices.clone,
          vertices.one,
          `graph-edge final-edge ${finalEdgeClass} is-witness`,
        ),
      );

      const edgeLabel = svgElement("text", {
        class: `edge-label edge-label-${state}`,
        x: 118,
        y: 252,
        "text-anchor": "middle",
      });
      edgeLabel.textContent =
        state === "clone" ? "e = 11′ · uncolored" : `e = 11′ · ${state}`;
      annotationLayer.append(edgeLabel);

      const cloneNote = svgElement("text", {
        class: "clone-note",
        x: 58,
        y: 326,
        "text-anchor": "middle",
      });
      cloneNote.textContent = "clone of 1";
      annotationLayer.append(cloneNote);
    }

    Object.values(vertices).forEach((vertex) => {
      if (vertex.key === "clone" && state === "k5") return;
      const active = !resolved || witnessVertices.has(vertex.key);
      nodeLayer.append(graphNode(vertex, vertex.key === "clone", active));
    });
  }

  function renderCopy() {
    elements.statusBox.className = "status-box";
    elements.triangleTotalPanel.className = "triangle-total";
    elements.formulaCard.className = "formula-card";
    elements.equivalence.className = "equivalence";

    if (state === "k5") {
      elements.graphStep.textContent = "Step 1 · start below the threshold";
      elements.graphHeading.innerHTML =
        '<span class="math">K<sub>5</sub></span> has no monochromatic triangle.';
      elements.graphCaption.innerHTML =
        "The red edges form the outer 5-cycle; the blue edges form its complement, another 5-cycle.";
      elements.countTitle.textContent = "The starting coloring is target-free.";
      setTriangleCount(0, null);
      elements.neighborCount.textContent = "5 + 5";
      elements.neighborLabel.textContent = "red edges + blue edges";
      elements.copyCount.textContent = "0";
      elements.formulaMain.innerHTML =
        "E<sub>red</sub> = C<sub>5</sub>, &nbsp; E<sub>blue</sub> = C̅<sub>5</sub>";
      elements.formulaNote.textContent =
        "Both color classes are 5-cycles, so both are triangle-free.";
      elements.statusTitle.textContent = "No monochromatic triangle exists.";
      elements.statusText.textContent =
        "This is a target-free coloring one vertex below R(3,3) = 6.";
      elements.witnessTitle.textContent =
        "The two color classes are complementary 5-cycles.";
      elements.witnessIntro.textContent =
        "Choose the cloning step above to duplicate the colored neighborhood of vertex 1.";
      renderStartingWitnesses();
      return;
    }

    if (state === "clone") {
      elements.graphStep.textContent = "Step 2 · clone vertex 1";
      elements.graphHeading.innerHTML =
        '<span class="math">K<sub>6</sub> − e</span> is still target-free.';
      elements.graphCaption.innerHTML =
        'The colored edges from 1′ copy the corresponding edges from 1; only <span class="math">e = 11′</span> is missing.';
      elements.countTitle.textContent =
        "One edge short: no monochromatic triangles.";
      setTriangleCount(0, null);
      elements.neighborCount.textContent = "—";
      elements.neighborLabel.textContent = "final-edge color not chosen";
      elements.copyCount.textContent = "0";
      elements.formulaMain.innerHTML = "c(1′w) = c(1w)";
      elements.formulaNote.textContent =
        "The clone reproduces every colored incidence of vertex 1.";
      elements.statusTitle.textContent = "The final edge is uncolored.";
      elements.statusText.textContent =
        "Any triangle using 1′ mirrors one using 1, so none is monochromatic.";
      elements.witnessTitle.textContent =
        "The clone has the same colored neighbors as vertex 1.";
      elements.witnessIntro.textContent =
        "Before e is colored, those matching neighborhoods do not close a triangle. Choose red or blue above to see the two witnesses.";
      renderCloneWitnesses();
      return;
    }

    const outcome = outcomes[state];
    const isRed = state === "red";
    const colorClass = isRed ? "is-red" : "is-blue";
    elements.statusBox.classList.add(colorClass);
    elements.triangleTotalPanel.classList.add(colorClass);
    elements.formulaCard.classList.add(colorClass);
    elements.equivalence.classList.add(colorClass);
    elements.graphStep.textContent = `Step 3 · color the final edge ${state}`;
    elements.graphHeading.innerHTML = `Two <span class="color-word color-word-${state}">${state}</span> triangles appear.`;
    elements.graphCaption.innerHTML = `Both new triangles contain <span class="math">e = 11′</span>; all unrelated edges are dimmed.`;
    elements.countTitle.textContent = `Exactly two ${state} triangles are forced.`;
    setTriangleCount(2, state);
    elements.neighborCount.textContent = "2";
    elements.neighborLabel.textContent = `${state} common neighbors of 1 and 1′`;
    elements.copyCount.textContent = "2";
    elements.formulaMain.innerHTML = `# new K<sub>3</sub><sup>${state}</sup> through e = |C<sub>${state}</sub>| = 2`;
    elements.formulaNote.textContent = `C_${state} = {${outcome.neighborLabels.join(", ")}}; each common ${state} neighbor closes one triangle.`;
    elements.statusTitle.textContent = `The final edge is ${state}.`;
    elements.statusText.textContent = `Two ${state} triangles appear: ${outcome.triangleLabels[0]} and ${outcome.triangleLabels[1]}.`;
    elements.witnessTitle.textContent = `Each common ${state} neighbor closes one triangle.`;
    elements.witnessIntro.textContent = `Because 1′ copies the ${state} incidences of 1, coloring e ${state} completes exactly these two triangles.`;
    renderResolvedWitnesses(outcome);
  }

  function setTriangleCount(count, color) {
    elements.triangleCount.textContent = String(count);
    elements.triangleCountLabel.textContent = color
      ? `${color} monochromatic triangles`
      : "monochromatic triangles";
  }

  function renderStartingWitnesses() {
    elements.witnessList.replaceChildren(
      witnessCard(
        "red 5-cycle",
        "1–2–3–4–5–1",
        "No three of these red edges form a triangle.",
        "red",
      ),
      witnessCard(
        "blue complement",
        "1–3–5–2–4–1",
        "The complementary blue graph is also a 5-cycle.",
        "blue",
      ),
    );
  }

  function renderCloneWitnesses() {
    elements.witnessList.replaceChildren(
      witnessCard(
        "red neighbors",
        "N<sub>red</sub>(1) = N<sub>red</sub>(1′) = {2, 5}",
        "Both red incidences are copied from 1 to 1′.",
        "red",
        true,
        true,
      ),
      witnessCard(
        "blue neighbors",
        "N<sub>blue</sub>(1) = N<sub>blue</sub>(1′) = {3, 4}",
        "Both blue incidences are copied from 1 to 1′.",
        "blue",
        true,
        true,
      ),
    );
  }

  function renderResolvedWitnesses(outcome) {
    elements.witnessList.replaceChildren(
      witnessCard(
        `${outcome.colorName} witness 1`,
        outcome.triangleLabels[0],
        `The shared ${outcome.colorName} neighbor ${outcome.neighborLabels[0]} closes the first triangle.`,
        outcome.colorName,
        true,
      ),
      witnessCard(
        `${outcome.colorName} witness 2`,
        outcome.triangleLabels[1],
        `The shared ${outcome.colorName} neighbor ${outcome.neighborLabels[1]} closes the second triangle.`,
        outcome.colorName,
        true,
      ),
    );
  }

  function witnessCard(
    label,
    formula,
    copy,
    color,
    mathematical = false,
    formulaIsHtml = false,
  ) {
    const card = document.createElement("article");
    card.className = `witness-card witness-card-${color}`;
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    if (mathematical) strong.className = "math";
    if (formulaIsHtml) {
      strong.innerHTML = formula;
    } else {
      strong.textContent = formula;
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = copy;
    card.append(span, strong, paragraph);
    return card;
  }

  function graphTitle() {
    if (state === "k5") return "Triangle-free red-blue coloring of K5";
    if (state === "clone") {
      return "Triangle-free red-blue coloring of K6 minus edge 1 1 prime, obtained by cloning vertex 1";
    }
    return `Cloned K6 construction after coloring edge 1 1 prime ${state}`;
  }

  function graphDescription() {
    if (state === "k5") {
      return "The red edges form cycle 1 2 3 4 5 1, and the blue edges form its complementary 5-cycle. There are no monochromatic triangles.";
    }
    if (state === "clone") {
      return "Vertex 1 prime copies the red neighbors 2 and 5 and the blue neighbors 3 and 4 of vertex 1. Edge 1 1 prime is uncolored, so there are no monochromatic triangles.";
    }
    const outcome = outcomes[state];
    return `Edge 1 1 prime is ${state}. Exactly two ${state} triangles appear: ${outcome.triangleLabels[0]} and ${outcome.triangleLabels[1]}. Both contain the final edge.`;
  }

  function graphEdge(edge, witness, extraClass = "") {
    const classes = ["graph-edge", `edge-${edge.color}`];
    if (extraClass) classes.push(extraClass);
    if (witness) classes.push("is-witness");
    return graphLine(vertices[edge.from], vertices[edge.to], classes.join(" "));
  }

  function isWitnessEdge(edge, outcome) {
    if (!outcome || edge.color !== state) return false;
    return outcome.triangles.some(
      (triangle) => triangle.includes(edge.from) && triangle.includes(edge.to),
    );
  }

  function graphLine(from, to, className) {
    return svgElement("line", {
      class: className,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
  }

  function graphNode(vertex, clone, active) {
    const group = svgElement("g", {
      class: `node${clone ? " node-clone" : ""}${active ? " is-active" : ""}`,
      transform: `translate(${vertex.x} ${vertex.y})`,
    });
    group.append(
      svgElement("circle", { r: clone ? 25 : 23 }),
      svgText("text", { x: 0, y: 7 }, vertex.label),
    );
    return group;
  }

  function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function svgText(name, attributes, value) {
    const element = svgElement(name, attributes);
    element.textContent = value;
    return element;
  }

  function initializeEmbedSizing() {
    if (window.self === window.top) return;

    document.documentElement.classList.add("is-embedded");
    const observer = new ResizeObserver(scheduleHeightMessage);
    observer.observe(elements.shell);
    window.addEventListener("load", scheduleHeightMessage, { once: true });
    window.addEventListener("resize", scheduleHeightMessage);
    requestAnimationFrame(scheduleHeightMessage);
    window.setTimeout(scheduleHeightMessage, 350);
    document.fonts?.ready.then(scheduleHeightMessage);
  }

  function scheduleHeightMessage() {
    if (window.self === window.top) return;
    cancelAnimationFrame(heightFrame);
    heightFrame = requestAnimationFrame(() => {
      const height = Math.ceil(
        Math.max(
          elements.shell.scrollHeight,
          elements.shell.getBoundingClientRect().height,
        ) + 4,
      );
      if (height > 0) {
        window.parent.postMessage(
          { type: resizeMessageType, height },
          window.location.origin,
        );
      }
    });
  }

  function byId(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element;
  }
})();
