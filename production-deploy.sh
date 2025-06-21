#!/bin/bash

echo "🚀 本番環境デプロイメントスクリプト開始"

# 環境変数の設定
export NODE_ENV=production

echo "📦 依存関係のインストール..."
npm ci --omit=dev

echo "🏗️ フロントエンドビルド..."
npm run build

echo "🗄️ データベース最適化..."
npm run db:optimize

echo "🧪 本番環境セットアップ（軽量版）..."
npm run setup:prod

echo "🔍 ヘルスチェック..."
timeout 10s node -e "
const fetch = require('node-fetch');
setTimeout(async () => {
  try {
    const response = await fetch('http://localhost:5001/api/health');
    const health = await response.json();
    console.log('✅ ヘルスチェック成功:', health.status);
    process.exit(0);
  } catch (error) {
    console.log('❌ ヘルスチェック失敗:', error.message);
    process.exit(1);
  }
}, 2000);
" &

echo "🌟 本番サーバー起動..."
npm run server:prod

echo "✅ デプロイメント完了"