import { z } from "zod";

const productValueSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("commercial"), key: z.enum(["price", "availability"]) }),
  z.object({ type: z.literal("attribute"), key: z.string().min(1) }),
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
    insufficientEvidenceRules: z.array(z.object({
      queryTerms: z.array(z.string().min(1)).min(1),
      evidenceTerms: z.array(z.string().min(1)).min(1),
      message: z.string().min(1),
    })).default([]),
  }).optional(),
  answerGeneration: z.object({
    enabled: z.boolean().default(true),
    tone: z.enum(["concise", "friendly", "expert"]).default("friendly"),
  }).optional(),
  productComparison: z.object({
    fields: z.array(comparisonFieldSchema).min(1),
    similarityWeights: z.record(z.string(), z.number().nonnegative()),
  }).optional(),
  knowledgeSources: z.array(z.object({
    type: z.enum(["html", "pdf"]),
    topic: z.string().min(1),
    url: z.url(),
  })),
});

export type StoreConfig = z.infer<typeof storeConfigSchema>;

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
      warranty: ["gwarancja", "gwarancji", "rejestracja", "przedłużyć", "reklamacja"],
      guide: ["montaż", "zamontować", "instalacja", "filtr", "wentylacja", "wydajność", "głośność", "poradnik", "instrukcja"],
      stores: ["salon", "salony", "sklep", "kupić", "sprzedaż", "dystrybutor"],
      company: ["firma", "producent", "Nortberg", "produkcja", "polska"],
    },
    insufficientEvidenceRules: [{
      queryTerms: ["przedłuż", "gwaranc"],
      evidenceTerms: ["przedłuż", "rejestrac", "6 mies"],
      message: "Dokument sklepu potwierdza standardową gwarancję, ale nie opisuje procedury jej przedłużenia. W tej sprawie należy skontaktować się bezpośrednio z działem serwisu sklepu.",
    }],
  },
  answerGeneration: { enabled: true, tone: "friendly" },
  productComparison: {
    fields: [
      { id: "price", label: "Cena", source: { type: "commercial", key: "price" }, format: "currency", preference: "min" },
      { id: "width", label: "Szerokość", source: { type: "attribute", key: "widthCm" }, format: "number", unit: "cm", preference: "none" },
      { id: "type", label: "Typ", source: { type: "attribute", key: "hoodType" }, format: "text", preference: "none" },
      { id: "material", label: "Wykonanie", source: { type: "attribute", key: "material" }, format: "text", preference: "none" },
      { id: "modes", label: "Tryby pracy", source: { type: "attribute", key: "operatingModes" }, format: "list", preference: "none" },
      { id: "noise", label: "Najcichszy bieg", source: { type: "array_metric", key: "performanceLevels", property: "noiseDb", operation: "min" }, format: "number", unit: "dB", preference: "min" },
      { id: "efficiency", label: "Maksymalna wydajność", source: { type: "attribute", key: "maxTurbineEfficiencyM3h" }, format: "number", unit: "m³/h", preference: "max" },
      { id: "energy", label: "Klasa energetyczna", source: { type: "attribute", key: "energyClass" }, format: "text", preference: "none" },
      { id: "warranty", label: "Gwarancja", source: { type: "attribute", key: "warrantyMonths" }, format: "number", unit: "mies.", preference: "max" },
    ],
    similarityWeights: { width: 5, type: 4, material: 2, modes: 2, noise: 1, efficiency: 1 },
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
