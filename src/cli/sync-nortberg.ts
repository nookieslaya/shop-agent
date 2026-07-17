import pLimit from "p-limit";
import { nortbergConfig } from "../config/store.js";
import { createDatabase } from "../db/client.js";
import { ProductRepository, type SyncCounters } from "../db/product-repository.js";
import { fetchGoogleMerchantFeed } from "../importers/google-merchant.js";
import { normalizeHoodAttributes } from "../normalizers/hood.js";
import { qualityScore } from "../reporting/quality-report.js";
import { scrapeTechnicalRows } from "../scrapers/product-page.js";
import { contentHash, decideProductSync, feedProductHash } from "../sync/change-detection.js";

const concurrency = Number(process.env.SCRAPE_CONCURRENCY ?? 2);
const scrapeLimit = Number(process.env.SCRAPE_LIMIT ?? 5);
const delayMs = Number(process.env.REQUEST_DELAY_MS ?? 400);
const pageTtlMs = Number(process.env.PRODUCT_PAGE_TTL_HOURS ?? 168) * 60 * 60 * 1000;
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const { db, close } = createDatabase();
  const repository = new ProductRepository(db);
  const counters: SyncCounters = {
    productsFound: 0, productsCreated: 0, productsUpdated: 0, productsUnchanged: 0, productsFailed: 0,
  };
  let syncRunId: string | undefined;

  try {
    await repository.upsertStore({
      id: nortbergConfig.id,
      name: nortbergConfig.name,
      domain: "nortberg.pl",
      feedUrl: nortbergConfig.feed.url,
      configuration: nortbergConfig,
    });
    syncRunId = await repository.startSync(nortbergConfig.id);
    const feedProducts = await fetchGoogleMerchantFeed(nortbergConfig.feed.url);
    counters.productsFound = feedProducts.length;
    const existing = await repository.existingProducts(nortbergConfig.id);
    const now = new Date();
    let scheduledPageRefreshes = 0;
    const limiter = pLimit(concurrency);

    await Promise.all(feedProducts.map((feed, index) => limiter(async () => {
      const feedHash = feedProductHash(feed);
      const decision = decideProductSync(existing.get(feed.externalId), feedHash, now, pageTtlMs);
      const refreshPage = decision.refreshProductPage && scheduledPageRefreshes < scrapeLimit;
      if (refreshPage) scheduledPageRefreshes += 1;

      try {
        if (decision.operation === "unchanged" && !refreshPage) {
          counters.productsUnchanged += 1;
          return;
        }
        if (refreshPage) {
          if (index > 0) await sleep(delayMs);
          const technicalRows = await scrapeTechnicalRows(feed.productUrl, nortbergConfig.productPage.specificationRowSelector);
          const attributes = normalizeHoodAttributes(feed, technicalRows);
          await repository.saveProduct({
            storeId: nortbergConfig.id,
            feed,
            feedHash,
            attributes,
            technicalRows,
            productPageHash: contentHash(technicalRows),
            dataQualityScore: qualityScore(attributes),
          });
        } else {
          await repository.saveProduct({ storeId: nortbergConfig.id, feed, feedHash });
        }
        if (decision.operation === "create") counters.productsCreated += 1;
        else if (decision.operation === "update") counters.productsUpdated += 1;
        else counters.productsUnchanged += 1;
      } catch (error) {
        counters.productsFailed += 1;
        console.error(`[${feed.externalId}]`, error instanceof Error ? error.message : error);
        try {
          await repository.saveProduct({ storeId: nortbergConfig.id, feed, feedHash });
          if (decision.operation === "create") counters.productsCreated += 1;
          else if (decision.operation === "update") counters.productsUpdated += 1;
          else counters.productsUnchanged += 1;
        } catch (databaseError) {
          console.error(`[${feed.externalId}] fallback save failed`, databaseError instanceof Error ? databaseError.message : databaseError);
        }
      }
    })));

    await repository.deactivateMissing(nortbergConfig.id, feedProducts.map((product) => product.externalId));
    await repository.finishSync(syncRunId, counters);
    console.log(JSON.stringify(counters, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (syncRunId) await repository.finishSync(syncRunId, counters, message);
    throw error;
  } finally {
    await close();
  }
}

await main();
