import { XMLParser } from "fast-xml-parser";
import type { FeedProduct } from "../domain/product.js";
import { fetchPublicResource } from "../security/public-url.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: false,
  parseTagValue: false,
  trimValues: true,
  cdataPropName: "#cdata",
});

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#cdata" in value) {
    return text((value as { "#cdata": unknown })["#cdata"]);
  }
  return undefined;
}

function array(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function money(value: unknown): { amount: number; currency: string } | undefined {
  const raw = text(value);
  const match = raw?.match(/^([\d.,]+)\s*([A-Z]{3})$/);
  if (!match) return undefined;
  return { amount: Number(match[1]?.replace(",", ".")), currency: match[2] ?? "PLN" };
}

export function parseGoogleMerchantFeed(xml: string): FeedProduct[] {
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const items = array(channel?.item) as Record<string, unknown>[];

  return items.map((item) => {
    const regularPrice = money(item["g:price"]);
    if (!regularPrice) throw new Error(`Invalid price for product ${text(item["g:id"]) ?? "unknown"}`);

    const salePrice = money(item["g:sale_price"]);
    const customLabels: Record<string, string> = {};
    for (const index of [0, 1, 2, 3, 4]) {
      const value = text(item[`g:custom_label_${index}`]);
      if (value !== undefined) customLabels[`custom_label_${index}`] = value;
    }

    const product: FeedProduct = {
      externalId: text(item["g:id"]) ?? "",
      title: text(item.title) ?? "",
      descriptionHtml: text(item.description) ?? "",
      productUrl: text(item.link) ?? "",
      imageUrl: text(item["g:image_link"]) ?? "",
      additionalImageUrls: array(item["g:additional_image_link"]).map(text).filter((v): v is string => Boolean(v)),
      price: regularPrice.amount,
      currency: regularPrice.currency,
      availability: text(item["g:availability"]) ?? "unknown",
      customLabels,
      raw: item,
    };

    const optional = {
      salePrice: salePrice?.amount,
      brand: text(item["g:brand"]),
      gtin: text(item["g:gtin"]),
      category: text(item["g:product_type"]),
      size: text(item.size),
      energyClass: text(item["g:energy_efficiency_class"]),
    };

    for (const [key, value] of Object.entries(optional)) {
      if (value !== undefined) Object.assign(product, { [key]: value });
    }

    return product;
  });
}

export async function fetchGoogleMerchantFeed(url: string): Promise<FeedProduct[]> {
  const response = await fetchPublicResource(url, { headers: { "user-agent": "ShopAgentDataPipeline/0.1" }, timeoutMs:30_000, maximumBytes:50_000_000 });
  return parseGoogleMerchantFeed(await response.text());
}
