import { ZFSSaleEntry } from "@/types/sales";

export function processZFSSales(data: any[]): ZFSSaleEntry[] {
  return data.map(item => ({
    orderId: item.orderId || '',
    number: item.number || '',
    customerOrderStatus: item.customerOrderStatus || '',
    channel: item.channel || '',
    paymentId: item.paymentId || '',
    dispatched: parseInt(item.dispatched) || 0,
    partnerId: item.partnerId || '',
    shopId: item.shopId || '',
    invoiceNo: item.invoiceNo || '',
    invoiceAmn: parseFloat(item.invoiceAmn) || 0,
    invoiceShipping: parseFloat(item.invoiceShipping) || 0,
    invoiceVAT: parseFloat(item.invoiceVAT) || 0,
    invoiceShippingVAT: parseFloat(item.invoiceShippingVAT) || 0,
    orderTime: item.orderTime || '',
    transactionComment: item.transactionComment || '',
    customerInternalComment: item.customerInternalComment || '',
    taxFree: parseInt(item.taxFree) || 0,
    temporaryReferrer: item.temporaryReferrer || '',
    OverallDeliveryTrackingId: item.OverallDeliveryTrackingId || '',
    languageIso: item.languageIso || '',
    currency: item.currency || '',
    currencyFactor: parseFloat(item.currencyFactor) || 0,
    articleId: item.articleId || '',
    taxId: parseInt(item.taxId) || 0,
    taxRate: parseFloat(item.taxRate) || 0,
    statusId: parseInt(item.statusId) || 0,
    number_1: item.number_1 || '',
    articlePrice: parseFloat(item.articlePrice) || 0,
    quantity: parseInt(item.quantity) || 0,
    articleNameShipped: item.articleName || '', // Changed from articleNameShipped to articleName
    shippedReleaseMode: item.shippedReleaseMode || '',
    eanArticle: item.eanArticle || '',
    config: item.config || ''
  }));
}