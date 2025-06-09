import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

// 限定的な銘柄の価格履歴を収集するスクリプト
async function collectLimitedHistory() {
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  console.log('=== 限定的な価格履歴収集開始 ===');
  
  try {
    // 優待利回りが高い上位銘柄を選択
    const targetStocks = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT DISTINCT s.code, s.name
        FROM stocks s
        JOIN shareholder_benefits b ON s.code = b.stock_code
        LEFT JOIN (
          SELECT stock_code, COUNT(*) as history_count
          FROM price_history
          GROUP BY stock_code
        ) ph ON s.code = ph.stock_code
        WHERE (ph.history_count IS NULL OR ph.history_count < 30)
        ORDER BY RANDOM()
        LIMIT 20
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`対象銘柄数: ${targetStocks.length}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const stock of targetStocks) {
      try {
        // 40日分の価格履歴を取得
        const priceHistory = await yahooFinance.getStockPriceHistory(stock.code, 40);
        
        if (priceHistory && priceHistory.length > 0) {
          // データベースに保存
          const inserted = await db.insertBulkPriceHistory(stock.code, priceHistory);
          successCount++;
          console.log(`✓ ${stock.code}: ${stock.name} - ${priceHistory.length}件（${inserted}件追加）`);
        } else {
          errorCount++;
          console.log(`✗ ${stock.code}: ${stock.name} - データなし`);
        }
      } catch (error) {
        errorCount++;
        console.log(`✗ ${stock.code}: ${stock.name} - エラー: ${error.message}`);
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n=== 収集完了 ===`);
    console.log(`成功: ${successCount}件, エラー: ${errorCount}件`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
collectLimitedHistory().catch(console.error);