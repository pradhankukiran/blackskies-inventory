import React from "react";
import { IntegratedStockData } from "@/types/stock";

interface StockTableRowProps {
  row: IntegratedStockData;
}

export const StockTableRow: React.FC<StockTableRowProps> = React.memo(
  ({ row }) => {
    return (
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm text-gray-900">{row.SKU}</td>
        <td className="px-4 py-3 text-sm text-gray-900">{row.EAN}</td>
        <td className="px-4 py-3 text-sm text-gray-900">
          {row["Product Name"]}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
          {row["Internal Stock Quantity"]}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
          {row["ZFS Quantity"]}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
          {row["ZFS Pending Shipment"]}
        </td>
      </tr>
    );
  }
);
