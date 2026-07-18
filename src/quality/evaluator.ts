import { z } from "zod";

export const qualityExpectationsSchema = z.object({
  intent: z.enum(["product_search", "knowledge", "product_action", "contact_support", "unknown"]).optional(),
  requiredPhrases: z.array(z.string()).default([]), forbiddenPhrases: z.array(z.string()).default([]),
  sourceTopics: z.array(z.string()).default([]), maxSuggestions: z.number().int().nonnegative().optional(),
  products: z.enum(["any", "present", "none"]).default("any"), insufficientEvidence: z.boolean().optional(),
});
export type QualityExpectations = z.infer<typeof qualityExpectationsSchema>;

const normalized = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "");
export function evaluateResponse(response: Record<string, any>, expected: QualityExpectations): string[] {
  const failures: string[] = []; const message = normalized(String(response.message || ""));
  if (expected.intent && response.meta?.conversationIntent !== expected.intent) failures.push(`Oczekiwano intencji ${expected.intent}, otrzymano ${response.meta?.conversationIntent ?? "brak"}.`);
  for (const phrase of expected.requiredPhrases) if (!message.includes(normalized(phrase))) failures.push(`Brak wymaganej frazy: ${phrase}`);
  for (const phrase of expected.forbiddenPhrases) if (message.includes(normalized(phrase))) failures.push(`Wystąpiła zabroniona fraza: ${phrase}`);
  if (expected.maxSuggestions !== undefined && (response.suggestions?.length ?? 0) > expected.maxSuggestions) failures.push(`Za dużo sugestii: ${response.suggestions.length}/${expected.maxSuggestions}.`);
  const topics = new Set((response.sources ?? []).map((source: any) => source.topic)); for (const topic of expected.sourceTopics) if (!topics.has(topic)) failures.push(`Brak źródła tematu: ${topic}`);
  if (expected.products === "present" && !response.products?.length) failures.push("Oczekiwano produktów.");
  if (expected.products === "none" && response.products?.length) failures.push("Nie oczekiwano produktów.");
  if (expected.insufficientEvidence !== undefined && Boolean(response.meta?.insufficientEvidence) !== expected.insufficientEvidence) failures.push("Nieprawidłowy stan wystarczalności dowodów.");
  return failures;
}
