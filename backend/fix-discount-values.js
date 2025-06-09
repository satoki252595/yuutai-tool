import { Database } from './database.js';

// 割引券・ポイントの優待価値を現実的な値に修正するスクリプト
async function fixDiscountValues() {
  const db = new Database();
  
  console.log('=== 割引券・ポイント優待価値修正 ===');
  
  try {
    // 異常に高い優待価値を持つ銘柄を修正
    const updates = [
      // 割引券は上限の10-20%程度の価値として計算
      { code: '2385', oldValue: 22000, newValue: 2200 }, // 20%割引券
      { code: '2385', oldValue: 33000, newValue: 3300 }, // 40%割引券
      { code: '7602', oldValue: 30000, newValue: 3000 }, // 30,000円相当→実質3,000円程度
      { code: '3070', oldValue: 10000, newValue: 1000 }, // 10,000ポイント→実質1,000円
      { code: '3070', oldValue: 20000, newValue: 2000 }, // 20,000ポイント
      { code: '3070', oldValue: 30000, newValue: 3000 }, // 30,000ポイント
      { code: '3070', oldValue: 40000, newValue: 4000 }, // 40,000ポイント
      { code: '3070', oldValue: 80000, newValue: 8000 }, // 80,000ポイント
      { code: '3070', oldValue: 100000, newValue: 10000 }, // 100,000ポイント
    ];
    
    let updatedCount = 0;
    
    for (const update of updates) {
      const result = await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE shareholder_benefits 
           SET monetary_value = ? 
           WHERE stock_code = ? AND monetary_value = ?`,
          [update.newValue, update.code, update.oldValue],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });
      
      if (result > 0) {
        updatedCount += result;
        console.log(`更新: ${update.code} - ${update.oldValue}円 → ${update.newValue}円 (${result}件)`);
      }
    }
    
    // その他の異常に高い優待価値（10,000円以上）も調整
    const highValueBenefits = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT DISTINCT stock_code, description, monetary_value 
         FROM shareholder_benefits 
         WHERE monetary_value > 10000 
         AND (description LIKE '%割引%' OR description LIKE '%ポイント%' OR description LIKE '%クーポン%')`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`\n高額優待（10,000円以上）: ${highValueBenefits.length}件`);
    
    for (const benefit of highValueBenefits) {
      // 割引券やポイントは実質価値を10%程度に調整
      const newValue = Math.round(benefit.monetary_value * 0.1);
      
      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE shareholder_benefits 
           SET monetary_value = ? 
           WHERE stock_code = ? AND monetary_value = ? AND description = ?`,
          [newValue, benefit.stock_code, benefit.monetary_value, benefit.description],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      updatedCount++;
      console.log(`調整: ${benefit.stock_code} - ${benefit.monetary_value}円 → ${newValue}円 (${benefit.description.substring(0, 30)}...)`);
    }
    
    console.log(`\n=== 修正完了 ===`);
    console.log(`更新件数: ${updatedCount}件`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
fixDiscountValues().catch(console.error);