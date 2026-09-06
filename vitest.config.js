import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react-native': path.resolve(__dirname, './apps/mobile/tests/mocks/react-native.js'),
    },
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  esbuild: {
    loader: 'jsx',
    include: /\.[jt]sx?$/,
    exclude: [],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.vite/**'],
    fakeTimers: {
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    },
  },
});
