import { mkdir, writeFile } from "node:fs/promises";
import pLimit from "p-limit";
import { nortbergConfig } from "../config/store.js";
import type { EnrichedProduct } from "../domain/product.js";
import { fetchGoogleMerchantFeed } from "../importers/google-merchant.js";
import { normalizeHoodAttributes } from "../normalizers/hood.js";
import { buildEnrichmentSummary, buildFeedSummary, qualityScore } from "../reporting/quality-report.js";
import { scrapeTechnicalRows } from "../scrapers/product-page.js";

const limitValue = Number(process.env.SCRAPE_LIMIT ?? 5);
const concurrency = Number(process.env.SCRAPE_CONCURRENCY ?? 2);
const delayMs = Number(process.env.REQUEST_DELAY_MS ?? 400);

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  console.log(`Downloading feed: ${nortbergConfig.feed.url}`);
  const feedProducts = await fetchGoogleMerchantFeed(nortbergConfig.feed.url);
  console.log(`Parsed ${feedProducts.length} products`);

  const selected = feedProducts.slice(0, Math.min(limitValue, feedProducts.length));
  const limiter = pLimit(concurrency);
  const enriched = await Promise.all(selected.map((feed, index) => limiter(async (): Promise<EnrichedProduct> => {
    if (index > 0) await sleep(delayMs);
    try {
      const technicalRows = await scrapeTechnicalRows(feed.productUrl, nortbergConfig.productPage.specificationRowSelector);
      const attributes = normalizeHoodAttributes(feed, technicalRows);
      console.log(`[${index + 1}/${selected.length}] ${feed.externalId}: ${technicalRows.length} technical rows`);
      return {
        feed,
        technicalRows,
        attributes,
        warnings: technicalRows.length ? [] : ["No technical specification table found"],
        dataQualityScore: qualityScore(attributes),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${index + 1}/${selected.length}] ${feed.externalId}: ${message}`);
      return { feed, technicalRows: [], attributes: {}, warnings: [message], dataQualityScore: 0 };
    }
  })));

  const report = {
    generatedAt: new Date().toISOString(),
    store: { id: nortbergConfig.id, name: nortbergConfig.name },
    feed: buildFeedSummary(feedProducts),
    enrichment: buildEnrichmentSummary(enriched),
  };

  await mkdir("reports", { recursive: true });
  await writeFile("reports/nortberg-audit.json", JSON.stringify(report, null, 2));
  console.log("Saved reports/nortberg-audit.json");
}

await main();
