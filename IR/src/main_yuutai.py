#!/usr/bin/env python3
"""
株主優待開示情報管理システム - メイン実行スクリプト

このスクリプトは株主優待関連の適時開示情報を自動収集し、
Notionデータベースに整理して保存するシステムです。

機能:
- EDINETから株主優待関連開示の自動取得
- 3階層Notionデータベースでの整理・保存
- 重複チェック機能
- 日次・範囲・企業別処理
- レポート生成

使用例:
python src/main_yuutai.py                    # 当日処理
python src/main_yuutai.py --date 2025-01-01  # 指定日処理
python src/main_yuutai.py --company 7201     # 企業別処理
python src/main_yuutai.py --report           # レポート生成
"""

import os
import sys
import logging
import argparse
import schedule
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dotenv import load_dotenv

# プロジェクトルートをパスに追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from yuutai.daily_processor import YuutaiDailyProcessor

# ログ設定
def setup_logging(log_level: str = 'INFO'):
    """ログ設定を初期化"""
    log_dir = os.getenv('LOG_DIR', './logs')
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f'yuutai_main_{datetime.now().strftime("%Y%m%d")}.log')
    
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )

logger = logging.getLogger(__name__)

class YuutaiMainProcessor:
    """株主優待開示情報管理システム メインプロセッサ"""
    
    def __init__(self):
        # 環境変数読み込み
        load_dotenv()
        
        # 必要な環境変数チェック
        required_vars = ['NOTION_API_KEY']
        missing_vars = [var for var in required_vars if not os.getenv(var)]
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {missing_vars}")
        
        self.processor = YuutaiDailyProcessor()
        logger.info("Yuutai Main Processor initialized")
    
    def run_daily_process(self, date: str = None) -> Dict:
        """日次処理を実行"""
        logger.info("=== Starting Yuutai Daily Process ===")
        
        try:
            result = self.processor.run_daily(date)
            
            if result['success']:
                logger.info("Daily process completed successfully")
                self._log_process_summary(result)
            else:
                logger.error(f"Daily process failed: {result.get('error')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Daily process exception: {str(e)}")
            return {'success': False, 'error': str(e)}
        finally:
            logger.info("=== Yuutai Daily Process Completed ===")
    
    def run_range_process(self, start_date: str, end_date: str = None) -> List[Dict]:
        """範囲処理を実行"""
        logger.info(f"=== Starting Yuutai Range Process: {start_date} to {end_date or start_date} ===")
        
        try:
            results = self.processor.process_date_range(start_date, end_date)
            summary = self.processor.get_processing_summary(results)
            
            logger.info("Range process completed")
            self._log_range_summary(summary)
            
            return results
            
        except Exception as e:
            logger.error(f"Range process exception: {str(e)}")
            return []
        finally:
            logger.info("=== Yuutai Range Process Completed ===")
    
    def run_company_process(self, company_code: str, days_back: int = 30) -> Dict:
        """企業別処理を実行"""
        logger.info(f"=== Starting Yuutai Company Process: {company_code} ===")
        
        try:
            result = self.processor.process_company_yuutai_history(company_code, days_back)
            
            if result['success']:
                logger.info(f"Company process completed successfully for {company_code}")
                self._log_process_summary(result)
            else:
                logger.error(f"Company process failed for {company_code}: {result.get('error')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Company process exception: {str(e)}")
            return {'success': False, 'error': str(e)}
        finally:
            logger.info("=== Yuutai Company Process Completed ===")
    
    def run_keyword_search(self, keywords: List[str], date: str = None) -> List[Dict]:
        """キーワード検索を実行"""
        logger.info(f"=== Starting Yuutai Keyword Search: {keywords} ===")
        
        try:
            results = self.processor.search_yuutai_keywords(keywords, date)
            
            logger.info(f"Found {len(results)} disclosures matching keywords")
            for result in results:
                logger.info(f"  - {result.get('company_name')} ({result.get('company_code')}): {result.get('title')[:100]}...")
            
            return results
            
        except Exception as e:
            logger.error(f"Keyword search exception: {str(e)}")
            return []
        finally:
            logger.info("=== Yuutai Keyword Search Completed ===")
    
    def generate_report(self, date: str = None) -> Dict:
        """レポートを生成"""
        logger.info(f"=== Generating Yuutai Report for {date or 'today'} ===")
        
        try:
            report = self.processor.generate_yuutai_report(date)
            
            if 'error' not in report:
                logger.info("Report generated successfully")
                self._log_report_summary(report)
            else:
                logger.error(f"Report generation failed: {report['error']}")
            
            return report
            
        except Exception as e:
            logger.error(f"Report generation exception: {str(e)}")
            return {'error': str(e)}
        finally:
            logger.info("=== Yuutai Report Generation Completed ===")
    
    def run_scheduled_process(self, schedule_time: str = "09:00"):
        """スケジュール実行"""
        logger.info(f"Setting up scheduled execution at {schedule_time}")
        
        def job():
            logger.info("Executing scheduled yuutai process")
            self.run_daily_process()
        
        schedule.every().day.at(schedule_time).do(job)
        
        logger.info("Yuutai scheduler started. Press Ctrl+C to stop.")
        
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)  # 1分間隔でチェック
        except KeyboardInterrupt:
            logger.info("Yuutai scheduler stopped by user")
    
    def _log_process_summary(self, result: Dict):
        """処理結果のサマリーをログ出力"""
        if 'stats' in result:
            stats = result['stats']
            logger.info(f"Process Summary:")
            logger.info(f"  Date: {result.get('date', 'Unknown')}")
            logger.info(f"  Total disclosures: {stats.get('total', 0)}")
            logger.info(f"  Successful uploads: {stats.get('success', 0)}")
            logger.info(f"  Failed uploads: {stats.get('failed', 0)}")
            logger.info(f"  Skipped: {stats.get('skipped', 0)}")
            logger.info(f"  Duplicates: {stats.get('duplicates', 0)}")
    
    def _log_range_summary(self, summary: Dict):
        """範囲処理結果のサマリーをログ出力"""
        logger.info(f"Range Process Summary:")
        logger.info(f"  Total dates processed: {summary.get('total_dates', 0)}")
        logger.info(f"  Successful dates: {summary.get('successful_dates', 0)}")
        logger.info(f"  Failed dates: {summary.get('failed_dates', 0)}")
        logger.info(f"  Total disclosures: {summary.get('total_disclosures', 0)}")
        logger.info(f"  Successful uploads: {summary.get('successful_uploads', 0)}")
        logger.info(f"  Failed uploads: {summary.get('failed_uploads', 0)}")
        
        if summary.get('errors'):
            logger.warning("Errors encountered:")
            for error in summary['errors']:
                logger.warning(f"  {error.get('date')}: {error.get('error')}")
    
    def _log_report_summary(self, report: Dict):
        """レポートのサマリーをログ出力"""
        logger.info(f"Report Summary:")
        logger.info(f"  Date: {report.get('date', 'Unknown')}")
        logger.info(f"  Total disclosures: {report.get('total_disclosures', 0)}")
        
        if report.get('categories'):
            logger.info("  Categories:")
            for category, count in report['categories'].items():
                logger.info(f"    {category}: {count} disclosures")
        
        if report.get('summary'):
            logger.info(f"  Summary: {report['summary']}")

def main():
    """メイン実行関数"""
    parser = argparse.ArgumentParser(
        description='株主優待開示情報管理システム',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  %(prog)s                                    # 当日の株主優待開示を処理
  %(prog)s --date 2025-01-01                  # 指定日の開示を処理
  %(prog)s --start-date 2025-01-01 --end-date 2025-01-03  # 期間指定処理
  %(prog)s --company 7201                     # 企業別処理
  %(prog)s --keywords 株主優待 新設            # キーワード検索
  %(prog)s --report                          # 日次レポート生成
  %(prog)s --schedule --time 09:00           # スケジュール実行
        """
    )
    
    # 基本オプション
    parser.add_argument('--date', help='処理対象日 (YYYY-MM-DD)')
    parser.add_argument('--start-date', help='範囲処理開始日 (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='範囲処理終了日 (YYYY-MM-DD)')
    
    # 特別処理
    parser.add_argument('--company', help='企業コード指定処理')
    parser.add_argument('--days-back', type=int, default=30, help='企業処理の遡及日数 (デフォルト: 30)')
    parser.add_argument('--keywords', nargs='+', help='キーワード検索')
    parser.add_argument('--report', action='store_true', help='日次レポート生成')
    
    # スケジュール実行
    parser.add_argument('--schedule', action='store_true', help='スケジュール実行モード')
    parser.add_argument('--time', default='09:00', help='スケジュール実行時刻 (HH:MM)')
    
    # その他オプション
    parser.add_argument('--test', action='store_true', help='テストモード（前日データで実行）')
    parser.add_argument('--log-level', default='INFO', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], help='ログレベル')
    parser.add_argument('--dry-run', action='store_true', help='ドライラン（実際のアップロードは行わない）')
    
    args = parser.parse_args()
    
    # ログ設定
    setup_logging(args.log_level)
    
    try:
        # メインプロセッサ初期化
        main_processor = YuutaiMainProcessor()
        
        if args.dry_run:
            logger.info("=== DRY RUN MODE ===")
            # ドライランの場合は実際の処理は行わない
            logger.info("Dry run mode - no actual processing will be performed")
            return
        
        # 処理モード判定・実行
        if args.test:
            logger.info("=== TEST MODE ===")
            test_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
            result = main_processor.run_daily_process(test_date)
            
        elif args.schedule:
            logger.info("=== SCHEDULE MODE ===")
            main_processor.run_scheduled_process(args.time)
            
        elif args.report:
            logger.info("=== REPORT MODE ===")
            report = main_processor.generate_report(args.date)
            
        elif args.keywords:
            logger.info("=== KEYWORD SEARCH MODE ===")
            results = main_processor.run_keyword_search(args.keywords, args.date)
            
        elif args.company:
            logger.info("=== COMPANY MODE ===")
            result = main_processor.run_company_process(args.company, args.days_back)
            
        elif args.start_date:
            logger.info("=== RANGE MODE ===")
            results = main_processor.run_range_process(args.start_date, args.end_date)
            
        elif args.date:
            logger.info("=== DATE MODE ===")
            result = main_processor.run_daily_process(args.date)
            
        else:
            logger.info("=== DAILY MODE ===")
            result = main_processor.run_daily_process()
        
        logger.info("=== ALL PROCESSES COMPLETED ===")
        
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Main process failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()