import { Database } from './database.js';

const db = new Database();

async function finalYieldCheck() {
  console.log('🔍 最終利回りチェック...\n');
  
  try {
    const topStocks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          s.code, s.name, ph.price,
          ph.dividend_yield,
          SUM(sb.monetary_value) as total_benefit_value,
          MIN(sb.min_shares) as min_shares,
          COUNT(sb.id) as benefit_count,
          COALESCE(ph.dividend_yield, 0) + 
          (SUM(sb.monetary_value) * 1.0 / (ph.price * MIN(sb.min_shares))) * 100 as total_yield
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT stock_code, price, dividend_yield
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE ph.price > 0 AND sb.monetary_value > 0
        GROUP BY s.code, s.name, ph.price, ph.dividend_yield
        ORDER BY total_yield DESC
        LIMIT 5
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('📊 修正後の上位5銘柄:');
    topStocks.forEach((stock, idx) => {
      const investmentAmount = stock.price * stock.min_shares;
      const benefitYield = (stock.total_benefit_value / investmentAmount) * 100;
      
      console.log(`${idx + 1}. ${stock.code} - ${stock.name}`);
      console.log(`   株価: ¥${stock.price}, 投資額: ¥${investmentAmount.toLocaleString()}`);
      console.log(`   配当利回り: ${(stock.dividend_yield || 0).toFixed(2)}%`);
      console.log(`   優待利回り: ${benefitYield.toFixed(2)}%`);
      console.log(`   総合利回り: ${stock.total_yield.toFixed(2)}%`);
      console.log(`   優待価値: ¥${stock.total_benefit_value.toLocaleString()} (${stock.benefit_count}件)`);
      console.log('');
    });
    
    // 統計
    const stats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_stocks,
          AVG(total_yield) as avg_yield,
          MAX(total_yield) as max_yield,
          COUNT(CASE WHEN total_yield > 20 THEN 1 END) as very_high_count,
          COUNT(CASE WHEN total_yield > 10 AND total_yield <= 20 THEN 1 END) as high_count
        FROM (
          SELECT 
            COALESCE(ph.dividend_yield, 0) + 
            (SUM(sb.monetary_value) * 1.0 / (ph.price * MIN(sb.min_shares))) * 100 as total_yield
          FROM stocks s
          LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
          LEFT JOIN (
            SELECT stock_code, price, dividend_yield
            FROM price_history
            WHERE (stock_code, recorded_at) IN (
              SELECT stock_code, MAX(recorded_at)
              FROM price_history
              GROUP BY stock_code
            )
          ) ph ON s.code = ph.stock_code
          WHERE ph.price > 0 AND sb.monetary_value > 0
          GROUP BY s.code, ph.price, ph.dividend_yield
        )
      `;
      
      db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('📊 修正後の統計:');
    console.log(`   対象銘柄数: ${stats.total_stocks}銘柄`);
    console.log(`   平均総合利回り: ${stats.avg_yield?.toFixed(2)}%`);
    console.log(`   最高総合利回り: ${stats.max_yield?.toFixed(2)}%`);
    console.log(`   20%超の銘柄: ${stats.very_high_count}銘柄`);
    console.log(`   10-20%の銘柄: ${stats.high_count}銘柄`);
    
    if (stats.max_yield < 30) {
      console.log('\n✅ 利回り計算が現実的な範囲に修正されました！');
    } else {
      console.log('\n⚠️  まだ異常に高い利回り銘柄が存在します');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

finalYieldCheck();