import * as XLSX from "xlsx";

export const exportToXLSX = (data: Record<string, any>[], filename: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Data");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};
