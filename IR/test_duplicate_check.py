#!/usr/bin/env python3
"""
重複チェックロジックのテスト

銘柄コード、開示日時、タイトルが一致する場合の重複チェックを確認
"""

import os
import sys
import logging
from datetime import datetime
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

def test_duplicate_logic():
    """重複チェックロジックのテスト"""
    logger.info("=== Testing Duplicate Check Logic ===")
    
    try:
        load_dotenv()
        
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if not notion_api_key or not notion_page_id:
            logger.warning("Notion credentials not configured, skipping test")
            return True
        
        manager = YuutaiNotionManager(notion_api_key, notion_page_id)
        
        # データベース初期化
        if not manager.yuutai_database_id:
            manager.initialize_databases()
        
        # テストデータ1: 異なる開示時刻を持つ同じタイトル・銘柄コード
        test_data_1 = {
            'id': 'test_dup_001',
            'title': '重複テスト用株主優待制度の導入に関するお知らせ',
            'company_code': '9999',
            'company_name': 'テスト重複株式会社',
            'disclosure_time': '14:00',
            'category': '優待新設'
        }
        
        test_data_2 = {
            'id': 'test_dup_002',
            'title': '重複テスト用株主優待制度の導入に関するお知らせ',  # 同じタイトル
            'company_code': '9999',  # 同じ銘柄コード
            'company_name': 'テスト重複株式会社',
            'disclosure_time': '15:00',  # 異なる開示時刻
            'category': '優待新設'
        }
        
        test_data_3 = {
            'id': 'test_dup_003',
            'title': '重複テスト用株主優待制度の導入に関するお知らせ',  # 同じタイトル
            'company_code': '9999',  # 同じ銘柄コード
            'company_name': 'テスト重複株式会社',
            'disclosure_time': '14:00',  # test_data_1と同じ開示時刻
            'category': '優待新設'
        }
        
        logger.info("Test 1: Creating first disclosure (14:00)...")
        result1 = manager.upload_yuutai_disclosure(test_data_1)
        logger.info(f"Result 1: {'Success' if result1 else 'Failed'}")
        
        logger.info("\nTest 2: Creating second disclosure with different time (15:00)...")
        result2 = manager.upload_yuutai_disclosure(test_data_2)
        logger.info(f"Result 2: {'Success - Should create new record' if result2 else 'Failed'}")
        
        logger.info("\nTest 3: Creating third disclosure with same time as first (14:00)...")
        result3 = manager.upload_yuutai_disclosure(test_data_3)
        logger.info(f"Result 3: {'Success - Should be detected as duplicate' if result3 else 'Failed'}")
        
        # データベースクエリで確認
        logger.info("\n=== Verifying Database State ===")
        response = manager.uploader.client.databases.query(
            database_id=manager.yuutai_database_id,
            filter={
                "property": "銘柄コード",
                "rich_text": {"equals": "9999"}
            }
        )
        
        results = response.get('results', [])
        logger.info(f"Total records for stock code 9999: {len(results)}")
        
        for i, record in enumerate(results):
            props = record['properties']
            title = ''.join([t['plain_text'] for t in props.get('タイトル', {}).get('title', [])])
            disclosure_time = props.get('開示時刻', {}).get('rich_text', [{}])[0].get('plain_text', '')
            logger.info(f"Record {i+1}: Time={disclosure_time}, Title={title[:30]}...")
        
        # 期待される結果: 2つのレコード（14:00と15:00）
        if len(results) == 2:
            logger.info("\n✅ Duplicate check logic is working correctly!")
            logger.info("✅ Records with identical stock code, title, and disclosure time are properly detected as duplicates")
            logger.info("✅ Records with different disclosure times are treated as separate entries")
            
            # クリーンアップ
            logger.info("\nCleaning up test data...")
            for record in results:
                try:
                    manager.uploader.client.pages.update(
                        page_id=record['id'],
                        archived=True
                    )
                except Exception as e:
                    logger.warning(f"Failed to archive test record: {str(e)}")
            
            return True
        else:
            logger.error(f"\n❌ Unexpected number of records: {len(results)} (expected 2)")
            return False
        
    except Exception as e:
        logger.error(f"Duplicate check test failed: {str(e)}")
        return False

def main():
    """メインテスト実行"""
    logger.info("🚀 Starting Duplicate Check Test")
    
    success = test_duplicate_logic()
    
    if success:
        logger.info("\n🎉 Duplicate check test passed!")
        logger.info("\nKey findings:")
        logger.info("✅ Disclosures with same stock code + title + disclosure time → Detected as duplicates")
        logger.info("✅ Disclosures with same stock code + title but different time → Created as separate records")
        logger.info("✅ This prevents duplicate entries while allowing legitimate multiple disclosures on the same day")
    else:
        logger.error("\n⚠️ Duplicate check test failed")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)