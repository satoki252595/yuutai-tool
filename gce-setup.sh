#!/bin/bash

# GCE環境セットアップスクリプト
set -e

echo "🚀 GCE環境セットアップ開始..."

# 必要な変数の確認
if [ -z "$GCP_PROJECT_ID" ]; then
    echo "❌ GCP_PROJECT_ID が設定されていません"
    echo "使用方法: GCP_PROJECT_ID=your-project-id ./gce-setup.sh"
    exit 1
fi

# カラー定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}📋 プロジェクト: $GCP_PROJECT_ID${NC}"

# 1. システムパッケージの更新
echo -e "\n${YELLOW}1. システムパッケージの更新${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# 2. Dockerのインストール
echo -e "\n${YELLOW}2. Dockerのインストール${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Dockerをインストールしました"
else
    echo "✅ Dockerは既にインストールされています"
fi

# 3. Docker Composeのインストール
echo -e "\n${YELLOW}3. Docker Composeのインストール${NC}"
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Composeをインストールしました"
else
    echo "✅ Docker Composeは既にインストールされています"
fi

# 4. 永続ディスクのセットアップ
echo -e "\n${YELLOW}4. 永続ディスクのセットアップ${NC}"
DISK_NAME="yuutai-data"
MOUNT_POINT="/mnt/disks/$DISK_NAME"

if [ ! -d "$MOUNT_POINT" ]; then
    # ディスクのアタッチ確認
    if ! lsblk | grep -q "sdb"; then
        echo "⚠️  永続ディスクがアタッチされていません"
        echo "以下のコマンドでディスクをアタッチしてください："
        echo "gcloud compute disks create $DISK_NAME --size=20GB --zone=YOUR_ZONE"
        echo "gcloud compute instances attach-disk YOUR_INSTANCE --disk=$DISK_NAME --zone=YOUR_ZONE"
    else
        # フォーマットとマウント
        sudo mkfs.ext4 -F /dev/sdb
        sudo mkdir -p $MOUNT_POINT
        sudo mount /dev/sdb $MOUNT_POINT
        
        # fstabに追加
        echo "/dev/sdb $MOUNT_POINT ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
        
        # ディレクトリ作成
        sudo mkdir -p $MOUNT_POINT/db
        sudo mkdir -p $MOUNT_POINT/cache
        sudo chown -R $USER:$USER $MOUNT_POINT
        
        echo "✅ 永続ディスクをマウントしました"
    fi
else
    echo "✅ 永続ディスクは既にマウントされています"
fi

# 5. ファイアウォールルールの設定
echo -e "\n${YELLOW}5. ファイアウォールルールの設定${NC}"
gcloud compute firewall-rules create allow-http \
    --allow tcp:80 \
    --source-ranges 0.0.0.0/0 \
    --target-tags http-server \
    --project $GCP_PROJECT_ID 2>/dev/null || echo "✅ HTTPルールは既に存在します"

gcloud compute firewall-rules create allow-https \
    --allow tcp:443 \
    --source-ranges 0.0.0.0/0 \
    --target-tags https-server \
    --project $GCP_PROJECT_ID 2>/dev/null || echo "✅ HTTPSルールは既に存在します"

# 6. スワップファイルの作成（メモリ不足対策）
echo -e "\n${YELLOW}6. スワップファイルの作成${NC}"
if [ ! -f /swapfile ]; then
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
    echo "✅ 4GBのスワップファイルを作成しました"
else
    echo "✅ スワップファイルは既に存在します"
fi

# 7. 環境変数ファイルの作成
echo -e "\n${YELLOW}7. 環境変数ファイルの作成${NC}"
if [ ! -f .env ]; then
    cat > .env << EOF
# GCP設定
GCP_PROJECT_ID=$GCP_PROJECT_ID

# アプリケーション設定
NODE_ENV=production
PORT=5001
SCRAPING_INTERVAL=86400000

# ログレベル
LOG_LEVEL=info
EOF
    echo "✅ .envファイルを作成しました"
else
    echo "✅ .envファイルは既に存在します"
fi

# 8. Cloud Loggingのセットアップ（オプション）
echo -e "\n${YELLOW}8. Cloud Loggingのセットアップ${NC}"
echo "Cloud Loggingを使用する場合は、以下を実行してください："
echo "1. サービスアカウントの作成"
echo "   gcloud iam service-accounts create yuutai-app --display-name=\"Yuutai App Service Account\""
echo "2. 必要な権限の付与"
echo "   gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \\"
echo "     --member=\"serviceAccount:yuutai-app@$GCP_PROJECT_ID.iam.gserviceaccount.com\" \\"
echo "     --role=\"roles/logging.logWriter\""

# 9. 起動スクリプトの設定
echo -e "\n${YELLOW}9. 起動スクリプトの設定${NC}"
sudo tee /etc/systemd/system/yuutai-app.service > /dev/null << EOF
[Unit]
Description=Yuutai Investment Tool
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/local/bin/docker-compose -f docker-compose.gce.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.gce.yml down
User=$USER
Group=docker

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable yuutai-app.service
echo "✅ systemdサービスを設定しました"

# 完了メッセージ
echo -e "\n${GREEN}✨ セットアップ完了！${NC}"
echo ""
echo "次のステップ："
echo "1. 再ログインしてDockerグループを有効化"
echo "   exit && gcloud compute ssh YOUR_INSTANCE"
echo ""
echo "2. アプリケーションのデプロイ"
echo "   ./gce-deploy.sh"
echo ""
echo "3. 外部IPの確認"
echo "   gcloud compute instances list --project=$GCP_PROJECT_ID"