import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ShareholderBenefitScraper {
  constructor(options = {}) {
    this.concurrency = Math.min(options.concurrency || 4, 4);
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.progressFile = path.join(__dirname, 'scraping-progress.json');
    this.browsers = [];
    this.maxRetries = 3;
    this.delayBetweenRequests = 800;
    this.batchSize = 50;
    this.restartInterval = 200;
  }

  async scrapeStocks(stockCodes) {
    console.log(`=== ${this.concurrency}並列スクレイピング開始: ${stockCodes.length}銘柄 ===`);
    
    try {
      const progress = await this.loadProgress();
      const remainingCodes = stockCodes.filter(code => !progress.completed.includes(code));
      
      console.log(`完了済み: ${progress.completed.length}件`);
      console.log(`残り: ${remainingCodes.length}件`);
      
      if (remainingCodes.length === 0) {
        console.log('すべての銘柄が処理済みです');
        return;
      }

      // バッチ処理で実行
      for (let i = 0; i < remainingCodes.length; i += this.batchSize) {
        const batch = remainingCodes.slice(i, i + this.batchSize);
        console.log(`\n=== バッチ ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(remainingCodes.length / this.batchSize)}: ${batch.length}銘柄 ===`);
        
        await this.processBatch(batch, progress);
        
        // 定期的にブラウザを再起動
        if ((i + this.batchSize) % this.restartInterval === 0 && i + this.batchSize < remainingCodes.length) {
          console.log('🔄 ブラウザプールを再起動中...');
          await this.restartBrowsers();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      await this.saveProgress(progress);
      
      console.log(`\n=== 並列スクレイピング完了 ===`);
      console.log(`✓ 総処理数: ${progress.completed.length}件`);

    } catch (error) {
      console.error('❌ 重大なエラー:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async processBatch(batch, progress) {
    // ブラウザプールを初期化
    await this.initializeBrowserPool();
    
    try {
      const results = await this.processInParallel(batch, progress);
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success && !r.noData).length;
      const noData = results.filter(r => r.noData).length;
      
      console.log(`  バッチ結果: 成功${successful}件, データなし${noData}件, エラー${failed}件`);
      
    } finally {
      await this.closeBrowsers();
    }
  }

  async initializeBrowserPool() {
    if (this.browsers.length > 0) {
      await this.closeBrowsers();
    }
    
    this.browsers = [];
    
    for (let i = 0; i < this.concurrency; i++) {
      try {
        const browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-extensions',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--memory-pressure-off'
          ]
        });
        
        this.browsers.push({
          instance: browser,
          id: i + 1,
          isActive: false,
          processed: 0
        });
      } catch (error) {
        console.error(`ブラウザ${i + 1}の起動に失敗:`, error.message);
        // 失敗した場合は並列数を減らして続行
        break;
      }
    }
    
    console.log(`  ✓ ${this.browsers.length}個のブラウザが準備完了`);
  }

  async processInParallel(stockCodes, progress) {
    return new Promise((resolve) => {
      const results = [];
      let processedCount = 0;
      let queueIndex = 0;
      
      const handleWorkerComplete = async (result) => {
        results.push(result);
        processedCount++;
        
        if (result.success) {
          progress.completed.push(result.code);
          console.log(`    ✓ ${result.code}: ${result.name} - ${result.benefitCount}件`);
        } else if (!result.noData) {
          console.log(`    ✗ ${result.code}: エラー - ${result.error}`);
        }
        
        // 進捗保存（5件ごと）
        if (processedCount % 5 === 0) {
          await this.saveProgress(progress);
        }
        
        // 次のタスクがあれば処理
        if (queueIndex < stockCodes.length) {
          const nextCode = stockCodes[queueIndex++];
          this.processStock(result.browserId, nextCode).then(handleWorkerComplete);
        } else {
          // すべて完了チェック
          if (processedCount === stockCodes.length) {
            resolve(results);
          }
        }
      };

      // 利用可能なワーカー数を確認
      const availableWorkers = Math.min(this.browsers.length, stockCodes.length);
      
      // 初期ワーカー起動
      for (let i = 0; i < availableWorkers; i++) {
        if (queueIndex < stockCodes.length) {
          const code = stockCodes[queueIndex++];
          this.processStock(i, code).then(handleWorkerComplete);
        }
      }
    });
  }

  async processStock(browserId, stockCode, retryCount = 0) {
    if (browserId >= this.browsers.length) {
      return { 
        success: false, 
        error: 'ブラウザインスタンスが利用できません', 
        code: stockCode, 
        browserId 
      };
    }

    const browser = this.browsers[browserId];
    browser.isActive = true;
    
    let page = null;
    
    try {
      // リクエスト間隔制御
      if (browser.processed > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenRequests));
      }

      page = await browser.instance.newPage();
      
      // ページタイムアウト設定
      page.setDefaultTimeout(20000);
      page.setDefaultNavigationTimeout(20000);

      let stockInfo;
      try {
        stockInfo = await this.yahooFinance.getStockPrice(stockCode);
      } catch (yahooError) {
        // Yahoo Finance APIエラーの場合、最小限の情報で続行
        stockInfo = {
          code: stockCode,
          name: stockCode,  // 後でみんかぶから取得
          price: 0,
          dividendYield: 0,
          annualDividend: 0,
          market: '東証',
          lastUpdated: new Date()
        };
      }
      
      if (!stockInfo) {
        return { 
          success: false, 
          noData: true, 
          code: stockCode, 
          browserId 
        };
      }

      const scrapingResult = await this.scrapeBenefits(page, stockCode);
      const benefits = scrapingResult.benefits || [];
      const scrapedDividendYield = scrapingResult.dividendYield;
      
      // Yahoo Financeエラーの場合、みんかぶから取得した情報で補完
      if (stockInfo.price === 0 && scrapingResult.stockPrice) {
        stockInfo.price = scrapingResult.stockPrice;
      }
      if (stockInfo.name === stockCode && scrapingResult.companyName) {
        stockInfo.name = scrapingResult.companyName;
      }

      // データベース操作
      await this.db.upsertStock({
        code: stockCode,
        name: stockInfo.name,
        japanese_name: this.japaneseCompanyName || stockInfo.name,
        market: stockInfo.market || '東証',
        sector: this.detectSector(this.japaneseCompanyName || stockInfo.name)
      });

      // 最新の価格情報を保存（スクレイピングした配当利回りを使用）
      const priceHistoryData = {
        ...stockInfo,
        dividendYield: scrapedDividendYield !== null ? scrapedDividendYield : stockInfo.dividendYield
      };
      await this.db.insertPriceHistory(priceHistoryData);
      
      // 28日分の価格履歴を取得
      try {
        const priceHistory = await this.yahooFinance.getStockPriceHistory(stockCode, 50); // RSI(28)計算のため50日に延長
        
        // 価格履歴をDBに保存（最新の1件は既に保存済みなのでスキップ）
        for (const history of priceHistory.slice(1)) {
          await this.db.insertPriceHistory({
            code: stockCode,
            price: history.price,
            dividendYield: scrapedDividendYield !== null ? scrapedDividendYield : stockInfo.dividendYield,  // スクレイピングした配当利回りを使用
            annualDividend: stockInfo.annualDividend,  // 年間配当金を追加
            lastUpdated: history.date
          });
        }
        
        // RSI(14)とRSI(28)を計算
        const prices = priceHistory.map(h => h.price).reverse(); // 新しい順に並べ替え
        const rsi14 = this.calculateRSI(prices, 14);
        const rsi28 = this.calculateRSI(prices, 28);
        
        // RSI値をstocksテーブルに保存
        if (rsi14 !== null || rsi28 !== null) {
          await this.updateRSI(stockCode, rsi14, rsi28);
        }
      } catch (error) {
        // 価格履歴取得エラーは無視して続行
      }

      await this.db.deleteBenefitsByStockCode(stockCode);

      for (const benefit of benefits) {
        await this.db.insertBenefit(benefit);
      }

      browser.processed++;
      
      return {
        success: true,
        code: stockCode,
        name: stockInfo.name,
        benefitCount: benefits.length,
        browserId
      };

    } catch (error) {
      // リトライ処理
      if (retryCount < this.maxRetries) {
        console.log(`    🔄 ${stockCode}: リトライ ${retryCount + 1}/${this.maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        
        // ページを閉じてから再試行
        if (page) {
          try { await page.close(); } catch {}
        }
        
        return this.processStock(browserId, stockCode, retryCount + 1);
      }
      
      return { 
        success: false, 
        error: error.message, 
        code: stockCode, 
        browserId 
      };
    } finally {
      if (page) {
        try { await page.close(); } catch {}
      }
      browser.isActive = false;
    }
  }

  async scrapeBenefits(page, stockCode) {
    try {
      await page.goto(`https://minkabu.jp/stock/${stockCode}/yutai`, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });

      const pageData = await page.evaluate(() => {
        const benefits = [];
        const months = [];

        // 会社名を取得
        const companyName = document.querySelector('h2')?.textContent?.trim() || '';
        
        // まず優待発生株数を取得（最も正確な情報）
        const fullPageText = document.body.textContent || '';
        let actualMinShares = null;
        
        // 優待発生株数のパターンを探す
        const minSharesPatterns = [
          /優待発生株数[\s\u3000]*([\d,]+)/,
          /最低投資株数[\s\u3000]*([\d,]+)/,
          /最低投資金額[\s\u3000]*[\d,]+円[\s\u3000]*優待発生株数[\s\u3000]*([\d,]+)/
        ];
        
        for (const pattern of minSharesPatterns) {
          const match = fullPageText.match(pattern);
          if (match) {
            actualMinShares = parseInt(match[1].replace(/,/g, ''));
            break;
          }
        }

        // 配当利回りを抽出（みんかぶページから）
        let dividendYield = null;
        const dividendPatterns = [
          /配当利回り[\s\u3000]*([0-9.]+)%/,
          /配当利回り[\s\u3000]*([0-9.]+)/,
          /予想配当利回り[\s\u3000]*([0-9.]+)%/
        ];
        
        for (const pattern of dividendPatterns) {
          const match = fullPageText.match(pattern);
          if (match) {
            dividendYield = parseFloat(match[1]);
            break;
          }
        }
        
        // 株価を抽出（みんかぶページから）
        let stockPrice = null;
        const pricePatterns = [
          /現在値[\s\u3000]*([0-9,]+(?:\.[0-9]+)?)/,
          /株価[\s\u3000]*([0-9,]+(?:\.[0-9]+)?)/,
          /終値[\s\u3000]*([0-9,]+(?:\.[0-9]+)?)/
        ];
        
        for (const pattern of pricePatterns) {
          const match = fullPageText.match(pattern);
          if (match) {
            stockPrice = parseFloat(match[1].replace(/,/g, ''));
            break;
          }
        }
        
        // テーブルからも配当利回りを探す
        if (dividendYield === null) {
          const tables = document.querySelectorAll('table');
          for (const table of tables) {
            const tableText = table.textContent || '';
            if (tableText.includes('配当利回り')) {
              const match = tableText.match(/配当利回り[\s\u3000]*([0-9.]+)%?/);
              if (match) {
                dividendYield = parseFloat(match[1]);
                break;
              }
            }
          }
        }

        // 優待情報をテーブルから取得（複数テーブル対応）
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const tableText = table.textContent || '';
          
          // 優待関連のテーブルかチェック（より柔軟な条件）
          const isYutaiTable = (tableText.includes('必要株数') && tableText.includes('優待内容')) ||
                              (tableText.includes('株以上') && (tableText.includes('券') || tableText.includes('ポイント') || tableText.includes('円相当'))) ||
                              (tableText.includes('保有株主') && tableText.includes('円相当'));
          
          if (isYutaiTable) {
            const rows = table.querySelectorAll('tr');
            
            for (let i = 0; i < rows.length; i++) {
              const cells = rows[i].querySelectorAll('td, th');
              if (cells.length >= 2) {
                const firstCellText = cells[0].textContent?.trim() || '';
                const secondCellText = cells[1].textContent?.trim() || '';
                
                // より柔軟な株数抽出パターン
                let sharesText = '';
                let benefitText = '';
                
                // パターン1: 第1セルに株数、第2セルに優待内容
                if (firstCellText.match(/(\d+(?:,\d+)?)株/)) {
                  sharesText = firstCellText;
                  benefitText = secondCellText;
                }
                // パターン2: 第1セルに株数のみ、第2セルに優待内容
                else if (firstCellText.match(/^(\d+(?:,\d+)?)(?:\s*株以上)?$/)) {
                  sharesText = firstCellText;
                  benefitText = secondCellText;
                }
                // パターン3: 第1セルが「保有株主」等の条件、第2セルに詳細
                else if (firstCellText.includes('保有株主') || firstCellText.includes('以上保有')) {
                  sharesText = firstCellText;
                  benefitText = secondCellText;
                }
                
                if (sharesText && benefitText && benefitText.length > 5) {
                  // 株数を抽出
                  const sharesMatch = sharesText.match(/(\d+(?:,\d+)?)/);
                  if (sharesMatch) {
                    let shares = parseInt(sharesMatch[1].replace(/,/g, ''));
                    
                    // 優待発生株数が取得できている場合はそれを優先使用
                    if (actualMinShares && shares === 1) {
                      shares = actualMinShares;
                    }
                    
                    // 長期保有情報をチェック
                    const isLongTerm = benefitText.includes('年以上') || 
                                      benefitText.includes('継続保有') ||
                                      benefitText.includes('以上保有株主') ||
                                      sharesText.includes('年以上') ||
                                      sharesText.includes('継続保有');
                    
                    let longTermMonths = null;
                    if (isLongTerm) {
                      const yearMatch = (benefitText + ' ' + sharesText).match(/(\d+)年以上/);
                      if (yearMatch) {
                        longTermMonths = parseInt(yearMatch[1]) * 12;
                      } else {
                        longTermMonths = 12; // デフォルト1年
                      }
                    }

                    benefits.push({
                      minShares: shares,
                      description: benefitText,
                      isLongTerm: isLongTerm,
                      longTermMonths: longTermMonths
                    });
                  }
                }
              }
            }
          }
        }

        // 権利確定月を取得
        const pageText = document.body.textContent || '';
        
        // より具体的なパターンで権利確定月を検索
        const monthPatterns = [
          /権利確定月[：:\s]*([0-9月、,\s]+)/,
          /(\d+)月末日/g,
          /(\d+)月権利/g
        ];

        for (const pattern of monthPatterns) {
          const matches = pageText.match(pattern);
          if (matches) {
            if (pattern.global) {
              // グローバルマッチの場合
              for (const match of matches) {
                const monthMatch = match.match(/(\d+)/);
                if (monthMatch) {
                  const month = parseInt(monthMatch[1]);
                  if (month >= 1 && month <= 12) months.push(month);
                }
              }
            } else {
              // 通常のマッチの場合
              const monthText = matches[1];
              const monthNumbers = monthText.match(/(\d+)月/g) || [];
              monthNumbers.forEach(m => {
                const month = parseInt(m.replace('月', ''));
                if (month >= 1 && month <= 12) months.push(month);
              });
            }
          }
        }

        return {
          companyName: companyName,
          benefits: benefits,
          rightsMonths: [...new Set(months)],
          actualMinShares: actualMinShares,
          dividendYield: dividendYield,
          stockPrice: stockPrice
        };
      });

      const benefits = [];
      const months = pageData.rightsMonths.length > 0 ? pageData.rightsMonths : [3];

      // 日本語企業名を保存（あとで使用）
      this.japaneseCompanyName = pageData.companyName;

      pageData.benefits.forEach(item => {
        months.forEach(month => {
          const benefit = {
            stockCode: stockCode,
            benefitType: this.detectBenefitType(item.description),
            description: item.description.substring(0, 200),
            benefitContent: item.description, // テーブルの内容をそのまま優待内容として保存
            monetaryValue: this.parseMonetaryValue(item.description),
            minShares: item.minShares,
            holderType: 'どちらでも',
            exRightsMonth: month
          };

          // 長期保有特典がある場合
          if (item.isLongTerm) {
            benefit.hasLongTermHolding = 1;
            benefit.longTermMonths = item.longTermMonths || 12;
            benefit.longTermValue = this.parseMonetaryValue(item.description);
          }

          benefits.push(benefit);
        });
      });

      return {
        benefits: benefits,
        dividendYield: pageData.dividendYield,
        stockPrice: pageData.stockPrice,
        companyName: pageData.companyName
      };

    } catch (error) {
      return { benefits: [], dividendYield: null, stockPrice: null, companyName: null };
    }
  }

  async closeBrowsers() {
    for (const browser of this.browsers) {
      try {
        await browser.instance.close();
      } catch (error) {
        console.error(`ブラウザ${browser.id}のクローズエラー:`, error.message);
      }
    }
    this.browsers = [];
  }

  async restartBrowsers() {
    await this.closeBrowsers();
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
    await this.initializeBrowserPool();
  }

  async cleanup() {
    await this.closeBrowsers();
    this.db.close();
  }

  // 既存のヘルパーメソッドを再利用
  detectBenefitType(description) {
    const typeMap = {
      '食事券・グルメ券': ['食事券', 'グルメ券', '飲食', 'レストラン', '弁当', 'お米'],
      'QUOカード・図書カード': ['クオカード', 'quo', '図書カード', '図書券'],
      '商品券・ギフトカード': ['商品券', 'ギフトカード', 'ギフト券', '百貨店'],
      'ポイント・電子マネー': ['ポイント', '電子マネー', 'キャッシュバック'],
      '宿泊・レジャー': ['宿泊', 'ホテル', '温泉', '旅行', 'レジャー', '映画'],
      '交通・乗車券': ['乗車券', '電車', 'バス', '航空券', '交通'],
      '自社製品・商品': ['自社製品', '自社商品', '商品詰め合わせ'],
      'カタログギフト': ['カタログ', '選択制'],
      '割引券・優待券': ['優待券', '割引券', '割引', '%off', '％off']
    };

    const desc = description.toLowerCase();
    for (const [type, keywords] of Object.entries(typeMap)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return type;
      }
    }
    return 'その他';
  }

  parseMonetaryValue(description) {
    const patterns = [
      { regex: /([0-9,]+)円相当/, multiplier: 1 },
      { regex: /([0-9,]+)円分/, multiplier: 1 },
      { regex: /([0-9,]+)円/, multiplier: 1 },
      { regex: /([0-9,]+)ポイント/, multiplier: 1 },
      { regex: /(\d+)枚.*?500円/, multiplier: 500 },
      { regex: /(\d+)枚.*?1[,0]00円/, multiplier: 1000 }
    ];

    for (const { regex, multiplier } of patterns) {
      const match = description.match(regex);
      if (match) {
        const value = parseInt(match[1].replace(/,/g, ''));
        return value * (multiplier === 1 ? 1 : multiplier / parseInt(match[1]));
      }
    }

    const keywordValues = {
      '食事券': 3000,
      'クオカード': 1000,
      '割引': 2000,
      'キャッシュバック': 3000
    };

    for (const [keyword, value] of Object.entries(keywordValues)) {
      if (description.includes(keyword)) return value;
    }

    return 1000;
  }

  detectSector(companyName) {
    const sectorMap = {
      '食品': ['食品', 'フード', 'ビール', '飲料', '製菓'],
      '外食': ['レストラン', 'すかいらーく', 'マクドナルド', '吉野家'],
      '小売': ['イオン', '百貨店', 'ストア', 'マート', 'ドラッグ'],
      '金融': ['銀行', 'ホールディングス', '証券', '保険'],
      '運輸': ['鉄道', '航空', 'JR', 'ANA', 'JAL'],
      'サービス': ['サービス', 'ホテル', 'リゾート'],
      'エンタメ': ['エンターテインメント', 'ゲーム', 'アミューズメント']
    };

    for (const [sector, keywords] of Object.entries(sectorMap)) {
      if (keywords.some(keyword => companyName.includes(keyword))) {
        return sector;
      }
    }
    return 'その他';
  }

  calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) {
      return null;
    }
    
    // 価格を古い順に並び替え
    const orderedPrices = [...prices].reverse();
    
    let gains = [];
    let losses = [];
    
    // 価格変動を計算
    for (let i = 1; i < orderedPrices.length; i++) {
      const change = orderedPrices[i] - orderedPrices[i - 1];
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }
    
    // 必要なデータがない場合
    if (gains.length < period) {
      return null;
    }
    
    // 初期平均を計算
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // スムージング（修正移動平均）を適用
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    
    if (avgLoss === 0) {
      return avgGain > 0 ? 100 : 50;
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100;
  }

  updateRSI(stockCode, rsi14Value, rsi28Value) {
    return new Promise((resolve, reject) => {
      this.db.db.run(
        'UPDATE stocks SET rsi = ?, rsi28 = ? WHERE code = ?',
        [rsi14Value, rsi28Value, stockCode],
        err => err ? reject(err) : resolve()
      );
    });
  }

  async loadProgress() {
    try {
      const data = await fs.readFile(this.progressFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { completed: [] };
    }
  }

  async saveProgress(progress) {
    await fs.writeFile(this.progressFile, JSON.stringify(progress, null, 2));
  }
}

// CLI実行対応
if (import.meta.url === `file://${process.argv[1]}`) {
  const concurrency = parseInt(process.argv[2]) || 4;
  const stockCodes = process.argv.slice(3);
  
  if (stockCodes.length === 0) {
    console.error('使用方法: node scraper.js [並列数] <銘柄コード1> <銘柄コード2> ...');
    console.error('例: node scraper.js 4 3048 7419 2502');
    process.exit(1);
  }
  
  const scraper = new ShareholderBenefitScraper({ concurrency });
  scraper.scrapeStocks(stockCodes).catch(console.error);
}