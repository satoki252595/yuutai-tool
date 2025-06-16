# 優待投資ツール

日本株の株主優待と配当による総合利回りを計算・表示するWebアプリケーション。

## 🌟 機能

### 株主優待情報
- 🎁 必要株数別の優待内容表示
- 📅 複数権利月対応（2月/8月、 3月/9月など）
- 🏆 長期保有特典の追跡（1年、 3年、 5年保有）
- 💵 優待の金銭価値自動計算

### 投資分析機能
- 💰 年間配当金・配当利回り表示
- 📊 優待+配当の総合利回り自動計算
- 📈 RSI（14日）テクニカル指標
- 💹 リアルタイム株価情報

### ユーザビリティ
- 🔍 銘柄コード・企業名・優待内容での検索
- 🏆 総合利回りランキング表示
- 📱 PC/スマホ完全レスポンシブ対応

## 🛠️ 技術スタック

### フロントエンド
- **Svelte + Vite** - 高速で軽量なUIフレームワーク
- **レスポンシブデザイン** - モバイルファースト設計

### バックエンド
- **Node.js + Express** - RESTful APIサーバー（ES Modules）
- **SQLite3** - 軽量高速ローカルデータベース
- **Puppeteer** - 優待情報スクレイピング
- **Yahoo Finance API** - リアルタイム株価・配当データ

### データソース
- **JPX公式データ** - 3,711社の上場企業情報（自動キャッシュ機能付き）
- **みんかぶ** - 株主優待情報
- **Yahoo Finance** - 株価・配当情報

## 🚀 セットアップ

```bash
# 依存関係のインストール
npm install

# データベース初期化
npm run db:init

# APIサーバー起動（ポート5001）
npm run server

# フロントエンド開発サーバー起動（別ターミナルで）
npm run dev
```

ブラウザで http://localhost:5173 にアクセス

## 📋 コマンド一覧

### 基本操作
```bash
npm run dev        # フロントエンド開発サーバー
npm run build      # プロダクションビルド
npm run server     # バックエンドAPIサーバー起動
npm run db:init    # データベース初期化
npm run db:status  # データベース状況確認
```

### データ取得・更新

#### 初回セットアップ
```bash
# オプション1: 優待あり銘柄のみ（約1,500銘柄、推奨）
npm run setup

# オプション2: 全銘柄（3,711銘柄、時間がかかる）
npm run setup:complete

# オプション3: テスト用に100銘柄のみ
node backend/setup.js 100
```

#### 定期更新（優待情報）
```bash
# 月次更新推奨
npm run scrape:parallel

# または特定銘柄のみ更新
node backend/scraper.js 8200 9409 3469
```

#### データベース操作
```bash
# DB初期化（最初の1回のみ）
npm run db:init

# DB完全リセット（注意：全データ削除）
npm run db:reset

# マイグレーション実行
node backend/db/migrate-benefit-content.js
```

### 個別銘柄操作

#### 特定銘柄のスクレイピング
```bash
# 単一銘柄
node backend/scraper.js 8200

# 複数銘柄（スペース区切り）
node backend/scraper.js 8200 9409 3469

# 有名企業の例
node backend/scraper.js 7203  # トヨタ自動車
node backend/scraper.js 9983  # ファーストリテイリング
node backend/scraper.js 8058  # 三菱商事
```

#### 並列スクレイピング（高速版）
```bash
# 特定銘柄を高速処理
node backend/parallel-scraper.js 8200 9409 3469

# プログレスファイルを使った再開
rm backend/scraping-progress.json  # 進捗リセット
node backend/parallel-scraper.js 8200 9409 3469
```

## 📊 データ仕様

### カバレッジ
- **対象銘柄**: 全3,711銘柄（JPX公式データ）
- **優待情報**: 7,267件（1,463銘柄分）
- **配当・価格データ**: 全銘柄対応

### 特徴
- **複数権利月対応**: 同一銘柄で年複数回の優待を正確に管理
- **長期保有特典**: 保有期間に応じた優待内容の変化を追跡
- **配当情報統合**: Yahoo Finance APIによる最新配当データ
- **RSI計算**: RSI(14)・RSI(28)の両方を計算してテクニカル分析

## 🔍 データベース構造

```sql
-- 銘柄基本情報
stocks (
  code TEXT PRIMARY KEY,      -- 銘柄コード
  name TEXT,                  -- 英語名
  japanese_name TEXT,         -- 日本語名
  market TEXT,                -- 市場区分
  sector TEXT,                -- セクター
  industry TEXT,              -- 業種
  rsi REAL,                   -- RSI(14)
  rsi28 REAL                  -- RSI(28)
)

-- 株主優待情報
shareholder_benefits (
  id INTEGER PRIMARY KEY,
  stock_code TEXT,            -- 銘柄コード
  benefit_type TEXT,          -- 優待種別
  description TEXT,           -- 詳細条件
  benefit_content TEXT,       -- 優待内容
  monetary_value INTEGER,     -- 金銭価値
  min_shares INTEGER,         -- 必要株数
  holder_type TEXT,           -- 保有者種別
  ex_rights_month INTEGER,    -- 権利確定月
  has_long_term_holding INTEGER, -- 長期保有特典有無
  long_term_months INTEGER,   -- 長期保有必要月数
  long_term_value INTEGER     -- 長期保有時価値
)

-- 価格履歴
price_history (
  id INTEGER PRIMARY KEY,
  stock_code TEXT,            -- 銘柄コード
  price REAL,                 -- 株価
  dividend_yield REAL,        -- 配当利回り
  annual_dividend REAL,       -- 年間配当金
  data_source TEXT,           -- データソース
  recorded_at DATETIME        -- 記録日時
)
```

## 💡 使用例

### 優待情報の検索

#### 銘柄コードで検索
```
検索バーに入力: 8200
→ リンガーハットの優待情報を表示
```

#### 企業名で検索
```
検索バーに入力: トヨタ
→ トヨタ自動車の優待情報を表示
```

#### 優待内容で検索
```
検索バーに入力: QUOカード
→ QUOカード優待のある銘柄一覧

検索バーに入力: 食事券
→ 食事券優待のある銘柄一覧
```

### 投資分析

#### 総合利回りランキング
```bash
# APIエンドポイントでソート条件を指定
curl "http://localhost:5001/api/stocks?sortBy=totalYield&sortOrder=desc"
```

#### RSIフィルター
```bash
# RSI(14) < 30 の売られすぎ銘柄を検索
curl "http://localhost:5001/api/stocks?rsi14Max=30"

# RSI(28) > 70 の買われすぎ銘柄を検索
curl "http://localhost:5001/api/stocks?rsi28Min=70"
```

#### 投資額シミュレーション
```bash
# 10万円以下で投資可能な銘柄
curl "http://localhost:5001/api/stocks?maxPrice=1000"
# 株価1,000円×100株=10万円
```

## 🎯 スクレイピングオプション

### 並列処理オプション

#### 標準（6並列）- 推奨
```bash
npm run scrape:parallel
# 約3,700銘柄を約2-3時間で処理
# メモリ8GB以上推奨
```

#### 高速（4並列）
```bash
npm run scrape:fast
# メモリ使用量を抑えつつ高速処理
# メモリ4GB以上で動作
```

#### ターボ（8並列）
```bash
npm run scrape:turbo
# 最高速（約1.5-2時間）
# メモリ16GB以上、CPU 8コア以上推奨
```

#### 順次処理（低スペックPC向け）
```bash
npm run scrape
# 最も安定、メモリ2GBでも動作
# 約8-10時間（一晩放置推奨）
```

### セットアップオプション

#### 業界指定セットアップ
```bash
npm run setup:industry
# 対話形式で業界を選択：
# 1) 食品
# 2) 小売
# 3) 外食
# 4) サービス
# 5) 金融
# 6) 運輸
# 7) エンタメ
# 8) その他
```

#### 件数指定セットアップ
```bash
# 上位100銘柄のみ
node backend/setup.js 100

# 上位500銘柄のみ
node backend/setup.js 500

# テスト用に10銘柄のみ
node backend/setup.js 10
```

#### 完全版セットアップ
```bash
# 全3,711銘柄を取得（3-4時間程度）
npm run setup:complete
```

### 進捗管理

#### 進捗確認
```bash
# 現在の進捗を確認
cat backend/scraping-progress.json | jq '.completed | length'

# 完了した銘柄コードを表示
cat backend/scraping-progress.json | jq '.completed[]' | head -20
```

#### 進捗操作
```bash
# 進捗をリセット（最初からやり直し）
rm backend/scraping-progress.json

# 特定銘柄を進捗から除外（再実行したい場合）
jq '.completed = (.completed | map(select(. != "8200")))' backend/scraping-progress.json > tmp.json && mv tmp.json backend/scraping-progress.json
```

#### 中断と再開
```bash
# Ctrl+C で中断
# 同じコマンドで続きから再開
npm run scrape:parallel  # 前回の続きから自動再開
```

## ✨ 最新機能

- ✅ **全銘柄対応**: 3,711社全ての上場企業をカバー
- ✅ **RSI(28)追加**: RSI(14)に加えてRSI(28)も計算対応
- ✅ **配当データ正常化**: 年間配当金・配当利回りの正確な取得
- ✅ **優待なし銘柄対応**: 配当のみの銘柄も正常に処理
- ✅ **優待内容個別表示**: 権利月・株数別に優待内容を詳細表示
- ✅ **並列スクレイピング**: 最大8並列で高速データ取得

## 📝 ライセンス

本プロジェクトは個人利用を目的としています。