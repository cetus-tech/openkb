import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:6800',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://localhost:6800',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:6800',
        changeOrigin: true,
        bypass(req) {
          if (req.method === 'GET' && (req.url === '/auth/login' || req.url === '/auth/register')) {
            return req.url
          }
        },
      },
      '/health': {
        target: 'http://localhost:6800',
        changeOrigin: true,
      },
    },
  },
})
