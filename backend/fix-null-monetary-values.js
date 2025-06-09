import { Database } from './database.js';

const db = new Database();

async function fixNullMonetaryValues() {
  console.log('🔧 優待価値のnull値を修正中...\n');
  
  try {
    // null値のカウント確認
    const nullCount = await new Promise((resolve, reject) => {
      const sql = `SELECT COUNT(*) as count FROM shareholder_benefits WHERE monetary_value IS NULL`;
      db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`   null値の優待データ: ${nullCount}件`);
    
    if (nullCount > 0) {
      // null値を1000円のデフォルト値に設定
      const fixedCount = await new Promise((resolve, reject) => {
        const sql = `
          UPDATE shareholder_benefits 
          SET monetary_value = 1000 
          WHERE monetary_value IS NULL
        `;
        db.db.run(sql, [], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      console.log(`   ✅ null値修正: ${fixedCount}件を1000円に設定`);
    }
    
    // 統計確認
    const stats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_benefits,
          AVG(monetary_value) as avg_value,
          MIN(monetary_value) as min_value,
          MAX(monetary_value) as max_value
        FROM shareholder_benefits
      `;
      db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('\n📊 修正後の統計:');
    console.log(`   総優待件数: ${stats.total_benefits}件`);
    console.log(`   平均価値: ¥${Math.round(stats.avg_value)}`);
    console.log(`   最小価値: ¥${stats.min_value}`);
    console.log(`   最大価値: ¥${stats.max_value}`);
    
    console.log('\n✅ null値修正が完了しました！');
    
  } catch (error) {
    console.error('❌ 修正エラー:', error.message);
  }
}

fixNullMonetaryValues();