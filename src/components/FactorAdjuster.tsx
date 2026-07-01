import React from "react";

interface FactorAdjusterProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  presets?: number[];
}

export const FactorAdjuster: React.FC<FactorAdjusterProps> = ({
  label,
  value,
  onChange,
  presets = [10, 20, 30],
}) => {
  const isCustom = value !== 0 && !presets.includes(value);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-base font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-end">
        <button
          type="button"
          className={`border px-4 py-2.5 text-base font-medium transition-colors ${
            value === 0
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          onClick={() => onChange(0)}
        >
          0%
        </button>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`border border-l-0 px-4 py-2.5 text-base font-medium transition-colors ${
              value === preset
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => onChange(preset)}
          >
            +{preset}%
          </button>
        ))}
        <input
          id={`${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-custom`}
          type="number"
          value={isCustom ? value : ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "" || raw === "-") {
              onChange(0);
              return;
            }
            const v = parseFloat(raw);
            onChange(isNaN(v) ? 0 : v);
          }}
          placeholder="Custom"
          className="w-32 border border-l-0 border-slate-300 px-3 py-2.5 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          aria-label={`${label} custom percentage`}
        />
      </div>
    </div>
  );
};
