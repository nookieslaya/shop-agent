import { createHash } from "node:crypto";
import type { FeedProduct } from "../domain/product.js";

export interface ExistingProductState {
  id: string;
  feedHash: string;
  productPageStatus: "pending" | "enriched" | "failed";
  productPageCheckedAt: Date | null;
}

export interface SyncDecision {
  operation: "create" | "update" | "unchanged";
}

export function feedProductHash(product: FeedProduct): string {
  const canonical = {
    externalId: product.externalId,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    productUrl: product.productUrl,
    imageUrl: product.imageUrl,
    additionalImageUrls: product.additionalImageUrls,
    price: product.price,
    salePrice: product.salePrice ?? null,
    currency: product.currency,
    availability: product.availability,
    brand: product.brand ?? null,
    gtin: product.gtin ?? null,
    category: product.category ?? null,
    size: product.size ?? null,
    energyClass: product.energyClass ?? null,
    customLabels: product.customLabels,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function contentHash(content: unknown): string {
  return createHash("sha256").update(typeof content === "string" ? content : JSON.stringify(content)).digest("hex");
}

export function decideProductSync(
  existing: ExistingProductState | undefined,
  currentFeedHash: string,
): SyncDecision {
  if (!existing) return { operation: "create" };

  const feedChanged = existing.feedHash !== currentFeedHash;
  return { operation: feedChanged ? "update" : "unchanged" };
}

export function needsProductPageEnrichment(existing: ExistingProductState | undefined, force = false): boolean {
  return Boolean(existing && (force || existing.productPageStatus === "pending"));
}
