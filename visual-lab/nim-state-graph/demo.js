import {
  HUMAN_TURN,
  COMPUTER_TURN,
  VICTORY,
  DEFEAT,
  DEFAULT_NODE_CAP,
  DEFAULT_EDGE_CAP,
  canonicalizePiles,
  stateKey,
  totalStones,
  isTerminalState,
  nimSum,
  nodeId,
  legalMoves,
  optimalMove,
  buildStateGraph
} from "./model.js?v=20261014-1";
import { createNimGraphRenderer } from "./graph-renderer.js?v=20261014-1";

const GRAPH_NODE_CAP = Math.min(DEFAULT_NODE_CAP, 1400);
const GRAPH_EDGE_CAP = Math.min(DEFAULT_EDGE_CAP, 9000);
const MIN_PILES = 1;
const MAX_PILES = 6;
const MIN_PILE_SIZE = 1;
const MAX_PILE_SIZE = 12;

const elements = {
  workspace: document.getElementById("nim-workspace"),
  preset: document.getElementById("nim-preset"),
  pileEditors: document.getElementById("nim-pile-editors"),
  addPile: document.getElementById("nim-add-pile"),
  start: document.getElementById("nim-start"),
  restart: document.getElementById("nim-restart"),
  undo: document.getElementById("nim-undo"),
  setupFeedback: document.getElementById("nim-setup-feedback"),
  position: document.getElementById("nim-position"),
  movePreview: document.getElementById("nim-move-preview"),
  legalMoves: document.getElementById("nim-legal-moves"),
  makeMove: document.getElementById("nim-make-move"),
  moveLog: document.getElementById("nim-move-log"),
  moveCount: document.getElementById("nim-move-count"),
  turnChip: document.getElementById("nim-turn-chip"),
  graphPanel: document.getElementById("nim-graph-viewport"),
  graphRenderer: document.getElementById("nim-graph-renderer"),
  graphTooltip: document.getElementById("nim-graph-tooltip"),
  graphFallback: document.getElementById("nim-graph-fallback"),
  graphStatus: document.getElementById("nim-graph-status"),
  resetView: document.getElementById("nim-reset-view"),
  fitView: document.getElementById("nim-fit-view"),
  fullscreen: document.getElementById("nim-fullscreen"),
  turn: document.getElementById("nim-turn"),
  total: document.getElementById("nim-total"),
  sum: document.getElementById("nim-sum"),
  positionClass: document.getElementById("nim-class"),
  graphSize: document.getElementById("nim-graph-size"),
  announcer: document.getElementById("nim-announcer")
};

const game = {
  initialPiles: [3, 4, 5],
  piles: [3, 4, 5],
  firstTurn: HUMAN_TURN,
  turn: HUMAN_TURN,
  outcome: null,
  graph: null,
  renderer: null,
  locked: false,
  timer: 0,
  epoch: 0,
  roundHistory: [],
  moveLog: [],
  pathEdgeIds: [],
  lastEdgeId: null,
  previewId: null,
  restoreMoveFocus: false,
  resizeObserver: null
};

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function announce(message) {
  elements.announcer.textContent = "";
  window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 10);
}

function firstTurnFromControls() {
  return document.querySelector('input[name="nim-first"]:checked')?.value === COMPUTER_TURN
    ? COMPUTER_TURN
    : HUMAN_TURN;
}

function setFirstTurnControl(turn) {
  const input = document.querySelector(`input[name="nim-first"][value="${turn}"]`);
  if (input) input.checked = true;
}

function setSetupFeedback(message, error = false) {
  elements.setupFeedback.textContent = message;
  elements.setupFeedback.classList.toggle("is-error", error);
}

function setPileEditors(piles) {
  elements.pileEditors.replaceChildren();
  piles.forEach((pile, index) => {
    const row = document.createElement("div");
    row.className = "pile-editor";

    const label = document.createElement("label");
    label.htmlFor = `nim-pile-${index}`;
    label.textContent = `Pile ${index + 1}`;

    const input = document.createElement("input");
    input.id = `nim-pile-${index}`;
    input.className = "nim-pile-input";
    input.type = "number";
    input.inputMode = "numeric";
    input.min = String(MIN_PILE_SIZE);
    input.max = String(MAX_PILE_SIZE);
    input.step = "1";
    input.value = String(pile);
    input.setAttribute("aria-label", `Starting size of pile ${index + 1}`);
    input.addEventListener("input", markCustomSetup);

    const remove = document.createElement("button");
    remove.className = "pile-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.disabled = piles.length <= MIN_PILES;
    remove.setAttribute("aria-label", `Remove pile ${index + 1}`);
    remove.addEventListener("click", () => {
      const next = readDraftPiles({ allowInvalid: true });
      next.splice(index, 1);
      setPileEditors(next.length ? next : [1]);
      elements.preset.value = "custom";
      setSetupFeedback("Custom setup ready. Start a new game to rebuild the graph.");
    });

    row.append(label, input, remove);
    elements.pileEditors.append(row);
  });
  elements.addPile.disabled = piles.length >= MAX_PILES;
}

function readDraftPiles({ allowInvalid = false } = {}) {
  const inputs = [...elements.pileEditors.querySelectorAll(".nim-pile-input")];
  const piles = inputs.map((input) => Number(input.value));
  if (allowInvalid) {
    return piles.map((pile) => Number.isFinite(pile) ? Math.round(pile) : 1);
  }
  if (piles.length < MIN_PILES || piles.length > MAX_PILES) {
    throw new RangeError(`Choose between ${MIN_PILES} and ${MAX_PILES} piles.`);
  }
  piles.forEach((pile, index) => {
    if (!Number.isInteger(pile) || pile < MIN_PILE_SIZE || pile > MAX_PILE_SIZE) {
      throw new RangeError(`Pile ${index + 1} must be a whole number from ${MIN_PILE_SIZE} to ${MAX_PILE_SIZE}.`);
    }
  });
  return piles;
}

function markCustomSetup() {
  elements.preset.value = "custom";
  setSetupFeedback("Custom setup ready. Start a new game to rebuild the graph.");
}

function currentNodeId() {
  return nodeId(game.piles, game.turn);
}

function edgeId(sourceId, targetId) {
  return `edge:${sourceId}->${targetId}`;
}

function boardMoveTo(targetPiles) {
  const targetKey = stateKey(targetPiles);
  for (let pileIndex = 0; pileIndex < game.piles.length; pileIndex += 1) {
    const from = game.piles[pileIndex];
    for (let to = from - 1; to >= 0; to -= 1) {
      const candidate = [...game.piles];
      candidate[pileIndex] = to;
      if (stateKey(candidate) === targetKey) {
        return { pileIndex, from, to, removed: from - to, successor: canonicalizePiles(candidate) };
      }
    }
  }
  return null;
}

function legalBoardMoves() {
  if (game.outcome || game.turn !== HUMAN_TURN || game.locked) return [];
  return legalMoves(game.piles)
    .map((move) => ({ modelMove: move, boardMove: boardMoveTo(move.successor) }))
    .filter((entry) => entry.boardMove);
}

function nodeTooltipText(node) {
  if (node.outcome === VICTORY) return "Victory · you took the final counter";
  if (node.outcome === DEFEAT) return "Defeat · the computer took the final counter";
  const mover = node.turn === HUMAN_TURN ? "your turn" : "computer turn";
  const classification = node.nimSum === 0 ? "losing for the mover" : "winning for the mover";
  return `[${node.piles.join(", ")}] · ${mover} · nim-sum ${node.nimSum} · ${classification}`;
}

function clearBoardPreview() {
  elements.position.querySelectorAll(".nim-stone.is-remove").forEach((stone) => {
    stone.classList.remove("is-remove");
  });
  game.previewId = null;
  updateGraphHighlights();
  if (game.outcome === VICTORY) {
    elements.movePreview.textContent = "You reached the Victory node by taking the final counter.";
  } else if (game.outcome === DEFEAT) {
    elements.movePreview.textContent = "The computer reached the Defeat node by taking the final counter.";
  } else if (game.locked || game.turn === COMPUTER_TURN) {
    elements.movePreview.textContent = "The computer is choosing an optimal outgoing edge…";
  } else {
    elements.movePreview.textContent = "Choose a counter to remove it and every counter to its right.";
  }
}

function showBoardPreview(pileIndex, to, targetPiles = null) {
  elements.position.querySelectorAll(".nim-stone").forEach((stone) => {
    const samePile = Number(stone.dataset.pileIndex) === pileIndex;
    const removed = Number(stone.dataset.leave) >= to;
    stone.classList.toggle("is-remove", samePile && removed);
  });
  const from = game.piles[pileIndex];
  const removed = from - to;
  elements.movePreview.textContent = `Take ${removed} from pile ${pileIndex + 1}, leaving ${to}.`;
  const candidate = [...game.piles];
  candidate[pileIndex] = to;
  game.previewId = nodeId(targetPiles || candidate, COMPUTER_TURN);
  updateGraphHighlights();
}

function renderBoard() {
  elements.position.replaceChildren();
  const disabled = game.locked || game.turn !== HUMAN_TURN || Boolean(game.outcome);

  game.piles.forEach((pile, pileIndex) => {
    const row = document.createElement("div");
    row.className = "nim-pile-row";

    const label = document.createElement("span");
    label.className = "nim-pile-label";
    label.textContent = `P${pileIndex + 1}`;

    const stones = document.createElement("div");
    stones.className = "nim-stones";
    stones.setAttribute("aria-label", `Pile ${pileIndex + 1}, ${pile} counters`);

    if (pile === 0) {
      const empty = document.createElement("span");
      empty.className = "empty-pile";
      empty.textContent = "empty";
      stones.append(empty);
    } else {
      for (let index = 0; index < pile; index += 1) {
        const removed = pile - index;
        const stone = document.createElement("button");
        stone.className = "nim-stone";
        stone.type = "button";
        stone.disabled = disabled;
        stone.dataset.pileIndex = String(pileIndex);
        stone.dataset.leave = String(index);
        stone.setAttribute(
          "aria-label",
          `Take ${removed} counter${removed === 1 ? "" : "s"} from pile ${pileIndex + 1}, leaving ${index}`
        );
        stone.addEventListener("pointerenter", () => showBoardPreview(pileIndex, index));
        stone.addEventListener("focus", () => showBoardPreview(pileIndex, index));
        stone.addEventListener("blur", () => {
          window.setTimeout(() => {
            if (!stones.contains(document.activeElement)) clearBoardPreview();
          }, 0);
        });
        stone.addEventListener("click", () => commitHumanMove(pileIndex, index, "board"));
        stones.append(stone);
      }
    }

    stones.addEventListener("pointerleave", () => {
      if (!stones.contains(document.activeElement)) clearBoardPreview();
    });
    const count = document.createElement("span");
    count.className = "nim-pile-count";
    count.textContent = String(pile);
    row.append(label, stones, count);
    elements.position.append(row);
  });
}

function renderLegalMoves() {
  const moves = legalBoardMoves();
  elements.legalMoves.replaceChildren();
  if (!moves.length) {
    const option = document.createElement("option");
    option.textContent = game.outcome ? "Game complete" : game.turn === COMPUTER_TURN ? "Computer is moving" : "No legal moves";
    option.value = "";
    elements.legalMoves.append(option);
  } else {
    moves.forEach(({ modelMove, boardMove }, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `Take ${boardMove.removed} from pile ${boardMove.pileIndex + 1} → [${modelMove.successor.join(", ")}]`;
      elements.legalMoves.append(option);
    });
  }
  elements.legalMoves.disabled = !moves.length;
  elements.makeMove.disabled = !moves.length;
}

function renderMoveLog() {
  elements.moveLog.replaceChildren();
  if (!game.moveLog.length) {
    const placeholder = document.createElement("li");
    placeholder.className = "is-placeholder";
    placeholder.textContent = "The first move will appear here.";
    elements.moveLog.append(placeholder);
  } else {
    game.moveLog.forEach((move) => {
      const item = document.createElement("li");
      const actor = move.actor === HUMAN_TURN ? "You" : "Computer";
      item.textContent = `${actor} took ${move.removed} from pile ${move.pileIndex + 1} · nim-sum ${move.nimSumAfter}`;
      elements.moveLog.append(item);
    });
    elements.moveLog.lastElementChild?.scrollIntoView({ block: "nearest" });
  }
  elements.moveCount.textContent = `${game.moveLog.length} move${game.moveLog.length === 1 ? "" : "s"}`;
}

function renderStatus() {
  const sum = nimSum(game.piles);
  const total = totalStones(game.piles);
  const mover = game.turn === HUMAN_TURN ? "You" : "Computer";
  let chip = game.turn === HUMAN_TURN ? "Your turn" : "Computer turn";
  let positionClass = sum === 0 ? "Losing for mover" : "Winning for mover";
  if (game.outcome === VICTORY) {
    chip = "Victory";
    positionClass = "You won";
  } else if (game.outcome === DEFEAT) {
    chip = "Defeat";
    positionClass = "Computer won";
  }
  elements.turnChip.textContent = chip;
  elements.turnChip.classList.toggle("is-computer", game.turn === COMPUTER_TURN && !game.outcome);
  elements.turnChip.classList.toggle("is-finished", Boolean(game.outcome));
  elements.turn.textContent = game.outcome ? "Finished" : mover;
  elements.total.textContent = String(total);
  elements.sum.textContent = String(sum);
  elements.positionClass.textContent = positionClass;
  elements.undo.disabled = game.roundHistory.length === 0;

  if (game.graph?.ok) {
    elements.graphSize.textContent = `${game.graph.nodes.length} nodes`;
    const rendererName = !game.renderer
      ? "Unavailable"
      : game.renderer.rendererType === "webgl" ? "WebGL" : "Canvas";
    elements.graphStatus.textContent = `${game.graph.nodes.length} nodes · ${game.graph.edges.length} directed moves · ${rendererName}`;
    const current = canonicalizePiles(game.piles);
    const legalCount = game.turn === HUMAN_TURN && !game.outcome ? legalMoves(game.piles).length : 0;
    elements.graphRenderer.setAttribute(
      "aria-label",
      `Complete directed Nim state graph with ${game.graph.nodes.length} nodes and ${game.graph.edges.length} edges. ` +
      `Current node [${current.join(", ")}], ${game.outcome ? positionClass : `${mover.toLowerCase()} to move`}, ` +
      `nim-sum ${sum}, ${legalCount} legal player moves. Distinct Victory and Defeat terminal nodes are shown.`
    );
  }
}

function updateGraphHighlights() {
  if (!game.renderer || !game.graph?.ok) return;
  const legalIds = game.turn === HUMAN_TURN && !game.locked && !game.outcome
    ? legalMoves(game.piles).map((move) => nodeId(move.successor, COMPUTER_TURN))
    : [];
  game.renderer.setHighlights({
    currentId: currentNodeId(),
    legalIds,
    pathEdgeIds: game.pathEdgeIds,
    lastEdgeId: game.lastEdgeId,
    previewId: game.previewId
  });
}

function render() {
  renderBoard();
  renderLegalMoves();
  renderMoveLog();
  renderStatus();
  updateGraphHighlights();
  clearBoardPreview();
}

function snapshotRound() {
  game.roundHistory.push({
    piles: [...game.piles],
    turn: game.turn,
    outcome: game.outcome,
    moveLogLength: game.moveLog.length,
    pathLength: game.pathEdgeIds.length,
    lastEdgeId: game.lastEdgeId
  });
}

function recordTransition(sourceId, targetId) {
  const traversed = edgeId(sourceId, targetId);
  game.lastEdgeId = traversed;
  game.pathEdgeIds.push(traversed);
  return traversed;
}

function addMoveLog(actor, pileIndex, from, to, beforeSum) {
  game.moveLog.push({
    actor,
    pileIndex,
    from,
    to,
    removed: from - to,
    nimSumBefore: beforeSum,
    nimSumAfter: nimSum(game.piles)
  });
}

function finishIfTerminal(turn) {
  if (!isTerminalState(game.piles)) return false;
  game.turn = turn;
  game.locked = false;
  game.outcome = turn === COMPUTER_TURN ? VICTORY : DEFEAT;
  return true;
}

function commitHumanMove(pileIndex, to, source) {
  if (game.locked || game.turn !== HUMAN_TURN || game.outcome) {
    announce("Wait until it is your turn.");
    return;
  }
  game.restoreMoveFocus = elements.position.contains(document.activeElement) || document.activeElement === elements.makeMove;
  const from = game.piles[pileIndex];
  if (!Number.isInteger(to) || !Number.isInteger(from) || to < 0 || to >= from) {
    announce("That is not a legal Nim move.");
    return;
  }

  snapshotRound();
  const sourceId = currentNodeId();
  const beforeSum = nimSum(game.piles);
  game.piles[pileIndex] = to;
  game.turn = COMPUTER_TURN;
  const targetId = currentNodeId();
  recordTransition(sourceId, targetId);
  addMoveLog(HUMAN_TURN, pileIndex, from, to, beforeSum);
  game.previewId = null;

  if (finishIfTerminal(COMPUTER_TURN)) {
    render();
    game.renderer?.pulse();
    if (game.restoreMoveFocus) elements.restart.focus();
    game.restoreMoveFocus = false;
    announce(`Victory. You took the final ${from - to} counter${from - to === 1 ? "" : "s"}.`);
    return;
  }

  game.locked = true;
  render();
  game.renderer?.pulse();
  const moveMessage = `You took ${from - to} from pile ${pileIndex + 1}${source === "graph" ? " through the graph" : ""}. Computer turn.`;
  announce(moveMessage);
  scheduleComputerMove();
}

function scheduleComputerMove() {
  window.clearTimeout(game.timer);
  const epoch = game.epoch;
  const delay = prefersReducedMotion() ? 180 : 650;
  game.timer = window.setTimeout(() => {
    if (epoch !== game.epoch || game.turn !== COMPUTER_TURN || game.outcome) return;
    makeComputerMove();
  }, delay);
}

function makeComputerMove() {
  const chosen = optimalMove(game.piles);
  if (!chosen) {
    finishIfTerminal(HUMAN_TURN);
    render();
    return;
  }
  const boardMove = boardMoveTo(chosen.successor);
  if (!boardMove) {
    game.locked = false;
    render();
    announce("The computer could not map its graph edge to the board.");
    return;
  }

  const sourceId = currentNodeId();
  const beforeSum = nimSum(game.piles);
  game.piles[boardMove.pileIndex] = boardMove.to;
  game.turn = HUMAN_TURN;
  const targetId = currentNodeId();
  recordTransition(sourceId, targetId);
  addMoveLog(COMPUTER_TURN, boardMove.pileIndex, boardMove.from, boardMove.to, beforeSum);
  game.locked = false;

  const finished = finishIfTerminal(HUMAN_TURN);
  render();
  game.renderer?.pulse();
  if (finished) {
    if (game.restoreMoveFocus) elements.restart.focus();
    game.restoreMoveFocus = false;
    announce(`Defeat. The computer took the final ${boardMove.removed} counter${boardMove.removed === 1 ? "" : "s"}.`);
    return;
  }
  const strategy = chosen.winningMove
    ? "and returned the nim-sum to zero"
    : "from a zero nim-sum, where no forced win existed";
  announce(`Computer took ${boardMove.removed} from pile ${boardMove.pileIndex + 1} ${strategy}. Your turn.`);
  if (game.restoreMoveFocus) elements.legalMoves.focus();
  game.restoreMoveFocus = false;
}

function startGame(piles, firstTurn, { announceStart = true } = {}) {
  const candidate = buildStateGraph(piles, {
    nodeCap: GRAPH_NODE_CAP,
    edgeCap: GRAPH_EDGE_CAP,
    initialTurn: firstTurn
  });
  if (!candidate.ok) {
    setSetupFeedback(candidate.error.message, true);
    announce(candidate.error.message);
    return false;
  }

  window.clearTimeout(game.timer);
  game.epoch += 1;
  game.initialPiles = [...piles];
  game.piles = [...piles];
  game.firstTurn = firstTurn;
  game.turn = firstTurn;
  game.outcome = null;
  game.graph = candidate;
  game.locked = firstTurn === COMPUTER_TURN;
  game.roundHistory = [];
  game.moveLog = [];
  game.pathEdgeIds = [];
  game.lastEdgeId = null;
  game.previewId = null;
  game.restoreMoveFocus = false;
  game.renderer?.setGraph(candidate);
  setSetupFeedback(`${candidate.nodes.length} state-turn nodes and ${candidate.edges.length} directed moves · complete graph.`);
  render();
  game.renderer?.resetView();

  if (firstTurn === COMPUTER_TURN) scheduleComputerMove();
  if (announceStart) {
    announce(`New Nim game with piles ${piles.join(", ")}. ${firstTurn === HUMAN_TURN ? "You move first." : "Computer moves first."}`);
  }
  return true;
}

function undoRound() {
  const snapshot = game.roundHistory.pop();
  if (!snapshot) return;
  window.clearTimeout(game.timer);
  game.epoch += 1;
  game.piles = [...snapshot.piles];
  game.turn = snapshot.turn;
  game.outcome = snapshot.outcome;
  game.locked = false;
  game.moveLog.splice(snapshot.moveLogLength);
  game.pathEdgeIds.splice(snapshot.pathLength);
  game.lastEdgeId = snapshot.lastEdgeId;
  game.previewId = null;
  render();
  announce("Undid the previous player-and-computer round.");
}

function onGraphNodeClick(node) {
  if (game.outcome) {
    announce("The game is finished. Restart or choose a new starting position.");
    return;
  }
  if (game.locked || game.turn !== HUMAN_TURN) {
    announce("The computer is moving. Choose a node when it is your turn.");
    return;
  }
  if (node.id === currentNodeId()) {
    announce("That is the current state. Choose one of its glowing neighbors.");
    return;
  }
  const legal = legalMoves(game.piles).find((move) => node.id === nodeId(move.successor, COMPUTER_TURN));
  if (!legal) {
    announce("That node is not reachable in one move. Choose a glowing neighbor.");
    return;
  }
  const move = boardMoveTo(legal.successor);
  if (!move) {
    announce("That graph move could not be matched to a pile.");
    return;
  }
  commitHumanMove(move.pileIndex, move.to, "graph");
}

function onGraphNodeHover(node) {
  if (!node) {
    elements.graphTooltip.hidden = true;
    clearBoardPreview();
    return;
  }
  elements.graphTooltip.hidden = false;
  elements.graphTooltip.textContent = nodeTooltipText(node);
  const legal = game.turn === HUMAN_TURN && !game.locked && !game.outcome
    ? legalMoves(game.piles).find((move) => node.id === nodeId(move.successor, COMPUTER_TURN))
    : null;
  if (legal) {
    const move = boardMoveTo(legal.successor);
    if (move) showBoardPreview(move.pileIndex, move.to, legal.successor);
  } else {
    clearBoardPreview();
  }
}

function resizeGraph() {
  if (!game.renderer) return;
  game.renderer.resize(elements.graphPanel.clientWidth, elements.graphPanel.clientHeight);
}

function bindControls() {
  elements.preset.addEventListener("change", () => {
    if (elements.preset.value === "custom") return;
    setPileEditors(elements.preset.value.split(",").map(Number));
    setSetupFeedback("Preset loaded. Start a new game to rebuild the graph.");
  });

  elements.addPile.addEventListener("click", () => {
    const piles = readDraftPiles({ allowInvalid: true });
    if (piles.length >= MAX_PILES) return;
    piles.push(Math.max(1, piles.at(-1) || 1));
    setPileEditors(piles);
    elements.preset.value = "custom";
    setSetupFeedback("Pile added. Start a new game to rebuild the graph.");
  });

  elements.start.addEventListener("click", () => {
    try {
      startGame(readDraftPiles(), firstTurnFromControls());
    } catch (error) {
      setSetupFeedback(error.message, true);
      announce(error.message);
    }
  });

  elements.restart.addEventListener("click", () => {
    setPileEditors(game.initialPiles);
    setFirstTurnControl(game.firstTurn);
    startGame(game.initialPiles, game.firstTurn);
  });
  elements.undo.addEventListener("click", undoRound);
  elements.makeMove.addEventListener("click", () => {
    const moves = legalBoardMoves();
    const selected = moves[Number(elements.legalMoves.value) || 0];
    if (selected) commitHumanMove(selected.boardMove.pileIndex, selected.boardMove.to, "move list");
  });
  elements.legalMoves.addEventListener("change", () => {
    const moves = legalBoardMoves();
    const selected = moves[Number(elements.legalMoves.value) || 0];
    if (selected) showBoardPreview(selected.boardMove.pileIndex, selected.boardMove.to, selected.modelMove.successor);
  });

  elements.resetView.addEventListener("click", () => game.renderer?.resetView());
  elements.fitView.addEventListener("click", () => game.renderer?.fitView?.(350));
  elements.fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === elements.workspace) await document.exitFullscreen();
      else await elements.workspace.requestFullscreen();
    } catch (error) {
      announce("Fullscreen is unavailable in this browser.");
      window.console.warn(error);
    }
  });
  document.addEventListener("fullscreenchange", () => {
    elements.fullscreen.textContent = document.fullscreenElement === elements.workspace ? "Exit fullscreen" : "Fullscreen";
    window.requestAnimationFrame(resizeGraph);
  });
  if (!elements.workspace.requestFullscreen) elements.fullscreen.hidden = true;
}

async function initialize() {
  if (document.readyState === "loading") {
    await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  if (typeof window.ForceGraph3D !== "function" && document.readyState !== "complete") {
    await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  }

  setPileEditors(game.initialPiles);
  bindControls();
  try {
    game.renderer = createNimGraphRenderer(elements.graphRenderer, {
      onNodeClick: onGraphNodeClick,
      onNodeHover: onGraphNodeHover
    });
    elements.graphFallback.hidden = true;
  } catch (error) {
    game.renderer = null;
    elements.graphRenderer.hidden = true;
    elements.graphFallback.hidden = false;
    elements.graphFallback.textContent = "The 3D graph could not start, but the Nim board remains playable.";
    window.console.error(error);
  }

  if (game.renderer && typeof ResizeObserver === "function") {
    game.resizeObserver = new ResizeObserver(resizeGraph);
    game.resizeObserver.observe(elements.graphPanel);
  } else {
    window.addEventListener("resize", resizeGraph);
  }
  startGame(game.initialPiles, game.firstTurn, { announceStart: false });
  window.requestAnimationFrame(resizeGraph);
}

initialize();
