# 株主優待開示情報管理システム

YANOSHIN TDNET APIから株主優待関連の適時開示情報を自動収集し、Notionデータベースに整理して保存するシステムです。

## 概要

### 🚀 主要機能
- **株主優待開示の自動取得**: YANOSHIN TDNET APIから株主優待関連開示を日次で自動取得
- **3階層データベース構造**: ①銘柄一覧 → ②カテゴリ別開示 → ③開示詳細
- **自動分類**: 開示内容に基づいた株主優待カテゴリの自動分類
- **PDFファイル管理**: 物理ファイルのダウンロード・Notionアップロード・自動削除
- **重複チェック**: 複数の方法による確実な重複防止
- **日次実行**: スケジュール実行による自動化

### 📊 データベース構造

#### ① 株主優待銘柄一覧データベース
```
銘柄コード | 銘柄名 | 市場 | 業種 | 優待実施状況 | 最終更新 | 優待開示件数 | 最新優待開示日
```

#### ② カテゴリ別優待開示データベース（銘柄コード_優待_カテゴリ）
```
タイトル | 開示日 | 開示時刻 | カテゴリ | 優待内容 | 権利確定日 | 必要株数 | 優待価値 | PDFファイル | 処理状況
```

#### ③ 開示詳細（子ページ）
- ファイル情報
- 開示内容の詳細
- PDFファイルの表示

### 🏷️ カテゴリ分類

自動分類される株主優待カテゴリ：
- **優待新設**: 新しい株主優待制度の導入
- **優待変更**: 既存優待制度の内容変更
- **優待廃止**: 株主優待制度の終了・廃止
- **優待内容**: 優待の詳細内容に関する開示
- **権利基準日**: 権利確定日等の日程に関する開示
- **優待制度**: その他優待制度全般
- **その他**: 上記以外

## インストール・設定

### 1. 必要なパッケージのインストール
```bash
pip install requests notion-client python-dotenv schedule
```

### 2. 環境変数設定
```bash
cp .env.example .env
# .envファイルを編集してNotion APIキーとページIDを設定
```

**.env ファイル設定例:**
```
# Notion API設定
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PAGE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
YUUTAI_NOTION_PAGE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ダウンロードディレクトリ
YUUTAI_DOWNLOAD_DIR=./downloads/yuutai

# ログディレクトリ
LOG_DIR=./logs
```

### 3. 必要なディレクトリ作成
```bash
mkdir -p downloads/yuutai logs
```

## 使用方法

### 基本的な使用方法

#### 1. 簡易テスト
```bash
# 環境設定の確認
python test_simple_yuutai.py

# 機能テスト
python test_yuutai_functionality.py
```

#### 2. 株主優待開示処理
```bash
# 当日の株主優待開示を処理
python src/main_yuutai.py

# 指定日の株主優待開示を処理
python src/main_yuutai.py --date 2025-01-01

# 日付範囲の株主優待開示を処理
python src/main_yuutai.py --start-date 2025-01-01 --end-date 2025-01-03

# テストモード（前日データで実行）
python src/main_yuutai.py --test
```

#### 3. 企業別処理
```bash
# 特定企業の株主優待開示履歴を処理（過去30日）
python src/main_yuutai.py --company 7203

# 遡及日数を指定
python src/main_yuutai.py --company 7203 --days-back 60
```

#### 4. キーワード検索
```bash
# キーワードによる株主優待開示検索
python src/main_yuutai.py --keywords 株主優待 新設 廃止

# 指定日でのキーワード検索
python src/main_yuutai.py --keywords 優待制度 --date 2025-01-01
```

#### 5. レポート生成
```bash
# 当日の株主優待開示レポート生成
python src/main_yuutai.py --report

# 指定日のレポート生成
python src/main_yuutai.py --report --date 2025-01-01
```

#### 6. スケジュール実行
```bash
# 毎日9時に自動実行
python src/main_yuutai.py --schedule --time 09:00

# スケジュール実行（デフォルト時刻）
python src/main_yuutai.py --schedule
```

### 個別モジュール実行

#### 株主優待日次プロセッサ
```bash
# 当日処理
python src/yuutai/daily_processor.py

# 指定日処理
python src/yuutai/daily_processor.py --date 2025-01-01

# 範囲処理
python src/yuutai/daily_processor.py --start-date 2025-01-01 --end-date 2025-01-03

# 企業別処理
python src/yuutai/daily_processor.py --company 7203

# キーワード検索
python src/yuutai/daily_processor.py --keywords 株主優待 優待制度

# レポート生成
python src/yuutai/daily_processor.py --report

# テストモード
python src/yuutai/daily_processor.py --test
```

## ファイル構造

```
IR/
├── src/                           # ソースコード
│   ├── __init__.py
│   ├── main_yuutai.py            # メイン実行スクリプト
│   ├── notion_uploader.py        # Notionアップロード機能
│   └── yuutai/                   # 株主優待専用モジュール
│       ├── __init__.py
│       ├── api_client.py         # EDINET APIクライアント
│       ├── notion_manager.py     # 3階層Notion管理
│       └── daily_processor.py    # 日次処理
├── downloads/
│   └── yuutai/                   # 株主優待PDFファイル
├── logs/                         # ログファイル
├── test_simple_yuutai.py         # 簡易テスト
├── test_yuutai_functionality.py  # 機能テスト
├── .env                          # 環境変数設定
└── README.md                     # このファイル
```

## API・制限事項

### YANOSHIN TDNET API
- **API URL**: https://webapi.yanoshin.jp/webapi/tdnet/list
- **レート制限**: 1秒間隔でリクエスト
- **データ範囲**: 過去データも取得可能
- **ファイル形式**: PDFファイルの直接ダウンロードに対応
- **検索対象**: TDNET適時開示情報

### Notionの制限
- **ファイルサイズ**: 50MBまで
- **テーブルサイズ**: 効率的な分割表示
- **API制限**: レート制限に配慮した実装

### パフォーマンス
- **ファイル削除**: アップロード後の自動削除でディスク容量節約
- **重複チェック**: 複数の方法による確実な重複防止
- **バッチ処理**: 効率的な一括処理

## スケジュール実行

### Cron設定例
```bash
# 毎日9時に実行
0 9 * * * cd /path/to/yuutai && python src/main_yuutai.py

# 毎日9時に企業別処理も実行
0 9 * * * cd /path/to/yuutai && python src/main_yuutai.py
5 9 * * * cd /path/to/yuutai && python src/main_yuutai.py --company 7203
10 9 * * * cd /path/to/yuutai && python src/main_yuutai.py --company 9984
```

### systemd設定例
```ini
[Unit]
Description=Yuutai Daily Processor
After=network.target

[Service]
Type=oneshot
User=your_user
WorkingDirectory=/path/to/yuutai
ExecStart=/usr/bin/python3 src/main_yuutai.py
Environment=PATH=/usr/bin:/bin

[Install]
WantedBy=multi-user.target
```

## ログ・モニタリング

### ログファイル
- `logs/yuutai_main_YYYYMMDD.log`: メインプロセスログ
- `logs/yuutai_YYYYMMDD.log`: 日次プロセッサーログ

### 処理状況の確認
1. **Notionページで確認**: 銘柄一覧の優待開示件数・最新開示日
2. **ログファイルで確認**: 詳細な処理状況
3. **ファイルシステムで確認**: downloads/yuutaiディレクトリ

## トラブルシューティング

### よくある問題

#### 1. 環境設定エラー
```
解決方法: .envファイルの設定を確認
python test_simple_yuutai.py で環境をチェック
```

#### 2. Notion API エラー
```
解決方法: APIキー・ページIDの設定を確認
Notionページの共有設定を確認
```

#### 3. EDINET API接続エラー
```
解決方法: ネットワーク接続とEDINET APIの状況を確認
レート制限の遵守を確認
```

#### 4. ファイルダウンロードエラー
```
解決方法: ディスク容量とファイル権限を確認
ファイルサイズ制限（50MB）を確認
```

#### 5. 重複データ
```
解決方法: 開示IDによる重複チェックが機能していることを確認
データベースの整合性を確認
```

### デバッグ方法

#### ログレベルの調整
```bash
# デバッグモードで実行
python src/main_yuutai.py --log-level DEBUG

# テストモードで詳細確認
python src/main_yuutai.py --test --log-level DEBUG
```

#### ドライランモード
```bash
# 実際の処理を行わずに動作確認
python src/main_yuutai.py --dry-run
```

## 機能拡張

### 今後の拡張予定
- [ ] 株主優待内容の自動解析強化
- [ ] 優待価値の自動計算
- [ ] アラート機能（重要な優待変更の通知）
- [ ] ダッシュボード機能
- [ ] 統計分析機能

### カスタマイズ例

#### カスタムキーワードの追加
```python
# src/yuutai/api_client.py のキーワードリストを編集
self.yuutai_keywords = [
    "株主優待", "優待制度", "優待内容", 
    "カスタムキーワード1", "カスタムキーワード2"  # 追加
]
```

#### カテゴリの追加
```python
# src/yuutai/notion_manager.py のカテゴリリストを編集
self.yuutai_categories = [
    '優待新設', '優待変更', '優待廃止',
    '優待内容', '権利基準日', '優待制度',
    'カスタムカテゴリ1', 'カスタムカテゴリ2',  # 追加
    'その他'
]
```

## ライセンス

このプロジェクトは個人利用・企業利用を問わず自由に使用できます。

## サポート

- バグ報告や機能要求はIssueでお知らせください
- 設定に関する質問は環境設定セクションを参照してください
- テストスクリプトを実行して問題の特定を行ってください

---

🎯 **株主優待投資の情報収集を効率化し、投資判断をサポートします！**