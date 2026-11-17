const format = value => String(Number(value.toPrecision(4)));

function coordinateAt(samples, axis, time) {
  if (!samples?.length || time > samples.at(-1).t) return null;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].t <= time) low = middle;
    else high = middle;
  }
  const a = samples[low], b = samples[high];
  const fraction = b.t === a.t ? 0 : (time - a.t) / (b.t - a.t);
  return a[axis] + fraction * (b[axis] - a[axis]);
}

export function attachTimeTrace(panel, seek) {
  const canvas = panel.querySelector("canvas");
  const axisSelect = panel.querySelector("select");
  const plotArea = panel.querySelector(".space-trace-window");
  const slider = panel.querySelector('input[type="range"]');
  const cursor = panel.querySelector(".space-trace-cursor");
  const value = panel.querySelector(".space-trace-value");
  let primary, nearby, time = 0;

  function moveCursor() {
    if (!panel.open) return;
    const end = primary?.at(-1)?.t ?? 0;
    const axis = axisSelect.value;
    cursor.hidden = !primary?.length;
    slider.disabled = end <= 0;
    cursor.style.left = (end ? 100 * time / end : 0) + "%";
    slider.value = String(time);
    if (!primary?.length) {
      value.textContent = "No trajectory samples.";
      return;
    }
    const reading = coordinateAt(primary, axis, time);
    const other = coordinateAt(nearby, axis, time);
    const label = reading === null ? "" : axis + " = " + format(reading);
    value.textContent = "t = " + time.toFixed(2) + "   " + label + (other === null ? "" : "   nearby = " + format(other));
    slider.setAttribute("aria-valuetext", value.textContent);
  }

  function draw() {
    if (!panel.open) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (width < 100 || height < 50) return;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const left = 49, right = width - 15, top = 12, bottom = height - 22;
    Object.assign(plotArea.style, { left: left + "px", top: top + "px", right: "15px", bottom: "22px" });
    const end = primary?.at(-1)?.t ?? 0;
    slider.max = String(end || 1);
    moveCursor();
    if (!primary?.length) return;
    const axis = axisSelect.value;
    let min = Infinity, max = -Infinity;
    for (const samples of [primary, nearby]) {
      if (!samples) continue;
      for (const point of samples) {
        if (point.t > end) break;
        min = Math.min(min, point[axis]);
        max = Math.max(max, point[axis]);
      }
    }
    if (min === max) {
      const pad = Math.max(0.1, Math.abs(min) * 0.05);
      min -= pad;
      max += pad;
    }
    const toX = t => left + (right - left) * t / (end || 1);
    const toY = v => bottom - (bottom - top) * (v - min) / (max - min);
    ctx.font = "11px system-ui, sans-serif";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#c7d9d1";
    ctx.strokeStyle = "#36594f";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yTicks = [min, max];
    if (min < 0 && max > 0 && Math.min(-min, max) > (max - min) * 0.15) yTicks.push(0);
    for (const v of yTicks) {
      const y = toY(v);
      ctx.fillText(format(v), left - 5, y, left - 6);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of end ? [0, end / 2, end] : [0]) ctx.fillText(format(t), toX(t), bottom + 5);

    function strokeSeries(samples, color, dash = []) {
      if (!samples?.length) return;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const p = samples[i];
        if (p.t > end) break;
        if (i === 0) ctx.moveTo(toX(p.t), toY(p[axis]));
        else ctx.lineTo(toX(p.t), toY(p[axis]));
      }
      ctx.stroke();
    }
    strokeSeries(primary, "#78ddc9");
    strokeSeries(nearby, "#ffb280", [4, 3]);
  }

  slider.addEventListener("input", () => seek(slider.valueAsNumber));
  slider.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowLeft") next = time - 1;
    else if (event.key === "ArrowRight") next = time + 1;
    else return;
    event.preventDefault();
    seek(Math.max(0, Math.min(Number(slider.max), next)));
  });
  // A click exactly at the current sample still pauses the orbit.
  slider.addEventListener("pointerdown", () => seek(time));
  axisSelect.addEventListener("change", draw);
  panel.addEventListener("toggle", draw);
  new ResizeObserver(draw).observe(canvas);
  return {
    setRun(run, comparison) {
      primary = run?.samples;
      nearby = comparison?.samples;
      time = 0;
      draw();
    },
    setTime(t) {
      time = t;
      moveCursor();
    }
  };
}
