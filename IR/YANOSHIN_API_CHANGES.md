# YANOSHIN TDNET API 対応変更点

## 概要

株主優待開示情報管理システムを、YANOSHIN TDNET API (https://webapi.yanoshin.jp/tdnet/) を使用するように変更しました。

## 主な変更点

### 1. APIクライアント (`src/yuutai/api_client.py`)

#### 変更前（EDINET API）
```python
self.edinet_base_url = "https://disclosure.edinet-fsa.go.jp/api/v1"
```

#### 変更後（YANOSHIN TDNET API）
```python
self.base_url = "https://webapi.yanoshin.jp/webapi/tdnet/list"
```

### 2. API リクエスト形式

#### 変更前
```python
def _make_request(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
    url = f"{self.edinet_base_url}/{endpoint}"
```

#### 変更後
```python
def _make_request(self, condition: str, format: str = 'json', params: Dict = None) -> Optional[Dict]:
    url = f"{self.base_url}/{condition}.{format}"
```

### 3. データ取得方式

#### 変更前（EDINET）
- 日付パラメータ: `YYYY-MM-DD`
- レスポンス形式: `response['results']`
- フィールド: `docDescription`, `edinetCode`, `filerName`

#### 変更後（YANOSHIN）
- 日付パラメータ: `YYYYMMDD` (ハイフンなし)
- レスポンス形式: `response['items']` → `item['Tdnet']`
- フィールド: `title`, `company_code`, `company_name`

### 4. PDF URL 取得

#### 変更前
```python
def _construct_pdf_url(self, item: Dict) -> str:
    doc_id = item.get('docID', '')
    return f"{self.edinet_base_url}/documents/{doc_id}?type=1"
```

#### 変更後
```python
def _construct_pdf_url(self, item: Dict) -> str:
    return item.get('document_url', '')  # 直接URLが提供される
```

### 5. レスポンスデータ構造

#### YANOSHIN TDNET API レスポンス例
```json
{
  "items": [
    {
      "Tdnet": {
        "id": "開示ID",
        "title": "開示タイトル",
        "company_code": "企業コード",
        "company_name": "企業名",
        "pubdate": "公開日時",
        "document_url": "PDFファイルURL",
        "markets_string": "市場情報",
        "url_xbrl": "XBRLURL"
      }
    }
  ]
}
```

## 環境設定の変更

### .env ファイル
```bash
# 変更前
EDINET_CODELIST_URL=https://disclosure.edinet-fsa.go.jp/api/v1/documents.json
DISCLOSURE_API_URL=https://disclosure.edinet-fsa.go.jp/api/v1/documents.json

# 変更後
TDNET_API_BASE_URL=https://webapi.yanoshin.jp/webapi/tdnet/list
DISCLOSURE_API_URL=https://webapi.yanoshin.jp/webapi/tdnet/list
```

## 機能的変更点

### 1. データ取得の改善
- YANOSHIN APIは既存のTDNETシステムと同じAPI構造
- より安定したデータ取得が期待できる
- PDF URLが直接提供されるため、URL構築が簡潔

### 2. フィールドマッピング
```python
# 変更前（EDINET）
'company_code': item.get('edinetCode')
'title': item.get('docDescription')
'company_name': item.get('filerName')

# 変更後（YANOSHIN）
'company_code': tdnet_data.get('company_code')
'title': tdnet_data.get('title')
'company_name': tdnet_data.get('company_name')
```

### 3. 追加情報
YANOSHIN APIでは以下の追加情報も取得可能：
- `markets_string`: 市場情報
- `url_xbrl`: XBRL URL（必要に応じて活用可能）

## テストの更新

### テストファイルの変更点
- `test_yuutai_functionality.py`: YANOSHIN API用のテストケースに更新
- URL構築テストを新しいAPI形式に対応
- エラーメッセージでYANOSHINの表記を追加

## 互換性

### 既存機能への影響
- **なし**: 上位レイヤー（Notion管理、日次プロセッサ等）は変更不要
- APIクライアント内部の変更のみで、外部インターフェースは維持

### データ形式
- 出力データ構造は従来と同じ
- 株主優待の分類・フィルタリング機能は変更なし

## 利点

1. **安定性**: 既存TDNETシステムで実績のあるAPI
2. **一貫性**: 同じAPIプロバイダーによる統一された開発・運用
3. **信頼性**: YANOSHIN APIの高い可用性
4. **簡潔性**: PDF URL直接提供による処理の簡素化

## 使用方法（変更なし）

APIの変更は内部実装のみで、使用方法は従来と同じです：

```bash
# 当日の株主優待開示を処理
python src/main_yuutai.py

# 指定日の処理
python src/main_yuutai.py --date 2025-01-01

# テスト実行
python test_yuutai_functionality.py
```

この変更により、より安定した株主優待開示情報の収集が可能になります。