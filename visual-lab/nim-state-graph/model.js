/**
 * Pure game and graph model for normal-play Nim.
 *
 * Piles are deliberately canonicalized because their order has no strategic
 * meaning. Keeping zeroes, however, preserves the selected number of piles so
 * the presentation layer can keep a stable board shape throughout a game.
 */

export const HUMAN_TURN = "human";
export const COMPUTER_TURN = "computer";
export const TURNS = Object.freeze([HUMAN_TURN, COMPUTER_TURN]);

export const VICTORY = "victory";
export const DEFEAT = "defeat";

export const DEFAULT_NODE_CAP = 1600;
export const NODE_CAP_EXCEEDED = "NODE_CAP_EXCEEDED";
export const DEFAULT_EDGE_CAP = 15000;
export const EDGE_CAP_EXCEEDED = "EDGE_CAP_EXCEEDED";

export const LAYOUT = Object.freeze({
  layerSpacing: 2.8,
  turnSpacing: 2.2,
  stateSpacing: 1.7
});

function pileValue(value, index) {
  const pile = Number(value);
  if (!Number.isSafeInteger(pile) || pile < 0) {
    throw new RangeError(`Pile ${index + 1} must be a nonnegative safe integer`);
  }
  return pile;
}

function validateTurn(turn) {
  if (!TURNS.includes(turn)) {
    throw new RangeError(`Turn must be "${HUMAN_TURN}" or "${COMPUTER_TURN}"`);
  }
  return turn;
}

export function oppositeTurn(turn) {
  return validateTurn(turn) === HUMAN_TURN ? COMPUTER_TURN : HUMAN_TURN;
}

function comparePileVectors(first, second) {
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const difference = (second[index] ?? -1) - (first[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return first.length - second.length;
}

/** Return a descending copy while retaining zero piles and the pile count. */
export function canonicalizePiles(piles) {
  if (!Array.isArray(piles)) throw new TypeError("Piles must be an array");
  return Object.freeze(
    piles
      .map(pileValue)
      .sort((first, second) => second - first)
  );
}

/** A collision-free, stable key for a canonical pile vector. */
export function stateKey(piles) {
  const canonical = canonicalizePiles(piles);
  return `${canonical.length}:${canonical.join(",")}`;
}

export function totalStones(piles) {
  return canonicalizePiles(piles).reduce((total, pile) => total + pile, 0);
}

export function isTerminalState(piles) {
  return canonicalizePiles(piles).every((pile) => pile === 0);
}

/** Exact Nim XOR for every nonnegative safe-integer pile size. */
export function nimSum(piles) {
  let sum = 0n;
  for (const pile of canonicalizePiles(piles)) sum ^= BigInt(pile);
  return Number(sum);
}

export function nodeId(piles, turn) {
  return `state:${validateTurn(turn)}:${stateKey(piles)}`;
}

function freezeMove(move) {
  const successor = Object.freeze([...move.successor]);
  return Object.freeze({
    ...move,
    pileIndices: Object.freeze([...move.pileIndices]),
    successor,
    // This alias makes consumer code read naturally while retaining the
    // concise `successor` property used by the graph builder.
    piles: successor
  });
}

/**
 * Enumerate one representative move per distinct canonical successor.
 *
 * `pileIndex` is the first canonical source pile that realizes the move;
 * `pileIndices` records every symmetric source pile that realizes it.
 */
export function legalMoves(piles) {
  const source = canonicalizePiles(piles);
  const sourceKey = stateKey(source);
  const bySuccessor = new Map();

  for (let pileIndex = 0; pileIndex < source.length; pileIndex += 1) {
    const from = source[pileIndex];
    for (let to = from - 1; to >= 0; to -= 1) {
      const candidate = [...source];
      candidate[pileIndex] = to;
      const successor = canonicalizePiles(candidate);
      const successorKey = stateKey(successor);
      const existing = bySuccessor.get(successorKey);

      if (existing) {
        if (!existing.pileIndices.includes(pileIndex)) existing.pileIndices.push(pileIndex);
        continue;
      }

      bySuccessor.set(successorKey, {
        id: `move:${sourceKey}->${successorKey}`,
        sourceKey,
        successorKey,
        pileIndex,
        pileIndices: [pileIndex],
        from,
        to,
        removed: from - to,
        successor
      });
    }
  }

  return Object.freeze([...bySuccessor.values()].map(freezeMove));
}

/** True only when `successor` is obtainable by reducing exactly one pile. */
export function isLegalSuccessor(piles, successor) {
  try {
    const source = canonicalizePiles(piles);
    const target = canonicalizePiles(successor);
    if (source.length !== target.length) return false;
    const targetKey = stateKey(target);
    return legalMoves(source).some((move) => move.successorKey === targetKey);
  } catch {
    return false;
  }
}

/**
 * Choose the standard optimal Nim move.
 *
 * A nonzero XOR always admits a move to XOR zero. From an XOR-zero position,
 * no winning move exists against perfect play, so the first stable legal move
 * is returned as a deterministic fallback.
 */
export function optimalMove(piles) {
  const source = canonicalizePiles(piles);
  const moves = legalMoves(source);
  if (moves.length === 0) return null;

  const before = nimSum(source);
  const selected = before === 0
    ? moves[0]
    : moves.find((move) => nimSum(move.successor) === 0);

  // The Nim theorem guarantees this branch for every nonterminal position,
  // but retaining a fallback makes the function total if its internals evolve.
  const move = selected ?? moves[0];
  return Object.freeze({
    ...move,
    strategy: before === 0 ? "deterministic-fallback" : "zero-xor",
    nimSumBefore: before,
    nimSumAfter: nimSum(move.successor),
    winningMove: before !== 0 && nimSum(move.successor) === 0
  });
}

function nodeCapFailure(initialPiles, nodeCap, edgeCap, discoveredConfigurations) {
  const requiredNodesAtLeast = discoveredConfigurations * TURNS.length;
  const message = `This position needs more than ${nodeCap} graph nodes. Try fewer or smaller piles.`;
  return Object.freeze({
    ok: false,
    initialPiles,
    nodeCap,
    edgeCap,
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    error: Object.freeze({
      code: NODE_CAP_EXCEEDED,
      message,
      nodeCap,
      requiredNodesAtLeast
    })
  });
}

function edgeCapFailure(initialPiles, nodeCap, edgeCap, requiredEdgesAtLeast) {
  const message = `This position needs more than ${edgeCap} directed graph edges. Try fewer or smaller piles.`;
  return Object.freeze({
    ok: false,
    initialPiles,
    nodeCap,
    edgeCap,
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    error: Object.freeze({
      code: EDGE_CAP_EXCEEDED,
      message,
      edgeCap,
      requiredEdgesAtLeast
    })
  });
}

export function terminalOutcome(piles, turn) {
  if (!isTerminalState(piles)) return null;
  return turn === COMPUTER_TURN ? VICTORY : DEFEAT;
}

/**
 * Return the exact directed future cone from one state-turn node.
 *
 * The two turn copies of a pile configuration are intentionally distinct.
 * Consumers can use the result to emphasize the remaining game without
 * removing nodes from the complete graph or disturbing its layout.
 */
export function directedReachability(graph, currentId) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const knownNodeIds = new Set(nodes.map((node) => node.id));
  if (!knownNodeIds.has(currentId)) {
    return Object.freeze({
      nodeIds: Object.freeze([]),
      edgeIds: Object.freeze([])
    });
  }

  const outgoing = new Map();
  for (const edge of edges) {
    const sourceId = edge.sourceId ?? edge.source;
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    outgoing.get(sourceId).push(edge);
  }

  const nodeIds = new Set([currentId]);
  const edgeIds = new Set();
  const queue = [currentId];
  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index];
    for (const edge of outgoing.get(sourceId) ?? []) {
      const targetId = edge.targetId ?? edge.target;
      if (!knownNodeIds.has(targetId)) continue;
      edgeIds.add(edge.id);
      if (nodeIds.has(targetId)) continue;
      nodeIds.add(targetId);
      queue.push(targetId);
    }
  }

  return Object.freeze({
    nodeIds: Object.freeze([...nodeIds]),
    edgeIds: Object.freeze([...edgeIds])
  });
}

function layoutForConfigurations(configurations, initialTotal) {
  const byTotal = new Map();
  for (const piles of configurations) {
    const total = totalStones(piles);
    if (!byTotal.has(total)) byTotal.set(total, []);
    byTotal.get(total).push(piles);
  }

  const positions = new Map();
  for (const [total, layer] of byTotal) {
    layer.sort(comparePileVectors);
    const radius = layer.length <= 1
      ? 0
      : Math.max(LAYOUT.stateSpacing, layer.length * LAYOUT.stateSpacing / (2 * Math.PI));

    for (let index = 0; index < layer.length; index += 1) {
      const angle = layer.length <= 1
        ? 0
        : 2 * Math.PI * index / layer.length + total * 0.173;
      positions.set(stateKey(layer[index]), Object.freeze({
        x: radius * Math.cos(angle),
        y: (total - initialTotal / 2) * LAYOUT.layerSpacing,
        z: radius * Math.sin(angle)
      }));
    }
  }
  return positions;
}

function graphNode(piles, turn, basePosition) {
  const total = totalStones(piles);
  const outcome = terminalOutcome(piles, turn);
  const turnOffset = turn === HUMAN_TURN ? -LAYOUT.turnSpacing / 2 : LAYOUT.turnSpacing / 2;
  return Object.freeze({
    id: nodeId(piles, turn),
    stateKey: stateKey(piles),
    piles,
    turn,
    totalStones: total,
    nimSum: nimSum(piles),
    terminal: outcome !== null,
    outcome,
    label: outcome ?? `${piles.join(" · ")} · ${turn}`,
    position: Object.freeze({
      x: basePosition.x + turnOffset,
      y: basePosition.y,
      z: basePosition.z
    })
  });
}

/**
 * Build the complete canonical game graph below an initial position.
 *
 * Every reachable pile configuration is represented once for each side to
 * move. Edges always alternate turns and strictly decrease the stone count.
 * Node-cap overflow is reported as an `ok: false` result instead of throwing,
 * so oversized user input cannot take down the visualizer.
 */
export function buildStateGraph(initialPiles, options = {}) {
  const initial = canonicalizePiles(initialPiles);
  const nodeCap = options.nodeCap ?? DEFAULT_NODE_CAP;
  if (!Number.isSafeInteger(nodeCap) || nodeCap < 1) {
    throw new RangeError("nodeCap must be a positive safe integer");
  }
  const edgeCap = options.edgeCap ?? DEFAULT_EDGE_CAP;
  if (!Number.isSafeInteger(edgeCap) || edgeCap < 0) {
    throw new RangeError("edgeCap must be a nonnegative safe integer");
  }
  const initialTurn = validateTurn(options.initialTurn ?? HUMAN_TURN);

  if (nodeCap < TURNS.length) return nodeCapFailure(initial, nodeCap, edgeCap, 1);

  const configurations = [initial];
  const byKey = new Map([[stateKey(initial), initial]]);
  const transitionMoves = new Map();
  let directedEdgeCount = 0;
  let queueIndex = 0;

  while (queueIndex < configurations.length) {
    const piles = configurations[queueIndex];
    queueIndex += 1;
    const moves = legalMoves(piles);
    transitionMoves.set(stateKey(piles), moves);

    for (const move of moves) {
      if (byKey.has(move.successorKey)) continue;
      const discoveredCount = configurations.length + 1;
      if (discoveredCount * TURNS.length > nodeCap) {
        return nodeCapFailure(initial, nodeCap, edgeCap, discoveredCount);
      }
      byKey.set(move.successorKey, move.successor);
      configurations.push(move.successor);
    }

    const requiredEdgesAtLeast = directedEdgeCount + moves.length * TURNS.length;
    if (requiredEdgesAtLeast > edgeCap) {
      return edgeCapFailure(initial, nodeCap, edgeCap, requiredEdgesAtLeast);
    }
    directedEdgeCount = requiredEdgesAtLeast;
  }

  configurations.sort((first, second) => {
    const totalDifference = totalStones(second) - totalStones(first);
    return totalDifference || comparePileVectors(first, second);
  });

  const positions = layoutForConfigurations(configurations, totalStones(initial));
  const nodes = [];
  for (const piles of configurations) {
    const position = positions.get(stateKey(piles));
    for (const turn of TURNS) nodes.push(graphNode(piles, turn, position));
  }

  const edges = [];
  for (const piles of configurations) {
    const moves = transitionMoves.get(stateKey(piles)) ?? legalMoves(piles);
    for (const turn of TURNS) {
      const nextTurn = oppositeTurn(turn);
      const source = nodeId(piles, turn);
      for (const move of moves) {
        const target = nodeId(move.successor, nextTurn);
        edges.push(Object.freeze({
          id: `edge:${source}->${target}`,
          source,
          target,
          sourceId: source,
          targetId: target,
          fromTurn: turn,
          toTurn: nextTurn,
          move
        }));
      }
    }
  }

  const frozenNodes = Object.freeze(nodes);
  const frozenEdges = Object.freeze(edges);
  const empty = Object.freeze(Array(initial.length).fill(0));
  return Object.freeze({
    ok: true,
    initialPiles: initial,
    initialTurn,
    initialNodeId: nodeId(initial, initialTurn),
    victoryNodeId: nodeId(empty, COMPUTER_TURN),
    defeatNodeId: nodeId(empty, HUMAN_TURN),
    pileCount: initial.length,
    initialStoneCount: totalStones(initial),
    configurationCount: configurations.length,
    nodeCap,
    edgeCap,
    nodes: frozenNodes,
    edges: frozenEdges,
    nodeById: new Map(frozenNodes.map((node) => [node.id, node]))
  });
}

export default Object.freeze({
  HUMAN_TURN,
  COMPUTER_TURN,
  TURNS,
  VICTORY,
  DEFEAT,
  DEFAULT_NODE_CAP,
  NODE_CAP_EXCEEDED,
  DEFAULT_EDGE_CAP,
  EDGE_CAP_EXCEEDED,
  LAYOUT,
  canonicalizePiles,
  stateKey,
  totalStones,
  isTerminalState,
  nimSum,
  nodeId,
  oppositeTurn,
  terminalOutcome,
  directedReachability,
  legalMoves,
  isLegalSuccessor,
  optimalMove,
  buildStateGraph
});
