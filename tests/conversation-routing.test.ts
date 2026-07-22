import { describe, expect, it } from "vitest";
import { classifyConversationIntent, decideConversationRoute, reusableProductState } from "../src/conversation/routing.js";
import { safeSuggestions } from "../src/conversation/suggestion-policy.js";
import { nortbergConfig } from "../src/config/store.js";

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

  it("keeps only structured context for configured follow-up phrases", () => {
    const configured={...routing,continuationTerms:["and how","what about"]};
    const knowledgeState={criteria:{},intent:"knowledge" as const,knowledgeTopics:["delivery"]};
    expect(decideConversationRoute({message:"And how long does it take?",state:knowledgeState,routing:configured,knowledge})).toMatchObject({intent:"knowledge",reason:"contextual_follow_up",contextReused:true,detectedTopics:["delivery"]});
    expect(decideConversationRoute({message:"Tell me a joke",state:knowledgeState,routing:configured,knowledge})).toMatchObject({intent:"unknown",contextReused:false,contextReset:true});
  });

  it("reuses product filters after an action and resets them on configured restart", () => {
    const configured={...routing,continuationTerms:["what about"],restartProductTerms:["start over"]};
    const state={criteria:{widthCm:60},intent:"product_action" as const};
    expect(decideConversationRoute({message:"What about a white one?",state,routing:configured,knowledge})).toMatchObject({intent:"product_search",contextReused:true,contextReset:false});
    const restart=decideConversationRoute({message:"Start over and find a white trainer",state,routing:configured,knowledge});
    expect(restart).toMatchObject({intent:"product_search",contextReused:false,contextReset:true});
    expect(reusableProductState(state,restart)).toBeUndefined();
    expect(reusableProductState(state,decideConversationRoute({message:"What about a white one?",state,routing:configured,knowledge}))).toBe(state);
  });

  it("prioritizes a contact request over a coincidental knowledge topic", () => {
    const configured={...routing,contactTerms:["call me"]};
    expect(decideConversationRoute({message:"Call me about delivery",routing:configured,knowledge})).toMatchObject({intent:"contact_support",reason:"contact_request"});
  });

  it("handles Polish cross-intent transitions using only store configuration", () => {
    const warranty={criteria:{},intent:"knowledge" as const,knowledgeTopics:["warranty"]};
    expect(decideConversationRoute({message:"A ile to trwa?",state:warranty,routing:nortbergConfig.conversationRouting!,knowledge:nortbergConfig.knowledgeRetrieval!})).toMatchObject({intent:"knowledge",reason:"contextual_follow_up",contextReused:true});
    const compared={criteria:{widthCm:90,budgetResolved:true},intent:"product_action" as const};
    expect(decideConversationRoute({message:"A może biały?",state:compared,routing:nortbergConfig.conversationRouting!,knowledge:nortbergConfig.knowledgeRetrieval!})).toMatchObject({intent:"product_search",reason:"explicit_product_criteria",contextReused:true});
    expect(decideConversationRoute({message:"Zacznij od nowa, dobierz inny okap",state:compared,routing:nortbergConfig.conversationRouting!,knowledge:nortbergConfig.knowledgeRetrieval!})).toMatchObject({intent:"product_search",contextReset:true,contextReused:false});
  });

  it("routes configured catalog vocabulary and controlled typos as product search", () => {
    const input = { routing: nortbergConfig.conversationRouting!, knowledge: nortbergConfig.knowledgeRetrieval!, taxonomy: nortbergConfig.searchTaxonomy! };
    for (const message of ["Pokaż produkty", "Jakie macie kategorje okapuw?", "Pokaż wyspowt"]) {
      expect(decideConversationRoute({ message, ...input })).toMatchObject({ intent: "product_search" });
    }
  });
});
