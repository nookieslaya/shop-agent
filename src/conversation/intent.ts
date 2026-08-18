import type { ProductSearchCriteria } from "../search/types.js";
import { normalizeCustomerText, resolveProductCategory, type SearchTaxonomy } from "../search/taxonomy.js";
import { extractFacetFilters } from "../search/facets.js";
import type { StoreConfig } from "../config/store.js";

export function extractSearchCriteria(message: string, taxonomy?: SearchTaxonomy, preferenceRules: StoreConfig["preferenceRules"] = []): ProductSearchCriteria {
  const text = normalizeCustomerText(message, taxonomy);
  const criteria: ProductSearchCriteria = {};
  const clauses = message.split(/[.!?;]/).map((clause) => normalizeCustomerText(clause, taxonomy));
  const isDeprioritized = (term: RegExp) => clauses.some((clause) =>
    term.test(clause) && /(mniej wazn|bez znaczenia|nieistotn)/.test(clause),
  );
  const deprioritizedNoise = isDeprioritized(/cich|halas|glosn/);
  const deprioritizedEfficiency = isDeprioritized(/wydajn|mocn/);
  if (/\b(kategorie|kategorii|kategoria)\b/.test(text) && /\b(pokaz|wyswietl|lista|jakie|dostepne|macie|okap)/.test(text)) {
    criteria.catalogView = "categories"; criteria.catalogWide = true;
  } else if (/\b(pokaz|wyswietl|lista|jakie|dostepne|macie)\b/.test(text) && /\b(produkty|produktow|okapy|okapow|modele|modeli)\b/.test(text)) {
    criteria.catalogView = "products"; criteria.catalogWide = true;
  }
  const category = resolveProductCategory(text, taxonomy);
  if (category) { criteria.category = category; criteria.catalogView = "products"; criteria.catalogWide = true; }
  const width = text.match(/\b(40|50|60|70|80|90|100|120)\s*(?:cm)?\b/);
  if (width?.[1]) criteria.widthCm = Number(width[1]);
  const budget = text.match(/(?:do|max(?:ymalnie)?|budzet(?:em)?(?: do)?)\s*(\d[\d\s]*)\s*(?:zl|pln)?/);
  if (budget?.[1]) { criteria.maxPriceMinor = Number(budget[1].replace(/\s/g, "")) * 100; criteria.priceMode = "bounded"; criteria.budgetResolved = true; }
  const minimumPrice = text.match(/(?:powyzej|co najmniej|minimum|od)\s*(\d[\d\s]*)\s*(?:zl|pln)?(?:\s|$)/);
  if (minimumPrice?.[1]) { criteria.minPriceMinor = Number(minimumPrice[1].replace(/\s/g, "")) * 100; criteria.priceMode = "bounded"; criteria.budgetResolved = true; }
  if (/bez\s+limitu(?:\s+ceny)?/.test(text)) { criteria.priceMode = "unbounded"; criteria.budgetResolved = true; }
  const targetPrice=text.match(/(?:za|w\s+cenie|okolo|ok)\s*(?:(?:okolo|ok)\s*)?(\d(?:[\d .]*\d)?)/);
  if(targetPrice?.[1]){criteria.targetPriceMinor=Number(targetPrice[1].replace(/[ .]/g,""))*100;criteria.priceMode="target";criteria.sortBy="price_nearest";criteria.budgetResolved=true;}
  if(!/najdroz/.test(text)&&/(?:drozsz|wyzsza\s+polka)/.test(text))criteria.relativePrice="higher";
  if(!/najtan/.test(text)&&/(?:tansz|nizsza\s+polka)/.test(text))criteria.relativePrice="lower";
  if (/najdroz/.test(text)) criteria.sortBy = "price_desc";
  else if (/najtan/.test(text)) criteria.sortBy = "price_asc";
  if (criteria.sortBy) {
    delete criteria.catalogView;
    if (!criteria.category) delete criteria.catalogWide;
  }
  if (criteria.sortBy && /(?:w\s+(?:calym\s+)?sklepie|z\s+calego\s+katalogu)/.test(text)) criteria.catalogWide = true;
  const requestedCount = text.match(/\b(\d{1,2})\s+(?:najdroz|najtan|produkt|okap|model)/);
  if (requestedCount?.[1]) criteria.limit = Math.min(20, Math.max(1, Number(requestedCount[1])));
  else if (/(?:najdrozszy|najtanszy)\b/.test(text)) criteria.limit = 1;
  if (/czarn/.test(text)) criteria.material = "czarny";
  else if (/bial/.test(text)) criteria.material = "biały";
  else if (/inox|srebr|stal nierdzew/.test(text)) criteria.material = "inox";
  if (!category && /\bkominow(?:y|a|e|ego|ych|ym)\b/.test(text)) criteria.hoodType = "kominowy";
  else if (!category && /\bwyspow(?:y|a|e|ego|ych|ym)\b/.test(text)) criteria.hoodType = "wyspowy";
  else if (!category && /zabudow|podszafkow/.test(text)) criteria.hoodType = "do zabudowy";
  if (/pochlaniacz/.test(text)) criteria.operatingMode = "pochłaniacz";
  else if (/wyciag/.test(text)) criteria.operatingMode = "wyciąg";
  const hasNoisePreferenceRule = preferenceRules.some((rule) => rule.enabled && rule.facetId === "noise");
  const hasEfficiencyPreferenceRule = preferenceRules.some((rule) => rule.enabled && rule.facetId === "airflow");
  if (/cich|niski halas/.test(text) && !deprioritizedNoise && !hasNoisePreferenceRule) criteria.maxNoiseDb = 45;
  if (/wydajn|mocn/.test(text) && !deprioritizedEfficiency && !hasEfficiencyPreferenceRule) criteria.minEfficiencyM3h = 700;
  const dynamicFilters = extractFacetFilters(message, taxonomy?.facets ?? {});
  const priceFilters = [
    ...(criteria.minPriceMinor !== undefined ? [{ facetId: "price", operator: "gte" as const, value: criteria.minPriceMinor / 100, importance: "required" as const }] : []),
    ...(criteria.maxPriceMinor !== undefined ? [{ facetId: "price", operator: "lte" as const, value: criteria.maxPriceMinor / 100, importance: "required" as const }] : []),
    ...(criteria.widthCm !== undefined ? [{ facetId: "width", operator: "eq" as const, value: criteria.widthCm, importance: "required" as const }] : []),
  ];
  const filters = [...dynamicFilters.filter((filter) => !priceFilters.some((item) => item.facetId === filter.facetId)), ...priceFilters];
  if (filters.length) criteria.filters = filters;
  const preferences = preferenceRules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.facetId === "noise" && deprioritizedNoise) return false;
    if (rule.facetId === "airflow" && deprioritizedEfficiency) return false;
    return [rule.label, ...rule.aliases].some((alias) => text.includes(normalizeCustomerText(alias, taxonomy)));
  })
    .map((rule) => ({ id: rule.id, facetId: rule.facetId, ...(rule.direction ? { direction: rule.direction } : {}), ...(rule.targetValue !== undefined ? { targetValue: rule.targetValue } : {}), weight: rule.weight }));
  if (preferences.length) criteria.preferences = preferences;
  if (/(ceramik|material).{0,30}(nie (?:jest )?(?:juz )?konieczn|bez znaczenia|nieistotn|rezygn)/.test(text)) {
    criteria.removeFacetIds = ["material"];
  }
  if (deprioritizedNoise || /pokaz (?:takze )?glosniejsz/.test(text)) {
    criteria.removeFacetIds = [...new Set([...(criteria.removeFacetIds ?? []), "noise"])];
    criteria.removePreferenceIds = [...new Set([...(criteria.removePreferenceIds ?? []), "low_noise"])];
    criteria.removeLegacyCriteria = [...new Set([...(criteria.removeLegacyCriteria ?? []), "maxNoiseDb" as const])];
  }
  if (deprioritizedEfficiency || /pokaz (?:takze )?mniej wydajn/.test(text)) {
    criteria.removeFacetIds = [...new Set([...(criteria.removeFacetIds ?? []), "airflow"])];
    criteria.removePreferenceIds = [...new Set([...(criteria.removePreferenceIds ?? []), "high_airflow"])];
    criteria.removeLegacyCriteria = [...new Set([...(criteria.removeLegacyCriteria ?? []), "minEfficiencyM3h" as const])];
  }
  if (/pokaz (?:inne|pozostale) kolor|pokaz (?:inne|pozostale) material/.test(text)) {
    criteria.removeFacetIds = [...new Set([...(criteria.removeFacetIds ?? []), "material"])];
    criteria.removeLegacyCriteria = [...new Set([...(criteria.removeLegacyCriteria ?? []), "material" as const])];
  }
  if (/(inne|pozostale).{0,20}(typy?|rodzaje?).{0,15}(montaz|okap)/.test(text)) {
    criteria.removeFacetIds = [...new Set([...(criteria.removeFacetIds ?? []), "product_type"])];
    criteria.removeLegacyCriteria = criteria.removeLegacyCriteria?.includes("hoodType")
      ? criteria.removeLegacyCriteria
      : [...(criteria.removeLegacyCriteria ?? []), "hoodType"];
  }
  return criteria;
}
