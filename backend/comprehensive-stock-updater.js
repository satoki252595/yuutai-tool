import { Database } from './database.js';
import { JPXDataFetcher } from './jpx-data-fetcher.js';
import { YahooFinanceService } from './yahooFinance.js';

export class ComprehensiveStockUpdater {
  constructor() {
    this.db = new Database();
    this.jpxFetcher = new JPXDataFetcher();
    this.yahooFinance = new YahooFinanceService();
  }

  /**
   * 全銘柄データの包括的更新
   */
  async updateAllStocks() {
    console.log('🚀 全銘柄データの包括的更新を開始します...\n');

    try {
      // Step 1: JPXから最新の銘柄リストを取得
      console.log('📥 Step 1: JPXから最新銘柄データを取得中...');
      const jpxData = await this.jpxFetcher.fetchLatestData();
      console.log(`✅ ${jpxData.totalCount} 銘柄のデータを取得\n`);

      // Step 2: データベースに銘柄情報を更新/挿入
      console.log('💾 Step 2: データベースに銘柄情報を更新中...');
      const updateStats = await this.updateStockDatabase(jpxData.stocks);
      console.log(`✅ 銘柄データベース更新完了: ${updateStats.inserted} 新規, ${updateStats.updated} 更新\n`);

      // Step 3: 株価データの更新（バッチ処理）
      console.log('💰 Step 3: 株価データをバッチ更新中...');
      const priceStats = await this.updatePricesInBatches(jpxData.stocks);
      console.log(`✅ 株価更新完了: ${priceStats.success} 成功, ${priceStats.failed} 失敗\n`);

      // Step 4: 統計情報の表示
      await this.displayFinalStatistics();

      console.log('🎉 全銘柄データの更新が完了しました!');

    } catch (error) {
      console.error('❌ 全銘柄更新中にエラーが発生:', error);
      throw error;
    }
  }

  /**
   * 銘柄データをデータベースに更新/挿入
   */
  async updateStockDatabase(stocks) {
    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    console.log(`${stocks.length} 銘柄を処理中...`);

    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      
      try {
        const existed = await this.checkStockExists(stock.code);
        
        if (existed) {
          await this.updateStockInfo(stock);
          updatedCount++;
        } else {
          await this.insertNewStock(stock);
          insertedCount++;
        }

        // 進捗表示（100銘柄ごと）
        if ((i + 1) % 100 === 0) {
          console.log(`  進捗: ${i + 1}/${stocks.length} (${Math.round((i + 1)/stocks.length*100)}%)`);
        }

      } catch (error) {
        console.error(`❌ 銘柄 ${stock.code} の処理エラー:`, error.message);
        errorCount++;
      }
    }

    return { inserted: insertedCount, updated: updatedCount, errors: errorCount };
  }

  /**
   * 銘柄の存在確認
   */
  async checkStockExists(code) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT COUNT(*) as count FROM stocks WHERE code = ?`;
      this.db.db.get(sql, [code], (err, row) => {
        if (err) reject(err);
        else resolve(row.count > 0);
      });
    });
  }

  /**
   * 新規銘柄の挿入
   */
  async insertNewStock(stock) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO stocks (code, name, japanese_name, market, sector, industry, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `;
      
      this.db.db.run(sql, [
        stock.code,
        stock.name,
        stock.name, // japanese_nameとしても設定
        this.extractMarketName(stock.marketClass),
        stock.industryDetail || '',
        stock.industry || ''
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * 既存銘柄の更新
   */
  async updateStockInfo(stock) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE stocks 
        SET name = ?, japanese_name = ?, market = ?, sector = ?, industry = ?, updated_at = datetime('now')
        WHERE code = ?
      `;
      
      this.db.db.run(sql, [
        stock.name,
        stock.name, // japanese_nameとしても設定
        this.extractMarketName(stock.marketClass),
        stock.industryDetail || '',
        stock.industry || '',
        stock.code
      ], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  /**
   * 市場名を短縮形に変換
   */
  extractMarketName(marketClass) {
    if (marketClass.includes('プライム')) return 'プライム';
    if (marketClass.includes('スタンダード')) return 'スタンダード';
    if (marketClass.includes('グロース')) return 'グロース';
    return marketClass;
  }

  /**
   * 株価データをバッチで更新
   */
  async updatePricesInBatches(stocks, batchSize = 50) {
    const allCodes = stocks.map(s => s.code);
    let successCount = 0;
    let failedCount = 0;

    console.log(`${allCodes.length} 銘柄の株価を ${batchSize} 銘柄ずつバッチ更新中...`);

    for (let i = 0; i < allCodes.length; i += batchSize) {
      const batch = allCodes.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allCodes.length / batchSize);
      
      console.log(`  バッチ ${batchNumber}/${totalBatches}: ${batch.length} 銘柄を処理中...`);

      // バッチ内で並列処理
      const batchPromises = batch.map(async (code) => {
        try {
          const priceData = await this.yahooFinance.getStockPrice(code);
          await this.savePriceData(priceData);
          return { code, success: true };
        } catch (error) {
          console.warn(`    ⚠️ ${code}: 株価取得失敗 - ${error.message}`);
          return { code, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      const batchSuccess = batchResults.filter(r => r.success).length;
      const batchFailed = batchResults.filter(r => !r.success).length;
      
      successCount += batchSuccess;
      failedCount += batchFailed;

      console.log(`    結果: ${batchSuccess} 成功, ${batchFailed} 失敗`);

      // API制限対策（バッチ間で待機）
      if (i + batchSize < allCodes.length) {
        console.log('    5秒待機中...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return { success: successCount, failed: failedCount };
  }

  /**
   * 株価データの保存
   */
  async savePriceData(priceData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO price_history (stock_code, price, dividend_yield, data_source)
        VALUES (?, ?, ?, ?)
      `;
      
      this.db.db.run(sql, [
        priceData.code,
        priceData.price || 0,
        priceData.dividendYield || 0,
        'yahoo_finance'
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * 最終統計情報の表示
   */
  async displayFinalStatistics() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_stocks,
          COUNT(japanese_name) as with_japanese_name,
          COUNT(industry) as with_industry,
          (SELECT COUNT(DISTINCT stock_code) FROM price_history) as with_price_data,
          (SELECT COUNT(*) FROM shareholder_benefits) as total_benefits
        FROM stocks
      `;
      
      this.db.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          console.log('📊 最終統計情報:');
          console.log(`   総銘柄数: ${row.total_stocks}`);
          console.log(`   日本語名あり: ${row.with_japanese_name} (${Math.round(row.with_japanese_name/row.total_stocks*100)}%)`);
          console.log(`   業界情報あり: ${row.with_industry} (${Math.round(row.with_industry/row.total_stocks*100)}%)`);
          console.log(`   株価データあり: ${row.with_price_data} (${Math.round(row.with_price_data/row.total_stocks*100)}%)`);
          console.log(`   優待情報: ${row.total_benefits} 件`);
          resolve(row);
        }
      });
    });
  }

  /**
   * 特定の銘柄コードのみを更新
   */
  async updateSpecificStocks(stockCodes) {
    console.log(`指定された ${stockCodes.length} 銘柄を更新中...`);

    let successCount = 0;
    let failedCount = 0;

    for (const code of stockCodes) {
      try {
        // 株価データを取得
        const priceData = await this.yahooFinance.getStockPrice(code);
        await this.savePriceData(priceData);
        
        console.log(`✅ ${code}: 株価 ${priceData.price}円, 配当利回り ${priceData.dividendYield}%`);
        successCount++;

      } catch (error) {
        console.error(`❌ ${code}: ${error.message}`);
        failedCount++;
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n更新完了: ${successCount} 成功, ${failedCount} 失敗`);
    return { success: successCount, failed: failedCount };
  }

  /**
   * 全ての銘柄コードを取得
   */
  async getAllStockCodes() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT code FROM stocks ORDER BY code`;
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

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const updater = new ComprehensiveStockUpdater();
  
  try {
    const command = process.argv[2];
    
    if (command === 'all') {
      // 全銘柄更新
      await updater.updateAllStocks();
    } else if (command === 'stocks-only') {
      // 銘柄情報のみ更新（株価は除く）
      console.log('銘柄情報のみを更新中...');
      const jpxData = await updater.jpxFetcher.fetchLatestData();
      await updater.updateStockDatabase(jpxData.stocks);
    } else if (command === 'prices-only') {
      // 株価のみ更新
      console.log('株価データのみを更新中...');
      const allCodes = await updater.getAllStockCodes();
      await updater.updatePricesInBatches(allCodes.map(code => ({ code })));
    } else if (process.argv.length > 2) {
      // 指定銘柄のみ更新
      const targetCodes = process.argv.slice(2);
      await updater.updateSpecificStocks(targetCodes);
    } else {
      console.log('使用方法:');
      console.log('  node comprehensive-stock-updater.js all              - 全銘柄の完全更新');
      console.log('  node comprehensive-stock-updater.js stocks-only      - 銘柄情報のみ更新');
      console.log('  node comprehensive-stock-updater.js prices-only      - 株価のみ更新');
      console.log('  node comprehensive-stock-updater.js 7203 9984       - 指定銘柄のみ更新');
    }
  } catch (error) {
    console.error('処理中にエラーが発生:', error);
    process.exit(1);
  } finally {
    updater.close();
  }
}