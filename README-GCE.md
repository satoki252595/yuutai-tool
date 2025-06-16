# Google Compute Engine (GCE) 無料枠デプロイガイド

優待投資ツールをGCE無料枠インスタンスでDocker Composeを使用して運用するための手順です。

## 前提条件

- Google Cloud Platform アカウント
- `gcloud` CLI ツールがインストール済み
- 基本的なLinux/Docker知識

## 1. GCEインスタンス作成

### 無料枠の制約内でインスタンスを作成：

```bash
# プロジェクト設定（必要に応じて変更）
gcloud config set project YOUR_PROJECT_ID

# 無料枠インスタンス作成（us-central1, us-west1, us-east1のいずれかを選択）
gcloud compute instances create yuutai-app \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --subnet=default \
    --network-tier=PREMIUM \
    --maintenance-policy=MIGRATE \
    --service-account=YOUR_PROJECT_ID-compute@developer.gserviceaccount.com \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --image=ubuntu-2004-focal-v20231213 \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --boot-disk-device-name=yuutai-app
```

## 2. ファイアウォール設定

```bash
# HTTP (ポート80) とHTTPS (ポート443) を許可
gcloud compute firewall-rules create allow-yuutai-http \
    --allow tcp:80,tcp:443,tcp:3000 \
    --source-ranges 0.0.0.0/0 \
    --description "Allow HTTP/HTTPS for yuutai app"
```

## 3. インスタンスに接続

```bash
gcloud compute ssh yuutai-app --zone=us-central1-a
```

## 4. サーバー環境セットアップ

### Docker と Docker Compose のインストール：

```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# 必要パッケージインストール
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Docker公式GPGキー追加
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Dockerリポジトリ追加
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker インストール
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Dockerグループにユーザー追加
sudo usermod -aG docker $USER

# Docker Compose インストール（スタンドアロン版）
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 再ログイン
exit
```

再度SSHで接続：
```bash
gcloud compute ssh yuutai-app --zone=us-central1-a
```

## 5. アプリケーションデプロイ

### ソースコード配置：

```bash
# Gitからクローン（または手動でファイル転送）
git clone https://github.com/YOUR_USERNAME/yuutai-investment-tool.git
cd yuutai-investment-tool

# または、ローカルからファイル転送の場合：
# gcloud compute scp --recurse ./yuutai-investment-tool yuutai-app:~/ --zone=us-central1-a
```

### 本番用Docker Compose設定：

```bash
# docker-compose.prod.yml を使用
cp docker-compose.prod.yml docker-compose.yml

# 必要なディレクトリを作成
mkdir -p backend/db backend/cache

# 環境変数設定（必要に応じて）
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
EOF
```

### アプリケーション起動：

```bash
# Docker Composeでビルド・起動（scraperコンテナは含まれません）
docker-compose up -d --build

# ログ確認
docker-compose logs -f

# サービス状態確認
docker-compose ps
```

## 6. データベースのアップロード

優待情報のスクレイピングは**ローカル環境**で実行し、生成されたDBファイルをGCEにアップロードします。

### ローカル環境での作業：

```bash
# ローカル環境でスクレイピングを実行
cd /path/to/yuutai-investment-tool
npm run setup

# 生成されたDBファイルをGCEにアップロード
gcloud compute scp backend/db/yuutai.db yuutai-app:~/yuutai-investment-tool/backend/db/ --zone=us-central1-a
```

### GCE上での作業：

```bash
# DBファイルの権限を修正（コンテナ内のnodejsユーザーがアクセスできるように）
cd ~/yuutai-investment-tool
docker-compose exec backend chown nodejs:nodejs /app/backend/db/yuutai.db

# バックエンドを再起動
docker-compose restart backend

# ログを確認して正常に起動しているか確認
docker-compose logs --tail=50 backend
```

### データ更新時の手順：

1. ローカル環境で`npm run setup`を実行して最新データを取得
2. `gcloud compute scp`でDBファイルをアップロード
3. GCE上で権限を修正してバックエンドを再起動

## 7. Nginxリバースプロキシ設定（オプション）

### SSL証明書とリバースプロキシの設定：

```bash
# Nginxインストール
sudo apt install -y nginx certbot python3-certbot-nginx

# Nginx設定ファイル作成
sudo tee /etc/nginx/sites-available/yuutai << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN.com;  # 実際のドメインに変更

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# サイト有効化
sudo ln -s /etc/nginx/sites-available/yuutai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL証明書取得（ドメインが設定済みの場合）
sudo certbot --nginx -d YOUR_DOMAIN.com
```

## 8. システム起動時の自動起動設定

```bash
# Docker自動起動設定
sudo systemctl enable docker

# Docker Composeサービスファイル作成（USERNAMEは自動的に置換される）
sudo tee /etc/systemd/system/yuutai-app.service << EOF
[Unit]
Description=Yuutai Investment Tool
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/$USER/yuutai-investment-tool
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# サービス有効化
sudo systemctl daemon-reload
sudo systemctl enable yuutai-app.service
```

## 9. モニタリングと管理

### ログ確認：
```bash
# アプリケーションログ
docker-compose logs -f backend
docker-compose logs -f frontend

# システムログ
sudo journalctl -f -u yuutai-app.service
```

### リソース監視：
```bash
# Dockerコンテナリソース使用量
docker stats

# システムリソース
htop
df -h
free -h
```

### 定期的なメンテナンス：
```bash
# Docker不要イメージ削除
docker system prune -f

# ログローテーション設定
sudo tee /etc/logrotate.d/docker-containers << 'EOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=1M
    missingok
    delaycompress
    copytruncate
}
EOF
```

## 10. アクセス方法

アプリケーションには以下の方法でアクセス可能です：

- **直接アクセス**: `http://EXTERNAL_IP:3000`
- **Nginxプロキシ経由**: `http://YOUR_DOMAIN.com` (設定済みの場合)
- **HTTPS**: `https://YOUR_DOMAIN.com` (SSL証明書設定済みの場合)

### 外部IPアドレス確認：
```bash
gcloud compute instances describe yuutai-app --zone=us-central1-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

## 11. トラブルシューティング

### よくある問題と対処法：

**メモリ不足エラー**:
```bash
# スワップファイル作成（無料枠では1GB RAMのため）
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Docker権限エラー**:
```bash
sudo usermod -aG docker $USER
# 再ログインが必要
```

**ポートアクセス問題**:
```bash
# ファイアウォール確認
sudo ufw status
gcloud compute firewall-rules list
```

## 12. コスト最適化

無料枠を最大限活用するため：

- インスタンスタイプ: `e2-micro` (無料枠対象)
- リージョン: us-central1, us-west1, us-east1のいずれか
- ストレージ: 30GB以下
- 月間使用時間: 744時間以下
- 定期的な不要リソース削除

## セキュリティ考慮事項

- デフォルトパスワードの変更
- 不要なポートの閉鎖
- 定期的なセキュリティアップデート
- SSL証明書の使用
- ファイアウォール設定の最小化

この手順により、GCE無料枠でコスト効率的に優待投資ツールを運用できます。