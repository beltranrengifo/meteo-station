import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `pnpm dev` runs only Vite, which cannot run the api/ functions. Send /api to the deployed
    // API instead, so the dashboard gets real data with no Vercel link or secrets on the Mac.
    // To work on api/ itself, use `pnpm dev:api` (vercel dev) instead.
    proxy: {
      '/api': { target: 'https://gorraplanistas.vercel.app', changeOrigin: true },
    },
  },
});
