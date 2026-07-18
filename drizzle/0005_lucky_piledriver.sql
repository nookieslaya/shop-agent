CREATE TYPE "public"."sync_job_mode" AS ENUM('incremental', 'full', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sync_job_type" AS ENUM('feed', 'enrichment', 'knowledge', 'full');--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"type" "sync_job_type" NOT NULL,
	"mode" "sync_job_mode" DEFAULT 'incremental' NOT NULL,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT 'Oczekuje w kolejce' NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"retry_of" uuid,
	"scheduled" boolean DEFAULT false NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"lock_token" uuid,
	"locked_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_jobs_store_created_idx" ON "sync_jobs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_jobs_claim_idx" ON "sync_jobs" USING btree ("status","scheduled_for");