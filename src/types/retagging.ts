export type RetaggingEligibility = "Eligible" | "Not eligible" | "Unknown / missing data";

export type RetaggingSeasonRecommendation =
  | "Already YRB / no action required"
  | "Already SS_Basics / no action required"
  | "Already AW_Basics / no action required"
  | "Retag to next season"
  | "Apply for Year-Round Basic"
  | "Apply for SS_Basics"
  | "Apply for AW_Basics"
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
  "EAN": string;
  "Article name": string;
  "Category": string;
  "Current season": string;
  "Current classification": string;
  "Article status": string;
  "Zalando issue/status code": string;
  "ZFS stock": number;
  "Internal Shopify stock": number;
  "NMV used as GMV proxy": number | "";
  "Units sold last 12 months": number | "";
  "Return rate, if available": number | "";
  "Size Availability Rate / SAR": number | "";
  "Current discount %": number | "";
  "YRB eligibility": RetaggingEligibility;
  "SS_Basics eligibility": RetaggingEligibility;
  "AW_Basics eligibility": RetaggingEligibility;
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
