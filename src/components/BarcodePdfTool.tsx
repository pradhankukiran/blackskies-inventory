import React, { useState } from "react";
import { Barcode, SlidersHorizontal } from "lucide-react";
import { FileUploadSection } from "@/components/FileUploadSection";

type DataSource = "csv" | "shopify";
type Brand = "blackskies" | "akitsune";
type OutputMode = "combined" | "individual";

const previewColumns = ["SKU", "Article name", "Color", "Size", "EAN"];

export const BarcodePdfTool: React.FC = () => {
  const [dataSource, setDataSource] = useState<DataSource>("csv");
  const [brand, setBrand] = useState<Brand>("blackskies");
  const [outputMode, setOutputMode] = useState<OutputMode>("combined");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setCsvFile(null);
      setUploadError("Upload a CSV file.");
      return;
    }

    setCsvFile(selectedFile);
    setUploadError(null);
  };

  const handleCsvRemove = () => {
    setCsvFile(null);
    setUploadError(null);
  };

  const previewMessage =
    dataSource === "csv"
      ? csvFile
        ? "The uploaded CSV will appear here after barcode processing is added."
        : "Upload a CSV to preview its barcode labels."
      : "Shopify products will appear here after the Shopify connection is added.";

  const selectedBrand = brand === "blackskies" ? "Blackskies" : "Akitsune";
  const selectedSource = dataSource === "csv" ? "CSV upload" : "Shopify";
  const selectedOutput = outputMode === "combined" ? "combined PDF" : "individual PDFs";

  return (
    <div className="space-y-5">
      <section className="ops-surface rounded-[8px]">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h2 className="ops-title">Barcode Configuration</h2>
              <p className="ops-muted">Choose the product source, label brand, and PDF format.</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            90 × 50 mm · EAN-13
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="text-base font-medium text-slate-700">Data source</span>
            <select
              value={dataSource}
              onChange={(event) => setDataSource(event.target.value as DataSource)}
              className="ops-input mt-1 w-full"
            >
              <option value="csv">CSV upload</option>
              <option value="shopify">Shopify</option>
            </select>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">Brand</span>
            <select
              value={brand}
              onChange={(event) => setBrand(event.target.value as Brand)}
              className="ops-input mt-1 w-full"
            >
              <option value="blackskies">Blackskies — www.blackskies.shop</option>
              <option value="akitsune">Akitsune — www.akitsune.com</option>
            </select>
          </label>

          <label className="block">
            <span className="text-base font-medium text-slate-700">PDF output</span>
            <select
              value={outputMode}
              onChange={(event) => setOutputMode(event.target.value as OutputMode)}
              className="ops-input mt-1 w-full"
            >
              <option value="combined">Combined PDF</option>
              <option value="individual">Individual PDFs (ZIP)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-base text-slate-600">
            Current setup: {selectedSource}, {selectedBrand}, {selectedOutput}.
          </p>
          <button type="button" disabled className="ops-button-primary px-6">
            <Barcode className="h-4 w-4" aria-hidden="true" />
            Generate PDFs
          </button>
        </div>
      </section>

      {dataSource === "csv" ? (
        <div className="space-y-2">
          <FileUploadSection
            title="Product CSV"
            files={csvFile ? [csvFile] : []}
            onChange={handleCsvChange}
            onRemove={handleCsvRemove}
            acceptedFileTypes=".csv,text/csv"
          />
          <p className="px-1 text-sm text-slate-500">
            Required columns: SKU, EAN, ARTICLE_NAME, COLOR, and SIZE.
          </p>
          {uploadError && (
            <p className="px-1 text-sm font-medium text-red-700" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      ) : (
        <section className="ops-surface rounded-[8px]" aria-labelledby="shopify-source-title">
          <div className="ops-section-header">
            <h2 id="shopify-source-title" className="ops-title">
              Shopify Product Data
            </h2>
            <p className="ops-muted">
              Load the product details required for the barcode labels.
            </p>
          </div>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-medium text-slate-700">No Shopify products loaded</p>
              <p className="mt-1 text-base text-slate-500">
                Shopify loading will be connected in a later update. No product data is loaded yet.
              </p>
            </div>
            <button type="button" disabled className="ops-button-secondary whitespace-nowrap">
              Load from Shopify
            </button>
          </div>
        </section>
      )}

      <section className="ops-surface rounded-[8px]" aria-labelledby="barcode-preview-title">
        <div className="ops-section-header flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="barcode-preview-title" className="ops-title">
              Barcode Label Preview
            </h2>
            <p className="ops-muted">Review the product data before generating the labels.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-base font-medium text-blue-700">
            0 labels ready
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="ops-table min-w-full">
            <thead>
              <tr>
                {previewColumns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={previewColumns.length} className="py-10 text-center text-slate-500">
                  {previewMessage}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
