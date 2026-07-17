import { describe, expect, it } from "vitest";
import { buildKnowledgeAnswer, detectKnowledgeTopics, isKnowledgeQuestion, normalizeForSearch, searchKnowledge } from "../src/knowledge/search.js";
import type { SearchableKnowledgeChunk } from "../src/knowledge/types.js";

const chunks: SearchableKnowledgeChunk[] = [
  { id: "1", documentId: "d1", topic: "warranty", title: "Gwarancja okapu", sourceUrl: "https://shop.test/gwarancja", heading: "Przedłużenie", content: "Standardowa gwarancja trwa 24 miesiące. Rejestracja produktu przedłuża ją o 6 miesięcy." },
  { id: "2", documentId: "d2", topic: "guide", title: "Poradnik użytkownika", sourceUrl: "https://shop.test/poradnik.pdf", heading: "Montaż", content: "Przed montażem okapu należy sprawdzić średnicę przewodu wentylacyjnego." },
  { id: "3", documentId: "d3", topic: "stores", title: "Salony sprzedaży", sourceUrl: "https://shop.test/salony", content: "Listę salonów sprzedaży znajdziesz na stronie." },
];
const config = {
  locale: "pl-PL",
  stopWords: ["jak", "mogę", "na"],
  topicAliases: { warranty: ["gwarancja", "przedłużyć"], guide: ["montaż", "zamontować"], stores: ["salon", "kupić"] },
  insufficientEvidenceRules: [{ queryTerms: ["przedłuż", "gwaranc"], evidenceTerms: ["przedłuż", "rejestrac", "6 mies"], message: "Brak procedury przedłużenia." }],
};

describe("knowledge search", () => {
  it("normalizes Polish diacritics", () => expect(normalizeForSearch("BIAŁY ŁĄCZNIK")).toBe("bialy lacznik"));
  it("routes knowledge questions", () => {
    expect(isKnowledgeQuestion("Jak przedłużyć gwarancję?", config)).toBe(true);
    expect(isKnowledgeQuestion("Szukam czarnego okapu 60 cm", config)).toBe(false);
  });
  it("ranks the warranty source and preserves provenance", () => {
    const [result] = searchKnowledge(chunks, "jak przedłużyć gwarancję", 2, config);
    expect(result?.topic).toBe("warranty");
    expect(result?.sourceUrl).toBe("https://shop.test/gwarancja");
    expect(result?.excerpt).toContain("Rejestracja");
  });
  it("does not mix unrelated document topics into a warranty answer", () => {
    const results = searchKnowledge(chunks, "jak mogę przedłużyć gwarancję na okap", 5, config);
    expect(results.map((result) => result.topic)).toEqual(["warranty"]);
    expect(detectKnowledgeTopics("jak przedłużyć gwarancję", config)).toEqual(["warranty"]);
  });
  it("states when the source does not explain the extension procedure", () => {
    const resultWithoutProcedure = [{ ...chunks[0]!, score: 20, excerpt: "Gwarancja trwa 24 miesiące.", content: "Gwarancja trwa 24 miesiące. Skontaktuj się z serwisem." }];
    expect(buildKnowledgeAnswer("Jak przedłużyć gwarancję?", resultWithoutProcedure, config)).toBe("Brak procedury przedłużenia.");
  });
  it("ranks installation guidance", () => expect(searchKnowledge(chunks, "jak zamontować okap", 1, config)[0]?.topic).toBe("guide"));
  it("returns no evidence for an unrelated question", () => expect(searchKnowledge(chunks, "status płatności bitcoin", 5)).toEqual([]));
});
