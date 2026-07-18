import Fastify from "fastify";
import { z } from "zod";
import { storeConfigSchema } from "../config/store.js";
import { buildConversationResponse } from "../conversation/orchestrator.js";
import type { ConversationState } from "../conversation/types.js";
import { createDatabase } from "../db/client.js";
import { SearchRepository } from "../db/search-repository.js";
import { OpenAiIntentExtractor } from "../openai/intent-extractor.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { buildKnowledgeAnswer, isKnowledgeQuestion, searchKnowledge } from "../knowledge/search.js";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";
import { isAdminRequestAuthorized } from "./admin-auth.js";
import { registerAdminUi } from "./admin-ui.js";

const requestSchema = z.object({
  storeId: z.string().min(1).default("nortberg"), message: z.string().default(""),
  state: z.object({ criteria: z.record(z.string(), z.unknown()) }).optional(),
  selection: z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }).optional(),
});

export async function createServer() {
  const app = Fastify({ logger: true });
  registerAdminUi(app);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/admin/stores", async (request, reply) => {
    if (!process.env.ADMIN_API_KEY) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string | undefined)) return reply.code(401).send({ error: "Unauthorized" });
    const { db, close } = createDatabase();
    try { return { stores: await new StoreConfigurationRepository(db).list() }; }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/config", async (request, reply) => {
    if (!process.env.ADMIN_API_KEY) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string | undefined)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try {
      const config = await new StoreConfigurationRepository(db).find(params.data.storeId);
      return config ? { config } : reply.code(404).send({ error: "Store configuration not found" });
    } finally { await close(); }
  });
  app.put("/v1/admin/stores/:storeId/config", async (request, reply) => {
    if (!process.env.ADMIN_API_KEY) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string | undefined)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    const config = storeConfigSchema.safeParse(request.body);
    if (!params.success || !config.success || config.data.id !== params.data.storeId) return reply.code(400).send({ error: "Invalid store configuration" });
    const { db, close } = createDatabase();
    try {
      await new StoreConfigurationRepository(db).update(config.data);
      return { config: config.data };
    } finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/overview", async (request, reply) => {
    if (!process.env.ADMIN_API_KEY) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string | undefined)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try { return { overview: await new StoreConfigurationRepository(db).overview(params.data.storeId) }; }
    finally { await close(); }
  });
  app.get("/v1/knowledge/search", async (request, reply) => {
    const parsed = z.object({ storeId: z.string().default("nortberg"), query: z.string().min(2), limit: z.coerce.number().int().min(1).max(10).default(5) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid query", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const chunks = await new KnowledgeRepository(db).searchableChunks(parsed.data.storeId);
      const retrievalConfig = (await new StoreConfigurationRepository(db).resolve(parsed.data.storeId))?.knowledgeRetrieval;
      return { results: searchKnowledge(chunks, parsed.data.query, parsed.data.limit, retrievalConfig) };
    } finally { await close(); }
  });
  app.post("/v1/chat", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const storeConfig = await new StoreConfigurationRepository(db).resolve(parsed.data.storeId);
      const retrievalConfig = storeConfig?.knowledgeRetrieval;
      if (!parsed.data.selection && parsed.data.message.trim() && isKnowledgeQuestion(parsed.data.message, retrievalConfig)) {
        const chunks = await new KnowledgeRepository(db).searchableChunks(parsed.data.storeId);
        const results = searchKnowledge(chunks, parsed.data.message, 3, retrievalConfig);
        if (results.length) return {
          message: buildKnowledgeAnswer(parsed.data.message, results, retrievalConfig),
          state: parsed.data.state ?? { criteria: {} }, suggestions: [], products: [],
          sources: results.map((result) => ({ topic: result.topic, title: result.title, url: result.sourceUrl,
            ...(result.heading ? { heading: result.heading } : {}), excerpt: result.excerpt })),
          meta: { intentSource: "deterministic" as const },
        };
        return { message: buildKnowledgeAnswer(parsed.data.message, results, retrievalConfig), state: parsed.data.state ?? { criteria: {} }, suggestions: [], products: [], sources: [], meta: { intentSource: "deterministic" as const } };
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
        ...(storeConfig?.searchTaxonomy ? { taxonomy: storeConfig.searchTaxonomy } : {}),
      });
    } finally { await close(); }
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createServer();
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}
