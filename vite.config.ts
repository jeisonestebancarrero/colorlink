import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // AI Studio define DISABLE_HMR para evitar parpadeos mientras el agente edita.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Sin vigilancia de archivos en ese modo, para ahorrar CPU.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
