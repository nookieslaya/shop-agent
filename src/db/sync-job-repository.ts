import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { stores, syncJobs } from "./schema.js";
import { retryDelayMs, scheduleDue } from "../sync/job-policy.js";

export type SyncJobType = "feed" | "enrichment" | "knowledge" | "full";
export type SyncJobMode = "incremental" | "full" | "failed";
export type SyncJob = typeof syncJobs.$inferSelect;

export class SyncJobRepository {
  constructor(private readonly db: Database) {}

  async list(storeId: string, limit = 30) { return this.db.select().from(syncJobs).where(eq(syncJobs.storeId, storeId)).orderBy(desc(syncJobs.createdAt)).limit(limit); }

  async enqueue(input: { storeId: string; type: SyncJobType; mode: SyncJobMode; scheduled?: boolean; retryOf?: string }) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.storeId}:${input.type}`}))`);
      const [active] = await tx.select().from(syncJobs).where(and(eq(syncJobs.storeId, input.storeId), inArray(syncJobs.status, ["queued", "running"]), or(eq(syncJobs.type, input.type), eq(syncJobs.type, "full"), ...(input.type === "full" ? [sql`true`] : [])))).limit(1);
      if (active) return { job: active, created: false };
      const [job] = await tx.insert(syncJobs).values({ ...input, scheduled: input.scheduled ?? false }).returning();
      if (!job) throw new Error("Could not enqueue synchronization job");
      return { job, created: true };
    });
  }

  async claim(): Promise<SyncJob | undefined> {
    const token = crypto.randomUUID();
    const rows = await this.db.execute(sql`with candidate as (
      select candidate.id from sync_jobs candidate where candidate.status = 'queued' and candidate.scheduled_for <= now()
      and not exists (select 1 from sync_jobs active where active.store_id=candidate.store_id and active.status='running')
      order by candidate.created_at for update skip locked limit 1
    ) update sync_jobs set status='running', lock_token=${token}::uuid, locked_at=now(), heartbeat_at=now(), started_at=coalesce(started_at,now()), attempts=attempts+1, message='Uruchamianie', updated_at=now()
      where id in (select id from candidate) returning id`);
    const claimedId = claimedSyncJobId(rows[0]);
    if (!claimedId) return undefined;
    const [job] = await this.db.select().from(syncJobs).where(eq(syncJobs.id, claimedId)).limit(1);
    return job;
  }

  async progress(id: string, progress: number, message: string) { await this.db.update(syncJobs).set({ progress: Math.max(0, Math.min(100, Math.round(progress))), message, heartbeatAt: new Date(), updatedAt: new Date() }).where(and(eq(syncJobs.id, id), eq(syncJobs.status, "running"))); }
  async cancelled(id: string) { const [row] = await this.db.select({ value: syncJobs.cancelRequested }).from(syncJobs).where(eq(syncJobs.id, id)).limit(1); return row?.value ?? true; }
  async complete(id: string, result: Record<string, unknown>) { await this.db.update(syncJobs).set({ status: "completed", progress: 100, message: "Zakończono", result, error: null, finishedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() }).where(eq(syncJobs.id, id)); }
  async fail(job: SyncJob, error: string) {
    const retry = job.attempts < job.maxAttempts;
    await this.db.update(syncJobs).set(retry ? { status: "queued", message: `Ponowienie ${job.attempts}/${job.maxAttempts}`, error, scheduledFor: new Date(Date.now() + retryDelayMs(job.attempts)), lockToken: null, lockedAt: null, heartbeatAt: null, updatedAt: new Date() } : { status: "failed", message: "Zakończono błędem", error, finishedAt: new Date(), updatedAt: new Date() }).where(eq(syncJobs.id, job.id));
  }
  async finishCancelled(id: string) { await this.db.update(syncJobs).set({ status: "cancelled", message: "Anulowano", finishedAt: new Date(), updatedAt: new Date() }).where(eq(syncJobs.id, id)); }
  async requestCancel(storeId: string, id: string) {
    const [job] = await this.db.select().from(syncJobs).where(and(eq(syncJobs.id, id), eq(syncJobs.storeId, storeId))).limit(1);
    if (!job || !["queued", "running"].includes(job.status)) return job;
    const [updated] = await this.db.update(syncJobs).set(job.status === "queued" ? { status: "cancelled", message: "Anulowano", finishedAt: new Date(), updatedAt: new Date() } : { cancelRequested: true, message: "Trwa anulowanie", updatedAt: new Date() }).where(eq(syncJobs.id, id)).returning(); return updated;
  }
  async retry(storeId: string, id: string) { const [job] = await this.db.select().from(syncJobs).where(and(eq(syncJobs.id, id), eq(syncJobs.storeId, storeId))).limit(1); if (!job || !["failed", "cancelled"].includes(job.status)) throw new Error("Only failed or cancelled jobs can be retried"); return this.enqueue({ storeId, type: job.type, mode: job.mode, retryOf: job.id }); }
  async recoverStale(minutes = 5) { return this.db.update(syncJobs).set({ status: "queued", message: "Odzyskano po restarcie workera", lockToken: null, lockedAt: null, heartbeatAt: null, scheduledFor: new Date(), updatedAt: new Date() }).where(and(eq(syncJobs.status, "running"), lt(syncJobs.heartbeatAt, new Date(Date.now() - minutes * 60_000)))); }

  async enqueueDueSchedules() {
    const rows = await this.db.select({ id: stores.id, configuration: stores.configuration }).from(stores).where(eq(stores.enabled, true));
    for (const store of rows) {
      const schedule = (store.configuration as { syncSchedule?: { enabled?: boolean; intervalHours?: number } }).syncSchedule;
      if (!schedule?.enabled) continue;
      const [last] = await this.db.select({ createdAt: syncJobs.createdAt }).from(syncJobs).where(and(eq(syncJobs.storeId, store.id), eq(syncJobs.type, "full"), eq(syncJobs.scheduled, true))).orderBy(desc(syncJobs.createdAt)).limit(1);
      if (scheduleDue(last?.createdAt, schedule.intervalHours ?? 24)) await this.enqueue({ storeId: store.id, type: "full", mode: "incremental", scheduled: true });
    }
  }
}

export function claimedSyncJobId(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
