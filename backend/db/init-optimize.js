#!/usr/bin/env node
import { Database } from '../database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// データベース最適化初期化スクリプト
async function initializeAndOptimize() {
  console.log('🔧 データベース最適化を開始します...');
  
  const db = new Database();
  
  try {
    // インデックス最適化SQLを実行
    const optimizeSql = readFileSync(join(__dirname, 'optimize-indexes.sql'), 'utf8');
    
    await new Promise((resolve, reject) => {
      db.db.exec(optimizeSql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('✅ インデックス最適化が完了しました');
    
    // VACUUM実行（デフラグ）
    await new Promise((resolve, reject) => {
      db.db.run('VACUUM', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('✅ データベースのVACUUMが完了しました');
    
    // 統計情報更新
    await new Promise((resolve, reject) => {
      db.db.run('ANALYZE', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('✅ 統計情報の更新が完了しました');
    
    // パフォーマンステスト
    console.log('\n📊 パフォーマンステストを実行中...');
    
    const testQueries = [
      {
        name: '株式一覧取得（ページング）',
        sql: 'SELECT * FROM stocks LIMIT 20'
      },
      {
        name: '優待情報JOIN',
        sql: `SELECT s.*, COUNT(sb.id) as benefit_count 
              FROM stocks s 
              LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code 
              GROUP BY s.code LIMIT 20`
      },
      {
        name: '検索クエリ',
        sql: `SELECT * FROM stocks 
              WHERE code LIKE '%7%' OR name LIKE '%トヨタ%' 
              LIMIT 20`
      }
    ];
    
    for (const test of testQueries) {
      const start = process.hrtime.bigint();
      
      await new Promise((resolve, reject) => {
        db.db.all(test.sql, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;
      
      console.log(`  ${test.name}: ${duration.toFixed(2)}ms`);
    }
    
    console.log('\n✅ すべての最適化が完了しました！');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 実行
initializeAndOptimize();