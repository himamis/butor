import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const API_PORT = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: process.env.HOST, // HOST=0.0.0.0 npm run dev → reachable on the LAN
    // The Node server (server/main.ts) owns /api in development too.
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
  preview: { port: 4173 },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
});
