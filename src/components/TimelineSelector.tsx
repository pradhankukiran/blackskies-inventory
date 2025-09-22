import { TimelineType } from "@/types/common";

interface TimelineSelectorProps {
  value: TimelineType;
  onChange: (value: TimelineType) => void;
}

export function TimelineSelector({ value, onChange }: TimelineSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TimelineType)}
      className="text-sm border border-gray-300 rounded-md py-1 px-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
    >
      <option value="none">Select Timeline</option>
      <option value="30days">30 Days</option>
      <option value="6months">6 Months</option>
    </select>
  );
}
