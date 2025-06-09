import os
import logging
import re
import requests
import mimetypes
from notion_client import Client
from typing import Dict, List, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class NotionUploader:
    def __init__(self, api_key: str, page_id: str):
        self.client = Client(auth=api_key)
        self.api_key = api_key  # APIキーを保存
        self.page_id = page_id
        self.databases = {}  # データタイプ別のデータベースIDを管理
        
    def _get_or_create_database(self, data_type: str) -> Optional[str]:
        """データタイプに応じたデータベースを取得または作成"""
        if data_type in self.databases:
            return self.databases[data_type]
        
        # データベース名の定義
        database_names = {
            'margin_balance': '信用取引現在高',
            'weekly_margin_balance': '銘柄別信用取引週末残高',
            'daily_margin_balance': '個別銘柄信用取引残高表',
            'short_selling_daily': '空売り集計（日次）',
            'short_selling_monthly': '空売り集計（月次）',
            'investor_type': '投資主体別売買状況'
        }
        
        database_name = database_names.get(data_type, data_type)
        
        try:
            # 既存のデータベースを検索
            existing_db_id = self._find_existing_database(database_name)
            if existing_db_id:
                self.databases[data_type] = existing_db_id
                logger.info(f"Found existing database for {data_type}: {existing_db_id}")
                return existing_db_id
            
            # 新しいデータベースを作成
            logger.info(f"Creating new database for {data_type}")
            
            properties = {
                "名前": {"title": {}},
                "物理ファイル": {"files": {}},
                "ファイル形式": {"select": {}},
                "日付": {"date": {}}
            }
            
            response = self.client.databases.create(
                parent={"page_id": self.page_id},
                title=[{"type": "text", "text": {"content": database_name}}],
                properties=properties
            )
            
            db_id = response["id"]
            self.databases[data_type] = db_id
            logger.info(f"Created new database for {data_type}: {db_id}")
            return db_id
            
        except Exception as e:
            logger.error(f"Failed to get or create database for {data_type}: {str(e)}")
            return None
    
    def _find_existing_database(self, database_name: str) -> Optional[str]:
        """ページ配下の既存データベースを検索"""
        try:
            # ページの子ブロックを取得
            blocks = self.client.blocks.children.list(block_id=self.page_id)
            
            for block in blocks['results']:
                if block['type'] == 'child_database':
                    # データベースのタイトルを確認
                    db_id = block['id']
                    db_info = self.client.databases.retrieve(database_id=db_id)
                    
                    if db_info.get('title'):
                        title = ''.join([t['plain_text'] for t in db_info['title'] if 'plain_text' in t])
                        if title == database_name:
                            return db_id
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to find existing database: {str(e)}")
            return None
    
    def _get_database_properties(self, database_id: str) -> Optional[Dict[str, Any]]:
        """データベースのプロパティ情報を取得"""
        try:
            database_info = self.client.databases.retrieve(database_id=database_id)
            return database_info.get('properties', {})
        except Exception as e:
            logger.error(f"Failed to get database properties: {str(e)}")
            return None
    
    def _attach_file_to_page_property(self, page_id: str, file_path: str):
        """ページの物理ファイルプロパティにファイルを添付"""
        try:
            # ファイルをNotion経由でアップロードして物理ファイル列に直接追加
            filename = os.path.basename(file_path)
            mime_type = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
            
            # Notion APIを使って物理ファイルを直接プロパティに添付
            success = self._upload_and_attach_physical_file(page_id, file_path, filename, mime_type)
            
            if success:
                logger.info(f"Successfully attached physical file to page property: {filename}")
            else:
                logger.warning(f"Failed to attach physical file, adding as reference: {filename}")
                # フォールバックとしてファイル参照を追加
                self._add_file_reference_to_page(page_id, file_path)
                
        except Exception as e:
            logger.error(f"Failed to attach file to page property: {str(e)}")
            # エラー時もファイル参照を追加
            self._add_file_reference_to_page(page_id, file_path)
    
    def _upload_and_attach_physical_file(self, page_id: str, file_path: str, filename: str, mime_type: str) -> bool:
        """物理ファイルをデータベースの物理ファイル列に直接アップロード"""
        try:
            # Step 1: ファイルアップロードを初期化
            file_upload_id = self._create_file_upload(filename, mime_type)
            if not file_upload_id:
                return False
            
            # Step 2: ファイルを送信
            upload_success = self._send_file_upload(file_upload_id, file_path, filename, mime_type)
            if not upload_success:
                return False
            
            # Step 3: データベースページのプロパティを直接更新
            logger.info(f"Uploading file to database property: {filename}")
            success = self._update_database_file_property(page_id, file_upload_id, filename)
            
            if success:
                logger.info(f"Successfully uploaded file to 物理ファイル property: {filename}")
                return True
            else:
                logger.error(f"Failed to upload file to database property: {filename}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to upload and attach physical file: {str(e)}")
            return False
    
    def _update_database_file_property(self, page_id: str, file_upload_id: str, filename: str) -> bool:
        """データベースページの物理ファイルプロパティを更新"""
        try:
            # Notion公式ドキュメントに従ったファイル参照形式
            self.client.pages.update(
                page_id=page_id,
                properties={
                    "物理ファイル": {
                        "files": [
                            {
                                "name": filename,
                                "type": "file_upload",
                                "file_upload": {
                                    "id": file_upload_id
                                }
                            }
                        ]
                    }
                }
            )
            
            logger.info(f"Database property updated successfully for: {filename}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update database property: {str(e)}")
            return False
    
    
    
    def _add_file_reference_to_page(self, page_id: str, file_path: str):
        """ページにファイル参照情報を追加（フォールバック用）"""
        try:
            filename = os.path.basename(file_path)
            file_size = os.path.getsize(file_path)
            
            # ページにファイル情報をブロックとして追加
            self.client.blocks.children.append(
                block_id=page_id,
                children=[
                    {
                        "type": "callout",
                        "callout": {
                            "icon": {
                                "type": "emoji",
                                "emoji": "📎"
                            },
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": f"物理ファイル: {filename}"
                                    },
                                    "annotations": {
                                        "bold": True
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": f"ファイルサイズ: {file_size:,} bytes\nローカルパス: {file_path}"
                                    }
                                }
                            ]
                        }
                    }
                ]
            )
            logger.info(f"Added file reference to page: {filename}")
            
        except Exception as e:
            logger.error(f"Failed to add file reference to page: {str(e)}")
    
    def create_page_with_file(self, title: str, file_path: str, data_type: str, 
                            metadata: Dict[str, Any], delete_after_upload: bool = True) -> Optional[str]:
        """データベースにページを作成し、ファイル情報を記録"""
        try:
            # データベースを取得または作成
            database_id = self._get_or_create_database(data_type)
            if not database_id:
                return None
            
            # 元のファイル名から日付を抽出（ダウンロード元のファイル名を優先）
            original_filename = metadata.get('original_filename', os.path.basename(file_path))
            data_date = self._extract_date_from_filename(original_filename)
            
            # 既存のデータベース構造を確認して適切なプロパティを使用
            database_info = self._get_database_properties(database_id)
            
            # シンプルなページプロパティの準備
            properties = {
                "名前": {
                    "title": [
                        {
                            "text": {
                                "content": title
                            }
                        }
                    ]
                },
                "ファイル形式": {
                    "select": {
                        "name": metadata.get('format', 'unknown').upper()
                    }
                },
                "日付": {
                    "date": {
                        "start": data_date if data_date else datetime.now().isoformat()
                    }
                }
            }
            
            # 物理ファイルプロパティ（ページ作成後に添付）
            if database_info and "物理ファイル" in database_info:
                properties["物理ファイル"] = {
                    "files": []
                }
            
            # ページを作成
            response = self.client.pages.create(
                parent={"database_id": database_id},
                properties=properties
            )
            
            page_id = response["id"]
            upload_success = False
            
            # 物理ファイルプロパティが存在する場合、ページ作成後にファイルを添付
            if database_info and "物理ファイル" in database_info and os.path.exists(file_path):
                self._attach_file_to_page_property(page_id, file_path)
                upload_success = True
            
            # ファイル情報を子ページに追加（テーブルデータ含む）
            if os.path.exists(file_path):
                # ファイルからテーブルデータを抽出
                table_data = self._extract_table_data_from_file(file_path, metadata.get('format'))
                self._create_simplified_child_page(page_id, file_path, metadata, table_data)
                upload_success = True
            
            # アップロード成功後、ローカルファイルを削除
            if upload_success and delete_after_upload and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted local file after upload: {file_path}")
                except Exception as e:
                    logger.warning(f"Failed to delete local file {file_path}: {str(e)}")
            
            logger.info(f"Successfully created Notion page: {title}")
            return page_id
            
        except Exception as e:
            logger.error(f"Failed to create Notion page: {str(e)}")
            return None
    
    
    
    def upload_parsed_data(self, parsed_data: Dict[str, Any]) -> bool:
        """解析済みデータをNotionにアップロード"""
        try:
            file_info = parsed_data.get('file_info', {})
            content = parsed_data.get('content')
            
            if not content:
                logger.warning("No content to upload")
                return False
            
            # ファイル名から適切なタイトルを生成
            file_path = file_info.get('filepath', '')
            file_name = os.path.basename(file_path)
            data_type = file_info.get('type', 'unknown')
            
            # 元のファイル名で重複チェック
            original_filename = file_info.get('original_filename', file_name)
            if self._check_duplicate_by_original_filename(data_type, original_filename):
                logger.info(f"Skipping duplicate file: {original_filename}")
                # 重複ファイルも削除
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        logger.info(f"Deleted duplicate local file: {file_path}")
                    except Exception as e:
                        logger.warning(f"Failed to delete duplicate file {file_path}: {str(e)}")
                return True  # スキップは成功として扱う
            
            # メインデータベースにファイル情報を追加（delete_after_upload=True）
            page_id = self.create_page_with_file(
                title=file_name,
                file_path=file_path,
                data_type=data_type,
                metadata=file_info,
                delete_after_upload=True
            )
            
            if page_id:
                # Excelデータの場合の処理は create_page_with_file 内で統合済み
                pass
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to upload parsed data: {str(e)}")
            return False
    
    
    def _get_database_name_from_type(self, data_type: str) -> str:
        """データタイプからデータベース名を取得"""
        database_names = {
            'margin_balance': '信用取引現在高',
            'weekly_margin_balance': '銘柄別信用取引週末残高',
            'daily_margin_balance': '個別銘柄信用取引残高表',
            'short_selling_daily': '空売り集計（日次）',
            'short_selling_monthly': '空売り集計（月次）',
            'investor_type': '投資主体別売買状況'
        }
        return database_names.get(data_type, data_type)
    
    def initialize_databases(self) -> bool:
        """全てのデータタイプに対応するデータベースを初期化"""
        try:
            self.client.pages.retrieve(page_id=self.page_id)
            logger.info(f"Connected to Notion page: {self.page_id}")
            
            for data_type in ['margin_balance', 'weekly_margin_balance', 'daily_margin_balance',
                            'short_selling_daily', 'short_selling_monthly', 'investor_type']:
                if not self._get_or_create_database(data_type):
                    logger.warning(f"Failed to initialize database for {data_type}")
            
            return True
        except Exception as e:
            logger.error(f"Failed to initialize databases: {str(e)}")
            return False
    
    def _check_duplicate_by_original_filename(self, data_type: str, original_filename: str) -> bool:
        """元のファイル名で重複をチェック"""
        try:
            # データベースIDを取得
            database_id = self.databases.get(data_type)
            if not database_id:
                database_id = self._find_existing_database(self._get_database_name_from_type(data_type))
                if not database_id:
                    return False  # データベースが存在しない場合は重複なし
            
            # データベースをクエリして元のファイル名を検索
            response = self.client.databases.query(
                database_id=database_id,
                filter={
                    "property": "名前",
                    "title": {
                        "contains": original_filename
                    }
                }
            )
            
            # 結果を精査して完全一致を確認
            for result in response.get('results', []):
                title_property = result.get('properties', {}).get('名前', {})
                if title_property.get('title'):
                    title_text = ''.join([t.get('plain_text', '') for t in title_property['title']])
                    # タイトルに元のファイル名が含まれているかチェック
                    if original_filename in title_text:
                        logger.info(f"Found duplicate entry with original filename: {original_filename}")
                        return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to check duplicate: {str(e)}")
            return False  # エラーの場合は重複なしとして処理を続行
    
    def _extract_table_data_from_file(self, file_path: str, file_format: str) -> Optional[List[Dict[str, Any]]]:
        """ファイルからテーブルデータを抽出"""
        try:
            if file_format == 'excel':
                import pandas as pd
                
                # Excelファイルを読み込み
                xls = pd.ExcelFile(file_path)
                table_data = []
                
                for sheet_name in xls.sheet_names:
                    try:
                        df = pd.read_excel(file_path, sheet_name=sheet_name)
                        if not df.empty:
                            # NaN値を空文字列に置換
                            df = df.fillna('')
                            
                            table_data.append({
                                'sheet_name': sheet_name,
                                'columns': df.columns.tolist(),
                                'rows': df.to_dict('records'),
                                'row_count': len(df)
                            })
                            
                            logger.info(f"Extracted {len(df)} rows from sheet '{sheet_name}'")
                    except Exception as e:
                        logger.error(f"Failed to read sheet '{sheet_name}': {str(e)}")
                
                return table_data if table_data else None
                
            elif file_format == 'pdf':
                # PDFの場合は表形式データ抽出は困難なので、テキストのみ
                logger.info("PDF table extraction not implemented - skipping table data")
                return None
                
            else:
                logger.warning(f"Unsupported format for table extraction: {file_format}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to extract table data from {file_path}: {str(e)}")
            return None
    
    def _extract_date_from_filename(self, filename: str) -> Optional[str]:
        """ファイル名から日付を抽出"""
        import re
        
        # 日付パターンのリスト（優先順位順）
        patterns = [
            (r'(\d{8})', lambda m: m.group(1)),  # YYYYMMDD
            (r'(\d{4}[-_]\d{2}[-_]\d{2})', lambda m: m.group(1).replace('-', '').replace('_', '')),  # YYYY-MM-DD or YYYY_MM_DD
            (r'(\d{4})年(\d{1,2})月(\d{1,2})日', lambda m: f"{m.group(1)}{int(m.group(2)):02d}{int(m.group(3)):02d}"),  # YYYY年MM月DD日
        ]
        
        for pattern, formatter in patterns:
            match = re.search(pattern, filename)
            if match:
                try:
                    # 日付文字列を8桁の数字に統一
                    date_str = formatter(match)
                    if len(date_str) == 8 and date_str.isdigit():
                        year = int(date_str[:4])
                        month = int(date_str[4:6])
                        day = int(date_str[6:8])
                        # 有効な日付かチェック
                        date_obj = datetime(year, month, day)
                        return date_obj.isoformat()
                except:
                    continue
        
        return None
    
    
    def _upload_file_via_notion_api(self, file_path: str, filename: str, mime_type: str) -> Optional[Dict]:
        """ファイルをNotion API経由でアップロード"""
        try:
            # Step 1: ファイルアップロードを初期化
            file_upload_id = self._create_file_upload(filename, mime_type)
            if not file_upload_id:
                logger.error("Failed to create file upload")
                return None
            
            # Step 2: ファイルを送信
            upload_success = self._send_file_upload(file_upload_id, file_path, filename, mime_type)
            if not upload_success:
                logger.error("Failed to send file upload")
                return None
            
            # Step 3: 正しい形式でファイル参照を返す
            file_reference = {
                "name": filename,
                "type": "file_upload",
                "file_upload": {
                    "id": file_upload_id
                }
            }
            
            logger.info(f"Successfully prepared file upload: {filename}")
            return file_reference
            
        except Exception as e:
            logger.error(f"Failed to upload file via Notion API: {str(e)}")
            return None
    
    def _get_file_upload_info(self, file_upload_id: str) -> Optional[Dict]:
        """ファイルアップロード情報を取得"""
        try:
            url = f"https://api.notion.com/v1/file_uploads/{file_upload_id}"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Notion-Version": "2022-06-28"
            }
            
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            logger.error(f"Failed to get file upload info: {str(e)}")
            if hasattr(e, 'response'):
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response text: {e.response.text}")
            return None
    
    def _create_file_upload(self, filename: str, mime_type: str) -> Optional[str]:
        """ファイルアップロードを初期化"""
        try:
            url = "https://api.notion.com/v1/file_uploads"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            }
            
            payload = {
                "name": filename,
                "content_type": mime_type
            }
            
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            file_upload_id = data.get("id")
            
            logger.info(f"Created file upload with ID: {file_upload_id}")
            return file_upload_id
            
        except Exception as e:
            logger.error(f"Failed to create file upload: {str(e)}")
            if hasattr(e, 'response'):
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response text: {e.response.text}")
            return None
    
    def _send_file_upload(self, file_upload_id: str, file_path: str, filename: str, mime_type: str) -> bool:
        """ファイルを送信"""
        try:
            url = f"https://api.notion.com/v1/file_uploads/{file_upload_id}/send"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Notion-Version": "2022-06-28"
            }
            
            with open(file_path, "rb") as f:
                files = {
                    "file": (filename, f, mime_type),
                    "part_number": (None, "1")
                }
                
                response = requests.post(url, headers=headers, files=files)
                response.raise_for_status()
            
            logger.info(f"Successfully sent file: {filename}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send file upload: {str(e)}")
            if hasattr(e, 'response'):
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response text: {e.response.text}")
            return False
    
    def _complete_file_upload(self, file_upload_id: str) -> Optional[str]:
        """ファイルアップロードを完了"""
        try:
            url = f"https://api.notion.com/v1/file_uploads/{file_upload_id}/complete"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            }
            
            response = requests.post(url, headers=headers, json={})
            response.raise_for_status()
            
            data = response.json()
            file_url = data.get("url")
            
            logger.info(f"Completed file upload with URL: {file_url}")
            return file_url
            
        except Exception as e:
            logger.error(f"Failed to complete file upload: {str(e)}")
            if hasattr(e, 'response'):
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response text: {e.response.text}")
            return None
    
    
    def _add_file_reference(self, page_id: str, file_path: str):
        """ファイル参照情報をページに追加"""
        try:
            filename = os.path.basename(file_path)
            file_size = os.path.getsize(file_path)
            
            self.client.blocks.children.append(
                block_id=page_id,
                children=[
                    {
                        "type": "callout",
                        "callout": {
                            "icon": {
                                "type": "emoji",
                                "emoji": "📎"
                            },
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": f"添付ファイル: {filename}"
                                    },
                                    "annotations": {
                                        "bold": True
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "type": "code",
                        "code": {
                            "language": "plain text",
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": f"ファイル名: {filename}\nファイルサイズ: {file_size:,} bytes\nローカルパス: {file_path}"
                                    }
                                }
                            ]
                        }
                    }
                ]
            )
            logger.info(f"File reference added to page: {filename}")
        except Exception as e:
            logger.error(f"Failed to add file reference: {str(e)}")
    
    
    def _add_table_blocks_to_page(self, page_id: str, table_data: List[Dict[str, Any]]):
        """テーブルデータをNotionブロックとしてページに追加"""
        try:
            for table in table_data:
                columns = table.get('columns', [])
                rows = table.get('rows', [])
                sheet_name = table.get('sheet_name', 'Data')
                
                if not columns or not rows:
                    continue
                
                # テーブルヘッダー
                self.client.blocks.children.append(
                    block_id=page_id,
                    children=[
                        {
                            "type": "heading_2",
                            "heading_2": {
                                "rich_text": [{"type": "text", "text": {"content": f"📊 {sheet_name}"}}]
                            }
                        }
                    ]
                )
                
                # データが大きすぎる場合は分割（Notionの制限対応）
                max_rows_per_table = 100
                max_cols_per_table = 10
                
                # カラム数制限
                limited_columns = columns[:max_cols_per_table]
                if len(columns) > max_cols_per_table:
                    logger.info(f"Limiting columns from {len(columns)} to {max_cols_per_table}")
                
                # 行を分割して処理
                for chunk_start in range(0, len(rows), max_rows_per_table):
                    chunk_rows = rows[chunk_start:chunk_start + max_rows_per_table]
                    
                    # テーブル行の作成
                    table_rows = []
                    
                    # ヘッダー行
                    header_cells = []
                    for col in limited_columns:
                        header_cells.append([{"type": "text", "text": {"content": str(col)[:100]}}])
                    table_rows.append({"cells": header_cells})
                    
                    # データ行
                    for row in chunk_rows:
                        data_cells = []
                        for col in limited_columns:
                            value = str(row.get(col, ''))
                            # 長すぎるテキストは切り詰める
                            if len(value) > 100:
                                value = value[:97] + '...'
                            data_cells.append([{"type": "text", "text": {"content": value}}])
                        table_rows.append({"cells": data_cells})
                    
                    # テーブルブロックを追加
                    if chunk_start > 0:
                        # チャンク番号を表示
                        chunk_num = (chunk_start // max_rows_per_table) + 1
                        self.client.blocks.children.append(
                            block_id=page_id,
                            children=[
                                {
                                    "type": "heading_3",
                                    "heading_3": {
                                        "rich_text": [{"type": "text", "text": {"content": f"続き ({chunk_num})"}}]
                                    }
                                }
                            ]
                        )
                    
                    self.client.blocks.children.append(
                        block_id=page_id,
                        children=[
                            {
                                "type": "table",
                                "table": {
                                    "table_width": len(limited_columns),
                                    "has_column_header": True,
                                    "has_row_header": False,
                                    "children": table_rows
                                }
                            }
                        ]
                    )
                
                # テーブル統計
                if len(columns) > max_cols_per_table or len(rows) > max_rows_per_table:
                    stats_text = f"元データ: {len(rows):,}行 × {len(columns)}列"
                    if len(columns) > max_cols_per_table:
                        stats_text += f" (カラム表示制限: {max_cols_per_table}/{len(columns)})"
                    if len(rows) > max_rows_per_table:
                        stats_text += f" (行表示制限: {max_rows_per_table}/{len(rows)})"
                    
                    self.client.blocks.children.append(
                        block_id=page_id,
                        children=[
                            {
                                "type": "callout",
                                "callout": {
                                    "icon": {"type": "emoji", "emoji": "ℹ️"},
                                    "rich_text": [{"type": "text", "text": {"content": stats_text}}]
                                }
                            }
                        ]
                    )
                
        except Exception as e:
            logger.error(f"Failed to add table blocks: {str(e)}")
    
    def _create_simplified_child_page(self, parent_page_id: str, file_source: str, metadata: Dict[str, Any], content: Any = None):
        """親ページの子ページに全ての情報を統合（子子ページなし）"""
        try:
            if file_source.startswith(('http://', 'https://')):
                # URLの場合
                filename = metadata.get('original_filename', os.path.basename(file_source))
                try:
                    # URLからファイルサイズを取得（HEAD リクエスト）
                    response = requests.head(file_source)
                    file_size = int(response.headers.get('content-length', 0))
                except:
                    file_size = 0  # サイズ取得に失敗した場合
            else:
                # ローカルファイルの場合
                filename = os.path.basename(file_source)
                file_size = os.path.getsize(file_source)
            
            # 子ページを作成
            child_page_title = f"📎 {filename}"
            
            child_page = self.client.pages.create(
                parent={"page_id": parent_page_id},
                properties={
                    "title": {
                        "title": [
                            {
                                "text": {
                                    "content": child_page_title
                                }
                            }
                        ]
                    }
                }
            )
            
            child_page_id = child_page["id"]
            
            # 統合されたコンテンツブロックを作成
            blocks = [
                {
                    "type": "heading_1",
                    "heading_1": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": f"📊 {filename}"
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": f"このファイルは {metadata.get('url', 'JPX')} から取得されました。"
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "divider",
                    "divider": {}
                }
            ]
            
            # ファイル情報テーブル
            blocks.extend([
                {
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": "📋 ファイル情報"
                                }
                            }
                        ]
                    }
                },
                {
                    "type": "table",
                    "table": {
                        "table_width": 2,
                        "has_column_header": False,
                        "has_row_header": True,
                        "children": [
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "ファイル名"}}],
                                        [{"type": "text", "text": {"content": filename}}]
                                    ]
                                }
                            },
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "サイズ"}}],
                                        [{"type": "text", "text": {"content": f"{file_size:,} bytes"}}]
                                    ]
                                }
                            },
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "取得日時"}}],
                                        [{"type": "text", "text": {"content": datetime.now().strftime('%Y-%m-%d %H:%M:%S')}}]
                                    ]
                                }
                            },
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "ダウンロード元"}}],
                                        [{"type": "text", "text": {"content": metadata.get('url', 'N/A')}}]
                                    ]
                                }
                            }
                        ]
                    }
                }
            ])
            
            # テーブルデータがある場合、統計情報とテーブルを追加
            if content and isinstance(content, list):
                blocks.extend([
                    {
                        "type": "divider",
                        "divider": {}
                    },
                    {
                        "type": "heading_2",
                        "heading_2": {
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": "📈 データ統計"
                                    }
                                }
                            ]
                        }
                    }
                ])
                
                # データ統計を追加
                total_rows = sum(table.get('row_count', 0) for table in content)
                total_tables = len(content)
                all_columns = set()
                for table in content:
                    columns = table.get('columns', [])
                    all_columns.update(columns)
                
                stats_table = {
                    "type": "table",
                    "table": {
                        "table_width": 2,
                        "has_column_header": False,
                        "has_row_header": True,
                        "children": [
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "総シート数"}}],
                                        [{"type": "text", "text": {"content": str(total_tables)}}]
                                    ]
                                }
                            },
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "総レコード数"}}],
                                        [{"type": "text", "text": {"content": f"{total_rows:,}"}}]
                                    ]
                                }
                            },
                            {
                                "type": "table_row",
                                "table_row": {
                                    "cells": [
                                        [{"type": "text", "text": {"content": "ユニークカラム数"}}],
                                        [{"type": "text", "text": {"content": str(len(all_columns))}}]
                                    ]
                                }
                            }
                        ]
                    }
                }
                blocks.append(stats_table)
            
            # ダウンロードリンクを追加
            if metadata.get('url'):
                blocks.extend([
                    {
                        "type": "divider",
                        "divider": {}
                    },
                    {
                        "type": "heading_2",
                        "heading_2": {
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {
                                        "content": "🔗 元ファイル"
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "type": "bookmark",
                        "bookmark": {
                            "url": metadata.get('url')
                        }
                    }
                ])
            
            # ブロックを追加
            self.client.blocks.children.append(
                block_id=child_page_id,
                children=blocks
            )
            
            # テーブルデータを子ページに追加
            if content and isinstance(content, list):
                logger.info(f"Adding {len(content)} tables to child page...")
                self._add_table_blocks_to_page(child_page_id, content)
            
            logger.info(f"Created simplified child page: {child_page_title}")
            
        except Exception as e:
            logger.error(f"Failed to create simplified child page: {str(e)}")
    
