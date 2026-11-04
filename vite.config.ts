import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = process.env.API_URL ?? 'http://localhost:8787';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: ['es2022', 'safari15'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': api,
      '/manifest.webmanifest': api,
    },
  },
  preview: {
    proxy: {
      '/api': api,
      '/manifest.webmanifest': api,
    },
  },
});
