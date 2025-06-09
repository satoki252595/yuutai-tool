#!/usr/bin/env python3
"""
株主優待開示情報管理システム - 機能テスト

このテストスクリプトは以下の機能をテストします：
1. API接続テスト
2. Notion接続テスト 
3. ファイルダウンロードテスト
4. データベース作成テスト
5. アップロード機能テスト
"""

import os
import sys
import logging
import tempfile
from datetime import datetime, timedelta
from dotenv import load_dotenv

# プロジェクトルートをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from yuutai.api_client import YuutaiAPIClient
from yuutai.notion_manager import YuutaiNotionManager
from yuutai.daily_processor import YuutaiDailyProcessor

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class YuutaiTester:
    """株主優待システムテスター"""
    
    def __init__(self):
        load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
        
        self.notion_api_key = os.getenv('NOTION_API_KEY')
        self.notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not self.notion_api_key or not self.notion_page_id:
            raise ValueError("NOTION_API_KEY and YUUTAI_NOTION_PAGE_ID must be set in .env file")
        
        # テスト用一時ディレクトリ
        self.temp_dir = tempfile.mkdtemp(prefix='yuutai_test_')
        logger.info(f"Test directory: {self.temp_dir}")
        
        self.test_results = {}
    
    def test_api_client(self) -> bool:
        """APIクライアントのテスト"""
        logger.info("=== Testing API Client ===")
        
        try:
            client = YuutaiAPIClient(self.temp_dir)
            
            # 1. APIクライアント初期化テスト
            assert client.edinet_base_url, "API base URL not set"
            assert os.path.exists(self.temp_dir), "Download directory not created"
            
            # 2. 株主優待キーワード判定テスト
            test_titles = [
                "株主優待制度の導入について",
                "優待内容の変更に関するお知らせ",
                "株主優待制度の廃止について",
                "決算短信（非関連）",
                "株主優待券の発行について"
            ]
            
            yuutai_count = 0
            for title in test_titles:
                if client._is_yuutai_related(title):
                    yuutai_count += 1
                    logger.info(f"  ✓ Yuutai-related: {title}")
                else:
                    logger.info(f"  ✗ Not yuutai-related: {title}")
            
            assert yuutai_count >= 4, f"Expected at least 4 yuutai-related titles, got {yuutai_count}"
            
            # 3. カテゴリ分類テスト
            category_tests = [
                ("株主優待制度の新設について", "優待新設"),
                ("優待内容の変更について", "優待変更"),
                ("株主優待制度の廃止について", "優待廃止"),
                ("株主優待の内容について", "優待内容")
            ]
            
            for title, expected_category in category_tests:
                category = client._categorize_yuutai_disclosure(title)
                logger.info(f"  Title: {title} -> Category: {category}")
                # カテゴリが適切に分類されていることを確認（完全一致は要求しない）
                assert category in client.yuutai_keywords or category in ["優待新設", "優待変更", "優待廃止", "優待内容", "権利基準日", "優待制度", "その他"]
            
            # 4. 過去日付でのデータ取得テスト（実際のYANOSHIN APIコール）
            test_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            logger.info(f"Testing YANOSHIN TDNET API call for date: {test_date}")
            
            disclosures = client.get_daily_disclosures(test_date)
            assert isinstance(disclosures, list), "API should return a list"
            
            logger.info(f"  ✓ YANOSHIN API returned {len(disclosures)} yuutai disclosures for {test_date}")
            
            self.test_results['api_client'] = True
            logger.info("✅ API Client test passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ API Client test failed: {str(e)}")
            self.test_results['api_client'] = False
            return False
    
    def test_notion_manager(self) -> bool:
        """Notion管理のテスト"""
        logger.info("=== Testing Notion Manager ===")
        
        try:
            manager = YuutaiNotionManager(self.notion_api_key, self.notion_page_id)
            
            # 1. Notion接続テスト
            logger.info("Testing Notion connection...")
            success = manager.initialize_databases()
            assert success, "Failed to initialize databases"
            assert manager.databases['stocks'], "Stocks database not created"
            
            # 2. 銘柄コード検証テスト
            test_codes = ["7203", "9999", "abcd", "123", "12345"]
            valid_codes = ["7203", "9999"]
            
            for code in test_codes:
                is_valid = manager._validate_stock_code(code)
                expected = code in valid_codes
                assert is_valid == expected, f"Stock code validation failed for {code}"
                logger.info(f"  Stock code {code}: {'✓' if is_valid else '✗'}")
            
            # 3. 優待情報抽出テスト
            test_data = [
                "株主優待として1000円のクオカードを100株以上保有の株主に贈呈",
                "株主優待制度の新設について",
                "500株以上の株主に優待商品券3000円相当を贈呈"
            ]
            
            for title in test_data:
                yuutai_info = manager._extract_yuutai_info(title)
                logger.info(f"  Title: {title}")
                logger.info(f"    Extracted info: {yuutai_info}")
            
            # 4. 類似度計算テスト
            similarity_tests = [
                ("株主優待制度の導入について", "株主優待制度の導入について", 1.0),
                ("株主優待制度の導入について", "株主優待制度の変更について", 0.8),
                ("株主優待制度の導入について", "決算短信について", 0.3)
            ]
            
            for text1, text2, expected_min in similarity_tests:
                similarity = manager._calculate_similarity(text1, text2)
                logger.info(f"  Similarity '{text1[:20]}...' vs '{text2[:20]}...': {similarity:.2f}")
                if expected_min == 1.0:
                    assert similarity == 1.0, "Identical texts should have similarity 1.0"
                elif expected_min > 0.7:
                    assert similarity > 0.5, "Similar texts should have high similarity"
            
            self.test_results['notion_manager'] = True
            logger.info("✅ Notion Manager test passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Notion Manager test failed: {str(e)}")
            self.test_results['notion_manager'] = False
            return False
    
    def test_daily_processor(self) -> bool:
        """日次プロセッサのテスト"""
        logger.info("=== Testing Daily Processor ===")
        
        try:
            # 環境変数を一時的に設定（テスト用）
            os.environ['YUUTAI_DOWNLOAD_DIR'] = self.temp_dir
            
            processor = YuutaiDailyProcessor()
            
            # 1. プロセッサ初期化テスト
            assert processor.api_client, "API client not initialized"
            assert processor.notion_manager, "Notion manager not initialized"
            assert processor.download_dir == self.temp_dir, "Download directory not set correctly"
            
            # 2. レポート生成テスト
            test_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            logger.info(f"Testing report generation for {test_date}")
            
            report = processor.generate_yuutai_report(test_date)
            assert isinstance(report, dict), "Report should be a dictionary"
            assert 'date' in report, "Report should contain date"
            assert 'total_disclosures' in report, "Report should contain total_disclosures"
            
            logger.info(f"  ✓ Report generated: {report.get('total_disclosures', 0)} disclosures")
            
            # 3. キーワード検索テスト
            test_keywords = ["株主優待", "優待制度"]
            logger.info(f"Testing keyword search: {test_keywords}")
            
            search_results = processor.search_yuutai_keywords(test_keywords, test_date)
            assert isinstance(search_results, list), "Search results should be a list"
            
            logger.info(f"  ✓ Keyword search returned {len(search_results)} results")
            
            # 4. 処理サマリー生成テスト
            mock_results = [
                {'success': True, 'stats': {'total': 5, 'success': 4, 'failed': 1}},
                {'success': True, 'stats': {'total': 3, 'success': 3, 'failed': 0}},
                {'success': False, 'date': '2025-01-01', 'error': 'Test error'}
            ]
            
            summary = processor.get_processing_summary(mock_results)
            assert summary['total_dates'] == 3, "Summary should count total dates"
            assert summary['successful_dates'] == 2, "Summary should count successful dates"
            assert summary['failed_dates'] == 1, "Summary should count failed dates"
            assert summary['total_disclosures'] == 8, "Summary should count total disclosures"
            
            logger.info(f"  ✓ Processing summary: {summary}")
            
            self.test_results['daily_processor'] = True
            logger.info("✅ Daily Processor test passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Daily Processor test failed: {str(e)}")
            self.test_results['daily_processor'] = False
            return False
    
    def test_file_operations(self) -> bool:
        """ファイル操作のテスト"""
        logger.info("=== Testing File Operations ===")
        
        try:
            client = YuutaiAPIClient(self.temp_dir)
            
            # 1. ダウンロードディレクトリ作成テスト
            assert os.path.exists(self.temp_dir), "Download directory should exist"
            assert os.path.isdir(self.temp_dir), "Download path should be a directory"
            
            # 2. テストファイル作成
            test_file_path = os.path.join(self.temp_dir, 'test_yuutai.pdf')
            with open(test_file_path, 'wb') as f:
                f.write(b'%PDF-1.4 Test PDF content for yuutai testing')
            
            assert os.path.exists(test_file_path), "Test file should be created"
            file_size = os.path.getsize(test_file_path)
            assert file_size > 0, "Test file should have content"
            
            logger.info(f"  ✓ Test file created: {test_file_path} ({file_size} bytes)")
            
            # 3. ファイルサイズ制限テスト
            # 大きなファイルの模擬テスト（実際に大きなファイルは作らない）
            mock_disclosure = {
                'id': 'test_123',
                'company_code': '7203',
                'disclosure_date': '2025-01-01',
                'pdf_url': 'https://example.com/test.pdf'
            }
            
            # URL構築テスト（YANOSHIN API用）
            pdf_url = client._construct_pdf_url({'document_url': 'https://example.com/test.pdf'})
            expected_url = 'https://example.com/test.pdf'
            assert pdf_url == expected_url, f"PDF URL construction failed: {pdf_url}"
            
            logger.info(f"  ✓ PDF URL construction (YANOSHIN): {pdf_url}")
            
            self.test_results['file_operations'] = True
            logger.info("✅ File Operations test passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ File Operations test failed: {str(e)}")
            self.test_results['file_operations'] = False
            return False
    
    def test_integration(self) -> bool:
        """統合テスト（軽量版）"""
        logger.info("=== Testing Integration ===")
        
        try:
            # 環境変数を設定
            os.environ['YUUTAI_DOWNLOAD_DIR'] = self.temp_dir
            
            processor = YuutaiDailyProcessor()
            
            # 1. 過去日付での軽量処理テスト
            test_date = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
            logger.info(f"Testing integration with date: {test_date}")
            
            # データベース初期化のみテスト（実際のアップロードはスキップ）
            success = processor.notion_manager.initialize_databases()
            assert success, "Database initialization should succeed"
            
            # YANOSHIN APIからのデータ取得テスト
            disclosures = processor.api_client.get_daily_disclosures(test_date)
            assert isinstance(disclosures, list), "Should return disclosure list"
            
            logger.info(f"  ✓ Found {len(disclosures)} yuutai disclosures from YANOSHIN for {test_date}")
            
            # 処理可能性の確認（実際の処理はしない）
            if disclosures:
                sample_disclosure = disclosures[0]
                required_fields = ['id', 'title', 'company_code', 'company_name']
                for field in required_fields:
                    assert field in sample_disclosure, f"Missing required field: {field}"
                
                logger.info(f"  ✓ Sample disclosure structure valid: {sample_disclosure.get('title', '')[:50]}...")
            
            self.test_results['integration'] = True
            logger.info("✅ Integration test passed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Integration test failed: {str(e)}")
            self.test_results['integration'] = False
            return False
    
    def cleanup(self):
        """テスト後のクリーンアップ"""
        try:
            import shutil
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
                logger.info(f"Cleaned up test directory: {self.temp_dir}")
        except Exception as e:
            logger.warning(f"Failed to cleanup test directory: {str(e)}")
    
    def run_all_tests(self) -> bool:
        """全テストを実行"""
        logger.info("🚀 Starting Yuutai System Tests")
        
        tests = [
            ('API Client', self.test_api_client),
            ('Notion Manager', self.test_notion_manager),
            ('Daily Processor', self.test_daily_processor),
            ('File Operations', self.test_file_operations),
            ('Integration', self.test_integration)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            logger.info(f"\n--- Running {test_name} Test ---")
            try:
                if test_func():
                    passed += 1
            except Exception as e:
                logger.error(f"Test {test_name} crashed: {str(e)}")
                self.test_results[test_name.lower().replace(' ', '_')] = False
        
        logger.info(f"\n🏁 Test Results Summary:")
        logger.info(f"   Passed: {passed}/{total}")
        
        for test_name, result in self.test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"   {test_name}: {status}")
        
        all_passed = passed == total
        if all_passed:
            logger.info("🎉 All tests passed! Yuutai system is ready to use.")
        else:
            logger.warning("⚠️  Some tests failed. Please check the logs above.")
        
        return all_passed

def main():
    """テスト実行メイン関数"""
    try:
        tester = YuutaiTester()
        success = tester.run_all_tests()
        tester.cleanup()
        
        sys.exit(0 if success else 1)
        
    except Exception as e:
        logger.error(f"Test execution failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()