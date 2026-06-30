export type RetaggingEligibility = "Eligible" | "Not eligible" | "Unknown / missing data";
export type BasicRetaggingEligible = "Yes" | "No";

export type RetaggingSeasonRecommendation =
  | "Already Basic / no action required"
  | "Basic retagging eligible - choose department manually"
  | "Retag to next season"
  | "Manual review"
  | "Clearance / phase out";

export type RetaggingSuggestedAction = RetaggingSeasonRecommendation;

export interface RetaggingDecisionConfig {
  market: "DE";
  sarThreshold: number;
  nmvThreshold: number;
  currentSeasonCode?: string;
  requiredDiscountThreshold?: number;
  currentDate?: Date;
}

export interface RetaggingDecisionRow {
  "SKU": string;
  "Zalando SKU": string;
  "EAN": string;
  "Article name": string;
  "Category": string;
  "Current season": string;
  "Article status": string;
  "Zalando issue/status code": string;
  "ZFS stock": number;
  "Internal Shopify stock": number;
  "NMV used as GMV proxy": number | "";
  "Units sold selected period": number | "";
  "Return rate, if available": number | "";
  "Size Availability Rate / SAR": number | "";
  "Current discount %": number | "";
  "Basic Retagging Eligible": BasicRetaggingEligible;
  "Retagging eligibility": RetaggingEligibility;
  "Retagging score": number;
  "Season recommendation": RetaggingSeasonRecommendation;
  "Operational note": string;
  "Suggested action": RetaggingSuggestedAction;
  "Reason / explanation": string;
  "Missing data / manual review note": string;
}

export interface RetaggingDecisionSummary {
  totalArticles: number;
  retagCandidates: number;
  basicsCandidates: number;
  manualReview: number;
  clearance: number;
}

export interface RetaggingDecisionResult {
  rows: RetaggingDecisionRow[];
  summary: RetaggingDecisionSummary;
  warnings: string[];
}
