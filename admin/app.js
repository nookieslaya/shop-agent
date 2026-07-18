const state = { stores: [], storeId: "", config: null, overview: null, usage: null, backup: null, publication: null, analysis: null, conversations: null, quality: null, syncJobs: null, onboarding: { feed: null, page: null, stage: 1 }, dirty: false, view: "overview" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
$(".content-wrap").append($("[data-view-panel='usage']"));

async function api(path, options = {}) {
  const headers = { ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
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
  state.storeId = storeId; state.analysis = null; state.conversations = null; state.quality = null; state.syncJobs = null; $("#store-select").value = storeId; renderSuggestions(); renderConversations(); renderQuality(); renderSyncJobs();
  try {
    const [configBody, overviewBody, usageBody,publicationBody,backupBody] = await Promise.all([api(`/v1/admin/stores/${encodeURIComponent(storeId)}/config`), api(`/v1/admin/stores/${encodeURIComponent(storeId)}/overview`),api(`/v1/admin/stores/${encodeURIComponent(storeId)}/usage`),api(`/v1/admin/stores/${encodeURIComponent(storeId)}/publication-readiness`),api("/v1/admin/system/backups")]);
    state.config = structuredClone(configBody.config); state.overview = overviewBody.overview; state.usage=usageBody;state.publication=publicationBody.readiness;state.backup=backupBody; state.dirty = false;
    renderAll(); setSaveState();
  } catch (error) { toast(error.message, true); }
}

function renderAll() {
  renderOverview(); renderGeneral(); renderUsage(); renderBackup(); renderPublication(); renderGuided(); renderSyncSchedule(); renderSources(); renderTopics(); renderRules(); renderComparison(); renderWidget(); renderJson();
}

function ensureAiLimits(){state.config.aiLimits||={enabled:true,requestsPerMinute:30,dailyRequests:2000,monthlyTokens:2000000,maximumMessageCharacters:4000,alertPercent:80,inputCostUsdPerMillionTokens:0,outputCostUsdPerMillionTokens:0,limitMessage:"Asystent osiągnął chwilowy limit. Spróbuj ponownie za moment."};return state.config.aiLimits}
function renderUsage(){if(!state.config)return;const limits=ensureAiLimits(),usage=state.usage?.usage||{day:{},month:{}};const totalMonth=(usage.month.inputTokens||0)+(usage.month.outputTokens||0);const metrics=[[usage.day.requests||0,"Wywołania dzisiaj"],[totalMonth.toLocaleString("pl-PL"),"Tokeny w miesiącu"],[`$${((usage.month.costMicrousd||0)/1e6).toFixed(4)}`,"Szacowany koszt"],[`${Math.round(usage.day.averageLatencyMs||0)} ms`,"Średni czas"],[usage.day.failures||0,"Błędy dzisiaj"]];$("#usage-metrics").innerHTML=metrics.map(([value,label])=>`<article class="metric"><strong>${value}</strong><small>${label}</small></article>`).join("");const worker=state.usage?.runtimes?.find(item=>item.component==="sync-worker"),fresh=worker&&Date.now()-new Date(worker.heartbeatAt).getTime()<30000;$("#worker-status").textContent=`Worker: ${fresh?"aktywny":"brak sygnału"}`;$("#worker-status").className=`pill ${fresh?"success":""}`;[["ai-limits-enabled",String(limits.enabled)],["ai-limit-minute",limits.requestsPerMinute],["ai-limit-day",limits.dailyRequests],["ai-limit-month",limits.monthlyTokens],["ai-message-length",limits.maximumMessageCharacters],["ai-alert-percent",limits.alertPercent],["ai-input-price",limits.inputCostUsdPerMillionTokens],["ai-output-price",limits.outputCostUsdPerMillionTokens],["ai-limit-message",limits.limitMessage]].forEach(([id,value])=>$("#"+id).value=value)}
async function loadUsage(){state.usage=await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/usage`);renderUsage()}
function renderBackup(){const data=state.backup,backup=data?.backup,metadata=backup?.metadata||{},latest=metadata.file;$("#backup-status").innerHTML=backup?`<div class="panel-heading"><div><p class="eyebrow">OSTATNIA KOPIA</p><h2>${escapeHtml(latest||"Archiwum bez nazwy")}</h2></div><span class="pill ${backup.fresh?"success":""}">${backup.fresh?"Aktualna":"Nieaktualna"}</span></div><div class="backup-meta"><span>${new Date(backup.heartbeatAt).toLocaleString("pl-PL")}</span><span>${Number(metadata.sizeBytes||0).toLocaleString("pl-PL")} bajtów</span><span>${metadata.verified?"Zweryfikowana":"Wymaga próbnego odtworzenia"}</span><code>${escapeHtml(String(metadata.sha256||""))}</code></div>`:`<div class="empty-state"><span>▣</span><h3>Brak zarejestrowanej kopii</h3><p>Kontener backupu utworzy pierwszą kopię po uruchomieniu.</p></div>`;const verify=latest?`docker compose run --rm backup sh /scripts/verify-backup.sh ${latest}`:"Najpierw utwórz kopię",restore=latest?`docker compose stop api worker backup\ndocker compose run --rm backup sh /scripts/restore-backup.sh ${latest} RESTORE-shop_agent\ndocker compose up -d api worker backup`:"Najpierw utwórz i zweryfikuj kopię";$("#verify-command").textContent=verify;$("#restore-command").textContent=restore}
async function loadBackup(){state.backup=await api("/v1/admin/system/backups");renderBackup()}
function ensurePublicationRequirements(){state.config.publicationRequirements||={minimumProducts:1,minimumEnrichmentPercent:80,requireKnowledgeSources:true,minimumQualityScenarios:3,requireAllQualityPassing:true};return state.config.publicationRequirements}
function renderPublication(){if(!state.config)return;const requirements=ensurePublicationRequirements(),readiness=state.publication,ready=readiness?.ready,published=readiness?.published;$("#publication-title").textContent=published?"Widget jest opublikowany":ready?"Sklep gotowy do publikacji":"Sklep wymaga przygotowania";$("#publication-description").textContent=published?"Asystent jest dostępny dla klientów.":ready?"Wszystkie wymagane kontrole zostały zaliczone.":"Uzupełnij elementy oznaczone jako wymagane.";const publish=$("#publish-store");publish.disabled=!ready||published;publish.textContent=published?"Widget opublikowany":"Opublikuj widget";$("#publication-checks").innerHTML=(readiness?.checks||[]).map(check=>`<article class="publication-check ${check.passed?"passed":"failed"}"><span>${check.passed?"✓":"!"}</span><div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.message)}</p>${!check.passed&&check.action?`<button class="secondary-button" data-publication-action="${check.action}">Przejdź do sekcji →</button>`:""}</div><small>${check.required?"Wymagane":"Opcjonalne"}</small></article>`).join("");[["publication-min-products",requirements.minimumProducts],["publication-enrichment",requirements.minimumEnrichmentPercent],["publication-require-knowledge",String(requirements.requireKnowledgeSources)],["publication-quality-count",requirements.minimumQualityScenarios],["publication-all-quality",String(requirements.requireAllQualityPassing)]].forEach(([id,value])=>$("#"+id).value=value)}
async function loadPublication(){state.publication=(await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/publication-readiness`)).readiness;renderPublication()}

function onboardingStage(stage){state.onboarding.stage=stage;$$('[data-onboarding-stage]').forEach(item=>item.hidden=Number(item.dataset.onboardingStage)!==stage);$$('#onboarding-steps span').forEach((item,index)=>item.classList.toggle('active',index<stage));if(stage===5)renderOnboardingSummary()}
function resetOnboarding(){state.onboarding={feed:null,page:null,stage:1};["new-store-name","new-store-id","new-store-feed","new-knowledge-sources"].forEach(id=>$("#"+id).value="");$("#new-store-locale").value="pl-PL";$("#new-product-page-enabled").value="true";$("#new-product-selector").innerHTML='<option value="table tr">table tr</option>';$("#onboarding-feed-result").innerHTML="";$("#onboarding-page-result").hidden=true;onboardingStage(1)}
function knowledgeSources(){return $("#new-knowledge-sources").value.split("\n").map(line=>{const [topic,type,...url]=line.split("|").map(value=>value.trim());return topic&&["html","pdf"].includes(type)&&url.length?{topic,type,url:url.join("|")}:null}).filter(Boolean)}
function renderOnboardingSummary(){const feed=state.onboarding.feed;$("#onboarding-summary").innerHTML=`<div class="readiness-list"><p><strong>Sklep</strong><span>${escapeHtml($("#new-store-name").value)} · ${escapeHtml($("#new-store-id").value)}</span></p><p><strong>Katalog</strong><span>${feed?.productCount||0} produktów · ${escapeHtml((feed?.currencies||[]).join(", "))}</span></p><p><strong>Parametry</strong><span>${$("#new-product-page-enabled").value==="true"?escapeHtml($("#new-product-selector").value):"wyłączone"}</span></p><p><strong>Źródła wiedzy</strong><span>${knowledgeSources().length}</span></p></div>`}
async function analyzeOnboardingFeed(){const button=$("#onboarding-analyze-feed"),name=$("#new-store-name").value.trim(),id=$("#new-store-id").value.trim(),url=$("#new-store-feed").value.trim();if(!name||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)||!url){toast("Uzupełnij nazwę, poprawny identyfikator i URL feedu.",true);return}button.disabled=true;button.textContent="Analizuję…";try{const body=await api("/v1/admin/onboarding/analyze-feed",{method:"POST",body:JSON.stringify({url})});state.onboarding.feed=body.analysis;const a=body.analysis,c=a.coverage;$("#onboarding-feed-result").innerHTML=`<div class="analysis-summary"><span>${a.productCount} produktów</span><span>${escapeHtml(a.currencies.join(", "))}</span><span>Marka: ${c.brand}/${a.productCount}</span><span>Kategoria: ${c.category}/${a.productCount}</span><span>Opis: ${c.description}/${a.productCount}</span></div><div class="sample-products">${a.samples.map(item=>`<div><strong>${escapeHtml(item.title)}</strong><small>${Number(item.price).toLocaleString("pl-PL")} ${escapeHtml(item.currency)} · ${escapeHtml(item.availability)}</small></div>`).join("")}</div>`;onboardingStage(2)}catch(error){toast(error.message,true)}finally{button.disabled=false;button.textContent="Analizuj feed →"}}
async function analyzeOnboardingPage(){const sample=state.onboarding.feed?.samples?.[0];if(!sample){toast("Najpierw przeanalizuj feed.",true);return}const button=$("#onboarding-analyze-page");button.disabled=true;button.textContent="Analizuję…";try{const body=await api("/v1/admin/onboarding/analyze-product-page",{method:"POST",body:JSON.stringify({url:sample.productUrl})});state.onboarding.page=body.analysis;const select=$("#new-product-selector"),candidates=body.analysis.candidates;select.innerHTML=candidates.length?candidates.map(item=>`<option value="${escapeHtml(item.selector)}">${escapeHtml(item.selector)} · ${item.rowCount} wierszy</option>`).join(""):'<option value="table tr">Nie wykryto — table tr</option>';const box=$("#onboarding-page-result");box.hidden=false;box.innerHTML=candidates.length?`<strong>Wykryto ${candidates.length} kandydatów</strong><p>Najlepszy zwrócił ${candidates[0].rowCount} wierszy. Przykład: ${escapeHtml(candidates[0].sample.map(row=>`${row.label}: ${row.value}`).join(" · "))}</p>`:"<strong>Nie wykryto tabeli parametrów</strong><p>Wyłącz wzbogacanie i skonfiguruj selektor później.</p>"}catch(error){toast(error.message,true)}finally{button.disabled=false;button.textContent="✦ Wykryj tabelę na próbce"}}
async function createOnboardedStore(){const payload={id:$("#new-store-id").value.trim(),name:$("#new-store-name").value.trim(),feedUrl:$("#new-store-feed").value.trim(),locale:$("#new-store-locale").value.trim(),productPage:{enabled:$("#new-product-page-enabled").value==="true",specificationRowSelector:$("#new-product-selector").value},knowledgeSources:knowledgeSources(),startImport:$("#new-store-start-import").checked};const button=$("#onboarding-create");button.disabled=true;button.textContent="Tworzę…";try{const body=await api("/v1/admin/stores",{method:"POST",body:JSON.stringify(payload)});state.stores=(await api("/v1/admin/stores")).stores;renderStoreOptions();await selectStore(body.config.id);goTo("overview");toast(body.job?"Sklep utworzony. Import został dodany do kolejki.":"Sklep utworzony.")}catch(error){toast(error.message,true)}finally{button.disabled=false;button.textContent="Utwórz sklep"}}

function ensureGuided(){state.config.guidedSelling||={widthQuestion:"Jakiego rozmiaru produktu potrzebujesz?",widthChoices:[{label:"60 cm",value:60}],budgetQuestion:"Jaki budżet chcesz przeznaczyć?",budgetChoices:[{label:"Do 2500 zł",valueMinor:250000},{label:"Bez limitu",valueMinor:99999900}],priorityQuestion:"Co jest dla Ciebie najważniejsze?",priorityChoices:[{label:"Najlepsze dopasowanie",value:"any"}]};return state.config.guidedSelling}
function renderGuided(){const g=ensureGuided();$("#guided-width-question").value=g.widthQuestion;$("#guided-width-choices").value=g.widthChoices.map(x=>`${x.label} | ${x.value}`).join("\n");$("#guided-budget-question").value=g.budgetQuestion;$("#guided-budget-choices").value=g.budgetChoices.map(x=>`${x.label} | ${x.valueMinor/100}`).join("\n");$("#guided-priority-question").value=g.priorityQuestion;$("#guided-priority-choices").value=g.priorityChoices.map(x=>`${x.label} | ${x.value}`).join("\n");const help=$("[aria-label='Pomoc: pytanie o budżet']");if(help)help.dataset.tooltip="Klient może również napisać: do 2500 zł, powyżej 10 000 zł, bez limitu, pokaż 2 najdroższe albo pokaż najtańszy. Silnik rozdziela kwotę, sortowanie i liczbę wyników."}
function choiceLines(value,convert){return value.split("\n").map(line=>{const split=line.lastIndexOf("|");if(split<1)return null;const label=line.slice(0,split).trim(),raw=line.slice(split+1).trim(),converted=convert(raw);return label&&converted!==null?{label,value:converted}:null}).filter(Boolean)}
async function detectGuidedChoices(){const button=$("#detect-guided-choices");button.disabled=true;button.textContent="Analizuję…";try{const {analysis}=await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/config-suggestions`);const suggested=analysis.guidedSelling;if(!suggested?.widthChoices?.length)throw new Error("Katalog nie zawiera wystarczających danych o rozmiarach.");const g=ensureGuided();g.widthChoices=suggested.widthChoices;g.budgetChoices=suggested.budgetChoices;renderGuided();markDirty();const box=$("#guided-detection-result");box.hidden=false;box.innerHTML=`<strong>Propozycje gotowe</strong><p>Wykryto ${suggested.widthChoices.length} rozmiarów i ${suggested.budgetChoices.length} progów budżetowych. Sprawdź wartości i użyj „Zapisz zmiany”, aby je aktywować.</p>`;toast("Wstawiono propozycje z katalogu.")}catch(error){toast(error.message,true)}finally{button.disabled=false;button.textContent="✦ Wykryj z katalogu"}}

function renderWidget() {
  const widget=state.config?ensureWidget():null;if(!widget)return;
  $("#widget-enabled").value=String(widget.enabled!==false);$("#widget-theme").value=widget.theme||"light";$("#widget-title").value=widget.title||"";$("#widget-subtitle").value=widget.subtitle||"";$("#widget-color").value=widget.primaryColor||"#2563eb";$("#widget-color-picker").value=widget.primaryColor||"#2563eb";$("#widget-powered").value=String(widget.showPoweredBy!==false);$("#widget-welcome").value=widget.welcomeMessage||"";$("#widget-placeholder").value=widget.inputPlaceholder||"";$("#widget-starters").value=(widget.starterSuggestions||[]).map(item=>`${item.label} | ${item.message}`).join("\n");$("#widget-preview").href=`/widget?storeId=${encodeURIComponent(state.storeId)}`;$("#widget-embed-code").value=`<script src="${location.origin}/embed/shop-agent.js" data-store-id="${state.storeId}" data-position="right" data-label="${widget.title}" data-color="${widget.primaryColor}"><\/script>`;
  $("#widget-enabled option[value='true']").disabled=widget.enabled!==true;
}
function ensureWidget(){state.config.widget||={enabled:false,title:"Asystent zakupowy",subtitle:"Pomogę wybrać odpowiedni produkt",welcomeMessage:"Dzień dobry! W czym mogę pomóc?",inputPlaceholder:"Napisz, czego szukasz…",primaryColor:"#2563eb",theme:"light",showPoweredBy:true,starterSuggestions:[]};return state.config.widget}
function updateEmbedCode(){const widget=ensureWidget();$("#widget-embed-code").value=`<script src="${location.origin}/embed/shop-agent.js" data-store-id="${state.storeId}" data-position="right" data-label="${widget.title}" data-color="${widget.primaryColor}"><\/script>`}

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
  const routing = ensureRouting(); $("#routing-product-terms").value = routing.productTerms.join(", "); $("#routing-contact-terms").value = routing.contactTerms.join(", ");
  $("#routing-contact-response").value = routing.contactResponse; $("#routing-unknown-response").value = routing.unknownResponse;
}

function renderSources() {
  const sources = state.config?.knowledgeSources || []; $("#sources-empty").hidden = sources.length > 0;
  $("#sources-list").innerHTML = sources.map((source, index) => `<article class="item-card"><div class="item-header"><h3>Źródło ${index + 1}</h3><button class="delete-button" data-delete-source="${index}" aria-label="Usuń źródło">×</button></div><div class="item-grid"><div class="field"><label>Typ</label><select data-source-field="type" data-index="${index}"><option value="html"${source.type === "html" ? " selected" : ""}>Strona HTML</option><option value="pdf"${source.type === "pdf" ? " selected" : ""}>Dokument PDF</option></select></div><div class="field"><label>Temat</label><input value="${escapeHtml(source.topic)}" data-source-field="topic" data-index="${index}"></div><div class="field url-field"><label>Adres źródła</label><input type="url" value="${escapeHtml(source.url)}" data-source-field="url" data-index="${index}"></div></div></article>`).join("");
}

function renderTopics() {
  const retrieval = ensureRetrieval(); const topics = retrieval.topicAliases || {};
  $("#topics-list").innerHTML = Object.entries(topics).map(([topic, aliases], index) => `<article class="topic-card"><div class="item-header"><h3>Temat ${index + 1}</h3><button class="delete-button" data-delete-topic="${escapeHtml(topic)}" aria-label="Usuń temat">×</button></div><div class="field"><label>Identyfikator tematu</label><input value="${escapeHtml(topic)}" data-topic-key="${escapeHtml(topic)}"></div><div class="field"><label>Aliasy klientów</label><textarea data-topic-aliases="${escapeHtml(topic)}" placeholder="gwarancja, reklamacja, serwis">${escapeHtml(aliases.join(", "))}</textarea></div><div class="field"><label>Podpowiedzi po odpowiedzi</label><textarea data-topic-suggestions="${escapeHtml(topic)}" placeholder="Etykieta | pełne pytanie | wymagane dowody">${escapeHtml((retrieval.topicSuggestions?.[topic] || []).map(item=>`${item.label} | ${item.message} | ${(item.evidenceTerms||[]).join(", ")}`).join("\n"))}</textarea><small>Podpowiedź pojawi się tylko wtedy, gdy źródło zawiera wszystkie wymagane dowody.</small></div></article>`).join("");
}

function renderRules() {
  const rules = state.config?.knowledgeRetrieval?.insufficientEvidenceRules || [];
  $("#rules-list").innerHTML = rules.map((rule, index) => `<article class="item-card"><div class="item-header"><h3>Reguła ${index + 1}</h3><button class="delete-button" data-delete-rule="${index}" aria-label="Usuń regułę">×</button></div><div class="rule-grid"><div class="field"><label>Frazy w pytaniu</label><textarea data-rule-field="queryTerms" data-index="${index}">${escapeHtml(rule.queryTerms.join(", "))}</textarea><small>Wszystkie muszą wystąpić w pytaniu.</small></div><div class="field"><label>Wymagane dowody</label><textarea data-rule-field="evidenceTerms" data-index="${index}">${escapeHtml(rule.evidenceTerms.join(", "))}</textarea></div><div class="field"><label>Minimalna liczba dowodów</label><input type="number" min="1" max="${rule.evidenceTerms.length}" value="${rule.minimumEvidenceMatches||1}" data-rule-field="minimumEvidenceMatches" data-index="${index}"></div><div class="field wide"><label>Komunikat przy braku danych</label><textarea data-rule-field="message" data-index="${index}">${escapeHtml(rule.message)}</textarea></div></div></article>`).join("");
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

function ensureSyncSchedule(){state.config.syncSchedule||={enabled:false,intervalHours:24};return state.config.syncSchedule}
function renderSyncSchedule(){const schedule=ensureSyncSchedule();$("#sync-schedule-enabled").value=String(schedule.enabled);$("#sync-schedule-hours").value=String(schedule.intervalHours||24)}
async function loadSyncJobs(silent=false){try{state.syncJobs=(await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/sync-jobs`)).jobs;renderSyncJobs()}catch(error){if(!silent)toast(error.message,true)}}
function renderSyncJobs(){const jobs=state.syncJobs||[];$("#sync-jobs-empty").hidden=state.syncJobs===null||jobs.length>0;const labels={feed:"Katalog",enrichment:"Dane techniczne",knowledge:"Wiedza",full:"Pełna synchronizacja"},statuses={queued:"W kolejce",running:"W toku",completed:"Zakończono",failed:"Błąd",cancelled:"Anulowano"};$("#sync-jobs-list").innerHTML=jobs.map(job=>`<article class="sync-job-card ${job.status}" data-sync-job="${job.id}"><div class="sync-job-main"><div><span class="pill">${labels[job.type]||job.type}</span><strong>${statuses[job.status]||job.status}</strong><small>${new Date(job.createdAt).toLocaleString("pl-PL")} · ${job.mode}${job.scheduled?" · harmonogram":""}</small></div><span class="sync-progress-value">${job.progress}%</span></div><div class="progress"><span style="width:${job.progress}%"></span></div><p>${escapeHtml(job.message||"")}</p>${job.error?`<details class="json-details"><summary>Pokaż błąd</summary><pre>${escapeHtml(job.error)}</pre></details>`:""}<div class="sync-job-actions">${["queued","running"].includes(job.status)?'<button class="secondary-button" data-cancel-sync>Anuluj</button>':""}${["failed","cancelled"].includes(job.status)?'<button class="secondary-button" data-retry-sync>Ponów</button>':""}${job.result?`<details class="json-details"><summary>Pokaż podsumowanie</summary><pre>${escapeHtml(JSON.stringify(job.result,null,2))}</pre></details>`:""}</div></article>`).join("")}
async function enqueueSync(type,mode="incremental",confirmation){const body={type,mode,...(confirmation?{confirmation}:{})};const result=await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/sync-jobs`,{method:"POST",body:JSON.stringify(body)});toast(result.created?"Zadanie dodano do kolejki.":"Takie zadanie już oczekuje lub jest wykonywane.");await loadSyncJobs(true)}

async function loadConversations() {
  const filter = $("#conversation-filter").value;
  const query = filter ? `?flag=${encodeURIComponent(filter)}` : "";
  try { state.conversations = (await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/conversations${query}`)).conversations; renderConversations(); }
  catch (error) { toast(error.message, true); }
}

function renderConversations() {
  const items = state.conversations || []; $("#conversations-empty").hidden = state.conversations === null || items.length > 0;
  $("#conversations-list").innerHTML = items.map((item) => `<details class="history-card" data-conversation-id="${escapeHtml(item.id)}"><summary><div><strong>${new Date(item.lastMessageAt).toLocaleString("pl-PL")}</strong><small>${item.messageCount} wiadomości · <code>${escapeHtml(item.id.slice(0, 8))}…</code></small></div><div class="history-flags">${(item.flags || []).map((flag) => `<span>${escapeHtml(flag)}</span>`).join("")}<button class="copy-id" type="button" data-copy-conversation="${escapeHtml(item.id)}">Kopiuj ID</button><span class="history-chevron">⌄</span></div></summary><div class="history-detail"><p class="muted">Ładowanie szczegółów…</p></div></details>`).join("");
}

async function loadConversationDetail(card) {
  if (card.dataset.loaded === "true") return;
  try {
    const body = await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/conversations/${encodeURIComponent(card.dataset.conversationId)}`);
    const conversation = body.conversation;
    card.querySelector(".history-detail").innerHTML = `<div class="history-messages">${conversation.messages.map((message) => `<article class="history-message ${message.role}"><span>${message.role === "user" ? "Klient" : "Asystent"}</span><p>${escapeHtml(message.content)}</p>${message.role==="user"?`<button class="copy-id" data-quality-from="${escapeHtml(message.content)}">Utwórz test</button>`:""}<details class="json-details"><summary>Pokaż wszystkie detale</summary><pre>${escapeHtml(JSON.stringify(message.details, null, 2))}</pre></details></article>`).join("")}</div><div class="history-command"><code>docker compose run --rm app npm run inspect:conversation -- --id=${escapeHtml(conversation.id)}</code><button class="secondary-button" data-copy-command type="button">Kopiuj komendę</button></div>`;
    card.dataset.loaded = "true";
  } catch (error) { card.querySelector(".history-detail").innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function openConversationById() {
  const id = $("#conversation-id-search").value.trim(); if (!id) return;
  try {
    const body = await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/conversations/${encodeURIComponent(id)}`);
    state.conversations = [body.conversation]; renderConversations(); const card = $("[data-conversation-id]"); card.open = true; await loadConversationDetail(card);
  } catch (error) { toast(error.message, true); }
}
function ensureRetrieval() { state.config.knowledgeRetrieval ||= { locale: "pl-PL", stopWords: [], topicAliases: {}, topicSuggestions: {}, insufficientEvidenceRules: [] }; state.config.knowledgeRetrieval.topicSuggestions ||= {}; return state.config.knowledgeRetrieval; }
function ensureRouting() { state.config.conversationRouting ||= { productTerms: [], contactTerms: [], contactResponse: "Skorzystaj z oficjalnego kanału kontaktowego sklepu.", unknownResponse: "Napisz proszę, czy szukasz produktu, czy informacji o sklepie." }; return state.config.conversationRouting; }
function ensureAnswerGeneration() { state.config.answerGeneration ||= { enabled: true, tone: "friendly" }; return state.config.answerGeneration; }
function ensureComparison() { state.config.productComparison ||= { fields: [], similarityWeights: {}, similarityRules: {}, minimumScore: 0 }; state.config.productComparison.similarityRules ||= {}; return state.config.productComparison; }
function list(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function markDirty() { state.dirty = true; resetSaveConfirmation(); setSaveState(); renderJson(); }
function setSaveState() { $("#save-button").disabled = !state.dirty; $("#save-state").textContent = state.dirty ? "Masz niezapisane zmiany" : "Wszystkie zmiany zapisane"; $("#save-state").classList.toggle("dirty", state.dirty); }

function goTo(view) {
  state.view = view; $$(".view").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#sidebar").classList.remove("open");
  if (view === "conversations" && state.conversations === null) loadConversations();
  if (view === "quality" && state.quality === null) loadQuality();
  if (view === "sync" && state.syncJobs === null) loadSyncJobs();
}

async function loadQuality(){try{state.quality=(await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/quality-scenarios`)).scenarios;renderQuality()}catch(error){toast(error.message,true)}}
function qualityPayload(card){return{name:card.querySelector('[data-q="name"]').value,message:card.querySelector('[data-q="message"]').value,enabled:true,expectations:{intent:card.querySelector('[data-q="intent"]').value||undefined,requiredPhrases:list(card.querySelector('[data-q="required"]').value),forbiddenPhrases:list(card.querySelector('[data-q="forbidden"]').value),sourceTopics:list(card.querySelector('[data-q="topics"]').value),maxSuggestions:Number(card.querySelector('[data-q="max"]').value),products:card.querySelector('[data-q="products"]').value,insufficientEvidence:card.querySelector('[data-q="insufficient"]').value==="any"?undefined:card.querySelector('[data-q="insufficient"]').value==="true"}}}
function renderQuality(){const items=state.quality||[];$("#quality-empty").hidden=state.quality===null||items.length>0;$("#quality-list").innerHTML=items.map(item=>{const e=item.expectations||{};return`<article class="item-card quality-card" data-quality-id="${item.id}"><div class="item-header"><input data-q="name" value="${escapeHtml(item.name)}"><span class="quality-result"></span></div><div class="form-grid"><div class="field wide"><label>Wiadomość testowa</label><textarea data-q="message">${escapeHtml(item.message)}</textarea></div><div class="field"><label>Oczekiwana intencja</label><select data-q="intent"><option value="">Dowolna</option>${["product_search","knowledge","product_action","contact_support","unknown"].map(v=>`<option ${e.intent===v?"selected":""}>${v}</option>`).join("")}</select></div><div class="field"><label>Maks. sugestii</label><input data-q="max" type="number" min="0" value="${e.maxSuggestions??2}"></div><div class="field"><label>Produkty</label><select data-q="products">${["any","present","none"].map(v=>`<option ${e.products===v?"selected":""}>${v}</option>`).join("")}</select></div><div class="field"><label>Brak dowodów</label><select data-q="insufficient"><option value="any">Dowolnie</option><option value="true" ${e.insufficientEvidence===true?"selected":""}>Tak</option><option value="false" ${e.insufficientEvidence===false?"selected":""}>Nie</option></select></div><div class="field wide"><label>Wymagane frazy</label><input data-q="required" value="${escapeHtml((e.requiredPhrases||[]).join(", "))}"></div><div class="field wide"><label>Zabronione frazy</label><input data-q="forbidden" value="${escapeHtml((e.forbiddenPhrases||[]).join(", "))}"></div><div class="field wide"><label>Wymagane tematy źródeł</label><input data-q="topics" value="${escapeHtml((e.sourceTopics||[]).join(", "))}"></div></div><div class="suggestion-actions"><button class="delete-button" data-q-delete>×</button><button class="secondary-button" data-q-save>Zapisz</button><button class="primary-button" data-q-run>Uruchom</button></div><details class="json-details" hidden><summary>Wynik i pełne dane</summary><pre></pre></details></article>`}).join("")}
async function runQuality(card){const id=card.dataset.qualityId;card.querySelector(".quality-result").textContent="Uruchamiam…";try{const {run}=await api(`/v1/admin/stores/${state.storeId}/quality-scenarios/${id}/run`,{method:"POST"});card.querySelector(".quality-result").textContent=run.passed?"✓ Zaliczony":`✕ ${run.failures.length} błędów`;card.querySelector(".quality-result").className=`quality-result ${run.passed?"success":"error"}`;const d=card.querySelector(".json-details");d.hidden=false;d.querySelector("pre").textContent=JSON.stringify(run,null,2)}catch(error){toast(error.message,true)}}
async function createQuality(message="Nowe pytanie testowe"){await api(`/v1/admin/stores/${state.storeId}/quality-scenarios`,{method:"POST",body:JSON.stringify({name:message.slice(0,70),message,expectations:{requiredPhrases:[],forbiddenPhrases:[],sourceTopics:[],maxSuggestions:2,products:"any"}})});state.quality=null;await loadQuality();toast("Scenariusz jakości został utworzony.")}

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
$("#routing-product-terms").addEventListener("input", event=>{ensureRouting().productTerms=list(event.target.value);markDirty()});
$("#routing-contact-terms").addEventListener("input", event=>{ensureRouting().contactTerms=list(event.target.value);markDirty()});
$("#routing-contact-response").addEventListener("input", event=>{ensureRouting().contactResponse=event.target.value;markDirty()});
$("#routing-unknown-response").addEventListener("input", event=>{ensureRouting().unknownResponse=event.target.value;markDirty()});
[["ai-limits-enabled","enabled",v=>v==="true"],["ai-limit-minute","requestsPerMinute",Number],["ai-limit-day","dailyRequests",Number],["ai-limit-month","monthlyTokens",Number],["ai-message-length","maximumMessageCharacters",Number],["ai-alert-percent","alertPercent",Number],["ai-input-price","inputCostUsdPerMillionTokens",Number],["ai-output-price","outputCostUsdPerMillionTokens",Number],["ai-limit-message","limitMessage",String]].forEach(([id,key,convert])=>$("#"+id).addEventListener(id==="ai-limits-enabled"?"change":"input",event=>{ensureAiLimits()[key]=convert(event.target.value);markDirty()}));
$("#refresh-usage").addEventListener("click",()=>loadUsage().catch(error=>toast(error.message,true)));
$("#refresh-backups").addEventListener("click",()=>loadBackup().catch(error=>toast(error.message,true)));
$$('[data-copy-ops]').forEach(button=>button.addEventListener("click",async()=>{const source=$("#"+button.dataset.copyOps);try{await navigator.clipboard.writeText(source.textContent);toast("Komenda została skopiowana.")}catch{toast("Nie udało się skopiować komendy.",true)}}));
[["publication-min-products","minimumProducts",Number],["publication-enrichment","minimumEnrichmentPercent",Number],["publication-require-knowledge","requireKnowledgeSources",v=>v==="true"],["publication-quality-count","minimumQualityScenarios",Number],["publication-all-quality","requireAllQualityPassing",v=>v==="true"]].forEach(([id,key,convert])=>$("#"+id).addEventListener("change",event=>{ensurePublicationRequirements()[key]=convert(event.target.value);markDirty()}));
$("#refresh-publication").addEventListener("click",()=>loadPublication().catch(error=>toast(error.message,true)));
$("#publication-checks").addEventListener("click",event=>{const button=event.target.closest("[data-publication-action]");if(button)goTo(button.dataset.publicationAction)});
$("#publish-store").addEventListener("click",event=>confirmInline(event.currentTarget,`Potwierdź ${state.storeId}`,async()=>{try{const body=await api(`/v1/admin/stores/${encodeURIComponent(state.storeId)}/publish`,{method:"POST",body:JSON.stringify({confirmation:state.storeId})});state.config=structuredClone(body.config);state.publication=body.readiness;state.dirty=false;renderAll();setSaveState();toast("Widget został opublikowany.")}catch(error){toast(error.message,true)}}));
$("#new-store-name").addEventListener("input",event=>{if(!$("#new-store-id").dataset.manual)$("#new-store-id").value=event.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")});
$("#new-store-id").addEventListener("input",event=>event.target.dataset.manual="true");
$("#onboarding-reset").addEventListener("click",resetOnboarding);$("#onboarding-analyze-feed").addEventListener("click",analyzeOnboardingFeed);$("#onboarding-analyze-page").addEventListener("click",analyzeOnboardingPage);$("#onboarding-create").addEventListener("click",event=>confirmInline(event.currentTarget,"Potwierdź utworzenie",createOnboardedStore));
$$('[data-onboarding-next]').forEach(button=>button.addEventListener("click",()=>onboardingStage(Number(button.dataset.onboardingNext))));$$('[data-onboarding-back]').forEach(button=>button.addEventListener("click",()=>onboardingStage(Number(button.dataset.onboardingBack))));
$("#sync-schedule-enabled").addEventListener("change",event=>{ensureSyncSchedule().enabled=event.target.value==="true";markDirty()});
$("#sync-schedule-hours").addEventListener("change",event=>{ensureSyncSchedule().intervalHours=Number(event.target.value);markDirty()});
$$('[data-start-sync]').forEach(button=>button.addEventListener("click",async()=>{try{await enqueueSync(button.dataset.startSync)}catch(error){toast(error.message,true)}}));
$("[data-start-failed]").addEventListener("click",async()=>{try{await enqueueSync("enrichment","failed")}catch(error){toast(error.message,true)}});
$("#start-full-sync").addEventListener("click",event=>confirmInline(event.currentTarget,"Potwierdź pełną synchronizację",async()=>{try{await enqueueSync("full","full",state.storeId)}catch(error){toast(error.message,true)}}));
$("#refresh-sync-jobs").addEventListener("click",()=>loadSyncJobs());
$("#sync-jobs-list").addEventListener("click",event=>{const card=event.target.closest("[data-sync-job]");if(!card)return;const cancel=event.target.closest("[data-cancel-sync]");if(cancel)confirmInline(cancel,"Potwierdź",async()=>{await api(`/v1/admin/stores/${state.storeId}/sync-jobs/${card.dataset.syncJob}/cancel`,{method:"POST"});await loadSyncJobs(true)});if(event.target.closest("[data-retry-sync]"))api(`/v1/admin/stores/${state.storeId}/sync-jobs/${card.dataset.syncJob}/retry`,{method:"POST"}).then(()=>loadSyncJobs(true)).catch(error=>toast(error.message,true))});
[["guided-width-question","widthQuestion"],["guided-budget-question","budgetQuestion"],["guided-priority-question","priorityQuestion"]].forEach(([id,key])=>$("#"+id).addEventListener("input",event=>{ensureGuided()[key]=event.target.value;markDirty()}));
$("#guided-width-choices").addEventListener("change",event=>{ensureGuided().widthChoices=choiceLines(event.target.value,raw=>{const value=Number(raw.replace(",","."));return value>0?value:null}).slice(0,8);markDirty();renderGuided()});
$("#guided-budget-choices").addEventListener("change",event=>{ensureGuided().budgetChoices=choiceLines(event.target.value,raw=>{const value=Number(raw.replace(/\s/g,"").replace(",","."));return value>0?Math.round(value*100):null}).map(x=>({label:x.label,valueMinor:x.value})).slice(0,8);markDirty();renderGuided()});
$("#guided-priority-choices").addEventListener("change",event=>{ensureGuided().priorityChoices=choiceLines(event.target.value,raw=>["quiet","efficient","any"].includes(raw)?raw:null).slice(0,3);markDirty();renderGuided()});
$("#detect-guided-choices").addEventListener("click",detectGuidedChoices);
[["widget-enabled","enabled",v=>v==="true"],["widget-theme","theme"],["widget-title","title"],["widget-subtitle","subtitle"],["widget-powered","showPoweredBy",v=>v==="true"],["widget-welcome","welcomeMessage"],["widget-placeholder","inputPlaceholder"]].forEach(([id,key,transform])=>$("#"+id).addEventListener(id.includes("enabled")||id.includes("theme")||id.includes("powered")?"change":"input",event=>{ensureWidget()[key]=transform?transform(event.target.value):event.target.value;if(key==="title")updateEmbedCode();markDirty()}));
function setWidgetColor(value){if(!/^#[0-9a-fA-F]{6}$/.test(value))return;ensureWidget().primaryColor=value;$("#widget-color").value=value;$("#widget-color-picker").value=value;updateEmbedCode();markDirty()}
$("#widget-color").addEventListener("input",event=>setWidgetColor(event.target.value));$("#widget-color-picker").addEventListener("input",event=>setWidgetColor(event.target.value));
$("#widget-starters").addEventListener("input",event=>{ensureWidget().starterSuggestions=event.target.value.split("\n").map(line=>{const [label,...message]=line.split("|");return{label:label?.trim(),message:message.join("|").trim()}}).filter(item=>item.label&&item.message).slice(0,6);markDirty()});
$("#copy-embed-code").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("#widget-embed-code").value);toast("Kod instalacyjny został skopiowany.")}catch{toast("Nie udało się skopiować kodu. Zaznacz go ręcznie.",true)}});
$("#sources-list").addEventListener("input", (event) => { const { sourceField, index } = event.target.dataset; if (!sourceField) return; state.config.knowledgeSources[Number(index)][sourceField] = event.target.value; markDirty(); });
$("#sources-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-source]"); if (!button) return; confirmInline(button, "Potwierdź", () => { state.config.knowledgeSources.splice(Number(button.dataset.deleteSource), 1); markDirty(); renderSources(); }); });
$("#add-source").addEventListener("click", () => { state.config.knowledgeSources ||= []; state.config.knowledgeSources.push({ type: "html", topic: "new-topic", url: "https://example.com" }); markDirty(); renderSources(); });

$("#topics-list").addEventListener("input", (event) => { const retrieval = ensureRetrieval(); if (event.target.dataset.topicAliases) retrieval.topicAliases[event.target.dataset.topicAliases] = list(event.target.value); else if(event.target.dataset.topicSuggestions) retrieval.topicSuggestions[event.target.dataset.topicSuggestions]=event.target.value.split("\n").map(line=>{const [label,message,evidence]=line.split("|");return{label:label?.trim(),message:message?.trim(),evidenceTerms:list(evidence||"")}}).filter(item=>item.label&&item.message).slice(0,6); else return; markDirty(); });
$("#topics-list").addEventListener("change", (event) => { const oldKey = event.target.dataset.topicKey; if (!oldKey) return; const next = event.target.value.trim(); const retrieval=ensureRetrieval(); if (!next || (next !== oldKey && retrieval.topicAliases[next])) { toast("Identyfikator tematu musi być unikalny.", true); renderTopics(); return; } const aliases = retrieval.topicAliases[oldKey]; const suggestions=retrieval.topicSuggestions[oldKey]||[]; delete retrieval.topicAliases[oldKey]; delete retrieval.topicSuggestions[oldKey]; retrieval.topicAliases[next] = aliases; retrieval.topicSuggestions[next]=suggestions; state.config.knowledgeSources.forEach((source) => { if (source.topic === oldKey) source.topic = next; }); markDirty(); renderTopics(); renderSources(); });
$("#topics-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-topic]"); if (!button) return; confirmInline(button, "Potwierdź", () => { const retrieval=ensureRetrieval(); delete retrieval.topicAliases[button.dataset.deleteTopic]; delete retrieval.topicSuggestions[button.dataset.deleteTopic]; markDirty(); renderTopics(); }); });
$("#add-topic").addEventListener("click", () => { const retrieval=ensureRetrieval(),topics = retrieval.topicAliases; let index = 1; while (topics[`topic-${index}`]) index++; topics[`topic-${index}`] = []; retrieval.topicSuggestions[`topic-${index}`]=[]; markDirty(); renderTopics(); });

$("#rules-list").addEventListener("input", (event) => { const { ruleField, index } = event.target.dataset; if (!ruleField) return; const rule = ensureRetrieval().insufficientEvidenceRules[Number(index)]; rule[ruleField] = ruleField === "message" ? event.target.value : ruleField === "minimumEvidenceMatches" ? Math.max(1,Number(event.target.value)||1) : list(event.target.value); markDirty(); });
$("#rules-list").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-rule]"); if (!button) return; confirmInline(button, "Potwierdź", () => { ensureRetrieval().insufficientEvidenceRules.splice(Number(button.dataset.deleteRule), 1); markDirty(); renderRules(); }); });
$("#add-rule").addEventListener("click", () => { ensureRetrieval().insufficientEvidenceRules.push({ queryTerms: ["fraza"], evidenceTerms: ["dowód"], minimumEvidenceMatches:1, message: "Dokumenty sklepu nie zawierają wystarczających informacji." }); markDirty(); renderRules(); });
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
$("#add-quality-scenario").addEventListener("click",()=>createQuality());
$("#run-quality-all").addEventListener("click",async()=>{for(const card of $$("[data-quality-id]"))await runQuality(card)});
$("#quality-list").addEventListener("click",async event=>{const card=event.target.closest("[data-quality-id]");if(!card)return;if(event.target.closest("[data-q-run]"))await runQuality(card);if(event.target.closest("[data-q-save]")){await api(`/v1/admin/stores/${state.storeId}/quality-scenarios/${card.dataset.qualityId}`,{method:"PUT",body:JSON.stringify(qualityPayload(card))});toast("Test zapisany.")}const del=event.target.closest("[data-q-delete]");if(del)confirmInline(del,"Potwierdź",async()=>{await api(`/v1/admin/stores/${state.storeId}/quality-scenarios/${card.dataset.qualityId}`,{method:"DELETE"});await loadQuality()})});
$("#refresh-conversations").addEventListener("click", loadConversations);
$("#conversation-filter").addEventListener("change", loadConversations);
$("#find-conversation").addEventListener("click", openConversationById);
$("#conversation-id-search").addEventListener("keydown", (event) => { if (event.key === "Enter") openConversationById(); });
$("#conversations-list").addEventListener("toggle", (event) => { const card = event.target.closest("[data-conversation-id]"); if (card?.open) loadConversationDetail(card); }, true);
$("#conversations-list").addEventListener("click", async (event) => {
  const idButton = event.target.closest("[data-copy-conversation]");
  const commandButton = event.target.closest("[data-copy-command]");
  if (idButton) { event.preventDefault(); await navigator.clipboard.writeText(idButton.dataset.copyConversation); toast("ID rozmowy skopiowane."); }
  if (commandButton) { await navigator.clipboard.writeText(commandButton.previousElementSibling.textContent); toast("Komenda diagnostyczna skopiowana."); }
  const qualityButton=event.target.closest("[data-quality-from]");if(qualityButton){await createQuality(qualityButton.dataset.qualityFrom);goTo("quality")}
});

document.documentElement.dataset.theme = localStorage.getItem("shop-agent-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
$("#conversation-filter").insertAdjacentHTML("beforeend", '<option value="insufficient_evidence">Brak wystarczających dowodów</option>');
api("/v1/admin/session").then(loadPanel).catch(() => undefined);
setInterval(()=>{if(state.view==="sync"&&state.storeId)loadSyncJobs(true)},4000);

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
