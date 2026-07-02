import React, { useState, useEffect, useMemo, useRef } from "react";
import { Download, Search } from "lucide-react";
import { ProcessedSellerboardStock } from "@/types/processors";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "./ui/pagination";
import { CoverageDaysSelector } from "./CoverageDaysSelector";
import { FactorAdjuster } from "./FactorAdjuster";
import { exportToCSV } from "@/utils/exporters/csvExporter";
import { exportToXLSX } from "@/utils/exporters/xlsxExporter";
import {
  loadFbaSettings,
  saveFbaSafetyFactor,
  saveFbaSellerboardStock,
  saveFbaTrendFactor
} from "@/lib/appPersistence";

interface FBAStockTableProps {
  data: ProcessedSellerboardStock[];
}

const ITEMS_PER_PAGE = 25;

const COLUMNS = [
  { key: "SKU", label: "SKU" },
  { key: "ASIN", label: "ASIN" },
  { key: "Product Name", label: "Product Name" },
  { key: "FBA Quantity", label: "FBA Quantity" },
  { key: "Units In Transit", label: "Units in Transit" },
  { key: "Reserved Units", label: "Reserved Units" },
  { key: "Total Stock", label: "Total Stock" },
  { key: "Internal Stock", label: "Internal Stock" },
  { key: "Recommended Quantity", label: "Recommended Quantity" },
  { key: "Avg. Daily Sales", label: "Avg. Daily Sales" },
  { key: "Avg. Total Sales (30 Days)", label: "Avg. Total Sales (30 Days)" },
  { key: "Avg. Return Rate (%)", label: "Avg. Return Rate (%)" }
] as const;

// Display columns (excluding Product Name)
const DISPLAY_COLUMNS = COLUMNS.filter(column => column.key !== "Product Name");

// Recalculate a single item using the FBA formula (mirrors sellerboardStockProcessor)
function recalcItem(
  item: ProcessedSellerboardStock,
  days: number,
  safety: number,
  trend: number
): ProcessedSellerboardStock {
  const dailySales = item["Avg. Daily Sales"] || 0;
  const refundPercentage = item["Avg. Return Rate (%)"] || 0;
  const fbaQuantity = item["FBA Quantity"] || 0;
  const unitsInTransit = item["Units In Transit"] || 0;
  const reservedUnits = item["Reserved Units"] || 0;
  const totalStock = fbaQuantity + unitsInTransit + reservedUnits;

  let newRecommendedQuantity = Math.round(
    dailySales *
      days *
      (1 - refundPercentage / 100) *
      (1 + safety / 100) *
      (1 + trend / 100) *
      ((dailySales * 30) > 10 ? 1.2 : 1) -
      totalStock
  );

  newRecommendedQuantity = Math.max(0, newRecommendedQuantity);

  if (
    newRecommendedQuantity === 0 &&
    totalStock === 0 &&
    (item["Internal Stock"] || 0) > 0
  ) {
    newRecommendedQuantity = 1;
  }

  return {
    ...item,
    "Recommended Quantity": newRecommendedQuantity,
    "Coverage Period (Days)": days,
  };
}

export const FBAStockTable: React.FC<FBAStockTableProps> = ({ data }) => {
  const [isClient, setIsClient] = useState(false);
  const [searchSku, setSearchSku] = useState('');
  const [coverageDays, setCoverageDays] = useState(14);
  const [safetyFactor, setSafetyFactor] = useState(0);
  const [trendFactor, setTrendFactor] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [displayData, setDisplayData] = useState<ProcessedSellerboardStock[]>(data);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);

  // Re-apply factors whenever the data prop or any setting changes
  useEffect(() => {
    setDisplayData(data.map((item) => recalcItem(item, coverageDays, safetyFactor, trendFactor)));
  }, [data, coverageDays, safetyFactor, trendFactor]);

  const filteredData = useMemo(() => {
    if (!searchSku) return displayData;
    return displayData.filter(item =>
      item.SKU.toLowerCase().includes(searchSku.toLowerCase()) ||
      item.ASIN.toLowerCase().includes(searchSku.toLowerCase())
    );
  }, [displayData, searchSku]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredData,
    ITEMS_PER_PAGE
  );

  // Load recommendation settings from persistence when component mounts
  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const settings = await loadFbaSettings();
        if (!cancelled) {
          setCoverageDays(settings.coverageDays);
          setSafetyFactor(settings.safetyFactor);
          setTrendFactor(settings.trendFactor);
        }
      } catch (err) {
        console.error("Error loading FBA recommendation settings:", err);
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist factors immediately when they change
  useEffect(() => {
    if (settingsLoaded) {
      saveFbaSafetyFactor(safetyFactor);
    }
  }, [safetyFactor, settingsLoaded]);

  useEffect(() => {
    if (settingsLoaded) {
      saveFbaTrendFactor(trendFactor);
    }
  }, [trendFactor, settingsLoaded]);

  // Persist coverage days + recalculated stock to IndexedDB when any input changes
  const persistRecalc = async (days: number, safety: number, trend: number) => {
    try {
      const updatedStoredData = data.map((item) =>
        recalcItem(item, days, safety, trend)
      );
      await saveFbaSellerboardStock(updatedStoredData, days);
    } catch (err) {
      console.error('Error persisting FBA recalc:', err);
    }
  };

  const handleCoverageDaysChange = (days: number) => {
    setCoverageDays(days);
    persistRecalc(days, safetyFactor, trendFactor);
  };

  const handleSafetyFactorChange = (value: number) => {
    setSafetyFactor(value);
    persistRecalc(coverageDays, value, trendFactor);
  };

  const handleTrendFactorChange = (value: number) => {
    setTrendFactor(value);
    persistRecalc(coverageDays, safetyFactor, value);
  };

  useEffect(() => {
    setIsClient(true);
  }, [data]);

  const exportRows = useMemo(() => (
    displayData.map((item) => ({
      "SKU": item.SKU,
      "ASIN": item.ASIN,
      "Product Name": item["Product Name"],
      "FBA Quantity": item["FBA Quantity"],
      "Units In Transit": item["Units In Transit"],
      "Reserved Units": item["Reserved Units"],
      "Total Stock": item["FBA Quantity"] + item["Units In Transit"] + item["Reserved Units"],
      "Internal Stock": item["Internal Stock"],
      "Recommended Quantity": item["Recommended Quantity"],
      "Avg. Daily Sales": Number(item["Avg. Daily Sales"]?.toFixed(2) || 0),
      "Avg. Total Sales (30 Days)": Math.round(item["Avg. Total Sales (30 Days)"] || 0),
      "Avg. Return Rate (%)": Number(item["Avg. Return Rate (%)"]?.toFixed(2) || 0),
      "Coverage Period (Days)": item["Coverage Period (Days)"] || coverageDays,
    }))
  ), [coverageDays, displayData]);

  const exportFilename = `fba-stock-data-${new Date().toISOString().split("T")[0]}`;

  const exportCsv = () => {
    if (!exportRows.length) return;
    exportToCSV(exportRows, exportFilename);
  };

  const exportXlsx = () => {
    if (!exportRows.length) return;
    exportToXLSX(exportRows, exportFilename);
  };

  const handleTablePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !tableScrollRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,a")) return;

    tableDragRef.current = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: tableScrollRef.current.scrollLeft,
    };
    setIsTableDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tableDragRef.current.isDragging || !tableScrollRef.current) return;
    event.preventDefault();
    const deltaX = event.clientX - tableDragRef.current.startX;
    tableScrollRef.current.scrollLeft = tableDragRef.current.scrollLeft - deltaX;
  };

  const stopTableDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tableDragRef.current.isDragging) return;
    tableDragRef.current.isDragging = false;
    setIsTableDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!isClient) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="ops-surface flex min-h-0 flex-1 flex-col rounded-[8px]">
        <div className="ops-section-header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="ops-title">FBA Stock Overview & Recommendation</h3>
              <p className="ops-muted mt-1">
                {filteredData.length.toLocaleString()} of {displayData.length.toLocaleString()} SKU rows.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!exportRows.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={exportXlsx}
                disabled={!exportRows.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <CoverageDaysSelector value={coverageDays} onChange={handleCoverageDaysChange} />
            <FactorAdjuster label="Safety Factor" value={safetyFactor} onChange={handleSafetyFactorChange} />
            <FactorAdjuster label="Trend Factor" value={trendFactor} onChange={handleTrendFactorChange} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="text-base text-slate-700">
              {filteredData.length} items with {coverageDays} days coverage
            </div>
            <label className="relative min-w-[260px] flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchSku}
                onChange={(event) => setSearchSku(event.target.value)}
                placeholder="Search SKU or ASIN"
                className="ops-input w-full pl-10 pr-4"
              />
            </label>
          </div>
        </div>
        <div
          ref={tableScrollRef}
          className={`flex-1 overflow-auto ${
            isTableDragging ? "cursor-grabbing select-none" : "cursor-grab"
          }`}
          title="Drag horizontally to scroll the table"
          onPointerDown={handleTablePointerDown}
          onPointerMove={handleTablePointerMove}
          onPointerUp={stopTableDrag}
          onPointerCancel={stopTableDrag}
          onPointerLeave={stopTableDrag}
        >
          <table className="ops-table min-w-[1700px]">
            <thead>
              <tr>
                {DISPLAY_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`${
                      column.key === "FBA Quantity" ? "text-right" : ""
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((item, index) => (
                  <tr key={`${item.SKU}-${index}`}>
                    <td>{item.SKU}</td>
                    <td>{item.ASIN}</td>
                    <td className="text-right font-medium tabular-nums">
                      {item["FBA Quantity"]}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {item["Units In Transit"]}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {item["Reserved Units"]}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {item["FBA Quantity"] + item["Units In Transit"] + item["Reserved Units"]}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {item["Internal Stock"]}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {item["Recommended Quantity"]}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {item["Avg. Daily Sales"]?.toFixed(2)}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {Math.round(item["Avg. Total Sales (30 Days)"] || 0)}
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {item["Avg. Return Rate (%)"]?.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={DISPLAY_COLUMNS.length}
                    className="px-4 py-12 text-center"
                  >
                    <div className="mx-auto max-w-lg">
                      <div className="text-base font-semibold text-slate-950">No matching FBA rows</div>
                      <div className="mt-1 text-base text-slate-500">
                        Adjust the search or confirm the uploaded files contain Sellerboard rows.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-base text-slate-500">
            Showing {filteredData.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of{" "}
            {filteredData.length} entries
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        </div>
      </div>
    </div>
  );
};
