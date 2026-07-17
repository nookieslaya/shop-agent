import type { ProductSearchCriteria } from "../search/types.js";

export function extractSearchCriteria(message: string): ProductSearchCriteria {
  const text = message.toLocaleLowerCase("pl-PL");
  const criteria: ProductSearchCriteria = {};
  const width = text.match(/\b(40|50|60|70|80|90|100|120)\s*(?:cm)?\b/);
  if (width?.[1]) criteria.widthCm = Number(width[1]);
  const budget = text.match(/(?:do|max(?:ymalnie)?|budżet(?:em)?(?: do)?)\s*(\d[\d\s]*)\s*(?:zł|pln)?/);
  if (budget?.[1]) criteria.maxPriceMinor = Number(budget[1].replace(/\s/g, "")) * 100;
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
