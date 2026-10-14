import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The site deliberately has no package.json. A data URL lets Node exercise
// the browser ESM module without changing the repository's module mode.
const source = await readFile(new URL("./model.js", import.meta.url), "utf8");
const model = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

// Canonicalization keeps board size, removes pile-order symmetry, and never
// mutates its caller's array.
{
  const input = [1, 0, 3, 2];
  const canonical = model.canonicalizePiles(input);
  assert.deepEqual(canonical, [3, 2, 1, 0]);
  assert.deepEqual(input, [1, 0, 3, 2]);
  assert.equal(canonical.length, input.length);
  assert.throws(() => model.canonicalizePiles([1, -1]), /nonnegative/);
  assert.throws(() => model.canonicalizePiles([1, 1.5]), /integer/);
}

// XOR arithmetic includes values beyond JavaScript's signed 32-bit range.
assert.equal(model.nimSum([3, 4, 5]), 2);
assert.equal(model.nimSum([1, 2, 3]), 0);
assert.equal(model.nimSum([2 ** 40, 2 ** 40, 7]), 7);
assert.equal(model.oppositeTurn(model.HUMAN_TURN), model.COMPUTER_TURN);
assert.equal(model.oppositeTurn(model.COMPUTER_TURN), model.HUMAN_TURN);

// Symmetric piles produce one canonical successor, with every equivalent board
// interaction retained in the metadata.
{
  const moves = model.legalMoves([2, 2]);
  assert.equal(moves.length, 2);
  const toTwoOne = moves.find((move) => model.stateKey(move.successor) === model.stateKey([2, 1]));
  assert.ok(toTwoOne);
  assert.equal(toTwoOne.from, 2);
  assert.equal(toTwoOne.to, 1);
  assert.equal(toTwoOne.removed, 1);
  assert.equal(toTwoOne.pileIndex, 0);
  assert.deepEqual(toTwoOne.pileIndices, [0, 1]);
  assert.deepEqual(toTwoOne.piles, [2, 1]);
  assert.equal(new Set(moves.map((move) => move.successorKey)).size, moves.length);
}

// Legality means reducing exactly one pile by a positive amount, modulo pile
// permutation; invalid user values simply answer false.
assert.equal(model.isLegalSuccessor([3, 2, 1], [3, 1, 1]), true);
assert.equal(model.isLegalSuccessor([3, 2, 1], [2, 2, 1]), true);
assert.equal(model.isLegalSuccessor([3, 2, 1], [2, 2, 0]), false);
assert.equal(model.isLegalSuccessor([2, 2], [1, 1]), false);
assert.equal(model.isLegalSuccessor([2, 1], [2, 1]), false);
assert.equal(model.isLegalSuccessor([2, 1], [2, 1, 0]), false);
assert.equal(model.isLegalSuccessor([2, 1], [2, -1]), false);

// A winning position is sent to XOR zero. A zero-XOR position receives a
// deterministic legal fallback, and a terminal position has no move.
{
  const winning = model.optimalMove([3, 4, 5]);
  assert.ok(winning);
  assert.equal(winning.strategy, "zero-xor");
  assert.equal(winning.winningMove, true);
  assert.equal(model.isLegalSuccessor([3, 4, 5], winning.successor), true);
  assert.equal(model.nimSum(winning.successor), 0);

  const losingFirst = model.optimalMove([1, 2, 3]);
  const losingSecond = model.optimalMove([3, 1, 2]);
  assert.equal(losingFirst.strategy, "deterministic-fallback");
  assert.deepEqual(losingFirst.successor, losingSecond.successor);
  assert.equal(model.isLegalSuccessor([1, 2, 3], losingFirst.successor), true);
  assert.equal(model.optimalMove([0, 0, 0]), null);
}

// [2, 1] reaches five canonical configurations. Duplicating each for both
// sides gives ten nodes; its seven configuration transitions give 14 edges.
{
  const graph = model.buildStateGraph([1, 2]);
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.initialPiles, [2, 1]);
  assert.equal(graph.configurationCount, 5);
  assert.equal(graph.nodes.length, 10);
  assert.equal(graph.edges.length, 14);
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length);
  assert.equal(new Set(graph.edges.map((edge) => edge.id)).size, graph.edges.length);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const tail = byId.get(edge.source);
    const tip = byId.get(edge.target);
    assert.ok(tail && tip);
    assert.notEqual(tail.turn, tip.turn, "every edge must alternate turns");
    assert.ok(tip.totalStones < tail.totalStones, "every edge must remove stones");
    assert.equal(model.isLegalSuccessor(tail.piles, tip.piles), true);
    assert.equal(edge.move.sourceKey, tail.stateKey);
    assert.equal(edge.move.successorKey, tip.stateKey);
  }
}

// A second state-count check catches accidental loss of canonical descendants.
{
  const graph = model.buildStateGraph([2, 2]);
  assert.equal(graph.ok, true);
  assert.equal(graph.configurationCount, 6);
  assert.equal(graph.nodes.length, 12);
}

// The two empty nodes encode outcomes from the human player's perspective.
{
  const graph = model.buildStateGraph([0, 0, 0]);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
  const victory = graph.nodeById.get(graph.victoryNodeId);
  const defeat = graph.nodeById.get(graph.defeatNodeId);
  assert.ok(victory && defeat);
  assert.notEqual(victory.id, defeat.id);
  assert.equal(victory.turn, model.COMPUTER_TURN);
  assert.equal(victory.outcome, model.VICTORY);
  assert.equal(defeat.turn, model.HUMAN_TURN);
  assert.equal(defeat.outcome, model.DEFEAT);
  assert.equal(victory.terminal, true);
  assert.equal(defeat.terminal, true);
  assert.equal(model.terminalOutcome([0, 0, 0], model.COMPUTER_TURN), model.VICTORY);
  assert.equal(model.terminalOutcome([0, 0, 0], model.HUMAN_TURN), model.DEFEAT);
  assert.equal(model.terminalOutcome([1, 0, 0], model.HUMAN_TURN), null);
}

// Oversized graphs produce a structured, non-throwing failure and no partial
// graph. The same graph succeeds when the exact required cap is available.
{
  const capped = model.buildStateGraph([2, 1], { nodeCap: 9 });
  assert.equal(capped.ok, false);
  assert.equal(capped.error.code, model.NODE_CAP_EXCEEDED);
  assert.equal(capped.error.nodeCap, 9);
  assert.ok(capped.error.requiredNodesAtLeast > capped.error.nodeCap);
  assert.deepEqual(capped.nodes, []);
  assert.deepEqual(capped.edges, []);

  const exact = model.buildStateGraph([2, 1], { nodeCap: 10 });
  assert.equal(exact.ok, true);
  assert.equal(exact.nodes.length, 10);
}

// Directed edges have an independent budget. The cap is inclusive, terminal
// graphs work with a zero-edge budget, and overflow never leaks a partial graph.
{
  const capped = model.buildStateGraph([2, 1], { edgeCap: 13 });
  assert.equal(capped.ok, false);
  assert.equal(capped.error.code, model.EDGE_CAP_EXCEEDED);
  assert.equal(capped.error.edgeCap, 13);
  assert.equal(capped.error.requiredEdgesAtLeast, 14);
  assert.ok(capped.error.requiredEdgesAtLeast > capped.error.edgeCap);
  assert.deepEqual(capped.nodes, []);
  assert.deepEqual(capped.edges, []);

  const exact = model.buildStateGraph([2, 1], { edgeCap: 14 });
  assert.equal(exact.ok, true);
  assert.equal(exact.edges.length, 14);
  assert.equal(exact.edgeCap, 14);
  assert.ok(exact.edges.length <= exact.edgeCap);

  const terminal = model.buildStateGraph([0, 0], { edgeCap: 0 });
  assert.equal(terminal.ok, true);
  assert.equal(terminal.edges.length, 0);
  assert.throws(() => model.buildStateGraph([1], { edgeCap: -1 }), /nonnegative/);
}

// Node overflow retains precedence when both limits would reject a graph.
{
  const capped = model.buildStateGraph([2, 1], { nodeCap: 3, edgeCap: 0 });
  assert.equal(capped.ok, false);
  assert.equal(capped.error.code, model.NODE_CAP_EXCEEDED);
  assert.equal(capped.nodeCap, 3);
  assert.equal(capped.edgeCap, 0);
}

// Layout is finite, deterministic, layered by stone count, and separates the
// two sides to move without changing their layer coordinates.
{
  const first = model.buildStateGraph([3, 2, 1]);
  const second = model.buildStateGraph([3, 2, 1]);
  assert.equal(first.ok, true);
  assert.deepEqual(
    first.nodes.map((node) => [node.id, node.position]),
    second.nodes.map((node) => [node.id, node.position])
  );
  for (const node of first.nodes) {
    assert.ok(Object.values(node.position).every(Number.isFinite));
  }

  const groups = new Map();
  for (const node of first.nodes) {
    const key = `${node.stateKey}:${node.totalStones}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  for (const pair of groups.values()) {
    assert.equal(pair.length, 2);
    assert.equal(pair[0].position.y, pair[1].position.y);
    assert.equal(pair[0].position.z, pair[1].position.z);
    assert.notEqual(pair[0].position.x, pair[1].position.x);
  }

  const yByTotal = new Map();
  for (const node of first.nodes) {
    if (!yByTotal.has(node.totalStones)) yByTotal.set(node.totalStones, node.position.y);
    assert.equal(node.position.y, yByTotal.get(node.totalStones));
  }
  assert.equal(new Set(yByTotal.values()).size, yByTotal.size);
}

assert.equal(model.default.buildStateGraph, model.buildStateGraph);
assert.equal(model.default.optimalMove, model.optimalMove);

console.log("nim-state-graph model tests passed");
