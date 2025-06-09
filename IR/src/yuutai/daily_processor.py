import os
import logging
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dotenv import load_dotenv

# 親ディレクトリを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from yuutai.api_client import YuutaiAPIClient
from yuutai.notion_manager import YuutaiNotionManager

logger = logging.getLogger(__name__)

class YuutaiDailyProcessor:
    """株主優待開示情報の日次処理"""
    
    def __init__(self):
        # 環境変数を読み込み
        load_dotenv()
        
        self.notion_api_key = os.getenv('NOTION_API_KEY')
        self.notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        self.download_dir = os.getenv('YUUTAI_DOWNLOAD_DIR', './downloads/yuutai')
        
        if not self.notion_api_key or not self.notion_page_id:
            raise ValueError("NOTION_API_KEY and YUUTAI_NOTION_PAGE_ID must be set")
        
        # コンポーネントを初期化
        self.api_client = YuutaiAPIClient(self.download_dir)
        self.notion_manager = YuutaiNotionManager(self.notion_api_key, self.notion_page_id)
        
        logger.info("Yuutai Daily Processor initialized")
    
    def process_date(self, date: str = None) -> Dict[str, any]:
        """指定日の株主優待開示を処理"""
        if date is None:
            date = datetime.now().strftime('%Y-%m-%d')
        
        logger.info(f"=== Processing Yuutai data for {date} ===")
        
        try:
            # Notionデータベースを初期化
            if not self.notion_manager.initialize_databases():
                logger.error("Failed to initialize Notion databases")
                return {'success': False, 'error': 'Database initialization failed'}
            
            # APIから株主優待開示データを取得・処理
            logger.info("Fetching and processing yuutai disclosures from API...")
            disclosures = self.api_client.process_daily_disclosures(date)
            
            if not disclosures:
                logger.info(f"No yuutai disclosures found for {date}")
                return {
                    'success': True,
                    'date': date,
                    'stats': {'total': 0, 'success': 0, 'failed': 0, 'skipped': 0}
                }
            
            # Notionにアップロード
            logger.info(f"Uploading {len(disclosures)} yuutai disclosures to Notion...")
            stats = self.notion_manager.process_daily_yuutai_disclosures(disclosures)
            
            logger.info(f"Yuutai processing complete for {date}: {stats}")
            
            return {
                'success': True,
                'date': date,
                'stats': stats,
                'disclosures_processed': len(disclosures)
            }
            
        except Exception as e:
            logger.error(f"Failed to process yuutai date {date}: {str(e)}")
            return {
                'success': False,
                'date': date,
                'error': str(e)
            }
    
    def process_date_range(self, start_date: str, end_date: str = None) -> List[Dict]:
        """日付範囲の株主優待開示を処理"""
        if end_date is None:
            end_date = start_date
        
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        results = []
        current = start
        
        while current <= end:
            date_str = current.strftime('%Y-%m-%d')
            result = self.process_date(date_str)
            results.append(result)
            
            # 次の日へ
            current += timedelta(days=1)
            
            # API制限を考慮して少し待機
            if current <= end:
                import time
                time.sleep(2)
        
        return results
    
    def process_company_yuutai_history(self, company_code: str, days_back: int = 30) -> Dict[str, any]:
        """特定企業の株主優待開示履歴を処理"""
        logger.info(f"=== Processing Yuutai history for company {company_code} (last {days_back} days) ===")
        
        try:
            # Notionデータベースを初期化
            if not self.notion_manager.initialize_databases():
                logger.error("Failed to initialize Notion databases")
                return {'success': False, 'error': 'Database initialization failed'}
            
            # 企業の株主優待開示履歴を取得
            logger.info(f"Fetching yuutai disclosures for company {company_code}...")
            disclosures = self.api_client.get_company_disclosures(company_code, days_back)
            
            if not disclosures:
                logger.info(f"No yuutai disclosures found for company {company_code}")
                return {
                    'success': True,
                    'company_code': company_code,
                    'stats': {'total': 0, 'success': 0, 'failed': 0, 'skipped': 0}
                }
            
            # 各開示のファイルをダウンロード
            processed_disclosures = []
            for disclosure in disclosures:
                local_file = self.api_client.download_disclosure_file(disclosure)
                if local_file:
                    disclosure['local_file'] = local_file
                    disclosure['file_size'] = os.path.getsize(local_file)
                processed_disclosures.append(disclosure)
            
            # Notionにアップロード
            logger.info(f"Uploading {len(processed_disclosures)} company yuutai disclosures to Notion...")
            stats = self.notion_manager.process_daily_yuutai_disclosures(processed_disclosures)
            
            logger.info(f"Company yuutai processing complete for {company_code}: {stats}")
            
            return {
                'success': True,
                'company_code': company_code,
                'stats': stats,
                'disclosures_processed': len(processed_disclosures)
            }
            
        except Exception as e:
            logger.error(f"Failed to process company yuutai {company_code}: {str(e)}")
            return {
                'success': False,
                'company_code': company_code,
                'error': str(e)
            }
    
    def get_processing_summary(self, results: List[Dict]) -> Dict:
        """処理結果のサマリーを生成"""
        summary = {
            'total_dates': len(results),
            'successful_dates': 0,
            'failed_dates': 0,
            'total_disclosures': 0,
            'successful_uploads': 0,
            'failed_uploads': 0,
            'errors': []
        }
        
        for result in results:
            if result.get('success'):
                summary['successful_dates'] += 1
                stats = result.get('stats', {})
                summary['total_disclosures'] += stats.get('total', 0)
                summary['successful_uploads'] += stats.get('success', 0)
                summary['failed_uploads'] += stats.get('failed', 0)
            else:
                summary['failed_dates'] += 1
                summary['errors'].append({
                    'date': result.get('date'),
                    'error': result.get('error')
                })
        
        return summary
    
    def run_daily(self, date: str = None):
        """日次処理を実行（スケジューラー用）"""
        logger.info("=== Yuutai Daily Process Started ===")
        
        result = self.process_date(date)
        
        if result['success']:
            stats = result.get('stats', {})
            logger.info(f"Yuutai daily process completed successfully")
            logger.info(f"  Date: {result['date']}")
            logger.info(f"  Total disclosures: {stats.get('total', 0)}")
            logger.info(f"  Successful uploads: {stats.get('success', 0)}")
            logger.info(f"  Failed uploads: {stats.get('failed', 0)}")
        else:
            logger.error(f"Yuutai daily process failed: {result.get('error')}")
        
        logger.info("=== Yuutai Daily Process Finished ===")
        return result
    
    def search_yuutai_keywords(self, keywords: List[str], date: str = None) -> List[Dict]:
        """キーワードによる株主優待開示検索"""
        logger.info(f"Searching yuutai disclosures with keywords: {keywords}")
        
        try:
            # 指定日の開示を取得
            disclosures = self.api_client.get_daily_disclosures(date)
            
            if not disclosures:
                return []
            
            # キーワードマッチングでフィルタリング
            matched_disclosures = []
            for disclosure in disclosures:
                title = disclosure.get('title', '').lower()
                for keyword in keywords:
                    if keyword.lower() in title:
                        matched_disclosures.append(disclosure)
                        break
            
            logger.info(f"Found {len(matched_disclosures)} disclosures matching keywords")
            return matched_disclosures
            
        except Exception as e:
            logger.error(f"Failed to search yuutai keywords: {str(e)}")
            return []
    
    def generate_yuutai_report(self, date: str = None) -> Dict:
        """株主優待開示の日次レポートを生成"""
        if date is None:
            date = datetime.now().strftime('%Y-%m-%d')
        
        logger.info(f"Generating yuutai report for {date}")
        
        try:
            disclosures = self.api_client.get_daily_disclosures(date)
            
            if not disclosures:
                return {
                    'date': date,
                    'total_disclosures': 0,
                    'categories': {},
                    'companies': [],
                    'summary': 'No yuutai disclosures found'
                }
            
            # カテゴリ別集計
            categories = {}
            companies = []
            
            for disclosure in disclosures:
                category = disclosure.get('category', 'その他')
                if category not in categories:
                    categories[category] = 0
                categories[category] += 1
                
                company_info = {
                    'code': disclosure.get('company_code'),
                    'name': disclosure.get('company_name'),
                    'title': disclosure.get('title'),
                    'category': category
                }
                companies.append(company_info)
            
            # サマリー生成
            summary_parts = []
            summary_parts.append(f"合計 {len(disclosures)} 件の株主優待開示")
            
            if categories:
                category_summary = []
                for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
                    category_summary.append(f"{cat}: {count}件")
                summary_parts.append("カテゴリ別: " + ", ".join(category_summary))
            
            report = {
                'date': date,
                'total_disclosures': len(disclosures),
                'categories': categories,
                'companies': companies,
                'summary': "; ".join(summary_parts)
            }
            
            logger.info(f"Generated yuutai report: {report['summary']}")
            return report
            
        except Exception as e:
            logger.error(f"Failed to generate yuutai report: {str(e)}")
            return {
                'date': date,
                'error': str(e)
            }

def main():
    """メイン関数"""
    import argparse
    
    # ログ設定
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f'./logs/yuutai_{datetime.now().strftime("%Y%m%d")}.log'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    parser = argparse.ArgumentParser(description='Yuutai Daily Processor')
    parser.add_argument('--date', help='Process specific date (YYYY-MM-DD)')
    parser.add_argument('--start-date', help='Start date for range processing (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='End date for range processing (YYYY-MM-DD)')
    parser.add_argument('--company', help='Process specific company code')
    parser.add_argument('--days-back', type=int, default=30, help='Days to look back for company processing')
    parser.add_argument('--keywords', nargs='+', help='Search by keywords')
    parser.add_argument('--report', action='store_true', help='Generate daily report')
    parser.add_argument('--test', action='store_true', help='Run in test mode')
    
    args = parser.parse_args()
    
    try:
        processor = YuutaiDailyProcessor()
        
        if args.test:
            # テストモード
            logger.info("Running in test mode...")
            test_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
            result = processor.process_date(test_date)
            logger.info(f"Test result: {result}")
            
        elif args.report:
            # レポート生成
            report = processor.generate_yuutai_report(args.date)
            logger.info(f"Yuutai report: {report}")
            
        elif args.keywords:
            # キーワード検索
            results = processor.search_yuutai_keywords(args.keywords, args.date)
            logger.info(f"Found {len(results)} disclosures matching keywords")
            for result in results:
                logger.info(f"  - {result.get('company_name')} ({result.get('company_code')}): {result.get('title')}")
                
        elif args.company:
            # 企業別処理
            result = processor.process_company_yuutai_history(args.company, args.days_back)
            logger.info(f"Company processing result: {result}")
            
        elif args.start_date:
            # 範囲処理
            results = processor.process_date_range(args.start_date, args.end_date)
            summary = processor.get_processing_summary(results)
            logger.info(f"Range processing summary: {summary}")
            
        elif args.date:
            # 指定日処理
            result = processor.run_daily(args.date)
            
        else:
            # 当日処理
            result = processor.run_daily()
    
    except Exception as e:
        logger.error(f"Process failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()