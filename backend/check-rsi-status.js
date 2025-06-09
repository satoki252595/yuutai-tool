import { Database } from './database.js';

// RSIデータの状況を確認するスクリプト
async function checkRSIStatus() {
  const db = new Database();
  
  console.log('=== RSIデータ状況確認 ===');
  
  try {
    // 価格履歴のある銘柄数を確認
    const stocksWithHistory = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT stock_code, COUNT(*) as history_count
        FROM price_history
        GROUP BY stock_code
        HAVING history_count >= 15
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`\n価格履歴が15件以上ある銘柄: ${stocksWithHistory.length}件`);
    
    // 価格履歴の分布を確認
    const distribution = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          CASE 
            WHEN count < 15 THEN '0-14件'
            WHEN count < 30 THEN '15-29件'
            WHEN count < 60 THEN '30-59件'
            ELSE '60件以上'
          END as range,
          COUNT(*) as stock_count
        FROM (
          SELECT stock_code, COUNT(*) as count
          FROM price_history
          GROUP BY stock_code
        )
        GROUP BY range
        ORDER BY range
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n価格履歴の分布:');
    distribution.forEach(row => {
      console.log(`  ${row.range}: ${row.stock_count}銘柄`);
    });
    
    // サンプル銘柄の詳細
    const samples = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT ph.stock_code, s.name, COUNT(*) as history_count
        FROM price_history ph
        JOIN stocks s ON ph.stock_code = s.code
        GROUP BY ph.stock_code
        HAVING history_count >= 30
        ORDER BY RANDOM()
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n価格履歴が豊富な銘柄サンプル:');
    samples.forEach(row => {
      console.log(`  ${row.stock_code}: ${row.name} (${row.history_count}件)`);
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
checkRSIStatus().catch(console.error);