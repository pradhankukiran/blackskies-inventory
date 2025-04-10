import React, { useState, useEffect, useMemo, useCallback } from "react";
import { X, Search } from "lucide-react";
import { ProcessedSellerboardStock } from "@/types/processors";
import { usePagination } from "@/hooks/usePagination";
import { ExportButton } from "./ExportButton";
import { Pagination } from "./ui/pagination";
import { CoverageDaysSelector } from "./CoverageDaysSelector";
import { getStoredData, storeData } from "@/lib/indexedDB";
import { processSellerboardStock } from "@/utils/processors/sellerboardStockProcessor";

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

export const FBAStockTable: React.FC<FBAStockTableProps> = ({ data }) => {
  const [isClient, setIsClient] = useState(false);
  const [searchSku, setSearchSku] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [coverageDays, setCoverageDays] = useState(14);
  const [displayData, setDisplayData] = useState<ProcessedSellerboardStock[]>(data);

  // Update initial data once
  useEffect(() => {
    // Initialize display data from the props
    setDisplayData(data);
  }, [data]);

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

  // Load coverage days from IndexedDB when component mounts
  useEffect(() => {
    const loadCoverageDays = async () => {
      try {
        const savedData = await getStoredData('fba');
        if (savedData?.coverageDays) {
          setCoverageDays(savedData.coverageDays);
        }
      } catch (err) {
        console.error("Error loading coverage days:", err);
      }
    };
    
    loadCoverageDays();
  }, []);

  // Efficient coverage days change handler - save to IndexedDB and recalculate recommendations
  const handleCoverageDaysChange = async (days: number) => {
    setCoverageDays(days);
    
    // Recalculate the recommended quantities with the new coverage days
    try {
      const savedData = await getStoredData('fba');
      if (savedData?.parsedData?.sellerboardStock) {
        // Get the raw data that was used to generate the current recommendations
        const originalData = savedData.parsedData.sellerboardStock.map(item => ({
          ...item,
          // Add all original fields that are needed for recalculation
          SKU: item.SKU,
          "Estimated\nSales\nVelocity": item["Avg. Daily Sales"]
        }));

        // Get returns data if available
        let returnsData: any[] | null = null;
        // Access rawReturnsData safely (it might not exist in the type)
        if (savedData && 'rawReturnsData' in savedData && Array.isArray(savedData.rawReturnsData)) {
          returnsData = savedData.rawReturnsData;
        }

        // Instead of reprocessing everything, calculate only the new recommended quantities
        setDisplayData(prevData => {
          return prevData.map(item => {
            const dailySales = item["Avg. Daily Sales"] || 0;
            const refundPercentage = item["Avg. Return Rate (%)"] || 0;
            const fbaQuantity = item["FBA Quantity"] || 0;
            const unitsInTransit = item["Units In Transit"] || 0;
            const reservedUnits = item["Reserved Units"] || 0;
            const totalStock = fbaQuantity + unitsInTransit + reservedUnits;
            
            // Calculate new recommended quantity using the same formula as in sellerboardStockProcessor
            const newRecommendedQuantity = Math.round(
              dailySales * 
              days * 
              (1 - (refundPercentage / 100)) * 
              ((dailySales * 30) > 30 ? 1.2 : 1) - 
              totalStock
            );
            
            return {
              ...item,
              "Recommended Quantity": newRecommendedQuantity,
              "Coverage Period (Days)": days
            };
          });
        });
        
        // Update only the recommended quantity in the stored data
        const updatedStoredData = savedData.parsedData.sellerboardStock.map(item => {
          const dailySales = item["Avg. Daily Sales"] || 0;
          const refundPercentage = item["Avg. Return Rate (%)"] || 0;
          const fbaQuantity = item["FBA Quantity"] || 0;
          const unitsInTransit = item["Units In Transit"] || 0;
          const reservedUnits = item["Reserved Units"] || 0;
          const totalStock = fbaQuantity + unitsInTransit + reservedUnits;
          
          const newRecommendedQuantity = Math.round(
            dailySales * 
            days * 
            (1 - (refundPercentage / 100)) * 
            ((dailySales * 30) > 30 ? 1.2 : 1) - 
            totalStock
          );
          
          return {
            ...item,
            "Recommended Quantity": newRecommendedQuantity,
            "Coverage Period (Days)": days
          };
        });
        
        // Store the updated data
        await storeData({
          ...savedData,
          parsedData: {
            ...savedData.parsedData,
            sellerboardStock: updatedStoredData
          },
          coverageDays: days
        }, 'fba');
      } else {
        // If no processed data exists yet, just save the coverage days
        await storeData({
          parsedData: savedData?.parsedData || {
            internal: [],
            zfs: [],
            zfsShipments: [],
            zfsShipmentsReceived: [],
            skuEanMapper: [],
            zfsSales: [],
            integrated: [],
            sellerboardStock: []
          },
          recommendations: savedData?.recommendations || [],
          coverageDays: days
        }, 'fba');
      }
    } catch (err) {
      console.error("Error updating with new coverage days:", err);
    }
  };

  useEffect(() => {
    setIsClient(true);
  }, [data]);

  if (!isClient) {
    return null;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <CoverageDaysSelector value={coverageDays} onChange={handleCoverageDaysChange} />
        <div className="text-sm text-gray-700">
          {filteredData.length} items with {coverageDays} days coverage
        </div>
        <ExportButton
          data={displayData}
          label="Export FBA Stock Overview & Recommendation"
          filename="fba-stock-data"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex items-center space-x-2">
                    {isSearching ? (
                      <div className="flex items-center w-full">
                        <input
                          type="text"
                          value={searchSku}
                          onChange={(e) => setSearchSku(e.target.value)}
                          placeholder="Search SKU/ASIN..."
                          className="w-full px-2 py-1 text-sm border rounded-l focus:outline-none focus:ring-1 focus:ring-green-500"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            setIsSearching(false);
                            setSearchSku('');
                          }}
                          className="px-2 py-1 border border-l-0 rounded-r hover:bg-gray-100"
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
                    className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase ${
                      column.key === "FBA Quantity" ? "text-right" : ""
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.length > 0 ? (
                paginatedItems.map((item, index) => (
                  <tr key={`${item.SKU}-${index}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900">{item.SKU}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.ASIN}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["FBA Quantity"]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Units In Transit"]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Reserved Units"]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["FBA Quantity"] + item["Units In Transit"] + item["Reserved Units"]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Internal Stock"]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Recommended Quantity"]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Avg. Daily Sales"]?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Avg. Total Sales (30 Days)"]?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {item["Avg. Return Rate (%)"]?.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={DISPLAY_COLUMNS.length + 1}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 sticky bottom-0">
          <div className="text-sm text-gray-500">
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