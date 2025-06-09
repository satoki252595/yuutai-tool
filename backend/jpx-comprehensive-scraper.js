import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import fs from 'fs';
import fetch from 'node-fetch';
import * as XLSX from 'xlsx';

// JPX公式データを使用した包括的スクレイピングシステム
class JPXComprehensiveScraper {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.browser = null;
    this.progressFile = './jpx-scraping-progress.json';
    this.errorLog = './jpx-scraping-errors.log';
    this.successCount = 0;
    this.errorCount = 0;
    this.skipCount = 0;
  }

  // JPXから最新の上場銘柄一覧を取得
  async getJPXStockList() {
    console.log('JPXから上場銘柄一覧を取得中...');
    
    try {
      // JPXのページからExcelファイルのURLを取得
      const jpxUrl = 'https://www.jpx.co.jp/markets/statistics-equities/misc/01.html';
      const response = await fetch(jpxUrl);
      const html = await response.text();
      
      // ExcelファイルのURLを抽出
      const excelUrlMatch = html.match(/<a href="(.+?\.xls[x]?)"/);
      if (!excelUrlMatch) {
        throw new Error('ExcelファイルのURLが見つかりません');
      }
      
      const excelUrl = 'https://www.jpx.co.jp' + excelUrlMatch[1];
      console.log(`Excelファイル URL: ${excelUrl}`);
      
      // Excelファイルをダウンロード
      const excelResponse = await fetch(excelUrl);
      const arrayBuffer = await excelResponse.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      // Excelファイルを解析
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // データを処理
      const stocks = [];
      const headers = jsonData[0];
      
      // ヘッダーのインデックスを特定
      let codeIndex = -1;
      let nameIndex = -1;
      let marketIndex = -1;
      let industryIndex = -1;
      
      headers.forEach((header, index) => {
        if (header && header.toString().includes('コード')) codeIndex = index;
        if (header && header.toString().includes('銘柄名')) nameIndex = index;
        if (header && header.toString().includes('市場')) marketIndex = index;
        if (header && header.toString().includes('業種')) industryIndex = index;
      });
      
      // データ行を処理
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row[codeIndex]) continue;
        
        const rawCode = row[codeIndex].toString().trim();
        // 数値のみの有効な証券コードかチェック
        if (!/^\d{4}$/.test(rawCode) && !/^\d{1,3}$/.test(rawCode)) {
          continue; // 無効なコードはスキップ
        }
        
        const code = rawCode.padStart(4, '0');
        const name = row[nameIndex] || '';
        const market = row[marketIndex] || '';
        const industry = row[industryIndex] || '';
        
        // 国内株式のみを抽出
        if (market.includes('プライム') || market.includes('スタンダード') || market.includes('グロース')) {
          stocks.push({
            code: code,
            name: name,
            market: market.replace('（内国株式）', '').trim(),
            industry: industry
          });
        }
      }
      
      console.log(`JPXから${stocks.length}件の上場銘柄を取得しました`);
      return stocks;
      
    } catch (error) {
      console.error('JPXデータ取得エラー:', error);
      
      // フォールバック: ローカルに保存したデータを使用
      if (fs.existsSync('./jpx-stock-list-cache.json')) {
        console.log('キャッシュされたJPXデータを使用します');
        const cached = JSON.parse(fs.readFileSync('./jpx-stock-list-cache.json', 'utf8'));
        return cached.stocks;
      }
      
      throw error;
    }
  }

  // JPXデータをキャッシュに保存
  async saveJPXCache(stocks) {
    const cache = {
      date: new Date().toISOString(),
      count: stocks.length,
      stocks: stocks
    };
    fs.writeFileSync('./jpx-stock-list-cache.json', JSON.stringify(cache, null, 2));
    console.log('JPXデータをキャッシュに保存しました');
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
    return { completed: [], failed: [], lastIndex: 0 };
  }

  // エラーログ記録
  logError(code, error) {
    const logEntry = `${new Date().toISOString()} - ${code}: ${error}\n`;
    fs.appendFileSync(this.errorLog, logEntry);
  }

  // ブラウザ初期化
  async initBrowser() {
    console.log('ブラウザを初期化中...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    console.log('ブラウザ初期化完了');
  }

  // 単一銘柄のスクレイピング（エラー耐性強化版）
  async scrapeSingleStock(stockData, retryCount = 0) {
    const maxRetries = 3;
    let page = null;
    
    try {
      page = await this.browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      // minkabu.jpから優待情報を取得
      const url = `https://minkabu.jp/stock/${stockData.code}/yutai`;
      
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
      } catch (error) {
        if (retryCount < maxRetries) {
          await page.close();
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.scrapeSingleStock(stockData, retryCount + 1);
        }
        throw new Error(`ページ読み込み失敗: ${error.message}`);
      }

      // 優待情報の存在確認
      const hasYutai = await page.evaluate(() => {
        const noYutaiSelectors = [
          '.md_box_gray',
          '.no-yutai',
          '[class*="no-benefit"]'
        ];
        
        for (const selector of noYutaiSelectors) {
          if (document.querySelector(selector)) return false;
        }
        
        const bodyText = document.body.textContent.toLowerCase();
        const noYutaiTexts = [
          '株主優待はありません',
          '株主優待制度なし',
          'no shareholder benefit',
          '優待制度は実施していません'
        ];
        
        return !noYutaiTexts.some(text => bodyText.includes(text));
      });

      // 株式情報を保存（JPXデータを優先使用）
      await this.db.upsertStock({
        code: stockData.code,
        name: stockData.name,
        market: stockData.market,
        sector: stockData.industry
      });

      if (!hasYutai) {
        return { success: true, hasYutai: false, name: stockData.name };
      }

      // 優待情報を詳細に取得
      const benefitData = await page.evaluate(() => {
        const benefits = [];
        
        // 複数のセレクターパターンを試行
        const tableSelectors = [
          'table.md_table',
          'table.yutai-table',
          '.yutai-content table',
          'table[class*="benefit"]'
        ];
        
        let foundTable = false;
        for (const selector of tableSelectors) {
          const tables = document.querySelectorAll(selector);
          if (tables.length > 0) {
            foundTable = true;
            tables.forEach(table => {
              const rows = table.querySelectorAll('tr');
              rows.forEach((row, index) => {
                if (index === 0) return; // ヘッダーをスキップ
                
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                  const sharesText = cells[0]?.textContent?.trim() || '';
                  const benefitText = cells[1]?.textContent?.trim() || '';
                  
                  if (benefitText && benefitText.length > 5) {
                    // 株数を抽出
                    const sharesMatch = sharesText.match(/(\d+)\s*株/);
                    const shares = sharesMatch ? parseInt(sharesMatch[1]) : 100;
                    
                    // 金額を抽出
                    const amountMatch = benefitText.match(/(\d{1,3}(?:,\d{3})*)\s*円/);
                    const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 1000;
                    
                    // 権利月を抽出
                    const monthMatch = benefitText.match(/(\d{1,2})\s*月/);
                    const month = monthMatch ? parseInt(monthMatch[1]) : 3;
                    
                    benefits.push({
                      description: benefitText.substring(0, 500),
                      monetary_value: Math.min(amount, 15000),
                      min_shares: shares,
                      ex_rights_month: month
                    });
                  }
                }
              });
            });
            break;
          }
        }
        
        // テーブル形式でない場合の代替取得
        if (!foundTable || benefits.length === 0) {
          const contentSelectors = [
            '.yutai_content',
            '.benefit_detail',
            '.md_box:not(.md_box_gray)',
            '[class*="yutai"]',
            '[class*="benefit"]'
          ];
          
          for (const selector of contentSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              const text = element.textContent?.trim();
              if (text && text.length > 10 && !text.includes('株主優待はありません')) {
                benefits.push({
                  description: text.substring(0, 500),
                  monetary_value: 1000,
                  min_shares: 100,
                  ex_rights_month: 3
                });
              }
            });
            if (benefits.length > 0) break;
          }
        }
        
        return benefits;
      });

      // 優待情報を保存
      if (benefitData && benefitData.length > 0) {
        for (const benefit of benefitData) {
          const benefitType = this.classifyBenefitType(benefit.description);
          
          await this.db.insertBenefit({
            stock_code: stockData.code,
            benefit_type: benefitType,
            description: benefit.description,
            monetary_value: benefit.monetary_value,
            min_shares: benefit.min_shares,
            holder_type: 'どちらでも',
            ex_rights_month: benefit.ex_rights_month,
            has_long_term_holding: benefit.description.includes('年以上') ? 1 : 0
          });
        }
      }

      // Yahoo Finance APIから株価情報を取得
      try {
        const priceInfo = await this.yahooFinance.getStockPrice(stockData.code);
        if (priceInfo && priceInfo.price) {
          await this.db.insertPriceHistory(priceInfo);
        }
      } catch (priceError) {
        console.log(`株価取得エラー ${stockData.code}: ${priceError.message}`);
      }

      return { 
        success: true, 
        hasYutai: true, 
        name: stockData.name, 
        benefitCount: benefitData.length 
      };

    } catch (error) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000 * (retryCount + 1)));
        if (page) await page.close();
        return this.scrapeSingleStock(stockData, retryCount + 1);
      }
      
      this.logError(stockData.code, error.message);
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          console.log(`ページクローズエラー: ${closeError.message}`);
        }
      }
    }
  }

  // 優待種別分類
  classifyBenefitType(description) {
    if (!description) return 'その他';
    
    const desc = description.toLowerCase();
    
    // 分類ルール
    const rules = {
      '商品券・ギフトカード': ['円相当', 'ギフトカード', '商品券', 'jcb', 'visa'],
      '割引券・優待券': ['割引', '優待券', '％off', '%off', '枚'],
      '食事券・グルメ券': ['食事券', '飲食券', 'レストラン', 'ランチ'],
      'QUOカード・図書カード': ['quoカード', 'クオカード', '図書カード'],
      '自社製品・商品': ['自社製品', '自社商品', '詰合せ', 'セット'],
      'ポイント・電子マネー': ['ポイント', '電子マネー', 'waon', 'nanaco'],
      '宿泊・レジャー': ['宿泊', 'ホテル', '旅館', '温泉', 'テーマパーク'],
      '交通・乗車券': ['乗車券', '航空券', '搭乗', 'jr', '新幹線']
    };
    
    for (const [type, keywords] of Object.entries(rules)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return type;
      }
    }
    
    return 'その他';
  }

  // 統計情報の表示
  async showStatistics() {
    console.log('\n=== 現在のデータベース統計 ===');
    
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
    
    console.log(`総銘柄数: ${stats.total_stocks}件`);
    console.log(`優待あり銘柄: ${stats.stocks_with_benefits}件`);
    console.log(`総優待情報: ${stats.total_benefits}件`);
    console.log(`優待実施率: ${(stats.stocks_with_benefits / stats.total_stocks * 100).toFixed(1)}%`);
  }

  // メイン実行関数
  async execute() {
    try {
      console.log('=== JPXデータベース包括的スクレイピング開始 ===\n');
      
      // 現在の統計を表示
      await this.showStatistics();
      
      // JPXから最新の上場銘柄一覧を取得
      const jpxStocks = await this.getJPXStockList();
      await this.saveJPXCache(jpxStocks);
      
      // 進捗状況を読み込み
      const progress = this.loadProgress();
      console.log(`\n前回の進捗: ${progress.completed.length}件完了, ${progress.failed.length}件失敗`);
      
      await this.initBrowser();
      
      // 未処理の銘柄のみを対象
      const remainingStocks = jpxStocks.filter(stock => 
        !progress.completed.includes(stock.code)
      );
      
      console.log(`未処理銘柄: ${remainingStocks.length}件\n`);
      
      // 業種別に優先順位を設定（優待が多い業種を優先）
      const priorityIndustries = [
        '小売業', '食料品', 'サービス業', '外食', '銀行業', '証券', '保険業'
      ];
      
      remainingStocks.sort((a, b) => {
        const aPriority = priorityIndustries.findIndex(ind => a.industry?.includes(ind));
        const bPriority = priorityIndustries.findIndex(ind => b.industry?.includes(ind));
        
        if (aPriority !== -1 && bPriority === -1) return -1;
        if (aPriority === -1 && bPriority !== -1) return 1;
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        
        return parseInt(a.code) - parseInt(b.code);
      });
      
      // スクレイピング実行
      const startTime = Date.now();
      let benefitStockCount = 0;
      
      for (let i = 0; i < remainingStocks.length; i++) {
        const stock = remainingStocks[i];
        const totalProgress = ((progress.completed.length + i) / jpxStocks.length * 100).toFixed(1);
        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        const remainingTime = Math.floor(elapsedTime / (i + 1) * (remainingStocks.length - i - 1));
        
        console.log(`\n[${totalProgress}%] 処理中: ${stock.code} ${stock.name} (${stock.industry || '業種不明'})`);
        console.log(`経過: ${Math.floor(elapsedTime/60)}分 | 残り予測: ${Math.floor(remainingTime/60)}分`);
        
        try {
          const result = await this.scrapeSingleStock(stock);
          
          if (result.success) {
            progress.completed.push(stock.code);
            this.successCount++;
            
            if (result.hasYutai) {
              benefitStockCount++;
              console.log(`✓ ${stock.code}: ${result.name} - ${result.benefitCount}件の優待`);
            } else {
              console.log(`○ ${stock.code}: ${result.name} - 優待なし`);
            }
          } else {
            progress.failed.push(stock.code);
            this.skipCount++;
            console.log(`- ${stock.code}: スキップ`);
          }
          
        } catch (error) {
          progress.failed.push(stock.code);
          this.errorCount++;
          console.log(`✗ ${stock.code}: エラー - ${error.message}`);
        }
        
        // 進捗を定期保存
        if ((i + 1) % 10 === 0) {
          this.saveProgress(progress);
          console.log(`\n進捗保存: 成功${this.successCount} エラー${this.errorCount} 優待銘柄${benefitStockCount}`);
        }
        
        // レート制限（2秒間隔）
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
      console.log(`優待あり銘柄: ${benefitStockCount}件`);
      
      // 最終統計を表示
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
const scraper = new JPXComprehensiveScraper();
scraper.execute();