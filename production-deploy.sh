#!/bin/bash

echo "🚀 本番環境デプロイメントスクリプト開始"

# 環境変数の設定
export NODE_ENV=production

echo "🛑 既存サーバーの停止..."
pkill -f "node.*server.js" || echo "既存サーバーなし"
sleep 2

echo "📦 依存関係のインストール..."
# devDependenciesも含めてインストール（ビルドに必要）
npm ci

echo "🏗️ フロントエンドビルド..."
npm run build

echo "📦 本番用依存関係の再インストール..."
# ビルド後にdevDependenciesを除外
npm ci --omit=dev

echo "🗄️ データベース最適化..."
npm run db:optimize

echo "🧪 本番環境セットアップ（軽量版）..."
npm run setup:prod

echo "🌟 本番サーバー起動（バックグラウンド）..."
npm run server:prod &
SERVER_PID=$!

echo "⏳ サーバー起動待機..."
sleep 5

echo "🔍 ヘルスチェック..."
for i in {1..10}; do
  if curl -s http://localhost:5001/api/health > /dev/null; then
    echo "✅ ヘルスチェック成功 (試行 $i/10)"
    echo "🌐 サーバーが正常に起動しました"
    echo "📊 ヘルス情報:"
    curl -s http://localhost:5001/api/health | head -5
    echo ""
    echo "✅ デプロイメント完了"
    echo "🌟 サーバーPID: $SERVER_PID"
    echo "🔗 アクセス: http://localhost:5001"
    exit 0
  else
    echo "⏳ ヘルスチェック失敗 (試行 $i/10) - 再試行中..."
    sleep 3
  fi
done

echo "❌ サーバー起動に失敗しました"
echo "🔍 プロセス確認:"
ps aux | grep node
exit 1