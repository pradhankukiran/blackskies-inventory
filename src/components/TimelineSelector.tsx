import { useState, useRef, useEffect } from "react";
import { TimelineType } from "@/types/common";
import { ChevronDown } from "lucide-react";

interface TimelineSelectorProps {
  value: TimelineType;
  onChange: (value: TimelineType) => void;
}

const options = [
  { value: "none" as TimelineType, label: "Select Timeline" },
  { value: "30days" as TimelineType, label: "30 Days" },
  { value: "6months" as TimelineType, label: "6 Months" },
];

export function TimelineSelector({ value, onChange }: TimelineSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: TimelineType) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-w-[180px] cursor-pointer items-center justify-between gap-2 border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-900 shadow-sm transition-all hover:border-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden border border-slate-200 bg-white shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`w-full px-4 py-3 text-left text-base transition-colors ${
                option.value === value
                  ? "bg-slate-950 text-white font-medium"
                  : "text-slate-900 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
