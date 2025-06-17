import { YahooFinanceService } from './yahooFinance.js';

export class RSICalculator {
  constructor() {
    this.yahooFinance = new YahooFinanceService();
  }

  /**
   * 複数銘柄のRSIを計算
   * @param {string[]} stockCodes - 銘柄コードの配列
   * @returns {Object} 銘柄コードをキーとしたRSIデータ
   */
  async calculateMultipleRSI(stockCodes) {
    const results = {};
    
    // バッチ処理で効率化
    const batchSize = 10;
    for (let i = 0; i < stockCodes.length; i += batchSize) {
      const batch = stockCodes.slice(i, i + batchSize);
      const promises = batch.map(async (code) => {
        try {
          const priceHistory = await this.yahooFinance.getStockPriceHistory(code, 50);
          if (!priceHistory || priceHistory.length === 0) {
            return { code, data: { rsi14: null, rsi28: null } };
          }
          
          const prices = priceHistory.map(h => h.close).filter(p => p != null);
          const rsi14 = this.calculateRSI(prices, 14);
          const rsi28 = this.calculateRSI(prices, 28);
          
          return {
            code,
            data: {
              rsi14,
              rsi28,
              stats14: this.getRSIStats(rsi14),
              stats28: this.getRSIStats(rsi28)
            }
          };
        } catch (error) {
          console.error(`RSI calculation error for ${code}:`, error.message);
          return { code, data: { rsi14: null, rsi28: null } };
        }
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ code, data }) => {
        results[code] = data;
      });
    }
    
    return results;
  }

  /**
   * RSIを計算
   * @param {number[]} prices - 価格配列（新しい順）
   * @param {number} period - RSI期間（デフォルト14）
   * @returns {number|null} RSI値
   */
  calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) {
      return null;
    }
    
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
    if (gains.length < period) {
      return null;
    }
    
    // 初期平均を計算
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // スムージング（修正移動平均）を適用
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    
    if (avgLoss === 0) {
      return avgGain > 0 ? 100 : 50;
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100;
  }

  /**
   * RSI値の統計情報を取得
   * @param {number|null} rsi - RSI値
   * @returns {Object} 統計情報
   */
  getRSIStats(rsi) {
    if (rsi === null || rsi === undefined) {
      return { status: 'unknown', level: null };
    }
    
    if (rsi < 30) {
      return { status: 'oversold', level: 'extreme' };
    } else if (rsi < 40) {
      return { status: 'oversold', level: 'moderate' };
    } else if (rsi > 70) {
      return { status: 'overbought', level: 'extreme' };
    } else if (rsi > 60) {
      return { status: 'overbought', level: 'moderate' };
    } else {
      return { status: 'neutral', level: 'normal' };
    }
  }
}