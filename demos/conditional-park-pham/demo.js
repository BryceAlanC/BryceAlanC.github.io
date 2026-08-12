(() => {
  "use strict";

  const elements = ["a", "b", "c", "d"];
  const levels = [[0], [1, 2, 4, 8], [3, 5, 6, 9, 10, 12], [7, 11, 13, 14], [15]];
  const descriptions = {
    harris: {
      kicker: "Increasing condition",
      title: "At least three elements are present.",
      body: "Both F and B are increasing, so Harris correlation supplies the nonnegative surplus.",
      predicate: (mask) => popcount(mask) >= 3,
    },
    independent: {
      kicker: "Nonmonotone condition",
      title: "The parity on {c,d} is even.",
      body: "B depends only on c and d, while F depends only on a and b. The events are independent even though B is not increasing.",
      predicate: (mask) => popcount(mask & 12) % 2 === 0,
    },
    unfavorable: {
      kicker: "Unfavorable condition",
      title: "At most two elements are present.",
      body: "This condition works against the increasing event F, making the correlation surplus negative.",
      predicate: (mask) => popcount(mask) <= 2,
    },
  };

  const pSlider = document.querySelector("#p-slider");
  const pValue = document.querySelector("#p-value");
  const latticeEdges = document.querySelector("#lattice-edges");
  const latticeNodes = document.querySelector("#lattice-nodes");
  const tableBody = document.querySelector("#outcome-table");
  const presetButtons = [...document.querySelectorAll("[data-preset]")];
  const numberTargets = {
    muF: document.querySelector("#mu-f"),
    muB: document.querySelector("#mu-b"),
    muFB: document.querySelector("#mu-fb"),
    conditional: document.querySelector("#conditional"),
    delta: document.querySelector("#delta"),
  };
  const status = document.querySelector("#transfer-status");
  const statusMark = status.querySelector(".status-mark");
  const statusStrong = status.querySelector("strong");
  const statusParagraph = status.querySelector("p");
  let preset = "harris";
  const positions = new Map();
  const nodeElements = new Map();

  levels.forEach((level, rank) => {
    level.forEach((mask, index) => {
      positions.set(mask, {
        x: 92 + ((index + 1) * 730) / (level.length + 1),
        y: 454 - rank * 102,
      });
    });
  });

  for (let mask = 0; mask < 16; mask += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      if (mask & (1 << bit)) continue;
      const upper = mask | (1 << bit);
      const start = positions.get(mask);
      const end = positions.get(upper);
      latticeEdges.append(svg("line", {
        class: "lattice-edge",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      }));
    }
  }

  levels.forEach((level, rank) => {
    const rankLabel = svg("text", { class: "rank-label", x: 14, y: 459 - rank * 102 });
    rankLabel.textContent = `rank ${rank}`;
    latticeNodes.append(rankLabel);
    level.forEach((mask) => {
      const point = positions.get(mask);
      const group = svg("g", { class: "outcome-node", transform: `translate(${point.x} ${point.y})`, tabindex: "0" });
      const circle = svg("circle", { r: "12" });
      const label = svg("text", { y: "4" });
      label.textContent = subsetLabel(mask);
      const title = svg("title");
      group.append(circle, label, title);
      latticeNodes.append(group);
      nodeElements.set(mask, { group, circle, title });
    });
  });

  pSlider.addEventListener("input", update);
  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      preset = button.dataset.preset;
      presetButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      update();
    });
  });

  function update() {
    const p = Number(pSlider.value);
    const condition = descriptions[preset];
    let muF = 0;
    let muB = 0;
    let muFB = 0;
    const tableRows = [];

    pValue.textContent = p.toFixed(2);
    document.querySelector("#condition-kicker").textContent = condition.kicker;
    document.querySelector("#condition-title").textContent = condition.title;
    document.querySelector("#condition-body").textContent = condition.body;

    for (let mask = 0; mask < 16; mask += 1) {
      const rank = popcount(mask);
      const mass = p ** rank * (1 - p) ** (4 - rank);
      const inF = (mask & 3) === 3;
      const inB = condition.predicate(mask);
      if (inF) muF += mass;
      if (inB) muB += mass;
      if (inF && inB) muFB += mass;

      const node = nodeElements.get(mask);
      node.group.setAttribute("class", ["outcome-node", inF ? "in-f" : "", inB ? "in-b" : "", inF && inB ? "in-both" : ""].filter(Boolean).join(" "));
      node.circle.setAttribute("r", Math.sqrt(64 + 4700 * mass).toFixed(2));
      node.title.textContent = `${subsetLongLabel(mask)}; exact mass ${mass.toFixed(6)}; ${inF ? "in F" : "not in F"}; ${inB ? "in B" : "not in B"}`;
      tableRows.push(`<tr><td>${escapeHtml(subsetLongLabel(mask))}</td><td>${rank}</td><td>${mass.toFixed(6)}</td><td>${inF ? "yes" : "no"}</td><td>${inB ? "yes" : "no"}</td></tr>`);
    }

    const conditional = muFB / muB;
    const delta = muFB - muF * muB;
    numberTargets.muF.textContent = muF.toFixed(4);
    numberTargets.muB.textContent = muB.toFixed(4);
    numberTargets.muFB.textContent = muFB.toFixed(4);
    numberTargets.conditional.textContent = conditional.toFixed(4);
    numberTargets.delta.textContent = signed(delta, 6);
    numberTargets.delta.style.color = delta < -1e-10 ? "var(--red)" : delta > 1e-10 ? "var(--teal)" : "var(--blue)";
    tableBody.innerHTML = tableRows.join("");

    status.classList.remove("positive", "negative", "equal");
    if (delta > 1e-10) {
      status.classList.add("positive");
      statusMark.textContent = "✓";
      statusStrong.textContent = "Conditional transfer holds here.";
      statusParagraph.innerHTML = "P(F|B) &gt; μ<sub>p</sub>(F).";
    } else if (delta < -1e-10) {
      status.classList.add("negative");
      statusMark.textContent = "×";
      statusStrong.textContent = "The transfer hypothesis fails here.";
      statusParagraph.innerHTML = "P(F|B) &lt; μ<sub>p</sub>(F).";
    } else {
      status.classList.add("equal");
      statusMark.textContent = "=";
      statusStrong.textContent = "Conditioning changes nothing here.";
      statusParagraph.innerHTML = "P(F|B) = μ<sub>p</sub>(F).";
    }
    postHeight();
  }

  function popcount(mask) {
    let count = 0;
    for (let value = mask; value; value &= value - 1) count += 1;
    return count;
  }

  function subsetLabel(mask) {
    if (mask === 0) return "∅";
    return elements.filter((_, index) => mask & (1 << index)).join("");
  }

  function subsetLongLabel(mask) {
    return mask === 0 ? "∅" : `{${elements.filter((_, index) => mask & (1 << index)).join(",")}}`;
  }

  function svg(tag, attrs = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function signed(value, digits) {
    const rounded = Math.abs(value) < 10 ** (-(digits + 1)) ? 0 : value;
    return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
  }

  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function postHeight() {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "paper-concept-demo-height", height: document.documentElement.scrollHeight }, window.location.origin);
  }

  update();
  window.addEventListener("load", postHeight);
  if ("ResizeObserver" in window) new ResizeObserver(postHeight).observe(document.body);
})();
