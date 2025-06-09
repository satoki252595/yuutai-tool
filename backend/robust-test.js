import { RobustParallelScraper } from './robust-parallel-scraper.js';

/**
 * 堅牢な並行スクレイピングのテスト版
 * 最初の50銘柄のみを処理
 */
class RobustTest {
  constructor() {
    this.scraper = new RobustParallelScraper({
      maxBrowsers: 2,      // 2ブラウザでテスト
      maxPages: 1,         // ブラウザあたり1ページ（安定性重視）
      requestDelay: 2000,  // 2秒間隔
      timeout: 30000       // 30秒タイムアウト
    });
  }

  async runTest() {
    console.log('🧪 堅牢な並行スクレイピング テスト開始');
    console.log('📊 最初の50銘柄のみを処理します');
    
    try {
      // 元のメソッドをオーバーライドして50銘柄のみテスト
      const originalScrapeAllStocks = this.scraper.scrapeAllStocks.bind(this.scraper);
      
      this.scraper.scrapeAllStocks = async function() {
        console.log('🛡️ 堅牢な並行スクレイピング開始（テストモード）');
        console.log(`設定: ${this.maxConcurrentBrowsers}ブラウザ × ${this.maxPagesPerBrowser}ページ = 最大${this.maxConcurrentBrowsers * this.maxPagesPerBrowser}同時接続`);
        console.log(`リクエスト間隔: ${this.requestDelay}ms, タイムアウト: ${this.timeout}ms`);
        
        try {
          // 全ての株式コードを取得して最初の50銘柄のみに制限
          const allStocks = await this.db.getAllStocks();
          const testStocks = allStocks.slice(0, 50); // 最初の50銘柄
          
          this.stats.total = testStocks.length;
          console.log(`📊 ${testStocks.length} 銘柄をテスト処理開始`);
          
          // ブラウザを起動
          await this.launchBrowsers();
          
          // 銘柄をチャンクに分割
          const chunkSize = Math.ceil(testStocks.length / this.maxConcurrentBrowsers);
          const stockChunks = this.chunkArray(testStocks, chunkSize);
          
          // 並行処理を開始
          const promises = stockChunks.map((chunk, index) => 
            this.processBrowserChunk(chunk, index)
          );
          
          // すべての処理を待機
          await Promise.allSettled(promises);
          
          // 最終結果
          this.logFinalResults();
          
        } catch (error) {
          console.error('❌ スクレイピングエラー:', error);
        } finally {
          await this.cleanup();
        }
      };
      
      await this.scraper.scrapeAllStocks();
      
    } catch (error) {
      console.error('❌ テストエラー:', error);
    }
  }
}

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new RobustTest();
  
  // シグナルハンドリング
  process.on('SIGINT', async () => {
    console.log('\n⚡ 停止シグナル受信、クリーンアップ中...');
    await test.scraper.cleanup();
    process.exit(0);
  });
  
  test.runTest().catch(console.error);
}