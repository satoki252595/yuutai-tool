#!/bin/bash

# 本番環境デプロイスクリプト
set -e

echo "🚀 優待投資ツール 本番環境デプロイを開始します..."

# 環境変数の確認
if [ ! -f .env ]; then
    echo "❌ .envファイルが見つかりません。.env.exampleをコピーして設定してください。"
    exit 1
fi

# Gitの最新を取得
echo "📥 最新のコードを取得中..."
git pull origin main

# Dockerイメージのビルド
echo "🔨 Dockerイメージをビルド中..."
docker-compose -f docker-compose.prod.yml build --no-cache

# 既存のコンテナを停止
echo "🛑 既存のコンテナを停止中..."
docker-compose -f docker-compose.prod.yml down

# データベースのバックアップ
if [ -f backend/db/yuutai.db ]; then
    echo "💾 データベースをバックアップ中..."
    mkdir -p backups
    cp backend/db/yuutai.db backups/yuutai-$(date +%Y%m%d-%H%M%S).db
fi

# コンテナの起動
echo "🚀 新しいコンテナを起動中..."
docker-compose -f docker-compose.prod.yml up -d

# ヘルスチェック
echo "🏥 ヘルスチェック中..."
sleep 10
HEALTH_CHECK=$(curl -s http://localhost:5001/api/health | jq -r '.status' 2>/dev/null || echo "error")

if [ "$HEALTH_CHECK" = "healthy" ]; then
    echo "✅ デプロイが正常に完了しました！"
    echo "📊 コンテナの状態:"
    docker-compose -f docker-compose.prod.yml ps
else
    echo "❌ ヘルスチェックに失敗しました。ログを確認してください。"
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

echo "🎉 デプロイ完了！"