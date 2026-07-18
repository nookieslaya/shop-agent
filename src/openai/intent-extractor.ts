import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ProductSearchCriteria } from "../search/types.js";

const intentSchema = z.object({
  widthCm: z.number().int().positive().nullable(),
  minPricePln: z.number().positive().nullable(),
  maxPricePln: z.number().positive().nullable(),
  priceSort: z.enum(["ascending", "descending", "none"]),
  resultLimit: z.number().int().min(1).max(20).nullable(),
  material: z.enum(["black", "white", "inox", "other"]).nullable(),
  hoodType: z.enum(["chimney", "island", "built_in", "other"]).nullable(),
  operatingMode: z.enum(["extractor", "recirculation"]).nullable(),
  priority: z.enum(["quiet", "efficient", "design", "none"]),
});

export interface AiIntentResult {
  criteria: ProductSearchCriteria;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class OpenAiIntentExtractor {
  private readonly client: OpenAI;
  readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_INTENT_MODEL ?? "gpt-5-nano") {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    this.client = new OpenAI({ apiKey, timeout: 8_000, maxRetries: 1 });
    this.model = model;
  }

  async extract(message: string): Promise<AiIntentResult> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: "Wyodrębnij wyłącznie jawne wymagania dotyczące okapu kuchennego. Nie zgaduj brakujących wartości. Kwoty zwracaj w PLN. Liczba produktów w poleceniu, np. '2 najdroższe', jest resultLimit, nigdy ceną ani szerokością. 'Powyżej/od X zł' oznacza minPricePln, a 'do X zł' maxPricePln. Najdroższe oznacza descending, najtańsze ascending. Priorytet quiet oznacza cichą pracę, efficient wysoką wydajność. Zwróć wyłącznie wymagany schemat.",
      input: message,
      text: { format: zodTextFormat(intentSchema, "shopping_intent") },
      reasoning: { effort: "minimal" },
      max_output_tokens: 600,
    });
    if (!response.output_parsed) throw new Error("OpenAI returned no parsed intent");
    const intent = response.output_parsed;
    const criteria: ProductSearchCriteria = {};
    if (intent.widthCm !== null) criteria.widthCm = intent.widthCm;
    if (intent.minPricePln !== null) criteria.minPriceMinor = Math.round(intent.minPricePln * 100);
    if (intent.maxPricePln !== null) criteria.maxPriceMinor = Math.round(intent.maxPricePln * 100);
    if (intent.minPricePln !== null || intent.maxPricePln !== null) { criteria.priceMode = "bounded"; criteria.budgetResolved = true; }
    if (intent.priceSort === "ascending") criteria.sortBy = "price_asc";
    if (intent.priceSort === "descending") criteria.sortBy = "price_desc";
    if (intent.resultLimit !== null) criteria.limit = intent.resultLimit;
    if (intent.material === "black") criteria.material = "czarny";
    if (intent.material === "white") criteria.material = "biały";
    if (intent.material === "inox") criteria.material = "inox";
    if (intent.hoodType === "chimney") criteria.hoodType = "kominowy";
    if (intent.hoodType === "island") criteria.hoodType = "wyspowy";
    if (intent.hoodType === "built_in") criteria.hoodType = "zabudowy";
    if (intent.operatingMode === "extractor") criteria.operatingMode = "wyciąg";
    if (intent.operatingMode === "recirculation") criteria.operatingMode = "pochłaniacz";
    if (intent.priority === "quiet") criteria.maxNoiseDb = 45;
    if (intent.priority === "efficient") criteria.minEfficiencyM3h = 700;
    return { criteria, model: this.model, inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
  }
}
