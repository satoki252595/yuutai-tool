import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

// 株価履歴を収集するスクリプト
async function collectPriceHistory() {
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  console.log('=== 株価履歴収集開始 ===');
  
  try {
    // 全銘柄コードを取得
    const stockCodes = await db.getAllStockCodes();
    console.log(`対象銘柄数: ${stockCodes.length}`);
    
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 5;
    
    // バッチ処理
    for (let i = 0; i < stockCodes.length; i += batchSize) {
      const batch = stockCodes.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(stockCodes.length/batchSize);
      
      console.log(`\nバッチ ${batchNum}/${totalBatches} 処理中...`);
      
      for (const code of batch) {
        try {
          // 30日分の価格履歴を取得
          const priceHistory = await yahooFinance.getStockPriceHistory(code, 30);
          
          if (priceHistory && priceHistory.length > 0) {
            // データベースに保存
            const inserted = await db.insertBulkPriceHistory(code, priceHistory);
            successCount++;
            console.log(`✓ ${code}: ${inserted}件追加`);
          } else {
            errorCount++;
            console.log(`✗ ${code}: データなし`);
          }
        } catch (error) {
          errorCount++;
          console.log(`✗ ${code}: エラー - ${error.message}`);
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // バッチ間の待機
      if (i + batchSize < stockCodes.length) {
        console.log(`  進捗: 成功${successCount}件, エラー${errorCount}件`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
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
collectPriceHistory().catch(console.error);