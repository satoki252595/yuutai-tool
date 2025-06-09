import { Database } from './database.js';

// 年間表記がある優待の金銭価値を修正するスクリプト
async function fixAnnualValues() {
  const db = new Database();
  
  console.log('=== 年間表記優待価値修正 ===');
  
  try {
    // 年間表記がある優待情報を取得
    const benefits = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT id, stock_code, description, monetary_value, min_shares, ex_rights_month
         FROM shareholder_benefits 
         WHERE description LIKE '%年間%'`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`年間表記がある優待: ${benefits.length}件`);
    
    // 同じ銘柄の権利月数をカウント
    const stockMonths = {};
    for (const benefit of benefits) {
      if (!stockMonths[benefit.stock_code]) {
        const months = await new Promise((resolve, reject) => {
          db.db.all(
            `SELECT DISTINCT ex_rights_month FROM shareholder_benefits WHERE stock_code = ?`,
            [benefit.stock_code],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows.length);
            }
          );
        });
        stockMonths[benefit.stock_code] = months;
      }
    }
    
    // 修正処理
    let updatedCount = 0;
    for (const benefit of benefits) {
      const monthCount = stockMonths[benefit.stock_code];
      
      // 複数月ある場合は価値を調整
      if (monthCount > 1) {
        // 年間表記の価値を正しく解釈
        const match = benefit.description.match(/(\d+)枚\s*([0-9,]+)円.*年間\s*(\d+)枚/);
        if (match) {
          const currentSheets = parseInt(match[1]);
          const currentValue = parseInt(match[2].replace(/,/g, ''));
          const annualSheets = parseInt(match[3]);
          
          // 1回あたりの価値を計算
          const timesPerYear = annualSheets / currentSheets;
          const valuePerTime = currentValue;
          
          // データベースには1回あたりの価値を保存
          if (benefit.monetary_value !== valuePerTime) {
            await new Promise((resolve, reject) => {
              db.db.run(
                `UPDATE shareholder_benefits SET monetary_value = ? WHERE id = ?`,
                [valuePerTime, benefit.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            updatedCount++;
            console.log(`更新: ${benefit.stock_code} - ${benefit.monetary_value}円 → ${valuePerTime}円 (${benefit.description})`);
          }
        }
      }
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
fixAnnualValues().catch(console.error);