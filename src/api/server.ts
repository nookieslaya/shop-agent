import Fastify from "fastify";
import { z } from "zod";
import { storeConfigSchema } from "../config/store.js";
import { buildConversationResponse } from "../conversation/orchestrator.js";
import type { ConversationState } from "../conversation/types.js";
import { createDatabase } from "../db/client.js";
import { SearchRepository } from "../db/search-repository.js";
import { OpenAiIntentExtractor } from "../openai/intent-extractor.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { isKnowledgeQuestion, searchKnowledge } from "../knowledge/search.js";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";
import { adminSessionCookie, configuredAdminPassword, createAdminSession, expiredAdminSessionCookie, isAdminRequestAuthorized, verifyAdminPassword } from "./admin-auth.js";
import { registerAdminUi } from "./admin-ui.js";
import { buildKnowledgeConversationResponse } from "../conversation/knowledge-response.js";
import { OpenAiGroundedAnswerGenerator } from "../openai/grounded-answer-generator.js";
import { buildComparisonConversationResponse, buildSimilarConversationResponse } from "../conversation/product-actions.js";
import { analyzeProductConfiguration } from "../products/configuration-analyzer.js";

const requestSchema = z.object({
  storeId: z.string().min(1).default("nortberg"), message: z.string().default(""),
  state: z.object({ criteria: z.record(z.string(), z.unknown()) }).optional(),
  selection: z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }).optional(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("compare"), productIds: z.array(z.string().min(1)).min(2).max(3) }),
    z.object({ type: z.literal("similar"), productId: z.string().min(1), cheaperOnly: z.boolean().default(false), limit: z.number().int().min(1).max(20).default(5) }),
  ]).optional(),
});

const comparisonRequestSchema = z.object({ storeId: z.string().min(1), productIds: z.array(z.string().min(1)).min(2).max(3) });
const similarRequestSchema = z.object({ storeId: z.string().min(1), productId: z.string().min(1), cheaperOnly: z.boolean().default(false), limit: z.number().int().min(1).max(20).default(5) });

export async function createServer() {
  const app = Fastify({ logger: true });
  registerAdminUi(app);
  app.get("/health", async () => ({ status: "ok" }));
  const adminEnabled = () => Boolean(configuredAdminPassword());
  const authorized = (request: { headers: Record<string, unknown> }) => isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string | undefined, request.headers.cookie as string | undefined);
  app.post("/v1/admin/session", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    const parsed = z.object({ password: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success || !verifyAdminPassword(parsed.data.password)) return reply.code(401).send({ error: "Unauthorized" });
    const token = createAdminSession(); if (!token) return reply.code(503).send({ error: "Admin API is disabled" });
    reply.header("Set-Cookie", adminSessionCookie(token)); return { authenticated: true };
  });
  app.get("/v1/admin/session", async (request, reply) => authorized(request) ? { authenticated: true } : reply.code(401).send({ authenticated: false }));
  app.delete("/v1/admin/session", async (_request, reply) => { reply.header("Set-Cookie", expiredAdminSessionCookie()); return { authenticated: false }; });
  app.get("/v1/admin/stores", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const { db, close } = createDatabase();
    try { return { stores: await new StoreConfigurationRepository(db).list() }; }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/config", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try {
      const config = await new StoreConfigurationRepository(db).resolve(params.data.storeId);
      return config ? { config } : reply.code(404).send({ error: "Store configuration not found" });
    } finally { await close(); }
  });
  app.put("/v1/admin/stores/:storeId/config", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
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
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try { return { overview: await new StoreConfigurationRepository(db).overview(params.data.storeId) }; }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/config-suggestions", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try { return { analysis: analyzeProductConfiguration(await new SearchRepository(db).activeProducts(params.data.storeId)) }; }
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
  app.post("/v1/products/compare", async (request, reply) => {
    const parsed = comparisonRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid comparison request", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const [products, config] = await Promise.all([new SearchRepository(db).activeProducts(parsed.data.storeId), new StoreConfigurationRepository(db).resolve(parsed.data.storeId)]);
      if (!config?.productComparison) return reply.code(422).send({ error: "Product comparison is not configured for this store" });
      try { return buildComparisonConversationResponse({ products, productIds: parsed.data.productIds, config: config.productComparison, ...(config.knowledgeRetrieval?.locale ? { locale: config.knowledgeRetrieval.locale } : {}) }); }
      catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "Comparison failed" }); }
    } finally { await close(); }
  });
  app.post("/v1/products/similar", async (request, reply) => {
    const parsed = similarRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid similar-products request", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const [products, config] = await Promise.all([new SearchRepository(db).activeProducts(parsed.data.storeId), new StoreConfigurationRepository(db).resolve(parsed.data.storeId)]);
      if (!config?.productComparison) return reply.code(422).send({ error: "Product similarity is not configured for this store" });
      try { return buildSimilarConversationResponse({ products, referenceId: parsed.data.productId, config: config.productComparison, cheaperOnly: parsed.data.cheaperOnly, limit: parsed.data.limit }); }
      catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "Similarity search failed" }); }
    } finally { await close(); }
  });
  app.post("/v1/chat", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const storeConfig = await new StoreConfigurationRepository(db).resolve(parsed.data.storeId);
      const retrievalConfig = storeConfig?.knowledgeRetrieval;
      const selectedAction = parsed.data.selection?.key === "compare" && typeof parsed.data.selection.value === "string"
        ? { type: "compare" as const, productIds: parsed.data.selection.value.split(",").filter(Boolean) }
        : parsed.data.selection?.key === "similar" || parsed.data.selection?.key === "similarCheaper"
          ? { type: "similar" as const, productId: String(parsed.data.selection.value), cheaperOnly: parsed.data.selection.key === "similarCheaper", limit: 5 }
          : parsed.data.action;
      if (selectedAction) {
        if (!storeConfig?.productComparison) return reply.code(422).send({ error: "Product comparison is not configured for this store" });
        const products = await new SearchRepository(db).activeProducts(parsed.data.storeId);
        try {
          if (selectedAction.type === "compare") return buildComparisonConversationResponse({ products, productIds: selectedAction.productIds, config: storeConfig.productComparison, ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}), ...(retrievalConfig?.locale ? { locale: retrievalConfig.locale } : {}) });
          return buildSimilarConversationResponse({ products, referenceId: selectedAction.productId, config: storeConfig.productComparison, cheaperOnly: selectedAction.cheaperOnly, limit: selectedAction.limit, ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}) });
        } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "Product action failed" }); }
      }
      const followUpMessage = parsed.data.selection?.key === "message" ? String(parsed.data.selection.value) : undefined;
      const message = followUpMessage ?? parsed.data.message;
      const selection = followUpMessage ? undefined : parsed.data.selection;
      if (!selection && message.trim() && isKnowledgeQuestion(message, retrievalConfig)) {
        const chunks = await new KnowledgeRepository(db).searchableChunks(parsed.data.storeId);
        const results = searchKnowledge(chunks, message, 3, retrievalConfig);
        return buildKnowledgeConversationResponse({
          question: message, storeName: storeConfig?.name ?? parsed.data.storeId,
          results, ...(retrievalConfig ? { retrievalConfig } : {}),
          ...(storeConfig?.answerGeneration?.tone ? { tone: storeConfig.answerGeneration.tone } : {}),
          ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}),
          ...(process.env.OPENAI_API_KEY && storeConfig?.answerGeneration?.enabled !== false ? { generator: new OpenAiGroundedAnswerGenerator() } : {}),
        });
      }
      const products = await new SearchRepository(db).activeProducts(parsed.data.storeId);
      let extractedCriteria;
      let meta: { intentSource: "deterministic" | "openai" | "fallback"; model?: string; inputTokens?: number; outputTokens?: number } = { intentSource: "deterministic" };
      if (process.env.OPENAI_API_KEY && message.trim() && !selection) {
        try {
          const intent = await new OpenAiIntentExtractor().extract(message);
          extractedCriteria = intent.criteria;
          meta = { intentSource: "openai", model: intent.model, inputTokens: intent.inputTokens, outputTokens: intent.outputTokens };
        } catch (error) {
          request.log.warn({ err: error }, "OpenAI intent extraction failed; using deterministic fallback");
          meta = { intentSource: "fallback" };
        }
      }
      return buildConversationResponse({
        message,
        products,
        ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}),
        ...(selection ? { selection } : {}),
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
