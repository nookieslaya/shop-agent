import { createDatabase } from "../db/client.js";
import { executeSyncJob } from "../sync/services.js";

const mode = process.argv.includes("--force") ? "full" : process.argv.includes("--failed") ? "failed" : "incremental";
const limit = Number(process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1] ?? 0);
const { db, close } = createDatabase();
try {
  const result = await executeSyncJob(db, "nortberg", "enrichment", { mode, report: async () => undefined, cancelled: async () => false, ...(limit > 0 ? { limit } : {}) });
  console.log(JSON.stringify(result, null, 2)); if ((result as { failed?: number }).failed) process.exitCode = 1;
} finally { await close(); }
