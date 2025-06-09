import puppeteer from 'puppeteer';

async function debugMinkabu() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const code = '3197';
    
    console.log(`みんかぶページ（${code}）の構造を詳細分析...`);
    
    await page.goto(`https://minkabu.jp/stock/${code}/yutai`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // ページの詳細情報を取得
    const pageInfo = await page.evaluate(() => {
      const result = {
        title: document.title,
        h1Elements: [],
        h2Elements: [],
        titleElements: [],
        headerText: ''
      };
      
      // すべてのh1要素
      document.querySelectorAll('h1').forEach((h1, i) => {
        result.h1Elements.push({
          index: i,
          text: h1.textContent?.trim(),
          className: h1.className
        });
      });
      
      // すべてのh2要素
      document.querySelectorAll('h2').forEach((h2, i) => {
        result.h2Elements.push({
          index: i,
          text: h2.textContent?.trim(),
          className: h2.className
        });
      });
      
      // title属性を持つ要素
      document.querySelectorAll('[title]').forEach((elem, i) => {
        if (i < 10) { // 最初の10個のみ
          result.titleElements.push({
            tag: elem.tagName,
            title: elem.title,
            text: elem.textContent?.trim()?.substring(0, 50)
          });
        }
      });
      
      // ヘッダー部分のテキスト
      const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('#header');
      if (header) {
        result.headerText = header.textContent?.trim()?.substring(0, 200);
      }
      
      // 会社名らしきテキストを含む要素を探す
      result.companyNameCandidates = [];
      const allElements = document.querySelectorAll('*');
      allElements.forEach(elem => {
        const text = elem.textContent?.trim();
        if (text && text.match(/^[ァ-ヶー\u3040-\u309F\u4E00-\u9FAF]+.*\(\d{4}\)/)) {
          result.companyNameCandidates.push({
            tag: elem.tagName,
            class: elem.className,
            text: text.substring(0, 100)
          });
        }
      });
      
      return result;
    });
    
    console.log('ページタイトル:', pageInfo.title);
    console.log('\nH1要素:');
    pageInfo.h1Elements.forEach(h1 => {
      console.log(`  ${h1.index}: "${h1.text}" (class: ${h1.className})`);
    });
    
    console.log('\nH2要素:');
    pageInfo.h2Elements.forEach(h2 => {
      console.log(`  ${h2.index}: "${h2.text}" (class: ${h2.className})`);
    });
    
    console.log('\n会社名候補:');
    pageInfo.companyNameCandidates.forEach(candidate => {
      console.log(`  ${candidate.tag}.${candidate.class}: "${candidate.text}"`);
    });
    
  } finally {
    await browser.close();
  }
}

debugMinkabu().catch(console.error);