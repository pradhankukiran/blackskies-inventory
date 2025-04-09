import React, { useState, useEffect, useMemo } from "react";
import { X, Search } from "lucide-react";
import { ProcessedSellerboardStock } from "@/types/processors";
import { usePagination } from "@/hooks/usePagination";
import { ExportButton } from "./ExportButton";
import { Pagination } from "./ui/pagination";

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
  { key: "Avg. Daily Sales", label: "Avg. Daily Sales" },
  { key: "Avg. Total Sales (30 Days)", label: "Avg. Total Sales (30 Days)" },
  { key: "Avg. Return Rate (%)", label: "Avg. Return Rate (%)" }
] as const;

export const FBAStockTable: React.FC<FBAStockTableProps> = ({ data }) => {
  const [isClient, setIsClient] = useState(false);
  const [searchSku, setSearchSku] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const filteredData = useMemo(() => {
    if (!searchSku) return data;
    return data.filter(item => 
      item.SKU.toLowerCase().includes(searchSku.toLowerCase()) ||
      item.ASIN.toLowerCase().includes(searchSku.toLowerCase())
    );
  }, [data, searchSku]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredData,
    ITEMS_PER_PAGE
  );

  useEffect(() => {
    setIsClient(true);
  }, [data]);

  if (!isClient) {
    return null;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-end mb-4">
        <ExportButton
          data={data}
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
                {COLUMNS.slice(1).map((column) => (
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
                    <td className="px-4 py-3 text-sm text-gray-900">{item["Product Name"]}</td>
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
                    colSpan={COLUMNS.length}
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