import puppeteer from 'puppeteer';
import { Database } from './database.js';

/**
 * 改良版スクレイパー v2
 * みんかぶサイトの実際の構造に基づいた最適化
 */
export class ImprovedScraperV2 {
  constructor(options = {}) {
    this.db = new Database();
    this.timeout = options.timeout || 30000;
    this.delay = options.delay || 2000;
    this.retryCount = options.retryCount || 2;
    this.stealth = options.stealth || true;
  }

  /**
   * 単一銘柄のスクレイピング（改良版）
   */
  async scrapeStock(stockCode) {
    console.log(`🔍 銘柄 ${stockCode} の詳細スクレイピング開始`);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run'
      ]
    });
    
    const page = await browser.newPage();
    
    try {
      // ステルスモード設定
      if (this.stealth) {
        await this.setupStealthMode(page);
      }
      
      await page.setDefaultNavigationTimeout(this.timeout);
      await page.setDefaultTimeout(this.timeout);
      
      const result = await this.scrapeStockBenefit(page, stockCode);
      return result;
      
    } catch (error) {
      console.error(`❌ ${stockCode} スクレイピングエラー:`, error.message);
      return { success: false, error: error.message };
    } finally {
      await browser.close();
    }
  }

  /**
   * ステルスモード設定
   */
  async setupStealthMode(page) {
    // WebDriverの痕跡を隠す
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // ChromeのHeadlessを隠す
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ja-JP', 'ja'],
      });
    });
    
    // リアルなユーザーエージェント
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // リアルなヘッダー
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    });
  }

  /**
   * 優待情報の詳細スクレイピング
   */
  async scrapeStockBenefit(page, stockCode) {
    const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
    console.log(`📄 アクセス: ${url}`);
    
    // ページを開く
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: this.timeout 
    });

    // 少し待機（動的コンテンツの読み込み完了待ち）
    await this.sleep(this.delay);

    // ページの基本情報を取得
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: location.href,
        hasYutaiText: document.body.textContent.includes('優待'),
        noInfoText: document.body.textContent.includes('優待情報はありません')
      };
    });

    console.log(`  ページタイトル: ${pageInfo.title}`);
    console.log(`  優待テキスト存在: ${pageInfo.hasYutaiText}`);
    console.log(`  情報なしテキスト: ${pageInfo.noInfoText}`);

    // 優待情報がない場合
    if (pageInfo.noInfoText) {
      console.log(`  ℹ️ ${stockCode}: 優待情報なし`);
      return { success: false, noData: true, reason: '優待情報なし' };
    }

    // 優待情報を複数の方法で取得試行
    const benefitData = await page.evaluate(() => {
      const results = {
        basicInfo: {},
        benefits: [],
        detectedMethod: null
      };

      // 方法1: 基本情報の取得
      try {
        const investmentElement = document.querySelector('.invest_amount');
        const yieldElement = document.querySelector('.yutai_yield');
        const dividendElement = document.querySelector('.dividend_yield');
        const monthElement = document.querySelector('.rights_month');

        results.basicInfo = {
          minInvestment: investmentElement ? investmentElement.textContent.trim() : null,
          benefitYield: yieldElement ? yieldElement.textContent.trim() : null,
          dividendYield: dividendElement ? dividendElement.textContent.trim() : null,
          rightsMonth: monthElement ? monthElement.textContent.trim() : null
        };
      } catch (e) {
        console.log('基本情報取得エラー:', e.message);
      }

      // 方法2: テーブル形式の優待情報
      try {
        const tables = document.querySelectorAll('table');
        tables.forEach((table, tableIndex) => {
          const tableText = table.textContent;
          if (tableText.includes('株数') || tableText.includes('優待内容') || tableText.includes('優待券')) {
            const rows = table.querySelectorAll('tr');
            rows.forEach((row, rowIndex) => {
              const cells = row.querySelectorAll('td, th');
              if (cells.length >= 2) {
                const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                results.benefits.push({
                  type: 'table',
                  tableIndex: tableIndex,
                  rowIndex: rowIndex,
                  data: cellTexts,
                  source: 'table_scan'
                });
              }
            });
            results.detectedMethod = 'table_scan';
          }
        });
      } catch (e) {
        console.log('テーブルスキャンエラー:', e.message);
      }

      // 方法3: 一般的なクラス名での検索
      const commonSelectors = [
        '.md_box', '.benefit-content', '.yutai-content', 
        '.stock-benefit', '.shareholder-benefit', '.benefit-info',
        '.privilege-info', '.benefit-detail'
      ];

      commonSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element, index) => {
            const text = element.textContent.trim();
            if (text.length > 10 && (text.includes('優待') || text.includes('株主'))) {
              results.benefits.push({
                type: 'content',
                selector: selector,
                index: index,
                content: text.slice(0, 200),
                source: 'selector_scan'
              });
              if (!results.detectedMethod) results.detectedMethod = 'selector_scan';
            }
          });
        } catch (e) {
          // セレクタが存在しない場合は無視
        }
      });

      // 方法4: テキストベースの検索
      try {
        const allDivs = document.querySelectorAll('div');
        let benefitContent = '';
        
        allDivs.forEach(div => {
          const text = div.textContent.trim();
          if (text.includes('優待内容') && text.length > 20) {
            benefitContent = text;
            results.benefits.push({
              type: 'text_search',
              content: text.slice(0, 300),
              source: 'text_search'
            });
            if (!results.detectedMethod) results.detectedMethod = 'text_search';
          }
        });
      } catch (e) {
        console.log('テキスト検索エラー:', e.message);
      }

      return results;
    });

    console.log(`  検出方法: ${benefitData.detectedMethod}`);
    console.log(`  優待情報件数: ${benefitData.benefits.length}`);
    console.log(`  基本情報:`, benefitData.basicInfo);

    // 結果の処理と保存
    if (benefitData.benefits.length > 0) {
      const processedBenefits = await this.processBenefitData(stockCode, benefitData);
      
      // データベースに保存
      for (const benefit of processedBenefits) {
        try {
          await this.db.insertBenefit(benefit);
        } catch (error) {
          console.log(`  ⚠️ DB保存エラー: ${error.message}`);
        }
      }

      console.log(`  ✅ ${stockCode}: ${processedBenefits.length}件の優待情報を取得・保存`);
      return { 
        success: true, 
        benefitCount: processedBenefits.length,
        method: benefitData.detectedMethod,
        basicInfo: benefitData.basicInfo
      };
    }

    console.log(`  ⏭️ ${stockCode}: 優待情報の解析に失敗`);
    return { success: false, noData: true, reason: '解析失敗' };
  }

  /**
   * 優待データの処理
   */
  async processBenefitData(stockCode, benefitData) {
    const benefits = [];
    
    for (const benefit of benefitData.benefits) {
      let processedBenefit = {
        stock_code: stockCode,
        benefit_type: '株主優待',
        description: '',
        monetary_value: null,
        min_shares: 100, // デフォルト値
        holder_type: '一般',
        ex_rights_month: 3, // デフォルト値（3月）
        created_at: new Date().toISOString()
      };

      // データ形式に応じて処理
      switch (benefit.type) {
        case 'table':
          processedBenefit.description = benefit.data.join(' / ');
          break;
        case 'content':
        case 'text_search':
          processedBenefit.description = benefit.content;
          break;
      }

      // 基本情報から追加データを抽出
      if (benefitData.basicInfo.rightsMonth) {
        const monthMatch = benefitData.basicInfo.rightsMonth.match(/(\\d{1,2})月/);
        if (monthMatch) {
          processedBenefit.ex_rights_month = parseInt(monthMatch[1]);
        }
      }

      if (benefitData.basicInfo.minInvestment) {
        const amountMatch = benefitData.basicInfo.minInvestment.match(/([\\d,]+)/);
        if (amountMatch) {
          processedBenefit.min_shares = Math.floor(parseInt(amountMatch[1].replace(/,/g, '')) / 100); // 概算
        }
      }

      // コンテンツが有効な場合のみ追加
      if (processedBenefit.description && processedBenefit.description.length > 5) {
        benefits.push(processedBenefit);
      }
    }

    return benefits;
  }

  /**
   * スリープ
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new ImprovedScraperV2();
  
  // テスト用銘柄
  const testStock = process.argv[2] || '3048'; // ビックカメラ
  
  scraper.scrapeStock(testStock).then(result => {
    console.log('\\n🎉 スクレイピング結果:');
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}