import puppeteer from 'puppeteer';
import { Database } from './database.js';

/**
 * 改善された優待スクレイパー
 * - 複数サイトからの情報取得
 * - より正確な優待内容の解析
 * - エラーハンドリングの強化
 */
export class ImprovedBenefitScraper {
  constructor() {
    this.db = new Database();
  }

  /**
   * 銘柄コード9980の優待情報を正確に取得
   */
  async scrapeSpecificStock(stockCode = '9980') {
    console.log(`📊 ${stockCode} の優待情報を詳細取得中...`);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      // 複数のソースから情報取得
      const results = await Promise.allSettled([
        this.scrapeFromMinkabu(browser, stockCode),
        this.scrapeFromKabuYutai(browser, stockCode),
        this.scrapeFromYahoo(browser, stockCode)
      ]);

      // 最も信頼できる情報を選択
      const validResults = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

      if (validResults.length === 0) {
        console.log(`⚠️ ${stockCode}: 優待情報が見つかりません`);
        return null;
      }

      // 情報を統合
      const mergedInfo = this.mergeResults(validResults);
      
      // データベースに保存
      await this.saveMergedBenefits(stockCode, mergedInfo);
      
      console.log(`✅ ${stockCode}: 優待情報を正常に取得・保存`);
      return mergedInfo;

    } finally {
      await browser.close();
    }
  }

  /**
   * みんかぶからスクレイピング（改善版）
   */
  async scrapeFromMinkabu(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // より詳細なセレクタで優待情報を取得
      const benefits = await page.evaluate(() => {
        const benefitElements = document.querySelectorAll(
          '.md_card, .benefit-item, .benefit-detail, [class*="benefit"], [class*="shareholder"]'
        );
        
        const results = [];
        
        benefitElements.forEach(element => {
          const text = element.textContent?.trim() || '';
          
          // 無効なテキストをフィルタ
          if (text.length < 10 || text.match(/^\d+\.\d+$/) || text === '○') {
            return;
          }
          
          // 優待情報を解析
          const benefit = {
            description: text,
            monetary_value: 0,
            min_shares: 100,
            ex_rights_month: null
          };

          // 金額の抽出（改善版）
          const valueMatches = text.matchAll(/(\d{1,3}(?:,\d{3})*)\s*円/g);
          for (const match of valueMatches) {
            const value = parseInt(match[1].replace(/,/g, ''));
            if (value > benefit.monetary_value && value < 100000) { // 異常値除外
              benefit.monetary_value = value;
            }
          }

          // 必要株式数の抽出
          const sharesMatch = text.match(/(\d{1,4})\s*株/);
          if (sharesMatch) {
            benefit.min_shares = parseInt(sharesMatch[1]);
          }

          // 権利月の抽出
          const monthMatch = text.match(/(\d{1,2})\s*月/);
          if (monthMatch) {
            benefit.ex_rights_month = parseInt(monthMatch[1]);
          }

          // 優待内容のクリーニング
          benefit.description = benefit.description
            .replace(/\s+/g, ' ')
            .replace(/○/g, '')
            .replace(/^\d+\.\d+\s*/, '')
            .trim();

          if (benefit.description && benefit.description.length > 5) {
            results.push(benefit);
          }
        });

        return results;
      });

      return { source: 'minkabu', benefits };

    } catch (error) {
      console.error(`みんかぶスクレイピングエラー (${stockCode}):`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * 株主優待情報サイトからスクレイピング
   */
  async scrapeFromKabuYutai(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      // 株主優待情報サイト（例）
      const url = `https://www.kabuyutai.com/kobetu/naiyou/${stockCode}.html`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });

      const benefits = await page.evaluate(() => {
        const benefitTable = document.querySelector('table.yutai-table, .benefit-table');
        if (!benefitTable) return [];

        const results = [];
        const rows = benefitTable.querySelectorAll('tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 2) {
            const text = Array.from(cells).map(c => c.textContent?.trim()).join(' ');
            
            if (text && text.length > 10) {
              results.push({
                description: text,
                monetary_value: 0,
                min_shares: 100
              });
            }
          }
        });

        return results;
      });

      return { source: 'kabuyutai', benefits };

    } catch (error) {
      console.error(`株主優待サイトスクレイピングエラー (${stockCode}):`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Yahoo!ファイナンスからスクレイピング
   */
  async scrapeFromYahoo(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
      
      const url = `https://finance.yahoo.co.jp/quote/${stockCode}.T`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // 優待情報へのリンクを探してクリック
      const benefitLink = await page.$('a[href*="benefit"], a[href*="yutai"]');
      if (benefitLink) {
        await benefitLink.click();
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
      }

      const stockInfo = await page.evaluate(() => {
        const nameElement = document.querySelector('h1, .stock-name');
        return {
          name: nameElement?.textContent?.trim() || '',
          hasYutai: document.body.textContent?.includes('株主優待') || false
        };
      });

      return { source: 'yahoo', stockInfo };

    } catch (error) {
      console.error(`Yahoo!ファイナンススクレイピングエラー (${stockCode}):`, error.message);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * 複数ソースの結果を統合
   */
  mergeResults(results) {
    const merged = {
      benefits: [],
      sources: []
    };

    results.forEach(result => {
      if (result.source) {
        merged.sources.push(result.source);
      }

      if (result.benefits && Array.isArray(result.benefits)) {
        result.benefits.forEach(benefit => {
          // 重複チェック（類似度ベース）
          const isDuplicate = merged.benefits.some(existing => 
            this.calculateSimilarity(existing.description, benefit.description) > 0.8
          );

          if (!isDuplicate && benefit.description && benefit.description.length > 5) {
            merged.benefits.push(benefit);
          }
        });
      }
    });

    // 優待情報の正規化と分類
    merged.benefits = merged.benefits.map(benefit => ({
      ...benefit,
      benefit_type: this.classifyBenefitType(benefit.description),
      description: this.normalizeDescription(benefit.description)
    }));

    return merged;
  }

  /**
   * 優待説明文の正規化
   */
  normalizeDescription(description) {
    if (!description) return '';

    let normalized = description
      // 基本的なクリーニング
      .replace(/\s+/g, ' ')
      .replace(/^[\s○●・]+/, '')
      .replace(/[\s○●・]+$/, '')
      .trim();

    // 数値のみの場合は無効
    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return '';
    }

    // HTMLエンティティのデコード
    normalized = normalized
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // 意味のある内容かチェック
    if (normalized.length < 5 || !normalized.match(/[ぁ-ん]/)) {
      return '';
    }

    return normalized;
  }

  /**
   * 文字列の類似度計算（簡易版）
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * 編集距離の計算
   */
  getEditDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * 優待タイプの分類（改善版）
   */
  classifyBenefitType(description) {
    const keywords = {
      '食事券・グルメ券': ['食事券', 'お食事券', 'グルメ券', 'レストラン', '飲食'],
      '商品券・ギフトカード': ['商品券', 'ギフトカード', 'ギフト券', 'お買物券'],
      'QUOカード・図書カード': ['QUOカード', 'クオカード', '図書カード', 'クオ・カード'],
      '割引券・優待券': ['割引券', '優待券', '割引', '優待カード', '優待ポイント'],
      '自社製品・商品': ['自社製品', '自社商品', '当社製品', '当社商品', '製品詰合せ'],
      'カタログギフト': ['カタログギフト', 'カタログ', '選べるギフト'],
      'ポイント・電子マネー': ['ポイント', '電子マネー', 'ポイント付与'],
      '宿泊・レジャー': ['宿泊券', 'ホテル', 'レジャー', '施設利用券', 'リゾート'],
      '交通・乗車券': ['乗車券', '交通', '電車', 'バス', '航空券'],
      '金券・現金': ['現金', '金券', 'キャッシュバック'],
      '寄付選択制': ['寄付', '寄附', '社会貢献'],
      '美容・健康': ['美容', '健康', 'エステ', 'スパ', 'フィットネス'],
      '本・雑誌・エンタメ': ['本', '雑誌', '書籍', 'DVD', '映画', 'チケット']
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(word => description.includes(word))) {
        return type;
      }
    }
    
    return 'その他';
  }

  /**
   * 統合された優待情報を保存
   */
  async saveMergedBenefits(stockCode, mergedInfo) {
    // 既存の優待情報を削除
    await this.db.deleteStockBenefits(stockCode);

    // 新しい優待情報を保存
    for (const benefit of mergedInfo.benefits) {
      if (benefit.description && benefit.description.length > 5) {
        await this.db.insertBenefit({
          stock_code: stockCode,
          benefit_type: benefit.benefit_type,
          description: benefit.description,
          monetary_value: benefit.monetary_value || 0,
          min_shares: benefit.min_shares || 100,
          holder_type: 'どちらでも',
          ex_rights_month: benefit.ex_rights_month || 3
        });
      }
    }

    console.log(`💾 ${stockCode}: ${mergedInfo.benefits.length} 件の優待情報を保存`);
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new ImprovedBenefitScraper();
  
  try {
    const stockCode = process.argv[2] || '9980';
    await scraper.scrapeSpecificStock(stockCode);
  } catch (error) {
    console.error('スクレイピングエラー:', error);
  } finally {
    scraper.close();
  }
}