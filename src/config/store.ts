import { z } from "zod";

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
