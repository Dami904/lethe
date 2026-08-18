const scenarioSelect = document.getElementById("scenario");
const asOfSelect = document.getElementById("asOf");
const runButton = document.getElementById("run");
const baselineOutput = document.getElementById("baselineOutput");
const letheOutput = document.getElementById("letheOutput");
const chainViz = document.getElementById("chainViz");

let scenarios = [];
let abstention = null;

async function loadScenarios() {
  const res = await fetch("/demo/scenarios");
  const data = await res.json();
  scenarios = data.scenarios;
  abstention = data.abstention;

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
}

function currentScenario() {
  const id = scenarioSelect.value;
  if (id === abstention.id) return { ...abstention, isAbstention: true };
  return scenarios.find((s) => s.id === id);
}

function asOfTimestamp(scenario) {
  if (scenario.isAbstention) return scenario.asOf;
  return scenario.timestamps[asOfSelect.value];
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

async function runQuery() {
  const scenario = currentScenario();
  if (!scenario) return;
  const asOf = asOfTimestamp(scenario);

  baselineOutput.textContent = "Loading...";
  letheOutput.textContent = "Loading...";
  chainViz.innerHTML = "";

  const [baselineRes, letheRes] = await Promise.all([
    fetch(`/baseline/recall?query=${encodeURIComponent(scenario.naturalLanguageQuery)}`).then((r) => r.json()),
    fetch(
      `/recall?entity=${encodeURIComponent(scenario.entity)}&attribute=${encodeURIComponent(scenario.attribute)}&as_of=${encodeURIComponent(asOf)}`,
    ).then((r) => r.json()),
  ]);

  renderBaseline(baselineRes, letheRes.answer);
  renderLethe(letheRes, asOf);

  if (!scenario.isAbstention) {
    const chainRes = await fetch(
      `/chain?entity=${encodeURIComponent(scenario.entity)}&attribute=${encodeURIComponent(scenario.attribute)}`,
    ).then((r) => r.json());
    renderChain(chainRes, letheRes.fact ? letheRes.fact.id : null);
  }
}

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
    row.className = `row ${isTop ? (matchesLethe ? "correct" : "wrong") : ""}`;
    row.innerHTML = `<div>${escapeHtml(m.content)}</div><div class="score">similarity: ${m.score.toFixed(3)}</div>`;
    baselineOutput.appendChild(row);
  });
  if (result.ambiguous) {
    const note = document.createElement("div");
    note.className = "row wrong";
    note.textContent = "Ambiguous: top-2 matches are nearly tied on similarity -- no way to tell which is current.";
    baselineOutput.appendChild(note);
  }
}

function renderLethe(result, asOf) {
  letheOutput.innerHTML = "";
  const row = document.createElement("div");
  row.className = "row correct";
  if (result.answer === null) {
    row.innerHTML = `<div>Abstained: <strong>${escapeHtml(result.reason ?? "no_fact_stated")}</strong></div><div class="score">as of ${asOf}</div>`;
  } else {
    row.innerHTML = `<div>${escapeHtml(result.answer)}</div><div class="score">as of ${asOf} · fact ${escapeHtml(result.fact.id.slice(0, 8))}</div>`;
  }
  letheOutput.appendChild(row);
}

function renderChain(chainResult, validFactId) {
  chainViz.innerHTML = "<strong>Supersession chain:</strong>";
  const facts = chainResult.facts || [];
  facts.forEach((f, i) => {
    const node = document.createElement("div");
    const isCurrent = f.id === validFactId;
    node.className = `fact-node ${isCurrent ? "" : "superseded"}`;
    node.textContent = `${f.written_at}  —  ${f.content}`;
    chainViz.appendChild(node);
    if (i < facts.length - 1) {
      const arrow = document.createElement("div");
      arrow.className = "arrow";
      arrow.textContent = "↓ SUPERSEDES";
      chainViz.appendChild(arrow);
    }
  });
}

runButton.addEventListener("click", runQuery);
loadScenarios().then(runQuery);
