import { RSICalculator } from './rsiCalculator.js';
import { Database } from './database.js';

// RSI計算の詳細テスト
async function testRSICalculation() {
  const rsiCalculator = new RSICalculator();
  const db = new Database();
  
  console.log('=== RSI計算詳細テスト ===');
  
  try {
    // テスト銘柄（価格履歴が多いもの）
    const testCodes = ['7550', '8267', '2702'];
    
    for (const code of testCodes) {
      console.log(`\n銘柄: ${code}`);
      
      // 価格履歴を取得
      const priceHistory = await new Promise((resolve, reject) => {
        db.db.all(`
          SELECT price, recorded_at 
          FROM price_history 
          WHERE stock_code = ? 
          ORDER BY recorded_at DESC 
          LIMIT 60
        `, [code], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      console.log(`  価格履歴: ${priceHistory.length}件`);
      
      if (priceHistory.length > 0) {
        const prices = priceHistory.map(row => row.price);
        
        // RSI(14)の計算
        console.log('\n  RSI(14)計算:');
        if (prices.length >= 15) {
          const rsi14 = rsiCalculator.calculateRSI(prices.slice(0, 15), 14);
          console.log(`    15日分のデータ: ${rsi14}`);
          
          const rsi14_30 = rsiCalculator.calculateRSI(prices.slice(0, 30), 14);
          console.log(`    30日分のデータ: ${rsi14_30}`);
          
          const rsi14_all = rsiCalculator.calculateRSI(prices, 14);
          console.log(`    全データ: ${rsi14_all}`);
        } else {
          console.log(`    データ不足（${prices.length}件）`);
        }
        
        // RSI(28)の計算
        console.log('\n  RSI(28)計算:');
        if (prices.length >= 29) {
          const rsi28 = rsiCalculator.calculateRSI(prices.slice(0, 29), 28);
          console.log(`    29日分のデータ: ${rsi28}`);
          
          const rsi28_40 = rsiCalculator.calculateRSI(prices.slice(0, 40), 28);
          console.log(`    40日分のデータ: ${rsi28_40}`);
          
          const rsi28_all = rsiCalculator.calculateRSI(prices, 28);
          console.log(`    全データ: ${rsi28_all}`);
        } else {
          console.log(`    データ不足（${prices.length}件、必要: 29件）`);
        }
        
        // 価格の変動を確認
        if (prices.length >= 5) {
          console.log('\n  最近の価格変動:');
          for (let i = 0; i < Math.min(5, prices.length - 1); i++) {
            const change = prices[i] - prices[i + 1];
            const changePercent = (change / prices[i + 1]) * 100;
            console.log(`    ${i}日前: ${prices[i]}円 (${change >= 0 ? '+' : ''}${change.toFixed(2)}円, ${changePercent.toFixed(2)}%)`);
          }
        }
      }
    }
    
    // データベース内の価格履歴の統計
    console.log('\n=== 価格履歴の統計 ===');
    const stats = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          stock_code,
          COUNT(*) as count,
          MIN(recorded_at) as oldest,
          MAX(recorded_at) as newest
        FROM price_history
        WHERE stock_code IN ('7550', '8267', '2702', '3377', '7552')
        GROUP BY stock_code
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    stats.forEach(row => {
      console.log(`${row.stock_code}: ${row.count}件 (${row.oldest} 〜 ${row.newest})`);
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
    rsiCalculator.close();
  }
}

// 実行
testRSICalculation().catch(console.error);