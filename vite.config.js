import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Serve from root for custom domain (no subdirectory)
  base: '/',

  build: {
    outDir: 'dist',
    // Copy static assets that Vite doesn't process automatically
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },

  // Expose data/, logo.jpg, CNAME etc. as static public assets
  publicDir: 'public'
});
