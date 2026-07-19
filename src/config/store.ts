import { z } from "zod";

const productValueSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("commercial"), key: z.enum(["price", "availability"]) }),
  z.object({ type: z.literal("attribute"), key: z.string().min(1) }),
  z.object({ type: z.literal("attribute_raw"), key: z.string().min(1) }),
  z.object({ type: z.literal("title_regex"), pattern: z.string().min(1), group: z.number().int().nonnegative().default(1), valueType: z.enum(["text", "number"]).default("text") }),
  z.object({ type: z.literal("array_metric"), key: z.string().min(1), property: z.string().min(1), operation: z.enum(["min", "max"]) }),
]);

const comparisonFieldSchema = z.object({
  id: z.string().min(1), label: z.string().min(1), source: productValueSourceSchema,
  format: z.enum(["text", "number", "currency", "boolean", "list"]),
  unit: z.string().optional(), preference: z.enum(["min", "max", "none"]).default("none"),
});

export const storeConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  id: z.string().min(1),
  name: z.string().min(1),
  feed: z.object({ type: z.literal("google_xml"), url: z.url() }),
  productPage: z.object({
    enabled: z.boolean(),
    specificationRowSelector: z.string().min(1),
  }),
  searchTaxonomy: z.object({
    hoodTypeAliases: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  }).optional(),
  knowledgeRetrieval: z.object({
    locale: z.string().min(2).default("en"),
    stopWords: z.array(z.string()).default([]),
    topicAliases: z.record(z.string(), z.array(z.string().min(1)).min(1)),
    topicSuggestions: z.record(z.string(), z.array(z.object({ label: z.string().min(1), message: z.string().min(1), evidenceTerms: z.array(z.string().min(1)).default([]) })).max(6)).default({}),
    insufficientEvidenceRules: z.array(z.object({
      queryTerms: z.array(z.string().min(1)).min(1),
      evidenceTerms: z.array(z.string().min(1)).min(1),
      minimumEvidenceMatches: z.number().int().positive().optional(),
      message: z.string().min(1),
    })).default([]),
  }).optional(),
  conversationRouting: z.object({
    productTerms: z.array(z.string().min(1)).default([]),
    contactTerms: z.array(z.string().min(1)).default([]),
    continuationTerms: z.array(z.string().min(1)).optional(),
    restartProductTerms: z.array(z.string().min(1)).optional(),
    contactResponse: z.string().min(1),
    unknownResponse: z.string().min(1),
  }).optional(),
  guidedSelling: z.object({
    widthQuestion: z.string().min(1),
    widthChoices: z.array(z.object({ label: z.string().min(1), value: z.number().positive() })).min(1).max(8),
    budgetQuestion: z.string().min(1),
    budgetChoices: z.array(z.object({ label: z.string().min(1), valueMinor: z.number().int().positive() })).min(1).max(8),
    priorityQuestion: z.string().min(1),
    priorityChoices: z.array(z.object({ label: z.string().min(1), value: z.enum(["quiet", "efficient", "any"]) })).min(1).max(3),
  }).optional(),
  answerGeneration: z.object({
    enabled: z.boolean().default(true),
    tone: z.enum(["concise", "friendly", "expert"]).default("friendly"),
  }).optional(),
  aiLimits: z.object({
    enabled: z.boolean().default(true), requestsPerMinute: z.number().int().min(1).max(1000).default(30), dailyRequests: z.number().int().min(1).max(1_000_000).default(2000),
    monthlyTokens: z.number().int().min(1000).max(1_000_000_000).default(2_000_000), maximumMessageCharacters: z.number().int().min(100).max(20_000).default(4000), alertPercent: z.number().int().min(1).max(100).default(80),
    inputCostUsdPerMillionTokens: z.number().nonnegative().default(0), outputCostUsdPerMillionTokens: z.number().nonnegative().default(0),
    limitMessage: z.string().min(1).default("Asystent osiągnął chwilowy limit. Spróbuj ponownie za moment."),
  }).optional(),
  observability: z.object({
    enabled: z.boolean().default(true), successSampleRate: z.number().min(0).max(1).default(1),
    slowRequestMs: z.number().int().min(100).max(120_000).default(2000),
    errorRateAlertPercent: z.number().min(0).max(100).default(5), p95AlertMs: z.number().int().min(100).max(120_000).default(3000),
    retentionDays: z.number().int().min(1).max(365).default(30), minimumRequestsForAlert: z.number().int().min(1).max(100_000).default(20),
  }).optional(),
  syncSchedule: z.object({ enabled: z.boolean().default(false), intervalHours: z.number().int().min(1).max(168).default(24) }).optional(),
  privacy: z.object({
    conversationHistoryEnabled: z.boolean().default(true),
    conversationRetentionDays: z.number().int().min(1).max(730).default(90),
    allowAdminExport: z.boolean().default(true),
    privacyNoticeUrl: z.url().optional(),
  }).optional(),
  publicationRequirements: z.object({
    minimumProducts: z.number().int().min(1).max(1_000_000).default(1), minimumEnrichmentPercent: z.number().int().min(0).max(100).default(80),
    requireKnowledgeSources: z.boolean().default(true), minimumQualityScenarios: z.number().int().min(0).max(100).default(3), requireAllQualityPassing: z.boolean().default(true),
  }).optional(),
  widget: z.object({
    enabled: z.boolean().default(true),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    welcomeMessage: z.string().min(1),
    inputPlaceholder: z.string().min(1),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    theme: z.enum(["light", "dark", "auto"]).default("light"),
    showPoweredBy: z.boolean().default(true),
    starterSuggestions: z.array(z.object({ label: z.string().min(1), message: z.string().min(1) })).max(6).default([]),
  }).optional(),
  productComparison: z.object({
    fields: z.array(comparisonFieldSchema).min(1),
    similarityWeights: z.record(z.string(), z.number().nonnegative()),
    similarityRules: z.record(z.string(), z.object({
      required: z.boolean().default(false),
      minimumSimilarity: z.number().min(0).max(1).default(0),
      mismatchPenalty: z.number().nonnegative().default(0),
    })).default({}),
    minimumScore: z.number().min(0).max(1).default(0),
  }).optional(),
  knowledgeSources: z.array(z.object({
    type: z.enum(["html", "pdf"]),
    topic: z.string().min(1),
    url: z.url(),
  })),
});

export type StoreConfig = z.infer<typeof storeConfigSchema>;
export function mergeConversationRouting(bootstrap:StoreConfig["conversationRouting"],stored:StoreConfig["conversationRouting"]):StoreConfig["conversationRouting"]{
  if(!bootstrap)return stored;if(!stored)return bootstrap;
  return{...bootstrap,...stored,continuationTerms:stored.continuationTerms??bootstrap.continuationTerms,restartProductTerms:stored.restartProductTerms??bootstrap.restartProductTerms};
}

export const nortbergConfig = storeConfigSchema.parse({
  schemaVersion: 1,
  id: "nortberg",
  name: "Nortberg",
  feed: {
    type: "google_xml",
    url: process.env.NORTBERG_FEED_URL ?? "https://nortberg.pl/xml,google,32dycf1j4906.xml",
  },
  productPage: { enabled: true, specificationRowSelector: "#tab2 table tr" },
  searchTaxonomy: {
    hoodTypeAliases: {
      zabudowy: ["podszafkowy", "teleskopowy"],
      kominowy: ["kominowy", "rustykalny / kominowy", "naścienny z kominem"],
      wyspowy: ["wyspowy", "wyspowy z kominem"],
      sufitowy: ["sufitowy", "podsufitowy"],
    },
  },
  knowledgeRetrieval: {
    locale: "pl-PL",
    stopWords: ["a", "aby", "albo", "bo", "by", "czy", "dla", "do", "i", "jak", "jaka", "jakie", "jest", "na", "o", "od", "oraz", "po", "się", "to", "w", "z", "za", "że", "co", "gdzie", "kiedy", "który", "można", "mogę"],
    topicAliases: {
      warranty: ["gwarancja", "gwarancji", "rejestracja", "przedłużyć", "reklamacja", "serwis"],
      guide: ["montaż", "zamontować", "instalacja", "filtr", "wentylacja", "wydajność", "głośność", "poradnik", "instrukcja"],
      stores: ["salon", "salony", "sklep", "kupić", "kupię", "kupie", "sprzedaż", "dystrybutor", "stacjonarnie", "styacjonarnie", "stacjonarny"],
      company: ["firma", "producent", "Nortberg", "produkcja", "polska"],
    },
    topicSuggestions: {
      warranty: [
        { label: "Jak zgłosić reklamację?", message: "Jak zgłosić reklamację okapu?", evidenceTerms: ["reklamac"] },
        { label: "Pokaż kontakt do serwisu", message: "Gdzie znajdę kontakt do serwisu?", evidenceTerms: ["telefon"] },
      ],
      company: [
        { label: "Gdzie produkowane są okapy?", message: "Gdzie produkowane są okapy Nortberg?", evidenceTerms: ["polska"] },
        { label: "Gdzie można je kupić?", message: "Gdzie można kupić okapy Nortberg?", evidenceTerms: ["salon"] },
      ],
    },
    insufficientEvidenceRules: [{
      queryTerms: ["przedłuż", "gwaranc"],
      evidenceTerms: ["rejestrac", "6 mies"],
      minimumEvidenceMatches: 1,
      message: "Dokument sklepu potwierdza standardową gwarancję, ale nie opisuje procedury jej przedłużenia. W tej sprawie należy skontaktować się bezpośrednio z działem serwisu sklepu.",
    }],
  },
  conversationRouting: {
    productTerms: ["okap", "produkt", "model", "kupic", "szukam", "potrzebuje", "dobierz", "cena", "tanszy", "podobny", "porownaj"],
    contactTerms: ["oddzwon", "napiszcie do mnie", "skontaktujcie sie ze mna", "moj email", "moj telefon"],
    continuationTerms: ["a jak", "a gdzie", "a kiedy", "a ile", "a czy", "co z", "jak wtedy"],
    restartProductTerms: ["od nowa", "zacznij od nowa", "nowe wyszukiwanie", "dobierz inny", "dobierz mi inny"],
    contactResponse: "Nie mogę przekazać danych do kontaktu ani zlecić oddzwonienia. Skorzystaj proszę z oficjalnego formularza lub danych kontaktowych sklepu.",
    unknownResponse: "Nie jestem pewien, czy pytasz o produkt, zamówienie czy informacje o sklepie. Napisz proszę, w czym konkretnie mam pomóc.",
  },
  guidedSelling: {
    widthQuestion: "Jakiej szerokości okapu potrzebujesz?",
    widthChoices: [50, 60, 80, 90].map((value) => ({ label: `${value} cm`, value })),
    budgetQuestion: "Jaki budżet chcesz przeznaczyć na okap?",
    budgetChoices: [
      { label: "Do 1500 zł", valueMinor: 150_000 }, { label: "Do 2500 zł", valueMinor: 250_000 },
      { label: "Do 4000 zł", valueMinor: 400_000 }, { label: "Bez limitu", valueMinor: 99_999_900 },
    ],
    priorityQuestion: "Co jest dla Ciebie najważniejsze?",
    priorityChoices: [
      { label: "Cicha praca", value: "quiet" }, { label: "Wysoka wydajność", value: "efficient" },
      { label: "Pokaż propozycje", value: "any" },
    ],
  },
  answerGeneration: { enabled: true, tone: "friendly" },
  aiLimits: { enabled: true, requestsPerMinute: 30, dailyRequests: 2000, monthlyTokens: 2_000_000, maximumMessageCharacters: 4000, alertPercent: 80, inputCostUsdPerMillionTokens: 0, outputCostUsdPerMillionTokens: 0, limitMessage: "Asystent osiągnął chwilowy limit. Spróbuj ponownie za moment." },
  observability: { enabled: true, successSampleRate: 1, slowRequestMs: 2000, errorRateAlertPercent: 5, p95AlertMs: 3000, retentionDays: 30, minimumRequestsForAlert: 20 },
  syncSchedule: { enabled: false, intervalHours: 24 },
  privacy: { conversationHistoryEnabled: true, conversationRetentionDays: 90, allowAdminExport: true },
  publicationRequirements: { minimumProducts: 1, minimumEnrichmentPercent: 80, requireKnowledgeSources: true, minimumQualityScenarios: 3, requireAllQualityPassing: true },
  widget: {
    enabled: true,
    title: "Asystent Nortberg",
    subtitle: "Pomogę dobrać odpowiedni okap",
    welcomeMessage: "Dzień dobry! Opowiedz mi, jakiego okapu szukasz — pomogę zawęzić wybór i porównać najlepsze propozycje.",
    inputPlaceholder: "Napisz, czego szukasz…",
    primaryColor: "#2563eb",
    theme: "light",
    showPoweredBy: true,
    starterSuggestions: [
      { label: "Dobierz okap", message: "Pomóż mi dobrać odpowiedni okap" },
      { label: "Cichy okap", message: "Szukam cichego okapu" },
      { label: "Gwarancja", message: "Jak działa gwarancja na okap?" },
    ],
  },
  productComparison: {
    fields: [
      { id: "price", label: "Cena", source: { type: "commercial", key: "price" }, format: "currency", preference: "min" },
      { id: "width", label: "Szerokość wariantu", source: { type: "title_regex", pattern: "(\\d+(?:[.,]\\d+)?)\\s*cm(?:\\b|$)", group: 1, valueType: "number" }, format: "number", unit: "cm", preference: "none" },
      { id: "type", label: "Typ", source: { type: "attribute", key: "hoodType" }, format: "text", preference: "none" },
      { id: "material", label: "Wykonanie", source: { type: "attribute", key: "material" }, format: "text", preference: "none" },
      { id: "modes", label: "Tryby pracy", source: { type: "attribute", key: "operatingModes" }, format: "list", preference: "none" },
      { id: "noise", label: "Hałas na najwyższym biegu", source: { type: "array_metric", key: "performanceLevels", property: "noiseDb", operation: "max" }, format: "number", unit: "dB", preference: "min" },
      { id: "airflow", label: "Maks. rzeczywista wydajność", source: { type: "array_metric", key: "performanceLevels", property: "efficiencyM3h", operation: "max" }, format: "number", unit: "m³/h", preference: "max" },
      { id: "turbine", label: "Deklarowana wydajność turbiny", source: { type: "attribute", key: "maxTurbineEfficiencyM3h" }, format: "number", unit: "m³/h", preference: "none" },
      { id: "energy", label: "Klasa energetyczna", source: { type: "attribute", key: "energyClass" }, format: "text", preference: "none" },
      { id: "warranty", label: "Gwarancja (warunki sklepu)", source: { type: "attribute_raw", key: "warrantyMonths" }, format: "text", preference: "none" },
    ],
    similarityWeights: { width: 6, type: 4, material: 3, modes: 2, noise: 1, airflow: 1 },
    similarityRules: {
      width: { required: true, minimumSimilarity: 1, mismatchPenalty: 0 },
      type: { required: true, minimumSimilarity: 0.65, mismatchPenalty: 0 },
      material: { required: false, minimumSimilarity: 0, mismatchPenalty: 4 },
    },
    minimumScore: 0.45,
  },
  knowledgeSources: [
    { type: "html", topic: "company", url: "https://nortberg.pl/o-firmie.html" },
    { type: "pdf", topic: "guide", url: "https://nortberg.pl/upload/files/poradnik-uzytkownika-okapow-nadkuchennych-nortberg.pdf" },
    { type: "html", topic: "warranty", url: "https://nortberg.pl/gwarancja-okapu.html" },
    { type: "html", topic: "stores", url: "https://nortberg.pl/gdzie-kupic.html" }
  ]
});

export function getBootstrapStoreConfig(storeId: string): StoreConfig | undefined {
  return storeId === nortbergConfig.id ? nortbergConfig : undefined;
}
