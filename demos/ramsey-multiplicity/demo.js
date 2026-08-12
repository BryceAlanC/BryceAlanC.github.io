(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const resizeMessageType = "paper-concept-demo-height";
  const subscripts = ["₁", "₂", "₃", "₄"];

  const elements = {
    shell: byId("demo-shell"),
    graph: byId("graph"),
    graphDescription: byId("graph-description"),
    graphCaption: byId("graph-caption"),
    edgeToggle: byId("edge-toggle"),
    edgeToggleLabel: byId("edge-toggle-label"),
    partASize: byId("part-a-size"),
    partBSize: byId("part-b-size"),
    partAOutput: byId("part-a-output"),
    partBOutput: byId("part-b-output"),
    partLabelA: byId("part-label-a"),
    partLabelB: byId("part-label-b"),
    crossEdgeCount: byId("cross-edge-count"),
    anchoredCopyCount: byId("anchored-copy-count"),
    edgeIndicator: byId("edge-indicator"),
    formulaA: byId("formula-a"),
    formulaB: byId("formula-b"),
    formulaTotal: byId("formula-total"),
    countTitle: byId("count-title"),
    statusBox: byId("status-box"),
    statusTitle: byId("status-title"),
    statusText: byId("status-text"),
    copyGrid: byId("copy-grid"),
  };

  const state = {
    aSize: Number(elements.partASize.value),
    bSize: Number(elements.partBSize.value),
    edgePresent: true,
    hoverPair: null,
    selectedPair: null,
  };

  let heightFrame = 0;

  initializeEmbedSizing();
  bindControls();
  render();

  function bindControls() {
    elements.edgeToggle.addEventListener("click", () => {
      state.edgePresent = !state.edgePresent;
      render();
    });

    elements.partASize.addEventListener("input", () => {
      state.aSize = Number(elements.partASize.value);
      discardUnavailablePair();
      render();
    });

    elements.partBSize.addEventListener("input", () => {
      state.bSize = Number(elements.partBSize.value);
      discardUnavailablePair();
      render();
    });
  }

  function discardUnavailablePair() {
    if (
      state.selectedPair &&
      (state.selectedPair.a >= state.aSize || state.selectedPair.b >= state.bSize)
    ) {
      state.selectedPair = null;
    }
    state.hoverPair = null;
  }

  function render() {
    renderControls();
    renderGraph();
    renderGrid();
    renderCounts();
    renderGraphState();
    renderGridState();
    scheduleHeightMessage();
  }

  function renderControls() {
    const aLabel = vertexCountLabel(state.aSize);
    const bLabel = vertexCountLabel(state.bSize);

    elements.partAOutput.value = aLabel;
    elements.partAOutput.textContent = aLabel;
    elements.partBOutput.value = bLabel;
    elements.partBOutput.textContent = bLabel;
    elements.partASize.setAttribute("aria-valuetext", aLabel);
    elements.partBSize.setAttribute("aria-valuetext", bLabel);
    elements.partLabelA.textContent = String(state.aSize);
    elements.partLabelB.textContent = String(state.bSize);
  }

  function renderCounts() {
    const crossEdges = state.aSize * state.bSize;
    const anchoredCopies = state.edgePresent ? crossEdges : 0;

    elements.edgeToggle.setAttribute("aria-pressed", String(state.edgePresent));
    elements.edgeToggleLabel.textContent = state.edgePresent ? "Present" : "Missing";
    elements.crossEdgeCount.textContent = String(crossEdges);
    elements.anchoredCopyCount.textContent = String(anchoredCopies);
    elements.edgeIndicator.textContent = state.edgePresent ? "1" : "0";
    elements.formulaA.textContent = String(state.aSize);
    elements.formulaB.textContent = String(state.bSize);
    elements.formulaTotal.textContent = String(anchoredCopies);
    elements.statusBox.classList.toggle("is-missing", !state.edgePresent);

    if (state.edgePresent) {
      elements.countTitle.textContent = "Every cross-edge gives one copy.";
      elements.statusTitle.textContent = "The final edge is present.";
      elements.statusText.replaceChildren(
        textNode("Deleting "),
        italicNode("e"),
        textNode(` destroys all ${anchoredCopies} anchored ${plural("copy", anchoredCopies, "copies")} at once.`),
      );
      elements.graphCaption.innerHTML =
        "Hover a cross-edge or focus a grid cell to isolate one anchored " +
        '<span class="math">K<sub>4</sub></span>.';
    } else {
      elements.countTitle.textContent = "The missing edge breaks every copy.";
      elements.statusTitle.textContent = "The backbone is missing.";
      elements.statusText.replaceChildren(
        textNode(`The ${crossEdges} cross-${plural("edge", crossEdges)} remain, but none completes a `),
        kFourNode(),
        textNode("."),
      );
      elements.graphCaption.innerHTML =
        "Inspect a pair to see the four potential vertices and the one missing connection.";
    }

    const description = state.edgePresent
      ? `The edge u v combines with each of the ${crossEdges} cross-edges between parts A and B to form ${anchoredCopies} anchored K4 ${plural("copy", anchoredCopies, "copies")}.`
      : `The edge u v is missing. The complete bipartite common neighborhood has ${crossEdges} cross-edges, but there are no anchored K4 copies.`;
    elements.graphDescription.textContent = description;
  }

  function renderGraph() {
    const graph = elements.graph;
    const title = svgElement("title", { id: "graph-title" });
    title.textContent = "Complete bipartite common neighborhood anchored at edge u v";
    const description = svgElement("desc", { id: "graph-description" });
    graph.replaceChildren(title, description);
    elements.graphDescription = description;

    const coordinates = makeCoordinates();

    graph.append(
      svgElement("rect", {
        class: "common-region",
        x: 270,
        y: 55,
        width: 510,
        height: 430,
        rx: 25,
      }),
    );

    const regionLabel = svgElement("text", {
      class: "region-label",
      x: 295,
      y: 88,
    });
    regionLabel.textContent = "C = N(u) ∩ N(v)";
    graph.append(regionLabel);

    const partALabel = svgElement("text", {
      class: "part-label part-label-a",
      x: 415,
      y: 122,
      "text-anchor": "middle",
    });
    partALabel.textContent = `A · ${vertexCountLabel(state.aSize)}`;
    const partBLabel = svgElement("text", {
      class: "part-label part-label-b",
      x: 650,
      y: 122,
      "text-anchor": "middle",
    });
    partBLabel.textContent = `B · ${vertexCountLabel(state.bSize)}`;
    graph.append(partALabel, partBLabel);

    const edgesLayer = svgElement("g", { class: "edges-layer" });
    const crossLayer = svgElement("g", { class: "cross-layer" });
    const nodesLayer = svgElement("g", { class: "nodes-layer" });
    graph.append(edgesLayer, crossLayer, nodesLayer);

    for (const point of [...coordinates.a, ...coordinates.b]) {
      for (const anchor of [coordinates.u, coordinates.v]) {
        edgesLayer.append(
          graphLine(anchor, point, "graph-edge anchor-edge", {
            "data-edge-kind": "anchor",
            "data-node": point.key,
          }),
        );
      }
    }

    coordinates.a.forEach((aPoint, aIndex) => {
      coordinates.b.forEach((bPoint, bIndex) => {
        const group = svgElement("g", {
          class: "cross-control",
          tabindex: "0",
          role: "button",
          "aria-label": pairAriaLabel(aIndex, bIndex),
          "data-a": String(aIndex),
          "data-b": String(bIndex),
        });
        group.append(
          graphLine(aPoint, bPoint, "cross-hit", {}),
          graphLine(aPoint, bPoint, "graph-edge cross-edge", {
            "data-edge-kind": "cross",
            "data-a": String(aIndex),
            "data-b": String(bIndex),
          }),
        );
        bindPairInteraction(group, aIndex, bIndex);
        crossLayer.append(group);
      });
    });

    const backbone = graphLine(
      coordinates.u,
      coordinates.v,
      `graph-edge backbone-edge${state.edgePresent ? "" : " is-missing"}`,
      { "data-edge-kind": "backbone" },
    );
    edgesLayer.append(backbone);

    const edgeLabel = svgElement("text", {
      class: "edge-label",
      x: 84,
      y: 275,
      "text-anchor": "end",
    });
    edgeLabel.textContent = state.edgePresent ? "e = uv" : "missing e";
    edgesLayer.append(edgeLabel);

    nodesLayer.append(
      graphNode(coordinates.u, "node node-anchor", "u"),
      graphNode(coordinates.v, "node node-anchor", "v"),
    );

    coordinates.a.forEach((point, index) => {
      nodesLayer.append(graphNode(point, "node node-a", `a${subscripts[index]}`));
    });
    coordinates.b.forEach((point, index) => {
      nodesLayer.append(graphNode(point, "node node-b", `b${subscripts[index]}`));
    });
  }

  function renderGrid() {
    const grid = elements.copyGrid;
    const fragment = document.createDocumentFragment();
    grid.style.setProperty("--part-b-size", String(state.bSize));

    const corner = document.createElement("span");
    corner.className = "grid-corner";
    corner.setAttribute("aria-hidden", "true");
    corner.textContent = "A × B";
    fragment.append(corner);

    for (let b = 0; b < state.bSize; b += 1) {
      const header = document.createElement("span");
      header.className = "grid-axis grid-axis-b";
      header.setAttribute("aria-hidden", "true");
      header.textContent = `b${subscripts[b]}`;
      fragment.append(header);
    }

    for (let a = 0; a < state.aSize; a += 1) {
      const header = document.createElement("span");
      header.className = "grid-axis grid-axis-a";
      header.setAttribute("aria-hidden", "true");
      header.textContent = `a${subscripts[a]}`;
      fragment.append(header);

      for (let b = 0; b < state.bSize; b += 1) {
        const cell = document.createElement("button");
        cell.className = "grid-cell";
        cell.type = "button";
        cell.setAttribute("aria-pressed", "false");
        cell.setAttribute("aria-label", pairAriaLabel(a, b));
        cell.dataset.a = String(a);
        cell.dataset.b = String(b);

        const label = document.createElement("span");
        label.innerHTML = `<i>a</i><sub>${a + 1}</sub> + <i>b</i><sub>${b + 1}</sub>`;
        cell.append(label);
        bindPairInteraction(cell, a, b);
        fragment.append(cell);
      }
    }

    grid.replaceChildren(fragment);
  }

  function bindPairInteraction(target, a, b) {
    target.addEventListener("pointerenter", () => {
      state.hoverPair = { a, b };
      renderPairState();
    });
    target.addEventListener("pointerleave", () => {
      state.hoverPair = null;
      renderPairState();
    });
    target.addEventListener("focus", () => {
      state.hoverPair = { a, b };
      renderPairState();
    });
    target.addEventListener("blur", () => {
      state.hoverPair = null;
      renderPairState();
    });
    target.addEventListener("click", () => toggleSelectedPair(a, b));
    if (target instanceof SVGElement) {
      target.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSelectedPair(a, b);
        }
      });
    }
  }

  function toggleSelectedPair(a, b) {
    const samePair =
      state.selectedPair?.a === a && state.selectedPair?.b === b;
    state.selectedPair = samePair ? null : { a, b };
    state.hoverPair = null;
    renderPairState();
  }

  function renderPairState() {
    renderGraphState();
    renderGridState();
  }

  function renderGraphState() {
    const pair = effectivePair();
    const graph = elements.graph;
    graph.classList.toggle("has-selection", Boolean(pair));

    graph.querySelectorAll(".is-active").forEach((element) => {
      element.classList.remove("is-active");
    });

    if (!pair) return;

    const activeNodeKeys = new Set(["u", "v", `a${pair.a}`, `b${pair.b}`]);
    graph.querySelectorAll(".node").forEach((node) => {
      node.classList.toggle("is-active", activeNodeKeys.has(node.dataset.key));
    });

    graph.querySelectorAll(".graph-edge").forEach((edge) => {
      const kind = edge.dataset.edgeKind;
      let active = kind === "backbone";
      if (kind === "anchor") {
        active = edge.dataset.node === `a${pair.a}` || edge.dataset.node === `b${pair.b}`;
      }
      if (kind === "cross") {
        active = Number(edge.dataset.a) === pair.a && Number(edge.dataset.b) === pair.b;
      }
      edge.classList.toggle("is-active", active);
    });
  }

  function renderGridState() {
    const pair = effectivePair();
    elements.copyGrid.classList.toggle("is-missing", !state.edgePresent);
    elements.copyGrid.querySelectorAll(".grid-cell").forEach((cell) => {
      const a = Number(cell.dataset.a);
      const b = Number(cell.dataset.b);
      const active = pair?.a === a && pair?.b === b;
      const selected = state.selectedPair?.a === a && state.selectedPair?.b === b;
      cell.classList.toggle("is-active", active);
      cell.setAttribute("aria-pressed", String(selected));
      cell.setAttribute("aria-label", pairAriaLabel(a, b));
    });
    elements.graph.querySelectorAll(".cross-control").forEach((control) => {
      const a = Number(control.dataset.a);
      const b = Number(control.dataset.b);
      const selected = state.selectedPair?.a === a && state.selectedPair?.b === b;
      control.setAttribute("aria-pressed", String(selected));
      control.setAttribute("aria-label", pairAriaLabel(a, b));
    });
  }

  function effectivePair() {
    return state.hoverPair ?? state.selectedPair;
  }

  function pairAriaLabel(a, b) {
    const vertices = `u, v, a ${a + 1}, and b ${b + 1}`;
    if (state.edgePresent) {
      return `Highlight the anchored K4 on ${vertices}`;
    }
    return `Inspect ${vertices}; these vertices do not form a K4 because edge u v is missing`;
  }

  function makeCoordinates() {
    return {
      u: { key: "u", x: 120, y: 210 },
      v: { key: "v", x: 120, y: 330 },
      a: distributedPoints(state.aSize, 420, "a"),
      b: distributedPoints(state.bSize, 650, "b"),
    };
  }

  function distributedPoints(count, x, prefix) {
    const minY = 170;
    const maxY = 410;
    if (count === 1) return [{ key: `${prefix}0`, x, y: 290 }];
    return Array.from({ length: count }, (_, index) => ({
      key: `${prefix}${index}`,
      x,
      y: minY + (index * (maxY - minY)) / (count - 1),
    }));
  }

  function graphLine(from, to, className, attributes) {
    return svgElement("line", {
      class: className,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      ...attributes,
    });
  }

  function graphNode(point, className, label) {
    const group = svgElement("g", {
      class: className,
      transform: `translate(${point.x} ${point.y})`,
      "data-key": point.key,
    });
    group.append(
      svgElement("circle", { r: 23 }),
      svgText("text", { x: 0, y: 7 }, label),
    );
    return group;
  }

  function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
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

  function vertexCountLabel(count) {
    return `${count} ${plural("vertex", count, "vertices")}`;
  }

  function plural(singular, count, pluralForm = `${singular}s`) {
    return count === 1 ? singular : pluralForm;
  }

  function textNode(value) {
    return document.createTextNode(value);
  }

  function italicNode(value) {
    const element = document.createElement("i");
    element.textContent = value;
    return element;
  }

  function kFourNode() {
    const span = document.createElement("span");
    span.className = "math";
    span.append(textNode("K"));
    const sub = document.createElement("sub");
    sub.textContent = "4";
    span.append(sub);
    return span;
  }

  function byId(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element;
  }
})();
