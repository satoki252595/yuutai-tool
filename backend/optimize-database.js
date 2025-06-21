#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 データベース最適化を開始します...');

const db = new sqlite3.Database(join(__dirname, 'db/yuutai.db'));

// SQLファイルを実行する関数
function executeSQLFile(filePath) {
  return new Promise((resolve, reject) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function optimize() {
  try {
    // 1. インデックスの最適化
    console.log('📊 インデックスを最適化中...');
    await executeSQLFile(join(__dirname, 'db/optimize-indexes.sql'));
    
    // 2. 最新価格テーブルの作成
    console.log('💰 最新価格テーブルを作成中...');
    await executeSQLFile(join(__dirname, 'db/create-latest-prices.sql'));
    
    // 3. 統計情報の更新
    console.log('📈 統計情報を更新中...');
    await new Promise((resolve, reject) => {
      db.exec('ANALYZE;', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 4. データベースサイズの確認
    const stats = fs.statSync(join(__dirname, 'db/yuutai.db'));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`💾 データベースサイズ: ${sizeMB} MB`);
    
    console.log('✅ データベース最適化が完了しました！');
    
    // パフォーマンステスト（高精度）
    console.log('\n🧪 パフォーマンステスト中...');
    
    // テスト1: 全銘柄取得
    const startTime1 = process.hrtime.bigint();
    await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
        const endTime1 = process.hrtime.bigint();
        const elapsed1 = Number(endTime1 - startTime1) / 1000000; // ナノ秒→ミリ秒
        console.log(`  - 全銘柄カウント: ${row.count}件 (${elapsed1.toFixed(3)}ms)`);
        resolve();
      });
    });
    
    // テスト2: 複雑な検索クエリ（最適化前）
    const startTime2 = process.hrtime.bigint();
    await new Promise((resolve) => {
      db.all(`
        SELECT 
          s.code, s.name, ph.price,
          COUNT(DISTINCT sb.id) as benefit_count
        FROM stocks s 
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT stock_code, price
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE s.name LIKE '%銀行%' OR s.japanese_name LIKE '%銀行%'
        GROUP BY s.code
        LIMIT 20
      `, (err, rows) => {
        const endTime2 = process.hrtime.bigint();
        const elapsed2 = Number(endTime2 - startTime2) / 1000000;
        console.log(`  - 複雑検索（最適化前）: ${rows.length}件ヒット (${elapsed2.toFixed(3)}ms)`);
        resolve();
      });
    });
    
    // テスト3: 最適化済み検索クエリ
    const startTime3 = process.hrtime.bigint();
    await new Promise((resolve) => {
      db.all(`
        SELECT 
          s.code, s.name, lp.price,
          COUNT(DISTINCT sb.id) as benefit_count
        FROM stocks s 
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN latest_prices lp ON s.code = lp.stock_code 
        WHERE s.name LIKE '%銀行%' OR s.japanese_name LIKE '%銀行%'
        GROUP BY s.code
        LIMIT 20
      `, (err, rows) => {
        const endTime3 = process.hrtime.bigint();
        const elapsed3 = Number(endTime3 - startTime3) / 1000000;
        console.log(`  - 複雑検索（最適化後）: ${rows.length}件ヒット (${elapsed3.toFixed(3)}ms)`);
        resolve();
      });
    });
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    db.close();
  }
}

optimize();