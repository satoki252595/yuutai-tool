# 優待投資ツール

日本株の株主優待と配当による総合利回りを計算するWebアプリケーション

## 🚀 クイックスタート

```bash
# 依存関係のインストール
npm install

# データベース初期化
npm run db:init

# サーバー起動
npm run server
```

ブラウザで http://localhost:5001 にアクセス

## 📊 主要機能

- **株主優待情報**: みんかぶから自動スクレイピング
- **総合利回り計算**: 配当利回り + 優待利回り
- **長期保有特典**: 自動検出・分類
- **複数権利月対応**: 年2回以上の優待対応
- **RSI指標**: テクニカル分析機能
- **日本語企業名**: 正確な日本語表示

## 🛠 コマンド

```bash
# 基本操作
npm run server          # APIサーバー起動
npm run dev            # フロントエンド開発サーバー
npm run db:init        # データベース完全リセット（全データ削除）
npm run db:status      # データベース状況確認

# データ取得
npm run setup          # 全データリセット + セットアップ
npm run setup:industry # 特定業界のみセットアップ
npm run setup:limit    # 限定数でセットアップ
npm run scrape         # 個別銘柄スクレイピング

# テスト
npm run test          # 総合テスト実行
```

## 📈 データ仕様

- **対象銘柄**: JPX全上場企業（3,711銘柄）
- **優待情報**: HTML解析による自動取得
- **価格データ**: Yahoo Finance API
- **更新頻度**: リアルタイム株価 + 手動優待更新

## 🔧 技術構成

- **フロントエンド**: Svelte + Vite
- **バックエンド**: Node.js + Express
- **データベース**: SQLite3
- **スクレイピング**: Puppeteer
- **株価API**: Yahoo Finance 2

## 📋 使用例

### 個別銘柄のスクレイピング
```bash
node backend/scraper.js 3048 7419 2502
```

### 特定業界のセットアップ
```bash
node backend/setup.js --industry 食品 --limit 20
```

### テストの実行
```bash
npm run test  # 20銘柄でスクレイピング・データ検証・RSI計算をテスト
```

## 🎯 主なデータ項目

### 株主優待情報
- 優待内容（自動分類：食事券、QUOカード等）
- 必要株数
- 権利確定月（複数月対応）
- 金銭的価値（自動算出）
- 長期保有特典（自動検出）

### 技術指標
- RSI（相対力指数）
- 配当利回り
- 優待利回り
- 総合利回り

## 🔍 データベース構造

- `stocks`: 銘柄基本情報
- `shareholder_benefits`: 優待情報
- `price_history`: 株価履歴