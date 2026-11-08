import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// LABYRINTH_API_URL lets a second dev server point at a different backend (default: the usual port).
const apiTarget = process.env.LABYRINTH_API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
});
