import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isInstalled, registerServiceWorker } from './lib/push';
import './index.css';

const queryClient = new QueryClient();

// The service worker only shows the daily notification, so only the installed app needs it.
if ('serviceWorker' in navigator && isInstalled()) {
  registerServiceWorker().catch((error: unknown) => console.error(error));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
