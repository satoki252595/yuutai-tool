import { Database } from './database.js';

const db = new Database();

// 総合利回り上位銘柄のテストと検証
async function testTopYieldStocks() {
  console.log('🔍 総合利回り上位銘柄の精度テスト開始...\n');
  
  try {
    // 総合利回り上位10銘柄を取得
    const topYieldStocks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          s.code,
          s.name,
          COALESCE(s.japanese_name, s.name) as display_name,
          ph.price,
          ph.dividend_yield,
          ph.annual_dividend,
          COUNT(DISTINCT sb.id) as benefit_count,
          SUM(sb.monetary_value) as total_benefit_value,
          MIN(sb.min_shares) as min_shares,
          -- 配当利回り計算
          COALESCE(ph.dividend_yield, 0) as calculated_dividend_yield,
          -- 優待利回り計算
          CASE 
            WHEN ph.price > 0 AND MIN(sb.min_shares) > 0 THEN
              (SUM(sb.monetary_value) * 1.0 / (ph.price * MIN(sb.min_shares))) * 100
            ELSE 0
          END as calculated_benefit_yield,
          -- 総合利回り計算
          COALESCE(ph.dividend_yield, 0) + 
          CASE 
            WHEN ph.price > 0 AND MIN(sb.min_shares) > 0 THEN
              (SUM(sb.monetary_value) * 1.0 / (ph.price * MIN(sb.min_shares))) * 100
            ELSE 0
          END as total_yield
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT stock_code, price, dividend_yield, annual_dividend
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE ph.price > 0 AND sb.monetary_value > 0
        GROUP BY s.code, s.name, s.japanese_name, ph.price, ph.dividend_yield, ph.annual_dividend
        HAVING total_yield > 0
        ORDER BY total_yield DESC
        LIMIT 10
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('📊 総合利回り上位10銘柄:');
    console.log('='.repeat(120));
    
    for (let i = 0; i < topYieldStocks.length; i++) {
      const stock = topYieldStocks[i];
      
      console.log(`${i + 1}. ${stock.code} - ${stock.display_name}`);
      console.log(`   株価: ¥${stock.price?.toLocaleString() || '不明'}`);
      console.log(`   配当利回り: ${stock.calculated_dividend_yield?.toFixed(2) || '0.00'}%`);
      console.log(`   優待利回り: ${stock.calculated_benefit_yield?.toFixed(2) || '0.00'}%`);
      console.log(`   総合利回り: ${stock.total_yield?.toFixed(2) || '0.00'}%`);
      console.log(`   優待件数: ${stock.benefit_count}件, 総価値: ¥${stock.total_benefit_value?.toLocaleString()}`);
      console.log(`   最小株数: ${stock.min_shares?.toLocaleString()}株`);
      
      // 手動検証計算
      const investmentAmount = stock.price * stock.min_shares;
      const manualBenefitYield = (stock.total_benefit_value / investmentAmount) * 100;
      const manualTotalYield = (stock.calculated_dividend_yield || 0) + manualBenefitYield;
      
      console.log(`   手動計算: 優待利回り ${manualBenefitYield.toFixed(2)}%, 総合利回り ${manualTotalYield.toFixed(2)}%`);
      
      // 差異チェック
      const benefitYieldDiff = Math.abs(manualBenefitYield - stock.calculated_benefit_yield);
      const totalYieldDiff = Math.abs(manualTotalYield - stock.total_yield);
      
      if (benefitYieldDiff > 0.01 || totalYieldDiff > 0.01) {
        console.log(`   ⚠️  計算差異: 優待利回り差 ${benefitYieldDiff.toFixed(4)}%, 総合利回り差 ${totalYieldDiff.toFixed(4)}%`);
      } else {
        console.log(`   ✅ 計算正確`);
      }
      
      // 異常に高い利回りの警告
      if (stock.total_yield > 20) {
        console.log(`   🚨 異常に高い利回りです！スクレイピング元との照合が必要です`);
      } else if (stock.total_yield > 10) {
        console.log(`   📈 高利回り銘柄です`);
      }
      
      console.log('');
    }
    
    // 詳細な優待情報を上位3銘柄について表示
    console.log('\n🔍 上位3銘柄の詳細優待情報:');
    console.log('='.repeat(120));
    
    for (let i = 0; i < Math.min(3, topYieldStocks.length); i++) {
      const stock = topYieldStocks[i];
      
      const benefits = await new Promise((resolve, reject) => {
        const sql = `
          SELECT benefit_type, description, monetary_value, min_shares, ex_rights_month
          FROM shareholder_benefits 
          WHERE stock_code = ?
          ORDER BY min_shares, ex_rights_month
        `;
        db.db.all(sql, [stock.code], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      console.log(`\n【${i + 1}位】${stock.code} - ${stock.display_name}`);
      console.log(`株価: ¥${stock.price?.toLocaleString()}, 総合利回り: ${stock.total_yield?.toFixed(2)}%`);
      console.log('優待詳細:');
      
      benefits.forEach((benefit, idx) => {
        console.log(`   ${idx + 1}. ${benefit.benefit_type}: ${benefit.description}`);
        console.log(`      価値: ¥${benefit.monetary_value?.toLocaleString()}, 最小株数: ${benefit.min_shares}株, 権利月: ${benefit.ex_rights_month}月`);
      });
      
      // 投資額と利回り詳細
      const investmentAmount = stock.price * stock.min_shares;
      console.log(`\n   投資分析:`);
      console.log(`   必要投資額: ¥${investmentAmount?.toLocaleString()} (¥${stock.price?.toLocaleString()} × ${stock.min_shares?.toLocaleString()}株)`);
      console.log(`   年間優待価値: ¥${stock.total_benefit_value?.toLocaleString()}`);
      console.log(`   年間配当金: ¥${((stock.annual_dividend || 0) * stock.min_shares)?.toLocaleString()}`);
      console.log(`   配当利回り: ${stock.calculated_dividend_yield?.toFixed(2)}%`);
      console.log(`   優待利回り: ${stock.calculated_benefit_yield?.toFixed(2)}%`);
      console.log(`   総合利回り: ${stock.total_yield?.toFixed(2)}%`);
    }
    
    // 利回り分布の統計
    console.log('\n📊 利回り分布統計:');
    const yieldStats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_stocks,
          AVG(total_yield) as avg_total_yield,
          MIN(total_yield) as min_total_yield,
          MAX(total_yield) as max_total_yield,
          COUNT(CASE WHEN total_yield > 10 THEN 1 END) as high_yield_count,
          COUNT(CASE WHEN total_yield > 5 AND total_yield <= 10 THEN 1 END) as medium_yield_count,
          COUNT(CASE WHEN total_yield <= 5 THEN 1 END) as low_yield_count
        FROM (
          SELECT 
            COALESCE(ph.dividend_yield, 0) + 
            CASE 
              WHEN ph.price > 0 AND MIN(sb.min_shares) > 0 THEN
                (SUM(sb.monetary_value) * 1.0 / (ph.price * MIN(sb.min_shares))) * 100
              ELSE 0
            END as total_yield
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
          HAVING total_yield > 0
        )
      `;
      
      db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`   対象銘柄数: ${yieldStats.total_stocks?.toLocaleString()}銘柄`);
    console.log(`   平均総合利回り: ${yieldStats.avg_total_yield?.toFixed(2)}%`);
    console.log(`   最低総合利回り: ${yieldStats.min_total_yield?.toFixed(2)}%`);
    console.log(`   最高総合利回り: ${yieldStats.max_total_yield?.toFixed(2)}%`);
    console.log(`   高利回り銘柄(10%超): ${yieldStats.high_yield_count}銘柄`);
    console.log(`   中利回り銘柄(5-10%): ${yieldStats.medium_yield_count}銘柄`);
    console.log(`   通常利回り銘柄(5%以下): ${yieldStats.low_yield_count}銘柄`);
    
    console.log('\n✅ 総合利回りテストが完了しました！');
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error.message);
  }
}

testTopYieldStocks();