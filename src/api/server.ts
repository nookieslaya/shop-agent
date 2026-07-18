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
import { adminSessionCookie, configuredAdminPassword, createAdminSession, expiredAdminSessionCookie, isAdminRequestAuthorized, sessionFromCookie, verifyAdminPassword } from "./admin-auth.js";
import { registerAdminUi } from "./admin-ui.js";
import { buildKnowledgeConversationResponse } from "../conversation/knowledge-response.js";
import { OpenAiGroundedAnswerGenerator } from "../openai/grounded-answer-generator.js";
import { buildComparisonConversationResponse, buildSimilarConversationResponse } from "../conversation/product-actions.js";
import { analyzeProductConfiguration } from "../products/configuration-analyzer.js";
import { registerWidgetUi } from "./widget-ui.js";
import { ConversationRepository } from "../db/conversation-repository.js";
import { conversationFlags, conversationId, redactConversationData, userTurnLabel } from "../conversation/history.js";
import { decideConversationRoute, reusableProductState } from "../conversation/routing.js";
import { QualityRepository } from "../db/quality-repository.js";
import { SyncJobRepository } from "../db/sync-job-repository.js";
import { fullSyncConfirmed } from "../sync/job-policy.js";
import { evaluateResponse, qualityExpectationsSchema } from "../quality/evaluator.js";
import { AiUsageRepository, defaultAiLimits, RuntimeRepository, type AiLimitConfig } from "../observability/usage.js";
import { FixedWindowRateLimiter } from "../observability/rate-limit.js";
import { analyzeFeed, analyzeProductPage, buildStoreConfig, onboardingStoreSchema } from "../onboarding/store-onboarding.js";
import { publicationReadiness } from "../publication/readiness.js";
import { PrivacyRepository } from "../privacy/privacy-repository.js";
import { AdminIdentityRepository, type AdminIdentity, type AdminRole } from "../security/admin-identity.js";

const requestSchema = z.object({
  storeId: z.string().min(1).default("nortberg"), message: z.string().default(""),
  conversationId: z.string().uuid().optional(),
  state: z.object({ criteria: z.record(z.string(), z.unknown()), intent: z.enum(["product_search", "knowledge", "product_action", "contact_support", "unknown"]).optional(), knowledgeTopics: z.array(z.string()).max(10).optional() }).optional(),
  selection: z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }).optional(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("compare"), productIds: z.array(z.string().min(1)).min(2).max(3) }),
    z.object({ type: z.literal("similar"), productId: z.string().min(1), cheaperOnly: z.boolean().default(false), limit: z.number().int().min(1).max(20).default(5) }),
  ]).optional(),
});

const comparisonRequestSchema = z.object({ storeId: z.string().min(1), productIds: z.array(z.string().min(1)).min(2).max(3) });
const similarRequestSchema = z.object({ storeId: z.string().min(1), productId: z.string().min(1), cheaperOnly: z.boolean().default(false), limit: z.number().int().min(1).max(20).default(5) });
const qualityScenarioSchema = z.object({ name:z.string().min(1),message:z.string().min(1),expectations:qualityExpectationsSchema,enabled:z.boolean().default(true) });
const syncJobRequestSchema = z.object({ type: z.enum(["feed", "enrichment", "knowledge", "full"]), mode: z.enum(["incremental", "full", "failed"]).default("incremental"), confirmation: z.string().optional() });

export async function createServer() {
  const app = Fastify({ bodyLimit:64*1024, logger: { redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-admin-api-key", "req.body.message", "req.body.password"] }, requestIdHeader: "x-request-id" });
  const requestLimiter = new FixedWindowRateLimiter();
  app.addHook("preHandler",async(request,reply)=>{if(!request.url.startsWith("/v1/admin")||(request.method==="POST"&&request.url==="/v1/admin/session"))return;const legacy=isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string|undefined,request.headers.cookie),{db,close}=createDatabase();try{const identity=legacy?{id:"legacy-api-key",username:"legacy-admin",role:"owner" as const}:await new AdminIdentityRepository(db).session(sessionFromCookie(request.headers.cookie));if(!identity)return reply.code(401).send({error:"Unauthorized"});(request as typeof request&{adminIdentity:AdminIdentity}).adminIdentity=identity;if(request.method!=="GET"&&request.method!=="HEAD"&&identity.role==="viewer")return reply.code(403).send({error:"Viewer role is read-only"})}finally{await close()}});
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options","nosniff").header("Referrer-Policy","strict-origin-when-cross-origin").header("Permissions-Policy","camera=(), microphone=(), geolocation=()").header("X-Request-Id",request.id);
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
        const config=await new StoreConfigurationRepository(db).resolve(String(requestBody.storeId||"nortberg"));
        if(config?.privacy?.conversationHistoryEnabled===false)return JSON.stringify(responseBody);
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
  app.get("/health", async () => ({ status: "ok", uptimeSeconds: Math.round(process.uptime()) }));
  app.get("/ready", async (_request, reply) => { const { db, close } = createDatabase(); try { await new StoreConfigurationRepository(db).list(); const runtimes=await new RuntimeRepository(db).status(); const worker=runtimes.find(item=>item.component==="sync-worker"); const workerReady=Boolean(worker&&Date.now()-worker.heartbeatAt.getTime()<30_000); const body={status:workerReady?"ready":"degraded",dependencies:{database:"ready",worker:workerReady?"ready":"stale"}}; return workerReady||process.env.WORKER_READINESS_REQUIRED==="false"?body:reply.code(503).send(body); } catch { return reply.code(503).send({ status: "unavailable", dependencies:{database:"unavailable",worker:"unknown"} }); } finally { await close(); } });
  app.get("/v1/widget/config", async (request, reply) => {
    const parsed = z.object({ storeId: z.string().min(1) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try {
      const config = await new StoreConfigurationRepository(db).resolve(parsed.data.storeId);
      if (!config?.widget?.enabled) return reply.code(404).send({ error: "Widget is not enabled" });
      return { storeId: config.id, storeName: config.name, widget: config.widget, privacy:{historyEnabled:config.privacy?.conversationHistoryEnabled!==false,noticeUrl:config.privacy?.privacyNoticeUrl} };
    } finally { await close(); }
  });
  const adminEnabled = () => true;
  const identity=(request:unknown)=>(request as {adminIdentity?:AdminIdentity}).adminIdentity;
  const usesHttps=(request:{protocol:string;headers:Record<string,unknown>})=>request.protocol==="https"||(String(request.headers["x-forwarded-proto"]??"").split(",")[0]?.trim().toLowerCase()??"")==="https";
  const authorized = (request: { headers: Record<string, unknown> }) => Boolean(identity(request))||isAdminRequestAuthorized(request.headers["x-admin-api-key"] as string | undefined, request.headers.cookie as string | undefined);
  const adminActor=(request:{headers:Record<string,unknown>})=>identity(request)?.username??(request.headers["x-admin-api-key"]?"admin-api-key":"admin-session");
  app.post("/v1/admin/session", async (request, reply) => {
    const rate=requestLimiter.consume(`admin-login:${request.ip}`,5);if(!rate.allowed){reply.header("Retry-After",String(rate.retryAfterSeconds));return reply.code(429).send({error:"Too many login attempts",retryAfterSeconds:rate.retryAfterSeconds});}
    const parsed = z.object({username:z.string().min(1).default("admin"), password: z.string().min(1) }).safeParse(request.body);if(!parsed.success)return reply.code(401).send({error:"Unauthorized"});const{db,close}=createDatabase();try{const users=new AdminIdentityRepository(db),login=await users.login(parsed.data.username,parsed.data.password);if(login){await new PrivacyRepository(db).audit({actor:login.identity.username,action:"admin.login",targetType:"admin_user",targetId:login.identity.id});reply.header("Set-Cookie",adminSessionCookie(login.token,usesHttps(request)));return{authenticated:true,user:login.identity}}if(await users.count()===0&&verifyAdminPassword(parsed.data.password)){const token=createAdminSession();if(token){reply.header("Set-Cookie",adminSessionCookie(token,usesHttps(request)));return{authenticated:true,user:{username:"legacy-admin",role:"owner"}}}}await new PrivacyRepository(db).audit({actor:parsed.data.username,action:"admin.login_failed",targetType:"admin_user"});return reply.code(401).send({error:"Unauthorized"})}finally{await close()}
  });
  app.get("/v1/admin/session", async (request) => ({authenticated:true,user:identity(request)??{username:"legacy-admin",role:"owner"}}));
  app.delete("/v1/admin/session", async (request, reply) => {const{db,close}=createDatabase();try{await new AdminIdentityRepository(db).logout(sessionFromCookie(request.headers.cookie));await new PrivacyRepository(db).audit({actor:adminActor(request),action:"admin.logout",targetType:"admin_session"})}finally{await close()}reply.header("Set-Cookie", expiredAdminSessionCookie()); return { authenticated: false }; });
  const requireOwner=(request:unknown,reply:{code:(status:number)=>{send:(body:unknown)=>unknown}})=>identity(request)?.role==="owner"?true:reply.code(403).send({error:"Owner role is required"});
  app.get("/v1/admin/users",async(request,reply)=>{if(!requireOwner(request,reply))return;const{db,close}=createDatabase();try{return{users:await new AdminIdentityRepository(db).list()}}finally{await close()}});
  app.post("/v1/admin/users",async(request,reply)=>{if(!requireOwner(request,reply))return;const body=z.object({username:z.string().min(3).max(80),password:z.string().min(12).max(200),role:z.enum(["owner","operator","viewer"])}).safeParse(request.body);if(!body.success)return reply.code(400).send({error:"Invalid administrator"});const{db,close}=createDatabase();try{const user=await new AdminIdentityRepository(db).create(body.data.username,body.data.password,body.data.role);await new PrivacyRepository(db).audit({actor:adminActor(request),action:"admin_user.create",targetType:"admin_user",targetId:user?.id,metadata:{username:user?.username,role:user?.role}});return reply.code(201).send({user})}catch(error){return reply.code(409).send({error:error instanceof Error?error.message:"User creation failed"})}finally{await close()}});
  app.post("/v1/admin/users/:id/reset-password",async(request,reply)=>{if(!requireOwner(request,reply))return;const p=z.object({id:z.string().uuid()}).safeParse(request.params),body=z.object({password:z.string().min(12).max(200)}).safeParse(request.body);if(!p.success||!body.success)return reply.code(400).send({error:"Invalid password reset"});const{db,close}=createDatabase();try{await new AdminIdentityRepository(db).resetPassword(p.data.id,body.data.password);await new PrivacyRepository(db).audit({actor:adminActor(request),action:"admin_user.password_reset",targetType:"admin_user",targetId:p.data.id});return{updated:true}}finally{await close()}});
  app.post("/v1/admin/users/:id/sessions/revoke",async(request,reply)=>{if(!requireOwner(request,reply))return;const p=z.object({id:z.string().uuid()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid user"});const{db,close}=createDatabase();try{const revoked=await new AdminIdentityRepository(db).revokeUserSessions(p.data.id);await new PrivacyRepository(db).audit({actor:adminActor(request),action:"admin_user.sessions_revoke",targetType:"admin_user",targetId:p.data.id,metadata:{revoked}});return{revoked}}finally{await close()}});
  app.post("/v1/admin/users/:id/enabled",async(request,reply)=>{if(!requireOwner(request,reply))return;const p=z.object({id:z.string().uuid()}).safeParse(request.params),body=z.object({enabled:z.boolean()}).safeParse(request.body);if(!p.success||!body.success||p.data.id===identity(request)?.id)return reply.code(400).send({error:"Invalid user state change"});const{db,close}=createDatabase();try{await new AdminIdentityRepository(db).setEnabled(p.data.id,body.data.enabled);await new PrivacyRepository(db).audit({actor:adminActor(request),action:"admin_user.enabled_change",targetType:"admin_user",targetId:p.data.id,metadata:{enabled:body.data.enabled}});return{updated:true}}finally{await close()}});
  app.delete("/v1/admin/users/:id",async(request,reply)=>{if(!requireOwner(request,reply))return;const p=z.object({id:z.string().uuid()}).safeParse(request.params),body=z.object({confirmation:z.string()}).safeParse(request.body);if(!p.success||!body.success||body.data.confirmation!==p.data.id||p.data.id===identity(request)?.id)return reply.code(400).send({error:"Exact user id confirmation is required and you cannot delete your own account"});const{db,close}=createDatabase();try{const repository=new AdminIdentityRepository(db),users=await repository.list(),target=users.find(user=>user.id===p.data.id);if(!target)return reply.code(404).send({error:"User not found"});if(target.role==="owner"&&target.enabled&&users.filter(user=>user.role==="owner"&&user.enabled).length<=1)return reply.code(409).send({error:"The last active owner cannot be deleted"});await repository.remove(p.data.id);await new PrivacyRepository(db).audit({actor:adminActor(request),action:"admin_user.delete",targetType:"admin_user",targetId:p.data.id,metadata:{username:target.username,role:target.role}});return{deleted:true}}finally{await close()}});
  app.get("/v1/admin/stores", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const { db, close } = createDatabase();
    try { return { stores: await new StoreConfigurationRepository(db).list() }; }
    finally { await close(); }
  });
  app.post("/v1/admin/onboarding/analyze-feed",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const body=z.object({url:z.url()}).safeParse(request.body);if(!body.success)return reply.code(400).send({error:"Invalid feed URL"});try{return{analysis:await analyzeFeed(body.data.url)}}catch(error){request.log.warn({err:error instanceof Error?error.message:"feed analysis failed"},"Onboarding feed analysis failed");return reply.code(422).send({error:error instanceof Error?error.message:"Feed analysis failed"})}});
  app.post("/v1/admin/onboarding/analyze-product-page",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const body=z.object({url:z.url()}).safeParse(request.body);if(!body.success)return reply.code(400).send({error:"Invalid product URL"});try{return{analysis:await analyzeProductPage(body.data.url)}}catch(error){request.log.warn({err:error instanceof Error?error.message:"page analysis failed"},"Onboarding product-page analysis failed");return reply.code(422).send({error:error instanceof Error?error.message:"Product-page analysis failed"})}});
  app.post("/v1/admin/stores",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const body=onboardingStoreSchema.safeParse(request.body);if(!body.success)return reply.code(400).send({error:"Invalid store onboarding data",details:body.error.issues});const{db,close}=createDatabase();try{const repository=new StoreConfigurationRepository(db);if(await repository.find(body.data.id))return reply.code(409).send({error:"Store id already exists"});const analysis=await analyzeFeed(body.data.feedUrl);if(body.data.productPage.enabled){const sample=analysis.samples[0];if(!sample)return reply.code(422).send({error:"Feed has no product page sample"});const page=await analyzeProductPage(sample.productUrl);if(!page.candidates.some(item=>item.selector===body.data.productPage.specificationRowSelector&&item.rowCount>0))return reply.code(422).send({error:"The selected technical-data selector returned no rows"});}const config=buildStoreConfig(body.data);await repository.create(config);let job;if(body.data.startImport)job=(await new SyncJobRepository(db).enqueue({storeId:config.id,type:"feed",mode:"incremental"})).job;return reply.code(201).send({config,analysis,job})}catch(error){request.log.warn({err:error instanceof Error?error.message:"store creation failed"},"Store onboarding failed");return reply.code(422).send({error:error instanceof Error?error.message:"Store creation failed"})}finally{await close()}});
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
      const repository=new StoreConfigurationRepository(db),current=await repository.resolve(params.data.storeId);
      if(config.data.widget?.enabled===true&&current?.widget?.enabled!==true){const readiness=await publicationReadiness(db,config.data);if(!readiness.ready)return reply.code(409).send({error:"Store is not ready for publication",readiness});}
      await repository.update(config.data);
      if(JSON.stringify(current?.privacy??{})!==JSON.stringify(config.data.privacy??{}))await new PrivacyRepository(db).audit({storeId:params.data.storeId,actor:adminActor(request),action:"privacy.configuration_update",targetType:"store",targetId:params.data.storeId,metadata:{privacy:config.data.privacy??{}}});
      return { config: config.data };
    } finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/publication-readiness",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const params=z.object({storeId:z.string().min(1)}).safeParse(request.params);if(!params.success)return reply.code(400).send({error:"Invalid store id"});const{db,close}=createDatabase();try{const config=await new StoreConfigurationRepository(db).resolve(params.data.storeId);return config?{readiness:await publicationReadiness(db,config)}:reply.code(404).send({error:"Store not found"})}finally{await close()}});
  app.post("/v1/admin/stores/:storeId/publish",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const params=z.object({storeId:z.string().min(1)}).safeParse(request.params),body=z.object({confirmation:z.string().min(1)}).safeParse(request.body);if(!params.success||!body.success||body.data.confirmation!==params.data.storeId)return reply.code(400).send({error:"Publication requires the store id as confirmation"});const{db,close}=createDatabase();try{const repository=new StoreConfigurationRepository(db),config=await repository.resolve(params.data.storeId);if(!config)return reply.code(404).send({error:"Store not found"});const readiness=await publicationReadiness(db,config);if(!readiness.ready)return reply.code(409).send({error:"Store is not ready for publication",readiness});const published=storeConfigSchema.parse({...config,widget:{...config.widget!,enabled:true}});await repository.update(published);return{config:published,readiness:{...readiness,published:true}}}finally{await close()}});
  app.get("/v1/admin/stores/:storeId/overview", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try { return { overview: await new StoreConfigurationRepository(db).overview(params.data.storeId) }; }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/usage", async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const params=z.object({storeId:z.string().min(1)}).safeParse(request.params);if(!params.success)return reply.code(400).send({error:"Invalid store id"});const{db,close}=createDatabase();try{const config=await new StoreConfigurationRepository(db).resolve(params.data.storeId);return{usage:await new AiUsageRepository(db).summary(params.data.storeId),limits:config?.aiLimits??defaultAiLimits,runtimes:await new RuntimeRepository(db).status()}}finally{await close()}});
  app.get("/v1/admin/system/backups",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const{db,close}=createDatabase();try{const runtime=(await new RuntimeRepository(db).status()).find(item=>item.component==="postgres-backup");const intervalHours=Math.max(1,Number(process.env.BACKUP_INTERVAL_HOURS??24));return{backup:runtime?{...runtime,fresh:Date.now()-runtime.heartbeatAt.getTime()<(intervalHours+1)*3_600_000}:null,policy:{intervalHours,retentionDays:Math.max(1,Number(process.env.BACKUP_RETENTION_DAYS??14))}}}finally{await close()}});
  app.get("/v1/admin/stores/:storeId/config-suggestions", async (request, reply) => {
    if (!adminEnabled()) return reply.code(503).send({ error: "Admin API is disabled" });
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid store id" });
    const { db, close } = createDatabase();
    try { return { analysis: analyzeProductConfiguration(await new SearchRepository(db).activeProducts(params.data.storeId)) }; }
    finally { await close(); }
  });
  app.get("/v1/admin/stores/:storeId/sync-jobs", async (request, reply) => {
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params); const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid sync job query" });
    const { db, close } = createDatabase(); try { return { jobs: await new SyncJobRepository(db).list(params.data.storeId, query.data.limit) }; } finally { await close(); }
  });
  app.post("/v1/admin/stores/:storeId/sync-jobs", async (request, reply) => {
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" });
    const params = z.object({ storeId: z.string().min(1) }).safeParse(request.params); const body = syncJobRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid sync job" });
    if (!fullSyncConfirmed(body.data.mode, body.data.confirmation, params.data.storeId)) return reply.code(400).send({ error: "Full synchronization requires the store id as confirmation" });
    const { db, close } = createDatabase(); try { const result = await new SyncJobRepository(db).enqueue({ storeId: params.data.storeId, type: body.data.type, mode: body.data.mode }); return reply.code(result.created ? 202 : 200).send(result); } finally { await close(); }
  });
  app.post("/v1/admin/stores/:storeId/sync-jobs/:id/retry", async (request, reply) => {
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" }); const params = z.object({ storeId: z.string(), id: z.string().uuid() }).safeParse(request.params); if (!params.success) return reply.code(400).send({ error: "Invalid job" });
    const { db, close } = createDatabase(); try { return await new SyncJobRepository(db).retry(params.data.storeId, params.data.id); } catch (error) { return reply.code(409).send({ error: error instanceof Error ? error.message : "Retry failed" }); } finally { await close(); }
  });
  app.post("/v1/admin/stores/:storeId/sync-jobs/:id/cancel", async (request, reply) => {
    if (!authorized(request)) return reply.code(401).send({ error: "Unauthorized" }); const params = z.object({ storeId: z.string(), id: z.string().uuid() }).safeParse(request.params); if (!params.success) return reply.code(400).send({ error: "Invalid job" });
    const { db, close } = createDatabase(); try { const job = await new SyncJobRepository(db).requestCancel(params.data.storeId, params.data.id); return job ? { job } : reply.code(404).send({ error: "Job not found" }); } finally { await close(); }
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
  app.delete("/v1/admin/stores/:storeId/conversations/:conversationId",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string(),conversationId:z.string().uuid()}).safeParse(request.params),body=z.object({confirmation:z.string()}).safeParse(request.body);if(!p.success||!body.success||body.data.confirmation!==p.data.conversationId)return reply.code(400).send({error:"Conversation id confirmation is required"});const{db,close}=createDatabase();try{const deleted=await new PrivacyRepository(db).removeConversation(p.data.storeId,p.data.conversationId,adminActor(request));return deleted?{deleted:true}:reply.code(404).send({error:"Conversation not found"})}finally{await close()}});
  app.delete("/v1/admin/stores/:storeId/conversations",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string()}).safeParse(request.params),body=z.object({confirmation:z.string()}).safeParse(request.body);if(!p.success||!body.success||body.data.confirmation!==`DELETE-${p.data.storeId}`)return reply.code(400).send({error:"Exact DELETE-store confirmation is required"});const{db,close}=createDatabase();try{return{deleted:await new PrivacyRepository(db).removeAll(p.data.storeId,adminActor(request))}}finally{await close()}});
  app.get("/v1/admin/stores/:storeId/conversations-export",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid store"});const{db,close}=createDatabase();try{const config=await new StoreConfigurationRepository(db).resolve(p.data.storeId);if(config?.privacy?.allowAdminExport===false)return reply.code(403).send({error:"Conversation export is disabled for this store"});const conversations=await new ConversationRepository(db).exportAll(p.data.storeId);await new PrivacyRepository(db).audit({storeId:p.data.storeId,actor:adminActor(request),action:"conversation.export",targetType:"store",targetId:p.data.storeId,metadata:{conversations:conversations.length}});reply.header("Content-Type","application/json; charset=utf-8").header("Content-Disposition",`attachment; filename="${p.data.storeId}-conversations.json"`);return JSON.stringify({storeId:p.data.storeId,exportedAt:new Date().toISOString(),conversations},null,2)}finally{await close()}});
  app.get("/v1/admin/stores/:storeId/privacy",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid store"});const{db,close}=createDatabase();try{const config=await new StoreConfigurationRepository(db).resolve(p.data.storeId),privacy=config?.privacy??{conversationHistoryEnabled:true,conversationRetentionDays:90,allowAdminExport:true};const repository=new PrivacyRepository(db);return{privacy,statistics:await repository.statistics(p.data.storeId,privacy.conversationRetentionDays),audit:await repository.auditLog(p.data.storeId,30)}}finally{await close()}});
  app.post("/v1/admin/stores/:storeId/privacy/purge",async(request,reply)=>{if(!authorized(request))return reply.code(401).send({error:"Unauthorized"});const p=z.object({storeId:z.string()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:"Invalid store"});const{db,close}=createDatabase();try{const config=await new StoreConfigurationRepository(db).resolve(p.data.storeId),days=config?.privacy?.conversationRetentionDays??90;return{deleted:await new PrivacyRepository(db).purgeExpired(p.data.storeId,days,adminActor(request))}}finally{await close()}});
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
      if(!storeConfig)return reply.code(404).send({error:"Store not found"});
      const limits:AiLimitConfig=storeConfig.aiLimits??defaultAiLimits;
      if(parsed.data.message.length>limits.maximumMessageCharacters)return reply.code(413).send({error:`Message exceeds ${limits.maximumMessageCharacters} characters`});
      const rate=requestLimiter.consume(`${parsed.data.storeId}:${request.ip}`,limits.requestsPerMinute);
      if(!rate.allowed){reply.header("Retry-After",String(rate.retryAfterSeconds));return reply.code(429).send({error:limits.limitMessage,retryAfterSeconds:rate.retryAfterSeconds});}
      const usage=new AiUsageRepository(db);
      const metered=async<T extends {model:string;inputTokens:number;outputTokens:number}>(kind:string,model:string,operation:()=>Promise<T>)=>{const reservation=await usage.reserve({storeId:parsed.data.storeId,requestId:request.id,kind,model,limits});if(!reservation.allowed)throw new Error(`AI_LIMIT_${reservation.reason}`);const started=Date.now();try{const result=await operation();await usage.complete(reservation.eventId,{inputTokens:result.inputTokens,outputTokens:result.outputTokens,latencyMs:Date.now()-started,limits});return result}catch(error){await usage.fail(reservation.eventId,error instanceof Error?error.name:"UnknownError",Date.now()-started);throw error}};
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
      const route = decideConversationRoute({ message, hasProductAction: Boolean(selectedAction), ...(parsed.data.selection?.key ? { selectionKey: parsed.data.selection.key } : {}), ...(currentState ? { state: currentState } : {}), ...(storeConfig?.conversationRouting ? { routing: storeConfig.conversationRouting } : {}), ...(retrievalConfig ? { knowledge: retrievalConfig } : {}) });
      const conversationIntent = route.intent;
      const productState=reusableProductState(currentState,route);
      if (conversationIntent === "contact_support" || conversationIntent === "unknown") {
        const configuredMessage = conversationIntent === "contact_support" ? storeConfig?.conversationRouting?.contactResponse : storeConfig?.conversationRouting?.unknownResponse;
        const defaultMessage = conversationIntent === "contact_support" ? "Nie mogę przyjąć danych kontaktowych ani zlecić kontaktu. Skorzystaj proszę z oficjalnego kanału kontaktowego sklepu." : "Nie rozumiem jeszcze tej wiadomości. Napisz proszę, czy szukasz produktu, czy informacji o sklepie.";
        return { message: configuredMessage ?? defaultMessage, state: { criteria: {}, intent: conversationIntent }, suggestions: [], products: [], meta: { intentSource: "deterministic" as const, conversationIntent, routingReason:route.reason, contextReused:route.contextReused, contextReset:route.contextReset } };
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
        const contextualTopics=route.detectedTopics.length?route.detectedTopics:currentState?.knowledgeTopics??[];
        const contextTerms=contextualTopics.flatMap(topic=>retrievalConfig?.topicAliases?.[topic]??[topic]);
        const retrievalQuery=route.reason==="contextual_follow_up"&&contextTerms.length?`${message} ${contextTerms.join(" ")}`:message;
        const results = searchKnowledge(chunks, retrievalQuery, 3, retrievalConfig);
        const answerGenerator=process.env.OPENAI_API_KEY&&storeConfig?.answerGeneration?.enabled!==false?new OpenAiGroundedAnswerGenerator():undefined;
        return buildKnowledgeConversationResponse({
          question: message, storeName: storeConfig?.name ?? parsed.data.storeId,
          routingReason:route.reason, contextReused:route.contextReused,knowledgeTopics:contextualTopics,
          results, ...(retrievalConfig ? { retrievalConfig } : {}),
          ...(storeConfig?.answerGeneration?.tone ? { tone: storeConfig.answerGeneration.tone } : {}),
          ...(answerGenerator ? { generator: { generate:(input:Parameters<typeof answerGenerator.generate>[0])=>metered("answer",answerGenerator.model,()=>answerGenerator.generate(input)) } } : {}),
        });
      }
      const products = await new SearchRepository(db).activeProducts(parsed.data.storeId);
      let extractedCriteria;
      let meta: { intentSource: "deterministic" | "openai" | "fallback"; model?: string; inputTokens?: number; outputTokens?: number; routingReason?:string;contextReused?:boolean;contextReset?:boolean } = { intentSource: "deterministic",routingReason:route.reason,contextReused:route.contextReused,contextReset:route.contextReset };
      if (process.env.OPENAI_API_KEY && message.trim() && !selection) {
        try {
          const extractor=new OpenAiIntentExtractor();
          const intent = await metered("intent",extractor.model,()=>extractor.extract(message));
          extractedCriteria = intent.criteria;
          meta = { intentSource: "openai", model: intent.model, inputTokens: intent.inputTokens, outputTokens: intent.outputTokens,routingReason:route.reason,contextReused:route.contextReused,contextReset:route.contextReset };
        } catch (error) {
          request.log.warn({ err: error }, "OpenAI intent extraction failed; using deterministic fallback");
          meta = { intentSource: "fallback",routingReason:route.reason,contextReused:route.contextReused,contextReset:route.contextReset };
        }
      }
      return buildConversationResponse({
        message,
        products,
        ...(productState ? { state: productState } : {}),
        ...(selection ? { selection } : {}),
        ...(extractedCriteria ? { extractedCriteria } : {}),
        meta,
        productActionsEnabled: Boolean(storeConfig?.productComparison),
        ...(storeConfig?.guidedSelling ? { guidedSelling: storeConfig.guidedSelling } : {}),
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
