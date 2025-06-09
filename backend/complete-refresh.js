import { FixExistingBenefits } from './fix-existing-benefits.js';
import { SimpleCleanScraper } from './simple-clean-scraper.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 完全な優待データ更新スクリプト
 * 1. 既存データのクリーンアップ
 * 2. 新しい優待情報の再スクレイピング
 */
class CompleteRefresh {
  constructor() {
    this.stats = {
      startTime: Date.now(),
      cleanupStats: null,
      scrapingStats: null
    };
  }

  /**
   * 完全更新の実行
   */
  async runCompleteRefresh() {
    console.log('🚀 優待データの完全更新を開始...\n');
    console.log('=' .repeat(60));
    
    try {
      // Step 1: 既存データのクリーンアップ
      await this.cleanExistingData();
      
      // Step 2: 新しい優待情報の再スクレイピング
      await this.rescrapeAllBenefits();
      
      // Step 3: 最終統計の表示
      this.showFinalStats();
      
      console.log('\n✅ 優待データの完全更新が完了しました！');
      
    } catch (error) {
      console.error('❌ 処理中にエラーが発生しました:', error);
      process.exit(1);
    }
  }

  /**
   * Step 1: 既存データのクリーンアップ
   */
  async cleanExistingData() {
    console.log('📝 Step 1: 既存データのクリーンアップ');
    console.log('-'.repeat(40));
    
    const fixer = new FixExistingBenefits();
    
    try {
      await fixer.cleanAllBenefitData();
      this.stats.cleanupStats = fixer.stats;
      
      console.log('\n✅ Step 1 完了: 既存データのクリーンアップ');
      console.log('=' .repeat(60));
      
    } finally {
      fixer.close();
    }
  }

  /**
   * Step 2: 新しい優待情報の再スクレイピング
   */
  async rescrapeAllBenefits() {
    console.log('\n🕷️ Step 2: 新しい優待情報の再スクレイピング');
    console.log('-'.repeat(40));
    
    return new Promise((resolve, reject) => {
      const scraperPath = join(__dirname, 'parallel-scraper.js');
      console.log(`並行スクレイパーを起動中: ${scraperPath}`);
      
      const scraper = spawn('node', [scraperPath], {
        stdio: 'inherit',
        cwd: __dirname
      });
      
      scraper.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Step 2 完了: 新しい優待情報の取得');
          console.log('=' .repeat(60));
          
          this.stats.scrapingStats = {
            processed: '実行完了',
            errors: 0
          };
          
          resolve();
        } else {
          console.error(`❌ スクレイピングがエラーで終了: code ${code}`);
          reject(new Error(`スクレイピング失敗: exit code ${code}`));
        }
      });
      
      scraper.on('error', (error) => {
        console.error('❌ スクレイピングプロセスエラー:', error);
        reject(error);
      });
    });
  }

  /**
   * 最終統計の表示
   */
  showFinalStats() {
    const totalTime = Math.round((Date.now() - this.stats.startTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    
    console.log('\n📊 完全更新 結果');
    console.log('=' .repeat(60));
    
    if (this.stats.cleanupStats) {
      console.log('🧹 データクリーンアップ:');
      console.log(`  削除されたデータ: ${this.stats.cleanupStats.deleted} 件`);
      console.log(`  クリーニング済み: ${this.stats.cleanupStats.cleaned} 件`);
      console.log(`  統合された重複: ${this.stats.cleanupStats.merged} 件`);
    }
    
    if (this.stats.scrapingStats) {
      console.log('\n🕷️ 新規スクレイピング:');
      console.log(`  実行: ${this.stats.scrapingStats.processed}`);
      console.log(`  エラー: ${this.stats.scrapingStats.errors} 件`);
    }
    
    console.log(`\n⏱️ 総実行時間: ${minutes}分${seconds}秒`);
    console.log('=' .repeat(60));
  }

  /**
   * 軽量更新（クリーンアップのみ）
   */
  async lightRefresh() {
    console.log('🧽 軽量更新を開始...\n');
    
    const scraper = new SimpleCleanScraper();
    
    try {
      await scraper.cleanExistingBenefits();
      await scraper.mergeDuplicates();
      await scraper.showStats();
      
      console.log('\n✅ 軽量更新完了！');
    } finally {
      scraper.close();
    }
  }
}

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const refresher = new CompleteRefresh();
  
  const command = process.argv[2];
  
  try {
    if (command === 'light') {
      // 軽量更新（クリーンアップのみ）
      await refresher.lightRefresh();
    } else {
      // 完全更新（クリーンアップ + 再スクレイピング）
      await refresher.runCompleteRefresh();
    }
  } catch (error) {
    console.error('処理エラー:', error);
    process.exit(1);
  }
}

export { CompleteRefresh };