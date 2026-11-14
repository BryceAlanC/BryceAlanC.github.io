import { PRESETS, samplePeakColumn } from "./model.js?v=20261114-4";

self.addEventListener("message", ({ data: { id, count } }) => {
  try {
    const [min, max] = PRESETS[id].parameterRange;
    const batchSize = 12;
    let columns = [];
    for (let index = 0; index < count; index += 1) {
      const parameter = min + (max - min) * index / (count - 1);
      columns.push(samplePeakColumn(id, parameter));
      if (columns.length === batchSize) {
        self.postMessage({ columns });
        columns = [];
      }
    }
    self.postMessage({ columns, done: true });
  } catch {
    self.postMessage({ error: true });
  }
});
