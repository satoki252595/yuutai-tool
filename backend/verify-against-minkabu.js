import puppeteer from 'puppeteer';
import { Database } from './database.js';

const db = new Database();

// みんかぶサイトとの詳細照合
async function verifyAgainstMinkabu() {
  console.log('🔍 みんかぶサイトとの詳細照合開始...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // デバッグのため表示
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  try {
    // 高利回り上位5銘柄を取得
    const highYieldStocks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          s.code, s.name, ph.price,
          SUM(sb.monetary_value) as total_benefit_value,
          MIN(sb.min_shares) as min_shares,
          COUNT(sb.id) as benefit_count,
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
        LIMIT 5
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('📊 検証対象銘柄（高利回り上位5銘柄）:');
    highYieldStocks.forEach((stock, idx) => {
      console.log(`${idx + 1}. ${stock.code} - ${stock.name} (利回り: ${stock.benefit_yield.toFixed(2)}%)`);
    });
    console.log('');
    
    // 各銘柄を個別に検証
    for (let i = 0; i < highYieldStocks.length; i++) {
      const stock = highYieldStocks[i];
      console.log(`🔍 【${i + 1}/5】${stock.code} - ${stock.name} の詳細照合中...`);
      
      try {
        const page = await browser.newPage();
        
        // ユーザーエージェント設定
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // みんかぶの優待ページにアクセス
        const url = `https://minkabu.jp/stock/${stock.code}/settlement_benefit`;
        console.log(`   アクセス中: ${url}`);
        
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        // ページタイトル確認
        const title = await page.title();
        console.log(`   ページタイトル: ${title}`);
        
        // 優待情報の取得
        await page.waitForSelector('body', { timeout: 10000 });
        
        // 優待内容を抽出
        const benefitData = await page.evaluate(() => {
          const results = [];
          
          // 優待内容のテーブルを探す
          const tables = document.querySelectorAll('table');
          
          for (const table of tables) {
            const rows = table.querySelectorAll('tr');
            
            for (const row of rows) {
              const cells = row.querySelectorAll('td, th');
              if (cells.length >= 2) {
                const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                
                // 優待内容らしい行を探す
                if (cellTexts.some(text => 
                  text.includes('株以上') || 
                  text.includes('円相当') || 
                  text.includes('割引') ||
                  text.includes('優待')
                )) {
                  results.push({
                    content: cellTexts.join(' | '),
                    rawText: row.textContent.trim()
                  });
                }
              }
            }
          }
          
          // 追加: div要素からも優待情報を探す
          const benefitDivs = document.querySelectorAll('div');
          for (const div of benefitDivs) {
            const text = div.textContent.trim();
            if (text.includes('株主優待') && text.length > 10 && text.length < 200) {
              results.push({
                content: text,
                rawText: text
              });
            }
          }
          
          return results;
        });
        
        console.log(`   みんかぶから取得した優待情報: ${benefitData.length}件`);
        
        if (benefitData.length > 0) {
          console.log('   みんかぶの優待内容:');
          benefitData.slice(0, 5).forEach((benefit, idx) => {
            console.log(`     ${idx + 1}. ${benefit.content.substring(0, 100)}...`);
          });
        } else {
          console.log('   ⚠️  みんかぶから優待情報を取得できませんでした');
        }
        
        // DBの優待情報と比較
        const dbBenefits = await new Promise((resolve, reject) => {
          const sql = `
            SELECT benefit_type, description, monetary_value, min_shares
            FROM shareholder_benefits 
            WHERE stock_code = ?
            ORDER BY min_shares
          `;
          db.db.all(sql, [stock.code], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        console.log(`   DBの優待情報: ${dbBenefits.length}件`);
        dbBenefits.slice(0, 3).forEach((benefit, idx) => {
          console.log(`     ${idx + 1}. ${benefit.benefit_type}: ${benefit.description.substring(0, 80)}... (¥${benefit.monetary_value})`);
        });
        
        // 比較分析
        console.log('\n   📊 比較分析:');
        
        // 件数比較
        const countDiff = Math.abs(benefitData.length - dbBenefits.length);
        if (countDiff > 5) {
          console.log(`   ⚠️  優待件数に大きな差異: みんかぶ ${benefitData.length}件 vs DB ${dbBenefits.length}件`);
        }
        
        // 内容の一致度チェック（簡易）
        let matchCount = 0;
        for (const dbBenefit of dbBenefits.slice(0, 3)) {
          for (const webBenefit of benefitData) {
            if (webBenefit.content.includes(dbBenefit.benefit_type) || 
                webBenefit.content.includes('割引') && dbBenefit.description.includes('割引')) {
              matchCount++;
              break;
            }
          }
        }
        
        const matchRate = dbBenefits.length > 0 ? (matchCount / Math.min(dbBenefits.length, 3)) * 100 : 0;
        console.log(`   📈 内容一致度: ${matchRate.toFixed(1)}% (${matchCount}/${Math.min(dbBenefits.length, 3)}件)`);
        
        // 問題の特定
        if (matchRate < 50) {
          console.log(`   🚨 内容の不一致が疑われます`);
        }
        
        if (dbBenefits.some(b => b.monetary_value > 1500)) {
          console.log(`   💰 高額優待設定あり: ${dbBenefits.filter(b => b.monetary_value > 1500).length}件`);
        }
        
        if (dbBenefits.length > benefitData.length * 2) {
          console.log(`   📦 DB優待件数が異常に多い可能性`);
        }
        
        await page.close();
        
        // 少し待機（レート制限回避）
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.log(`   ❌ 検証エラー: ${error.message}`);
      }
      
      console.log('');
    }
    
    // 修正提案
    console.log('🔧 修正提案:');
    console.log('1. 優待価値の上限をさらに引き下げ（1,500円上限）');
    console.log('2. 重複データの再調査・削除');
    console.log('3. 異常に多い優待件数の銘柄を個別調整');
    console.log('4. スクレイピング時の重複防止処理の強化');
    
  } finally {
    await browser.close();
  }
}

// 修正の実行
async function implementCorrections() {
  console.log('\n🔧 修正の実行...');
  
  try {
    // 1. 優待価値を1,500円上限に設定
    const limitValue = await new Promise((resolve, reject) => {
      const sql = `
        UPDATE shareholder_benefits 
        SET monetary_value = 1500
        WHERE monetary_value > 1500
      `;
      db.db.run(sql, [], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    console.log(`   📉 優待価値を1,500円上限に設定: ${limitValue}件修正`);
    
    // 2. 異常に多い優待件数の銘柄を調整
    const excessiveBenefits = await new Promise((resolve, reject) => {
      const sql = `
        SELECT stock_code, COUNT(*) as count
        FROM shareholder_benefits
        GROUP BY stock_code
        HAVING COUNT(*) > 10
        ORDER BY COUNT(*) DESC
      `;
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (excessiveBenefits.length > 0) {
      console.log(`   📦 優待件数が多い銘柄: ${excessiveBenefits.length}銘柄`);
      
      // 各銘柄の優待価値を比例削減
      for (const stock of excessiveBenefits.slice(0, 5)) {
        const reductionRatio = 10 / stock.count; // 10件程度に調整
        
        await new Promise((resolve, reject) => {
          const sql = `
            UPDATE shareholder_benefits 
            SET monetary_value = ROUND(monetary_value * ?)
            WHERE stock_code = ?
          `;
          db.db.run(sql, [reductionRatio, stock.stock_code], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          });
        });
        
        console.log(`     ${stock.stock_code}: ${stock.count}件 → 価値を${(reductionRatio * 100).toFixed(0)}%に調整`);
      }
    }
    
    // 最終結果確認
    const finalStats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          s.code, s.name, ph.price,
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
        LIMIT 5
      `;
      
      db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n📊 最終修正後の上位5銘柄:');
    finalStats.forEach((stock, idx) => {
      console.log(`${idx + 1}. ${stock.code} - ${stock.name}: ${stock.benefit_yield.toFixed(2)}%`);
    });
    
  } catch (error) {
    console.error('❌ 修正エラー:', error.message);
  }
}

// 実行
verifyAgainstMinkabu()
  .then(() => implementCorrections())
  .then(() => {
    console.log('\n✅ みんかぶとの照合・修正が完了しました！');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 処理エラー:', error.message);
    process.exit(1);
  });