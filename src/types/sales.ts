export interface ZFSSaleEntry {
  orderId: string;
  number: string;
  customerOrderStatus: string;
  channel: string;
  paymentId: string;
  dispatched: number;
  partnerId: string;
  shopId: string;
  invoiceNo: string;
  invoiceAmn: number;
  invoiceShipping: number;
  invoiceVAT: number;
  invoiceShippingVAT: number;
  orderTime: string;
  transactionComment: string;
  customerInternalComment: string;
  taxFree: number;
  temporaryReferrer: string;
  OverallDeliveryTrackingId: string;
  languageIso: string;
  currency: string;
  currencyFactor: number;
  articleId: string;
  taxId: number;
  taxRate: number;
  statusId: number;
  number_1: string;
  articlePrice: number;
  quantity: number;
  articleNameShipped: string;
  shippedReleaseMode: string;
  eanArticle: string;
  config: string;
}

export interface ArticleRecommendation {
  articleId: string;
  articleName: string;
  recommendedDays: number;
  averageDailySales: number;
  recommendedStock: number;
  totalSales: number;
  lastSaleDate: string;
  firstSaleDate: string;
}