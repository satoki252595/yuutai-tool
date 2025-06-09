import puppeteer from 'puppeteer';

/**
 * 単一銘柄デバッグ用スクリプト
 * 優待情報取得の詳細をデバッグ
 */
class SingleStockDebugger {
  
  async debugStock(stockCode) {
    console.log(`🔍 銘柄 ${stockCode} の詳細デバッグ開始`);
    
    const browser = await puppeteer.launch({
      headless: false, // GUI表示でデバッグ
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      devtools: true   // DevToolsを開く
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    try {
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      console.log(`📄 アクセス先: ${url}`);
      
      // ページを開く
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      console.log('⏳ 5秒待機（ページの完全読み込み待ち）...');
      await this.sleep(5000);
      
      // ページの全体構造を確認
      const pageStructure = await page.evaluate(() => {
        return {
          title: document.title,
          url: location.href,
          bodyLength: document.body.textContent.length,
          hasYutaiKeyword: document.body.textContent.includes('優待'),
          hasYutaiInTitle: document.title.includes('優待'),
          
          // 色々なセレクタでの要素存在確認
          elements: {
            mdBox: document.querySelectorAll('.md_box').length,
            mdHead: document.querySelectorAll('.md_head').length,
            mdBody: document.querySelectorAll('.md_body').length,
            lyContentWrapper: document.querySelectorAll('.ly_content_wrapper').length,
            lyColRight: document.querySelectorAll('.ly_col_right').length,
            
            // 代替セレクタも確認
            stockInfo: document.querySelectorAll('.stock-info').length,
            benefitInfo: document.querySelectorAll('.benefit-info').length,
            yutaiSection: document.querySelectorAll('.yutai').length,
            yutaiContent: document.querySelectorAll('.yutai-content').length
          },
          
          // HTML構造のサンプル
          htmlSample: document.body.innerHTML.slice(0, 1000),
          
          // テキストコンテンツのサンプル
          textSample: document.body.textContent.slice(0, 500).replace(/\\s+/g, ' ')
        };
      });
      
      console.log('\\n📊 ページ構造分析結果:');
      console.log(`タイトル: ${pageStructure.title}`);
      console.log(`URL: ${pageStructure.url}`);
      console.log(`本文長: ${pageStructure.bodyLength} 文字`);
      console.log(`"優待"キーワード含有: ${pageStructure.hasYutaiKeyword}`);
      console.log(`タイトルに"優待": ${pageStructure.hasYutaiInTitle}`);
      
      console.log('\\n🔍 要素の存在確認:');
      Object.entries(pageStructure.elements).forEach(([key, count]) => {
        console.log(`  ${key}: ${count}個`);
      });
      
      console.log('\\n📝 テキストサンプル:');
      console.log(pageStructure.textSample);
      
      // 優待情報を様々な方法で取得試行
      console.log('\\n🎯 優待情報取得試行:');
      
      const benefitAttempts = await page.evaluate(() => {
        const attempts = {};
        
        // 方法1: 既存のセレクタ
        attempts.method1 = [];
        const mdBoxes = document.querySelectorAll('.md_box');
        mdBoxes.forEach(box => {
          const head = box.querySelector('.md_head');
          const body = box.querySelector('.md_body');
          if (head && body) {
            attempts.method1.push({
              title: head.textContent.trim(),
              content: body.textContent.trim()
            });
          }
        });
        
        // 方法2: テキスト検索
        attempts.method2 = [];
        const allDivs = document.querySelectorAll('div');
        allDivs.forEach(div => {
          const text = div.textContent;
          if (text.includes('優待内容') || text.includes('株主優待') || text.includes('優待利回り')) {
            attempts.method2.push({
              className: div.className,
              text: text.slice(0, 100)
            });
          }
        });
        
        // 方法3: table要素の確認
        attempts.method3 = [];
        const tables = document.querySelectorAll('table');
        tables.forEach((table, index) => {
          const text = table.textContent;
          if (text.includes('優待') || text.includes('株主')) {
            attempts.method3.push({
              tableIndex: index,
              text: text.slice(0, 100)
            });
          }
        });
        
        return attempts;
      });
      
      console.log('方法1 (既存セレクタ):', benefitAttempts.method1);
      console.log('方法2 (テキスト検索):', benefitAttempts.method2.slice(0, 3));
      console.log('方法3 (テーブル検索):', benefitAttempts.method3.slice(0, 3));
      
      // ページのスクリーンショットを保存
      const screenshotPath = `/tmp/debug_${stockCode}_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`\\n📸 スクリーンショット保存: ${screenshotPath}`);
      
      console.log('\\n⏳ 30秒待機（手動確認用）...');
      await this.sleep(30000);
      
    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
    } finally {
      await browser.close();
    }
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 実行
const debugger = new SingleStockDebugger();

// 優待があることが確実な銘柄をテスト
const testStocks = [
  '2914', // 日本たばこ産業（JT）- 確実に優待あり
  '8591', // オリックス - 確実に優待あり  
  '9962', // ミスミグループ本社 - 確実に優待あり
  '3092'  // ZOZO - 確実に優待あり
];

// コマンドライン引数から銘柄コード取得、なければデフォルト
const stockCode = process.argv[2] || testStocks[0];

debugger.debugStock(stockCode).catch(console.error);