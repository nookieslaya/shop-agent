import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const sourceType = pgEnum("source_type", ["feed", "product_page", "woocommerce", "description", "ai", "manual"]);
export const syncStatus = pgEnum("sync_status", ["running", "completed", "failed"]);
export const knowledgeSourceType = pgEnum("knowledge_source_type", ["html", "pdf"]);

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
  knowledgeDocuments: many(knowledgeDocuments),
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
