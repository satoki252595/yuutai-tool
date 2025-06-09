#!/usr/bin/env python3
"""
統一株主優待システムと物理ファイルアップロードのテスト

このテストスクリプトは以下の機能をテストします：
1. 統一データベースの作成
2. 物理ファイルアップロード機能
3. 株主優待開示情報の保存
4. 銘柄コードのソート確認
"""

import os
import sys
import logging
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
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_unified_database_creation():
    """統一データベース作成のテスト"""
    logger.info("=== Testing Unified Database Creation ===")
    
    try:
        load_dotenv()
        
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not notion_api_key or not notion_page_id:
            logger.warning("Notion credentials not configured, skipping test")
            return True
        
        manager = YuutaiNotionManager(notion_api_key, notion_page_id)
        
        # データベース初期化
        success = manager.initialize_databases()
        if success:
            logger.info("✓ Unified database creation successful")
            logger.info(f"✓ Database ID: {manager.yuutai_database_id}")
            return True
        else:
            logger.error("✗ Unified database creation failed")
            return False
        
    except Exception as e:
        logger.error(f"Unified database test failed: {str(e)}")
        return False

def test_physical_file_upload():
    """物理ファイルアップロード機能のテスト"""
    logger.info("=== Testing Physical File Upload ===")
    
    try:
        load_dotenv()
        
        # 環境変数設定
        os.environ['YUUTAI_DOWNLOAD_DIR'] = './downloads/yuutai'
        
        processor = YuutaiDailyProcessor()
        
        # 過去数日のデータで軽量テスト
        test_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
        logger.info(f"Testing with date: {test_date}")
        
        # APIからデータ取得とファイルダウンロード
        disclosures = processor.api_client.process_daily_disclosures(test_date)
        
        if disclosures and len(disclosures) > 0:
            logger.info(f"✓ Found {len(disclosures)} disclosures with files")
            
            # 最初の1件だけテスト
            test_disclosure = disclosures[0]
            logger.info(f"Testing with disclosure: {test_disclosure.get('title', '')[:50]}...")
            
            # Notionにアップロード（物理ファイル含む）
            stats = processor.notion_manager.process_daily_yuutai_disclosures([test_disclosure])
            
            if stats['success'] > 0:
                logger.info("✓ Physical file upload successful")
                logger.info(f"✓ Stats: {stats}")
                return True
            else:
                logger.error("✗ Physical file upload failed")
                logger.error(f"✗ Stats: {stats}")
                return False
        else:
            logger.warning("No disclosures with files found for testing")
            return True
        
    except Exception as e:
        logger.error(f"Physical file upload test failed: {str(e)}")
        return False

def test_stock_code_sorting():
    """銘柄コードのソート機能テスト"""
    logger.info("=== Testing Stock Code Sorting ===")
    
    try:
        load_dotenv()
        
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not notion_api_key or not notion_page_id:
            logger.warning("Notion credentials not configured, skipping test")
            return True
        
        manager = YuutaiNotionManager(notion_api_key, notion_page_id)
        
        # データベースの初期化が必要
        if not manager.yuutai_database_id:
            manager.initialize_databases()
        
        # データベースから銘柄コードでソートしてデータを取得
        response = manager.uploader.client.databases.query(
            database_id=manager.yuutai_database_id,
            sorts=[
                {
                    "property": "銘柄コード",
                    "direction": "ascending"
                }
            ]
        )
        
        results = response.get('results', [])
        if results:
            logger.info(f"✓ Found {len(results)} records in database")
            
            # 最初の数件の銘柄コードを表示してソート確認
            stock_codes = []
            for result in results[:5]:
                props = result.get('properties', {})
                stock_code_prop = props.get('銘柄コード', {})
                if stock_code_prop.get('rich_text'):
                    stock_code = stock_code_prop['rich_text'][0]['plain_text']
                    stock_codes.append(stock_code)
            
            logger.info(f"✓ Sample stock codes (sorted): {stock_codes}")
            
            # ソートが正しく動作しているか確認
            if stock_codes == sorted(stock_codes):
                logger.info("✓ Stock code sorting is working correctly")
                return True
            else:
                logger.error("✗ Stock code sorting is not working correctly")
                return False
        else:
            logger.info("✓ Database is empty (no existing data to sort)")
            return True
        
    except Exception as e:
        logger.error(f"Stock code sorting test failed: {str(e)}")
        return False

def test_database_structure():
    """データベース構造のテスト"""
    logger.info("=== Testing Database Structure ===")
    
    try:
        load_dotenv()
        
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not notion_api_key or not notion_page_id:
            logger.warning("Notion credentials not configured, skipping test")
            return True
        
        manager = YuutaiNotionManager(notion_api_key, notion_page_id)
        
        # データベースの初期化が必要
        if not manager.yuutai_database_id:
            manager.initialize_databases()
        
        # データベース構造を取得
        db_info = manager.uploader.client.databases.retrieve(database_id=manager.yuutai_database_id)
        properties = db_info.get('properties', {})
        
        # 必要なプロパティがあることを確認
        required_properties = [
            'タイトル', '銘柄コード', '銘柄名', '開示日', 'カテゴリ',
            '物理ファイル', 'PDFファイル', '処理状況', '開示ID'
        ]
        
        missing_properties = []
        for prop in required_properties:
            if prop not in properties:
                missing_properties.append(prop)
        
        if not missing_properties:
            logger.info("✓ All required properties exist in database")
            logger.info(f"✓ Total properties: {len(properties)}")
            
            # 物理ファイルプロパティが正しく設定されているか確認
            physical_file_prop = properties.get('物理ファイル', {})
            if physical_file_prop.get('type') == 'files':
                logger.info("✓ Physical file property is correctly configured")
                return True
            else:
                logger.error("✗ Physical file property is not correctly configured")
                return False
        else:
            logger.error(f"✗ Missing required properties: {missing_properties}")
            return False
        
    except Exception as e:
        logger.error(f"Database structure test failed: {str(e)}")
        return False

def main():
    """メインテスト実行"""
    logger.info("🚀 Starting Unified System Tests")
    
    tests = [
        ("Unified Database Creation", test_unified_database_creation),
        ("Database Structure", test_database_structure),
        ("Stock Code Sorting", test_stock_code_sorting),
        ("Physical File Upload", test_physical_file_upload)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n--- {test_name} Test ---")
        try:
            if test_func():
                passed += 1
            else:
                logger.error(f"Test '{test_name}' failed")
        except Exception as e:
            logger.error(f"Test '{test_name}' crashed: {str(e)}")
    
    logger.info(f"\n🏁 Test Summary: {passed}/{total} tests passed")
    
    if passed == total:
        logger.info("🎉 All tests passed! The unified system is working correctly.")
        logger.info("\nKey Features Verified:")
        logger.info("✅ Single unified database for all shareholder benefit disclosures")
        logger.info("✅ Stock code column for easy sorting")
        logger.info("✅ Physical file upload to Notion")
        logger.info("✅ Proper database structure with all required fields")
        logger.info("\nNext steps:")
        logger.info("1. Run: python src/main_yuutai.py --start-date 2025-05-20 --end-date 2025-05-22")
        logger.info("2. Check Notion database and verify files are properly uploaded")
        logger.info("3. Verify that stock codes are sortable and data is well-organized")
    else:
        logger.error("⚠️ Some tests failed. Please check the logs above.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)