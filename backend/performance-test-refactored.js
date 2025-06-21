#!/usr/bin/env node
import { Database } from './database.js';

// パフォーマンステストスイート（リファクタリング後）
class PerformanceTestSuite {
  constructor() {
    this.db = new Database();
    this.results = [];
  }
  
  async measureQuery(name, query, params = []) {
    const start = process.hrtime.bigint();
    
    return new Promise((resolve, reject) => {
      this.db.db.all(query, params, (err, rows) => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000;
        
        if (err) {
          reject(err);
        } else {
          this.results.push({ name, duration, rowCount: rows.length });
          resolve({ duration, rowCount: rows.length });
        }
      });
    });
  }
  
  async runAllTests() {
    console.log('🚀 リファクタリング後のパフォーマンステストを開始...\n');
    
    const tests = [
      {
        name: '基本的な株式一覧取得',
        query: 'SELECT * FROM stocks LIMIT 20'
      },
      {
        name: '複合インデックスを利用した検索',
        query: `SELECT * FROM stocks 
                WHERE code LIKE ? OR name LIKE ? OR japanese_name LIKE ?
                LIMIT 20`,
        params: ['%7%', '%トヨタ%', '%トヨタ%']
      },
      {
        name: '優待情報付き株式取得（最適化版）',
        query: `SELECT 
                  s.*, 
                  COUNT(DISTINCT sb.id) as benefit_count,
                  GROUP_CONCAT(DISTINCT sb.benefit_type) as benefit_types
                FROM stocks s
                LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
                GROUP BY s.code
                LIMIT 20`
      },
      {
        name: 'RSIフィルタリング（インデックス利用）',
        query: `SELECT * FROM stocks 
                WHERE rsi < 30 AND rsi IS NOT NULL
                LIMIT 20`
      },
      {
        name: '総合利回りソート（計算込み）',
        query: `SELECT 
                  s.*,
                  lp.dividend_yield,
                  COALESCE(SUM(sb.monetary_value) / (lp.price * 100), 0) as benefit_yield,
                  (lp.dividend_yield + COALESCE(SUM(sb.monetary_value) / (lp.price * 100), 0)) as total_yield
                FROM stocks s
                LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
                LEFT JOIN latest_prices lp ON s.code = lp.stock_code
                GROUP BY s.code
                ORDER BY total_yield DESC
                LIMIT 20`
      }
    ];
    
    // ウォームアップ実行
    console.log('ウォームアップ中...');
    for (const test of tests) {
      await this.measureQuery('warmup', test.query, test.params || []);
    }
    this.results = []; // ウォームアップ結果をクリア
    
    // 本番テスト実行（各3回）
    console.log('\n本番テスト実行中...\n');
    
    for (const test of tests) {
      const durations = [];
      
      for (let i = 0; i < 3; i++) {
        const result = await this.measureQuery(test.name, test.query, test.params || []);
        durations.push(result.duration);
      }
      
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      console.log(`📊 ${test.name}`);
      console.log(`   平均: ${avg.toFixed(2)}ms`);
      console.log(`   最小: ${min.toFixed(2)}ms`);
      console.log(`   最大: ${max.toFixed(2)}ms`);
      console.log('');
    }
    
    // キャッシュ効果テスト
    console.log('📊 キャッシュ効果テスト');
    const cacheTestQuery = 'SELECT * FROM stocks WHERE code = ?';
    
    // 初回実行
    const firstRun = await this.measureQuery('初回実行', cacheTestQuery, ['7203']);
    console.log(`   初回: ${firstRun.duration.toFixed(2)}ms`);
    
    // 2回目実行（キャッシュ効果）
    const secondRun = await this.measureQuery('2回目実行', cacheTestQuery, ['7203']);
    console.log(`   2回目: ${secondRun.duration.toFixed(2)}ms`);
    console.log(`   高速化率: ${(firstRun.duration / secondRun.duration).toFixed(1)}x\n`);
    
    // 総合評価
    const totalAvg = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    console.log('✅ テスト完了！');
    console.log(`📊 全体平均レスポンスタイム: ${totalAvg.toFixed(2)}ms`);
    
    if (totalAvg < 10) {
      console.log('🎉 素晴らしいパフォーマンス！');
    } else if (totalAvg < 50) {
      console.log('👍 良好なパフォーマンス');
    } else {
      console.log('⚠️ パフォーマンス改善の余地があります');
    }
  }
  
  async close() {
    this.db.close();
  }
}

// 実行
async function main() {
  const suite = new PerformanceTestSuite();
  
  try {
    await suite.runAllTests();
  } catch (error) {
    console.error('❌ エラー:', error.message);
  } finally {
    await suite.close();
  }
}

main();