CREATE TABLE "api_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text,
	"request_id" text NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_request_events" ADD CONSTRAINT "api_request_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_requests_store_created_idx" ON "api_request_events" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "api_requests_route_created_idx" ON "api_request_events" USING btree ("route","created_at");