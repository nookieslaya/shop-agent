import pLimit from "p-limit";
import { nortbergConfig } from "../config/store.js";
import { createDatabase } from "../db/client.js";
import { ProductRepository } from "../db/product-repository.js";
import { fetchGoogleMerchantFeed } from "../importers/google-merchant.js";
import { normalizeHoodAttributes } from "../normalizers/hood.js";
import { qualityScore } from "../reporting/quality-report.js";
import { scrapeTechnicalRows } from "../scrapers/product-page.js";
import { contentHash, feedProductHash, needsProductPageEnrichment } from "../sync/change-detection.js";

const force = process.argv.includes("--force");
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const configuredLimit = Number(limitArgument?.split("=")[1] ?? process.env.ENRICH_LIMIT ?? 0);
const concurrency = Number(process.env.SCRAPE_CONCURRENCY ?? 2);
const delayMs = Number(process.env.REQUEST_DELAY_MS ?? 400);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const { db, close } = createDatabase();
  const repository = new ProductRepository(db);
  const result = { productsFound: 0, pending: 0, enriched: 0, failed: 0, skipped: 0, force };

  try {
    const [feedProducts, existing] = await Promise.all([
      fetchGoogleMerchantFeed(nortbergConfig.feed.url),
      repository.existingProducts(nortbergConfig.id),
    ]);
    result.productsFound = feedProducts.length;

    const pending = feedProducts.filter((product) => needsProductPageEnrichment(existing.get(product.externalId), force));
    result.pending = pending.length;
    result.skipped = feedProducts.length - pending.length;
    const selected = configuredLimit > 0 ? pending.slice(0, configuredLimit) : pending;
    const limiter = pLimit(concurrency);

    await Promise.all(selected.map((feed, index) => limiter(async () => {
      try {
        if (index > 0) await sleep(delayMs);
        const technicalRows = await scrapeTechnicalRows(feed.productUrl, nortbergConfig.productPage.specificationRowSelector);
        const attributes = normalizeHoodAttributes(feed, technicalRows);
        await repository.saveProduct({
          storeId: nortbergConfig.id,
          feed,
          feedHash: feedProductHash(feed),
          attributes,
          technicalRows,
          productPageHash: contentHash(technicalRows),
          dataQualityScore: qualityScore(attributes),
        });
        result.enriched += 1;
      } catch (error) {
        result.failed += 1;
        console.error(`[${feed.externalId}]`, error instanceof Error ? error.message : error);
      }
    })));

    console.log(JSON.stringify({ ...result, processed: selected.length }, null, 2));
    if (result.failed) process.exitCode = 1;
  } finally {
    await close();
  }
}

await main();
