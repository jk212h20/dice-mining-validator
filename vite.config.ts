import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dice-mining-validator/',
  server: {
    host: true,
    port: 5174
  },
  build: {
    outDir: 'dist'
  }
})
