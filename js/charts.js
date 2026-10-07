// Up & Down the River · charts.
//
// Plain SVG strings built from Stats.timeline output. No DOM, no globals —
// tests/charts.test.js runs this in a bare sandbox. Colours come from the page's
// CSS variables so the charts sit on the cream panels like everything else.

const Charts = {
  W: 320,
  H: 140,
  PAD: { l: 26, r: 8, t: 10, b: 18 },
  // Distinguishable on cream, and not red/green only (colour-blind friendly).
  COLORS: ["#2e6fbd", "#e0a83c", "#c0433a", "#2e8b57", "#8a4fb0", "#17211c", "#d9742f", "#4aa3a3"],

  esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); },

  // Cumulative wins and losses over one player's games.
  winLoss(tl) {
    if (!tl.length) return "";
    const { W, H, PAD } = this;
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const top = Math.max(1, tl[tl.length - 1].wins, tl[tl.length - 1].losses);
    const x = (i) => PAD.l + (tl.length === 1 ? iw / 2 : (i / (tl.length - 1)) * iw);
    const y = (v) => PAD.t + ih - (v / top) * ih;
    const line = (key, color) => {
      const pts = [[PAD.l, y(0)], ...tl.map((t, i) => [x(i), y(t[key])])];
      if (tl.length === 1) pts[0] = [x(0) - 1, y(0)];
      return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}"/>` +
             `<circle cx="${x(tl.length - 1).toFixed(1)}" cy="${y(tl[tl.length - 1][key]).toFixed(1)}" r="3.5" fill="${color}"/>`;
    };
    return this.frame(top, line("wins", "#2e8b57") + line("losses", "#c0433a"),
      "Cumulative wins and losses", tl.length);
  },

  // Everyone's running win rate on one chart, so players can be compared.
  compare(series) {
    const live = series.filter((s) => s.tl.length);
    if (!live.length) return "";
    const { W, H, PAD } = this;
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const longest = Math.max(...live.map((s) => s.tl.length));
    const x = (i) => PAD.l + (longest === 1 ? iw / 2 : (i / (longest - 1)) * iw);
    const y = (v) => PAD.t + ih - (v / 100) * ih;
    const lines = live.map((s, k) => {
      const c = this.COLORS[k % this.COLORS.length];
      const pts = s.tl.map((t, i) => `${x(i).toFixed(1)},${y(t.winRate).toFixed(1)}`).join(" ");
      const last = s.tl[s.tl.length - 1];
      return `<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" points="${pts}"/>` +
             `<circle cx="${x(s.tl.length - 1).toFixed(1)}" cy="${y(last.winRate).toFixed(1)}" r="3.5" fill="${c}"/>`;
    }).join("");
    return this.frame(100, lines, "Win rate over each player's games", longest, "%");
  },

  // Per-game results as bars: wins rise, losses fall.
  strip(tl, max = 30) {
    const recent = tl.slice(-max);
    if (!recent.length) return "";
    const { W } = this;
    const bw = Math.min(14, (W - 16) / recent.length - 2);
    const step = bw + 2;
    const x0 = (W - recent.length * step) / 2;
    const bars = recent.map((t, i) =>
      `<rect x="${(x0 + i * step).toFixed(1)}" y="${t.won ? 6 : 30}" width="${bw.toFixed(1)}" height="24" rx="2" fill="${t.won ? "#2e8b57" : "#c0433a"}"/>`).join("");
    return `<svg class="chart" viewBox="0 0 ${W} 60" role="img" aria-label="Win or loss in each of the last ${recent.length} games">` +
           `<line x1="0" x2="${W}" y1="30" y2="30" stroke="#ded4be"/>${bars}</svg>`;
  },

  legend(items) {
    return `<div class="legend">${items.map((it) =>
      `<span><i style="background:${it.color}"></i>${this.esc(it.label)}</span>`).join("")}</div>`;
  },

  frame(top, body, label, n, unit = "") {
    const { W, H, PAD } = this;
    const ih = H - PAD.t - PAD.b;
    const grid = [0, 0.5, 1].map((f) => {
      const yy = PAD.t + ih - f * ih;
      return `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${yy}" y2="${yy}" stroke="#ded4be"/>` +
             `<text x="${PAD.l - 4}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#6d7d72">${Math.round(top * f)}${unit}</text>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.esc(label)}">${grid}` +
           `<text x="${PAD.l}" y="${H - 4}" font-size="9" fill="#6d7d72">game 1</text>` +
           `<text x="${W - PAD.r}" y="${H - 4}" text-anchor="end" font-size="9" fill="#6d7d72">game ${n}</text>${body}</svg>`;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Charts };
}
