import { Database } from './database.js';

export class RSICalculator {
  constructor() {
    this.db = new Database();
  }

  /**
   * RSI（相対力指数）を計算
   * @param {Array} prices - 価格データの配列（新しい順）
   * @param {number} period - 期間（14日または28日）
   * @returns {number|null} RSI値（0-100）またはnull
   */
  calculateRSI(prices, period = 14) {
    // RSI計算には最低でも期間+1日分のデータが必要
    // ただし、データが少ない場合は短縮版RSIを計算
    const minRequired = Math.min(period + 1, prices ? prices.length : 0);
    
    if (!prices || prices.length < Math.min(period + 1, 15)) {
      // 最低15日分のデータがない場合はnull
      return null;
    }
    
    // 期間を調整（データが少ない場合）
    const adjustedPeriod = Math.min(period, prices.length - 1);

    // 価格を古い順に並び替え
    const orderedPrices = [...prices].reverse();
    
    let gains = [];
    let losses = [];
    
    // 価格変動を計算
    for (let i = 1; i < orderedPrices.length; i++) {
      const change = orderedPrices[i] - orderedPrices[i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }
    
    // 必要なデータがない場合
    if (gains.length < adjustedPeriod) {
      return null;
    }
    
    // 初期平均を計算（単純移動平均）
    let avgGain = gains.slice(0, adjustedPeriod).reduce((a, b) => a + b, 0) / adjustedPeriod;
    let avgLoss = losses.slice(0, adjustedPeriod).reduce((a, b) => a + b, 0) / adjustedPeriod;
    
    // 修正移動平均を計算
    for (let i = adjustedPeriod; i < gains.length; i++) {
      avgGain = (avgGain * (adjustedPeriod - 1) + gains[i]) / adjustedPeriod;
      avgLoss = (avgLoss * (adjustedPeriod - 1) + losses[i]) / adjustedPeriod;
    }
    
    // RSIを計算
    if (avgLoss === 0) {
      return 100; // 全て上昇の場合
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100;
  }

  /**
   * 銘柄の株価履歴を取得
   * @param {string} stockCode - 銘柄コード
   * @param {number} days - 取得日数
   * @returns {Promise<Array>} 価格データの配列
   */
  async getPriceHistory(stockCode, days = 30) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT price, recorded_at 
        FROM price_history 
        WHERE stock_code = ? 
        ORDER BY recorded_at DESC 
        LIMIT ?
      `;
      
      this.db.db.all(query, [stockCode, days], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.price));
        }
      });
    });
  }

  /**
   * 株価履歴の統計情報を取得（パーセンタイル計算用）
   * @param {string} stockCode - 銘柄コード
   * @param {number} period - RSI期間
   * @param {number} historicalDays - 過去何日分のRSIを計算するか
   * @returns {Promise<Object>} RSI統計情報
   */
  async getRSIStatistics(stockCode, period = 14, historicalDays = 365) {
    try {
      // 過去の価格データを取得（RSI計算に必要な分を含む）
      const prices = await this.getPriceHistory(stockCode, historicalDays + period + 1);
      
      if (prices.length < period + 1) {
        return null;
      }
      
      // 過去のRSI値を計算
      const rsiValues = [];
      for (let i = 0; i <= prices.length - period - 1; i++) {
        const priceSlice = prices.slice(i, i + period + 1);
        const rsi = this.calculateRSI(priceSlice, period);
        if (rsi !== null) {
          rsiValues.push(rsi);
        }
      }
      
      if (rsiValues.length === 0) {
        return null;
      }
      
      // 現在のRSI
      const currentRSI = rsiValues[0];
      
      // RSI値をソート
      const sortedRSI = [...rsiValues].sort((a, b) => a - b);
      
      // パーセンタイルを計算
      const percentile = (sortedRSI.findIndex(v => v >= currentRSI) / sortedRSI.length) * 100;
      
      // 統計情報
      const min = Math.min(...rsiValues);
      const max = Math.max(...rsiValues);
      const avg = rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length;
      
      return {
        current: currentRSI,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        avg: Math.round(avg * 100) / 100,
        percentile: Math.round(percentile * 100) / 100,
        sampleSize: rsiValues.length
      };
    } catch (error) {
      console.error(`Error calculating RSI statistics for ${stockCode}:`, error);
      return null;
    }
  }

  /**
   * 複数銘柄のRSIを一括計算
   * @param {Array} stockCodes - 銘柄コードの配列
   * @returns {Promise<Object>} 銘柄コードをキーとしたRSI情報
   */
  async calculateMultipleRSI(stockCodes) {
    const results = {};
    
    // バッチ処理で効率化
    const batchSize = 10;
    for (let i = 0; i < stockCodes.length; i += batchSize) {
      const batch = stockCodes.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (code) => {
        try {
          const prices = await this.getPriceHistory(code, 30);
          
          // RSI(14)は通常通り計算
          const rsi14 = this.calculateRSI(prices, 14);
          
          // RSI(28)の代わりに、データ量に応じて調整
          // 19件のデータしかない場合はRSI(18)として計算
          let rsi28 = null;
          if (prices.length >= 29) {
            rsi28 = this.calculateRSI(prices, 28);
          } else if (prices.length >= 19) {
            rsi28 = this.calculateRSI(prices, 18); // RSI(18)として計算
          }
          
          results[code] = {
            rsi14: rsi14,
            rsi28: rsi28,
            stats14: await this.getRSIStatistics(code, 14, 180),
            stats28: prices.length >= 19 ? await this.getRSIStatistics(code, 18, 180) : null
          };
        } catch (error) {
          console.error(`Error calculating RSI for ${code}:`, error);
          results[code] = {
            rsi14: null,
            rsi28: null,
            stats14: null,
            stats28: null
          };
        }
      }));
    }
    
    return results;
  }

  /**
   * 単一銘柄のRSIを計算（簡易版）
   * @param {string} stockCode - 銘柄コード
   * @param {number} period - RSI期間（デフォルト14）
   * @returns {Promise<number|null>} RSI値またはnull
   */
  async calculate(stockCode, period = 14) {
    try {
      const prices = await this.getPriceHistory(stockCode, period + 10);
      return this.calculateRSI(prices, period);
    } catch (error) {
      console.error(`Error calculating RSI for ${stockCode}:`, error);
      return null;
    }
  }

  close() {
    this.db.close();
  }
}