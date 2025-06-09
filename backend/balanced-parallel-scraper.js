import { LocalParallelScraper } from './local-parallel-scraper.js';

/**
 * バランス型並行スクレイピング
 * 安定性とパフォーマンスのバランスを取った設定
 */
export class BalancedParallelScraper extends LocalParallelScraper {
  constructor() {
    super({
      maxBrowsers: 2,      // 2ブラウザで安定性確保
      maxPages: 2,         // ブラウザあたり2ページ
      requestDelay: 1000,  // 1秒間隔でサーバー負荷軽減
      timeout: 30000,      // 30秒タイムアウト
      retryCount: 2        // 2回リトライ
    });
  }

  async scrapeAllStocks() {
    console.log('🚀 バランス型並行スクレイピング開始');
    console.log('設定: 安定性とパフォーマンスのバランス重視');
    console.log(`${this.maxConcurrentBrowsers}ブラウザ × ${this.maxPagesPerBrowser}ページ = 最大${this.maxConcurrentBrowsers * this.maxPagesPerBrowser}同時接続`);
    console.log(`リクエスト間隔: ${this.requestDelay}ms, タイムアウト: ${this.timeout}ms`);
    
    return super.scrapeAllStocks();
  }

  /**
   * より保守的なエラーハンドリング
   */
  async scrapeStockBenefit(page, stockCode) {
    let retries = 0;
    
    while (retries <= this.retryCount) {
      try {
        return await super.scrapeStockBenefit(page, stockCode);
      } catch (error) {
        retries++;
        
        if (retries <= this.retryCount) {
          console.log(`🔄 ${stockCode}: リトライ ${retries}/${this.retryCount} - ${error.message}`);
          await this.sleep(2000); // 2秒待機してリトライ
        } else {
          throw error;
        }
      }
    }
  }
}

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new BalancedParallelScraper();
  
  // シグナルハンドリング
  process.on('SIGINT', async () => {
    console.log('\\n⚡ 停止シグナル受信、クリーンアップ中...');
    await scraper.cleanup();
    process.exit(0);
  });
  
  scraper.scrapeAllStocks().catch(console.error);
}