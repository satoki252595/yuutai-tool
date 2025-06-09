import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import fs from 'fs';

// シンプルで確実な包括的スクレイピング
class SimpleComprehensiveScraper {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.browser = null;
    this.progressFile = './simple-scraping-progress.json';
    this.errorLog = './simple-scraping-errors.log';
    this.successCount = 0;
    this.errorCount = 0;
    this.skipCount = 0;
  }

  // 進捗状況を保存
  saveProgress(progress) {
    fs.writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
  }

  // 進捗状況を読み込み
  loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        return JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
      }
    } catch (error) {
      console.log('進捗ファイルの読み込みに失敗、新規開始します');
    }
    return { completed: [], failed: [], benefitStocks: [] };
  }

  // エラーログ記録
  logError(code, error) {
    const logEntry = `${new Date().toISOString()} - ${code}: ${error}\n`;
    fs.appendFileSync(this.errorLog, logEntry);
  }

  // 全証券コードを生成（1300-9999の範囲）
  generateAllStockCodes() {
    const codes = [];
    
    // 優待実施率が高い順に処理
    const ranges = [
      { start: 2000, end: 2999, name: '食品・化学' },      // 優待多い
      { start: 3000, end: 3999, name: '医薬・小売' },      // 優待多い
      { start: 7000, end: 7999, name: '小売・外食' },      // 優待最多
      { start: 8000, end: 8999, name: '金融・商社' },      // 優待多い
      { start: 9000, end: 9999, name: '運輸・インフラ' },  // 優待あり
      { start: 4000, end: 4999, name: 'IT・通信' },        // 優待少ない
      { start: 6000, end: 6999, name: '電機・自動車' },    // 優待少ない
      { start: 5000, end: 5999, name: '機械・素材' },      // 優待少ない
      { start: 1300, end: 1999, name: '建設・資材' }       // 優待少ない
    ];
    
    for (const range of ranges) {
      for (let i = range.start; i <= range.end; i++) {
        codes.push({
          code: i.toString().padStart(4, '0'),
          range: range.name
        });
      }
    }
    
    return codes;
  }

  // ブラウザ初期化
  async initBrowser() {
    console.log('ブラウザを初期化中...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    console.log('ブラウザ初期化完了');
  }

  // 単一銘柄のスクレイピング
  async scrapeSingleStock(stockCode, retryCount = 0) {
    const maxRetries = 2;
    let page = null;
    
    try {
      page = await this.browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      // minkabu.jpから優待情報を取得
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 20000 
        });
      } catch (error) {
        if (retryCount < maxRetries) {
          await page.close();
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.scrapeSingleStock(stockCode, retryCount + 1);
        }
        throw new Error(`ページ読み込み失敗`);
      }

      // 優待情報の存在確認
      const pageInfo = await page.evaluate(() => {
        // ページが存在しない場合のチェック
        if (document.title.includes('404') || document.body.textContent.includes('404')) {
          return { exists: false };
        }
        
        // 優待なしのチェック
        const bodyText = document.body.textContent;
        const hasNoYutai = bodyText.includes('株主優待はありません') || 
                          bodyText.includes('優待制度なし') ||
                          document.querySelector('.md_box_gray') !== null;
        
        // 会社名を取得
        const titleMatch = document.title.match(/(.+?)の株主優待/);
        const companyName = titleMatch ? titleMatch[1].trim() : null;
        
        return {
          exists: true,
          hasYutai: !hasNoYutai,
          companyName: companyName
        };
      });

      if (!pageInfo.exists) {
        return { success: false, reason: 'not_found' };
      }

      // Yahoo Financeから株価情報を取得
      let stockInfo = null;
      try {
        stockInfo = await this.yahooFinance.getStockPrice(stockCode);
      } catch (error) {
        // エラーでも続行
      }

      // 株式情報を保存
      const stockName = pageInfo.companyName || stockInfo?.name || `Unknown_${stockCode}`;
      await this.db.upsertStock({
        code: stockCode,
        name: stockName,
        market: stockInfo?.market || 'unknown',
        sector: null
      });

      if (!pageInfo.hasYutai) {
        return { success: true, hasYutai: false, name: stockName };
      }

      // 優待情報を取得
      const benefitData = await page.evaluate(() => {
        const benefits = [];
        
        // テーブルから優待情報を取得
        const tables = document.querySelectorAll('table.md_table');
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          rows.forEach((row, index) => {
            if (index === 0) return;
            
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const sharesText = cells[0]?.textContent || '';
              const benefitText = cells[1]?.textContent || '';
              
              if (benefitText.trim()) {
                const sharesMatch = sharesText.match(/(\d+)\s*株/);
                const shares = sharesMatch ? parseInt(sharesMatch[1]) : 100;
                
                const amountMatch = benefitText.match(/(\d{1,3}(?:,\d{3})*)\s*円/);
                const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 1000;
                
                benefits.push({
                  description: benefitText.trim().substring(0, 500),
                  monetary_value: Math.min(amount, 15000),
                  min_shares: shares,
                  ex_rights_month: 3
                });
              }
            }
          });
        });
        
        return benefits;
      });

      // 優待情報を保存
      if (benefitData && benefitData.length > 0) {
        for (const benefit of benefitData) {
          const benefitType = this.classifyBenefitType(benefit.description);
          
          await this.db.insertBenefit({
            stock_code: stockCode,
            benefit_type: benefitType,
            description: benefit.description,
            monetary_value: benefit.monetary_value,
            min_shares: benefit.min_shares || 100,
            holder_type: 'どちらでも',
            ex_rights_month: benefit.ex_rights_month,
            has_long_term_holding: benefit.description.includes('年以上') ? 1 : 0
          });
        }
      }

      // 株価履歴を保存
      if (stockInfo?.price) {
        try {
          await this.db.insertPriceHistory(stockInfo);
        } catch (error) {
          // エラーでも続行
        }
      }

      return { 
        success: true, 
        hasYutai: true, 
        name: stockName, 
        benefitCount: benefitData.length 
      };

    } catch (error) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (page) await page.close();
        return this.scrapeSingleStock(stockCode, retryCount + 1);
      }
      
      this.logError(stockCode, error.message);
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (error) {
          // 無視
        }
      }
    }
  }

  // 優待種別分類
  classifyBenefitType(description) {
    if (!description) return 'その他';
    
    const desc = description.toLowerCase();
    
    // 長期保有条件を除去
    const cleanDesc = desc.replace(/【\d+[年ヶ月]以上保有[^】]*】/g, '').trim();
    
    // 単純な金額表記
    if (/^\d{1,5}円相当?$/.test(cleanDesc) || /^\d{1,3},\d{3}円相当?$/.test(cleanDesc)) {
      return '商品券・ギフトカード';
    }
    
    // 分類ルール
    const rules = {
      '商品券・ギフトカード': ['円相当', 'ギフトカード', '商品券', 'jcb', 'visa'],
      '割引券・優待券': ['割引', '優待券', '％off', '%off', '枚'],
      '食事券・グルメ券': ['食事券', '飲食券', 'レストラン', 'ランチ'],
      'QUOカード・図書カード': ['quoカード', 'クオカード', '図書カード'],
      '自社製品・商品': ['自社製品', '自社商品', '詰合せ', 'セット'],
      'ポイント・電子マネー': ['ポイント', '電子マネー', 'waon', 'nanaco']
    };
    
    for (const [type, keywords] of Object.entries(rules)) {
      if (keywords.some(keyword => cleanDesc.includes(keyword))) {
        return type;
      }
    }
    
    return 'その他';
  }

  // 統計情報の表示
  async showStatistics() {
    const stats = await new Promise((resolve, reject) => {
      this.db.db.get(`
        SELECT 
          (SELECT COUNT(*) FROM stocks) as total_stocks,
          (SELECT COUNT(DISTINCT stock_code) FROM shareholder_benefits) as stocks_with_benefits,
          (SELECT COUNT(*) FROM shareholder_benefits) as total_benefits
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`\n=== データベース統計 ===`);
    console.log(`総銘柄数: ${stats.total_stocks}件`);
    console.log(`優待あり銘柄: ${stats.stocks_with_benefits}件`);
    console.log(`総優待情報: ${stats.total_benefits}件`);
    console.log(`優待実施率: ${(stats.stocks_with_benefits / stats.total_stocks * 100).toFixed(1)}%`);
  }

  // メイン実行関数
  async execute() {
    try {
      console.log('=== シンプル包括的スクレイピング開始 ===\n');
      
      // 現在の統計を表示
      await this.showStatistics();
      
      // 進捗状況を読み込み
      const progress = this.loadProgress();
      console.log(`\n前回の進捗: ${progress.completed.length}件完了, ${progress.failed.length}件失敗`);
      console.log(`優待あり銘柄: ${progress.benefitStocks.length}件`);
      
      await this.initBrowser();
      
      const allCodes = this.generateAllStockCodes();
      console.log(`\n対象: ${allCodes.length}件の証券コード\n`);
      
      // 未処理のコードのみ
      const remainingCodes = allCodes.filter(item => 
        !progress.completed.includes(item.code)
      );
      
      console.log(`未処理: ${remainingCodes.length}件\n`);
      
      const startTime = Date.now();
      
      for (let i = 0; i < remainingCodes.length; i++) {
        const item = remainingCodes[i];
        const totalProgress = ((progress.completed.length + i) / allCodes.length * 100).toFixed(1);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const eta = i > 0 ? Math.floor(elapsed / i * (remainingCodes.length - i)) : 0;
        
        console.log(`\n[${totalProgress}%] ${item.code} (${item.range}) | 経過:${Math.floor(elapsed/60)}分 残り:${Math.floor(eta/60)}分`);
        
        try {
          const result = await this.scrapeSingleStock(item.code);
          
          if (result.success) {
            progress.completed.push(item.code);
            this.successCount++;
            
            if (result.hasYutai) {
              if (!progress.benefitStocks.includes(item.code)) {
                progress.benefitStocks.push(item.code);
              }
              console.log(`✓ ${result.name} - ${result.benefitCount}件の優待`);
            } else {
              console.log(`○ ${result.name} - 優待なし`);
            }
          } else {
            if (result.reason === 'not_found') {
              progress.completed.push(item.code); // 存在しない銘柄も完了扱い
              this.skipCount++;
              console.log(`- 銘柄なし`);
            } else {
              progress.failed.push(item.code);
              this.errorCount++;
              console.log(`✗ エラー`);
            }
          }
          
        } catch (error) {
          progress.failed.push(item.code);
          this.errorCount++;
          console.log(`✗ エラー: ${error.message}`);
        }
        
        // 進捗保存
        if ((i + 1) % 10 === 0) {
          this.saveProgress(progress);
          console.log(`\n=== 進捗保存 === 成功:${this.successCount} 失敗:${this.errorCount} 優待銘柄:${progress.benefitStocks.length}`);
        }
        
        // レート制限
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 最終結果
      this.saveProgress(progress);
      
      const totalTime = Math.floor((Date.now() - startTime) / 1000 / 60);
      console.log('\n=== スクレイピング完了 ===');
      console.log(`処理時間: ${totalTime}分`);
      console.log(`成功: ${this.successCount}件`);
      console.log(`エラー: ${this.errorCount}件`);
      console.log(`スキップ: ${this.skipCount}件`);
      console.log(`総完了: ${progress.completed.length}件`);
      console.log(`優待あり銘柄: ${progress.benefitStocks.length}件`);
      
      // 最終統計
      await this.showStatistics();
      
    } catch (error) {
      console.error('Fatal error:', error);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
      this.db.close();
    }
  }
}

// 実行
const scraper = new SimpleComprehensiveScraper();
scraper.execute();