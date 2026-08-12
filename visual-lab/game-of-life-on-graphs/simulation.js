(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VisualLife = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RULES = Object.freeze({
    conway: Object.freeze({ name: "Conway", birth: Object.freeze([3]), survive: Object.freeze([2, 3]) }),
    highlife: Object.freeze({ name: "HighLife", birth: Object.freeze([3, 6]), survive: Object.freeze([2, 3]) }),
    seeds: Object.freeze({ name: "Seeds", birth: Object.freeze([2]), survive: Object.freeze([]) })
  });

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function edgeKey(a, b) {
    return a < b ? a + ":" + b : b + ":" + a;
  }

  function addEdge(edgeSet, pairs, a, b) {
    if (a === b) return false;
    const key = edgeKey(a, b);
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    pairs.push(a < b ? [a, b] : [b, a]);
    return true;
  }

  function degreesFromPairs(count, pairs) {
    const degrees = new Uint16Array(count);
    pairs.forEach(function countEndpoints(pair) {
      degrees[pair[0]] += 1;
      degrees[pair[1]] += 1;
    });
    return degrees;
  }

  function graphFromPairs(count, pairs, positions) {
    const degrees = degreesFromPairs(count, pairs);
    const nodes = Array.from({ length: count }, function makeNode(_, id) {
      const node = { id: id, degree: degrees[id], alive: false };
      if (positions && positions[id]) Object.assign(node, positions[id]);
      return node;
    });
    return { nodes: nodes, pairs: pairs, degrees: degrees };
  }

  function torusGraph(side) {
    const q = clamp(Math.round(side), 4, 60);
    const count = q * q;
    const pairs = [];
    const edgeSet = new Set();
    const positions = new Array(count);
    const majorRadius = 112;
    const minorRadius = 43;
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1]
    ];

    for (let row = 0; row < q; row += 1) {
      for (let column = 0; column < q; column += 1) {
        const u = (2 * Math.PI * row) / q;
        const v = (2 * Math.PI * column) / q;
        const x = (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u);
        const y = (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u);
        const z = minorRadius * Math.sin(v);
        positions[row * q + column] = { x: x, y: y, z: z, fx: x, fy: y, fz: z };
      }
    }

    for (let row = 0; row < q; row += 1) {
      for (let column = 0; column < q; column += 1) {
        const source = row * q + column;
        offsets.forEach(function addNeighbor(offset) {
          const nextRow = (row + offset[0] + q) % q;
          const nextColumn = (column + offset[1] + q) % q;
          addEdge(edgeSet, pairs, source, nextRow * q + nextColumn);
        });
      }
    }

    return graphFromPairs(count, pairs, positions);
  }

  function makeCirculantPairs(count, degree) {
    const pairs = [];
    const edgeSet = new Set();
    for (let vertex = 0; vertex < count; vertex += 1) {
      for (let offset = 1; offset <= degree / 2; offset += 1) {
        addEdge(edgeSet, pairs, vertex, (vertex + offset) % count);
      }
    }
    return { pairs: pairs, edgeSet: edgeSet };
  }

  function isConnected(count, pairs) {
    if (count === 0) return true;
    const adjacency = Array.from({ length: count }, function makeList() { return []; });
    pairs.forEach(function addToLists(pair) {
      adjacency[pair[0]].push(pair[1]);
      adjacency[pair[1]].push(pair[0]);
    });
    const visited = new Uint8Array(count);
    const queue = [0];
    visited[0] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      adjacency[queue[cursor]].forEach(function visit(neighbor) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      });
    }
    return queue.length === count;
  }

  function randomRegularGraph(count, degree, random) {
    const n = clamp(Math.round(count), 4, 1000);
    let d = clamp(Math.round(degree), 2, n - 1);
    if (d % 2 !== 0) d -= 1;
    const initial = makeCirculantPairs(n, d);
    const pairs = initial.pairs;
    const edgeSet = initial.edgeSet;
    const switches = n * d * 12;

    for (let attempt = 0; attempt < switches; attempt += 1) {
      const firstIndex = Math.floor(random() * pairs.length);
      const secondIndex = Math.floor(random() * pairs.length);
      if (firstIndex === secondIndex) continue;

      const first = pairs[firstIndex];
      const second = pairs[secondIndex];
      const a = first[0];
      const b = first[1];
      const c = random() < 0.5 ? second[0] : second[1];
      const d2 = c === second[0] ? second[1] : second[0];
      if (new Set([a, b, c, d2]).size < 4) continue;

      const replacementOne = edgeKey(a, c);
      const replacementTwo = edgeKey(b, d2);
      if (edgeSet.has(replacementOne) || edgeSet.has(replacementTwo)) continue;

      edgeSet.delete(edgeKey(first[0], first[1]));
      edgeSet.delete(edgeKey(second[0], second[1]));
      edgeSet.add(replacementOne);
      edgeSet.add(replacementTwo);
      pairs[firstIndex] = a < c ? [a, c] : [c, a];
      pairs[secondIndex] = b < d2 ? [b, d2] : [d2, b];
    }

    const finalPairs = isConnected(n, pairs) ? pairs : makeCirculantPairs(n, d).pairs;
    return graphFromPairs(n, finalPairs);
  }

  function erdosRenyiGraph(count, meanDegree, random) {
    const n = clamp(Math.round(count), 2, 1000);
    const probability = clamp(Number(meanDegree) / (n - 1), 0, 1);
    const pairs = [];
    for (let source = 0; source < n; source += 1) {
      for (let target = source + 1; target < n; target += 1) {
        if (random() < probability) pairs.push([source, target]);
      }
    }
    return graphFromPairs(n, pairs);
  }

  function preferentialGraph(count, attachments, random) {
    const n = clamp(Math.round(count), 3, 1000);
    const m = clamp(Math.round(attachments), 1, n - 1);
    const start = Math.min(m + 1, n);
    const pairs = [];
    const edgeSet = new Set();
    const degrees = new Uint16Array(n);

    for (let source = 0; source < start; source += 1) {
      for (let target = source + 1; target < start; target += 1) {
        addEdge(edgeSet, pairs, source, target);
        degrees[source] += 1;
        degrees[target] += 1;
      }
    }

    for (let vertex = start; vertex < n; vertex += 1) {
      const chosen = new Set();
      while (chosen.size < Math.min(m, vertex)) {
        let totalWeight = 0;
        for (let candidate = 0; candidate < vertex; candidate += 1) {
          if (!chosen.has(candidate)) totalWeight += degrees[candidate] + 1;
        }
        let selection = random() * totalWeight;
        let selected = 0;
        for (let candidate = 0; candidate < vertex; candidate += 1) {
          if (chosen.has(candidate)) continue;
          selection -= degrees[candidate] + 1;
          if (selection <= 0) {
            selected = candidate;
            break;
          }
        }
        chosen.add(selected);
      }
      chosen.forEach(function connect(other) {
        addEdge(edgeSet, pairs, vertex, other);
        degrees[vertex] += 1;
        degrees[other] += 1;
      });
    }

    return graphFromPairs(n, pairs);
  }

  function generateGraph(topology, options) {
    const settings = options || {};
    const random = settings.random || mulberry32(settings.seed || 1);
    if (topology === "torus") return torusGraph(settings.side || 9);
    if (topology === "regular") return randomRegularGraph(settings.count || 90, settings.degree || 8, random);
    if (topology === "erdos") return erdosRenyiGraph(settings.count || 90, settings.meanDegree || 8, random);
    if (topology === "preferential") return preferentialGraph(settings.count || 90, settings.attachments || 3, random);
    throw new Error("Unknown graph topology: " + topology);
  }

  function randomState(count, density, random) {
    const state = new Uint8Array(count);
    const probability = clamp(Number(density), 0, 1);
    for (let index = 0; index < state.length; index += 1) {
      state[index] = random() < probability ? 1 : 0;
    }
    return state;
  }

  function stepInto(state, next, neighborCounts, edgePairs, birth, survive) {
    neighborCounts.fill(0);
    for (let index = 0; index < edgePairs.length; index += 2) {
      const source = edgePairs[index];
      const target = edgePairs[index + 1];
      if (state[source]) neighborCounts[target] += 1;
      if (state[target]) neighborCounts[source] += 1;
    }
    for (let vertex = 0; vertex < state.length; vertex += 1) {
      const count = neighborCounts[vertex];
      next[vertex] = state[vertex] ? Number(survive.has(count)) : Number(birth.has(count));
    }
    return next;
  }

  function step(state, pairs, rule) {
    const next = new Uint8Array(state.length);
    const neighborCounts = new Uint16Array(state.length);
    const edgePairs = Uint16Array.from(pairs.flat());
    const selectedRule = rule || RULES.conway;
    stepInto(
      state,
      next,
      neighborCounts,
      edgePairs,
      new Set(selectedRule.birth),
      new Set(selectedRule.survive)
    );
    return next;
  }

  function countAlive(state) {
    let total = 0;
    state.forEach(function add(value) { total += value; });
    return total;
  }

  return Object.freeze({
    RULES: RULES,
    clamp: clamp,
    mulberry32: mulberry32,
    degreesFromPairs: degreesFromPairs,
    isConnected: isConnected,
    torusGraph: torusGraph,
    randomRegularGraph: randomRegularGraph,
    erdosRenyiGraph: erdosRenyiGraph,
    preferentialGraph: preferentialGraph,
    generateGraph: generateGraph,
    randomState: randomState,
    stepInto: stepInto,
    step: step,
    countAlive: countAlive
  });
});
