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
        className="text-sm border border-gray-200 rounded-lg py-2 px-3 focus:outline-none focus:border-black transition-all bg-white text-gray-900 font-medium cursor-pointer hover:border-gray-300 flex items-center gap-2 min-w-[150px] justify-between"
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                option.value === value
                  ? "bg-gray-900 text-white font-medium"
                  : "text-gray-900 hover:bg-gray-50"
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
