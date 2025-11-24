import Papa from "papaparse";
import { downloadFile } from "./downloadHelper";

export const exportToTSV = (data: Record<string, any>[], filename: string) => {
  const tsv = Papa.unparse(data, {
    header: true,
    delimiter: "\t",
  });
  downloadFile(tsv, `${filename}.tsv`, "text/tab-separated-values");
};
