CREATE TYPE "public"."product_page_status" AS ENUM('pending', 'enriched', 'failed');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_page_status" "product_page_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_page_error" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_page_attempted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "products" SET
  "product_page_status" = 'enriched',
  "product_page_attempted_at" = "product_page_checked_at"
WHERE "product_page_checked_at" IS NOT NULL;
