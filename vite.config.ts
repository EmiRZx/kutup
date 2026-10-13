import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the same build works at / locally and at /kutup/ on GitHub Pages.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
