import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
}

export function LoadingOverlay({ isLoading, message = 'Processing Files' }: LoadingOverlayProps) {
  const [dots, setDots] = useState('.');

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setDots(currentDots => {
        switch (currentDots) {
          case '.': return '..';
          case '..': return '...';
          default: return '.';
        }
      });
    }, 500); // Change dots every 500ms

    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-xl flex flex-col items-center space-y-4">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
        <p className="text-gray-700 font-medium">
          <span className="inline-block min-w-[20px] text-center">{message}</span>
          <span className="inline-block w-8">{dots}</span>
        </p>
      </div>
    </div>
  );
}
