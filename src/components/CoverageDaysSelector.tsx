import React from 'react';

interface CoverageDaysSelectorProps {
  value: number;
  onChange: (days: number) => void;
}

export function CoverageDaysSelector({ value, onChange }: CoverageDaysSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="coverage-days" className="text-sm font-medium text-gray-700">
        Coverage Period:
      </label>
      <select
        id="coverage-days"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-gray-300 py-1 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      >
        <option value={7}>7 Days</option>
        <option value={14}>14 Days</option>
        <option value={21}>21 Days</option>
        <option value={30}>30 Days</option>
      </select>
    </div>
  );
}