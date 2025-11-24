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
        <div className="text-sm text-gray-700">
          {filteredData.length} {filteredData.length === 1 ? "item" : "items"} found
        </div>
        <ExportButton
          data={filteredData} 
          label="Export Relative Stock"
          filename="relative-stock-data"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-auto flex-1">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  <div className="flex items-center space-x-2">
                    {isSearching ? (
                      <div className="flex items-center w-full">
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search Article Number..."
                          className="w-full px-2 py-1 text-sm border rounded-l focus:outline-none focus:ring-1 focus:ring-green-500"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            setIsSearching(false);
                            setSearchTerm('');
                          }}
                          className="px-2 py-1 border border-l-0 rounded-r hover:bg-gray-100"
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
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Warehouse
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Bin Location
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Default Bin?
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Physical Stock
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedItems.length > 0 ? (
                 paginatedItems.map((item, index) => (
                   <tr key={`${item.articleNumber}-${index}`} className="hover:bg-gray-50">
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                       {item.articleNumber}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {item.warehouse ?? 'N/A'}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {item.binLocation ?? 'N/A'}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500">
                       {item.isDefaultBinLocation === undefined || item.isDefaultBinLocation === null ? 'N/A' : (item.isDefaultBinLocation ? 'Yes' : 'No')}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                       {-item.physicalStock}
                     </td>
                   </tr>
                ))
               ) : (
                 <tr>
                   <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                     {searchTerm ? "No matching records found." : "No items found with stock > 0."}
                   </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
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
        )}
        {totalPages <= 1 && filteredData.length > 0 && (
           <div className="flex items-center justify-end px-4 py-3 bg-gray-50 border-t border-gray-200 sticky bottom-0">
             <div className="text-sm text-gray-500">
               {filteredData.length} {filteredData.length === 1 ? "entry" : "entries"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RelativeStockTable; 