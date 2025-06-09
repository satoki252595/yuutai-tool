import puppeteer from 'puppeteer';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

// 未登録の有名優待銘柄を追加
class MissingStocksAdder {
  constructor() {
    this.db = new Database();
    this.yahooFinance = new YahooFinanceService();
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('ブラウザ初期化中...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    console.log('ブラウザ初期化完了');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
    this.db.close();
  }

  // 優待情報を取得する銘柄リスト
  getMissingStocks() {
    return [
      { code: '4661', name: 'オリエンタルランド', description: 'ディズニーランド・ディズニーシー' },
      { code: '9201', name: '日本航空', description: 'JAL' },
      { code: '9202', name: 'ANAホールディングス', description: 'ANA' },
      { code: '9861', name: '吉野家ホールディングス', description: '吉野家' },
      { code: '9020', name: '東日本旅客鉄道', description: 'JR東日本' },
      { code: '9021', name: '西日本旅客鉄道', description: 'JR西日本' },
      { code: '9022', name: '東海旅客鉄道', description: 'JR東海' },
      { code: '7581', name: 'サイゼリヤ', description: 'サイゼリヤ' },
      { code: '9831', name: 'ヤマダホールディングス', description: 'ヤマダ電機' },
      { code: '9843', name: 'ニトリホールディングス', description: 'ニトリ' },
      { code: '3092', name: 'ZOZO', description: 'ZOZOTOWN' },
      { code: '4755', name: '楽天グループ', description: '楽天' },
      { code: '8411', name: 'みずほフィナンシャルグループ', description: 'みずほ銀行' },
      { code: '8306', name: '三菱UFJフィナンシャル・グループ', description: '三菱UFJ銀行' },
      { code: '8316', name: '三井住友フィナンシャルグループ', description: '三井住友銀行' }
    ];
  }

  // 優待ジャンル分類（詳細版）
  classifyBenefitType(description) {
    const desc = description.toLowerCase();
    
    const classifications = {
      '入場券・チケット': ['入場券', 'チケット', 'パスポート', '入園', 'ディズニー', 'テーマパーク'],
      '航空券・旅行': ['航空券', '搭乗', 'フライト', '旅行', '国内線', '国際線', 'マイル'],
      '鉄道・交通': ['鉄道', '乗車券', '運賃', 'jr', '新幹線', '特急', '回数券'],
      '食事券・グルメ券': ['食事券', '飲食券', '食事割引', 'レストラン', '吉野家', 'サイゼリヤ'],
      '家電・家具割引': ['家電', '家具', '割引', 'ヤマダ', 'ニトリ', 'ポイント'],
      'ECサイト・通販': ['オンライン', 'ec', '通販', 'ネット', 'ショッピング', 'zozo', '楽天'],
      '金融サービス': ['金融', '銀行', '証券', '手数料', 'atm', '振込']
    };

    for (const [type, keywords] of Object.entries(classifications)) {
      for (const keyword of keywords) {
        if (desc.includes(keyword)) {
          return type;
        }
      }
    }
    
    return '割引券・優待券';
  }

  // 単一銘柄の優待情報をスクレイピング
  async scrapeSingleStock(stock) {
    try {
      const url = `https://minkabu.jp/stock/${stock.code}/yutai`;
      console.log(`\nスクレイピング: ${stock.code} ${stock.name}`);
      console.log(`URL: ${url}`);
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // 優待情報の存在確認
      const hasYutai = await this.page.evaluate(() => {
        const noYutaiElement = document.querySelector('.md_box_gray');
        const noYutaiText = document.body.textContent.includes('株主優待はありません');
        return !noYutaiElement && !noYutaiText;
      });

      if (!hasYutai) {
        console.log(`  ${stock.code}: 優待なし`);
        // 優待なしでも銘柄は登録
        await this.db.upsertStock({
          code: stock.code,
          name: stock.name,
          market: 'プライム',
          sector: null
        });
        return null;
      }

      // 優待詳細情報を取得
      const benefitData = await this.page.evaluate(() => {
        const benefits = [];
        
        // テーブル形式の優待情報を探す
        const tables = document.querySelectorAll('table.md_table');
        
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          rows.forEach((row, index) => {
            if (index === 0) return; // ヘッダーをスキップ
            
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const sharesText = cells[0]?.textContent || '';
              const benefitText = cells[1]?.textContent || '';
              
              // 株数を抽出
              const sharesMatch = sharesText.match(/(\d+)\s*株/);
              const shares = sharesMatch ? parseInt(sharesMatch[1]) : 100;
              
              // 金額を抽出
              const amountMatch = benefitText.match(/(\d{1,3}(?:,\d{3})*)\s*円/);
              const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 1000;
              
              // 権利月を抽出（デフォルト3月）
              const monthMatch = benefitText.match(/(\d{1,2})\s*月/);
              const month = monthMatch ? parseInt(monthMatch[1]) : 3;
              
              if (benefitText.trim()) {
                benefits.push({
                  description: benefitText.trim(),
                  monetary_value: amount,
                  min_shares: shares,
                  ex_rights_month: month
                });
              }
            }
          });
        });

        // テーブル形式でない場合の処理
        if (benefits.length === 0) {
          const contentElements = document.querySelectorAll('.yutai_content, .benefit_detail, .md_box');
          contentElements.forEach(element => {
            const text = element.textContent.trim();
            if (text && text.length > 10) {
              benefits.push({
                description: text.substring(0, 500),
                monetary_value: 1000,
                min_shares: 100,
                ex_rights_month: 3
              });
            }
          });
        }

        return benefits;
      });

      // 銘柄情報を保存
      await this.db.upsertStock({
        code: stock.code,
        name: stock.name,
        market: 'プライム',
        sector: stock.description
      });

      // 優待情報を保存
      if (benefitData && benefitData.length > 0) {
        console.log(`  ${stock.code}: ${benefitData.length}件の優待情報を取得`);
        
        for (const benefit of benefitData) {
          const benefitType = this.classifyBenefitType(benefit.description);
          
          await this.db.insertBenefit({
            stock_code: stock.code,
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

      // 株価情報を取得
      try {
        const priceData = await this.yahooFinance.getStockPrice(stock.code);
        if (priceData) {
          await this.db.insertPriceHistory(priceData);
          console.log(`  株価: ${priceData.price}円, 配当利回り: ${priceData.dividendYield}%`);
        }
      } catch (error) {
        console.log(`  株価取得エラー: ${error.message}`);
      }

      return benefitData;

    } catch (error) {
      console.error(`エラー ${stock.code}:`, error.message);
      return null;
    }
  }

  // メイン実行
  async execute() {
    try {
      await this.init();
      
      console.log('=== 未登録優待銘柄の追加開始 ===');
      
      const missingStocks = this.getMissingStocks();
      let addedCount = 0;
      let benefitCount = 0;

      for (const stock of missingStocks) {
        const result = await this.scrapeSingleStock(stock);
        
        if (result) {
          addedCount++;
          benefitCount += result.length;
        }
        
        // レート制限（2秒間隔）
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log('\n=== 追加完了 ===');
      console.log(`追加銘柄数: ${addedCount}/${missingStocks.length}`);
      console.log(`追加優待情報: ${benefitCount}件`);

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const adder = new MissingStocksAdder();
adder.execute()
  .then(() => adder.close())
  .catch(error => {
    console.error('Fatal error:', error);
    adder.close();
  });