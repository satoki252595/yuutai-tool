import { Database } from './database.js';

const db = new Database();

// サンプルデータを作成してバルーンヘルプをテスト
async function createSampleData() {
  try {
    console.log('📊 サンプルデータを作成中...');
    
    // サンプル株式データ
    const sampleStock = {
      code: '9999',
      name: 'サンプル株式会社',
      market: 'プライム',
      sector: 'サンプル業'
    };
    
    const samplePrice = {
      price: 1000,
      dividendYield: 5.0
    };
    
    // 株式基本データを挿入
    await new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO stocks (code, name, market, sector, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.db.run(sql, [
        sampleStock.code, sampleStock.name, sampleStock.market, 
        sampleStock.sector, new Date().toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 株価データを挿入
    await new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO price_history (stock_code, price, dividend_yield, recorded_at)
        VALUES (?, ?, ?, ?)
      `;
      db.db.run(sql, [
        sampleStock.code, samplePrice.price, samplePrice.dividendYield, new Date().toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // サンプル優待データ
    const sampleBenefits = [
      {
        stockCode: '9999',
        benefitType: 'クオカード',
        description: '1,000円分のクオカード',
        minShares: 100,
        monetaryValue: 1000,
        exRightsMonth: 3,
        holderType: 'どちらでも'
      },
      {
        stockCode: '9999',
        benefitType: '食事券',
        description: '2,000円分の食事券',
        minShares: 500,
        monetaryValue: 2000,
        exRightsMonth: 9,
        holderType: 'どちらでも'
      }
    ];
    
    // 優待データを挿入
    for (const benefit of sampleBenefits) {
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT OR REPLACE INTO shareholder_benefits (
            stock_code, benefit_type, description, min_shares, monetary_value,
            ex_rights_month, holder_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.db.run(sql, [
          benefit.stockCode, benefit.benefitType, benefit.description,
          benefit.minShares, benefit.monetaryValue, benefit.exRightsMonth,
          benefit.holderType, new Date().toISOString()
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    console.log('✅ サンプルデータを作成しました:');
    console.log(`   銘柄コード: ${sampleStock.code}`);
    console.log(`   銘柄名: ${sampleStock.name}`);
    console.log(`   株価: ¥${samplePrice.price}`);
    console.log(`   配当利回り: ${samplePrice.dividendYield}%`);
    console.log(`   優待: ${sampleBenefits.length}件`);
    console.log('');
    console.log('🔍 バルーンヘルプ確認方法:');
    console.log('   1. ブラウザで http://localhost:5173 にアクセス');
    console.log('   2. 検索ボックスに "9999" と入力');
    console.log('   3. 配当利回り・優待利回りの数値にマウスオーバー');
    
  } catch (error) {
    console.error('❌ サンプルデータ作成エラー:', error.message);
  }
}

createSampleData();