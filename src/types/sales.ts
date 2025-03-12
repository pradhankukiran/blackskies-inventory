export interface ZFSSaleEntry {
  EAN: string;
  'Article variant': string;
  'Days online': string;
  'Sold articles': number;
  'Return rate (%)': number;
  'PDP views': number;
  'Conversion rate (%)': number;
  'Date first on offer': string;
  Brand: string;
  Country: string;
}

export interface ArticleRecommendation {
  articleId: string;
  ean: string;
  articleName: string;
  partnerVariantSize: string;
  recommendedDays: number;
  averageDailySales: number;
  recommendedStock: number;
  totalSales: number;
  averageReturnRate: number;
  firstSaleDate: string;
  statusDescription?: string;
  zfsTotal?: number;
  sellablePFStock?: number;
  statusCluster?: string;
}