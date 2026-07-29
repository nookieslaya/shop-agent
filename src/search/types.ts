export type FilterOperator = "eq" | "in" | "gte" | "lte" | "contains";
export type FilterValue = string | number | boolean | Array<string | number>;

export interface ProductFilter {
  facetId: string;
  operator: FilterOperator;
  value: FilterValue;
  importance?: "required" | "preferred";
}

export interface ProductPreference {
  id?: string;
  facetId: string;
  direction?: "min" | "max";
  targetValue?: string | number | boolean;
  weight: number;
}

export interface ProductSearchCriteria {
  filters?: ProductFilter[];
  preferences?: ProductPreference[];
  query?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  targetPriceMinor?: number;
  relativePrice?: "higher" | "lower";
  widthCm?: number;
  hoodType?: string;
  hoodTypeValues?: string[];
  category?: string;
  catalogView?: "products" | "categories";
  material?: string;
  operatingMode?: string;
  minEfficiencyM3h?: number;
  maxNoiseDb?: number;
  onlyAvailable?: boolean;
  limit?: number;
  sortBy?: "relevance" | "price_asc" | "price_desc" | "price_nearest";
  budgetResolved?: boolean;
  priceMode?: "bounded" | "unbounded" | "target";
  catalogWide?: boolean;
  priorityResolved?: boolean;
}

export interface SearchableProduct {
  id: string;
  externalId: string;
  title: string;
  descriptionText: string;
  category?: string | null;
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
  matchReasons: Array<{
    facetId: string;
    label: string;
    message: string;
    contribution: number;
  }>;
  mismatches: Array<{ facetId: string; message: string }>;
}
