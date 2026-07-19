import { createDatabase } from "../db/client.js";
import { SyncJobRepository } from "../db/sync-job-repository.js";
import { executeSyncJob, SyncCancelledError } from "../sync/services.js";
import { RuntimeRepository } from "../observability/usage.js";
import os from "node:os";
import { StoreConfigurationRepository } from "../db/store-configuration-repository.js";
import { PrivacyRepository } from "../privacy/privacy-repository.js";
import { AdminIdentityRepository } from "../security/admin-identity.js";
import { RequestMetricsRepository } from "../observability/request-metrics.js";

const pollMs = Math.max(500, Number(process.env.SYNC_WORKER_POLL_MS ?? 2_000));
let stopping = false;
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const { db, close } = createDatabase(); const jobs = new SyncJobRepository(db); const runtime=new RuntimeRepository(db);const instanceId=`${os.hostname()}:${process.pid}`;
await jobs.recoverStale(Number(process.env.SYNC_STALE_MINUTES ?? 5));
let lastScheduleCheck = 0;
let lastHeartbeat=0;
let lastPrivacyCleanup=0;

try {
  while (!stopping) {
    if(Date.now()-lastHeartbeat>10_000){await runtime.heartbeat("sync-worker",instanceId,{pollMs});lastHeartbeat=Date.now();}
    if(Date.now()-lastPrivacyCleanup>3_600_000){const stores=new StoreConfigurationRepository(db);for(const store of await stores.list()){const config=await stores.resolve(store.id);if(config){await new PrivacyRepository(db).purgeExpired(store.id,config.privacy?.conversationRetentionDays??90);await new RequestMetricsRepository(db).purge(store.id,config.observability?.retentionDays??30)}}await new AdminIdentityRepository(db).cleanup();lastPrivacyCleanup=Date.now();}
    if (Date.now() - lastScheduleCheck > 60_000) { await jobs.enqueueDueSchedules(); lastScheduleCheck = Date.now(); }
    const job = await jobs.claim(); if (!job) { await sleep(pollMs); continue; }
    try {
      const result = await executeSyncJob(db, job.storeId, job.type, { mode: job.mode, report: (progress, message) => jobs.progress(job.id, progress, message), cancelled: () => jobs.cancelled(job.id) });
      await jobs.complete(job.id, result as Record<string, unknown>);
    } catch (error) {
      if (error instanceof SyncCancelledError) await jobs.finishCancelled(job.id);
      else await jobs.fail(job, error instanceof Error ? error.message : String(error));
    }
  }
} finally { await close(); }
