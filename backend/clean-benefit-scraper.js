import puppeteer from 'puppeteer';
import { Database } from './database.js';

/**
 * クリーンな優待情報スクレイパー
 * - HTMLの構造を正確に解析
 * - 不要な改行・空白・テーブルヘッダーを除外
 * - 優待内容のみを正確に抽出
 */
export class CleanBenefitScraper {
  constructor() {
    this.db = new Database();
    this.processedCount = 0;
    this.errorCount = 0;
  }

  /**
   * HTMLから優待情報を正確に抽出
   */
  async scrapeStockBenefit(browser, stockCode) {
    const page = await browser.newPage();
    
    try {
      // ユーザーエージェント設定
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // リソースの最適化
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'media') {
          req.abort();
        } else {
          req.continue();
        }
      });

      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });

      // ページが完全に読み込まれるまで少し待機
      await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

      // 銘柄名を取得
      const stockInfo = await page.evaluate(() => {
        // 銘柄名の取得（複数のセレクタを試行）
        const nameSelectors = [
          'h1.md_stock_board_title',
          '.stock-board__title',
          '.stock_name',
          '.stock-name',
          'h1.stock-name',
          'h1',
          '.company-name',
          '.stock-title'
        ];
        
        let stockName = null;
        for (const selector of nameSelectors) {
          const elem = document.querySelector(selector);
          if (elem) {
            stockName = elem.textContent?.trim();
            // 銘柄コードを除去
            stockName = stockName.replace(/^\d+\s*/, '').trim();
            if (stockName.length > 0) {
              break;
            }
          }
        }
        
        // フォールバック：ページタイトルから抽出
        if (!stockName) {
          const title = document.title;
          if (title) {
            // タイトルから銘柄名を抽出（例：「9980 MRKホールディングス | 株主優待」）
            const match = title.match(/\d+\s+([^|]+)/);
            if (match) {
              stockName = match[1].trim();
            }
          }
        }
        
        return { name: stockName };
      });

      if (!stockInfo.name) {
        return { success: false, noData: true, reason: '銘柄が見つかりません' };
      }

      // 優待情報を構造的に取得
      const benefits = await page.evaluate(() => {
        const results = [];
        
        // 優待情報のコンテナを特定
        const benefitContainers = document.querySelectorAll(`
          .md_card_benefit,
          .benefit_content,
          .yutai_content,
          .benefit-detail,
          [class*="benefit"][class*="content"],
          .table_benefit tbody tr,
          .benefit_table tbody tr
        `);

        benefitContainers.forEach(container => {
          // テーブルの場合の処理
          if (container.tagName === 'TR') {
            const cells = container.querySelectorAll('td');
            if (cells.length >= 2) {
              // ヘッダー行をスキップ
              const firstCellText = cells[0].textContent?.trim() || '';
              if (firstCellText.match(/株数|権利|月|条件/)) {
                return;
              }

              // 優待内容を抽出
              const benefitInfo = {
                shares: '',
                month: '',
                content: '',
                value: 0
              };

              // セルの内容を解析
              cells.forEach((cell, index) => {
                const text = cell.textContent?.trim() || '';
                
                // 株数
                if (text.match(/\d+株/)) {
                  benefitInfo.shares = text.match(/(\d+)株/)[1];
                }
                // 権利月
                else if (text.match(/\d{1,2}月/)) {
                  benefitInfo.month = text.match(/(\d{1,2})月/)[1];
                }
                // 優待内容（最も長いテキストを内容として採用）
                else if (text.length > 10 && !text.match(/^[\d,]+$/)) {
                  benefitInfo.content = text;
                }
              });

              if (benefitInfo.content) {
                results.push(benefitInfo);
              }
            }
          } 
          // 通常のコンテナの場合
          else {
            // 不要な要素を除外
            const clonedContainer = container.cloneNode(true);
            
            // スクリプトタグ、スタイルタグを削除
            clonedContainer.querySelectorAll('script, style, noscript').forEach(el => el.remove());
            
            // 非表示要素を削除
            clonedContainer.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach(el => el.remove());
            
            // ナビゲーション、広告要素を削除
            clonedContainer.querySelectorAll('nav, .ad, .advertisement, .banner').forEach(el => el.remove());

            // テキストを抽出して処理
            const textContent = clonedContainer.textContent || '';
            
            // 改行・タブ・連続スペースを正規化
            let cleanedText = textContent
              .replace(/[\r\n\t]+/g, ' ')  // 改行・タブをスペースに
              .replace(/\s+/g, ' ')         // 連続スペースを単一スペースに
              .replace(/^\s+|\s+$/g, '')    // 前後の空白を削除
              .trim();

            // 優待情報として有効かチェック
            if (isValidBenefitText(cleanedText)) {
              const benefitInfo = parseBenefitText(cleanedText);
              if (benefitInfo) {
                results.push(benefitInfo);
              }
            }
          }
        });

        // カスタム関数の定義（evaluate内で使用）
        function isValidBenefitText(text) {
          if (!text || text.length < 10) return false;
          
          // 除外パターン
          const excludePatterns = [
            /^[\d\s,]+$/,                    // 数字のみ
            /^[○●・\s]+$/,                   // 記号のみ
            /^(株主優待|優待内容|権利確定|必要株数)$/,  // ヘッダーテキスト
            /^(なし|無し|ありません|該当なし)$/,        // 優待なし
            /^\d+\.\d+$/,                    // 小数のみ
            /^undefined|null$/i,             // エラー値
          ];
          
          for (const pattern of excludePatterns) {
            if (pattern.test(text)) return false;
          }
          
          // 必須パターン（いずれかを含む）
          const requiredPatterns = [
            /円/,
            /券/,
            /カード/,
            /割引/,
            /優待/,
            /商品/,
            /ポイント/,
            /株主/
          ];
          
          return requiredPatterns.some(pattern => pattern.test(text));
        }

        function parseBenefitText(text) {
          const info = {
            content: text,
            shares: '100',  // デフォルト
            month: '',
            value: 0
          };

          // 必要株式数の抽出
          const sharesMatch = text.match(/(\d{1,4})\s*株/);
          if (sharesMatch) {
            info.shares = sharesMatch[1];
          }

          // 権利月の抽出
          const monthMatch = text.match(/(\d{1,2})\s*月/);
          if (monthMatch) {
            info.month = monthMatch[1];
          }

          // 金額の抽出（最大値を採用）
          const valueMatches = text.matchAll(/(\d{1,3}(?:,\d{3})*)\s*円/g);
          for (const match of valueMatches) {
            const value = parseInt(match[1].replace(/,/g, ''));
            if (value > info.value && value < 100000) { // 10万円以下
              info.value = value;
            }
          }

          // 優待内容のクリーニング
          info.content = info.content
            .replace(/^\d+\s+/, '')        // 先頭の数字を削除
            .replace(/\s{2,}/g, ' ')       // 連続スペースを単一に
            .replace(/^[・○●]\s*/, '')     // 先頭の記号を削除
            .trim();

          return info;
        }

        // 有効な優待情報のみを返す
        return results.filter(r => r.content && r.content.length > 10);
      });

      // データベースに保存
      if (benefits.length > 0) {
        // 既存データを削除
        await this.db.deleteStockBenefits(stockCode);
        
        // 銘柄情報を更新
        await this.db.updateStockInfo(stockCode, stockInfo.name);

        // 優待情報を保存
        for (const benefit of benefits) {
          await this.db.insertBenefit({
            stock_code: stockCode,
            benefit_type: this.classifyBenefitType(benefit.content),
            description: benefit.content,
            monetary_value: benefit.value || 0,
            min_shares: parseInt(benefit.shares) || 100,
            holder_type: 'どちらでも',
            ex_rights_month: benefit.month ? parseInt(benefit.month) : 3
          });
        }

        console.log(`✅ ${stockCode}: ${stockInfo.name} - ${benefits.length}件の優待情報を保存`);
        return { success: true, name: stockInfo.name, benefitCount: benefits.length };
      } else {
        return { success: false, noData: true, reason: '優待情報なし' };
      }

    } catch (error) {
      console.error(`❌ ${stockCode}: エラー - ${error.message}`);
      // デバッグ用：詳細なエラー情報
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      return { success: false, error: error.message };
    } finally {
      await page.close();
    }
  }

  /**
   * 優待タイプの分類（改善版）
   */
  classifyBenefitType(description) {
    const typeMap = {
      '食事券・グルメ券': ['食事券', 'お食事券', 'グルメ券', 'レストラン', '飲食', 'ディナー', 'ランチ'],
      '商品券・ギフトカード': ['商品券', 'ギフトカード', 'ギフト券', 'お買物券', 'お買い物券', 'VJAギフトカード'],
      'QUOカード・図書カード': ['QUOカード', 'クオカード', 'クオ・カード', '図書カード', 'Quoカード'],
      '割引券・優待券': ['割引券', '優待券', '割引', '優待カード', '優待ポイント', '%OFF', '％OFF'],
      '自社製品・商品': ['自社製品', '自社商品', '当社製品', '当社商品', '製品詰合せ', '詰め合わせ', 'セット'],
      'カタログギフト': ['カタログギフト', 'カタログ', '選べるギフト', 'セレクトギフト'],
      'ポイント・電子マネー': ['ポイント', '電子マネー', 'ポイント付与', 'プリペイドカード'],
      '宿泊・レジャー': ['宿泊券', 'ホテル', 'レジャー', '施設利用券', 'リゾート', '温泉', 'スパ'],
      '交通・乗車券': ['乗車券', '交通', '電車', 'バス', '航空券', '回数券', '定期券'],
      '金券・現金': ['現金', '金券', 'キャッシュバック', '配当'],
      '寄付選択制': ['寄付', '寄附', '社会貢献', 'チャリティ', '寄贈'],
      '美容・健康': ['美容', '健康', 'エステ', 'スパ', 'フィットネス', 'ジム', 'サプリメント'],
      '本・雑誌・エンタメ': ['本', '雑誌', '書籍', 'DVD', '映画', 'チケット', '観戦', '観劇']
    };

    for (const [type, keywords] of Object.entries(typeMap)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        return type;
      }
    }
    
    return 'その他';
  }

  /**
   * 全銘柄の優待情報をクリーンに再取得
   */
  async cleanAllBenefits() {
    console.log('🧹 全銘柄の優待情報をクリーンに再取得開始...');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    try {
      // 優待のある可能性が高い銘柄を優先的に処理
      const stockCodes = await this.getStockCodesWithBenefits();
      console.log(`${stockCodes.length} 銘柄の優待情報を更新します`);

      const batchSize = 10;
      
      for (let i = 0; i < stockCodes.length; i += batchSize) {
        const batch = stockCodes.slice(i, i + batchSize);
        console.log(`\nバッチ ${Math.floor(i/batchSize) + 1}/${Math.ceil(stockCodes.length/batchSize)}`);
        
        // バッチ内で順次処理（サイトへの負荷軽減）
        for (const code of batch) {
          const result = await this.scrapeStockBenefit(browser, code);
          
          if (result.success) {
            this.processedCount++;
          } else {
            this.errorCount++;
          }
          
          // リクエスト間隔
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // バッチ間の待機
        if (i + batchSize < stockCodes.length) {
          console.log(`進捗: ${this.processedCount} 成功, ${this.errorCount} エラー`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      console.log('\n✅ クリーンな優待情報取得完了');
      console.log(`最終結果: ${this.processedCount} 成功, ${this.errorCount} エラー`);

    } finally {
      await browser.close();
    }
  }

  /**
   * 優待情報がある銘柄コードを取得
   */
  async getStockCodesWithBenefits() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT DISTINCT s.code
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        WHERE sb.id IS NOT NULL
        ORDER BY s.code
        LIMIT 500
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.code));
      });
    });
  }

  /**
   * 特定銘柄の優待情報をクリーンに取得
   */
  async cleanSpecificStock(stockCode) {
    console.log(`🧹 ${stockCode} の優待情報をクリーンに取得中...`);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const result = await this.scrapeStockBenefit(browser, stockCode);
      
      if (result.success) {
        console.log(`✅ 完了: ${result.benefitCount} 件の優待情報を保存`);
      } else {
        console.log(`⚠️ ${result.reason || result.error}`);
      }
      
      return result;
    } finally {
      await browser.close();
    }
  }

  close() {
    this.db.close();
  }
}

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new CleanBenefitScraper();
  
  try {
    const command = process.argv[2];
    
    if (command === 'all') {
      await scraper.cleanAllBenefits();
    } else if (command) {
      // 特定銘柄
      await scraper.cleanSpecificStock(command);
    } else {
      console.log('使用方法:');
      console.log('  node clean-benefit-scraper.js all     - 全銘柄の優待情報をクリーン取得');
      console.log('  node clean-benefit-scraper.js 9980    - 特定銘柄の優待情報をクリーン取得');
    }
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    scraper.close();
  }
}