#!/bin/bash

# バックアップスクリプト
set -e

BACKUP_DIR="/var/backups/yuutai"
DB_PATH="/path/to/yuutai-tool/backend/db/yuutai.db"
RETENTION_DAYS=30

echo "🔄 データベースバックアップを開始します: $(date)"

# バックアップディレクトリの作成
mkdir -p $BACKUP_DIR

# バックアップファイル名
BACKUP_FILE="$BACKUP_DIR/yuutai-$(date +%Y%m%d-%H%M%S).db"

# Docker環境からデータベースをバックアップ
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_FILE"
    gzip "$BACKUP_FILE"
    echo "✅ バックアップ完了: ${BACKUP_FILE}.gz"
else
    echo "❌ データベースファイルが見つかりません: $DB_PATH"
    exit 1
fi

# 古いバックアップの削除
echo "🗑️ ${RETENTION_DAYS}日以上古いバックアップを削除中..."
find $BACKUP_DIR -name "yuutai-*.db.gz" -mtime +$RETENTION_DAYS -delete

# バックアップ一覧
echo "📦 現在のバックアップ:"
ls -lh $BACKUP_DIR/yuutai-*.db.gz | tail -5

echo "✅ バックアップ処理完了: $(date)"