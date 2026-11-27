"use strict";

const GRID = { lat0: 38, lon0: 65, step: 0.25, ny: 133, nx: 133 };
const UPSAMPLE = 3;

async function gunzipFetch(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${url}`);
  const buf = await resp.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

const gridCache = new Map();

function loadGrid(meta, kind) {
  const key = `${meta.tag}/${kind}`;
  if (!gridCache.has(key)) {
    gridCache.set(key, gunzipFetch(`runs/${meta.tag}/${kind}.i16.gz`).then((buf) => new RunGrid(meta, new Int16Array(buf))));
  }
  return gridCache.get(key);
}

class RunGrid {
  constructor(meta, data) {
    this.meta = meta;
    this.data = data;
    [this.nv, this.nt, this.ny, this.nx] = meta.shape;
    this.cache = new Map();
    this.init = parseTag(meta.tag);
    this.leads = meta.lead_h;
  }
  validTimes() { return this.leads.map((h) => this.init + h * 3600e3); }
  leadIndexAt(ms) { return this.leads.findIndex((h) => this.init + h * 3600e3 === ms); }
  raw(v, t) {
    const key = `${v}/${t}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const iv = this.meta.vars.indexOf(v);
    const [scale, off] = this.meta.encoding[v];
    const n = this.ny * this.nx;
    const start = (iv * this.nt + t) * n;
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const x = this.data[start + k];
      out[k] = x === this.meta.nodata ? NaN : x * scale + off;
    }
    this.cache.set(key, out);
    return out;
  }
  field(name, t) {
    if (name === "rain6") return t === 0 ? null : this.raw("tp", t);
    if (name === "rain24") return this.accum(t, 24);
    if (name === "t2m" || name === "msl") return this.raw(name, t);
    if (name === "wind10") return speed(this.raw("u10m", t), this.raw("v10m", t));
    if (name === "wind850") return speed(this.raw("u850", t), this.raw("v850", t));
    return null;
  }
  accum(t, hours) {
    const end = this.leads[t];
    if (end < hours) return null;
    const idx = this.leads.map((h, i) => (h > end - hours && h <= end ? i : -1)).filter((i) => i >= 0);
    const out = new Float32Array(this.ny * this.nx);
    for (const i of idx) { const f = this.raw("tp", i); for (let k = 0; k < out.length; k++) out[k] += f[k]; }
    return out;
  }
  winds(name, t) {
    return name === "wind850" ? [this.raw("u850", t), this.raw("v850", t)] : [this.raw("u10m", t), this.raw("v10m", t)];
  }
  at(arr, lat, lon) {
    const i = Math.round((GRID.lat0 - lat) / GRID.step), j = Math.round((lon - GRID.lon0) / GRID.step);
    if (i < 0 || j < 0 || i >= this.ny || j >= this.nx) return NaN;
    return arr[i * this.nx + j];
  }
}

function speed(u, v) {
  const out = new Float32Array(u.length);
  for (let k = 0; k < u.length; k++) out[k] = Math.hypot(u[k], v[k]);
  return out;
}

function parseTag(tag) {
  return Date.UTC(+tag.slice(0, 4), +tag.slice(4, 6) - 1, +tag.slice(6, 8), +tag.slice(8, 10));
}

/* ---------- colour scales ---------- */

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

function continuous(stops, opts = {}) {
  const s = stops.map(([v, c]) => [v, hex(c)]);
  const fn = (v) => {
    if (!Number.isFinite(v)) return null;
    if (opts.clearBelow !== undefined && Math.abs(v) < opts.clearBelow) return null;
    if (v <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i][0]) {
        const f = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
        return s[i - 1][1].map((a, k) => a + f * (s[i][1][k] - a));
      }
    }
    return s[s.length - 1][1];
  };
  fn.legend = { type: "cont", stops, unit: opts.unit, ticks: opts.ticks || stops.map((x) => x[0]) };
  return fn;
}

function discrete(levels, colors, opts = {}) {
  const c = colors.map(hex);
  const fn = (v) => {
    if (!Number.isFinite(v) || v < levels[0]) return null;
    let i = 0;
    while (i + 1 < levels.length && v >= levels[i + 1]) i++;
    return c[i];
  };
  fn.legend = { type: "disc", levels, colors, unit: opts.unit };
  return fn;
}

const YLGNBU = ["#edf8b1", "#c7e9b4", "#7fcdbb", "#41b6c4", "#1d91c0", "#225ea8", "#253494", "#081d58"];
const VIRIDIS = [[0, "#440154"], [0.25, "#3b528b"], [0.5, "#21918c"], [0.75, "#5ec962"], [1, "#fde725"]];

const SCALES = {
  rain6: discrete([0.5, 1, 2.5, 5, 10, 20, 40, 80], YLGNBU, { unit: "mm" }),
  rain24: discrete([1, 2.5, 5, 10, 20, 40, 80, 120], YLGNBU, { unit: "mm" }),
  t2m: continuous([[-10, "#313695"], [0, "#4575b4"], [10, "#74add1"], [18, "#abd9e9"], [22, "#e0f3f8"], [26, "#fee090"],
    [30, "#fdae61"], [35, "#f46d43"], [40, "#d73027"], [45, "#a50026"]], { unit: "°C", ticks: [-10, 0, 10, 20, 30, 40] }),
  wind10: continuous(VIRIDIS.map(([f, c]) => [f * 15, c]), { unit: "m/s", ticks: [0, 5, 10, 15] }),
  wind850: continuous(VIRIDIS.map(([f, c]) => [f * 20, c]), { unit: "m/s", ticks: [0, 5, 10, 15, 20] }),
  msl: continuous([[990, "#053061"], [998, "#2166ac"], [1004, "#92c5de"], [1008, "#f7f7f7"], [1012, "#f4a582"],
    [1018, "#b2182b"], [1026, "#67001f"]], { unit: "hPa", ticks: [990, 1000, 1008, 1016, 1026] }),
  prob: discrete([1, 25, 50, 75, 100], ["#cde2fb", "#6da7ec", "#2a78d6", "#104281"], { unit: "%" }),
};
const OBS_DIFF = continuous([[-80, "#543005"], [-50, "#8c510a"], [-32, "#bf812d"], [-22, "#dfc27d"], [-16, "#f5f5f5"],
  [16, "#f5f5f5"], [22, "#80cdc1"], [32, "#35978f"], [50, "#01665e"], [80, "#003c30"]], { unit: "mm", ticks: [-80, -40, -16, 0, 16, 40, 80] });
const DIFF_SCALES = {
  rain6: continuous([[-40, "#543005"], [-10, "#bf812d"], [-2, "#f6e8c3"], [0, "#f5f5f5"], [2, "#c7eae5"], [10, "#35978f"],
    [40, "#003c30"]], { unit: "mm", clearBelow: 1, ticks: [-40, -10, 0, 10, 40] }),
  rain24: continuous([[-80, "#543005"], [-20, "#bf812d"], [-5, "#f6e8c3"], [0, "#f5f5f5"], [5, "#c7eae5"], [20, "#35978f"],
    [80, "#003c30"]], { unit: "mm", clearBelow: 2, ticks: [-80, -20, 0, 20, 80] }),
  t2m: continuous([[-6, "#2166ac"], [-2, "#92c5de"], [0, "#f7f7f7"], [2, "#f4a582"], [6, "#b2182b"]], { unit: "°C", clearBelow: 0.5 }),
  msl: continuous([[-8, "#2166ac"], [-2, "#92c5de"], [0, "#f7f7f7"], [2, "#f4a582"], [8, "#b2182b"]], { unit: "hPa", clearBelow: 0.5 }),
  wind10: continuous([[-8, "#542788"], [-2, "#b2abd2"], [0, "#f7f7f7"], [2, "#fdb863"], [8, "#b35806"]], { unit: "m/s", clearBelow: 0.5 }),
  wind850: continuous([[-10, "#542788"], [-3, "#b2abd2"], [0, "#f7f7f7"], [3, "#fdb863"], [10, "#b35806"]], { unit: "m/s", clearBelow: 0.5 }),
};

/* ---------- rendering helpers ---------- */

function renderField(values, scale, alpha = 0.85) {
  const { ny, nx } = GRID, f = UPSAMPLE, W = nx * f, H = ny * f;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  const a = Math.round(alpha * 255);
  for (let py = 0; py < H; py++) {
    const y = Math.min(Math.max((py + 0.5) / f - 0.5, 0), ny - 1), i0 = Math.floor(y), i1 = Math.min(i0 + 1, ny - 1), fy = y - i0;
    for (let px = 0; px < W; px++) {
      const x = Math.min(Math.max((px + 0.5) / f - 0.5, 0), nx - 1), j0 = Math.floor(x), j1 = Math.min(j0 + 1, nx - 1), fx = x - j0;
      const v00 = values[i0 * nx + j0], v01 = values[i0 * nx + j1], v10 = values[i1 * nx + j0], v11 = values[i1 * nx + j1];
      let v = (v00 * (1 - fx) + v01 * fx) * (1 - fy) + (v10 * (1 - fx) + v11 * fx) * fy;
      if (!Number.isFinite(v)) v = values[Math.round(y) * nx + Math.round(x)];
      const c = scale(v);
      const k = (py * W + px) * 4;
      if (c) { img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = a; }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

function fieldBounds() {
  const h = GRID.step / 2;
  return [[GRID.lat0 - (GRID.ny - 1) * GRID.step - h, GRID.lon0 - h], [GRID.lat0 + h, GRID.lon0 + (GRID.nx - 1) * GRID.step + h]];
}

function isolines(values, level) {
  const { ny, nx } = GRID, segs = [];
  const P = (i, j) => [GRID.lat0 - i * GRID.step, GRID.lon0 + j * GRID.step];
  const lerp = (a, b, va, vb) => { const t = (level - va) / (vb - va); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
  for (let i = 0; i < ny - 1; i++) {
    for (let j = 0; j < nx - 1; j++) {
      const v = [values[i * nx + j], values[i * nx + j + 1], values[(i + 1) * nx + j + 1], values[(i + 1) * nx + j]];
      if (v.some((x) => !Number.isFinite(x))) continue;
      const p = [P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)];
      const idx = (v[0] >= level ? 8 : 0) | (v[1] >= level ? 4 : 0) | (v[2] >= level ? 2 : 0) | (v[3] >= level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const e = (a, b) => lerp(p[a], p[b], v[a], v[b]);
      const T = e(0, 1), R = e(1, 2), B = e(2, 3), L_ = e(3, 0);
      const table = {
        1: [[L_, B]], 2: [[B, R]], 3: [[L_, R]], 4: [[T, R]], 5: [[L_, T], [B, R]], 6: [[T, B]], 7: [[L_, T]],
        8: [[L_, T]], 9: [[T, B]], 10: [[T, R], [L_, B]], 11: [[T, R]], 12: [[L_, R]], 13: [[B, R]], 14: [[L_, B]],
      };
      for (const s of table[idx]) segs.push(s);
    }
  }
  return segs;
}

/* ---------- map ---------- */

let BASE = null;
async function baseLayers() {
  if (!BASE) {
    BASE = Promise.all([fetch("assets/countries.geojson").then((r) => r.json()), fetch("assets/states.geojson").then((r) => r.json())])
      .then(([countries, states]) => ({ countries, states }));
  }
  return BASE;
}

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

class FieldMap {
  constructor(el, opts = {}) {
    this.el = el;
    this.map = L.map(el, {
      crs: L.CRS.EPSG4326, zoomSnap: 0.25, zoomDelta: 0.5, attributionControl: false, minZoom: 2, maxZoom: 9,
      maxBounds: [[-5, 50], [48, 112]], worldCopyJump: false,
    });
    this.map.fitBounds([[6, 67], [37, 97]]);
    for (const [name, z] of [["land", 250], ["field", 350], ["fieldTop", 355], ["lines", 420], ["borders", 450], ["particles", 460], ["labels", 470]]) {
      this.map.createPane(name).style.zIndex = z;
    }
    this.map.getPane("particles").style.pointerEvents = "none";
    this.map.getPane("labels").style.pointerEvents = "none";
    this.layers = {};
    this.ready = this.addBase(opts);
    this.legendCtl = null;
  }
  async addBase(opts) {
    const { countries, states } = await baseLayers();
    const line = cssVar("--text-2") || "#555";
    L.geoJSON(countries, { pane: "land", interactive: false, style: { stroke: false, fillColor: cssVar("--land"), fillOpacity: 1 } }).addTo(this.map);
    this.statesLayer = L.geoJSON(states, {
      pane: "borders", interactive: !!opts.stateClick,
      style: { color: line, weight: 0.5, opacity: 0.7, fill: !!opts.stateClick, fillOpacity: 0 },
      onEachFeature: (f, l) => { if (opts.stateClick) l.on("click", (e) => opts.stateClick(f.properties.name, e)); },
    }).addTo(this.map);
    L.geoJSON(countries, { pane: "borders", interactive: false, style: { color: cssVar("--text") || "#111", weight: 1, opacity: 0.85, fill: false } }).addTo(this.map);
  }
  setField(values, scale, opts = {}) {
    const pane = opts.top ? "fieldTop" : "field";
    const key = opts.top ? "fieldTop" : "field";
    if (this.layers[key]) { this.map.removeLayer(this.layers[key]); this.layers[key] = null; }
    if (!values) return;
    this.layers[key] = L.imageOverlay(renderField(values, scale, opts.alpha ?? 0.85), fieldBounds(), { pane, interactive: false }).addTo(this.map);
    if (opts.legend !== false) this.legend(scale.legend, opts.title);
  }
  clip(pct) {
    const el = this.layers.fieldTop && this.layers.fieldTop.getElement();
    if (el) el.style.clipPath = `inset(0 0 0 ${pct}%)`;
  }
  legend(lg, title) {
    if (this.legendCtl) this.legendCtl.remove();
    if (!lg) return;
    const ctl = L.control({ position: "bottomleft" });
    ctl.onAdd = () => {
      const d = L.DomUtil.create("div", "legend");
      let bar = "", ticks = "";
      if (lg.type === "disc") {
        bar = lg.colors.map((c) => `<span style="background:${c}"></span>`).join("");
        ticks = lg.levels.map((v) => `<span>${v}</span>`).join("");
      } else {
        const lo = lg.stops[0][0], hi = lg.stops[lg.stops.length - 1][0];
        const grad = lg.stops.map(([v, c]) => `${c} ${(100 * (v - lo)) / (hi - lo)}%`).join(",");
        bar = `<span style="background:linear-gradient(90deg,${grad})"></span>`;
        ticks = lg.ticks.map((v) => `<span>${v}</span>`).join("");
      }
      d.innerHTML = `<div>${title || ""} ${lg.unit ? `(${lg.unit})` : ""}</div><div class="bar">${bar}</div><div class="ticks">${ticks}</div>`;
      return d;
    };
    this.legendCtl = ctl.addTo(this.map);
  }
  setIsolines(values, step, opts = {}) {
    if (this.layers.iso) { this.map.removeLayer(this.layers.iso); this.layers.iso = null; }
    if (!values) return;
    let lo = Infinity, hi = -Infinity;
    for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const group = L.layerGroup();
    for (let lev = Math.ceil(lo / step) * step; lev <= hi; lev += step) {
      if (opts.max !== undefined && lev > opts.max) continue;
      const segs = isolines(values, lev);
      if (!segs.length) continue;
      L.polyline(segs, { pane: "lines", color: opts.color || "#222", weight: 0.9, opacity: 0.8, interactive: false }).addTo(group);
      for (let k = 0; k < segs.length; k += 60) {
        L.tooltip({ permanent: true, direction: "center", className: "maplabel", pane: "labels" })
          .setLatLng(segs[k][0]).setContent(String(lev)).addTo(group);
      }
    }
    this.layers.iso = group.addTo(this.map);
  }
  setParticles(u, v) {
    if (!this.particles) this.particles = new Particles(this.map);
    this.particles.setWind(u, v);
  }
  addLayer(name, layer) {
    if (this.layers[name]) this.map.removeLayer(this.layers[name]);
    this.layers[name] = layer ? layer.addTo(this.map) : null;
  }
  sync(other) {
    let lock = false;
    const link = (a, b) => a.map.on("move", () => {
      if (lock) return;
      lock = true; b.map.setView(a.map.getCenter(), a.map.getZoom(), { animate: false }); lock = false;
    });
    link(this, other); link(other, this);
  }
}

class Particles {
  constructor(map) {
    this.map = map;
    this.canvas = L.DomUtil.create("canvas", "", map.getPane("particles"));
    this.ctx = this.canvas.getContext("2d");
    this.u = this.v = null;
    this.pts = [];
    this.running = false;
    map.on("movestart zoomstart", () => this.clear(true));
    map.on("moveend zoomend resize", () => this.reset());
    this.reset();
  }
  reset() {
    const size = this.map.getSize();
    this.canvas.width = size.x; this.canvas.height = size.y;
    L.DomUtil.setPosition(this.canvas, this.map.containerPointToLayerPoint([0, 0]));
    this.hidden = false;
    const n = Math.min(2500, Math.round((size.x * size.y) / 260));
    this.pts = Array.from({ length: n }, () => this.spawn());
  }
  clear(hide) { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.hidden = !!hide; }
  spawn() {
    const b = this.map.getBounds();
    const s = Math.max(b.getSouth(), 5), n = Math.min(b.getNorth(), 38), w = Math.max(b.getWest(), 65), e = Math.min(b.getEast(), 98);
    return { lat: s + Math.random() * (n - s), lon: w + Math.random() * (e - w), age: Math.floor(Math.random() * 80) };
  }
  sample(arr, lat, lon) {
    const y = (GRID.lat0 - lat) / GRID.step, x = (lon - GRID.lon0) / GRID.step;
    const i = Math.floor(y), j = Math.floor(x);
    if (i < 0 || j < 0 || i >= GRID.ny - 1 || j >= GRID.nx - 1) return NaN;
    const fy = y - i, fx = x - j, n = GRID.nx;
    return (arr[i * n + j] * (1 - fx) + arr[i * n + j + 1] * fx) * (1 - fy) + (arr[(i + 1) * n + j] * (1 - fx) + arr[(i + 1) * n + j + 1] * fx) * fy;
  }
  setWind(u, v) {
    this.u = u; this.v = v;
    if (!u) { this.running = false; this.clear(); return; }
    if (!this.running) { this.running = true; requestAnimationFrame(() => this.frame()); }
  }
  frame() {
    if (!this.running) return;
    if (!document.hidden && !this.hidden && this.u) {
      const ctx = this.ctx, k = 0.012 * Math.pow(2, 5 - this.map.getZoom());
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < this.pts.length; i++) {
        const p = this.pts[i];
        const u = this.sample(this.u, p.lat, p.lon), v = this.sample(this.v, p.lat, p.lon);
        if (!Number.isFinite(u) || p.age++ > 90) { this.pts[i] = this.spawn(); continue; }
        const a = this.map.latLngToContainerPoint([p.lat, p.lon]);
        p.lat += v * k * 0.1; p.lon += (u * k * 0.1) / Math.cos((p.lat * Math.PI) / 180);
        const b = this.map.latLngToContainerPoint([p.lat, p.lon]);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    requestAnimationFrame(() => this.frame());
  }
}
