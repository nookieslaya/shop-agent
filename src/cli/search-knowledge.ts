import { createDatabase } from "../db/client.js";
import { KnowledgeRepository } from "../db/knowledge-repository.js";
import { searchKnowledge } from "../knowledge/search.js";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...parts] = argument.replace(/^--/, "").split("=");
  return [key, parts.join("=")];
}));
const query = args.query?.trim();
if (!query) throw new Error('Podaj pytanie, np. --query="jak przedłużyć gwarancję?"');
const storeId = args.store ?? "nortberg";
const limit = Number(args.limit ?? 5);
const { db, close } = createDatabase();
try {
  const chunks = await new KnowledgeRepository(db).searchableChunks(storeId);
  const config = await new StoreConfigurationRepository(db).resolve(storeId);
  console.log(JSON.stringify({ storeId, query, chunksSearched: chunks.length, results: searchKnowledge(chunks, query, limit, config?.knowledgeRetrieval) }, null, 2));
} finally {
  await close();
}
