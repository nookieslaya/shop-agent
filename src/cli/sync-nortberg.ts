import { nortbergConfig } from "../config/store.js";
import { createDatabase } from "../db/client.js";
import { ProductRepository, type SyncCounters } from "../db/product-repository.js";
import { fetchGoogleMerchantFeed } from "../importers/google-merchant.js";
import { decideProductSync, feedProductHash } from "../sync/change-detection.js";

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
    for (const feed of feedProducts) {
      const feedHash = feedProductHash(feed);
      const decision = decideProductSync(existing.get(feed.externalId), feedHash);

      try {
        if (decision.operation === "unchanged") {
          counters.productsUnchanged += 1;
          continue;
        }
        await repository.saveProduct({ storeId: nortbergConfig.id, feed, feedHash });
        if (decision.operation === "create") counters.productsCreated += 1;
        else counters.productsUpdated += 1;
      } catch (error) {
        counters.productsFailed += 1;
        console.error(`[${feed.externalId}]`, error instanceof Error ? error.message : error);
      }
    }

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
