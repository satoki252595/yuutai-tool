# 優待投資ツール

日本株の株主優待と配当による総合利回りを計算するWebアプリケーション

## 機能

- ✅ **全銘柄対応**: 東証上場全銘柄の優待情報をスクレイピングで取得
- ✅ **リアルタイム株価**: Yahoo Finance APIによる最新株価情報
- ✅ **総合利回り計算**: 優待＋配当利回りを自動計算（現実的な範囲に修正済み）
- ✅ **優待DB構築**: SQLiteによる優待情報データベース
- ✅ **高度な検索**: 銘柄コード・銘柄名・優待内容での検索
- ✅ **Svelteベース**: 高速で軽量なフロントエンド
- ✅ **RSI指標**: 相対力指数(RSI)による売買判断支援
- ✅ **長期保有特典**: 長期保有による優待増量の管理
- ✅ **データ品質改善**: 重複削除・異常値修正による信頼性の高い利回り計算

## 技術スタック

- **フロントエンド**: Svelte + Vite
- **バックエンド**: Node.js + Express (ES Modules)
- **データベース**: SQLite3
- **株価API**: Yahoo Finance 2
- **スクレイピング**: Puppeteer

## クイックスタート

### 🐳 Docker（推奨）

```bash
# 1. コンテナ起動
docker-compose up -d

# 2. 初期データ準備（初回のみ）
docker-compose exec backend npm run db:init
docker-compose exec backend npm run fetch-jpx

# 3. 優待情報取得（ローカル実行推奨）
# Dockerでのスクレイピングは現在Chrome設定の調整中のため、
# 優待情報取得はローカル環境での実行を推奨します
npm run scrape:robust

# 4. アプリケーションにアクセス
# http://localhost:3000
```

**注意**: Docker環境でのスクレイピングは現在Chrome/Chromiumの設定調整中です。データベースは共有されているため、ローカルでスクレイピングした結果がDocker環境でも利用できます。

### 📦 ローカル開発

```bash
# 1. 依存関係インストール
npm install

# 2. 初期データ準備
npm run db:init
npm run fetch-jpx

# 3. サーバー起動
npm run server    # ターミナル1: バックエンド
npm run dev       # ターミナル2: フロントエンド

# 4. 優待情報取得（ターミナル3）
npm run scrape:robust

# 5. アプリケーションにアクセス
# http://localhost:5173
```

## アクセスURL

- **Docker**: http://localhost:3000
- **ローカル開発**: http://localhost:5173  
- **バックエンドAPI**: http://localhost:5001

## 主要コマンド

### セットアップ
```bash
npm run setup           # ワンコマンド完全セットアップ
npm run db:init         # データベース初期化
npm run fetch-jpx       # JPX全銘柄データ取得
```

### サーバー起動
```bash
npm run server          # バックエンドAPIサーバー
npm run dev             # フロントエンド開発サーバー
npm run build           # プロダクションビルド
```

### 優待情報取得
```bash
npm run scrape              # シリアル処理（安定・推奨）
npm run scrape:robust       # 並行処理（堅牢版、2倍高速）
npm run scrape:resume       # 中断した位置から再開
npm run scrape:fast-resume  # 高速並行処理（4倍高速、包括的データ取得）
npm run scrape:test         # テスト実行（50銘柄のみ）
```

### データ更新・改善
```bash
npm run refresh:complete  # 完全データ更新（クリーンアップ+再取得）
npm run clean:all         # データクリーンアップのみ
npm run update-names      # 銘柄名日本語化
npm run collect-history   # 株価履歴収集
```

## 使用方法

### 基本機能
- **検索**: 銘柄コード・銘柄名・優待内容で検索
- **株価更新**: 各銘柄カードの🔄ボタンで最新株価取得
- **総合利回り**: 配当利回り＋優待利回りを自動計算・表示
- **ソート**: 総合利回りの高い順に自動ソート

### データの信頼性
- 最高利回り: 24.32%（現実的範囲に修正済み）
- 20%超高利回り銘柄: 2銘柄のみ
- 平均総合利回り: 4.12%
- 対象銘柄数: 719銘柄

## プロジェクト構成

```
yuutai/
├── backend/         # バックエンド
│   ├── db/          # SQLiteデータベース
│   ├── cache/       # キャッシュファイル
│   ├── database.js  # DB操作クラス
│   ├── scraper.js   # スクレイピング処理
│   ├── yahooFinance.js # Yahoo Finance API
│   └── server.js    # Express APIサーバー
├── src/             # フロントエンド (Svelte)
│   ├── lib/         # コンポーネント・ユーティリティ
│   ├── App.svelte   # メインコンポーネント
│   └── main.js      # エントリーポイント
└── package.json     # 依存関係
```

## 本番環境へのデプロイ

### GCE (Google Compute Engine) デプロイ手順

#### 前提条件
- Google Cloud Platform アカウント
- gcloud CLI がインストール済み
- 適切なGCPプロジェクトとサービスアカウント設定
- DBデータは手動インポート前提

#### 1. GCE インスタンス作成
```bash
# GCPプロジェクト設定
gcloud config set project YOUR_PROJECT_ID

# Compute Engine インスタンス作成
gcloud compute instances create yuutai-server \
  --zone=asia-northeast1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2004-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-standard \
  --tags=http-server,https-server

# ファイアウォールルール作成
gcloud compute firewall-rules create yuutai-http \
  --allow tcp:80,tcp:443,tcp:3000,tcp:5001 \
  --source-ranges 0.0.0.0/0 \
  --target-tags http-server

# SSH接続
gcloud compute ssh yuutai-server --zone=asia-northeast1-a
```

#### 2. サーバー環境セットアップ
```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# 既存のDocker関連リポジトリを削除（エラー対処）
sudo rm -f /etc/apt/sources.list.d/docker.list
sudo apt update

# Node.js インストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Docker インストール（Debian用）
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings

# Docker GPGキー取得（Debian用）
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Docker リポジトリ追加（Debian用）
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# パッケージリスト更新とDocker インストール
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker権限設定
sudo usermod -aG docker $USER
newgrp docker

# Git・その他ツール インストール
sudo apt-get install -y git htop sqlite3 unzip
```

#### 3. アプリケーションデプロイ
```bash
# リポジトリクローン
git clone YOUR_REPOSITORY_URL yuutai-tool
cd yuutai-tool

# 依存関係インストール
npm install

# 本番用環境変数設定
cat > .env << EOF
NODE_ENV=production
PORT=5001
FRONTEND_PORT=3000
EOF

# フロントエンドビルド
npm run build

# PM2 インストール（プロセス管理）
sudo npm install -g pm2

# PM2 ecosystem設定
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'yuutai-backend',
      script: 'backend/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      },
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '1G'
    }
  ]
};
EOF
```

#### 4. データベース手動インポート
```bash
# ローカル環境で事前にデータベースを準備
# （ローカルで npm run market:full を実行してデータ取得）

# ローカルからGCEにDBファイルを転送
gcloud compute scp backend/db/yuutai.db yuutai-server:~/yuutai-tool/backend/db/ --zone=asia-northeast1-a

# または、SCPで直接転送
scp backend/db/yuutai.db username@EXTERNAL_IP:~/yuutai-tool/backend/db/

# GCE上でデータベース確認
cd ~/yuutai-tool
sqlite3 backend/db/yuutai.db "SELECT COUNT(*) FROM stocks;"
sqlite3 backend/db/yuutai.db "SELECT COUNT(*) FROM shareholder_benefits;"
```

#### 5. Nginx リバースプロキシ設定
```bash
# Nginx インストール
sudo apt-get install -y nginx

# SSL証明書取得（Let's Encrypt）
sudo apt-get install -y certbot python3-certbot-nginx

# ドメイン証明書取得（YOUR_DOMAINを置換）
sudo certbot certonly --nginx -d YOUR_DOMAIN

# Nginx設定
sudo tee /etc/nginx/sites-available/yuutai << EOF
server {
    listen 80;
    server_name YOUR_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    
    # SSL設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # フロントエンド (Vite build)
    location / {
        root /home/\$USER/yuutai-tool/dist;
        try_files \$uri \$uri/ /index.html;
        
        # キャッシュ設定
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # バックエンドAPI
    location /api {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # タイムアウト設定
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ログ設定
    access_log /var/log/nginx/yuutai.access.log;
    error_log /var/log/nginx/yuutai.error.log;
}
EOF

# サイト有効化
sudo ln -s /etc/nginx/sites-available/yuutai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. アプリケーション起動
```bash
# バックエンド起動
cd ~/yuutai-tool
pm2 start ecosystem.config.js

# PM2自動起動設定
pm2 startup
pm2 save

# サービス状態確認
pm2 status
pm2 logs yuutai-backend
```

#### 7. SSL証明書自動更新設定
```bash
# Crontab設定
sudo crontab -e

# 以下を追加
# 毎月1日午前3時に証明書更新チェック
0 3 1 * * /usr/bin/certbot renew --quiet && /usr/bin/systemctl reload nginx
```

### 運用・メンテナンス

#### データ更新
```bash
# アプリケーション更新
cd ~/yuutai-tool
git pull origin main
npm install
npm run build
pm2 restart yuutai-backend

# データベース更新（手動）
# ローカルで最新データ取得後、GCEに転送
gcloud compute scp backend/db/yuutai.db yuutai-server:~/yuutai-tool/backend/db/ --zone=asia-northeast1-a
```

#### バックアップ
```bash
# データベースバックアップ
cd ~/yuutai-tool
mkdir -p backups
sqlite3 backend/db/yuutai.db ".backup backups/yuutai-$(date +%Y%m%d).db"

# Google Cloud Storage同期（推奨）
gsutil cp backups/yuutai-$(date +%Y%m%d).db gs://YOUR_BACKUP_BUCKET/

# 自動バックアップ設定
crontab -e
# 毎日午前2時にバックアップ
0 2 * * * cd /home/$USER/yuutai-tool && sqlite3 backend/db/yuutai.db ".backup backups/yuutai-$(date +\%Y\%m\%d).db" && gsutil cp backups/yuutai-$(date +\%Y\%m\%d).db gs://YOUR_BACKUP_BUCKET/
```

#### 監視・ヘルスチェック
```bash
# プロセス状態確認
pm2 status
pm2 monit

# ログ確認
pm2 logs yuutai-backend
sudo tail -f /var/log/nginx/yuutai.access.log
sudo tail -f /var/log/nginx/yuutai.error.log

# APIヘルスチェック
curl https://YOUR_DOMAIN/api/health

# システムリソース確認
htop
df -h
free -h
```

#### セキュリティ設定
```bash
# UFWファイアウォール設定
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# 不要ポート閉鎖
gcloud compute firewall-rules update yuutai-http --allow tcp:80,tcp:443

# システム自動更新
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### コスト最適化
- **インスタンスタイプ**: e2-medium (2 vCPU, 4GB RAM) で十分
- **ディスクサイズ**: 20GB標準ディスクで開始
- **リージョン**: asia-northeast1 (東京) が最適
- **予約インスタンス**: 長期運用の場合は検討

### よくあるエラーと対処法

#### 0. Docker リポジトリエラー（GCE Debian環境）
```bash
# Error: The repository 'https://download.docker.com/linux/ubuntu bookworm Release' does not have a Release file
# 原因: Ubuntu用Dockerリポジトリが設定されているが、実際はDebian環境

# 対処法1: 既存のDockerリポジトリを削除
sudo rm -f /etc/apt/sources.list.d/docker.list
sudo apt update

# 対処法2: Debian用Dockerリポジトリに修正
sudo apt-get install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

# 対処法3: Dockerの代替インストール（snap使用）
sudo apt install -y snapd
sudo snap install docker

# 対処法4: 既存パッケージでのDockerインストール
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
```

#### 1. Node.js / npm関連エラー
```bash
# Error: Module not found / Cannot resolve dependency
cd ~/yuutai-tool
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Error: Permission denied
sudo chown -R $USER:$USER ~/.npm
sudo chown -R $USER:$USER ~/yuutai-tool
```

#### 2. SQLite / データベースエラー
```bash
# Error: SQLITE_BUSY / database is locked
# PM2プロセスを停止してからDB操作
pm2 stop yuutai-backend
sqlite3 backend/db/yuutai.db "PRAGMA integrity_check;"
pm2 start ecosystem.config.js

# Error: no such table
# データベース再初期化
cd ~/yuutai-tool
npm run db:init
# ローカルからDBを再転送
gcloud compute scp backend/db/yuutai.db yuutai-server:~/yuutai-tool/backend/db/ --zone=asia-northeast1-a
```

#### 3. Nginx / SSL関連エラー
```bash
# Error: nginx: configuration file test failed
sudo nginx -t
# エラー箇所を確認して修正

# Error: SSL certificate not found
# Let's Encrypt証明書の再取得
sudo certbot delete --cert-name YOUR_DOMAIN
sudo certbot certonly --nginx -d YOUR_DOMAIN

# Error: Port already in use
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443
# 使用中のプロセスを確認してkill
```

#### 4. PM2 / プロセス管理エラー
```bash
# Error: PM2 process not starting
pm2 logs yuutai-backend
pm2 restart yuutai-backend

# Error: Memory limit exceeded
pm2 monit
# ecosystem.config.js の max_memory_restart を調整

# Error: Port 5001 already in use
pm2 stop all
pm2 delete all
sudo netstat -tulpn | grep :5001
# 使用中のプロセスをkill後、再起動
```

#### 5. ファイアウォール / ネットワークエラー
```bash
# Error: Connection refused
# GCPファイアウォールルールを確認
gcloud compute firewall-rules list
gcloud compute firewall-rules describe yuutai-http

# UFWファイアウォール確認
sudo ufw status
sudo ufw allow 80
sudo ufw allow 443

# Error: External IP not accessible
# Nginxステータス確認
sudo systemctl status nginx
sudo nginx -t && sudo systemctl reload nginx
```

#### 6. メモリ / ディスク容量エラー
```bash
# Error: ENOSPC (No space left on device)
df -h
# ログファイルのクリーンアップ
sudo journalctl --vacuum-time=7d
sudo find /var/log -name "*.log" -type f -size +100M -delete

# Error: Out of memory
free -h
# スワップファイル作成
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### 7. ビルド / デプロイエラー
```bash
# Error: Build failed
cd ~/yuutai-tool
rm -rf dist node_modules
npm install
npm run build

# Error: Permission denied during deployment
sudo chown -R $USER:$USER ~/yuutai-tool
chmod +x ~/yuutai-tool/backend/server.js
```

### トラブルシューティング手順

#### ステップ1: システム状態確認
```bash
# サービス状態確認
pm2 status
sudo systemctl status nginx
sudo ufw status

# リソース使用状況
htop
df -h
free -h

# ログ確認
pm2 logs yuutai-backend --lines 50
sudo tail -n 50 /var/log/nginx/error.log
sudo journalctl -u nginx -n 50
```

#### ステップ2: 接続テスト
```bash
# ローカル接続テスト
curl -I http://localhost:5001/api/health
curl -I http://localhost:80

# 外部接続テスト
curl -I https://YOUR_DOMAIN/api/health
wget --spider https://YOUR_DOMAIN
```

#### ステップ3: 段階的再起動
```bash
# 1. バックエンドのみ再起動
pm2 restart yuutai-backend

# 2. Nginx再起動
sudo systemctl restart nginx

# 3. 完全再起動（最終手段）
sudo reboot
# 再起動後、PM2は自動起動設定により復旧
```

#### ステップ4: 緊急時のロールバック
```bash
# アプリケーションロールバック
cd ~/yuutai-tool
git log --oneline -5
git checkout PREVIOUS_COMMIT_HASH
npm install
npm run build
pm2 restart yuutai-backend

# データベースロールバック
cd ~/yuutai-tool/backups
ls -la
sqlite3 ../backend/db/yuutai.db ".restore backup-YYYYMMDD.db"
```

### デバッグ用コマンド集

```bash
# 詳細ログ出力
DEBUG=* pm2 restart yuutai-backend
pm2 logs yuutai-backend --timestamp

# ネットワーク接続確認
sudo netstat -tulpn | grep -E ':80|:443|:5001'
sudo ss -tulpn | grep -E ':80|:443|:5001'

# プロセス確認
ps aux | grep node
ps aux | grep nginx

# ディスク使用量詳細
sudo du -sh /var/log/*
sudo du -sh ~/yuutai-tool/*
sudo find / -size +100M -type f 2>/dev/null

# メモリ使用量詳細
sudo cat /proc/meminfo
pm2 monit
```

### 注意事項
- **データベース**: 手動インポート前提のため、ローカルで事前にデータ取得が必要
- **SSL証明書**: ドメイン必須、Let's Encryptを推奨
- **バックアップ**: Google Cloud Storageへの定期バックアップを強く推奨
- **監視**: Cloud Monitoringとの連携を検討
- **ログ管理**: 定期的なログローテーションを設定
- **リソース監視**: メモリ・ディスク使用量の定期チェック


## Docker設定

データベースはプロジェクトの`backend/db/yuutai.db`に保存され、Docker環境とホスト環境で共有されます。

## トラブルシューティング

### Docker環境でのスクレイピング問題
```bash
# Chrome not foundエラーの場合
# 現在Docker環境でのChrome設定を調整中です
# 回避策: ローカル環境でスクレイピングを実行
npm run scrape:robust

# データベースは共有されているため、
# ローカルで取得したデータがDocker環境でも利用できます
```

### データ品質の問題
```bash
# 利回り計算に異常がある場合
npm run clean:all && npm run scrape:robust

# 特定銘柄の問題修正
npm run clean:stock [銘柄コード]
```

### パフォーマンス改善
```bash
# キャッシュクリア
rm -rf backend/cache/*

# データベース最適化
npm run db:migrate
```

## 変更履歴

### v2.2.0 (2025/6/9) - データ品質改善版
- **重要修正**
  - **利回り計算の正常化**: 最高26,850% → 24.32%（現実的範囲）
  - **データ品質大幅改善**: 重複削除117件、低価値優待削除115件
  - **バルーンヘルプ機能削除**: ユーザビリティ向上のため完全削除
  - **SQL構文エラー修正**: 予約語'values'問題解決
- **データクリーニング**
  - 優待価値の段階的上限設定（5,000円→2,000円→1,500円）
  - 個別問題銘柄の比例調整
  - スクレイピング由来ノイズデータ除去
  - 説明文の正規化・クリーンアップ
- **検証完了**
  - ローカル環境とDocker環境で同じ適切な利回り計算
  - みんかぶサイトとの照合による信頼性確認
  - 20%超高利回り銘柄を2銘柄まで削減

### v2.1.0 (2025/6/8)
- Docker対応・シリアルスクレイピング・優待データクリーニング機能

### v2.0.0 (2025/6/7)
- RSI指標・長期保有特典・銘柄名日本語化・並行スクレイピング

### v1.0.0 (初期リリース)
- 基本的な優待検索・株価取得・利回り計算機能

## ライセンス

MIT License

## 貢献

Issue・Pull Requestを歓迎します。大きな変更の場合は、事前にIssueで相談してください。# yuutai-tool
