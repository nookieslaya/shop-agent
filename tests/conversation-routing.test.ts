import { describe, expect, it } from "vitest";
import { classifyConversationIntent } from "../src/conversation/routing.js";
import { safeSuggestions } from "../src/conversation/suggestion-policy.js";

const routing = { productTerms: ["shoe", "trainer", "find"], contactTerms: ["call me", "my email"], contactResponse: "Contact form", unknownResponse: "Clarify" };
const knowledge = { locale: "en-GB", topicAliases: { delivery: ["delivery", "shipping"] }, topicSuggestions: {}, insufficientEvidenceRules: [], stopWords: [] };

describe("universal conversation routing", () => {
  it("separates product, knowledge, contact and unknown intents without industry code", () => {
    expect(classifyConversationIntent({ message: "Find a white trainer", routing, knowledge })).toBe("product_search");
    expect(classifyConversationIntent({ message: "How does delivery work?", routing, knowledge })).toBe("knowledge");
    expect(classifyConversationIntent({ message: "Please call me", routing, knowledge })).toBe("contact_support");
    expect(classifyConversationIntent({ message: "Tell me a joke", routing, knowledge })).toBe("unknown");
    expect(classifyConversationIntent({ message: "My account is blue", state: { criteria: { maxPriceMinor: 100 }, intent: "product_search" }, routing, knowledge })).toBe("unknown");
  });

  it("routes structured buttons independently from message text", () => {
    expect(classifyConversationIntent({ message: "", selectionKey: "widthCm", routing, knowledge })).toBe("product_search");
    expect(classifyConversationIntent({ message: "", hasProductAction: true, routing, knowledge })).toBe("product_action");
  });

  it("keeps explicit catalog sorting in product search even when the message mentions a store", () => {
    const storeKnowledge = { ...knowledge, locale: "pl-PL", topicAliases: { stores: ["sklep", "stacjonarnie"] } };
    expect(classifyConversationIntent({ message: "Pokaż 2 najdroższe produkty w sklepie", routing, knowledge: storeKnowledge })).toBe("product_search");
    expect(classifyConversationIntent({ message: "Gdzie kupię produkt stacjonarnie?", routing, knowledge: storeKnowledge })).toBe("knowledge");
  });

  it("deduplicates and limits engine suggestions", () => {
    const items = [
      { label: "More info", key: "message" as const, value: "More info" },
      { label: "More info", key: "message" as const, value: "More info" },
      { label: "Contact", key: "message" as const, value: "Contact" },
      { label: "Third", key: "message" as const, value: "Third" },
    ];
    expect(safeSuggestions(items).map((item) => item.label)).toEqual(["More info", "Contact"]);
  });
});
