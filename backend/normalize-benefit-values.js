import { Database } from './database.js';

// 優待価値を現実的な範囲に正規化するスクリプト
async function normalizeBenefitValues() {
  const db = new Database();
  
  console.log('=== 優待価値の正規化開始 ===');
  
  try {
    // 優待利回りが異常に高い銘柄を検出
    const highYieldStocks = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT 
          s.code,
          s.name,
          ph.price,
          b.min_shares,
          b.monetary_value,
          b.description,
          b.benefit_type,
          (b.monetary_value * 100.0 / (ph.price * b.min_shares)) as yield_percent
        FROM stocks s
        JOIN shareholder_benefits b ON s.code = b.stock_code
        LEFT JOIN (
          SELECT stock_code, price
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE ph.price > 0
        AND b.min_shares <= 1000
        AND (b.monetary_value * 100.0 / (ph.price * b.min_shares)) > 15
        ORDER BY yield_percent DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`優待利回り15%超の優待: ${highYieldStocks.length}件`);
    
    // カテゴリ別の調整率を設定
    const adjustmentRates = {
      '食事券・グルメ券': 0.6,        // 利用条件があるため60%
      '商品券・ギフトカード': 0.7,    // 比較的使いやすいが70%
      'QUOカード・図書カード': 0.9,   // 現金に近いため90%
      '割引券・優待券': 0.3,          // 利用条件が厳しいため30%
      '自社製品・商品': 0.5,          // 必要性による50%
      'カタログギフト': 0.6,          // 選択肢はあるが60%
      'ポイント・電子マネー': 0.5,    // 利用制限があるため50%
      '宿泊・レジャー': 0.4,          // 利用頻度が低いため40%
      '交通・乗車券': 0.7,            // 実用的なため70%
      '金券・現金': 0.9,              // 現金に近いため90%
      '寄付選択制': 0.3,              // 実質的な利益が少ないため30%
      'その他': 0.5                   // デフォルト50%
    };
    
    let adjustedCount = 0;
    
    for (const stock of highYieldStocks) {
      const rate = adjustmentRates[stock.benefit_type] || 0.5;
      const newValue = Math.round(stock.monetary_value * rate);
      
      // 調整後も利回りが15%を超える場合は、さらに調整
      const adjustedYield = (newValue * 100.0) / (stock.price * stock.min_shares);
      let finalValue = newValue;
      
      if (adjustedYield > 15) {
        // 利回りが15%になるように逆算
        finalValue = Math.round((stock.price * stock.min_shares * 15) / 100);
      }
      
      await new Promise((resolve, reject) => {
        db.db.run(`
          UPDATE shareholder_benefits
          SET monetary_value = ?
          WHERE stock_code = ? AND min_shares = ? AND monetary_value = ?
        `, [finalValue, stock.code, stock.min_shares, stock.monetary_value], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      adjustedCount++;
      console.log(`調整: ${stock.code} ${stock.name} - ${stock.monetary_value}円 → ${finalValue}円 (利回り${stock.yield_percent.toFixed(1)}% → ${((finalValue * 100.0) / (stock.price * stock.min_shares)).toFixed(1)}%)`);
    }
    
    console.log(`\n=== 正規化完了 ===`);
    console.log(`調整件数: ${adjustedCount}件`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
normalizeBenefitValues().catch(console.error);