#!/bin/bash

echo "🚀 簡単デプロイメント開始"

# 既存プロセス停止
echo "🛑 既存サーバー停止中..."
pkill -f "node.*server.js" && sleep 2

# 依存関係とビルド
echo "📦 ビルド実行中..."
npm ci && npm run build

# データベース最適化
echo "🗄️ データベース最適化中..."
npm run db:optimize

# サーバー起動
echo "🌟 本番サーバー起動中..."
NODE_ENV=production node backend/server.js &
echo "✅ デプロイメント完了！"
echo "🔗 アクセス: http://localhost:5001"