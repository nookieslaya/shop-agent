import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { FeedProduct, HoodAttributes, TechnicalRow } from "../domain/product.js";
import type { ExistingProductState } from "../sync/change-detection.js";
import type { Database } from "./client.js";
import { productAttributeSources, products, productSources, stores, syncRuns } from "./schema.js";

export interface SyncCounters {
  productsFound: number;
  productsCreated: number;
  productsUpdated: number;
  productsUnchanged: number;
  productsFailed: number;
}

export class ProductRepository {
  constructor(private readonly db: Database) {}

  async upsertStore(input: { id: string; name: string; domain: string; feedUrl: string; configuration: Record<string, unknown> }) {
    await this.db.insert(stores).values({ ...input, sourceType: "google_xml" }).onConflictDoUpdate({
      target: stores.id,
      // Runtime synchronisation must never overwrite settings edited through the admin API.
      set: { name: input.name, domain: input.domain, feedUrl: input.feedUrl, updatedAt: new Date() },
    });
  }

  async existingProducts(storeId: string): Promise<Map<string, ExistingProductState>> {
    const rows = await this.db.select({
      id: products.id,
      externalId: products.externalId,
      feedHash: products.feedHash,
      productPageStatus: products.productPageStatus,
      productPageCheckedAt: products.productPageCheckedAt,
    }).from(products).where(eq(products.storeId, storeId));
    return new Map(rows.map((row) => [row.externalId, row]));
  }

  async recordProductPageFailure(productId: string, error: string, terminal: boolean): Promise<void> {
    await this.db.update(products).set({
      productPageStatus: terminal ? "failed" : "pending",
      productPageError: error,
      productPageAttemptedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(products.id, productId));
  }

  async startSync(storeId: string): Promise<string> {
    const [row] = await this.db.insert(syncRuns).values({ storeId }).returning({ id: syncRuns.id });
    if (!row) throw new Error("Could not create sync run");
    return row.id;
  }

  async finishSync(id: string, counters: SyncCounters, error?: string) {
    await this.db.update(syncRuns).set({
      ...counters,
      status: error ? "failed" : "completed",
      error: error ?? null,
      finishedAt: new Date(),
    }).where(eq(syncRuns.id, id));
  }

  async saveProduct(input: {
    storeId: string;
    feed: FeedProduct;
    feedHash: string;
    attributes?: HoodAttributes;
    technicalRows?: TechnicalRow[];
    productPageHash?: string;
    dataQualityScore?: number;
  }): Promise<string> {
    const { feed } = input;
    const baseValues = {
      storeId: input.storeId,
      externalId: feed.externalId,
      title: feed.title,
      category: feed.category ?? null,
      brand: feed.brand ?? null,
      descriptionText: feed.descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      priceMinor: Math.round(feed.price * 100),
      salePriceMinor: feed.salePrice === undefined ? null : Math.round(feed.salePrice * 100),
      currency: feed.currency,
      availability: feed.availability,
      productUrl: feed.productUrl,
      imageUrl: feed.imageUrl,
      feedHash: input.feedHash,
      isActive: true,
      updatedAt: new Date(),
    };
    const enrichmentValues = input.attributes ? {
      attributes: input.attributes as Record<string, unknown>,
      dataQualityScore: input.dataQualityScore ?? 0,
      productPageHash: input.productPageHash ?? null,
      productPageStatus: "enriched" as const,
      productPageError: null,
      productPageAttemptedAt: new Date(),
      productPageCheckedAt: new Date(),
    } : {};

    const [saved] = await this.db.insert(products).values({ ...baseValues, ...enrichmentValues }).onConflictDoUpdate({
      target: [products.storeId, products.externalId],
      set: { ...baseValues, ...enrichmentValues },
    }).returning({ id: products.id });
    if (!saved) throw new Error(`Could not save product ${feed.externalId}`);

    await this.db.delete(productSources).where(and(eq(productSources.productId, saved.id), eq(productSources.type, "feed")));
    await this.db.insert(productSources).values({
      productId: saved.id,
      type: "feed",
      sourceUrl: feed.productUrl,
      rawData: feed.raw,
      contentHash: input.feedHash,
    });

    if (input.attributes && input.technicalRows) {
      await this.db.delete(productSources).where(and(eq(productSources.productId, saved.id), eq(productSources.type, "product_page")));
      await this.db.delete(productAttributeSources).where(eq(productAttributeSources.productId, saved.id));
      await this.db.insert(productSources).values({
        productId: saved.id,
        type: "product_page",
        sourceUrl: feed.productUrl,
        rawData: { technicalRows: input.technicalRows },
        contentHash: input.productPageHash ?? input.feedHash,
      });
      const attributeRows = Object.entries(input.attributes).flatMap(([attributeKey, attribute]) => attribute ? [{
        productId: saved.id,
        attributeKey,
        value: attribute.value,
        type: attribute.source,
        confidence: attribute.confidence,
        rawValue: attribute.rawValue ?? null,
      }] : []);
      if (attributeRows.length) await this.db.insert(productAttributeSources).values(attributeRows);
    }
    return saved.id;
  }

  async deactivateMissing(storeId: string, activeExternalIds: string[]) {
    if (!activeExternalIds.length) return;
    await this.db.update(products).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(products.storeId, storeId), notInArray(products.externalId, activeExternalIds)));
    await this.db.update(products).set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(products.storeId, storeId), inArray(products.externalId, activeExternalIds)));
  }
}
