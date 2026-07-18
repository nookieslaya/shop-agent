import type { StoreConfig } from "../config/store.js";
import type { SearchableProduct } from "../search/types.js";

type ComparisonConfig = NonNullable<StoreConfig["productComparison"]>;
type ComparisonField = ComparisonConfig["fields"][number];

export interface AttributeProfile {
  key: string; valueType: string; coverage: number; distinctCount: number; examples: string[];
}

export interface ConfigurationSuggestion {
  id: string; field: ComparisonField; weight: number;
  rule: { required: boolean; minimumSimilarity: number; mismatchPenalty: number };
  confidence: number; recommended: boolean; reason: string;
}

export interface ConfigurationAnalysis {
  productsAnalyzed: number; attributesDetected: number; profiles: AttributeProfile[]; suggestions: ConfigurationSuggestion[];
  guidedSelling: { widthChoices: Array<{ label: string; value: number }>; budgetChoices: Array<{ label: string; valueMinor: number }> };
}

export function analyzeProductConfiguration(products: SearchableProduct[]): ConfigurationAnalysis {
  const profiles = profileAttributes(products);
  const suggestions = profiles.flatMap((profile) => suggestionsForProfile(profile, products.length));
  return { productsAnalyzed: products.length, attributesDetected: profiles.length, profiles, suggestions: suggestions.sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.confidence - a.confidence || a.field.label.localeCompare(b.field.label, "pl")), guidedSelling: guidedSellingSuggestions(products) };
}

function guidedSellingSuggestions(products: SearchableProduct[]) {
  const widths = [...new Set(products.map((product) => Number(unwrap(product.attributes.widthCm))).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b).slice(0, 8);
  const prices = products.map((product) => product.salePriceMinor ?? product.priceMinor).filter((value) => value > 0).sort((a, b) => a - b);
  const bands = [.4, .7, .9].map((quantile) => prices[Math.min(prices.length - 1, Math.floor(prices.length * quantile))]).filter((value): value is number => value !== undefined).map((value) => Math.ceil(value / 50_000) * 50_000);
  const budgets = [...new Set(bands)].slice(0, 3);
  return {
    widthChoices: widths.map((value) => ({ label: `${value} cm`, value })),
    budgetChoices: [...budgets.map((valueMinor) => ({ label: `Do ${(valueMinor / 100).toLocaleString("pl-PL")} zł`, valueMinor })), { label: "Bez limitu", valueMinor: 99_999_900 }],
  };
}

function profileAttributes(products: SearchableProduct[]): AttributeProfile[] {
  const values = new Map<string, unknown[]>();
  for (const product of products) for (const [key, candidate] of Object.entries(product.attributes)) {
    const value = unwrap(candidate); if (value === null || value === undefined || value === "") continue;
    const current = values.get(key) ?? []; current.push(value); values.set(key, current);
  }
  return [...values.entries()].map(([key, items]) => ({
    key, valueType: detectType(items), coverage: products.length ? round(items.length / products.length) : 0,
    distinctCount: new Set(items.map(stable)).size, examples: [...new Set(items.map(example))].slice(0, 3),
  })).sort((a, b) => b.coverage - a.coverage || a.key.localeCompare(b.key));
}

function suggestionsForProfile(profile: AttributeProfile, productCount: number): ConfigurationSuggestion[] {
  if (profile.coverage < .25 || profile.distinctCount < 2) return [];
  const uniqueness = profile.distinctCount / Math.max(productCount * profile.coverage, 1);
  if (uniqueness > .95 && ["text", "string"].includes(profile.valueType)) return [];
  if (profile.valueType === "object" || profile.valueType === "mixed") return [];
  if (profile.valueType === "object_array") return [];
  const format = profile.valueType === "number" ? "number" : profile.valueType === "boolean" ? "boolean" : profile.valueType.endsWith("_array") ? "list" : "text";
  const unit = inferUnit(profile.key); const preference = inferPreference(profile.key);
  const installationCritical = /(?:width|height|length|size|diameter|voltage|compatib)/i.test(profile.key);
  const recommended = profile.coverage >= .6 && uniqueness <= .85;
  const confidence = round(Math.min(1, profile.coverage * (uniqueness > .9 ? .65 : 1)));
  const field: ComparisonField = { id: safeId(profile.key), label: humanize(profile.key), source: { type: "attribute", key: profile.key }, format, preference, ...(unit ? { unit } : {}) };
  return [{ id: field.id, field, weight: recommended ? (installationCritical ? 5 : 2) : 1, rule: { required: recommended && installationCritical, minimumSimilarity: recommended && installationCritical ? 1 : 0, mismatchPenalty: /material|color|colour/i.test(profile.key) ? 3 : 0 }, confidence, recommended, reason: reason(profile, recommended, installationCritical) }];
}

const unwrap = (candidate: unknown): unknown => candidate && typeof candidate === "object" && "value" in candidate ? (candidate as { value: unknown }).value : candidate;
const stable = (value: unknown) => JSON.stringify(value, Object.keys(value && typeof value === "object" && !Array.isArray(value) ? value as object : {}).sort());
const example = (value: unknown) => { const text = Array.isArray(value) ? value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value); return text.length > 100 ? `${text.slice(0, 97)}…` : text; };
const round = (value: number) => Math.round(value * 1000) / 1000;
const safeId = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (char) => char.toLocaleUpperCase("pl-PL"));
const inferUnit = (key: string) => /noise.*db|db$/i.test(key) ? "dB" : /m3h|efficiency/i.test(key) ? "m³/h" : /months?$/i.test(key) ? "mies." : /(?:width|height|length|size).*cm|cm$/i.test(key) ? "cm" : /gb$/i.test(key) ? "GB" : undefined;
const inferPreference = (key: string): "min" | "max" | "none" => /noise|consumption|weight/i.test(key) ? "min" : /efficiency|capacity|memory|warranty/i.test(key) ? "max" : "none";
const reason = (profile: AttributeProfile, recommended: boolean, critical: boolean) => `${Math.round(profile.coverage * 100)}% produktów ma tę wartość; wykryto ${profile.distinctCount} różnych wartości.${critical ? " Pole może wpływać na zgodność lub montaż." : ""}${recommended ? " Dobre pokrycie katalogu." : " Wymaga oceny administratora."}`;

function detectType(values: unknown[]): string {
  const types = new Set(values.map((value) => Array.isArray(value) ? value.every((item) => typeof item === "string") ? "text_array" : value.every((item) => typeof item === "number") ? "number_array" : value.every((item) => item && typeof item === "object") ? "object_array" : "mixed_array" : typeof value === "object" ? "object" : typeof value));
  return types.size === 1 ? [...types][0]! : "mixed";
}
