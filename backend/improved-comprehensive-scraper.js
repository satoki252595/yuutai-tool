import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { JPXDataFetcher } from './jpx-data-fetcher.js';
import os from 'os';

class ImprovedComprehensiveScraper {
  constructor(options = {}) {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.jpxFetcher = new JPXDataFetcher();
    
    // 並行処理設定（6ブラウザに増強）
    this.maxBrowsers = options.maxBrowsers || 6;
    this.requestDelay = options.requestDelay || 3000;
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
  }

  async resetAndScrapeAll() {
    console.log('🚀 完全リセット＆改良版スクレイピング開始');
    
    // ステップ1: データベース初期化
    await this.resetDatabase();
    
    // ステップ2: 基本銘柄リストの取得
    await this.loadStockList();
    
    // ステップ3: 改良版並行スクレイピング
    await this.improvedParallelScraping();
    
    console.log('🎉 全処理完了！');
  }

  async resetDatabase() {
    console.log('🔄 データベース初期化中...');
    
    return new Promise((resolve, reject) => {
      // 既存テーブルをドロップ
      const dropTables = [
        'DROP TABLE IF EXISTS shareholder_benefits',
        'DROP TABLE IF EXISTS price_history',
        'DROP TABLE IF EXISTS stocks'
      ];
      
      // 改良されたテーブル作成
      const createTables = [
        `CREATE TABLE stocks (
          code TEXT PRIMARY KEY,
          name TEXT,
          japanese_name TEXT,
          market TEXT,
          sector TEXT,
          industry TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        )`,
        
        `CREATE TABLE shareholder_benefits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_code TEXT,
          benefit_type TEXT,
          description TEXT,
          monetary_value INTEGER DEFAULT 0,
          min_shares INTEGER DEFAULT 100,
          holder_type TEXT DEFAULT '一般',
          ex_rights_month INTEGER DEFAULT 3,
          has_long_term_holding INTEGER DEFAULT 0,
          long_term_months INTEGER,
          long_term_value INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (stock_code) REFERENCES stocks (code)
        )`,
        
        `CREATE TABLE price_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_code TEXT,
          price REAL,
          dividend_yield REAL,
          annual_dividend REAL,
          data_source TEXT DEFAULT 'yahoo',
          recorded_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (stock_code) REFERENCES stocks (code)
        )`
      ];
      
      let completed = 0;
      const total = dropTables.length + createTables.length;
      
      const executeNext = () => {
        if (completed < dropTables.length) {
          this.db.db.run(dropTables[completed], (err) => {
            if (err && !err.message.includes('no such table')) {
              console.error('Drop error:', err);
            }
            completed++;
            executeNext();
          });
        } else if (completed < total) {
          const tableIndex = completed - dropTables.length;
          this.db.db.run(createTables[tableIndex], (err) => {
            if (err) {
              console.error('Create error:', err);
              reject(err);
              return;
            }
            completed++;
            if (completed === total) {
              console.log('✅ データベース初期化完了');
              resolve();
            } else {
              executeNext();
            }
          });
        }
      };
      
      executeNext();
    });
  }

  async loadStockList() {
    console.log('📋 JPX公式データから銘柄リスト取得中...');
    
    try {
      // JPXから最新データを取得
      let jpxData = await this.jpxFetcher.loadFromCache();
      
      if (!jpxData) {
        console.log('📥 JPXから最新データをダウンロード中...');
        const excelUrl = await this.jpxFetcher.getLatestExcelUrl();
        jpxData = await this.jpxFetcher.downloadAndParseExcel(excelUrl);
        await this.jpxFetcher.saveToCache(jpxData);
      } else {
        console.log('📦 キャッシュからJPXデータを読み込み');
        console.log(`  データ取得日: ${new Date(jpxData.fetchDate).toLocaleDateString()}`);
      }
      
      // 統計情報表示
      this.jpxFetcher.displayStatistics(jpxData);
      
      // サンプル実行のため最初の50銘柄のみ
      const sampleStocks = jpxData.stocks.slice(0, 50);
      
      console.log(`📊 ${sampleStocks.length}銘柄を処理対象に設定（サンプル実行）`);
      
      // データベースに保存
      let insertCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < sampleStocks.length; i += batchSize) {
        const batch = sampleStocks.slice(i, i + batchSize);
        await Promise.all(batch.map(stock => this.insertJPXStock(stock)));
        insertCount += batch.length;
      }
      
      console.log(`✅ ${sampleStocks.length}銘柄の登録完了`);
      
    } catch (error) {
      console.error('❌ JPXデータ取得エラー:', error.message);
      console.log('🔄 サンプル銘柄で代替実行します...');
      await this.loadSampleStocks();
    }
  }

  async insertJPXStock(stock) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT OR IGNORE INTO stocks (code, name, market, industry) VALUES (?, ?, ?, ?)`;
      this.db.db.run(sql, [
        stock.code,
        stock.name,
        stock.marketClass || 'unknown',
        stock.industry || null
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  generateAllStockCodes() {
    const stockCodes = [];
    
    // 日本の上場企業の銘柄コード範囲
    const ranges = [
      { start: 1301, end: 1400 },   // 食品
      { start: 1801, end: 1900 },   // 建設業
      { start: 2001, end: 2100 },   // 繊維製品
      { start: 2201, end: 2300 },   // 食品
      { start: 2501, end: 2600 },   // 食品
      { start: 2701, end: 2800 },   // 繊維製品
      { start: 2801, end: 2900 },   // 化学
      { start: 2901, end: 3000 },   // 化学
      { start: 3001, end: 3100 },   // 繊維製品
      { start: 3101, end: 3200 },   // 繊維製品
      { start: 3201, end: 3300 },   // ガラス・土石製品
      { start: 3301, end: 3400 },   // 鉄鋼
      { start: 3401, end: 3500 },   // 鉄鋼
      { start: 3501, end: 3600 },   // 鉄鋼
      { start: 3601, end: 3700 },   // 非鉄金属
      { start: 3701, end: 3800 },   // 金属製品
      { start: 3801, end: 3900 },   // 機械
      { start: 3901, end: 4000 },   // 機械
      { start: 4001, end: 4100 },   // 機械
      { start: 4101, end: 4200 },   // 機械
      { start: 4201, end: 4300 },   // 機械
      { start: 4301, end: 4400 },   // 機械
      { start: 4401, end: 4500 },   // その他製品
      { start: 4501, end: 4600 },   // 医薬品
      { start: 4601, end: 4700 },   // 医薬品
      { start: 4701, end: 4800 },   // その他製品
      { start: 4801, end: 4900 },   // その他製品
      { start: 4901, end: 5000 },   // 化学
      { start: 5001, end: 5100 },   // 石油・石炭製品
      { start: 5101, end: 5200 },   // ゴム製品
      { start: 5201, end: 5300 },   // ガラス・土石製品
      { start: 5301, end: 5400 },   // 鉄鋼
      { start: 5401, end: 5500 },   // 非鉄金属
      { start: 5501, end: 5600 },   // 金属製品
      { start: 5601, end: 5700 },   // 繊維製品
      { start: 5701, end: 5800 },   // 繊維製品
      { start: 5801, end: 5900 },   // 繊維製品
      { start: 5901, end: 6000 },   // その他製品
      { start: 6001, end: 6100 },   // 機械
      { start: 6101, end: 6200 },   // 機械
      { start: 6201, end: 6300 },   // 機械
      { start: 6301, end: 6400 },   // 機械
      { start: 6401, end: 6500 },   // 機械
      { start: 6501, end: 6600 },   // 電気機器
      { start: 6601, end: 6700 },   // 電気機器
      { start: 6701, end: 6800 },   // 電気機器
      { start: 6801, end: 6900 },   // 電気機器
      { start: 6901, end: 7000 },   // 電気機器
      { start: 7001, end: 7100 },   // 輸送用機器
      { start: 7101, end: 7200 },   // 輸送用機器
      { start: 7201, end: 7300 },   // 輸送用機器
      { start: 7301, end: 7400 },   // 輸送用機器
      { start: 7401, end: 7500 },   // 精密機器
      { start: 7501, end: 7600 },   // 精密機器
      { start: 7601, end: 7700 },   // その他製品
      { start: 7701, end: 7800 },   // 精密機器
      { start: 7801, end: 7900 },   // その他製品
      { start: 7901, end: 8000 },   // その他製品
      { start: 8001, end: 8100 },   // 卸売業
      { start: 8101, end: 8200 },   // 卸売業
      { start: 8201, end: 8300 },   // 卸売業
      { start: 8301, end: 8400 },   // 小売業
      { start: 8401, end: 8500 },   // 小売業
      { start: 8501, end: 8600 },   // 銀行業
      { start: 8601, end: 8700 },   // その他金融業
      { start: 8701, end: 8800 },   // その他金融業
      { start: 8801, end: 8900 },   // 不動産業
      { start: 8901, end: 9000 },   // サービス業
      { start: 9001, end: 9100 },   // 陸運業
      { start: 9101, end: 9200 },   // 海運業
      { start: 9201, end: 9300 },   // 空運業
      { start: 9301, end: 9400 },   // 倉庫・運輸関連業
      { start: 9401, end: 9500 },   // 情報・通信業
      { start: 9501, end: 9600 },   // 電気・ガス業
      { start: 9601, end: 9700 },   // サービス業
      { start: 9701, end: 9800 },   // サービス業
      { start: 9801, end: 9900 },   // サービス業
      { start: 9901, end: 9999 }    // サービス業
    ];
    
    // 各範囲から銘柄コードを生成
    for (const range of ranges) {
      for (let code = range.start; code <= range.end; code++) {
        stockCodes.push(String(code));
      }
    }
    
    return stockCodes;
  }

  normalizeStockCode(code) {
    // 銘柄コードを4桁に正規化
    const cleanCode = String(code).replace(/[^\d]/g, '');
    return cleanCode.padStart(4, '0');
  }

  async loadSampleStocks() {
    console.log('📋 サンプル銘柄で実行...');
    
    const sampleStocks = [
      { code: '1301', name: '極洋', market: 'プライム', industry: '食品' },
      { code: '1332', name: 'ニッスイ', market: 'プライム', industry: '食品' },
      { code: '1375', name: 'ユキグニファクトリー', market: 'スタンダード', industry: '食品' },
      { code: '1377', name: 'サカタのタネ', market: 'プライム', industry: '食品' },
      { code: '1379', name: 'ホクト', market: 'プライム', industry: '食品' },
      { code: '2914', name: 'ＪＴ', market: 'プライム', industry: '食品' },
      { code: '3382', name: 'セブン＆アイ・ホールディングス', market: 'プライム', industry: '小売業' },
      { code: '9001', name: '東武鉄道', market: 'プライム', industry: '陸運業' },
      { code: '9020', name: 'ＪＲ東日本', market: 'プライム', industry: '陸運業' },
      { code: '8267', name: 'イオン', market: 'プライム', industry: '小売業' }
    ];
    
    for (const stock of sampleStocks) {
      await this.insertStock(stock);
    }
    
    console.log(`📊 ${sampleStocks.length}銘柄でサンプル実行`);
  }

  async insertStock(stock) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT OR IGNORE INTO stocks (code, name, market, industry) VALUES (?, ?, ?, ?)`;
      this.db.db.run(sql, [stock.code, stock.name, stock.market, stock.industry], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async improvedParallelScraping() {
    console.log('🚀 改良版並行スクレイピング開始');
    
    // 全銘柄を取得
    const stocks = await this.getAllStocks();
    this.stats.total = stocks.length;
    
    console.log(`🎯 ${stocks.length}銘柄を処理開始`);
    
    // ブラウザプール作成
    await this.createBrowserPool();
    
    try {
      // 銘柄をワーカー数で分割
      const stocksPerWorker = Math.ceil(stocks.length / this.maxBrowsers);
      const workerPromises = [];
      
      for (let i = 0; i < this.maxBrowsers; i++) {
        const start = i * stocksPerWorker;
        const end = Math.min(start + stocksPerWorker, stocks.length);
        const workerStocks = stocks.slice(start, end);
        
        if (workerStocks.length > 0) {
          workerPromises.push(
            this.processStocksWithImprovedLogic(i, workerStocks)
          );
        }
      }
      
      await Promise.all(workerPromises);
      this.displayFinalResults();
      
    } finally {
      await this.cleanupBrowsers();
    }
  }

  async getAllStocks() {
    return new Promise((resolve, reject) => {
      this.db.db.all('SELECT code, name FROM stocks ORDER BY code', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async createBrowserPool() {
    console.log(`🌐 ${this.maxBrowsers}個のブラウザを起動中...`);
    
    for (let i = 0; i < this.maxBrowsers; i++) {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      
      this.browsers.push(browser);
      console.log(`✅ ブラウザ${i + 1} 起動完了`);
    }
  }

  async processStocksWithImprovedLogic(workerId, stocks) {
    const browser = this.browsers[workerId];
    if (!browser) return;
    
    console.log(`👷 ワーカー${workerId + 1}: ${stocks.length}銘柄の処理開始`);
    
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(this.browserTimeout);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    for (const stock of stocks) {
      try {
        await this.improvedScrapeStock(page, stock, workerId);
        await this.sleep(this.requestDelay);
      } catch (error) {
        console.error(`[W${workerId + 1}] ❌ ${stock.code}: ${error.message}`);
        this.stats.errors++;
      }
    }
    
    await page.close();
    console.log(`✅ ワーカー${workerId + 1}: 処理完了`);
  }

  async improvedScrapeStock(page, stock, workerId) {
    this.stats.processed++;
    
    const url = `https://minkabu.jp/stock/${stock.code}/yutai`;
    console.log(`[W${workerId + 1}] ${stock.code}: ${stock.name} 処理中...`);
    
    // Yahoo Financeから株価情報を取得
    let stockInfo = null;
    try {
      stockInfo = await this.yahooFinance.getStockPrice(stock.code);
      if (stockInfo) {
        await this.updateStockInfo(stock.code, stockInfo);
        await this.db.insertPriceHistory(stockInfo);
      }
    } catch (error) {
      // エラーでも続行
    }
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // 改良された優待情報抽出
    const benefits = await page.evaluate(() => {
      const benefitRows = [];
      
      // 全てのテーブルを取得
      const tables = document.querySelectorAll('.md_table');
      
      tables.forEach((table, tableIndex) => {
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const firstCell = cells[0]?.textContent?.trim() || '';
            const secondCell = cells[1]?.textContent?.trim() || '';
            const thirdCell = cells[2]?.textContent?.trim() || '';
            
            // 優待テーブルかどうかを判定
            const isValidBenefitRow = (
              // 1列目が株数指定（「◯◯株以上」の形）
              /\d+株以上/.test(firstCell) &&
              // 2列目が空でない
              secondCell.length > 0 &&
              // 計算式や証券会社名ではない
              !firstCell.includes('証券') &&
              !firstCell.includes('手数料') &&
              !secondCell.includes('手数料') &&
              !secondCell.includes('◎') &&
              !secondCell.includes('○') &&
              !secondCell.includes('詳しく') &&
              !secondCell.includes('円(') &&
              !secondCell.includes('利回り') &&
              // HTMLタグっぽい記号を除外
              !secondCell.includes('=') &&
              !firstCell.includes('=') &&
              // 数値のみの行を除外
              !/^\d+(\.\d+)?$/.test(secondCell) &&
              // 単位のみを除外
              secondCell !== '円' &&
              secondCell !== '%'
            );
            
            if (isValidBenefitRow) {
              benefitRows.push({
                tableIndex: tableIndex,
                requiredShares: firstCell,
                description: secondCell,
                notes: thirdCell,
                debugInfo: `Table${tableIndex}: "${firstCell}" -> "${secondCell}"`
              });
            }
          }
        });
      });
      
      return benefitRows;
    });
    
    if (benefits.length === 0) {
      this.stats.noData++;
      console.log(`[W${workerId + 1}] ⏭️ ${stock.code}: 有効な優待情報なし`);
      return;
    }
    
    // 検証：取得した優待情報をログ出力
    console.log(`[W${workerId + 1}] 📋 ${stock.code}: ${benefits.length}件の優待を検出`);
    benefits.forEach((benefit, index) => {
      console.log(`[W${workerId + 1}]   ${index + 1}. ${benefit.debugInfo}`);
    });
    
    // データベースに保存
    for (const benefit of benefits) {
      await this.saveBenefit(stock.code, benefit);
    }
    
    this.stats.successful++;
    
    if (this.stats.processed % 10 === 0) {
      this.displayProgress();
    }
  }

  async saveBenefit(stockCode, benefit) {
    const minShares = this.parseMinShares(benefit.requiredShares);
    const monetaryValue = this.estimateMonetaryValue(benefit.description);
    const benefitType = this.categorizeBenefit(benefit.description);
    const longTermInfo = this.detectLongTermHolding(benefit.description);
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO shareholder_benefits 
        (stock_code, benefit_type, description, monetary_value, min_shares, 
         has_long_term_holding, long_term_months, long_term_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        stockCode,
        benefitType,
        `${benefit.description} ${benefit.notes}`.trim(),
        monetaryValue,
        minShares,
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
    
    const pattern = sharesText.match(/(\d{1,3}(?:,\d{3})*)株以上/);
    if (pattern) {
      const shares = parseInt(pattern[1].replace(/,/g, ''));
      return Math.max(shares, 1); // 最小1株
    }
    
    return 100;
  }

  estimateMonetaryValue(description) {
    // 金額パターンマッチング
    const patterns = [
      /(\d{1,3}(?:,\d{3})*)円/,
      /(\d{1,3}(?:,\d{3})*)円相当/,
      /(\d{1,3}(?:,\d{3})*)円分/
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return parseInt(match[1].replace(/,/g, ''));
      }
    }
    
    // QUOカードの場合の推定
    if (description.includes('QUOカード')) {
      if (description.includes('1,000') || description.includes('1000')) return 1000;
      if (description.includes('500')) return 500;
      if (description.includes('2,000') || description.includes('2000')) return 2000;
      if (description.includes('3,000') || description.includes('3000')) return 3000;
    }
    
    return 1000; // デフォルト
  }

  categorizeBenefit(description) {
    const categories = {
      'QUOカード・図書カード': ['QUOカード', 'クオカード', '図書カード'],
      '商品券・ギフトカード': ['商品券', 'ギフト券', 'ギフトカード'],
      '割引券・優待券': ['割引', '優待券', '無料券', '入園料', '入館料'],
      '食事券・グルメ券': ['食事', 'お食事', 'レストラン', '飲食'],
      'カタログギフト': ['カタログ', 'ギフトカタログ'],
      '自社製品・商品': ['自社製品', '自社商品', '当社製品'],
      '交通・乗車券': ['回数券', '乗車券', '鉄道', '地下鉄'],
      '旅行・宿泊': ['宿泊', 'ホテル', '旅行'],
      '美容・健康': ['美容', '健康', 'ヘルスケア'],
      'エンタメ・レジャー': ['入場券', '施設利用', 'レジャー', '動物園', '水族館', '博物館', 'スカイツリー']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        return category;
      }
    }
    
    return 'その他';
  }

  detectLongTermHolding(description) {
    // 改良された長期保有検出
    const patterns = [
      /(\d+)年以上.*?(\d{1,3}(?:,\d{3})*)円/,
      /(\d+)年以上保有.*?(\d{1,3}(?:,\d{3})*)円/,
      /継続保有.*?(\d+)年.*?(\d{1,3}(?:,\d{3})*)円/
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return {
          hasLongTerm: true,
          months: parseInt(match[1]) * 12,
          value: parseInt(match[2].replace(/,/g, ''))
        };
      }
    }
    
    if (description.includes('年以上') || description.includes('継続保有')) {
      return {
        hasLongTerm: true,
        months: 12,
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
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE stocks 
        SET name = ?, japanese_name = ?, market = ?, updated_at = datetime('now')
        WHERE code = ?
      `;
      
      this.db.db.run(sql, [
        stockInfo.name,
        stockInfo.name, // Yahoo Financeの日本語名
        stockInfo.market || 'unknown',
        stockCode
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  displayProgress() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    const rate = this.stats.processed / elapsed;
    
    console.log(`\n📈 進捗: ${this.stats.processed}/${this.stats.total} (${((this.stats.processed / this.stats.total) * 100).toFixed(1)}%)`);
    console.log(`✅ 成功: ${this.stats.successful}, ❌ エラー: ${this.stats.errors}, 📭 データなし: ${this.stats.noData}`);
    console.log(`📈 処理速度: ${rate.toFixed(1)} 銘柄/分\n`);
  }

  displayFinalResults() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    
    console.log('\n🎉 改良版スクレイピング完了！');
    console.log('📊 処理結果:');
    console.log(`  ✅ 成功: ${this.stats.successful}/${this.stats.total}`);
    console.log(`  ❌ エラー: ${this.stats.errors}/${this.stats.total}`);
    console.log(`  📭 データなし: ${this.stats.noData}/${this.stats.total}`);
    console.log(`  ⏱️ 所要時間: ${elapsed.toFixed(1)}分`);
  }

  async cleanupBrowsers() {
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        console.error('ブラウザクローズエラー:', error.message);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 実行（6ブラウザで並行処理）
const scraper = new ImprovedComprehensiveScraper({
  maxBrowsers: 6,
  requestDelay: 2000,
  browserTimeout: 45000
});

scraper.resetAndScrapeAll()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ 致命的エラー:', err);
    process.exit(1);
  });