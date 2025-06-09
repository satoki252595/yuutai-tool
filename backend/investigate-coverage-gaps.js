import { Database } from './database.js';

// データベースのカバレッジギャップを調査
class CoverageGapInvestigator {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // 有名優待銘柄の詳細状況確認
  async checkFamousStocksHistory() {
    const famousStocks = [
      { code: '4661', name: 'オリエンタルランド' },
      { code: '9201', name: '日本航空' },
      { code: '9202', name: 'ANAホールディングス' },
      { code: '3197', name: 'すかいらーくホールディングス' },
      { code: '9861', name: '吉野家ホールディングス' },
      { code: '7581', name: 'サイゼリヤ' },
      { code: '2702', name: '日本マクドナルドホールディングス' }
    ];

    console.log('=== 有名優待銘柄の履歴調査 ===\\n');
    
    for (const stock of famousStocks) {
      // stocks テーブルの状況
      const stockData = await new Promise((resolve, reject) => {
        this.db.db.get(
          'SELECT * FROM stocks WHERE code = ?',
          [stock.code],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // 優待情報の状況
      const benefitData = await new Promise((resolve, reject) => {
        this.db.db.all(
          'SELECT * FROM shareholder_benefits WHERE stock_code = ?',
          [stock.code],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      console.log(`\\n=== ${stock.code}: ${stock.name} ===`);
      if (stockData) {
        console.log(`✓ stocks登録済み: ${stockData.name}`);
        console.log(`  市場: ${stockData.market}, セクター: ${stockData.sector}`);
      } else {
        console.log(`❌ stocks未登録`);
      }

      if (benefitData && benefitData.length > 0) {
        console.log(`✓ 優待情報: ${benefitData.length}件`);
        benefitData.forEach((b, i) => {
          console.log(`  ${i+1}. ${b.benefit_type}: ${b.description.substring(0, 50)}...`);
        });
      } else {
        console.log(`❌ 優待情報なし`);
      }
    }
  }

  // データベース全体の統計
  async analyzeDatabaseStats() {
    console.log('\\n\\n=== データベース全体統計 ===');
    
    // stocks テーブル統計
    const stockStats = await new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT COUNT(*) as total FROM stocks',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // 優待情報統計
    const benefitStats = await new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT COUNT(*) as total FROM shareholder_benefits',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // 優待ありの銘柄数
    const stocksWithBenefits = await new Promise((resolve, reject) => {
      this.db.db.get(
        `SELECT COUNT(DISTINCT sb.stock_code) as count 
         FROM shareholder_benefits sb`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    console.log(`\\n総銘柄数: ${stockStats.total}件`);
    console.log(`総優待情報: ${benefitStats.total}件`);
    console.log(`優待ありの銘柄: ${stocksWithBenefits.count}件`);
    console.log(`優待実施率: ${(stocksWithBenefits.count / stockStats.total * 100).toFixed(1)}%`);
  }

  // コード範囲別の登録状況
  async analyzeCodeRanges() {
    console.log('\\n\\n=== 証券コード範囲別登録状況 ===');
    
    const ranges = [
      { name: '建設・資材', start: 1300, end: 1999 },
      { name: '食品・化学', start: 2000, end: 2999 },
      { name: '医薬・小売', start: 3000, end: 3999 },
      { name: 'IT・通信', start: 4000, end: 4999 },
      { name: '機械・素材', start: 5000, end: 5999 },
      { name: '電機・自動車', start: 6000, end: 6999 },
      { name: '小売・外食', start: 7000, end: 7999 },
      { name: '金融・商社', start: 8000, end: 8999 },
      { name: '運輸・インフラ', start: 9000, end: 9999 }
    ];

    for (const range of ranges) {
      const stats = await new Promise((resolve, reject) => {
        this.db.db.get(
          `SELECT 
             COUNT(DISTINCT s.code) as total_stocks,
             COUNT(DISTINCT sb.stock_code) as stocks_with_benefits,
             COUNT(sb.id) as total_benefits
           FROM stocks s
           LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
           WHERE CAST(s.code AS INTEGER) >= ? AND CAST(s.code AS INTEGER) <= ?`,
          [range.start, range.end],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const coverageRate = stats.total_stocks > 0 
        ? (stats.stocks_with_benefits / stats.total_stocks * 100).toFixed(1)
        : 0;

      console.log(`\\n${range.name} (${range.start}-${range.end}):`);
      console.log(`  銘柄数: ${stats.total_stocks}件`);
      console.log(`  優待あり: ${stats.stocks_with_benefits}件 (${coverageRate}%)`);
      console.log(`  優待情報: ${stats.total_benefits}件`);
    }
  }

  // 特定範囲の詳細確認（オリエンタルランド周辺）
  async checkSpecificRange() {
    console.log('\\n\\n=== 4600-4700範囲の詳細確認 ===');
    
    const rangeStocks = await new Promise((resolve, reject) => {
      this.db.db.all(
        `SELECT s.code, s.name, 
                COUNT(sb.id) as benefit_count
         FROM stocks s
         LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
         WHERE CAST(s.code AS INTEGER) >= 4600 AND CAST(s.code AS INTEGER) <= 4700
         GROUP BY s.code, s.name
         ORDER BY CAST(s.code AS INTEGER)`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    console.log(`\\n4600-4700番台の登録状況:`);
    rangeStocks.forEach(stock => {
      const status = stock.benefit_count > 0 ? '優待あり' : '優待なし';
      console.log(`  ${stock.code}: ${stock.name} - ${status} (${stock.benefit_count}件)`);
    });
  }

  // なぜオリエンタルランドが見つからなかったかの推測
  async investigateOrientalLandIssue() {
    console.log('\\n\\n=== オリエンタルランド問題の調査 ===');
    
    // 現在の状況
    const current = await new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT * FROM stocks WHERE code = ?',
        ['4661'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    console.log('\\n現在の状況:');
    if (current) {
      console.log(`✓ 現在は登録済み: ${current.name}`);
      console.log(`  市場: ${current.market}, セクター: ${current.sector}`);
    } else {
      console.log('❌ 現在も未登録');
    }

    // 考えられる原因
    console.log('\\n考えられる原因:');
    console.log('1. 初期スクレイピング時にminkabu.jpからデータが取得できなかった');
    console.log('2. Yahoo Finance APIで株価情報が取得できずスキップされた');
    console.log('3. スクレイピング中にエラーが発生して処理が中断された');
    console.log('4. 該当コード範囲がスクレイピング対象から漏れていた');
    
    // 推奨対策
    console.log('\\n推奨対策:');
    console.log('1. 複数のデータソースを使用（minkabu.jp以外も）');
    console.log('2. エラー耐性の向上とリトライ機能');
    console.log('3. 進捗状況の詳細ログ記録');
    console.log('4. 定期的なデータ完全性チェック');
  }

  async execute() {
    try {
      await this.checkFamousStocksHistory();
      await this.analyzeDatabaseStats();
      await this.analyzeCodeRanges();
      await this.checkSpecificRange();
      await this.investigateOrientalLandIssue();
      
      console.log('\\n=== 調査完了 ===');
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const investigator = new CoverageGapInvestigator();
investigator.execute()
  .then(() => investigator.close())
  .catch(error => {
    console.error('Fatal error:', error);
    investigator.close();
  });