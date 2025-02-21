import React, { useState } from 'react';
import { ArticleRecommendation } from '@/types/sales';
import { ExportButton } from './ExportButton';
import { formatNumber } from '@/utils/formatters/numberFormatter';
import { Pagination } from './ui/pagination';
import { usePagination } from '@/hooks/usePagination';
import { CoverageDaysSelector } from './CoverageDaysSelector';
import { calculateStockRecommendations } from '@/utils/calculators/stockRecommendations';

interface RecommendationsTableProps {
  recommendations: ArticleRecommendation[];
  onCoverageDaysChange?: (days: number) => void;
}

const ITEMS_PER_PAGE = 25;

export const RecommendationsTable: React.FC<RecommendationsTableProps> = ({ recommendations }) => {
  const [coverageDays, setCoverageDays] = useState(7);
  const [recalculatedRecommendations, setRecalculatedRecommendations] = useState(recommendations);

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    recalculatedRecommendations,
    ITEMS_PER_PAGE
  );

  const handleCoverageDaysChange = (days: number) => {
    setCoverageDays(days);
    // Recalculate recommendations with new coverage days
    const updatedRecommendations = recommendations.map(rec => ({
      ...rec,
      recommendedDays: days,
      recommendedStock: Math.ceil(rec.averageDailySales * days * 1.2 * 1.28) // Include safety buffer and return rate
    }));
    setRecalculatedRecommendations(updatedRecommendations);
  };

  if (!recommendations.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <CoverageDaysSelector value={coverageDays} onChange={handleCoverageDaysChange} />
        <ExportButton 
          data={recalculatedRecommendations} 
          label="Export Stock Recommendations"
          filename="stock-recommendations"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">EAN</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner Variant Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recommended Stock</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg. Daily Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Last Sale Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.map((rec, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{rec.ean}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{rec.partnerVariantSize || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{rec.articleName}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.recommendedStock}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(rec.averageDailySales)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.totalSales}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.lastSaleDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, recalculatedRecommendations.length)} of{" "}
            {recalculatedRecommendations.length} entries
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