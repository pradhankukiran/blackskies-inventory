import React, { useState, useMemo } from 'react';
import { ArticleRecommendation } from '@/types/sales';
import { ExportButton } from './ExportButton';
import { formatNumber } from '@/utils/formatters/numberFormatter';
import { Pagination } from './ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { IntegratedStockData } from '@/types/stock';
import { Search, X } from 'lucide-react';
import { CoverageDaysSelector } from './CoverageDaysSelector';
import { FactorAdjuster } from './FactorAdjuster';
import { TimelineType } from '@/types/common';

interface RecommendationsTableProps {
  recommendations: ArticleRecommendation[];
  stockData: IntegratedStockData[];
  timeline: TimelineType;
  coverageDays: number;
  safetyFactor: number;
  trendFactor: number;
  onCoverageDaysChange: (days: number) => void;
  onSafetyFactorChange: (value: number) => void;
  onTrendFactorChange: (value: number) => void;
}

const ITEMS_PER_PAGE = 25;

export const RecommendationsTable: React.FC<RecommendationsTableProps> = ({
  recommendations,
  stockData,
  timeline,
  coverageDays,
  safetyFactor,
  trendFactor,
  onCoverageDaysChange,
  onSafetyFactorChange,
  onTrendFactorChange
}) => {
  const [searchEan, setSearchEan] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const timelineLabel = timeline === '30days'
    ? '30 days sales timeline'
    : timeline === '6months'
      ? '6 months sales timeline'
      : 'No sales timeline selected';

  // Memoize stockByEAN map to avoid recreating it on every render
  const stockByEAN = useMemo(() =>
    new Map(stockData.map(item => [item.EAN, item])),
    [stockData]
  );

  const filteredRecommendations = useMemo(() => {
    if (!searchEan) return recommendations;
    return recommendations.filter(rec =>
      rec.ean.toLowerCase().includes(searchEan.toLowerCase())
    );
  }, [recommendations, searchEan]);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    filteredRecommendations,
    ITEMS_PER_PAGE
  );

  if (!recommendations.length) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex-1 flex flex-col min-h-0">
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3">
            <CoverageDaysSelector
              value={coverageDays}
              onChange={onCoverageDaysChange}
              label="Coverage target"
            />
            <FactorAdjuster
              label="Safety buffer"
              value={safetyFactor}
              onChange={onSafetyFactorChange}
            />
            <FactorAdjuster
              label="Demand adjustment"
              value={trendFactor}
              onChange={onTrendFactorChange}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">
                {recommendations.length.toLocaleString()} recommendations
              </div>
              <div className="mt-0.5 text-sm text-gray-500">
                {coverageDays} days coverage · {timelineLabel} · Safety {safetyFactor}% · Demand {trendFactor}%
              </div>
            </div>
            <ExportButton
              data={recommendations}
              label="Export ZFS Stock Recommendation"
              filename="stock-recommendations"
            />
          </div>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">Partner Variant Size</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">Article Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">Status Description</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 uppercase">ZFS Total</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 uppercase">Recommended Stock</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 uppercase">Sellable PF Stock</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 uppercase">Avg. Daily Sales</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 uppercase">Total Sales</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 uppercase">Avg. Return Rate (%)</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase">Status Cluster</th>
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
