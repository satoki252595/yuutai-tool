import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import sys
import time

# 親ディレクトリを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notion_uploader import NotionUploader

logger = logging.getLogger(__name__)

class YuutaiNotionManager:
    """株主優待開示情報用の統一データベース管理（1つのテーブルで管理）"""
    
    def __init__(self, api_key: str, page_id: str):
        self.uploader = NotionUploader(api_key, page_id)
        self.api_key = api_key
        self.page_id = page_id
        
        # 統一データベース
        self.yuutai_database_id = None
        
        # 株主優待関連カテゴリの定義
        self.yuutai_categories = [
            '優待新設', '優待変更', '優待廃止',
            '優待内容', '権利基準日', '優待制度',
            'その他'
        ]
    
    def initialize_databases(self) -> bool:
        """データベース構造を初期化"""
        try:
            # 統一株主優待データベースを作成
            self.yuutai_database_id = self._create_yuutai_database()
            if not self.yuutai_database_id:
                return False
            
            logger.info("Yuutai unified database structure initialized")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Yuutai databases: {str(e)}")
            return False
    
    def _create_yuutai_database(self) -> Optional[str]:
        """統一株主優待データベースを作成"""
        try:
            # 既存のデータベースを検索
            existing_db = self.uploader._find_existing_database("株主優待開示情報")
            if existing_db:
                logger.info(f"Found existing yuutai database: {existing_db}")
                return existing_db
            
            # 新規作成（指定されたカラムのみ）
            response = self.uploader.client.databases.create(
                parent={"page_id": self.page_id},
                title=[{"type": "text", "text": {"content": "株主優待開示情報"}}],
                properties={
                    "タイトル": {"title": {}},
                    "PDFファイル": {"files": {}},
                    "カテゴリ": {"select": {"options": [
                        {"name": cat, "color": "default"} for cat in self.yuutai_categories
                    ]}},
                    "優待価値": {"number": {}},
                    "優待内容": {"rich_text": {}},
                    "必要株式数": {"number": {}},
                    "権利確定日": {"date": {}},
                    "銘柄コード": {"rich_text": {}},
                    "銘柄名": {"rich_text": {}},
                    "開示時刻": {"rich_text": {}}
                }
            )
            
            db_id = response["id"]
            logger.info(f"Created yuutai unified database: {db_id}")
            return db_id
            
        except Exception as e:
            logger.error(f"Failed to create yuutai unified database: {str(e)}")
            return None
    
    def upload_yuutai_disclosure(self, disclosure_data: Dict) -> bool:
        """株主優待開示情報をNotionにアップロード（重複チェック付き）"""
        try:
            stock_code = disclosure_data.get('company_code')
            stock_name = disclosure_data.get('company_name', '')
            category = disclosure_data.get('category', 'その他')
            disclosure_id = disclosure_data.get('id')
            
            if not stock_code or not disclosure_id:
                logger.error("Stock code and disclosure ID are required")
                return False
            
            # 🔍 重複チェック
            if self._check_duplicate_disclosure(disclosure_data):
                logger.info(f"Skipping duplicate yuutai disclosure: {disclosure_id} ({stock_code})")
                return True  # 重複スキップは成功として扱う
            
            # 統一データベースに開示情報を追加
            disclosure_page_id = self._create_yuutai_disclosure_page(disclosure_data)
            if not disclosure_page_id:
                return False
            
            logger.info(f"Successfully uploaded yuutai disclosure: {stock_code} - {disclosure_data.get('title', '')[:50]}...")
            return True
            
        except Exception as e:
            logger.error(f"Failed to upload yuutai disclosure: {str(e)}")
            return False
    
    def _create_yuutai_disclosure_page(self, disclosure_data: Dict) -> Optional[str]:
        """株主優待開示詳細ページを作成"""
        try:
            # 重複チェック（銘柄コード、開示時刻、タイトルで）
            response = self.uploader.client.databases.query(
                database_id=self.yuutai_database_id,
                filter={
                    "and": [
                        {
                            "property": "タイトル",
                            "title": {"equals": disclosure_data.get('title', '')[:100]}
                        },
                        {
                            "property": "銘柄コード",
                            "rich_text": {"equals": disclosure_data.get('company_code', '')}
                        },
                        {
                            "property": "開示時刻",
                            "rich_text": {"equals": disclosure_data.get('disclosure_time', '')}
                        }
                    ]
                }
            )
            
            if response['results']:
                logger.info(f"Yuutai disclosure already exists: {disclosure_data.get('id')}")
                return response['results'][0]['id']
            
            # プロパティを準備（指定されたカラムのみ）
            properties = {
                "タイトル": {"title": [{"text": {"content": disclosure_data.get('title', '')[:100]}}]},
                "カテゴリ": {"select": {"name": disclosure_data.get('category', 'その他')}},
                "銘柄コード": {"rich_text": [{"text": {"content": disclosure_data.get('company_code', '')}}]},
                "銘柄名": {"rich_text": [{"text": {"content": disclosure_data.get('company_name', '')}}]},
                "開示時刻": {"rich_text": [{"text": {"content": disclosure_data.get('disclosure_time', '')}}]}
            }
            
            # 優待内容を解析して追加（可能な場合）
            yuutai_info = self._extract_yuutai_info(disclosure_data.get('title', ''))
            if yuutai_info:
                if yuutai_info.get('content'):
                    properties["優待内容"] = {"rich_text": [{"text": {"content": yuutai_info['content']}}]}
                if yuutai_info.get('shares'):
                    properties["必要株式数"] = {"number": yuutai_info['shares']}
                if yuutai_info.get('value'):
                    properties["優待価値"] = {"number": yuutai_info['value']}
                if yuutai_info.get('rights_date'):
                    properties["権利確定日"] = {"date": {"start": yuutai_info['rights_date']}}
            
            # ページを作成
            response = self.uploader.client.pages.create(
                parent={"database_id": self.yuutai_database_id},
                properties=properties
            )
            
            page_id = response["id"]
            
            # PDFファイルがある場合はアップロード
            local_file = disclosure_data.get('local_file')
            if local_file and os.path.exists(local_file):
                success = self._upload_yuutai_disclosure_file(page_id, local_file, disclosure_data)
                if success:
                    # アップロード成功後にローカルファイルを削除
                    try:
                        os.remove(local_file)
                        logger.info(f"Deleted local file: {local_file}")
                    except Exception as e:
                        logger.warning(f"Failed to delete local file {local_file}: {str(e)}")
                else:
                    logger.warning(f"Failed to upload PDF file, but basic information saved: {page_id}")
            else:
                # PDFファイルがない場合（404エラー等）でも基本情報は保存済み
                logger.info(f"Created yuutai disclosure page without PDF file: {page_id}")
            
            logger.info(f"Created yuutai disclosure page: {page_id}")
            return page_id
            
        except Exception as e:
            logger.error(f"Failed to create yuutai disclosure page: {str(e)}")
            return None
    
    def _upload_yuutai_disclosure_file(self, page_id: str, file_path: str, disclosure_data: Dict) -> bool:
        """優待開示ファイルをNotionにアップロード"""
        try:
            filename = os.path.basename(file_path)
            
            # 既存のNotionアップロード機能を使用
            metadata = {
                'type': 'yuutai_disclosure',
                'format': 'pdf',
                'url': disclosure_data.get('pdf_url', ''),
                'original_filename': filename,
                'timestamp': datetime.now(),
                'stock_code': disclosure_data.get('company_code'),
                'disclosure_id': disclosure_data.get('id'),
                'category': disclosure_data.get('category')
            }
            
            # ファイルをPDFファイルプロパティに直接アップロード
            upload_success = self._upload_file_to_pdf_property(page_id, file_path, filename)
            
            if upload_success:
                logger.info(f"Successfully uploaded yuutai PDF: {filename}")
                return True
            else:
                logger.error(f"Failed to upload yuutai PDF: {filename}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to upload yuutai disclosure file: {str(e)}")
            return False
    
    def _upload_file_to_pdf_property(self, page_id: str, file_path: str, filename: str) -> bool:
        """PDFファイルプロパティに直接ファイルをアップロード"""
        try:
            # ファイルアップロードを初期化
            file_upload_id = self.uploader._create_file_upload(filename, 'application/pdf')
            if not file_upload_id:
                return False
            
            # ファイルを送信
            upload_success = self.uploader._send_file_upload(file_upload_id, file_path, filename, 'application/pdf')
            if not upload_success:
                return False
            
            # PDFファイルプロパティを更新
            self.uploader.client.pages.update(
                page_id=page_id,
                properties={
                    "PDFファイル": {
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
            
            logger.info(f"Successfully set PDF file property: {filename}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to upload file to PDF property: {str(e)}")
            return False
    
    
    def _extract_yuutai_info(self, title: str) -> Optional[Dict]:
        """タイトルから株主優待情報を抽出"""
        try:
            if not title:
                return None
            
            yuutai_info = {}
            
            # 必要株数の抽出
            import re
            shares_patterns = [
                r'(\d+)株',
                r'(\d+)単元',
                r'(\d+)万株',
                r'(\d+),(\d+)株'
            ]
            
            for pattern in shares_patterns:
                match = re.search(pattern, title)
                if match:
                    if '万株' in pattern:
                        yuutai_info['shares'] = int(match.group(1)) * 10000
                    elif ',' in pattern:
                        yuutai_info['shares'] = int(match.group(1)) * 1000 + int(match.group(2))
                    else:
                        yuutai_info['shares'] = int(match.group(1))
                    break
            
            # 優待内容の簡易抽出
            content_keywords = ['商品券', 'クオカード', '食事券', '割引券', '商品', 'ギフト', 'カタログ']
            for keyword in content_keywords:
                if keyword in title:
                    yuutai_info['content'] = f"{keyword}関連優待"
                    break
            
            # 金額の抽出
            value_patterns = [
                r'(\d+)円',
                r'(\d+),(\d+)円',
                r'(\d+)万円'
            ]
            
            for pattern in value_patterns:
                match = re.search(pattern, title)
                if match:
                    if '万円' in pattern:
                        yuutai_info['value'] = int(match.group(1)) * 10000
                    elif ',' in pattern:
                        yuutai_info['value'] = int(match.group(1)) * 1000 + int(match.group(2))
                    else:
                        yuutai_info['value'] = int(match.group(1))
                    break
            
            # 権利確定日の抽出
            rights_patterns = [
                r'(\d{1,2})月(\d{1,2})日',
                r'(\d{4})年(\d{1,2})月(\d{1,2})日'
            ]
            
            for pattern in rights_patterns:
                match = re.search(pattern, title)
                if match:
                    if len(match.groups()) == 3:  # 年月日
                        year = int(match.group(1))
                        month = int(match.group(2))
                        day = int(match.group(3))
                    else:  # 月日のみ（今年として処理）
                        year = datetime.now().year
                        month = int(match.group(1))
                        day = int(match.group(2))
                    
                    try:
                        rights_date = datetime(year, month, day)
                        yuutai_info['rights_date'] = rights_date.isoformat()[:10]
                    except ValueError:
                        pass  # 無効な日付の場合はスキップ
                    break
            
            return yuutai_info if yuutai_info else None
            
        except Exception as e:
            logger.error(f"Failed to extract yuutai info from title: {str(e)}")
            return None
    
    def _check_duplicate_disclosure(self, disclosure_data: Dict) -> bool:
        """株主優待開示の重複チェック（銘柄コード、開示日時、タイトルが一致）"""
        try:
            title = disclosure_data.get('title', '')
            stock_code = disclosure_data.get('company_code')
            disclosure_time = disclosure_data.get('disclosure_time', '')
            
            logger.debug(f"Checking duplicate for yuutai disclosure: {title[:30]}... ({stock_code}) at {disclosure_time}")
            
            # 銘柄コード、開示時刻、タイトルによる重複チェック
            response = self.uploader.client.databases.query(
                database_id=self.yuutai_database_id,
                filter={
                    "and": [
                        {
                            "property": "タイトル",
                            "title": {"equals": title[:100]}
                        },
                        {
                            "property": "銘柄コード", 
                            "rich_text": {"equals": stock_code}
                        },
                        {
                            "property": "開示時刻",
                            "rich_text": {"equals": disclosure_time}
                        }
                    ]
                }
            )
            
            if response.get('results'):
                logger.info(f"Duplicate yuutai disclosure found: {title[:50]}... ({stock_code}) at {disclosure_time}")
                return True
            
            logger.debug(f"No duplicate found for yuutai disclosure: {title[:30]}...")
            return False
            
        except Exception as e:
            logger.error(f"Error in yuutai duplicate check: {str(e)}")
            return False
    
    
    def _validate_stock_code(self, stock_code: str) -> bool:
        """銘柄コードの妥当性チェック"""
        if not stock_code:
            return False
        
        # 基本的な銘柄コード形式チェック（4桁数字）
        # 既に4桁に変換済みなので、4桁のみを受け入れる
        import re
        return bool(re.match(r'^\d{4}$', stock_code))
    
    def process_daily_yuutai_disclosures(self, disclosures: List[Dict]) -> Dict[str, int]:
        """1日分の株主優待開示を一括処理"""
        stats = {
            'total': len(disclosures),
            'success': 0,
            'failed': 0,
            'skipped': 0,
            'duplicates': 0
        }
        
        logger.info(f"Processing {stats['total']} yuutai disclosures...")
        
        processed_ids = set()
        
        for disclosure in disclosures:
            try:
                disclosure_id = disclosure.get('id')
                stock_code = disclosure.get('company_code')
                
                if disclosure_id in processed_ids:
                    logger.info(f"Skipping duplicate in batch: {disclosure_id}")
                    stats['duplicates'] += 1
                    continue
                
                if stock_code and not self._validate_stock_code(stock_code):
                    logger.warning(f"Invalid stock code {stock_code}, skipping yuutai disclosure")
                    stats['skipped'] += 1
                    continue
                
                result = self.upload_yuutai_disclosure(disclosure)
                
                if result:
                    processed_ids.add(disclosure_id)
                    stats['success'] += 1
                    logger.debug(f"Processed yuutai disclosure: {disclosure_id}")
                else:
                    stats['failed'] += 1
                    logger.warning(f"Failed yuutai disclosure: {disclosure_id}")
                    
            except Exception as e:
                logger.error(f"Error processing yuutai disclosure {disclosure.get('id', 'unknown')}: {str(e)}")
                stats['failed'] += 1
        
        logger.info(f"Yuutai processing complete: {stats['success']} new, {stats['failed']} failed, {stats['skipped']} invalid, {stats['duplicates']} batch duplicates")
        return stats