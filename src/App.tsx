import { ClerkLoaded, ClerkLoading, Show, SignIn, UserButton } from '@clerk/react';
import IntegratedStockParser from './components/IntegratedStockParser';

function App() {
  return (
    <>
      <ClerkLoading>
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-base font-medium text-slate-600">Loading secure access...</p>
        </main>
      </ClerkLoading>

      <ClerkLoaded>
        <Show when="signed-out">
          <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-50 px-4 py-12">
            <div className="text-center">
              <img
                src="/Blackskies-Logo.png"
                alt="Blackskies"
                className="mx-auto h-16"
              />
              <p className="mt-4 text-base text-slate-600">Sign in to access the inventory tools.</p>
            </div>
            <SignIn routing="hash" />
          </main>
        </Show>

        <Show when="signed-in">
          <div className="min-h-screen bg-gray-50">
            <div className="fixed bottom-5 right-5 z-[60] border border-slate-200 bg-white p-2 shadow-lg">
              <UserButton />
            </div>
            <IntegratedStockParser />
          </div>
        </Show>
      </ClerkLoaded>
    </>
  );
}

export default App;
