import type { FeedProduct, HoodAttributes, PerformanceLevel, SourcedValue, TechnicalRow } from "../domain/product.js";

const sourced = <T>(value: T, rawValue?: string): SourcedValue<T> => ({
  value,
  source: "product_page",
  confidence: 0.99,
  ...(rawValue === undefined ? {} : { rawValue }),
});

const number = (value: string): number | undefined => {
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

const numbers = (value: string): number[] => [...value.replace(/,/g, ".").matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));

function normalizeLabel(label: string): string {
  return label.toLocaleLowerCase("pl-PL").replace(/\s+/g, " ").trim();
}

export function normalizeHoodAttributes(feed: FeedProduct, rows: TechnicalRow[]): HoodAttributes {
  const attributes: HoodAttributes = {};
  const rowMap = new Map(rows.map((row) => [normalizeLabel(row.label), row.value]));
  const get = (label: string) => rowMap.get(normalizeLabel(label));

  const simple: Array<[string, keyof HoodAttributes]> = [
    ["Typ okapu", "hoodType"],
    ["Klasa energetyczna", "energyClass"],
    ["Wykonanie", "material"],
    ["Sterowanie", "controlType"],
    ["Oświetlenie", "lighting"],
    ["Produkcja", "productionCountry"],
    ["Zawartość zestawu", "setContents"],
  ];
  for (const [label, key] of simple) {
    const value = get(label);
    if (value) (attributes as Record<string, unknown>)[key] = sourced(value, value);
  }

  const feedSize = feed.size;
  const sizeFromFeed = feedSize ? number(feedSize) : undefined;
  if (sizeFromFeed !== undefined && feedSize !== undefined) {
    attributes.widthCm = { value: sizeFromFeed, source: "feed", confidence: 1, rawValue: feedSize };
  }

  const widthsRaw = get("Szerokość");
  if (widthsRaw) attributes.availableWidthsCm = sourced(numbers(widthsRaw), widthsRaw);

  const modes = get("Wariant pracy");
  if (modes) attributes.operatingModes = sourced(modes.split(/\s+lub\s+|\s*,\s*/i).filter(Boolean), modes);

  const timer = get("Timer");
  if (timer) attributes.timer = sourced(true, timer);

  const maxEfficiency = get("Wydajność turbiny");
  const maxEfficiencyNumber = maxEfficiency ? number(maxEfficiency) : undefined;
  if (maxEfficiencyNumber !== undefined) attributes.maxTurbineEfficiencyM3h = sourced(maxEfficiencyNumber, maxEfficiency);

  const speedLevels = get("Ilość stopni prędkości");
  const speedLevelsNumber = speedLevels ? number(speedLevels) : undefined;
  if (speedLevelsNumber !== undefined) attributes.speedLevels = sourced(speedLevelsNumber, speedLevels);

  const warranty = get("Gwarancja");
  if (warranty) {
    const parts = numbers(warranty);
    if (parts.length) attributes.warrantyMonths = sourced(parts.reduce((sum, part) => sum + part, 0), warranty);
  }

  const levels: PerformanceLevel[] = [];
  for (const row of rows) {
    const levelMatch = normalizeLabel(row.label).match(/^(\d+) bieg/);
    const values = numbers(row.value);
    if (!levelMatch || values.length < 2) continue;
    levels.push({
      level: Number(levelMatch[1]),
      noiseDb: values[0] ?? 0,
      efficiencyM3h: values[1] ?? 0,
      intensive: /intensywn/i.test(row.label),
    });
  }
  if (levels.length) attributes.performanceLevels = sourced(levels);

  const compatibleValues = rows.filter((row) => normalizeLabel(row.label) === "możliwość pracy z").map((row) => row.value);
  if (compatibleValues.some((value) => /super silent home/i.test(value))) attributes.supportsSuperSilentHome = sourced(true);
  if (compatibleValues.some((value) => /super silent kitchen/i.test(value))) attributes.supportsSuperSilentKitchen = sourced(true);

  return attributes;
}
