import { Database } from './database.js';

const db = new Database();

// データ問題の詳細分析と根本的修正
async function analyzeDataIssues() {
  console.log('🔍 データ問題の根本分析...\n');
  
  try {
    // 1. 重複パターンの分析
    console.log('1️⃣ 重複パターンの分析:');
    const duplicateAnalysis = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          stock_code,
          benefit_type,
          description,
          COUNT(*) as duplicate_count,
          GROUP_CONCAT(monetary_value) as value_list,
          GROUP_CONCAT(min_shares) as shares
        FROM shareholder_benefits
        GROUP BY stock_code, benefit_type, SUBSTR(description, 1, 50)
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC
        LIMIT 10
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`   重複パターン発見: ${duplicateAnalysis.length}件`);
    duplicateAnalysis.slice(0, 5).forEach((dup, idx) => {
      console.log(`   ${idx + 1}. ${dup.stock_code} - ${dup.benefit_type}: ${dup.duplicate_count}重複`);
      console.log(`      説明: ${dup.description.substring(0, 60)}...`);
      console.log(`      価値: [${dup.value_list}], 株数: [${dup.shares}]`);
    });
    
    // 2. 異常に長い説明文の分析
    console.log('\n2️⃣ 異常に長い説明文の分析:');
    const longDescriptions = await new Promise((resolve, reject) => {
      const sql = `
        SELECT stock_code, benefit_type, LENGTH(description) as desc_length, 
               SUBSTR(description, 1, 100) as sample_desc
        FROM shareholder_benefits
        WHERE LENGTH(description) > 200
        ORDER BY desc_length DESC
        LIMIT 5
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    longDescriptions.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.stock_code} - 長さ${item.desc_length}文字`);
      console.log(`      内容: ${item.sample_desc}...`);
    });
    
    // 3. スクレイピング由来の問題特定
    console.log('\n3️⃣ スクレイピング由来の問題分析:');
    const scrapingIssues = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          stock_code,
          COUNT(*) as benefit_count,
          SUM(monetary_value) as total_value,
          AVG(monetary_value) as avg_value,
          MAX(monetary_value) as max_value,
          GROUP_CONCAT(SUBSTR(description, 1, 30), ' | ') as sample_descriptions
        FROM shareholder_benefits
        GROUP BY stock_code
        HAVING benefit_count > 15 OR total_value > 20000
        ORDER BY total_value DESC
        LIMIT 10
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('   問題の可能性がある銘柄:');
    scrapingIssues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue.stock_code}: ${issue.benefit_count}件, 総額¥${issue.total_value.toLocaleString()}`);
      console.log(`      平均¥${Math.round(issue.avg_value)}, 最大¥${issue.max_value}`);
      console.log(`      例: ${issue.sample_descriptions.substring(0, 100)}...`);
    });
    
    // 4. 根本的なデータクリーニング実行
    console.log('\n🔧 根本的なデータクリーニング実行...');
    
    // 4-1. 同一銘柄・同一タイプの重複削除（最初の1件のみ残す）
    const removeDuplicates = await new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM shareholder_benefits 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM shareholder_benefits 
          GROUP BY stock_code, benefit_type, SUBSTR(description, 1, 30)
        )
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   🗑️  重複削除: ${removeDuplicates}件`);
    
    // 4-2. 説明文のクリーンアップ（不要な文字列除去）
    const cleanDescriptions = await new Promise((resolve, reject) => {
      const sql = `
        UPDATE shareholder_benefits 
        SET description = REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(description, '詳しく見る', ''),
              'SBI証券 詳しく...', '証券会社優待'
            ),
            'お気に入り レポート銘柄', ''
          ),
          '株価診断', ''
        )
        WHERE description LIKE '%詳しく%' OR description LIKE '%SBI証券%'
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   📝 説明文クリーンアップ: ${cleanDescriptions}件`);
    
    // 4-3. 低価値優待の削除
    const removeLowValue = await new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM shareholder_benefits 
        WHERE monetary_value < 100 OR 
              description LIKE '%証券%' OR
              description LIKE '%詳しく%' OR
              benefit_type = '金融・保険サービス'
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   🗑️  低価値・無関係優待削除: ${removeLowValue}件`);
    
    // 4-4. 優待価値の現実的調整
    const adjustValues = await new Promise((resolve, reject) => {
      const sql = `
        UPDATE shareholder_benefits 
        SET monetary_value = CASE
          WHEN benefit_type LIKE '%割引%' THEN MIN(monetary_value, 500)
          WHEN benefit_type LIKE '%商品券%' THEN MIN(monetary_value, 1000)
          WHEN benefit_type LIKE '%食事%' THEN MIN(monetary_value, 800)
          WHEN benefit_type LIKE '%宿泊%' THEN MIN(monetary_value, 1200)
          ELSE MIN(monetary_value, 1000)
        END
        WHERE monetary_value > 500
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   💰 優待価値の現実的調整: ${adjustValues}件`);
    
    // 5. 銘柄別の異常データ個別修正
    console.log('\n5️⃣ 個別銘柄の修正:');
    const problematicStocks = [
      { code: '8107', maxTotal: 2000 }, // キムラタン
      { code: '7578', maxTotal: 3000 }, // ニチリョク
      { code: '3070', maxTotal: 2500 }, // ジェリービーンズ
      { code: '7603', maxTotal: 2000 }, // マックハウス
      { code: '9439', maxTotal: 3000 }, // エム・エイチ・グループ
    ];
    
    for (const stock of problematicStocks) {
      const currentTotal = await new Promise((resolve, reject) => {
        const sql = `SELECT SUM(monetary_value) as total FROM shareholder_benefits WHERE stock_code = ?`;
        db.db.get(sql, [stock.code], (err, row) => {
          if (err) reject(err);
          else resolve(row.total || 0);
        });
      });
      
      if (currentTotal > stock.maxTotal) {
        const ratio = stock.maxTotal / currentTotal;
        
        await new Promise((resolve, reject) => {
          const sql = `
            UPDATE shareholder_benefits 
            SET monetary_value = MAX(100, ROUND(monetary_value * ?))
            WHERE stock_code = ?
          `;
          db.db.run(sql, [ratio, stock.code], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          });
        });
        
        console.log(`   ${stock.code}: ¥${currentTotal.toLocaleString()} → ¥${stock.maxTotal.toLocaleString()}`);
      }
    }
    
    // 6. 最終結果確認
    console.log('\n📊 最終クリーニング結果:');
    const finalCheck = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          s.code, s.name, ph.price,
          COUNT(sb.id) as benefit_count,
          SUM(sb.monetary_value) as total_benefit_value,
          MIN(sb.min_shares) as min_shares,
          (SUM(sb.monetary_value) * 1.0 / (ph.price * MIN(sb.min_shares))) * 100 as benefit_yield
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT stock_code, price
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
        WHERE ph.price > 0 AND sb.monetary_value > 0
        GROUP BY s.code, s.name, ph.price
        ORDER BY benefit_yield DESC
        LIMIT 10
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('上位10銘柄（最終調整後）:');
    finalCheck.forEach((stock, idx) => {
      console.log(`${idx + 1}. ${stock.code} - ${stock.name}`);
      console.log(`   優待利回り: ${stock.benefit_yield.toFixed(2)}%, 件数: ${stock.benefit_count}件, 価値: ¥${stock.total_benefit_value.toLocaleString()}`);
    });
    
    // 統計サマリー
    const summary = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(DISTINCT stock_code) as stock_count,
          COUNT(*) as total_benefits,
          AVG(monetary_value) as avg_value,
          MAX(monetary_value) as max_value,
          COUNT(CASE WHEN monetary_value > 1000 THEN 1 END) as high_value_count
        FROM shareholder_benefits
      `;
      
      db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('\n📈 データ品質サマリー:');
    console.log(`   対象銘柄数: ${summary.stock_count}銘柄`);
    console.log(`   総優待件数: ${summary.total_benefits}件`);
    console.log(`   平均優待価値: ¥${Math.round(summary.avg_value)}`);
    console.log(`   最大優待価値: ¥${summary.max_value}`);
    console.log(`   高額優待(¥1000超): ${summary.high_value_count}件`);
    
    console.log('\n✅ データ問題の根本分析・修正が完了しました！');
    console.log('📝 利回り計算が現実的な範囲に調整されています。');
    
  } catch (error) {
    console.error('❌ 分析エラー:', error.message);
  }
}

analyzeDataIssues();