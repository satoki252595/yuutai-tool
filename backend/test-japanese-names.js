import { ShareholderBenefitScraper } from './scraper.js';

async function testJapaneseNames() {
  const scraper = new ShareholderBenefitScraper();
  
  const testCodes = ['3197', '8267', '2702'];
  
  console.log('=== 日本語銘柄名テスト ===');
  
  try {
    for (const code of testCodes) {
      console.log(`\n${code} を処理中...`);
      const result = await scraper.scrapeStockBenefit(null, code);
      
      if (result.success) {
        console.log(`✓ 成功: ${result.name} (${result.benefitCount}件の優待)`);
      } else {
        console.log(`✗ 失敗: 優待情報なし`);
      }
    }
    
    // データベース内容を確認
    console.log('\n=== データベース確認 ===');
    const stockCount = await new Promise((resolve, reject) => {
      scraper.db.db.all('SELECT code, name FROM stocks ORDER BY code', (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });
    
    stockCount.forEach(stock => {
      console.log(`${stock.code}: ${stock.name}`);
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    scraper.db.close();
  }
}

// テスト実行（ブラウザーなしで実行するためのヘルパー）
class TestableShareholderBenefitScraper extends ShareholderBenefitScraper {
  async scrapeStockBenefit(browser, stockCode) {
    const puppeteer = await import('puppeteer');
    const testBrowser = await puppeteer.default.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      return await super.scrapeStockBenefit(testBrowser, stockCode);
    } finally {
      await testBrowser.close();
    }
  }
}

// オリジナルクラスを置き換えてテスト
const originalScraper = new TestableShareholderBenefitScraper();
testJapaneseNames().catch(console.error);