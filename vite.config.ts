import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const LOCAL_EXTENSIONS_MODULE = 'virtual:t8-local-extensions';
const LOCAL_EXTENSIONS_ENTRY = path.resolve(__dirname, 'local-private', 'extensions', 'frontend', 'index.tsx');
const EMPTY_EXTENSIONS_ENTRY = path.resolve(__dirname, 'src', 'extensions', 'emptyLocalExtensions.tsx');

function localExtensionsPlugin() {
  return {
    name: 't8-local-extensions',
    resolveId(id: string) {
      if (id !== LOCAL_EXTENSIONS_MODULE) return null;
      const disabled = process.env.T8_ENABLE_LOCAL_PRIVATE === '0'
        || process.env.T8_DISABLE_LOCAL_EXTENSIONS === '1';
      const enabled = !disabled;
      return enabled && fs.existsSync(LOCAL_EXTENSIONS_ENTRY)
        ? LOCAL_EXTENSIONS_ENTRY
        : EMPTY_EXTENSIONS_ENTRY;
    },
  };
}

// T8-penguin-canvas Vite 配置
// 端口策略:前端 11422 / 后端 18766(避开主项目 5176/18765 与常见 51xx 占用)
const BACKEND_TARGET = 'http://127.0.0.1:18766';

function localBackendProxy(label: string) {
  return {
    target: BACKEND_TARGET,
    changeOrigin: true,
    configure(proxy: any) {
      proxy.on('error', (error: any, _req: any, res: any) => {
        if (!res || res.headersSent || typeof res.writeHead !== 'function') return;
        const detail = error?.code || error?.message || 'proxy_error';
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: false,
          error: `${label} 后端服务不可用，请先启动 npm run dev:backend（${BACKEND_TARGET}）。${detail}`,
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localExtensionsPlugin()],
  assetsInclude: ['**/*.mid'],
  optimizeDeps: {
    include: [
      '@xyflow/react',
      'lucide-react',
      'react',
      'react-dom',
      'react-dom/client',
      'zustand',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 11422,
    strictPort: true,
    host: '127.0.0.1',
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/components/Canvas.tsx',
        './src/components/nodes/ImageNode.tsx',
        './src/components/nodes/UploadNode.tsx',
        './src/components/nodes/OutputNode.tsx',
      ],
    },
    proxy: {
      // 后端 API 代理
      '/api': localBackendProxy('API'),
      // 静态文件服务代理
      '/files': localBackendProxy('files'),
      '/output': localBackendProxy('output'),
      '/input': localBackendProxy('input'),
      // 同源代理外部 LibreChat 工作区
      '/codex': localBackendProxy('codex'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'xyflow': ['@xyflow/react'],
        },
      },
    },
  },
  define: {
      __APP_VERSION__: JSON.stringify('2.2.7'),
    __APP_NAME__: JSON.stringify('T8-penguin-canvas'),
  },
});
