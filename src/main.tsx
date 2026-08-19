import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Direction } from 'radix-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { TooltipProvider, ToastProvider } from './components/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A planning board is not a live feed; refetching on every tab focus is noise.
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      retry: 1
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
            <App />
          </ToastProvider>
        </TooltipProvider>
      </Direction.DirectionProvider>
    </QueryClientProvider>
  </StrictMode>
);
