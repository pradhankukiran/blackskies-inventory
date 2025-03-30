import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ArticleRecommendation } from '@/types/sales';
import { ExportButton } from './ExportButton';
import { formatNumber } from '@/utils/formatters/numberFormatter';
import { Pagination } from './ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { IntegratedStockData, ParsedData } from '@/types/stock';
import { Search, X } from 'lucide-react';
import { CoverageDaysSelector } from './CoverageDaysSelector';
import { calculateStockRecommendations } from '@/utils/calculators/stockRecommendations';
import { TimelineType } from '@/types/common';
import { getStoredData, storeData } from '@/lib/indexedDB';

// Helper function to create a focused copy of recommendations with only essential properties
// This reduces memory usage compared to deep cloning the entire objects
function createOptimizedRecommendationsCopy(recommendations: ArticleRecommendation[]): ArticleRecommendation[] {
  return recommendations.map(rec => ({
    ...rec,
    // Only explicitly update the properties that are essential for the UI
    recommendedStock: rec.recommendedStock,
    recommendedDays: rec.recommendedDays,
    averageDailySales: rec.averageDailySales
  }));
}

interface RecommendationsTableProps {
  recommendations: ArticleRecommendation[];
  stockData: IntegratedStockData[];
  parsedData: ParsedData;
  timeline: TimelineType;
  onCoverageDaysChange?: (days: number) => void;
}

const ITEMS_PER_PAGE = 25;

export const RecommendationsTable: React.FC<RecommendationsTableProps> = ({ 
  recommendations, 
  stockData, 
  parsedData,
  timeline 
}) => {
  const [coverageDays, setCoverageDays] = useState(14);
  const [recalculatedRecommendations, setRecalculatedRecommendations] = useState<ArticleRecommendation[]>([]);
  const [searchEan, setSearchEan] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Memoize stockByEAN map to avoid recreating it on every render
  const stockByEAN = useMemo(() => 
    new Map(stockData.map(item => [item.EAN, item])),
    [stockData]
  );

  // Load coverage days from IndexedDB when component mounts
  useEffect(() => {
    const loadCoverageDays = async () => {
      try {
        const savedData = await getStoredData('zfs');
        if (savedData?.coverageDays) {
          setCoverageDays(savedData.coverageDays);
        }
      } catch (err) {
        console.error("Error loading coverage days:", err);
      }
    };
    
    loadCoverageDays();
  }, []);

  // Optimized recalculation function that updates without animations or unnecessary re-renders
  const recalculateRecommendations = useCallback((days: number) => {
    if (!parsedData.zfsSales || parsedData.zfsSales.length === 0) {
      return;
    }
    
    try {
      // Ensure days is a number and positive
      const coverageDaysNum = Math.max(Number(days), 1);
      
      // Calculate new recommendations - using the explicitly provided timeline
      const newRecommendations = calculateStockRecommendations(
        parsedData.zfsSales,
        stockData,
        coverageDaysNum,
        timeline // Use the timeline prop directly
      );
      
      // Use our optimized copy function to minimize the impact of state updates
      const optimizedCopy = createOptimizedRecommendationsCopy(newRecommendations);
      
      // Update the recommendations state
      setRecalculatedRecommendations(optimizedCopy);
    } catch (error) {
      console.error('Error recalculating recommendations:', error);
    }
  }, [parsedData.zfsSales, stockData, timeline]); // Add timeline as dependency

  // Initialize recommendations when component mounts or when base data changes
  useEffect(() => {
    if (recommendations.length > 0) {
      // Use the initial coverage days value
      recalculateRecommendations(coverageDays);
    } else {
      setRecalculatedRecommendations(recommendations);
    }
  }, [recommendations, recalculateRecommendations, coverageDays]);

  const filteredRecommendations = useMemo(() => {
    if (!searchEan) return recalculatedRecommendations;
    return recalculatedRecommendations.filter(rec => 
      rec.ean.toLowerCase().includes(searchEan.toLowerCase())
    );
  }, [recalculatedRecommendations, searchEan]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredRecommendations,
    ITEMS_PER_PAGE
  );

  // Efficient coverage days change handler - save to IndexedDB
  const handleCoverageDaysChange = async (days: number) => {
    setCoverageDays(days);
    recalculateRecommendations(days);
    
    // Save the coverage days to IndexedDB
    try {
      const savedData = await getStoredData('zfs');
      if (savedData) {
        await storeData({
          ...savedData,
          coverageDays: days
        }, 'zfs');
      } else {
        // If no data exists yet, create a minimal structure
        await storeData({
          parsedData: {
            internal: [],
            zfs: [],
            zfsShipments: [],
            zfsShipmentsReceived: [],
            skuEanMapper: [],
            zfsSales: [],
            integrated: [],
            sellerboardStock: []
          },
          recommendations: [],
          coverageDays: days
        }, 'zfs');
      }
    } catch (err) {
      console.error("Error saving coverage days:", err);
    }
  };

  if (!recommendations.length) return null;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <CoverageDaysSelector value={coverageDays} onChange={handleCoverageDaysChange} />
        <div className="text-sm text-gray-700">
          {recalculatedRecommendations.length} items with {coverageDays} days coverage
          <span className="ml-2 text-green-600 font-medium">
            ({timeline === '30days' ? '30 days' : '6 months'} timeline)
          </span>
        </div>
        <ExportButton 
          data={recalculatedRecommendations} 
          label="Export ZFS Stock Recommendation"
          filename="stock-recommendations"
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner Variant Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ZFS Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recommended Stock</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sellable PF Stock</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg. Daily Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg. Return Rate (%)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status Cluster</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.length > 0 ? (
                paginatedItems.map((rec, index) => {
                  const stockInfo = stockByEAN.get(rec.ean);
                  // Pre-calculate or safely access values to avoid rendering issues
                  const zfsTotal = stockInfo ? 
                    (stockInfo["ZFS Quantity"] || 0) + (stockInfo["ZFS Pending Shipment"] || 0) : 0;
                  const availableStock = stockInfo?.["Available Stock"] || 0;
                  
                  return (
                  <tr key={`${rec.ean}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{rec.ean}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{rec.partnerVariantSize || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{rec.articleName}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stockInfo?.["Status Description"] || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{zfsTotal}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-semibold">
                      {rec.recommendedStock !== undefined ? rec.recommendedStock : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{availableStock}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(rec.averageDailySales)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.totalSales || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(rec.averageReturnRate)}%</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{stockInfo?.["Status Cluster"] || 'N/A'}</td>
                  </tr>
                )})
              ) : (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    No recommendations available with the current selection
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 sticky bottom-0">
          <div className="text-sm text-gray-500">
            Showing {filteredRecommendations.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredRecommendations.length)} of{" "}
            {filteredRecommendations.length} entries
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