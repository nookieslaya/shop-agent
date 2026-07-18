import * as cheerio from "cheerio";
import type { TechnicalRow } from "../domain/product.js";
import { fetchPublicResource } from "../security/public-url.js";

export function extractTechnicalRows(html: string, rowSelector: string): TechnicalRow[] {
  const $ = cheerio.load(html);
  const rows: TechnicalRow[] = [];

  $(rowSelector).each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const label = $(cells[0]).text().replace(/\s+/g, " ").trim().replace(/:$/, "");
    const value = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (label) rows.push({ label, value });
  });

  return rows;
}

export async function scrapeTechnicalRows(url: string, rowSelector: string): Promise<TechnicalRow[]> {
  const response = await fetchPublicResource(url, { headers: { "user-agent": "ShopAgentDataPipeline/0.1" }, maximumBytes:5_000_000 });
  return extractTechnicalRows(await response.text(), rowSelector);
}
