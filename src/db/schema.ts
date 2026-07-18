import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const sourceType = pgEnum("source_type", ["feed", "product_page", "woocommerce", "description", "ai", "manual"]);
export const syncStatus = pgEnum("sync_status", ["running", "completed", "failed"]);
export const knowledgeSourceType = pgEnum("knowledge_source_type", ["html", "pdf"]);
export const productPageStatus = pgEnum("product_page_status", ["pending", "enriched", "failed"]);
export const conversationRole = pgEnum("conversation_role", ["user", "assistant"]);
export const syncJobType = pgEnum("sync_job_type", ["feed", "enrichment", "knowledge", "full"]);
export const syncJobMode = pgEnum("sync_job_mode", ["incremental", "full", "failed"]);
export const syncJobStatus = pgEnum("sync_job_status", ["queued", "running", "completed", "failed", "cancelled"]);

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  feedUrl: text("feed_url"),
  sourceType: text("source_type").notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  category: text("category"),
  brand: text("brand"),
  descriptionText: text("description_text").notNull().default(""),
  priceMinor: integer("price_minor").notNull(),
  salePriceMinor: integer("sale_price_minor"),
  currency: text("currency").notNull(),
  availability: text("availability").notNull(),
  productUrl: text("product_url").notNull(),
  imageUrl: text("image_url").notNull(),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  dataQualityScore: integer("data_quality_score").notNull().default(0),
  feedHash: text("feed_hash").notNull(),
  productPageHash: text("product_page_hash"),
  productPageStatus: productPageStatus("product_page_status").notNull().default("pending"),
  productPageError: text("product_page_error"),
  productPageAttemptedAt: timestamp("product_page_attempted_at", { withTimezone: true }),
  productPageCheckedAt: timestamp("product_page_checked_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("products_store_external_id_uidx").on(table.storeId, table.externalId),
  index("products_store_category_idx").on(table.storeId, table.category),
  index("products_store_active_idx").on(table.storeId, table.isActive),
]);

export const productSources = pgTable("product_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  type: sourceType("type").notNull(),
  sourceUrl: text("source_url"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull(),
  contentHash: text("content_hash").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("product_sources_product_idx").on(table.productId)]);

export const productAttributeSources = pgTable("product_attribute_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  attributeKey: text("attribute_key").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  type: sourceType("type").notNull(),
  confidence: real("confidence").notNull(),
  rawValue: text("raw_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("attribute_sources_product_key_idx").on(table.productId, table.attributeKey)]);

export const manualOverrides = pgTable("manual_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  attributeKey: text("attribute_key").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("manual_overrides_product_key_uidx").on(table.productId, table.attributeKey)]);

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  status: syncStatus("status").notNull().default("running"),
  productsFound: integer("products_found").notNull().default(0),
  productsCreated: integer("products_created").notNull().default(0),
  productsUpdated: integer("products_updated").notNull().default(0),
  productsUnchanged: integer("products_unchanged").notNull().default(0),
  productsFailed: integer("products_failed").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  type: syncJobType("type").notNull(), mode: syncJobMode("mode").notNull().default("incremental"),
  status: syncJobStatus("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0), message: text("message").notNull().default("Oczekuje w kolejce"),
  result: jsonb("result").$type<Record<string, unknown>>(), error: text("error"),
  attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(3),
  retryOf: uuid("retry_of"), scheduled: boolean("scheduled").notNull().default(false),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  lockToken: uuid("lock_token"), lockedAt: timestamp("locked_at", { withTimezone: true }), heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }), finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sync_jobs_store_created_idx").on(table.storeId, table.createdAt), index("sync_jobs_claim_idx").on(table.status, table.scheduledFor)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  messageCount: integer("message_count").notNull().default(0),
  flags: jsonb("flags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("conversations_store_last_message_idx").on(table.storeId, table.lastMessageAt)]);

export const conversationMessages = pgTable("conversation_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: conversationRole("role").notNull(),
  content: text("content").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("conversation_messages_conversation_idx").on(table.conversationId, table.createdAt)]);

export const qualityScenarios = pgTable("quality_scenarios", {
  id: uuid("id").primaryKey().defaultRandom(), storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(), message: text("message").notNull(), expectations: jsonb("expectations").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("quality_scenarios_store_idx").on(table.storeId)]);

export const qualityScenarioRuns = pgTable("quality_scenario_runs", {
  id: uuid("id").primaryKey().defaultRandom(), scenarioId: uuid("scenario_id").notNull().references(() => qualityScenarios.id, { onDelete: "cascade" }),
  passed: boolean("passed").notNull(), failures: jsonb("failures").$type<string[]>().notNull(), response: jsonb("response").$type<Record<string, unknown>>().notNull(),
  inputTokens: integer("input_tokens").notNull().default(0), outputTokens: integer("output_tokens").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("quality_scenario_runs_scenario_idx").on(table.scenarioId, table.createdAt)]);

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  sourceType: knowledgeSourceType("source_type").notNull(),
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("knowledge_documents_store_url_uidx").on(table.storeId, table.sourceUrl),
  index("knowledge_documents_store_topic_idx").on(table.storeId, table.topic),
]);

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  heading: text("heading"),
  content: text("content").notNull(),
  characterCount: integer("character_count").notNull(),
  tokenEstimate: integer("token_estimate").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("knowledge_chunks_document_index_uidx").on(table.documentId, table.chunkIndex),
  index("knowledge_chunks_document_idx").on(table.documentId),
]);

export const storesRelations = relations(stores, ({ many }) => ({
  products: many(products),
  syncRuns: many(syncRuns),
  syncJobs: many(syncJobs),
  knowledgeDocuments: many(knowledgeDocuments),
  conversations: many(conversations),
  qualityScenarios: many(qualityScenarios),
}));
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  store: one(stores, { fields: [conversations.storeId], references: [stores.id] }),
  messages: many(conversationMessages),
}));
export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationMessages.conversationId], references: [conversations.id] }),
}));
export const productsRelations = relations(products, ({ one, many }) => ({
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
  sources: many(productSources),
  attributeSources: many(productAttributeSources),
  manualOverrides: many(manualOverrides),
}));
export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one, many }) => ({
  store: one(stores, { fields: [knowledgeDocuments.storeId], references: [stores.id] }),
  chunks: many(knowledgeChunks),
}));
export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  document: one(knowledgeDocuments, { fields: [knowledgeChunks.documentId], references: [knowledgeDocuments.id] }),
}));
