import { Database } from './database.js';

// 最小株式数が100株未満のデータを修正するスクリプト
async function fixMinShares() {
  const db = new Database();
  
  console.log('=== 最小株式数修正 ===');
  
  try {
    // 最小株式数が100未満の優待情報を取得
    const benefits = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT id, stock_code, min_shares, description 
         FROM shareholder_benefits 
         WHERE min_shares < 100`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`修正対象: ${benefits.length}件`);
    
    // 修正処理
    let updatedCount = 0;
    for (const benefit of benefits) {
      // 日本株は基本的に100株単位
      const newMinShares = benefit.min_shares * 100;
      
      await new Promise((resolve, reject) => {
        db.db.run(
          `UPDATE shareholder_benefits SET min_shares = ? WHERE id = ?`,
          [newMinShares, benefit.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      updatedCount++;
      console.log(`更新: ${benefit.stock_code} - ${benefit.min_shares}株 → ${newMinShares}株`);
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
fixMinShares().catch(console.error);