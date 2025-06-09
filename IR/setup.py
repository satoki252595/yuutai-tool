#!/usr/bin/env python3
"""
株主優待開示情報管理システム - セットアップスクリプト

このスクリプトは初回セットアップを自動化します。
"""

import os
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def install_requirements():
    """必要パッケージのインストール"""
    logger.info("Installing required packages...")
    
    requirements_file = os.path.join(os.path.dirname(__file__), 'requirements.txt')
    
    try:
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', '-r', requirements_file
        ])
        logger.info("✅ Packages installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Failed to install packages: {e}")
        return False

def create_directories():
    """必要ディレクトリの作成"""
    logger.info("Creating directories...")
    
    base_dir = os.path.dirname(__file__)
    directories = [
        'downloads/yuutai',
        'logs'
    ]
    
    for dir_path in directories:
        full_path = os.path.join(base_dir, dir_path)
        try:
            os.makedirs(full_path, exist_ok=True)
            logger.info(f"✅ Created directory: {dir_path}")
        except Exception as e:
            logger.error(f"❌ Failed to create directory {dir_path}: {e}")
            return False
    
    return True

def setup_env_file():
    """環境設定ファイルの確認"""
    logger.info("Checking environment file...")
    
    base_dir = os.path.dirname(__file__)
    env_file = os.path.join(base_dir, '.env')
    
    if os.path.exists(env_file):
        logger.info("✅ .env file already exists")
        
        # 設定内容の確認
        with open(env_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if 'your_notion_api_key_here' in content:
            logger.warning("⚠️  Please configure your .env file with actual Notion credentials")
            return False
        else:
            logger.info("✅ .env file appears to be configured")
            return True
    else:
        logger.warning("⚠️  .env file not found. Please create it based on the template in README.md")
        return False

def run_tests():
    """基本テストの実行"""
    logger.info("Running basic tests...")
    
    base_dir = os.path.dirname(__file__)
    test_script = os.path.join(base_dir, 'test_simple_yuutai.py')
    
    try:
        result = subprocess.run([sys.executable, test_script], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            logger.info("✅ Basic tests passed")
            return True
        else:
            logger.error("❌ Basic tests failed")
            logger.error(result.stdout)
            logger.error(result.stderr)
            return False
    except Exception as e:
        logger.error(f"❌ Failed to run tests: {e}")
        return False

def main():
    """メインセットアップ処理"""
    logger.info("🚀 Starting Yuutai System Setup")
    
    steps = [
        ("Installing packages", install_requirements),
        ("Creating directories", create_directories),
        ("Checking environment", setup_env_file),
        ("Running tests", run_tests)
    ]
    
    completed = 0
    total = len(steps)
    
    for step_name, step_func in steps:
        logger.info(f"\n--- {step_name} ---")
        try:
            if step_func():
                completed += 1
            else:
                logger.error(f"Step '{step_name}' failed")
        except Exception as e:
            logger.error(f"Step '{step_name}' crashed: {e}")
    
    logger.info(f"\n🏁 Setup Summary: {completed}/{total} steps completed")
    
    if completed == total:
        logger.info("🎉 Setup completed successfully!")
        logger.info("\nNext steps:")
        logger.info("1. Configure your .env file with Notion credentials")
        logger.info("2. Run: python test_yuutai_functionality.py")
        logger.info("3. Try: python src/main_yuutai.py --test")
    else:
        logger.error("⚠️  Setup incomplete. Please check the errors above.")
        
        if completed < 2:
            logger.info("\nCommon fixes:")
            logger.info("- Make sure you have Python 3.7+ installed")
            logger.info("- Install pip if not available")
            logger.info("- Check internet connection for package downloads")
        elif completed < 3:
            logger.info("\nNext steps:")
            logger.info("- Create .env file based on the template")
            logger.info("- Get Notion API key from https://www.notion.so/my-integrations")
            logger.info("- Share your Notion page with the integration")
    
    return completed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)