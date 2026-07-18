import { and, count, eq } from "drizzle-orm";
import { getBootstrapStoreConfig, storeConfigSchema, type StoreConfig } from "../config/store.js";
import type { Database } from "./client.js";
import { knowledgeChunks, knowledgeDocuments, products, stores } from "./schema.js";

export class StoreConfigurationRepository {
  constructor(private readonly db: Database) {}

  async find(storeId: string): Promise<StoreConfig | undefined> {
    const [row] = await this.db.select({ configuration: stores.configuration }).from(stores)
      .where(eq(stores.id, storeId)).limit(1);
    if (!row) return undefined;
    const parsed = storeConfigSchema.safeParse(row.configuration);
    if (!parsed.success) throw new Error(`Invalid stored configuration for ${storeId}: ${parsed.error.message}`);
    return parsed.data;
  }

  async list(): Promise<Array<{ id: string; name: string; domain: string; enabled: boolean; updatedAt: Date }>> {
    return this.db.select({ id: stores.id, name: stores.name, domain: stores.domain, enabled: stores.enabled, updatedAt: stores.updatedAt })
      .from(stores).orderBy(stores.name);
  }

  async overview(storeId: string): Promise<{
    products: number; enrichedProducts: number; failedProducts: number; documents: number; chunks: number;
  }> {
    const [[allProducts], [enriched], [failed], [documents], [chunks]] = await Promise.all([
      this.db.select({ value: count() }).from(products).where(and(eq(products.storeId, storeId), eq(products.isActive, true))),
      this.db.select({ value: count() }).from(products).where(and(eq(products.storeId, storeId), eq(products.isActive, true), eq(products.productPageStatus, "enriched"))),
      this.db.select({ value: count() }).from(products).where(and(eq(products.storeId, storeId), eq(products.isActive, true), eq(products.productPageStatus, "failed"))),
      this.db.select({ value: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.storeId, storeId)),
      this.db.select({ value: count() }).from(knowledgeChunks).innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
        .where(eq(knowledgeDocuments.storeId, storeId)),
    ]);
    return {
      products: allProducts?.value ?? 0,
      enrichedProducts: enriched?.value ?? 0,
      failedProducts: failed?.value ?? 0,
      documents: documents?.value ?? 0,
      chunks: chunks?.value ?? 0,
    };
  }

  async resolve(storeId: string): Promise<StoreConfig | undefined> {
    const stored = await this.find(storeId);
    const bootstrap = getBootstrapStoreConfig(storeId);
    if (!stored) return bootstrap;
    if (!bootstrap) return stored;
    const productComparison = stored.productComparison && bootstrap.productComparison ? {
      ...bootstrap.productComparison,
      ...stored.productComparison,
      similarityRules: { ...bootstrap.productComparison.similarityRules, ...stored.productComparison.similarityRules },
    } : stored.productComparison ?? bootstrap.productComparison;
    const knowledgeRetrieval = stored.knowledgeRetrieval && bootstrap.knowledgeRetrieval ? {
      ...bootstrap.knowledgeRetrieval, ...stored.knowledgeRetrieval,
      topicAliases: { ...bootstrap.knowledgeRetrieval.topicAliases, ...stored.knowledgeRetrieval.topicAliases },
      topicSuggestions: { ...bootstrap.knowledgeRetrieval.topicSuggestions, ...stored.knowledgeRetrieval.topicSuggestions },
    } : stored.knowledgeRetrieval ?? bootstrap.knowledgeRetrieval;
    return storeConfigSchema.parse({ ...bootstrap, ...stored, ...(knowledgeRetrieval ? { knowledgeRetrieval } : {}), ...(productComparison ? { productComparison } : {}) });
  }

  async update(config: StoreConfig): Promise<void> {
    const validated = storeConfigSchema.parse(config);
    const rows = await this.db.update(stores).set({ configuration: validated, updatedAt: new Date() })
      .where(eq(stores.id, validated.id)).returning({ id: stores.id });
    if (!rows.length) throw new Error(`Store does not exist: ${validated.id}`);
  }

  async create(config: StoreConfig): Promise<void> {
    const validated=storeConfigSchema.parse(config),domain=new URL(validated.feed.url).hostname;
    await this.db.insert(stores).values({id:validated.id,name:validated.name,domain,feedUrl:validated.feed.url,sourceType:validated.feed.type,configuration:validated,enabled:true});
  }
}
