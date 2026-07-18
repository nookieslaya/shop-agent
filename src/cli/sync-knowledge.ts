import { createDatabase } from "../db/client.js";
import { executeSyncJob } from "../sync/services.js";

const { db, close } = createDatabase();
try { const result = await executeSyncJob(db, "nortberg", "knowledge", { mode: "incremental", report: async () => undefined, cancelled: async () => false }); console.log(JSON.stringify(result, null, 2)); if ((result as { failed?: number }).failed) process.exitCode = 1; }
finally { await close(); }
