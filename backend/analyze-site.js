import puppeteer from 'puppeteer';

async function analyzeSite() {
  const browser = await puppeteer.launch({ 
    headless: 'new',  // ヘッドレスモードで実行
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // テスト銘柄（すかいらーく）
    const testCode = '3197';
    
    console.log('=== Webサイト構造分析 ===\n');
    
    // 1. Kabutan（株探）の優待情報
    console.log('1. Kabutan（株探）を分析中...');
    try {
      await page.goto(`https://kabutan.jp/stock/benefit?code=${testCode}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // ページタイトルを確認
      const kabutanTitle = await page.title();
      console.log(`  ページタイトル: ${kabutanTitle}`);
      
      // 優待情報の存在確認
      const kabutanSelectors = {
        benefitTable: 'table.stock_benefit_table',
        benefitRows: 'table.stock_benefit_table tbody tr',
        noData: '.no_data',
        benefitContent: '.benefit_content',
        benefitDetail: '.benefit_detail'
      };
      
      for (const [name, selector] of Object.entries(kabutanSelectors)) {
        const exists = await page.$(selector) !== null;
        console.log(`  ${name}: ${exists ? '✓ 存在' : '✗ なし'} (${selector})`);
      }
      
      // 実際のデータを取得してみる
      const kabutanData = await page.evaluate(() => {
        const data = {
          hasTable: !!document.querySelector('table.stock_benefit_table'),
          rowCount: document.querySelectorAll('table.stock_benefit_table tbody tr').length,
          firstRowText: document.querySelector('table.stock_benefit_table tbody tr')?.textContent?.trim()
        };
        
        // より広範囲に優待情報を探す
        const possibleSelectors = [
          '#stockinfo_i3 table',
          '.stock_kabuka2_table',
          'table[summary*="優待"]',
          'div[class*="benefit"]',
          'div[class*="yutai"]'
        ];
        
        data.foundSelectors = [];
        possibleSelectors.forEach(sel => {
          const elem = document.querySelector(sel);
          if (elem) {
            data.foundSelectors.push({
              selector: sel,
              text: elem.textContent?.substring(0, 100)
            });
          }
        });
        
        return data;
      });
      
      console.log('  取得データ:', JSON.stringify(kabutanData, null, 2));
      
    } catch (error) {
      console.log(`  ✗ エラー: ${error.message}`);
    }
    
    // 2. みんかぶの優待情報
    console.log('\n2. みんかぶを分析中...');
    try {
      await page.goto(`https://minkabu.jp/stock/${testCode}/yutai`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      const minkabuTitle = await page.title();
      console.log(`  ページタイトル: ${minkabuTitle}`);
      
      // みんかぶのセレクタ候補
      const minkabuSelectors = {
        yutaiBox: '.ly_content_wrapper',
        yutaiTable: 'table.md_table',
        yutaiDetail: '.yutai-detail-box',
        benefitCard: '.benefit-card',
        mdBox: '.md_box'
      };
      
      for (const [name, selector] of Object.entries(minkabuSelectors)) {
        const exists = await page.$(selector) !== null;
        console.log(`  ${name}: ${exists ? '✓ 存在' : '✗ なし'} (${selector})`);
      }
      
      // より詳細な分析
      const minkabuData = await page.evaluate(() => {
        const data = {
          tables: document.querySelectorAll('table').length,
          divs: document.querySelectorAll('div[class*="yutai"], div[class*="benefit"]').length
        };
        
        // テーブル内容を確認
        const tables = document.querySelectorAll('table');
        data.tableInfo = [];
        tables.forEach((table, i) => {
          data.tableInfo.push({
            index: i,
            className: table.className,
            rows: table.querySelectorAll('tr').length,
            firstRowText: table.querySelector('tr')?.textContent?.substring(0, 100)
          });
        });
        
        return data;
      });
      
      console.log('  分析結果:', JSON.stringify(minkabuData, null, 2));
      
    } catch (error) {
      console.log(`  ✗ エラー: ${error.message}`);
    }
    
    // 3. Yahoo!ファイナンスの優待情報
    console.log('\n3. Yahoo!ファイナンスを分析中...');
    try {
      // Yahoo!ファイナンスは構造が変わっている可能性があるので、複数のURLパターンを試す
      const yahooUrls = [
        `https://finance.yahoo.co.jp/quote/${testCode}.T`,
        `https://stocks.finance.yahoo.co.jp/stocks/benefit/?code=${testCode}`,
        `https://info.finance.yahoo.co.jp/stockholder/detail/?code=${testCode}`
      ];
      
      for (const url of yahooUrls) {
        console.log(`  試行URL: ${url}`);
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000
          });
          
          const pageTitle = await page.title();
          console.log(`    タイトル: ${pageTitle}`);
          
          // 優待関連のリンクを探す
          const benefitLink = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const benefitLinks = links.filter(a => 
              a.textContent?.includes('優待') || 
              a.href?.includes('benefit') ||
              a.href?.includes('stockholder')
            );
            return benefitLinks.map(a => ({
              text: a.textContent?.trim(),
              href: a.href
            }));
          });
          
          if (benefitLink.length > 0) {
            console.log(`    優待リンク発見:`, benefitLink);
          }
          
        } catch (err) {
          console.log(`    ✗ アクセス失敗: ${err.message}`);
        }
      }
      
    } catch (error) {
      console.log(`  ✗ エラー: ${error.message}`);
    }
    
    // ヘッドレスモードなので待機不要
    
  } finally {
    await browser.close();
  }
}

// 実行
analyzeSite().catch(console.error);