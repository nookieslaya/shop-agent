import Fastify from "fastify";
import { z } from "zod";
import { storeConfigSchema } from "../config/store.js";
import { buildConversationResponse } from "../conversation/orchestrator.js";
import type { ConversationState } from "../conversation/types.js";
import { createDatabase } from "../db/client.js";
import { SearchRepository } from "../db/search-repository.js";
import { OpenAiIntentExtractor } from "../openai/intent-extractor.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { searchKnowledge } from "../knowledge/search.js";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";
import { adminSessionCookie, configuredAdminPassword, createAdminSession, expiredAdminSessionCookie, isAdminRequestAuthorized, verifyAdminPassword } from "./admin-auth.js";
import { registerAdminUi } from "./admin-ui.js";
import { buildKnowledgeConversationResponse } from "../conversation/knowledge-response.js";
import { OpenAiGroundedAnswerGenerator } from "../openai/grounded-answer-generator.js";
import { buildComparisonConversationResponse, buildSimilarConversationResponse } from "../conversation/product-actions.js";
import { analyzeProductConfiguration } from "../products/configuration-analyzer.js";
import { registerWidgetUi } from "./widget-ui.js";
import { ConversationRepository } from "../db/conversation-repository.js";
import { conversationFlags, conversationId, redactConversationData, userTurnLabel } from "../conversation/history.js";
import { classifyConversationIntent } from "../conversation/routing.js";
import { QualityRepository } from "../db/quality-repository.js";
import { evaluateResponse, qualityExpectationsSchema } from "../quality/evaluator.js";

const requestSchema = z.object({
  storeId: z.string().min(1).default("nortberg"), message: z.string().default(""),
  conversationId: z.string().uuid().optional(),
  state: z.object({ criteria: z.record(z.string(), z.unknown()), intent: z.enum(["product_search", "knowledge", "product_action", "contact_support", "unknown"]).optional() }).optional(),
  selection: z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }).optional(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("compare"), productIds: z.array(z.string().min(1)).min(2).max(3) }),
    z.object({ type: z.literal("similar"), productId: z.string().min(1), cheaperOnly: z.boolean().default(false), limit: z.number().int().min(1).max(20).default(5) }),
  ]).optional(),
});

const comparisonRequestSchema = z.object({ storeId: z.string().min(1), productIds: z.array(z.string().min(1)).min(2).max(3) });
const similarRequestSchema = z.object({ storeId: z.string().min(1), productId: z.string().min(1), cheaperOnly: z.boolean().default(false), limit: z.number().int().min(1).max(20).default(5) });
const qualityScenarioSchema = z.object({ name:z.string().min(1),message:z.string().min(1),expectations:qualityExpectationsSchema,enabled:z.boolean().default(true) });

export async function createServer() {
  const app = Fastify({ logger: true });
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.method !== "POST" || request.url !== "/v1/chat" || reply.statusCode >= 400 || typeof payload !== "string") return payload;
    try {
      const requestBody = request.body as Record<string, any>;
      const responseBody = JSON.parse(payload) as Record<string, any>;
      const id = conversationId(requestBody.conversationId);
      responseBody.conversationId = id;
      const safeRequest = redactConversationData(requestBody);
      const safeResponse = redactConversationData(responseBody);
      const { db, close } = createDatabase();
      try {
        await new ConversationRepository(db).recordTurn({
          conversationId: id, storeId: String(requestBody.storeId || "nortberg"), userContent: userTurnLabel(safeRequest),
          assistantContent: String(safeResponse.message || ""), request: safeRequest, response: safeResponse, flags: conversationFlags(safeResponse),
        });
      } finally { await close(); }
      return JSON.stringify(responseBody);
    } catch (error) {
      request.log.warn({ err: error }, "Conversation history recording failed");
      return payload;
    }
  });
  registerAdminUi(app);
  registerWidgetUi(app);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/widget/config", async (request, reply) => {
    const parsed = z.object({ storeId: z.string().min(1) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try {
      const config = await new StoreConfigurationRepository(db).resolve(parsed.data.storeId);
      if (!config?.widget?.enabled) return reply.code(404).send({ error: "Widget is not enabled" });
      return { storeId: config.id, storeName: config.name, widget: config.widget };
    } finally { await close(); }
  });
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
  app.get("/v1/admin/stores/:storeId/conversations", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    const query = z.object({ flag: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid conversation query" });
    const { db, close } = createDatabase();
    try { return { conversations: await new ConversationRepository(db).list(params.data.storeId, { limit: query.data.limit, ...(query.data.flag ? { flag: query.data.flag } : {}) }) }; }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/conversations/latest", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try { const conversation = await new ConversationRepository(db).latest(params.data.storeId); return conversation ? { conversation } : reply.code(404).send({ error: "Conversation not found" }); }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/conversations/:conversationId", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1), conversationId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid conversation id" });
    const { db, close } = createDatabase();
    try { const conversation = await new ConversationRepository(db).detail(params.data.storeId, params.data.conversationId); return conversation ? { conversation } : reply.code(404).send({ error: "Conversation not found" }); }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/quality-scenarios", async(request,reply)=>{if(!adminEnabled())return reply.code(503).send({error:"Admin API is disabled"});if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid store"});const{db,close}=createDatabase();try{return{scenarios:await new QualityRepository(db).list(p.data.storeId)}}finally{await close()}});
  app.post("/v1/admin/stores/:storeId/quality-scenarios",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string()}).safeParse(request.params),body=qualityScenarioSchema.safeParse(request.body);if(!p.success||!body.success)return reply.code(400).send({error:"Invalid scenario"});const{db,close}=createDatabase();try{return{scenario:await new QualityRepository(db).create({storeId:p.data.storeId,name:body.data.name,message:body.data.message,expectations:body.data.expectations})}}finally{await close()}});
  app.put("/v1/admin/stores/:storeId/quality-scenarios/:id",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string(),id:z.string().uuid()}).safeParse(request.params),body=qualityScenarioSchema.safeParse(request.body);if(!p.success||!body.success)return reply.code(400).send({error:"Invalid scenario"});const{db,close}=createDatabase();try{return{scenario:await new QualityRepository(db).update(p.data.storeId,p.data.id,body.data)}}finally{await close()}});
  app.delete("/v1/admin/stores/:storeId/quality-scenarios/:id",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string(),id:z.string().uuid()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid scenario"});const{db,close}=createDatabase();try{await new QualityRepository(db).remove(p.data.storeId,p.data.id);return{deleted:true}}finally{await close()}});
  app.post("/v1/admin/stores/:storeId/quality-scenarios/:id/run",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string(),id:z.string().uuid()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid scenario"});const{db,close}=createDatabase();try{const repo=new QualityRepository(db),scenario=await repo.get(p.data.storeId,p.data.id);if(!scenario)return reply.code(404).send({error:"Scenario not found"});const replay=await app.inject({method:"POST",url:"/v1/chat",payload:{storeId:p.data.storeId,message:scenario.message}});const response=replay.json() as Record<string,unknown>;const expected=qualityExpectationsSchema.parse(scenario.expectations),failures=evaluateResponse(response,expected);return{run:await repo.record(scenario.id,!failures.length,failures,response)}}finally{await close()}});
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
      const followUpMessage = parsed.data.selection?.key === "message" ? String(parsed.data.selection.value) : undefined;
      const message = followUpMessage ?? parsed.data.message;
      const selection = followUpMessage ? undefined : parsed.data.selection;
      const selectedAction = parsed.data.selection?.key === "compare" && typeof parsed.data.selection.value === "string"
        ? { type: "compare" as const, productIds: parsed.data.selection.value.split(",").filter(Boolean) }
        : parsed.data.selection?.key === "similar" || parsed.data.selection?.key === "similarCheaper"
          ? { type: "similar" as const, productId: String(parsed.data.selection.value), cheaperOnly: parsed.data.selection.key === "similarCheaper", limit: 5 }
          : parsed.data.action;
      const currentState = parsed.data.state as ConversationState | undefined;
      const conversationIntent = classifyConversationIntent({ message, hasProductAction: Boolean(selectedAction), ...(parsed.data.selection?.key ? { selectionKey: parsed.data.selection.key } : {}), ...(currentState ? { state: currentState } : {}), ...(storeConfig?.conversationRouting ? { routing: storeConfig.conversationRouting } : {}), ...(retrievalConfig ? { knowledge: retrievalConfig } : {}) });
      if (conversationIntent === "contact_support" || conversationIntent === "unknown") {
        const configuredMessage = conversationIntent === "contact_support" ? storeConfig?.conversationRouting?.contactResponse : storeConfig?.conversationRouting?.unknownResponse;
        const defaultMessage = conversationIntent === "contact_support" ? "Nie mogę przyjąć danych kontaktowych ani zlecić kontaktu. Skorzystaj proszę z oficjalnego kanału kontaktowego sklepu." : "Nie rozumiem jeszcze tej wiadomości. Napisz proszę, czy szukasz produktu, czy informacji o sklepie.";
        return { message: configuredMessage ?? defaultMessage, state: { criteria: {}, intent: conversationIntent }, suggestions: [], products: [], meta: { intentSource: "deterministic" as const, conversationIntent } };
      }
      if (selectedAction) {
        if (!storeConfig?.productComparison) return reply.code(422).send({ error: "Product comparison is not configured for this store" });
        const products = await new SearchRepository(db).activeProducts(parsed.data.storeId);
        try {
          if (selectedAction.type === "compare") return buildComparisonConversationResponse({ products, productIds: selectedAction.productIds, config: storeConfig.productComparison, ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}), ...(retrievalConfig?.locale ? { locale: retrievalConfig.locale } : {}) });
          return buildSimilarConversationResponse({ products, referenceId: selectedAction.productId, config: storeConfig.productComparison, cheaperOnly: selectedAction.cheaperOnly, limit: selectedAction.limit, ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}) });
        } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "Product action failed" }); }
      }
      if (conversationIntent === "knowledge") {
        const chunks = await new KnowledgeRepository(db).searchableChunks(parsed.data.storeId);
        const results = searchKnowledge(chunks, message, 3, retrievalConfig);
        return buildKnowledgeConversationResponse({
          question: message, storeName: storeConfig?.name ?? parsed.data.storeId,
          results, ...(retrievalConfig ? { retrievalConfig } : {}),
          ...(storeConfig?.answerGeneration?.tone ? { tone: storeConfig.answerGeneration.tone } : {}),
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
        ...(currentState?.intent === "product_search" ? { state: currentState } : {}),
        ...(selection ? { selection } : {}),
        ...(extractedCriteria ? { extractedCriteria } : {}),
        meta,
        productActionsEnabled: Boolean(storeConfig?.productComparison),
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
