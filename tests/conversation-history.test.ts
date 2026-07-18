import { describe, expect, it } from "vitest";
import { conversationFlags, conversationId, redactConversationData, userTurnLabel } from "../src/conversation/history.js";

describe("conversation history diagnostics", () => {
  it("keeps an existing id or creates a valid new one", () => {
    const existing = "123e4567-e89b-42d3-a456-426614174000";
    expect(conversationId(existing)).toBe(existing);
    expect(conversationId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("masks contact data before persistence", () => {
    const result = redactConversationData({ message: "Napisz do jan@example.com lub 500 600 700" });
    expect(result.message).toBe("Napisz do [EMAIL] lub [TELEFON]");
  });

  it("flags actual no-result answers without marking clarification questions", () => {
    expect(conversationFlags({ message: "Jaki budżet?", products: [], meta: { intentSource: "deterministic" } })).not.toContain("no_results");
    expect(conversationFlags({ message: "Nie znalazłem produktu", products: [], meta: { intentSource: "fallback", conversationIntent: "product_search" } })).toEqual(["no_results", "fallback"]);
    expect(conversationFlags({ message: "Nie znalazłem w dokumentach", products: [], meta: { intentSource: "deterministic", conversationIntent: "knowledge", insufficientEvidence: true } })).toEqual(["insufficient_evidence"]);
  });

  it("creates readable labels for button selections", () => {
    expect(userTurnLabel({ message: "", selection: { key: "widthCm", value: 60 } })).toBe("[wybór: widthCm = 60]");
  });
});
