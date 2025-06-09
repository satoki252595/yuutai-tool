import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import puppeteer from 'puppeteer';

class EnhancedDataCollector {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
  }

  /**
   * みんかぶから配当情報をスクレイピング
   */
  async scrapeMinkabuDividend(stockCode) {
    let browser;
    try {
      browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // User-Agentを設定してブロックを回避
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const url = `https://minkabu.jp/stock/${stockCode}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // 配当利回りを取得
      const dividendData = await page.evaluate(() => {
        try {
          // 配当利回りの要素を探す（複数のセレクタを試行）
          const selectors = [
            '[data-testid=\"dividend-yield\"]',
            '.md_stock_board_dividend_yield',
            '.stock-board__dividend-yield',
            'td:contains(\"配当利回り\")',
            '.yield'
          ];
          
          let dividendYield = null;
          let annualDividend = null;
          
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              const text = element.textContent || element.innerText;
              const match = text.match(/([0-9.]+)%/);
              if (match) {
                dividendYield = parseFloat(match[1]);
                break;
              }
            }
          }
          
          // 年間配当金額を取得
          const dividendSelectors = [
            '[data-testid=\"annual-dividend\"]',
            '.md_stock_board_dividend',
            '.stock-board__dividend',
            'td:contains(\"配当金\")'
          ];
          
          for (const selector of dividendSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              const text = element.textContent || element.innerText;
              const match = text.match(/([0-9,.]+)円/);
              if (match) {
                annualDividend = parseFloat(match[1].replace(/,/g, ''));
                break;
              }
            }
          }
          
          return { dividendYield, annualDividend };
        } catch (error) {
          console.error('スクレイピングエラー:', error);
          return { dividendYield: null, annualDividend: null };
        }
      });
      
      return dividendData;
      
    } catch (error) {
      console.error(`みんかぶスクレイピングエラー (${stockCode}):`, error.message);
      return { dividendYield: null, annualDividend: null };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 複数ソースから配当データを取得
   */
  async getEnhancedDividendData(stockCode) {
    const results = {
      yahoo: null,
      minkabu: null,
      final: null
    };

    try {
      // Yahoo Financeから取得
      console.log(`Yahoo Finance APIから ${stockCode} の配当データを取得中...`);
      const yahooData = await this.yahooFinance.getStockPrice(stockCode);
      results.yahoo = {
        dividendYield: yahooData.dividendYield || 0,
        price: yahooData.price
      };
    } catch (error) {
      console.error(`Yahoo Finance エラー (${stockCode}):`, error.message);
    }

    try {
      // みんかぶからスクレイピング（レート制限のため少し待機）
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`みんかぶから ${stockCode} の配当データをスクレイピング中...`);
      const minkabuData = await this.scrapeMinkabuDividend(stockCode);
      results.minkabu = minkabuData;
    } catch (error) {
      console.error(`みんかぶ エラー (${stockCode}):`, error.message);
    }

    // データの優先度: みんかぶ > Yahoo Finance
    let finalDividendYield = 0;
    let finalAnnualDividend = 0;
    let dataSource = 'none';

    if (results.minkabu?.dividendYield !== null && results.minkabu?.dividendYield > 0) {
      finalDividendYield = results.minkabu.dividendYield;
      finalAnnualDividend = results.minkabu.annualDividend || 0;
      dataSource = 'minkabu';
    } else if (results.yahoo?.dividendYield !== null && results.yahoo?.dividendYield > 0) {
      finalDividendYield = results.yahoo.dividendYield;
      dataSource = 'yahoo_finance';
    }

    results.final = {
      dividendYield: finalDividendYield,
      annualDividend: finalAnnualDividend,
      dataSource: dataSource,
      price: results.yahoo?.price || 0
    };

    return results;
  }

  /**
   * 配当データをデータベースに保存
   */
  async saveDividendData(stockCode, dividendData) {
    try {
      // price_history テーブルに保存
      await this.insertEnhancedPriceHistory({
        code: stockCode,
        price: dividendData.price,
        dividendYield: dividendData.dividendYield,
        annualDividend: dividendData.annualDividend,
        dataSource: dividendData.dataSource
      });

      // 年間配当金がある場合は dividend_history テーブルにも保存
      if (dividendData.annualDividend && dividendData.annualDividend > 0) {
        await this.insertDividendHistory({
          stockCode: stockCode,
          dividendAmount: dividendData.annualDividend,
          dividendType: 'annual_estimate',
          dataSource: dividendData.dataSource
        });
      }

    } catch (error) {
      console.error(`配当データ保存エラー (${stockCode}):`, error);
    }
  }

  /**
   * 拡張された価格履歴の保存
   */
  async insertEnhancedPriceHistory(priceData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO price_history (stock_code, price, dividend_yield, annual_dividend, data_source)
        VALUES (?, ?, ?, ?, ?)
      `;
      this.db.db.run(sql, [
        priceData.code,
        priceData.price,
        priceData.dividendYield,
        priceData.annualDividend || 0,
        priceData.dataSource || 'unknown'
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * 配当履歴の保存
   */
  async insertDividendHistory(dividendData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO dividend_history (stock_code, dividend_date, dividend_amount, dividend_type, data_source)
        VALUES (?, ?, ?, ?, ?)
      `;
      this.db.db.run(sql, [
        dividendData.stockCode,
        new Date().toISOString().split('T')[0], // 今日の日付
        dividendData.dividendAmount,
        dividendData.dividendType || 'regular',
        dividendData.dataSource || 'manual'
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * 全銘柄の配当データを更新
   */
  async updateAllDividendData() {
    try {
      const stockCodes = await this.getAllStockCodes();
      console.log(`${stockCodes.length} 銘柄の配当データ更新を開始します`);

      let processedCount = 0;
      let errorCount = 0;

      for (const stockCode of stockCodes) {
        try {
          console.log(`\n[${processedCount + 1}/${stockCodes.length}] ${stockCode} を処理中...`);
          
          const dividendData = await this.getEnhancedDividendData(stockCode);
          
          if (dividendData.final.dataSource !== 'none') {
            await this.saveDividendData(stockCode, dividendData.final);
            console.log(`✓ ${stockCode}: 配当利回り ${dividendData.final.dividendYield}% (${dividendData.final.dataSource})`);
          } else {
            console.log(`⚠ ${stockCode}: 配当データが取得できませんでした`);
          }
          
          processedCount++;
          
          // レート制限対策
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (error) {
          console.error(`✗ ${stockCode}: エラー - ${error.message}`);
          errorCount++;
        }
      }

      console.log(`\n配当データ更新完了:`);
      console.log(`- 処理済み: ${processedCount} 銘柄`);
      console.log(`- エラー: ${errorCount} 銘柄`);

    } catch (error) {
      console.error('配当データ更新中にエラーが発生:', error);
    }
  }

  /**
   * 全ての銘柄コードを取得
   */
  async getAllStockCodes() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT DISTINCT code FROM stocks ORDER BY code`;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.code));
      });
    });
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const collector = new EnhancedDataCollector();
  
  try {
    const targetCodes = process.argv.slice(2);
    
    if (targetCodes.length > 0) {
      // 指定された銘柄のみ処理
      console.log(`指定銘柄 [${targetCodes.join(', ')}] の配当データを更新します`);
      for (const code of targetCodes) {
        const data = await collector.getEnhancedDividendData(code);
        await collector.saveDividendData(code, data.final);
        console.log(`${code}: 完了`);
      }
    } else {
      // 全銘柄を処理
      await collector.updateAllDividendData();
    }
  } catch (error) {
    console.error('処理中にエラーが発生:', error);
  } finally {
    collector.close();
  }
}