"use strict";

const PAGES = ["home", "bulletin", "maps", "city", "compare", "observed", "cyclone", "marine", "agree", "gallery", "skill", "about"];
const NAV_KEYS = { home: "nav_home", bulletin: "nav_bulletin", maps: "nav_maps", city: "nav_city", compare: "nav_compare",
  observed: "nav_observed", cyclone: "nav_cyclone", marine: "nav_marine", agree: "nav_agree", gallery: "nav_gallery",
  skill: "nav_skill", about: "nav_about" };
const LAYERS = ["rain24", "rain6", "t2m", "wind10", "wind850", "msl"];
const LAYER_KEYS = { rain6: "l_rain6", rain24: "l_rain24", t2m: "l_t2m", wind10: "l_wind10", wind850: "l_wind850", msl: "l_msl" };
const CATEGORIES = ["Low pressure area", "Well-marked low pressure area", "Depression", "Deep depression", "Cyclonic storm",
  "Severe cyclonic storm", "Very severe cyclonic storm or stronger"];
const CAT_COLORS = ["#9ec5f4", "#5598e7", "#eda100", "#eb6834", "#e34948", "#b0213b", "#6b0f2a"];
const LEVEL_ORDER = ["green", "yellow", "orange", "red"];
const SEA_BOXES = {
  "North Bay of Bengal": [18, 23, 85, 94], "Central Bay of Bengal": [13, 18, 80, 94], "South Bay of Bengal": [5, 13, 80, 94],
  "Andaman Sea": [5, 15, 94, 98], "Gulf of Mannar / Comorin": [5, 10, 76, 80], "Southeast Arabian Sea": [5, 15, 65, 76],
  "Northeast Arabian Sea": [15, 24, 65, 73],
};

const S = { lang: "en", kind: "corrected", page: "home", params: {}, runs: [], cities: [], charts: [], maps: [], timers: [] };

/* ---------- utilities ---------- */

function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  return null;
}
const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;
const stateName = (s) => (S.lang === "en" ? s : (STATE_NAMES[S.lang] || {})[s] || s);
const seaName = (s) => (S.lang === "en" ? s : (SEA_NAMES[S.lang] || {})[s] || s);
const catName = (c) => (S.lang === "en" ? c : (CATEGORY_NAMES[S.lang] || {})[c] || c);
const cityName = (c) => (S.lang === "en" ? c.name : c[S.lang] || c.name);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const r0 = (x) => String(Math.round(x) || 0);
const $ = (sel, el = document) => el.querySelector(sel);
const h = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };

function fmtTime(ms, opts = {}) {
  const d = new Date(ms + 330 * 60e3);
  const day = `${d.getUTCDate()} ${MONTHS[S.lang][d.getUTCMonth()]}`;
  const wd = opts.weekday === false ? "" : `${WEEKDAYS[S.lang][d.getUTCDay()]} `;
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return opts.date ? `${wd}${day}` : `${wd}${day}, ${hm} IST`;
}
function tagTime(tag) { return parseTag(tag); }
function runLabel(r) {
  return `${fmtTime(tagTime(r.tag), { weekday: false })} (${r.tag.slice(8)}Z${r.hindcast ? ", " + t("hindcast") : ""})`;
}

const jsonCache = new Map();
function getJSON(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return jsonCache.get(url);
}
function getText(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null));
  return jsonCache.get(url);
}
const runMeta = (tag) => getJSON(`runs/${tag}/run.json`);
const runStats = (tag, kind = S.kind) => getJSON(`runs/${tag}/${kind}.json`);
const runEntry = (tag) => S.runs.find((r) => r.tag === tag);
const latestTag = () => (S.runs.find((r) => !r.hindcast) || S.runs[0] || {}).tag;

function md(text) {
  const out = [];
  let list = false;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
    if (list) { out.push("</ul>"); list = false; }
    if (line.startsWith("# ")) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}

function mdSection(text, n) {
  const parts = text.split(/\n## /);
  return parts[n] ? parts[n].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) : [];
}

function chartColors() {
  return { s1: cssVar("--series-1"), s2: cssVar("--series-2"), s3: cssVar("--series-3"), text: cssVar("--text-2"),
    grid: cssVar("--border"), muted: cssVar("--muted") };
}

function makeChart(canvas, cfg) {
  const c = chartColors();
  Chart.defaults.color = c.text;
  Chart.defaults.font.family = '"Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif';
  Chart.defaults.borderColor = c.grid;
  const chart = new Chart(canvas, cfg);
  S.charts.push(chart);
  return chart;
}

function seg(options, value, onChange) {
  const el = h(`<div class="seg"></div>`);
  for (const [v, label] of options) {
    const b = h(`<button type="button">${esc(label)}</button>`);
    if (v === value) b.classList.add("on");
    b.onclick = () => { el.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); onChange(v); };
    el.appendChild(b);
  }
  return el;
}

function newMap(el, opts) { const m = new FieldMap(el, opts); S.maps.push(m); return m; }

function link(page, params = {}) {
  const p = new URLSearchParams({ run: S.params.run || "", ...params });
  for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
  return `#${page}${p.toString() ? "?" + p : ""}`;
}

function setParams(update, replace = true) {
  const p = { ...S.params, ...update };
  for (const k of Object.keys(p)) if (p[k] === undefined || p[k] === null || p[k] === "") delete p[k];
  const hash = `#${S.page}${Object.keys(p).length ? "?" + new URLSearchParams(p) : ""}`;
  S.params = p;
  if (replace) history.replaceState(null, "", hash); else location.hash = hash;
}

function timeSlider(times, idx, onChange, labelFn = (ms) => fmtTime(ms)) {
  const el = h(`<div class="timebar"><button type="button" class="play">▶</button>
    <input type="range" min="0" max="${times.length - 1}" value="${idx}" aria-label="${esc(t("time"))}"><span class="tlabel"></span></div>`);
  const r = $("input", el), lab = $(".tlabel", el), btn = $(".play", el);
  const upd = () => { lab.textContent = labelFn(times[+r.value], +r.value); onChange(+r.value); };
  r.oninput = upd;
  let timer = null;
  btn.onclick = () => {
    if (timer) { clearInterval(timer); timer = null; btn.textContent = "▶"; return; }
    btn.textContent = "❚❚";
    timer = setInterval(() => { r.value = (+r.value + 1) % times.length; upd(); }, 900);
    S.timers.push(timer);
  };
  lab.textContent = labelFn(times[idx], idx);
  return el;
}

function warnColor(level) { return cssVar(`--warn-${level}`); }

/* ---------- shell ---------- */

async function boot() {
  const qlang = new URLSearchParams(location.hash.split("?")[1] || "").get("lang");
  S.lang = qlang || store("lang") || "en";
  S.kind = store("kind2") || "raw";
  const [runs, cities, build, storms] = await Promise.all([getJSON("runs/index.json"), getJSON("assets/cities.json"), getJSON("build.json"),
    getJSON("storms/index.json")]);
  S.runs = runs || [];
  S.storms = storms || [];
  S.cities = cities || [];
  S.telegram = build && build.telegram;
  S.subscribers = build && build.subscribers;
  siteStats();
  if (build) $("#build-time").textContent = `Updated ${fmtTime(Date.parse(build.built))}`;
  const sel = $("#run-select");
  sel.onchange = () => setParams({ run: sel.value }, false);
  $("#kind-select").value = S.kind;
  $("#kind-select").onchange = (e) => { S.kind = e.target.value; store("kind2", S.kind); route(); };
  document.querySelectorAll(".lang button").forEach((b) => (b.onclick = () => { S.lang = b.dataset.lang; store("lang", S.lang); route(); }));
  const info = $("#kind-info"), note = $("#kind-note");
  const toggleNote = (open) => { note.hidden = !open; info.setAttribute("aria-expanded", String(open)); };
  info.onclick = (e) => { e.stopPropagation(); toggleNote(note.hidden); };
  document.addEventListener("click", (e) => { if (!note.hidden && !note.contains(e.target)) toggleNote(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleNote(false); });
  window.addEventListener("hashchange", route);
  route();
  setTimeout(subscribePopup, POPUP_DELAY);
}

const COUNTER = "https://abacus.jasoncameron.dev";
const COUNTER_KEY = "mausamai.co.in/visits";

async function siteStats() {
  let first = false;
  try { first = !sessionStorage.getItem("counted"); sessionStorage.setItem("counted", "1"); } catch (e) { first = false; }
  try {
    const r = await fetch(`${COUNTER}/${first ? "hit" : "get"}/${COUNTER_KEY}`);
    if (r.ok) S.visits = (await r.json()).value;
  } catch (e) { /* counter unavailable */ }
  renderStats();
}

function renderStats() {
  const el = $("#site-stats");
  if (!el) return;
  const nf = (n) => Number(n).toLocaleString("en-IN");
  const parts = [];
  if (S.visits) parts.push(`${nf(S.visits)} ${t("visits")}`);
  if (S.telegram && S.subscribers) parts.push(`<a href="https://t.me/${S.telegram}" target="_blank" rel="noopener">${nf(S.subscribers)} ${esc(t("tg_subs"))}</a>`);
  el.innerHTML = parts.join(" · ");
}

function renderShell() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  renderStats();
  document.querySelectorAll("[data-t-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tAria)));
  $("#kind-note").innerHTML = `<b>${esc(t("corrected"))}</b><p>${esc(t("kind_corr"))}</p><b>${esc(t("raw"))}</b><p>${esc(t("kind_raw"))}</p>
    <p class="muted">${esc(t("kind_when"))} <a href="${link("about")}">${esc(t("nav_about"))} →</a></p>`;
  document.querySelectorAll(".lang button").forEach((b) => b.classList.toggle("on", b.dataset.lang === S.lang));
  const nav = $("#nav");
  nav.innerHTML = PAGES.map((p) => `<a href="${link(p)}" class="${p === S.page ? "on" : ""}">${esc(t(NAV_KEYS[p]))}</a>`).join("");
  const sel = $("#run-select");
  const live = S.runs.filter((r) => !r.hindcast), hc = S.runs.filter((r) => r.hindcast);
  const opt = (r, i) => `<option value="${r.tag}">${esc(runLabel(r))}${i === 0 && !r.hindcast ? ` — ${esc(t("latest"))}` : ""}</option>`;
  sel.innerHTML = `<optgroup label="Forecasts">${live.map(opt).join("")}</optgroup><optgroup label="${esc(t("hindcast"))}">${hc.map(opt).join("")}</optgroup>`;
  sel.value = S.params.run;
  $("#kind-select").value = S.kind;
}

function route() {
  const [page, q] = location.hash.slice(1).split("?");
  S.page = PAGES.includes(page) ? page : "home";
  S.params = Object.fromEntries(new URLSearchParams(q || ""));
  if (I18N[S.params.lang]) { S.lang = S.params.lang; store("lang", S.lang); }
  if (!S.params.run || !runEntry(S.params.run)) S.params.run = latestTag();
  for (const c of S.charts) c.destroy();
  for (const m of S.maps) { if (m.particles) m.particles.running = false; m.map.remove(); }
  for (const x of S.timers) clearInterval(x);
  S.charts = []; S.maps = []; S.timers = [];
  renderShell();
  const main = $("#main");
  main.innerHTML = `<p class="muted">${esc(t("loading"))}</p>`;
  const fn = { home, bulletin, maps, city, compare, observed, cyclone, marine, agree, gallery, skill, about }[S.page];
  fn(main).catch((e) => { console.error(e); main.innerHTML = `<div class="card">Error: ${esc(e.message)}</div>`; });
  window.scrollTo(0, 0);
}

/* ---------- shared pieces ---------- */

function dayWindows(stats) {
  const init = tagTime(stats.init.replace(/[-T]/g, ""));
  const days = [...new Set(stats.states.map((r) => r.day))].sort((a, b) => a - b);
  return days.map((d) => ({ d, a: init + (d - 1) * 864e5, b: init + d * 864e5 }));
}
const dayLabel = (w) => `${t("day")} ${w.d}: ${fmtTime(w.a, { weekday: true, date: true })}`;

function cityDaily(stats, name) {
  const s = stats.cities[name];
  if (!s) return [];
  const leads = stats.lead_h;
  return dayWindows(stats).map((w) => {
    const idx = leads.map((x, i) => (x > 24 * (w.d - 1) && x <= 24 * w.d ? i : -1)).filter((i) => i >= 0);
    const pick = (a) => idx.map((i) => a[i]);
    return { ...w, tmax: Math.max(...pick(s.t2m)), tmin: Math.min(...pick(s.t2m)), rain: pick(s.tp).reduce((a, b) => a + (b || 0), 0),
      wind: Math.max(...pick(s.ws)) };
  });
}

const citySlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const tgLink = (name) => `https://t.me/${S.telegram}?start=${citySlug(name)}-${S.lang}`;

function subscribeCard(cityName_ = null) {
  if (!S.telegram) return "";
  const pick = cityName_ || store("subcity") || "Pune";
  return `<section class="card subscribe"><h2>${esc(t("sub_title"))}</h2><p class="small">${esc(t("sub_text"))}</p>
    <div class="toolbar"><select id="subcity">${S.cities.map((c) => `<option value="${esc(c.name)}"${c.name === pick ? " selected" : ""}>${esc(cityName(c))}</option>`).join("")}</select>
    <a id="sublink" class="btn tg" target="_blank" rel="noopener" href="${tgLink(pick)}">${esc(t("sub_button"))}</a></div></section>`;
}

function wireSubscribe() {
  const sel = $("#subcity");
  if (sel) sel.onchange = () => { store("subcity", sel.value); $("#sublink").href = tgLink(sel.value); };
  const a = $("#sublink");
  if (a) a.addEventListener("click", () => store("subscribed", "1"));
}

const POPUP_DELAY = 30e3, POPUP_SNOOZE = 30 * 864e5;

function subscribePopup() {
  if (!S.telegram || store("subscribed") || Date.now() - (+store("popup_shown") || 0) < POPUP_SNOOZE) return;
  if (document.querySelector("dialog.subpop")) return;
  const pick = (S.page === "city" && S.params.c) || store("subcity") || "Pune";
  const d = h(`<dialog class="subpop" aria-labelledby="subpop-title">
    <button type="button" class="x" aria-label="${esc(t("close"))}">×</button>
    <img src="assets/icon.svg" alt="" width="48" height="48">
    <h2 id="subpop-title">${esc(t("sub_title"))}</h2><p class="small">${esc(t("sub_text"))}</p>
    <select id="popcity">${S.cities.map((c) => `<option value="${esc(c.name)}"${c.name === pick ? " selected" : ""}>${esc(cityName(c))}</option>`).join("")}</select>
    <a id="poplink" class="btn tg" target="_blank" rel="noopener" href="${tgLink(pick)}">${esc(t("sub_button"))}</a>
    <button type="button" class="later">${esc(t("not_now"))}</button></dialog>`);
  document.body.appendChild(d);
  const close = () => d.close();
  d.querySelector(".x").onclick = close;
  d.querySelector(".later").onclick = close;
  d.addEventListener("click", (e) => { if (e.target === d) close(); });
  d.addEventListener("close", () => d.remove());
  $("#popcity").onchange = (e) => { store("subcity", e.target.value); $("#poplink").href = tgLink(e.target.value); };
  $("#poplink").onclick = () => { store("subscribed", "1"); d.close(); };
  store("popup_shown", String(Date.now()));
  d.showModal();
}

function weatherIcon(rain, tmax) {
  if (rain >= 64.5) return "⛈️";
  if (rain >= 10) return "🌧️";
  if (rain >= 2.5) return "🌦️";
  if (tmax >= 38) return "☀️";
  return "⛅";
}

function warningMap(el, warnings, day) {
  const m = newMap(el, {});
  const by = Object.fromEntries(warnings.filter((w) => w.day === day).map((w) => [w.state, w]));
  m.ready.then(() => {
    m.statesLayer.setStyle((f) => {
      const w = by[f.properties.name];
      return { fill: true, fillColor: warnColor(w ? w.level : "green"), fillOpacity: w && w.level !== "green" ? 0.75 : 0.25, weight: 0.6 };
    });
    m.statesLayer.eachLayer((l) => {
      const w = by[l.feature.properties.name];
      const tip = w ? `<b>${esc(stateName(w.state))}</b><br>${esc(t("warn_" + w.level))}<br>${esc(t("cat_heavy"))}: ${w.heavy_pct}% · max ${w.rain_max} mm` : esc(stateName(l.feature.properties.name));
      l.bindTooltip(tip, { sticky: true });
    });
  });
  return m;
}

function warnLegend() {
  return `<div class="legendrow">${LEVEL_ORDER.map((l) => `<span class="pill"><span class="dot lv-${l}"></span>${esc(t("warn_" + l))}</span>`).join("")}</div>`;
}

function trackOk(pts) {
  return pts.every((p, i) => i === 0 || Math.abs(p.lat - pts[i - 1].lat) + Math.abs(p.lon - pts[i - 1].lon) <= 3);
}
function significantTracks(stats, init, storms) {
  const out = {};
  for (const [basin, pts] of Object.entries(stats.tracks || {})) {
    let sea = pts.filter((p) => !p.land);
    if (!sea.length && storms && matchStorm(pts, init, storms)) sea = pts;
    if (!sea.length || !trackOk(pts)) continue;
    if (Math.max(...sea.map((p) => CATEGORIES.indexOf(p.category))) < 1) continue;
    out[basin] = pts;
  }
  return out;
}

function drawTrack(m, pts, init, opts = {}) {
  const g = L.layerGroup();
  const weight = opts.weight || 2;
  if (opts.strength) {
    if (!opts.thin && !opts.dash) L.polyline(pts.map((p) => [p.lat, p.lon]), { pane: "lines", color: opts.color || "#111", weight: weight + 3, opacity: 0.5 }).addTo(g);
    pts.slice(1).forEach((p, i) => {
      const ci = Math.max(CATEGORIES.indexOf(pts[i].category), CATEGORIES.indexOf(p.category));
      L.polyline([[pts[i].lat, pts[i].lon], [p.lat, p.lon]], { pane: "lines", color: CAT_COLORS[ci], weight,
        opacity: opts.opacity ?? 0.95, dashArray: opts.dash, lineCap: "round" }).addTo(g);
    });
  } else {
    L.polyline(pts.map((p) => [p.lat, p.lon]), { pane: "lines", color: opts.color || "#111", weight,
      opacity: opts.opacity ?? 0.9, dashArray: opts.dash }).addTo(g);
  }
  if (!opts.thin) {
    for (const p of pts) {
      const ci = CATEGORIES.indexOf(p.category);
      const style = opts.hollow ? { radius: 3 + ci, color: CAT_COLORS[ci], weight: 2, fillColor: cssVar("--surface"), fillOpacity: 1 }
        : { radius: 4 + ci, color: "#fff", weight: 1.5, fillColor: CAT_COLORS[ci], fillOpacity: 1 };
      L.circleMarker([p.lat, p.lon], { pane: "lines", ...style })
        .bindTooltip(`${opts.label ? `<b>${esc(opts.label)}</b><br>` : ""}${fmtTime(init + p.lead_h * 36e5)}<br>${esc(catName(p.category))}<br>${p.msl} hPa · ${p.wind_kt} kt${p.adj > 1 ? ` (${esc(t("model_kt"))} ${p.model_kt} kt)` : ""}`)
        .addTo(g);
    }
  }
  return g;
}

/* ---------- pages ---------- */

async function home(main) {
  const tag = S.params.run, entry = runEntry(tag);
  const [stats, warnings, text] = await Promise.all([runStats(tag), getJSON(`runs/${tag}/warnings.json`), getText(`runs/${tag}/bulletin.${S.lang}.md`)]);
  const init = tagTime(tag);
  const wins = dayWindows(stats);
  const feats = text ? mdSection(text, 1) : [];
  main.innerHTML = `
    <section class="card hero">
      <h1>${esc(t("site"))}: ${esc(fmtTime(init))}</h1>
      <div class="when">${esc(t("run"))} ${esc(entry.tag.slice(8))}Z · ${esc(S.kind === "raw" ? t("raw") : t("corrected"))} · ${wins.length} ${esc(t("days"))}</div>
      <ul>${feats.map((f) => `<li>${md(f).replace(/^<p>|<\/p>$/g, "")}</li>`).join("")}</ul>
      <div><a href="${link("bulletin")}">${esc(t("read_bulletin"))} →</a></div>
    </section>
    <div class="grid g2">
      <section class="card"><div class="card-head"><h2>${esc(t("warnings_title"))}</h2>${tag !== latestTag() ? `<button type="button" id="to-latest" class="btn-latest">${esc(t("show_latest"))} →</button>` : ""}</div><div id="wdays" class="row"></div>
        <div id="wmap" class="map small" style="margin-top:8px"></div>${warnLegend()}</section>
      <section class="card"><h2>${esc(t("changed_title"))}</h2><div id="changes" class="small"></div></section>
    </div>
    <section class="card"><h2>${esc(t("cities_title"))}</h2><div id="cdays" class="row" style="margin-bottom:8px"></div><div id="cities" class="cities"></div></section>
    ${subscribeCard()}`;
  wireSubscribe();
  if ($("#to-latest")) $("#to-latest").onclick = () => setParams({ run: latestTag(), day: undefined }, false);
  let day = 1, wm = null;
  const drawWarn = () => { if (wm) { wm.map.remove(); S.maps = S.maps.filter((x) => x !== wm); } wm = warningMap($("#wmap"), warnings || [], day); };
  const drawCities = () => {
    $("#cities").innerHTML = S.cities.filter((c) => c.featured).map((c) => {
      const d = cityDaily(stats, c.name).find((x) => x.d === day);
      if (!d) return "";
      return `<a class="city" href="${link("city", { c: c.name })}"><div class="row" style="justify-content:space-between">
        <span class="cn">${esc(cityName(c))}</span><span class="icon">${weatherIcon(d.rain, d.tmax)}</span></div>
        <div class="vals"><span><span class="t-max">${r0(d.tmax)}°</span> / <span class="t-min">${r0(d.tmin)}°</span></span>
        <span>${d.rain.toFixed(0)} mm</span><span>${(d.wind * 1.852).toFixed(0)} km/h</span></div></a>`;
    }).join("");
  };
  const dayBtns = (el, cb) => el.appendChild(seg(wins.map((w) => [w.d, dayLabel(w)]), day, (v) => { day = v; drawWarn(); drawCities(); syncBtns(); }));
  const syncBtns = () => document.querySelectorAll("#wdays button, #cdays button").forEach((b, i) => b.classList.toggle("on", (i % wins.length) + 1 === day));
  dayBtns($("#wdays")); dayBtns($("#cdays"));
  drawWarn(); drawCities();
  $("#changes").innerHTML = await changesSincePrevious(tag, stats, warnings);
}

async function changesSincePrevious(tag, stats, warnings) {
  const idx = S.runs.findIndex((r) => r.tag === tag);
  const prev = S.runs.slice(idx + 1).find((r) => r.hindcast === runEntry(tag).hindcast) || S.runs[idx + 1];
  if (!prev) return esc(t("no_prev"));
  const [pw, ps] = await Promise.all([getJSON(`runs/${prev.tag}/warnings.json`), runStats(prev.tag)]);
  if (!pw || !ps) return esc(t("no_prev"));
  const dayKey = (w) => fmtTime(w.a, { weekday: true, date: true });
  const prevDay = Object.fromEntries(dayWindows(ps).map((w) => [dayKey(w), w.d]));
  const level = (ws, d) => {
    const out = {};
    for (const w of ws) if (w.day === d) out[w.state] = LEVEL_ORDER.indexOf(w.level);
    return out;
  };
  const rows = dayWindows(stats).map((w) => {
    const pd = prevDay[dayKey(w)];
    if (pd === undefined) return "";
    const a = level(pw, pd), b = level(warnings || [], w.d);
    const items = Object.keys(b).filter((s) => (a[s] ?? 0) !== b[s]).sort((x, y) => b[y] - b[x]).map((s) => {
      const from = LEVEL_ORDER[a[s] ?? 0], to = LEVEL_ORDER[b[s]];
      return `<li><span class="dot lv-${from}"></span> → <span class="dot lv-${to}"></span> ${esc(stateName(s))}: ${esc(t("warn_" + from))} → <b>${esc(t("warn_" + to))}</b></li>`;
    });
    return items.length ? `<h3 class="chday">${esc(dayLabel(w))}</h3><ul>${items.join("")}</ul>` : "";
  }).join("");
  const ta = significantTracks(ps), tb = significantTracks(stats);
  const sys = [];
  for (const basin of new Set([...Object.keys(ta), ...Object.keys(tb)])) {
    const pa = ta[basin] ? Math.min(...ta[basin].map((p) => p.msl)) : null, pb = tb[basin] ? Math.min(...tb[basin].map((p) => p.msl)) : null;
    sys.push(`<li>${esc(seaName(basin))}: ${pa ?? "—"} → <b>${pb ?? "—"}</b> hPa (${esc(t("pressure"))})</li>`);
  }
  return `<p class="muted">${esc(runLabel(prev))} → ${esc(runLabel(runEntry(tag)))}</p>
    ${sys.length ? `<ul>${sys.join("")}</ul>` : ""}${rows || `<p>${esc(t("no_change"))}</p>`}
    <a href="${link("compare", { a: prev.tag, b: tag })}">${esc(t("nav_compare"))} →</a>`;
}

async function bulletin(main) {
  const tag = S.params.run, entry = runEntry(tag);
  const text = await getText(`runs/${tag}/bulletin.${S.lang}.md`);
  const pdfs = (entry.pdf || []).map((l) => `<a href="runs/${tag}/forecast_bulletin_${l}.pdf" download>${esc(t("download_pdf"))} (${l.toUpperCase()})</a>`).join(" · ");
  main.innerHTML = `<article class="card bulletin">${text ? md(text) : esc(t("loading"))}<p>${pdfs}</p></article>`;
}

async function maps(main) {
  const meta = await runMeta(S.params.run);
  const grid = await loadGrid(meta, S.kind);
  const times = grid.validTimes();
  let layer = LAYERS.includes(S.params.layer) ? S.params.layer : "rain24";
  let ti = Math.min(+S.params.t || 4, times.length - 1);
  let iso = layer === "msl", parts = layer.startsWith("wind");
  main.innerHTML = `<section class="card"><div class="toolbar" id="tb"></div><div id="map" class="map tall"></div>
    <div id="slider"></div><p class="muted small">${esc(t("click_hint"))}</p></section>`;
  const tb = $("#tb");
  tb.appendChild(seg(LAYERS.map((l) => [l, t(LAYER_KEYS[l])]), layer, (v) => { layer = v; iso = v === "msl"; parts = v.startsWith("wind"); syncChecks(); setParams({ layer: v }); draw(); }));
  const checks = h(`<div class="row"><label><input type="checkbox" id="iso"> ${esc(t("isobars"))}</label>
    <label><input type="checkbox" id="parts"> ${esc(t("particles"))}</label></div>`);
  tb.appendChild(checks);
  const syncChecks = () => { $("#iso").checked = iso; $("#parts").checked = parts; };
  $("#iso").onchange = (e) => { iso = e.target.checked; draw(); };
  $("#parts").onchange = (e) => { parts = e.target.checked; draw(); };
  syncChecks();
  const m = newMap($("#map"));
  await m.ready;
  const draw = () => {
    const f = grid.field(layer, ti);
    m.setField(f, SCALES[layer], { title: t(LAYER_KEYS[layer]) });
    m.setIsolines(iso ? grid.raw("msl", ti) : null, 2);
    const [u, v] = grid.winds(layer === "wind850" ? "wind850" : "wind10", ti);
    m.setParticles(parts ? u : null, parts ? v : null);
  };
  $("#slider").appendChild(timeSlider(times, ti, (i) => { ti = i; setParams({ t: i }); draw(); },
    (ms, i) => `${fmtTime(ms)} · +${grid.leads[i]} h`));
  m.map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    const val = (name, d = 1) => { const f = grid.field(name, ti); return f ? grid.at(f, lat, lng).toFixed(d) : "—"; };
    L.popup().setLatLng(e.latlng).setContent(`<b>${lat.toFixed(2)}°N ${lng.toFixed(2)}°E</b><br>
      ${esc(t("l_t2m"))}: ${val("t2m")} °C<br>${esc(t("l_rain24"))}: ${val("rain24")} mm<br>
      ${esc(t("l_wind10"))}: ${(+val("wind10") * 3.6).toFixed(0)} km/h<br>${esc(t("l_msl"))}: ${val("msl")} hPa<br>
      <a href="${link("city", { lat: lat.toFixed(2), lon: lng.toFixed(2) })}">${esc(t("nav_city"))} →</a>`).openOn(m.map);
  });
  draw();
}

function meteogramSeries(grid, lat, lon) {
  const n = grid.leads.length, out = { time: grid.validTimes(), t2m: [], tp: [], ws: [], wd: [], msl: [] };
  for (let i = 0; i < n; i++) {
    const u = grid.at(grid.raw("u10m", i), lat, lon), v = grid.at(grid.raw("v10m", i), lat, lon);
    out.t2m.push(grid.at(grid.raw("t2m", i), lat, lon));
    out.tp.push(i === 0 ? null : grid.at(grid.raw("tp", i), lat, lon));
    out.ws.push(Math.hypot(u, v) * 3.6);
    out.wd.push((Math.atan2(-u, -v) * 180) / Math.PI);
    out.msl.push(grid.at(grid.raw("msl", i), lat, lon));
  }
  return out;
}

function meteograms(el, series) {
  const c = chartColors();
  const colors = [c.s1, c.s2, c.s3];
  const times = [...new Set(series.flatMap((s) => s.data.time))].sort((a, b) => a - b);
  const labels = times.map((x) => fmtTime(x));
  const align = (s, key) => times.map((x) => { const i = s.data.time.indexOf(x); return i < 0 ? null : s.data[key][i]; });
  const panels = [["m_temp", "t2m", "line"], ["m_rain", "tp", "bar"], ["m_wind", "ws", "line"], ["m_msl", "msl", "line"]];
  el.innerHTML = panels.map(([k]) => `<div><div class="small muted">${esc(t(k))}</div><div class="chartbox"><canvas></canvas></div></div>`).join("");
  el.querySelectorAll("canvas").forEach((cv, pi) => {
    const [, key, type] = panels[pi];
    makeChart(cv, {
      type,
      data: { labels, datasets: series.map((s, si) => ({
        label: s.label, data: align(s, key).map((v) => (v === null || !Number.isFinite(v) ? null : +v.toFixed(1))),
        borderColor: colors[si], backgroundColor: type === "bar" ? colors[si] : colors[si], borderWidth: 2,
        borderDash: si === 0 && series.length > 1 ? [5, 4] : [], pointRadius: key === "ws" ? 5 : 0, pointHoverRadius: 5,
        pointStyle: key === "ws" ? "triangle" : "circle", rotation: key === "ws" ? align(s, "wd").map((d) => (d ?? 0) + 180) : 0,
        borderRadius: 4, spanGaps: true, tension: 0.25,
      })) },
      options: { maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: series.length > 1, labels: { boxWidth: 12 } } },
        scales: { x: { ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0 }, grid: { display: false } }, y: { grid: { color: c.grid } } } },
    });
  });
}

async function city(main) {
  const meta = await runMeta(S.params.run);
  const grid = await loadGrid(meta, S.kind);
  let place = S.cities.find((c) => c.name === S.params.c);
  if (!place && S.params.lat) place = { name: `${(+S.params.lat).toFixed(2)}°N ${(+S.params.lon).toFixed(2)}°E`, lat: +S.params.lat, lon: +S.params.lon };
  if (!place) place = S.cities.find((c) => c.name === "Pune");
  main.innerHTML = `<section class="card"><div class="toolbar">
      <input type="search" id="q" list="citylist" placeholder="${esc(t("search_city"))}" style="min-width:240px">
      <datalist id="citylist">${S.cities.map((c) => `<option value="${esc(cityName(c))}">`).join("")}</datalist>
      <button type="button" id="geo">📍 ${esc(t("my_location"))}</button></div>
      <h2>${esc(place.hi ? cityName(place) : place.name)}</h2><div id="daily" class="tablewrap"></div></section>
    ${subscribeCard(place.hi ? place.name : null)}
    <section class="card"><div id="charts" class="charts"></div></section>`;
  wireSubscribe();
  $("#q").onchange = (e) => {
    const c = S.cities.find((x) => cityName(x) === e.target.value || x.name.toLowerCase() === e.target.value.toLowerCase());
    if (c) setParams({ c: c.name, lat: null, lon: null }, false);
  };
  $("#geo").onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(
    (p) => setParams({ c: null, lat: p.coords.latitude.toFixed(2), lon: p.coords.longitude.toFixed(2) }, false));
  const s = meteogramSeries(grid, place.lat, place.lon);
  const days = [];
  for (let d = 1; d <= Math.floor(grid.leads[grid.leads.length - 1] / 24); d++) {
    const idx = grid.leads.map((x, i) => (x > 24 * (d - 1) && x <= 24 * d ? i : -1)).filter((i) => i >= 0);
    days.push({ d, a: grid.init + (d - 1) * 864e5, tmax: Math.max(...idx.map((i) => s.t2m[i])), tmin: Math.min(...idx.map((i) => s.t2m[i])),
      rain: idx.reduce((a, i) => a + (s.tp[i] || 0), 0), wind: Math.max(...idx.map((i) => s.ws[i])) });
  }
  $("#daily").innerHTML = `<table><tr><th>${esc(t("day"))}</th><th></th><th class="num">${esc(t("tmax"))}</th><th class="num">${esc(t("tmin"))}</th>
    <th class="num">${esc(t("rain24"))}</th><th class="num">${esc(t("wind"))}</th></tr>${days.map((d) => `<tr><td>${esc(dayLabel(d))}</td>
    <td>${weatherIcon(d.rain, d.tmax)}</td><td class="num">${d.tmax.toFixed(1)} °C</td><td class="num">${d.tmin.toFixed(1)} °C</td>
    <td class="num">${d.rain.toFixed(1)} mm</td><td class="num">${d.wind.toFixed(0)} km/h</td></tr>`).join("")}</table>`;
  meteograms($("#charts"), [{ label: runLabel(runEntry(S.params.run)), data: s }]);
}

function commonTimes(ga, gb) {
  const tb = new Set(gb.validTimes());
  return ga.validTimes().filter((x) => tb.has(x));
}

async function compare(main) {
  const idx = S.runs.findIndex((r) => r.tag === S.params.run);
  const bTag = S.params.b || S.params.run;
  const aTag = S.params.a || (S.runs.slice(S.runs.findIndex((r) => r.tag === bTag) + 1).find((r) => !r.hindcast) || S.runs[idx + 1] || S.runs[idx]).tag;
  const [ma, mb] = await Promise.all([runMeta(aTag), runMeta(bTag)]);
  const [ga, gb] = await Promise.all([loadGrid(ma, S.kind), loadGrid(mb, S.kind)]);
  let layer = LAYERS.includes(S.params.layer) ? S.params.layer : "rain24";
  let mode = S.params.mode || "side";
  const times = commonTimes(ga, gb);
  const opts = S.runs.map((r) => `<option value="${r.tag}">${esc(runLabel(r))}</option>`).join("");
  main.innerHTML = `<section class="card"><div class="toolbar">
      <label class="ctl">${esc(t("compare_a"))}<select id="ra">${opts}</select></label>
      <label class="ctl">${esc(t("compare_b"))}<select id="rb">${opts}</select></label><div id="lay"></div><div id="mode"></div></div>
      <div id="maparea"></div><div id="slider"></div><p class="muted small" id="caption"></p></section>
    <div class="grid g2">
      <section class="card"><h2>${esc(t("nav_city"))}</h2><select id="cc">${S.cities.map((c) => `<option value="${esc(c.name)}">${esc(cityName(c))}</option>`).join("")}</select>
        <div id="cmet" class="charts" style="margin-top:8px"></div></section>
      <section class="card"><h2>${esc(t("tracks_title"))}</h2><div id="tmap" class="map small"></div><div id="tinfo" class="small"></div></section>
    </div>
    <section class="card"><h2>${esc(t("states_title"))}</h2><div id="stbl" class="tablewrap"></div></section>
    <section class="card"><h2>${esc(t("bulletin_diff"))}</h2><div id="bdiff" class="bulletin small"></div></section>`;
  $("#ra").value = aTag; $("#rb").value = bTag;
  $("#ra").onchange = (e) => setParams({ a: e.target.value }, false);
  $("#rb").onchange = (e) => setParams({ b: e.target.value }, false);
  if (!times.length) { $("#maparea").innerHTML = `<p>${esc(t("no_common"))}</p>`; }
  let ti = Math.min(+S.params.t || times.length - 1, times.length - 1);
  let mapsNow = [];
  const build = () => {
    for (const m of mapsNow) { m.map.remove(); S.maps = S.maps.filter((x) => x !== m); }
    mapsNow = [];
    const area = $("#maparea");
    if (!times.length) return;
    if (mode === "side") {
      area.innerHTML = `<div class="grid g2"><div><b>A</b> · ${esc(runLabel(runEntry(aTag)))}<div class="map small" id="ma"></div></div>
        <div><b>B</b> · ${esc(runLabel(runEntry(bTag)))}<div class="map small" id="mb"></div></div></div>`;
      mapsNow = [newMap($("#ma")), newMap($("#mb"))];
      mapsNow[0].sync(mapsNow[1]);
    } else {
      area.innerHTML = `<div class="map" id="mm"></div>${mode === "swipe" ? `<div class="swipe-wrap"><input type="range" id="sw" min="0" max="100" value="50"></div>
        <div class="row small"><span>◀ A</span><span style="margin-left:auto">B ▶</span></div>` : ""}`;
      mapsNow = [newMap($("#mm"))];
      if (mode === "swipe") $("#sw").oninput = (e) => mapsNow[0].clip(+e.target.value);
    }
    draw();
  };
  const draw = () => {
    if (!times.length) return;
    const ia = ga.leadIndexAt(times[ti]), ib = gb.leadIndexAt(times[ti]);
    const fa = ga.field(layer, ia), fb = gb.field(layer, ib);
    const title = t(LAYER_KEYS[layer]);
    if (mode === "side") {
      mapsNow[0].setField(fa, SCALES[layer], { title }); mapsNow[1].setField(fb, SCALES[layer], { title });
      if (layer === "msl") { mapsNow[0].setIsolines(fa, 2); mapsNow[1].setIsolines(fb, 2); }
    } else if (mode === "swipe") {
      mapsNow[0].setField(fa, SCALES[layer], { title });
      mapsNow[0].setField(fb, SCALES[layer], { top: true, legend: false });
      mapsNow[0].clip(+$("#sw").value);
    } else if (fa && fb) {
      const d = fb.map((v, k) => v - fa[k]);
      mapsNow[0].setField(d, DIFF_SCALES[layer], { title: `${title}: B − A` });
      if (layer === "msl") mapsNow[0].setIsolines(fb, 2);
      $("#caption").textContent = diffCaption(d, layer);
    } else mapsNow[0].setField(null);
    if (mode !== "diff") $("#caption").textContent = "";
  };
  $("#lay").appendChild(seg(LAYERS.map((l) => [l, t(LAYER_KEYS[l])]), layer, (v) => { layer = v; setParams({ layer: v }); draw(); }));
  $("#mode").appendChild(seg([["side", t("side")], ["swipe", t("swipe")], ["diff", t("diff")]], mode, (v) => { mode = v; setParams({ mode: v }); build(); }));
  if (times.length) {
    $("#slider").appendChild(timeSlider(times, ti, (i) => { ti = i; setParams({ t: i }); draw(); }, (ms) =>
      `${fmtTime(ms)} · A +${ga.leads[ga.leadIndexAt(ms)]} h · B +${gb.leads[gb.leadIndexAt(ms)]} h`));
  }
  build();

  const drawCity = () => {
    const c = S.cities.find((x) => x.name === $("#cc").value);
    meteograms($("#cmet"), [{ label: `A ${runLabel(runEntry(aTag))}`, data: meteogramSeries(ga, c.lat, c.lon) },
      { label: `B ${runLabel(runEntry(bTag))}`, data: meteogramSeries(gb, c.lat, c.lon) }]);
  };
  $("#cc").value = S.params.c || "Bhubaneswar";
  $("#cc").onchange = () => { S.charts.forEach((ch) => ch.destroy()); S.charts = []; setParams({ c: $("#cc").value }); drawCity(); };
  drawCity();

  const [sa, sb, wa, wb, ta, tbx] = await Promise.all([runStats(aTag), runStats(bTag), getJSON(`runs/${aTag}/warnings.json`),
    getJSON(`runs/${bTag}/warnings.json`), getText(`runs/${aTag}/bulletin.${S.lang}.md`), getText(`runs/${bTag}/bulletin.${S.lang}.md`)]);
  const tm = newMap($("#tmap"));
  await tm.ready;
  const c = chartColors();
  const info = [];
  for (const [label, st, color, dash] of [["A", sa, c.s1, "6 5"], ["B", sb, c.s2, null]]) {
    for (const [basin, pts] of Object.entries(significantTracks(st))) {
      tm.addLayer(`${label}${basin}`, drawTrack(tm, pts, tagTime(label === "A" ? aTag : bTag), { color, dash }));
      const low = pts.reduce((x, p) => (p.msl < x.msl ? p : x));
      info.push(`<li><b>${label}</b> ${esc(seaName(basin))}: ${low.msl} hPa, ${low.wind_kt} kt, ${esc(catName(low.category))} · ${fmtTime(tagTime(label === "A" ? aTag : bTag) + low.lead_h * 36e5)}</li>`);
    }
  }
  $("#tinfo").innerHTML = info.length ? `<ul>${info.join("")}</ul>` : esc(t("no_system"));

  const lvl = (ws) => { const o = {}; for (const w of ws || []) { o[w.state] = o[w.state] || { level: 0, max: 0 }; o[w.state].level = Math.max(o[w.state].level, LEVEL_ORDER.indexOf(w.level)); o[w.state].max = Math.max(o[w.state].max, w.rain_max); } return o; };
  const tx = (st) => { const o = {}; for (const r of st.states) o[r.state] = Math.max(o[r.state] ?? -99, r.tmax_max); return o; };
  const la = lvl(wa), lb = lvl(wb), xa = tx(sa), xb = tx(sb);
  const states = Object.keys(lb).sort((p, q) => (lb[q].level - (la[q]?.level ?? 0)) - (lb[p].level - (la[p]?.level ?? 0)) || lb[q].max - lb[p].max);
  $("#stbl").innerHTML = `<table><tr><th></th><th>A</th><th>B</th><th class="num">A max mm</th><th class="num">B max mm</th><th class="num">A ${esc(t("tmax"))}</th><th class="num">B ${esc(t("tmax"))}</th></tr>
    ${states.map((s) => { const a = la[s] || { level: 0, max: 0 }, b = lb[s]; const ch = b.level - a.level;
      return `<tr><td>${esc(stateName(s))}</td><td><span class="dot lv-${LEVEL_ORDER[a.level]}"></span></td>
      <td><span class="dot lv-${LEVEL_ORDER[b.level]}"></span> ${ch > 0 ? '<span class="up">▲</span>' : ch < 0 ? '<span class="down">▼</span>' : ""}</td>
      <td class="num">${a.max}</td><td class="num">${b.max}</td><td class="num">${(xa[s] ?? NaN).toFixed(1)}</td><td class="num">${(xb[s] ?? NaN).toFixed(1)}</td></tr>`; }).join("")}</table>`;
  if (ta && tbx) {
    const la2 = new Set(ta.split("\n").filter((l) => l.startsWith("- "))), lb2 = tbx.split("\n").filter((l) => l.startsWith("- "));
    const sb2 = new Set(lb2);
    const added = lb2.filter((l) => !la2.has(l)), removed = [...la2].filter((l) => !sb2.has(l));
    $("#bdiff").innerHTML = `<h3>${esc(t("added"))}</h3><ul>${added.map((l) => `<li class="diff-add">${md(l.slice(2)).replace(/^<p>|<\/p>$/g, "")}</li>`).join("")}</ul>
      <h3>${esc(t("removed"))}</h3><ul>${removed.map((l) => `<li class="diff-del">${md(l.slice(2)).replace(/^<p>|<\/p>$/g, "")}</li>`).join("")}</ul>`;
  }
}

function diffCaption(d, layer) {
  let k = 0;
  for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[k]) || !Number.isFinite(d[k])) k = i;
  const lat = GRID.lat0 - Math.floor(k / GRID.nx) * GRID.step, lon = GRID.lon0 + (k % GRID.nx) * GRID.step;
  const unit = SCALES[layer].legend.unit;
  return `Largest change: ${d[k] > 0 ? "+" : ""}${d[k].toFixed(1)} ${unit} near ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E (B − A).`;
}

async function obsWindow(endTag, n = 4) {
  const end = tagTime(endTag), out = new Float32Array(GRID.ny * GRID.nx);
  for (let k = 0; k < n; k++) {
    const tg = new Date(end - k * 6 * 36e5).toISOString().slice(0, 13).replace(/[-T]/g, "");
    const buf = new Int16Array(await gunzipFetch(`obs/${tg}.i16.gz`));
    for (let i = 0; i < out.length; i++) out[i] += buf[i] === -32768 ? NaN : buf[i] / 10;
  }
  return out;
}

function category(r) {
  const p = r.rainy_pct;
  const dist = p < 5 ? "none" : p > 75 ? "widespread" : p > 50 ? "fairly" : p > 25 ? "scattered" : "isolated";
  const heavy = r.xheavy_pct >= 0.5 ? "xheavy" : r.vheavy_pct >= 1 ? "vheavy" : r.heavy_pct >= 1 ? "heavy" : null;
  return { dist, heavy, rank: ["none", "isolated", "scattered", "fairly", "widespread"].indexOf(dist), hrank: [null, "heavy", "vheavy", "xheavy"].indexOf(heavy) };
}
const catLabel = (c) => `${t("cat_" + c.dist)}${c.heavy ? ", " + t("cat_" + c.heavy) : ""}`;

async function observed(main) {
  let tag = S.params.run;
  let ob = await getJSON(`runs/${tag}/observed.json`);
  const withObs = S.runs.filter((r) => r.observed_days > 0);
  let note = "";
  if (!ob || !ob.days.length) {
    const fb = withObs[0];
    if (!fb) {
      main.innerHTML = `<section class="card"><h2>${esc(t("obs_title"))}</h2><p>${esc(t("obs_none"))}</p></section>`;
      return;
    }
    note = `<p class="small muted">${esc(t("obs_none"))} ${esc(t("obs_showing"))} ${esc(runLabel(fb))}.</p>`;
    tag = fb.tag;
    ob = await getJSON(`runs/${tag}/observed.json`);
  }
  const meta = await runMeta(tag);
  const grid = await loadGrid(meta, S.kind);
  const day = ob.days.find((d) => d.day === +S.params.day) || ob.days[ob.days.length - 1];
  const sc = day.scores[S.kind];
  const prodKey = { late: "obs_late", early: "obs_early", mixed: "obs_mixed" }[day.product];
  main.innerHTML = `<section class="card"><h2>${esc(t("obs_title"))}</h2>${note}<div class="toolbar">
      <label class="ctl"><span>${esc(t("run"))}</span><select id="obs-run">${withObs.map((r) =>
        `<option value="${r.tag}"${r.tag === tag ? " selected" : ""}>${esc(runLabel(r))} · ${r.observed_days} ${esc(t("days"))}</option>`).join("")}</select></label>
      <div id="days"></div>
      <span class="pill">${esc(t(prodKey))}</span><span class="muted small">${esc(fmtTime(tagTime(day.start)))} → ${esc(fmtTime(tagTime(day.end)))}</span></div>
      <div class="grid g3"><div><b>${esc(t("forecast"))}</b><div id="mf" class="map small"></div></div>
      <div><b>${esc(t("observed"))}</b><div id="mo" class="map small"></div></div>
      <div><b>${esc(t("difference"))}</b><div id="md" class="map small"></div></div></div></section>
    <div class="grid g2"><section class="card"><h2>${esc(t("scores"))}</h2><div class="kpis" id="kpis"></div>
      <div class="tablewrap" style="margin-top:10px" id="sctbl"></div></section>
      <section class="card"><h2>${esc(t("best_title"))}</h2><div class="chartbox tall"><canvas id="best"></canvas></div><div id="bestlist" class="small"></div></section></div>
    <section class="card"><h2>${esc(t("obs_states"))}</h2><div id="stbl" class="tablewrap"></div></section>
    <section class="card"><h2>${esc(t("city_bars"))}</h2><div class="chartbox" style="height:520px"><canvas id="cbars"></canvas></div></section>`;
  $("#obs-run").onchange = (e) => setParams({ run: e.target.value, day: undefined }, false);
  $("#days").appendChild(seg(ob.days.map((d) => [d.day, `${t("day")} ${d.day}`]), day.day, (v) => setParams({ day: v }, false)));
  const leadEnd = grid.leads.indexOf(day.day * 24);
  const fc = grid.accum(leadEnd, 24);
  const obs = await obsWindow(day.end);
  const diff = fc.map((v, k) => v - obs[k]);
  const [mf, mo, mdm] = [newMap($("#mf")), newMap($("#mo")), newMap($("#md"))];
  mf.sync(mo); mo.sync(mdm);
  await Promise.all([mf.ready, mo.ready, mdm.ready]);
  mf.setField(fc, SCALES.rain24, { title: t("forecast") });
  mo.setField(obs, SCALES.rain24, { title: t("observed") });
  mdm.setField(diff, OBS_DIFF, { title: t("difference") });
  const f2 = (x) => (x === null || x === undefined ? "—" : x.toFixed(2));
  $("#kpis").innerHTML = [[t("ets") + " ≥2.5", f2(sc["ets_2.5mm"])], [t("pod") + " ≥2.5", f2(sc["pod_2.5mm"])], [t("far") + " ≥2.5", f2(sc["far_2.5mm"])],
    [t("ets") + " ≥64.5", f2(sc["ets_64.5mm"])], [t("area_mean"), `${sc.fc_mean.toFixed(1)} / ${sc.obs_mean.toFixed(1)} mm`]]
    .map(([l, v]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");
  const other = day.scores[S.kind === "raw" ? "corrected" : "raw"];
  $("#sctbl").innerHTML = `<table><tr><th></th><th class="num">${esc(t("corrected"))}</th><th class="num">${esc(t("raw"))}</th></tr>
    ${["ets_2.5mm", "pod_2.5mm", "far_2.5mm", "fbias_2.5mm", "ets_64.5mm", "pod_64.5mm", "fbias_64.5mm"].map((k) =>
      `<tr><td>${k}</td><td class="num">${f2(day.scores.corrected[k])}</td><td class="num">${f2(day.scores.raw[k])}</td></tr>`).join("")}</table>`;
  void other;
  const rows = day.states.map((r) => {
    const f = category(r[S.kind]), o = category(r.obs);
    const spread = f.rank === o.rank ? "hit" : !f.rank ? "miss" : !o.rank ? "false_alarm" : Math.abs(f.rank - o.rank) === 1 ? "partly" : f.rank > o.rank ? "over" : "under";
    const heavy = !f.hrank && !o.hrank ? null : f.hrank === o.hrank ? "hit" : !o.hrank ? "false_alarm" : !f.hrank ? "miss" : f.hrank > o.hrank ? "over" : "under";
    return { s: r.state, f, o, spread, heavy, favg: r[S.kind].rain_mean, oavg: r.obs.rain_mean, fmax: r[S.kind].rain_max, omax: r.obs.rain_max };
  });
  const cls = { hit: "ok", partly: "part", over: "up", false_alarm: "up", under: "down", miss: "down" };
  const sym = { hit: "✓", partly: "≈", over: "↑", false_alarm: "↑", under: "↓", miss: "↓" };
  const mark = (v) => (v ? `<span class="${cls[v]}">${sym[v]} ${esc(t(v))}</span>` : "—");
  const n = rows.length, cnt = (fn) => rows.filter(fn).length;
  const good = cnt((r) => r.spread === "hit" && (!r.heavy || r.heavy === "hit"));
  const part = cnt((r) => r.spread === "partly" || (r.spread === "hit" && r.heavy && r.heavy !== "hit"));
  const summary = t("st_summary").replace("{a}", good).replace("{n}", n).replace("{b}", part).replace("{e}", n - good - part)
    .replace("{c}", cnt((r) => r.heavy === "miss" || r.heavy === "under")).replace("{d}", cnt((r) => r.heavy === "false_alarm" || r.heavy === "over"));
  const order = { miss: 0, under: 1, false_alarm: 2, over: 3, partly: 4, hit: 5 };
  const shown = rows.filter((r) => r.f.rank > 0 || r.o.rank > 0)
    .sort((a, b) => (order[a.heavy] ?? 9) - (order[b.heavy] ?? 9) || order[a.spread] - order[b.spread] || b.o.rank - a.o.rank || b.oavg - a.oavg);
  $("#stbl").innerHTML = `<p><b>${esc(summary)}</b></p><table><tr><th></th><th>${esc(t("forecast"))}</th><th>${esc(t("observed"))}</th><th>${esc(t("spread_col"))}</th>
    <th>${esc(t("heavy_col"))}</th><th class="num">${esc(t("avg_mm"))}</th><th class="num">${esc(t("max_mm"))}</th></tr>
    ${shown.map((r) => `<tr><td>${esc(stateName(r.s))}</td><td>${esc(catLabel(r.f))}</td><td>${esc(catLabel(r.o))}</td><td>${mark(r.spread)}</td><td>${mark(r.heavy)}</td>
      <td class="num">${r.favg.toFixed(1)} / ${r.oavg.toFixed(1)}</td><td class="num">${r.fmax} / ${r.omax}</td></tr>`).join("")}</table>
    <p class="muted small">${esc(t("st_rule"))}</p>`;
  const board = (await getJSON("scoreboard.json")) || [];
  const same = board.filter((b) => b.end === day.end).sort((a, b) => a.day - b.day || a.tag.localeCompare(b.tag));
  const c = chartColors();
  makeChart($("#best"), {
    type: "bar",
    data: { labels: same.map((b) => `${t("day")} ${b.day} · ${runLabel(runEntry(b.tag) || { tag: b.tag })}`),
      datasets: [{ label: t("corrected"), data: same.map((b) => b["corrected_ets_2.5mm"]), backgroundColor: c.s1, borderRadius: 4 },
        { label: t("raw"), data: same.map((b) => b["raw_ets_2.5mm"]), backgroundColor: c.s2, borderRadius: 4 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { boxWidth: 12 } } },
      scales: { x: { title: { display: true, text: `${t("ets")} ≥ 2.5 mm` } }, y: { grid: { display: false } } } },
  });
  $("#bestlist").innerHTML = same.map((b) => `<a href="${link("observed", { run: b.tag, day: b.day })}">${esc(runLabel(runEntry(b.tag) || { tag: b.tag }))}</a>`).join(" · ");
  const fc_ = S.cities.filter((x) => x.featured);
  makeChart($("#cbars"), {
    type: "bar",
    data: { labels: fc_.map(cityName), datasets: [
      { label: t("forecast"), data: fc_.map((x) => (day.cities[x.name] || [])[S.kind === "raw" ? 0 : 1]), backgroundColor: c.s1, borderRadius: 4 },
      { label: t("observed"), data: fc_.map((x) => (day.cities[x.name] || [])[2]), backgroundColor: c.s3, borderRadius: 4 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { boxWidth: 12 } } },
      scales: { x: { title: { display: true, text: "mm / 24 h" } }, y: { grid: { display: false }, ticks: { autoSkip: false } } } },
  });
}

const OBS_CATS = [[17, 0], [28, 2], [34, 3], [48, 4], [64, 5], [Infinity, 6]];
function ktCat(kt) { return OBS_CATS.find(([lim]) => kt < lim)[1]; }
function stormName(s) { return s.name ? `${t("cyclone_word")} ${s.name}` : `${t("system_word")} ${s.code}`; }
function obsTime(o) { return Date.parse(`${o.time}:00Z`); }
const LANDFALL_KEEP_MS = 2 * 864e5;
function pastLandfall(s) { return !!s.landfall && Date.now() - obsTime({ time: s.landfall }) > LANDFALL_KEEP_MS; }
async function loadStorms() { return (await Promise.all(S.storms.filter((s) => !pastLandfall(s)).map((s) => getJSON(`storms/${s.id}.json`)))).filter(Boolean); }
function matchStorm(pts, init, storms) {
  const near = (p, o) => o && Math.abs(p.lat - o.lat) + Math.abs(p.lon - o.lon) <= 3;
  return storms.find((s) => {
    const last = obsTime(s.obs[s.obs.length - 1]);
    const known = [...s.obs, ...(s.forecast || []).filter((f) => obsTime(f) > last)];
    return pts.some((p) => near(p, positionAt(known, init + p.lead_h * 36e5)));
  }) || null;
}
function jtwcFor(s, init) {
  const fcs = s.forecasts || { [s.issued]: s.forecast };
  const ok = Object.keys(fcs).filter((k) => obsTime({ time: k }) <= init && obsTime({ time: k }) >= init - 12 * 36e5).sort();
  return ok.length ? fcs[ok[ok.length - 1]] : [];
}
function drawObserved(m, s, pts = s.obs, opts = {}) {
  const g = L.layerGroup();
  L.polyline(pts.map((o) => [o.lat, o.lon]), { pane: "lines", color: cssVar("--text"), weight: 3, opacity: 0.9, dashArray: opts.dash }).addTo(g);
  for (const o of pts) {
    const ci = ktCat(o.kt);
    L.circleMarker([o.lat, o.lon], { pane: "lines", radius: opts.dash ? 4 : 5, color: cssVar("--text"), weight: 2, fillColor: opts.dash ? cssVar("--surface") : CAT_COLORS[ci], fillOpacity: 1 })
      .bindTooltip(`<b>${esc(stormName(s))}</b> · ${esc(t(opts.dash ? "jtwc_forecast" : "observed_track"))}<br>${fmtTime(obsTime(o))}<br>${esc(catName(CATEGORIES[ci]))} · ${o.kt} kt`).addTo(g);
  }
  if (!opts.dash) {
    const last = pts[pts.length - 1];
    L.circleMarker([last.lat, last.lon], { pane: "lines", radius: 0, opacity: 0, fillOpacity: 0 })
      .bindTooltip(esc(stormName(s)), { permanent: true, direction: "right", offset: [10, 0], className: "storm-label" }).addTo(g);
  }
  return g;
}
function obsTable(s) {
  return `<h3>${esc(stormName(s))} · ${esc(t("observed_track"))}</h3><div class="tablewrap"><table><tr><th>${esc(t("time"))}</th><th>${esc(t("position"))}</th>
    <th class="num">${esc(t("maxwind"))}</th><th>${esc(t("category"))}</th></tr>${s.obs.map((o) => `<tr><td>${fmtTime(obsTime(o))}</td>
    <td>${o.lat.toFixed(1)}°N ${o.lon.toFixed(1)}°E</td><td class="num">${o.kt} kt</td>
    <td><span class="dot" style="background:${CAT_COLORS[ktCat(o.kt)]}"></span> ${esc(catName(CATEGORIES[ktCat(o.kt)]))}</td></tr>`).join("")}</table></div>`;
}
function jtwcTable(s, fc) {
  return `<h3>${esc(stormName(s))} · ${esc(t("jtwc_forecast"))}</h3><div class="tablewrap"><table><tr><th>${esc(t("time"))}</th><th>${esc(t("position"))}</th>
    <th class="num">${esc(t("maxwind"))}</th><th>${esc(t("category"))}</th></tr>${fc.map((o) => `<tr><td>${fmtTime(obsTime(o))}</td>
    <td>${o.lat.toFixed(1)}°N ${o.lon.toFixed(1)}°E</td><td class="num">${o.kt} kt</td>
    <td><span class="dot" style="background:${CAT_COLORS[ktCat(o.kt)]}"></span> ${esc(catName(CATEGORIES[ktCat(o.kt)]))}</td></tr>`).join("")}</table></div>`;
}
function namedCard() {
  const rows = S.storms.map((s) => `<tr><td><a href="${link("cyclone", { storm: s.id })}"><b>${esc(stormName(s))}</b></a>${s.active ? ` <span class="pill">${esc(t("active"))}</span>` : ""}</td>
    <td>${esc(seaName(s.basin))}</td><td>${fmtTime(obsTime({ time: s.start }), { weekday: false })} – ${fmtTime(obsTime({ time: s.end }), { weekday: false })}</td>
    <td class="num">${s.peak_kt} kt</td><td><span class="dot" style="background:${CAT_COLORS[ktCat(s.peak_kt)]}"></span> ${esc(catName(CATEGORIES[ktCat(s.peak_kt)]))}</td></tr>`).join("");
  return `<section class="card"><h2>${esc(t("named_title"))}</h2>${rows ? `<div class="tablewrap"><table><tr><th></th><th>${esc(t("sea"))}</th><th>${esc(t("dates"))}</th>
    <th class="num">${esc(t("peak"))}</th><th>${esc(t("category"))}</th></tr>${rows}</table></div>` : esc(t("no_named"))}
    <p class="muted small">${esc(t("jtwc_note"))}</p></section>`;
}

async function stormView(main, id) {
  const s = await getJSON(`storms/${id}.json`);
  if (!s) return setParams({ storm: undefined }, false);
  const t0 = obsTime({ time: s.start }) - 5 * 864e5, t1 = obsTime({ time: s.end });
  const runs = S.runs.filter((r) => !r.hindcast && tagTime(r.tag) >= t0 && tagTime(r.tag) <= t1 + 864e5);
  const stats = await Promise.all(runs.map((r) => runStats(r.tag)));
  const entry = S.storms.find((x) => x.id === id) || {};
  main.innerHTML = `<section class="card"><div class="card-head"><h2>${esc(stormName(s))} · ${esc(seaName(s.basin))}</h2>
      <button type="button" id="sback">← ${esc(t("back_runs"))}</button></div>
    <p class="muted">${fmtTime(obsTime({ time: s.start }))} – ${fmtTime(obsTime({ time: s.end }))} · ${esc(t("peak"))} ${s.peak_kt} kt (${esc(catName(CATEGORIES[ktCat(s.peak_kt)]))})</p>
    <div id="smap" class="map tall"></div>
    <div class="legendrow">${CATEGORIES.map((c, i) => `<span class="pill"><span class="dot" style="background:${CAT_COLORS[i]}"></span>${esc(catName(c))}</span>`).join("")}
      <span class="pill"><span class="lkey"></span>${esc(t("observed_track"))}</span>
      ${entry.active && s.forecast.length ? `<span class="pill"><span class="lkey dash"></span>${esc(t("jtwc_forecast"))}</span>` : ""}
      <span class="pill"><span class="lkey thin"></span>${esc(t("model_each_run"))}</span></div></section>
    <section class="card">${obsTable(s)}</section>${namedCard()}`;
  $("#sback").onclick = () => setParams({ storm: undefined }, false);
  const m = newMap($("#smap"));
  await m.ready;
  stats.forEach((st, i) => {
    if (!st) return;
    for (const [basin, pts] of Object.entries(significantTracks(st, tagTime(runs[i].tag), [s]))) {
      if (matchStorm(pts, tagTime(runs[i].tag), [s])) {
        m.addLayer(`r${i}${basin}`, drawTrack(m, pts, tagTime(runs[i].tag), { strength: true, weight: 2, opacity: 0.55, thin: true })
          .eachLayer((l) => l.bindTooltip(runLabel(runs[i]))));
      }
    }
  });
  if (entry.active && s.forecast.length) m.addLayer("jtwc", drawObserved(m, s, s.forecast, { dash: "6 6" }));
  m.addLayer("obs", drawObserved(m, s));
}

const SYS_RAIN_KM = 300;
function lastActive(pts) {
  let L = -1;
  pts.forEach((p, i) => { if (CATEGORIES.indexOf(p.category) >= 2) L = i; });
  return L;
}
function systemRain(grid, tracks, init) {
  const n = grid.ny * grid.nx, corridor = new Float32Array(n), per = {};
  const near = (k, p) => {
    const lat = GRID.lat0 - Math.floor(k / grid.nx) * GRID.step, lon = GRID.lon0 + (k % grid.nx) * GRID.step;
    return Math.hypot(111 * (lat - p.lat), 111 * Math.cos((lat * Math.PI) / 180) * (lon - p.lon)) <= SYS_RAIN_KM;
  };
  let from = Infinity, to = -Infinity;
  for (const [basin, pts] of Object.entries(tracks)) {
    const L = lastActive(pts);
    if (L >= 1) { from = Math.min(from, pts[0].lead_h); to = Math.max(to, pts[L].lead_h); }
    per[basin] = pts.map((p, i) => {
      const ti = grid.leadIndexAt(init + p.lead_h * 36e5);
      if (i === 0 || ti <= 0) return null;
      const f = grid.raw("tp", ti);
      let sum = 0, cnt = 0, mx = 0;
      for (let k = 0; k < n; k++) {
        if (!Number.isFinite(f[k]) || !(near(k, p) || near(k, pts[i - 1]))) continue;
        if (i <= L) corridor[k] += f[k];
        sum += f[k]; cnt++; mx = Math.max(mx, f[k]);
      }
      return { mean: cnt ? sum / cnt : 0, max: mx };
    });
  }
  if (from >= to) return null;
  return { corridor, per, from: init + from * 36e5, to: init + to * 36e5 };
}
function stepRain(f, centres) {
  const out = new Float32Array(f.length).fill(NaN);
  for (let k = 0; k < f.length; k++) {
    const lat = GRID.lat0 - Math.floor(k / GRID.nx) * GRID.step, lon = GRID.lon0 + (k % GRID.nx) * GRID.step;
    if (centres.some((p) => Math.hypot(111 * (lat - p.lat), 111 * Math.cos((lat * Math.PI) / 180) * (lon - p.lon)) <= SYS_RAIN_KM)) out[k] = f[k];
  }
  return out;
}
const CLOUD_SCALE = continuous([[20, "#edf0f3"], [50, "#c4cbd3"], [80, "#97a1ad"], [100, "#6b7682"]], { unit: "%", clearBelow: 20, ticks: [20, 50, 80, 100] });
async function loadCloud(tag, name = "cloud") {
  try { return new Uint8Array(await gunzipFetch(`runs/${tag}/${name}.u8.gz`)); } catch { return null; }
}
async function obsRain(tag) {
  try {
    const buf = new Int16Array(await gunzipFetch(`obs/${tag}.i16.gz`));
    return Float32Array.from(buf, (x) => (x === -32768 ? NaN : x / 10));
  } catch { return null; }
}
function systemRainSummary(grid, rain) {
  let mx = 0, km = -1, heavy = 0;
  for (let k = 0; k < rain.corridor.length; k++) {
    if (rain.corridor[k] > mx) { mx = rain.corridor[k]; km = k; }
    if (rain.corridor[k] >= 64.5) heavy += (111 * GRID.step) ** 2 * Math.cos(((GRID.lat0 - Math.floor(k / grid.nx) * GRID.step) * Math.PI) / 180);
  }
  if (mx < 2.5) return "";
  const at = `${(GRID.lat0 - Math.floor(km / grid.nx) * GRID.step).toFixed(2)}°N ${(GRID.lon0 + (km % grid.nx) * GRID.step).toFixed(2)}°E`;
  const cities = S.cities.map((c) => [c, grid.at(rain.corridor, c.lat, c.lon)]).filter(([, v]) => v >= 10).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<p>${esc(t("sys_rain_summary").replace("{from}", fmtTime(rain.from)).replace("{to}", fmtTime(rain.to))
    .replace("{max}", Math.round(mx)).replace("{at}", at))}${heavy >= 500 ? ` ${esc(t("sys_rain_heavy").replace("{area}", (Math.round(heavy / 1000) * 1000).toLocaleString()))}` : ""}</p>
    ${cities.length ? `<p>${esc(t("sys_rain_cities"))}: ${cities.map(([c, v]) => `${esc(cityName(c))} ${Math.round(v)} mm`).join(", ")}</p>` : ""}`;
}
function positionAt(pts, ms) {
  const ts = pts.map(obsTime);
  for (let i = 0; i < pts.length; i++) {
    if (ts[i] === ms) return pts[i];
    if (i && ts[i - 1] < ms && ms < ts[i]) {
      const f = (ms - ts[i - 1]) / (ts[i] - ts[i - 1]), a = pts[i - 1], b = pts[i];
      return { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon), kt: Math.round(a.kt + f * (b.kt - a.kt)) };
    }
  }
  return null;
}

async function cyclone(main) {
  if (S.params.storm) return stormView(main, S.params.storm);
  const tag = S.params.run, cmp = S.params.cmp && S.params.cmp !== tag && runEntry(S.params.cmp) ? S.params.cmp : null;
  const idx = S.runs.findIndex((r) => r.tag === tag);
  const older = S.runs[idx + 1], newer = S.runs[idx - 1];
  const [stats, cstats, storms] = await Promise.all([runStats(tag), cmp ? runStats(cmp) : null, loadStorms()]);
  const init = tagTime(tag);
  const tracks = significantTracks(stats, init, storms), ctracks = cstats ? significantTracks(cstats, tagTime(cmp), storms) : {};
  const named = Object.fromEntries(Object.entries(tracks).map(([b, pts]) => [b, matchStorm(pts, init, storms)]));
  const cnamed = Object.fromEntries(Object.entries(ctracks).map(([b, pts]) => [b, matchStorm(pts, tagTime(cmp), storms)]));
  const nearby = storms.filter((s) => Object.values(named).includes(s) || s.obs.some((o) => obsTime(o) >= init - 2 * 864e5 && obsTime(o) <= init + 4 * 864e5));
  const prev = cmp ? [] : S.runs.slice(idx + 1, idx + 4);
  const opts = (sel) => S.runs.map((r) => `<option value="${r.tag}"${r.tag === sel ? " selected" : ""}>${esc(runLabel(r))}</option>`).join("");
  const none = [[tag, tracks], ...(cmp ? [[cmp, ctracks]] : [])].filter(([, tr]) => !Object.keys(tr).length);
  const note = none.length ? `<div class="map-note">${none.map(([r]) => (cmp ? `<b>${esc(runLabel(runEntry(r)))}</b>: ` : "") + esc(t("no_system"))).join("<br>")}</div>` : "";
  const lineKey = cmp
    ? `<span class="pill"><span class="lkey"></span>${esc(runLabel(runEntry(tag)))}</span><span class="pill"><span class="lkey dash"></span>${esc(runLabel(runEntry(cmp)))}</span>`
    : `<span class="pill"><span class="lkey dash"></span>${esc(t("consistency"))}</span>`;
  const jtwc = nearby.map((s) => [s, jtwcFor(s, init)]).filter(([, fc]) => fc.length);
  const grid = !cmp && Object.keys(tracks).length ? await loadGrid(await runMeta(tag), "raw") : null;
  const rain = grid ? systemRain(grid, tracks, init) : null;
  const frames = grid ? [...new Set(Object.values(tracks).flat().map((p) => p.lead_h))].sort((a, b) => a - b) : [];
  const [cloud, cloud0] = frames.length ? await Promise.all([loadCloud(tag), loadCloud(tag, "cloud_obs")]) : [null, null];
  const obs0 = frames.length && !cloud ? await obsRain(tag) : null;
  let showRain = S.params.rain !== "0", fi = cloud || cloud0 || obs0 || frames.length < 2 ? 0 : 1;
  const obsKey = (nearby.length ? `<span class="pill"><span class="lkey thick"></span>${esc(t("observed_track"))}</span>` : "")
    + (jtwc.length ? `<span class="pill"><span class="lkey thick dash"></span>${esc(t("jtwc_forecast"))}</span>` : "");
  main.innerHTML = `<section class="card"><h2>${esc(t("cyclone_title"))}</h2>
    <div class="toolbar">
      <button type="button" id="cprev"${older ? "" : " disabled"}>← ${esc(t("older_run"))}</button>
      <label class="ctl">${esc(t("run"))}<select id="crun">${opts(tag)}</select></label>
      <button type="button" id="cnext"${newer ? "" : " disabled"}>${esc(t("newer_run"))} →</button>
      ${cmp ? `<label class="ctl">${esc(t("compare_with"))}<select id="ccmp">${opts(cmp)}</select></label>` : ""}
      <button type="button" id="ctoggle"${cmp ? "" : ' class="btn-latest"'}>${esc(t(cmp ? "stop_compare" : "compare_runs"))}</button>
    </div>
    <div class="map-wrap"><div id="cmap" class="map tall"></div>${note}</div><div id="cslider"></div>
    <div class="legendrow">${CATEGORIES.map((c, i) => `<span class="pill"><span class="dot" style="background:${CAT_COLORS[i]}"></span>${esc(catName(c))}</span>`).join("")}
    ${lineKey}${obsKey}${frames.length ? `<label class="pill"><input type="checkbox" id="crain"${showRain ? " checked" : ""}> ${esc(t(cloud || cloud0 ? "clouds" : "sys_rain"))}</label>` : ""}</div></section><section class="card" id="ttbl"></section>${namedCard()}`;
  $("#crun").onchange = (e) => setParams({ run: e.target.value }, false);
  if (older) $("#cprev").onclick = () => setParams({ run: older.tag }, false);
  if (newer) $("#cnext").onclick = () => setParams({ run: newer.tag }, false);
  if (cmp) $("#ccmp").onchange = (e) => setParams({ cmp: e.target.value }, false);
  $("#ctoggle").onclick = () => setParams({ cmp: cmp ? undefined : (S.runs.slice(idx + 1).find((r) => !r.hindcast) || older || newer || {}).tag }, false);
  const m = newMap($("#cmap"));
  await m.ready;
  const drawRain = () => {
    if (!frames.length) return;
    const lead = frames[fi], ms = init + lead * 36e5, g = L.layerGroup();
    const centres = [];
    for (const pts of Object.values(tracks)) {
      const i = pts.findIndex((x) => x.lead_h === lead);
      if (i < 0) continue;
      const p = pts[i];
      centres.push(p, ...(i ? [pts[i - 1]] : []));
      L.circleMarker([p.lat, p.lon], { pane: "lines", radius: 12, color: cssVar("--text"), weight: 3, fillColor: CAT_COLORS[CATEGORIES.indexOf(p.category)], fillOpacity: 1 })
        .bindTooltip(`${p.wind_kt} kt · ${p.msl} hPa`, { permanent: true, direction: "right", offset: [12, 0], className: "storm-label" }).addTo(g);
    }
    for (const s of nearby) {
      const fc = (jtwc.find(([x]) => x === s) || [, []])[1];
      const o = positionAt([...s.obs, ...fc.filter((f) => obsTime(f) > obsTime(s.obs[s.obs.length - 1]))], ms);
      if (o) L.circleMarker([o.lat, o.lon], { pane: "lines", radius: 9, color: cssVar("--text"), weight: 2, dashArray: "3 3", fill: false })
        .bindTooltip(`JTWC · ${o.kt} kt`, { permanent: true, direction: "left", offset: [-10, 0], className: "storm-label" }).addTo(g);
    }
    m.addLayer("now", g);
    const ti = grid.leadIndexAt(ms);
    if (lead === 0 && cloud0) return m.setField(showRain ? Float32Array.from(cloud0) : null, CLOUD_SCALE, { title: t("cloud_obs") });
    if (cloud) {
      const n = grid.ny * grid.nx;
      return m.setField(showRain && ti >= 0 ? Float32Array.from(cloud.subarray(ti * n, (ti + 1) * n)) : null, CLOUD_SCALE, { title: t("cloud_cover") });
    }
    const f = lead === 0 ? obs0 : ti > 0 ? grid.raw("tp", ti) : null;
    m.setField(showRain && f && centres.length ? stepRain(f, centres) : null, SCALES.rain6,
      { title: t(lead === 0 ? "sys_rain_obs" : "sys_rain_step") });
  };
  if (frames.length) $("#crain").onchange = (e) => { showRain = e.target.checked; setParams({ rain: showRain ? undefined : "0" }); drawRain(); };
  if (frames.length) $("#cslider").appendChild(timeSlider(frames.map((h) => init + h * 36e5), fi, (i) => { fi = i; drawRain(); },
    (ms, i) => `${fmtTime(ms)} · ${frames[i] ? `+${frames[i]} h` : t("run_time")}`));
  drawRain();
  const prevStats = await Promise.all(prev.map((r) => runStats(r.tag)));
  prevStats.forEach((ps, i) => {
    if (!ps) return;
    for (const [basin, pts] of Object.entries(significantTracks(ps, tagTime(prev[i].tag), storms))) {
      m.addLayer(`p${i}${basin}`, drawTrack(m, pts, tagTime(prev[i].tag), { strength: true, weight: 2, dash: "5 6", opacity: 0.6, thin: true })
        .eachLayer((l) => l.bindTooltip(runLabel(prev[i]))));
    }
  });
  if (cmp) {
    for (const [basin, pts] of Object.entries(ctracks)) {
      m.addLayer(`c${basin}`, drawTrack(m, pts, tagTime(cmp), { strength: true, weight: 3, dash: "6 6", hollow: true, label: runLabel(runEntry(cmp)) }));
    }
  }
  for (const [basin, pts] of Object.entries(tracks)) {
    m.addLayer(basin, drawTrack(m, pts, tagTime(tag), { strength: true, weight: 4, color: cssVar("--text"),
      label: [cmp ? runLabel(runEntry(tag)) : "", named[basin] ? stormName(named[basin]) : ""].filter(Boolean).join(" · ") }));
  }
  jtwc.forEach(([s, fc], i) => m.addLayer(`jtwc${i}`, drawObserved(m, s, fc, { dash: "6 6" })));
  nearby.forEach((s, i) => m.addLayer(`obs${i}`, drawObserved(m, s)));
  const table = (trs, init, label, nm, per = null) => Object.entries(trs).map(([basin, pts]) => `<h3>${esc(seaName(basin))}${nm[basin] ? ` · ${esc(stormName(nm[basin]))}` : ""}${label ? ` · ${esc(label)}` : ""}</h3>
    <div class="tablewrap"><table><tr><th>${esc(t("time"))}</th><th>${esc(t("position"))}</th><th class="num">${esc(t("pressure"))}</th>
      <th class="num">${esc(t("maxwind"))}</th><th>${esc(t("category"))}</th>${per ? `<th class="num">${esc(t("sys_rain_col").replace("{km}", SYS_RAIN_KM))}</th>` : ""}</tr>${pts.map((p, i) => `<tr><td>${fmtTime(init + p.lead_h * 36e5)}</td>
      <td>${p.lat.toFixed(2)}°N ${p.lon.toFixed(2)}°E ${p.land ? "(land)" : ""}</td><td class="num">${p.msl} hPa</td><td class="num">${p.wind_kt} kt${p.adj > 1 ? ` <span class="muted">(${p.model_kt})</span>` : ""}</td>
      <td><span class="dot" style="background:${CAT_COLORS[CATEGORIES.indexOf(p.category)]}"></span> ${esc(catName(p.category))}</td>${per ? `<td class="num">${per[basin][i] ? `${per[basin][i].mean.toFixed(1)} / ${Math.round(per[basin][i].max)} mm` : "—"}</td>` : ""}</tr>`).join("")}</table></div>`).join("");
  const html = (rain ? systemRainSummary(grid, rain) : "") + table(tracks, tagTime(tag), cmp ? runLabel(runEntry(tag)) : "", named, rain && rain.per) + (cmp ? table(ctracks, tagTime(cmp), runLabel(runEntry(cmp)), cnamed) : "");
  const adjusted = [tracks, ctracks || {}].some((trs) => Object.values(trs).some((pts) => pts.some((p) => p.adj > 1)));
  $("#ttbl").innerHTML = (html || esc(t("no_system"))) + (adjusted ? `<p class="muted">${esc(t("adj_note"))}</p>` : "") + (rain ? `<p class="muted">${esc(t("sys_rain_note").replace(/\{km\}/g, SYS_RAIN_KM))}</p>` : "") + (frames.length ? `<p class="muted">${esc([cloud0 ? t("cloud_obs_note") : "", t(cloud ? "cloud_note" : "rain_map_note")].filter(Boolean).join(" "))}</p>` : "") + jtwc.map(([s, fc]) => jtwcTable(s, fc)).join("") + nearby.map(obsTable).join("");
}

async function marine(main) {
  const tag = S.params.run;
  const [stats, meta] = await Promise.all([runStats(tag), runMeta(tag)]);
  const grid = await loadGrid(meta, S.kind);
  const wins = dayWindows(stats);
  const cls = (kt) => (kt >= 25 ? "warn" : kt >= 20 ? "caution" : "safe");
  const color = { safe: "var(--warn-green)", caution: "var(--warn-yellow)", warn: "var(--warn-red)" };
  main.innerHTML = `<section class="card"><h2>${esc(t("marine_title"))}</h2><div class="tablewrap"><table>
    <tr><th></th>${wins.map((w) => `<th class="num">${esc(dayLabel(w))}</th>`).join("")}</tr>
    ${Object.entries(stats.seas).map(([sea, vals]) => `<tr><td>${esc(seaName(sea))}</td>${vals.map((v) => `<td class="num">
      <span class="pill"><span class="dot" style="background:${color[cls(v)]}"></span>${v} kt</span></td>`).join("")}</tr>`).join("")}</table></div>
    <div class="legendrow"><span class="pill"><span class="dot lv-green"></span>&lt; 20 kt ${esc(t("fish_safe"))}</span>
    <span class="pill"><span class="dot lv-yellow"></span>20–24 kt ${esc(t("fish_caution"))}</span><span class="pill"><span class="dot lv-red"></span>≥ 25 kt ${esc(t("fish_warn"))}</span></div></section>
    <section class="card"><div id="days" class="row"></div><div id="mmap" class="map" style="margin-top:8px"></div></section>`;
  const m = newMap($("#mmap"));
  await m.ready;
  const draw = (d) => {
    const idx = grid.leads.map((x, i) => (x > 24 * (d - 1) && x <= 24 * d ? i : -1)).filter((i) => i >= 0);
    const mx = new Float32Array(GRID.ny * GRID.nx);
    for (const i of idx) { const f = grid.field("wind10", i); for (let k = 0; k < mx.length; k++) mx[k] = Math.max(mx[k], f[k] * 1.94384); }
    m.setField(mx, continuous([[0, "#f7fbff"], [10, "#9ecae1"], [20, "#f2c200"], [25, "#f08a00"], [34, "#d7263d"], [48, "#67001f"]],
      { unit: "kt", ticks: [0, 10, 20, 25, 34, 48] }), { title: t("maxwind") });
    const g = L.layerGroup();
    for (const [sea, [s, n, w, e]] of Object.entries(SEA_BOXES)) {
      const v = stats.seas[sea][d - 1];
      L.rectangle([[s, w], [n, e]], { pane: "lines", color: color[cls(v)].startsWith("var") ? cssVar(color[cls(v)].slice(4, -1)) : color[cls(v)], weight: 2, fill: false })
        .bindTooltip(`${esc(seaName(sea))}: ${v} kt`).addTo(g);
    }
    m.addLayer("boxes", g);
  };
  $("#days").appendChild(seg(wins.map((w) => [w.d, dayLabel(w)]), 1, draw));
  draw(1);
}

async function agree(main) {
  const tag = S.params.run;
  const meta = await runMeta(tag);
  const base = await loadGrid(meta, S.kind);
  const nDays = Math.floor(base.leads[base.leads.length - 1] / 24);
  let day = Math.min(+S.params.day || 2, nDays), thr = +S.params.thr || 64.5;
  main.innerHTML = `<section class="card"><h2>${esc(t("agree_title"))}</h2><p class="small muted">${esc(t("agree_help"))}</p>
    <div class="toolbar"><div id="days"></div><div id="thr"></div></div><div id="amap" class="map tall"></div><div id="members" class="small"></div></section>`;
  const m = newMap($("#amap"));
  await m.ready;
  const idx = S.runs.findIndex((r) => r.tag === tag);
  const candidates = S.runs.slice(idx, idx + 8);
  const draw = async () => {
    const end = base.init + day * 864e5;
    const members = [];
    for (const r of candidates) {
      const g = await loadGrid(await runMeta(r.tag), S.kind);
      const ends = [0, 6, 12, 18].map((k) => g.leadIndexAt(end - k * 36e5));
      if (ends.some((i) => i <= 0)) continue;
      const acc = new Float32Array(GRID.ny * GRID.nx);
      for (const i of ends) { const f = g.raw("tp", i); for (let k = 0; k < acc.length; k++) acc[k] += f[k]; }
      members.push({ r, acc });
      if (members.length >= 6) break;
    }
    const prob = new Float32Array(GRID.ny * GRID.nx);
    for (const mm of members) for (let k = 0; k < prob.length; k++) prob[k] += (mm.acc[k] >= thr ? 100 : 0) / members.length;
    m.setField(prob, SCALES.prob, { title: `P(≥ ${thr} mm / 24 h)` });
    $("#members").innerHTML = `${esc(t("members"))}: ${members.map((x) => esc(runLabel(x.r))).join(" · ")} · ${esc(fmtTime(end - 864e5))} → ${esc(fmtTime(end))}`;
  };
  $("#days").appendChild(seg(Array.from({ length: nDays }, (_, i) => [i + 1, `${t("day")} ${i + 1}`]), day, (v) => { day = v; setParams({ day: v }); draw(); }));
  $("#thr").appendChild(seg([[2.5, "≥ 2.5 mm"], [64.5, `≥ 64.5 mm (${t("cat_heavy")})`], [115.6, `≥ 115.6 mm (${t("cat_vheavy")})`]], thr,
    (v) => { thr = v; setParams({ thr: v }); draw(); }));
  draw();
}

async function gallery(main) {
  const tag = S.params.run;
  const imgs = await getJSON(`runs/${tag}/images.json`);
  if (!imgs || !imgs.length) {
    const withImg = S.runs.filter((r) => r.images);
    main.innerHTML = `<section class="card"><h2>${esc(t("gallery_title"))}</h2><p>${esc(t("no_images"))}</p>
      <ul>${withImg.map((r) => `<li><a href="${link("gallery", { run: r.tag })}">${esc(runLabel(r))}</a></li>`).join("")}</ul></section>`;
    return;
  }
  const groups = [...new Set(imgs.map((i) => i.group))];
  let group = groups.includes(S.params.g) ? S.params.g : groups[0];
  main.innerHTML = `<section class="card"><h2>${esc(t("gallery_title"))}</h2><div class="toolbar" id="tb"></div><div class="gallery" id="gal"></div></section>`;
  const keys = { "4day": "g_4day", daily: "g_daily", t2m_anomaly: "g_t2m", precipitation: "g_rain", wind850_anomaly: "g_wind", msl_anomaly: "g_msl" };
  const draw = () => {
    const list = imgs.filter((i) => i.group === group && i.kind === S.kind);
    $("#gal").innerHTML = list.map((i) => `<a href="${i.path}" data-full="${i.path}"><img loading="lazy" src="${i.path}" alt="${esc(i.label)}"><div class="cap">${esc(i.label)}</div></a>`).join("");
    $("#gal").querySelectorAll("a").forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      const lb = h(`<div class="lightbox" role="dialog"><img src="${a.dataset.full}" alt=""></div>`);
      lb.onclick = () => lb.remove();
      document.body.appendChild(lb);
    }));
  };
  $("#tb").appendChild(seg(groups.map((g) => [g, t(keys[g] || g)]), group, (v) => { group = v; setParams({ g: v }); draw(); }));
  draw();
}

async function skill(main) {
  const board = (await getJSON("scoreboard.json")) || [];
  const files = (await getJSON("skill/index.json")) || [];
  main.innerHTML = `<section class="card"><h2>${esc(t("skill_title"))}</h2><div class="grid g2">
      <div><h3>${esc(t("skill_ets"))}</h3><div class="chartbox tall"><canvas id="c1"></canvas></div></div>
      <div><h3>${esc(t("skill_ets_heavy"))}</h3><div class="chartbox tall"><canvas id="c2"></canvas></div></div></div>
      <h3>${esc(t("skill_series"))}</h3><div class="chartbox tall"><canvas id="c3"></canvas></div>
      <p class="small muted">IMERG satellite rainfall over Indian land, 24 h totals. Bias correction was fitted on hindcast runs up to 4 Oct 2026 12Z.</p>
      <details><summary>${esc(t("show_table"))}</summary><div class="tablewrap" id="tbl"></div></details></section>
    <section class="card"><h2>${esc(t("hindcast_maps"))}</h2><div class="gallery wide">${files.map((f) => `<a href="skill/${f}" target="_blank"><img loading="lazy" src="skill/${f}" alt="${esc(f)}"><div class="cap">${esc(f)}</div></a>`).join("")}</div></section>`;
  const c = chartColors();
  const days = [...new Set(board.map((b) => b.day))].sort();
  const mean = (arr) => { const v = arr.filter((x) => x !== null && Number.isFinite(x)); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null; };
  const byDay = (k) => days.map((d) => mean(board.filter((b) => b.day === d).map((b) => b[k])));
  const bars = (cv, key) => makeChart(cv, {
    type: "bar",
    data: { labels: days.map((d) => `${t("day")} ${d}`), datasets: [
      { label: t("corrected"), data: byDay(`corrected_${key}`), backgroundColor: c.s1, borderRadius: 4 },
      { label: t("raw"), data: byDay(`raw_${key}`), backgroundColor: c.s2, borderRadius: 4 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { boxWidth: 12 } } }, scales: { x: { grid: { display: false } } } },
  });
  bars($("#c1"), "ets_2.5mm"); bars($("#c2"), "ets_64.5mm");
  const d1 = board.filter((b) => b.day === 1).sort((a, b) => a.end.localeCompare(b.end));
  makeChart($("#c3"), {
    type: "line",
    data: { labels: d1.map((b) => fmtTime(tagTime(b.end), { date: true })), datasets: [
      { label: t("corrected"), data: d1.map((b) => b["corrected_ets_2.5mm"]), borderColor: c.s1, backgroundColor: c.s1, borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: t("raw"), data: d1.map((b) => b["raw_ets_2.5mm"]), borderColor: c.s2, backgroundColor: c.s2, borderWidth: 2, pointRadius: 0, tension: 0.2 }] },
    options: { maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { boxWidth: 12 } } }, scales: { x: { ticks: { maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } } } },
  });
  $("#tbl").innerHTML = `<table><tr><th>${esc(t("day"))}</th><th class="num">ETS ≥2.5 (${esc(t("corrected"))})</th><th class="num">ETS ≥2.5 (${esc(t("raw"))})</th>
    <th class="num">ETS ≥64.5 (${esc(t("corrected"))})</th><th class="num">ETS ≥64.5 (${esc(t("raw"))})</th></tr>${days.map((d, i) => `<tr><td>${d}</td>
    <td class="num">${byDay("corrected_ets_2.5mm")[i]}</td><td class="num">${byDay("raw_ets_2.5mm")[i]}</td><td class="num">${byDay("corrected_ets_64.5mm")[i]}</td>
    <td class="num">${byDay("raw_ets_64.5mm")[i]}</td></tr>`).join("")}</table>`;
}

const ABOUT = {
  en: `<h2>About Mausam AI</h2>
    <p>Mausam AI runs NVIDIA's <b>FourCastNet</b> AI weather model (with the <b>PrecipitationAFNO</b> rain model) on a laptop, twice a day, starting from the latest NOAA GFS analysis. Each run forecasts 4 days ahead on a 0.25° (~25 km) grid in 6-hour steps.</p>
    <p>A statistical correction, learned from a month of past forecasts checked against ERA5 and NASA IMERG, removes each location's typical error. Use the "Raw model" switch at the top to see the forecast without it.</p>
    <p>Every past run stays available in the run picker, so you can compare two start times or check any forecast against what the satellite actually saw.</p>
    <h3 id="kinds">Bias-corrected vs raw model</h3>
    <p><b>Raw model</b> is exactly what FourCastNet predicts. Like every weather model, it has repeatable errors in particular places: some areas always come out a little too warm, some valleys too cold, the sea-level pressure slightly too low.</p>
    <p><b>Bias-corrected</b> removes those repeatable errors. For every grid point, start time and forecast hour, it compares a month of past forecasts with what actually happened (ERA5 for temperature, pressure and wind, NASA IMERG satellite data for rain) and adjusts the new forecast by the typical error. Rain amounts are mapped so their range matches what the satellite measures.</p>
    <p>When it was tested on September–October forecasts, the correction cut the typical temperature error from 2.4 °C to 1.8 °C. On the latest forecasts, however, the raw model has been closer to the observed weather (typical temperature error 2.2 °C raw against 2.9 °C corrected), so the site now shows the raw model by default. Switch to bias-corrected at the top to compare. Warnings, bulletins and Telegram messages also use the raw model.</p>
    <h3>Data and tools</h3><ul><li>Model: <a href="https://arxiv.org/abs/2202.11214">FourCastNet (Pathak et al., 2022)</a> via <a href="https://github.com/NVIDIA/earth2studio">NVIDIA Earth2Studio</a></li>
    <li>Initial conditions: NOAA GFS analysis (AWS open data)</li><li>Observed rain: NASA GPM IMERG Early/Late V07</li>
    <li>Borders: Natural Earth (India point of view)</li></ul>`,
  hi: `<h2>मौसम AI के बारे में</h2>
    <p>मौसम AI, NVIDIA का <b>FourCastNet</b> AI मौसम मॉडल (<b>PrecipitationAFNO</b> वर्षा मॉडल के साथ) एक लैपटॉप पर दिन में दो बार चलाता है, जो नवीनतम NOAA GFS विश्लेषण से शुरू होता है। हर रन 0.25° (~25 किमी) ग्रिड पर 6-घंटे के अंतराल में 4 दिन आगे का पूर्वानुमान देता है।</p>
    <p>एक माह के पिछले पूर्वानुमानों से सीखा गया सांख्यिकीय सुधार हर स्थान की सामान्य त्रुटि हटाता है। ऊपर "मूल मॉडल" चुनकर बिना सुधार का पूर्वानुमान देखें।</p>
    <p>हर पिछला रन उपलब्ध रहता है, ताकि आप दो आरंभ समयों की तुलना कर सकें या किसी भी पूर्वानुमान को उपग्रह से देखी गई वास्तविक वर्षा से जाँच सकें।</p>
    <h3 id="kinds">सुधारित बनाम मूल मॉडल</h3>
    <p><b>मूल मॉडल</b> वही है जो FourCastNet सीधे बताता है। हर मौसम मॉडल की तरह इसकी कुछ जगहों पर बार-बार होने वाली त्रुटियाँ हैं: कुछ इलाके हमेशा थोड़े ज़्यादा गर्म आते हैं, कुछ घाटियाँ ज़्यादा ठंडी, समुद्र-तल दबाव थोड़ा कम।</p>
    <p><b>सुधारित</b> पूर्वानुमान इन त्रुटियों को हटाता है। हर ग्रिड बिंदु, आरंभ समय और पूर्वानुमान घंटे के लिए यह एक माह के पिछले पूर्वानुमानों की तुलना वास्तविक मौसम से करता है (तापमान, दबाव और हवा के लिए ERA5, वर्षा के लिए NASA IMERG उपग्रह) और नए पूर्वानुमान को सामान्य त्रुटि के अनुसार समायोजित करता है।</p>
    <p>सितंबर–अक्टूबर के पूर्वानुमानों पर जाँच में इस सुधार ने तापमान की सामान्य त्रुटि 2.4 °C से घटाकर 1.8 °C की थी। लेकिन हाल के पूर्वानुमानों में मूल मॉडल वास्तविक मौसम के अधिक करीब रहा है (तापमान त्रुटि मूल 2.2 °C, सुधारित 2.9 °C), इसलिए वेबसाइट अब डिफ़ॉल्ट रूप से मूल मॉडल दिखाती है। तुलना के लिए ऊपर सुधारित चुनें। चेतावनियाँ, बुलेटिन और Telegram संदेश भी मूल मॉडल पर आधारित हैं।</p>`,
  mr: `<h2>मौसम AI बद्दल</h2>
    <p>मौसम AI हे NVIDIA चे <b>FourCastNet</b> AI हवामान मॉडेल (<b>PrecipitationAFNO</b> पाऊस मॉडेलसह) एका लॅपटॉपवर दिवसातून दोनदा चालवते, नवीनतम NOAA GFS विश्लेषणापासून सुरुवात करून. प्रत्येक रन 0.25° (~25 किमी) ग्रिडवर 6-तासांच्या टप्प्यांत 4 दिवस पुढचा अंदाज देतो.</p>
    <p>एका महिन्याच्या मागील अंदाजांवरून शिकलेली सांख्यिकीय दुरुस्ती प्रत्येक ठिकाणची नेहमीची चूक काढून टाकते. वर "मूळ मॉडेल" निवडून दुरुस्तीशिवायचा अंदाज पाहा.</p>
    <p>प्रत्येक मागील रन उपलब्ध राहतो, त्यामुळे तुम्ही दोन सुरुवातीच्या वेळांची तुलना करू शकता किंवा कोणताही अंदाज उपग्रहाने पाहिलेल्या प्रत्यक्ष पावसाशी तपासू शकता.</p>
    <h3 id="kinds">दुरुस्त केलेले विरुद्ध मूळ मॉडेल</h3>
    <p><b>मूळ मॉडेल</b> म्हणजे FourCastNet जे थेट सांगते ते. प्रत्येक हवामान मॉडेलप्रमाणे त्याच्या काही ठिकाणी नेहमी होणाऱ्या चुका असतात: काही भाग नेहमी थोडे जास्त गरम येतात, काही दऱ्या जास्त थंड, समुद्रसपाटीचा दाब थोडा कमी.</p>
    <p><b>दुरुस्त केलेला</b> अंदाज या चुका काढून टाकतो. प्रत्येक ग्रिड बिंदू, सुरुवातीची वेळ आणि अंदाजाच्या तासासाठी तो एका महिन्याच्या मागील अंदाजांची प्रत्यक्ष हवामानाशी तुलना करतो (तापमान, दाब आणि वाऱ्यासाठी ERA5, पावसासाठी NASA IMERG उपग्रह) आणि नवा अंदाज नेहमीच्या चुकीनुसार समायोजित करतो.</p>
    <p>सप्टेंबर–ऑक्टोबरच्या अंदाजांवर तपासणीत या दुरुस्तीने तापमानाची नेहमीची चूक 2.4 °C वरून 1.8 °C केली होती. मात्र अलीकडच्या अंदाजांमध्ये मूळ मॉडेल प्रत्यक्ष हवामानाच्या अधिक जवळ राहिले आहे (तापमानाची चूक मूळ 2.2 °C, दुरुस्त केलेले 2.9 °C), म्हणून वेबसाइट आता मूळ मॉडेल डीफॉल्ट दाखवते. तुलनेसाठी वर दुरुस्त केलेले निवडा. इशारे, बुलेटिन आणि Telegram संदेश देखील मूळ मॉडेलवर आधारित आहेत.</p>`,
};

const ABOUT_ME = {
  en: `<h2>About the creator</h2>
    <p>Vivek Shilimkar is a climate scientist, technology professional, and science communicator with a PhD in Earth System Science from Hokkaido University, Japan. His research focused on climate dynamics and ocean–atmosphere interactions, giving him a scientific perspective on weather and climate variability.</p>
    <p>Working at the intersection of cloud-native technologies and climate science, Vivek created this weather forecasting platform to make weather information more accessible, understandable, and useful to people. He is passionate about communicating science in Marathi, helping local communities understand weather patterns, rainfall, and climate-related events in a language they connect with.</p>
    <p>Through this initiative, he aims to bring scientific understanding and technology closer to everyday weather decisions, fostering a more informed and weather-aware community.</p>`,
  hi: `<h2>निर्माता के बारे में</h2>
    <p>विवेक शिलिमकर एक जलवायु वैज्ञानिक, प्रौद्योगिकी पेशेवर और विज्ञान संचारक हैं। उन्होंने होक्काइडो विश्वविद्यालय, जापान से पृथ्वी प्रणाली विज्ञान (Earth System Science) में पीएचडी की है। उनका शोध जलवायु गतिकी और महासागर–वायुमंडल परस्पर क्रिया पर केंद्रित था, जिससे उन्हें मौसम और जलवायु परिवर्तनशीलता को वैज्ञानिक दृष्टि से समझने का अनुभव मिला।</p>
    <p>क्लाउड-नेटिव तकनीकों और जलवायु विज्ञान के संगम पर काम करते हुए, विवेक ने यह मौसम पूर्वानुमान मंच बनाया ताकि मौसम की जानकारी लोगों के लिए अधिक सुलभ, समझने योग्य और उपयोगी हो। वे मराठी में विज्ञान संचार के प्रति समर्पित हैं, ताकि स्थानीय समुदाय मौसम के पैटर्न, वर्षा और जलवायु से जुड़ी घटनाओं को अपनी भाषा में समझ सकें।</p>
    <p>इस पहल के माध्यम से उनका लक्ष्य वैज्ञानिक समझ और तकनीक को रोज़मर्रा के मौसम संबंधी निर्णयों के करीब लाना और एक अधिक जागरूक, मौसम-सजग समाज बनाना है।</p>`,
  mr: `<h2>निर्मात्याबद्दल</h2>
    <p>विवेक शिलिमकर हे हवामान शास्त्रज्ञ, तंत्रज्ञान व्यावसायिक आणि विज्ञान संवादक आहेत. त्यांनी होक्काइडो विद्यापीठ, जपान येथून पृथ्वी प्रणाली विज्ञान (Earth System Science) या विषयात पीएचडी केली आहे. त्यांचे संशोधन हवामान गतिकी आणि महासागर–वातावरण परस्परक्रिया यांवर केंद्रित होते, ज्यामुळे त्यांना हवामान आणि त्यातील बदल वैज्ञानिक दृष्टीने समजून घेण्याचा अनुभव मिळाला.</p>
    <p>क्लाउड-नेटिव्ह तंत्रज्ञान आणि हवामान विज्ञान यांच्या संगमावर काम करताना, हवामानाची माहिती लोकांसाठी अधिक सुलभ, समजण्यास सोपी आणि उपयुक्त व्हावी म्हणून विवेक यांनी हा हवामान अंदाज मंच तयार केला. मराठीतून विज्ञान संवाद करण्याची त्यांना विशेष आवड आहे, जेणेकरून स्थानिक समुदायांना हवामानाचे स्वरूप, पाऊस आणि हवामानाशी संबंधित घटना आपल्या भाषेत समजून घेता येतील.</p>
    <p>या उपक्रमाद्वारे वैज्ञानिक समज आणि तंत्रज्ञान रोजच्या हवामानविषयक निर्णयांच्या जवळ आणणे आणि अधिक जाणकार, हवामान-सजग समाज घडवणे हे त्यांचे ध्येय आहे.</p>`,
};

async function about(main) {
  main.innerHTML = `<section class="card">${ABOUT[S.lang]}${S.lang !== "en" ? ABOUT.en.replace(/<h2>.*?<\/h2>/, "<hr>").replace(/<h3 id="kinds">[\s\S]*?(?=<h3>)/, "") : ""}</section>
    <section class="card about-me"><img src="assets/vivek.webp" alt="Vivek Shilimkar" width="160" height="160"><div>${ABOUT_ME[S.lang]}<p><a href="https://x.com/DrViKiShi" target="_blank" rel="noopener">𝕏 @DrViKiShi</a></p></div></section>`;
}

boot();
