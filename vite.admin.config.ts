import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/** Build del portal interno, separado para que el bundle del cliente no incluya el back-office. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: {
    outDir: 'dist-admin',
    rollupOptions: { input: path.resolve(__dirname, 'admin.html') },
  },
  server: { port: 3001 },
});
