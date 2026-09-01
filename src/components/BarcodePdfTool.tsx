import React, { useState } from "react";
import { Barcode, FileSpreadsheet, PackageOpen, Store } from "lucide-react";
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

  return (
    <section className="mx-auto max-w-6xl space-y-5 pb-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-slate-950 text-white">
            <Barcode className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Barcode PDFs</h1>
            <p className="mt-1 text-base text-slate-500">
              Create print-ready product barcode labels from a CSV or Shopify.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="ops-surface rounded-[8px] p-5">
          <legend className="text-base font-semibold text-slate-950">Data source</legend>
          <p className="mt-1 text-sm text-slate-500">Choose where the product details will come from.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label
              className={`cursor-pointer rounded-[8px] border p-4 transition-colors ${
                dataSource === "csv"
                  ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="barcode-data-source"
                value="csv"
                checked={dataSource === "csv"}
                onChange={() => setDataSource("csv")}
                className="sr-only"
              />
              <FileSpreadsheet className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <span className="mt-3 block text-base font-semibold text-slate-950">CSV upload</span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">
                Upload product label details from a CSV file.
              </span>
            </label>

            <label
              className={`cursor-pointer rounded-[8px] border p-4 transition-colors ${
                dataSource === "shopify"
                  ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="barcode-data-source"
                value="shopify"
                checked={dataSource === "shopify"}
                onChange={() => setDataSource("shopify")}
                className="sr-only"
              />
              <Store className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <span className="mt-3 block text-base font-semibold text-slate-950">Shopify</span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">
                Load product label details directly from Shopify.
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="ops-surface rounded-[8px] p-5">
          <legend className="text-base font-semibold text-slate-950">Brand</legend>
          <p className="mt-1 text-sm text-slate-500">Select the logo and website for each label.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                { value: "blackskies", label: "Blackskies", website: "www.blackskies.shop" },
                { value: "akitsune", label: "Akitsune", website: "www.akitsune.com" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-[8px] border p-4 transition-colors ${
                  brand === option.value
                    ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="barcode-brand"
                  value={option.value}
                  checked={brand === option.value}
                  onChange={() => setBrand(option.value)}
                  className="sr-only"
                />
                <span className="block text-base font-semibold text-slate-950">{option.label}</span>
                <span className="mt-1 block text-sm text-slate-500">{option.website}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

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
        <section className="ops-surface rounded-[8px] p-5" aria-labelledby="shopify-source-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="shopify-source-title" className="text-base font-semibold text-slate-950">
                Shopify product data
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Shopify loading will be connected in a later update. No product data is loaded yet.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-[6px] bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500"
            >
              Load from Shopify
            </button>
          </div>
        </section>
      )}

      <fieldset className="ops-surface rounded-[8px] p-5">
        <legend className="text-base font-semibold text-slate-950">PDF output</legend>
        <p className="mt-1 text-sm text-slate-500">Choose how the generated labels will be delivered.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label
            className={`cursor-pointer rounded-[8px] border p-4 transition-colors ${
              outputMode === "combined"
                ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="barcode-output"
              value="combined"
              checked={outputMode === "combined"}
              onChange={() => setOutputMode("combined")}
              className="sr-only"
            />
            <span className="block text-base font-semibold text-slate-950">Combined PDF</span>
            <span className="mt-1 block text-sm leading-5 text-slate-500">
              One 90 × 50 mm label page for every selected EAN.
            </span>
          </label>

          <label
            className={`cursor-pointer rounded-[8px] border p-4 transition-colors ${
              outputMode === "individual"
                ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="barcode-output"
              value="individual"
              checked={outputMode === "individual"}
              onChange={() => setOutputMode("individual")}
              className="sr-only"
            />
            <span className="block text-base font-semibold text-slate-950">Individual PDFs</span>
            <span className="mt-1 block text-sm leading-5 text-slate-500">
              One PDF per EAN, packaged together in a ZIP file.
            </span>
          </label>
        </div>
      </fieldset>

      <section className="ops-surface overflow-hidden rounded-[8px]" aria-labelledby="barcode-preview-title">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="barcode-preview-title" className="text-base font-semibold text-slate-950">
              Label preview
            </h2>
            <p className="mt-1 text-sm text-slate-500">0 labels ready</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-[999px] bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">
            <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Awaiting data
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {previewColumns.map((column) => (
                  <th key={column} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={previewColumns.length} className="px-5 py-10 text-center text-sm text-slate-500">
                  {previewMessage}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">Barcode processing and PDF generation will be added next.</p>
        <button
          type="button"
          disabled
          className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-[6px] bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500"
        >
          <Barcode className="h-4 w-4" aria-hidden="true" />
          Generate PDFs
        </button>
      </div>
    </section>
  );
};
