import React, { useState, useEffect, useMemo } from "react";
import { X, Search } from "lucide-react";
import { ProcessedSellerboardStock } from "@/types/processors";
import { usePagination } from "@/hooks/usePagination";
import { ExportButton } from "./ExportButton";
import { Pagination } from "./ui/pagination";
import { CoverageDaysSelector } from "./CoverageDaysSelector";
import { FactorAdjuster } from "./FactorAdjuster";
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
  const [isSearching, setIsSearching] = useState(false);
  const [coverageDays, setCoverageDays] = useState(14);
  const [safetyFactor, setSafetyFactor] = useState(0);
  const [trendFactor, setTrendFactor] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [displayData, setDisplayData] = useState<ProcessedSellerboardStock[]>(data);

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

  if (!isClient) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="ops-surface flex min-h-0 flex-1 flex-col rounded-[8px]">
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
            <ExportButton
              data={displayData}
              label="Export FBA Stock Overview & Recommendation"
              filename="fba-stock-data"
            />
          </div>
        </div>
        <div className="overflow-auto flex-1">
          <table className="ops-table">
            <thead>
              <tr>
                <th>
                  <div className="flex items-center space-x-2">
                    {isSearching ? (
                      <div className="flex items-center w-full">
                        <input
                          type="text"
                          value={searchSku}
                          onChange={(e) => setSearchSku(e.target.value)}
                          placeholder="Search SKU/ASIN..."
                          className="ops-input w-full"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            setIsSearching(false);
                            setSearchSku('');
                          }}
                          className="border border-l-0 border-slate-300 px-3 py-3 hover:bg-slate-100"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>SKU/ASIN</span>
                        <button
                          onClick={() => setIsSearching(true)}
                          className="hover:text-green-600 transition-colors"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </th>
                {DISPLAY_COLUMNS.slice(1).map((column) => (
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
                    colSpan={DISPLAY_COLUMNS.length + 1}
                    className="px-4 py-8 text-center text-base text-slate-500"
                  >
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-base text-slate-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
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
