CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_microusd" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtime_heartbeats" (
	"component" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_store_created_idx" ON "ai_usage_events" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_request_kind_uidx" ON "ai_usage_events" USING btree ("request_id","kind");