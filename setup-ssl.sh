#!/bin/bash

# SSL証明書セットアップスクリプト（Let's Encrypt）
set -e

echo "🔐 SSL証明書のセットアップ開始..."

# ドメイン名の確認
if [ -z "$1" ]; then
    echo "使用方法: ./setup-ssl.sh your-domain.com"
    exit 1
fi

DOMAIN=$1
EMAIL=${2:-"admin@$DOMAIN"}

echo "📋 ドメイン: $DOMAIN"
echo "📧 メール: $EMAIL"

# 1. Certbotのインストール
echo -e "\n1. Certbotのインストール"
sudo apt-get update
sudo apt-get install -y certbot

# 2. 一時的にNginxを停止
echo -e "\n2. 証明書取得のため一時的にサービスを停止"
docker-compose -f docker-compose.gce.yml stop frontend

# 3. 証明書の取得
echo -e "\n3. Let's Encrypt証明書の取得"
sudo certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    -d $DOMAIN

# 4. 証明書のコピー
echo -e "\n4. 証明書の配置"
sudo mkdir -p ./ssl
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ./ssl/key.pem
sudo chown -R $USER:$USER ./ssl

# 5. Nginx設定の更新
echo -e "\n5. Nginx設定の更新"
cat > nginx.gce-ssl.conf << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # HTTPSへのリダイレクト
    location / {
        return 301 https://\$server_name\$request_uri;
    }
    
    # Let's Encrypt検証用
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL証明書
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # SSL設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # セキュリティヘッダー
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    root /usr/share/nginx/html;
    index index.html;

    # gzip圧縮
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

    # SPAルーティング
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API プロキシ
    location /api {
        proxy_pass http://backend:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # 静的ファイルのキャッシュ
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 6. Docker Compose設定の更新
echo -e "\n6. Docker Compose設定の更新"
cat > docker-compose.gce-ssl.yml << EOF
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.gce-ssl.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl:ro
      - certbot-webroot:/var/www/certbot
    environment:
      - API_BASE_URL=http://backend:5001
    networks:
      - yuutai-network
    restart: always

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    expose:
      - "5001"
    volumes:
      - /mnt/disks/yuutai-data/db:/app/backend/db
      - /mnt/disks/yuutai-data/cache:/app/backend/cache
    environment:
      - NODE_ENV=production
      - PORT=5001
    networks:
      - yuutai-network
    restart: always

  scraper:
    build:
      context: .
      dockerfile: Dockerfile.scraper
    volumes:
      - /mnt/disks/yuutai-data/db:/app/backend/db
      - /mnt/disks/yuutai-data/cache:/app/backend/cache
    environment:
      - NODE_ENV=production
      - SCRAPING_INTERVAL=86400000
    networks:
      - yuutai-network
    depends_on:
      - backend
    restart: always

  # 証明書自動更新用
  certbot:
    image: certbot/certbot
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt
      - certbot-webroot:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait \$\${!}; done;'"

networks:
  yuutai-network:
    driver: bridge

volumes:
  certbot-webroot:
EOF

# 7. 新しい設定でコンテナを再起動
echo -e "\n7. SSL対応設定で再起動"
docker-compose -f docker-compose.gce-ssl.yml up -d

# 8. 自動更新のcronジョブ設定
echo -e "\n8. 証明書自動更新の設定"
(crontab -l 2>/dev/null; echo "0 0 * * 0 /usr/bin/certbot renew --quiet && docker-compose -f $(pwd)/docker-compose.gce-ssl.yml restart frontend") | crontab -

echo -e "\n✅ SSL証明書のセットアップが完了しました！"
echo ""
echo "🌐 アクセスURL:"
echo "   https://$DOMAIN"
echo ""
echo "📋 証明書の情報:"
sudo certbot certificates
echo ""
echo "🔄 証明書は自動的に更新されます（週1回チェック）"