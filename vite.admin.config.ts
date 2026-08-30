import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Build de la aplicación INTERNA.
 *
 * Deliberadamente separado de vite.config.ts: son dos bundles, dos
 * contenedores y dos despliegues. El portal del cliente no debe contener ni
 * una línea del back-office, ni siquiera su pantalla de acceso.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: {
    outDir: 'dist-admin',
    rollupOptions: { input: path.resolve(__dirname, 'admin.html') },
  },
  server: { port: 3001 },
});
