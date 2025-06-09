import { Database } from './database.js';

// 追加の優待価値調整スクリプト
async function fixMoreValues() {
  const db = new Database();
  
  console.log('=== 追加の優待価値調整 ===');
  
  try {
    const adjustments = [
      // フィスコ - サービス無料クーポンは実質価値を下げる
      { code: '3807', oldValue: 6600, newValue: 1000, desc: '1ヵ月無料クーポン' },
      // 伸和ホールディングス - 10,000円相当を実質価値に
      { code: '7118', oldValue: 10000, newValue: 5000, desc: '店舗利用券または商品' },
      // ユナイテッド・スーパーマーケット - 買物優待券
      { code: '3222', oldValue: 15000, newValue: 7500, desc: '買物優待券30枚' },
      // 焼肉坂井 - 10%割引券の実質価値
      { code: '2694', oldValue: 1000, newValue: 500, desc: '10%割引券' },
      // 夢展望 - ポイントの実質価値
      { code: '3185', oldValue: 15000, newValue: 5000, desc: '15,000円相当' },
      { code: '3185', oldValue: 24000, newValue: 8000, desc: '24,000円相当' },
      // キムラタン - 商品券の実質価値
      { code: '8107', oldValue: 3000, newValue: 1500, desc: '3,000円×1個' },
      // レダックス - 高額優待の調整
      { code: '7602', oldValue: 3000, newValue: 1500, desc: '30,000円相当の調整残り' },
      // ジェリービーンズ - ポイントの実質価値
      { code: '3070', oldValue: 1000, newValue: 500, desc: '10,000ポイントの調整残り' },
      { code: '3070', oldValue: 2000, newValue: 1000, desc: '20,000ポイントの調整残り' },
      { code: '3070', oldValue: 3000, newValue: 1500, desc: '30,000ポイントの調整残り' }
    ];
    
    for (const adj of adjustments) {
      const result = await new Promise((resolve, reject) => {
        db.db.run(`
          UPDATE shareholder_benefits
          SET monetary_value = ?
          WHERE stock_code = ? AND monetary_value = ? AND min_shares <= 100
        `, [adj.newValue, adj.code, adj.oldValue], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      if (result > 0) {
        console.log(`調整: ${adj.code} - ${adj.oldValue}円 → ${adj.newValue}円 (${result}件) - ${adj.desc}`);
      }
    }
    
    // 飲食券の実質価値を調整（利用条件があるため50%程度に）
    console.log('\n=== 飲食券の価値調整 ===');
    
    const foodVoucherCodes = ['7918'];  // ヴィア・ホールディングス
    
    for (const code of foodVoucherCodes) {
      const result = await new Promise((resolve, reject) => {
        db.db.run(`
          UPDATE shareholder_benefits
          SET monetary_value = monetary_value * 0.5
          WHERE stock_code = ? AND benefit_type IN ('食事券・グルメ券', 'その他')
          AND description LIKE '%円相当%'
        `, [code], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
      
      if (result > 0) {
        console.log(`飲食券調整: ${code} - 50%に調整 (${result}件)`);
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
fixMoreValues().catch(console.error);