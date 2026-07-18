import type { Suggestion } from "./types.js";

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();

export function safeSuggestions(items: Suggestion[], limit = 2): Suggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(`${item.label} ${item.key} ${item.value}`);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, limit);
}
