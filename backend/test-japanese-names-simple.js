import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

async function testJapaneseNames() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  console.log('=== 日本語銘柄名テスト ===');
  
  try {
    const testCodes = ['3197', '8267'];
    
    for (const code of testCodes) {
      console.log(`\n${code} を処理中...`);
      
      const page = await browser.newPage();
      
      try {
        // みんかぶから会社名を取得
        await page.goto(`https://minkabu.jp/stock/${code}/yutai`, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        const companyData = await page.evaluate(() => {
          // 会社名を取得（複数のセレクタを試す）
          const selectors = [
            'h2:first-of-type',  // 最初のh2要素
            'h1.title_box',      // title_boxクラスのh1
            'h1',                // 通常のh1
            '.company-name'      // 会社名クラス（フォールバック）
          ];
          
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              const text = element.textContent?.trim();
              console.log(`セレクタ ${selector}: "${text}"`);
              if (text && text.length > 0 && !text.includes('株主優待')) {
                // 「すかいらーくホールディングス」のような純粋な会社名を取得
                return text;
              }
            }
          }
          
          return '';
        });
        
        console.log(`  みんかぶから取得した会社名: "${companyData}"`);
        
        // Yahoo Finance APIから株価情報を取得
        const stockInfo = await yahooFinance.getStockPrice(code);
        console.log(`  Yahoo Financeから取得した会社名: "${stockInfo.name}"`);
        
        // 最終的に使用する会社名
        const finalName = companyData || stockInfo.name;
        console.log(`  使用する会社名: "${finalName}"`);
        
        // DBに保存
        await db.upsertStock({
          code: code,
          name: finalName,
          market: stockInfo.market || '東証',
          sector: 'テスト'
        });
        
        console.log(`  ✓ DBに保存完了`);
        
      } finally {
        await page.close();
      }
    }
    
    // 結果確認
    console.log('\n=== 保存された銘柄名 ===');
    const stocks = await new Promise((resolve, reject) => {
      db.db.all('SELECT code, name FROM stocks ORDER BY code', (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });
    
    stocks.forEach(stock => {
      console.log(`${stock.code}: ${stock.name}`);
    });
    
  } finally {
    await browser.close();
    db.close();
  }
}

testJapaneseNames().catch(console.error);