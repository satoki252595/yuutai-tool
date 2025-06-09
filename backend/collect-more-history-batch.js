import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

// より多くの銘柄の価格履歴を収集するスクリプト
async function collectMoreHistoryBatch() {
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  console.log('=== 価格履歴の一括収集開始 ===');
  
  try {
    // 価格履歴が不足している銘柄を取得（RSI28のために30日以上必要）
    const targetStocks = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT DISTINCT s.code, s.name, COALESCE(ph.history_count, 0) as current_count
        FROM stocks s
        LEFT JOIN (
          SELECT stock_code, COUNT(*) as history_count
          FROM price_history
          GROUP BY stock_code
        ) ph ON s.code = ph.stock_code
        WHERE COALESCE(ph.history_count, 0) < 30
        ORDER BY RANDOM()
        LIMIT 50
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`対象銘柄数: ${targetStocks.length}`);
    console.log('RSI(28)計算のため、各銘柄30日分以上の価格履歴を収集します。');
    
    let successCount = 0;
    let errorCount = 0;
    let totalAdded = 0;
    
    for (let i = 0; i < targetStocks.length; i++) {
      const stock = targetStocks[i];
      
      try {
        // 35日分の価格履歴を取得（RSI28計算に十分な余裕を持たせる）
        const priceHistory = await yahooFinance.getStockPriceHistory(stock.code, 35);
        
        if (priceHistory && priceHistory.length > 0) {
          // データベースに保存
          const inserted = await db.insertBulkPriceHistory(stock.code, priceHistory);
          successCount++;
          totalAdded += inserted;
          console.log(`✓ ${i+1}/${targetStocks.length} ${stock.code}: ${stock.name} - ${priceHistory.length}件取得（${inserted}件追加）`);
        } else {
          errorCount++;
          console.log(`✗ ${i+1}/${targetStocks.length} ${stock.code}: ${stock.name} - データ取得失敗`);
        }
      } catch (error) {
        errorCount++;
        console.log(`✗ ${i+1}/${targetStocks.length} ${stock.code}: ${stock.name} - エラー: ${error.message}`);
      }
      
      // レート制限対策（3銘柄ごとに少し長い待機）
      if ((i + 1) % 3 === 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
    
    console.log(`\n=== 収集完了 ===`);
    console.log(`成功: ${successCount}件, エラー: ${errorCount}件`);
    console.log(`追加された履歴データ: ${totalAdded}件`);
    
    // 収集後の統計を表示
    const stats = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT 
          COUNT(DISTINCT stock_code) as total_stocks,
          COUNT(DISTINCT CASE WHEN cnt >= 15 THEN stock_code END) as rsi14_ready,
          COUNT(DISTINCT CASE WHEN cnt >= 29 THEN stock_code END) as rsi28_ready
        FROM (
          SELECT stock_code, COUNT(*) as cnt 
          FROM price_history 
          GROUP BY stock_code
        )
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`\n現在の状況:`);
    console.log(`  価格履歴のある銘柄: ${stats.total_stocks}`);
    console.log(`  RSI(14)計算可能: ${stats.rsi14_ready}銘柄`);
    console.log(`  RSI(28)計算可能: ${stats.rsi28_ready}銘柄`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
collectMoreHistoryBatch().catch(console.error);