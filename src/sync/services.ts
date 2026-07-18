import pLimit from "p-limit";
import type { StoreConfig } from "../config/store.js";
import type { Database } from "../db/client.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { ProductRepository, type SyncCounters } from "../db/product-repository.js";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";
import { fetchGoogleMerchantFeed } from "../importers/google-merchant.js";
import { loadKnowledgeSource } from "../knowledge/source-loader.js";
import { normalizeHoodAttributes } from "../normalizers/hood.js";
import { qualityScore } from "../reporting/quality-report.js";
import { scrapeTechnicalRows } from "../scrapers/product-page.js";
import { contentHash, decideProductSync, feedProductHash, needsProductPageEnrichment } from "./change-detection.js";
import type { SyncJobMode, SyncJobType } from "../db/sync-job-repository.js";

export class SyncCancelledError extends Error {}
export type ProgressReporter = (progress: number, message: string) => Promise<void>;
export interface SyncExecutionOptions { mode: SyncJobMode; report: ProgressReporter; cancelled: () => Promise<boolean>; limit?: number }

const assertActive = async (cancelled: () => Promise<boolean>) => { if (await cancelled()) throw new SyncCancelledError("Synchronization cancelled"); };
const domain = (config: StoreConfig) => new URL(config.feed.url).hostname;

export async function executeSyncJob(db: Database, storeId: string, type: SyncJobType, options: SyncExecutionOptions) {
  const config = await new StoreConfigurationRepository(db).resolve(storeId);
  if (!config) throw new Error(`Store configuration not found: ${storeId}`);
  const products = new ProductRepository(db);
  await products.upsertStore({ id: config.id, name: config.name, domain: domain(config), feedUrl: config.feed.url, configuration: config });
  if (type === "feed") return syncFeed(db, config, options);
  if (type === "enrichment") return enrichProducts(db, config, options);
  if (type === "knowledge") return syncKnowledge(db, config, options);
  await options.report(1, "Synchronizacja katalogu");
  const feed = await syncFeed(db, config, scaled(options, 0, 30));
  await assertActive(options.cancelled);
  const enrichment = await enrichProducts(db, config, scaled(options, 30, 88));
  await assertActive(options.cancelled);
  const knowledge = await syncKnowledge(db, config, scaled(options, 88, 100));
  return { feed, enrichment, knowledge };
}

const scaled = (options: SyncExecutionOptions, from: number, to: number): SyncExecutionOptions => ({ ...options, report: (progress, message) => options.report(from + progress / 100 * (to - from), message) });

export async function syncFeed(db: Database, config: StoreConfig, options: SyncExecutionOptions) {
  const repository = new ProductRepository(db); const counters: SyncCounters = { productsFound: 0, productsCreated: 0, productsUpdated: 0, productsUnchanged: 0, productsFailed: 0 };
  const runId = await repository.startSync(config.id);
  try {
    await options.report(2, "Pobieranie feedu"); const feedProducts = await fetchGoogleMerchantFeed(config.feed.url);
    if (!feedProducts.length) throw new Error("Feed returned no products; catalog deactivation was stopped");
    counters.productsFound = feedProducts.length; const existing = await repository.existingProducts(config.id); const force = options.mode === "full";
    for (let index = 0; index < feedProducts.length; index++) {
      await assertActive(options.cancelled); const feed = feedProducts[index]!; const hash = feedProductHash(feed); const decision = decideProductSync(existing.get(feed.externalId), hash);
      try { if (!force && decision.operation === "unchanged") counters.productsUnchanged++; else { await repository.saveProduct({ storeId: config.id, feed, feedHash: hash }); if (decision.operation === "create") counters.productsCreated++; else counters.productsUpdated++; } }
      catch { counters.productsFailed++; }
      if (index % 10 === 0 || index === feedProducts.length - 1) await options.report(5 + ((index + 1) / feedProducts.length) * 90, `Katalog: ${index + 1}/${feedProducts.length}`);
    }
    await repository.deactivateMissing(config.id, feedProducts.map((item) => item.externalId));
    await repository.finishSync(runId, counters, counters.productsFailed ? `${counters.productsFailed} products failed` : undefined);
    await options.report(100, "Katalog zsynchronizowany"); return counters;
  } catch (error) { await repository.finishSync(runId, counters, error instanceof Error ? error.message : String(error)); throw error; }
}

export async function enrichProducts(db: Database, config: StoreConfig, options: SyncExecutionOptions) {
  const repository = new ProductRepository(db); const result = { productsFound: 0, pending: 0, enriched: 0, failed: 0, skipped: 0 };
  await options.report(2, "Przygotowanie wzbogacania"); const [feedProducts, existing] = await Promise.all([fetchGoogleMerchantFeed(config.feed.url), repository.existingProducts(config.id)]); result.productsFound = feedProducts.length;
  const force = options.mode === "full"; const failedOnly = options.mode === "failed";
  const allPending = feedProducts.filter((item) => failedOnly ? existing.get(item.externalId)?.productPageStatus === "failed" : needsProductPageEnrichment(existing.get(item.externalId), force)); const pending = options.limit && options.limit > 0 ? allPending.slice(0, options.limit) : allPending; result.pending = allPending.length; result.skipped = feedProducts.length - allPending.length;
  const concurrency = Math.max(1, Number(process.env.SCRAPE_CONCURRENCY ?? 2)); const delay = Math.max(0, Number(process.env.REQUEST_DELAY_MS ?? 400)); const limiter = pLimit(concurrency); let processed = 0;
  await Promise.all(pending.map((feed, index) => limiter(async () => { await assertActive(options.cancelled); if (index > 0 && delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try { const rows = await scrapeTechnicalRows(feed.productUrl, config.productPage.specificationRowSelector); const attributes = normalizeHoodAttributes(feed, rows); await repository.saveProduct({ storeId: config.id, feed, feedHash: feedProductHash(feed), attributes, technicalRows: rows, productPageHash: contentHash(rows), dataQualityScore: qualityScore(attributes) }); result.enriched++; }
    catch (error) { result.failed++; const current = existing.get(feed.externalId); if (current) await repository.recordProductPageFailure(current.id, error instanceof Error ? error.message : String(error), /\b(?:404|410)\b/.test(String(error))); }
    processed++; await options.report(pending.length ? processed / pending.length * 100 : 100, `Dane techniczne: ${processed}/${pending.length}`);
  })));
  return { ...result, processed };
}

export async function syncKnowledge(db: Database, config: StoreConfig, options: SyncExecutionOptions) {
  const repository = new KnowledgeRepository(db); const result = { sourcesFound: config.knowledgeSources.length, createdOrUpdated: 0, unchanged: 0, failed: 0, chunks: 0 };
  for (let index = 0; index < config.knowledgeSources.length; index++) { await assertActive(options.cancelled); const source = config.knowledgeSources[index]!;
    try { const loaded = await loadKnowledgeSource(source); if (await repository.contentHash(config.id, source.url) === loaded.contentHash) result.unchanged++; else { await repository.save({ storeId: config.id, sourceUrl: source.url, sourceType: source.type, topic: source.topic, ...loaded }); result.createdOrUpdated++; result.chunks += loaded.chunks.length; } } catch { result.failed++; }
    await options.report(config.knowledgeSources.length ? (index + 1) / config.knowledgeSources.length * 100 : 100, `Źródła wiedzy: ${index + 1}/${config.knowledgeSources.length}`);
  }
  return result;
}
