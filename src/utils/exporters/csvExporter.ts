import Papa from "papaparse";
import { IntegratedStockData } from "@/types/stock";
import { downloadFile } from "./downloadHelper";

export const exportToCSV = (data: IntegratedStockData[], filename: string) => {
  const csv = Papa.unparse(data, {
    header: true,
    delimiter: ",",
  });
  downloadFile(csv, `${filename}.csv`, "text/csv");
};
