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
      <div className="ops-surface flex min-h-0 flex-1 flex-col rounded-[8px]">
        <div className="border-b border-slate-200 bg-slate-50">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 py-4">
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-950">
                {recommendations.length.toLocaleString()} recommendations
              </div>
              <div className="mt-0.5 text-base text-slate-500">
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
                          <Search className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </th>
                <th>Partner Variant Size</th>
                <th>Article Name</th>
                <th>Status Description</th>
                <th className="text-right">ZFS Total</th>
                <th className="text-right">Recommended Stock</th>
                <th className="text-right">Sellable PF Stock</th>
                <th className="text-right">Avg. Daily Sales</th>
                <th className="text-right">Total Sales</th>
                <th className="text-right">Avg. Return Rate (%)</th>
                <th>Status Cluster</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((rec, index) => {
                  const stockInfo = stockByEAN.get(rec.ean);
                  // Pre-calculate or safely access values to avoid rendering issues
                  const zfsTotal = stockInfo ?
                    (stockInfo["ZFS Quantity"] || 0) + (stockInfo["ZFS Pending Shipment"] || 0) : 0;
                  const availableStock = stockInfo?.["Available Stock"] || 0;

                  return (
                  <tr key={`${rec.ean}-${index}`}>
                    <td>{rec.ean}</td>
                    <td>{rec.partnerVariantSize || 'N/A'}</td>
                    <td>{rec.articleName}</td>
                    <td>{stockInfo?.["Status Description"] || 'N/A'}</td>
                    <td className="text-right tabular-nums">{zfsTotal}</td>
                    <td className="text-right font-semibold tabular-nums">
                      {rec.recommendedStock !== undefined ? rec.recommendedStock : 'N/A'}
                    </td>
                    <td className="text-right tabular-nums">{availableStock}</td>
                    <td className="text-right tabular-nums">{formatNumber(rec.averageDailySales)}</td>
                    <td className="text-right tabular-nums">{rec.totalSales || 0}</td>
                    <td className="text-right tabular-nums">{formatNumber(rec.averageReturnRate)}%</td>
                    <td>{stockInfo?.["Status Cluster"] || 'N/A'}</td>
                  </tr>
                )})
              ) : (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    No recommendations available with the current selection
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-base text-slate-500">
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
