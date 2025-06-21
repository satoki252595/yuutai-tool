#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 データベースパフォーマンステスト開始...\n');

const db = new sqlite3.Database(join(__dirname, 'db/yuutai.db'));

// 高精度タイマー
function measureTime(description, fn) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    fn((err, result) => {
      const end = process.hrtime.bigint();
      const durationNs = Number(end - start);
      const durationMs = durationNs / 1000000;
      
      if (err) {
        reject(err);
      } else {
        console.log(`${description}: ${result}件 (${durationMs.toFixed(3)}ms)`);
        resolve({ result, duration: durationMs });
      }
    });
  });
}

async function runPerformanceTests() {
  try {
    console.log('=== 基本クエリ ===');
    
    // テスト1: 銘柄数カウント
    await measureTime('  全銘柄数取得', (callback) => {
      db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
        callback(err, row?.count);
      });
    });
    
    // テスト2: 優待情報数カウント
    await measureTime('  優待情報数取得', (callback) => {
      db.get('SELECT COUNT(*) as count FROM shareholder_benefits', (err, row) => {
        callback(err, row?.count);
      });
    });
    
    // テスト3: 価格履歴数カウント
    await measureTime('  価格履歴数取得', (callback) => {
      db.get('SELECT COUNT(*) as count FROM price_history', (err, row) => {
        callback(err, row?.count);
      });
    });
    
    console.log('\n=== 検索クエリ（最適化前の複雑な結合） ===');
    
    // テスト4: 複雑な結合クエリ（最適化前）
    await measureTime('  複雑結合クエリ（最適化前）', (callback) => {
      const sql = `
        SELECT 
          s.code,
          s.name,
          s.japanese_name,
          ph.price,
          ph.dividend_yield,
          COUNT(DISTINCT sb.id) as benefit_count,
          SUM(sb.monetary_value) as total_benefit_value
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT stock_code, price, dividend_yield, annual_dividend, data_source
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        GROUP BY s.code
        LIMIT 100
      `;
      db.all(sql, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    console.log('\n=== 検索クエリ（最新価格テーブル使用） ===');
    
    // テスト5: 最新価格テーブルを使った最適化クエリ
    await measureTime('  最適化済み結合クエリ', (callback) => {
      const sql = `
        SELECT 
          s.code,
          s.name,
          s.japanese_name,
          lp.price,
          lp.dividend_yield,
          COUNT(DISTINCT sb.id) as benefit_count,
          SUM(sb.monetary_value) as total_benefit_value
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN latest_prices lp ON s.code = lp.stock_code
        GROUP BY s.code
        LIMIT 100
      `;
      db.all(sql, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    console.log('\n=== 特定検索クエリ ===');
    
    // テスト6: 銘柄名検索
    await measureTime('  銘柄名検索', (callback) => {
      db.all(`
        SELECT code, name, japanese_name 
        FROM stocks 
        WHERE name LIKE '%銀行%' OR japanese_name LIKE '%銀行%'
        LIMIT 50
      `, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    // テスト7: 優待種別検索
    await measureTime('  優待種別検索', (callback) => {
      db.all(`
        SELECT DISTINCT stock_code, benefit_type, monetary_value
        FROM shareholder_benefits 
        WHERE benefit_type LIKE '%食事%'
        LIMIT 50
      `, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    // テスト8: RSI検索
    await measureTime('  RSI検索', (callback) => {
      db.all(`
        SELECT code, name, rsi, rsi28
        FROM stocks 
        WHERE rsi IS NOT NULL AND rsi < 30
        LIMIT 50
      `, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    console.log('\n=== インデックス効果テスト ===');
    
    // テスト9: 権利月でのフィルタリング
    await measureTime('  権利月フィルタ', (callback) => {
      db.all(`
        SELECT s.code, s.name, sb.ex_rights_month, sb.monetary_value
        FROM stocks s
        JOIN shareholder_benefits sb ON s.code = sb.stock_code
        WHERE sb.ex_rights_month IN (3, 9)
        ORDER BY sb.monetary_value DESC
        LIMIT 100
      `, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    // テスト10: 最小株数での並び替え
    await measureTime('  最小株数ソート', (callback) => {
      db.all(`
        SELECT s.code, s.name, sb.min_shares, sb.monetary_value
        FROM stocks s
        JOIN shareholder_benefits sb ON s.code = sb.stock_code
        WHERE sb.min_shares <= 1000
        ORDER BY sb.min_shares ASC
        LIMIT 100
      `, (err, rows) => {
        callback(err, rows?.length);
      });
    });
    
    console.log('\n=== データベース統計 ===');
    
    // データベースサイズ
    const stats = fs.statSync(join(__dirname, 'db/yuutai.db'));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  データベースサイズ: ${sizeMB} MB`);
    
    // インデックス数確認
    await measureTime('  インデックス数確認', (callback) => {
      db.all(`
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `, (err, rows) => {
        if (!err && rows) {
          console.log('\n  作成済みインデックス:');
          rows.forEach(row => {
            console.log(`    - ${row.name}`);
          });
        }
        callback(err, rows?.length);
      });
    });
    
    console.log('\n✅ パフォーマンステスト完了');
    
  } catch (error) {
    console.error('❌ テストエラー:', error);
  } finally {
    db.close();
  }
}

runPerformanceTests();