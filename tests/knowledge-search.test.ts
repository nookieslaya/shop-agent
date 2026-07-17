import { describe, expect, it } from "vitest";
import { isKnowledgeQuestion, normalizeForSearch, searchKnowledge } from "../src/knowledge/search.js";
import type { SearchableKnowledgeChunk } from "../src/knowledge/types.js";

const chunks: SearchableKnowledgeChunk[] = [
  { id: "1", documentId: "d1", topic: "warranty", title: "Gwarancja okapu", sourceUrl: "https://shop.test/gwarancja", heading: "Przedłużenie", content: "Standardowa gwarancja trwa 24 miesiące. Rejestracja produktu przedłuża ją o 6 miesięcy." },
  { id: "2", documentId: "d2", topic: "guide", title: "Poradnik użytkownika", sourceUrl: "https://shop.test/poradnik.pdf", heading: "Montaż", content: "Przed montażem okapu należy sprawdzić średnicę przewodu wentylacyjnego." },
  { id: "3", documentId: "d3", topic: "stores", title: "Salony sprzedaży", sourceUrl: "https://shop.test/salony", content: "Listę salonów sprzedaży znajdziesz na stronie." },
];

describe("knowledge search", () => {
  it("normalizes Polish diacritics", () => expect(normalizeForSearch("BIAŁY ŁĄCZNIK")).toBe("bialy lacznik"));
  it("routes knowledge questions", () => {
    expect(isKnowledgeQuestion("Jak przedłużyć gwarancję?")).toBe(true);
    expect(isKnowledgeQuestion("Szukam czarnego okapu 60 cm")).toBe(false);
  });
  it("ranks the warranty source and preserves provenance", () => {
    const [result] = searchKnowledge(chunks, "jak przedłużyć gwarancję", 2);
    expect(result?.topic).toBe("warranty");
    expect(result?.sourceUrl).toBe("https://shop.test/gwarancja");
    expect(result?.excerpt).toContain("Rejestracja");
  });
  it("ranks installation guidance", () => expect(searchKnowledge(chunks, "jak zamontować okap", 1)[0]?.topic).toBe("guide"));
  it("returns no evidence for an unrelated question", () => expect(searchKnowledge(chunks, "status płatności bitcoin", 5)).toEqual([]));
});
