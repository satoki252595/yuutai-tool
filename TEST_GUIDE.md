# テストガイド

## 利用可能なテストコマンド

### 1. メインテスト
```bash
npm test
```
- 包括的なテストを実行（全5銘柄）
- 期待値との比較を含む
- 成功率を表示

### 2. クイックテスト
```bash
npm run test:quick
```
- 最初の2銘柄のみをテスト
- 素早い動作確認に最適

### 3. 特定銘柄のテスト
```bash
TEST_STOCK_CODE=3048 npm run test:stock
```
- 指定した銘柄のみをテスト
- 例：ビックカメラ（3048）のみテスト

### 4. ヘッドレスモードOFF（ブラウザ表示）
```bash
HEADLESS=false npm test
```
- ブラウザを表示してテスト実行
- デバッグ時に便利

### 5. 旧テストスクリプト
```bash
npm run test:old
```
- 従来のfixed-table-parser.jsを実行

## テスト対象銘柄

| 銘柄コード | 銘柄名 | 期待される優待 | 備考 |
|---|---|---|---|
| 2702 | マクドナルド | 食事券 | 特殊パターン |
| 3387 | クリエイト・レストランツ | 食事券 | 複数優待 |
| 3048 | ビックカメラ | 商品券 | カンマ付き金額 |
| 8200 | リンガーハット | 食事券 | - |
| 8591 | オリックス | 優待なし | 検証用 |

## テスト結果の見方

### 成功パターン
- ✅ 期待値と一致: 優待あり/なし
- 💰 金額が正しく抽出されている
- 📋 優待詳細が適切に表示

### 失敗パターン
- ❌ 期待値と不一致
- ⚠️ 優待情報なし（期待される場合）
- 金額が0円になっている

### 成功率の判定基準
- 80%以上: ✅ 合格
- 60-79%: ⚠️ 部分的合格
- 60%未満: ❌ 失敗

## 環境変数

| 変数名 | 値 | 説明 |
|---|---|---|
| QUICK_TEST | true | クイックテストモード |
| TEST_STOCK_CODE | 銘柄コード | 特定銘柄のみテスト |
| HEADLESS | false | ブラウザ表示 |

## トラブルシューティング

### ネットワークエラー
```bash
# タイムアウトを延長
timeout 300s npm test
```

### 特定銘柄のデバッグ
```bash
HEADLESS=false TEST_STOCK_CODE=3048 npm run test:stock
```

### 詳細ログの確認
- ブラウザのコンソールログが表示されます
- 解析ステップが詳細に出力されます