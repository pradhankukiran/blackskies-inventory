import React, { useState, useEffect, useMemo } from "react";
import { IntegratedStockData } from "@/types/stock";
import { StockTableRow } from "./StockTableRow";
import { Pagination } from "./ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { ExportButton } from "./ExportButton";
import { Search, X } from "lucide-react";

interface StockTableProps {
  data: IntegratedStockData[];
}

const ITEMS_PER_PAGE = 25;

const COLUMNS = [
  { key: "EAN", label: "EAN" },
  { key: "partner_variant_size", label: "Partner Variant Size" },
  { key: "Product Name", label: "Article Name" },
  { key: "Status Description", label: "Status Description" },
  { key: "ZFS Total", label: "ZFS Total" },
  { key: "Available Stock", label: "Sellable PF Stock" },
  { key: "Status Cluster", label: "Status Cluster" },
] as const;

export const StockTable: React.FC<StockTableProps> = ({ data }) => {
  const [isClient, setIsClient] = useState(false);
  const [searchEan, setSearchEan] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const dataWithTotal = data.map((item) => ({
    ...item,
    "ZFS Total": item["ZFS Quantity"] + item["ZFS Pending Shipment"],
  }));

  const filteredData = useMemo(() => {
    if (!searchEan) return dataWithTotal;
    return dataWithTotal.filter(item => 
      item.EAN.toLowerCase().includes(searchEan.toLowerCase())
    );
  }, [dataWithTotal, searchEan]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredData,
    ITEMS_PER_PAGE
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-end mb-4">
        <ExportButton
          data={dataWithTotal}
          label="Export Stock Overview"
          filename="stock-data"
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
                          value={searchEan}
                          onChange={(e) => setSearchEan(e.target.value)}
                          placeholder="Search EAN..."
                          className="w-full px-2 py-1 text-sm border rounded-l focus:outline-none focus:ring-1 focus:ring-green-500"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            setIsSearching(false);
                            setSearchEan('');
                          }}
                          className="px-2 py-1 border border-l-0 rounded-r hover:bg-gray-100"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>EAN</span>
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
                  <th key={column.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.map((row, index) => (
                <StockTableRow key={`${row.EAN}-${index}`} row={row} />
              ))}
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