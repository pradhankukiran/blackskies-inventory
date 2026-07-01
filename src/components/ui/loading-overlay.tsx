interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
}

export function LoadingOverlay({ isLoading, message = 'Processing Files' }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[3px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-md overflow-hidden border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.22)]">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-base font-semibold uppercase tracking-[0.04em] text-slate-500">
            Working
          </div>
        </div>
        <div className="flex items-start gap-4 px-5 py-5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center border border-slate-900 bg-slate-950 shadow-sm">
            <div className="grid grid-cols-2 gap-1">
              <span className="h-2 w-2 animate-[loading-tile_1.1s_ease-in-out_infinite] bg-white" />
              <span className="h-2 w-2 animate-[loading-tile_1.1s_ease-in-out_0.12s_infinite] bg-white" />
              <span className="h-2 w-2 animate-[loading-tile_1.1s_ease-in-out_0.24s_infinite] bg-white" />
              <span className="h-2 w-2 animate-[loading-tile_1.1s_ease-in-out_0.36s_infinite] bg-white" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-950">Processing data</div>
            <div className="mt-1 text-base leading-6 text-slate-600">
              {message || 'Preparing files and calculations'}
            </div>
          </div>
        </div>
        <div className="h-1 overflow-hidden bg-slate-100">
          <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] bg-slate-950" />
        </div>
      </div>
    </div>
  );
}
