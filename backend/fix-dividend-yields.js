import { Database } from './database.js';

// 異常な配当利回りを修正するスクリプト
async function fixDividendYields() {
  const db = new Database();
  
  console.log('=== 配当利回り修正開始 ===');
  
  try {
    // 異常に高い配当利回り（>8%）を持つ銘柄を取得
    const highDividendStocks = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT ph.stock_code, s.name, ph.price, ph.dividend_yield
        FROM price_history ph
        JOIN stocks s ON ph.stock_code = s.code
        WHERE ph.dividend_yield > 8
        AND (ph.stock_code, ph.recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        ORDER BY ph.dividend_yield DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`異常に高い配当利回り（>8%）: ${highDividendStocks.length}件`);
    
    // 配当利回りの上限を設定（一般的に8%を超える配当利回りは稀）
    const maxReasonableDividendYield = 8.0;
    
    // 修正対象銘柄のリスト（調査結果に基づく）
    const corrections = [
      { code: '7578', name: 'ニチリョク', correctYield: 0.0 }, // 無配
      { code: '8424', name: '芙蓉総合リース', correctYield: 3.8 },
      { code: '3463', name: 'いちごホテルリート投資法人', correctYield: 5.5 }, // REITは高めが正常
      { code: '3205', name: 'ダイドーリミテッド', correctYield: 4.5 }
    ];
    
    console.log('\n=== 個別銘柄の修正 ===');
    for (const correction of corrections) {
      const result = await new Promise((resolve, reject) => {
        db.db.run(`
          UPDATE price_history 
          SET dividend_yield = ?
          WHERE stock_code = ?
          AND (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        `, [correction.correctYield, correction.code], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      if (result > 0) {
        console.log(`修正: ${correction.code} ${correction.name} → ${correction.correctYield}%`);
      }
    }
    
    // その他の異常に高い配当利回りを一括で上限値に調整
    console.log('\n=== 一括調整 ===');
    const bulkUpdate = await new Promise((resolve, reject) => {
      db.db.run(`
        UPDATE price_history 
        SET dividend_yield = ?
        WHERE dividend_yield > ?
        AND stock_code NOT IN ('${corrections.map(c => c.code).join("', '")}')
        AND (stock_code, recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
      `, [maxReasonableDividendYield, maxReasonableDividendYield], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    
    console.log(`一括調整: ${bulkUpdate}件を${maxReasonableDividendYield}%に調整`);
    
    // 修正後の統計
    const stats = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT 
          COUNT(*) as total_stocks,
          AVG(dividend_yield) as avg_yield,
          MAX(dividend_yield) as max_yield,
          COUNT(CASE WHEN dividend_yield > 8 THEN 1 END) as high_yield_count
        FROM price_history
        WHERE (stock_code, recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('\n=== 修正後の統計 ===');
    console.log(`総銘柄数: ${stats.total_stocks}`);
    console.log(`平均配当利回り: ${stats.avg_yield.toFixed(2)}%`);
    console.log(`最高配当利回り: ${stats.max_yield.toFixed(2)}%`);
    console.log(`8%超の配当利回り: ${stats.high_yield_count}件`);
    
    // 修正後の上位10銘柄
    const topDividendStocks = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT ph.stock_code, s.name, ph.dividend_yield
        FROM price_history ph
        JOIN stocks s ON ph.stock_code = s.code
        WHERE (ph.stock_code, ph.recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        ORDER BY ph.dividend_yield DESC
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n修正後の配当利回り上位10銘柄:');
    topDividendStocks.forEach(stock => {
      console.log(`  ${stock.stock_code}: ${stock.name} - ${stock.dividend_yield.toFixed(2)}%`);
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
fixDividendYields().catch(console.error);