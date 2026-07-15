import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src',
  // The UI is mounted below an Operator Router session path as well as at a root URL.
  // Relative asset URLs work in both forms without depending on runtime HTML rewriting.
  base: './',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION' && /@vueuse[\\/]core/.test(String(warning.id ?? ''))) return;
        warn(warning);
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
