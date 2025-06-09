import { Database } from './database.js';

// ゼンショーホールディングスの権利月を修正するスクリプト
async function fixZenshoRightsMonths() {
  const db = new Database();
  
  console.log('=== ゼンショーホールディングス権利月修正 ===');
  
  try {
    // 現在の優待情報を取得
    const benefits = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM shareholder_benefits WHERE stock_code = '7550'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`現在の優待情報: ${benefits.length}件`);
    
    // 9月の優待情報を追加
    for (const benefit of benefits) {
      // 9月分が既に存在するか確認
      const exists = await new Promise((resolve, reject) => {
        db.db.get(
          `SELECT id FROM shareholder_benefits 
           WHERE stock_code = ? AND ex_rights_month = 9 AND min_shares = ?`,
          [benefit.stock_code, benefit.min_shares],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (!exists) {
        // 9月分を追加
        await db.insertBenefit({
          stockCode: benefit.stock_code,
          benefitType: benefit.benefit_type,
          description: benefit.description,
          monetaryValue: benefit.monetary_value,
          minShares: benefit.min_shares,
          holderType: benefit.holder_type,
          exRightsMonth: 9
        });
        
        console.log(`追加: 9月権利 - ${benefit.min_shares}株`);
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
fixZenshoRightsMonths().catch(console.error);