import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ShareholderBenefitScraper {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.progressFile = path.join(__dirname, 'scraping-progress.json');
  }

  async scrapeStocks(stockCodes) {
    console.log(`=== ${stockCodes.length}銘柄のスクレイピング開始 ===`);
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const progress = await this.loadProgress();
      const remainingCodes = stockCodes.filter(code => !progress.completed.includes(code));
      
      console.log(`残り${remainingCodes.length}銘柄を処理します`);

      for (let i = 0; i < remainingCodes.length; i++) {
        const code = remainingCodes[i];
        const result = await this.scrapeStock(browser, code);
        
        if (result.success) {
          console.log(`✓ ${code}: ${result.name} - ${result.benefitCount}件`);
          progress.completed.push(code);
        } else if (!result.noData) {
          console.log(`✗ ${code}: エラー`);
        }
        
        if (i % 10 === 9) {
          await this.saveProgress(progress);
          console.log(`進捗: ${progress.completed.length}/${stockCodes.length}件完了`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await this.saveProgress(progress);
      console.log(`\n=== 完了: ${progress.completed.length}/${stockCodes.length}件 ===`);

    } finally {
      await browser.close();
      this.db.close();
    }
  }

  async scrapeStock(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      const stockInfo = await this.yahooFinance.getStockPrice(stockCode);
      if (!stockInfo) return { success: false, noData: true };

      const benefits = await this.scrapeBenefits(page, stockCode);
      if (benefits.length === 0) return { success: false, noData: true };

      await this.db.upsertStock({
        code: stockCode,
        name: stockInfo.name,
        japanese_name: this.japaneseCompanyName || stockInfo.name,
        market: stockInfo.market || '東証',
        sector: this.detectSector(this.japaneseCompanyName || stockInfo.name)
      });

      await this.db.insertPriceHistory(stockInfo);
      await this.db.deleteBenefitsByStockCode(stockCode);

      for (const benefit of benefits) {
        await this.db.insertBenefit(benefit);
      }

      return {
        success: true,
        name: stockInfo.name,
        benefitCount: benefits.length
      };

    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await page.close();
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
                    const shares = parseInt(sharesMatch[1].replace(/,/g, ''));
                    
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
          rightsMonths: [...new Set(months)]
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

      return benefits;

    } catch (error) {
      return [];
    }
  }

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new ShareholderBenefitScraper();
  const stockCodes = process.argv.slice(2);
  
  if (stockCodes.length === 0) {
    console.error('使用方法: node scraper.js <銘柄コード1> <銘柄コード2> ...');
    process.exit(1);
  }
  
  scraper.scrapeStocks(stockCodes).catch(console.error);
}