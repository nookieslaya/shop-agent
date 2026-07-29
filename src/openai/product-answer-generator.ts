import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ConversationProduct } from "../conversation/types.js";

const schema = z.object({ answer: z.string().min(1), referencedProductIds: z.array(z.string()).max(5) });

export interface ProductAnswerResult {
  answer: string;
  referencedProductIds: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class OpenAiProductAnswerGenerator {
  private readonly client: OpenAI;
  readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_ANSWER_MODEL ?? "gpt-5-nano") {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    this.client = new OpenAI({ apiKey, timeout: 10_000, maxRetries: 1 });
    this.model = model;
  }

  async generate(input: {
    question: string;
    storeName: string;
    locale: string;
    tone: "concise" | "friendly" | "expert";
    deterministicSummary: string;
    products: ConversationProduct[];
  }): Promise<ProductAnswerResult> {
    const safeProducts = input.products.map((product) => ({
      id: product.externalId, title: product.title, price: product.price, currency: product.currency, reasons: product.reasons,
    }));
    const validIds = new Set(safeProducts.map((product) => product.id));
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: [
        `Jesteś asystentem zakupowym sklepu ${input.storeName}. Odpowiadaj w ${input.locale}, styl: ${input.tone}.`,
        "Napisz naturalną, konkretną odpowiedź na wiadomość klienta i przedstaw maksymalnie 3 najlepsze propozycje.",
        "Korzystaj wyłącznie z przekazanych produktów, cen i powodów dopasowania. Nie zmieniaj cen, dostępności, nazw ani parametrów.",
        "Nie dodawaj cech, których nie ma w danych. Gdy powodów jest mało, powiedz tylko, że produkt spełnia podane filtry.",
        "Wyjaśnij krótko, dlaczego pierwsza propozycja jest najlepsza. Nie powtarzaj pytań, na które klient już odpowiedział.",
        "Nie dodawaj linków ani nowych produktów. Przyciski i karty produktów są renderowane osobno.",
      ].join("\n"),
      input: JSON.stringify({ question: input.question, deterministicSummary: input.deterministicSummary, products: safeProducts }),
      text: { format: zodTextFormat(schema, "grounded_product_answer") },
      reasoning: { effort: "minimal" },
      max_output_tokens: 700,
    });
    if (!response.output_parsed) throw new Error("OpenAI returned no product answer");
    const referencedProductIds = [...new Set(response.output_parsed.referencedProductIds)];
    if (referencedProductIds.some((id) => !validIds.has(id))) throw new Error("OpenAI referenced an unknown product");
    return {
      answer: response.output_parsed.answer.trim(), referencedProductIds, model: this.model,
      inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0,
    };
  }
}
