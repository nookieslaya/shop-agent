CREATE TYPE "public"."source_type" AS ENUM('feed', 'product_page', 'woocommerce', 'description', 'ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "manual_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_attribute_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"type" "source_type" NOT NULL,
	"confidence" real NOT NULL,
	"raw_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "source_type" NOT NULL,
	"source_url" text,
	"raw_data" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"brand" text,
	"description_text" text DEFAULT '' NOT NULL,
	"price_minor" integer NOT NULL,
	"sale_price_minor" integer,
	"currency" text NOT NULL,
	"availability" text NOT NULL,
	"product_url" text NOT NULL,
	"image_url" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_quality_score" integer DEFAULT 0 NOT NULL,
	"feed_hash" text NOT NULL,
	"product_page_hash" text,
	"product_page_checked_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"feed_url" text,
	"source_type" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"products_found" integer DEFAULT 0 NOT NULL,
	"products_created" integer DEFAULT 0 NOT NULL,
	"products_updated" integer DEFAULT 0 NOT NULL,
	"products_unchanged" integer DEFAULT 0 NOT NULL,
	"products_failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_sources" ADD CONSTRAINT "product_attribute_sources_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_overrides_product_key_uidx" ON "manual_overrides" USING btree ("product_id","attribute_key");--> statement-breakpoint
CREATE INDEX "attribute_sources_product_key_idx" ON "product_attribute_sources" USING btree ("product_id","attribute_key");--> statement-breakpoint
CREATE INDEX "product_sources_product_idx" ON "product_sources" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_external_id_uidx" ON "products" USING btree ("store_id","external_id");--> statement-breakpoint
CREATE INDEX "products_store_category_idx" ON "products" USING btree ("store_id","category");--> statement-breakpoint
CREATE INDEX "products_store_active_idx" ON "products" USING btree ("store_id","is_active");