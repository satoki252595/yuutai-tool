import os
import requests
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import json
import re

logger = logging.getLogger(__name__)

class YuutaiAPIClient:
    """株主優待開示情報API クライアント (YANOSHIN TDNET API使用)"""
    
    def __init__(self, download_dir: str = "./downloads/yuutai"):
        # YANOSHIN TDNET APIの設定
        self.base_url = "https://webapi.yanoshin.jp/webapi/tdnet/list"
        self.download_dir = download_dir
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Yuutai Disclosure Client/1.0',
            'Accept': 'application/json'
        })
        
        # ダウンロードディレクトリを作成
        os.makedirs(download_dir, exist_ok=True)
        
        # レート制限対応
        self.last_request_time = 0
        self.min_interval = 1.0  # 1秒間隔
        
        # 株主優待関連キーワード
        self.yuutai_keywords = [
            "株主優待", "優待制度", "優待内容", "株主優待制度", 
            "優待", "株主特典", "株主様ご優待", "株主優待券",
            "株主優待品", "優待商品", "株主様特典"
        ]
    
    def _wait_for_rate_limit(self):
        """レート制限に対応した待機"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()
    
    def _make_request(self, condition: str, format: str = 'json', params: Dict = None) -> Optional[Dict]:
        """YANOSHIN TDNET API リクエスト実行"""
        self._wait_for_rate_limit()
        
        try:
            url = f"{self.base_url}/{condition}.{format}"
            response = self.session.get(url, params=params)
            response.raise_for_status()
            
            logger.info(f"API request successful: {condition}.{format}")
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {condition}.{format} - {str(e)}")
            return None
    
    def get_daily_disclosures(self, date: str = None) -> Optional[List[Dict]]:
        """
        指定日の開示情報を取得し、株主優待関連のものをフィルタリング
        Args:
            date: YYYY-MM-DD形式の日付（省略時は当日）
        Returns:
            株主優待関連開示情報のリスト
        """
        if date is None:
            date = datetime.now().strftime('%Y-%m-%d')
        
        logger.info(f"Fetching disclosures for date: {date}")
        
        # YANOSHIN API用の日付フォーマット (YYYYMMDD)
        date_condition = date.replace('-', '')
        
        params = {
            'limit': 1000  # 1日分を全て取得
        }
        
        response = self._make_request(date_condition, 'json', params)
        if not response or 'items' not in response:
            logger.warning(f"No data found for date: {date}")
            return []
        
        # 株主優待関連の開示のみフィルタリング
        yuutai_disclosures = []
        
        for item in response['items']:
            if 'Tdnet' in item:
                tdnet_data = item['Tdnet']
                title = tdnet_data.get('title', '')
                
                # タイトルに優待関連キーワードが含まれているかチェック
                if self._is_yuutai_related(title):
                    # 銘柄コードを取得し、5桁の場合は末尾の0を削除して4桁にする
                    company_code = tdnet_data.get('company_code', '')
                    if company_code and len(company_code) == 5 and company_code.endswith('0'):
                        company_code = company_code[:-1]
                        logger.debug(f"Converted stock code from {tdnet_data.get('company_code')} to {company_code}")
                    
                    disclosure = {
                        'id': tdnet_data.get('id'),
                        'title': title,
                        'company_code': company_code,
                        'company_name': tdnet_data.get('company_name'),
                        'disclosure_date': date,
                        'disclosure_time': tdnet_data.get('pubdate', ''),
                        'document_type': 'TDNET',
                        'pdf_url': tdnet_data.get('document_url', ''),
                        'category': self._categorize_yuutai_disclosure(title),
                        'markets_string': tdnet_data.get('markets_string', ''),
                        'url_xbrl': tdnet_data.get('url_xbrl', ''),
                        'raw_data': tdnet_data
                    }
                    yuutai_disclosures.append(disclosure)
        
        logger.info(f"Found {len(yuutai_disclosures)} yuutai-related disclosures for {date}")
        return yuutai_disclosures
    
    def _is_yuutai_related(self, title: str) -> bool:
        """タイトルが株主優待関連かどうかを判定"""
        if not title:
            return False
        
        # キーワードマッチング
        for keyword in self.yuutai_keywords:
            if keyword in title:
                return True
        
        # より詳細なパターンマッチング
        yuutai_patterns = [
            r'株主.*優待',
            r'優待.*制度',
            r'株主.*特典',
            r'優待.*内容',
            r'優待.*導入',
            r'優待.*変更',
            r'優待.*廃止',
            r'優待.*新設'
        ]
        
        for pattern in yuutai_patterns:
            if re.search(pattern, title):
                return True
        
        return False
    
    def _categorize_yuutai_disclosure(self, title: str) -> str:
        """株主優待開示のカテゴリを判定"""
        if not title:
            return 'その他'
        
        # カテゴリ分類ルール
        if any(word in title for word in ['新設', '導入', '開始']):
            return '優待新設'
        elif any(word in title for word in ['変更', '修正', '見直し']):
            return '優待変更'
        elif any(word in title for word in ['廃止', '終了', '中止']):
            return '優待廃止'
        elif any(word in title for word in ['内容', '詳細']):
            return '優待内容'
        elif any(word in title for word in ['基準日', '権利']):
            return '権利基準日'
        else:
            return '優待制度'
    
    def _construct_pdf_url(self, item: Dict) -> str:
        """PDF URLを構築（YANOSHIN TDNET API用）"""
        # YANOSHIN APIでは直接document_urlが提供される
        return item.get('document_url', '')
    
    def download_disclosure_file(self, disclosure_data: Dict) -> Optional[str]:
        """開示ファイルをダウンロード"""
        try:
            pdf_url = disclosure_data.get('pdf_url')
            if not pdf_url:
                logger.warning("No PDF URL provided")
                return None
            
            # ファイル名を生成（company_codeは既に4桁に変換済み）
            company_code = disclosure_data.get('company_code', 'unknown')
            disclosure_date = disclosure_data.get('disclosure_date', '').replace('-', '')
            doc_id = disclosure_data.get('id', 'unknown')
            filename = f"{company_code}_{disclosure_date}_{doc_id}.pdf"
            file_path = os.path.join(self.download_dir, filename)
            
            # ファイルが既に存在する場合はスキップ
            if os.path.exists(file_path):
                logger.info(f"File already exists: {filename}")
                return file_path
            
            # ダウンロード実行
            self._wait_for_rate_limit()
            
            response = self.session.get(pdf_url)
            response.raise_for_status()
            
            # ファイルサイズチェック（50MB制限）
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > 50 * 1024 * 1024:
                logger.warning(f"File too large: {filename} ({content_length} bytes)")
                return None
            
            # ファイルを保存
            with open(file_path, 'wb') as f:
                f.write(response.content)
            
            logger.info(f"Downloaded file: {filename}")
            return file_path
            
        except Exception as e:
            logger.error(f"Failed to download file: {str(e)}")
            return None
    
    def process_daily_disclosures(self, date: str = None) -> List[Dict]:
        """
        指定日の株主優待開示を処理（取得・ダウンロード・分類）
        """
        disclosures = self.get_daily_disclosures(date)
        if not disclosures:
            return []
        
        processed_disclosures = []
        
        for disclosure in disclosures:
            try:
                # ファイルをダウンロード
                local_file = self.download_disclosure_file(disclosure)
                if local_file:
                    disclosure['local_file'] = local_file
                    disclosure['file_size'] = os.path.getsize(local_file)
                else:
                    disclosure['local_file'] = None
                    disclosure['file_size'] = 0
                
                # 処理済みリストに追加
                processed_disclosures.append(disclosure)
                
            except Exception as e:
                logger.error(f"Error processing disclosure {disclosure.get('id')}: {str(e)}")
                continue
        
        logger.info(f"Processed {len(processed_disclosures)} yuutai disclosures")
        return processed_disclosures
    
    def get_disclosure_detail(self, disclosure_id: str) -> Optional[Dict]:
        """
        開示詳細情報を取得（YANOSHIN TDNET API用）
        """
        try:
            # YANOSHIN APIでは個別の詳細取得はdaily_disclosuresで十分な情報が得られる
            # 必要に応じて実装を追加
            logger.info(f"Disclosure detail for {disclosure_id} - using data from daily fetch")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get disclosure detail {disclosure_id}: {str(e)}")
            return None
    
    def get_company_disclosures(self, company_code: str, days_back: int = 30) -> List[Dict]:
        """
        特定企業の過去の株主優待開示を取得
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        all_disclosures = []
        current_date = start_date
        
        while current_date <= end_date:
            date_str = current_date.strftime('%Y-%m-%d')
            daily_disclosures = self.get_daily_disclosures(date_str)
            
            # 指定企業のもののみフィルタ
            company_disclosures = [
                d for d in daily_disclosures 
                if d.get('company_code') == company_code
            ]
            
            all_disclosures.extend(company_disclosures)
            current_date += timedelta(days=1)
            
            # レート制限対応
            time.sleep(0.5)
        
        logger.info(f"Found {len(all_disclosures)} yuutai disclosures for company {company_code}")
        return all_disclosures