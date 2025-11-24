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
      <div className="border-b border-gray-200 flex justify-center">
        <nav className="-mb-px flex space-x-8 justify-center" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm",
                activeTab === tab.id
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6 max-w-7xl mx-auto h-[calc(100vh-100px)] overflow-hidden">
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}