import { Database } from './database.js';
import { ShareholderBenefitScraper } from './scraper.js';
import { JPXDataFetcher } from './jpx-data-fetcher.js';
import { RSICalculator } from './rsiCalculator.js';

class Setup {
  constructor() {
    this.db = new Database();
    this.scraper = new ShareholderBenefitScraper();
    this.jpxFetcher = new JPXDataFetcher();
    this.rsiCalculator = new RSICalculator();
  }

  async run(options = {}) {
    const { 
      reset = false, 
      stockCodes = null,
      industry = null,
      limit = null 
    } = options;

    try {
      if (reset) {
        console.log('📌 データベースリセット中...');
        await this.resetDatabase();
      }

      let stocks;
      if (stockCodes) {
        stocks = stockCodes.map(code => ({ code }));
      } else {
        console.log('📌 JPXから銘柄データ取得中...');
        const jpxData = await this.jpxFetcher.fetchAndCacheData();
        stocks = jpxData.stocks;

        if (industry) {
          stocks = stocks.filter(s => s.industry === industry);
        }
        if (limit) {
          stocks = stocks.slice(0, limit);
        }
      }

      console.log(`📌 ${stocks.length}銘柄の処理を開始します`);

      const codes = stocks.map(s => s.code);
      await this.scraper.scrapeStocks(codes);

      console.log('📌 RSI計算中...');
      await this.calculateRSI();

      console.log('✅ セットアップ完了');
      this.showStats();

    } catch (error) {
      console.error('❌ エラー:', error);
    } finally {
      this.db.close();
    }
  }

  async resetDatabase() {
    return new Promise((resolve, reject) => {
      this.db.db.serialize(() => {
        this.db.db.run('PRAGMA foreign_keys = OFF');
        
        const tables = ['price_history', 'shareholder_benefits', 'stocks'];
        tables.forEach(table => {
          this.db.db.run(`DELETE FROM ${table}`);
        });

        this.db.db.run('PRAGMA foreign_keys = ON', err => {
          err ? reject(err) : resolve();
        });
      });
    });
  }

  async calculateRSI() {
    const stocks = await new Promise((resolve, reject) => {
      this.db.db.all('SELECT DISTINCT code FROM stocks', (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });

    for (const stock of stocks) {
      try {
        const rsi = await this.rsiCalculator.calculate(stock.code);
        if (rsi !== null) {
          await this.updateRSI(stock.code, rsi);
        }
      } catch (error) {
        // Skip errors
      }
    }
  }

  updateRSI(stockCode, rsiValue) {
    return new Promise((resolve, reject) => {
      this.db.db.run(
        'UPDATE stocks SET rsi = ? WHERE code = ?',
        [rsiValue, stockCode],
        err => err ? reject(err) : resolve()
      );
    });
  }

  async showStats() {
    const stats = await this.getStats();
    console.log('\n📊 統計情報:');
    console.log(`  銘柄数: ${stats.stocks}`);
    console.log(`  優待情報: ${stats.benefits}`);
    console.log(`  RSI計算済: ${stats.rsiCalculated}`);
  }

  getStats() {
    return new Promise((resolve) => {
      const stats = {};
      
      this.db.db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
        stats.stocks = row?.count || 0;
        
        this.db.db.get('SELECT COUNT(*) as count FROM shareholder_benefits', (err, row) => {
          stats.benefits = row?.count || 0;
          
          this.db.db.get('SELECT COUNT(*) as count FROM stocks WHERE rsi IS NOT NULL', (err, row) => {
            stats.rsiCalculated = row?.count || 0;
            resolve(stats);
          });
        });
      });
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new Setup();
  
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reset') options.reset = true;
    if (args[i] === '--industry' && args[i + 1]) options.industry = args[i + 1];
    if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[i + 1]);
    if (args[i] === '--codes' && args[i + 1]) {
      options.stockCodes = args[i + 1].split(',');
    }
  }
  
  setup.run(options).catch(console.error);
}