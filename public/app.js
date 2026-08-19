const scenarioSelect = document.getElementById("scenario");
const runButton = document.getElementById("run");
const baselineOutput = document.getElementById("baselineOutput");
const letheOutput = document.getElementById("letheOutput");
const chainViz = document.getElementById("chainViz");
const sliderSection = document.getElementById("sliderSection");
const asOfSlider = document.getElementById("asOfSlider");
const asOfLabel = document.getElementById("asOfLabel");
const flipMarkerLabel = document.getElementById("flipMarkerLabel");

const SVG_NS = "http://www.w3.org/2000/svg";

let scenarios = [];
let abstention = null;
let connect = null;

// Populated per-scenario once /chain is fetched, so the slider spans the
// real fact timestamps instead of three canned buckets.
let sliderRangeMs = null; // { min, max, flip }
let sliderDebounceHandle = null;

// ---------- static legend (no data dependency) ----------

function renderLegend() {
  const svg = document.getElementById("legendSvg");
  const boxes = [
    { x: 20, y: 25, w: 110, h: 40, label: "Session" },
    { x: 300, y: 25, w: 110, h: 40, label: "Fact" },
    { x: 580, y: 25, w: 110, h: 40, label: "Entity" },
  ];
  let svgContent = "";
  for (const b of boxes) {
    svgContent += box(b.x, b.y, b.w, b.h, b.label, "legend-node");
  }
  svgContent += arrow(130, 45, 300, 45, "STATES");
  svgContent += arrow(410, 45, 580, 45, "ABOUT");
  // Fact -> Fact SUPERSEDES loop, drawn below the Fact box.
  svgContent += `<path d="M 320 65 C 300 90, 400 90, 380 65" class="legend-edge" marker-end="url(#legendArrow)" />`;
  svgContent += `<text x="350" y="102" class="edge-label" text-anchor="middle">SUPERSEDES</text>`;
  svg.innerHTML = defs() + svgContent;
}

function defs() {
  return `<defs>
    <marker id="legendArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" class="arrow-head" />
    </marker>
  </defs>`;
}

function box(x, y, w, h, label, cls) {
  return `<g class="${cls}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" />
    <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(label)}</text>
  </g>`;
}

function arrow(x1, y1, x2, y2, label) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="legend-edge" marker-end="url(#legendArrow)" />
    <text x="${(x1 + x2) / 2}" y="${y1 - 8}" class="edge-label" text-anchor="middle">${escapeHtml(label)}</text>`;
}

// ---------- scenario loading ----------

async function loadScenarios() {
  const res = await fetch("/demo/scenarios");
  const data = await res.json();
  scenarios = data.scenarios;
  abstention = data.abstention;
  connect = data.connect;

  scenarioSelect.innerHTML = "";
  for (const s of scenarios) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.naturalLanguageQuery} (${s.id})`;
    scenarioSelect.appendChild(opt);
  }
  const abstOpt = document.createElement("option");
  abstOpt.value = abstention.id;
  abstOpt.textContent = `${abstention.naturalLanguageQuery} (abstention case)`;
  scenarioSelect.appendChild(abstOpt);

  const connectOpt = document.createElement("option");
  connectOpt.value = connect.id;
  connectOpt.textContent = `${connect.naturalLanguageQuery} (cross-entity connect)`;
  scenarioSelect.appendChild(connectOpt);
}

function currentScenario() {
  const id = scenarioSelect.value;
  if (id === abstention.id) return { ...abstention, isAbstention: true };
  if (id === connect.id) return { ...connect, isConnect: true };
  return scenarios.find((s) => s.id === id);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// ---------- main query flow ----------

// Stale-response guard: every runAt() call captures the request token that
// was current when it started. If a newer call (a later slider drag, a
// scenario switch) has since been issued by the time this one's fetches
// resolve, its result is discarded instead of overwriting the newer one --
// otherwise an initial page-load request and a fast subsequent slider drag
// can resolve out of order and leave the wrong answer on screen. Verified
// this is a real race, not just test flakiness, by reproducing it live.
let requestToken = 0;

async function runQuery() {
  const scenario = currentScenario();
  if (!scenario) return;
  const myToken = ++requestToken;

  baselineOutput.textContent = "Loading...";
  letheOutput.textContent = "Loading...";
  chainViz.innerHTML = "";

  if (scenario.isConnect) {
    sliderSection.hidden = true;
    renderConnectBaselineNote();
    const connectRes = await fetch(
      `/connect?from=${encodeURIComponent(scenario.from)}&to=${encodeURIComponent(scenario.to)}`,
    ).then((r) => r.json());
    if (myToken !== requestToken) return;
    renderConnectLethe(connectRes);
    renderConnectPathSVG(connectRes);
    return;
  }

  if (scenario.isAbstention) {
    sliderSection.hidden = true;
    await runAt(scenario, scenario.asOf, undefined, myToken);
    return;
  }

  // Real update scenario: fetch the chain once to get real fact
  // timestamps, size the slider to them, then run at the slider's
  // current position (defaults to "after the update").
  const chainRes = await fetch(
    `/chain?entity=${encodeURIComponent(scenario.entity)}&attribute=${encodeURIComponent(scenario.attribute)}`,
  ).then((r) => r.json());
  if (myToken !== requestToken) return;
  setupSlider(chainRes, scenario);
  await runAt(scenario, msToIso(sliderValueToMs(Number(asOfSlider.value))), chainRes, myToken);
}

async function runAt(scenario, asOf, precomputedChain, myToken = ++requestToken) {
  const [baselineRes, letheRes] = await Promise.all([
    fetch(`/baseline/recall?query=${encodeURIComponent(scenario.naturalLanguageQuery)}`).then((r) => r.json()),
    fetch(
      `/recall?entity=${encodeURIComponent(scenario.entity)}&attribute=${encodeURIComponent(scenario.attribute)}&as_of=${encodeURIComponent(asOf)}`,
    ).then((r) => r.json()),
  ]);
  if (myToken !== requestToken) return; // a newer request has since superseded this one

  renderBaseline(baselineRes, letheRes.answer);
  renderLethe(letheRes, asOf);

  if (!scenario.isAbstention) {
    const chainRes =
      precomputedChain ??
      (await fetch(
        `/chain?entity=${encodeURIComponent(scenario.entity)}&attribute=${encodeURIComponent(scenario.attribute)}`,
      ).then((r) => r.json()));
    if (myToken !== requestToken) return;
    renderChainSVG(chainRes, letheRes.fact ? letheRes.fact.id : null);
  }
}

// ---------- timeline slider ----------

function isoToMs(iso) {
  return new Date(iso).getTime();
}
function msToIso(ms) {
  return new Date(ms).toISOString();
}

// Slider position (0..1000) maps linearly onto [min, max] ms, padded a
// little beyond the outermost fact timestamps so "before either fact" and
// "after the update" both have visible room either side of the real data.
function sliderValueToMs(value) {
  const { min, max } = sliderRangeMs;
  return min + ((max - min) * value) / 1000;
}
function msToSliderValue(ms) {
  const { min, max } = sliderRangeMs;
  return Math.round((1000 * (ms - min)) / (max - min));
}

function setupSlider(chainRes, scenario) {
  const facts = (chainRes.facts || []).slice().sort((a, b) => a.written_at.localeCompare(b.written_at));
  if (facts.length === 0) {
    sliderSection.hidden = true;
    return;
  }
  const earliest = isoToMs(facts[0].written_at);
  const latest = isoToMs(facts[facts.length - 1].written_at);
  const pad = Math.max((latest - earliest) * 0.6, 24 * 60 * 60 * 1000);
  sliderRangeMs = { min: earliest - pad, max: latest + pad, flip: latest };

  sliderSection.hidden = false;
  asOfSlider.value = String(msToSliderValue(latest + pad * 0.5)); // default: after the update
  updateSliderLabel();

  asOfSlider.oninput = () => {
    updateSliderLabel();
    clearTimeout(sliderDebounceHandle);
    sliderDebounceHandle = setTimeout(() => {
      runAt(scenario, msToIso(sliderValueToMs(Number(asOfSlider.value))));
    }, 90);
  };
}

function updateSliderLabel() {
  const ms = sliderValueToMs(Number(asOfSlider.value));
  asOfLabel.textContent = new Date(ms).toISOString().slice(0, 10);
  const flipValue = msToSliderValue(sliderRangeMs.flip);
  flipMarkerLabel.style.marginLeft = `${(flipValue / 1000) * 100}%`;
}

// ---------- panel rendering ----------

function renderBaseline(result, letheAnswer) {
  if (!result.matches || result.matches.length === 0) {
    baselineOutput.textContent = "No facts stored yet -- run `pnpm seed` first.";
    return;
  }
  baselineOutput.innerHTML = "";
  result.matches.forEach((m, i) => {
    const row = document.createElement("div");
    const isTop = i === 0;
    const matchesLethe = m.content === letheAnswer;
    row.className = `row ${isTop ? (matchesLethe ? "correct" : "wrong") : "muted"}`;
    const marker = isTop ? (matchesLethe ? "✓" : "✗") : "";
    row.innerHTML = `<div class="row-marker">${marker}</div><div class="row-body"><div>${escapeHtml(m.content)}</div><div class="score">similarity: ${m.score.toFixed(3)}</div></div>`;
    baselineOutput.appendChild(row);
  });
  if (result.ambiguous) {
    const note = document.createElement("div");
    note.className = "row wrong";
    note.innerHTML = `<div class="row-marker">✗</div><div class="row-body">Ambiguous: top-2 matches are nearly tied on similarity -- no way to tell which is current.</div>`;
    baselineOutput.appendChild(note);
  }
}

function renderLethe(result, asOf) {
  letheOutput.innerHTML = "";
  const row = document.createElement("div");
  row.className = "row correct";
  const marker = "✓";
  if (result.answer === null) {
    row.innerHTML = `<div class="row-marker">${marker}</div><div class="row-body"><div>Abstained: <strong>${escapeHtml(result.reason ?? "no_fact_stated")}</strong></div><div class="score">as of ${escapeHtml(asOf.slice(0, 10))}</div></div>`;
  } else {
    row.innerHTML = `<div class="row-marker">${marker}</div><div class="row-body"><div>${escapeHtml(result.answer)}</div><div class="score">as of ${escapeHtml(asOf.slice(0, 10))} · fact ${escapeHtml(result.fact.id.slice(0, 8))}</div></div>`;
  }
  letheOutput.appendChild(row);
}

function renderConnectBaselineNote() {
  baselineOutput.innerHTML = "";
  const row = document.createElement("div");
  row.className = "row wrong";
  row.innerHTML = `<div class="row-marker">✗</div><div class="row-body">N/A -- vector similarity search has no relationship-traversal concept at all. There is no query to run here.</div>`;
  baselineOutput.appendChild(row);
}

function renderConnectLethe(result) {
  letheOutput.innerHTML = "";
  const row = document.createElement("div");
  row.className = `row ${result.found ? "correct" : "wrong"}`;
  const marker = result.found ? "✓" : "✗";
  row.innerHTML = `<div class="row-marker">${marker}</div><div class="row-body">${
    result.found
      ? `Path found (${result.path.length} nodes) via <code>algo.SPpaths</code>.`
      : "No path found."
  }</div>`;
  letheOutput.appendChild(row);
}

// ---------- SVG diagrams ----------

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

/** Vertical timeline: one box per fact, SUPERSEDES arrows pointing down, current fact highlighted. */
function renderChainSVG(chainResult, validFactId) {
  const facts = chainResult.facts || [];
  chainViz.innerHTML = "";
  if (facts.length === 0) return;

  const boxW = 460;
  const boxH = 56;
  const gapY = 46;
  const svgH = facts.length * boxH + (facts.length - 1) * gapY + 20;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${boxW + 40} ${svgH}`);
  svg.setAttribute("class", "chain-svg");
  svg.innerHTML = defs();

  facts.forEach((f, i) => {
    const y = 10 + i * (boxH + gapY);
    const isCurrent = f.id === validFactId;
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", `fact-node ${isCurrent ? "current" : "superseded"}`);

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "20");
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(boxW));
    rect.setAttribute("height", String(boxH));
    rect.setAttribute("rx", "8");
    g.appendChild(rect);

    const fo = document.createElementNS(SVG_NS, "foreignObject");
    fo.setAttribute("x", "28");
    fo.setAttribute("y", String(y + 4));
    fo.setAttribute("width", String(boxW - 16));
    fo.setAttribute("height", String(boxH - 8));
    fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="node-content">
      <div class="node-text">${escapeHtml(f.content)}</div>
      <div class="node-meta">${escapeHtml(f.written_at.slice(0, 10))}${isCurrent ? " · currently valid" : " · superseded"}</div>
    </div>`;
    g.appendChild(fo);
    svg.appendChild(g);

    if (i < facts.length - 1) {
      const arrowY1 = y + boxH;
      const arrowY2 = y + boxH + gapY;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(20 + boxW / 2));
      line.setAttribute("y1", String(arrowY1));
      line.setAttribute("x2", String(20 + boxW / 2));
      line.setAttribute("y2", String(arrowY2));
      line.setAttribute("class", "chain-edge");
      line.setAttribute("marker-end", "url(#legendArrow)");
      svg.appendChild(line);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(20 + boxW / 2 + 10));
      label.setAttribute("y", String((arrowY1 + arrowY2) / 2));
      label.setAttribute("class", "edge-label");
      label.textContent = "SUPERSEDES";
      svg.appendChild(label);
    }
  });

  chainViz.appendChild(svg);
}

/** Horizontal path: one box per node, plain arrows between them. */
function renderConnectPathSVG(result) {
  const path = result.path || [];
  chainViz.innerHTML = "";
  if (path.length === 0) return;

  const boxW = 150;
  const boxH = 64;
  const gapX = 50;
  const svgW = path.length * boxW + (path.length - 1) * gapX + 20;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${svgW} 100`);
  svg.setAttribute("class", "chain-svg path-svg");
  svg.innerHTML = defs();

  path.forEach((node, i) => {
    const x = 10 + i * (boxW + gapX);
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "fact-node path-node");

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", "18");
    rect.setAttribute("width", String(boxW));
    rect.setAttribute("height", String(boxH));
    rect.setAttribute("rx", "8");
    g.appendChild(rect);

    const fo = document.createElementNS(SVG_NS, "foreignObject");
    fo.setAttribute("x", String(x + 6));
    fo.setAttribute("y", "22");
    fo.setAttribute("width", String(boxW - 12));
    fo.setAttribute("height", String(boxH - 8));
    fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="node-content">
      <div class="node-meta">${escapeHtml(node.label)}</div>
      <div class="node-text small">${escapeHtml(truncate(String(node.content ?? node.id), 60))}</div>
    </div>`;
    g.appendChild(fo);
    svg.appendChild(g);

    if (i < path.length - 1) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(x + boxW));
      line.setAttribute("y1", "50");
      line.setAttribute("x2", String(x + boxW + gapX));
      line.setAttribute("y2", "50");
      line.setAttribute("class", "chain-edge");
      line.setAttribute("marker-end", "url(#legendArrow)");
      svg.appendChild(line);
    }
  });

  chainViz.appendChild(svg);
}

runButton.addEventListener("click", runQuery);
scenarioSelect.addEventListener("change", runQuery);
renderLegend();
loadScenarios().then(runQuery);
