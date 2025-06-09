import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FullCoverageShareholderBenefitScraper {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.logFile = path.join(__dirname, 'scraping-log.json');
    this.progressFile = path.join(__dirname, 'scraping-progress.json');
    this.errorLogFile = path.join(__dirname, 'scraping-errors.log');
  }

  async scrapeAllStocks() {
    console.log('=== 完全網羅型優待情報スクレイピング開始 ===');
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      // 進捗状況の読み込み（中断からの再開対応）
      const progress = this.loadProgress();
      
      // 全証券コード範囲を生成（1000-9999の完全範囲）
      const allStockCodes = this.generateCompleteStockCodes();
      console.log(`${allStockCodes.length}銘柄の処理を開始します`);

      // 既に処理済みのコードをスキップ
      const remainingCodes = progress.lastProcessedCode 
        ? allStockCodes.filter(code => parseInt(code) > parseInt(progress.lastProcessedCode))
        : allStockCodes;

      if (progress.lastProcessedCode) {
        console.log(`前回の処理から再開: ${progress.lastProcessedCode}以降を処理`);
      }

      let successCount = progress.successCount || 0;
      let errorCount = progress.errorCount || 0;
      let noDataCount = progress.noDataCount || 0;
      const batchSize = 10; // バッチサイズを増やして効率化

      // バッチ処理
      for (let i = 0; i < remainingCodes.length; i += batchSize) {
        const batch = remainingCodes.slice(i, i + batchSize);
        const batchNum = Math.floor(i/batchSize) + 1;
        const totalBatches = Math.ceil(remainingCodes.length/batchSize);
        
        console.log(`\nバッチ ${batchNum}/${totalBatches} (${batch[0]}-${batch[batch.length-1]}) 処理中...`);
        
        // 並列処理でバッチ内の銘柄を処理
        const batchPromises = batch.map(async (code) => {
          try {
            const result = await this.scrapeStockBenefitWithRetry(browser, code, 3);
            if (result.success) {
              successCount++;
              console.log(`✓ ${code}: ${result.name} - ${result.benefitCount}件の優待`);
              this.logSuccess(code, result);
            } else if (result.noData) {
              noDataCount++;
              // 優待なしの場合もログに記録（サイレント）
              this.logNoData(code);
            } else {
              errorCount++;
              console.log(`✗ ${code}: エラー - ${result.error}`);
              this.logError(code, result.error);
            }
            return result;
          } catch (error) {
            errorCount++;
            this.logError(code, error.message);
            return { success: false, error: error.message };
          }
        });

        // バッチの結果を待つ
        await Promise.all(batchPromises);

        // 進捗を保存
        this.saveProgress({
          lastProcessedCode: batch[batch.length - 1],
          successCount,
          errorCount,
          noDataCount,
          totalProcessed: successCount + errorCount + noDataCount,
          timestamp: new Date().toISOString()
        });

        // バッチ間の待機（サーバー負荷軽減）
        if (i + batchSize < remainingCodes.length) {
          console.log(`  進捗: 成功${successCount}件, エラー${errorCount}件, 優待なし${noDataCount}件`);
          console.log(`  進捗率: ${((successCount + errorCount + noDataCount) / allStockCodes.length * 100).toFixed(2)}%`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`\n=== スクレイピング完了 ===`);
      console.log(`成功: ${successCount}件, エラー: ${errorCount}件, 優待なし: ${noDataCount}件`);
      console.log(`総処理数: ${successCount + errorCount + noDataCount}件`);
      
      // 最終レポートの生成
      await this.generateFinalReport();
      
      // DB内容を確認
      await this.verifyDatabase();

    } finally {
      await browser.close();
      this.db.close();
    }
  }

  generateCompleteStockCodes() {
    const codes = [];
    
    // 1000-9999の完全な範囲を生成
    for (let i = 1000; i <= 9999; i++) {
      codes.push(i.toString());
    }
    
    return codes;
  }

  async scrapeStockBenefitWithRetry(browser, stockCode, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.scrapeStockBenefit(browser, stockCode);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          console.log(`  ${stockCode}: リトライ ${attempt}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    return { success: false, error: lastError.message };
  }

  async scrapeStockBenefit(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      // タイムアウトを設定
      page.setDefaultTimeout(20000);
      
      // みんかぶから優待情報を取得
      const benefits = await this.scrapeMinkabu(page, stockCode);
      
      if (benefits.length === 0) {
        return { success: false, noData: true };
      }

      // Yahoo Finance APIから株価情報を取得
      let stockInfo;
      try {
        stockInfo = await this.yahooFinance.getStockPrice(stockCode);
      } catch (error) {
        // 株価取得失敗の場合はスキップ（上場廃止等の可能性）
        return { success: false, noData: true };
      }

      // 株式情報をDBに保存
      const stockName = this.japaneseCompanyName || stockInfo.name;
      await this.db.upsertStock({
        code: stockCode,
        name: stockName,
        market: stockInfo.market || '東証',
        sector: this.detectSector(stockName)
      });

      // 株価履歴を保存
      await this.db.insertPriceHistory(stockInfo);

      // 既存の優待情報を削除
      await this.db.deleteBenefitsByStockCode(stockCode);

      // 新しい優待情報を保存
      for (const benefit of benefits) {
        await this.db.insertBenefit(benefit);
      }

      return {
        success: true,
        name: stockName,
        benefitCount: benefits.length
      };

    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await page.close();
    }
  }

  async scrapeMinkabu(page, stockCode) {
    const benefits = [];
    
    try {
      // みんかぶの優待ページにアクセス
      await page.goto(`https://minkabu.jp/stock/${stockCode}/yutai`, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      // ページが正しく読み込まれたか確認
      const pageTitle = await page.title();
      if (!pageTitle.includes('優待') && !pageTitle.includes('株主優待')) {
        return benefits;
      }

      // 優待情報を取得（既存のscraper.jsのロジックを使用）
      const minkabuData = await page.evaluate(() => {
        const result = {
          benefits: [],
          exRightsMonth: [],
          companyName: ''
        };

        // 会社名を取得
        const selectors = [
          'h2:first-of-type',
          'h1.title_box',
          'h1',
          '.company-name'
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent?.trim();
            if (text && text.length > 0 && !text.includes('株主優待')) {
              result.companyName = text;
              break;
            }
          }
        }

        // 優待内容テーブルを探す
        const tables = document.querySelectorAll('table.md_table');
        if (tables.length > 1) {
          const benefitTable = tables[1];
          const rows = benefitTable.querySelectorAll('tbody tr');
          
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const sharesText = cells[0]?.textContent?.trim();
              const contentText = cells[1]?.textContent?.trim();
              
              if (sharesText && contentText && contentText.length > 5) {
                const shares = parseInt(sharesText.replace(/[^0-9]/g, '')) || 100;
                result.benefits.push({
                  minShares: shares,
                  description: contentText
                });
              }
            }
          });
        }

        // 権利確定月を探す
        const allText = document.body.textContent || '';
        
        const monthPatterns = [
          /権利確定月[：:]\s*(\d{1,2})月/g,
          /(\d{1,2})月[・、](\d{1,2})月/g,
          /権利確定日[：:]\s*(\d{1,2})月/g
        ];
        
        for (const pattern of monthPatterns) {
          let match;
          while ((match = pattern.exec(allText)) !== null) {
            if (match[1]) result.exRightsMonth.push(parseInt(match[1]));
            if (match[2]) result.exRightsMonth.push(parseInt(match[2]));
          }
        }

        // 重複を削除
        result.exRightsMonth = [...new Set(result.exRightsMonth)];
        
        return result;
      });

      // データを整形
      const { benefits: minkabuBenefits, exRightsMonth, companyName } = minkabuData;
      
      this.japaneseCompanyName = companyName;
      
      const months = exRightsMonth.length > 0 ? exRightsMonth : [3];
      
      minkabuBenefits.forEach(data => {
        months.forEach(month => {
          benefits.push({
            stockCode: stockCode,
            benefitType: this.detectBenefitType(data.description),
            description: this.cleanDescription(data.description),
            monetaryValue: this.estimateValue(data.description),
            minShares: data.minShares,
            holderType: 'どちらでも',
            exRightsMonth: month
          });
        });
      });

    } catch (error) {
      // エラーをログに記録
    }

    return benefits;
  }

  // 既存のヘルパーメソッド（scraper.jsから）
  detectBenefitType(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('食事券') || desc.includes('グルメ券') || desc.includes('飲食')) {
      return '食事券・グルメ券';
    }
    
    if (desc.includes('クオカード') || desc.includes('quo')) {
      return 'QUOカード・図書カード';
    }
    
    if (desc.includes('商品券') || desc.includes('ギフトカード')) {
      return '商品券・ギフトカード';
    }
    
    if (desc.includes('ポイント') || desc.includes('電子マネー')) {
      return 'ポイント・電子マネー';
    }
    
    if (desc.includes('宿泊') || desc.includes('ホテル') || desc.includes('レジャー')) {
      return '宿泊・レジャー';
    }
    
    if (desc.includes('割引券') || desc.includes('優待券') || desc.includes('割引')) {
      return '割引券・優待券';
    }
    
    return 'その他';
  }

  cleanDescription(description) {
    return description
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .substring(0, 200);
  }

  estimateValue(description) {
    const patterns = [
      /([0-9,]+)円相当/,
      /([0-9,]+)円分/,
      /([0-9,]+)円/,
      /([0-9,]+)ポイント/
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return parseInt(match[1].replace(/,/g, ''));
      }
    }
    
    return 1000;
  }

  detectSector(companyName) {
    const sectorKeywords = {
      '食品': ['食品', 'フード', 'ビール', '飲料'],
      '外食': ['レストラン', 'すかいらーく', 'マクドナルド'],
      '小売': ['イオン', '百貨店', 'ストア'],
      '金融': ['銀行', 'ホールディングス', '証券'],
      '運輸': ['鉄道', '航空', 'JR'],
      'エンタメ': ['ランド', 'リゾート', 'エンターテインメント']
    };
    
    for (const [sector, keywords] of Object.entries(sectorKeywords)) {
      for (const keyword of keywords) {
        if (companyName.includes(keyword)) {
          return sector;
        }
      }
    }
    
    return 'その他';
  }

  // ログ関連メソッド
  loadProgress() {
    try {
      if (fs.existsSync(this.progressFile)) {
        return JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
      }
    } catch (error) {
      console.error('進捗ファイル読み込みエラー:', error);
    }
    return {};
  }

  saveProgress(progress) {
    try {
      fs.writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
    } catch (error) {
      console.error('進捗保存エラー:', error);
    }
  }

  logSuccess(code, result) {
    this.appendToLog({
      timestamp: new Date().toISOString(),
      code,
      status: 'success',
      name: result.name,
      benefitCount: result.benefitCount
    });
  }

  logNoData(code) {
    this.appendToLog({
      timestamp: new Date().toISOString(),
      code,
      status: 'no_data'
    });
  }

  logError(code, error) {
    this.appendToLog({
      timestamp: new Date().toISOString(),
      code,
      status: 'error',
      error
    });
    
    // エラーログファイルにも記録
    fs.appendFileSync(
      this.errorLogFile,
      `${new Date().toISOString()} - ${code}: ${error}\n`
    );
  }

  appendToLog(entry) {
    try {
      let log = [];
      if (fs.existsSync(this.logFile)) {
        log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      }
      log.push(entry);
      fs.writeFileSync(this.logFile, JSON.stringify(log, null, 2));
    } catch (error) {
      console.error('ログ記録エラー:', error);
    }
  }

  async generateFinalReport() {
    console.log('\n=== 最終レポート生成中 ===');
    
    try {
      const log = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      
      const successCount = log.filter(e => e.status === 'success').length;
      const errorCount = log.filter(e => e.status === 'error').length;
      const noDataCount = log.filter(e => e.status === 'no_data').length;
      
      const report = {
        summary: {
          totalProcessed: log.length,
          successCount,
          errorCount,
          noDataCount,
          successRate: (successCount / log.length * 100).toFixed(2) + '%'
        },
        errorDetails: log.filter(e => e.status === 'error').slice(0, 100),
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(__dirname, 'scraping-report.json'),
        JSON.stringify(report, null, 2)
      );
      
      console.log('レポートを scraping-report.json に保存しました');
    } catch (error) {
      console.error('レポート生成エラー:', error);
    }
  }

  async verifyDatabase() {
    console.log('\n=== データベース最終確認 ===');
    
    try {
      const stockCount = await new Promise((resolve, reject) => {
        this.db.db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
          err ? reject(err) : resolve(row.count);
        });
      });
      
      const benefitCount = await new Promise((resolve, reject) => {
        this.db.db.get('SELECT COUNT(*) as count FROM shareholder_benefits', (err, row) => {
          err ? reject(err) : resolve(row.count);
        });
      });
      
      const stocksWithBenefits = await new Promise((resolve, reject) => {
        this.db.db.get('SELECT COUNT(DISTINCT stock_code) as count FROM shareholder_benefits', (err, row) => {
          err ? reject(err) : resolve(row.count);
        });
      });
      
      console.log(`登録銘柄数: ${stockCount}`);
      console.log(`優待がある銘柄数: ${stocksWithBenefits}`);
      console.log(`優待情報総数: ${benefitCount}`);
      
      // 証券コード範囲別の統計
      const rangeStats = await new Promise((resolve, reject) => {
        this.db.db.all(`
          SELECT 
            SUBSTR(code, 1, 1) || '000番台' as range,
            COUNT(*) as count
          FROM stocks
          GROUP BY SUBSTR(code, 1, 1)
          ORDER BY range
        `, (err, rows) => {
          err ? reject(err) : resolve(rows);
        });
      });
      
      console.log('\n証券コード範囲別統計:');
      rangeStats.forEach(row => {
        console.log(`  ${row.range}: ${row.count}銘柄`);
      });
      
    } catch (error) {
      console.error('データベース確認エラー:', error);
    }
  }
}

// スクレイピング実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new FullCoverageShareholderBenefitScraper();
  scraper.scrapeAllStocks().catch(console.error);
}