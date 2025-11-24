import React, { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';

interface BlacklistModalProps {
  isOpen: boolean;
  title: string;
  items: string[];
  onClose: () => void;
  onAdd: (value: string) => void | Promise<void>;
  onRemove: (value: string) => void | Promise<void>;
  description?: string;
}

export const BlacklistModal: React.FC<BlacklistModalProps> = ({
  isOpen,
  title,
  items,
  onClose,
  onAdd,
  onRemove,
  description,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const sortedItems = useMemo(() => [...items].sort((a, b) => a.localeCompare(b)), [items]);
  const existingItems = useMemo(
    () => new Set(items.map((item) => item.trim().toUpperCase())),
    [items]
  );

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setBulkValue('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = inputValue.trim();
    if (!value) return;
    await Promise.resolve(onAdd(value));
    setInputValue('');
  };

  const handleBulkSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedValues = bulkValue
      .replace(/\r/g, '\n')
      .split(/[\n,;\t]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    if (normalizedValues.length === 0) {
      setBulkValue('');
      return;
    }

    const uniqueValues = Array.from(new Set(normalizedValues)).filter(
      (value) => !existingItems.has(value)
    );

    if (uniqueValues.length === 0) {
      setBulkValue('');
      return;
    }

    await Promise.all(uniqueValues.map((value) => Promise.resolve(onAdd(value))));
    setBulkValue('');
  };

  const clearInputs = () => {
    setInputValue('');
    setBulkValue('');
  };

  const handleClearAll = async () => {
    if (items.length > 0) {
      await Promise.all(items.map((value) => Promise.resolve(onRemove(value))));
    }
    clearInputs();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-lg bg-gray-50">
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-white hover:text-gray-900"
            aria-label="Close blacklist manager"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-6">
          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Enter SKU or EAN"
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none transition-colors bg-white"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800"
            >
              Add
            </button>
          </form>
          <form onSubmit={handleBulkSubmit} className="space-y-3">
            <textarea
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
              placeholder="Paste SKUs or EANs (one per line, comma, or tab separated)"
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-black focus:outline-none transition-colors bg-white"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                Existing entries and duplicates are ignored automatically.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-white bg-gray-50"
                >
                  Clear All
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-gray-800"
                >
                  Add All
                </button>
              </div>
            </div>
          </form>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white">
            {sortedItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No SKUs are currently blacklisted.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {sortedItems.map((sku) => (
                  <li key={sku} className="flex items-center justify-between px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 transition-colors">
                    <span className="font-mono text-xs sm:text-sm font-medium">{sku}</span>
                    <button
                      onClick={() => onRemove(sku)}
                      className="rounded-full p-1.5 text-red-500 transition-colors hover:bg-red-50"
                      aria-label={`Remove ${sku} from blacklist`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-end px-6 py-5">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-white bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlacklistModal;
