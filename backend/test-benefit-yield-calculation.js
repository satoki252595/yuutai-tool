import { Database } from './database.js';

const db = new Database();

// 優待利回り計算のテストと検証
async function testBenefitYieldCalculation() {
  console.log('🧪 優待利回り計算の精度テスト開始...\n');
  
  try {
    // サンプルデータを確認
    const sampleStocks = await db.getStocksWithBenefits('9999');
    if (sampleStocks.length > 0) {
      const sampleStock = sampleStocks[0];
      console.log('📊 サンプル株式データ:');
      console.log(`   銘柄: ${sampleStock.code} - ${sampleStock.display_name}`);
      console.log(`   株価: ¥${sampleStock.price?.toLocaleString() || '未設定'}`);
      console.log(`   優待件数: ${sampleStock.benefit_count}件`);
      console.log(`   総優待価値: ¥${sampleStock.total_benefit_value?.toLocaleString() || '0'}`);
      console.log('');
      
      // 詳細な優待情報を取得
      const benefits = await db.getBenefitsByStockCode('9999');
      if (benefits.length > 0) {
        console.log('🎁 優待詳細情報:');
        benefits.forEach((benefit, index) => {
          console.log(`   ${index + 1}. ${benefit.benefit_type}: ${benefit.description}`);
          console.log(`      最小株数: ${benefit.min_shares}株, 価値: ¥${benefit.monetary_value?.toLocaleString() || '0'}`);
        });
        console.log('');
        
        // 手動で利回り計算を検証
        if (sampleStock.price && benefits.length > 0) {
          const minShares = Math.min(...benefits.map(b => b.min_shares));
          const totalBenefitValue = benefits.reduce((sum, benefit) => {
            return sum + (benefit.monetary_value || 0);
          }, 0);
          
          const investmentAmount = sampleStock.price * minShares;
          const calculatedBenefitYield = (totalBenefitValue / investmentAmount) * 100;
          
          console.log('🔍 手動計算結果:');
          console.log(`   最小購入株数: ${minShares}株`);
          console.log(`   総優待価値: ¥${totalBenefitValue.toLocaleString()}`);
          console.log(`   必要投資額: ¥${investmentAmount.toLocaleString()} (¥${sampleStock.price.toLocaleString()} × ${minShares.toLocaleString()}株)`);
          console.log(`   計算利回り: ${calculatedBenefitYield.toFixed(2)}%`);
          
          if (calculatedBenefitYield > 20) {
            console.log('⚠️  異常に高い利回りです！検証が必要です');
          } else if (calculatedBenefitYield > 10) {
            console.log('📈 高い利回りです');
          } else {
            console.log('✅ 妥当な利回りです');
          }
        }
      }
    }
    
    // 実際のデータで異常に高い利回りを調査
    console.log('\n🔍 異常に高い優待利回りの調査...');
    const highYieldStocks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT s.code, s.name, ph.price, ph.dividend_yield,
               GROUP_CONCAT(sb.benefit_type || ': ' || sb.description) as benefits,
               MIN(sb.min_shares) as min_shares,
               SUM(sb.monetary_value) as total_benefit_value
        FROM stocks s
        LEFT JOIN price_history ph ON s.code = ph.stock_code
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        WHERE ph.price > 0 AND sb.monetary_value > 0
        GROUP BY s.code, s.name, ph.price, ph.dividend_yield
        HAVING (SUM(sb.monetary_value) / (ph.price * MIN(sb.min_shares)) * 100) > 10
        ORDER BY (SUM(sb.monetary_value) / (ph.price * MIN(sb.min_shares)) * 100) DESC
        LIMIT 10
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (highYieldStocks.length > 0) {
      console.log('📈 優待利回り10%超の銘柄:');
      highYieldStocks.forEach((stock, index) => {
        const benefitYield = (stock.total_benefit_value / (stock.price * stock.min_shares)) * 100;
        console.log(`   ${index + 1}. ${stock.code} - ${stock.name}`);
        console.log(`      株価: ¥${stock.price?.toLocaleString()}, 最小株数: ${stock.min_shares?.toLocaleString()}株`);
        console.log(`      優待価値: ¥${stock.total_benefit_value?.toLocaleString()}`);
        console.log(`      優待利回り: ${benefitYield.toFixed(2)}%`);
        console.log(`      優待内容: ${stock.benefits}`);
        console.log('');
      });
    } else {
      console.log('✅ 10%超の異常な優待利回りは見つかりませんでした');
    }
    
    // データベースの整合性チェック
    console.log('🔍 データベース整合性チェック...');
    const integrityIssues = await new Promise((resolve, reject) => {
      const sql = `
        SELECT s.code, s.name, 
               COUNT(DISTINCT ph.id) as price_records,
               COUNT(DISTINCT sb.id) as benefit_records,
               MIN(sb.min_shares) as min_min_shares,
               MAX(sb.min_shares) as max_min_shares,
               SUM(sb.monetary_value) as total_benefit_value
        FROM stocks s
        LEFT JOIN price_history ph ON s.code = ph.stock_code
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        GROUP BY s.code, s.name
        HAVING price_records = 0 OR benefit_records = 0 OR min_min_shares != max_min_shares
        LIMIT 10
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (integrityIssues.length > 0) {
      console.log('⚠️  データ整合性の問題が見つかりました:');
      integrityIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.code} - ${issue.name}`);
        console.log(`      株価レコード: ${issue.price_records}件`);
        console.log(`      優待レコード: ${issue.benefit_records}件`);
        if (issue.min_min_shares !== issue.max_min_shares) {
          console.log(`      最小株数の不整合: ${issue.min_min_shares} ~ ${issue.max_min_shares}`);
        }
      });
    } else {
      console.log('✅ データ整合性に問題なし');
    }
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error.message);
  }
}

testBenefitYieldCalculation();