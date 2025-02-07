import React, { useState, useEffect } from "react";
import { IntegratedStockData } from "@/types/stock";
import { StockTableRow } from "./StockTableRow";
import { Pagination } from "./ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { ExportButton } from "./ExportButton";

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

  const dataWithTotal = data.map((item) => ({
    ...item,
    "ZFS Total": item["ZFS Quantity"] + item["ZFS Pending Shipment"],
  }));

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    dataWithTotal,
    ITEMS_PER_PAGE
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <ExportButton
          data={dataWithTotal}
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
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
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