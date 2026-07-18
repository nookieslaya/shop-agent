import type { ProductSearchCriteria } from "../search/types.js";

export interface ConversationState { criteria: ProductSearchCriteria }
export interface Suggestion { label: string; key: "widthCm" | "maxPriceMinor" | "priority" | "removeFilter" | "message"; value: string | number }
export interface ConversationProduct {
  externalId: string; title: string; price: number; currency: string; imageUrl: string; productUrl: string;
  reasons: string[];
}
export interface ConversationResponse {
  message: string;
  state: ConversationState;
  suggestions: Suggestion[];
  products: ConversationProduct[];
  sources?: Array<{ id: string; topic: string; title: string; url: string; heading?: string; excerpt: string }>;
  meta?: {
    intentSource: "deterministic" | "openai" | "fallback";
    model?: string; inputTokens?: number; outputTokens?: number;
    answerSource?: "deterministic" | "openai" | "fallback";
    answerModel?: string; answerInputTokens?: number; answerOutputTokens?: number;
  };
}
