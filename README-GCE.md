# GCE (Google Compute Engine) デプロイメントガイド

## 📋 概要

優待投資ツールをGCE上にデプロイするための完全ガイドです。

## 🏗️ アーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐
│   Cloud DNS     │────▶│   Static IP      │
└─────────────────┘     └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │  GCE Instance    │
                        │                  │
                        │  ┌────────────┐  │
                        │  │  Frontend  │  │
                        │  │  (Nginx)   │  │
                        │  └──────┬─────┘  │
                        │         │        │
                        │  ┌──────▼─────┐  │
                        │  │  Backend   │  │
                        │  │  (Node.js) │  │
                        │  └──────┬─────┘  │
                        │         │        │
                        │  ┌──────▼─────┐  │
                        │  │  Scraper   │  │
                        │  │ (Puppeteer)│  │
                        │  └────────────┘  │
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │ Persistent Disk  │
                        │  - Database      │
                        │  - Cache         │
                        └──────────────────┘
```

## 🚀 クイックスタート

### 前提条件

- GCPアカウントとプロジェクト
- gcloudコマンドラインツール
- 課金が有効なプロジェクト

### 1. Terraformを使用した自動構築（推奨）

```bash
# Terraformのインストール（Mac）
brew install terraform

# 設定ファイルのコピー
cd terraform
cp terraform.tfvars.example terraform.tfvars

# terraform.tfvarsを編集してプロジェクトIDを設定
vim terraform.tfvars

# リソースの作成
terraform init
terraform plan
terraform apply

# 出力されたIPアドレスとSSHコマンドを確認
terraform output
```

### 2. 手動セットアップ

#### Step 1: GCEインスタンスの作成

```bash
# プロジェクトIDを設定
export PROJECT_ID=your-project-id
export ZONE=asia-northeast1-a

# インスタンスの作成
gcloud compute instances create yuutai-app \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=e2-medium \
  --network-interface=network-tier=PREMIUM,subnet=default \
  --maintenance-policy=MIGRATE \
  --tags=http-server,https-server \
  --create-disk=auto-delete=yes,boot=yes,device-name=yuutai-app,image=projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20240319,mode=rw,size=20 \
  --no-shielded-secure-boot \
  --shielded-vtpm \
  --shielded-integrity-monitoring \
  --reservation-affinity=any

# 永続ディスクの作成
gcloud compute disks create yuutai-data \
  --size=20GB \
  --zone=$ZONE \
  --project=$PROJECT_ID

# ディスクのアタッチ
gcloud compute instances attach-disk yuutai-app \
  --disk=yuutai-data \
  --zone=$ZONE \
  --project=$PROJECT_ID
```

#### Step 2: インスタンスへの接続

```bash
# SSHで接続
gcloud compute ssh yuutai-app --zone=$ZONE --project=$PROJECT_ID
```

#### Step 3: 環境セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/your-repo/yuutai-tool.git
cd yuutai-tool

# セットアップスクリプトの実行
export GCP_PROJECT_ID=your-project-id
./gce-setup.sh
```

#### Step 4: アプリケーションのデプロイ

```bash
# デプロイスクリプトの実行
./gce-deploy.sh
```

## 🔧 詳細設定

### メモリ最適化

スクレイピング処理でメモリ不足になる場合：

```bash
# スワップサイズを増やす
sudo swapoff /swapfile
sudo rm /swapfile
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Puppeteer最適化

`docker-compose.gce.yml`で以下の環境変数を調整：

```yaml
environment:
  - PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu,--no-zygote,--single-process
```

### スクレイピング間隔の調整

```bash
# .envファイルで設定（ミリ秒単位）
SCRAPING_INTERVAL=43200000  # 12時間ごと
```

## 🔐 SSL証明書の設定

### Let's Encryptを使用

```bash
# ドメインを設定してSSL証明書を取得
./setup-ssl.sh your-domain.com your-email@example.com
```

### Cloud Load Balancerを使用（推奨）

```bash
# ロードバランサーの作成
gcloud compute backend-services create yuutai-backend \
  --protocol=HTTP \
  --port-name=http \
  --health-checks=yuutai-health-check \
  --global

# SSL証明書の作成
gcloud compute ssl-certificates create yuutai-cert \
  --domains=your-domain.com \
  --global
```

## 📊 モニタリング

### Cloud Loggingの設定

```bash
# ログの確認
gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=yuutai-app" \
  --limit=50 \
  --project=$PROJECT_ID
```

### Cloud Monitoringダッシュボード

1. GCPコンソールでMonitoringを開く
2. カスタムダッシュボードを作成
3. 以下のメトリクスを追加：
   - CPU使用率
   - メモリ使用率
   - ディスクI/O
   - ネットワークトラフィック

## 🔄 メンテナンス

### バックアップ

```bash
# データベースのバックアップ
docker-compose -f docker-compose.gce.yml exec backend \
  sqlite3 /app/backend/db/yuutai.db ".backup /app/backend/db/backup-$(date +%Y%m%d).db"

# Cloud Storageへのアップロード
gsutil cp /mnt/disks/yuutai-data/db/backup-*.db gs://your-backup-bucket/
```

### アップデート手順

```bash
# コードの更新
git pull origin main

# イメージの再ビルド
docker-compose -f docker-compose.gce.yml build --no-cache

# ローリングアップデート
docker-compose -f docker-compose.gce.yml up -d
```

### スケジューリング

Cloud Schedulerを使用した定期タスク：

```bash
# 毎日午前3時にスクレイパーを再起動
gcloud scheduler jobs create http restart-scraper \
  --schedule="0 3 * * *" \
  --uri="https://compute.googleapis.com/compute/v1/projects/$PROJECT_ID/zones/$ZONE/instances/yuutai-app/reset" \
  --http-method=POST \
  --time-zone="Asia/Tokyo"
```

## 💰 コスト最適化

### 推定月額コスト（東京リージョン）

| リソース | スペック | 月額（USD） |
|---------|---------|------------|
| GCE (e2-medium) | 1 vCPU, 4GB RAM | ~$34 |
| 永続ディスク | 20GB SSD | ~$3.4 |
| 静的IP | 1個 | ~$3 |
| ネットワーク | 10GB/月 | ~$1 |
| **合計** | | **~$41.4** |

### コスト削減のヒント

1. **プリエンプティブインスタンス**: 最大80%削減（ただし24時間で強制終了）
2. **Committed Use Discounts**: 1年/3年契約で最大57%削減
3. **夜間停止**: Cloud Schedulerで営業時間外は停止
4. **リージョン選択**: us-central1が最も安い

## 🚨 トラブルシューティング

### よくある問題

#### 1. Puppeteerが動作しない

```bash
# 依存関係の確認
docker-compose -f docker-compose.gce.yml exec scraper \
  ldd /usr/local/lib/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome

# 不足しているライブラリをインストール
docker-compose -f docker-compose.gce.yml exec scraper \
  apt-get update && apt-get install -y missing-library
```

#### 2. メモリ不足

```bash
# メモリ使用状況の確認
docker stats

# コンテナのメモリ制限を増やす
# docker-compose.gce.ymlのdeploy.resources.limitsを編集
```

#### 3. ディスク容量不足

```bash
# ディスク使用状況
df -h

# Dockerの不要なデータを削除
docker system prune -a --volumes
```

## 📞 サポート

問題が解決しない場合は、以下の情報と共に報告してください：

```bash
# システム情報の収集
docker-compose -f docker-compose.gce.yml logs --tail=100 > logs.txt
docker version >> logs.txt
uname -a >> logs.txt
df -h >> logs.txt
free -h >> logs.txt
```