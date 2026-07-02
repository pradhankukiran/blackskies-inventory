import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: {
    id: string;
    label: string;
    content: React.ReactNode;
  }[];
  id?: string; // Optional unique identifier for this tabs component
}

export function Tabs({ tabs, id = "default-tabs" }: TabsProps) {
  const storageKey = `activeTab-${id}`;

  // Initialize state from localStorage or use the first tab
  const [activeTab, setActiveTab] = React.useState(() => {
    if (tabs.length === 0) return "";

    const savedTab = localStorage.getItem(storageKey);
    // Check if the saved tab still exists in the current tabs
    if (savedTab && tabs.some(tab => tab.id === savedTab)) {
      return savedTab;
    }
    return tabs[0]?.id;
  });

  // Save the active tab to localStorage whenever it changes
  React.useEffect(() => {
    if (activeTab) {
      localStorage.setItem(storageKey, activeTab);
    }
  }, [activeTab, storageKey]);

  return (
    <div>
      <div className="border border-slate-200 bg-slate-50 p-1 shadow-inner">
        <nav className="flex flex-wrap gap-1" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "whitespace-nowrap px-4 py-2.5 text-base font-semibold transition-colors sm:px-5",
                activeTab === tab.id
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-5 w-full h-[calc(100vh-100px)] overflow-hidden">
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}
