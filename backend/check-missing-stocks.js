import { Database } from './database.js';

// 有名な優待銘柄の確認と追加
class MissingStocksChecker {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // 有名な優待銘柄リスト
  getFamousStocks() {
    return [
      { code: '4661', name: 'オリエンタルランド' },
      { code: '9201', name: '日本航空' },
      { code: '9202', name: 'ANAホールディングス' },
      { code: '3197', name: 'すかいらーくホールディングス' },
      { code: '9861', name: '吉野家ホールディングス' },
      { code: '9020', name: '東日本旅客鉄道' },
      { code: '9021', name: '西日本旅客鉄道' },
      { code: '9022', name: '東海旅客鉄道' },
      { code: '8267', name: 'イオン' },
      { code: '3099', name: '三越伊勢丹ホールディングス' },
      { code: '3088', name: 'マツモトキヨシホールディングス' },
      { code: '8233', name: '高島屋' },
      { code: '7412', name: 'アトム' },
      { code: '7421', name: 'カッパ・クリエイト' },
      { code: '7550', name: 'ゼンショーホールディングス' },
      { code: '7581', name: 'サイゼリヤ' },
      { code: '7611', name: 'ハイデイ日高' },
      { code: '7616', name: 'コロワイド' },
      { code: '7625', name: 'グローバルダイニング' },
      { code: '3087', name: 'ドトール・日レスホールディングス' },
      { code: '2702', name: '日本マクドナルドホールディングス' },
      { code: '3563', name: 'FOOD & LIFE COMPANIES' },
      { code: '9831', name: 'ヤマダホールディングス' },
      { code: '9843', name: 'ニトリホールディングス' },
      { code: '7453', name: '良品計画' },
      { code: '3092', name: 'ZOZO' },
      { code: '4755', name: '楽天グループ' },
      { code: '8411', name: 'みずほフィナンシャルグループ' },
      { code: '8306', name: '三菱UFJフィナンシャル・グループ' },
      { code: '8316', name: '三井住友フィナンシャルグループ' }
    ];
  }

  // データベースに存在しない銘柄をチェック
  async checkMissingStocks() {
    const famousStocks = this.getFamousStocks();
    const missingStocks = [];
    
    console.log('=== 有名優待銘柄の登録状況確認 ===\n');
    
    for (const stock of famousStocks) {
      const exists = await new Promise((resolve, reject) => {
        this.db.db.get(
          'SELECT code, name FROM stocks WHERE code = ?',
          [stock.code],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (!exists) {
        missingStocks.push(stock);
        console.log(`❌ ${stock.code}: ${stock.name} - 未登録`);
      } else {
        // 優待情報があるかチェック
        const hasBenefit = await new Promise((resolve, reject) => {
          this.db.db.get(
            'SELECT COUNT(*) as count FROM shareholder_benefits WHERE stock_code = ?',
            [stock.code],
            (err, row) => {
              if (err) reject(err);
              else resolve(row.count > 0);
            }
          );
        });
        
        if (hasBenefit) {
          console.log(`✅ ${stock.code}: ${exists.name} - 登録済み（優待あり）`);
        } else {
          console.log(`⚠️  ${stock.code}: ${exists.name} - 登録済み（優待なし）`);
        }
      }
    }
    
    return missingStocks;
  }

  // 「その他」分類の詳細分析
  async analyzeOtherCategory() {
    const total = await new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT COUNT(*) as count FROM shareholder_benefits',
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    
    const otherCount = await new Promise((resolve, reject) => {
      this.db.db.get(
        "SELECT COUNT(*) as count FROM shareholder_benefits WHERE benefit_type = 'その他'",
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    
    const percentage = (otherCount / total * 100).toFixed(1);
    
    console.log('\n=== 「その他」分類の現状 ===');
    console.log(`総優待数: ${total}件`);
    console.log(`「その他」: ${otherCount}件 (${percentage}%)`);
    console.log(`目標: 10%未満（${Math.floor(total * 0.1)}件以下）`);
    console.log(`削減必要数: ${otherCount - Math.floor(total * 0.1)}件`);
    
    // サンプル取得
    const samples = await new Promise((resolve, reject) => {
      this.db.db.all(
        `SELECT sb.description, s.code, s.name 
         FROM shareholder_benefits sb
         JOIN stocks s ON sb.stock_code = s.code
         WHERE sb.benefit_type = 'その他'
         ORDER BY RANDOM()
         LIMIT 20`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log('\n「その他」分類のサンプル:');
    samples.forEach(s => {
      console.log(`  ${s.code} ${s.name}: ${s.description.substring(0, 60)}...`);
    });
  }

  // 検索機能のテスト
  async testSearchFunction() {
    console.log('\n=== 検索機能テスト ===');
    
    const testCases = [
      { query: 'オリエンタル', expected: ['オリエンタルランド', 'オリエンタルコンサルタンツ'] },
      { query: '4661', expected: ['オリエンタルランド'] },
      { query: 'ディズニー', expected: ['オリエンタルランド'] },
      { query: 'イオン', expected: ['イオン'] },
      { query: '日本航空', expected: ['日本航空'] },
      { query: 'ANA', expected: ['ANAホールディングス'] }
    ];
    
    for (const test of testCases) {
      const results = await new Promise((resolve, reject) => {
        this.db.db.all(
          `SELECT code, name FROM stocks 
           WHERE code LIKE ? OR name LIKE ? 
           ORDER BY code`,
          [`%${test.query}%`, `%${test.query}%`],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      
      console.log(`\nクエリ: "${test.query}"`);
      console.log(`期待: ${test.expected.join(', ')}`);
      console.log(`結果: ${results.map(r => r.name).join(', ') || 'なし'}`);
      
      if (results.length === 0) {
        console.log('❌ 検索結果なし');
      } else {
        console.log('✅ 検索成功');
      }
    }
  }

  async execute() {
    try {
      console.log('=== 優待データベース診断開始 ===\n');
      
      // 1. 有名銘柄の確認
      const missingStocks = await this.checkMissingStocks();
      
      // 2. その他分類の分析
      await this.analyzeOtherCategory();
      
      // 3. 検索機能テスト
      await this.testSearchFunction();
      
      console.log('\n=== 診断完了 ===');
      console.log(`\n未登録の有名銘柄: ${missingStocks.length}件`);
      
      if (missingStocks.length > 0) {
        console.log('\n推奨アクション:');
        console.log('1. 未登録銘柄の追加スクレイピング実施');
        console.log('2. 「その他」分類の再分類強化');
        console.log('3. 検索機能の改善');
      }
      
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const checker = new MissingStocksChecker();
checker.execute()
  .then(() => checker.close())
  .catch(error => {
    console.error('Fatal error:', error);
    checker.close();
  });