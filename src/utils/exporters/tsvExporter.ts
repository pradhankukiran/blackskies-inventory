import Papa from "papaparse";
import { IntegratedStockData } from "@/types/stock";
import { downloadFile } from "./downloadHelper";

export const exportToTSV = (data: IntegratedStockData[], filename: string) => {
  const tsv = Papa.unparse(data, {
    header: true,
    delimiter: "\t",
  });
  downloadFile(tsv, `${filename}.tsv`, "text/tab-separated-values");
};
