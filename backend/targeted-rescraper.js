import puppeteer from 'puppeteer';
import { Database } from './database.js';

// 包括的監査で特定された問題のある銘柄を対象とした再スクレイピング
class TargetedRescraper {
  constructor() {
    this.db = new Database();
    this.browser = null;
    this.page = null;
    
    // 優待ジャンルマッピング（改善版）
    this.benefitTypeMapping = {
      '食事券・グルメ券': ['食事券', '飲食券', 'グルメ券', '食事割引', '飲食割引', 'レストラン', '食べ物'],
      '商品券・ギフトカード': ['商品券', 'ギフトカード', 'ギフト券', '百貨店', 'デパート'],
      'QUOカード・図書カード': ['QUOカード', '図書カード', 'クオカード', '本'],
      '割引券・優待券': ['割引券', '優待券', '優待割引', '割引', 'クーポン'],
      '自社製品・商品': ['自社製品', '自社商品', '商品', '製品', 'オリジナル'],
      'カタログギフト': ['カタログギフト', 'カタログ', 'ギフトセット'],
      'ポイント・電子マネー': ['ポイント', '電子マネー', 'Edy', 'WAON', 'nanaco'],
      '宿泊・レジャー': ['宿泊券', 'ホテル', '温泉', 'レジャー', '旅行', 'ゴルフ'],
      '交通・乗車券': ['乗車券', '航空券', '交通費', '電車', 'バス', '航空'],
      '金券・現金': ['現金', '金券', 'お米券', '全国百貨店共通商品券'],
      '寄付選択制': ['寄付', '社会貢献', '地域貢献'],
      'その他': []
    };
  }

  async init() {
    console.log('ブラウザ初期化中...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // モバイル版をエミュレート（高速化）
    await this.page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15');
    
    console.log('ブラウザ初期化完了');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
    this.db.close();
  }

  // 優待ジャンル分類（改善版）
  classifyBenefitType(description) {
    const desc = description.toLowerCase();
    
    for (const [type, keywords] of Object.entries(this.benefitTypeMapping)) {
      for (const keyword of keywords) {
        if (desc.includes(keyword.toLowerCase())) {
          return type;
        }
      }
    }
    
    return 'その他';
  }

  // 優待金銭価値の正規化（改善版）
  normalizeMonetaryValue(value, description) {
    // 基本的な金銭価値
    let baseValue = value;
    
    // 異常に高い価値の場合は説明文から妥当な価値を推定
    if (value > 15000) {
      console.log(`高額優待検出: ${value}円 - ${description.substring(0, 50)}...`);
      
      // 割引券・優待券の場合は実際の割引額を推定
      if (description.includes('割引') || description.includes('クーポン')) {
        // 一般的な割引額の上限を設定
        baseValue = Math.min(value, 5000);
      }
      // ポイントの場合は現金換算レートを適用
      else if (description.includes('ポイント')) {
        // ポイントは通常1ポイント=1円だが、価値は80%程度
        baseValue = Math.min(value * 0.8, 3000);
      }
      // 商品券の場合
      else if (description.includes('商品券') || description.includes('ギフト')) {
        baseValue = Math.min(value, 10000);
      }
      // その他の場合は一律で上限を設定
      else {
        baseValue = Math.min(value, 8000);
      }
    }
    
    // 最大15000円に制限（現実的な上限）
    return Math.min(baseValue, 15000);
  }

  // 単一銘柄の優待情報を再スクレイピング
  async rescrapeStock(stockCode) {
    try {
      const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
      console.log(`Re-scraping: ${stockCode} - ${url}`);
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // 優待情報が存在するかチェック
      const hasYutai = await this.page.evaluate(() => {
        return !document.querySelector('.md_box_gray') && 
               !document.body.textContent.includes('株主優待はありません');
      });
      
      if (!hasYutai) {
        console.log(`${stockCode}: 優待情報なし`);
        return null;
      }

      // 会社名を取得
      const companyName = await this.page.evaluate(() => {
        const nameElement = document.querySelector('h1.md_stockPrice_title') || 
                          document.querySelector('.stock_name') ||
                          document.querySelector('h1');
        return nameElement ? nameElement.textContent.trim() : '';
      });

      console.log(`${stockCode}: ${companyName}`);

      // 優待詳細情報を取得
      const benefitData = await this.page.evaluate(() => {
        const benefits = [];
        
        // 優待内容のセクションを探す
        const sections = document.querySelectorAll('.md_table, .yutai_content, .benefit_detail');
        
        sections.forEach(section => {
          // 優待内容
          const descriptionElements = section.querySelectorAll('td, .content, .description');
          descriptionElements.forEach(element => {
            const text = element.textContent.trim();
            
            // 優待内容らしいテキストを抽出
            if (text.length > 10 && 
                (text.includes('円') || text.includes('割引') || 
                 text.includes('商品') || text.includes('券') ||
                 text.includes('ポイント') || text.includes('カード'))) {
              
              // 金額を抽出
              const amountMatch = text.match(/(\d{1,3}(?:,\d{3})*)\s*円/);
              const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : 500;
              
              // 必要株式数を抽出
              const sharesMatch = text.match(/(\d{1,4})\s*株/);
              const shares = sharesMatch ? parseInt(sharesMatch[1]) : 100;
              
              // 権利月を抽出（デフォルト3月）
              const monthMatch = text.match(/(\d{1,2})\s*月/);
              const month = monthMatch ? parseInt(monthMatch[1]) : 3;
              
              benefits.push({
                description: text.substring(0, 500),
                monetary_value: amount,
                min_shares: shares,
                ex_rights_month: month
              });
            }
          });
        });
        
        // 重複除去
        const uniqueBenefits = [];
        const seen = new Set();
        
        benefits.forEach(benefit => {
          const key = `${benefit.description.substring(0, 100)}_${benefit.min_shares}_${benefit.ex_rights_month}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueBenefits.push(benefit);
          }
        });
        
        return uniqueBenefits.length > 0 ? uniqueBenefits : [
          {
            description: '株主優待制度あり（詳細要確認）',
            monetary_value: 1000,
            min_shares: 100,
            ex_rights_month: 3
          }
        ];
      });

      // データを正規化して保存
      const processedBenefits = benefitData.map(benefit => ({
        stock_code: stockCode,
        description: benefit.description,
        monetary_value: this.normalizeMonetaryValue(benefit.monetary_value, benefit.description),
        min_shares: Math.min(Math.max(benefit.min_shares, 1), 10000), // 1-10000株の範囲
        ex_rights_month: Math.min(Math.max(benefit.ex_rights_month, 1), 12), // 1-12月の範囲
        benefit_type: this.classifyBenefitType(benefit.description),
        created_at: new Date().toISOString()
      }));

      // 既存データを削除してから新しいデータを挿入
      await this.db.deleteStockBenefits(stockCode);
      
      for (const benefit of processedBenefits) {
        await this.db.insertBenefit(benefit);
      }

      // 株式情報も更新
      await this.db.updateStockInfo(stockCode, companyName);

      console.log(`${stockCode}: ${processedBenefits.length}件の優待情報を更新`);
      return processedBenefits;

    } catch (error) {
      console.error(`Error scraping ${stockCode}:`, error.message);
      return null;
    }
  }

  // 異常な優待利回りを持つ銘柄を再スクレイピング
  async rescrapeHighYieldStocks() {
    try {
      console.log('=== 高利回り銘柄の再スクレイピング開始 ===');
      
      // 優待利回り15%以上の銘柄を取得
      const highYieldStocks = await new Promise((resolve, reject) => {
        this.db.db.all(`
          SELECT 
            s.code,
            s.name,
            ph.price,
            MIN(sb.min_shares) as min_shares,
            SUM(sb.monetary_value) as total_benefit_value,
            CASE 
              WHEN ph.price > 0 AND MIN(sb.min_shares) > 0 THEN
                (SUM(sb.monetary_value) * 100.0) / (ph.price * MIN(sb.min_shares))
              ELSE 0
            END as calculated_benefit_yield
          FROM stocks s
          JOIN shareholder_benefits sb ON s.code = sb.stock_code
          JOIN (
            SELECT stock_code, price
            FROM price_history
            WHERE (stock_code, recorded_at) IN (
              SELECT stock_code, MAX(recorded_at)
              FROM price_history
              GROUP BY stock_code
            )
          ) ph ON s.code = ph.stock_code
          WHERE ph.price > 0
          GROUP BY s.code
          HAVING calculated_benefit_yield > 15
          ORDER BY calculated_benefit_yield DESC
          LIMIT 20
        `, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      console.log(`対象銘柄数: ${highYieldStocks.length}件`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < highYieldStocks.length; i++) {
        const stock = highYieldStocks[i];
        console.log(`\n進捗: ${i + 1}/${highYieldStocks.length} - ${stock.code} (現在利回り: ${stock.calculated_benefit_yield.toFixed(2)}%)`);
        
        const result = await this.rescrapeStock(stock.code);
        
        if (result) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // レート制限（2秒間隔）
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`\n=== 再スクレイピング完了 ===`);
      console.log(`成功: ${successCount}件`);
      console.log(`エラー: ${errorCount}件`);

    } catch (error) {
      console.error('Re-scraping error:', error);
    }
  }

  // データ整合性の修正
  async fixDataIntegrityIssues() {
    console.log('=== データ整合性の修正開始 ===');
    
    try {
      // 1. 異常なmonetary_valueの修正
      const monetaryFix = await new Promise((resolve, reject) => {
        this.db.db.run(`
          UPDATE shareholder_benefits 
          SET monetary_value = CASE
            WHEN monetary_value <= 0 THEN 500
            WHEN monetary_value > 50000 THEN 15000
            ELSE monetary_value
          END
          WHERE monetary_value <= 0 OR monetary_value > 50000
        `, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`monetary_value修正: ${monetaryFix}件`);

      // 2. 異常なmin_sharesの修正
      const sharesFix = await new Promise((resolve, reject) => {
        this.db.db.run(`
          UPDATE shareholder_benefits 
          SET min_shares = CASE
            WHEN min_shares <= 0 THEN 100
            WHEN min_shares > 10000 THEN 1000
            ELSE min_shares
          END
          WHERE min_shares <= 0 OR min_shares > 10000
        `, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`min_shares修正: ${sharesFix}件`);

      // 3. 異常なex_rights_monthの修正
      const monthFix = await new Promise((resolve, reject) => {
        this.db.db.run(`
          UPDATE shareholder_benefits 
          SET ex_rights_month = 3
          WHERE ex_rights_month < 1 OR ex_rights_month > 12
        `, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`ex_rights_month修正: ${monthFix}件`);

      // 4. 空のdescriptionの修正
      const descFix = await new Promise((resolve, reject) => {
        this.db.db.run(`
          UPDATE shareholder_benefits 
          SET description = '株主優待制度あり（詳細要確認）'
          WHERE description IS NULL OR description = ''
        `, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`description修正: ${descFix}件`);

      console.log('=== データ整合性修正完了 ===');
      
    } catch (error) {
      console.error('Data integrity fix error:', error);
    }
  }

  // 重複データの削除
  async removeDuplicateData() {
    console.log('=== 重複データの削除開始 ===');
    
    try {
      const duplicateRemoval = await new Promise((resolve, reject) => {
        this.db.db.run(`
          DELETE FROM shareholder_benefits 
          WHERE rowid NOT IN (
            SELECT MIN(rowid)
            FROM shareholder_benefits
            GROUP BY stock_code, description, min_shares, ex_rights_month
          )
        `, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`重複削除: ${duplicateRemoval}件`);
      console.log('=== 重複データ削除完了 ===');
      
    } catch (error) {
      console.error('Duplicate removal error:', error);
    }
  }

  // メイン実行関数
  async execute() {
    try {
      await this.init();
      
      // 1. 高利回り銘柄の再スクレイピング
      await this.rescrapeHighYieldStocks();
      
      // 2. データ整合性の修正
      await this.fixDataIntegrityIssues();
      
      // 3. 重複データの削除
      await this.removeDuplicateData();
      
      console.log('\n=== 全体の処理完了 ===');
      
    } catch (error) {
      console.error('Execution error:', error);
    } finally {
      await this.close();
    }
  }
}

// 実行
const rescraper = new TargetedRescraper();
rescraper.execute().catch(console.error);