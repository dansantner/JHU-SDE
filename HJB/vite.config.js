import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    commonjsOptions: {
      // Transform project-level CJS files (engine.js uses module.exports + require)
      include: [/engine\.js/, /node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
