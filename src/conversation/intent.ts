import type { ProductSearchCriteria } from "../search/types.js";
import { normalizeCustomerText, resolveProductCategory, type SearchTaxonomy } from "../search/taxonomy.js";

export function extractSearchCriteria(message: string, taxonomy?: SearchTaxonomy): ProductSearchCriteria {
  const text = normalizeCustomerText(message, taxonomy);
  const criteria: ProductSearchCriteria = {};
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
  if (/cich|niski halas/.test(text)) criteria.maxNoiseDb = 45;
  if (/wydajn|mocn/.test(text)) criteria.minEfficiencyM3h = 700;
  return criteria;
}
