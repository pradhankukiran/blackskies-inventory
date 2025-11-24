import React from "react";
import { Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportData } from "@/utils/exporters";
import type { ExportFormat } from "@/utils/exporters/types";

interface ExportButtonProps {
  data: any[];
  label: string;
  filename: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ data, label, filename }) => {
  const handleExport = (format: ExportFormat) => {
    exportData(data, format, {
      filename,
      timestamp: true,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200">
        <Download className="w-4 h-4" />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("tsv")}>
          Export as TSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("xlsx")}>
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};