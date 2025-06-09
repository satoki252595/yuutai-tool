import puppeteer from 'puppeteer';
import { Database } from './database.js';

export class SerialScraper {
  constructor() {
    this.db = new Database();
    this.processedCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
  }

  async scrapeAllStocks() {
    console.log('🕷️ シリアル優待情報スクレイピング開始');
    console.log('設定: 1ブラウザ, シリアル実行, 1秒間隔');
    
    const browserConfig = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    };
    
    // Docker環境でChromiumのパスを指定
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      browserConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    const browser = await puppeteer.launch(browserConfig);

    try {
      // DBから全ての株式コードを取得
      const allStocks = await this.db.getAllStocks();
      console.log(`📊 ${allStocks.length} 銘柄をシリアル処理開始`);

      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(30000); // 30秒タイムアウト
      await page.setDefaultTimeout(30000);

      for (let i = 0; i < allStocks.length; i++) {
        const stock = allStocks[i];
        this.processedCount++;

        try {
          console.log(`[${i + 1}/${allStocks.length}] ${stock.code}: ${stock.name} 処理中...`);
          
          const result = await this.scrapeStockBenefit(page, stock.code);
          
          if (result.success) {
            this.successCount++;
            console.log(`✅ ${stock.code}: 優待情報取得成功 (${result.benefitCount}件)`);
          } else {
            console.log(`⏭️ ${stock.code}: 優待情報なし`);
          }

          // 進捗表示（100件ごと）
          if (this.processedCount % 100 === 0) {
            this.logProgress(allStocks.length);
          }

          // 1秒待機（サーバー負荷軽減）
          await this.sleep(1000);

        } catch (error) {
          this.errorCount++;
          console.log(`❌ ${stock.code}: エラー - ${error.message}`);
          
          // ページエラーの場合は新しいページを作成
          if (error.message.includes('Page crashed') || error.message.includes('Target closed')) {
            console.log('📄 ページを再作成中...');
            await page.close();
            page = await browser.newPage();
            await page.setDefaultNavigationTimeout(30000);
            await page.setDefaultTimeout(30000);
          }
          
          // エラー時も待機
          await this.sleep(1000);
        }
      }

      // 最終結果
      this.logFinalResults(allStocks.length);

    } finally {
      await browser.close();
    }
  }

  async scrapeStockBenefit(page, stockCode) {
    try {
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // 優待情報が存在するかチェック
      const hasYutai = await page.$('.md_box');
      if (!hasYutai) {
        return { success: false, noData: true };
      }

      // 優待内容を取得
      const benefits = await page.evaluate(() => {
        const benefitElements = document.querySelectorAll('.md_box');
        const results = [];

        benefitElements.forEach(element => {
          const titleElement = element.querySelector('.md_head');
          const contentElement = element.querySelector('.md_body');
          
          if (titleElement && contentElement) {
            const title = titleElement.textContent.trim();
            const content = contentElement.textContent.trim()
              .replace(/\s+/g, ' ')  // 複数の空白を1つに
              .replace(/\n+/g, ' ')  // 改行を空白に
              .replace(/\t+/g, ' ')  // タブを空白に
              .trim();

            if (content && content !== '-' && content.length > 3) {
              results.push({
                title: title || '株主優待',
                content: content
              });
            }
          }
        });

        return results;
      });

      // 権利確定月を取得
      const rightsMonth = await page.evaluate(() => {
        const monthElement = document.querySelector('.ly_col_right .md_box .ly_content_wrapper');
        if (monthElement) {
          const text = monthElement.textContent;
          const monthMatch = text.match(/(\d{1,2})月/);
          return monthMatch ? monthMatch[1] : null;
        }
        return null;
      });

      // 最低投資金額を取得
      const minInvestment = await page.evaluate(() => {
        const elements = document.querySelectorAll('.ly_col_right .md_box .ly_content_wrapper');
        for (const element of elements) {
          const text = element.textContent;
          if (text.includes('円') && text.includes('株')) {
            const amountMatch = text.match(/([\d,]+)円/);
            return amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : null;
          }
        }
        return null;
      });

      if (benefits.length > 0) {
        // データベースに保存
        for (const benefit of benefits) {
          await this.db.insertShareholderBenefit({
            stockCode: stockCode,
            benefitType: benefit.title,
            benefitContent: benefit.content,
            rightsMonth: rightsMonth ? parseInt(rightsMonth) : null,
            minShares: null,
            minInvestment: minInvestment,
            benefitValue: null,
            notes: null,
            longTermBenefit: null,
            longTermMonths: null
          });
        }

        return { 
          success: true, 
          benefitCount: benefits.length,
          rightsMonth: rightsMonth,
          minInvestment: minInvestment
        };
      }

      return { success: false, noData: true };

    } catch (error) {
      throw error;
    }
  }

  logProgress(total) {
    const elapsed = Date.now() - this.startTime;
    const rate = this.processedCount / (elapsed / 60000); // 件/分
    const percentage = ((this.processedCount / total) * 100).toFixed(1);
    
    console.log(`\n📈 進捗: ${this.processedCount}/${total} (${percentage}%) - ${rate.toFixed(1)} 銘柄/分`);
    console.log(`✅ 成功: ${this.successCount}, ❌ エラー: ${this.errorCount}`);
    
    if (rate > 0) {
      const remainingMinutes = (total - this.processedCount) / rate;
      console.log(`⏱️ 推定残り時間: ${Math.round(remainingMinutes)}分\n`);
    }
  }

  logFinalResults(total) {
    const elapsed = Date.now() - this.startTime;
    const minutes = Math.round(elapsed / 60000);
    const avgRate = this.processedCount / (elapsed / 60000);
    
    console.log('\n🎉 シリアルスクレイピング完了！');
    console.log(`📊 処理結果:`);
    console.log(`  ✅ 成功: ${this.successCount}/${total} (${((this.successCount/total)*100).toFixed(1)}%)`);
    console.log(`  ❌ エラー: ${this.errorCount}/${total} (${((this.errorCount/total)*100).toFixed(1)}%)`);
    console.log(`  ⏱️ 所要時間: ${minutes}分`);
    console.log(`  📈 平均レート: ${avgRate.toFixed(1)} 銘柄/分`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new SerialScraper();
  scraper.scrapeAllStocks().catch(console.error);
}