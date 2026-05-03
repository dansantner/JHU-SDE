import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-jump',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    commonjsOptions: {
      include: [/jumpengine\.js/, /node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: 'jump.html',
      output: { inlineDynamicImports: true },
    },
  },
});
