import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

async function testRealScraping() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  try {
    const page = await browser.newPage();
    
    // テスト銘柄
    const testStocks = [
      { code: '3197', name: 'すかいらーく' },
      { code: '8267', name: 'イオン' },
      { code: '2702', name: '日本マクドナルド' }
    ];
    
    for (const stock of testStocks) {
      console.log(`\n=== ${stock.code}: ${stock.name} ===`);
      
      try {
        // 1. Yahoo!ファイナンスから優待情報を取得
        console.log('Yahoo!ファイナンスから取得中...');
        const yahooInfo = await scrapeYahooFinance(page, stock.code);
        if (yahooInfo.length > 0) {
          console.log(`  ✓ ${yahooInfo.length}件の優待情報を取得`);
          yahooInfo.forEach(info => {
            console.log(`    - ${info.description} (${info.minShares}株)`);
          });
        }
        
        // 2. みんかぶから優待情報を取得
        console.log('\nみんかぶから取得中...');
        const minkabuInfo = await scrapeMinkabu(page, stock.code);
        if (minkabuInfo.length > 0) {
          console.log(`  ✓ ${minkabuInfo.length}件の優待情報を取得`);
          minkabuInfo.forEach(info => {
            console.log(`    - ${info.description} (${info.minShares}株)`);
          });
        }
        
        // 3. 情報を統合
        const allBenefits = [...yahooInfo, ...minkabuInfo];
        const uniqueBenefits = removeDuplicates(allBenefits);
        
        if (uniqueBenefits.length > 0) {
          // 株価情報を取得
          const stockInfo = await yahooFinance.getStockPrice(stock.code);
          console.log(`\n株価情報: ${stockInfo.price}円, 配当利回り: ${stockInfo.dividendYield}%`);
          
          // DBに保存
          await db.upsertStock({
            code: stock.code,
            name: stockInfo.name,
            market: stockInfo.market || '東証',
            sector: ''
          });
          
          await db.insertPriceHistory(stockInfo);
          await db.deleteBenefitsByStockCode(stock.code);
          
          for (const benefit of uniqueBenefits) {
            await db.insertBenefit(benefit);
          }
          
          console.log(`✓ ${uniqueBenefits.length}件の優待情報をDBに保存`);
        } else {
          console.log('✗ 優待情報が見つかりませんでした');
        }
        
      } catch (error) {
        console.error(`✗ エラー: ${error.message}`);
      }
    }
    
  } finally {
    await browser.close();
    db.close();
  }
}

async function scrapeYahooFinance(page, stockCode) {
  const benefits = [];
  
  try {
    // Yahoo!ファイナンスの優待ページにアクセス
    await page.goto(`https://finance.yahoo.co.jp/quote/${stockCode}.T/incentive`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // 優待情報を取得
    const yahooData = await page.evaluate(() => {
      const benefits = [];
      
      // テーブル形式の優待情報を探す
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const text = Array.from(cells).map(c => c.textContent?.trim()).join(' ');
            if (text && (text.includes('優待') || text.includes('券') || text.includes('割引'))) {
              benefits.push({
                description: text,
                minShares: 100 // デフォルト値
              });
            }
          }
        });
      }
      
      // セクション形式の優待情報も探す
      const sections = document.querySelectorAll('section');
      sections.forEach(section => {
        const heading = section.querySelector('h2, h3');
        if (heading && heading.textContent?.includes('優待')) {
          const items = section.querySelectorAll('li, p');
          items.forEach(item => {
            const text = item.textContent?.trim();
            if (text && text.length > 10) {
              benefits.push({
                description: text,
                minShares: 100
              });
            }
          });
        }
      });
      
      return benefits;
    });
    
    // データを整形
    yahooData.forEach(data => {
      benefits.push({
        stockCode: stockCode,
        benefitType: detectBenefitType(data.description),
        description: cleanDescription(data.description),
        monetaryValue: estimateValue(data.description),
        minShares: data.minShares,
        holderType: 'どちらでも',
        exRightsMonth: detectMonth(data.description)
      });
    });
    
  } catch (error) {
    console.error(`  Yahoo!ファイナンス取得エラー: ${error.message}`);
  }
  
  return benefits;
}

async function scrapeMinkabu(page, stockCode) {
  const benefits = [];
  
  try {
    // みんかぶの優待ページにアクセス
    await page.goto(`https://minkabu.jp/stock/${stockCode}/yutai`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // 優待情報を取得
    const minkabuData = await page.evaluate(() => {
      const benefits = [];
      
      // 優待内容テーブルを探す（インデックス1のテーブル）
      const tables = document.querySelectorAll('table.md_table');
      if (tables.length > 1) {
        const benefitTable = tables[1]; // 分析結果から2番目のテーブルが優待情報
        const rows = benefitTable.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const shares = cells[0]?.textContent?.trim();
            const content = cells[1]?.textContent?.trim();
            
            if (shares && content) {
              benefits.push({
                minShares: parseInt(shares.replace(/[^0-9]/g, '')) || 100,
                description: content
              });
            }
          }
        });
      }
      
      // 権利確定月を取得
      let exRightsMonth = 3; // デフォルト
      const monthElements = document.querySelectorAll('*');
      for (const elem of monthElements) {
        const text = elem.textContent || '';
        if (text.includes('権利確定月') && text.match(/(\d{1,2})月/)) {
          const match = text.match(/(\d{1,2})月/);
          if (match) {
            exRightsMonth = parseInt(match[1]);
            break;
          }
        }
      }
      
      return { benefits, exRightsMonth };
    });
    
    // データを整形
    const { benefits: minkabuBenefits, exRightsMonth } = minkabuData;
    minkabuBenefits.forEach(data => {
      benefits.push({
        stockCode: stockCode,
        benefitType: detectBenefitType(data.description),
        description: cleanDescription(data.description),
        monetaryValue: estimateValue(data.description),
        minShares: data.minShares,
        holderType: 'どちらでも',
        exRightsMonth: exRightsMonth
      });
    });
    
  } catch (error) {
    console.error(`  みんかぶ取得エラー: ${error.message}`);
  }
  
  return benefits;
}

function detectBenefitType(description) {
  if (description.includes('商品券')) return '商品券';
  if (description.includes('クオカード') || description.includes('QUO')) return 'クオカード';
  if (description.includes('優待券') || description.includes('割引')) return '優待券';
  if (description.includes('カタログ')) return 'カタログギフト';
  if (description.includes('自社製品') || description.includes('自社商品')) return '自社製品';
  return 'その他';
}

function cleanDescription(description) {
  // 不要な空白や改行を削除
  return description
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .substring(0, 200); // 最大200文字
}

function estimateValue(description) {
  // 金額が明記されている場合
  const amountMatch = description.match(/([0-9,]+)円/);
  if (amountMatch) {
    return parseInt(amountMatch[1].replace(/,/g, ''));
  }
  
  // パーセント割引の場合
  const percentMatch = description.match(/(\d+)%/);
  if (percentMatch) {
    const percent = parseInt(percentMatch[1]);
    return Math.round(10000 * percent / 100); // 10000円の買い物を想定
  }
  
  // キーワードベースの推定
  if (description.includes('食事券')) return 3000;
  if (description.includes('クオカード')) return 1000;
  if (description.includes('割引')) return 2000;
  
  return 1000; // デフォルト
}

function detectMonth(description) {
  const monthMatch = description.match(/(\d{1,2})月/);
  if (monthMatch) {
    return parseInt(monthMatch[1]);
  }
  return 3; // デフォルト
}

function removeDuplicates(benefits) {
  const seen = new Set();
  return benefits.filter(benefit => {
    const key = `${benefit.description}-${benefit.minShares}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// 実行
testRealScraping().catch(console.error);