import type { ProductSearchCriteria } from "../search/types.js";

export function extractSearchCriteria(message: string): ProductSearchCriteria {
  const text = message.toLocaleLowerCase("pl-PL");
  const criteria: ProductSearchCriteria = {};
  const width = text.match(/\b(40|50|60|70|80|90|100|120)\s*(?:cm)?\b/);
  if (width?.[1]) criteria.widthCm = Number(width[1]);
  const budget = text.match(/(?:do|max(?:ymalnie)?|budżet(?:em)?(?: do)?)\s*(\d[\d\s]*)\s*(?:zł|pln)?/);
  if (budget?.[1]) { criteria.maxPriceMinor = Number(budget[1].replace(/\s/g, "")) * 100; criteria.priceMode = "bounded"; criteria.budgetResolved = true; }
  const minimumPrice = text.match(/(?:powyżej|powyzej|poweyżej|poweyzej|co najmniej|minimum|od)\s*(\d[\d\s]*)\s*(?:zł|pln)?(?:\s|$)/);
  if (minimumPrice?.[1]) { criteria.minPriceMinor = Number(minimumPrice[1].replace(/\s/g, "")) * 100; criteria.priceMode = "bounded"; criteria.budgetResolved = true; }
  if (/bez\s+limitu(?:\s+ceny)?/.test(text)) { criteria.priceMode = "unbounded"; criteria.budgetResolved = true; }
  if (/najdro[żz]/.test(text)) criteria.sortBy = "price_desc";
  else if (/najta[ńn]/.test(text)) criteria.sortBy = "price_asc";
  const requestedCount = text.match(/\b(\d{1,2})\s+(?:najdro[żz]|najta[ńn]|produkt|okap|model)/);
  if (requestedCount?.[1]) criteria.limit = Math.min(20, Math.max(1, Number(requestedCount[1])));
  else if (/(?:najdro[żz]szy|najta[ńn]szy)\b/.test(text)) criteria.limit = 1;
  if (/czarn/.test(text)) criteria.material = "czarny";
  else if (/bia[łl]/.test(text)) criteria.material = "biały";
  else if (/inox|srebr|stal nierdzew/.test(text)) criteria.material = "inox";
  if (/kominow/.test(text)) criteria.hoodType = "kominowy";
  else if (/wyspow/.test(text)) criteria.hoodType = "wyspowy";
  else if (/zabudow|podszafkow/.test(text)) criteria.hoodType = "zabudowy";
  if (/pochłaniacz/.test(text)) criteria.operatingMode = "pochłaniacz";
  else if (/wyciąg/.test(text)) criteria.operatingMode = "wyciąg";
  if (/cich|niski hałas/.test(text)) criteria.maxNoiseDb = 45;
  if (/wydajn|mocn/.test(text)) criteria.minEfficiencyM3h = 700;
  return criteria;
}
