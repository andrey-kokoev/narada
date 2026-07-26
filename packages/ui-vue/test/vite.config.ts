import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./fixture', import.meta.url)),
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@narada2/ui-vue/styles.css',
        replacement: fileURLToPath(new URL('../src/styles.css', import.meta.url)),
      },
      {
        find: '@narada2/ui-vue',
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
      {
        find: '@narada2/ui/styles.css',
        replacement: fileURLToPath(new URL('../../ui/dist/styles.css', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-fixture', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./fixture/index.html', import.meta.url)),
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION' && /@vueuse[\\/]core/.test(String(warning.id ?? ''))) return;
        warn(warning);
      },
    },
  },
});
