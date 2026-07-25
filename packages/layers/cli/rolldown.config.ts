import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
  },
  platform: 'node',
  external: [
    /^node:/,
    'fs', 'fs/promises', 'path', 'crypto', 'os', 'url',
    'util', 'stream', 'http', 'https', 'net', 'tls',
    'zlib', 'events', 'process', 'buffer',
  ],
  resolve: {
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  treeshake: true,
});
