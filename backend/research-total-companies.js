import puppeteer from 'puppeteer';

async function researchTotalCompanies() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  console.log('=== 優待実施企業数の調査 ===');
  
  try {
    const page = await browser.newPage();
    
    // 1. みんかぶの株主優待検索ページで総数を確認
    console.log('\n1. みんかぶで優待実施企業数を調査...');
    try {
      await page.goto('https://minkabu.jp/stock/benefit', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      const minkabuInfo = await page.evaluate(() => {
        const result = {
          totalCount: 0,
          searchResults: 0,
          paginationInfo: ''
        };
        
        // 総件数を探す
        const countElements = document.querySelectorAll('*');
        for (const elem of countElements) {
          const text = elem.textContent || '';
          // "1,234件" のような表記を探す
          const match = text.match(/([0-9,]+)\s*件/);
          if (match) {
            const count = parseInt(match[1].replace(/,/g, ''));
            if (count > result.totalCount) {
              result.totalCount = count;
            }
          }
        }
        
        // ページネーション情報
        const paginationElem = document.querySelector('.pagination, .pager, .page-info');
        if (paginationElem) {
          result.paginationInfo = paginationElem.textContent?.trim();
        }
        
        return result;
      });
      
      console.log(`  総件数: ${minkabuInfo.totalCount}件`);
      console.log(`  ページネーション: ${minkabuInfo.paginationInfo}`);
      
    } catch (error) {
      console.log(`  エラー: ${error.message}`);
    }
    
    // 2. Yahoo!ファイナンスの株主優待一覧で確認
    console.log('\n2. Yahoo!ファイナンスで優待実施企業数を調査...');
    try {
      await page.goto('https://finance.yahoo.co.jp/stocks/incentive/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      const yahooInfo = await page.evaluate(() => {
        const result = {
          totalCount: 0,
          listItems: 0
        };
        
        // 件数表示を探す
        const allText = document.body.textContent || '';
        const matches = allText.match(/([0-9,]+)\s*件|([0-9,]+)\s*社/g);
        if (matches) {
          matches.forEach(match => {
            const count = parseInt(match.replace(/[^0-9]/g, ''));
            if (count > result.totalCount && count < 10000) { // 現実的な範囲
              result.totalCount = count;
            }
          });
        }
        
        // 実際に表示されているリスト項目数
        const listItems = document.querySelectorAll('table tr, .stock-list-item, .incentive-item');
        result.listItems = listItems.length;
        
        return result;
      });
      
      console.log(`  総件数: ${yahooInfo.totalCount}件`);
      console.log(`  表示項目数: ${yahooInfo.listItems}件`);
      
    } catch (error) {
      console.log(`  エラー: ${error.message}`);
    }
    
    // 3. 東証上場銘柄の中から優待実施企業を動的に発見する方法を検討
    console.log('\n3. 東証コード範囲での優待実施企業の推定...');
    
    // 上場企業の証券コード範囲
    const codeRanges = [
      { start: 1300, end: 1999, name: '建設・資材' },
      { start: 2000, end: 2999, name: '食品・化学・繊維' },
      { start: 3000, end: 3999, name: '医薬品・小売・サービス' },
      { start: 4000, end: 4999, name: 'IT・通信・精密機器' },
      { start: 5000, end: 5999, name: '鉄鋼・非鉄・機械' },
      { start: 6000, end: 6999, name: '電機・自動車・輸送機器' },
      { start: 7000, end: 7999, name: '小売・外食・サービス' },
      { start: 8000, end: 8999, name: '金融・不動産・商社' },
      { start: 9000, end: 9999, name: '運輸・電力・インフラ' }
    ];
    
    let estimatedTotal = 0;
    
    for (const range of codeRanges) {
      // 各セクターでの優待実施率を推定
      let sectorRate = 0.1; // デフォルト10%
      
      if (range.name.includes('食品') || range.name.includes('小売') || range.name.includes('外食')) {
        sectorRate = 0.4; // 食品・小売・外食は高率
      } else if (range.name.includes('金融') || range.name.includes('運輸')) {
        sectorRate = 0.2; // 金融・運輸は中程度
      } else if (range.name.includes('IT') || range.name.includes('医薬品')) {
        sectorRate = 0.05; // IT・医薬品は低率
      }
      
      const rangeSize = range.end - range.start;
      const estimatedInSector = Math.round(rangeSize * sectorRate);
      estimatedTotal += estimatedInSector;
      
      console.log(`  ${range.name} (${range.start}-${range.end}): 推定${estimatedInSector}社`);
    }
    
    console.log(`\n推定優待実施企業総数: ${estimatedTotal}社`);
    
    // 4. 結論と推奨事項
    console.log('\n=== 調査結果と推奨事項 ===');
    console.log('現在のスクレイピング対象: 120銘柄');
    console.log(`推定実際の優待実施企業: ${estimatedTotal}社以上`);
    console.log('');
    console.log('【推奨改善策】');
    console.log('1. 全証券コード範囲（1000-9999）を順次スキャン');
    console.log('2. みんかぶの検索結果ページから全銘柄リストを取得');
    console.log('3. 優待情報がある銘柄のみを動的に発見');
    
  } finally {
    await browser.close();
  }
}

researchTotalCompanies().catch(console.error);