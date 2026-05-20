import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendPort = Number.parseInt(String(env.PORT || '3366'), 10) || 3366;
  const explicitProxyTarget =
    env.VITE_API_PROXY_TARGET?.trim() ||
    env.API_PROXY_TARGET?.trim() ||
    env.VITE_API_BASE_URL?.trim() ||
    '';
  const proxyTarget = explicitProxyTarget || `http://127.0.0.1:${backendPort}`;
  
  return {
    server: {
      port: 5188,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        }
      },
    },
    plugins: [
      {
        name: 'spa-route-rewrites',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/create/classic' || req.url === '/create/classic/') {
              req.url = '/classic-app/index.html';
            }
            // /create/flow is handled by React SPA (App.tsx), rewrite to index.html
            if (req.url?.startsWith('/create/flow')) {
              req.url = '/index.html';
            }
            if (req.url?.startsWith('/assets')) {
              req.url = '/index.html';
            }
            if (req.url?.startsWith('/model-mapping')) {
              req.url = '/index.html';
            }
            next();
          });
        },
      },
      react(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three-vendor';
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: [],
    },
  };
});
