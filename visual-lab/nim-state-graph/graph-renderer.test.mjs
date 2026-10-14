import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function createForceGraphHarness() {
  const calls = {
    chain: new Map(),
    graphData: [],
    refresh: 0,
    reheat: 0,
    cameraPosition: [],
    zoomToFit: [],
    timeouts: [],
    projections: [],
    animationFrames: [],
    cancelledAnimationFrames: []
  };
  const callbacks = {};
  const forceCalls = {
    charge: new Map(),
    link: new Map()
  };

  const remember = (name, value) => {
    if (!calls.chain.has(name)) calls.chain.set(name, []);
    calls.chain.get(name).push(value);
  };

  const controls = { target: { x: 10, y: 20, z: 30 } };
  const cameraState = { position: { x: 40, y: 50, z: 330 } };
  const graph = {};
  [
    "showNavInfo",
    "enableNodeDrag",
    "backgroundColor",
    "forceEngine",
    "warmupTicks",
    "cooldownTicks",
    "cooldownTime",
    "d3AlphaMin",
    "d3AlphaDecay",
    "d3VelocityDecay",
    "nodeId",
    "nodeRelSize",
    "nodeResolution",
    "nodeOpacity",
    "nodeColor",
    "nodeVal",
    "nodeLabel",
    "linkColor",
    "linkOpacity",
    "linkWidth",
    "linkDirectionalArrowLength",
    "linkDirectionalArrowResolution",
    "linkDirectionalArrowRelPos",
    "linkDirectionalArrowColor",
    "linkDirectionalParticles",
    "linkDirectionalParticleWidth",
    "linkDirectionalParticleColor",
    "linkDirectionalParticleSpeed",
    "onNodeClick",
    "onNodeHover"
  ].forEach((name) => {
    graph[name] = (value) => {
      remember(name, value);
      return graph;
    };
  });

  graph.onEngineStop = (callback) => {
    callbacks.engineStop = callback;
    return graph;
  };
  graph.d3Force = (name) => {
    const methods = {};
    const forceName = name === "charge" ? "charge" : "link";
    ["strength", "theta", "distanceMin", "distanceMax", "distance", "iterations"].forEach((method) => {
      methods[method] = (value) => {
        forceCalls[forceName].set(method, value);
        return methods;
      };
    });
    return methods;
  };
  graph.renderer = () => ({ setPixelRatio: (value) => remember("pixelRatio", value) });
  graph.controls = () => controls;
  graph.graphData = (value) => {
    calls.graphData.push(value);
    return graph;
  };
  graph.refresh = () => {
    calls.refresh += 1;
    return graph;
  };
  graph.d3ReheatSimulation = () => {
    calls.reheat += 1;
    return graph;
  };
  graph.width = (value) => {
    remember("width", value);
    return graph;
  };
  graph.height = (value) => {
    remember("height", value);
    return graph;
  };
  graph.cameraPosition = (...args) => {
    if (!args.length) return { ...cameraState.position };
    calls.cameraPosition.push(args);
    cameraState.position = { ...args[0] };
    if (args[1]) controls.target = { ...args[1] };
    return graph;
  };
  graph.zoomToFit = (...args) => {
    calls.zoomToFit.push(args);
    return graph;
  };
  graph.graph2ScreenCoords = (x, y, z) => {
    calls.projections.push({ x, y, z });
    return { x: x + 100, y: y + 200 };
  };
  graph._destructor = () => {};

  function ForceGraph3D(container, options) {
    calls.constructor = { container, options };
    return graph;
  }

  function createElement(tagName) {
    return {
      tagName: tagName.toUpperCase(),
      children: [],
      attributes: new Map(),
      className: "",
      textContent: "",
      hidden: false,
      style: {},
      append(...children) {
        this.children.push(...children);
      },
      replaceChildren(...children) {
        this.children = [...children];
      },
      setAttribute(name, value) {
        this.attributes.set(name, String(value));
      },
      remove() {
        this.removed = true;
      }
    };
  }

  const container = {
    children: [],
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren() {
      assert.fail("the ForceGraph3D path should not fall back to canvas");
    }
  };

  let nextTimerId = 1;
  let nextAnimationFrameId = 1;
  const windowMock = {
    ForceGraph3D,
    console,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) {
      const frame = { id: nextAnimationFrameId, callback };
      nextAnimationFrameId += 1;
      calls.animationFrames.push(frame);
      return frame.id;
    },
    cancelAnimationFrame(id) {
      calls.cancelledAnimationFrames.push(id);
    },
    clearTimeout() {},
    setTimeout(callback, delay) {
      const timer = { id: nextTimerId, callback, delay };
      nextTimerId += 1;
      calls.timeouts.push(timer);
      return timer.id;
    }
  };

  return { callbacks, calls, cameraState, container, controls, createElement, forceCalls, graph, windowMock };
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const harness = createForceGraphHarness();
globalThis.window = harness.windowMock;
globalThis.document = {
  createElement: harness.createElement
};

try {
  // The site intentionally has no package.json. Importing a data URL lets Node
  // exercise the browser ESM module without changing the repository's mode.
  const source = await readFile(new URL("./graph-renderer.js", import.meta.url), "utf8");
  const rendererModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const renderer = rendererModule.createNimGraphRenderer(harness.container);

  assert.equal(renderer.rendererType, "webgl");
  assert.deepEqual(harness.calls.constructor.options, { controlType: "orbit" });
  assert.equal(harness.calls.chain.get("enableNodeDrag").at(-1), true);
  assert.equal(harness.calls.chain.get("forceEngine").at(-1), "d3");

  const warmupTicks = harness.calls.chain.get("warmupTicks").at(-1);
  const cooldownTicks = harness.calls.chain.get("cooldownTicks").at(-1);
  const cooldownTime = harness.calls.chain.get("cooldownTime").at(-1);
  assert.ok(Number.isFinite(warmupTicks) && warmupTicks > 0 && warmupTicks <= 120);
  assert.ok(Number.isFinite(cooldownTicks) && cooldownTicks > 0 && cooldownTicks <= 300);
  assert.ok(Number.isFinite(cooldownTime) && cooldownTime > 0 && cooldownTime <= 6000);
  assert.ok(harness.forceCalls.charge.has("strength"));
  assert.ok(harness.forceCalls.link.has("distance"));

  renderer.setGraph({
    initialNodeId: "start",
    nodes: [
      {
        id: "start",
        piles: [2, 1],
        totalStones: 3,
        nimSum: 3,
        x: 11,
        y: 12,
        z: 13,
        fx: 11,
        fy: 12,
        fz: 13,
        position: { x: 1, y: 2, z: 3 }
      },
      {
        id: "next",
        piles: [1, 1],
        totalStones: 2,
        nimSum: 0,
        fx: 21,
        fy: 22,
        fz: 23,
        position: { x: 4, y: 5, z: 6 }
      },
      {
        id: "side",
        piles: [1],
        totalStones: 1,
        nimSum: 1,
        position: { x: 7, y: 8, z: 9 }
      },
      {
        id: "hidden-zero",
        piles: [2, 2],
        totalStones: 4,
        nimSum: 0,
        turn: "human",
        position: { x: 8, y: 9, z: 10 }
      },
      {
        id: "hidden-nonzero",
        piles: [3, 1],
        totalStones: 4,
        nimSum: 2,
        turn: "human",
        position: { x: 9, y: 10, z: 11 }
      },
      {
        id: "history",
        piles: [3, 1],
        totalStones: 4,
        nimSum: 2,
        position: { x: 10, y: 11, z: 12 }
      },
      {
        id: "behind",
        piles: [4, 1],
        totalStones: 5,
        nimSum: 5,
        position: { x: 13, y: 14, z: 15 }
      },
      {
        id: "victory",
        piles: [0, 0],
        totalStones: 0,
        nimSum: 0,
        outcome: "victory",
        position: { x: 16, y: 17, z: 18 }
      },
      {
        id: "defeat",
        piles: [0, 0],
        totalStones: 0,
        nimSum: 0,
        outcome: "defeat",
        position: { x: 19, y: 20, z: 21 }
      }
    ],
    edges: [{ id: "edge:start->next", source: "start", target: "next" }]
  });

  assert.equal(harness.calls.graphData.length, 1);
  const forceData = harness.calls.graphData[0];
  assert.equal(forceData.nodes.length, 9);
  for (const node of forceData.nodes) {
    assert.equal(Object.hasOwn(node, "x"), false, "force-layout nodes must choose their own x");
    assert.equal(Object.hasOwn(node, "y"), false, "force-layout nodes must choose their own y");
    assert.equal(Object.hasOwn(node, "z"), false, "force-layout nodes must choose their own z");
    assert.equal(Object.hasOwn(node, "fx"), false, "force-layout nodes must not pin x");
    assert.equal(Object.hasOwn(node, "fy"), false, "force-layout nodes must not pin y");
    assert.equal(Object.hasOwn(node, "fz"), false, "force-layout nodes must not pin z");
  }

  const byId = new Map(forceData.nodes.map((node) => [node.id, node]));
  const nodeColor = harness.calls.chain.get("nodeColor").at(-1);
  const nodeVal = harness.calls.chain.get("nodeVal").at(-1);
  const nodeLabel = harness.calls.chain.get("nodeLabel").at(-1);
  const hiddenZero = byId.get("hidden-zero");
  const hiddenNonzero = byId.get("hidden-nonzero");

  assert.equal(nodeColor(hiddenZero), nodeColor(hiddenNonzero), "nim-sum must not affect default node color");
  assert.equal(nodeVal(hiddenZero), nodeVal(hiddenNonzero), "nim-sum must not affect default node size");
  assert.doesNotMatch(nodeLabel(hiddenZero), /nim-sum|winning|losing/i, "default labels must not reveal nim-sum status");
  assert.doesNotMatch(nodeLabel(hiddenNonzero), /nim-sum|winning|losing/i, "default labels must not reveal nim-sum status");

  renderer.setShowNimSums(true);
  assert.notEqual(nodeColor(hiddenZero), nodeColor(hiddenNonzero), "the opt-in view distinguishes zero and nonzero nim-sums by color");
  assert.notEqual(nodeVal(hiddenZero), nodeVal(hiddenNonzero), "the opt-in view distinguishes zero and nonzero nim-sums by size");
  assert.match(nodeLabel(hiddenZero), /Nim-sum 0.*losing/is);
  assert.match(nodeLabel(hiddenNonzero), /Nim-sum 2.*winning/is);
  renderer.setShowNimSums(false);
  assert.equal(nodeColor(hiddenZero), nodeColor(hiddenNonzero), "turning the feature off hides nim-sum color again");
  assert.equal(nodeVal(hiddenZero), nodeVal(hiddenNonzero), "turning the feature off hides nim-sum size again");

  assert.equal(harness.container.children.length, 1, "the renderer creates one landmark overlay");
  const landmarkLayer = harness.container.children[0];
  assert.equal(landmarkLayer.className, "graph-landmark-layer");
  assert.deepEqual(
    landmarkLayer.children.map((label) => label.textContent),
    ["START", "END · VICTORY", "END · DEFEAT"],
    "start and both zero-stone outcomes receive persistent landmark labels"
  );

  const refreshBefore = harness.calls.refresh;
  renderer.setHighlights({
    currentId: "start",
    legalIds: ["next"],
    pathNodeIds: ["history", "start"],
    pathEdgeIds: [],
    reachableNodeIds: ["start", "next"],
    reachableEdgeIds: ["edge:start->next"]
  });
  assert.equal(harness.calls.refresh, refreshBefore + 1);
  assert.equal(harness.calls.graphData.length, 1, "highlighting must not rebuild graph data");
  assert.equal(harness.calls.reheat, 0, "highlighting must not restart the force simulation");
  assert.equal(harness.calls.cameraPosition.length, 0, "the initial highlight must not move the camera away from the overview");

  const alpha = (node) => Number(nodeColor(node).match(/, ([\d.]+)\)$/)[1]);
  assert.ok(alpha(byId.get("next")) > alpha(byId.get("side")), "reachable future stays clearer than an inaccessible branch");
  assert.ok(alpha(byId.get("history")) > alpha(byId.get("behind")), "played history overrides strong past fading");
  assert.ok(alpha(byId.get("side")) > alpha(byId.get("behind")), "inaccessible future fades less than unreachable past");
  assert.ok(alpha(byId.get("victory")) > alpha(byId.get("side")), "terminal landmarks remain findable");

  renderer.setHighlights({ currentId: "next" });
  renderer.setHighlights({ currentId: "side" });
  assert.equal(harness.calls.cameraPosition.length, 0, "camera focus waits while the force layout is settling");
  assert.equal(typeof harness.callbacks.engineStop, "function");
  forceData.nodes.forEach((node, index) => {
    node.x = 100 + index * 12;
    node.y = 40 + index * 3;
    node.z = -60 + index * 7;
  });
  harness.callbacks.engineStop();
  assert.equal(harness.calls.cameraPosition.length, 1, "settling completion focuses the latest queued current node once");
  const side = byId.get("side");
  const followedTarget = harness.calls.cameraPosition[0][1];
  assert.deepEqual(followedTarget, { x: side.x, y: side.y, z: side.z });
  assert.deepEqual(
    harness.calls.cameraPosition[0][0],
    { x: side.x + 30, y: side.y + 30, z: side.z + 300 },
    "following preserves the viewer's camera offset"
  );

  const initialAnimationFrames = harness.calls.animationFrames.slice();
  initialAnimationFrames.forEach((frame) => frame.callback(0));
  assert.ok(harness.calls.projections.length >= 3, "landmarks are projected into screen coordinates");
  for (const label of landmarkLayer.children) {
    assert.equal(label.hidden, false);
    assert.match(label.style.left, /^\d+px$/);
    assert.match(label.style.top, /^\d+px$/);
  }

  harness.callbacks.engineStop();
  assert.equal(harness.calls.cameraPosition.length, 1, "engine-stop is idempotent after the queued focus is handled");

  renderer.setFollowCurrent(false);
  renderer.setHighlights({ currentId: "history" });
  assert.equal(harness.calls.cameraPosition.length, 1, "disabling follow suppresses camera movement on current-node changes");
  renderer.setFollowCurrent(true);
  assert.equal(harness.calls.cameraPosition.length, 2, "re-enabling follow immediately focuses the current node");
  const history = byId.get("history");
  assert.deepEqual(harness.calls.cameraPosition.at(-1)[1], { x: history.x, y: history.y, z: history.z });
  renderer.setFollowCurrent(true);
  assert.equal(harness.calls.cameraPosition.length, 2, "reapplying the enabled setting does not refocus the camera");

  renderer.resetView();
  assert.equal(harness.calls.cameraPosition.length, 3);
  const resetTarget = harness.calls.cameraPosition.at(-1)[1];
  assert.notDeepEqual(resetTarget, { x: 0, y: 0, z: 0 }, "reset targets the settled graph center");
  assert.equal(harness.calls.timeouts.length, 1);
  assert.ok(harness.calls.timeouts[0].delay >= 0 && harness.calls.timeouts[0].delay <= 1000);
  harness.calls.timeouts[0].callback();
  assert.equal(harness.calls.zoomToFit.length, 1);

  renderer.moveCamera({ yaw: 0.12 });
  assert.deepEqual(harness.calls.cameraPosition.at(-1)[1], resetTarget, "keyboard camera movement preserves the graph center");

  renderer.destroy();
  assert.ok(harness.calls.cancelledAnimationFrames.length > 0, "destroy stops landmark tracking");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

console.log("nim-state-graph force renderer tests passed");
