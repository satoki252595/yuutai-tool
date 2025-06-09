#!/bin/bash

# GCEデプロイメントスクリプト
set -e

echo "🚀 GCE環境へのデプロイ開始..."

# 環境変数の読み込み
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# カラー定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# プロジェクトIDの確認
if [ -z "$GCP_PROJECT_ID" ]; then
    echo -e "${RED}❌ GCP_PROJECT_ID が設定されていません${NC}"
    exit 1
fi

echo -e "${GREEN}📋 プロジェクト: $GCP_PROJECT_ID${NC}"

# 1. 既存のコンテナを停止
echo -e "\n${YELLOW}1. 既存のコンテナを停止${NC}"
docker-compose -f docker-compose.gce.yml down 2>/dev/null || true

# 2. 古いイメージの削除（ディスク容量確保）
echo -e "\n${YELLOW}2. 古いイメージの削除${NC}"
docker system prune -f

# 3. イメージのビルド
echo -e "\n${YELLOW}3. Dockerイメージのビルド${NC}"
docker-compose -f docker-compose.gce.yml build --no-cache

# 4. データベースの初期化（初回のみ）
if [ ! -f "/mnt/disks/yuutai-data/db/yuutai.db" ]; then
    echo -e "\n${YELLOW}4. データベースの初期化${NC}"
    docker-compose -f docker-compose.gce.yml run --rm backend node backend/db/init.js
    echo "✅ データベースを初期化しました"
else
    echo -e "\n${YELLOW}4. データベース確認${NC}"
    echo "✅ 既存のデータベースを使用します"
fi

# 5. コンテナの起動
echo -e "\n${YELLOW}5. コンテナの起動${NC}"
docker-compose -f docker-compose.gce.yml up -d

# 6. ヘルスチェック
echo -e "\n${YELLOW}6. ヘルスチェック${NC}"
echo "サービスの起動を待機中..."
sleep 20

# バックエンドのヘルスチェック
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ バックエンドは正常に起動しました${NC}"
        break
    else
        echo "⏳ バックエンドの起動を待機中... ($((RETRY_COUNT+1))/$MAX_RETRIES)"
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT+1))
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ バックエンドの起動に失敗しました${NC}"
    docker-compose -f docker-compose.gce.yml logs backend
    exit 1
fi

# フロントエンドのチェック
if curl -f http://localhost > /dev/null 2>&1; then
    echo -e "${GREEN}✅ フロントエンドは正常に起動しました${NC}"
else
    echo -e "${RED}❌ フロントエンドの起動に失敗しました${NC}"
    docker-compose -f docker-compose.gce.yml logs frontend
fi

# 7. 初期データの取得（オプション）
echo -e "\n${YELLOW}7. 初期データ取得の確認${NC}"
read -p "初期データ（JPX銘柄情報）を取得しますか？ (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "JPXデータを取得中..."
    docker-compose -f docker-compose.gce.yml exec backend node backend/jpx-data-fetcher.js
    echo "銘柄情報を更新中..."
    docker-compose -f docker-compose.gce.yml exec backend node backend/comprehensive-stock-updater.js stocks-only
    echo -e "${GREEN}✅ 初期データを取得しました${NC}"
fi

# 8. 外部IPアドレスの確認
echo -e "\n${YELLOW}8. アクセス情報${NC}"
INSTANCE_NAME=$(hostname)
EXTERNAL_IP=$(curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google")

echo -e "${GREEN}✨ デプロイ完了！${NC}"
echo ""
echo "📊 コンテナステータス:"
docker-compose -f docker-compose.gce.yml ps
echo ""
echo "🌐 アクセスURL:"
echo "   http://$EXTERNAL_IP"
echo ""
echo "📝 便利なコマンド:"
echo "   ログ確認: docker-compose -f docker-compose.gce.yml logs -f"
echo "   再起動: docker-compose -f docker-compose.gce.yml restart"
echo "   停止: docker-compose -f docker-compose.gce.yml down"
echo "   統計: docker stats"
echo ""
echo "🔐 SSL証明書の設定:"
echo "   Let's Encryptを使用する場合:"
echo "   ./setup-ssl.sh $EXTERNAL_IP"