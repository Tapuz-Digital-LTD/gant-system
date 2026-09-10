import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Direction } from 'radix-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { TooltipProvider, ToastProvider, BusyBar } from './components/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A planning board is not a live feed; refetching on every tab focus is noise.
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      /*
       * Retry a network hiccup, never a refusal.
       *
       * Retrying a 401 or a 403 doubles every request made while signed out and
       * cannot possibly succeed — the answer will not have changed by the time
       * the retry lands. A 404 is the same: the row is still missing.
       */
      retry: (failureCount: number, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      }
    }
  }
});

// Radix resolves `localDir || globalDir || "ltr"` and never reads document.dir,
// so without this every popover flips to the wrong side and arrow keys reverse.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Direction.DirectionProvider dir="rtl">
        <TooltipProvider delayDuration={300}>
          <ToastProvider>
            <BusyBar />
            <App />
          </ToastProvider>
        </TooltipProvider>
      </Direction.DirectionProvider>
    </QueryClientProvider>
  </StrictMode>
);
