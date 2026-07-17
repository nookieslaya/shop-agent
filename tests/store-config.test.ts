import { describe, expect, it } from "vitest";
import { storeConfigSchema } from "../src/config/store.js";

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
        insufficientEvidenceRules: [{
          queryTerms: ["waterproof"], evidenceTerms: ["waterproof", "membrane"],
          message: "The available documents do not confirm waterproofing.",
        }],
      },
      knowledgeSources: [{ type: "html", topic: "sizes", url: "https://example.com/size-guide" }],
    });
    expect(config.schemaVersion).toBe(1);
    expect(config.knowledgeRetrieval?.topicAliases.sizes).toContain("fit");
    expect(config.knowledgeSources[0]?.topic).toBe("sizes");
  });
});
