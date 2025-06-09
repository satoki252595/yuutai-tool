import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { RSICalculator } from './rsiCalculator.js';
import yahooFinance from 'yahoo-finance2';

class ComprehensiveImprovements {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.rsiCalculator = new RSICalculator();
  }

  /**
   * 1. RSI計算のための株価履歴収集（全銘柄対応）
   */
  async collectPriceHistoryForAllStocks() {
    console.log('📈 全銘柄の株価履歴収集を開始します...');
    
    try {
      // 株価履歴がない銘柄を取得
      const stocksWithoutHistory = await this.getStocksWithoutPriceHistory();
      console.log(`${stocksWithoutHistory.length} 銘柄の株価履歴を収集します`);

      let successCount = 0;
      let errorCount = 0;
      const batchSize = 20;

      for (let i = 0; i < stocksWithoutHistory.length; i += batchSize) {
        const batch = stocksWithoutHistory.slice(i, i + batchSize);
        
        console.log(`バッチ ${Math.floor(i/batchSize) + 1}/${Math.ceil(stocksWithoutHistory.length/batchSize)}: ${batch.length} 銘柄を処理中...`);

        await Promise.all(batch.map(async (stock) => {
          try {
            await this.collectHistoricalPrices(stock.code);
            successCount++;
          } catch (error) {
            console.error(`⚠️ ${stock.code}: 株価履歴取得失敗 - ${error.message}`);
            errorCount++;
          }
        }));

        // API制限対策
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`✅ 株価履歴収集完了: ${successCount} 成功, ${errorCount} 失敗`);
      
    } catch (error) {
      console.error('株価履歴収集エラー:', error);
    }
  }

  /**
   * 個別銘柄の株価履歴を収集
   */
  async collectHistoricalPrices(stockCode) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60); // 60日分のデータ

      const ticker = `${stockCode}.T`;
      const result = await yahooFinance.chart(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });

      if (result.quotes && result.quotes.length > 0) {
        // 株価履歴を保存
        for (const quote of result.quotes) {
          await this.savePriceHistory({
            stock_code: stockCode,
            price: quote.close || quote.adjClose || 0,
            recorded_at: new Date(quote.date).toISOString()
          });
        }
        
        console.log(`✓ ${stockCode}: ${result.quotes.length} 日分の価格データを保存`);
      }
    } catch (error) {
      throw new Error(`株価履歴取得エラー: ${error.message}`);
    }
  }

  /**
   * 2. 重複銘柄・無効銘柄の削除
   */
  async cleanupDuplicateAndInvalidStocks() {
    console.log('🧹 重複・無効銘柄のクリーンアップを開始...');

    try {
      // 重複銘柄の削除
      const duplicates = await this.findDuplicateStocks();
      console.log(`重複銘柄数: ${duplicates.length}`);
      
      for (const dup of duplicates) {
        await this.mergeDuplicateStock(dup.code, dup.count);
      }

      // 無効な銘柄コードの削除（4桁以外、英字含む等）
      const invalidDeleted = await this.deleteInvalidStocks();
      console.log(`無効銘柄 ${invalidDeleted} 件を削除`);

      // 上場廃止銘柄の削除（価格が0または長期間更新なし）
      const delistedDeleted = await this.deleteDelistedStocks();
      console.log(`上場廃止銘柄 ${delistedDeleted} 件を削除`);

      console.log('✅ クリーンアップ完了');
      
    } catch (error) {
      console.error('クリーンアップエラー:', error);
    }
  }

  /**
   * 3. 優待利回り計算の修正
   */
  async fixBenefitYieldCalculation() {
    console.log('🔧 優待利回り計算ロジックの修正...');

    // 優待利回り計算式：
    // 優待利回り(%) = (年間優待価値 ÷ 投資金額) × 100
    // 投資金額 = 株価 × 必要株式数
    
    const calculationFormula = `
    📐 優待利回り計算式:
    ================================
    優待利回り(%) = (年間優待価値 ÷ 投資金額) × 100
    
    詳細:
    - 年間優待価値 = 各権利月の優待価値の合計
    - 投資金額 = 現在株価 × 必要株式数
    - 必要株式数 = 優待獲得に必要な最小株式数
    
    例: 
    株価1,000円、100株で3,000円相当の優待（年2回）
    → 年間優待価値 = 3,000円 × 2 = 6,000円
    → 投資金額 = 1,000円 × 100株 = 100,000円
    → 優待利回り = (6,000 ÷ 100,000) × 100 = 6.0%
    ================================
    `;
    
    console.log(calculationFormula);

    // 異常な利回りの銘柄を検出して修正
    await this.fixAbnormalYields();
  }

  /**
   * 4. 優待内容のクリーニング
   */
  async cleanBenefitDescriptions() {
    console.log('🧹 優待内容のクリーニングを開始...');

    try {
      // 異常な優待内容を取得
      const abnormalBenefits = await this.getAbnormalBenefits();
      console.log(`${abnormalBenefits.length} 件の異常な優待内容を検出`);

      let cleanedCount = 0;
      
      for (const benefit of abnormalBenefits) {
        const cleaned = this.cleanBenefitText(benefit.description);
        
        if (cleaned !== benefit.description) {
          await this.updateBenefitDescription(benefit.id, cleaned);
          console.log(`✓ ID ${benefit.id}: "${benefit.description}" → "${cleaned}"`);
          cleanedCount++;
        }
      }

      console.log(`✅ ${cleanedCount} 件の優待内容をクリーニング`);
      
    } catch (error) {
      console.error('優待内容クリーニングエラー:', error);
    }
  }

  /**
   * 5. パフォーマンス改善（メモリキャッシュ実装）
   */
  createCachedAPIServer() {
    console.log('🚀 キャッシュ機能付きAPIサーバーの作成...');

    const cacheCode = `
// backend/server.js に追加するキャッシュ実装

// メモリキャッシュ
const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分間のキャッシュ

// キャッシュミドルウェア
const cacheMiddleware = (req, res, next) => {
  const key = req.originalUrl;
  const cached = stockCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(\`📦 キャッシュヒット: \${key}\`);
    return res.json(cached.data);
  }
  
  // オリジナルのjson関数を保存
  const originalJson = res.json;
  res.json = function(data) {
    stockCache.set(key, {
      data,
      timestamp: Date.now()
    });
    console.log(\`💾 キャッシュ保存: \${key}\`);
    originalJson.call(this, data);
  };
  
  next();
};

// 株式一覧エンドポイントにキャッシュを適用
app.get('/api/stocks', cacheMiddleware, async (req, res) => {
  // 既存の処理...
});

// キャッシュクリアエンドポイント
app.post('/api/cache/clear', (req, res) => {
  stockCache.clear();
  res.json({ message: 'キャッシュをクリアしました' });
});
    `;

    return cacheCode;
  }

  // === ヘルパーメソッド ===

  async getStocksWithoutPriceHistory() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT DISTINCT s.code, s.name
        FROM stocks s
        LEFT JOIN price_history ph ON s.code = ph.stock_code
        WHERE ph.id IS NULL OR (
          SELECT COUNT(*) FROM price_history 
          WHERE stock_code = s.code
        ) < 30
        LIMIT 500
      `;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async savePriceHistory(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO price_history (stock_code, price, recorded_at)
        VALUES (?, ?, ?)
      `;
      this.db.db.run(sql, [data.stock_code, data.price, data.recorded_at], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async findDuplicateStocks() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT code, COUNT(*) as count
        FROM stocks
        GROUP BY code
        HAVING COUNT(*) > 1
      `;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async mergeDuplicateStock(code, count) {
    // 最新のレコードを残して古いものを削除
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM stocks 
        WHERE code = ? AND rowid NOT IN (
          SELECT MAX(rowid) FROM stocks WHERE code = ?
        )
      `;
      this.db.db.run(sql, [code, code], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async deleteInvalidStocks() {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM stocks 
        WHERE 
          LENGTH(code) != 4 OR 
          code NOT GLOB '[0-9][0-9][0-9][0-9]' OR
          code < '1000' OR 
          code > '9999'
      `;
      this.db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async deleteDelistedStocks() {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM stocks 
        WHERE code IN (
          SELECT s.code 
          FROM stocks s
          LEFT JOIN (
            SELECT stock_code, MAX(recorded_at) as last_update, MAX(price) as last_price
            FROM price_history 
            GROUP BY stock_code
          ) ph ON s.code = ph.stock_code
          WHERE 
            ph.last_price = 0 OR 
            ph.last_price IS NULL OR
            datetime(ph.last_update) < datetime('now', '-90 days')
        )
      `;
      this.db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async fixAbnormalYields() {
    return new Promise((resolve, reject) => {
      // 利回り100%以上の異常値を検出
      const sql = `
        SELECT sb.*, s.name, ph.price
        FROM shareholder_benefits sb
        JOIN stocks s ON sb.stock_code = s.code
        LEFT JOIN (
          SELECT stock_code, price 
          FROM price_history 
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at) 
            FROM price_history 
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE 
          sb.monetary_value > 0 AND
          ph.price > 0 AND
          (sb.monetary_value * 100.0 / (ph.price * COALESCE(sb.min_shares, 100))) > 100
      `;
      
      this.db.db.all(sql, [], async (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log(`異常な利回りの優待: ${rows.length} 件`);
          
          for (const row of rows) {
            const yield_calc = (row.monetary_value * 100.0 / (row.price * (row.min_shares || 100))).toFixed(2);
            console.log(`⚠️ ${row.stock_code} ${row.name}: 利回り ${yield_calc}% (価値:${row.monetary_value}円)`);
            
            // 金銭価値を10分の1に修正（桁違いの可能性）
            if (yield_calc > 100) {
              await this.updateBenefitValue(row.id, Math.floor(row.monetary_value / 10));
            }
          }
          
          resolve(rows);
        }
      });
    });
  }

  async getAbnormalBenefits() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, stock_code, description
        FROM shareholder_benefits
        WHERE 
          LENGTH(description) < 5 OR
          description GLOB '*[0-9][0-9][0-9][0-9].[0-9]*' OR
          description LIKE '%○%' OR
          description LIKE '%undefined%' OR
          description LIKE '%null%' OR
          description NOT LIKE '%円%' AND description NOT LIKE '%券%' AND description NOT LIKE '%割引%'
        LIMIT 100
      `;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  cleanBenefitText(text) {
    if (!text) return '';
    
    // 基本的なクリーニング
    let cleaned = text
      .replace(/○/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^\d+\.\d+$/, '') // 数値のみの場合は削除
      .replace(/undefined|null/gi, '')
      .trim();
    
    // 短すぎる場合はデフォルト
    if (cleaned.length < 5) {
      cleaned = '優待情報取得中';
    }
    
    // HTMLタグの除去
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    
    // 連続する数字の正規化
    cleaned = cleaned.replace(/(\d)\s+(\d)/g, '$1$2');
    
    return cleaned;
  }

  async updateBenefitDescription(id, description) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE shareholder_benefits SET description = ? WHERE id = ?`;
      this.db.db.run(sql, [description, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async updateBenefitValue(id, value) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE shareholder_benefits SET monetary_value = ? WHERE id = ?`;
      this.db.db.run(sql, [value, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  /**
   * 統合実行
   */
  async executeAllImprovements() {
    console.log('🔧 包括的な改善処理を開始します...\n');

    try {
      // 1. 重複・無効銘柄のクリーンアップ
      await this.cleanupDuplicateAndInvalidStocks();
      
      // 2. 株価履歴の収集（RSI計算用）
      await this.collectPriceHistoryForAllStocks();
      
      // 3. 優待利回り計算の修正
      await this.fixBenefitYieldCalculation();
      
      // 4. 優待内容のクリーニング
      await this.cleanBenefitDescriptions();
      
      // 5. キャッシュ実装の提案
      console.log('\n📝 キャッシュ実装コード:');
      console.log(this.createCachedAPIServer());
      
      console.log('\n✅ 全ての改善処理が完了しました！');
      
    } catch (error) {
      console.error('改善処理中にエラー:', error);
    }
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const improver = new ComprehensiveImprovements();
  
  try {
    const command = process.argv[2];
    
    switch (command) {
      case 'all':
        await improver.executeAllImprovements();
        break;
      case 'rsi':
        await improver.collectPriceHistoryForAllStocks();
        break;
      case 'cleanup':
        await improver.cleanupDuplicateAndInvalidStocks();
        break;
      case 'yield':
        await improver.fixBenefitYieldCalculation();
        break;
      case 'clean-text':
        await improver.cleanBenefitDescriptions();
        break;
      default:
        console.log('使用方法:');
        console.log('  node comprehensive-improvements.js all        - 全改善実行');
        console.log('  node comprehensive-improvements.js rsi        - RSI用株価履歴収集');
        console.log('  node comprehensive-improvements.js cleanup    - 重複削除');
        console.log('  node comprehensive-improvements.js yield      - 利回り修正');
        console.log('  node comprehensive-improvements.js clean-text - 優待テキスト修正');
    }
  } catch (error) {
    console.error('処理エラー:', error);
  } finally {
    improver.close();
  }
}