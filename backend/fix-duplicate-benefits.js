import { Database } from './database.js';

// 重複した優待情報を削除するスクリプト
async function fixDuplicateBenefits() {
  const db = new Database();
  
  console.log('=== 重複優待情報の修正 ===');
  
  try {
    // 重複している優待情報を検索
    const duplicates = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT stock_code, description, min_shares, ex_rights_month, COUNT(*) as count
        FROM shareholder_benefits
        GROUP BY stock_code, description, min_shares, ex_rights_month
        HAVING count > 1
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`重複している優待情報: ${duplicates.length}件`);
    
    for (const dup of duplicates) {
      console.log(`\n重複: ${dup.stock_code} - ${dup.min_shares}株 (${dup.count}件)`);
      console.log(`  内容: ${dup.description.substring(0, 50)}...`);
      
      // 重複しているIDを取得（最初の1件以外）
      const ids = await new Promise((resolve, reject) => {
        db.db.all(`
          SELECT id FROM shareholder_benefits
          WHERE stock_code = ? AND description = ? AND min_shares = ? AND ex_rights_month = ?
          ORDER BY id
        `, [dup.stock_code, dup.description, dup.min_shares, dup.ex_rights_month], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // 最初の1件以外を削除
      for (let i = 1; i < ids.length; i++) {
        await new Promise((resolve, reject) => {
          db.db.run(`DELETE FROM shareholder_benefits WHERE id = ?`, [ids[i].id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      console.log(`  削除: ${ids.length - 1}件`);
    }
    
    // 割引券の優待価値を現実的な値に調整
    console.log('\n=== 割引特典の価値調整 ===');
    
    const adjustments = [
      // アールシーコア - 30%割引を1,000円相当に調整
      { code: '7837', oldValue: 3000, newValue: 1000, desc: '30%割引' },
      // スタジオアタオ - ポイントや割引券は実質価値を下げる
      { code: '3550', oldValue: 5000, newValue: 2500, desc: '5,000円相当' },
      // アルファクス・フード・システム
      { code: '3814', oldValue: 7000, newValue: 3500, desc: '7,000円相当' },
      // さいか屋
      { code: '8254', oldValue: 7500, newValue: 3750, desc: '15枚' }
    ];
    
    for (const adj of adjustments) {
      const result = await new Promise((resolve, reject) => {
        db.db.run(`
          UPDATE shareholder_benefits
          SET monetary_value = ?
          WHERE stock_code = ? AND monetary_value = ?
        `, [adj.newValue, adj.code, adj.oldValue], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      if (result > 0) {
        console.log(`調整: ${adj.code} - ${adj.oldValue}円 → ${adj.newValue}円 (${result}件)`);
      }
    }
    
    console.log('\n=== 修正完了 ===');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
fixDuplicateBenefits().catch(console.error);