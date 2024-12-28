import React, { useState, useEffect } from "react";
import { IntegratedStockData } from "@/types/stock";
import { StockTableRow } from "./StockTableRow";
import { Pagination } from "./ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { ArrowUp, ArrowDown } from "lucide-react";
import { ExportButton } from "./ExportButton";

interface StockTableProps {
  data: IntegratedStockData[];
}

const ITEMS_PER_PAGE = 25;

const COLUMNS = [
  { key: "SKU", label: "SKU" },
  { key: "EAN", label: "EAN" },
  { key: "Product Name", label: "Product Name" },
  { key: "Internal Stock Quantity", label: "Internal Stock" },
  { key: "ZFS Quantity", label: "ZFS Stock" },
  { key: "ZFS Pending Shipment", label: "ZFS Pending" },
] as const;

export const StockTable: React.FC<StockTableProps> = ({ data }) => {
  const [isClient, setIsClient] = useState(false);
  const { sortedItems, sortConfig, requestSort } = useTableSort(data, {
    key: "SKU",
    direction: "asc",
  });
  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    sortedItems,
    ITEMS_PER_PAGE
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  const renderSortIcon = (columnKey: string) => {
    if (sortConfig?.key !== columnKey) return null;

    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1 inline-block" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <ExportButton 
          data={data} 
          label="Export Stock Overview"
          filename="stock-data"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    onClick={() => requestSort(column.key)}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      {column.label}
                      {renderSortIcon(column.key)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.map((row, index) => (
                <StockTableRow key={`${row.SKU}-${index}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, data.length)} of{" "}
            {data.length} entries
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