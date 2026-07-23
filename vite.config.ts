import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from GitHub Pages at https://<user>.github.io/stellar-testnet-pay/,
// so production assets must resolve under that sub-path. In dev we stay at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/stellar-testnet-pay/' : '/',
  plugins: [react()],
  define: {
    // Some Stellar SDK transitive deps reference `global` in the browser.
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
  },
}));
