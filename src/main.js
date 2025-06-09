import App from './App.svelte';
import './app.css';
import './app-mobile.css';

// カスタム要素の重複定義エラーを防ぐガード
if (import.meta.hot) {
  // HMR使用時にカスタム要素をクリア
  if (window.customElements) {
    const registry = window.customElements;
    // 既存のカスタム要素定義をクリア（可能であれば）
    if (registry._definitions) {
      registry._definitions.clear();
    }
  }
  
  // エラーハンドリング
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('autosize-textarea')) {
      console.warn('Custom element redefinition error suppressed for HMR');
      event.preventDefault();
      return false;
    }
  });
}

const app = new App({
  target: document.getElementById('app')
});

export default app;