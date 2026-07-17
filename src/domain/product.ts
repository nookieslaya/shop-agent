export type AttributeSource = "feed" | "product_page" | "description" | "ai" | "manual";

export interface SourcedValue<T> {
  value: T;
  source: AttributeSource;
  confidence: number;
  rawValue?: string;
}

export interface FeedProduct {
  externalId: string;
  title: string;
  descriptionHtml: string;
  productUrl: string;
  imageUrl: string;
  additionalImageUrls: string[];
  price: number;
  salePrice?: number;
  currency: string;
  availability: string;
  brand?: string;
  gtin?: string;
  category?: string;
  size?: string;
  energyClass?: string;
  customLabels: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface TechnicalRow { label: string; value: string }

export interface PerformanceLevel {
  level: number;
  noiseDb: number;
  efficiencyM3h: number;
  intensive: boolean;
}

export interface HoodAttributes {
  hoodType?: SourcedValue<string>;
  energyClass?: SourcedValue<string>;
  warrantyMonths?: SourcedValue<number>;
  operatingModes?: SourcedValue<string[]>;
  material?: SourcedValue<string>;
  widthCm?: SourcedValue<number>;
  availableWidthsCm?: SourcedValue<number[]>;
  controlType?: SourcedValue<string>;
  timer?: SourcedValue<boolean>;
  lighting?: SourcedValue<string>;
  maxTurbineEfficiencyM3h?: SourcedValue<number>;
  speedLevels?: SourcedValue<number>;
  performanceLevels?: SourcedValue<PerformanceLevel[]>;
  productionCountry?: SourcedValue<string>;
  setContents?: SourcedValue<string>;
  supportsSuperSilentHome?: SourcedValue<boolean>;
  supportsSuperSilentKitchen?: SourcedValue<boolean>;
}

export interface EnrichedProduct {
  feed: FeedProduct;
  technicalRows: TechnicalRow[];
  attributes: HoodAttributes;
  warnings: string[];
  dataQualityScore: number;
}
