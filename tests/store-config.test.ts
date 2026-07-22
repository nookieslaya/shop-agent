import { describe, expect, it } from "vitest";
import { mergeConversationRouting, storeConfigSchema } from "../src/config/store.js";

describe("universal store configuration", () => {
  it("accepts arbitrary knowledge topics for another industry", () => {
    const config = storeConfigSchema.parse({
      id: "shoe-store",
      name: "Shoe Store",
      feed: { type: "google_xml", url: "https://example.com/products.xml" },
      productPage: { enabled: true, specificationRowSelector: "table.specification tr" },
      knowledgeRetrieval: {
        locale: "en-GB",
        stopWords: ["the", "and"],
        topicAliases: {
          sizes: ["size", "fit", "width"],
          materials: ["leather", "textile"],
          care: ["clean", "wash", "care"],
        },
        topicSuggestions: { care: [{ label: "Cleaning guide", message: "How should I clean these shoes?" }] },
        insufficientEvidenceRules: [{
          queryTerms: ["waterproof"], evidenceTerms: ["waterproof", "membrane"],
          message: "The available documents do not confirm waterproofing.",
        }],
      },
      conversationRouting: {
        productTerms: ["shoe", "trainer", "size"], contactTerms: ["call me"],
        contactResponse: "Use the store contact form.", unknownResponse: "Ask about shoes or store information.",
      },
      answerGeneration: { enabled: false, tone: "expert" },
      syncSchedule: { enabled: true, intervalHours: 12 },
      widget: {
        enabled: true, title: "Shoe Assistant", subtitle: "Find your fit", welcomeMessage: "How can I help?",
        inputPlaceholder: "Describe your shoes", primaryColor: "#123456", theme: "auto", showPoweredBy: false,
        starterSuggestions: [{ label: "Running", message: "I need running shoes" }],
      },
      productComparison: {
        fields: [{ id: "price", label: "Price", source: { type: "commercial", key: "price" }, format: "currency", preference: "min" }],
        similarityWeights: { price: 1 },
        similarityRules: {},
        minimumScore: 0,
      },
      knowledgeSources: [{ type: "html", topic: "sizes", url: "https://example.com/size-guide" }],
    });
    expect(config.schemaVersion).toBe(1);
    expect(config.knowledgeRetrieval?.topicAliases.sizes).toContain("fit");
    expect(config.knowledgeSources[0]?.topic).toBe("sizes");
    expect(config.answerGeneration).toEqual({ enabled: false, tone: "expert" });
    expect(config.productComparison?.fields[0]?.label).toBe("Price");
    expect(config.widget?.title).toBe("Shoe Assistant");
    expect(config.conversationRouting?.productTerms).toContain("shoe");
    expect(config.conversationRouting?.continuationTerms).toBeUndefined();
    expect(config.conversationRouting?.restartProductTerms).toBeUndefined();
    expect(config.knowledgeRetrieval?.topicSuggestions.care?.[0]?.label).toBe("Cleaning guide");
    expect(config.syncSchedule).toEqual({ enabled: true, intervalHours: 12 });
  });
  it("keeps Nortberg catalog vocabulary in portable store configuration",async()=>{
    const {nortbergConfig}=await import("../src/config/store.js");
    expect(nortbergConfig.searchTaxonomy?.categoryAliases["Okapy Wyspowe"]).toContain("wyspowy");
    expect(nortbergConfig.searchTaxonomy?.spellingCorrections).toMatchObject({okapuw:"okapow",kategorje:"kategorie",wyspowt:"wyspowy"});
    expect(nortbergConfig.widget?.starterSuggestions.map(item=>item.label)).toContain("Kategorie okapów");
  });
  it("adds new routing controls to legacy stored configurations without overwriting explicit values",()=>{
    const bootstrap={productTerms:["product"],contactTerms:[],continuationTerms:["what about"],restartProductTerms:["start over"],contactResponse:"Contact",unknownResponse:"Unknown"};
    const legacy={productTerms:["shoe"],contactTerms:[],contactResponse:"Store contact",unknownResponse:"Clarify"};
    expect(mergeConversationRouting(bootstrap,legacy)).toMatchObject({productTerms:["shoe"],continuationTerms:["what about"],restartProductTerms:["start over"]});
    expect(mergeConversationRouting(bootstrap,{...legacy,continuationTerms:[]} )?.continuationTerms).toEqual([]);
  });
});
