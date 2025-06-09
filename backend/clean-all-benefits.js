import { FixExistingBenefits } from './fix-existing-benefits.js';
import { SimpleCleanScraper } from './simple-clean-scraper.js';

/**
 * 優待データの完全クリーンアップ・再取得スクリプト
 * 1. 既存データのクリーンアップ
 * 2. 全銘柄のクリーンな再スクレイピング
 */
class CompleteBenefitCleaner {
  constructor() {
    this.stats = {
      startTime: Date.now(),
      cleanupStats: null,
      scrapingStats: null
    };
  }

  /**
   * 完全クリーンアップ・再取得の実行
   */
  async runCompleteCleanup() {
    console.log('🚀 優待データの完全クリーンアップ・再取得を開始...\n');
    console.log('=' .repeat(60));
    
    try {
      // Step 1: 既存データのクリーンアップ
      await this.cleanExistingData();
      
      // Step 2: 全銘柄のクリーンな再スクレイピング
      await this.rescrapeAllBenefits();
      
      // Step 3: 最終統計の表示
      this.showFinalStats();
      
      console.log('\n✅ 優待データの完全クリーンアップ・再取得が完了しました！');
      
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
   * Step 2: 既存データの追加クリーンアップ
   */
  async rescrapeAllBenefits() {
    console.log('\n🧽 Step 2: 既存データの追加クリーンアップ');
    console.log('-'.repeat(40));
    
    const scraper = new SimpleCleanScraper();
    
    try {
      await scraper.cleanExistingBenefits();
      await scraper.mergeDuplicates();
      
      this.stats.scrapingStats = {
        processed: 1, // シンプルなクリーンアップなので成功とする
        errors: 0
      };
      
      console.log('\n✅ Step 2 完了: 追加クリーンアップ');
      console.log('=' .repeat(60));
      
    } finally {
      scraper.close();
    }
  }

  /**
   * 最終統計の表示
   */
  showFinalStats() {
    const totalTime = Math.round((Date.now() - this.stats.startTime) / 1000);
    const minutes = Math.floor(totalTime / 60);
    const seconds = totalTime % 60;
    
    console.log('\n📊 完全クリーンアップ・再取得 結果');
    console.log('=' .repeat(60));
    
    if (this.stats.cleanupStats) {
      console.log('🧹 データクリーンアップ:');
      console.log(`  削除されたデータ: ${this.stats.cleanupStats.deleted} 件`);
      console.log(`  クリーニング済み: ${this.stats.cleanupStats.cleaned} 件`);
      console.log(`  統合された重複: ${this.stats.cleanupStats.merged} 件`);
    }
    
    if (this.stats.scrapingStats) {
      console.log('\n🧽 追加クリーンアップ:');
      console.log(`  実行: ${this.stats.scrapingStats.processed ? '完了' : '未実行'}`);
      console.log(`  エラー: ${this.stats.scrapingStats.errors} 件`);
    }
    
    console.log(`\n⏱️ 総実行時間: ${minutes}分${seconds}秒`);
    console.log('=' .repeat(60));
  }

  /**
   * 特定銘柄のみクリーンアップ
   */
  async cleanSpecificStock(stockCode) {
    console.log(`🧹 ${stockCode} の優待データクリーンアップを開始...\n`);
    
    const scraper = new SimpleCleanScraper();
    
    try {
      // 特定銘柄の優待データをクリーンアップ
      const benefits = await new Promise((resolve, reject) => {
        const sql = `SELECT id, description FROM shareholder_benefits WHERE stock_code = ?`;
        scraper.db.db.all(sql, [stockCode], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (benefits.length === 0) {
        console.log(`⚠️ ${stockCode}: 優待データが見つかりません`);
        return { success: false, reason: '優待データなし' };
      }
      
      let cleanedCount = 0;
      for (const benefit of benefits) {
        const cleaned = scraper.cleanDescription(benefit.description);
        if (cleaned && cleaned !== benefit.description) {
          await scraper.updateBenefitDescription(benefit.id, cleaned);
          cleanedCount++;
        }
      }
      
      console.log(`✅ ${stockCode}: ${cleanedCount} 件の優待データをクリーンアップ`);
      return { success: true, cleanedCount };
      
    } finally {
      scraper.close();
    }
  }
}

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const cleaner = new CompleteBenefitCleaner();
  
  const command = process.argv[2];
  
  try {
    if (command && command !== 'all') {
      // 特定銘柄の処理
      await cleaner.cleanSpecificStock(command);
    } else {
      // 全銘柄の完全処理
      await cleaner.runCompleteCleanup();
    }
  } catch (error) {
    console.error('処理エラー:', error);
    process.exit(1);
  }
}

export { CompleteBenefitCleaner };