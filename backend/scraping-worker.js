import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * スクレイピングワーカー
 * 定期的に優待情報を更新
 */
class ScrapingWorker {
  constructor() {
    this.interval = parseInt(process.env.SCRAPING_INTERVAL) || 86400000; // デフォルト24時間
    this.isRunning = false;
  }

  /**
   * 初回起動時の処理
   */
  async initialize() {
    console.log('🚀 スクレイピングワーカー起動');
    console.log(`⏰ スクレイピング間隔: ${this.interval / 1000 / 60 / 60}時間`);
    
    // 初回実行
    await this.runScraping();
    
    // 定期実行の設定
    setInterval(() => {
      this.runScraping();
    }, this.interval);
  }

  /**
   * スクレイピングの実行
   */
  async runScraping() {
    if (this.isRunning) {
      console.log('⚠️ スクレイピングは既に実行中です');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(60));
    console.log(`🕷️ スクレイピング開始: ${new Date().toLocaleString('ja-JP')}`);
    console.log('='.repeat(60));

    try {
      // Step 1: JPXデータの更新
      await this.runCommand('JPXデータ更新', ['node', join(__dirname, 'jpx-data-fetcher.js')]);
      
      // Step 2: 銘柄情報の更新
      await this.runCommand('銘柄情報更新', ['node', join(__dirname, 'comprehensive-stock-updater.js'), 'stocks-only']);
      
      // Step 3: 優待情報のスクレイピング（シリアル実行）
      await this.runCommand('優待情報スクレイピング', ['node', join(__dirname, 'serial-scraper.js')]);
      
      // Step 4: 株価情報の更新（軽量版）
      await this.runCommand('株価更新', ['node', join(__dirname, 'comprehensive-stock-updater.js'), 'prices-only']);
      
      // Step 5: データクリーンアップ
      await this.runCommand('データクリーンアップ', ['node', join(__dirname, 'fix-existing-benefits.js')]);
      
      const elapsedTime = Math.round((Date.now() - startTime) / 1000 / 60);
      console.log(`\n✅ スクレイピング完了: ${elapsedTime}分`);
      console.log(`📅 次回実行: ${new Date(Date.now() + this.interval).toLocaleString('ja-JP')}`);
      
    } catch (error) {
      console.error('❌ スクレイピングエラー:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * コマンドの実行
   */
  runCommand(name, args) {
    return new Promise((resolve, reject) => {
      console.log(`\n▶️ ${name} 実行中...`);
      
      const [command, ...commandArgs] = args;
      const child = spawn(command, commandArgs, {
        stdio: 'inherit',
        cwd: __dirname
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ ${name} 完了`);
          resolve();
        } else {
          reject(new Error(`${name} 失敗: exit code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`${name} エラー: ${error.message}`));
      });
    });
  }
}

// シグナルハンドリング
process.on('SIGTERM', () => {
  console.log('⚡ SIGTERM受信、グレースフルシャットダウン...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⚡ SIGINT受信、グレースフルシャットダウン...');
  process.exit(0);
});

// ワーカー起動
const worker = new ScrapingWorker();
worker.initialize().catch(error => {
  console.error('ワーカー初期化エラー:', error);
  process.exit(1);
});