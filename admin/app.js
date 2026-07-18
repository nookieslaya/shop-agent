const state = { key: sessionStorage.getItem("shop-agent-admin-key") || "", stores: [], storeId: "", config: null, overview: null, dirty: false, view: "overview" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "x-admin-api-key": state.key, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? "Nieprawidłowy klucz administratora." : body.error || `Błąd API (${response.status})`);
  return body;
}

function toast(message, error = false) {
  const element = $("#toast"); element.textContent = message; element.className = `toast visible${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.className = "toast", 3000);
}

async function connect(key) {
  state.key = key;
  const body = await api("/v1/admin/stores");
  state.stores = body.stores;
  if (!state.stores.length) throw new Error("Nie znaleziono żadnego skonfigurowanego sklepu.");
  sessionStorage.setItem("shop-agent-admin-key", key);
  $("#auth-screen").hidden = true; $("#app-shell").hidden = false;
  renderStoreOptions(); await selectStore(state.stores[0].id);
}

function renderStoreOptions() {
  $("#store-select").innerHTML = state.stores.map((store) => `<option value="${escapeHtml(store.id)}">${escapeHtml(store.name)} · ${escapeHtml(store.domain)}</option>`).join("");
}

async function selectStore(storeId) {
  state.storeId = storeId; $("#store-select").value = storeId;
  try {
    const [configBody, overviewBody] = await Promise.all([api(`/v1/admin/stores/${encodeURIComponent(storeId)}/config`), api(`/v1/admin/stores/${encodeURIComponent(storeId)}/overview`)]);
    state.config = structuredClone(configBody.config); state.overview = overviewBody.overview; state.dirty = false;
    renderAll(); setSaveState();
  } catch (error) { toast(error.message, true); }
}

function renderAll() {
  renderOverview(); renderGeneral(); renderSources(); renderTopics(); renderRules(); renderJson();
}

function renderOverview() {
  const data = state.overview || {}; const config = state.config || {}; const retrieval = config.knowledgeRetrieval || {};
  const metrics = [
    ["◫", data.products ?? 0, "Aktywne produkty"], ["✓", data.enrichedProducts ?? 0, "Wzbogacone produkty"],
    ["◇", data.documents ?? 0, "Dokumenty wiedzy"], ["⌘", data.chunks ?? 0, "Fragmenty wiedzy"], ["!", data.failedProducts ?? 0, "Błędy wzbogacania"],
  ];
  $("#metrics-grid").innerHTML = metrics.map(([icon, value, label]) => `<article class="metric"><div class="metric-top"><span class="metric-icon">${icon}</span></div><strong>${Number(value).toLocaleString("pl-PL")}</strong><small>${label}</small></article>`).join("");
  const productCoverage = data.products ? Math.round((data.enrichedProducts / data.products) * 100) : 0;
  const checks = [["Dane techniczne", productCoverage], ["Źródła wiedzy", config.knowledgeSources?.length ? 100 : 0], ["Tematy rozmów", Object.keys(retrieval.topicAliases || {}).length ? 100 : 0], ["Reguły bezpieczeństwa", retrieval.insufficientEvidenceRules?.length ? 100 : 0]];
  $("#health-content").innerHTML = checks.map(([label, percent]) => `<div class="health-row"><strong>${label}</strong><div class="progress"><span style="width:${percent}%"></span></div><strong>${percent}%</strong></div>`).join("");
}

function renderGeneral() {
  const config = state.config; if (!config) return;
  $("#store-name").value = config.name || ""; $("#store-id").value = config.id || "";
  $("#locale").value = config.knowledgeRetrieval?.locale || ""; $("#schema-version").value = config.schemaVersion || 1;
  $("#stop-words").value = (config.knowledgeRetrieval?.stopWords || []).join(", ");
}

function renderSources() {
  const sources = state.config?.knowledgeSources || []; $("#sources-empty").hidden = sources.length > 0;
  $("#sources-list").innerHTML = sources.map((source, index) => `<article class="item-card"><div class="item-header"><h3>Źródło ${index + 1}</h3><button class="delete-button" data-delete-source="${index}" aria-label="Usuń źródło">×</button></div><div class="item-grid"><div class="field"><label>Typ</label><select data-source-field="type" data-index="${index}"><option value="html"${source.type === "html" ? " selected" : ""}>Strona HTML</option><option value="pdf"${source.type === "pdf" ? " selected" : ""}>Dokument PDF</option></select></div><div class="field"><label>Temat</label><input value="${escapeHtml(source.topic)}" data-source-field="topic" data-index="${index}"></div><div class="field url-field"><label>Adres źródła</label><input type="url" value="${escapeHtml(source.url)}" data-source-field="url" data-index="${index}"></div></div></article>`).join("");
}

function renderTopics() {
  const topics = state.config?.knowledgeRetrieval?.topicAliases || {};
  $("#topics-list").innerHTML = Object.entries(topics).map(([topic, aliases], index) => `<article class="topic-card"><div class="item-header"><h3>Temat ${index + 1}</h3><button class="delete-button" data-delete-topic="${escapeHtml(topic)}" aria-label="Usuń temat">×</button></div><div class="field"><label>Identyfikator tematu</label><input value="${escapeHtml(topic)}" data-topic-key="${escapeHtml(topic)}"></div><div class="field"><label>Aliasy klientów</label><textarea data-topic-aliases="${escapeHtml(topic)}" placeholder="gwarancja, reklamacja, serwis">${escapeHtml(aliases.join(", "))}</textarea><small>Oddzielaj aliasy przecinkami.</small></div></article>`).join("");
}

function renderRules() {
  const rules = state.config?.knowledgeRetrieval?.insufficientEvidenceRules || [];
  $("#rules-list").innerHTML = rules.map((rule, index) => `<article class="item-card"><div class="item-header"><h3>Reguła ${index + 1}</h3><button class="delete-button" data-delete-rule="${index}" aria-label="Usuń regułę">×</button></div><div class="rule-grid"><div class="field"><label>Frazy w pytaniu</label><textarea data-rule-field="queryTerms" data-index="${index}">${escapeHtml(rule.queryTerms.join(", "))}</textarea><small>Wszystkie muszą wystąpić w pytaniu.</small></div><div class="field"><label>Wymagane dowody</label><textarea data-rule-field="evidenceTerms" data-index="${index}">${escapeHtml(rule.evidenceTerms.join(", "))}</textarea><small>Wystarczy jeden termin w źródle.</small></div><div class="field wide"><label>Komunikat przy braku danych</label><textarea data-rule-field="message" data-index="${index}">${escapeHtml(rule.message)}</textarea></div></div></article>`).join("");
}

function renderJson() { if (state.config) $("#json-editor").value = JSON.stringify(state.config, null, 2); }
function ensureRetrieval() { state.config.knowledgeRetrieval ||= { locale: "pl-PL", stopWords: [], topicAliases: {}, insufficientEvidenceRules: [] }; return state.config.knowledgeRetrieval; }
function list(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function markDirty() { state.dirty = true; setSaveState(); renderJson(); }
function setSaveState() { $("#save-button").disabled = !state.dirty; $("#save-state").textContent = state.dirty ? "Masz niezapisane zmiany" : "Wszystkie zmiany zapisane"; $("#save-state").classList.toggle("dirty", state.dirty); }

function goTo(view) {
  state.view = view; $$(".view").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#sidebar").classList.remove("open");
}

async function save() {
  if (state.view === "advanced") {
    try { state.config = JSON.parse($("#json-editor").value); $("#json-error").textContent = ""; }
    catch { $("#json-error").textContent = "JSON zawiera błąd składni."; return; }
  }
  try {
    const body = await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/config`, { method: "PUT", body: JSON.stringify(state.config) });
    state.config = structuredClone(body.config); state.dirty = false; renderAll(); setSaveState(); toast("Konfiguracja została zapisana.");
  } catch (error) { toast(error.message, true); }
}

$("#auth-form").addEventListener("submit", async (event) => { event.preventDefault(); $("#auth-error").textContent = ""; try { await connect($("#admin-key").value.trim()); } catch (error) { $("#auth-error").textContent = error.message; } });
$("#toggle-key").addEventListener("click", () => { const input = $("#admin-key"); input.type = input.type === "password" ? "text" : "password"; });
$("#logout-button").addEventListener("click", () => { sessionStorage.removeItem("shop-agent-admin-key"); location.reload(); });
$("#store-select").addEventListener("change", (event) => { if (state.dirty && !confirm("Masz niezapisane zmiany. Zmienić sklep?")) { event.target.value = state.storeId; return; } selectStore(event.target.value); });
$("#save-button").addEventListener("click", save); $("#refresh-button").addEventListener("click", () => selectStore(state.storeId));
$("#menu-button").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#theme-button").addEventListener("click", () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("shop-agent-theme", theme); });
$$('[data-view]').forEach((button) => button.addEventListener("click", () => goTo(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener("click", () => goTo(button.dataset.go)));

$("#store-name").addEventListener("input", (event) => { state.config.name = event.target.value; markDirty(); });
$("#locale").addEventListener("input", (event) => { ensureRetrieval().locale = event.target.value; markDirty(); });
$("#stop-words").addEventListener("input", (event) => { ensureRetrieval().stopWords = list(event.target.value); markDirty(); });
$("#sources-list").addEventListener("input", (event) => { const { sourceField, index } = event.target.dataset; if (!sourceField) return; state.config.knowledgeSources[Number(index)][sourceField] = event.target.value; markDirty(); });
$("#sources-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-source]"); if (!button) return; state.config.knowledgeSources.splice(Number(button.dataset.deleteSource), 1); markDirty(); renderSources(); });
$("#add-source").addEventListener("click", () => { state.config.knowledgeSources ||= []; state.config.knowledgeSources.push({ type: "html", topic: "new-topic", url: "https://example.com" }); markDirty(); renderSources(); });

$("#topics-list").addEventListener("input", (event) => { const retrieval = ensureRetrieval(); if (event.target.dataset.topicAliases) { retrieval.topicAliases[event.target.dataset.topicAliases] = list(event.target.value); markDirty(); } });
$("#topics-list").addEventListener("change", (event) => { const oldKey = event.target.dataset.topicKey; if (!oldKey) return; const next = event.target.value.trim(); if (!next || (next !== oldKey && ensureRetrieval().topicAliases[next])) { toast("Identyfikator tematu musi być unikalny.", true); renderTopics(); return; } const aliases = ensureRetrieval().topicAliases[oldKey]; delete ensureRetrieval().topicAliases[oldKey]; ensureRetrieval().topicAliases[next] = aliases; state.config.knowledgeSources.forEach((source) => { if (source.topic === oldKey) source.topic = next; }); markDirty(); renderTopics(); renderSources(); });
$("#topics-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-topic]"); if (!button) return; delete ensureRetrieval().topicAliases[button.dataset.deleteTopic]; markDirty(); renderTopics(); });
$("#add-topic").addEventListener("click", () => { const topics = ensureRetrieval().topicAliases; let index = 1; while (topics[`topic-${index}`]) index++; topics[`topic-${index}`] = []; markDirty(); renderTopics(); });

$("#rules-list").addEventListener("input", (event) => { const { ruleField, index } = event.target.dataset; if (!ruleField) return; const rule = ensureRetrieval().insufficientEvidenceRules[Number(index)]; rule[ruleField] = ruleField === "message" ? event.target.value : list(event.target.value); markDirty(); });
$("#rules-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-rule]"); if (!button) return; ensureRetrieval().insufficientEvidenceRules.splice(Number(button.dataset.deleteRule), 1); markDirty(); renderRules(); });
$("#add-rule").addEventListener("click", () => { ensureRetrieval().insufficientEvidenceRules.push({ queryTerms: ["fraza"], evidenceTerms: ["dowód"], message: "Dokumenty sklepu nie zawierają wystarczających informacji." }); markDirty(); renderRules(); });
$("#json-editor").addEventListener("input", () => { state.dirty = true; setSaveState(); });
$("#format-json").addEventListener("click", () => { try { $("#json-editor").value = JSON.stringify(JSON.parse($("#json-editor").value), null, 2); $("#json-error").textContent = ""; } catch { $("#json-error").textContent = "JSON zawiera błąd składni."; } });

document.documentElement.dataset.theme = localStorage.getItem("shop-agent-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
if (state.key) connect(state.key).catch(() => { sessionStorage.removeItem("shop-agent-admin-key"); state.key = ""; });
