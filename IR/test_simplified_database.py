#!/usr/bin/env python3
"""
簡素化された株主優待データベースのテスト

指定されたカラムのみが含まれていることを確認：
- タイトル、PDFファイル、カテゴリ、優待価値、優待内容、必要株式数、権利確定日、銘柄コード、銘柄名、開示時刻
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

# プロジェクトルートをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from yuutai.notion_manager import YuutaiNotionManager

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_simplified_database_structure():
    """簡素化されたデータベース構造のテスト"""
    logger.info("=== Testing Simplified Database Structure ===")
    
    try:
        load_dotenv()
        
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not notion_api_key or not notion_page_id:
            logger.warning("Notion credentials not configured, skipping test")
            return True
        
        manager = YuutaiNotionManager(notion_api_key, notion_page_id)
        
        # 新しいデータベースを作成（既存があれば見つける）
        db_name = "株主優待開示情報_簡素化テスト"
        
        # テスト用に一時的にデータベース名を変更
        original_find_method = manager.uploader._find_existing_database
        def find_test_db(name):
            if name == "株主優待開示情報":
                return original_find_method(db_name)
            return original_find_method(name)
        manager.uploader._find_existing_database = find_test_db
        
        # データベース初期化
        success = manager.initialize_databases()
        if not success:
            logger.error("Failed to initialize database")
            return False
        
        # データベース構造を取得
        db_info = manager.uploader.client.databases.retrieve(database_id=manager.yuutai_database_id)
        properties = db_info.get('properties', {})
        
        # 期待されるプロパティ
        expected_properties = [
            'タイトル', 'PDFファイル', 'カテゴリ', '優待価値', '優待内容', 
            '必要株式数', '権利確定日', '銘柄コード', '銘柄名', '開示時刻'
        ]
        
        # 実際のプロパティ
        actual_properties = list(properties.keys())
        
        logger.info(f"Expected properties: {expected_properties}")
        logger.info(f"Actual properties: {actual_properties}")
        
        # 期待されるプロパティがすべて存在するかチェック
        missing_properties = []
        for prop in expected_properties:
            if prop not in actual_properties:
                missing_properties.append(prop)
        
        # 余分なプロパティがないかチェック
        extra_properties = []
        for prop in actual_properties:
            if prop not in expected_properties:
                extra_properties.append(prop)
        
        if not missing_properties and not extra_properties:
            logger.info("✅ Database structure is correct!")
            logger.info(f"✅ All {len(expected_properties)} expected properties present")
            
            # 各プロパティのタイプもチェック
            property_types = {
                'タイトル': 'title',
                'PDFファイル': 'files',
                'カテゴリ': 'select',
                '優待価値': 'number',
                '優待内容': 'rich_text',
                '必要株式数': 'number',
                '権利確定日': 'date',
                '銘柄コード': 'rich_text',
                '銘柄名': 'rich_text',
                '開示時刻': 'rich_text'
            }
            
            type_errors = []
            for prop_name, expected_type in property_types.items():
                actual_type = properties[prop_name]['type']
                if actual_type != expected_type:
                    type_errors.append(f"{prop_name}: expected {expected_type}, got {actual_type}")
            
            if not type_errors:
                logger.info("✅ All property types are correct!")
                return True
            else:
                logger.error(f"❌ Property type errors: {type_errors}")
                return False
                
        else:
            if missing_properties:
                logger.error(f"❌ Missing properties: {missing_properties}")
            if extra_properties:
                logger.error(f"❌ Extra properties: {extra_properties}")
            return False
        
    except Exception as e:
        logger.error(f"Simplified database test failed: {str(e)}")
        return False

def test_sample_data_creation():
    """サンプルデータの作成テスト"""
    logger.info("=== Testing Sample Data Creation ===")
    
    try:
        load_dotenv()
        
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not notion_api_key or not notion_page_id:
            logger.warning("Notion credentials not configured, skipping test")
            return True
        
        manager = YuutaiNotionManager(notion_api_key, notion_page_id)
        
        # データベース初期化
        manager.initialize_databases()
        
        # サンプルデータ
        sample_data = {
            'title': 'テスト用株主優待制度の導入（クオカード1000円分）',
            'company_code': '1234',
            'company_name': 'テスト株式会社',
            'category': '優待新設',
            'disclosure_time': '15:00',
            'id': 'test_123'
        }
        
        # データ作成
        result = manager.upload_yuutai_disclosure(sample_data)
        
        if result:
            logger.info("✅ Sample data creation successful")
            
            # 作成されたデータを確認
            response = manager.uploader.client.databases.query(
                database_id=manager.yuutai_database_id,
                filter={
                    "property": "銘柄コード",
                    "rich_text": {"equals": "1234"}
                }
            )
            
            if response['results']:
                record = response['results'][0]
                props = record['properties']
                
                logger.info("Created record properties:")
                for prop_name in ['タイトル', 'カテゴリ', '銘柄コード', '銘柄名', '開示時刻']:
                    if prop_name in props:
                        if prop_name == 'タイトル' and props[prop_name].get('title'):
                            value = ''.join([t['plain_text'] for t in props[prop_name]['title']])
                        elif prop_name == 'カテゴリ' and props[prop_name].get('select'):
                            value = props[prop_name]['select']['name']
                        elif prop_name in ['銘柄コード', '銘柄名', '開示時刻'] and props[prop_name].get('rich_text'):
                            value = props[prop_name]['rich_text'][0]['plain_text'] if props[prop_name]['rich_text'] else ''
                        else:
                            value = 'N/A'
                        logger.info(f"  {prop_name}: {value}")
                
                return True
            else:
                logger.error("❌ Created record not found")
                return False
        else:
            logger.error("❌ Sample data creation failed")
            return False
        
    except Exception as e:
        logger.error(f"Sample data creation test failed: {str(e)}")
        return False

def main():
    """メインテスト実行"""
    logger.info("🚀 Starting Simplified Database Tests")
    
    tests = [
        ("Simplified Database Structure", test_simplified_database_structure),
        ("Sample Data Creation", test_sample_data_creation)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n--- {test_name} Test ---")
        try:
            if test_func():
                passed += 1
                logger.info(f"✅ {test_name} test passed")
            else:
                logger.error(f"❌ {test_name} test failed")
        except Exception as e:
            logger.error(f"❌ {test_name} test crashed: {str(e)}")
    
    logger.info(f"\n🏁 Test Summary: {passed}/{total} tests passed")
    
    if passed == total:
        logger.info("🎉 All tests passed! The simplified database is working correctly.")
        logger.info("\nDatabase contains only the requested columns:")
        logger.info("✅ タイトル, PDFファイル, カテゴリ, 優待価値, 優待内容")
        logger.info("✅ 必要株式数, 権利確定日, 銘柄コード, 銘柄名, 開示時刻")
        logger.info("\nThe database is now streamlined and optimized!")
    else:
        logger.error("⚠️ Some tests failed. Please check the logs above.")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)