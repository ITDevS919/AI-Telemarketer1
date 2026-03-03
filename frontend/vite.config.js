import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      '/twilio': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/twiml': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});

