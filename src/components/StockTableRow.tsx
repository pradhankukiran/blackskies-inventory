import React from "react";
import { IntegratedStockData } from "@/types/stock";

interface StockTableRowProps {
  row: IntegratedStockData & { "ZFS Total": number };
}

export const StockTableRow: React.FC<StockTableRowProps> = React.memo(
  ({ row }) => {
    return (
      <tr>
        <td>{row.EAN}</td>
        <td>
          {row["partner_variant_size"]}
        </td>
        <td>
          {row["Product Name"]}
        </td>
        <td>
          {row["Status Description"]}
        </td>
        <td className="text-right font-medium tabular-nums">
          {row["ZFS Total"]}
        </td>
        <td className="text-right font-medium tabular-nums">
          {row["Available Stock"]}
        </td>
        <td>
          {row["Status Cluster"]}
        </td>
      </tr>
    );
  }
);
