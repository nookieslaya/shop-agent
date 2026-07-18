import { describe, expect, it } from "vitest";
import { buildConversationResponse } from "../src/conversation/orchestrator.js";
import { extractSearchCriteria } from "../src/conversation/intent.js";
import type { SearchableProduct } from "../src/search/types.js";

const matchingProduct: SearchableProduct = {
  id: "one", externalId: "one", title: "Okap biały 60 cm", descriptionText: "", priceMinor: 59_900,
  salePriceMinor: null, currency: "PLN", availability: "in stock", productUrl: "https://shop.test/one",
  imageUrl: "https://shop.test/one.jpg", dataQualityScore: 90,
  attributes: { widthCm: { value: 60 }, material: { value: "biały" } },
};

describe("conversation orchestration", () => {
  it("extracts explicit Polish shopping requirements", () => {
    expect(extractSearchCriteria("Szukam cichego czarnego okapu 60 cm do 3000 zł")).toMatchObject({
      widthCm: 60, maxPriceMinor: 300_000, material: "czarny", maxNoiseDb: 45,
    });
  });

  it("extracts minimum price, price sorting and requested result count", () => {
    expect(extractSearchCriteria("Pokaż 2 najdroższe okapy powyżej 10000 zł")).toMatchObject({
      minPriceMinor: 1_000_000, sortBy: "price_desc", limit: 2, budgetResolved: true, priceMode: "bounded",
    });
    expect(extractSearchCriteria("pokaż najtańszy okap")).toMatchObject({ sortBy: "price_asc", limit: 1 });
  });
  it("extracts an approximate target price and relative price requests",()=>{
    for(const message of ["A coś lepszego za około 4000 zł?","Pokaż coś za ok. 4 000 PLN","Coś w cenie około 4.000"]){
      expect(extractSearchCriteria(message)).toMatchObject({targetPriceMinor:400_000,priceMode:"target",sortBy:"price_nearest",budgetResolved:true});
    }
    expect(extractSearchCriteria("Chciałbym droższy niż pokazane")).toMatchObject({relativePrice:"higher"});
  });

  it("asks for width first and returns button suggestions", () => {
    const response = buildConversationResponse({ message: "Szukam okapu", products: [] });
    expect(response.message).toContain("szerokości");
    expect(response.suggestions.map((item) => item.value)).toEqual([50, 60, 80, 90]);
  });

  it("does not apply the follow-up limit to guided budget choices", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 60 } }, products: [] });
    expect(response.message).toContain("budżet");
    expect(response.suggestions.map((item) => item.label)).toEqual([
      "Do 1500 zł", "Do 2500 zł", "Do 4000 zł", "Bez limitu",
    ]);
  });

  it("uses per-store guided questions and choices", () => {
    const response = buildConversationResponse({ message: "Szukam produktu", products: [], guidedSelling: {
      widthQuestion: "Jaki rozmiar wybierasz?", widthChoices: [{ label: "Duży", value: 90 }],
      budgetQuestion: "Ile chcesz wydać?", budgetChoices: [{ label: "Do 1000", valueMinor: 100_000 }],
      priorityQuestion: "Priorytet?", priorityChoices: [{ label: "Dowolny", value: "any" }],
    } });
    expect(response.message).toBe("Jaki rozmiar wybierasz?");
    expect(response.suggestions).toEqual([{ label: "Duży", key: "widthCm", value: 90 }]);
  });

  it("keeps state while applying a button selection", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 60 } },
      selection: { key: "maxPriceMinor", value: 250_000 }, products: [] });
    expect(response.state.criteria).toMatchObject({ widthCm: 60, maxPriceMinor: 250_000 });
    expect(response.message).toContain("najważniejsze");
  });

  it("treats the no-limit choice as resolved without a fake maximum price", () => {
    const response = buildConversationResponse({ message: "", state: { criteria: { widthCm: 90 } },
      selection: { key: "maxPriceMinor", value: 99_999_900 }, products: [] });
    expect(response.state.criteria).toMatchObject({ priceMode: "unbounded", budgetResolved: true });
    expect(response.state.criteria.maxPriceMinor).toBeUndefined();
    expect(response.message).not.toContain("budżet");
  });

  it("does not let AI confuse the requested count with price or width", () => {
    const expensive = { ...matchingProduct, id: "expensive", externalId: "expensive", title: "Drogi okap 60 cm", priceMinor: 900_000 };
    const response = buildConversationResponse({ message: "Pokaż 1 najdroższy okap", products: [matchingProduct, expensive],
      state: { criteria: { widthCm: 60, budgetResolved: true, priorityResolved: true } },
      extractedCriteria: { widthCm: 1, maxPriceMinor: 100 },
    });
    expect(response.products.map((item) => item.externalId)).toEqual(["expensive"]);
    expect(response.state.criteria).toMatchObject({ widthCm: 60, limit: 1, sortBy: "price_desc" });
    expect(response.state.criteria.maxPriceMinor).toBeUndefined();
  });

  it("clears previous product filters for an explicit whole-catalog request", () => {
    const ninety = { ...matchingProduct, id: "ninety", externalId: "ninety", title: "Okap 90 cm", priceMinor: 300_000, attributes: { widthCm: { value: 90 } } };
    const expensive = { ...matchingProduct, id: "expensive-all", externalId: "expensive-all", title: "Najdroższy okap 60 cm", priceMinor: 900_000 };
    const response = buildConversationResponse({ message: "Pokaż 2 najdroższe okapy w całym sklepie", products: [matchingProduct, ninety, expensive],
      state: { criteria: { widthCm: 90, maxNoiseDb: 45, minEfficiencyM3h: 700, budgetResolved: true, priorityResolved: true } },
    });
    expect(response.state.criteria).toMatchObject({ catalogWide: true, sortBy: "price_desc", limit: 2 });
    expect(response.state.criteria.widthCm).toBeUndefined();
    expect(response.products.map((item) => item.externalId)).toEqual(["expensive-all", "ninety"]);
    expect(response.message).toBe("Znalazłem 2 najdroższe pasujące produkty.");
  });

  it("does not accept hallucinated AI price ordering without explicit price language", () => {
    const response = buildConversationResponse({ message: "Gdzie kupię okap stacjonarnie?", products: [], extractedCriteria: { sortBy: "price_asc" } });
    expect(response.state.criteria.sortBy).toBeUndefined();
  });

  it("offers similar products when a configured store has only one result", () => {
    const response = buildConversationResponse({
      message: "", products: [matchingProduct], productActionsEnabled: true,
      state: { criteria: { widthCm: 60, maxPriceMinor: 250_000, material: "biały", priorityResolved: true } },
    });
    expect(response.products).toHaveLength(1);
    expect(response.suggestions).toEqual([{ label: "Pokaż podobne produkty", key: "similar", value: "one" }]);
  });
  it("turns a relative price request into a concrete threshold from the last result range",()=>{
    const higher={...matchingProduct,id:"higher",externalId:"higher",priceMinor:300_000};
    const response=buildConversationResponse({message:"Pokaż coś droższego niż te",products:[matchingProduct,higher],state:{criteria:{},intent:"unknown",productContext:{criteria:{widthCm:60,budgetResolved:true,priorityResolved:true},resultPriceRange:{minPriceMinor:150_000,maxPriceMinor:250_000}}}});
    expect(response.state.criteria).toMatchObject({widthCm:60,minPriceMinor:250_001,sortBy:"price_asc"});
    expect(response.products.map(product=>product.externalId)).toEqual(["higher"]);
    expect(response.message).toBe("Znalazłem 1 najbliższy droższy produkt.");
  });
  it("uses correct Polish plural forms in price-ordered summaries",()=>{
    const products=Array.from({length:5},(_,index)=>({...matchingProduct,id:String(index),externalId:String(index),priceMinor:(index+1)*100_000}));
    const response=buildConversationResponse({message:"Pokaż najtańsze okapy",products,state:{criteria:{widthCm:60,budgetResolved:true,priorityResolved:true}}});
    expect(response.message).toBe("Znalazłem 5 najtańszych pasujących produktów.");
  });
});
