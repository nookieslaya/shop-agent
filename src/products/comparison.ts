import type { StoreConfig } from "../config/store.js";
import type { SearchableProduct } from "../search/types.js";

type ComparisonConfig = NonNullable<StoreConfig["productComparison"]>;
type ComparisonField = ComparisonConfig["fields"][number];
export type ComparableValue = string | number | boolean | string[] | number[] | null;

export interface ProductComparisonResult {
  products: Array<{ externalId: string; title: string; productUrl: string; imageUrl: string }>;
  fields: Array<{
    id: string; label: string; preference: "min" | "max" | "none";
    values: Array<{ externalId: string; value: ComparableValue; display: string; missing: boolean }>;
    bestProductIds: string[];
  }>;
}

export interface SimilarProductResult {
  product: SearchableProduct;
  effectivePriceMinor: number;
  similarityScore: number;
  reasons: string[];
}

const effectivePrice = (product: SearchableProduct) => product.salePriceMinor ?? product.priceMinor;
const sourced = (product: SearchableProduct, key: string): unknown => {
  const candidate = product.attributes[key];
  if (candidate && typeof candidate === "object" && "value" in candidate) return (candidate as { value: unknown }).value;
  return candidate;
};

export function extractConfiguredValue(product: SearchableProduct, field: ComparisonField): ComparableValue {
  const { source } = field;
  if (source.type === "commercial") return source.key === "price" ? effectivePrice(product) : product.availability;
  const value = sourced(product, source.key);
  if (source.type === "attribute") return isComparable(value) ? value : null;
  if (!Array.isArray(value)) return null;
  const numbers = value.map((item) => item && typeof item === "object" ? (item as Record<string, unknown>)[source.property] : undefined)
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (!numbers.length) return null;
  return source.operation === "min" ? Math.min(...numbers) : Math.max(...numbers);
}

export function compareProducts(products: SearchableProduct[], config: ComparisonConfig, locale = "pl-PL"): ProductComparisonResult {
  if (products.length < 2 || products.length > 3) throw new Error("Comparison requires two or three products");
  if (new Set(products.map((product) => product.externalId)).size !== products.length) throw new Error("Comparison products must be unique");
  return {
    products: products.map(({ externalId, title, productUrl, imageUrl }) => ({ externalId, title, productUrl, imageUrl })),
    fields: config.fields.map((field) => {
      const values = products.map((product) => {
        const value = extractConfiguredValue(product, field);
        return { externalId: product.externalId, value, display: formatValue(value, field, product.currency, locale), missing: value === null };
      });
      const numeric = values.filter((item): item is typeof item & { value: number } => typeof item.value === "number");
      const best = field.preference === "none" || !numeric.length ? [] : numeric.filter((item) => item.value === (field.preference === "min" ? Math.min(...numeric.map((entry) => entry.value)) : Math.max(...numeric.map((entry) => entry.value)))).map((item) => item.externalId);
      return { id: field.id, label: field.label, preference: field.preference, values, bestProductIds: best };
    }),
  };
}

export function findSimilarProducts(reference: SearchableProduct, candidates: SearchableProduct[], config: ComparisonConfig, options: { cheaperOnly?: boolean; limit?: number; onlyAvailable?: boolean } = {}): SimilarProductResult[] {
  const fields = config.fields.filter((field) => (config.similarityWeights[field.id] ?? 0) > 0);
  const totalWeight = fields.reduce((sum, field) => sum + (config.similarityWeights[field.id] ?? 0), 0);
  if (!fields.length || !totalWeight) return [];
  return candidates.filter((candidate) => candidate.externalId !== reference.externalId)
    .filter((candidate) => !options.cheaperOnly || effectivePrice(candidate) < effectivePrice(reference))
    .filter((candidate) => !options.onlyAvailable || isAvailable(candidate.availability))
    .map((candidate) => {
      let weightedScore = 0; let comparedWeight = 0; const reasons: string[] = [];
      for (const field of fields) {
        const left = extractConfiguredValue(reference, field); const right = extractConfiguredValue(candidate, field);
        if (left === null || right === null) continue;
        const weight = config.similarityWeights[field.id] ?? 0; const similarity = valueSimilarity(left, right);
        comparedWeight += weight; weightedScore += similarity * weight;
        if (similarity >= .8) reasons.push(field.label);
      }
      const coverage = comparedWeight / totalWeight;
      const score = comparedWeight ? (weightedScore / comparedWeight) * (.7 + .3 * coverage) : 0;
      return { product: candidate, effectivePriceMinor: effectivePrice(candidate), similarityScore: Math.round(score * 1000) / 10, reasons: reasons.slice(0, 4) };
    }).filter((result) => result.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore || a.effectivePriceMinor - b.effectivePriceMinor || a.product.title.localeCompare(b.product.title, "pl"))
    .slice(0, Math.min(Math.max(options.limit ?? 5, 1), 20));
}

function formatValue(value: ComparableValue, field: ComparisonField, currency: string, locale: string): string {
  if (value === null) return "Brak danych";
  if (field.format === "currency" && typeof value === "number") return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value / 100);
  if (field.format === "number" && typeof value === "number") return `${new Intl.NumberFormat(locale).format(value)}${field.unit ? ` ${field.unit}` : ""}`;
  if (field.format === "boolean" && typeof value === "boolean") return value ? "Tak" : "Nie";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function valueSimilarity(left: ComparableValue, right: ComparableValue): number {
  if (typeof left === "number" && typeof right === "number") return Math.max(0, 1 - Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1));
  if (Array.isArray(left) && Array.isArray(right)) {
    const a = new Set(left.map(normalize)); const b = new Set(right.map(normalize));
    const intersection = [...a].filter((item) => b.has(item)).length; const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 0;
  }
  if (typeof left === "boolean" && typeof right === "boolean") return left === right ? 1 : 0;
  const a = normalize(left); const b = normalize(right);
  return a === b ? 1 : a.includes(b) || b.includes(a) ? .65 : 0;
}

const normalize = (value: unknown) => String(value).toLocaleLowerCase("pl-PL").replace(/ł/g, "l").normalize("NFKD").replace(/\p{Diacritic}/gu, "").trim();
const isComparable = (value: unknown): value is Exclude<ComparableValue, null> => typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number");
const isAvailable = (value: string) => ["in stock", "in_stock", "instock", "available"].includes(normalize(value));
