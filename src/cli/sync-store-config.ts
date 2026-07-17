import { getBootstrapStoreConfig } from "../config/store.js";
import { createDatabase } from "../db/client.js";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";

const storeId = process.argv.find((argument) => argument.startsWith("--store="))?.split("=")[1] ?? "nortberg";
const config = getBootstrapStoreConfig(storeId);
if (!config) throw new Error(`No bootstrap configuration registered for store: ${storeId}`);
const { db, close } = createDatabase();
try {
  await new StoreConfigurationRepository(db).update(config);
  console.log(JSON.stringify({ storeId, status: "updated", source: "bootstrap" }, null, 2));
} finally {
  await close();
}
