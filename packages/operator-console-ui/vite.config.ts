import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src',
  base: '/console/',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@narada2/site-registry-contract': fileURLToPath(new URL('../site-registry-contract/src/index.ts', import.meta.url)),
    },
  },
});
