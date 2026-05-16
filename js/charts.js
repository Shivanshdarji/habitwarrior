/* ==========================================================
 * Habit Warrior — Charts
 *
 * Lightweight canvas-rendered visualisations. Each function
 * takes a host <canvas> element plus typed data and draws on
 * the 2D context. No external chart libraries — keeps the
 * project zero-dep.
 * ========================================================== */

const COL = {
  ink:      '#e8e8ee',
  dim:      '#9a9aab',
  mute:     '#5f5f70',
  border:   'rgba(255, 255, 255, 0.06)',
  borderS:  'rgba(255, 255, 255, 0.12)',
  accent:   '#c89b5b',
  accent2:  '#d6b07a',
  xp:       '#7a85a8',
  good:     '#6b9b7e',
  warn:     '#c89b5b',
  bad:      '#b56a72',
};

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr  = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

/* ---------------------------------------------------- bar chart */
export function drawBars(canvas, items, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!items.length) return;
  const pad = { t: 14, r: 10, b: 22, l: 10 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const max = Math.max(1, ...items.map(d => d.value));
  const gap = 4;
  const bw = (cw - gap * (items.length - 1)) / items.length;

  ctx.font = '10px Inter, system-ui';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';

  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    const x = pad.l + i * (bw + gap);
    const bh = (d.value / max) * ch;
    const y = pad.t + ch - bh;

    // Background track.
    ctx.fillStyle = COL.border;
    ctx.fillRect(x, pad.t, bw, ch);

    // Bar.
    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, COL.accent2);
    grad.addColorStop(1, COL.accent);
    ctx.fillStyle = d.color || grad;
    ctx.fillRect(x, y, bw, Math.max(2, bh));

    // Label.
    ctx.fillStyle = COL.mute;
    ctx.fillText(d.label || '', x + bw / 2, pad.t + ch + 6);

    // Value above bar.
    if (opts.showValue && bh > 14) {
      ctx.fillStyle = COL.ink;
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(d.value), x + bw / 2, y - 2);
      ctx.textBaseline = 'top';
    }
  }
}

/* ---------------------------------------------------- line chart */
export function drawLines(canvas, series, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!series.length) return;
  const pad = { t: 12, r: 12, b: 22, l: 28 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  // Determine X labels and Y max.
  const labels = series[0].points.map(p => p.label);
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.value)));

  // Grid lines.
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = COL.mute;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const y = pad.t + ch - t * ch;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + cw, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(max * t)), pad.l - 6, y);
  }

  // X labels (sparse).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const stride = Math.max(1, Math.floor(labels.length / 6));
  for (let i = 0; i < labels.length; i += stride) {
    const x = pad.l + (labels.length === 1 ? cw / 2 : (i / (labels.length - 1)) * cw);
    ctx.fillStyle = COL.mute;
    ctx.fillText(labels[i], x, pad.t + ch + 6);
  }

  // Each series.
  for (const s of series) {
    const pts = s.points;
    if (pts.length === 0) continue;

    // Filled area (optional).
    if (s.fill) {
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
      grad.addColorStop(0, hexToRgba(s.color, 0.35));
      grad.addColorStop(1, hexToRgba(s.color, 0.0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + ch);
      pts.forEach((p, i) => {
        const x = pad.l + (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw);
        const y = pad.t + ch - (p.value / max) * ch;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(pad.l + cw, pad.t + ch);
      ctx.closePath();
      ctx.fill();
    }

    // Line.
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = pad.l + (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw);
      const y = pad.t + ch - (p.value / max) * ch;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots.
    for (let i = 0; i < pts.length; i++) {
      const x = pad.l + (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw);
      const y = pad.t + ch - (pts[i].value / max) * ch;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Legend.
  if (opts.legend !== false && series.length > 1) {
    let lx = pad.l;
    const ly = pad.t - 2;
    ctx.font = '10px Inter, system-ui';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 7, 8, 8);
      ctx.fillStyle = COL.dim;
      ctx.fillText(s.label, lx + 12, ly);
      lx += ctx.measureText(s.label).width + 26;
    }
  }
}

/* ---------------------------------------------------- donut chart */
export function drawDonut(canvas, slices, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = w / 2;
  const cy = h / 2;
  const r  = Math.min(w, h) / 2 - 8;
  const r0 = r * 0.62;

  if (total === 0) {
    ctx.fillStyle = COL.border;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
    ctx.fill();
  } else {
    let start = -Math.PI / 2;
    for (const s of slices) {
      const a = (s.value / total) * Math.PI * 2;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + a);
      ctx.arc(cx, cy, r0, start + a, start, true);
      ctx.closePath();
      ctx.fill();
      start += a;
    }
  }

  // Centre label.
  ctx.fillStyle = COL.ink;
  ctx.font = 'bold 18px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(opts.centerNumber ?? total), cx, cy - 6);
  ctx.fillStyle = COL.mute;
  ctx.font = '9px Inter, system-ui';
  ctx.fillText(opts.centerLabel || 'total', cx, cy + 10);
}

/* ---------------------------------------------------- calendar heatmap */
export function drawHeatmap(host, weeks /* array of weeks; each is array of {date, count} */, max) {
  host.innerHTML = '';
  host.classList.add('heatmap-grid');
  const cells = [];
  for (const week of weeks) {
    const col = document.createElement('div');
    col.className = 'heatmap-col';
    for (const day of week) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.title = `${day.date}: ${day.count} completion${day.count === 1 ? '' : 's'}`;
      const intensity = max > 0 ? Math.min(1, day.count / Math.max(1, max)) : 0;
      cell.style.background = intensityToColor(intensity);
      col.appendChild(cell);
      cells.push(cell);
    }
    host.appendChild(col);
  }
  return cells;
}

/* ---------------------------------------------------- helpers */
function intensityToColor(t) {
  if (t === 0) return 'rgba(255, 255, 255, 0.04)';
  // Lerp from dim to accent.
  const a = 0.18 + t * 0.82;
  return `rgba(200, 155, 91, ${a.toFixed(3)})`;
}

function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}
