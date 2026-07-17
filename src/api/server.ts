import Fastify from "fastify";
import { z } from "zod";
import { buildConversationResponse } from "../conversation/orchestrator.js";
import type { ConversationState } from "../conversation/types.js";
import { createDatabase } from "../db/client.js";
import { SearchRepository } from "../db/search-repository.js";
import { nortbergConfig } from "../config/store.js";
import { OpenAiIntentExtractor } from "../openai/intent-extractor.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { buildKnowledgeAnswer, isKnowledgeQuestion, searchKnowledge } from "../knowledge/search.js";

const requestSchema = z.object({
  storeId: z.string().min(1).default("nortberg"), message: z.string().default(""),
  state: z.object({ criteria: z.record(z.string(), z.unknown()) }).optional(),
  selection: z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }).optional(),
});

export async function createServer() {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/knowledge/search", async (request, reply) => {
    const parsed = z.object({ storeId: z.string().default("nortberg"), query: z.string().min(2), limit: z.coerce.number().int().min(1).max(10).default(5) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid query", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const chunks = await new KnowledgeRepository(db).searchableChunks(parsed.data.storeId);
      return { results: searchKnowledge(chunks, parsed.data.query, parsed.data.limit) };
    } finally { await close(); }
  });
  app.post("/v1/chat", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      if (!parsed.data.selection && parsed.data.message.trim() && isKnowledgeQuestion(parsed.data.message)) {
        const chunks = await new KnowledgeRepository(db).searchableChunks(parsed.data.storeId);
        const results = searchKnowledge(chunks, parsed.data.message, 3);
        if (results.length) return {
          message: buildKnowledgeAnswer(parsed.data.message, results),
          state: parsed.data.state ?? { criteria: {} }, suggestions: [], products: [],
          sources: results.map((result) => ({ topic: result.topic, title: result.title, url: result.sourceUrl,
            ...(result.heading ? { heading: result.heading } : {}), excerpt: result.excerpt })),
          meta: { intentSource: "deterministic" as const },
        };
        return { message: buildKnowledgeAnswer(parsed.data.message, results), state: parsed.data.state ?? { criteria: {} }, suggestions: [], products: [], sources: [], meta: { intentSource: "deterministic" as const } };
      }
      const products = await new SearchRepository(db).activeProducts(parsed.data.storeId);
      let extractedCriteria;
      let meta: { intentSource: "deterministic" | "openai" | "fallback"; model?: string; inputTokens?: number; outputTokens?: number } = { intentSource: "deterministic" };
      if (process.env.OPENAI_API_KEY && parsed.data.message.trim() && !parsed.data.selection) {
        try {
          const intent = await new OpenAiIntentExtractor().extract(parsed.data.message);
          extractedCriteria = intent.criteria;
          meta = { intentSource: "openai", model: intent.model, inputTokens: intent.inputTokens, outputTokens: intent.outputTokens };
        } catch (error) {
          request.log.warn({ err: error }, "OpenAI intent extraction failed; using deterministic fallback");
          meta = { intentSource: "fallback" };
        }
      }
      return buildConversationResponse({
        message: parsed.data.message,
        products,
        ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}),
        ...(parsed.data.selection ? { selection: parsed.data.selection } : {}),
        ...(extractedCriteria ? { extractedCriteria } : {}),
        meta,
        ...(parsed.data.storeId === "nortberg" && nortbergConfig.searchTaxonomy ? { taxonomy: nortbergConfig.searchTaxonomy } : {}),
      });
    } finally { await close(); }
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createServer();
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}
