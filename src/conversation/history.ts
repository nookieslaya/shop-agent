import { randomUUID } from "node:crypto";
import type { ConversationFlag } from "../db/conversation-repository.js";

const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phone = /(?<!\d)(?:\+?48[\s-]?)?(?:\d[\s-]?){9}(?!\d)/g;

export const conversationId = (candidate?: string) => candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : randomUUID();
export const redactConversationData = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string" ? item.replace(email, "[EMAIL]").replace(phone, "[TELEFON]") : item));

export function conversationFlags(response: Record<string, any>): ConversationFlag[] {
  const flags: ConversationFlag[] = [];
  if (Array.isArray(response.products) && response.products.length === 0 && /nie znalazłem/i.test(String(response.message || ""))) flags.push("no_results");
  if (response.meta?.intentSource === "fallback" || response.meta?.answerSource === "fallback") flags.push("fallback");
  if (response.meta?.intentSource === "openai" || response.meta?.answerSource === "openai") flags.push("openai");
  if (response.comparison) flags.push("comparison");
  if (response.meta?.productAction === "similar") flags.push("similar");
  return flags;
}

export function userTurnLabel(request: Record<string, any>): string {
  if (request.message?.trim()) return request.message.trim();
  if (request.selection) return `[wybór: ${request.selection.key} = ${request.selection.value}]`;
  if (request.action) return `[akcja: ${request.action.type}]`;
  return "[pusta wiadomość]";
}
