import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  root: 'web/src',
  build: {
    outDir: '../public',
    emptyOutDir: false, // Don't empty the directory - preserve docs/, tests/, etc.
    rollupOptions: {
      output: {
        // Keep consistent naming for easier debugging
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'web/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Proxy API calls to Express server during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/hmrc': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/account': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
