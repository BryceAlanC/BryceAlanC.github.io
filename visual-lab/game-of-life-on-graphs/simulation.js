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

  function simplePairs(count, pairs) {
    const n = clamp(Math.round(Number(count) || 0), 0, 1000);
    const normalized = [];
    const edgeSet = new Set();
    (pairs || []).forEach(function normalizePair(pair) {
      if (!pair || pair.length < 2) return;
      const source = Number(pair[0]);
      const target = Number(pair[1]);
      if (!Number.isInteger(source) || !Number.isInteger(target)) return;
      if (source < 0 || target < 0 || source >= n || target >= n) return;
      addEdge(edgeSet, normalized, source, target);
    });
    normalized.sort(function sortPairs(first, second) {
      return first[0] - second[0] || first[1] - second[1];
    });
    return { pairs: normalized, edgeSet: edgeSet };
  }

  function partialShuffle(values, count, random) {
    const limit = Math.min(count, values.length);
    for (let index = 0; index < limit; index += 1) {
      const swapIndex = index + Math.floor(random() * (values.length - index));
      const held = values[index];
      values[index] = values[swapIndex];
      values[swapIndex] = held;
    }
    return values.slice(0, limit);
  }

  /*
   * Replace a rate-controlled fraction of the current edges with previously
   * missing edges. Capping by the number of nonedges makes every counted
   * replacement a genuine change while preserving the total edge count.
   */
  function turnoverEdgePairs(count, pairs, rate, randomSource) {
    const n = clamp(Math.round(Number(count) || 0), 0, 1000);
    const normalized = simplePairs(n, pairs);
    const random = typeof randomSource === "function" ? randomSource : mulberry32(1);
    const numericRate = Number(rate);
    const amount = Number.isFinite(numericRate) ? clamp(numericRate, 0, 1) : 0;
    const maximumEdges = (n * (n - 1)) / 2;
    const missingCount = maximumEdges - normalized.pairs.length;
    const replacementCount = Math.min(
      Math.round(amount * normalized.pairs.length),
      missingCount
    );

    if (replacementCount === 0) return normalized.pairs;

    const removed = new Set(
      partialShuffle(normalized.pairs.slice(), replacementCount, random).map(function key(pair) {
        return edgeKey(pair[0], pair[1]);
      })
    );
    const missing = [];
    for (let source = 0; source < n; source += 1) {
      for (let target = source + 1; target < n; target += 1) {
        if (!normalized.edgeSet.has(edgeKey(source, target))) {
          missing.push([source, target]);
        }
      }
    }

    const replacements = partialShuffle(missing, replacementCount, random);
    const turnedOver = normalized.pairs.filter(function keepPair(pair) {
      return !removed.has(edgeKey(pair[0], pair[1]));
    }).concat(replacements);
    turnedOver.sort(function sortPairs(first, second) {
      return first[0] - second[0] || first[1] - second[1];
    });
    return turnedOver;
  }

  function turnoverGraphEdges(graph, rate, random) {
    const sourceGraph = graph || {};
    const sourceNodes = Array.isArray(sourceGraph.nodes) ? sourceGraph.nodes : [];
    const pairs = turnoverEdgePairs(sourceNodes.length, sourceGraph.pairs || [], rate, random);
    const degrees = degreesFromPairs(sourceNodes.length, pairs);
    const nodes = sourceNodes.map(function copyNode(node, id) {
      return Object.assign({}, node, { id: id, degree: degrees[id] });
    });
    return Object.assign({}, sourceGraph, { nodes: nodes, pairs: pairs, degrees: degrees });
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

  function balancedClusters(count, clusterCount) {
    const memberships = new Uint16Array(count);
    const groups = Array.from({ length: clusterCount }, function makeGroup() { return []; });
    for (let vertex = 0; vertex < count; vertex += 1) {
      const cluster = Math.min(clusterCount - 1, Math.floor((vertex * clusterCount) / count));
      memberships[vertex] = cluster;
      groups[cluster].push(vertex);
    }
    return { memberships: memberships, groups: groups };
  }

  function clusteredPositions(groups) {
    const positions = [];
    const totalClusters = groups.length;
    const centerRadius = totalClusters === 1 ? 0 : 118;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    groups.forEach(function positionCluster(vertices, cluster) {
      const centerY = totalClusters === 1 ? 0 : 1 - (2 * (cluster + 0.5)) / totalClusters;
      const centerPlaneRadius = Math.sqrt(Math.max(0, 1 - centerY * centerY));
      const centerAngle = cluster * goldenAngle;
      const centerX = centerRadius * centerPlaneRadius * Math.cos(centerAngle);
      const centerZ = centerRadius * centerPlaneRadius * Math.sin(centerAngle);
      const clusterY = centerRadius * centerY;
      const spread = 16 + 1.7 * Math.sqrt(vertices.length);

      vertices.forEach(function positionVertex(vertex, localIndex) {
        if (vertices.length === 1) {
          positions[vertex] = { x: centerX, y: clusterY, z: centerZ };
          return;
        }
        const localY = 1 - (2 * (localIndex + 0.5)) / vertices.length;
        const localPlaneRadius = Math.sqrt(Math.max(0, 1 - localY * localY));
        const localAngle = (localIndex + cluster * 0.37) * goldenAngle;
        const shell = 0.68 + 0.32 * ((localIndex * 37) % vertices.length) / (vertices.length - 1);
        positions[vertex] = {
          x: centerX + spread * shell * localPlaneRadius * Math.cos(localAngle),
          y: clusterY + spread * shell * localY,
          z: centerZ + spread * shell * localPlaneRadius * Math.sin(localAngle)
        };
      });
    });

    return positions;
  }

  function finishClusteredGraph(count, pairs, structure, clusterTopology) {
    const graph = graphFromPairs(count, pairs, clusteredPositions(structure.groups));
    graph.nodes.forEach(function labelCluster(node) {
      node.cluster = structure.memberships[node.id];
    });
    graph.memberships = structure.memberships;
    graph.clusterCount = structure.groups.length;
    graph.clusterTopology = clusterTopology;
    return graph;
  }

  function clusterGraph(count, clusterCount, withinProbability, crossProbability, randomSource) {
    const n = clamp(Math.round(Number(count) || 90), 2, 1000);
    const requestedClusters = Number(clusterCount);
    const totalClusters = clamp(
      Number.isFinite(requestedClusters) ? Math.round(requestedClusters) : 4,
      1,
      n
    );
    const withinValue = Number(withinProbability);
    const crossValue = Number(crossProbability);
    const within = Number.isFinite(withinValue) ? clamp(withinValue, 0, 1) : 0.18;
    const cross = Number.isFinite(crossValue) ? clamp(crossValue, 0, 1) : 0.02;
    const random = typeof randomSource === "function" ? randomSource : mulberry32(1);
    const structure = balancedClusters(n, totalClusters);
    const pairs = [];

    for (let source = 0; source < n; source += 1) {
      for (let target = source + 1; target < n; target += 1) {
        const probability = structure.memberships[source] === structure.memberships[target] ? within : cross;
        if (random() < probability) pairs.push([source, target]);
      }
    }

    return finishClusteredGraph(n, pairs, structure, "erdos");
  }

  function smallRegularPairs(count) {
    if (count < 2) return [];
    if (count === 2) return [[0, 1]];
    return [[0, 1], [0, 2], [1, 2]];
  }

  function localClusterPairs(count, topology, settings, random) {
    if (count < 2) return [];
    if (topology === "regular") {
      if (count < 4) return smallRegularPairs(count);
      return randomRegularGraph(count, settings.degree == null ? 8 : settings.degree, random).pairs;
    }
    if (topology === "erdos") {
      const withinValue = Number(settings.withinProbability);
      if (Number.isFinite(withinValue)) {
        const probability = clamp(withinValue, 0, 1);
        const pairs = [];
        for (let source = 0; source < count; source += 1) {
          for (let target = source + 1; target < count; target += 1) {
            if (random() < probability) pairs.push([source, target]);
          }
        }
        return pairs;
      }
      return erdosRenyiGraph(
        count,
        settings.meanDegree == null ? 8 : settings.meanDegree,
        random
      ).pairs;
    }
    if (topology === "preferential") {
      if (count === 2) return [[0, 1]];
      return preferentialGraph(
        count,
        settings.attachments == null ? 3 : settings.attachments,
        random
      ).pairs;
    }
    throw new Error("Unknown cluster topology: " + topology);
  }

  function clusteredGraph(count, clusterCount, options, randomSource) {
    const n = clamp(Math.round(Number(count) || 90), 2, 1000);
    const requestedClusters = Number(clusterCount);
    const totalClusters = clamp(
      Number.isFinite(requestedClusters) ? Math.round(requestedClusters) : 4,
      1,
      n
    );
    const settings = typeof options === "string" ? { clusterTopology: options } : (options || {});
    const requestedTopology = String(settings.clusterTopology || "erdos").toLowerCase();
    const topology = requestedTopology === "erdős–rényi" || requestedTopology === "erdos-renyi"
      ? "erdos"
      : requestedTopology;
    if (!["regular", "erdos", "preferential"].includes(topology)) {
      throw new Error("Unknown cluster topology: " + requestedTopology);
    }
    const crossValue = Number(settings.crossProbability);
    const crossProbability = Number.isFinite(crossValue) ? clamp(crossValue, 0, 1) : 0.02;
    const random = typeof randomSource === "function"
      ? randomSource
      : (typeof settings.random === "function" ? settings.random : mulberry32(1));
    const structure = balancedClusters(n, totalClusters);
    const pairs = [];
    const edgeSet = new Set();

    structure.groups.forEach(function generateCluster(vertices) {
      const localPairs = localClusterPairs(vertices.length, topology, settings, random);
      localPairs.forEach(function mapPair(pair) {
        addEdge(edgeSet, pairs, vertices[pair[0]], vertices[pair[1]]);
      });
    });

    for (let source = 0; source < n; source += 1) {
      for (let target = source + 1; target < n; target += 1) {
        if (structure.memberships[source] !== structure.memberships[target] && random() < crossProbability) {
          addEdge(edgeSet, pairs, source, target);
        }
      }
    }

    pairs.sort(function sortPairs(first, second) {
      return first[0] - second[0] || first[1] - second[1];
    });
    return finishClusteredGraph(n, pairs, structure, topology);
  }

  function generateGraph(topology, options) {
    const settings = options || {};
    const random = settings.random || mulberry32(settings.seed || 1);
    if (topology === "torus") return torusGraph(settings.side || 9);
    if (topology === "regular") return randomRegularGraph(settings.count || 90, settings.degree || 8, random);
    if (topology === "erdos") return erdosRenyiGraph(settings.count || 90, settings.meanDegree || 8, random);
    if (topology === "preferential") return preferentialGraph(settings.count || 90, settings.attachments || 3, random);
    if (topology === "clusters" || topology === "cluster") {
      return clusteredGraph(
        settings.count || 90,
        settings.clusterCount == null ? settings.clusters : settings.clusterCount,
        settings,
        random
      );
    }
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
    turnoverEdgePairs: turnoverEdgePairs,
    turnoverGraphEdges: turnoverGraphEdges,
    isConnected: isConnected,
    torusGraph: torusGraph,
    randomRegularGraph: randomRegularGraph,
    erdosRenyiGraph: erdosRenyiGraph,
    preferentialGraph: preferentialGraph,
    clusterGraph: clusterGraph,
    stochasticBlockGraph: clusterGraph,
    clusteredGraph: clusteredGraph,
    generateGraph: generateGraph,
    randomState: randomState,
    stepInto: stepInto,
    step: step,
    countAlive: countAlive
  });
});
