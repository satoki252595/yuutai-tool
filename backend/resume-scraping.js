import puppeteer from 'puppeteer';
import { Database } from './database.js';

class ResumeScraper {
  constructor() {
    this.db = new Database();
    this.processedCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
  }

  async getScrapingProgress() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          s.code,
          s.name,
          CASE WHEN sb.stock_code IS NOT NULL THEN 1 ELSE 0 END as has_benefits
        FROM stocks s
        LEFT JOIN (
          SELECT DISTINCT stock_code 
          FROM shareholder_benefits
        ) sb ON s.code = sb.stock_code
        ORDER BY s.code
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async scrapeFromLastPosition() {
    console.log('🔄 スクレイピング進捗を確認中...');
    
    const allStocks = await this.getScrapingProgress();
    const scrapedStocks = allStocks.filter(s => s.has_benefits);
    const remainingStocks = allStocks.filter(s => !s.has_benefits);
    
    console.log(`📊 スクレイピング状況:`);
    console.log(`   ✅ 完了済み: ${scrapedStocks.length}銘柄`);
    console.log(`   ⏳ 未処理: ${remainingStocks.length}銘柄`);
    console.log(`   📈 進捗率: ${((scrapedStocks.length / allStocks.length) * 100).toFixed(1)}%`);
    
    if (remainingStocks.length === 0) {
      console.log('✅ すべての銘柄のスクレイピングが完了しています！');
      return;
    }
    
    const startCode = remainingStocks[0].code;
    console.log(`\n🚀 銘柄コード ${startCode} から再開します`);
    
    // より安定した設定でブラウザを起動
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      protocolTimeout: 60000, // タイムアウトを60秒に増加
    });

    try {
      const page = await browser.newPage();
      
      // より長いタイムアウト設定
      await page.setDefaultNavigationTimeout(60000);
      await page.setDefaultTimeout(60000);
      
      // User-Agent設定
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

      // 処理開始
      for (let i = 0; i < remainingStocks.length; i++) {
        const stock = remainingStocks[i];
        this.processedCount++;

        try {
          console.log(`[${i + 1}/${remainingStocks.length}] ${stock.code}: ${stock.name} 処理中...`);
          
          const result = await this.scrapeStockBenefit(page, stock.code);
          
          if (result.success) {
            this.successCount++;
            console.log(`✅ ${stock.code}: 優待情報取得成功 (${result.benefitCount}件)`);
          } else {
            console.log(`⏭️ ${stock.code}: 優待情報なし`);
          }

          // 進捗表示（50件ごと）
          if (this.processedCount % 50 === 0) {
            this.logProgress(remainingStocks.length);
          }

          // 2秒待機（サーバー負荷軽減）
          await this.sleep(2000);

        } catch (error) {
          this.errorCount++;
          console.log(`❌ ${stock.code}: エラー - ${error.message}`);
          
          // ページエラーの場合は新しいページを作成
          if (error.message.includes('Page crashed') || 
              error.message.includes('Target closed') ||
              error.message.includes('Protocol error')) {
            console.log('📄 ページを再作成中...');
            try {
              await page.close();
            } catch (e) {}
            page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000);
            await page.setDefaultTimeout(60000);
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
          }
          
          // エラー時も待機
          await this.sleep(3000);
        }
      }

      // 最終結果
      this.logFinalResults(remainingStocks.length);

    } finally {
      await browser.close();
    }
  }

  async scrapeStockBenefit(page, stockCode) {
    try {
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });

      // 優待情報が存在するかチェック
      const hasYutai = await page.$('.md_box');
      if (!hasYutai) {
        return { success: false, noData: true };
      }

      // テーブルから優待情報を抽出
      const benefits = await page.evaluate(() => {
        const benefitRows = [];
        const rows = document.querySelectorAll('.md_table tbody tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const sharesText = cells[0]?.textContent?.trim() || '';
            const benefitText = cells[1]?.textContent?.trim() || '';
            const noteText = cells[2]?.textContent?.trim() || '';
            
            if (sharesText && benefitText) {
              benefitRows.push({
                requiredShares: sharesText,
                description: benefitText,
                notes: noteText
              });
            }
          }
        });
        
        return benefitRows;
      });

      if (benefits.length === 0) {
        return { success: false, noData: true };
      }

      // データベースに保存
      for (const benefit of benefits) {
        const minShares = this.parseMinShares(benefit.requiredShares);
        const monetaryValue = this.estimateMonetaryValue(benefit.description);
        
        await this.saveBenefit({
          stock_code: stockCode,
          benefit_type: this.categorizeBenefit(benefit.description),
          description: `${benefit.description} ${benefit.notes}`.trim(),
          monetary_value: monetaryValue,
          min_shares: minShares,
          holder_type: '一般',
          ex_rights_month: 3 // デフォルト値
        });
      }

      return { success: true, benefitCount: benefits.length };

    } catch (error) {
      console.error(`スクレイピングエラー (${stockCode}):`, error.message);
      return { success: false, error: error.message };
    }
  }

  parseMinShares(sharesText) {
    const match = sharesText.match(/(\d+)/);
    return match ? parseInt(match[1]) : 100;
  }

  estimateMonetaryValue(description) {
    if (description.includes('円相当') || description.includes('円分')) {
      const match = description.match(/(\d{1,3}(?:,\d{3})*)/);
      if (match) {
        return parseInt(match[1].replace(/,/g, ''));
      }
    }
    return 1000; // デフォルト値
  }

  categorizeBenefit(description) {
    if (description.includes('QUOカード')) return 'QUOカード';
    if (description.includes('商品券') || description.includes('ギフト券')) return '商品券・ギフトカード';
    if (description.includes('割引')) return '割引券・優待券';
    if (description.includes('食事')) return '食事券・グルメ券';
    if (description.includes('カタログ')) return 'カタログギフト';
    if (description.includes('自社製品') || description.includes('自社商品')) return '自社製品・サービス';
    return 'その他';
  }

  async saveBenefit(benefitData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO shareholder_benefits 
        (stock_code, benefit_type, description, monetary_value, min_shares, holder_type, ex_rights_month)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        benefitData.stock_code,
        benefitData.benefit_type,
        benefitData.description,
        benefitData.monetary_value,
        benefitData.min_shares,
        benefitData.holder_type,
        benefitData.ex_rights_month
      ];
      
      this.db.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logProgress(total) {
    const elapsed = (Date.now() - this.startTime) / 1000 / 60;
    const rate = this.processedCount / elapsed;
    const remaining = (total - this.processedCount) / rate;
    
    console.log(`\n📈 進捗: ${this.processedCount}/${total} (${((this.processedCount / total) * 100).toFixed(1)}%)`);
    console.log(`✅ 成功: ${this.successCount}, ❌ エラー: ${this.errorCount}`);
    console.log(`⏱️ 推定残り時間: ${remaining.toFixed(0)}分\n`);
  }

  logFinalResults(total) {
    const elapsed = (Date.now() - this.startTime) / 1000 / 60;
    
    console.log('\n🎉 スクレイピング完了！');
    console.log('📊 処理結果:');
    console.log(`  ✅ 成功: ${this.successCount}/${total} (${((this.successCount / total) * 100).toFixed(1)}%)`);
    console.log(`  ❌ エラー: ${this.errorCount}/${total} (${((this.errorCount / total) * 100).toFixed(1)}%)`);
    console.log(`  ⏱️ 所要時間: ${elapsed.toFixed(1)}分`);
  }
}

// 実行
const scraper = new ResumeScraper();
scraper.scrapeFromLastPosition()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ 致命的エラー:', err);
    process.exit(1);
  });