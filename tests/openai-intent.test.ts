import { describe, expect, it } from "vitest";
import { buildConversationResponse } from "../src/conversation/orchestrator.js";

describe("OpenAI intent integration", () => {
  it("merges structured AI criteria into deterministic conversation state", () => {
    const response = buildConversationResponse({
      message: "Potrzebuję czegoś do niewielkiej kuchni",
      extractedCriteria: { widthCm: 60, maxPriceMinor: 250_000, maxNoiseDb: 45 },
      meta: { intentSource: "openai", model: "test-model", inputTokens: 20, outputTokens: 10 },
      products: [],
    });
    expect(response.state.criteria).toMatchObject({ widthCm: 60, maxPriceMinor: 250_000, maxNoiseDb: 45 });
    expect(response.meta).toEqual({ intentSource: "openai", model: "test-model", inputTokens: 20, outputTokens: 10, conversationIntent: "product_search" });
  });
});
