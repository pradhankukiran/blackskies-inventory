import { ZFSSaleEntry } from "@/types/sales";

export function processZFSSales(data: any[]): ZFSSaleEntry[] {
  return data.map(item => {
    // Parse date
    const [day, month, year] = (item['Date first on offer'] || '').split('.');
    const formattedDate = `${year}-${month}-${day}`;
    
    return {
      EAN: item.EAN,
      'Article variant': item['Article variant'],
      'Days online': item['Days online'],
      'Sold articles': parseInt(item['Sold articles']) || 0,
      'Return rate (%)': parseFloat(item['Return rate (%)']) || 0,
      'PDP views': parseInt(item['PDP views']) || 0,
      'Conversion rate (%)': parseFloat(item['Conversion rate (%)']) || 0,
      'Date first on offer': formattedDate,
      Brand: item.Brand || '',
      Country: item.Country || ''
    } as ZFSSaleEntry;
  });
}