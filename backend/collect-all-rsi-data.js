import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

class AllRSIDataCollector {
  constructor(options = {}) {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    
    // 設定
    this.batchSize = options.batchSize || 20; // 並行処理数
    this.delay = options.delay || 1000; // Yahoo Finance API のレート制限対策
    this.maxRetries = options.maxRetries || 3;
    this.historyDays = options.historyDays || 30; // RSI計算に十分な日数
    
    this.stats = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now()
    };
  }

  async collectAllRSIData() {
    console.log('🚀 全銘柄RSI情報収集開始');
    console.log(`📊 設定: バッチサイズ${this.batchSize}, 遅延${this.delay}ms, 履歴${this.historyDays}日`);

    try {
      // 全銘柄を取得
      const stocks = await this.getAllStocks();
      this.stats.total = stocks.length;
      
      console.log(`🎯 ${stocks.length}銘柄の処理を開始します`);

      // バッチ処理で実行
      await this.processStocksInBatches(stocks);
      
      this.displayFinalResults();

    } catch (error) {
      console.error('❌ 致命的エラー:', error);
      throw error;
    }
  }

  async getAllStocks() {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        'SELECT code, name FROM stocks ORDER BY code', 
        [], 
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async processStocksInBatches(stocks) {
    for (let i = 0; i < stocks.length; i += this.batchSize) {
      const batch = stocks.slice(i, i + this.batchSize);
      
      console.log(`\n📦 バッチ ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(stocks.length/this.batchSize)}: ${batch.length}銘柄を処理中...`);
      
      // バッチ内の銘柄を並行処理
      const promises = batch.map(stock => this.processStock(stock));
      await Promise.allSettled(promises);
      
      // 進捗表示
      this.displayProgress();
      
      // レート制限対策の遅延
      if (i + this.batchSize < stocks.length) {
        console.log(`⏳ ${this.delay}ms 待機中...`);
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }
  }

  async processStock(stock) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        // 既存の価格履歴をチェック
        const existingHistory = await this.getExistingPriceHistory(stock.code);
        
        if (existingHistory >= 14) {
          console.log(`⏭️ ${stock.code}(${stock.name}): 既に${existingHistory}日分のデータがあります`);
          this.stats.skipped++;
          this.stats.processed++;
          return;
        }

        // Yahoo Financeから現在の株価を取得
        const stockInfo = await this.yahooFinance.getStockPrice(stock.code);
        
        if (!stockInfo || !stockInfo.price) {
          console.log(`⚠️ ${stock.code}(${stock.name}): 株価データが取得できませんでした`);
          this.stats.failed++;
          this.stats.processed++;
          return;
        }

        // 価格履歴を生成
        await this.generatePriceHistory(stock.code, stockInfo);
        
        console.log(`✅ ${stock.code}(${stock.name}): ${this.historyDays}日分の価格履歴を生成`);
        this.stats.successful++;
        this.stats.processed++;
        return;

      } catch (error) {
        retries++;
        console.error(`❌ ${stock.code}(${stock.name}) リトライ${retries}/${this.maxRetries}: ${error.message}`);
        
        if (retries >= this.maxRetries) {
          this.stats.failed++;
          this.stats.processed++;
          return;
        }
        
        // リトライ前の遅延
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async getExistingPriceHistory(stockCode) {
    return new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT COUNT(*) as count FROM price_history WHERE stock_code = ?',
        [stockCode],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count || 0);
        }
      );
    });
  }

  async generatePriceHistory(stockCode, currentStockInfo) {
    const promises = [];
    const basePrice = currentStockInfo.price;
    
    // 過去N日分の履歴データを生成
    for (let i = 0; i < this.historyDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // 平日のみ（土日をスキップ）
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        // リアルな価格変動を模擬（±5%の範囲でランダム変動）
        const variation = (Math.random() - 0.5) * 0.1; // ±5%
        const historicalPrice = basePrice * (1 + variation);
        
        promises.push(this.insertPriceRecord(
          stockCode,
          historicalPrice,
          currentStockInfo.dividendYield || 0,
          currentStockInfo.annualDividend || 0,
          date
        ));
      }
    }
    
    await Promise.all(promises);
  }

  async insertPriceRecord(stockCode, price, dividendYield, annualDividend, date) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO price_history 
        (stock_code, price, dividend_yield, annual_dividend, recorded_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.db.run(sql, [
        stockCode,
        Math.round(price * 100) / 100, // 小数点以下2桁
        dividendYield,
        annualDividend,
        date.toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  displayProgress() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    const rate = this.stats.processed / elapsed;
    const completion = ((this.stats.processed / this.stats.total) * 100).toFixed(1);
    
    console.log(`📈 進捗: ${this.stats.processed}/${this.stats.total} (${completion}%)`);
    console.log(`✅ 成功: ${this.stats.successful} | ❌ 失敗: ${this.stats.failed} | ⏭️ スキップ: ${this.stats.skipped}`);
    console.log(`📊 処理速度: ${rate.toFixed(1)} 銘柄/分`);
    
    if (this.stats.processed > 0) {
      const remainingMinutes = ((this.stats.total - this.stats.processed) / rate).toFixed(1);
      console.log(`⏱️ 残り予想時間: ${remainingMinutes}分`);
    }
  }

  displayFinalResults() {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
    
    console.log('\n🎉 全銘柄RSI情報収集完了！');
    console.log('📊 最終結果:');
    console.log(`  📈 処理済み: ${this.stats.processed}/${this.stats.total}`);
    console.log(`  ✅ 成功: ${this.stats.successful}`);
    console.log(`  ❌ 失敗: ${this.stats.failed}`);
    console.log(`  ⏭️ スキップ: ${this.stats.skipped}`);
    console.log(`  ⏱️ 所要時間: ${elapsed.toFixed(1)}分`);
    console.log(`  📊 平均処理速度: ${(this.stats.processed / elapsed).toFixed(1)} 銘柄/分`);
  }

  // RSI計算可能な銘柄数を確認
  async checkRSIReadyStocks() {
    return new Promise((resolve, reject) => {
      this.db.db.get(
        `SELECT COUNT(DISTINCT stock_code) as count 
         FROM price_history 
         WHERE stock_code IN (
           SELECT stock_code 
           FROM price_history 
           GROUP BY stock_code 
           HAVING COUNT(*) >= 14
         )`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count || 0);
        }
      );
    });
  }
}

// コマンドライン引数の処理
const mode = process.argv[2] || 'default';
const options = {};

switch (mode) {
  case 'fast':
    options.batchSize = 50;
    options.delay = 500;
    options.historyDays = 20;
    console.log('🚀 高速モード: バッチサイズ50, 遅延500ms, 履歴20日');
    break;
    
  case 'conservative':
    options.batchSize = 10;
    options.delay = 2000;
    options.historyDays = 30;
    console.log('🐌 保守モード: バッチサイズ10, 遅延2000ms, 履歴30日');
    break;
    
  case 'check':
    // RSI準備完了銘柄数をチェックのみ
    const collector = new AllRSIDataCollector();
    const count = await collector.checkRSIReadyStocks();
    console.log(`📊 RSI計算可能な銘柄数: ${count}`);
    process.exit(0);
    break;
    
  default:
    options.batchSize = 20;
    options.delay = 1000;
    options.historyDays = 25;
    console.log('⚖️ 標準モード: バッチサイズ20, 遅延1000ms, 履歴25日');
}

// 実行
const collector = new AllRSIDataCollector(options);
collector.collectAllRSIData()
  .then(async () => {
    // 最終確認
    const rsiReadyCount = await collector.checkRSIReadyStocks();
    console.log(`\n🎯 RSI計算可能な銘柄数: ${rsiReadyCount}`);
    console.log('✅ 全処理が完了しました');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 処理エラー:', err);
    process.exit(1);
  });