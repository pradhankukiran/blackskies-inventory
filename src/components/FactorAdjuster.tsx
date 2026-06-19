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
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-600">
        {label}
      </label>
      <div className="flex items-end">
        <button
          type="button"
          className={`px-3 py-1.5 text-sm font-medium border transition-colors ${
            value === 0
              ? "bg-black text-white border-black"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
          onClick={() => onChange(0)}
        >
          0%
        </button>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`px-3 py-1.5 text-sm font-medium border border-l-0 transition-colors ${
              value === preset
                ? "bg-black text-white border-black"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
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
          className="w-24 border border-l-0 border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          aria-label={`${label} custom percentage`}
        />
      </div>
    </div>
  );
};
