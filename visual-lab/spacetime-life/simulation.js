(function exposeSpacetimeLife(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpacetimeLife = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSpacetimeLife() {
  "use strict";

  const PATTERNS = {
    glider: [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2]
    ],
    "r-pentomino": [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 1]
    ],
    acorn: [
      [0, 1],
      [1, 3],
      [2, 0],
      [2, 1],
      [2, 4],
      [2, 5],
      [2, 6]
    ],
    pulsar: patternFromRows([
      "..OOO...OOO..",
      ".............",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      "..OOO...OOO..",
      ".............",
      "..OOO...OOO..",
      "O....O.O....O",
      "O....O.O....O",
      "O....O.O....O",
      ".............",
      "..OOO...OOO.."
    ]),
    gosper: [
      [0, 24],
      [1, 22], [1, 24],
      [2, 12], [2, 13], [2, 20], [2, 21], [2, 34], [2, 35],
      [3, 11], [3, 15], [3, 20], [3, 21], [3, 34], [3, 35],
      [4, 0], [4, 1], [4, 10], [4, 16], [4, 20], [4, 21],
      [5, 0], [5, 1], [5, 10], [5, 14], [5, 16], [5, 17], [5, 22], [5, 24],
      [6, 10], [6, 16], [6, 24],
      [7, 11], [7, 15],
      [8, 12], [8, 13]
    ]
  };

  function patternFromRows(rows) {
    const coordinates = [];
    rows.forEach(function readRow(row, rowIndex) {
      for (let column = 0; column < row.length; column += 1) {
        if (row[column] === "O") coordinates.push([rowIndex, column]);
      }
    });
    return coordinates;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function createState(size) {
    return new Uint8Array(size * size);
  }

  function countAlive(state) {
    let total = 0;
    for (let index = 0; index < state.length; index += 1) total += state[index];
    return total;
  }

  function countHistory(history) {
    let total = 0;
    for (let index = 0; index < history.length; index += 1) {
      total += countAlive(history[index].state || history[index]);
    }
    return total;
  }

  function buildNeighborTable(size, wrap) {
    const cellCount = size * size;
    const table = new Int32Array(cellCount * 8);
    let offset = 0;

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
          for (let columnDelta = -1; columnDelta <= 1; columnDelta += 1) {
            if (rowDelta === 0 && columnDelta === 0) continue;

            let neighborRow = row + rowDelta;
            let neighborColumn = column + columnDelta;
            if (wrap) {
              neighborRow = (neighborRow + size) % size;
              neighborColumn = (neighborColumn + size) % size;
              table[offset] = neighborRow * size + neighborColumn;
            } else if (
              neighborRow < 0 ||
              neighborRow >= size ||
              neighborColumn < 0 ||
              neighborColumn >= size
            ) {
              table[offset] = -1;
            } else {
              table[offset] = neighborRow * size + neighborColumn;
            }
            offset += 1;
          }
        }
      }
    }
    return table;
  }

  function step(state, size, wrap, neighborTable) {
    if (!state || state.length !== size * size) {
      throw new RangeError("The state length must equal size squared.");
    }

    const neighbors = neighborTable || buildNeighborTable(size, Boolean(wrap));
    if (neighbors.length !== state.length * 8) {
      throw new RangeError("The neighbor table does not match the state.");
    }

    const next = new Uint8Array(state.length);
    const births = new Uint8Array(state.length);

    for (let cell = 0; cell < state.length; cell += 1) {
      let livingNeighbors = 0;
      const start = cell * 8;
      for (let neighbor = start; neighbor < start + 8; neighbor += 1) {
        const index = neighbors[neighbor];
        if (index >= 0) livingNeighbors += state[index];
      }

      if (state[cell]) {
        next[cell] = livingNeighbors === 2 || livingNeighbors === 3 ? 1 : 0;
      } else if (livingNeighbors === 3) {
        next[cell] = 1;
        births[cell] = 1;
      }
    }

    return { state: next, births: births };
  }

  function boundsForPattern(coordinates) {
    if (!coordinates.length) return { width: 0, height: 0 };
    let maximumRow = 0;
    let maximumColumn = 0;
    coordinates.forEach(function measure(coordinate) {
      maximumRow = Math.max(maximumRow, coordinate[0]);
      maximumColumn = Math.max(maximumColumn, coordinate[1]);
    });
    return { width: maximumColumn + 1, height: maximumRow + 1 };
  }

  function seedPattern(name, size, randomSource) {
    const state = createState(size);
    if (name === "blank") return state;

    if (name === "random") {
      const random = typeof randomSource === "function" ? randomSource : Math.random;
      const margin = Math.max(2, Math.floor(size * 0.12));
      for (let row = margin; row < size - margin; row += 1) {
        for (let column = margin; column < size - margin; column += 1) {
          state[row * size + column] = random() < 0.28 ? 1 : 0;
        }
      }
      return state;
    }

    const coordinates = PATTERNS[name] || PATTERNS.glider;
    const bounds = boundsForPattern(coordinates);
    const rowOffset = Math.floor((size - bounds.height) / 2);
    const columnOffset = Math.floor((size - bounds.width) / 2);

    coordinates.forEach(function place(coordinate) {
      const row = rowOffset + coordinate[0];
      const column = columnOffset + coordinate[1];
      if (row >= 0 && row < size && column >= 0 && column < size) {
        state[row * size + column] = 1;
      }
    });
    return state;
  }

  function minimumSizeForPattern(name) {
    if (name === "gosper") return 40;
    if (name === "pulsar") return 17;
    return 8;
  }

  function statesEqual(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  return {
    PATTERNS: PATTERNS,
    clamp: clamp,
    createState: createState,
    countAlive: countAlive,
    countHistory: countHistory,
    buildNeighborTable: buildNeighborTable,
    step: step,
    seedPattern: seedPattern,
    minimumSizeForPattern: minimumSizeForPattern,
    statesEqual: statesEqual
  };
});
