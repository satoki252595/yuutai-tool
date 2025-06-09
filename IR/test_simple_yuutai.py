#!/usr/bin/env python3
"""
株主優待開示情報管理システム - 簡易テスト

環境設定と基本機能の確認を行う軽量テストスクリプト
"""

import os
import sys
import logging
from dotenv import load_dotenv

# プロジェクトルートをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def test_environment():
    """環境変数のテスト"""
    logger.info("=== Testing Environment Variables ===")
    
    # .envファイルの読み込み
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logger.info(f"✓ .env file found: {env_path}")
    else:
        logger.warning(f"⚠ .env file not found: {env_path}")
    
    # 必要な環境変数のチェック
    required_vars = [
        'NOTION_API_KEY',
        'NOTION_PAGE_ID',
        'YUUTAI_NOTION_PAGE_ID'
    ]
    
    optional_vars = [
        'YUUTAI_DOWNLOAD_DIR',
        'LOG_DIR',
        'YUUTAI_KEYWORDS'
    ]
    
    missing_required = []
    for var in required_vars:
        value = os.getenv(var)
        if value and value != 'your_notion_api_key_here' and value != 'your_notion_page_id_here' and value != 'your_yuutai_notion_page_id_here':
            logger.info(f"✓ {var}: {'*' * 10} (configured)")
        else:
            logger.error(f"✗ {var}: not configured")
            missing_required.append(var)
    
    for var in optional_vars:
        value = os.getenv(var)
        if value:
            logger.info(f"✓ {var}: {value}")
        else:
            logger.info(f"○ {var}: using default")
    
    if missing_required:
        logger.error(f"Missing required environment variables: {missing_required}")
        return False
    
    logger.info("✅ Environment check passed")
    return True

def test_imports():
    """モジュールインポートのテスト"""
    logger.info("=== Testing Module Imports ===")
    
    try:
        # 基本ライブラリ
        import requests
        logger.info("✓ requests imported")
        
        import notion_client
        logger.info("✓ notion_client imported")
        
        # プロジェクトモジュール
        from yuutai.api_client import YuutaiAPIClient
        logger.info("✓ YuutaiAPIClient imported")
        
        from yuutai.notion_manager import YuutaiNotionManager
        logger.info("✓ YuutaiNotionManager imported")
        
        from yuutai.daily_processor import YuutaiDailyProcessor
        logger.info("✓ YuutaiDailyProcessor imported")
        
        logger.info("✅ Import check passed")
        return True
        
    except ImportError as e:
        logger.error(f"✗ Import failed: {str(e)}")
        return False

def test_directory_structure():
    """ディレクトリ構造のテスト"""
    logger.info("=== Testing Directory Structure ===")
    
    base_dir = os.path.dirname(__file__)
    
    required_dirs = [
        'src',
        'src/yuutai',
        'downloads',
        'downloads/yuutai',
        'logs'
    ]
    
    required_files = [
        'src/__init__.py',
        'src/yuutai/__init__.py',
        'src/yuutai/api_client.py',
        'src/yuutai/notion_manager.py',
        'src/yuutai/daily_processor.py',
        'src/notion_uploader.py',
        'src/main_yuutai.py',
        '.env'
    ]
    
    # ディレクトリチェック
    for dir_path in required_dirs:
        full_path = os.path.join(base_dir, dir_path)
        if os.path.exists(full_path) and os.path.isdir(full_path):
            logger.info(f"✓ Directory: {dir_path}")
        else:
            logger.error(f"✗ Missing directory: {dir_path}")
            return False
    
    # ファイルチェック
    for file_path in required_files:
        full_path = os.path.join(base_dir, file_path)
        if os.path.exists(full_path) and os.path.isfile(full_path):
            logger.info(f"✓ File: {file_path}")
        else:
            logger.error(f"✗ Missing file: {file_path}")
            return False
    
    logger.info("✅ Directory structure check passed")
    return True

def test_basic_functionality():
    """基本機能のテスト"""
    logger.info("=== Testing Basic Functionality ===")
    
    try:
        # 環境変数読み込み
        load_dotenv()
        
        # APIクライアントの初期化テスト
        from yuutai.api_client import YuutaiAPIClient
        api_client = YuutaiAPIClient('./downloads/yuutai')
        logger.info("✓ YuutaiAPIClient initialized")
        
        # キーワード判定テスト
        test_titles = [
            "株主優待制度の導入について",
            "決算短信",
            "優待内容の変更について"
        ]
        
        yuutai_count = 0
        for title in test_titles:
            if api_client._is_yuutai_related(title):
                yuutai_count += 1
                logger.info(f"  ✓ Yuutai-related: {title}")
        
        if yuutai_count >= 2:
            logger.info("✓ Keyword detection working")
        else:
            logger.error("✗ Keyword detection failed")
            return False
        
        # Notion接続テスト（軽量）
        notion_api_key = os.getenv('NOTION_API_KEY')
        notion_page_id = os.getenv('YUUTAI_NOTION_PAGE_ID') or os.getenv('NOTION_PAGE_ID')
        
        if notion_api_key and notion_page_id and notion_api_key != 'your_notion_api_key_here':
            from yuutai.notion_manager import YuutaiNotionManager
            notion_manager = YuutaiNotionManager(notion_api_key, notion_page_id)
            logger.info("✓ YuutaiNotionManager initialized")
            
            # 銘柄コード検証テスト
            test_codes = ["7203", "invalid"]
            if notion_manager._validate_stock_code("7203") and not notion_manager._validate_stock_code("invalid"):
                logger.info("✓ Stock code validation working")
            else:
                logger.error("✗ Stock code validation failed")
                return False
        else:
            logger.info("○ Notion test skipped (credentials not configured)")
        
        logger.info("✅ Basic functionality check passed")
        return True
        
    except Exception as e:
        logger.error(f"✗ Basic functionality test failed: {str(e)}")
        return False

def test_configuration():
    """設定ファイルのテスト"""
    logger.info("=== Testing Configuration ===")
    
    try:
        # .envファイルの内容確認
        env_path = os.path.join(os.path.dirname(__file__), '.env')
        
        if not os.path.exists(env_path):
            logger.error("✗ .env file not found")
            return False
        
        with open(env_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 必要な設定項目の確認
        required_settings = [
            'NOTION_API_KEY',
            'NOTION_PAGE_ID',
            'YUUTAI_NOTION_PAGE_ID',
            'YUUTAI_DOWNLOAD_DIR',
            'YUUTAI_KEYWORDS'
        ]
        
        missing_settings = []
        for setting in required_settings:
            if setting not in content:
                missing_settings.append(setting)
            else:
                logger.info(f"✓ {setting} found in .env")
        
        if missing_settings:
            logger.error(f"✗ Missing settings in .env: {missing_settings}")
            return False
        
        logger.info("✅ Configuration check passed")
        return True
        
    except Exception as e:
        logger.error(f"✗ Configuration test failed: {str(e)}")
        return False

def main():
    """メインテスト実行"""
    logger.info("🚀 Starting Simple Yuutai System Test")
    
    tests = [
        ("Environment Variables", test_environment),
        ("Directory Structure", test_directory_structure),
        ("Configuration", test_configuration),
        ("Module Imports", test_imports),
        ("Basic Functionality", test_basic_functionality)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        logger.info(f"\n--- {test_name} ---")
        try:
            if test_func():
                passed += 1
            else:
                logger.error(f"Test '{test_name}' failed")
        except Exception as e:
            logger.error(f"Test '{test_name}' crashed: {str(e)}")
    
    logger.info(f"\n🏁 Test Summary: {passed}/{total} tests passed")
    
    if passed == total:
        logger.info("🎉 All basic tests passed! System appears to be properly configured.")
        logger.info("\nNext steps:")
        logger.info("1. Configure your .env file with actual Notion credentials")
        logger.info("2. Run the full test: python test_yuutai_functionality.py")
        logger.info("3. Try a simple execution: python src/main_yuutai.py --test")
    else:
        logger.error("⚠️  Some tests failed. Please fix the issues before proceeding.")
        logger.info("\nCommon fixes:")
        logger.info("- Install required packages: pip install requests notion-client python-dotenv")
        logger.info("- Configure .env file with proper Notion credentials")
        logger.info("- Ensure all source files are present in src/ directory")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)