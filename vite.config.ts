/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
      plugins: [react()],
      define: {
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './test/setup.ts',
        include: ['**/*.{test,spec}.{ts,tsx}'],
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'fs': path.resolve(__dirname, 'src/mocks/fs-mock.js'),
        }
      }
    };
});
