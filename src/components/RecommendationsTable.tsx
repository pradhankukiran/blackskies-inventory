import React from 'react';
import { ArticleRecommendation } from '@/types/sales';
import { ExportButton } from './ExportButton';
import { formatNumber } from '@/utils/formatters/numberFormatter';
import { Pagination } from './ui/pagination';
import { usePagination } from '@/hooks/usePagination';

interface RecommendationsTableProps {
  recommendations: ArticleRecommendation[];
}

const ITEMS_PER_PAGE = 25;

export const RecommendationsTable: React.FC<RecommendationsTableProps> = ({ recommendations }) => {
  if (!recommendations.length) return null;

  const { currentPage, totalPages, paginatedItems, goToPage } = usePagination(
    recommendations,
    ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <ExportButton 
          data={recommendations} 
          label="Export Stock Recommendations"
          filename="stock-recommendations"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article Name</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recommended Days</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg. Daily Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recommended Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.map((rec, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{rec.articleId}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{rec.articleName}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.recommendedDays}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatNumber(rec.averageDailySales)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.totalSales}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{rec.recommendedStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, recommendations.length)} of{" "}
            {recommendations.length} entries
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