import { createDatabase } from "../db/client.js";
import { executeSyncJob } from "../sync/services.js";

const { db, close } = createDatabase();
try { console.log(JSON.stringify(await executeSyncJob(db, "nortberg", "feed", { mode: process.argv.includes("--force") ? "full" : "incremental", report: async () => undefined, cancelled: async () => false }), null, 2)); }
finally { await close(); }
