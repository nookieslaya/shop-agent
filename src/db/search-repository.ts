import { and, eq } from "drizzle-orm";
import type { SearchableProduct } from "../search/types.js";
import type { Database } from "./client.js";
import { products } from "./schema.js";

export class SearchRepository {
  constructor(private readonly db: Database) {}

  async activeProducts(storeId: string): Promise<SearchableProduct[]> {
    return this.db.select({
      id: products.id,
      externalId: products.externalId,
      title: products.title,
      descriptionText: products.descriptionText,
      category: products.category,
      priceMinor: products.priceMinor,
      salePriceMinor: products.salePriceMinor,
      currency: products.currency,
      availability: products.availability,
      productUrl: products.productUrl,
      imageUrl: products.imageUrl,
      attributes: products.attributes,
      dataQualityScore: products.dataQualityScore,
    }).from(products).where(and(eq(products.storeId, storeId), eq(products.isActive, true)));
  }
}
