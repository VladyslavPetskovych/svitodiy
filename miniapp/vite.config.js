import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Локально /api іде на сервер гри (npm run dev:server у корені).
    proxy: { '/api': process.env.DEV_API_ORIGIN ?? 'http://localhost:3000' },
  },
  preview: {
    proxy: { '/api': process.env.DEV_API_ORIGIN ?? 'http://localhost:3000' },
  },
})
