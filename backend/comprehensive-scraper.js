import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

export class ComprehensiveShareholderBenefitScraper {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
  }

  async scrapeAllStocks() {
    console.log('=== 全上場企業の優待情報スクレイピング開始 ===');
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      // 全証券コード範囲を生成
      const allStockCodes = this.generateAllStockCodes();
      console.log(`${allStockCodes.length}銘柄の処理を開始します`);

      let successCount = 0;
      let errorCount = 0;
      let noDataCount = 0;
      const batchSize = 5; // レート制限を考慮して小さくする

      // バッチ処理
      for (let i = 0; i < allStockCodes.length; i += batchSize) {
        const batch = allStockCodes.slice(i, i + batchSize);
        const batchNum = Math.floor(i/batchSize) + 1;
        const totalBatches = Math.ceil(allStockCodes.length/batchSize);
        
        console.log(`\nバッチ ${batchNum}/${totalBatches} (${i+1}-${Math.min(i+batchSize, allStockCodes.length)}件目) 処理中...`);
        
        for (const code of batch) {
          try {
            const result = await this.scrapeStockBenefit(browser, code);
            if (result.success) {
              successCount++;
              console.log(`✓ ${code}: ${result.name} - ${result.benefitCount}件`);
            } else if (result.noData) {
              noDataCount++;
              // 優待なしの場合は表示しない（ログが多すぎるため）
            } else {
              errorCount++;
              console.log(`✗ ${code}: エラー`);
            }
          } catch (error) {
            errorCount++;
            // エラーログは最小限に
          }
          
          // 個別銘柄間の待機（レート制限対策）
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // バッチ間の長い待機（サーバー負荷軽減）
        if (i + batchSize < allStockCodes.length) {
          console.log(`  進捗: 成功${successCount}件, エラー${errorCount}件, 優待なし${noDataCount}件`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      console.log(`\n=== スクレイピング完了 ===`);
      console.log(`成功: ${successCount}件, エラー: ${errorCount}件, 優待なし: ${noDataCount}件`);
      
      // DB内容を確認
      await this.verifyDatabase();

    } finally {
      await browser.close();
      this.db.close();
    }
  }

  generateAllStockCodes() {
    const codes = [];
    
    // 主要上場企業のコード範囲
    const ranges = [
      { start: 1300, end: 1999 }, // 建設・資材
      { start: 2000, end: 2999 }, // 食品・化学・繊維
      { start: 3000, end: 3999 }, // 医薬品・小売・サービス
      { start: 4000, end: 4999 }, // IT・通信・精密機器
      { start: 5000, end: 5999 }, // 鉄鋼・非鉄・機械
      { start: 6000, end: 6999 }, // 電機・自動車・輸送機器
      { start: 7000, end: 7999 }, // 小売・外食・サービス
      { start: 8000, end: 8999 }, // 金融・不動産・商社
      { start: 9000, end: 9999 }  // 運輸・電力・インフラ
    ];
    
    for (const range of ranges) {
      for (let i = range.start; i <= range.end; i++) {
        codes.push(i.toString());
      }
    }
    
    // 優待実施率が高いセクターを優先的に処理するためにソート
    codes.sort((a, b) => {
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      
      // 優待実施率が高い順: 2000-2999, 3000-3999, 7000-7999, 8000-8999, その他
      const getPriority = (num) => {
        if (num >= 2000 && num <= 2999) return 1; // 食品
        if (num >= 3000 && num <= 3999) return 2; // 小売・サービス
        if (num >= 7000 && num <= 7999) return 3; // 外食・サービス
        if (num >= 8000 && num <= 8999) return 4; // 金融
        if (num >= 9000 && num <= 9999) return 5; // 運輸
        return 6; // その他
      };
      
      const aPriority = getPriority(aNum);
      const bPriority = getPriority(bNum);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return aNum - bNum;
    });
    
    return codes;
  }

  async scrapeStockBenefit(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      // みんかぶから優待情報を取得（主要な情報源）
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

      // 株式情報をDBに保存（日本語名を優先使用）
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
        timeout: 15000 // タイムアウトを短くして効率化
      });

      // ページが正しく読み込まれたか確認
      const pageTitle = await page.title();
      if (!pageTitle.includes('優待') && !pageTitle.includes('株主優待')) {
        return benefits; // 優待ページでない場合は空を返す
      }

      // 優待情報を取得
      const minkabuData = await page.evaluate(() => {
        const result = {
          benefits: [],
          exRightsMonth: [],
          companyName: ''
        };

        // 会社名を取得（複数のセレクタを試す）
        const selectors = [
          'h2:first-of-type',  // 最初のh2要素
          'h1.title_box',      // title_boxクラスのh1
          'h1',                // 通常のh1
          '.company-name'      // 会社名クラス（フォールバック）
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

        // 優待内容テーブルを探す（通常2番目のテーブル）
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
        
        // 複数の権利確定月パターンに対応
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
      
      // 日本語の会社名を保存（あとで使用）
      this.japaneseCompanyName = companyName;
      
      // 権利確定月が複数ある場合、各月で優待情報を作成
      const months = exRightsMonth.length > 0 ? exRightsMonth : [3]; // デフォルトは3月
      
      minkabuBenefits.forEach(data => {
        // 各権利確定月に対して優待情報を作成
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
      // タイムアウトやアクセスエラーは正常な範囲内として処理
    }

    return benefits;
  }

  // 以下、既存のメソッドをそのまま使用
  detectBenefitType(description) {
    if (description.includes('商品券')) return '商品券';
    if (description.includes('クオカード') || description.includes('QUO')) return 'クオカード';
    if (description.includes('優待券') || description.includes('割引')) return '優待券';
    if (description.includes('カタログ')) return 'カタログギフト';
    if (description.includes('自社製品') || description.includes('自社商品')) return '自社製品';
    if (description.includes('食事券')) return '優待券';
    if (description.includes('ポイント')) return 'その他';
    return 'その他';
  }

  cleanDescription(description) {
    return description
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .substring(0, 200);
  }

  estimateValue(description) {
    // 金額が明記されている場合
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
    
    // パーセント割引の場合
    const percentMatch = description.match(/(\d+)[%％]/);
    if (percentMatch) {
      const percent = parseInt(percentMatch[1]);
      if (percent === 100) return 10000;
      return Math.round(10000 * percent / 100);
    }
    
    // 枚数から推定
    const sheetMatch = description.match(/(\d+)枚/);
    if (sheetMatch) {
      const sheets = parseInt(sheetMatch[1]);
      if (description.includes('500円')) return 500 * sheets;
      if (description.includes('1000円') || description.includes('1,000円')) return 1000 * sheets;
      return 500 * sheets;
    }
    
    // キーワードベースの推定
    if (description.includes('食事券')) return 3000;
    if (description.includes('クオカード')) return 1000;
    if (description.includes('割引')) return 2000;
    if (description.includes('キャッシュバック')) return 3000;
    
    return 1000;
  }

  detectSector(companyName) {
    const sectorKeywords = {
      '食品': ['食品', 'フード', 'ビール', '飲料', '製菓'],
      '外食': ['レストラン', 'すかいらーく', 'マクドナルド', '吉野家', 'アトム'],
      '小売': ['イオン', '百貨店', 'ストア', 'マート', 'ドラッグ'],
      '金融': ['銀行', 'ホールディングス', '証券', '保険', 'ファイナンス'],
      '運輸': ['鉄道', '航空', 'エアライン', 'JR', 'ANA', 'JAL'],
      'サービス': ['サービス', 'メンテナンス', 'ホテル', 'リゾート'],
      'エンタメ': ['エンターテインメント', 'ゲーム', 'アミューズメント']
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

  async verifyDatabase() {
    console.log('\n=== データベース確認 ===');
    
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
      
      console.log(`登録銘柄数: ${stockCount}`);
      console.log(`優待情報数: ${benefitCount}`);
      
      // 優待情報がある銘柄の例を表示
      const samples = await new Promise((resolve, reject) => {
        this.db.db.all(`
          SELECT s.code, s.name, COUNT(b.id) as benefit_count
          FROM stocks s
          JOIN shareholder_benefits b ON s.code = b.stock_code
          GROUP BY s.code
          ORDER BY benefit_count DESC
          LIMIT 10
        `, (err, rows) => {
          err ? reject(err) : resolve(rows);
        });
      });
      
      console.log('\n優待情報が多い銘柄TOP10:');
      samples.forEach(row => {
        console.log(`  ${row.code}: ${row.name} (${row.benefit_count}件)`);
      });
      
    } catch (error) {
      console.error('データベース確認エラー:', error);
    }
  }
}

// スクレイピング実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new ComprehensiveShareholderBenefitScraper();
  scraper.scrapeAllStocks().catch(console.error);
}