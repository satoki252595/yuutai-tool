import { Database } from './database.js';

// RSI計算アプローチを更新するスクリプト
async function updateRSIApproach() {
  const db = new Database();
  
  console.log('=== RSI計算アプローチの分析 ===');
  
  try {
    // 各期間でRSI計算可能な銘柄数を確認
    const analysis = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          COUNT(DISTINCT CASE WHEN cnt >= 15 THEN stock_code END) as rsi14,
          COUNT(DISTINCT CASE WHEN cnt >= 21 THEN stock_code END) as rsi20,
          COUNT(DISTINCT CASE WHEN cnt >= 22 THEN stock_code END) as rsi21,
          COUNT(DISTINCT CASE WHEN cnt >= 23 THEN stock_code END) as rsi22,
          COUNT(DISTINCT CASE WHEN cnt >= 29 THEN stock_code END) as rsi28,
          COUNT(DISTINCT stock_code) as total
        FROM (
          SELECT stock_code, COUNT(*) as cnt 
          FROM price_history 
          GROUP BY stock_code
        )
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`全銘柄数: ${analysis.total}`);
    console.log(`RSI(14)計算可能: ${analysis.rsi14}銘柄 (${(analysis.rsi14/analysis.total*100).toFixed(1)}%)`);
    console.log(`RSI(20)計算可能: ${analysis.rsi20}銘柄 (${(analysis.rsi20/analysis.total*100).toFixed(1)}%)`);
    console.log(`RSI(21)計算可能: ${analysis.rsi21}銘柄 (${(analysis.rsi21/analysis.total*100).toFixed(1)}%)`);
    console.log(`RSI(22)計算可能: ${analysis.rsi22}銘柄 (${(analysis.rsi22/analysis.total*100).toFixed(1)}%)`);
    console.log(`RSI(28)計算可能: ${analysis.rsi28}銘柄 (${(analysis.rsi28/analysis.total*100).toFixed(1)}%)`);
    
    // 価格履歴の件数分布
    const distribution = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          cnt as history_count,
          COUNT(*) as stock_count
        FROM (
          SELECT stock_code, COUNT(*) as cnt 
          FROM price_history 
          GROUP BY stock_code
        )
        GROUP BY cnt
        ORDER BY cnt DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n価格履歴件数の分布（上位）:');
    distribution.slice(0, 10).forEach(row => {
      console.log(`  ${row.history_count}件: ${row.stock_count}銘柄`);
    });
    
    // 推奨事項
    console.log('\n=== 推奨事項 ===');
    console.log('現在のデータ状況から、以下のアプローチを推奨します：');
    console.log('1. RSI(14): 短期の売買タイミング指標として使用');
    console.log('2. RSI(21): 中期の売買タイミング指標として使用（RSI(28)の代替）');
    console.log('   - 21日間は3週間分のデータで、中期トレンドを十分に反映');
    console.log('   - 現在のデータでもより多くの銘柄で計算可能');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
updateRSIApproach().catch(console.error);