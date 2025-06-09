import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ローカル環境用の並行スクレイピングクラス
 * 高速処理を重視し、エラー許容度を高くした設計
 */
export class LocalParallelScraper {
  constructor(options = {}) {
    this.db = new Database();
    
    // ローカル環境用の最適化設定（安定性重視）
    this.maxConcurrentBrowsers = options.maxBrowsers || Math.min(os.cpus().length, 3); // 最大3ブラウザ
    this.maxPagesPerBrowser = options.maxPages || 2; // ブラウザあたり2ページ
    this.requestDelay = options.requestDelay || 500; // 500ms間隔（安定）
    this.retryCount = options.retryCount || 1; // 1回リトライ
    this.timeout = options.timeout || 30000; // 30秒タイムアウト
    
    // 統計情報
    this.stats = {
      total: 0,
      processed: 0,
      successful: 0,
      errors: 0,
      noData: 0,
      startTime: Date.now(),
      browsersLaunched: 0
    };
    
    this.browsers = [];
    this.activeTasks = 0;
  }

  /**
   * 並行スクレイピングを開始
   */
  async scrapeAllStocks() {
    console.log('🚀 ローカル環境用並行スクレイピング開始（安定性重視）');
    console.log(`設定: ${this.maxConcurrentBrowsers}ブラウザ × ${this.maxPagesPerBrowser}ページ = 最大${this.maxConcurrentBrowsers * this.maxPagesPerBrowser}同時接続`);
    console.log(`リクエスト間隔: ${this.requestDelay}ms, タイムアウト: ${this.timeout}ms`);
    
    try {
      // 全ての株式コードを取得
      const allStocks = await this.db.getAllStocks();
      this.stats.total = allStocks.length;
      
      console.log(`📊 ${allStocks.length} 銘柄を並行処理開始`);
      
      // ブラウザを起動
      await this.launchBrowsers();
      
      // 銘柄をチャンクに分割
      const chunkSize = Math.ceil(allStocks.length / this.maxConcurrentBrowsers);
      const stockChunks = this.chunkArray(allStocks, chunkSize);
      
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
  }

  /**
   * ブラウザを起動
   */
  async launchBrowsers() {
    console.log(`🌐 ${this.maxConcurrentBrowsers}ブラウザを起動中...`);
    
    const launchPromises = Array.from({ length: this.maxConcurrentBrowsers }, async (_, index) => {
      try {
        const browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--memory-pressure-off'
          ]
        });
        
        this.browsers[index] = browser;
        this.stats.browsersLaunched++;
        console.log(`✅ ブラウザ${index + 1} 起動完了`);
        
        return browser;
      } catch (error) {
        console.error(`❌ ブラウザ${index + 1} 起動失敗:`, error.message);
        return null;
      }
    });
    
    await Promise.allSettled(launchPromises);
    console.log(`🎯 ${this.stats.browsersLaunched}/${this.maxConcurrentBrowsers} ブラウザ起動完了`);
  }

  /**
   * ブラウザ単位でのチャンク処理
   */
  async processBrowserChunk(stockChunk, browserIndex) {
    const browser = this.browsers[browserIndex];
    if (!browser) {
      console.log(`⚠️ ブラウザ${browserIndex + 1} が利用できません`);
      return;
    }

    console.log(`🕷️ ブラウザ${browserIndex + 1}: ${stockChunk.length}銘柄の処理開始`);
    
    // ページをチャンクに分割
    const pageChunkSize = Math.ceil(stockChunk.length / this.maxPagesPerBrowser);
    const pageChunks = this.chunkArray(stockChunk, pageChunkSize);
    
    // ページごとの並行処理
    const pagePromises = pageChunks.map((pageChunk, pageIndex) => 
      this.processPageChunk(browser, pageChunk, browserIndex, pageIndex)
    );
    
    await Promise.allSettled(pagePromises);
    console.log(`✅ ブラウザ${browserIndex + 1}: 処理完了`);
  }

  /**
   * ページ単位でのチャンク処理
   */
  async processPageChunk(browser, stockChunk, browserIndex, pageIndex) {
    let page = null;
    
    try {
      page = await browser.newPage();
      await page.setDefaultNavigationTimeout(this.timeout);
      await page.setDefaultTimeout(this.timeout);
      
      console.log(`📄 ブラウザ${browserIndex + 1}-ページ${pageIndex + 1}: ${stockChunk.length}銘柄処理開始`);
      
      for (const stock of stockChunk) {
        try {
          this.activeTasks++;
          
          const result = await this.scrapeStockBenefit(page, stock.code);
          
          if (result.success) {
            this.stats.successful++;
            console.log(`✅ ${stock.code}: 優待情報取得成功 (${result.benefitCount}件)`);
          } else if (result.noData) {
            this.stats.noData++;
          } else {
            this.stats.errors++;
          }
          
          this.stats.processed++;
          
          // 進捗表示（50件ごと）
          if (this.stats.processed % 50 === 0) {
            this.logProgress();
          }
          
          // レート制限
          await this.sleep(this.requestDelay);
          
        } catch (error) {
          this.stats.errors++;
          console.log(`❌ ${stock.code}: エラー - ${error.message}`);
          
          // ページエラーの場合は新しいページを作成
          if (error.message.includes('Page crashed') || error.message.includes('Target closed')) {
            console.log(`📄 ブラウザ${browserIndex + 1}-ページ${pageIndex + 1}: ページを再作成中...`);
            await page.close();
            page = await browser.newPage();
            await page.setDefaultNavigationTimeout(this.timeout);
            await page.setDefaultTimeout(this.timeout);
          }
          
        } finally {
          this.activeTasks--;
        }
      }
      
    } catch (error) {
      console.error(`❌ ブラウザ${browserIndex + 1}-ページ${pageIndex + 1} エラー:`, error.message);
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * 個別銘柄のスクレイピング
   */
  async scrapeStockBenefit(page, stockCode) {
    try {
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.timeout 
      });

      // 優待情報が存在するかチェック
      const hasYutai = await page.$('.md_box');
      if (!hasYutai) {
        return { success: false, noData: true };
      }

      // 優待内容を取得
      const benefits = await page.evaluate(() => {
        const benefitElements = document.querySelectorAll('.md_box');
        const results = [];

        benefitElements.forEach(element => {
          const titleElement = element.querySelector('.md_head');
          const contentElement = element.querySelector('.md_body');
          
          if (titleElement && contentElement) {
            const title = titleElement.textContent.trim();
            const content = contentElement.textContent.trim()
              .replace(/\\s+/g, ' ')  // 複数の空白を1つに
              .replace(/\\n+/g, ' ')  // 改行を空白に
              .replace(/\\t+/g, ' ')  // タブを空白に
              .trim();

            if (content && content !== '-' && content.length > 3) {
              results.push({
                title: title || '株主優待',
                content: content
              });
            }
          }
        });

        return results;
      });

      // 権利確定月を取得
      const rightsMonth = await page.evaluate(() => {
        const monthElement = document.querySelector('.ly_col_right .md_box .ly_content_wrapper');
        if (monthElement) {
          const text = monthElement.textContent;
          const monthMatch = text.match(/(\\d{1,2})月/);
          return monthMatch ? monthMatch[1] : null;
        }
        return null;
      });

      // 最低投資金額を取得
      const minInvestment = await page.evaluate(() => {
        const elements = document.querySelectorAll('.ly_col_right .md_box .ly_content_wrapper');
        for (const element of elements) {
          const text = element.textContent;
          if (text.includes('円') && text.includes('株')) {
            const amountMatch = text.match(/([\\d,]+)円/);
            return amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : null;
          }
        }
        return null;
      });

      if (benefits.length > 0) {
        // データベースに保存
        for (const benefit of benefits) {
          await this.db.insertShareholderBenefit({
            stockCode: stockCode,
            benefitType: benefit.title,
            benefitContent: benefit.content,
            rightsMonth: rightsMonth ? parseInt(rightsMonth) : null,
            minShares: null,
            minInvestment: minInvestment,
            benefitValue: null,
            notes: null,
            longTermBenefit: null,
            longTermMonths: null
          });
        }

        return { 
          success: true, 
          benefitCount: benefits.length,
          rightsMonth: rightsMonth,
          minInvestment: minInvestment
        };
      }

      return { success: false, noData: true };

    } catch (error) {
      throw error;
    }
  }

  /**
   * 進捗ログ
   */
  logProgress() {
    const elapsed = Date.now() - this.stats.startTime;
    const rate = this.stats.processed / (elapsed / 60000); // 件/分
    const percentage = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
    
    console.log(`\\n📈 進捗: ${this.stats.processed}/${this.stats.total} (${percentage}%) - ${rate.toFixed(1)} 銘柄/分`);
    console.log(`✅ 成功: ${this.stats.successful}, ❌ エラー: ${this.stats.errors}, 📭 データなし: ${this.stats.noData}`);
    console.log(`🌐 アクティブブラウザ: ${this.stats.browsersLaunched}, ⚡ アクティブタスク: ${this.activeTasks}`);
    
    if (rate > 0) {
      const remainingMinutes = (this.stats.total - this.stats.processed) / rate;
      console.log(`⏱️ 推定残り時間: ${Math.round(remainingMinutes)}分\\n`);
    }
  }

  /**
   * 最終結果ログ
   */
  logFinalResults() {
    const elapsed = Date.now() - this.stats.startTime;
    const minutes = Math.round(elapsed / 60000);
    const avgRate = this.stats.processed / (elapsed / 60000);
    
    console.log('\\n🎉 ローカル並行スクレイピング完了！');
    console.log(`📊 処理結果:`);
    console.log(`  ✅ 成功: ${this.stats.successful}/${this.stats.total} (${((this.stats.successful/this.stats.total)*100).toFixed(1)}%)`);
    console.log(`  ❌ エラー: ${this.stats.errors}/${this.stats.total} (${((this.stats.errors/this.stats.total)*100).toFixed(1)}%)`);
    console.log(`  📭 データなし: ${this.stats.noData}/${this.stats.total} (${((this.stats.noData/this.stats.total)*100).toFixed(1)}%)`);
    console.log(`  ⏱️ 所要時間: ${minutes}分`);
    console.log(`  📈 平均レート: ${avgRate.toFixed(1)} 銘柄/分`);
    console.log(`  🌐 使用ブラウザ数: ${this.stats.browsersLaunched}`);
  }

  /**
   * 配列をチャンクに分割
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * スリープ
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * クリーンアップ
   */
  async cleanup() {
    console.log('🧹 リソースをクリーンアップ中...');
    
    for (const browser of this.browsers) {
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          console.error('ブラウザクローズエラー:', error.message);
        }
      }
    }
    
    this.browsers = [];
    console.log('✅ クリーンアップ完了');
  }
}

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new LocalParallelScraper({
    maxBrowsers: 4,
    maxPages: 3,
    requestDelay: 150,
    timeout: 20000
  });
  
  // シグナルハンドリング
  process.on('SIGINT', async () => {
    console.log('\\n⚡ 停止シグナル受信、クリーンアップ中...');
    await scraper.cleanup();
    process.exit(0);
  });
  
  scraper.scrapeAllStocks().catch(console.error);
}