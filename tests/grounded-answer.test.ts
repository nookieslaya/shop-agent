import { describe, expect, it, vi } from "vitest";
import { buildKnowledgeConversationResponse } from "../src/conversation/knowledge-response.js";
import type { KnowledgeSearchResult } from "../src/knowledge/types.js";
import { evidenceForModel, validateGroundedOutput, type GroundedAnswerGenerator } from "../src/openai/grounded-answer-generator.js";

const results: KnowledgeSearchResult[] = [
  { id: "chunk-1", documentId: "doc-1", topic: "warranty", title: "Gwarancja", sourceUrl: "https://shop.test/warranty", heading: "Okres", content: "Gwarancja trwa 24 miesiące.", excerpt: "Gwarancja trwa 24 miesiące.", score: 30 },
  { id: "chunk-2", documentId: "doc-2", topic: "guide", title: "Poradnik", sourceUrl: "https://shop.test/guide", heading: "Filtry", content: "Filtr aluminiowy można myć w zmywarce.", excerpt: "Filtr aluminiowy można myć w zmywarce.", score: 20 },
];

describe("grounded answer generation", () => {
  it("sends evidence with local source identifiers and without source URLs", () => {
    expect(evidenceForModel(results)).toEqual([
      { sourceId: "S1", topic: "warranty", title: "Gwarancja", heading: "Okres", content: "Gwarancja trwa 24 miesiące." },
      { sourceId: "S2", topic: "guide", title: "Poradnik", heading: "Filtry", content: "Filtr aluminiowy można myć w zmywarce." },
    ]);
  });

  it("rejects answers citing an unknown source", () => {
    expect(() => validateGroundedOutput({ status: "supported", answer: "Odpowiedź", sourceIds: ["S9"] }, new Set(["S1"]))).toThrow(/invalid source/i);
  });

  it("returns a natural answer and only deterministic configured follow-ups", async () => {
    const generator: GroundedAnswerGenerator = { generate: vi.fn().mockResolvedValue({ status: "supported", answer: "Gwarancja trwa 24 miesiące.", sourceIds: ["S1"], model: "test-model", inputTokens: 120, outputTokens: 30 }) };
    const response = await buildKnowledgeConversationResponse({ question: "Ile trwa gwarancja?", storeName: "Test", results, retrievalConfig: { topicSuggestions: { warranty: [{ label: "Jak zgłosić reklamację?", message: "Jak zgłosić reklamację?" }, { label: "Jak zgłosić reklamację?", message: "Jak zgłosić reklamację?" }, { label: "Kontakt", message: "Pokaż kontakt" }] } }, generator });
    expect(response.message).toBe("Gwarancja trwa 24 miesiące.");
    expect(response.sources?.map((source) => source.id)).toEqual(["S1"]);
    expect(response.suggestions[0]).toEqual({ label: "Jak zgłosić reklamację?", key: "message", value: "Jak zgłosić reklamację?" });
    expect(response.suggestions).toHaveLength(2);
    expect(response.meta).toMatchObject({ answerSource: "openai", answerModel: "test-model", answerInputTokens: 120, answerOutputTokens: 30 });
  });

  it("applies deterministic evidence rules before calling OpenAI", async () => {
    const generate = vi.fn();
    const response = await buildKnowledgeConversationResponse({
      question: "Jak przedłużyć gwarancję?", storeName: "Test", results: [results[0]!],
      retrievalConfig: { insufficientEvidenceRules: [{ queryTerms: ["przedłuż", "gwaranc"], evidenceTerms: ["rejestrac"], message: "Brak procedury przedłużenia." }] },
      generator: { generate },
    });
    expect(response.message).toBe("Brak procedury przedłużenia.");
    expect(response.meta?.answerSource).toBe("deterministic");
    expect(generate).not.toHaveBeenCalled();
    expect(response.suggestions).toEqual([]);
  });

  it("falls back to a source excerpt when generation fails", async () => {
    const generator: GroundedAnswerGenerator = { generate: vi.fn().mockRejectedValue(new Error("timeout")) };
    const response = await buildKnowledgeConversationResponse({ question: "Ile trwa gwarancja?", storeName: "Test", results: [results[0]!], generator });
    expect(response.message).toContain("24 miesiące");
    expect(response.meta?.answerSource).toBe("fallback");
  });

  it("returns a compact knowledge topic state for the next turn", async () => {
    const response=await buildKnowledgeConversationResponse({question:"A ile to trwa?",storeName:"Test",results:[results[0]!],knowledgeTopics:["warranty"],routingReason:"contextual_follow_up",contextReused:true});
    expect(response.state).toEqual({criteria:{},intent:"knowledge",knowledgeTopics:["warranty"]});
    expect(response.meta).toMatchObject({routingReason:"contextual_follow_up",contextReused:true});
  });
});
