import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { RSICalculator } from './rsiCalculator.js';

// RSI計算のテスト
async function testRSI() {
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  const rsiCalculator = new RSICalculator();
  
  console.log('=== RSI計算テスト ===');
  
  try {
    // テスト銘柄
    const testCodes = ['7550', '8267', '2702'];
    
    for (const code of testCodes) {
      console.log(`\n銘柄: ${code}`);
      
      try {
        // 30日分の価格履歴を取得
        const priceHistory = await yahooFinance.getStockPriceHistory(code, 30);
        
        if (priceHistory && priceHistory.length > 0) {
          // データベースに保存
          await db.insertBulkPriceHistory(code, priceHistory);
          console.log(`  価格履歴: ${priceHistory.length}件`);
          
          // RSI計算
          const prices = await rsiCalculator.getPriceHistory(code, 30);
          const rsi14 = rsiCalculator.calculateRSI(prices, 14);
          const rsi28 = rsiCalculator.calculateRSI(prices, 28);
          
          console.log(`  RSI(14): ${rsi14}`);
          console.log(`  RSI(28): ${rsi28}`);
          
          // 統計情報
          const stats14 = await rsiCalculator.getRSIStatistics(code, 14, 180);
          if (stats14) {
            console.log(`  RSI(14) 統計:`);
            console.log(`    現在値: ${stats14.current}`);
            console.log(`    パーセンタイル: ${stats14.percentile}%`);
            console.log(`    最小値: ${stats14.min}`);
            console.log(`    最大値: ${stats14.max}`);
            console.log(`    平均値: ${stats14.avg}`);
          }
        }
      } catch (error) {
        console.error(`  エラー: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
    rsiCalculator.close();
  }
}

// 実行
testRSI().catch(console.error);