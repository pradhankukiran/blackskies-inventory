import React, { useState, useEffect, useMemo } from 'react';
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/pagination";
import { Search, X } from "lucide-react";
import { ExportButton } from "./ExportButton";

interface RelativeStockTableProps {
  data: {
    articleNumber: string;
    warehouse?: string;
    binLocation?: string;
    isDefaultBinLocation?: boolean;
    physicalStock: number;
  }[];
}

const ITEMS_PER_PAGE = 25;

const RelativeStockTable: React.FC<RelativeStockTableProps> = ({ data }) => {
  const [isClient, setIsClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const positiveStockData = useMemo(() => {
    if (!data) return [];
    return data.filter(item => item.physicalStock > 0);
  }, [data]);

  const filteredData = useMemo(() => {
    if (!searchTerm) return positiveStockData;
    return positiveStockData.filter(item =>
      item.articleNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [positiveStockData, searchTerm]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredData,
    ITEMS_PER_PAGE
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    goToPage(1);
  }, [searchTerm, positiveStockData]);

  if (!isClient) {
    return null;
  }

  if (!data || data.length === 0) {
    return <p className="text-center text-gray-500 py-4">No initial data provided.</p>;
  }

  if (positiveStockData.length === 0) {
    return <p className="text-center text-gray-500 py-4">No items with physical stock greater than 0 found.</p>;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 px-1">
        <div className="text-base text-gray-700">
          {filteredData.length} {filteredData.length === 1 ? "item" : "items"} found
        </div>
        <ExportButton
          data={filteredData}
          label="Export Relative Stock"
          filename="relative-stock-data"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-auto flex-1">
          <table className="ops-table min-w-full">
            <thead>
              <tr>
                <th
                  scope="col"
                >
                  <div className="flex items-center space-x-2">
                    {isSearching ? (
                      <div className="flex items-center w-full">
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search Article Number..."
                          className="ops-input w-full"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            setIsSearching(false);
                            setSearchTerm('');
                          }}
                          className="border border-l-0 border-slate-300 px-3 py-3 hover:bg-slate-100"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>Article Number</span>
                        <button
                          onClick={() => setIsSearching(true)}
                          className="hover:text-green-600 transition-colors p-1"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                >
                  Warehouse
                </th>
                <th
                  scope="col"
                >
                  Bin Location
                </th>
                <th
                  scope="col"
                  className="text-center"
                >
                  Default Bin?
                </th>
                <th
                  scope="col"
                >
                  Physical Stock
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length > 0 ? (
                 paginatedItems.map((item, index) => (
                   <tr key={`${item.articleNumber}-${index}`}>
                     <td className="whitespace-nowrap">
                       {item.articleNumber}
                     </td>
                     <td className="whitespace-nowrap text-slate-600">
                       {item.warehouse ?? 'N/A'}
                     </td>
                     <td className="whitespace-nowrap text-slate-600">
                       {item.binLocation ?? 'N/A'}
                     </td>
                     <td className="whitespace-nowrap text-center text-slate-600">
                       {item.isDefaultBinLocation === undefined || item.isDefaultBinLocation === null ? 'N/A' : (item.isDefaultBinLocation ? 'Yes' : 'No')}
                     </td>
                     <td className="whitespace-nowrap">
                       {-item.physicalStock}
                     </td>
                   </tr>
                ))
               ) : (
                 <tr>
                   <td colSpan={5} className="px-6 py-6 text-center text-base text-gray-500">
                     {searchTerm ? "No matching records found." : "No items found with stock > 0."}
                   </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-4">
            <div className="text-base text-gray-500">
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
        )}
        {totalPages <= 1 && filteredData.length > 0 && (
           <div className="sticky bottom-0 flex items-center justify-end border-t border-gray-200 bg-gray-50 px-5 py-4">
             <div className="text-base text-gray-500">
               {filteredData.length} {filteredData.length === 1 ? "entry" : "entries"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RelativeStockTable;
