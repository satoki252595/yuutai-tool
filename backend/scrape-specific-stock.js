import { ParallelScraper } from './parallel-scraper.js';

/**
 * 特定銘柄のスクレイピング専用スクリプト
 */
async function scrapeSpecificStock(stockCode) {
  console.log(`🕷️ ${stockCode} の優待情報を取得中...`);
  
  const scraper = new ParallelScraper({ maxWorkers: 1, maxPages: 1 });
  
  try {
    const browsers = await scraper.createBrowserPool();
    const browser = browsers[0];
    
    const result = await scraper.scrapeStockBenefit(browser, stockCode);
    
    if (result && result.stockName) {
      console.log(`✅ ${stockCode} ${result.stockName}: 優待情報取得成功`);
      console.log(`   優待件数: ${result.benefitCount || 0} 件`);
      
      if (result.benefits && result.benefits.length > 0) {
        console.log('\n📋 優待内容:');
        result.benefits.forEach((benefit, i) => {
          console.log(`  ${i+1}. ${benefit.description.substring(0, 100)}${benefit.description.length > 100 ? '...' : ''}`);
          if (benefit.monetary_value > 0) {
            console.log(`     金銭価値: ${benefit.monetary_value}円`);
          }
          if (benefit.min_shares > 0) {
            console.log(`     必要株数: ${benefit.min_shares}株`);
          }
        });
      }
    } else {
      console.log(`⚠️ ${stockCode}: 優待情報の取得に失敗`);
    }
    
    // ブラウザを閉じる
    await browser.close();
    
  } catch (error) {
    console.error(`❌ エラー: ${error.message}`);
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const stockCode = process.argv[2] || '4661';
  await scrapeSpecificStock(stockCode);
}

export { scrapeSpecificStock };