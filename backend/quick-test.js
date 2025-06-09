import { ShareholderBenefitScraper } from './scraper.js';
import puppeteer from 'puppeteer';

async function quickTest() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const scraper = new ShareholderBenefitScraper();
  
  try {
    const testCodes = ['3197', '8267', '2702'];
    
    for (const code of testCodes) {
      console.log(`${code} を処理中...`);
      const result = await scraper.scrapeStockBenefit(browser, code);
      
      if (result.success) {
        console.log(`✓ ${result.name} (${result.benefitCount}件)`);
      } else {
        console.log(`✗ 優待情報なし`);
      }
    }
    
    // 結果確認
    console.log('\n=== 登録された銘柄 ===');
    const stocks = await new Promise((resolve, reject) => {
      scraper.db.db.all('SELECT code, name FROM stocks ORDER BY code', (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });
    
    stocks.forEach(stock => {
      console.log(`${stock.code}: ${stock.name}`);
    });
    
  } finally {
    await browser.close();
    scraper.db.close();
  }
}

quickTest().catch(console.error);