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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close blacklist manager"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Enter SKU or EAN"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Add
            </button>
          </form>
          <form onSubmit={handleBulkSubmit} className="space-y-2">
            <textarea
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
              placeholder="Paste SKUs or EANs (one per line, comma, or tab separated)"
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                Existing entries and duplicates are ignored automatically.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Clear All
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Add All
                </button>
              </div>
            </div>
          </form>
          <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200">
            {sortedItems.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No SKUs are currently blacklisted.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {sortedItems.map((sku) => (
                  <li key={sku} className="flex items-center justify-between px-4 py-3 text-sm text-gray-800">
                    <span className="font-mono text-xs sm:text-sm">{sku}</span>
                    <button
                      onClick={() => onRemove(sku)}
                      className="rounded-full p-1 text-red-500 transition-colors hover:bg-red-50"
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
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlacklistModal;
