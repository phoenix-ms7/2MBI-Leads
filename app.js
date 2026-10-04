// 2-MBI Client Finder Dashboard — app logic
// No backend, no API keys. Reads data/leads.json and data/products.json via fetch(),
// keeps outreach status in localStorage.

const SCORING = {
  signal: {
    import: 40,
    clearance: 35,
    dmf: 30,
    cep: 30,
    website: 20,
    rubber: 15,
    patent: 5,
  },
  freightStates: ["Gujarat", "Maharashtra", "Telangana"],
  freightBonus: 10,
  verifiedContactBonus: 5,
  captivePenalty: -30,
};

const BANDS = [
  { id: "hot", label: "Hot", min: 70 },
  { id: "warm", label: "Warm", min: 40 },
  { id: "cold", label: "Cold", min: -Infinity },
];

const STAGES = [
  "New", "Researching", "Ready to contact", "Emailed", "Replied",
  "Sample sent", "Quoted", "Won", "Lost", "Not a fit",
];

const STORAGE_KEY = "mbi-leads-outreach-v1";

let LEADS = [];
let PRODUCTS = [];
let PRODUCT_BY_ID = {};
let OUTREACH = loadOutreach();
let SCORED = []; // leads (non-competitor) with computed score attached
let currentView = "leads"; // "leads" | "competitors"
let activeDetailId = null;

init();

async function init() {
  try {
    const [leadsRes, productsRes] = await Promise.all([
      fetch("data/leads.json"),
      fetch("data/products.json"),
    ]);
    LEADS = await leadsRes.json();
    PRODUCTS = await productsRes.json();
  } catch (err) {
    document.getElementById("app").innerHTML =
      '<p class="load-error">Could not load data/leads.json or data/products.json. ' +
      "If you opened this file directly from disk, run a local server instead " +
      "(see README.md) — fetch() does not work over file://.</p>";
    console.error(err);
    return;
  }

  PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  SCORED = LEADS.filter((l) => !l.is_competitor).map(scoreLead);

  buildFilterOptions();
  bindHeaderControls();
  renderAll();
}

// ---------- Scoring ----------

function scoreLead(lead) {
  const lines = [];
  let total = 0;

  const seenSignals = new Set();
  for (const ev of lead.evidence || []) {
    const pts = SCORING.signal[ev.signal];
    if (pts === undefined) continue;
    const label = signalLabel(ev.signal, ev.end_product);
    lines.push({ label: `${label} +${pts}`, points: pts });
    total += pts;
    seenSignals.add(ev.signal);
  }

  if (lead.state && SCORING.freightStates.includes(lead.state)) {
    lines.push({ label: `${lead.state} plant +${SCORING.freightBonus}`, points: SCORING.freightBonus });
    total += SCORING.freightBonus;
  }

  const hasVerifiedContact = (lead.contacts || []).some(
    (c) => c.email && c.email_status === "verified"
  );
  if (hasVerifiedContact) {
    lines.push({ label: `Verified contact email +${SCORING.verifiedContactBonus}`, points: SCORING.verifiedContactBonus });
    total += SCORING.verifiedContactBonus;
  }

  if (lead.captive_2mbi === "yes") {
    lines.push({ label: `Captive 2-MBI production ${SCORING.captivePenalty}`, points: SCORING.captivePenalty });
    total += SCORING.captivePenalty;
  }

  const capped = Math.max(0, Math.min(100, total));
  const band = BANDS.find((b) => capped >= b.min);

  return { ...lead, score: capped, scoreLines: lines, band: band.id, bandLabel: band.label };
}

function signalLabel(signal, endProductId) {
  const names = {
    import: "Import record",
    clearance: "Environmental clearance",
    dmf: "DMF",
    cep: "CEP",
    website: "Website lists product",
    rubber: "Website lists rubber antioxidant",
    patent: "Patent/paper mention",
  };
  const base = names[signal] || signal;
  const product = PRODUCT_BY_ID[endProductId];
  return product ? `${base} (${product.name})` : base;
}

// ---------- Outreach (localStorage) ----------

function loadOutreach() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOutreach() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(OUTREACH));
  } catch (err) {
    console.error("Could not save outreach progress to localStorage", err);
  }
}

function getOutreach(id) {
  return OUTREACH[id] || { stage: "New", nextStep: "", notes: "" };
}

function setOutreach(id, patch) {
  OUTREACH[id] = { ...getOutreach(id), ...patch };
  saveOutreach();
}

// ---------- Filters ----------

const filterState = {
  segment: "all",
  state: "all",
  band: "all",
  stage: "all",
  product: "all",
  hasContact: "all",
};

function buildFilterOptions() {
  const segments = uniqueSorted(SCORED.map((l) => l.segment).filter(Boolean));
  const states = uniqueSorted(SCORED.map((l) => l.state).filter(Boolean));
  const products = PRODUCTS.map((p) => ({ id: p.id, name: p.name }));

  fillSelect("filter-segment", segments.map((s) => [s, capitalize(s)]));
  fillSelect("filter-state", states.map((s) => [s, s]));
  fillSelect("filter-product", products.map((p) => [p.id, p.name]));
}

function fillSelect(elId, pairs) {
  const el = document.getElementById(elId);
  for (const [value, label] of pairs) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    el.appendChild(opt);
  }
}

function bindHeaderControls() {
  document.getElementById("filter-segment").addEventListener("change", onFilterChange);
  document.getElementById("filter-state").addEventListener("change", onFilterChange);
  document.getElementById("filter-band").addEventListener("change", onFilterChange);
  document.getElementById("filter-stage").addEventListener("change", onFilterChange);
  document.getElementById("filter-product").addEventListener("change", onFilterChange);
  document.getElementById("filter-contact").addEventListener("change", onFilterChange);

  document.getElementById("btn-export").addEventListener("click", exportProgress);
  document.getElementById("file-import").addEventListener("change", importProgress);
  document.getElementById("btn-csv").addEventListener("click", downloadCsv);
  document.getElementById("tab-leads").addEventListener("click", () => switchView("leads"));
  document.getElementById("tab-competitors").addEventListener("click", () => switchView("competitors"));
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("detail-overlay").addEventListener("click", closeDetail);
}

function onFilterChange(e) {
  const key = {
    "filter-segment": "segment",
    "filter-state": "state",
    "filter-band": "band",
    "filter-stage": "stage",
    "filter-product": "product",
    "filter-contact": "hasContact",
  }[e.target.id];
  filterState[key] = e.target.value;
  renderTable();
}

function switchView(view) {
  currentView = view;
  document.getElementById("tab-leads").classList.toggle("active", view === "leads");
  document.getElementById("tab-competitors").classList.toggle("active", view === "competitors");
  document.getElementById("lead-filters").style.display = view === "leads" ? "flex" : "none";
  document.getElementById("tiles").style.display = view === "leads" ? "grid" : "none";
  renderTable();
}

function filteredLeads() {
  return SCORED.filter((l) => {
    if (filterState.segment !== "all" && l.segment !== filterState.segment) return false;
    if (filterState.state !== "all" && l.state !== filterState.state) return false;
    if (filterState.band !== "all" && l.band !== filterState.band) return false;
    if (filterState.product !== "all" && !(l.end_products || []).includes(filterState.product)) return false;
    if (filterState.hasContact === "yes" && !(l.contacts || []).length) return false;
    if (filterState.hasContact === "no" && (l.contacts || []).length) return false;
    const stage = getOutreach(l.id).stage;
    if (filterState.stage !== "all" && stage !== filterState.stage) return false;
    return true;
  }).sort((a, b) => b.score - a.score);
}

// ---------- Rendering ----------

function renderAll() {
  renderTiles();
  renderTable();
}

function renderTiles() {
  const total = SCORED.length;
  const hot = SCORED.filter((l) => l.band === "hot").length;
  const warm = SCORED.filter((l) => l.band === "warm").length;
  const cold = SCORED.filter((l) => l.band === "cold").length;
  const withContact = SCORED.filter((l) => (l.contacts || []).length).length;
  const emailed = SCORED.filter((l) => {
    const stage = getOutreach(l.id).stage;
    return stage && stage !== "New" && stage !== "Researching" && stage !== "Ready to contact";
  }).length;

  const tiles = [
    { label: "Total leads", value: total },
    { label: "Hot", value: hot, cls: "band-hot" },
    { label: "Warm", value: warm, cls: "band-warm" },
    { label: "Cold", value: cold, cls: "band-cold" },
    { label: "With a contact", value: withContact },
    { label: "Emailed or further", value: emailed },
  ];

  document.getElementById("tiles").innerHTML = tiles
    .map(
      (t) => `<div class="tile ${t.cls || ""}"><div class="tile-value">${t.value}</div><div class="tile-label">${escapeHtml(t.label)}</div></div>`
    )
    .join("");
}

function renderTable() {
  const container = document.getElementById("table-wrap");
  const rows = currentView === "leads" ? filteredLeads() : SCORED_COMPETITORS();

  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">No companies match these filters.</p>';
    return;
  }

  const showScore = currentView === "leads";

  const head = `
    <tr>
      <th>Company</th>
      <th>Segment</th>
      <th>End products</th>
      <th>State</th>
      ${showScore ? "<th>Score</th>" : ""}
      <th>Best contact</th>
      ${showScore ? "<th>Stage</th>" : ""}
    </tr>`;

  const body = rows
    .map((l) => {
      const contact = bestContact(l);
      const stage = getOutreach(l.id).stage;
      return `
        <tr data-id="${attr(l.id)}" class="lead-row">
          <td>${l.is_example ? '<span class="example-tag">EXAMPLE</span> ' : ""}${escapeHtml(l.name)}</td>
          <td>${escapeHtml(capitalize(l.segment || ""))}</td>
          <td>${(l.end_products || []).map((id) => escapeHtml(productName(id))).join(", ")}</td>
          <td>${escapeHtml(l.state || "—")}</td>
          ${showScore ? `<td><span class="score-pill band-${l.band}">${l.score}</span></td>` : ""}
          <td>${contact ? escapeHtml(contact.title || "Contact") : "—"}</td>
          ${showScore ? `<td>${escapeHtml(stage)}</td>` : ""}
        </tr>`;
    })
    .join("");

  container.innerHTML = `<table class="lead-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;

  container.querySelectorAll(".lead-row").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

function SCORED_COMPETITORS() {
  return LEADS.filter((l) => l.is_competitor);
}

function bestContact(lead) {
  const contacts = lead.contacts || [];
  if (!contacts.length) return null;
  return contacts.find((c) => c.email) || contacts[0];
}

function productName(id) {
  return PRODUCT_BY_ID[id] ? PRODUCT_BY_ID[id].name : id;
}

// ---------- Detail panel ----------

function openDetail(id) {
  activeDetailId = id;
  const lead =
    SCORED.find((l) => l.id === id) || LEADS.find((l) => l.id === id);
  if (!lead) return;

  const isCompetitor = !!lead.is_competitor;
  const outreach = getOutreach(id);
  const contacts = lead.contacts || [];

  const scoreBlock = isCompetitor
    ? ""
    : `
      <div class="detail-section">
        <h3>Score: <span class="score-pill band-${lead.band}">${lead.score} · ${lead.bandLabel}</span></h3>
        <ul class="score-breakdown">
          ${lead.scoreLines.length ? lead.scoreLines.map((s) => `<li>${escapeHtml(s.label)}</li>`).join("") : "<li>No scored evidence yet.</li>"}
        </ul>
      </div>`;

  const evidenceBlock = `
    <div class="detail-section">
      <h3>Evidence</h3>
      ${
        (lead.evidence || []).length
          ? `<ul class="evidence-list">${lead.evidence
              .map(
                (ev) => `
              <li>
                <span class="signal-tag">${escapeHtml(ev.signal)}</span>
                ${ev.end_product ? `<span class="evidence-product">${escapeHtml(productName(ev.end_product))}</span>` : ""}
                <p class="evidence-snippet">&ldquo;${escapeHtml(ev.snippet || "")}&rdquo;</p>
                <p class="evidence-meta">
                  ${ev.source_url ? `<a href="${attr(ev.source_url)}" target="_blank" rel="noopener">Source</a>` : "No source link"}
                  ${ev.date ? ` · ${escapeHtml(ev.date)}` : ""}
                </p>
              </li>`
              )
              .join("")}</ul>`
          : '<p class="empty-state">No evidence recorded yet — this is an unresearched seed candidate.</p>'
      }
    </div>`;

  const contactsBlock = `
    <div class="detail-section">
      <h3>Contacts</h3>
      ${
        contacts.length
          ? `<ul class="contact-list">${contacts
              .map(
                (c, i) => `
              <li>
                <strong>${escapeHtml(c.name || "(name unknown)")}</strong> — ${escapeHtml(c.title || "")}<br/>
                ${c.email ? `<span class="contact-email">${escapeHtml(c.email)}</span> <button class="btn-small" data-copy="${attr(c.email)}">Copy</button>` : "<em>no email on file</em>"}
                <span class="contact-meta">${escapeHtml(c.email_status || "unknown")} · ${escapeHtml(c.source || "manual")}</span>
              </li>`
              )
              .join("")}</ul>`
          : '<p class="empty-state">No contact on file yet.</p>'
      }
    </div>`;

  const outreachBlock = isCompetitor
    ? ""
    : `
      <div class="detail-section">
        <h3>Outreach</h3>
        <label class="field-label">Stage
          <select id="detail-stage">
            ${STAGES.map((s) => `<option value="${attr(s)}" ${s === outreach.stage ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select>
        </label>
        <label class="field-label">Next step date
          <input type="date" id="detail-nextstep" value="${attr(outreach.nextStep || "")}" />
        </label>
        <label class="field-label">Notes
          <textarea id="detail-notes" rows="3">${escapeHtml(outreach.notes || "")}</textarea>
        </label>
        <button class="btn" id="detail-draft-email">Draft email</button>
      </div>`;

  document.getElementById("detail-body").innerHTML = `
    <h2>${lead.is_example ? '<span class="example-tag">EXAMPLE</span> ' : ""}${escapeHtml(lead.name)}</h2>
    <p class="detail-sub">
      ${lead.website ? `<a href="${attr(lead.website)}" target="_blank" rel="noopener">${escapeHtml(lead.website)}</a> · ` : ""}
      ${escapeHtml(lead.city || "")}${lead.city && lead.state ? ", " : ""}${escapeHtml(lead.state || "")}
      · ${escapeHtml(capitalize(lead.segment || ""))}
      · Captive 2-MBI: ${escapeHtml(lead.captive_2mbi || "unknown")}
    </p>
    ${lead.notes ? `<p class="detail-notes">${escapeHtml(lead.notes)}</p>` : ""}
    ${scoreBlock}
    ${evidenceBlock}
    ${contactsBlock}
    ${outreachBlock}
  `;

  if (!isCompetitor) {
    document.getElementById("detail-stage").addEventListener("change", (e) => {
      setOutreach(id, { stage: e.target.value });
      renderTable();
      renderTiles();
    });
    document.getElementById("detail-nextstep").addEventListener("change", (e) => {
      setOutreach(id, { nextStep: e.target.value });
    });
    document.getElementById("detail-notes").addEventListener("change", (e) => {
      setOutreach(id, { notes: e.target.value });
    });
    document.getElementById("detail-draft-email").addEventListener("click", () => draftEmail(lead));
  }

  document.getElementById("detail-body").querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard?.writeText(btn.dataset.copy).catch(() => {});
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    });
  });

  document.getElementById("detail-panel").classList.add("open");
  document.getElementById("detail-overlay").classList.add("open");
}

function closeDetail() {
  document.getElementById("detail-panel").classList.remove("open");
  document.getElementById("detail-overlay").classList.remove("open");
  activeDetailId = null;
}

function draftEmail(lead) {
  const contact = bestContact(lead);
  const products = (lead.end_products || []).map(productName).join(", ") || "2-MBI-related products";
  const greeting = contact && contact.name ? `Dear ${contact.name},` : "Dear Sir/Madam,";

  const subject = `2-Mercaptobenzimidazole (2-MBI) supply for ${lead.name}`;
  const body = `${greeting}

I'm reaching out from Finornic regarding 2-Mercaptobenzimidazole (2-MBI, CAS 583-39-1), which we understand is relevant to your production of ${products}.

We supply 2-MBI and would welcome the opportunity to discuss your current sourcing and share samples, pricing and specifications.

Would you be open to a short call this week?

Best regards,
Finornic`;

  const to = contact && contact.email ? contact.email : "";
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

// ---------- Export / Import / CSV ----------

function exportProgress() {
  const blob = new Blob([JSON.stringify(OUTREACH, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mbi-outreach-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      OUTREACH = { ...OUTREACH, ...data };
      saveOutreach();
      renderAll();
    } catch (err) {
      alert("That file doesn't look like a valid outreach export (expected JSON).");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function downloadCsv() {
  const rows = currentView === "leads" ? filteredLeads() : SCORED_COMPETITORS();
  const headers = ["Name", "Segment", "End products", "State", "Score", "Band", "Contact name", "Contact title", "Contact email", "Stage"];
  const lines = [headers.join(",")];

  for (const l of rows) {
    const contact = bestContact(l) || {};
    const outreach = getOutreach(l.id);
    const fields = [
      l.name,
      l.segment || "",
      (l.end_products || []).map(productName).join("; "),
      l.state || "",
      l.score ?? "",
      l.bandLabel || "",
      contact.name || "",
      contact.title || "",
      contact.email || "",
      l.is_competitor ? "" : outreach.stage,
    ];
    lines.push(fields.map(csvField).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mbi-leads-${currentView}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- Utilities ----------

function uniqueSorted(arr) {
  return [...new Set(arr)].sort();
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function attr(s) {
  return escapeHtml(s);
}
