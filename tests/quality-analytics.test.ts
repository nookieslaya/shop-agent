import { describe, expect, it } from "vitest";
import { buildQualityAnalytics } from "../src/quality/analytics.js";

const now = new Date("2026-07-19T12:00:00Z");

describe("quality analytics", () => {
  it("prioritizes deterministic conversation problems and detects repeated answers", () => {
    const result = buildQualityAnalytics({
      current: [
        { id: "problem", messageCount: 6, flags: ["unknown", "fallback"], lastMessageAt: now },
        { id: "healthy", messageCount: 4, flags: ["openai"], lastMessageAt: now },
      ],
      previous: [{ id: "previous", messageCount: 2, flags: ["no_results"], lastMessageAt: new Date("2026-07-10T12:00:00Z") }],
      messages: [
        { conversationId: "problem", content: "Nie jestem pewien, w czym mogę pomóc.", details: { meta: { conversationIntent: "unknown" } }, createdAt: now },
        { conversationId: "problem", content: "Nie jestem pewien, w czym mogę pomóc.", details: { meta: { conversationIntent: "unknown" } }, createdAt: now },
        { conversationId: "healthy", content: "Znalazłem produkty.", details: { products: [{ id: "1" }], meta: { conversationIntent: "product_search", answerSource: "openai" } }, createdAt: now },
      ],
      scenarios: [], runs: [],
    });

    expect(result.summary).toMatchObject({ conversations: 2, messages: 10, attention: 1 });
    expect(result.attention[0]).toMatchObject({ id: "problem", severity: "critical" });
    expect(result.attention[0]?.reasons).toContain("Powtórzona odpowiedź asystenta");
    expect(result.actions).toMatchObject({ productResults: 1, openAiAnswers: 1 });
    expect(result.intents).toEqual({ unknown: 2, product_search: 1 });
  });

  it("reports latest scenario status and a pass-to-fail regression", () => {
    const result = buildQualityAnalytics({
      current: [], previous: [], messages: [],
      scenarios: [{ id: "regression", enabled: true }, { id: "passing", enabled: true }, { id: "disabled", enabled: false }],
      runs: [
        { scenarioId: "regression", passed: false, failures: ["wrong intent"], createdAt: now },
        { scenarioId: "regression", passed: true, failures: [], createdAt: new Date(now.getTime() - 1000) },
        { scenarioId: "passing", passed: true, failures: [], createdAt: now },
      ],
    });

    expect(result.scenarios).toEqual({ total: 2, passed: 1, failed: 1, neverRun: 0, regressions: ["regression"] });
    expect(result.summary.qualityScore).toBe(100);
  });
});
