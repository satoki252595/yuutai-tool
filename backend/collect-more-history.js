import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

// より長期間の株価履歴を収集するスクリプト
async function collectMoreHistory() {
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  console.log('=== 長期株価履歴収集開始 ===');
  
  try {
    // テスト用に一部の銘柄のみ処理
    const stockCodes = ['7550', '8267', '2702', '7602', '3070'];
    console.log(`対象銘柄数: ${stockCodes.length}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const code of stockCodes) {
      try {
        // 60日分の価格履歴を取得（RSI(28)計算に十分）
        const priceHistory = await yahooFinance.getStockPriceHistory(code, 60);
        
        if (priceHistory && priceHistory.length > 0) {
          // データベースに保存
          const inserted = await db.insertBulkPriceHistory(code, priceHistory);
          successCount++;
          console.log(`✓ ${code}: ${priceHistory.length}件のデータ（${inserted}件追加）`);
        } else {
          errorCount++;
          console.log(`✗ ${code}: データなし`);
        }
      } catch (error) {
        errorCount++;
        console.log(`✗ ${code}: エラー - ${error.message}`);
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
collectMoreHistory().catch(console.error);