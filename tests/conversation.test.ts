import { describe, expect, it } from "vitest";
import { buildConversationResponse } from "../src/conversation/orchestrator.js";
import { extractSearchCriteria } from "../src/conversation/intent.js";

describe("conversation orchestration", () => {
  it("extracts explicit Polish shopping requirements", () => {
    expect(extractSearchCriteria("Szukam cichego czarnego okapu 60 cm do 3000 zł")).toMatchObject({
      widthCm: 60, maxPriceMinor: 300_000, material: "czarny", maxNoiseDb: 45,
    });
  });

  it("asks for width first and returns button suggestions", () => {
    const response = buildConversationResponse({ message: "Szukam okapu", products: [] });
    expect(response.message).toContain("szerokości");
    expect(response.suggestions.map((item) => item.value)).toEqual([50, 60, 80, 90]);
  });

  it("keeps state while applying a button selection", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 60 } },
      selection: { key: "maxPriceMinor", value: 250_000 }, products: [] });
    expect(response.state.criteria).toMatchObject({ widthCm: 60, maxPriceMinor: 250_000 });
    expect(response.message).toContain("najważniejsze");
  });
});
