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
    timeouts: []
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
  graph.controls = () => ({});
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
    if (!args.length) return { x: 0, y: 0, z: 300 };
    calls.cameraPosition.push(args);
    return graph;
  };
  graph.zoomToFit = (...args) => {
    calls.zoomToFit.push(args);
    return graph;
  };
  graph._destructor = () => {};

  function ForceGraph3D(container, options) {
    calls.constructor = { container, options };
    return graph;
  }

  const container = {
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
    replaceChildren() {
      assert.fail("the ForceGraph3D path should not fall back to canvas");
    }
  };

  let nextTimerId = 1;
  const windowMock = {
    ForceGraph3D,
    console,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) {
      callback(0);
      return 1;
    },
    clearTimeout() {},
    setTimeout(callback, delay) {
      const timer = { id: nextTimerId, callback, delay };
      nextTimerId += 1;
      calls.timeouts.push(timer);
      return timer.id;
    }
  };

  return { callbacks, calls, container, forceCalls, graph, windowMock };
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const harness = createForceGraphHarness();
globalThis.window = harness.windowMock;
globalThis.document = {
  createElement() {
    assert.fail("the ForceGraph3D path should not create a canvas");
  }
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
      }
    ],
    edges: [{ id: "edge:start->next", source: "start", target: "next" }]
  });

  assert.equal(harness.calls.graphData.length, 1);
  const forceData = harness.calls.graphData[0];
  assert.equal(forceData.nodes.length, 6);
  for (const node of forceData.nodes) {
    assert.equal(Object.hasOwn(node, "x"), false, "force-layout nodes must choose their own x");
    assert.equal(Object.hasOwn(node, "y"), false, "force-layout nodes must choose their own y");
    assert.equal(Object.hasOwn(node, "z"), false, "force-layout nodes must choose their own z");
    assert.equal(Object.hasOwn(node, "fx"), false, "force-layout nodes must not pin x");
    assert.equal(Object.hasOwn(node, "fy"), false, "force-layout nodes must not pin y");
    assert.equal(Object.hasOwn(node, "fz"), false, "force-layout nodes must not pin z");
  }

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

  const nodeColor = harness.calls.chain.get("nodeColor").at(-1);
  const alpha = (node) => Number(nodeColor(node).match(/, ([\d.]+)\)$/)[1]);
  const byId = new Map(forceData.nodes.map((node) => [node.id, node]));
  assert.ok(alpha(byId.get("next")) > alpha(byId.get("side")), "reachable future stays clearer than an inaccessible branch");
  assert.ok(alpha(byId.get("history")) > alpha(byId.get("behind")), "played history overrides strong past fading");
  assert.ok(alpha(byId.get("side")) > alpha(byId.get("behind")), "inaccessible future fades less than unreachable past");
  assert.ok(alpha(byId.get("victory")) > alpha(byId.get("side")), "terminal landmarks remain findable");

  renderer.resetView();
  assert.equal(harness.calls.cameraPosition.length, 0, "reset waits for force layout to settle");
  assert.equal(harness.calls.zoomToFit.length, 0);
  assert.equal(typeof harness.callbacks.engineStop, "function");
  forceData.nodes.forEach((node, index) => {
    node.x = 100 + index * 12;
    node.y = 40 + index * 3;
    node.z = -60 + index * 7;
  });
  harness.callbacks.engineStop();
  assert.equal(harness.calls.cameraPosition.length, 1, "queued reset runs when force layout settles");
  const resetTarget = harness.calls.cameraPosition[0][1];
  assert.notDeepEqual(resetTarget, { x: 0, y: 0, z: 0 }, "reset targets the settled graph center");
  assert.equal(harness.calls.timeouts.length, 1);
  assert.ok(harness.calls.timeouts[0].delay >= 0 && harness.calls.timeouts[0].delay <= 1000);
  harness.calls.timeouts[0].callback();
  assert.equal(harness.calls.zoomToFit.length, 1);

  harness.callbacks.engineStop();
  assert.equal(harness.calls.cameraPosition.length, 1, "engine-stop is idempotent without another reset");

  renderer.moveCamera({ yaw: 0.12 });
  assert.deepEqual(harness.calls.cameraPosition.at(-1)[1], resetTarget, "keyboard camera movement preserves the graph center");

  renderer.destroy();
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

console.log("nim-state-graph force renderer tests passed");
