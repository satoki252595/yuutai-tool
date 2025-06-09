import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import os from 'os';

class FastResumeScraper {
  constructor(options = {}) {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    
    // 並行処理設定（CPUコア数に応じて調整、最大4）
    this.maxBrowsers = options.maxBrowsers || Math.min(os.cpus().length, 4);
    this.requestDelay = options.requestDelay || 3000; // ブラウザごとに3秒間隔
    this.browserTimeout = options.browserTimeout || 60000;
    
    // 統計情報
    this.stats = {
      total: 0,
      processed: 0,
      successful: 0,
      errors: 0,
      noData: 0,
      startTime: Date.now()
    };
    
    this.browsers = [];
    this.activeWorkers = 0;
  }

  async getUnscrapedStocks() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT s.code, s.name
        FROM stocks s
        LEFT JOIN (
          SELECT DISTINCT stock_code 
          FROM shareholder_benefits
        ) sb ON s.code = sb.stock_code
        WHERE sb.stock_code IS NULL
        ORDER BY s.code
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getScrapingProgress() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(DISTINCT s.code) as total_stocks,
          COUNT(DISTINCT sb.stock_code) as scraped_stocks
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
      `;
      
      this.db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async startFastScraping() {
    console.log('🚀 高速並行スクレイピング（再開版）を開始');
    console.log(`設定: ${this.maxBrowsers} ブラウザ, ${this.requestDelay}ms間隔`);
    
    // 進捗確認
    const progress = await this.getScrapingProgress();
    console.log(`\n📊 現在の進捗:`);
    console.log(`   ✅ 完了済み: ${progress.scraped_stocks}/${progress.total_stocks} (${((progress.scraped_stocks / progress.total_stocks) * 100).toFixed(1)}%)`);
    console.log(`   ⏳ 未処理: ${progress.total_stocks - progress.scraped_stocks}銘柄\n`);
    
    // 未処理銘柄を取得
    const unscrapedStocks = await this.getUnscrapedStocks();
    
    if (unscrapedStocks.length === 0) {
      console.log('✅ すべての銘柄のスクレイピングが完了しています！');
      return;
    }
    
    this.stats.total = unscrapedStocks.length;
    console.log(`🎯 ${unscrapedStocks.length}銘柄を処理開始\n`);
    
    // ブラウザプールを作成
    await this.createBrowserPool();
    
    try {
      // 銘柄をワーカー数で分割
      const stocksPerWorker = Math.ceil(unscrapedStocks.length / this.maxBrowsers);
      const workerPromises = [];
      
      for (let i = 0; i < this.maxBrowsers; i++) {
        const start = i * stocksPerWorker;
        const end = Math.min(start + stocksPerWorker, unscrapedStocks.length);
        const workerStocks = unscrapedStocks.slice(start, end);
        
        if (workerStocks.length > 0) {
          workerPromises.push(
            this.processStocksWithBrowser(i, workerStocks)
          );
        }
      }
      
      // 全ワーカーの完了を待つ
      await Promise.all(workerPromises);
      
      // 最終結果表示
      this.displayFinalResults();
      
    } finally {
      // ブラウザをクリーンアップ
      await this.cleanupBrowsers();
    }
  }

  async createBrowserPool() {
    console.log(`🌐 ${this.maxBrowsers}個のブラウザを起動中...`);
    
    for (let i = 0; i < this.maxBrowsers; i++) {
      try {
        const browserConfig = {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled'
          ],
          protocolTimeout: this.browserTimeout,
        };
        
        // Docker環境でのChromium実行パス設定
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
          browserConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        
        const browser = await puppeteer.launch(browserConfig);
        
        this.browsers.push(browser);
        console.log(`✅ ブラウザ${i + 1} 起動完了`);
      } catch (error) {
        console.error(`❌ ブラウザ${i + 1} 起動失敗:`, error.message);
      }
    }
    
    console.log(`🎯 ${this.browsers.length}/${this.maxBrowsers} ブラウザ起動完了\n`);
  }

  async processStocksWithBrowser(workerId, stocks) {
    const browser = this.browsers[workerId];
    if (!browser) return;
    
    this.activeWorkers++;
    console.log(`👷 ワーカー${workerId + 1}: ${stocks.length}銘柄の処理開始`);
    
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(this.browserTimeout);
    await page.setDefaultTimeout(this.browserTimeout);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // ワーカーごとに異なる開始遅延を設定（負荷分散）
    await this.sleep(workerId * 1000);
    
    for (const stock of stocks) {
      try {
        await this.scrapeStock(page, stock, workerId);
        
        // リクエスト間隔を守る
        await this.sleep(this.requestDelay);
        
      } catch (error) {
        console.error(`[W${workerId + 1}] ❌ ${stock.code}: 致命的エラー - ${error.message}`);
        
        // ページの再作成を試みる
        try {
          await page.close();
          page = await browser.newPage();
          await page.setDefaultNavigationTimeout(this.browserTimeout);
          await page.setDefaultTimeout(this.browserTimeout);
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        } catch (e) {
          console.error(`[W${workerId + 1}] ページ再作成失敗`);
          break;
        }
      }
    }
    
    await page.close();
    this.activeWorkers--;
    console.log(`✅ ワーカー${workerId + 1}: 処理完了`);
  }

  async scrapeStock(page, stock, workerId) {
    this.stats.processed++;
    
    try {
      const url = `https://minkabu.jp/stock/${stock.code}/yutai`;
      
      console.log(`[W${workerId + 1}] ${stock.code}: ${stock.name} 処理中...`);
      
      // Yahoo Financeから株価情報を取得
      let stockInfo = null;
      try {
        stockInfo = await this.yahooFinance.getStockPrice(stock.code);
      } catch (error) {
        // エラーでも続行
      }
      
      // 株式情報を更新
      await this.updateStockInfo(stock.code, stockInfo);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.browserTimeout 
      });
      
      // 優待情報の存在確認
      const hasYutai = await page.$('.md_box');
      if (!hasYutai) {
        this.stats.noData++;
        console.log(`[W${workerId + 1}] ⏭️ ${stock.code}: 優待情報なし`);
        return;
      }
      
      // 優待情報を抽出
      const benefits = await page.evaluate(() => {
        const benefitRows = [];
        const rows = document.querySelectorAll('.md_table tbody tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const sharesText = cells[0]?.textContent?.trim() || '';
            const benefitText = cells[1]?.textContent?.trim() || '';
            const noteText = cells[2]?.textContent?.trim() || '';
            
            if (sharesText && benefitText) {
              benefitRows.push({
                requiredShares: sharesText,
                description: benefitText,
                notes: noteText
              });
            }
          }
        });
        
        return benefitRows;
      });
      
      if (benefits.length === 0) {
        this.stats.noData++;
        console.log(`[W${workerId + 1}] ⏭️ ${stock.code}: 優待テーブルが空`);
        return;
      }
      
      // データベースに保存
      for (const benefit of benefits) {
        await this.saveBenefit(stock.code, benefit);
      }
      
      // 株価履歴を保存
      if (stockInfo?.price) {
        try {
          await this.db.insertPriceHistory(stockInfo);
        } catch (error) {
          // エラーでも続行
        }
      }
      
      this.stats.successful++;
      console.log(`[W${workerId + 1}] ✅ ${stock.code}: ${benefits.length}件の優待情報を保存`);
      
      // 進捗表示（100件ごと）
      if (this.stats.processed % 100 === 0) {
        this.displayProgress();
      }
      
    } catch (error) {
      this.stats.errors++;
      console.error(`[W${workerId + 1}] ❌ ${stock.code}: ${error.message}`);
    }
  }

  async saveBenefit(stockCode, benefit) {
    const minShares = this.parseMinShares(benefit.requiredShares);
    const monetaryValue = this.estimateMonetaryValue(benefit.description);
    const benefitType = this.categorizeBenefit(benefit.description);
    const longTermInfo = this.detectLongTermHolding(benefit.description);
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO shareholder_benefits 
        (stock_code, benefit_type, description, monetary_value, min_shares, holder_type, ex_rights_month, has_long_term_holding, long_term_months, long_term_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        stockCode,
        benefitType,
        `${benefit.description} ${benefit.notes}`.trim(),
        monetaryValue,
        minShares,
        '一般',
        3, // デフォルト値
        longTermInfo.hasLongTerm ? 1 : 0,
        longTermInfo.months,
        longTermInfo.value
      ];
      
      this.db.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  parseMinShares(sharesText) {
    if (!sharesText) return 100;
    
    // パターン1: "1,000株以上"
    const pattern1 = sharesText.match(/(\d{1,3}(?:,\d{3})*)\s*株以上/);
    if (pattern1) {
      return parseInt(pattern1[1].replace(/,/g, ''));
    }
    
    // パターン2: "100株以上保有"
    const pattern2 = sharesText.match(/(\d+)\s*株以上保有/);
    if (pattern2) {
      return parseInt(pattern2[1]);
    }
    
    // パターン3: "500株から1,000株未満"
    const pattern3 = sharesText.match(/(\d+)\s*株から.*?未満/);
    if (pattern3) {
      return parseInt(pattern3[1]);
    }
    
    // パターン4: 最初に見つかった数字
    const match = sharesText.match(/(\d+)/);
    const shares = match ? parseInt(match[1]) : 100;
    
    // 明らかに少なすぎる場合は100株に修正
    if (shares < 10) {
      return 100;
    }
    
    // 明らかに多すぎる場合（銘柄コードが混入している可能性）
    if (shares > 10000) {
      return 100;
    }
    
    return shares;
  }

  estimateMonetaryValue(description) {
    // 金額が明記されている場合
    const patterns = [
      /(\d{1,3}(?:,\d{3})*)\s*円/,
      /(\d{1,3}(?:,\d{3})*)\s*円相当/,
      /(\d{1,3}(?:,\d{3})*)\s*円分/
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        const value = parseInt(match[1].replace(/,/g, ''));
        return Math.min(value, 5000); // 最大5000円に制限
      }
    }
    
    // QUOカードの場合
    if (description.includes('QUOカード')) {
      if (description.includes('1,000') || description.includes('1000')) return 1000;
      if (description.includes('500')) return 500;
      if (description.includes('2,000') || description.includes('2000')) return 2000;
      if (description.includes('3,000') || description.includes('3000')) return 3000;
    }
    
    return 1000; // デフォルト値
  }

  categorizeBenefit(description) {
    const categories = {
      'QUOカード': ['QUOカード', 'クオカード'],
      '商品券・ギフトカード': ['商品券', 'ギフト券', 'ギフトカード'],
      '割引券・優待券': ['割引', '優待券', '無料券'],
      '食事券・グルメ券': ['食事', 'お食事', 'レストラン', '飲食'],
      'カタログギフト': ['カタログ', 'ギフトカタログ'],
      '自社製品・サービス': ['自社製品', '自社商品', '当社製品'],
      '旅行・宿泊': ['宿泊', 'ホテル', '旅行'],
      '美容・健康': ['美容', '健康', 'ヘルスケア'],
      'エンタメ・レジャー': ['入場券', '施設利用', 'レジャー']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        return category;
      }
    }
    
    return 'その他';
  }

  detectLongTermHolding(description) {
    const longTermPattern = /(\d+)年以上.*?(\d{1,3}(?:,\d{3})*)\s*円/;
    const match = description.match(longTermPattern);
    
    if (match) {
      return {
        hasLongTerm: true,
        months: parseInt(match[1]) * 12,
        value: parseInt(match[2].replace(/,/g, ''))
      };
    }
    
    // その他の長期保有パターン
    if (description.includes('年以上') || description.includes('継続保有')) {
      return {
        hasLongTerm: true,
        months: 12, // デフォルト1年
        value: 0
      };
    }
    
    return {
      hasLongTerm: false,
      months: null,
      value: 0
    };
  }

  async updateStockInfo(stockCode, stockInfo) {
    if (!stockInfo) return;
    
    try {
      const stockName = stockInfo.name || `Unknown_${stockCode}`;
      await this.db.upsertStock({
        code: stockCode,
        name: stockName,
        market: stockInfo.market || 'unknown',
        sector: null,
        japanese_name: stockInfo.name // Yahoo Finance returns Japanese names for JP stocks
      });
    } catch (error) {
      // エラーでも続行
    }
  }

  displayProgress() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    const rate = this.stats.processed / elapsed;
    const remaining = (this.stats.total - this.stats.processed) / rate;
    
    console.log(`\n📈 進捗: ${this.stats.processed}/${this.stats.total} (${((this.stats.processed / this.stats.total) * 100).toFixed(1)}%) - ${rate.toFixed(0)} 銘柄/分`);
    console.log(`✅ 成功: ${this.stats.successful}, ❌ エラー: ${this.stats.errors}, 📭 データなし: ${this.stats.noData}`);
    console.log(`🌐 アクティブワーカー: ${this.activeWorkers}`);
    console.log(`⏱️ 推定残り時間: ${remaining.toFixed(0)}分\n`);
  }

  displayFinalResults() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    
    console.log('\n🎉 高速並行スクレイピング完了！');
    console.log('📊 処理結果:');
    console.log(`  ✅ 成功: ${this.stats.successful}/${this.stats.total} (${((this.stats.successful / this.stats.total) * 100).toFixed(1)}%)`);
    console.log(`  ❌ エラー: ${this.stats.errors}/${this.stats.total} (${((this.stats.errors / this.stats.total) * 100).toFixed(1)}%)`);
    console.log(`  📭 データなし: ${this.stats.noData}/${this.stats.total} (${((this.stats.noData / this.stats.total) * 100).toFixed(1)}%)`);
    console.log(`  ⏱️ 所要時間: ${elapsed.toFixed(1)}分`);
    console.log(`  📈 平均処理速度: ${(this.stats.processed / elapsed).toFixed(0)} 銘柄/分`);
  }

  async cleanupBrowsers() {
    console.log('\n🧹 ブラウザをクリーンアップ中...');
    
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        console.error('ブラウザクローズエラー:', error.message);
      }
    }
    
    console.log('✅ クリーンアップ完了');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 実行
const scraper = new FastResumeScraper({
  maxBrowsers: 4,        // 4ブラウザで並行処理
  requestDelay: 3000,    // 各ブラウザは3秒間隔でアクセス
  browserTimeout: 60000  // タイムアウト60秒
});

scraper.startFastScraping()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ 致命的エラー:', err);
    process.exit(1);
  });