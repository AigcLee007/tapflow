import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [
      '.worktrees/**',
      '.review-*/**',
      '.tmp/**',
      '.codex/**',
      '.codex-tmp/**',
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      '**/dist/**',
      'output/**',
    ],
    testTimeout: 30000,    
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
