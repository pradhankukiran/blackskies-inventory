interface CoverageDaysSelectorProps {
  value: number;
  onChange: (days: number) => void;
  label?: string;
}

export function CoverageDaysSelector({
  value,
  onChange,
  label = "Coverage Period:",
}: CoverageDaysSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="coverage-days" className="text-base font-medium text-slate-700">
        {label}
      </label>
      <select
        id="coverage-days"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ops-input min-w-[180px]"
      >
        <option value={3}>3 Days (Minimum)</option>
        <option value={7}>7 Days (1 Week)</option>
        <option value={14}>14 Days (2 Weeks)</option>
        <option value={30}>30 Days (1 Month)</option>
        <option value={60}>60 Days (2 Months)</option>
        <option value={90}>90 Days (3 Months)</option>
        <option value={180}>180 Days (6 Months)</option>
      </select>
    </div>
  );
}
