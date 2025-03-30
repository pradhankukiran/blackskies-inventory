import Papa from "papaparse";
import { downloadFile } from "./downloadHelper";

export const exportToCSV = (data: Record<string, any>[], filename: string) => {
  const csv = Papa.unparse(data, {
    header: true,
    delimiter: ",",
  });
  downloadFile(csv, `${filename}.csv`, "text/csv");
};
