import puppeteer from 'puppeteer';
import { Database } from './database.js';

/**
 * 単一銘柄のテスト用スクレイパー
 */
class SingleStockTester {
  constructor() {
    this.db = new Database();
  }

  async testStock(stockCode) {
    console.log(`🧪 ${stockCode} の優待情報取得テスト開始...`);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // ユーザーエージェント設定
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      console.log(`📡 アクセス中: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });

      // ページタイトルを確認
      const title = await page.title();
      console.log(`📄 ページタイトル: ${title}`);

      // 銘柄名を取得
      const stockInfo = await page.evaluate(() => {
        // 複数のセレクタを試行
        const selectors = [
          'h1',
          '.stock-name',
          '.company-name',
          '[class*="title"]',
          '[class*="name"]'
        ];
        
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && elem.textContent) {
            return {
              selector: selector,
              text: elem.textContent.trim()
            };
          }
        }
        
        return { selector: 'none', text: document.title };
      });

      console.log(`🏢 銘柄情報: ${stockInfo.text} (セレクタ: ${stockInfo.selector})`);

      // 優待情報を取得
      const benefitInfo = await page.evaluate(() => {
        // 優待情報のコンテナを探す
        const containers = document.querySelectorAll(`
          .md_card,
          .benefit-content,
          .benefit-detail,
          [class*="benefit"],
          [class*="yutai"],
          .table_benefit,
          table
        `);
        
        const results = [];
        
        containers.forEach((container, index) => {
          const text = container.textContent?.trim() || '';
          if (text.length > 10) {
            results.push({
              index: index,
              selector: container.className || container.tagName,
              text: text.substring(0, 200) + (text.length > 200 ? '...' : '')
            });
          }
        });
        
        return results;
      });

      console.log(`📋 優待情報候補: ${benefitInfo.length} 件`);
      benefitInfo.forEach((info, i) => {
        console.log(`  ${i+1}. [${info.selector}] ${info.text}`);
      });

      // 実際に保存可能な優待情報があるかチェック
      if (benefitInfo.length > 0) {
        // データベースの既存情報を削除
        await this.db.deleteStockBenefits(stockCode);
        
        // 最初の有効そうな情報を保存してみる
        const firstBenefit = benefitInfo[0];
        if (firstBenefit.text.length >= 10) {
          await this.db.insertBenefit({
            stock_code: stockCode,
            benefit_type: 'テスト',
            description: firstBenefit.text,
            monetary_value: 0,
            min_shares: 100,
            holder_type: 'どちらでも',
            ex_rights_month: 3
          });
          
          console.log(`✅ テスト優待情報を保存しました`);
        }
      }

      return {
        success: benefitInfo.length > 0,
        benefitCount: benefitInfo.length,
        stockName: stockInfo.text
      };

    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      await browser.close();
    }
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new SingleStockTester();
  const stockCode = process.argv[2] || '4661';
  
  try {
    const result = await tester.testStock(stockCode);
    console.log('\n📊 テスト結果:', result);
  } catch (error) {
    console.error('テストエラー:', error);
  } finally {
    tester.close();
  }
}

export { SingleStockTester };