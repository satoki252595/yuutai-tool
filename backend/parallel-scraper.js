import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ParallelScraper {
  constructor(options = {}) {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    
    // 並行処理設定
    this.maxConcurrentWorkers = options.maxWorkers || Math.min(os.cpus().length, 4); // CPU数に応じて調整、最大4
    this.maxConcurrentPages = options.maxPages || 3; // ブラウザ内のタブ数
    this.requestDelay = options.requestDelay || 200; // リクエスト間隔（ミリ秒）
    this.retryCount = options.retryCount || 2; // リトライ回数
    
    // 統計情報
    this.stats = {
      total: 0,
      processed: 0,
      successful: 0,
      errors: 0,
      noData: 0,
      startTime: Date.now()
    };
    
    // レート制限管理
    this.lastRequestTime = 0;
    this.activeRequests = 0;
  }

  /**
   * レート制限を適用した並行処理
   */
  async rateLimitedExecution(asyncFn) {
    // 同時実行数制限
    while (this.activeRequests >= this.maxConcurrentPages) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // レート制限
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
    }
    
    this.activeRequests++;
    this.lastRequestTime = Date.now();
    
    try {
      return await asyncFn();
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * ブラウザプールの管理
   */
  async createBrowserPool() {
    const browserPool = [];
    
    for (let i = 0; i < this.maxConcurrentWorkers; i++) {
      const browserConfig = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process' // 安定性のため
        ]
      };
      
      // Docker環境でChromiumのパスを指定
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        browserConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      
      const browser = await puppeteer.launch(browserConfig);
      browserPool.push(browser);
    }
    
    console.log(`${browserPool.length} ブラウザインスタンスを起動しました`);
    return browserPool;
  }

  /**
   * 単一銘柄のスクレイピング（リトライ機能付き）
   */
  async scrapeStockWithRetry(browser, stockCode, attempt = 1) {
    try {
      return await this.rateLimitedExecution(async () => {
        return await this.scrapeStockBenefit(browser, stockCode);
      });
    } catch (error) {
      if (attempt < this.retryCount) {
        console.log(`🔄 ${stockCode}: リトライ ${attempt}/${this.retryCount}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 指数バックオフ
        return this.scrapeStockWithRetry(browser, stockCode, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * 銘柄スクレイピングの本体（既存コードから移植）
   */
  async scrapeStockBenefit(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      // User-Agentを設定してブロックを回避
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // 無駄なリソースをブロックして高速化
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // networkidle0より高速
        timeout: 15000 
      });

      // 銘柄名を取得
      const stockName = await page.evaluate(() => {
        const nameElement = document.querySelector('h1.md_stock_board_title, .stock-board__title, h1');
        return nameElement ? nameElement.textContent.trim() : null;
      });

      if (!stockName) {
        return { success: false, noData: true, reason: '銘柄が見つかりません' };
      }

      // 既存の優待情報を削除
      await this.db.deleteStockBenefits(stockCode);

      // 銘柄情報を更新
      await this.db.updateStockInfo(stockCode, stockName);

      // 優待情報を取得
      const benefits = await page.evaluate(() => {
        const benefitElements = document.querySelectorAll('.benefit-item, .shareholder-benefit-item, .benefit-content');
        const benefits = [];

        benefitElements.forEach(element => {
          try {
            const description = element.textContent?.trim() || '';
            if (description && description.length > 10) {
              // 優待の詳細情報を解析
              const benefit = {
                description: description,
                monetary_value: 0,
                min_shares: 100,
                holder_type: 'どちらでも',
                ex_rights_month: 3
              };

              // 金銭価値の推定
              const valueMatch = description.match(/(\d{1,3}(?:,\d{3})*)\s*円/);
              if (valueMatch) {
                benefit.monetary_value = parseInt(valueMatch[1].replace(/,/g, ''));
              }

              // 必要株式数の解析
              const sharesMatch = description.match(/(\d+)\s*株/);
              if (sharesMatch) {
                benefit.min_shares = parseInt(sharesMatch[1]);
              }

              // 権利月の解析
              const monthMatch = description.match(/(\d{1,2})\s*月/);
              if (monthMatch) {
                benefit.ex_rights_month = parseInt(monthMatch[1]);
              }

              benefits.push(benefit);
            }
          } catch (error) {
            // 個別要素のエラーは無視
          }
        });

        return benefits;
      });

      if (benefits.length === 0) {
        return { success: false, noData: true, reason: '優待情報なし' };
      }

      // データベースに保存
      for (const benefit of benefits) {
        await this.db.insertBenefit({
          stock_code: stockCode,
          benefit_type: this.classifyBenefitType(benefit.description),
          description: benefit.description,
          monetary_value: benefit.monetary_value,
          min_shares: benefit.min_shares,
          holder_type: benefit.holder_type,
          ex_rights_month: benefit.ex_rights_month
        });
      }

      return { 
        success: true, 
        name: stockName, 
        benefitCount: benefits.length 
      };

    } catch (error) {
      console.error(`スクレイピングエラー ${stockCode}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      await page.close();
    }
  }

  /**
   * 優待タイプの分類
   */
  classifyBenefitType(description) {
    const keywords = {
      '食事券・グルメ券': ['食事券', 'グルメ券', '食事', 'レストラン', '飲食'],
      '商品券・ギフトカード': ['商品券', 'ギフトカード', 'ギフト券'],
      'QUOカード・図書カード': ['QUOカード', '図書カード', 'クオカード'],
      '割引券・優待券': ['割引券', '優待券', '割引', '優待'],
      '自社製品・商品': ['自社製品', '商品', '製品'],
      'カタログギフト': ['カタログ'],
      'ポイント・電子マネー': ['ポイント', '電子マネー'],
      '宿泊・レジャー': ['宿泊券', 'ホテル', 'レジャー', '旅行'],
      '交通・乗車券': ['乗車券', '交通', '電車', 'バス'],
      '金券・現金': ['現金', '金券'],
      '寄付選択制': ['寄付', '寄附'],
      '美容・健康': ['美容', '健康', 'エステ'],
      '本・雑誌・エンタメ': ['本', '雑誌', '書籍', 'DVD']
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(word => description.includes(word))) {
        return type;
      }
    }
    
    return 'その他';
  }

  /**
   * 並行スクレイピングのメイン処理
   */
  async scrapeAllStocksParallel() {
    console.log('🚀 並行スクレイピング開始');
    console.log(`設定: ${this.maxConcurrentWorkers} ブラウザ, ${this.maxConcurrentPages} 並行ページ, ${this.requestDelay}ms間隔`);

    const browserPool = await this.createBrowserPool();
    
    try {
      // 全銘柄コードを取得
      const allStockCodes = await this.getAllValidStockCodes();
      this.stats.total = allStockCodes.length;
      
      console.log(`${allStockCodes.length} 銘柄の並行処理を開始します`);

      // 銘柄をチャンクに分割（ブラウザごと）
      const chunkSize = Math.ceil(allStockCodes.length / this.maxConcurrentWorkers);
      const chunks = [];
      
      for (let i = 0; i < allStockCodes.length; i += chunkSize) {
        chunks.push(allStockCodes.slice(i, i + chunkSize));
      }

      // 各ブラウザで並行処理
      const promises = chunks.map((chunk, index) => {
        if (index < browserPool.length && chunk.length > 0) {
          return this.processChunk(browserPool[index], chunk, index + 1);
        }
        return Promise.resolve();
      });

      await Promise.all(promises);

      // 最終統計
      const elapsed = Math.round((Date.now() - this.stats.startTime) / 1000);
      const rate = Math.round(this.stats.processed / elapsed * 60); // 分あたり

      console.log('\n🎉 並行スクレイピング完了!');
      console.log(`📊 統計: ${this.stats.successful} 成功, ${this.stats.errors} エラー, ${this.stats.noData} 優待なし`);
      console.log(`⏱️ 時間: ${elapsed}秒 (${rate} 銘柄/分)`);

      await this.verifyDatabase();

    } finally {
      // ブラウザクリーンアップ
      await Promise.all(browserPool.map(browser => browser.close()));
      this.db.close();
    }
  }

  /**
   * チャンク単位での処理
   */
  async processChunk(browser, stockCodes, workerNumber) {
    console.log(`👷 ワーカー${workerNumber}: ${stockCodes.length} 銘柄を処理開始`);
    
    for (let i = 0; i < stockCodes.length; i++) {
      const code = stockCodes[i];
      
      try {
        const result = await this.scrapeStockWithRetry(browser, code);
        
        this.stats.processed++;
        
        if (result.success) {
          this.stats.successful++;
          console.log(`✅ [${workerNumber}] ${code}: ${result.name} (${result.benefitCount}件)`);
        } else if (result.noData) {
          this.stats.noData++;
        } else {
          this.stats.errors++;
          console.log(`❌ [${workerNumber}] ${code}: ${result.reason || result.error}`);
        }

        // 進捗表示（100件ごと）
        if (this.stats.processed % 100 === 0) {
          const progress = Math.round(this.stats.processed / this.stats.total * 100);
          const elapsed = Math.round((Date.now() - this.stats.startTime) / 1000);
          const rate = Math.round(this.stats.processed / elapsed * 60);
          console.log(`📈 進捗: ${this.stats.processed}/${this.stats.total} (${progress}%) - ${rate} 銘柄/分`);
        }

      } catch (error) {
        this.stats.errors++;
        console.error(`💥 [${workerNumber}] ${code}: 予期しないエラー - ${error.message}`);
      }
    }
    
    console.log(`🏁 ワーカー${workerNumber}: 処理完了`);
  }

  /**
   * 有効な銘柄コードを取得（データベースから）
   */
  async getAllValidStockCodes() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT code FROM stocks ORDER BY code`;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.code));
      });
    });
  }

  /**
   * データベース検証
   */
  async verifyDatabase() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_benefits,
          COUNT(DISTINCT stock_code) as stocks_with_benefits,
          AVG(monetary_value) as avg_value
        FROM shareholder_benefits
      `;
      
      this.db.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          console.log('\n📊 データベース検証結果:');
          console.log(`優待情報: ${row.total_benefits} 件`);
          console.log(`優待銘柄: ${row.stocks_with_benefits} 銘柄`);
          console.log(`平均金銭価値: ${Math.round(row.avg_value || 0)} 円`);
          resolve(row);
        }
      });
    });
  }
}

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = {
    maxWorkers: parseInt(process.argv[2]) || 4,
    maxPages: parseInt(process.argv[3]) || 3,
    requestDelay: parseInt(process.argv[4]) || 200
  };

  const scraper = new ParallelScraper(options);
  
  try {
    await scraper.scrapeAllStocksParallel();
  } catch (error) {
    console.error('並行スクレイピングに失敗:', error);
    process.exit(1);
  }
}