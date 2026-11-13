import { buildSpectrum, createCustomPreset, cyclesAt, sampleBranches } from "./model.js?v=20261113-4";

let family;

self.onmessage = ({ data }) => {
  try {
    if (data.definition) {
      const { expression1, expression2, options } = data.definition;
      family = createCustomPreset(expression1, expression2, options);
    }
    if (data.type === "branches") {
      const branchDiagram = sampleBranches(family, { samples: 141 });
      self.postMessage({ type: "branches", branchDiagram, spectrum: buildSpectrum(family, branchDiagram) });
    } else if (data.type === "slice") {
      self.postMessage({ type: "slice", parameter: data.parameter, cycles: cyclesAt(family, data.parameter) });
    }
  } catch {
    self.postMessage({ type: "error" });
  }
};
