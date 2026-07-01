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
      <div className="mb-4 flex justify-end">
        <ExportButton
          data={dataWithTotal}
          label="Export ZFS Stock Overview"
          filename="stock-data"
        />
      </div>
      <div className="ops-surface flex min-h-0 flex-1 flex-col rounded-[8px]">
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
                          value={searchEan}
                          onChange={(e) => setSearchEan(e.target.value)}
                          placeholder="Search EAN..."
                          className="ops-input w-full"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            setIsSearching(false);
                            setSearchEan('');
                          }}
                          className="border border-l-0 border-slate-300 px-3 py-3 hover:bg-slate-100"
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
                            <Search className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </th>
                {COLUMNS.slice(1).map((column) => (
                  <th key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((row, index) => (
                <StockTableRow key={`${row.EAN}-${index}`} row={row} />
              ))}
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
