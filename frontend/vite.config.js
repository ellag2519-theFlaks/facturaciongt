import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true listens on all network interfaces (not just localhost), so
  // the dev server is reachable from another device on the same LAN (e.g.
  // a phone or tablet, for real-device compatibility testing).
  server: {
    host: true,
  },
})
