import { Database } from './database.js';

// 長期保有制度の検出と追加
class LongTermHoldingFeature {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // 長期保有制度を検出するパターン
  detectLongTermHolding(description) {
    if (!description) return false;
    
    const patterns = [
      /\d+年以上保有/,
      /\d+年以上継続/,
      /長期保有/,
      /継続保有/,
      /\d+ヶ月以上保有/,
      /\d+カ月以上保有/,
      /\d+年未満.*\d+年以上/,
      /【\d+年以上/,
      /\(\d+年以上/
    ];
    
    return patterns.some(pattern => pattern.test(description));
  }

  // 長期保有制度の詳細情報を抽出
  extractLongTermDetails(description) {
    if (!description) return null;
    
    // 年数の抽出
    const yearMatch = description.match(/(\d+)年以上/);
    const monthMatch = description.match(/(\d+)[ヶカ]月以上/);
    
    let minimumPeriod = null;
    if (yearMatch) {
      minimumPeriod = `${yearMatch[1]}年以上`;
    } else if (monthMatch) {
      minimumPeriod = `${monthMatch[1]}ヶ月以上`;
    }
    
    // 優待増額の有無
    const hasIncrease = /年以上.*[増多]|以上.*[優特]/.test(description);
    
    return {
      hasLongTerm: true,
      minimumPeriod,
      hasIncrease,
      description: description.substring(0, 200)
    };
  }

  // データベースに長期保有フラグを追加
  async addLongTermColumn() {
    try {
      // カラムが存在するかチェック
      const tableInfo = await new Promise((resolve, reject) => {
        this.db.db.all("PRAGMA table_info(shareholder_benefits)", (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const hasLongTermColumn = tableInfo.some(col => col.name === 'has_long_term_holding');
      
      if (!hasLongTermColumn) {
        await new Promise((resolve, reject) => {
          this.db.db.run(`
            ALTER TABLE shareholder_benefits 
            ADD COLUMN has_long_term_holding INTEGER DEFAULT 0
          `, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log('✓ has_long_term_holding カラムを追加');
      } else {
        console.log('✓ has_long_term_holding カラムは既に存在');
      }

      // 詳細情報カラム
      const hasDetailsColumn = tableInfo.some(col => col.name === 'long_term_details');
      
      if (!hasDetailsColumn) {
        await new Promise((resolve, reject) => {
          this.db.db.run(`
            ALTER TABLE shareholder_benefits 
            ADD COLUMN long_term_details TEXT
          `, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log('✓ long_term_details カラムを追加');
      }

    } catch (error) {
      console.error('カラム追加エラー:', error);
    }
  }

  // 全優待データの長期保有制度を分析・更新
  async analyzeLongTermHoldings() {
    console.log('=== 長期保有制度の分析開始 ===');
    
    const allBenefits = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT id, stock_code, description, has_long_term_holding
        FROM shareholder_benefits
        ORDER BY stock_code
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`総優待数: ${allBenefits.length}件`);

    let longTermCount = 0;
    const updates = [];

    for (const benefit of allBenefits) {
      const hasLongTerm = this.detectLongTermHolding(benefit.description);
      
      if (hasLongTerm) {
        const details = this.extractLongTermDetails(benefit.description);
        updates.push({
          id: benefit.id,
          hasLongTerm: 1,
          details: JSON.stringify(details)
        });
        longTermCount++;
      } else if (benefit.has_long_term_holding === 1) {
        // 以前は長期保有だったが、今は該当しない場合
        updates.push({
          id: benefit.id,
          hasLongTerm: 0,
          details: null
        });
      }
    }

    console.log(`長期保有制度あり: ${longTermCount}件`);

    // 更新実行
    for (const update of updates) {
      await new Promise((resolve, reject) => {
        this.db.db.run(`
          UPDATE shareholder_benefits 
          SET has_long_term_holding = ?, long_term_details = ?
          WHERE id = ?
        `, [update.hasLongTerm, update.details, update.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    console.log(`✓ ${updates.length}件のデータを更新`);

    // 統計表示
    await this.showLongTermStats();
  }

  // 長期保有制度の統計表示
  async showLongTermStats() {
    const stats = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT 
          COUNT(DISTINCT stock_code) as total_stocks,
          COUNT(DISTINCT CASE WHEN has_long_term_holding = 1 THEN stock_code END) as stocks_with_long_term,
          COUNT(CASE WHEN has_long_term_holding = 1 THEN 1 END) as long_term_benefits
        FROM shareholder_benefits
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });

    console.log('\n=== 長期保有制度統計 ===');
    console.log(`総銘柄数: ${stats.total_stocks}銘柄`);
    console.log(`長期保有制度あり: ${stats.stocks_with_long_term}銘柄`);
    console.log(`長期保有制度の優待数: ${stats.long_term_benefits}件`);
    console.log(`長期保有制度の導入率: ${(stats.stocks_with_long_term / stats.total_stocks * 100).toFixed(1)}%`);

    // サンプル表示
    const samples = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT s.code, s.name, sb.description
        FROM stocks s
        JOIN shareholder_benefits sb ON s.code = sb.stock_code
        WHERE sb.has_long_term_holding = 1
        ORDER BY s.code
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n長期保有制度の例:');
    samples.forEach(sample => {
      console.log(`  ${sample.code}: ${sample.name}`);
      console.log(`    ${sample.description.substring(0, 100)}...`);
    });
  }

  // メイン実行
  async execute() {
    try {
      console.log('=== 長期保有制度機能追加開始 ===\n');

      // 1. データベースカラム追加
      await this.addLongTermColumn();

      // 2. 長期保有制度の分析・更新
      await this.analyzeLongTermHoldings();

      console.log('\n=== 長期保有制度機能追加完了 ===');

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const feature = new LongTermHoldingFeature();
feature.execute()
  .then(() => feature.close())
  .catch(error => {
    console.error('Fatal error:', error);
    feature.close();
  });