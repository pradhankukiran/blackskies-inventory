import React, { useMemo, useRef, useState } from 'react';
import { ArticleRecommendation } from '@/types/sales';
import { formatNumber } from '@/utils/formatters/numberFormatter';
import { Pagination } from './ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { IntegratedStockData } from '@/types/stock';
import { Download, Search } from 'lucide-react';
import { CoverageDaysSelector } from './CoverageDaysSelector';
import { FactorAdjuster } from './FactorAdjuster';
import { TimelineType } from '@/types/common';
import { exportToCSV } from '@/utils/exporters/csvExporter';
import { exportToXLSX } from '@/utils/exporters/xlsxExporter';

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
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isTableDragging, setIsTableDragging] = useState(false);
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

  const exportRows = useMemo(() => (
    recommendations.map((item) => ({
      "EAN": item.ean,
      "Partner Variant Size": item.partnerVariantSize || 'N/A',
      "Article Name": item.articleName,
      "Status Description": stockByEAN.get(item.ean)?.["Status Description"] || 'N/A',
      "ZFS Total": stockByEAN.get(item.ean)
        ? (stockByEAN.get(item.ean)?.["ZFS Quantity"] || 0) + (stockByEAN.get(item.ean)?.["ZFS Pending Shipment"] || 0)
        : 0,
      "Recommended Stock": item.recommendedStock || 0,
      "Sellable PF Stock": stockByEAN.get(item.ean)?.["Available Stock"] || 0,
      "Avg. Daily Sales": Number(item.averageDailySales?.toFixed(2) || 0),
      "Total Sales": item.totalSales || 0,
      "Avg. Return Rate (%)": Number(item.averageReturnRate?.toFixed(2) || 0),
      "Status Cluster": stockByEAN.get(item.ean)?.["Status Cluster"] || 'N/A',
      "Coverage Days": item.recommendedDays || coverageDays,
    }))
  ), [coverageDays, recommendations, stockByEAN]);

  const exportFilename = `stock-recommendations-${new Date().toISOString().split("T")[0]}`;

  const exportCsv = () => {
    if (!exportRows.length) return;
    exportToCSV(exportRows, exportFilename);
  };

  const exportXlsx = () => {
    if (!exportRows.length) return;
    exportToXLSX(exportRows, exportFilename);
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

  if (!recommendations.length) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="ops-surface flex min-h-0 flex-1 flex-col rounded-[8px]">
        <div className="ops-section-header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="ops-title">ZFS Stock Recommendation</h3>
              <p className="ops-muted mt-1">
                {filteredRecommendations.length.toLocaleString()} of {recommendations.length.toLocaleString()} recommendations.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!exportRows.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={exportXlsx}
                disabled={!exportRows.length}
                className="ops-button-secondary disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </button>
            </div>
          </div>
        </div>

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
                {coverageDays} days coverage
              </div>
              <div className="mt-0.5 text-base text-slate-500">
                {timelineLabel} · Safety {safetyFactor}% · Demand {trendFactor}%
              </div>
            </div>
            <label className="relative min-w-[260px] flex-1 lg:max-w-md">
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
          <table className="ops-table min-w-[1800px]">
            <thead>
              <tr>
                <th>EAN</th>
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
