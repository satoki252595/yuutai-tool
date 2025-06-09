import { Database } from './database.js';

// 全データの品質を包括的に監査するスクリプト
async function comprehensiveDataAudit() {
  const db = new Database();
  
  console.log('=== 包括的データ品質監査 ===');
  
  try {
    // 1. 基本統計情報
    console.log('\n1. 基本統計情報');
    const basicStats = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT 
          COUNT(DISTINCT s.code) as total_stocks,
          COUNT(DISTINCT sb.stock_code) as stocks_with_benefits,
          COUNT(*) as total_benefits,
          COUNT(DISTINCT ph.stock_code) as stocks_with_price
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT DISTINCT stock_code FROM price_history
        ) ph ON s.code = ph.stock_code
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`総銘柄数: ${basicStats.total_stocks}`);
    console.log(`優待情報あり: ${basicStats.stocks_with_benefits}銘柄`);
    console.log(`総優待情報数: ${basicStats.total_benefits}件`);
    console.log(`株価情報あり: ${basicStats.stocks_with_price}銘柄`);
    
    // 2. 配当利回りの分析
    console.log('\n2. 配当利回り分析');
    const dividendAnalysis = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          CASE 
            WHEN dividend_yield = 0 THEN '無配'
            WHEN dividend_yield < 1 THEN '1%未満'
            WHEN dividend_yield < 2 THEN '1-2%'
            WHEN dividend_yield < 3 THEN '2-3%'
            WHEN dividend_yield < 4 THEN '3-4%'
            WHEN dividend_yield < 5 THEN '4-5%'
            WHEN dividend_yield < 6 THEN '5-6%'
            WHEN dividend_yield < 8 THEN '6-8%'
            ELSE '8%以上'
          END as range,
          COUNT(*) as count
        FROM price_history
        WHERE (stock_code, recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        GROUP BY 1
        ORDER BY 
          CASE 
            WHEN dividend_yield = 0 THEN 0
            WHEN dividend_yield < 1 THEN 1
            WHEN dividend_yield < 2 THEN 2
            WHEN dividend_yield < 3 THEN 3
            WHEN dividend_yield < 4 THEN 4
            WHEN dividend_yield < 5 THEN 5
            WHEN dividend_yield < 6 THEN 6
            WHEN dividend_yield < 8 THEN 7
            ELSE 8
          END
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    dividendAnalysis.forEach(row => {
      console.log(`  ${row.range}: ${row.count}銘柄`);
    });
    
    // 3. 優待利回りの分析
    console.log('\n3. 優待利回り分析（計算値）');
    const benefitYieldAnalysis = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          s.code,
          s.name,
          ph.price,
          MIN(sb.min_shares) as min_shares,
          SUM(CASE WHEN sb.ex_rights_month THEN sb.monetary_value ELSE 0 END) as annual_benefit_value,
          CASE 
            WHEN ph.price > 0 AND MIN(sb.min_shares) > 0 THEN
              (SUM(CASE WHEN sb.ex_rights_month THEN sb.monetary_value ELSE 0 END) * 100.0) / (ph.price * MIN(sb.min_shares))
            ELSE 0
          END as calculated_benefit_yield
        FROM stocks s
        JOIN shareholder_benefits sb ON s.code = sb.stock_code
        JOIN (
          SELECT stock_code, price
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE ph.price > 0
        GROUP BY s.code
        HAVING calculated_benefit_yield > 15
        ORDER BY calculated_benefit_yield DESC
        LIMIT 20
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('優待利回り15%以上の銘柄（要確認）:');
    benefitYieldAnalysis.forEach(row => {
      console.log(`  ${row.code}: ${row.name} - ${row.calculated_benefit_yield.toFixed(2)}% (価値:${row.annual_benefit_value}円, 株価:${row.price}円, 最小:${row.min_shares}株)`);
    });
    
    // 4. 株価の異常値チェック
    console.log('\n4. 株価異常値チェック');
    const priceAnomalies = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT ph.stock_code, s.name, ph.price
        FROM price_history ph
        JOIN stocks s ON ph.stock_code = s.code
        WHERE (ph.stock_code, ph.recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        AND (ph.price < 10 OR ph.price > 100000)
        ORDER BY ph.price DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('異常な株価（<10円 or >100,000円）:');
    priceAnomalies.forEach(row => {
      console.log(`  ${row.stock_code}: ${row.name} - ${row.price}円`);
    });
    
    // 5. 優待データの整合性チェック
    console.log('\n5. 優待データ整合性チェック');
    const benefitIntegrity = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          'monetary_value異常' as issue,
          COUNT(*) as count
        FROM shareholder_benefits
        WHERE monetary_value <= 0 OR monetary_value > 50000
        
        UNION ALL
        
        SELECT 
          'min_shares異常' as issue,
          COUNT(*) as count
        FROM shareholder_benefits
        WHERE min_shares <= 0 OR min_shares > 10000
        
        UNION ALL
        
        SELECT 
          'ex_rights_month異常' as issue,
          COUNT(*) as count
        FROM shareholder_benefits
        WHERE ex_rights_month < 1 OR ex_rights_month > 12
        
        UNION ALL
        
        SELECT 
          'description空' as issue,
          COUNT(*) as count
        FROM shareholder_benefits
        WHERE description IS NULL OR description = ''
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    benefitIntegrity.forEach(row => {
      console.log(`  ${row.issue}: ${row.count}件`);
    });
    
    // 6. 重複データチェック
    console.log('\n6. 重複データチェック');
    const duplicates = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT stock_code, description, min_shares, ex_rights_month, COUNT(*) as count
        FROM shareholder_benefits
        GROUP BY stock_code, description, min_shares, ex_rights_month
        HAVING count > 1
        ORDER BY count DESC
        LIMIT 10
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (duplicates.length > 0) {
      console.log('重複している優待データ:');
      duplicates.forEach(row => {
        console.log(`  ${row.stock_code}: ${row.count}件重複 - ${row.description.substring(0, 30)}...`);
      });
    } else {
      console.log('重複データなし');
    }
    
    // 7. 最新の更新状況
    console.log('\n7. データ更新状況');
    const updateStatus = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          '価格履歴' as data_type,
          MIN(recorded_at) as oldest,
          MAX(recorded_at) as newest,
          COUNT(DISTINCT stock_code) as stock_count
        FROM price_history
        
        UNION ALL
        
        SELECT 
          '株式情報' as data_type,
          MIN(updated_at) as oldest,
          MAX(updated_at) as newest,
          COUNT(*) as stock_count
        FROM stocks
        WHERE updated_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
          '優待情報' as data_type,
          MIN(created_at) as oldest,
          MAX(created_at) as newest,
          COUNT(DISTINCT stock_code) as stock_count
        FROM shareholder_benefits
        WHERE created_at IS NOT NULL
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    updateStatus.forEach(row => {
      console.log(`  ${row.data_type}: ${row.stock_count}銘柄 (${row.oldest} 〜 ${row.newest})`);
    });
    
    console.log('\n=== 監査完了 ===');
    console.log('\n推奨アクション:');
    if (benefitYieldAnalysis.length > 5) {
      console.log('❌ 優待利回りが15%を超える銘柄が多数存在 → 優待価値の再検証が必要');
    }
    if (priceAnomalies.length > 0) {
      console.log(`❌ 異常な株価の銘柄が${priceAnomalies.length}件存在 → 株価データの更新が必要`);
    }
    if (duplicates.length > 0) {
      console.log(`❌ 重複データが${duplicates.length}件存在 → 重複削除が必要`);
    }
    
    const benefitIntegrityIssues = benefitIntegrity.reduce((sum, row) => sum + row.count, 0);
    if (benefitIntegrityIssues > 0) {
      console.log(`❌ 優待データの整合性に${benefitIntegrityIssues}件の問題 → データクリーニングが必要`);
    }
    
    if (benefitYieldAnalysis.length <= 5 && priceAnomalies.length === 0 && duplicates.length === 0 && benefitIntegrityIssues === 0) {
      console.log('✅ 全体的なデータ品質は良好です');
    } else {
      console.log('\n再スクレイピングを推奨します。');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
comprehensiveDataAudit().catch(console.error);