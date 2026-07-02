import React, { useState, useEffect, useMemo, useRef } from "react";
import { IntegratedStockData } from "@/types/stock";
import { StockTableRow } from "./StockTableRow";
import { Pagination } from "./ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { Download, Search } from "lucide-react";
import { exportToCSV } from "@/utils/exporters/csvExporter";
import { exportToXLSX } from "@/utils/exporters/xlsxExporter";

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
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);

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

  const exportFilename = `stock-data-${new Date().toISOString().split("T")[0]}`;

  const exportCsv = () => {
    exportToCSV(dataWithTotal.map((item) => ({
      "EAN": item.EAN,
      "Partner Variant Size": item.partner_variant_size || 'N/A',
      "Article Name": item["Product Name"],
      "Status Description": item["Status Description"],
      "ZFS Total": item["ZFS Total"],
      "Sellable PF Stock": item["Available Stock"],
      "Status Cluster": item["Status Cluster"]
    })), exportFilename);
  };

  const exportXlsx = () => {
    exportToXLSX(dataWithTotal.map((item) => ({
      "EAN": item.EAN,
      "Partner Variant Size": item.partner_variant_size || 'N/A',
      "Article Name": item["Product Name"],
      "Status Description": item["Status Description"],
      "ZFS Total": item["ZFS Total"],
      "Sellable PF Stock": item["Available Stock"],
      "Status Cluster": item["Status Cluster"]
    })), exportFilename);
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
              <h3 className="ops-title">ZFS Stock Overview</h3>
              <p className="ops-muted mt-1">
                {filteredData.length.toLocaleString()} of {dataWithTotal.length.toLocaleString()} EAN rows.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!dataWithTotal.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={exportXlsx}
                disabled={!dataWithTotal.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
          <label className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchEan}
              onChange={(event) => setSearchEan(event.target.value)}
              placeholder="Search EAN"
              className="ops-input w-full pl-10 pr-4"
            />
          </label>
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
          <table className="ops-table min-w-[1150px]">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((row, index) => (
                  <StockTableRow key={`${row.EAN}-${index}`} row={row} />
                ))
              ) : (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-lg">
                      <div className="text-base font-semibold text-slate-950">No matching stock rows</div>
                      <div className="mt-1 text-base text-slate-500">
                        Adjust the search or confirm the uploaded files contain ZFS rows.
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
