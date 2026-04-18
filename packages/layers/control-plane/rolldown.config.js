import { defineConfig } from 'rolldown';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Entry points
  input: {
    index: 'src/index.ts',
    cli: 'src/cli/main.ts',
  },

  // Output configuration
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    // Preserve file structure for CLI entry point
    entryFileNames: '[name].js',
  },

  // Platform: node (not browser)
  platform: 'node',

  // External: don't bundle native Node.js modules or dependencies
  external: [
    // Node.js built-ins
    /^node:/,
    'fs',
    'fs/promises',
    'path',
    'crypto',
    'os',
    'url',
    'util',
    'stream',
    'http',
    'https',
    'net',
    'tls',
    'zlib',
    'events',
    'process',
    'buffer',
    'querystring',
    'string_decoder',
    'timers',
    'timers/promises',
  ],

  // TypeScript support is native in Rolldown (via oxc)
  // No plugin needed!

  // Resolve .js extensions for ESM
  resolve: {
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },

  // Optimization
  treeshake: true,

  // Logging
  logLevel: 'info',
});
