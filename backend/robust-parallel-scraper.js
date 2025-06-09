import puppeteer from 'puppeteer';
import { Database } from './database.js';
import os from 'os';

/**
 * 堅牢な並行スクレイパー
 * 改良されたスクレイピング手法 + 安定した並行処理
 */
export class RobustParallelScraper {
  constructor(options = {}) {
    this.db = new Database();
    
    // 保守的な並行設定
    this.maxConcurrentBrowsers = options.maxBrowsers || Math.min(os.cpus().length, 2); // 最大2ブラウザ
    this.maxPagesPerBrowser = options.maxPages || 1; // ブラウザあたり1ページ
    this.requestDelay = options.requestDelay || 3000; // 3秒間隔
    this.timeout = options.timeout || 45000; // 45秒タイムアウト
    this.retryCount = options.retryCount || 2;
    
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
    console.log('🛡️ 堅牢な並行スクレイピング開始');
    console.log(`設定: ${this.maxConcurrentBrowsers}ブラウザ × ${this.maxPagesPerBrowser}ページ = 最大${this.maxConcurrentBrowsers * this.maxPagesPerBrowser}同時接続`);
    console.log(`リクエスト間隔: ${this.requestDelay}ms, タイムアウト: ${this.timeout}ms`);
    
    try {
      // 全ての株式コードを取得
      const allStocks = await this.db.getAllStocks();
      this.stats.total = allStocks.length;
      
      console.log(`📊 ${allStocks.length} 銘柄を処理開始`);
      
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
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-first-run',
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
    
    let page = null;
    
    try {
      page = await browser.newPage();
      
      // ステルスモード設定
      await this.setupStealthMode(page);
      
      await page.setDefaultNavigationTimeout(this.timeout);
      await page.setDefaultTimeout(this.timeout);
      
      for (const stock of stockChunk) {
        try {
          this.activeTasks++;
          
          console.log(`[${browserIndex + 1}] ${stock.code}: ${stock.name} 処理中...`);
          
          const result = await this.scrapeStockBenefit(page, stock.code);
          
          if (result.success) {
            this.stats.successful++;
            console.log(`[${browserIndex + 1}] ✅ ${stock.code}: 優待情報取得成功 (${result.benefitCount}件)`);
          } else if (result.noData) {
            this.stats.noData++;
            console.log(`[${browserIndex + 1}] ℹ️ ${stock.code}: 優待情報なし (${result.reason || 'データなし'})`);
          } else {
            this.stats.errors++;
            console.log(`[${browserIndex + 1}] ❌ ${stock.code}: 取得失敗 (${result.error || result.reason})`);
          }
          
          this.stats.processed++;
          
          // 進捗表示（25件ごと）
          if (this.stats.processed % 25 === 0) {
            this.logProgress();
          }
          
          // 長めの間隔で負荷軽減
          await this.sleep(this.requestDelay);
          
        } catch (error) {
          this.stats.errors++;
          console.log(`[${browserIndex + 1}] ❌ ${stock.code}: エラー - ${error.message}`);
          
          // ページエラーの場合は新しいページを作成
          if (error.message.includes('Page crashed') || error.message.includes('Target closed')) {
            console.log(`[${browserIndex + 1}] 📄 ページを再作成中...`);
            await page.close();
            page = await browser.newPage();
            await this.setupStealthMode(page);
            await page.setDefaultNavigationTimeout(this.timeout);
            await page.setDefaultTimeout(this.timeout);
          }
          
          // エラー時も待機
          await this.sleep(this.requestDelay);
          
        } finally {
          this.activeTasks--;
        }
      }
      
    } catch (error) {
      console.error(`❌ ブラウザ${browserIndex + 1} エラー:`, error.message);
    } finally {
      if (page) {
        await page.close();
      }
    }
    
    console.log(`✅ ブラウザ${browserIndex + 1}: 処理完了`);
  }

  /**
   * ステルスモード設定
   */
  async setupStealthMode(page) {
    // WebDriverの痕跡を隠す
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ja-JP', 'ja'],
      });
    });
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    });
  }

  /**
   * 優待情報の詳細スクレイピング（改良版手法を使用）
   */
  async scrapeStockBenefit(page, stockCode) {
    const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
    
    // ページを開く
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: this.timeout 
    });

    // 少し待機（動的コンテンツの読み込み完了待ち）
    await this.sleep(2000);

    // ページの基本情報を取得
    const pageInfo = await page.evaluate(() => {
      return {
        hasYutaiText: document.body.textContent.includes('優待'),
        noInfoText: document.body.textContent.includes('優待情報はありません')
      };
    });

    // 優待情報がない場合
    if (pageInfo.noInfoText) {
      return { success: false, noData: true, reason: '優待情報なし' };
    }

    // 優待情報を取得
    const benefitData = await page.evaluate(() => {
      const results = {
        benefits: [],
        detectedMethod: null
      };

      // テーブル形式の優待情報を取得
      try {
        const tables = document.querySelectorAll('table');
        tables.forEach((table, tableIndex) => {
          const tableText = table.textContent;
          if (tableText.includes('株数') || tableText.includes('優待内容') || tableText.includes('優待券')) {
            const rows = table.querySelectorAll('tr');
            rows.forEach((row, rowIndex) => {
              const cells = row.querySelectorAll('td, th');
              if (cells.length >= 2) {
                const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                if (cellTexts.some(text => text.length > 3 && !text.includes('月') && !text.includes('年'))) {
                  results.benefits.push({
                    type: 'table',
                    tableIndex: tableIndex,
                    rowIndex: rowIndex,
                    data: cellTexts,
                    source: 'table_scan'
                  });
                }
              }
            });
            results.detectedMethod = 'table_scan';
          }
        });
      } catch (e) {
        // テーブルスキャンエラーは無視
      }

      // 一般的なクラス名での検索
      if (results.benefits.length === 0) {
        const commonSelectors = [
          '.md_box', '.benefit-content', '.yutai-content', 
          '.stock-benefit', '.shareholder-benefit', '.benefit-info'
        ];

        commonSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element, index) => {
              const text = element.textContent.trim();
              if (text.length > 20 && (text.includes('優待') || text.includes('株主'))) {
                results.benefits.push({
                  type: 'content',
                  selector: selector,
                  index: index,
                  content: text.slice(0, 200),
                  source: 'selector_scan'
                });
                if (!results.detectedMethod) results.detectedMethod = 'selector_scan';
              }
            });
          } catch (e) {
            // セレクタが存在しない場合は無視
          }
        });
      }

      return results;
    });

    // 結果の処理と保存
    if (benefitData.benefits.length > 0) {
      const processedBenefits = await this.processBenefitData(stockCode, benefitData);
      
      // データベースに保存
      let savedCount = 0;
      for (const benefit of processedBenefits) {
        try {
          await this.db.insertBenefit(benefit);
          savedCount++;
        } catch (error) {
          // 重複エラーは無視
          if (!error.message.includes('UNIQUE constraint failed')) {
            console.log(`    ⚠️ DB保存エラー: ${error.message}`);
          }
        }
      }

      return { 
        success: true, 
        benefitCount: savedCount,
        method: benefitData.detectedMethod
      };
    }

    return { success: false, noData: true, reason: '解析失敗' };
  }

  /**
   * 優待データの処理
   */
  async processBenefitData(stockCode, benefitData) {
    const benefits = [];
    
    for (const benefit of benefitData.benefits) {
      let processedBenefit = {
        stock_code: stockCode,
        benefit_type: '株主優待',
        description: '',
        monetary_value: null,
        min_shares: 100,
        holder_type: '一般',
        ex_rights_month: 3,
        created_at: new Date().toISOString()
      };

      // データ形式に応じて処理
      switch (benefit.type) {
        case 'table':
          processedBenefit.description = benefit.data.join(' / ');
          break;
        case 'content':
          processedBenefit.description = benefit.content;
          break;
      }

      // コンテンツが有効な場合のみ追加
      if (processedBenefit.description && processedBenefit.description.length > 5) {
        // 重複チェック用のユニークキーを作成
        const uniqueKey = `${stockCode}_${processedBenefit.description.slice(0, 50)}`;
        processedBenefit.description = `[${uniqueKey.slice(-10)}] ${processedBenefit.description}`;
        benefits.push(processedBenefit);
      }
    }

    return benefits;
  }

  /**
   * 進捗ログ
   */
  logProgress() {
    const elapsed = Date.now() - this.stats.startTime;
    const rate = this.stats.processed / (elapsed / 60000);
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
    
    console.log('\\n🎉 堅牢な並行スクレイピング完了！');
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
  const scraper = new RobustParallelScraper({
    maxBrowsers: 2,      // 2ブラウザで安定性確保
    maxPages: 1,         // ブラウザあたり1ページ
    requestDelay: 3000,  // 3秒間隔
    timeout: 45000       // 45秒タイムアウト
  });
  
  // シグナルハンドリング
  process.on('SIGINT', async () => {
    console.log('\\n⚡ 停止シグナル受信、クリーンアップ中...');
    await scraper.cleanup();
    process.exit(0);
  });
  
  scraper.scrapeAllStocks().catch(console.error);
}