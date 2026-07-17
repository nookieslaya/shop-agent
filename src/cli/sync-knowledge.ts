import { nortbergConfig } from "../config/store.js";
import { createDatabase } from "../db/client.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { ProductRepository } from "../db/product-repository.js";
import { loadKnowledgeSource } from "../knowledge/source-loader.js";

async function main() {
  const { db, close } = createDatabase();
  const products = new ProductRepository(db);
  const knowledge = new KnowledgeRepository(db);
  const result = { sourcesFound: nortbergConfig.knowledgeSources.length, createdOrUpdated: 0, unchanged: 0, failed: 0, chunks: 0 };

  try {
    await products.upsertStore({
      id: nortbergConfig.id,
      name: nortbergConfig.name,
      domain: "nortberg.pl",
      feedUrl: nortbergConfig.feed.url,
      configuration: nortbergConfig,
    });

    for (const source of nortbergConfig.knowledgeSources) {
      try {
        const loaded = await loadKnowledgeSource(source);
        const previousHash = await knowledge.contentHash(nortbergConfig.id, source.url);
        if (previousHash === loaded.contentHash) {
          result.unchanged += 1;
          continue;
        }
        await knowledge.save({
          storeId: nortbergConfig.id,
          sourceUrl: source.url,
          sourceType: source.type,
          topic: source.topic,
          ...loaded,
        });
        result.createdOrUpdated += 1;
        result.chunks += loaded.chunks.length;
      } catch (error) {
        result.failed += 1;
        console.error(`[${source.topic}]`, error instanceof Error ? error.message : error);
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
  } finally {
    await close();
  }
}

await main();
