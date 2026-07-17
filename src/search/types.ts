export interface ProductSearchCriteria {
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  widthCm?: number;
  hoodType?: string;
  material?: string;
  operatingMode?: string;
  minEfficiencyM3h?: number;
  maxNoiseDb?: number;
  onlyAvailable?: boolean;
  limit?: number;
}

export interface SearchableProduct {
  id: string;
  externalId: string;
  title: string;
  descriptionText: string;
  priceMinor: number;
  salePriceMinor: number | null;
  currency: string;
  availability: string;
  productUrl: string;
  imageUrl: string;
  attributes: Record<string, unknown>;
  dataQualityScore: number;
}

export interface ProductSearchResult extends SearchableProduct {
  effectivePriceMinor: number;
  score: number;
  reasons: string[];
  matchedAttributes: Record<string, string | number | boolean>;
}
