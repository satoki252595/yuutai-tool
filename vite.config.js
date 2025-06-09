import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      hot: {
        preserveLocalState: false,
        noReload: false
      },
      compilerOptions: {
        // Svelteコンパイラの最適化設定
        dev: false,
        css: true,
        hydratable: false
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  },
  define: {
    // カスタム要素の重複定義エラーを防ぐ
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  },
  build: {
    // ビルド最適化設定
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace']
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        // コード分割の最適化
        manualChunks: {
          'vendor': ['svelte']
        }
      }
    },
    // アセットサイズ警告の調整
    chunkSizeWarningLimit: 500,
    // CSS最適化
    cssCodeSplit: true,
    // ソースマップを本番環境では無効化
    sourcemap: false
  },
  // 依存関係の最適化
  optimizeDeps: {
    include: ['svelte']
  }
});