import { Database } from './database.js';

const db = new Database();

// 優待データの問題を修正するスクリプト
async function fixBenefitDataIssues() {
  console.log('🔧 優待データの問題修正を開始...\n');
  
  try {
    // 1. 重複データの削除
    console.log('1️⃣ 重複データの削除...');
    const deleteDuplicates = await new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM shareholder_benefits 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM shareholder_benefits 
          GROUP BY stock_code, benefit_type, description, min_shares, monetary_value
        )
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   🗑️  ${deleteDuplicates}件の重複データを削除しました`);
    
    // 2. 異常に高い価値の優待を調査・修正
    console.log('\n2️⃣ 異常な優待価値の調査・修正...');
    const highValueBenefits = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, stock_code, benefit_type, description, monetary_value, min_shares
        FROM shareholder_benefits 
        WHERE monetary_value > 50000
        ORDER BY monetary_value DESC
      `;
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`   💰 ${highValueBenefits.length}件の高額優待を発見:`);
    
    let fixedCount = 0;
    for (const benefit of highValueBenefits) {
      console.log(`      ${benefit.stock_code}: ${benefit.benefit_type} - ¥${benefit.monetary_value.toLocaleString()}`);
      console.log(`         内容: ${benefit.description.substring(0, 100)}...`);
      
      // 宿泊券などの高額優待の適正価格を設定
      let adjustedValue = benefit.monetary_value;
      
      if (benefit.description.includes('宿泊') || benefit.description.includes('ホテル')) {
        // 宿泊券は一般的に1泊10,000円程度に調整
        if (benefit.monetary_value > 30000) {
          adjustedValue = 10000;
          fixedCount++;
        }
      } else if (benefit.description.includes('入学金') && benefit.monetary_value < 20000) {
        // 入学金免除は実際の価値として妥当
        adjustedValue = benefit.monetary_value;
      } else if (benefit.monetary_value > 20000) {
        // その他の高額優待は適正価格に調整
        adjustedValue = Math.min(benefit.monetary_value, 5000);
        fixedCount++;
      }
      
      if (adjustedValue !== benefit.monetary_value) {
        await new Promise((resolve, reject) => {
          const updateSql = `UPDATE shareholder_benefits SET monetary_value = ? WHERE id = ?`;
          db.db.run(updateSql, [adjustedValue, benefit.id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`         修正: ¥${benefit.monetary_value.toLocaleString()} → ¥${adjustedValue.toLocaleString()}`);
      }
    }
    console.log(`   ✅ ${fixedCount}件の価値を修正しました`);
    
    // 3. 最小株数の統一（1株単位での取引銘柄の修正）
    console.log('\n3️⃣ 最小株数の統一...');
    const unifyMinShares = await new Promise((resolve, reject) => {
      const sql = `
        UPDATE shareholder_benefits 
        SET min_shares = CASE
          WHEN min_shares = 1 THEN 100
          ELSE min_shares
        END
        WHERE stock_code IN (
          SELECT DISTINCT stock_code 
          FROM shareholder_benefits 
          WHERE min_shares = 1
          AND stock_code NOT IN ('2464', '9980')  -- 特殊な銘柄は除外
        )
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   📊 ${unifyMinShares}件の最小株数を100株に統一しました`);
    
    // 4. 空の説明文や異常なデータの削除
    console.log('\n4️⃣ 不正なデータの削除...');
    const deleteInvalidData = await new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM shareholder_benefits 
        WHERE description = '' 
        OR description IS NULL
        OR monetary_value < 0
        OR min_shares <= 0
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   🗑️  ${deleteInvalidData}件の不正なデータを削除しました`);
    
    // 5. データ統計の表示
    console.log('\n📊 修正後のデータ統計:');
    const stats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_benefits,
          AVG(monetary_value) as avg_value,
          MAX(monetary_value) as max_value,
          MIN(monetary_value) as min_value,
          COUNT(DISTINCT stock_code) as stock_count
        FROM shareholder_benefits
      `;
      db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`   総優待件数: ${stats.total_benefits.toLocaleString()}件`);
    console.log(`   対象銘柄数: ${stats.stock_count.toLocaleString()}銘柄`);
    console.log(`   平均優待価値: ¥${Math.round(stats.avg_value).toLocaleString()}`);
    console.log(`   最大優待価値: ¥${stats.max_value.toLocaleString()}`);
    console.log(`   最小優待価値: ¥${stats.min_value.toLocaleString()}`);
    
    console.log('\n✅ 優待データの修正が完了しました！');
    
  } catch (error) {
    console.error('❌ 修正エラー:', error.message);
  }
}

fixBenefitDataIssues();