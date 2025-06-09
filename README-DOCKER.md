# Docker デプロイメントガイド

## 概要

優待投資ツールをDockerを使用してサーバーにデプロイするためのガイドです。

## 構成

### コンテナ構成

1. **frontend** - Nginx + Svelteビルド済み静的ファイル
2. **backend** - Node.js APIサーバー
3. **scraper** - 定期的に優待情報を取得するワーカー
4. **nginx** (本番環境のみ) - リバースプロキシ

### ポート

- **開発環境**
  - フロントエンド: 3000
  - バックエンドAPI: 5001

- **本番環境**
  - HTTP: 80
  - HTTPS: 443 (SSL設定時)

## クイックスタート

### 1. 開発環境での起動

```bash
# Docker Composeで起動
docker-compose up -d

# ログの確認
docker-compose logs -f
```

### 2. 本番環境でのデプロイ

```bash
# 環境変数を設定
export DEPLOY_ENV=production

# デプロイスクリプトを実行
./deploy.sh
```

## 詳細設定

### 環境変数

```bash
# .env ファイルを作成
cat > .env << EOF
# スクレイピング間隔（ミリ秒）
SCRAPING_INTERVAL=86400000  # 24時間

# Node環境
NODE_ENV=production

# APIポート
PORT=5001
EOF
```

### SSL証明書の設定

1. 証明書の配置
```bash
mkdir -p ssl
cp /path/to/cert.pem ssl/
cp /path/to/key.pem ssl/
```

2. nginx.prod.conf のHTTPS設定を有効化
```bash
# nginx.prod.conf の該当部分のコメントを解除
```

### カスタムドメインの設定

1. nginx.prod.conf を編集
```nginx
server_name yuutai.example.com;  # あなたのドメインに変更
```

## データベース管理

### バックアップ

```bash
# データベースのバックアップ
docker-compose exec backend sqlite3 /app/backend/db/yuutai.db ".backup /app/backend/db/backup.db"

# ホストにコピー
docker cp yuutai_backend_1:/app/backend/db/backup.db ./backup/
```

### リストア

```bash
# バックアップからリストア
docker cp ./backup/backup.db yuutai_backend_1:/app/backend/db/yuutai.db
docker-compose restart backend
```

## メンテナンス

### ログの確認

```bash
# 全てのログ
docker-compose logs -f

# 特定のサービスのみ
docker-compose logs -f backend
docker-compose logs -f scraper
```

### コンテナの再起動

```bash
# 全サービスの再起動
docker-compose restart

# 特定サービスのみ
docker-compose restart backend
```

### アップデート

```bash
# 最新コードを取得
git pull origin main

# イメージの再ビルド
docker-compose build --no-cache

# 再デプロイ
docker-compose down
docker-compose up -d
```

## トラブルシューティング

### Puppeteerエラー

スクレイパーコンテナでPuppeteerが動作しない場合：

```bash
# コンテナ内で依存関係を確認
docker-compose exec scraper ldd /app/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome
```

### データベースロックエラー

```bash
# データベースのロックを解除
docker-compose exec backend sqlite3 /app/backend/db/yuutai.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### メモリ不足

docker-compose.prod.yml でメモリ制限を調整：

```yaml
deploy:
  resources:
    limits:
      memory: 8G  # 必要に応じて増減
```

## 監視

### ヘルスチェック

```bash
# バックエンドAPI
curl http://localhost:5001/api/health

# フロントエンド
curl http://localhost:3000
```

### リソース使用状況

```bash
# コンテナのリソース使用状況
docker stats

# ディスク使用量
docker system df
```

## セキュリティ

### ファイアウォール設定

```bash
# 必要なポートのみ開放
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
```

### 定期的なアップデート

```bash
# システムパッケージ
sudo apt update && sudo apt upgrade -y

# Dockerイメージ
docker-compose pull
docker-compose up -d
```

## スケーリング

### 水平スケーリング

複数のバックエンドインスタンスを起動：

```yaml
# docker-compose.prod.yml
backend:
  scale: 3  # 3インスタンス起動
```

### ロードバランシング

Nginxでラウンドロビン：

```nginx
upstream backend_servers {
    server backend_1:5001;
    server backend_2:5001;
    server backend_3:5001;
}
```