const state = { stores: [], storeId: "", config: null, overview: null, analysis: null, dirty: false, view: "overview" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? "Nieprawidłowe hasło albo sesja wygasła." : body.error || `Błąd API (${response.status})`);
  return body;
}

function toast(message, error = false) {
  const element = $("#toast"); element.textContent = message; element.className = `toast visible${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.className = "toast", 3000);
}

function confirmInline(button, confirmationLabel, action) {
  if (button.dataset.confirming === "true") {
    clearTimeout(button.confirmationTimer);
    button.dataset.confirming = "false";
    button.classList.remove("confirming");
    button.innerHTML = button.dataset.originalContent || button.innerHTML;
    delete button.dataset.originalContent;
    action();
    return;
  }
  button.dataset.originalContent = button.innerHTML;
  button.dataset.confirming = "true";
  button.classList.add("confirming");
  button.textContent = confirmationLabel;
  button.confirmationTimer = setTimeout(() => {
    button.dataset.confirming = "false";
    button.classList.remove("confirming");
    button.innerHTML = button.dataset.originalContent || button.innerHTML;
    delete button.dataset.originalContent;
  }, 4500);
}

function resetSaveConfirmation() {
  const button = $("#save-button");
  if (button.dataset.confirming !== "true") return;
  clearTimeout(button.confirmationTimer);
  button.dataset.confirming = "false";
  button.classList.remove("confirming");
  button.textContent = "Zapisz zmiany";
}

async function loadPanel() {
  const body = await api("/v1/admin/stores");
  state.stores = body.stores;
  if (!state.stores.length) throw new Error("Nie znaleziono żadnego skonfigurowanego sklepu.");
  $("#auth-screen").hidden = true; $("#app-shell").hidden = false;
  renderStoreOptions(); await selectStore(state.stores[0].id);
}

async function connect(password) {
  await api("/v1/admin/session", { method: "POST", body: JSON.stringify({ password }) });
  await loadPanel();
}

function renderStoreOptions() {
  $("#store-select").innerHTML = state.stores.map((store) => `<option value="${escapeHtml(store.id)}">${escapeHtml(store.name)} · ${escapeHtml(store.domain)}</option>`).join("");
}

async function selectStore(storeId) {
  state.storeId = storeId; state.analysis = null; $("#store-select").value = storeId; renderSuggestions();
  try {
    const [configBody, overviewBody] = await Promise.all([api(`/v1/admin/stores/${encodeURIComponent(storeId)}/config`), api(`/v1/admin/stores/${encodeURIComponent(storeId)}/overview`)]);
    state.config = structuredClone(configBody.config); state.overview = overviewBody.overview; state.dirty = false;
    renderAll(); setSaveState();
  } catch (error) { toast(error.message, true); }
}

function renderAll() {
  renderOverview(); renderGeneral(); renderSources(); renderTopics(); renderRules(); renderComparison(); renderJson();
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
  $("#answer-generation").value = String(config.answerGeneration?.enabled !== false);
  $("#answer-tone").value = config.answerGeneration?.tone || "friendly";
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

function renderComparison() {
  const comparison = state.config?.productComparison || { fields: [], similarityWeights: {}, similarityRules: {}, minimumScore: 0 };
  $("#minimum-score").value = Math.round((comparison.minimumScore || 0) * 100);
  $("#comparison-fields").innerHTML = comparison.fields.map((field, index) => {
    const source = field.source || { type: "attribute", key: "attributeKey" };
    const rule = comparison.similarityRules?.[field.id] || { required: false, minimumSimilarity: 0, mismatchPenalty: 0 };
    const options = (values, selected) => values.map((value) => `<option value="${value}"${selected === value ? " selected" : ""}>${value}</option>`).join("");
    const sourceEditor = source.type === "title_regex" ? `<div class="field wide"><label>Wzorzec nazwy wariantu</label><input value="${escapeHtml(source.pattern)}" data-comparison-field="sourcePattern" data-index="${index}" placeholder="(\\d+)\\s*cm"></div><div class="field"><label>Grupa wyniku</label><input type="number" min="0" value="${source.group ?? 1}" data-comparison-field="sourceGroup" data-index="${index}"></div><div class="field"><label>Typ wyniku</label><select data-comparison-field="sourceValueType" data-index="${index}">${options(["text","number"], source.valueType)}</select></div>` : source.type === "array_metric" ? `<div class="field"><label>Klucz danych</label><input value="${escapeHtml(source.key)}" data-comparison-field="sourceKey" data-index="${index}"></div><div class="field"><label>Pole elementu tablicy</label><input value="${escapeHtml(source.property)}" data-comparison-field="sourceProperty" data-index="${index}"></div><div class="field"><label>Operacja</label><select data-comparison-field="sourceOperation" data-index="${index}">${options(["min","max"], source.operation)}</select></div>` : `<div class="field"><label>Klucz danych</label><input value="${escapeHtml(source.key)}" data-comparison-field="sourceKey" data-index="${index}"></div>`;
    return `<article class="item-card"><div class="item-header"><h3>${escapeHtml(field.label || `Pole ${index + 1}`)}</h3><button class="delete-button" data-delete-comparison="${index}" aria-label="Usuń pole">×</button></div><div class="comparison-grid"><div class="field"><label>Identyfikator</label><input value="${escapeHtml(field.id)}" data-comparison-field="id" data-index="${index}"></div><div class="field"><label>Etykieta</label><input value="${escapeHtml(field.label)}" data-comparison-field="label" data-index="${index}"></div><div class="field"><label>Źródło</label><select data-comparison-field="sourceType" data-index="${index}">${options(["attribute","attribute_raw","commercial","array_metric","title_regex"], source.type)}</select></div>${sourceEditor}<div class="field"><label>Format</label><select data-comparison-field="format" data-index="${index}">${options(["text","number","currency","boolean","list"], field.format)}</select></div><div class="field"><label>Jednostka</label><input value="${escapeHtml(field.unit || "")}" data-comparison-field="unit" data-index="${index}" placeholder="cm, dB, GB"></div><div class="field"><label>Preferowana wartość</label><select data-comparison-field="preference" data-index="${index}">${options(["none","min","max"], field.preference)}</select></div><div class="field"><label>Waga podobieństwa</label><input type="number" min="0" step="0.5" value="${comparison.similarityWeights[field.id] || 0}" data-comparison-field="weight" data-index="${index}"></div><div class="field checkbox-field"><label><input type="checkbox" ${rule.required ? "checked" : ""} data-comparison-field="required" data-index="${index}"> Pole obowiązkowe</label></div><div class="field"><label>Minimalne dopasowanie (%)</label><input type="number" min="0" max="100" value="${Math.round((rule.minimumSimilarity || 0) * 100)}" data-comparison-field="minimumSimilarity" data-index="${index}"></div><div class="field"><label>Kara za niedopasowanie</label><input type="number" min="0" step="0.5" value="${rule.mismatchPenalty || 0}" data-comparison-field="mismatchPenalty" data-index="${index}"></div></div></article>`;
  }).join("");
}

function renderSuggestions() {
  const analysis = state.analysis; const listElement = $("#suggestions-list");
  $("#suggestions-empty").hidden = Boolean(analysis); $("#analysis-summary").hidden = !analysis; $("#suggestion-actions").hidden = !analysis?.suggestions?.length;
  if (!analysis) { listElement.innerHTML = ""; return; }
  $("#analysis-summary").innerHTML = `<span>${analysis.productsAnalyzed.toLocaleString("pl-PL")} produktów</span><span>${analysis.attributesDetected} atrybutów</span><span>${analysis.suggestions.length} sugestii</span>`;
  const existing = new Set((state.config?.productComparison?.fields || []).map((field) => field.id));
  listElement.innerHTML = analysis.suggestions.map((suggestion, index) => {
    const disabled = existing.has(suggestion.field.id); const profile = analysis.profiles.find((item) => item.key === suggestion.field.source.key);
    return `<article class="item-card suggestion-card"><input type="checkbox" data-suggestion-index="${index}" ${suggestion.recommended && !disabled ? "checked" : ""} ${disabled ? "disabled" : ""} aria-label="Wybierz ${escapeHtml(suggestion.field.label)}"><div><h3>${escapeHtml(suggestion.field.label)} ${suggestion.recommended ? '<span class="pill success">Rekomendowane</span>' : ""}</h3><p>${escapeHtml(disabled ? "Pole jest już w konfiguracji sklepu." : suggestion.reason)}</p><div class="suggestion-meta"><span>${escapeHtml(suggestion.field.source.key)}</span><span>${escapeHtml(profile?.valueType || suggestion.field.format)}</span><span>przykłady: ${escapeHtml((profile?.examples || []).join(" · "))}</span>${suggestion.rule.required ? "<span>pole obowiązkowe</span>" : ""}</div></div><span class="suggestion-confidence">${Math.round(suggestion.confidence * 100)}%</span></article>`;
  }).join("");
}

async function analyzeCatalog() {
  const button = $("#analyze-products"); button.disabled = true; button.textContent = "Analizuję…";
  try { state.analysis = (await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/config-suggestions`)).analysis; renderSuggestions(); toast("Analiza katalogu została zakończona."); }
  catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = "✦ Analizuj katalog"; }
}

function applySelectedSuggestions() {
  const comparison = ensureComparison(); let added = 0;
  $$("[data-suggestion-index]:checked").forEach((checkbox) => {
    const suggestion = state.analysis?.suggestions[Number(checkbox.dataset.suggestionIndex)];
    if (!suggestion || comparison.fields.some((field) => field.id === suggestion.field.id)) return;
    comparison.fields.push(structuredClone(suggestion.field)); comparison.similarityWeights[suggestion.field.id] = suggestion.weight; comparison.similarityRules[suggestion.field.id] = structuredClone(suggestion.rule); added++;
  });
  if (!added) { toast("Nie wybrano żadnego nowego pola.", true); return; }
  markDirty(); renderSuggestions(); renderComparison(); goTo("comparison"); toast(`Dodano ${added} ${added === 1 ? "pole" : "pola"}. Zapisz konfigurację, aby je aktywować.`);
}

function renderJson() { if (state.config) $("#json-editor").value = JSON.stringify(state.config, null, 2); }
function ensureRetrieval() { state.config.knowledgeRetrieval ||= { locale: "pl-PL", stopWords: [], topicAliases: {}, insufficientEvidenceRules: [] }; return state.config.knowledgeRetrieval; }
function ensureAnswerGeneration() { state.config.answerGeneration ||= { enabled: true, tone: "friendly" }; return state.config.answerGeneration; }
function ensureComparison() { state.config.productComparison ||= { fields: [], similarityWeights: {}, similarityRules: {}, minimumScore: 0 }; state.config.productComparison.similarityRules ||= {}; return state.config.productComparison; }
function list(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function markDirty() { state.dirty = true; resetSaveConfirmation(); setSaveState(); renderJson(); }
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

$("#auth-form").addEventListener("submit", async (event) => { event.preventDefault(); $("#auth-error").textContent = ""; try { await connect($("#admin-key").value); $("#admin-key").value = ""; } catch (error) { $("#auth-error").textContent = error.message; } });
$("#toggle-key").addEventListener("click", () => { const input = $("#admin-key"); input.type = input.type === "password" ? "text" : "password"; });
$("#logout-button").addEventListener("click", async () => { await api("/v1/admin/session", { method: "DELETE" }).catch(() => undefined); location.reload(); });
$("#store-select").addEventListener("change", (event) => { if (state.dirty) { event.target.value = state.storeId; toast("Najpierw zapisz zmiany w bieżącym sklepie.", true); return; } selectStore(event.target.value); });
$("#save-button").addEventListener("click", (event) => confirmInline(event.currentTarget, "Potwierdź zapis", save)); $("#refresh-button").addEventListener("click", () => { if (state.dirty) { toast("Nie można odświeżyć danych przed zapisaniem zmian.", true); return; } selectStore(state.storeId); });
$("#menu-button").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#theme-button").addEventListener("click", () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("shop-agent-theme", theme); });
$$('[data-view]').forEach((button) => button.addEventListener("click", () => goTo(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener("click", () => goTo(button.dataset.go)));

$("#store-name").addEventListener("input", (event) => { state.config.name = event.target.value; markDirty(); });
$("#locale").addEventListener("input", (event) => { ensureRetrieval().locale = event.target.value; markDirty(); });
$("#stop-words").addEventListener("input", (event) => { ensureRetrieval().stopWords = list(event.target.value); markDirty(); });
$("#answer-generation").addEventListener("change", (event) => { ensureAnswerGeneration().enabled = event.target.value === "true"; markDirty(); });
$("#answer-tone").addEventListener("change", (event) => { ensureAnswerGeneration().tone = event.target.value; markDirty(); });
$("#sources-list").addEventListener("input", (event) => { const { sourceField, index } = event.target.dataset; if (!sourceField) return; state.config.knowledgeSources[Number(index)][sourceField] = event.target.value; markDirty(); });
$("#sources-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-source]"); if (!button) return; confirmInline(button, "Potwierdź", () => { state.config.knowledgeSources.splice(Number(button.dataset.deleteSource), 1); markDirty(); renderSources(); }); });
$("#add-source").addEventListener("click", () => { state.config.knowledgeSources ||= []; state.config.knowledgeSources.push({ type: "html", topic: "new-topic", url: "https://example.com" }); markDirty(); renderSources(); });

$("#topics-list").addEventListener("input", (event) => { const retrieval = ensureRetrieval(); if (event.target.dataset.topicAliases) { retrieval.topicAliases[event.target.dataset.topicAliases] = list(event.target.value); markDirty(); } });
$("#topics-list").addEventListener("change", (event) => { const oldKey = event.target.dataset.topicKey; if (!oldKey) return; const next = event.target.value.trim(); if (!next || (next !== oldKey && ensureRetrieval().topicAliases[next])) { toast("Identyfikator tematu musi być unikalny.", true); renderTopics(); return; } const aliases = ensureRetrieval().topicAliases[oldKey]; delete ensureRetrieval().topicAliases[oldKey]; ensureRetrieval().topicAliases[next] = aliases; state.config.knowledgeSources.forEach((source) => { if (source.topic === oldKey) source.topic = next; }); markDirty(); renderTopics(); renderSources(); });
$("#topics-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-topic]"); if (!button) return; confirmInline(button, "Potwierdź", () => { delete ensureRetrieval().topicAliases[button.dataset.deleteTopic]; markDirty(); renderTopics(); }); });
$("#add-topic").addEventListener("click", () => { const topics = ensureRetrieval().topicAliases; let index = 1; while (topics[`topic-${index}`]) index++; topics[`topic-${index}`] = []; markDirty(); renderTopics(); });

$("#rules-list").addEventListener("input", (event) => { const { ruleField, index } = event.target.dataset; if (!ruleField) return; const rule = ensureRetrieval().insufficientEvidenceRules[Number(index)]; rule[ruleField] = ruleField === "message" ? event.target.value : list(event.target.value); markDirty(); });
$("#rules-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-rule]"); if (!button) return; confirmInline(button, "Potwierdź", () => { ensureRetrieval().insufficientEvidenceRules.splice(Number(button.dataset.deleteRule), 1); markDirty(); renderRules(); }); });
$("#add-rule").addEventListener("click", () => { ensureRetrieval().insufficientEvidenceRules.push({ queryTerms: ["fraza"], evidenceTerms: ["dowód"], message: "Dokumenty sklepu nie zawierają wystarczających informacji." }); markDirty(); renderRules(); });
$("#comparison-fields").addEventListener("input", updateComparisonField);
$("#comparison-fields").addEventListener("change", updateComparisonField);
$("#minimum-score").addEventListener("input", (event) => { ensureComparison().minimumScore = Math.min(1, Math.max(0, Number(event.target.value) / 100 || 0)); markDirty(); });
$("#comparison-fields").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-comparison]"); if (!button) return; confirmInline(button, "Potwierdź", () => { const comparison = ensureComparison(); const [removed] = comparison.fields.splice(Number(button.dataset.deleteComparison), 1); if (removed) delete comparison.similarityWeights[removed.id]; markDirty(); renderComparison(); }); });
$("#add-comparison-field").addEventListener("click", () => { const comparison = ensureComparison(); let index = comparison.fields.length + 1; while (comparison.fields.some((field) => field.id === `field-${index}`)) index++; comparison.fields.push({ id: `field-${index}`, label: `Nowe pole ${index}`, source: { type: "attribute", key: "attributeKey" }, format: "text", preference: "none" }); comparison.similarityWeights[`field-${index}`] = 0; markDirty(); renderComparison(); });
$("#analyze-products").addEventListener("click", analyzeCatalog);
$("#select-recommended").addEventListener("click", () => { $$("[data-suggestion-index]").forEach((checkbox) => { const suggestion = state.analysis?.suggestions[Number(checkbox.dataset.suggestionIndex)]; checkbox.checked = Boolean(suggestion?.recommended) && !checkbox.disabled; }); });
$("#apply-suggestions").addEventListener("click", (event) => confirmInline(event.currentTarget, "Potwierdź dodanie", applySelectedSuggestions));
$("#json-editor").addEventListener("input", () => { state.dirty = true; setSaveState(); });
$("#format-json").addEventListener("click", () => { try { $("#json-editor").value = JSON.stringify(JSON.parse($("#json-editor").value), null, 2); $("#json-error").textContent = ""; } catch { $("#json-error").textContent = "JSON zawiera błąd składni."; } });

document.documentElement.dataset.theme = localStorage.getItem("shop-agent-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
api("/v1/admin/session").then(loadPanel).catch(() => undefined);

function updateComparisonField(event) {
  const key = event.target.dataset.comparisonField; if (!key) return;
  const comparison = ensureComparison(); const field = comparison.fields[Number(event.target.dataset.index)]; if (!field) return;
  if (key === "id") { const previous = field.id; const next = event.target.value.trim(); if (!next || comparison.fields.some((item) => item !== field && item.id === next)) return; field.id = next; comparison.similarityWeights[next] = comparison.similarityWeights[previous] || 0; comparison.similarityRules[next] = comparison.similarityRules[previous] || { required: false, minimumSimilarity: 0, mismatchPenalty: 0 }; delete comparison.similarityWeights[previous]; delete comparison.similarityRules[previous]; }
  else if (["label", "format", "preference"].includes(key)) field[key] = event.target.value;
  else if (key === "unit") { if (event.target.value) field.unit = event.target.value; else delete field.unit; }
  else if (key === "weight") comparison.similarityWeights[field.id] = Math.max(0, Number(event.target.value) || 0);
  else if (["required", "minimumSimilarity", "mismatchPenalty"].includes(key)) { const rule = comparison.similarityRules[field.id] ||= { required: false, minimumSimilarity: 0, mismatchPenalty: 0 }; if (key === "required") rule.required = event.target.checked; else if (key === "minimumSimilarity") rule.minimumSimilarity = Math.min(1, Math.max(0, Number(event.target.value) / 100 || 0)); else rule.mismatchPenalty = Math.max(0, Number(event.target.value) || 0); }
  else if (key === "sourceType") { field.source = event.target.value === "commercial" ? { type: "commercial", key: "price" } : event.target.value === "array_metric" ? { type: "array_metric", key: "items", property: "value", operation: "min" } : event.target.value === "title_regex" ? { type: "title_regex", pattern: "(\\d+)", group: 1, valueType: "number" } : { type: event.target.value, key: "attributeKey" }; renderComparison(); }
  else if (key === "sourceKey") field.source.key = event.target.value;
  else if (key === "sourceProperty" && field.source.type === "array_metric") field.source.property = event.target.value;
  else if (key === "sourceOperation" && field.source.type === "array_metric") field.source.operation = event.target.value;
  else if (key === "sourcePattern" && field.source.type === "title_regex") field.source.pattern = event.target.value;
  else if (key === "sourceGroup" && field.source.type === "title_regex") field.source.group = Math.max(0, Number(event.target.value) || 0);
  else if (key === "sourceValueType" && field.source.type === "title_regex") field.source.valueType = event.target.value;
  markDirty();
}
