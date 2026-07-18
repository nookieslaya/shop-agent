CREATE TABLE "quality_scenario_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"failures" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"expectations" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quality_scenario_runs" ADD CONSTRAINT "quality_scenario_runs_scenario_id_quality_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."quality_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_scenarios" ADD CONSTRAINT "quality_scenarios_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quality_scenario_runs_scenario_idx" ON "quality_scenario_runs" USING btree ("scenario_id","created_at");--> statement-breakpoint
CREATE INDEX "quality_scenarios_store_idx" ON "quality_scenarios" USING btree ("store_id");