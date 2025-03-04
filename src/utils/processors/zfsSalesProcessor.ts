import { ZFSSaleEntry } from "@/types/sales";

export function processZFSSales(data: any[]): ZFSSaleEntry[] {
  const processed = data.map(item => {
    // Parse the date and calculate last sale date
    const firstOfferDate = item['Date first on offer'] || '';
    const daysOnline = parseInt(item['Days online'] || '0');
    const [day, month, year] = firstOfferDate.split('.').map(num => num.padStart(2, '0'));
    
    // Calculate the last sale date by adding (daysOnline - 1) to the first offer date
    const startDate = new Date(`${year}-${month}-${day}`);
    const lastSaleDate = new Date(startDate);
    lastSaleDate.setDate(lastSaleDate.getDate() + (daysOnline - 1));
    
    const formattedFirstDate = year && month && day ? `${year}-${month}-${day}` : '';
    const formattedLastDate = lastSaleDate.toISOString().split('T')[0];

    return {
      orderId: '',
      number: item['Article variant'] || '',
      customerOrderStatus: '',
      channel: '',
      paymentId: '',
      dispatched: 0,
      partnerId: '',
      shopId: '',
      invoiceNo: '',
      invoiceAmn: 0,
      invoiceShipping: 0,
      invoiceVAT: 0,
      invoiceShippingVAT: 0,
      orderTime: formattedLastDate, // Use the calculated last sale date
      transactionComment: '',
      customerInternalComment: '',
      taxFree: 0,
      temporaryReferrer: '',
      OverallDeliveryTrackingId: '',
      languageIso: item['Country'] || '',
      currency: '',
      currencyFactor: 1,
      articleId: item['Article variant'] || '',
      taxId: 0,
      taxRate: 0,
      statusId: 0,
      number_1: '',
      articlePrice: 0,
      quantity: parseInt(item['Sold articles'] || '0'),
      articleNameShipped: item['Brand'] || '',
      shippedReleaseMode: '',
      eanArticle: item['EAN'] || '',
      config: '',
      firstOfferDate: formattedFirstDate, // Keep track of when the item was first offered
      daysOnline: daysOnline // Store the days online for reference
    };
  });

  // Filter out entries with missing required data
  const filtered = processed.filter(item => {
    const isValid = item.eanArticle && item.orderTime;
    return isValid;
  });

  return filtered;
}